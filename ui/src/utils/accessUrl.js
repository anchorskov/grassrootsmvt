export function buildAccessLoginUrl({ teamDomain, apiHost, finishUrl, kid, meta }) {
  const base = (teamDomain || '').replace(/\/$/, '');
  const path = `/cdn-cgi/access/login/${apiHost}`; // HOST-IN-PATH ONLY
  const qp = new URLSearchParams();
  if (kid) qp.set('kid', kid);
  if (meta) qp.set('meta', meta);
  qp.set('redirect_url', finishUrl);
  const url = `${base}${path}?${qp.toString()}`;

  // Guardrails: refuse AUD-in-path (64 hex chars)
  if (/\/login\/[0-9a-f]{64}(?:\/|$)/i.test(url)) {
    throw new Error('AUD-in-path login URL detected — must use host-in-path');
  }
  return url;
}