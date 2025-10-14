// ui/src/apiClient.js
// Production-ready API client with Cloudflare Access JWT authentication

(function initializeAuth() {
  'use strict';
  
  const API_BASE = "https://api.grassrootsmvt.org";
  const UI_URL = window.location.href;
  const ACCESS_MARK = "accessReady:v1";
  
  // Start the Access login round trip via top-level navigation
  function startAccessLoginRoundTrip() {
    const here = window.location.href;
    sessionStorage.setItem("access.returnTo", here);
    window.location.assign(`/connecting.html?to=${encodeURIComponent(here)}`);
  }

  // Check if Access session is ready, start login if not
  function ensureAccessSession() {
    if (sessionStorage.getItem(ACCESS_MARK) === "1") return true;
    sessionStorage.setItem(ACCESS_MARK, "1");
    startAccessLoginRoundTrip();
    return false;
  }

  /**
   * Extract JWT token from Cloudflare Access cookie
   * @returns {string|null} JWT token or null if not found
   */
  function extractJWT() {
    try {
      const cookies = document.cookie.split(';').map(c => c.trim());
      const cf = cookies.find(c => c.startsWith('CF_Authorization='));
      return cf ? decodeURIComponent(cf.split('=')[1]) : null;
    } catch (error) {
      console.error('❌ Error extracting JWT token:', error);
      return null;
    }
  }

  /**
   * Check if we're in local development environment
   * @returns {boolean}
   */
  function isLocalDevelopment() {
    return window.location.hostname === 'localhost' || 
           window.location.hostname === '127.0.0.1' ||
           window.location.port;
  }

  // Initialize authentication on page load
  const token = extractJWT();
  if (token) {
    localStorage.setItem('access_token', token);
    console.log('🔐 JWT stored from Cloudflare Access');
  } else if (!isLocalDevelopment()) {
    console.warn('⚠️ No CF_Authorization cookie found');
  }

  /**
   * Global authenticated fetch function
   * @param {string} endpoint - API endpoint (e.g., '/api/ping' or '/ping')
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} JSON response
   */
  window.apiFetch = async function(endpoint, options = {}) {
    // Normalize endpoint to include /api prefix
    let path = endpoint;
    if (!path.startsWith('/api/')) {
      path = path.startsWith('/') ? `/api${path}` : `/api/${path}`;
    }
    
    const fullUrl = `${API_BASE}${path}`;
    console.log('🔐 Authenticated fetch:', fullUrl);

    // Prepare headers
    const headers = { 
      'Content-Type': 'application/json',
      ...(options.headers || {}) 
    };

    // Add authentication
    const jwt = localStorage.getItem('access_token');
    if (jwt) {
      if (isLocalDevelopment()) {
        headers['Authorization'] = `Bearer ${jwt}`;
      } else {
        headers['Cf-Access-Jwt-Assertion'] = jwt;
      }
    }

    // Retry logic with exponential backoff
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(fullUrl, { 
          ...options,
          credentials: "include",
          headers 
        });

        // Handle authentication failures
        if (response.status === 401 || response.status === 403) {
          console.error('❌ Auth failed — redirecting to login.');
          if (!isLocalDevelopment()) {
            window.location.href = '/connecting.html';
          } else {
            throw new Error('Authentication failed in local development');
          }
          return;
        }

        // Handle other HTTP errors
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Parse and return JSON response
        const data = await response.json();
        
        // Show success toast for write operations
        if (options.method === 'POST' && data.ok) {
          showToast('✅ Operation completed successfully!', 'success');
        }
        
        return data;

      } catch (error) {
        // If this is the last attempt, throw the error
        if (attempt === 3) {
          console.error(`❌ All ${attempt} attempts failed:`, error);
          
          // Handle offline scenarios
          if (!navigator.onLine) {
            console.log('📱 Offline detected - attempting to queue request');
            if (options.method === 'POST') {
              await queueOfflineRequest(fullUrl, options);
              showToast('⚠️ Offline mode — queued for sync', 'warning');
              return { ok: false, queued: true, offline: true };
            }
          }
          
          showToast('❌ Request failed - please try again', 'error');
          throw error;
        }

        // Calculate delay for exponential backoff (1s, 2s, 4s)
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.warn(`⚠️ Attempt ${attempt} failed; retrying in ${delay / 1000}s`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  };

  /**
   * Queue request for offline sync
   * @param {string} url - Request URL
   * @param {Object} options - Request options
   */
  async function queueOfflineRequest(url, options) {
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        // Use service worker for background sync
        navigator.serviceWorker.controller.postMessage({
          type: 'QUEUE_SUBMISSION',
          data: {
            url: url,
            method: options.method || 'GET',
            headers: options.headers || {},
            body: options.body || null,
            timestamp: Date.now()
          }
        });
        console.log('📋 Request queued via service worker');
      } else {
        // Fallback: store in localStorage
        const queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
        queue.push({
          url: url,
          method: options.method || 'GET',
          headers: options.headers || {},
          body: options.body || null,
          timestamp: Date.now()
        });
        localStorage.setItem('offline_queue', JSON.stringify(queue));
        console.log('📋 Request queued in localStorage');
      }
    } catch (error) {
      console.error('❌ Failed to queue offline request:', error);
    }
  }

  /**
   * Show toast notification
   * @param {string} msg - Message to display
   * @param {string} type - Type: 'success', 'error', 'warning', 'info'
   */
  window.showToast = function(msg, type = 'info') {
    // Remove existing toast
    const existing = document.getElementById('app-toast');
    if (existing) existing.remove();

    // Create toast element
    const toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = `fixed top-4 right-4 px-4 py-3 rounded-lg shadow-lg z-50 transition-all duration-300 ${getToastStyles(type)}`;
    toast.textContent = msg;
    
    document.body.appendChild(toast);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
      }
    }, 4000);
  };

  /**
   * Get toast styles based on type
   * @param {string} type - Toast type
   * @returns {string} CSS classes
   */
  function getToastStyles(type) {
    switch (type) {
      case 'success': return 'bg-green-500 text-white';
      case 'error': return 'bg-red-500 text-white';
      case 'warning': return 'bg-yellow-500 text-black';
      case 'info': return 'bg-blue-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  }

  /**
   * Get current authentication status
   * @returns {Object} Authentication status information
   */
  window.getAuthStatus = function() {
    const token = localStorage.getItem('access_token');
    return {
      isAuthenticated: !!token,
      isLocalDev: isLocalDevelopment(),
      tokenPresent: !!token,
      authType: isLocalDevelopment() ? 'Bearer Token' : 'Cloudflare Access JWT'
    };
  };

  /**
   * Check authentication and show status
   */
  window.checkAuth = async function() {
    const status = window.getAuthStatus();
    console.log("🔐 Auth Status:", status);
    
    if (status.isAuthenticated) {
      try {
        const result = await window.apiFetch('/whoami');
        console.log("✅ Authenticated as:", result.email || result.user || 'Unknown user');
        return true;
      } catch (err) {
        console.error("❌ Authentication check failed:", err);
        return false;
      }
    } else {
      console.warn("⚠️ No authentication token found");
      return false;
    }
  };

  // Initialize authentication status display on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAuthStatus);
  } else {
    initializeAuthStatus();
  }

  function initializeAuthStatus() {
    // Check if Access session is ready
    const hasAccess = sessionStorage.getItem(ACCESS_MARK) === "1";
    if (!hasAccess) {
      window.location.href = "/connecting.html"; // prettier UX; this page triggers the round trip
      return;
    }
    
    // Safe to start app; Access cookie is set for api.grassrootsmvt.org
    const token = localStorage.getItem('access_token');
    console.log("🔐 Access token present:", !!token);
    
    if (token) {
      showToast('🔄 Authenticating...', 'info');
      
      // Verify authentication
      window.apiFetch('/ping')
        .then(result => {
          if (result.ok) {
            showToast('✅ Authenticated successfully!', 'success');
          }
        })
        .catch(err => {
          console.error("❌ Authentication verification failed:", err);
          showToast('⚠️ Authentication verification failed', 'warning');
        });
    } else {
      console.log("🔐 Access session ready, no stored token");
    }
  }

  // Listen for online/offline events
  window.addEventListener('online', () => {
    console.log('🌐 Connection restored');
    showToast('🔄 Reconnecting...', 'info');
    
    // Process offline queue if any
    processOfflineQueue();
  });

  window.addEventListener('offline', () => {
    console.log('📱 Connection lost');
    showToast('📱 Offline mode - submissions will be queued', 'warning');
  });

  /**
   * Process queued offline requests when coming back online
   */
  async function processOfflineQueue() {
    try {
      const queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
      if (queue.length === 0) return;

      console.log(`🔄 Processing ${queue.length} queued requests...`);
      
      let processed = 0;
      for (const request of queue) {
        try {
          await fetch(request.url, {
            method: request.method,
            headers: request.headers,
            body: request.body,
            credentials: "include"
          });
          processed++;
        } catch (error) {
          console.error('❌ Failed to process queued request:', error);
        }
      }

      // Clear the queue
      localStorage.removeItem('offline_queue');
      
      if (processed > 0) {
        showToast(`✅ ${processed} queued submissions synced!`, 'success');
      }
    } catch (error) {
      console.error('❌ Error processing offline queue:', error);
    }
  }

  // Expose utility functions globally
  window.apiConfig = {
    baseUrl: API_BASE,
    isLocal: isLocalDevelopment(),
    version: '2.0.0'
  };

  // Expose Access functions for connecting page
  window.startAccessLoginRoundTrip = startAccessLoginRoundTrip;
  window.ensureAccessSession = ensureAccessSession;

  console.log('🔐 API Client initialized successfully');
  console.log('🌐 Base URL:', API_BASE);
  console.log('🔧 Local Development:', isLocalDevelopment());

})();
