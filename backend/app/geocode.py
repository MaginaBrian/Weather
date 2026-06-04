from typing import Any

import httpx

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "WeatherPulse/1.0 (Weather-AI technical challenge)"


async def search_locations(query: str) -> list[dict[str, Any]]:
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            NOMINATIM_URL,
            params={
                "q": query,
                "format": "json",
                "limit": 6,
                "addressdetails": 1,
            },
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        )

    if response.status_code >= 400:
        raise RuntimeError("Location search failed")

    seen: set[tuple[float, float]] = set()
    results = []
    for item in response.json():
        lat = round(float(item["lat"]), 6)
        lon = round(float(item["lon"]), 6)
        coord = (lat, lon)
        if coord in seen:
            continue
        seen.add(coord)

        address = item.get("address") or {}
        display = item.get("display_name", "")
        results.append(
            {
                "name": ", ".join(display.split(",")[:3]),
                "lat": lat,
                "lon": lon,
                "country": address.get("country"),
                "region": address.get("state") or address.get("city"),
            }
        )
    return results
