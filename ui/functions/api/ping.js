export const onRequestGet = () =>
  new Response(JSON.stringify({ ok: true, where: "ui/functions/api/ping.js" }), {
    headers: { "content-type": "application/json" }
  });
