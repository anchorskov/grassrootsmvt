/**
 * GrassrootsMVT Centralized API Client
 */

// Environment configuration cache
let environmentConfig;

// Load environment configuration
async function loadEnvironmentConfig() {
  if (!environmentConfig) {
    try {
      // Load environment helper module
      const mod = await import('/config/environments.js');
      const envHelper = mod.default || window.GrassrootsEnv;
      
      if (envHelper) {
        environmentConfig = {
          getApiUrl: (endpoint, params = {}) => {
            const url = new URL(envHelper.getApiUrl(endpoint));
            Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
            return url.toString();
          },
          shouldBypassAuth: () => envHelper.shouldBypassAuth(),
          isLocal: envHelper.isLocal,
          debug: (msg, data) => {
            if (envHelper.isLocal) console.log(`[API] ${msg}`, data || '');
          }
        };
      }
    } catch (error) {
      console.warn('Failed to load environment config, using fallback:', error);
    }
    
    // Fallback if environment helper not available
    if (!environmentConfig) {
      const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      // Use dynamic detection instead of hard-coded origins
      const baseUrl = (() => {
        if (window.GrassrootsEnv) return window.GrassrootsEnv.getApiBaseUrl();
        return isLocal ? 'http://localhost:8787' : 'https://api.grassrootsmvt.org';
      })();
      
      environmentConfig = {
        getApiUrl: (endpoint, params = {}) => {
          const path = endpoint.startsWith('/') ? endpoint : `/api/${endpoint}`;
          const url = new URL(baseUrl + path);
          Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
          return url.toString();
        },
        shouldBypassAuth: () => isLocal,
        isLocal,
        debug: (msg, data) => {
          if (isLocal) console.log(`[API-FALLBACK] ${msg}`, data || '');
        }
      };
    }
  }
  
  return environmentConfig;
}

// Centralized API fetch function
async function apiFetch(endpoint, options = {}) {
  const config = await loadEnvironmentConfig();
  
  // Build URL using environment-aware helper
  const url = config.getApiUrl(endpoint, options.params);
  config.debug('Fetching:', url);
  
  // Prepare fetch options with defaults
  const fetchOptions = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  };
  
  // Remove params from options to avoid conflicts
  delete fetchOptions.params;
  
  const response = await fetch(url, fetchOptions);
  
  // Handle auth failures in production
  if (!config.shouldBypassAuth() && (response.status === 401 || response.status === 403)) {
    config.debug('Auth failure, redirecting to login flow');
    
    // Build auth redirect URL
    const finishUrl = config.getApiUrl('auth/finish', { to: location.href });
    const authUrl = config.getApiUrl('ping', { finish: finishUrl });
    
    location.replace(authUrl);
    return new Promise(() => {}); // Halt execution during redirect
  }
  
  return response;
}

// Helper function for building API URLs
async function API(path, params) {
  const config = await loadEnvironmentConfig();
  return config.getApiUrl(path, params);
}

// Unified keys used everywhere
const ACCESS_READY_KEY   = "accessReady:v1";
const REDIRECT_GUARD_KEY = "access:redirected";

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

async function apiGet(path) {
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

async function apiPost(path, body) {
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

// Call this once during app bootstrap OR before showing identity
async function getCurrentUserOrRedirect() {
  // If we just returned from Access and whoami succeeds, mark ready and clear guard.
  try {
    const who = await apiGet("/whoami");
    sessionStorage.setItem(ACCESS_READY_KEY, "true");
    sessionStorage.removeItem(REDIRECT_GUARD_KEY);
    return who;
  } catch (e) {
    if (e.status === 401) {
      // Respect older bootstrap flag if present, to avoid double-redirects
      const bootstrapReady = sessionStorage.getItem(ACCESS_READY_KEY) === "true";
      const already        = sessionStorage.getItem(REDIRECT_GUARD_KEY) === "1";

      // Only one top-level navigation attempt per load, and only if not already "ready"
      if (!bootstrapReady && !already) {
        sessionStorage.setItem(REDIRECT_GUARD_KEY, "1");
        const to = encodeURIComponent(safeTo(window.location.href));
        // Use WHOAMI nav flow so Access becomes first-party and sets its cookie
        window.location.href = `${API_ORIGIN}/whoami?nav=1&to=${to}`;
        return new Promise(() => {}); // halt while navigating
      }

      // If we get here: we either already tried once, or bootstrap claimed ready.
      // Surface a visible banner rather than looping.
      console.error("Auth still not established after redirect.");
      const banner = document.getElementById("auth-banner") || document.createElement("div");
      banner.id = "auth-banner";
      banner.style.cssText = "position:fixed;top:0;left:0;right:0;padding:10px;background:#ffe0e0;color:#900;font-weight:600;z-index:99999";
      banner.textContent = "Login did not stick. Click to finish sign-in.";
      banner.onclick = () => {
        const to = encodeURIComponent(safeTo(window.location.href));
        window.location.href = `${API_ORIGIN}/whoami?nav=1&to=${to}`;
      };
      if (!banner.isConnected) document.body.appendChild(banner);
      throw e;
    }
    throw e;
  }
}

// Legacy compatibility functions for backward compatibility
async function ensureAccessSession() {
  const config = await loadEnvironmentConfig();
  
  // Bypass authentication in local development
  if (config.shouldBypassAuth()) {
    config.debug('Bypassing authentication in local development');
    sessionStorage.setItem(ACCESS_READY_KEY, 'true');
    return Promise.resolve();
  }

  const ready = sessionStorage.getItem(ACCESS_READY_KEY) === 'true';
  if (!ready) {
    try {
      await getCurrentUserOrRedirect();
      sessionStorage.setItem(ACCESS_READY_KEY, 'true');
    } catch (err) {
      const returnTo = encodeURIComponent(safeTo(location.href));
      const authUrl = await API('whoami', { nav: '1', to: returnTo });
      window.location.href = authUrl;
      return new Promise(() => {});
    }
  }
  return Promise.resolve();
}

async function apiGet(path) {
  const res = await apiFetch(path);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`GET ${path} ${res.status}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return res.json();
}

async function apiPost(path, body) {
  const res = await apiFetch(path, { 
    method: "POST", 
    body: JSON.stringify(body || {}) 
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`POST ${path} ${res.status}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return res.json();
}

// Export functions for ES6 modules and global access
export { apiFetch, API, loadEnvironmentConfig, ensureAccessSession, getCurrentUserOrRedirect, apiGet, apiPost };

// Global browser access (works in all contexts)
if (typeof window !== 'undefined') {
  window.apiFetch = apiFetch;
  window.API = API;
  window.ensureAccessSession = ensureAccessSession;
  window.getCurrentUserOrRedirect = getCurrentUserOrRedirect;
  window.apiGet = apiGet;
  window.apiPost = apiPost;
}
