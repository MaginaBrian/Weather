import os
from typing import Any

import httpx

BASE_URL = "https://api.weather-ai.co"
GEO_HEADER_KEYS = ("X-Country", "X-Region", "X-City")

# Render free tier allows ~30s per request; AI summaries can exceed that.
REQUEST_TIMEOUT = httpx.Timeout(25.0, connect=10.0)


class WeatherAIError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def get_api_key() -> str:
    key = (os.getenv("WEATHER_AI_API_KEY") or "").strip()
    if not key:
        raise WeatherAIError("WEATHER_AI_API_KEY is not configured", 503)
    return key


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


async def fetch_weather_ai(
    path: str,
    params: dict[str, str | int | float | bool] | None = None,
) -> tuple[dict[str, Any], dict[str, int] | None, dict[str, str] | None]:
    url = f"{BASE_URL}{path}"
    query = {k: str(v).lower() if isinstance(v, bool) else str(v) for k, v in (params or {}).items()}

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            response = await client.get(
                url,
                params=query,
                headers={
                    "Authorization": f"Bearer {get_api_key()}",
                    "Accept": "application/json",
                },
            )
    except httpx.TimeoutException as e:
        raise WeatherAIError(
            "Weather-AI request timed out. Try again with AI summary disabled.",
            504,
        ) from e
    except httpx.HTTPError as e:
        raise WeatherAIError(f"Could not reach Weather-AI: {e}", 502) from e

    data = _parse_json_response(response)
    rate_limit = parse_rate_limit(response.headers)
    geo_headers = parse_geo_headers(response.headers)

    if response.status_code >= 400:
        message = data.get("error") or data.get("message")
        raise WeatherAIError(
            str(message) if message else f"Weather-AI API error ({response.status_code})",
            _upstream_status(response.status_code),
        )

    return data, rate_limit, geo_headers


async def fetch_weather_with_fallback(
    params: dict[str, str | int | float | bool],
) -> tuple[dict[str, Any], dict[str, int] | None, bool]:
    """Try requested params; on timeout/5xx with AI on, retry with ai=false."""
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
