// ui/src/apiClient.js
// Unified API client with JWT authentication, offline resilience and production-ready error handling

import { savePending, initDB, isIndexedDBSupported } from './idb.js';

const LOCAL_API = "http://localhost:8787";
const PROD_API = "https://api.grassrootsmvt.org";
const API_BASE =
  window.location.hostname === "localhost" ? LOCAL_API : PROD_API;

// Authentication and online state tracking
let isOnline = navigator.onLine;
let isDBInitialized = false;
let authRetryCount = 0;
const MAX_AUTH_RETRIES = 3;

/**
 * Extract JWT token from Cloudflare Access cookie
 * @returns {string|null} JWT token or null if not found
 */
function getJWTToken() {
  try {
    const cookies = document.cookie.split(';');
    const cfAuth = cookies.find(cookie => 
      cookie.trim().startsWith('CF_Authorization=')
    );
    
    if (cfAuth) {
      const token = decodeURIComponent(cfAuth.split('=')[1]);
      console.log('🔑 JWT token found');
      return token;
    }
    
    console.warn('⚠️ No CF_Authorization cookie found');
    return null;
  } catch (error) {
    console.error('❌ Error extracting JWT token:', error);
    return null;
  }
}

/**
 * Check if we're in a local development environment
 * @returns {boolean}
 */
function isLocalDevelopment() {
  return window.location.hostname === 'localhost' || 
         window.location.hostname === '127.0.0.1' ||
         window.location.port;
}

/**
 * Redirect to Cloudflare Access login
 */
function redirectToLogin() {
  if (isLocalDevelopment()) {
    console.warn('🔧 Local development - skipping authentication redirect');
    return;
  }
  
  console.log('🔐 Redirecting to Cloudflare Access login...');
  window.location.href = '/cdn-cgi/access/login';
}

/**
 * Authenticated fetch wrapper with JWT handling
 * @param {string} url - Request URL
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>}
 */
export async function authenticatedFetch(url, options = {}) {
  // In local development, use the existing token-based auth
  if (isLocalDevelopment()) {
    const token = localStorage.getItem("access_token");
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    };
    
    try {
      const response = await fetch(url, { ...options, headers });
      return response;
    } catch (error) {
      console.error('❌ Local development fetch failed:', error);
      throw error;
    }
  }

  // Production: Use Cloudflare Access JWT
  const jwtToken = getJWTToken();
  
  if (!jwtToken && authRetryCount < MAX_AUTH_RETRIES) {
    authRetryCount++;
    console.log(`🔄 JWT token missing, retry ${authRetryCount}/${MAX_AUTH_RETRIES}`);
    
    // Brief delay before retry
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (authRetryCount >= MAX_AUTH_RETRIES) {
      redirectToLogin();
      throw new Error('Authentication failed - redirecting to login');
    }
    
    return authenticatedFetch(url, options);
  }
  
  if (!jwtToken) {
    redirectToLogin();
    throw new Error('No authentication token available');
  }

  const headers = {
    'Content-Type': 'application/json',
    'Cf-Access-Jwt-Assertion': jwtToken,
    ...(options.headers || {}),
  };

  try {
    const response = await fetch(url, { ...options, headers });
    
    // Reset auth retry count on successful request
    if (response.ok) {
      authRetryCount = 0;
    }
    
    // Handle authentication errors
    if (response.status === 401 || response.status === 403) {
      console.warn('🚫 Authentication failed, redirecting to login');
      redirectToLogin();
      throw new Error('Authentication failed');
    }
    
    return response;
  } catch (error) {
    console.error('❌ Authenticated fetch failed:', error);
    throw error;
  }
}

/**
 * Retryable API call with exponential backoff
 * @param {string} url - Request URL
 * @param {Object} options - Fetch options
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<Response>}
 */
