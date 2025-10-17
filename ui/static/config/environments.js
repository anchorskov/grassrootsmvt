/**
 * Environment detection and API routing for GrassrootsMVT
 * Supports local dev API base override via localStorage
 */

const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

// Read local override from localStorage
const stored = localStorage.getItem('GRMVT_API_BASE') || '';
const apiBaseOverride = (isLocal && /^https?:\/\//.test(stored)) ? stored : null;

// Derive base: dev override OR same-origin
const base = apiBaseOverride || location.origin;

function getApiUrl(endpoint, params = {}) {
  // Normalize endpoint: if it starts with '/', use as-is; else prefix `/api/`
  const path = endpoint.startsWith('/') ? endpoint : `/api/${endpoint}`;
  
  // Build URL
  const url = new URL(path, base);
  
  // Append params
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== null && v !== undefined) {
      url.searchParams.set(k, String(v));
    }
  });
  
  return url.toString();
}

function shouldBypassAuth() {
  return isLocal;
}

function debug(...args) {
  if (isLocal) {
    console.log('[ENV]', ...args);
  }
}

const config = {
  environment: isLocal ? 'local' : 'production',
  isLocal: isLocal
};

// Export version for debugging
export const envVersion = "2025-10-16";

// Default export
export default {
  shouldBypassAuth,
  getApiUrl,
  debug,
  config
};