// worker/src/routes/dev-auth.js
// Handles Access handshake endpoints with dev bypass parity.

const json204 = () => new Response(null, { status: 204 });

export default [
  {
    path: '/api/ping',
    async handler(_req, env) {
      // In production → confirm Access health
      if (env.ENVIRONMENT === 'production') {
        return new Response(
          JSON.stringify({ ok: true, access: 'active' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }

      // In development → no-op (bypass Access)
      return json204();
    },
  },
  {
    path: '/api/auth/finish',
    async handler(_req, env) {
      // In production → Cloudflare Access completes redirect here
      if (env.ENVIRONMENT === 'production') {
        return new Response(
          JSON.stringify({ ok: true, finish: true }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }

      // In development → skip redirect flow entirely
      return json204();
    },
  },
];
