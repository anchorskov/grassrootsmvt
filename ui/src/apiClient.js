const UI_ORIGIN  = 'https://volunteers.grassrootsmvt.org';
const API_ORIGIN = 'https://api.grassrootsmvt.org';

export async function apiFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url;
  const merged = {
    credentials: 'include',
    ...init,
    headers: {
      ...(init.headers || {}),
      'Accept': 'application/json'
    }
  };

  const res = await fetch(url, merged).catch(err => ({ ok:false, status:0, error:err }));
  if (res.type === 'opaqueredirect' || res.status === 401 || res.status === 403) {
    // Go through the interstitial instead of XHR to Access
    const returnTo = location.href;
    const connecting = `${UI_ORIGIN}/connecting.html?to=${encodeURIComponent(returnTo)}`;
    location.replace(connecting);
    return Promise.reject(new Error('Redirecting to Access login (connecting.html)'));
  }
  return res;
}
