export const onRequest = ({ request }) =>
  new Response(JSON.stringify({ ok:true, method: request.method }), {
    headers: { "content-type": "application/json" }
  });
