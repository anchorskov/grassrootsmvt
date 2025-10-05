export async function requireUser(request, env) {
  // Prefer explicit Access header (injected by Cloudflare Access)
  const headerName = env && env.ACCESS_HEADER ? env.ACCESS_HEADER : 'Cf-Access-Authenticated-User-Email';
  const email = request.headers.get(headerName);
  if (email) return email.toLowerCase();

  // Fallback: accept JWT via header or cookie
  const jwt = getAccessJWT(request);
  if (jwt) return jwt; // return raw token if no email header available

  // Not authenticated
  return new Response(JSON.stringify({ ok: false, error: 'Unauthorized (Cloudflare Access required)' }), { status: 401, headers: { 'content-type': 'application/json' } });
}

export function getAccessJWT(request) {
  const hdr = request.headers.get('Cf-Access-Jwt-Assertion');
  if (hdr) return hdr;
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

// Helper to call from Functions that expect a thrown Response on failure
export async function requireUserOrThrow(request, env) {
  const r = await requireUser(request, env);
  if (r instanceof Response) throw r;
  return r;
}
