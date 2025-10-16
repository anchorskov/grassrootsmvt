/**
 * GrassrootsMVT API Client with Enhanced Authentication Handling
 */

// Environment configuration - try different ways to access it
let environmentConfig;

// Wait for environment config to be available if needed
async function ensureEnvironmentConfig() {
  if (!environmentConfig && typeof window !== 'undefined') {
    // Wait a bit for the global variable to be set
    await new Promise(resolve => setTimeout(resolve, 100));
    if (window.environmentConfig) {
      environmentConfig = window.environmentConfig;
    }
  }
  
  // If still no environment config, make sure fallback is properly configured
  if (!environmentConfig) {
    environmentConfig = {
      shouldBypassAuth: () => {
        // Simple localhost detection fallback
        return location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      },
      getApiUrl: (endpoint, params = {}) => {
        const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        const baseUrl = isLocal ? 'http://localhost:8787' : 'https://api.grassrootsmvt.org';
        
        // Handle endpoint mapping like the real environment config
        const endpointMap = {
          'ping': '/api/ping',
          'voters': '/api/voters',
          'neighborhoods': '/api/neighborhoods',
          'log': '/api/log',
          'call': '/api/call',
          'whoami': '/api/whoami'
        };
        
        const endpointPath = endpointMap[endpoint] || (endpoint.startsWith('/') ? endpoint : `/api/${endpoint}`);
        let url = `${baseUrl}${endpointPath}`;
        
        if (Object.keys(params).length > 0) {
          const searchParams = new URLSearchParams(params);
          url += `?${searchParams.toString()}`;
        }
        return url;
      },
      debug: (message, data) => {
        const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (isLocal) {
          console.log(`[ENV-LOCAL-FALLBACK] ${message}`, data || '');
        }
      },
      config: {
        environment: location.hostname === 'localhost' ? 'local' : 'production',
        isLocal: location.hostname === 'localhost' || location.hostname === '127.0.0.1'
      }
    };
  }
  
  return environmentConfig;
}

const API_ORIGIN = (() => {
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  return isLocal ? 'http://localhost:8787' : 'https://api.grassrootsmvt.org';
})();

const API_BASE = `${API_ORIGIN}/api`;

const REDIRECT_GUARD_KEY = "access_redirect_once";

// Small safety to prevent open-redirects: only allow same-origin destinations
function safeTo(urlString) {
  try {
    const dest = new URL(urlString, window.location.href);
    const here = new URL(window.location.href);
    if (dest.origin !== here.origin) {
      // if different origin, fall back to site root
      return `${here.origin}/`;
    }
    return dest.toString();
  } catch { return window.location.origin + "/"; }
}

async function withAuthHeaders(init = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  // include cookies so CF Access session is sent
  return { ...init, headers, credentials: "include" };
}

export async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, await withAuthHeaders());
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`GET ${path} ${res.status}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return res.json();
}

export async function apiPost(path, body) {
  const res = await fetch(
    `${API_BASE}${path}`,
    await withAuthHeaders({ method: "POST", body: JSON.stringify(body || {}) })
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`POST ${path} ${res.status}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return res.json();
}

// New helper used by the header/user badge
export async function getCurrentUserOrRedirect() {
  try {
    const who = await apiGet("/whoami");
    // who = { ok: true, email }
    // clear redirect guard on success
    sessionStorage.removeItem(REDIRECT_GUARD_KEY);
    return who;
  } catch (e) {
    if (e.status === 401) {
      // prevent infinite loops: only redirect once per page load
      const already = sessionStorage.getItem(REDIRECT_GUARD_KEY) === "1";
      if (!already) {
        sessionStorage.setItem(REDIRECT_GUARD_KEY, "1");
        const to = encodeURIComponent(safeTo(window.location.href));
        window.location.href = `${API_ORIGIN}/auth/finish?to=${to}`;
        return new Promise(() => {}); // halt while navigating
      }
      // If we get here, we already tried Access once and still 401.
      // Surface a friendly message for troubleshooting instead of looping.
      const err = new Error("Not authenticated after Access redirect");
      err.status = 401;
      err.hint = "Check that Cloudflare Access protects api.grassrootsmvt.org/* and that the CF_Authorization cookie is set.";
      throw err;
    }
    throw e;
  }
}

