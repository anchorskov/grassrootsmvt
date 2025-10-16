export const envVersion = "2025-10-16.1";

const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
// Allow a local dev override to a different origin (e.g., API on 8787)
const stored = isLocal ? (localStorage.getItem('GRMVT_API_BASE') || '') : '';
const apiBaseOverride = (isLocal && /^https?:\/\//.test(stored)) ? stored : null;
const base = apiBaseOverride || location.origin;

function getApiUrl(endpoint, params = {}) {
  const path = String(endpoint).startsWith('/') ? String(endpoint) : `/api/${endpoint}`;
  const url = new URL(path, base);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

export default {
  shouldBypassAuth: () => isLocal,
  getApiUrl,
  debug: (...a) => { if (isLocal) console.log('[ENV]', ...a); },
  config: { environment: isLocal ? 'local' : 'production', isLocal }
};
