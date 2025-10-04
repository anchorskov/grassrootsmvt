// ui/functions/api/whoami.js
import { createRemoteJWKSet, jwtVerify } from "jose";

export const onRequestGet = async ({ request, env }) => {
  // 1) Fast path: some CF edges inject the email header
  const hdrEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (hdrEmail) return json({ email: hdrEmail });

  // 2) Get the Access JWT (header or cookie)
  const jwt =
    request.headers.get("Cf-Access-Jwt-Assertion") ||
    getCookie(request.headers.get("Cookie") || "", "CF_Authorization");

  if (!jwt) return json({ error: "No Access token" }, 401);

  try {
    const team = (env.CF_ACCESS_TEAM || "").trim();   // e.g. "skovgard"
    const aud  = (env.CF_ACCESS_AUD  || "").trim();   // audience tag from the Access app
    const issuer = `https://${team}.cloudflareaccess.com`;

    const JWKS = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    const { payload } = await jwtVerify(jwt, JWKS, {
      issuer,                // verify iss
      audience: aud,         // verify aud
    });

    const email = payload?.email;
    if (!email) return json({ error: "Token missing email" }, 401);

    return json({ email });  // ✅ only return email
  } catch (e) {
    return json({ error: "Invalid Access token" }, 401);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function getCookie(cookie, name) {
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}
