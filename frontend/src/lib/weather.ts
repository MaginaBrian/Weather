export type Units = "metric" | "imperial";

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}

export interface UsageResponse {
  plan?: string;
  requests?: { used?: number; limit?: number };
  ai_requests?: { used?: number; limit?: number };
  period?: { start?: string; end?: string };
  used?: number;
  limit?: number;
  [key: string]: unknown;
}

export interface ForecastDay {
  date?: string;
  day?: string;
  high?: number;
  low?: number;
  max?: number;
  min?: number;
  temp_max?: number;
  temp_min?: number;
  condition?: string;
  description?: string;
  precipitation?: number;
  precip_chance?: number;
  icon?: string;
}

export interface WeatherResponse {
  location?: {
    name?: string;
    city?: string;
    country?: string;
    region?: string;
    lat?: number;
    lon?: number;
  };
  current?: {
    temp?: number;
    temperature?: number;
    feels_like?: number;
    condition?: string;
    description?: string;
    humidity?: number;
    wind_speed?: number;
    wind_kph?: number;
    pressure?: number;
    uv?: number;
    icon?: string;
  };
  forecast?: ForecastDay[];
  daily?: ForecastDay[];
  ai_summary?: string;
  summary?: string;
  ai?: { summary?: string; insights?: string[] };
  geo?: {
    city?: string;
    region?: string;
    country?: string;
    lat?: number;
    lon?: number;
  };
  [key: string]: unknown;
}

export interface GeocodeResult {
  name: string;
  lat: number;
  lon: number;
  country?: string;
  region?: string;
}

export function extractAISummary(data: WeatherResponse): string | null {
  if (typeof data.ai_summary === "string") return data.ai_summary;
  if (typeof data.summary === "string") return data.summary;
  if (data.ai && typeof data.ai.summary === "string") return data.ai.summary;
  return null;
}

export function extractCurrentTemp(data: WeatherResponse): number | null {
  const c = data.current;
  if (!c) return null;
  const temp = c.temp ?? c.temperature;
  return typeof temp === "number" ? temp : null;
}

export function extractForecastDays(data: WeatherResponse): ForecastDay[] {
  const days = data.forecast ?? data.daily;
  return Array.isArray(days) ? days : [];
}

export function tempUnit(units: Units): string {
  return units === "imperial" ? "°F" : "°C";
}

export function speedUnit(units: Units): string {
  return units === "imperial" ? "mph" : "km/h";
}

export async function parseApiError(res: Response): Promise<string> {
  try {
    const json = await res.json();
    const detail = json.detail ?? json.error;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(", ");
    }
    if (res.status === 503) {
      return "WEATHER_AI_API_KEY is not configured on the server";
    }
    return `Request failed (${res.status})`;
  } catch {
    if (res.status === 503) {
      return "WEATHER_AI_API_KEY is not configured on the server";
    }
    return `Request failed (${res.status})`;
  }
}
