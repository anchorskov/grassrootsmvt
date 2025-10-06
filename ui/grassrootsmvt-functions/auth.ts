import { jwtVerify, createRemoteJWKSet } from "jose";

export async function validateAccessJWT(request: Request, env: any) {
  // Extract token from header (preferred) or cookie fallback
  const token =
    request.headers.get("Cf-Access-Jwt-Assertion") ||
    getCookie(request, "CF_Authorization");

  if (!token) {
    return { valid: false, error: "Missing Cloudflare Access token" };
  }

  try {
    // Build JWKS endpoint (auto-rotates keys)
    const JWKS = createRemoteJWKSet(new URL(`${env.TEAM_DOMAIN}/cdn-cgi/access/certs`));

    // Verify token using Cloudflare’s issuer and your AUD tag
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: env.TEAM_DOMAIN,
      audience: env.POLICY_AUD,
    });

    return { valid: true, email: (payload as any).email, payload };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}

function getCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith(name + "=")) {
      return cookie.substring(name.length + 1);
    }
  }
  return null;
}