export async function retryableAPICall(url, options = {}, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await authenticatedFetch(url, options);
      
      if (response.ok) {
        return response;
      }
      
      // Don't retry on authentication errors
      if (response.status === 401 || response.status === 403) {
        throw new Error('Authentication failed');
      }
      
      // Don't retry on client errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`Client error: ${response.status}`);
      }
      
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1;
      
      if (isLastAttempt) {
        console.error('❌ All retry attempts failed:', error);
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delayMs = 1000 * Math.pow(2, attempt);
      console.log(`⏳ Retry ${attempt + 1}/${maxRetries} in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Show toast notification to user
 * @param {string} message - Message to display
 * @param {string} type - Type: 'success', 'error', 'warning', 'info'
 * @param {number} duration - Duration in milliseconds
 */
export function showToast(message, type = 'info', duration = 3000) {
  // Remove existing toast
  const existingToast = document.getElementById('api-toast');
  if (existingToast) {
    existingToast.remove();
  }
  
  // Create toast element
  const toast = document.createElement('div');
  toast.id = 'api-toast';
  toast.className = `fixed top-4 right-4 px-4 py-3 rounded-lg shadow-lg z-50 transition-all duration-300 ${getToastClasses(type)}`;
  
  // Add icon based on type
  const icon = getToastIcon(type);
  toast.innerHTML = `<div class="flex items-center space-x-2"><span>${icon}</span><span>${message}</span></div>`;
  
  document.body.appendChild(toast);
  
  // Auto-remove after duration
  setTimeout(() => {
    if (toast && toast.parentNode) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }
  }, duration);
}

function getToastClasses(type) {
  switch (type) {
    case 'success': return 'bg-green-500 text-white';
    case 'error': return 'bg-red-500 text-white';
    case 'warning': return 'bg-yellow-500 text-white';
    case 'info': return 'bg-blue-500 text-white';
    default: return 'bg-gray-500 text-white';
  }
}

function getToastIcon(type) {
  switch (type) {
    case 'success': return '✅';
    case 'error': return '❌';
    case 'warning': return '⚠️';
    case 'info': return 'ℹ️';
    default: return '📢';
  }
}

// Initialize offline capabilities
document.addEventListener('DOMContentLoaded', async () => {
  isDBInitialized = await initDB();
  updateOnlineStatus();
  
  // Listen for online/offline events
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  // Listen for service worker messages
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
  }
  
  // Show authentication status
  displayAuthStatus();
});

/**
 * Display authentication status in UI
 */
function displayAuthStatus() {
  if (isLocalDevelopment()) {
    console.log('🔧 Local development mode - using token auth');
    return;
  }
  
  const token = getJWTToken();
  if (token) {
    console.log('✅ Authenticated with Cloudflare Access');
    showToast('Authenticated successfully', 'success', 2000);
  } else {
    console.warn('⚠️ No authentication token found');
  }
}

/**
 * Handle online event
 */
function handleOnline() {
  console.log('🌐 Connection restored');
  isOnline = true;
  updateOnlineStatus();
  showToast('Connection restored - syncing data...', 'success');
  
  // Trigger background sync if service worker is available
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'FORCE_SYNC' });
  }
  
  // Dispatch custom event for UI updates
  window.dispatchEvent(new CustomEvent('connection-restored'));
}

/**
 * Handle offline event
 */
function handleOffline() {
  console.log('🔌 Connection lost');
  isOnline = false;
  updateOnlineStatus();
  showToast('You are offline - submissions will be queued', 'warning', 5000);
  
  // Dispatch custom event for UI updates
  window.dispatchEvent(new CustomEvent('connection-lost'));
}

/**
 * Update online status indicators
 */
function updateOnlineStatus() {
  const indicators = document.querySelectorAll('.online-indicator');
  indicators.forEach(indicator => {
    indicator.textContent = isOnline ? '🌐 Online' : '🔌 Offline';
    indicator.className = `online-indicator ${isOnline ? 'text-green-600' : 'text-red-600'}`;
  });
  
  // Update body class for offline styling
  if (isOnline) {
    document.body.classList.remove('offline-mode');
  } else {
    document.body.classList.add('offline-mode');
  }
}

/**
 * Handle messages from service worker
 */
function handleServiceWorkerMessage(event) {
  const { type, data } = event.data;
  
  switch (type) {
    case 'SUBMISSION_QUEUED':
      console.log('📋 Submission queued:', data.type);
      showToast(`${data.type} submission saved for sync`, 'warning');
      break;
    case 'SYNC_COMPLETE':
      console.log('🔄 Sync complete:', data);
      if (data.success > 0) {
        showToast(`${data.success} submissions synced successfully`, 'success');
      }
      updateQueueStatus();
      break;
  }
}

/**
 * Update queue status display
 */
async function updateQueueStatus() {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    const messageChannel = new MessageChannel();
    
    messageChannel.port1.onmessage = (event) => {
      const status = event.data;
      const queueIndicators = document.querySelectorAll('.queue-indicator');
      
      queueIndicators.forEach(indicator => {
        if (status.hasPending) {
          indicator.textContent = `📋 ${status.counts.total} pending`;
          indicator.className = 'queue-indicator text-yellow-600';
          indicator.style.display = 'block';
        } else {
          indicator.style.display = 'none';
        }
      });
    };
    
    navigator.serviceWorker.controller.postMessage(
      { type: 'GET_QUEUE_STATUS' },
      [messageChannel.port2]
    );
  }
}

/**
 * Enhanced API fetch wrapper with offline support
 */
export async function apiFetch(path, options = {}) {
  // prevent accidental double "/api/api/"
  const cleanPath = path.startsWith("/api/") ? path : `/api${path}`;
  const fullUrl = `${API_BASE}${cleanPath}`;

  try {
    const response = await retryableAPICall(fullUrl, options);
    
    // Handle successful response
    if (response.status === 202 && response.headers.get('content-type')?.includes('application/json')) {
      const data = await response.json();
      if (data.queued) {
        // Request was queued by service worker
        showToast('Request saved for sync when online', 'warning');
        updateQueueStatus();
        return data;
      }
    }
    
    const text = await response.text();

    try {
      const jsonData = JSON.parse(text || "{}");
      
      // Show success toast for successful operations
      if (jsonData.ok && options.method === 'POST') {
        showToast('Data saved successfully', 'success');
      }
      
      return jsonData;
    } catch {
      return { ok: false, error: "invalid_json", body: text };
    }
  } catch (err) {
    console.error("❌ API fetch failed:", err.message);
    
    // If it's a POST request and we're offline, try to queue it
    if (options.method === 'POST' && !isOnline && isDBInitialized) {
      try {
        const requestData = {
          endpoint: cleanPath,
          method: options.method,
          body: options.body ? JSON.parse(options.body) : null,
          headers: options.headers || {},
          type: getRequestType(cleanPath),
          url: fullUrl
        };
        
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'QUEUE_SUBMISSION',
            data: requestData
          });
        } else {
          // Fallback: save directly to IndexedDB
          await savePending(requestData);
          showToast('Request saved for sync when online', 'warning');
        }
        
        return { 
          ok: false, 
          queued: true, 
          offline: true,
          message: 'Request queued for sync when online' 
        };
      } catch (queueError) {
        console.error('❌ Failed to queue request:', queueError);
        showToast('Failed to save request for later sync', 'error');
      }
    }
    
    // Show error toast for network failures
    showToast(
      isOnline ? 'Network error - please try again' : 'Offline - request queued for sync',
      'error'
    );
    
    return { ok: false, error: err.message, offline: !isOnline };
  }
}

/**
 * Determine request type from endpoint
 */
function getRequestType(endpoint) {
  if (endpoint.includes('/call')) return 'call';
  if (endpoint.includes('/canvass')) return 'canvass';
  if (endpoint.includes('/pulse')) return 'pulse';
  return 'unknown';
}

/**
 * Voter retrieval with authentication and error handling
 */
export async function fetchVoters(params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const path = queryString ? `/voters?${queryString}` : '/voters';
  return apiFetch(path);
}

/**
 * Log a volunteer call with offline support and authentication
 */
export async function logCall(voter_id, call_result, notes = "", pulse_opt_in = false, pitch_used = "") {
  const payload = { 
    voter_id, 
    call_result, 
    notes,
    ...(pulse_opt_in && { pulse_opt_in: true }),
    ...(pitch_used && { pitch_used })
  };
  
  return apiFetch("/call", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Log canvassing activity with offline support and authentication
 */
export async function logCanvass(voter_id, result, notes = "", pulse_opt_in = false, pitch_used = "", location = null, door_status = "Knocked") {
  const payload = { 
    voter_id, 
    result, 
    notes,
    door_status,
    ...(pulse_opt_in && { pulse_opt_in: true }),
    ...(pitch_used && { pitch_used }),
    ...(location && { 
      location_lat: location.lat, 
      location_lng: location.lng 
    })
  };
  
  return apiFetch("/canvass", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Log pulse opt-in with offline support and authentication
 */
export async function logPulseOptIn(voter_id, contact_method = "sms", consent_source = "canvass") {
  return apiFetch("/pulse", {
    method: "POST",
    body: JSON.stringify({ voter_id, contact_method, consent_source }),
  });
}

/**
 * Fetch message templates with authentication
 */
export async function fetchTemplates(category = null) {
  const path = category ? `/templates?category=${category}` : '/templates';
  return apiFetch(path);
}

/**
 * Retrieve volunteer call history with authentication
 */
export async function fetchActivity() {
  return apiFetch("/activity");
}

/**
 * Check who is logged in with authentication
 */
export async function whoAmI() {
  return apiFetch("/whoami");
}

/**
 * Health check with authentication
 */
export async function ping() {
  return apiFetch("/ping");
}

/**
 * Get current online status
 */
export function getOnlineStatus() {
  return isOnline;
}

/**
 * Force queue status update
 */
export function updateOfflineQueue() {
  updateQueueStatus();
}

/**
 * Get authentication status
 */
export function getAuthStatus() {
  return {
    isLocalDev: isLocalDevelopment(),
    hasToken: isLocalDevelopment() ? 
      !!localStorage.getItem("access_token") : 
      !!getJWTToken(),
    authType: isLocalDevelopment() ? 'Bearer Token' : 'Cloudflare Access'
  };
}

export function showApiConfig() {
  const authStatus = getAuthStatus();
  console.info("🌐 API_BASE =", API_BASE);
  console.info("🔌 Online =", isOnline);
  console.info("💾 IndexedDB =", isDBInitialized);
  console.info("🔐 Auth Status =", authStatus);
}
