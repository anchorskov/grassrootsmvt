// ui/config/environments.js
// Same-origin builder for API URLs (except localhost override)

const isBrowser = typeof location !== 'undefined';
const isLocalHost = (h) => /^(localhost|127\.0\.0\.1|192\.168\.)/.test(h || '');
const isLocal = isBrowser && isLocalHost(location.hostname);

// Optional local override via localStorage on localhost only
const stored = isLocal ? (localStorage.getItem('GRMVT_API_BASE') || '') : '';
const apiBaseOverride = (isLocal && /^https?:\/\//.test(stored)) ? stored : null;

// ✅ KEY: same-origin in prod, override only on localhost
const baseOrigin = apiBaseOverride || (isBrowser ? location.origin : 'https://volunteers.grassrootsmvt.org');

const map = {
  ping: '/api/ping',
  whoami: '/api/whoami',
  metadata: '/api/metadata',
  voters: '/api/voters',
  neighborhoods: '/api/neighborhoods',
  call: '/api/call',
  'contact-staging': '/api/contact-staging',
  'contact/status': '/api/contact/status',
  streets: '/api/streets',
  'canvass/nearby': '/api/canvass/nearby',
  'auth/finish': '/api/auth/finish'
};

function normalizePath(endpoint) {
  if (!endpoint) return '/api/';
  if (map[endpoint]) return map[endpoint];
  const clean = String(endpoint).replace(/^\/?(api\/)?/, '');
  return `/api/${clean}`;
}

export function getApiUrl(endpoint, params = {}) {
  const url = new URL(normalizePath(endpoint), baseOrigin);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });
  return url.toString();
}

export function shouldBypassAuth() { return !!isLocal; }
export function debug(msg, data){ if(isLocal) console.log('[ENV]', msg, data ?? ''); }
export const config = { environment: isLocal ? 'local' : 'production', isLocal };

const env = { getApiUrl, shouldBypassAuth, debug, config };
export default env;

if (typeof window !== 'undefined') window.environmentConfig = env;