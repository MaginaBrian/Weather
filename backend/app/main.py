import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.geocode import search_locations
from app.weather_ai import WeatherAIError, fetch_weather_ai, fetch_weather_with_fallback

_root = Path(__file__).resolve().parents[2]
load_dotenv(_root / "backend" / ".env")
load_dotenv(_root / ".env.local")
load_dotenv(_root / ".env")

app = FastAPI(title="Weather Pulse API", version="1.0.0")

is_production = os.getenv("ENV") == "production"
frontend_dist = _root / "frontend" / "dist"

if not is_production:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


def api_error(exc: WeatherAIError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=str(exc))


@app.exception_handler(Exception)
async def unhandled_exception(_request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        raise exc
    return JSONResponse(
        status_code=502,
        content={"detail": f"Unexpected server error: {exc}"},
    )


@app.get("/api/health")
async def health():
    return {"status": "ok", "frontend": frontend_dist.is_dir()}


@app.get("/api/weather")
async def weather(
    lat: float = Query(...),
    lon: float = Query(...),
    days: int = Query(7, ge=1, le=16),
    ai: bool = Query(True),
    units: str = Query("metric"),
    lang: str = Query("en"),
):
    try:
        data, rate_limit, ai_fallback = await fetch_weather_with_fallback(
            {"lat": lat, "lon": lon, "days": days, "ai": ai, "units": units, "lang": lang},
        )
        return {
            "data": data,
            "rateLimit": rate_limit,
            "aiFallback": ai_fallback,
            "live": not data.get("_demo"),
            "demo": bool(data.get("_demo")),
            "demoNote": data.get("_demo_note"),
        }
    except WeatherAIError as e:
        raise api_error(e) from e


@app.get("/api/weather-geo")
async def weather_geo(
    ip: str = Query("auto"),
    lat: float | None = None,
    lon: float | None = None,
    days: int = Query(7, ge=1, le=16),
    ai: bool = Query(True),
    units: str | None = None,
):
    params: dict[str, str | int | float | bool] = {"ip": ip, "days": days, "ai": ai}
    if lat is not None and lon is not None:
        params["lat"] = lat
        params["lon"] = lon
    if units:
        params["units"] = units

    try:
        data, rate_limit, geo_headers = await fetch_weather_ai("/v1/weather-geo", params)
        return {
            "data": data,
            "rateLimit": rate_limit,
            "geoHeaders": geo_headers,
            "live": not data.get("_demo"),
            "demo": bool(data.get("_demo")),
            "demoNote": data.get("_demo_note"),
        }
    except WeatherAIError as e:
        raise api_error(e) from e


@app.get("/api/usage")
async def usage():
    try:
        data, rate_limit, _ = await fetch_weather_ai("/v1/usage")
        return {"data": data, "rateLimit": rate_limit}
    except WeatherAIError as e:
        raise api_error(e) from e


@app.get("/api/geocode")
async def geocode(q: str = Query(..., min_length=2)):
    try:
        results = await search_locations(q.strip())
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=502, detail="Geocoding failed") from e


# Serve Vite build (must be registered after /api/* routes).
if frontend_dist.is_dir():
    app.mount(
        "/",
        StaticFiles(directory=str(frontend_dist), html=True),
        name="frontend",
    )
