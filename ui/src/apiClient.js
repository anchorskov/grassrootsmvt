export async function apiFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url;
  const res = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: { 'Accept': 'application/json', ...(init.headers || {}) }
  }).catch(e => ({ ok:false, status:0, error:e }));

  if (res.type === 'opaqueredirect' || res.status === 401 || res.status === 403) {
    const returnTo = location.href;
    location.replace(`https://volunteers.grassrootsmvt.org/connecting.html?to=${encodeURIComponent(returnTo)}`);
    throw new Error('Redirecting to Access via connecting.html');
  }
  return res;
}
