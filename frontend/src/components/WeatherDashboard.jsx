import { useCallback, useEffect, useState } from "react";
import { apiGet } from "@/lib/api.js";
import {
  extractAISummary,
  extractCurrentTemp,
  extractForecastDays,
  speedUnit,
  tempUnit,
  usageLabel,
} from "@/lib/weather.js";

const FAVORITES_KEY = "weather-pulse-favorites";

function weatherIcon(condition) {
  const c = (condition ?? "").toLowerCase();
  if (c.includes("rain")) return "🌧️";
  if (c.includes("storm") || c.includes("thunder")) return "⛈️";
  if (c.includes("snow")) return "❄️";
  if (c.includes("cloud")) return "☁️";
  if (c.includes("fog") || c.includes("mist")) return "🌫️";
  if (c.includes("clear") || c.includes("sun")) return "☀️";
  return "🌤️";
}

function formatDayLabel(date, index) {
  if (!date) return index === 0 ? "Today" : `Day ${(index ?? 0) + 1}`;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  if (d.toDateString() === new Date().toDateString()) return "Today";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function dayHighLow(day) {
  return {
    high: day.high ?? day.max ?? day.temp_max ?? null,
    low: day.low ?? day.min ?? day.temp_min ?? null,
  };
}

function weatherParams(lat, lon, days, ai, units) {
  return new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    days: String(days),
    ai: String(ai),
    units,
  }).toString();
}

function geoParams(days, ai, units) {
  return new URLSearchParams({
    ip: "auto",
    days: String(days),
    ai: String(ai),
    units,
  }).toString();
}

