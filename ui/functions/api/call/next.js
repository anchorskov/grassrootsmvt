export const onRequest = async ({ request }) => {
  if (!["GET","POST"].includes(request.method)) return new Response("Method Not Allowed", { status: 405 });
  let payload = {};
  if (request.method === "POST") {
    try { payload = await request.json(); } catch {}
  }
  const stub = {
    ok: true,
    method: request.method,
    filters: payload.filters || {},
    voter_id: "TEST123",
    first_name: "Jane",
    last_name: "Doe",
    party: "R",
    ra_city: "Casper",
    ra_zip: "82601",
    phone_e164: "+13075551234"
  };
  return new Response(JSON.stringify(stub), { headers: { "content-type": "application/json" }});
};
