// worker/functions/api/whoami.js
// Simplified /api/whoami endpoint that trusts Cloudflare Access
// Works locally (fake identity) and in production (Access-provided JWT)

export default {
  async fetch(request, env) {
    const isLocal = env.ENVIRONMENT === "local";

    // 🧠 Local development fallback
    if (isLocal) {
      const response = {
        authenticated: true,
        email: "devuser@localhost",
        environment: "local",
      };
      console.log(`[whoami] local mode -> ${response.email}`);
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 🧩 Production mode — rely on Cloudflare Access
    const jwt = request.headers.get("Cf-Access-Jwt-Assertion");
    if (!jwt) {
      return new Response(
        JSON.stringify({
          authenticated: false,
          error: "Access token missing",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    try {
      // Decode the JWT payload (header.payload.signature)
      const [, payloadB64] = jwt.split(".");
      const payload = JSON.parse(atob(payloadB64));
      const email = payload.email || payload.identity?.email || "unknown@user";

      console.log(`[whoami] user: ${email}, env: production`);

      return new Response(
        JSON.stringify({
          authenticated: true,
          email,
          environment: "production",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (err) {
      console.error("❌ Failed to parse Access JWT:", err.message);
      return new Response(
        JSON.stringify({
          authenticated: false,
          error: "Invalid Access token",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  },
};
