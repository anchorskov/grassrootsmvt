(() => {
  // Never hardcode an origin. Always use same-origin via environmentConfig.
  const OFFLINE_QUEUE_KEY = 'grassrootsmvt:offline-queue';
  const isBrowser = typeof window !== 'undefined';

  if (!isBrowser) {
    throw new Error('apiClient.js must run in a browser context');
  }

  const ensureEnvironmentConfig = () => {
    if (!window.environmentConfig || typeof window.environmentConfig.getApiUrl !== 'function') {
      const isLocal = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
      window.environmentConfig = {
        shouldBypassAuth() {
          return isLocal;
        },
        getApiUrl(endpoint = '', params = {}) {
          const endpointMap = {
            ping: '/api/ping',
            voters: '/api/voters',
            neighborhoods: '/api/neighborhoods',
            log: '/api/log',
            call: '/api/call',
            whoami: '/api/whoami',
          };
          const raw = String(endpoint ?? '');
          const normalizedKey = raw.replace(/^\/?api\/?/, '');
          const mapped =
            endpointMap[normalizedKey] ||
            endpointMap[raw] ||
            (raw.startsWith('/') ? raw : `/api/${normalizedKey}`);
          const endpointPath = mapped.startsWith('/') ? mapped : `/${mapped}`;
          const search = new URLSearchParams(params);
          return `${endpointPath}${search.toString() ? `?${search}` : ''}`;
        },
        debug() {},
        config: {
          environment: isLocal ? 'local' : 'production',
          isLocal,
        },
      };
    }
    return window.environmentConfig;
  };

  function kickToAccess(returnToUrl) {
    const to = encodeURIComponent(returnToUrl || window.location.href);
    window.location.assign(`/api/whoami?nav=1&to=${to}`);
  }

  const isStructuredBody = value =>
    value &&
    typeof value === 'object' &&
    !(value instanceof FormData) &&
    !(value instanceof Blob) &&
    !(value instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(value);

  const normalizeEndpoint = input => {
    if (!input) return '';
    const value = typeof input === 'string' ? input : String(input);
    if (/^https?:\/\//i.test(value)) {
      const url = new URL(value, window.location.href);
      if (url.origin !== window.location.origin) {
        throw new Error(`Cross-origin requests are not allowed: ${url.origin}`);
      }
      const cleaned = `${url.pathname}${url.search}${url.hash}`;
      return cleaned.replace(/^\/?api\/?/, '').replace(/^\/+/, '');
    }
    return value.replace(/^\/?api\/?/, '');
  };

  const buildApiUrl = (endpoint, params) => {
    const env = ensureEnvironmentConfig();
    return env.getApiUrl(normalizeEndpoint(endpoint), params);
  };

  const withAuthHeaders = async (init = {}) => {
    const options = { credentials: 'include', ...init };
    const headers = new Headers(options.headers || {});
    if (isStructuredBody(options.body)) {
      if (!headers.has('content-type')) {
        headers.set('content-type', 'application/json');
      }
      options.body = JSON.stringify(options.body);
    }
    options.headers = headers;
    return options;
  };

  const parseJson = async response => {
    const text = await response.text().catch(() => '');
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      const error = new Error(`Invalid JSON response (${response.status})`);
      error.status = response.status;
      error.body = text;
      throw error;
    }
  };

  const apiFetch = async (endpoint, init = {}) => {
    const { params, ...rest } = init || {};
    const url = buildApiUrl(endpoint, params);
    return fetch(url, await withAuthHeaders(rest));
  };

  const apiGet = async (path, params) => {
    const url = buildApiUrl(path, params);
    const res = await fetch(url, await withAuthHeaders({ method: 'GET' }));
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`GET ${path} ${res.status}`);
      err.status = res.status;
      err.body = text;
      throw err;
    }
    return res.json();
  };

  const apiPost = async (path, body, init = {}) => {
    const url = buildApiUrl(path);
    const res = await fetch(
      url,
      await withAuthHeaders({
        ...init,
        method: 'POST',
        body: JSON.stringify(body || {}),
      })
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`POST ${path} ${res.status}`);
      err.status = res.status;
      err.body = text;
      throw err;
    }
    return res.json();
  };

  const showToast = (message, type = 'info', duration = 4000) => {
    if (!message) return;
    const existing = document.getElementById('app-toast');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.id = 'app-toast';
    container.textContent = message;
    container.className = [
      'fixed',
      'top-4',
      'right-4',
      'px-4',
      'py-3',
      'rounded-lg',
      'shadow-lg',
      'z-50',
      'transition-all',
      'duration-300',
      type === 'success'
        ? 'bg-green-500 text-white'
        : type === 'error'
          ? 'bg-red-500 text-white'
          : type === 'warning'
            ? 'bg-yellow-400 text-black'
            : 'bg-blue-500 text-white',
    ].join(' ');

    document.body.appendChild(container);
    setTimeout(() => {
      container.style.opacity = '0';
      container.style.transform = 'translateX(120%)';
      setTimeout(() => container.remove(), 300);
    }, duration);
  };

  const readOfflineQueue = () => {
    try {
      const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const writeOfflineQueue = queue => {
    try {
      if (!queue || !queue.length) {
        localStorage.removeItem(OFFLINE_QUEUE_KEY);
      } else {
        localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
      }
    } catch {
      // ignore storage errors (e.g., private mode)
    }
  };

  const queueRequest = entry => {
    const queue = readOfflineQueue();
    queue.push({ ...entry, queued_at: Date.now() });
    writeOfflineQueue(queue);
    return { ok: false, queued: true, offline: true };
  };

  const flushOfflineQueue = async () => {
    if (!navigator.onLine) return { flushed: 0, remaining: readOfflineQueue().length };
    const queue = readOfflineQueue();
    if (!queue.length) return { flushed: 0, remaining: 0 };

    let flushed = 0;
    const remaining = [];
    for (const entry of queue) {
      try {
        const response = await apiFetch(entry.endpoint, entry.init);
        if (!response.ok) {
          remaining.push(entry);
          continue;
        }
        flushed += 1;
      } catch {
        remaining.push(entry);
      }
    }
    writeOfflineQueue(remaining);
    return { flushed, remaining: remaining.length };
  };

  const authenticatedFetch = async (input, init = {}) => {
    const endpoint = normalizeEndpoint(input);
    return apiFetch(endpoint, init);
  };

  const buildFiltersPayload = params => {
    const filters = {};
    if (!params || typeof params !== 'object') return filters;
    if (params.county) filters.county = String(params.county).toUpperCase();
    if (params.city) filters.city = String(params.city).toUpperCase();
    if (Array.isArray(params.parties) && params.parties.length) {
      filters.parties = params.parties;
    }
    if (params.require_phone) filters.require_phone = true;
    return filters;
  };

  const fetchVoters = async (params = {}) => {
    const payload = {
      filters: buildFiltersPayload(params),
      limit: params.limit || 50,
    };
    try {
      const result = await apiPost('canvass/nearby', payload);
      const voters = (result?.rows || []).map(row => ({
        voter_id: row.voter_id,
        county: row.county || '',
        city: row.city || '',
        political_party: row.party || '',
        house: params.house_district || null,
        senate: params.senate_district || null,
        phone: row.phone_e164 || null,
        phone_confidence: row.phone_confidence || null,
        address: row.address || '',
        name: row.name || '',
      }));
      return { ok: result?.ok ?? false, rows: result?.rows || [], voters };
    } catch (err) {
      if (!navigator.onLine) {
        return { ok: false, offline: true, error: 'offline' };
      }
      throw err;
    }
  };

  const fetchTemplates = async category => {
    try {
      const data = await apiGet('templates', category ? { category } : undefined);
      return { ok: data?.ok ?? false, templates: data?.templates || [] };
    } catch (err) {
      if (!navigator.onLine) {
        return { ok: false, offline: true, error: 'offline' };
      }
      throw err;
    }
  };

  const logCall = async (voterId, result, notes = '', pulseOptIn = false, pitchUsed = null) => {
    const body = {
      voter_id: voterId,
      call_result: result,
      notes,
      pulse_opt_in: !!pulseOptIn,
      pitch_used: pitchUsed,
    };
    try {
      return await apiPost('call', body);
    } catch (err) {
      if (!navigator.onLine) {
        return queueRequest({
          endpoint: 'call',
          init: { method: 'POST', body },
        });
      }
      throw err;
    }
  };

  const logCanvass = async (payload = {}) => {
    const body = {
      voter_id: payload.voter_id,
      action: payload.action || payload.result || 'contacted',
      note: payload.note || payload.notes || '',
      notes: payload.notes || '',
      pulse_opt_in: !!payload.pulse_opt_in,
      pitch_used: payload.pitch_used ?? null,
      location_lat: payload.location_lat ?? null,
      location_lng: payload.location_lng ?? null,
      door_status: payload.door_status ?? null,
      followup_needed: !!payload.followup_needed,
    };
    try {
      return await apiPost('canvass', body);
    } catch (err) {
      if (!navigator.onLine) {
        return queueRequest({
          endpoint: 'canvass',
          init: { method: 'POST', body },
        });
      }
      throw err;
    }
  };

  const updateOfflineQueue = async () => flushOfflineQueue();

  const getOnlineStatus = () => ({
    online: navigator.onLine,
    queued: readOfflineQueue().length,
    timestamp: Date.now(),
  });

  const ensureAccessSession = () => Promise.resolve(true);

  const startAccessRedirect = () => {
    kickToAccess(window.location.href);
    return new Promise(() => {});
  };

  const getAuthStatus = () => {
    const auth = window.authGlobal || {};
    return {
      hasToken: !!auth.authenticated,
      authenticated: !!auth.authenticated,
      user: auth.user || null,
      authType: auth.authenticated ? 'cf_access' : 'unknown',
    };
  };

  const checkAuth = async () => {
    try {
      const data = await apiGet('whoami');
      return !!(data && data.authenticated);
    } catch (err) {
      if (err?.status === 401) {
        kickToAccess(window.location.href);
      }
      return false;
    }
  };

  const getCurrentUserOrRedirect = async () => {
    try {
      return await apiGet('whoami');
    } catch (err) {
      if (err?.status === 401 || err?.status === 403) {
        kickToAccess(window.location.href);
        return new Promise(() => {});
      }
      throw err;
    }
  };

  window.apiFetch = apiFetch;
  window.apiGet = apiGet;
  window.apiPost = apiPost;
  window.authenticatedFetch = authenticatedFetch;
  window.fetchVoters = fetchVoters;
  window.fetchTemplates = fetchTemplates;
  window.logCall = logCall;
  window.logCanvass = logCanvass;
  window.getOnlineStatus = getOnlineStatus;
  window.updateOfflineQueue = updateOfflineQueue;
  window.showToast = showToast;
  window.getAuthStatus = getAuthStatus;
  window.checkAuth = checkAuth;
  window.ensureAccessSession = ensureAccessSession;
  window.getCurrentUserOrRedirect = getCurrentUserOrRedirect;
  window.apiConfig = {
    baseUrl: `${window.location.origin}/api`,
    environment: ensureEnvironmentConfig().config.environment,
    isLocal: ensureEnvironmentConfig().config.isLocal,
  };

  window.addEventListener('online', () => {
    showToast('🔄 Connection restored. Syncing queued actions...', 'info', 2500);
    flushOfflineQueue();
  });

  window.addEventListener('offline', () => {
    showToast('📴 Offline mode — actions will be queued', 'warning', 3500);
  });
})();
