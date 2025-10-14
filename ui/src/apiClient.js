function goConnect(returnTo) {
  const uiOrigin = "https://volunteers.grassrootsmvt.org";
  const target = returnTo || window.location.href;
  const connecting = `${uiOrigin}/connecting.html?to=${encodeURIComponent(target)}`;
  window.location.replace(connecting);
}

export async function apiFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url;
  const res = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: { 'Accept': 'application/json', ...(init.headers || {}) }
  }).catch(e => ({ ok:false, status:0, error:e }));

  if (res.type === 'opaqueredirect' || res.status === 401 || res.status === 403) {
    goConnect();
    throw new Error('Redirecting to Access via connecting page');
  }
  return res;
}

// Example: on 401/403 or failed Access cookie checks:
export async function initializeAuthStatus() {
  try {
    // Instead of calling /cdn-cgi/access/* via XHR, simply try a small protected ping:
    const res = await fetch("https://api.grassrootsmvt.org/api/ping", { credentials: "include" });
    if (res.status === 200) {
      // authenticated
      return;
    }
    // unauthenticated → bounce
    goConnect();
  } catch {
    goConnect();
  }
}
