export function startAccessLoginRoundTrip(toUrl) {
  const uiTarget = toUrl || window.location.href;
  const connectUrl = new URL('/connecting', window.location.origin);
  connectUrl.searchParams.set('to', uiTarget);
  window.location.replace(connectUrl.toString());
}

export async function apiFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url;
  const res = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: { 'Accept': 'application/json', ...(init.headers || {}) }
  }).catch(e => ({ ok:false, status:0, error:e }));

  if (res.type === 'opaqueredirect' || res.status === 401 || res.status === 403) {
    startAccessLoginRoundTrip();
    throw new Error('Redirecting to Access via connecting page');
  }
  return res;
}
