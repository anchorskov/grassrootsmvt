/**
 * IndexedDB Helper for GrassrootsMVT Offline Submissions
 * Handles storage and retrieval of failed API requests for background sync
 */

const DB_NAME = 'grassrootsmvt-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending';

/**
 * Open IndexedDB database
 * @returns {Promise<IDBDatabase>}
 */
export async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create object store for pending requests
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { 
          keyPath: 'id', 
          autoIncrement: true 
        });
        
        // Add indexes for efficient querying
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('endpoint', 'endpoint', { unique: false });
        store.createIndex('type', 'type', { unique: false });
      }
    };
    
    request.onsuccess = (event) => {
      resolve(event.target.result);
    };
    
    request.onerror = (event) => {
      reject(new Error(`IndexedDB error: ${event.target.error}`));
    };
  });
}

/**
 * Save a failed request to the offline queue
 * @param {Object} requestData - The request data to store
 * @param {string} requestData.endpoint - API endpoint (e.g., '/api/call')
 * @param {string} requestData.method - HTTP method
 * @param {Object} requestData.body - Request payload
 * @param {Object} requestData.headers - Request headers
 * @param {string} requestData.type - Request type ('call', 'canvass', 'pulse')
 * @returns {Promise<number>} The ID of the stored request
 */
export async function savePending(requestData) {
  const db = await openDB();
  
  const pendingRequest = {
    ...requestData,
    timestamp: Date.now(),
    retries: 0,
    lastAttempt: null
  };
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(pendingRequest);
    
    request.onsuccess = () => {
      console.log('📦 Offline request saved:', requestData.type, requestData.endpoint);
      resolve(request.result);
    };
    
    request.onerror = () => {
      reject(new Error(`Failed to save pending request: ${request.error}`));
    };
  });
}

/**
 * Get all pending requests from the offline queue
 * @returns {Promise<Array>} Array of pending requests
 */
export async function getPending() {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    
    request.onsuccess = () => {
      resolve(request.result || []);
    };
    
    request.onerror = () => {
      reject(new Error(`Failed to get pending requests: ${request.error}`));
    };
  });
}

/**
 * Remove a successfully synced request from the offline queue
 * @param {number} id - The ID of the request to remove
 * @returns {Promise<void>}
 */
export async function clearPending(id) {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    
    request.onsuccess = () => {
      console.log('✅ Pending request cleared:', id);
      resolve();
    };
    
    request.onerror = () => {
      reject(new Error(`Failed to clear pending request: ${request.error}`));
    };
  });
}

/**
 * Update retry count for a failed sync attempt
 * @param {number} id - The ID of the request
 * @param {number} retryCount - New retry count
 * @returns {Promise<void>}
 */
export async function updateRetryCount(id, retryCount) {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getRequest = store.get(id);
    
    getRequest.onsuccess = () => {
      const data = getRequest.result;
      if (data) {
        data.retries = retryCount;
        data.lastAttempt = Date.now();
        
        const updateRequest = store.put(data);
        updateRequest.onsuccess = () => resolve();
        updateRequest.onerror = () => reject(new Error(`Failed to update retry count: ${updateRequest.error}`));
      } else {
        resolve(); // Request not found, possibly already cleared
      }
    };
    
    getRequest.onerror = () => {
      reject(new Error(`Failed to get request for retry update: ${getRequest.error}`));
    };
  });
}

/**
 * Get count of pending requests by type
 * @returns {Promise<Object>} Object with counts by request type
 */
export async function getPendingCount() {
  const pending = await getPending();
  const counts = {
    call: 0,
    canvass: 0,
    pulse: 0,
    total: pending.length
  };
  
  pending.forEach(request => {
    if (counts.hasOwnProperty(request.type)) {
      counts[request.type]++;
    }
  });
  
  return counts;
}

/**
 * Clear all pending requests (for debugging/reset)
 * @returns {Promise<void>}
 */
export async function clearAllPending() {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();
    
    request.onsuccess = () => {
      console.log('🗑️ All pending requests cleared');
      resolve();
    };
    
    request.onerror = () => {
      reject(new Error(`Failed to clear all pending requests: ${request.error}`));
    };
  });
}

/**
 * Check if IndexedDB is supported
 * @returns {boolean}
 */
export function isIndexedDBSupported() {
  return 'indexedDB' in window;
}

/**
 * Initialize the database (call this on app startup)
 * @returns {Promise<boolean>} True if successfully initialized
 */
export async function initDB() {
  try {
    if (!isIndexedDBSupported()) {
      console.warn('⚠️ IndexedDB not supported, offline functionality disabled');
      return false;
    }
    
    await openDB();
    console.log('✅ IndexedDB initialized for offline submissions');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize IndexedDB:', error);
    return false;
  }
}