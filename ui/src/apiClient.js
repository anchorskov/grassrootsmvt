// ui/src/apiClient.js
import environmentConfig from '/config/environments.js';

function accessKick() {
  if (environmentConfig.shouldBypassAuth && environmentConfig.shouldBypassAuth()) return;
  const finish = environmentConfig.getApiUrl('auth/finish', { to: location.href });
  const kick   = environmentConfig.getApiUrl('ping', { finish });
  window.location.replace(kick);
}

// Load env helper (absolute path for production). If it fails, we'll fall back.
async function loadEnvironmentConfig() {
  return environmentConfig;
}ient.js
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



export async function apiFetch(path, options = {}) {
  const url = environmentConfig.getApiUrl(path);
  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  if (res.status === 401 || res.status === 403) accessKick();
  return res;
}

export async function apiGet(endpoint, params) {
  const res = await apiFetch(endpoint, { params });
  if (!res.ok) throw new Error(`GET ${endpoint} ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

export async function apiPost(endpoint, body) {
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
if (typeof window !== 'undefined') {
  window.loadEnvironmentConfig = loadEnvironmentConfig;
  window.apiFetch = apiFetch;
  window.apiGet = apiGet;
  window.apiPost = apiPost;
}
