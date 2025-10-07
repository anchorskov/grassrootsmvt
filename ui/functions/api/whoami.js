// ui/functions/api/whoami.js
import { handleCorsPreflight, getCorsHeaders } from '../_utils/cors.js';
import { verifyAccessJWT } from '../_utils/verifyAccessJWT.js';

/**
 * Handles preflight requests for CORS.
 */
export async function onRequestOptions({ request, env }) {
  return handleCorsPreflight(request, env);
}

/**
 * Handles authenticated whoami requests.
 */
export async function onRequestGet({ request, env }) {
  const origin = request.headers.get('Origin');
  const cors = getCorsHeaders(request) || {
    'Access-Control-Allow-Origin': '*',
  };

  const verification = await verifyAccessJWT(request, env);

  if (!verification.valid) {
    // Standardized Unauthorized response
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: {
        ...cors,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }

  // Authenticated user response
  return new Response(
    JSON.stringify({
      ok: true,
      email: verification.email,
    }),
    {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    }
  );
}
