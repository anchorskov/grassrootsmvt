/**
 * GrassrootsMVT Service Worker
 * Handles offline caching and background sync for volunteer submissions
 */

const CACHE_NAME = 'grassrootsmvt-v1';
const OFFLINE_URL = '/offline.html';

// Install event - cache essential resources
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Caching essential resources');
      return cache.addAll([
        '/volunteer/',
        '/volunteer/index.html',
        '/volunteer/phone.html',
        '/volunteer/canvass.html',
        '/src/idb.js',
        '/manifest.json',
        '/favicon.svg'
      ].map(url => new Request(url, { cache: 'reload' })));
    }).catch((error) => {
      console.warn('⚠️ Failed to cache some resources:', error);
    })
  );
  
  // Skip waiting to activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker activated');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  // Take control of all pages immediately
  self.clients.claim();
});

// Fetch event - handle offline functionality
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Handle API requests with special offline logic
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleAPIRequest(request));
    return;
  }
  
  // Handle other requests with cache-first strategy
  event.respondWith(
    caches.match(request).then((response) => {
      if (response) {
        return response;
      }
      
      return fetch(request).catch(() => {
        // For navigation requests, return offline page
        if (request.destination === 'document') {
          return caches.match(OFFLINE_URL) || new Response('Offline', { status: 503 });
        }
        
        // For other requests, return generic offline response
        return new Response('Offline', { 
          status: 503, 
          statusText: 'Service Unavailable' 
        });
      });
    })
  );
});

// Background sync event - process offline queue
self.addEventListener('sync', (event) => {
  console.log('🔄 Background sync triggered:', event.tag);
  
  if (event.tag === 'offline-submissions') {
    event.waitUntil(processOfflineQueue());
  }
});

// Message event - handle communication from main thread
self.addEventListener('message', (event) => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'QUEUE_SUBMISSION':
      event.waitUntil(queueSubmission(data));
      break;
    case 'GET_QUEUE_STATUS':
      event.waitUntil(getQueueStatus().then(status => {
        event.ports[0].postMessage(status);
      }));
      break;
    case 'FORCE_SYNC':
      event.waitUntil(processOfflineQueue());
      break;
  }
});

/**
 * Handle API requests with offline fallback
 */
async function handleAPIRequest(request) {
  try {
    // Try to make the request
    const response = await fetch(request);
    
    // If successful, return the response
    if (response.ok) {
      return response;
    }
    
    // If server error, still return the response (let UI handle it)
    return response;
  } catch (error) {
    console.log('🔌 API request failed, network unavailable:', request.url);
    
    // For write operations (POST), queue for later
    if (request.method === 'POST') {
      const requestData = await serializeRequest(request);
      await queueSubmission(requestData);
      
      // Return a response indicating the request was queued
      return new Response(
        JSON.stringify({ 
          ok: false, 
          queued: true, 
          message: 'Request queued for sync when online' 
        }),
        {
          status: 202,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // For read operations (GET), return cached data or error
    return new Response(
      JSON.stringify({ 
        ok: false, 
        offline: true, 
        message: 'Network unavailable' 
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Serialize a request for storage in IndexedDB
 */
async function serializeRequest(request) {
  const url = new URL(request.url);
  const body = request.method === 'POST' ? await request.json() : null;
  
  // Determine request type from URL
  let type = 'unknown';
  if (url.pathname.includes('/api/call')) type = 'call';
  else if (url.pathname.includes('/api/canvass')) type = 'canvass';
  else if (url.pathname.includes('/api/pulse')) type = 'pulse';
  
  return {
    endpoint: url.pathname,
    method: request.method,
    body: body,
    headers: Object.fromEntries(request.headers.entries()),
    type: type,
    url: request.url
  };
}

/**
 * Queue a submission for background sync
 */
async function queueSubmission(requestData) {
  try {
    // Import IDB functions (can't use ES6 imports in service worker)
    const idbModule = await import('/src/idb.js');
    await idbModule.savePending(requestData);
    
    // Register for background sync
    if ('serviceWorker' in self && 'sync' in self.registration) {
      await self.registration.sync.register('offline-submissions');
      console.log('📋 Submission queued for background sync');
    }
    
    // Notify main thread
    notifyClients({
      type: 'SUBMISSION_QUEUED',
      data: { type: requestData.type, endpoint: requestData.endpoint }
    });
  } catch (error) {
    console.error('❌ Failed to queue submission:', error);
  }
}

/**
 * Process all pending submissions in the offline queue
 */
async function processOfflineQueue() {
  try {
    console.log('🔄 Processing offline submission queue...');
    
    // Import IDB functions
    const idbModule = await import('/src/idb.js');
    const pending = await idbModule.getPending();
    
    if (pending.length === 0) {
      console.log('✅ No pending submissions to process');
      return;
    }
    
    console.log(`📤 Processing ${pending.length} pending submissions`);
    let successCount = 0;
    let failCount = 0;
    
    for (const submission of pending) {
      try {
        // Reconstruct the request
        const request = new Request(submission.url, {
          method: submission.method,
          headers: submission.headers,
          body: submission.body ? JSON.stringify(submission.body) : undefined
        });
        
        // Attempt to send the request
        const response = await fetch(request);
        
        if (response.ok) {
          // Success - remove from queue
          await idbModule.clearPending(submission.id);
          successCount++;
          console.log(`✅ Synced ${submission.type} submission:`, submission.id);
        } else {
          // Server error - update retry count
          const newRetryCount = (submission.retries || 0) + 1;
          if (newRetryCount < 5) { // Max 5 retries
            await idbModule.updateRetryCount(submission.id, newRetryCount);
            console.log(`⚠️ Server error for ${submission.type}, retry ${newRetryCount}/5`);
          } else {
            // Max retries reached - remove from queue
            await idbModule.clearPending(submission.id);
            console.log(`❌ Max retries reached for ${submission.type}, removing from queue`);
          }
          failCount++;
        }
      } catch (error) {
        // Network still unavailable - keep in queue
        console.log(`🔌 Network still unavailable for ${submission.type}:`, error.message);
        failCount++;
      }
    }
    
    // Notify main thread of sync results
    notifyClients({
      type: 'SYNC_COMPLETE',
      data: { 
        success: successCount, 
        failed: failCount, 
        remaining: await idbModule.getPendingCount() 
      }
    });
    
    console.log(`🔄 Sync complete: ${successCount} success, ${failCount} failed`);
  } catch (error) {
    console.error('❌ Failed to process offline queue:', error);
  }
}

/**
 * Get current queue status
 */
async function getQueueStatus() {
  try {
    const idbModule = await import('/src/idb.js');
    const counts = await idbModule.getPendingCount();
    return {
      hasPending: counts.total > 0,
      counts: counts
    };
  } catch (error) {
    console.error('❌ Failed to get queue status:', error);
    return { hasPending: false, counts: { total: 0 } };
  }
}

/**
 * Notify all clients of service worker events
 */
function notifyClients(message) {
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage(message);
    });
  });
}