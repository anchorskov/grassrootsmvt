// ui/functions/api/next.js
import { handleCorsPreflight, getCorsHeaders } from '../_utils/cors.js';
import { verifyAccessJWT } from '../_utils/verifyAccessJWT.js';

export async function onRequestOptions({ request, env }) {
  return handleCorsPreflight(request, env);
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  const cors = getCorsHeaders(env, origin);

  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing or invalid Authorization header' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }

    const verification = await verifyAccessJWT(request, env);
    if (!verification?.valid || !verification?.email) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }

    const body = await request.json().catch(() => ({}));
    const voter = {
      ok: true,
      voter_id: 'TEST123',
      first_name: 'Jane',
      last_name: 'Doe',
      city: 'Casper',
      zip: '82601',
      phone_e164: '+13075551234',
      received: body,
      user: verification.email,
    };

    return new Response(JSON.stringify(voter), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('❌ Error in /api/next:', err);
    return new Response(
      JSON.stringify({ ok: false, error: 'Internal Server Error' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }
}
// ui/functions/api/call/next.js
import { handleCorsPreflight, getCorsHeaders } from '../../_utils/cors.js';
import { verifyAccessJWT } from '../../_utils/verifyAccessJWT.js';

export async function onRequestOptions({ request, env }) {
  return handleCorsPreflight(request, env);
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  const cors = getCorsHeaders(env, origin);

  try {
    // 🔐 Enforce Authorization header presence
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing or invalid Authorization header' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }

    // 🔍 Verify JWT access token
    const verification = await verifyAccessJWT(request, env);
    if (!verification?.valid || !verification?.email) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }

    // ✅ Authenticated: proceed to return voter info
    const body = await request.json().catch(() => ({}));
    const voter = {
      ok: true,
      voter_id: 'TEST123',
      first_name: 'Jane',
      last_name: 'Doe',
      city: 'Casper',
      zip: '82601',
      phone_e164: '+13075551234',
      received: body,
      user: verification.email,
    };

    return new Response(JSON.stringify(voter), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('❌ Error in /api/call/next:', err);
    return new Response(
      JSON.stringify({ ok: false, error: 'Internal Server Error' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }
}
