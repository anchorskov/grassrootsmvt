export const onRequestOptions = () =>
  new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "https://volunteers.grassrootsmvt.org",
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "content-type, cf-access-jwt-assertion",
      "access-control-allow-methods": "POST,OPTIONS",
    },
  });

export const onRequestPost = async ({ request }) => {
  const body = await request.text().catch(() => null);
  return new Response(JSON.stringify({ ok: true, received: body }), {
    headers: { "content-type": "application/json" },
  });
};
