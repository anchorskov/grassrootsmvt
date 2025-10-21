// ui/src/apiClient.js
// Unified API client for GrassrootsMVT
// Handles credentials, dev bypass, Access redirects, and consistent JSON parsing

import * as env from '../config/environments.js'; // keep ESM consistency
const { getApiUrl, shouldBypassAuth } = env;

/**
 * Generic fetch wrapper with proper credentials and error normalization.
 */
export async function apiFetch(endpoint, options = {}) {
  const url = getApiUrl(endpoint, options.params);
  const creds = shouldBypassAuth() ? 'omit' : 'include';

  const res = await fetch(url, {
    method: options.method || 'GET',
    credentials: creds,
    headers: {
      Accept: 'application/json',
      ...(options.json ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    },
    body: options.json ? JSON.stringify(options.json) : options.body
  });

  // Handle Access re-auth in production
  if ((res.status === 401 || res.status === 403) && !shouldBypassAuth()) {
    const finish = encodeURIComponent('/api/auth/finish?to=' + location.href);
    window.location.href = getApiUrl('ping', { finish });
    return new Promise(() => {}); // suspend navigation
  }

  // Return JSON or text fallback
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/**
 * Convenience POST shortcut.
 */
export async function apiPost(endpoint, data) {
  return apiFetch(endpoint, { method: 'POST', json: data });
}

/**
 * Retrieve current authenticated (or dev) user.
 */
export async function whoami() {
  const res = await apiFetch('whoami');
  return res?.user || null;
}

/**
 * Dev-safe bootstrap: ensure Access cookie or bypass for local.
 */
export async function kickAccessThenWhoami() {
  const apiBase = getApiUrl('').replace(/\/$/, '');
  const isLocal = apiBase.includes('localhost') || apiBase.includes('127.0.0.1');

  // Bypass Cloudflare Access when local
  if (isLocal || shouldBypassAuth()) {
    console.log('🧩 Dev mode: skipping Access redirect');
    return whoami();
  }

  try {
    const finish = encodeURIComponent('/api/auth/finish?to=' + location.href);
    await fetch(`${apiBase}/ping?finish=${finish}`, { credentials: 'include' });
  } catch (e) {
    console.warn('⚠️ Access kick failed:', e);
  }

  return whoami();
}

// Default export for legacy imports
export default {
  apiFetch,
  apiPost,
  whoami,
  kickAccessThenWhoami
};
