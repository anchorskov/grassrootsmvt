export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    // /hello -> proves functions are mounted
    if (pathname === "/hello") {
      return new Response("hello from functions", { headers: { "content-type":"text/plain" }});
    }

    // /api/ping -> JSON echo of method
    if (pathname === "/api/ping") {
      return json({ ok:true, method: request.method });
    }

    // /api/call/next -> accept GET and POST
    if (pathname === "/api/call/next") {
      if (!["GET","POST"].includes(request.method)) return new Response("Method Not Allowed", { status:405 });
      const body = {
        ok: true,
        method: request.method,
        voter_id: "TEST123",
        first_name: "Jane",
        last_name: "Doe",
        party: "R",
        ra_city: "Casper",
        ra_zip: "82601",
        phone_e164: "+13075551234"
      };
      return json(body);
    }

    // /api/canvass/list -> accept GET and POST, return stub data
    if (pathname === "/api/canvass/list") {
      let filters = {};
      if (request.method === "POST") {
        try { filters = await request.json(); } catch {}
      }
      const rows = Array.from({ length: 5 }).map((_, i) => ({
        address: `${100+i} Main St`,
        name: i % 2 ? "John Smith" : "Jane Doe",
        city: "Casper",
        zip: "82601"
      }));
      return json({ ok:true, method: request.method, filters, rows });
    }

    // /api/call/complete -> accept POST only, echo body and pretend to persist
    if (pathname === "/api/call/complete") {
      if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
      let body = {};
      try { body = await request.json(); } catch (e) {}
      return json({ ok: true, saved: body || null, ts: new Date().toISOString() });
    }

    // /api/whoami -> identity stub for local dev
    if (pathname === "/api/whoami") {
      return json({ ok: true, email: "dev@local" });
    }

    // fallthrough -> serve static UI (index.html etc.)
    return env.ASSETS.fetch(request);
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders() }
  });
}
