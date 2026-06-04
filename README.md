# Weather Pulse

Weather dashboard for the [Weather-AI Technical Challenge](https://weather-ai.co/docs). Built with **Python (FastAPI)** and **Vite + React**.

Search cities, view current conditions and forecasts, and read Gemini-powered AI summaries. The API key stays on the server—never exposed to the browser.

## Stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3.12, FastAPI, httpx |
| Frontend | Vite 8, React 19, TypeScript, Tailwind CSS v4 |
| Deploy | [Render](https://render.com) (Web Service) |

## Features

- Current weather and multi-day forecast via Weather-AI `/v1/weather`
- IP-based location detection via `/v1/weather-geo`
- API usage and quota display via `/v1/usage`
- City search (OpenStreetMap Nominatim → coordinates → Weather-AI)
- Optional AI summaries (`?ai=false` to save quota on Free plans)
- Saved favorite locations (browser localStorage)

## Project structure

```
Weather/
├── backend/
│   ├── app/
│   │   ├── main.py         # API routes + serves frontend in production
│   │   ├── weather_ai.py   # Weather-AI HTTP client
│   │   └── geocode.py      # City search
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/WeatherDashboard.tsx
│   │   └── lib/weather.ts
│   └── vite.config.ts      # dev proxy: /api → localhost:8000
├── scripts/
│   ├── render-build.sh     # Render production build
│   └── dev.sh              # run backend + frontend locally
├── render.yaml             # Render Blueprint
├── Procfile                # start command (Render/Heroku-style)
└── README.md
```

## Prerequisites

- Python 3.11+
- Node.js 20+
- Weather-AI API key (`wai_…`) from [weather-ai.co](https://weather-ai.co)

## Local development

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # add WEATHER_AI_API_KEY=wai_...
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api/*` to the backend on port 8000.

### Both servers (optional)

```bash
chmod +x scripts/dev.sh
./scripts/dev.sh
```

## Local production test

Build the UI and serve everything from FastAPI:

```bash
./scripts/render-build.sh
cd backend && source .venv/bin/activate
ENV=production uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open **http://localhost:8000**.

## Deploy on Render

One Web Service hosts the React app and Python API.

### Blueprint (recommended)

1. Push this repo to GitHub.
2. [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint** → connect the repo.
3. Set **`WEATHER_AI_API_KEY`** when prompted.
4. **Apply** and wait for the build (~3–5 min).
5. Use your service URL as the live demo link.

### Manual Web Service

| Setting | Value |
|---------|--------|
| Runtime | Python 3 |
| Build Command | `chmod +x scripts/render-build.sh && ./scripts/render-build.sh` |
| Start Command | `cd backend && ENV=production uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health Check Path | `/api/health` |

**Environment variables:**

| Key | Value |
|-----|--------|
| `WEATHER_AI_API_KEY` | your `wai_…` key |
| `ENV` | `production` |

Do not commit API keys. Set them only in `backend/.env` (local) or the Render dashboard (production).

### Verify

```bash
curl https://YOUR-SERVICE.onrender.com/api/health
curl https://YOUR-SERVICE.onrender.com/api/usage
```

Free-tier services may sleep after inactivity; the first request can take ~30 seconds.

## API routes (this app)

| Route | Upstream |
|-------|----------|
| `GET /api/weather` | Weather-AI `/v1/weather` |
| `GET /api/weather-geo` | Weather-AI `/v1/weather-geo` |
| `GET /api/usage` | Weather-AI `/v1/usage` |
| `GET /api/geocode` | OpenStreetMap Nominatim |
| `GET /api/health` | Health check |

## Submission checklist

- [ ] Public GitHub repository
- [ ] README with setup instructions (this file)
- [ ] `WEATHER_AI_API_KEY` set on Render (not in git)
- [ ] Live deployment URL
- [ ] Email Claire with repo link + live link

## License

MIT — technical assessment submission.
