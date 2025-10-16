/**
 * Centralized API Client for GrassrootsMVT
 * 
 * Provides environment-aware API calls with proper authentication handling.
 * Automatically detects local vs production environments and handles credentials.
 */

// Environment configuration helper
let envHelper = null;

async function getEnvironmentHelper() {
  if (!envHelper) {
    try {
      // Check if environment config is available globally first
      if (typeof window !== 'undefined' && window.GrassrootsEnv) {
        envHelper = {
          getApiUrl: window.GrassrootsEnv.getApiUrl,
          shouldBypassAuth: window.GrassrootsEnv.shouldBypassAuth,
          detectEnvironment: window.GrassrootsEnv.detectEnvironment,
          getEnvironmentInfo: window.GrassrootsEnv.getEnvironmentInfo
        };
      } else {
        // Try to import as module (this will load the script and make globals available)
        await import('/config/environments.js');
        if (window.GrassrootsEnv) {
          envHelper = {
            getApiUrl: window.GrassrootsEnv.getApiUrl,
            shouldBypassAuth: window.GrassrootsEnv.shouldBypassAuth,
            detectEnvironment: window.GrassrootsEnv.detectEnvironment,
            getEnvironmentInfo: window.GrassrootsEnv.getEnvironmentInfo
          };
        } else {
          throw new Error('Environment config not available after import');
        }
      }
    } catch (err) {
      console.warn('Failed to load environment config, using fallback:', err);
      // Origin-relative fallback (no hard-coded hosts)
      const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
      const baseUrl = location.origin;
      envHelper = {
        getApiUrl: (endpoint, params = {}) => {
          const path = endpoint.startsWith('/') ? endpoint : `/api/${endpoint}`;
          const url = new URL(baseUrl + path);
          Object.entries(params || {}).forEach(([k,v]) => url.searchParams.set(k, v));
          return url.toString();
        },
        shouldBypassAuth: () => isLocal,
        detectEnvironment: () => isLocal ? 'local' : 'production',
        getEnvironmentInfo: () => ({ environment: isLocal ? 'local' : 'production', isLocal })
      };
    }
  }
  return envHelper;
}

// Centralized API fetch function
export async function apiFetch(endpoint, options = {}) {
  const helper = await getEnvironmentHelper();
  
  // Build URL using environment-aware helper
  const url = helper.getApiUrl(endpoint, options.params);
  
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
  if (!helper.shouldBypassAuth() && (response.status === 401 || response.status === 403)) {
    // Build auth redirect URL
    const finishUrl = helper.getApiUrl('auth/finish', { to: location.href });
    const authUrl = helper.getApiUrl('ping', { finish: finishUrl });
    
    location.replace(authUrl);
    return new Promise(() => {}); // Halt execution during redirect
  }
  
  return response;
}

// Convenience functions for common API patterns
export async function apiGet(path) {
  const response = await apiFetch(path);
  if (!response.ok) {
    throw new Error(`API GET ${path} failed: ${response.status}`);
  }
  return await response.json();
}

export async function apiPost(path, body) {
  const response = await apiFetch(path, {
    method: 'POST',
    body: JSON.stringify(body || {})
  });
  if (!response.ok) {
    throw new Error(`API POST ${path} failed: ${response.status}`);
  }
  return await response.json();
}

// Environment configuration loader
export async function loadEnvironmentConfig() {
  const helper = await getEnvironmentHelper();
  return helper;
}

// Authentication session management
export async function ensureAccessSession() {
  const helper = await getEnvironmentHelper();
  
  // Bypass authentication in local development
  if (helper.shouldBypassAuth()) {
    sessionStorage.setItem('accessReady:v1', 'true');
    return Promise.resolve();
  }

  const ready = sessionStorage.getItem('accessReady:v1') === 'true';
  if (!ready) {
    // Direct kick to protected endpoint
    const returnTo = encodeURIComponent(location.href);
    const authUrl = helper.getApiUrl('ping', {
      finish: helper.getApiUrl('auth/finish', { to: returnTo })
    });
    window.location.replace(authUrl);
    return new Promise(() => {});
  }
  return Promise.resolve();
}

// Expose API functions globally for non-module usage
if (typeof window !== 'undefined') {
  window.apiFetch = apiFetch;
  window.apiGet = apiGet;
  window.apiPost = apiPost;
  window.ensureAccessSession = ensureAccessSession;
}
