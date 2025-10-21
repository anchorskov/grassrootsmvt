/**
 * Environment-aware URL generation for Grassroots MVT
 * 
 * This module provides centralized environment detection and URL generation
 * to eliminate hard-coded origins throughout the codebase. It supports
 * automatic detection of local development vs production environments.
 */

// Environment detection based on current page hostname
function detectEnvironment() {
  if (typeof window === 'undefined' || typeof location === 'undefined') {
    // Server-side or non-browser environment
    return { isLocal: false, environment: 'production' };
  }
  
  const hostname = location.hostname;
  const isLocal = hostname === 'localhost' || 
                  hostname === '127.0.0.1' || 
                  hostname.startsWith('192.168.') ||
                  hostname.startsWith('10.') ||
                  hostname.endsWith('.local');
  
  return {
    isLocal,
    environment: isLocal ? 'local' : 'production',
    hostname
  };
}

// Get the appropriate API base URL for current environment
function getApiBaseUrl() {
  const env = detectEnvironment();
  
  if (env.isLocal) {
    return 'http://localhost:8787';
  } else {
    // Same-origin in prod — UI Worker proxies /api/* to API Worker
    return (typeof window !== 'undefined')
      ? window.location.origin
      : 'https://volunteers.grassrootsmvt.org';
  }
}

// Get full API URL with path
function getApiUrl(path) {
  const baseUrl = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
}

// Check if authentication should be bypassed (local development)
function shouldBypassAuth() {
  return detectEnvironment().isLocal;
}

// Get environment info object for debugging/logging
function getEnvironmentInfo() {
  const env = detectEnvironment();
  return {
    environment: env.environment,
    isLocal: env.isLocal,
    hostname: env.hostname,
    apiBaseUrl: getApiBaseUrl(),
    shouldBypassAuth: shouldBypassAuth()
  };
}

// Export functions for use in other modules
window.GrassrootsEnv = {
  detectEnvironment,
  getApiBaseUrl,
  getApiUrl,
  shouldBypassAuth,
  getEnvironmentInfo
};

// Also support direct property access for backwards compatibility
window.GrassrootsEnv.isLocal = detectEnvironment().isLocal;
window.GrassrootsEnv.apiBaseUrl = getApiBaseUrl();

// ES6 module exports for modern import syntax
export {
  detectEnvironment,
  getApiBaseUrl,
  getApiUrl,
  shouldBypassAuth,
  getEnvironmentInfo
};

// Default export for convenience
export default {
  detectEnvironment,
  getApiBaseUrl,
  getApiUrl,
  shouldBypassAuth,
  getEnvironmentInfo,
  isLocal: detectEnvironment().isLocal,
  apiBaseUrl: getApiBaseUrl()
};