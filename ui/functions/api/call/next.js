export const onRequestOptions = () =>
  new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "https://volunteers.grassrootsmvt.org",
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "content-type, cf-access-jwt-assertion",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    },
  });

export const onRequestPost = async ({ request, env }) => {
  // read JSON body
  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  const { filters, after_id, exclude_ids } = body;

  // Pick the next voter (stubbed behavior)
  const voter = {
    ok: true,
    voter_id: "TEST123",
    first_name: "Jane",
    last_name: "Doe",
    party: "R",
    ra_city: "Casper",
    ra_zip: "82601",
    phone_e164: "+13075551234",
  };

  return new Response(JSON.stringify(voter), {
    headers: { "content-type": "application/json" },
  });
};
