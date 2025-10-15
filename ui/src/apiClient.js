/**
 * GrassrootsMVT API Client with Environment Detection
 * Works in both ES6 module and global script contexts
 */

// Environment configuration - try different ways to access it
let environmentConfig;

// Try to get environment config from different sources
if (typeof window !== 'undefined' && window.environmentConfig) {
  // Global variable (for non-module scripts)
  environmentConfig = window.environmentConfig;
}

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

// Ensure we're authenticated *before* making any API fetches.
// In local development, authentication is bypassed.
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
    // Direct kick to protected endpoint - no interstitial needed
    const returnTo = encodeURIComponent(location.href);
    const apiUrl = envConfig.getApiUrl('ping', {
      finish: envConfig.getApiUrl('auth/finish', { to: returnTo })
    });
    envConfig.debug('Redirecting to authentication:', apiUrl);
    window.location.replace(apiUrl);
    // Return a pending promise so callers don't proceed
    return new Promise(() => {});
  }
  return Promise.resolve();
}

// Call this once when your UI loads (e.g., in main.js or on DOMContentLoaded)
async function initializeAuthStatus() {
  const envConfig = await ensureEnvironmentConfig();
  
  // In local development, skip authentication checks
  if (envConfig.shouldBypassAuth()) {
    envConfig.debug('Skipping authentication check in local development');
    sessionStorage.setItem('accessReady:v1', 'true');
    return true;
  }

  try {
    // a lightweight, credentialed call — if we're not allowed,
    // the browser would hit CORS/redirect, so we proactively kick instead.
    const authConfigUrl = envConfig.getApiUrl('auth/config');
    const res = await fetch(authConfigUrl, { credentials: 'include' });
    if (res.ok) {
      sessionStorage.setItem('accessReady:v1', 'true');
      envConfig.debug('Authentication check passed');
      return true;
    }
  } catch (error) {
    envConfig.debug('Authentication check failed:', error);
  }
  
  sessionStorage.removeItem('accessReady:v1');
  // if not authenticated → top-level nav to a protected endpoint
  // Cloudflare Access will 302 to team domain and back to /auth/finish
  const returnTo = encodeURIComponent(location.href);
  const apiUrl = envConfig.getApiUrl('ping', {
    finish: envConfig.getApiUrl('auth/finish', { to: returnTo })
  });
  envConfig.debug('Redirecting to authentication:', apiUrl);
  location.replace(apiUrl);
  return false;
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
    // Direct kick to protected endpoint - no interstitial needed
    const returnTo = encodeURIComponent(location.href);
    const authUrl = envConfig.getApiUrl('ping', {
      finish: envConfig.getApiUrl('auth/finish', { to: returnTo })
    });
    envConfig.debug('Re-authenticating due to 401/403:', authUrl);
    window.location.replace(authUrl);
    return new Promise(() => {});
  }
  return res;
}

// Global browser access (works in all contexts)
if (typeof window !== 'undefined') {
  window.ensureAccessSession = ensureAccessSession;
  window.initializeAuthStatus = initializeAuthStatus;
  window.apiFetch = apiFetch;
}

// ES6 module compatibility (for files that import this module)
// Only define exports if we're in a module context
if (typeof module !== 'undefined' && module.exports) {
  // CommonJS exports
  module.exports = { ensureAccessSession, initializeAuthStatus, apiFetch };
} else if (typeof window === 'undefined') {
  // ES6 module exports (only if not in browser)
  // This will be handled by bundlers or Node.js module systems
  if (typeof globalThis !== 'undefined') {
    globalThis.ensureAccessSession = ensureAccessSession;
    globalThis.initializeAuthStatus = initializeAuthStatus;
    globalThis.apiFetch = apiFetch;
  }
}
