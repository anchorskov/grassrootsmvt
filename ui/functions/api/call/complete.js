export const onRequest = async ({ request }) => {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const body = await request.text().catch(()=>null);
  return new Response(JSON.stringify({ ok: true, received: body }), {
    headers: { "content-type": "application/json" }
  });
};
