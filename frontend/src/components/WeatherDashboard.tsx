import { useCallback, useEffect, useState } from "react";
import {
  extractAISummary,
  extractCurrentTemp,
  extractForecastDays,
  parseApiError,
  speedUnit,
  tempUnit,
  type ForecastDay,
  type GeocodeResult,
  type RateLimitInfo,
  type Units,
  type UsageResponse,
  type WeatherResponse,
} from "@/lib/weather";

interface SavedLocation {
  name: string;
  lat: number;
  lon: number;
}

const FAVORITES_KEY = "weather-pulse-favorites";

function weatherIcon(condition?: string): string {
  const c = (condition ?? "").toLowerCase();
  if (c.includes("rain") || c.includes("drizzle")) return "🌧️";
  if (c.includes("storm") || c.includes("thunder")) return "⛈️";
  if (c.includes("snow")) return "❄️";
  if (c.includes("cloud") || c.includes("overcast")) return "☁️";
  if (c.includes("fog") || c.includes("mist")) return "🌫️";
  if (c.includes("clear") || c.includes("sun")) return "☀️";
  return "🌤️";
}

function formatDayLabel(date?: string, index?: number): string {
  if (!date) return index === 0 ? "Today" : `Day ${(index ?? 0) + 1}`;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function dayHighLow(day: ForecastDay): { high: number | null; low: number | null } {
  return {
    high: day.high ?? day.max ?? day.temp_max ?? null,
    low: day.low ?? day.min ?? day.temp_min ?? null,
  };
}

export default function WeatherDashboard() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [locationLabel, setLocationLabel] = useState("Select a location");
  const [units, setUnits] = useState<Units>("metric");
  const [useAI, setUseAI] = useState(true);
  const [forecastDays, setForecastDays] = useState(7);
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [favorites, setFavorites] = useState<SavedLocation[]>(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      return raw ? (JSON.parse(raw) as SavedLocation[]) : [];
    } catch {
      return [];
    }
  });
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);

  const saveFavorites = (list: SavedLocation[]) => {
    setFavorites(list);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
  };

  const loadUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/usage");
      const json = await res.json();
      if (res.ok) {
        setUsage(json.data);
        if (json.rateLimit) setRateLimit(json.rateLimit);
      }
    } catch {
      /* non-blocking */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/usage")
      .then((res) => res.json())
      .then((json) => {
        if (cancelled || !json.data) return;
        setUsage(json.data);
        if (json.rateLimit) setRateLimit(json.rateLimit);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchWeather = useCallback(
    async (lat: number, lon: number, label: string) => {
      setLoading(true);
      setError(null);
      setCoords({ lat, lon });
      setLocationLabel(label);

      try {
        const sp = new URLSearchParams({
          lat: String(lat),
          lon: String(lon),
          days: String(forecastDays),
          ai: String(useAI),
          units,
        });
        const res = await fetch(`/api/weather?${sp}`);
        const json = await res.json();
        if (!res.ok) throw new Error(await parseApiError(res));
        setWeather(json.data);
        if (json.rateLimit) setRateLimit(json.rateLimit);
        loadUsage();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
        setWeather(null);
      } finally {
        setLoading(false);
      }
    },
    [forecastDays, useAI, units, loadUsage]
  );

  const detectLocation = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/weather-geo?ip=auto&days=${forecastDays}&ai=${useAI}&units=${units}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(await parseApiError(res));

      const geo = json.geoHeaders ?? {};
      const city = geo["X-City"] ?? json.data?.geo?.city ?? json.data?.location?.city;
      const region = geo["X-Region"] ?? json.data?.geo?.region;
      const country = geo["X-Country"] ?? json.data?.geo?.country;
      const label = [city, region, country].filter(Boolean).join(", ") || "Your location";

      setWeather(json.data);
      setLocationLabel(label);
      if (json.rateLimit) setRateLimit(json.rateLimit);

      const lat = json.data?.location?.lat ?? json.data?.geo?.lat;
      const lon = json.data?.location?.lon ?? json.data?.geo?.lon;
      if (typeof lat === "number" && typeof lon === "number") {
        setCoords({ lat, lon });
      }
      loadUsage();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not detect location");
    } finally {
      setLoading(false);
    }
  };

  const useBrowserLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported in this browser");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        fetchWeather(pos.coords.latitude, pos.coords.longitude, "Your coordinates");
      },
      () => {
        setError("Location permission denied — try IP detection or search");
        setLoading(false);
      }
    );
  };

  const searchLocations = async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(await parseApiError(res));
      setSuggestions(json.results ?? []);
    } catch {
      setSuggestions([]);
      setError("Could not find that location");
    } finally {
      setSearching(false);
    }
  };

  const addFavorite = () => {
    if (!coords) return;
    const exists = favorites.some((f) => f.lat === coords.lat && f.lon === coords.lon);
    if (exists) return;
    saveFavorites([...favorites, { name: locationLabel, lat: coords.lat, lon: coords.lon }]);
  };

  const removeFavorite = (lat: number, lon: number) => {
    saveFavorites(favorites.filter((f) => !(f.lat === lat && f.lon === lon)));
  };

  const current = weather?.current;
  const temp = weather ? extractCurrentTemp(weather) : null;
  const aiSummary = weather ? extractAISummary(weather) : null;
  const forecast = weather ? extractForecastDays(weather) : [];
  const isFavorite =
    coords && favorites.some((f) => f.lat === coords.lat && f.lon === coords.lon);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium tracking-widest text-sky-300/80 uppercase">
            Weather-AI Integration
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Weather Pulse
          </h1>
          <p className="mt-2 max-w-xl text-slate-300">
            Python API + Vite React — forecasts and Gemini summaries via Weather-AI.
          </p>
        </div>
        <UsageBadge usage={usage} rateLimit={rateLimit} />
      </header>

      <section className="glass-panel mb-6 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchLocations()}
              placeholder="Search city (e.g. Nairobi, London)"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-slate-500 focus:border-sky-400/50 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
            />
            {suggestions.length > 0 && (
              <ul className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur">
                {suggestions.map((s, i) => (
                  <li key={`${s.lat}-${s.lon}-${i}`}>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left text-sm text-slate-200 hover:bg-sky-500/20"
                      onClick={() => {
                        setSuggestions([]);
                        setQuery(s.name);
                        fetchWeather(s.lat, s.lon, s.name);
                      }}
                    >
                      {s.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={searchLocations} disabled={searching}>
              {searching ? "Searching…" : "Search"}
            </button>
            <button type="button" className="btn-secondary" onClick={detectLocation} disabled={loading}>
              IP detect
            </button>
            <button type="button" className="btn-secondary" onClick={useBrowserLocation} disabled={loading}>
              GPS
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-white/10 pt-4 text-sm">
          <label className="flex items-center gap-2 text-slate-300">
            <span>Units</span>
            <select
              value={units}
              onChange={(e) => setUnits(e.target.value as Units)}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white"
            >
              <option value="metric">Metric (°C)</option>
              <option value="imperial">Imperial (°F)</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-slate-300">
            <span>Forecast days</span>
            <select
              value={forecastDays}
              onChange={(e) => setForecastDays(Number(e.target.value))}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white"
            >
              {[3, 5, 7].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-slate-300">
            <input
              type="checkbox"
              checked={useAI}
              onChange={(e) => setUseAI(e.target.checked)}
              className="rounded border-white/20"
            />
            AI summary (uses quota)
          </label>
          {coords && (
            <button
              type="button"
              className="text-sky-300 hover:text-sky-200"
              onClick={addFavorite}
              disabled={!!isFavorite}
            >
              {isFavorite ? "★ Saved" : "☆ Save location"}
            </button>
          )}
        </div>

        {favorites.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {favorites.map((f) => (
              <span
                key={`${f.lat}-${f.lon}`}
                className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200"
              >
                <button type="button" onClick={() => fetchWeather(f.lat, f.lon, f.name)}>
                  {f.name}
                </button>
                <button
                  type="button"
                  className="text-slate-400 hover:text-rose-300"
                  onClick={() => removeFavorite(f.lat, f.lon)}
                  aria-label="Remove"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-rose-100">
          <p>{error}</p>
          {error.includes("WEATHER_AI_API_KEY") && (
            <p className="mt-2 text-sm text-rose-200/90">
              Create <code className="text-rose-100">backend/.env</code> with your key from{" "}
              <a
                href="https://weather-ai.co"
                className="underline"
                target="_blank"
                rel="noreferrer"
              >
                weather-ai.co
              </a>
              , then restart the Python server.
            </p>
          )}
        </div>
      )}

      {loading && !weather && (
        <div className="flex min-h-[320px] items-center justify-center text-slate-400">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
            <p>Fetching weather from Weather-AI…</p>
          </div>
        </div>
      )}

      {weather && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="glass-panel lg:col-span-2 p-6 sm:p-8">
            <p className="text-sm text-sky-300/90">Current conditions</p>
            <h2 className="mt-1 text-2xl font-medium text-white sm:text-3xl">{locationLabel}</h2>
            <div className="mt-8 flex flex-wrap items-center gap-6">
              <span className="text-7xl" aria-hidden>
                {weatherIcon(current?.condition ?? current?.description)}
              </span>
              <div>
                <p className="text-6xl font-light tabular-nums text-white sm:text-7xl">
                  {temp != null ? `${Math.round(temp)}${tempUnit(units)}` : "—"}
                </p>
                <p className="mt-2 text-xl text-slate-300 capitalize">
                  {current?.condition ?? current?.description ?? "—"}
                </p>
                {current?.feels_like != null && (
                  <p className="text-sm text-slate-400">
                    Feels like {Math.round(current.feels_like)}
                    {tempUnit(units)}
                  </p>
                )}
              </div>
            </div>
            <dl className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: "Humidity", value: current?.humidity != null ? `${current.humidity}%` : "—" },
                {
                  label: "Wind",
                  value:
                    current?.wind_speed != null || current?.wind_kph != null
                      ? `${current.wind_speed ?? current.wind_kph} ${speedUnit(units)}`
                      : "—",
                },
                { label: "Pressure", value: current?.pressure != null ? `${current.pressure} hPa` : "—" },
                { label: "UV", value: current?.uv != null ? String(current.uv) : "—" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl bg-white/5 px-4 py-3">
                  <dt className="text-xs text-slate-400">{stat.label}</dt>
                  <dd className="mt-1 text-lg font-medium text-white">{stat.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="glass-panel flex flex-col p-6">
            <div className="flex items-center gap-2">
              <span className="text-lg">✨</span>
              <h3 className="font-medium text-white">AI Summary</h3>
            </div>
            <p className="mt-1 text-xs text-slate-400">Powered by Gemini via Weather-AI</p>
            <div className="mt-4 flex-1 text-sm leading-relaxed text-slate-200">
              {useAI ? (
                aiSummary ? (
                  <p>{aiSummary}</p>
                ) : (
                  <p className="text-slate-500 italic">
                    No AI summary in response. Enable AI or check your plan quota.
                  </p>
                )
              ) : (
                <p className="text-slate-500 italic">
                  AI disabled (?ai=false) to preserve your monthly AI quota.
                </p>
              )}
            </div>
            {weather.ai?.insights && Array.isArray(weather.ai.insights) && (
              <ul className="mt-4 space-y-2 border-t border-white/10 pt-4 text-xs text-slate-300">
                {weather.ai.insights.map((item, i) => (
                  <li key={i}>• {item}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="glass-panel lg:col-span-3 p-6">
            <h3 className="font-medium text-white">{forecastDays}-day forecast</h3>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
              {forecast.length === 0 ? (
                <p className="text-slate-400 col-span-full">No forecast data returned.</p>
              ) : (
                forecast.slice(0, forecastDays).map((day, i) => {
                  const { high, low } = dayHighLow(day);
                  return (
                    <div
                      key={day.date ?? i}
                      className="rounded-xl border border-white/5 bg-white/5 px-4 py-4 text-center"
                    >
                      <p className="text-xs font-medium text-sky-300/90">
                        {formatDayLabel(day.date ?? day.day, i)}
                      </p>
                      <p className="mt-2 text-2xl">{weatherIcon(day.condition ?? day.description)}</p>
                      <p className="mt-2 text-sm capitalize text-slate-400">
                        {day.condition ?? day.description ?? "—"}
                      </p>
                      <p className="mt-2 text-white">
                        {high != null ? `${Math.round(high)}°` : "—"}
                        <span className="text-slate-500">
                          {" "}
                          / {low != null ? `${Math.round(low)}°` : "—"}
                        </span>
                      </p>
                      {(day.precip_chance ?? day.precipitation) != null && (
                        <p className="mt-1 text-xs text-sky-300/80">
                          💧 {day.precip_chance ?? day.precipitation}%
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {!loading && !weather && !error && (
        <div className="glass-panel flex min-h-[280px] flex-col items-center justify-center p-8 text-center text-slate-400">
          <p className="text-5xl">🌍</p>
          <p className="mt-4 max-w-md">
            Search for a city, use IP detection, or enable GPS to load weather from{" "}
            <code className="text-sky-300">api.weather-ai.co</code>.
          </p>
        </div>
      )}

      <footer className="mt-12 text-center text-xs text-slate-500">
        FastAPI backend · Vite + React frontend · API key stays server-side
      </footer>
    </div>
  );
}

function UsageBadge({
  usage,
  rateLimit,
}: {
  usage: UsageResponse | null;
  rateLimit: RateLimitInfo | null;
}) {
  const remaining = rateLimit?.remaining;
  const limit = rateLimit?.limit;

  const used =
    (usage?.requests as { used?: number } | undefined)?.used ??
    (typeof usage?.used === "number" ? usage.used : undefined);

  const reqLimit =
    (usage?.requests as { limit?: number } | undefined)?.limit ??
    (typeof usage?.limit === "number" ? usage.limit : limit);

  return (
    <div className="glass-panel shrink-0 px-4 py-3 text-sm">
      <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">API quota</p>
      {usage || rateLimit ? (
        <div className="mt-2 space-y-1 text-slate-200">
          {usage?.plan && (
            <p>
              Plan: <span className="text-sky-300 capitalize">{String(usage.plan)}</span>
            </p>
          )}
          {reqLimit != null && (
            <p>
              Requests: {used ?? "—"} / {reqLimit}
              {remaining != null && (
                <span className="text-slate-400"> ({remaining} left this period)</span>
              )}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-slate-500">Set API key to view usage</p>
      )}
    </div>
  );
}
