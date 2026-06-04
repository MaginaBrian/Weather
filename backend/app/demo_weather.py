"""Sample weather payload when Weather-AI is unavailable (local dev only)."""

from typing import Any


def demo_weather(lat: float, lon: float, days: int, units: str, ai: bool) -> dict[str, Any]:
    is_imperial = units == "imperial"
    temp = 75 if is_imperial else 24
    feels = 73 if is_imperial else 23
    unit_label = "°F" if is_imperial else "°C"

    forecast = []
    conditions = ["Partly cloudy", "Light rain", "Sunny", "Cloudy", "Clear", "Showers", "Overcast"]
    for i in range(min(days, 7)):
        high = temp + (2 if i % 2 else -1)
        low = temp - 4
        forecast.append(
            {
                "date": _offset_date(i),
                "condition": conditions[i % len(conditions)],
                "high": high,
                "low": low,
                "precip_chance": 20 if i % 3 == 1 else 5,
            }
        )

    data: dict[str, Any] = {
        "location": {
            "city": "Demo City",
            "country": "KE",
            "lat": lat,
            "lon": lon,
        },
        "current": {
            "temp": temp,
            "feels_like": feels,
            "condition": "Partly cloudy",
            "description": "partly cloudy",
            "humidity": 62,
            "wind_speed": 12 if not is_imperial else 7,
            "pressure": 1015,
            "uv": 6,
        },
        "forecast": forecast,
        "_demo": True,
        "_demo_note": (
            "Weather-AI returned an error. Showing sample data for local development. "
            "Remove WEATHER_DEMO_FALLBACK or fix the upstream API for live data."
        ),
    }

    if ai:
        data["ai_summary"] = (
            f"Demo mode: pleasant {temp}{unit_label} with mixed cloud cover over the next "
            f"{days} days. Enable live data once Weather-AI /v1/weather is responding."
        )

    return data


def _offset_date(day_index: int) -> str:
    from datetime import date, timedelta

    return (date.today() + timedelta(days=day_index)).isoformat()
