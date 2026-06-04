import os
from typing import Any

import httpx

BASE_URL = "https://api.weather-ai.co"
GEO_HEADER_KEYS = ("X-Country", "X-Region", "X-City")
RATE_LIMIT_KEYS = ("X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset")


class WeatherAIError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def get_api_key() -> str:
    key = os.getenv("WEATHER_AI_API_KEY")
    if not key:
        raise WeatherAIError("WEATHER_AI_API_KEY is not configured", 503)
    return key


def parse_rate_limit(headers: httpx.Headers) -> dict[str, int] | None:
    if not headers.get("X-RateLimit-Limit"):
        return None
    return {
        "limit": int(headers["X-RateLimit-Limit"]),
        "remaining": int(headers.get("X-RateLimit-Remaining", 0)),
        "reset": int(headers.get("X-RateLimit-Reset", 0)),
    }


def parse_geo_headers(headers: httpx.Headers) -> dict[str, str] | None:
    geo = {k: headers[k] for k in GEO_HEADER_KEYS if headers.get(k)}
    return geo or None


async def fetch_weather_ai(
    path: str,
    params: dict[str, str | int | float | bool] | None = None,
) -> tuple[dict[str, Any], dict[str, int] | None, dict[str, str] | None]:
    url = f"{BASE_URL}{path}"
    query = {k: str(v).lower() if isinstance(v, bool) else str(v) for k, v in (params or {}).items()}

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            url,
            params=query,
            headers={
                "Authorization": f"Bearer {get_api_key()}",
                "Accept": "application/json",
            },
        )

    data = response.json()
    rate_limit = parse_rate_limit(response.headers)
    geo_headers = parse_geo_headers(response.headers)

    if response.status_code >= 400:
        message = data.get("error") if isinstance(data, dict) else None
        raise WeatherAIError(
            message or f"Weather-AI API error ({response.status_code})",
            response.status_code if response.status_code < 500 else 502,
        )

    return data, rate_limit, geo_headers
