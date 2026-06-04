# Weather Pulse

Weather dashboard for the **Weather-AI Technical Challenge**, built with **Python (FastAPI)** and **Vite + React**.

Integrates the [Weather-AI REST API](https://weather-ai.co/docs): current weather, forecasts, Gemini AI summaries, IP geo-detection, and usage quotas.

## Stack

| Layer | Tech |
|-------|------|
| API proxy | Python 3.11+, FastAPI, httpx |
| Frontend | Vite (latest), React 19, TypeScript, Tailwind CSS v4 |

## Features

- `GET /v1/weather` — current conditions + multi-day forecast
- `GET /v1/weather-geo?ip=auto` — IP-based location + weather
- `GET /v1/usage` — plan usage and rate limits
- City search (Nominatim → lat/lon → Weather-AI)
- Toggle AI summaries (`ai=false` saves quota)
- Saved favorite locations (localStorage)

## Project structure

```
backend/
  app/
    main.py          # FastAPI routes + static SPA in production
    weather_ai.py    # Weather-AI client
    geocode.py       # Nominatim geocoding
  requirements.txt
frontend/
  src/
    components/WeatherDashboard.tsx
    lib/weather.ts
  vite.config.ts     # proxies /api → :8000 in dev
```

## Prerequisites

- Python 3.11+
- Node.js 20+
- Weather-AI API key (`wai_…`) from [weather-ai.co](https://weather-ai.co)

## Local development

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env: WEATHER_AI_API_KEY=wai_your_key
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 2. Frontend (separate terminal)

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Vite proxies `/api/*` to the Python server.

### One-command dev (optional)

```bash
chmod +x scripts/dev.sh
./scripts/dev.sh
```

## Production build

Serve the React build from FastAPI (single deploy):

```bash
cd frontend && npm run build
cd ../backend
ENV=production uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open [http://localhost:8000](http://localhost:8000).

## Deploy on Render (recommended)

One **Web Service** serves the React app and Python API together.

### Option A — Blueprint (fastest)

1. Push this repo to **public GitHub**.
2. Go to [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint**.
3. Connect the repo — Render reads `render.yaml`.
4. When prompted, set **`WEATHER_AI_API_KEY`** (`wai_…` from [weather-ai.co](https://weather-ai.co)).
5. Click **Apply** and wait for the deploy (~3–5 min).
6. Open your service URL (e.g. `https://weather-pulse.onrender.com`).

### Option B — Manual Web Service

| Setting | Value |
|---------|--------|
| **Runtime** | Python 3 |
| **Build Command** | `chmod +x scripts/render-build.sh && ./scripts/render-build.sh` |
| **Start Command** | `cd backend && ENV=production uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| **Health Check Path** | `/api/health` |

**Environment variables** (Render → Environment):

| Key | Value |
|-----|--------|
| `WEATHER_AI_API_KEY` | your `wai_…` key |
| `ENV` | `production` |
| `PYTHON_VERSION` | `3.12.0` (optional) |

Never commit the API key — set it only in Render’s dashboard.

### Verify deployment

```bash
curl https://YOUR-SERVICE.onrender.com/api/health
curl https://YOUR-SERVICE.onrender.com/api/usage
```

Use the same URL in your submission email as the **live deployment link**.

## Environment variables

| Variable | Where | Description |
|----------|-------|-------------|
| `WEATHER_AI_API_KEY` | `backend/.env` (local) or Render dashboard (prod) | Your `wai_…` API key |
| `ENV` | Render / production | Set to `production` to serve `frontend/dist` |

## Submission checklist

- [ ] Public GitHub repo with this README
- [ ] `WEATHER_AI_API_KEY` configured on host (not committed)
- [ ] Live deployment URL
- [ ] Email Claire with repo + live links

## License

MIT — technical assessment submission.
# Weather
