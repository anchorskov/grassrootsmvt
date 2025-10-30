import { apiFetch } from '../../js/common/apiClient.mjs';

// Expose a simple global helper for non-module pages
window.apiFetch = apiFetch;

// Also expose an API() builder similar to existing code for compatibility
window.API = (p) => '/api' + p;
