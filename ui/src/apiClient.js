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

// Legacy compatibility - maintain existing function names for backward compatibility
async function ensureAccessSession() {
  sessionStorage.setItem(ACCESS_READY_KEY, 'true');
  return Promise.resolve();
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
  window.apiFetch = apiFetch;
  window.getCurrentUserOrRedirect = getCurrentUserOrRedirect;
  window.apiGet = apiGet;
  window.apiPost = apiPost;
}

// ES6 module compatibility (for files that import this module)
if (typeof module !== 'undefined' && module.exports) {
  // CommonJS exports
  module.exports = { ensureAccessSession, apiFetch, getCurrentUserOrRedirect, apiGet, apiPost };
} else if (typeof window === 'undefined') {
  // ES6 module exports (only if not in browser)
  if (typeof globalThis !== 'undefined') {
    globalThis.ensureAccessSession = ensureAccessSession;
    globalThis.apiFetch = apiFetch;
    globalThis.getCurrentUserOrRedirect = getCurrentUserOrRedirect;
    globalThis.apiGet = apiGet;
    globalThis.apiPost = apiPost;
  }
}
