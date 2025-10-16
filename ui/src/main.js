// Main application initialization
import { apiFetch, getCurrentUserOrRedirect } from './apiClient.js';

// Initialize authentication on page load
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 GrassrootsMVT initializing...');
  
  // Unified auth handled by getCurrentUserOrRedirect when needed
  console.log('✅ App ready - authentication handled per API call');
  
  // Example: Test API access
  try {
    const response = await apiFetch('/api/ping');
    const data = await response.json();
    console.log('📡 API test successful:', data);
  } catch (error) {
    console.warn('⚠️ API test failed:', error);
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