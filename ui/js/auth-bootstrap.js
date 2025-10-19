// ui/js/auth-bootstrap.js
// One-login bootstrap using same-origin Access (Cloudflare Zero Trust).
// Usage (per page):
//   import env from '/config/environments.js';
//   import { ensureAccess, showUserBadge } from '/js/auth-bootstrap.js';
//   await ensureAccess(env);
//   await showUserBadge(env, document.querySelector('.online-indicator'));

export async function ensureAccess(env) {
  try {
    if (env.shouldBypassAuth && env.shouldBypassAuth()) return;
    const r = await fetch(env.getApiUrl('whoami'), {
      credentials: 'include',
      redirect: 'manual',
      headers: { 'Accept': 'application/json' }
    });
    if (r.status === 200) return; // already authenticated
  } catch (_) {
    // ignore; fall through to kick
  }
  // Kick into Access with a same-origin finish
  const finish = env.getApiUrl('auth/finish', { to: location.href });
  const kick = env.getApiUrl('ping', { finish });
  location.href = kick;
  // Halt further JS on this page load
  await new Promise(() => {});
}

export async function showUserBadge(env, indicatorEl) {
  if (!indicatorEl) return;
  try {
    if (env.shouldBypassAuth && env.shouldBypassAuth()) {
      const envLabel = env.config?.isLocal ? ' (Local)' : '';
      indicatorEl.textContent = `✅ Authenticated${envLabel}`;
      indicatorEl.parentElement.style.background = '#dcfce7';
      indicatorEl.parentElement.style.color = '#166534';
      return;
    }
    const r = await fetch(env.getApiUrl('whoami'), {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });
    if (r.ok) {
      const data = await r.json();
      if (data?.ok && data.email) {
        indicatorEl.textContent = `✅ Signed in as: ${data.email}`;
        indicatorEl.parentElement.style.background = '#dcfce7';
        indicatorEl.parentElement.style.color = '#166534';
        return;
      }
    }
  } catch (_) {}
  indicatorEl.textContent = '⚠️ Not signed in';
  indicatorEl.parentElement.style.background = '#fef3c7';
  indicatorEl.parentElement.style.color = '#92400e';
}