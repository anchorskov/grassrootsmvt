// functions/_utils/verifyAccessJWT.js
export async function verifyAccessJWT(request, env) {
  const jwt = request.headers.get(env.ACCESS_JWT_HEADER || "Cf-Access-Jwt-Assertion");
  if (!jwt) {
    throw new Error("Missing Cf-Access-Jwt-Assertion header or CF_Authorization cookie");
  }

  const teamDomain = env.TEAM_DOMAIN?.replace(/^https?:\/\//, "");
  if (!teamDomain) throw new Error("Missing TEAM_DOMAIN in environment");

  // Fetch Cloudflare Access public keys
  const keyResponse = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!keyResponse.ok) throw new Error("Failed to fetch Access public keys");
  const { keys } = await keyResponse.json();

  // Decode JWT
  const [headerB64, payloadB64, signatureB64] = jwt.split(".");
  const payload = JSON.parse(atob(payloadB64));

  // Validate Audience (AUD)
  if (!payload.aud || payload.aud !== env.POLICY_AUD) {
    throw new Error("Invalid audience (AUD mismatch)");
  }

  // Validate Signature
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = Uint8Array.from(
    atob(signatureB64.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0)
  );

  const keyData = keys.find((k) => k.kid === JSON.parse(atob(headerB64)).kid) || keys[0];
  const key = await crypto.subtle.importKey(
    "jwk",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const verified = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, data);
  if (!verified) {
    throw new Error("JWT signature invalid");
  }

  return payload;
}
