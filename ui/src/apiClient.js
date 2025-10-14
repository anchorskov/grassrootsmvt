const API_BASE = "https://api.grassrootsmvt.org";
const UI_BASE  = "https://volunteers.grassrootsmvt.org";

function gotoConnecting() {
  const here = window.location.href;
  window.location.replace(`${UI_BASE}/connecting.html?to=${encodeURIComponent(here)}`);
}

export async function apiFetch(path, opts = {}) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const init = {
    method: (opts.method || "GET"),
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    body: opts.body ? (typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body)) : undefined,
    redirect: "follow",
  };

  try {
    const res = await fetch(url, init);
    if (res.type === "opaqueredirect" || res.status === 302 || res.status === 401 || res.status === 403) {
      gotoConnecting();
      throw new Error(`Auth required: ${res.status}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Request failed ${res.status}: ${text}`);
    }
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return res.json();
    return res.text();
  } catch (err) {
    console.error("apiFetch error:", err);
    gotoConnecting();
    throw err;
  }
}

export async function initializeAuthStatus() {
  try {
    await apiFetch("/api/ping");
  } catch (_) {}
}

if (typeof window !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    initializeAuthStatus();
  });
}
