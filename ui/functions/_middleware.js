import { getCorsHeaders } from './_utils/cors.js';

/**
 * Handle preflight (OPTIONS) requests globally.
 */
export function onRequestOptions({ request }) {
  let cors = {};
  try {
    cors = getCorsHeaders(request) || {};
  } catch (err) {
    cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
  }

  return new Response(null, {
    status: 204,
    headers: {
      ...cors,
      'Content-Length': '0',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/**
 * Wrap all other requests to inject CORS headers.
 */
export async function onRequest(context) {
  const response = await context.next();
  try {
    const req = context.request;
    const cors = getCorsHeaders(req) || {
      'Access-Control-Allow-Origin': '*',
    };

    console.log('Resolved CORS headers for origin:', req.headers.get('Origin'), cors);

    for (const [key, value] of Object.entries(cors)) {
      response.headers.set(key, value);
    }

    if (!response.headers.has('Access-Control-Allow-Methods')) {
      response.headers.set(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, PATCH, DELETE, OPTIONS'
      );
    }

    if (!response.headers.has('Access-Control-Allow-Headers')) {
      response.headers.set(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization'
      );
    }
  } catch (err) {
    console.error('CORS middleware error:', err);
  }

  return response;
}
