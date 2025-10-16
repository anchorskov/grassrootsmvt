const API_BASE = 'https://api.grassrootsmvt.org';

// Ensure we're authenticated *before* making any API fetches.
// If not, send the browser directly to protected API endpoint.
export function ensureAccessSession() {
  const ready = sessionStorage.getItem('accessReady:v1') === 'true';
  if (!ready) {
    // Direct kick to protected endpoint - no interstitial needed
    const returnTo = encodeURIComponent(location.href);
    window.location.replace(`https://api.grassrootsmvt.org/api/ping?finish=${encodeURIComponent(`https://api.grassrootsmvt.org/auth/finish?to=${returnTo}`)}`);
    // Return a pending promise so callers don't proceed
    return new Promise(() => {});
  }
  return Promise.resolve();
}

// Call this once when your UI loads (e.g., in main.js or on DOMContentLoaded)
export async function initializeAuthStatus() {
  try {
    // a lightweight, credentialed call — if we're not allowed,
    // the browser would hit CORS/redirect, so we proactively kick instead.
    const res = await fetch(`${API_BASE}/auth/config`, { credentials: 'include' });
    if (res.ok) {
      sessionStorage.setItem('accessReady:v1', 'true');
      return true;
    }
  } catch (_) { /* fall through */ }
  sessionStorage.removeItem('accessReady:v1');
  // if not authenticated → top-level nav to a protected endpoint
  // Cloudflare Access will 302 to team domain and back to /auth/finish
  const returnTo = encodeURIComponent(location.href);
  location.replace(`https://api.grassrootsmvt.org/api/ping?finish=${encodeURIComponent(`https://api.grassrootsmvt.org/auth/finish?to=${returnTo}`)}`);
  return false;
}

// Centralized API fetch with credentials
export async function apiFetch(path, options = {}) {
  await ensureAccessSession(); // make sure we kicked, if needed
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  // If something still goes sideways (e.g., Access cookie expired), re-kick.
  if (res.status === 401 || res.status === 403) {
    sessionStorage.removeItem('accessReady:v1');
    // Direct kick to protected endpoint - no interstitial needed
    const returnTo = encodeURIComponent(location.href);
    window.location.replace(`https://api.grassrootsmvt.org/api/ping?finish=${encodeURIComponent(`https://api.grassrootsmvt.org/auth/finish?to=${returnTo}`)}`);
    return new Promise(() => {});
  }
  return res;
}
