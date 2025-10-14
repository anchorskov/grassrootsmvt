// worker/functions/_utils/verifyAccessJWT.js
// ✅ Cloudflare Zero Trust JWT verification helper

export async function verifyAccessJWT(request, env) {
  const jwt =
    request.headers.get(env.ACCESS_JWT_HEADER || 'Cf-Access-Jwt-Assertion') ||
    (request.headers.get('Cookie')?.match(/CF_Authorization=([^;]+)/)?.[1]);

  if (!jwt) {
    throw new Error('Missing Access token');
  }

  // Decode payload
  const [headerB64, payloadB64, signatureB64] = jwt.split('.');
  const payload = JSON.parse(atob(payloadB64));

  // Validate audience
  if (!payload.aud || !payload.aud.includes(env.POLICY_AUD)) {
    throw new Error('Invalid audience (AUD mismatch)');
  }

  // Fetch Cloudflare Access signing keys
  const teamDomain = env.TEAM_DOMAIN?.replace(/^https?:\/\//, '');
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  const { keys } = await res.json();

  // Verify signature
  const encoder = new TextEncoder();
  const data = encoder.encode(`${headerB64}.${payloadB64}`);
  const signature = Uint8Array.from(
    atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/')),
    c => c.charCodeAt(0)
  );

  const key = await crypto.subtle.importKey(
    'jwk',
    keys[0],
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const verified = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    signature,
    data
  );

  if (!verified) {
    throw new Error('JWT signature invalid');
  }

  return payload; // { email, aud, exp, ... }
}
