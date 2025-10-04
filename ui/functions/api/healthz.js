// ui/functions/api/healthz.js
export const onRequestGet = () =>
  new Response(JSON.stringify({ ok: true, from: "pages-functions" }), {
    headers: { "content-type": "application/json" },
  });
