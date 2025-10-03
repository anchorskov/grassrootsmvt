// ui/_worker.js

// ---- helpers (single, top-level) -------------------------------------------
function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
  };
}

function json(obj, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "content-type": "application/json",
    ...corsHeaders(),
    ...extraHeaders,
  });
  return new Response(JSON.stringify(obj), { status, headers });
}

async function safeJson(req) {
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/json")) {
    // allow empty bodies to be treated as {}
    const buf = await req.clone().arrayBuffer();
    if (!buf || buf.byteLength === 0) return {};
    return { _badRequest: true };
  }
  try {
    return await req.json();
  } catch {
    return { _badRequest: true };
  }
}

function jerr(status, message, extra = {}) {
  return json({ ok: false, error: message, ...extra }, status, { "cache-control": "no-store" });
}

async function maybeProxySqliteDev(request, env, url, pathname) {
  if (env.DATA_BACKEND !== "sqlite-dev" || !env.LOCAL_SQLITE_API) return null;

  const proxyable = [
    /^\/api\/canvass\//,
    /^\/api\/call\/next$/,
    /^\/api\/call\/complete$/,
    /^\/admin\/meta\/refresh$/,
  ].some((re) => re.test(pathname));

  if (!proxyable) return null;

  const targetBase = env.LOCAL_SQLITE_API.replace(/\/+$/, "");
  const target = targetBase + pathname + url.search;

  const init = {
    method: request.method,
    headers: new Headers(request.headers),
    body: ["POST", "PUT", "PATCH"].includes(request.method)
      ? await request.clone().arrayBuffer()
      : undefined,
  };

  // avoid hop-by-hop
  init.headers.delete("host");
  init.headers.delete("content-length");

  const resp = await fetch(target, init);
  const buf = await resp.arrayBuffer();
  const outHeaders = new Headers(resp.headers);
  Object.entries({ ...corsHeaders(), "cache-control": "no-store" })
    .forEach(([k, v]) => outHeaders.set(k, v));

  return new Response(buf, { status: resp.status, statusText: resp.statusText, headers: outHeaders });
}

// ---- worker entry -----------------------------------------------------------
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = (url.pathname.replace(/\/+$/, "")) || "/";

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // /hello
    if (pathname === "/hello") {
      return new Response("hello from functions", {
        headers: { "content-type": "text/plain", ...corsHeaders() }
      });
    }

    // /api/ping (debug)
    if (pathname === "/api/ping") {
      return json({
        ok: true,
        method: request.method,
        query: Object.fromEntries(url.searchParams),
        data_backend: env.DATA_BACKEND || null,
        sqlite_path: env.SQLITE_PATH || null,
        local_sqlite_api: env.LOCAL_SQLITE_API || null
      }, 200, { "cache-control": "no-store" });
    }

    // merge filters from query + body
    const getFilters = async () => {
      const q = Object.fromEntries(url.searchParams);
      let body = {};
      if (request.method === "POST") {
        const parsed = await safeJson(request);
        if (parsed._badRequest) return parsed;
        body = parsed;
      }
      const postFilters = body && typeof body === "object" ? (body.filters ?? body) : {};
      return { ...q, ...postFilters };
    };

    // /api/call/next
    if (pathname === "/api/call/next") {
      if (!["GET", "POST"].includes(request.method)) return jerr(405, "Method Not Allowed");
      const proxied = await maybeProxySqliteDev(request, env, url, pathname);
      if (proxied) return proxied;

      const filters = await getFilters();
      if (filters._badRequest) return jerr(400, "Invalid JSON body");

      // stub fallback
      return json({
        ok: true,
        method: request.method,
        filters,
        voter_id: "TEST123",
        first_name: "Jane",
        last_name: "Doe",
        party: "R",
        ra_city: "Casper",
        ra_zip: "82601",
        phone_e164: "+13075551234"
      }, 200, { "cache-control": "no-store" });
    }

    // /api/canvass/list
    if (pathname === "/api/canvass/list") {
      const proxied = await maybeProxySqliteDev(request, env, url, pathname);
      if (proxied) return proxied;

      const filters = await getFilters();
      if (filters._badRequest) return jerr(400, "Invalid JSON body");

      // stub fallback
      const rows = Array.from({ length: 5 }).map((_, i) => ({
        address: `${100 + i} Main St`,
        name: i % 2 ? "John Smith" : "Jane Doe",
        city: "Casper",
        zip: "82601"
      }));
      return json({ ok: true, method: request.method, filters, rows }, 200, { "cache-control": "no-store" });
    }

    // /api/call/complete
    if (pathname === "/api/call/complete") {
      if (request.method !== "POST") return jerr(405, "Method Not Allowed");
      const proxied = await maybeProxySqliteDev(request, env, url, pathname);
      if (proxied) return proxied;

      const body = await safeJson(request);
      if (body._badRequest) return jerr(400, "Invalid JSON body");

      return json({ ok: true, saved: body || null, ts: new Date().toISOString() }, 200, { "cache-control": "no-store" });
    }

    // /admin/meta/refresh (dev only proxy)
    if (pathname === "/admin/meta/refresh") {
      const proxied = await maybeProxySqliteDev(request, env, url, pathname);
      if (proxied) return proxied;
      return jerr(501, "Not implemented in prod");
    }

    // /api/whoami
    if (pathname === "/api/whoami") {
      const email =
        request.headers.get(env.ACCESS_HEADER || "Cf-Access-Authenticated-User-Email") ||
        env.DEV_EMAIL ||
        "dev@local";
      return json({ ok: true, email }, 200, { "cache-control": "no-store" });
    }

    // static assets
    return env.ASSETS.fetch(request);
  }
};
