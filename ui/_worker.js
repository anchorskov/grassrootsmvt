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
  /^\/api\/canvass\//,   // includes /api/canvass/nearby
    /^\/api\/call\/next$/,
    /^\/api\/call\/complete$/,
    /^\/admin\/meta\/refresh$/,
    /^\/api\/filters\/normalize$/,
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

    // EARLY DEV PROXY (place this right after the OPTIONS handler)
    {
      const patterns = [
        /^\/api\/canvass\//,
        /^\/api\/call\/next$/,
        /^\/api\/call\/complete$/,
        /^\/admin\/meta\/refresh$/,
        /^\/api\/filters\/normalize$/    // include normalize here
      ];
      const shouldProxy = env.DATA_BACKEND === "sqlite-dev" &&
                          env.LOCAL_SQLITE_API &&
                          patterns.some(re => re.test(pathname));
      if (shouldProxy) {
        const targetBase = env.LOCAL_SQLITE_API.replace(/\/+$/, "");
        const target = targetBase + pathname + url.search;
        const init = {
          method: request.method,
          headers: new Headers(request.headers),
          body: ["POST","PUT","PATCH"].includes(request.method)
            ? await request.clone().arrayBuffer()
            : undefined,
        };
        init.headers.delete("host");
        init.headers.delete("content-length");
        const resp = await fetch(target, init);
        const buf = await resp.arrayBuffer();
        const outHeaders = new Headers(resp.headers);
        outHeaders.set("cache-control","no-store");
        Object.entries(corsHeaders()).forEach(([k,v]) => outHeaders.set(k,v));
        return new Response(buf, { status: resp.status, statusText: resp.statusText, headers: outHeaders });
      }
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

    // /api/filters/normalize — GET/POST helper to see final filters
    if (pathname === "/api/filters/normalize") {
      if (!["GET","POST","OPTIONS"].includes(request.method)) {
        return json({ ok:false, error:"Method Not Allowed" }, 405);
      }

      // If you prefer to proxy in dev, uncomment the next 3 lines after adding the
      // sidecar endpoint (see step 2):
      // const proxied = await maybeProxySqliteDev?.();
      // if (proxied) return proxied;

      // Local normalization fallback
      const raw = request.method === "GET"
        ? Object.fromEntries(url.searchParams)
        : ((await safeJson(request))?.filters ?? (await safeJson(request)) ?? {});

      const PARTY_MAP = {
        R:"Republican", D:"Democratic", U:"Unaffiliated",
        REPUBLICAN:"Republican", DEMOCRATIC:"Democratic", UNAFFILIATED:"Unaffiliated"
      };
      const PARTY_CANON = new Set(Object.values(PARTY_MAP));
      const norm = {};

      // county / city uppercase-trim
      if (raw.county) norm.county = String(raw.county).trim().toUpperCase();
      if (raw.city)   norm.city   = String(raw.city).trim().toUpperCase();

      // district type + number (zero-pad numeric)
      if (raw.district_type) norm.district_type = String(raw.district_type).toLowerCase();
      if (raw.district) {
        const d = String(raw.district).trim();
        norm.district = /^\d+$/.test(d) ? d.padStart(2,"0") : d;
      }

      // parties → canonical long names
      const parties = Array.isArray(raw.parties) ? raw.parties : (raw.parties ? [raw.parties] : []);
      norm.parties = parties
        .map(p => PARTY_MAP[String(p||"").toUpperCase()] || p)
        .filter(p => PARTY_CANON.has(p));

      // limit clamp 1..200
      norm.limit = Math.max(1, Math.min(200, Number(raw.limit || 50)));

      return json({ ok:true, normalized: norm });
    }

    // static assets
    return env.ASSETS.fetch(request);
  }
};
