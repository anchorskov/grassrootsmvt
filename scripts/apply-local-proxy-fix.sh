#!/usr/bin/env bash
set -euo pipefail

# Helper: cross-platform sed -i
sedi() {
  if sed --version >/dev/null 2>&1; then sed -i "$@"; else sed -i '' "$@"; fi
}

echo "== 1) Write static/config/environments.js (idempotent overwrite) =="
mkdir -p static/config
cat > static/config/environments.js <<'JS'
export const envVersion = "2025-10-16.1";

const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
// Allow a local dev override to a different origin (e.g., API on 8787)
const stored = isLocal ? (localStorage.getItem('GRMVT_API_BASE') || '') : '';
const apiBaseOverride = (isLocal && /^https?:\/\//.test(stored)) ? stored : null;
const base = apiBaseOverride || location.origin;

function getApiUrl(endpoint, params = {}) {
  const path = String(endpoint).startsWith('/') ? String(endpoint) : `/api/${endpoint}`;
  const url = new URL(path, base);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

export default {
  shouldBypassAuth: () => isLocal,
  getApiUrl,
  debug: (...a) => { if (isLocal) console.log('[ENV]', ...a); },
  config: { environment: isLocal ? 'local' : 'production', isLocal }
};
JS

echo "== 2) Patch ui/src/apiClient.js =="
API_CLIENT="ui/src/apiClient.js"
if [[ ! -f "$API_CLIENT" ]]; then
  echo "ERROR: $API_CLIENT not found. Aborting." >&2
  exit 1
fi

cp -f "$API_CLIENT" "${API_CLIENT}.bak.$(date +%s)"

# Ensure it imports env from /config/environments.js somewhere
grep -q "/config/environments.js" "$API_CLIENT" || {
  # Don't force a static import at top; we keep dynamic import inside loadEnvironmentConfig
  :
}

# Ensure loadEnvironmentConfig() exists and imports /config/environments.js
perl -0777 -pe '
  s#async function loadEnvironmentConfig\(\)\s*\{.*?\}\s*#async function loadEnvironmentConfig() {\n  if (environmentConfig) return environmentConfig;\n  try {\n    const mod = await import('/config/environments.js');\n    environmentConfig = mod.default || mod.environmentConfig || mod;\n  } catch (e) {\n    console.warn(\"ENV import failed, using fallback\", e);\n    environmentConfig = null;\n  }\n  return environmentConfig;\n}\n#s
' "$API_CLIENT" > "${API_CLIENT}.tmp1" || cp -f "$API_CLIENT" "${API_CLIENT}.tmp1"

# Add safeGetApiUrl if missing
if ! grep -q "async function safeGetApiUrl" "${API_CLIENT}.tmp1"; then
cat >> "${API_CLIENT}.tmp1" <<'JS'

/** Build a safe API URL under all conditions:
 *  1) Try environment helper
 *  2) If local override is set (GRMVT_API_BASE) use it in dev
 *  3) Else same-origin /api/*
 */
async function safeGetApiUrl(endpoint, params = {}) {
  const env = await loadEnvironmentConfig();
  if (env && typeof env.getApiUrl === 'function') {
    try {
      const u = env.getApiUrl(endpoint, params);
      if (u) return u;
    } catch (e) {
      console.warn('env.getApiUrl threw, falling back:', e);
    }
  }
  const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const stored = isLocal ? (localStorage.getItem('GRMVT_API_BASE') || '') : '';
  const apiBase = (isLocal && /^https?:\/\//.test(stored)) ? stored : location.origin;
  const path = String(endpoint).startsWith('/') ? String(endpoint) : `/api/${endpoint}`;
  const url = new URL(path, apiBase);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}
JS
fi

# Ensure apiFetch uses safeGetApiUrl
perl -0777 -pe "
  s#const url = [^;]+;#const url = await safeGetApiUrl(endpoint, options.params);#s
" "${API_CLIENT}.tmp1" > "${API_CLIENT}.tmp2" || cp -f "${API_CLIENT}.tmp1" "${API_CLIENT}.tmp2"

mv -f "${API_CLIENT}.tmp2" "$API_CLIENT"
rm -f "${API_CLIENT}.tmp1"

echo "== 3) Add UI Worker proxy for /api/* (dev → API_BASE, prod → service binding) =="
mkdir -p ui/worker/src

cat > ui/worker/src/index.js <<'JS'
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

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
JS

cat > ui/wrangler.toml <<'TOML'
name = "grassroots-ui"
main = "worker/src/index.js"
compatibility_date = "2024-05-29"

# Dev: API running on http://127.0.0.1:8787
[vars]
API_BASE = "http://127.0.0.1:8787"

# Prod: bind to your API Worker
# [[services]]
# binding = "API"              # matches env.API in code
# service = "grassroots-api"   # your API Worker name
# environment = "production"
TOML

echo "== Done. Files updated. =="
echo "Backups: ${API_CLIENT}.bak.*"