// Legacy compatibility - maintain existing function names for backward compatibility
async function ensureAccessSession() {
  const envConfig = await ensureEnvironmentConfig();
  
  // Bypass authentication in local development
  if (envConfig.shouldBypassAuth()) {
    envConfig.debug('Bypassing authentication in local development');
    sessionStorage.setItem('accessReady:v1', 'true');
    return Promise.resolve();
  }

  const ready = sessionStorage.getItem('accessReady:v1') === 'true';
  if (!ready) {
    // Use the new getCurrentUserOrRedirect method
    try {
      await getCurrentUserOrRedirect();
      sessionStorage.setItem('accessReady:v1', 'true');
    } catch (err) {
      // getCurrentUserOrRedirect handles redirect, so this shouldn't normally execute
      const returnTo = encodeURIComponent(safeTo(location.href));
      window.location.href = `${API_ORIGIN}/auth/finish?to=${returnTo}`;
      return new Promise(() => {});
    }
  }
  return Promise.resolve();
}

async function initializeAuthStatus() {
  const envConfig = await ensureEnvironmentConfig();
  
  // In local development, skip authentication checks
  if (envConfig.shouldBypassAuth()) {
    envConfig.debug('Skipping authentication check in local development');
    sessionStorage.setItem('accessReady:v1', 'true');
    return true;
  }

  try {
    await getCurrentUserOrRedirect();
    sessionStorage.setItem('accessReady:v1', 'true');
    return true;
  } catch (error) {
    envConfig.debug('Authentication check failed:', error);
    sessionStorage.removeItem('accessReady:v1');
    return false;
  }
}

// Centralized API fetch with credentials
async function apiFetch(path, options = {}) {
  await ensureAccessSession(); // make sure we kicked, if needed
  
  const envConfig = await ensureEnvironmentConfig();
  const apiUrl = envConfig.getApiUrl(path);
  envConfig.debug('API fetch:', apiUrl);
  
  const fetchOptions = {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  };

  const res = await fetch(apiUrl, fetchOptions);
  
  // In local development, don't redirect on auth errors
  if (envConfig.shouldBypassAuth()) {
    return res;
  }
  
  // If something still goes sideways (e.g., Access cookie expired), re-kick.
  if (res.status === 401 || res.status === 403) {
    sessionStorage.removeItem('accessReady:v1');
    // Use the new getCurrentUserOrRedirect method
    await getCurrentUserOrRedirect();
    return new Promise(() => {});
  }
  return res;
}

// Global browser access (works in all contexts)
if (typeof window !== 'undefined') {
  window.ensureAccessSession = ensureAccessSession;
  window.initializeAuthStatus = initializeAuthStatus;
  window.apiFetch = apiFetch;
  window.getCurrentUserOrRedirect = getCurrentUserOrRedirect;
  window.apiGet = apiGet;
  window.apiPost = apiPost;
}

// ES6 module compatibility (for files that import this module)
if (typeof module !== 'undefined' && module.exports) {
  // CommonJS exports
  module.exports = { ensureAccessSession, initializeAuthStatus, apiFetch, getCurrentUserOrRedirect, apiGet, apiPost };
} else if (typeof window === 'undefined') {
  // ES6 module exports (only if not in browser)
  if (typeof globalThis !== 'undefined') {
    globalThis.ensureAccessSession = ensureAccessSession;
    globalThis.initializeAuthStatus = initializeAuthStatus;
    globalThis.apiFetch = apiFetch;
    globalThis.getCurrentUserOrRedirect = getCurrentUserOrRedirect;
    globalThis.apiGet = apiGet;
    globalThis.apiPost = apiPost;
  }
}
