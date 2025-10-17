/**
 * GrassrootsMVT environment helper (ES module + browser globals)
 * - No hardcoded origins in code paths
 * - Local override via localStorage.GRMVT_API_BASE (dev only)
 * - Same API URL rules used by call/canvass
 */

const isLocalHost = (h) => /^(localhost|127\.0\.0\.1|192\.168\.)/.test(h || '');
const isLocal = typeof location !== 'undefined' ? isLocalHost(location.hostname) : false;
// Optional local override honored only on localhost
const stored = isLocal ? (localStorage.getItem('GRMVT_API_BASE') || '') : '';
const apiBaseOverride = (isLocal && /^https?:\/\//.test(stored)) ? stored : null;
// Always build API URLs relative to the current origin in prod; in dev allow override
const baseOrigin = apiBaseOverride || (typeof location !== 'undefined' ? location.origin : '');

// Minimal endpoint map for convenience (still accepts raw paths like "canvass/nearby")
const map = {
  ping: '/api/ping',
  voters: '/api/voters',
  neighborhoods: '/api/neighborhoods',
  log: '/api/log',
  call: '/api/call',
  whoami: '/api/whoami',
  metadata: '/api/metadata',
  'contact-staging': '/api/contact-staging',
  'contact/status': '/api/contact/status',
  streets: '/api/streets',
  'canvass/nearby': '/api/canvass/nearby'
};

function normalizePath(endpoint) {
  if (!endpoint) return '/api/';
  // Allow callers to pass "streets" or "/api/streets" or "api/streets"
  if (map[endpoint]) return map[endpoint];
  const clean = String(endpoint).replace(/^\/?(api\/)?/, '');
  return `/api/${clean}`;
}

export function getApiUrl(endpoint, params = {}) {
  const path = normalizePath(endpoint);
  const url = new URL(path, baseOrigin || 'http://localhost');
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });
  return url.toString();
}

export function shouldBypassAuth() {
  // In dev (localhost), we bypass Cloudflare Access redirects
  return !!isLocal;
}

export function debug(message, data) {
  if (isLocal) console.log('[ENV]', message, data ?? '');
}

export const config = {
  environment: isLocal ? 'local' : 'production',
  isLocal,
  isProduction: !isLocal
};

// Default export (for `import env from '/config/environments.js'`)
const environmentConfig = { getApiUrl, shouldBypassAuth, debug, config };
export default environmentConfig;

// Browser globals + legacy shim for older pages
if (typeof window !== 'undefined') {
  window.environmentConfig = environmentConfig;
  // Legacy shim so old code doesn't crash:
  // - getApiBaseUrl(): returns origin used to build API URLs
  // - getApiUrl(): accepts either endpoint keys or raw paths
  // - getEnvironmentInfo(): returns { environment, isLocal }
  window.GrassrootsEnv = window.GrassrootsEnv || {
    shouldBypassAuth: () => shouldBypassAuth(),
    getApiBaseUrl: () => {
      try { return new URL(getApiUrl('ping')).origin; } catch { return baseOrigin || location.origin; }
    },
    getApiUrl: (endpointOrPath, params = {}) => {
      const p = String(endpointOrPath || '').replace(/^\/?(api\/)?/, '');
      return getApiUrl(p, params);
    },
    getEnvironmentInfo: () => ({ ...config }),
    isLocal: isLocal
  };
}