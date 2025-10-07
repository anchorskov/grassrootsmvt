import { handleCorsPreflight, getCorsHeaders } from '../../_utils/cors.js';

export const onRequestOptions = ({ request }) => handleCorsPreflight(request);

export const onRequestPost = async ({ request }) => {
  const body = await request.text().catch(() => null);
  const cors = getCorsHeaders(request) || {};
  return new Response(JSON.stringify({ ok: true, received: body }), {
    headers: { "content-type": "application/json", ...cors },
  });
};