export default function WeatherDashboard() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [weather, setWeather] = useState(null);
  const [locationLabel, setLocationLabel] = useState("Select a location");
  const [units, setUnits] = useState("metric");
  const [useAI, setUseAI] = useState(false);
  const [forecastDays, setForecastDays] = useState(7);
  const [rateLimit, setRateLimit] = useState(null);
  const [usage, setUsage] = useState(null);
  const [favorites, setFavorites] = useState(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [coords, setCoords] = useState(null);

  const saveFavorites = (list) => {
    setFavorites(list);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
  };

  const refreshUsage = useCallback(async () => {
    try {
      const json = await apiGet("/api/usage");
      setUsage(json.data);
      if (json.rateLimit) setRateLimit(json.rateLimit);
    } catch {
      /* optional */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiGet("/api/usage")
      .then((json) => {
        if (cancelled) return;
        setUsage(json.data);
        if (json.rateLimit) setRateLimit(json.rateLimit);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchWeather = useCallback(
    async (lat, lon, label) => {
      setLoading(true);
      setError(null);
      setCoords({ lat, lon });
      setLocationLabel(label);

      try {
        const json = await apiGet(
          `/api/weather?${weatherParams(lat, lon, forecastDays, useAI, units)}`
        );
        setWeather(json.data);
        if (json.rateLimit) setRateLimit(json.rateLimit);
        if (json.live === false || json.demo) {
          setError(json.demoNote || "Weather-AI unavailable — showing demo data.");
        } else if (json.aiFallback && useAI) {
          setError("AI summary unavailable — showing forecast without AI.");
        } else {
          setError(null);
        }
        refreshUsage();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
        setWeather(null);
      } finally {
        setLoading(false);
      }
    },
    [forecastDays, useAI, units, refreshUsage]
  );

  const detectLocation = async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await apiGet(`/api/weather-geo?${geoParams(forecastDays, useAI, units)}`);
      const geo = json.geoHeaders ?? {};
      const d = json.data;
      const label =
        [geo["X-City"] ?? d.geo?.city ?? d.location?.city, geo["X-Region"] ?? d.geo?.region, geo["X-Country"] ?? d.geo?.country]
          .filter(Boolean)
          .join(", ") || "Your location";

      setWeather(d);
      setLocationLabel(label);
      if (json.rateLimit) setRateLimit(json.rateLimit);

      const lat = d.location?.lat ?? d.geo?.lat;
      const lon = d.location?.lon ?? d.geo?.lon;
      if (typeof lat === "number" && typeof lon === "number") setCoords({ lat, lon });
      refreshUsage();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not detect location");
    } finally {
      setLoading(false);
    }
  };

  const useBrowserLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude, "Your location"),
      () => {
        setError("Location permission denied");
        setLoading(false);
      }
    );
  };

  const searchLocations = async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true);
    try {
      const json = await apiGet(`/api/geocode?q=${encodeURIComponent(q)}`);
      setSuggestions(json.results ?? []);
      setError(null);
    } catch {
      setSuggestions([]);
      setError("Could not find that location");
    } finally {
      setSearching(false);
    }
  };

  const current = weather?.current;
  const temp = weather ? extractCurrentTemp(weather) : null;
  const aiSummary = weather ? extractAISummary(weather) : null;
  const forecast = weather ? extractForecastDays(weather) : [];
  const isFavorite = coords && favorites.some((f) => f.lat === coords.lat && f.lon === coords.lon);

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
            Forecasts and AI summaries via the Weather-AI API.
          </p>
        </div>
        <div className="glass-panel shrink-0 px-4 py-3 text-sm text-slate-200">
          <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">API quota</p>
          <p className="mt-2">{usageLabel(usage, rateLimit)}</p>
        </div>
      </header>

      <section className="glass-panel mb-6 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchLocations()}
              placeholder="Search city (e.g. Nairobi, New York)"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-slate-500 focus:border-sky-400/50 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
            />
            {suggestions.length > 0 && (
              <ul className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-slate-900/95 shadow-2xl">
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
            Units
            <select
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white"
            >
              <option value="metric">°C</option>
              <option value="imperial">°F</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-slate-300">
            Days
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
            <input type="checkbox" checked={useAI} onChange={(e) => setUseAI(e.target.checked)} />
            AI summary
          </label>
          {coords && (
            <button
              type="button"
              className="text-sky-300 hover:text-sky-200"
              onClick={() => {
                if (!coords || isFavorite) return;
                saveFavorites([...favorites, { name: locationLabel, lat: coords.lat, lon: coords.lon }]);
              }}
              disabled={!!isFavorite}
            >
              {isFavorite ? "★ Saved" : "☆ Save"}
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
                  onClick={() => saveFavorites(favorites.filter((x) => x.lat !== f.lat || x.lon !== f.lon))}
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
        <div
          className={`mb-6 rounded-xl px-4 py-3 ${
            error.includes("demo") || error.includes("Demo")
              ? "border border-amber-400/30 bg-amber-500/10 text-amber-100"
              : "border border-rose-400/30 bg-rose-500/10 text-rose-100"
          }`}
        >
          {error}
        </div>
      )}

      {loading && !weather && (
        <div className="flex min-h-[320px] items-center justify-center text-slate-400">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
        </div>
      )}

      {weather && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="glass-panel lg:col-span-2 p-6 sm:p-8">
            <h2 className="text-2xl font-medium text-white sm:text-3xl">{locationLabel}</h2>
            <div className="mt-8 flex flex-wrap items-center gap-6">
              <span className="text-7xl">{weatherIcon(current?.condition ?? current?.description)}</span>
              <div>
                <p className="text-6xl font-light text-white sm:text-7xl">
                  {temp != null ? `${Math.round(temp)}${tempUnit(units)}` : "—"}
                </p>
                <p className="mt-2 text-xl capitalize text-slate-300">
                  {current?.condition ?? current?.description ?? "—"}
                </p>
              </div>
            </div>
            <dl className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ["Humidity", current?.humidity != null ? `${current.humidity}%` : "—"],
                ["Wind", current?.wind_speed != null || current?.wind_kph != null ? `${current.wind_speed ?? current.wind_kph} ${speedUnit(units)}` : "—"],
                ["Pressure", current?.pressure != null ? `${current.pressure} hPa` : "—"],
                ["UV", current?.uv != null ? String(current.uv) : "—"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-white/5 px-4 py-3">
                  <dt className="text-xs text-slate-400">{label}</dt>
                  <dd className="mt-1 text-lg font-medium text-white">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="glass-panel flex flex-col p-6">
            <h3 className="font-medium text-white">AI Summary</h3>
            <p className="mt-4 flex-1 text-sm text-slate-200">
              {useAI && aiSummary
                ? aiSummary
                : useAI
                  ? "No AI summary returned."
                  : "Enable AI summary to generate one."}
            </p>
          </div>

          <div className="glass-panel lg:col-span-3 p-6">
            <h3 className="font-medium text-white">{forecastDays}-day forecast</h3>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
              {forecast.length === 0 ? (
                <p className="col-span-full text-slate-400">No forecast data.</p>
              ) : (
                forecast.slice(0, forecastDays).map((day, i) => {
                  const { high, low } = dayHighLow(day);
                  return (
                    <div key={day.date ?? i} className="rounded-xl bg-white/5 px-4 py-4 text-center">
                      <p className="text-xs text-sky-300/90">{formatDayLabel(day.date ?? day.day, i)}</p>
                      <p className="mt-2 text-2xl">{weatherIcon(day.condition ?? day.description)}</p>
                      <p className="mt-2 text-sm capitalize text-slate-400">{day.condition ?? day.description ?? "—"}</p>
                      <p className="mt-2 text-white">
                        {high != null ? `${Math.round(high)}°` : "—"}
                        <span className="text-slate-500"> / {low != null ? `${Math.round(low)}°` : "—"}</span>
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {!loading && !weather && !error && (
        <div className="glass-panel flex min-h-[240px] flex-col items-center justify-center p-8 text-center text-slate-400">
          <p className="text-5xl">🌍</p>
          <p className="mt-4">Search a city or use IP / GPS to load weather.</p>
        </div>
      )}
    </div>
  );
}
