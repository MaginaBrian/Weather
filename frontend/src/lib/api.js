export function apiErrorMessage(json, status) {
  if (json && typeof json === "object") {
    const detail = json.detail ?? json.error;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((d) => (d && typeof d === "object" && d.msg ? String(d.msg) : ""))
        .filter(Boolean)
        .join(", ");
    }
  }
  if (status === 503) return "WEATHER_AI_API_KEY is not configured on the server";
  if (status === 504) return "Request timed out — try disabling AI summary";
  return `Request failed (${status})`;
}

export async function apiGet(url) {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(apiErrorMessage(json, res.status));
  return json;
}
