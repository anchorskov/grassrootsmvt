// worker/src/routes/whoami.js
// Returns user identity: Access headers in prod, mock user in dev/local.

export default {
  path: '/api/whoami',
  method: ['GET'],
  async handler(request, env) {
    const { ENVIRONMENT } = env;

    // Development mode → bypass Cloudflare Access
    if (ENVIRONMENT !== 'production') {
      return new Response(
        JSON.stringify({ user: { email: 'dev@localhost', name: 'Local Developer' } }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Production → extract identity from Cloudflare Access headers
    const email = request.headers.get('CF-Access-Authenticated-User-Email');
    const name =
      request.headers.get('CF-Access-Authenticated-User-Name') || email || null;

    if (!email) {
      // When Access is missing, explicitly return null identity
      return new Response(JSON.stringify({ user: null }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ user: { email, name } }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  },
};
