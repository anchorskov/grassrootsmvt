// Main application initialization
import { initializeAuthStatus, apiFetch } from './apiClient.js';

// Initialize authentication on page load
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 GrassrootsMVT initializing...');
  
  // This will check auth status and redirect to protected API endpoint if needed
  const isAuthenticated = await initializeAuthStatus();
  
  if (isAuthenticated) {
    console.log('✅ Authentication verified, app ready');
    
    // Example: Test API access
    try {
      const response = await apiFetch('/api/ping');
      const data = await response.json();
      console.log('📡 API test successful:', data);
    } catch (error) {
      console.warn('⚠️ API test failed:', error);
    }
  }
});

// Example usage for other parts of your app:
export async function loadVoters() {
  const response = await apiFetch('/api/voters?city=Denver');
  return response.json();
}

export async function getProfile() {
  const response = await apiFetch('/api/whoami');
  return response.json();
}