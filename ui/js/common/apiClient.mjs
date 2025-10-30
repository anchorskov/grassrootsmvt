// ES module wrapper for the classic apiClient.js
import '/src/apiClient.js';

export const apiFetch = window.apiFetch;
export const apiGet = window.apiGet;
export const apiPost = window.apiPost;
export const ensureAccessSession = window.ensureAccessSession;
export const getCurrentUserOrRedirect = window.getCurrentUserOrRedirect;
