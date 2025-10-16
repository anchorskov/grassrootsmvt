// ui/src/apiClient.js
let environmentConfig;

// Load env helper (absolute path for production). If it fails, we’ll fall back.
async function loadEnvironmentConfig() {
  if (environmentConfig) return environmentConfig;
  try {
    const mod = await import('/config/environments.js');
    environmentConfig = mod.default || mod.environmentConfig || mod;
  } catch (e) {
    console.warn('ENV import failed, using fallback', e);
    environmentConfig = null;
  }
  return environmentConfig;
}

/**
 * Build a safe API URL under all conditions:
 *  1) Try environment helper (getApiUrl)
 *  2) If local override is set (GRMVT_API_BASE) use it in dev
 *  3) Else same-origin /api/*
 */
async function safeGetApiUrl(endpoint, params = {}) {
  const env = await loadEnvironmentConfig();

  // Try environment helper first
  if (env && typeof env.getApiUrl === 'function') {
    try {
      const u = env.getApiUrl(endpoint, params);
      if (u) return u;
    } catch (e) {
      console.warn('env.getApiUrl threw, falling back:', e);
    }
  }

  // Dev override knob via localStorage (only on localhost/127.0.0.1)
  const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const stored = isLocal ? (localStorage.getItem('GRMVT_API_BASE') || '') : '';
  const apiBase = (isLocal && /^https?:\/\//.test(stored)) ? stored : location.origin;

  // Normalize endpoint into a path
  const path = String(endpoint).startsWith('/') ? String(endpoint) : `/api/${endpoint}`;
  const url = new URL(path, apiBase);

  // Append query params if provided
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });

  return url.toString();
}

async function apiFetch(endpoint, options = {}) {
  const url = await safeGetApiUrl(endpoint, options.params);
  const env = await loadEnvironmentConfig();
  const isLocal = !!(env?.config?.isLocal || /^(localhost|127\.0\.0\.1)$/.test(location.hostname));

  const fetchOptions = {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  };
  delete fetchOptions.params;

  const res = await fetch(url, fetchOptions);

  // In production, handle Access re-auth on 401/403
  if (!isLocal && (res.status === 401 || res.status === 403)) {
    const finish = await safeGetApiUrl('auth/finish', { to: location.href });
    const kick = await safeGetApiUrl('ping', { finish });
    location.replace(kick);
    return new Promise(() => {}); // halt during redirect
  }
  return res;
}

async function apiGet(endpoint, params) {
  const res = await apiFetch(endpoint, { params });
  if (!res.ok) throw new Error(`GET ${endpoint} ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

async function apiPost(endpoint, body) {
  const res = await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body || {}) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`POST ${endpoint} ${res.status}`);
    err.body = text;
    throw err;
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

// Export and expose globals for non-module pages
export { loadEnvironmentConfig, apiFetch, apiGet, apiPost };

if (typeof window !== 'undefined') {
  window.loadEnvironmentConfig = loadEnvironmentConfig;
  window.apiFetch = apiFetch;
  window.apiGet = apiGet;
  window.apiPost = apiPost;
}
