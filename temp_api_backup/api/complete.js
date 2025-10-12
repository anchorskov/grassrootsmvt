// ui/functions/api/complete.js

import { handleCorsPreflight, getCorsHeaders } from '../_utils/cors.js';

/**
 * Handle CORS preflight requests (OPTIONS).
 */
export const onRequestOptions = ({ request }) => handleCorsPreflight(request);

/**
 * Handle POST requests to /api/complete.
 * Echoes back the received request body as JSON.
 */
export const onRequestPost = async ({ request }) => {
  try {
    const body = await request.text().catch(() => null);
    const cors = getCorsHeaders(request) || {};

    return new Response(JSON.stringify({ ok: true, received: body }), {
      status: 200,
      headers: { 'content-type': 'application/json', ...cors },
    });
  } catch (err) {
    console.error('Error in /api/complete:', err);
    return new Response(JSON.stringify({ ok: false, error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'content-type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
};
