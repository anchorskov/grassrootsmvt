export const onRequest = async ({ request }) => {
  console.log("[/api/testpost] method:", request.method);
  if (request.method !== "POST") return new Response("Use POST", { status: 405 });
  const body = await request.text();
  return new Response(JSON.stringify({ ok: true, received: body || null }), {
    headers: { "content-type": "application/json" }
  });
};
