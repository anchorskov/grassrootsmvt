// This file is no longer needed since apiClient.js now provides global access
// Keeping as placeholder to prevent 404 errors if something still references it

console.log('[API-SHIM] This file is deprecated - apiClient.js now provides global access');

// Legacy compatibility - functions should already be available from apiClient.js
if (typeof window !== 'undefined') {
  // If for some reason the functions aren't available, provide fallbacks
  if (typeof window.apiFetch !== 'function') {
    console.warn('[API-SHIM] apiFetch not found - check apiClient.js loading');
  }
  
  // Provide the API helper if not already available
  if (typeof window.API !== 'function') {
    window.API = (p) => {
      const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      const baseUrl = isLocal ? 'http://localhost:8787' : 'https://api.grassrootsmvt.org';
      return `${baseUrl}/api${p.startsWith('/') ? p : '/' + p}`;
    };
  }
}
