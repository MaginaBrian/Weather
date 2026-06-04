export function extractAISummary(data) {
  if (typeof data.ai_summary === "string") return data.ai_summary;
  if (typeof data.summary === "string") return data.summary;
  if (data.ai?.summary) return data.ai.summary;
  return null;
}

export function extractCurrentTemp(data) {
  const c = data.current;
  if (!c) return null;
  const temp = c.temp ?? c.temperature;
  return typeof temp === "number" ? temp : null;
}

export function extractForecastDays(data) {
  const days = data.forecast ?? data.daily;
  return Array.isArray(days) ? days : [];
}

export function tempUnit(units) {
  return units === "imperial" ? "°F" : "°C";
}

export function speedUnit(units) {
  return units === "imperial" ? "mph" : "km/h";
}

export function usageLabel(usage, rateLimit) {
  if (!usage && !rateLimit) return "API key required";
  const plan = usage?.plan ? String(usage.plan) : "—";
  const used = usage?.period?.requestCount ?? usage?.requests?.used ?? "—";
  const limit = usage?.limits?.requests ?? usage?.requests?.limit ?? rateLimit?.limit ?? "—";
  const left = usage?.remaining?.requests ?? rateLimit?.remaining;
  const suffix = left != null ? ` (${left} left)` : "";
  return `Plan: ${plan} · Requests: ${used} / ${limit}${suffix}`;
}
