import asyncio
import os
from typing import Any

import httpx

from app.demo_weather import demo_weather

BASE_URL = "https://api.weather-ai.co"
GEO_HEADER_KEYS = ("X-Country", "X-Region", "X-City")
WEATHER_PATHS = ("/v1/weather", "/v1/forecast", "/v1/current")
GEO_PATHS = ("/v1/weather-geo",)
REQUEST_TIMEOUT = httpx.Timeout(45.0, connect=15.0)
MAX_RETRIES = 3


class WeatherAIError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def get_api_key() -> str:
    key = (os.getenv("WEATHER_AI_API_KEY") or "").strip()
    if not key:
        raise WeatherAIError("WEATHER_AI_API_KEY is not configured", 503)
    return key


def _demo_fallback_enabled() -> bool:
    flag = os.getenv("WEATHER_DEMO_FALLBACK", "true").lower()
    if flag in ("0", "false", "no"):
        return False
    if flag in ("1", "true", "yes"):
        return True
    # Default: demo fallback in dev, live-only errors in production
    return os.getenv("ENV") != "production"


def _demo_response(
    params: dict[str, str | int | float | bool],
) -> tuple[dict[str, Any], None, None]:
    lat = float(params.get("lat", -1.2921))
    lon = float(params.get("lon", 36.8219))
    days = int(params.get("days", 7))
    units = str(params.get("units", "metric"))
    ai = str(params.get("ai", "false")).lower() == "true"
    return demo_weather(lat, lon, days, units, ai), None, None


def _safe_int_header(headers: httpx.Headers, name: str) -> int | None:
    value = headers.get(name)
    if not value:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def parse_rate_limit(headers: httpx.Headers) -> dict[str, int] | None:
    limit = _safe_int_header(headers, "X-RateLimit-Limit")
    if limit is None:
        return None
    return {
        "limit": limit,
        "remaining": _safe_int_header(headers, "X-RateLimit-Remaining") or 0,
        "reset": _safe_int_header(headers, "X-RateLimit-Reset") or 0,
    }


def parse_geo_headers(headers: httpx.Headers) -> dict[str, str] | None:
    geo = {k: headers[k] for k in GEO_HEADER_KEYS if headers.get(k)}
    return geo or None


def _parse_json_response(response: httpx.Response) -> dict[str, Any]:
    try:
        data = response.json()
    except ValueError as e:
        raise WeatherAIError(
            f"Weather-AI returned invalid JSON ({response.status_code})",
            502,
        ) from e
    if not isinstance(data, dict):
        raise WeatherAIError("Unexpected response format from Weather-AI", 502)
    return data


def _upstream_status(http_status: int) -> int:
    if http_status == 401:
        return 401
    if http_status == 403:
        return 403
    if http_status == 429:
        return 429
    if http_status >= 500:
        return 502
    if http_status >= 400:
        return http_status
    return 502


async def _request_once(
    client: httpx.AsyncClient,
    path: str,
    query: dict[str, str],
) -> httpx.Response:
    return await client.get(
        f"{BASE_URL}{path}",
        params=query,
        headers={
            "Authorization": f"Bearer {get_api_key()}",
            "Accept": "application/json",
        },
    )


async def fetch_weather_ai(
    path: str,
    params: dict[str, str | int | float | bool] | None = None,
) -> tuple[dict[str, Any], dict[str, int] | None, dict[str, str] | None]:
    query = {k: str(v).lower() if isinstance(v, bool) else str(v) for k, v in (params or {}).items()}
    paths_to_try = [path]
    if path == "/v1/weather":
        paths_to_try = list(WEATHER_PATHS)
    elif path == "/v1/weather-geo":
        paths_to_try = list(GEO_PATHS)

    last_error: WeatherAIError | None = None

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        for attempt in range(MAX_RETRIES):
            for try_path in paths_to_try:
                try:
                    response = await _request_once(client, try_path, query)
                except httpx.TimeoutException:
                    last_error = WeatherAIError(
                        "Weather-AI request timed out. Try again with AI summary disabled.",
                        504,
                    )
                    continue
                except httpx.HTTPError as e:
                    last_error = WeatherAIError(f"Could not reach Weather-AI: {e}", 502)
                    continue

                if response.status_code < 400:
                    data = _parse_json_response(response)
                    return data, parse_rate_limit(response.headers), parse_geo_headers(response.headers)

                data = _parse_json_response(response)
                message = data.get("error") or data.get("message")
                last_error = WeatherAIError(
                    str(message) if message else f"Weather-AI API error ({response.status_code})",
                    _upstream_status(response.status_code),
                )

            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(1.5 * (attempt + 1))

    if last_error and _demo_fallback_enabled() and path in ("/v1/weather", "/v1/weather-geo"):
        return _demo_response(params or {})

    if last_error:
        raise last_error

    raise WeatherAIError("Weather-AI request failed", 502)


async def fetch_weather_with_fallback(
    params: dict[str, str | int | float | bool],
) -> tuple[dict[str, Any], dict[str, int] | None, bool]:
    """Live Weather-AI first; retry paths; optional demo data if all fail locally."""
    ai_requested = bool(params.get("ai", True))

    try:
        data, rate_limit, _ = await fetch_weather_ai("/v1/weather", params)
        return data, rate_limit, False
    except WeatherAIError as first_error:
        if not ai_requested or first_error.status_code not in (502, 504):
            raise

        fallback = {**params, "ai": False}
        try:
            data, rate_limit, _ = await fetch_weather_ai("/v1/weather", fallback)
            return data, rate_limit, True
        except WeatherAIError:
            raise first_error from None
