export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // One-line fallback (well, one return statement 😉):
    if (new URL(request.url).pathname === '/config/environments.js') return new Response(
      `export default {
         shouldBypassAuth: () => /^(localhost|127\\.0\\.0\\.1)$/.test(self.location.hostname),
         getApiUrl: (endpoint, params={}) => {
           const p = String(endpoint).startsWith('/') ? String(endpoint) : '/api/' + endpoint;
           const u = new URL(p, self.location.origin);
           Object.entries(params).forEach(([k,v])=>u.searchParams.set(k, v));
           return u.toString();
         },
         debug: (...a) => { if (/^(localhost|127\\.0\\.0\\.1)$/.test(self.location.hostname)) console.log('[ENV]', ...a); },
         config: { environment: /^(localhost|127\\.0\\.0\\.1)$/.test(self.location.hostname) ? 'local' : 'production', isLocal: /^(localhost|127\\.0\\.0\\.1)$/.test(self.location.hostname) }
       };`,
      { headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'public, max-age=300' } }
    );

    // Proxy all /api/* to API
    if (url.pathname.startsWith('/api/')) {
      return proxyToApi(request, env);
    }

    // (Placeholder) Add your static serving if needed
    return new Response('UI worker active. Add static handler or use Pages for assets.', {
      status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' }
    });
  }
};

async function proxyToApi(request, env) {
  const url = new URL(request.url);
  // Production: service binding if configured
  if (env.API && typeof env.API.fetch === 'function') {
    return env.API.fetch(request);
  }
  // Dev: forward to local API origin via env var
  const base = env.API_BASE || 'http://127.0.0.1:8787';
  const upstreamUrl = new URL(url.pathname + url.search, base).toString();
  const upstreamReq = cloneRequestWithNewUrl(request, upstreamUrl);
  return fetch(upstreamReq, { redirect: 'manual' });
}

function cloneRequestWithNewUrl(request, newUrl) {
  const headers = new Headers(request.headers);
  headers.delete('host'); // Let fetch set correct Host
  const hasBody = !['GET', 'HEAD'].includes(request.method.toUpperCase());
  return new Request(newUrl, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    redirect: 'manual'
  });
}
