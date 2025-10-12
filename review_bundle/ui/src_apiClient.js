// ui/src/apiClient.js
// Unified API client with environment detection and safe fetch logic

const LOCAL_API = "http://localhost:8787";
const PROD_API = "https://api.grassrootsmvt.org";
const API_BASE =
  window.location.hostname === "localhost" ? LOCAL_API : PROD_API;

/**
 * Unified API fetch wrapper
 */
export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem("access_token");
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  // prevent accidental double "/api/api/"
  const cleanPath = path.startsWith("/api/") ? path : `/api${path}`;

  try {
    const res = await fetch(`${API_BASE}${cleanPath}`, { ...options, headers });
    const text = await res.text();

    if (res.status === 401) console.warn("⚠️ Unauthorized – check login");

    try {
      return JSON.parse(text || "{}");
    } catch {
      return { ok: false, error: "invalid_json", body: text };
    }
  } catch (err) {
    console.error("❌ API fetch failed:", err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Voter retrieval (safe, non-recursive)
 */
export async function fetchVoters() {
  return apiFetch("/voters"); // uses unified wrapper
}

/**
 * Log a volunteer call
 */
export async function logCall(voter_id, call_result, notes = "") {
  return apiFetch("/call", {
    method: "POST",
    body: JSON.stringify({ voter_id, call_result, notes }),
  });
}

/**
 * Retrieve volunteer call history
 */
export async function fetchActivity() {
  return apiFetch("/activity");
}

/**
 * Check who is logged in
 */
export async function whoAmI() {
  return apiFetch("/whoami");
}

/**
 * Health check
 */
export async function ping() {
  return apiFetch("/ping");
}

export function showApiConfig() {
  console.info("🌐 API_BASE =", API_BASE);
}
