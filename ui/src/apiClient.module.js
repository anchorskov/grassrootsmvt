import '../config/environments.js';
import './apiClient.v2.js?v=2025-10-30a';

const ensure = name => {
  const value = window[name];
  if (typeof value === 'undefined') {
    throw new Error(`apiClient global ${name} is not available`);
  }
  return value;
};

export const apiFetch = (...args) => ensure('apiFetch')(...args);
export const apiGet = (...args) => ensure('apiGet')(...args);
export const apiPost = (...args) => ensure('apiPost')(...args);
export const authenticatedFetch = (...args) => ensure('authenticatedFetch')(...args);
export const fetchVoters = (...args) => ensure('fetchVoters')(...args);
export const fetchTemplates = (...args) => ensure('fetchTemplates')(...args);
export const logCall = (...args) => ensure('logCall')(...args);
export const logCanvass = (...args) => ensure('logCanvass')(...args);
export const getOnlineStatus = (...args) => ensure('getOnlineStatus')(...args);
export const updateOfflineQueue = (...args) => ensure('updateOfflineQueue')(...args);
export const showToast = (...args) => ensure('showToast')(...args);
export const getAuthStatus = (...args) => ensure('getAuthStatus')(...args);
export const checkAuth = (...args) => ensure('checkAuth')(...args);
export const ensureAccessSession = (...args) => ensure('ensureAccessSession')(...args);
export const getCurrentUserOrRedirect = (...args) => ensure('getCurrentUserOrRedirect')(...args);
export const apiConfig = ensure('apiConfig');

export default {
  apiFetch,
  apiGet,
  apiPost,
  authenticatedFetch,
  fetchVoters,
  fetchTemplates,
  logCall,
  logCanvass,
  getOnlineStatus,
  updateOfflineQueue,
  showToast,
  getAuthStatus,
  checkAuth,
  ensureAccessSession,
  getCurrentUserOrRedirect,
  apiConfig,
};
