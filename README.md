# Weather Pulse

A weather dashboard built for the **Weather-AI Technical Challenge**. It consumes the [Weather-AI REST API](https://weather-ai.co/docs) and presents current conditions, forecasts, and optional Gemini AI summaries in a simple web UI.

**Live demo:** https://weather-pulse-v7yy.onrender.com  
**Repository:** https://github.com/MaginaBrian/Weather

## Stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3.12, FastAPI, httpx |
| Frontend | Vite 8, React 19, JavaScript (JSX), Tailwind CSS v4 |
| Hosting | [Render](https://render.com) — single Web Service |

The Weather-AI API key is stored **only on the server**. The browser never receives it.

## Features

- Current weather and multi-day forecast (`/v1/weather`)
- IP-based location detection (`/v1/weather-geo`)
- API usage and quota display (`/v1/usage`)
- City search via OpenStreetMap Nominatim
- Optional AI summaries (off by default; use `?ai=false` to save Free-plan quota)
- Saved favorite locations (localStorage)
- Automatic fallback to non-AI weather if AI requests time out

## Architecture

```
Browser  →  FastAPI (/api/*)  →  api.weather-ai.co
         ←  Vite build (/)    ←  (static files in production)
```

In development, Vite runs on port **5173** and proxies `/api` to FastAPI on port **8000**. In production, FastAPI serves both the API and the built frontend from `frontend/dist`.

## Project structure

```
Weather/
├── backend/
│   ├── app/
│   │   ├── main.py          # Routes + static frontend (production)
│   │   ├── weather_ai.py    # Weather-AI client + error handling
│   │   └── geocode.py       # City search (Nominatim)
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── public/favicon.svg
│   ├── src/
│   │   ├── main.jsx
│   │   ├── index.css
│   │   ├── components/WeatherDashboard.jsx
│   │   └── lib/
│   │       ├── api.js         # fetch helpers + error messages
│   │       └── weather.js     # Data helpers
│   ├── index.html
│   ├── vite.config.js         # Dev proxy: /api → :8000
│   └── package.json
├── scripts/
│   ├── render-build.sh        # Production build (Render)
│   └── dev.sh                 # Run backend + frontend locally
├── render.yaml                # Render Blueprint
└── README.md
```

## Prerequisites

- **Python** 3.11+
- **Node.js** 20+
- **Weather-AI API key** (`wai_…`) from [weather-ai.co](https://weather-ai.co) → Dashboard → API Keys

## Local setup

### 1. Clone and configure the API key

```bash
git clone https://github.com/MaginaBrian/Weather.git
cd Weather
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
WEATHER_AI_API_KEY=wai_your_key_here
```

Never commit `backend/.env`.

### 2. Start the backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 3. Start the frontend (new terminal)

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** and search for a city (e.g. Nairobi, New York).

### Run both servers at once (optional)

```bash
chmod +x scripts/dev.sh
./scripts/dev.sh
```

## Local production test

Simulates how Render serves the app:

```bash
chmod +x scripts/render-build.sh
./scripts/render-build.sh
cd backend && source .venv/bin/activate
ENV=production uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open **http://localhost:8000**.

## Deploy on Render

One Web Service builds the frontend and runs the Python API.

### Option A — Blueprint (recommended)

1. Push this repo to GitHub.
2. Go to [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint**.
3. Connect **MaginaBrian/Weather** (or your fork).
4. Set **`WEATHER_AI_API_KEY`** when prompted.
5. Click **Apply** and wait for the deploy (~3–8 minutes).

Render uses `render.yaml` automatically.

### Option B — Manual Web Service

| Setting | Value |
|---------|--------|
| **Runtime** | Python 3 |
| **Build Command** | `chmod +x scripts/render-build.sh && ./scripts/render-build.sh` |
| **Start Command** | `cd backend && ENV=production uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| **Health Check Path** | `/api/health` |

**Environment variables:**

| Key | Value |
|-----|--------|
| `WEATHER_AI_API_KEY` | Your `wai_…` key |
| `ENV` | `production` |
| `PYTHON_VERSION` | `3.12.0` (optional) |

### Verify deployment

```bash
curl https://weather-pulse-v7yy.onrender.com/api/health
curl https://weather-pulse-v7yy.onrender.com/api/usage
```

After deploy, hard-refresh the site (**Ctrl+Shift+R**) if you see a blank page or 404 on JS files.

> **Note:** Render’s free tier sleeps after ~15 minutes of inactivity. The first request after sleep may take 30–60 seconds.

## API routes (this application)

| Route | Description |
|-------|-------------|
| `GET /api/health` | Health check |
| `GET /api/weather` | Proxy to Weather-AI `/v1/weather` |
| `GET /api/weather-geo` | Proxy to Weather-AI `/v1/weather-geo` |
| `GET /api/usage` | Proxy to Weather-AI `/v1/usage` |
| `GET /api/geocode?q=` | City search (Nominatim) |

### Example

```bash
curl "https://weather-pulse-v7yy.onrender.com/api/weather?lat=-1.2921&lon=36.8219&days=3&ai=false&units=metric"
```

## Troubleshooting

| Issue | What to do |
|-------|------------|
| **503** on `/api/*` | Set `WEATHER_AI_API_KEY` in Render → Environment, then redeploy |
| **502 / 504** on weather | Weather-AI may be slow or down; turn off **AI summary** and retry |
| **404** on `index-*.js` | Redeploy, then hard-refresh the browser (stale cached `index.html`) |
| Blank page after deploy | Check Render build logs for `Frontend assets:` and confirm `dist/assets/` was created |
| Very slow first load | Normal on Render free tier (cold start) |

## Environment variables

| Variable | Local | Render |
|----------|-------|--------|
| `WEATHER_AI_API_KEY` | `backend/.env` | Dashboard → Environment |
| `ENV` | optional | `production` |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Frontend dev server (in `frontend/`) |
| `npm run build` | Build frontend to `frontend/dist` |
| `npm run lint` | ESLint (in `frontend/`) |
| `./scripts/render-build.sh` | Install Python deps + build frontend (Render) |
| `./scripts/dev.sh` | Run backend and frontend together |

## Submission checklist

- [x] Public GitHub repository
- [x] README with setup and deployment instructions
- [x] `WEATHER_AI_API_KEY` configured on Render (not in git)
- [x] Live deployment: https://weather-pulse-v7yy.onrender.com
- [ ] Email Claire with repo + live links

## License

MIT — technical assessment submission.
