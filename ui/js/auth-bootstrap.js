// /ui/js/auth-bootstrap.js
//
// Provides simple authentication bootstrap for Cloudflare Access integration
// Works in both local dev (bypass) and production environments.
//

/**
 * Check if we're running in local dev mode.
 * Local overrides can also be set via localStorage.GRMVT_DEV = "1"
 */
export function isLocalDev(env) {
  const isDevEnv =
    env?.config?.isLocal ||
    env?.config?.ENVIRONMENT === 'development' ||
    location.hostname.includes('localhost') ||
    location.hostname.startsWith('127.') ||
    localStorage.getItem('GRMVT_DEV') === '1';
  return !!isDevEnv;
}

/**
 * Ensure user is authenticated through Cloudflare Access.
 * In dev mode: returns immediately (no redirect)
 * In production: calls /api/ping → /api/auth/finish as needed
 */
export async function ensureAccess(env) {
  if (isLocalDev(env)) {
    console.log('🧰 [Auth] Local dev detected — bypassing Access');
    return;
  }

  console.log('🔐 [Auth] Checking Cloudflare Access authentication…');

  const pingUrl = env.getApiUrl('ping');
  const whoamiUrl = env.getApiUrl('whoami');
  const finishUrl = env.getApiUrl('auth/finish', { to: location.href });

  try {
    const res = await fetch(whoamiUrl, {
      credentials: 'include',
      redirect: 'manual',
      headers: { Accept: 'application/json' },
    });

    if (res.status === 200) {
      console.log('✅ [Auth] Already authenticated');
      return;
    }

    if (res.status === 401 || res.type === 'opaqueredirect') {
      console.log('🚪 [Auth] Not authenticated — redirecting to Access');
      sessionStorage.setItem('access:kicking', '1');
      location.href = `${pingUrl}?finish=${encodeURIComponent(finishUrl)}`;
      return new Promise(() => {}); // pause execution until redirected
    }
  } catch (err) {
    console.warn('⚠️ [Auth] Auth check failed:', err);
  }
}

/**
 * Display authenticated user’s email or dev mode label.
 * @param {object} env - Environment config object
 * @param {HTMLElement} el - Target element to update (e.g., .online-indicator)
 */
export async function showUserBadge(env, el) {
  if (!el) return;
  if (isLocalDev(env)) {
    el.textContent = '🧰 Dev Mode (Access bypassed)';
    el.style.color = '#475569';
    return;
  }

  try {
    const res = await fetch(env.getApiUrl('whoami'), {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });

    if (res.ok) {
      const j = await res.json();
      if (j && j.email) {
        el.textContent = `👤 ${j.email}`;
        el.style.color = '#065f46';
      } else {
        el.textContent = '⚠️ Unknown user';
        el.style.color = '#92400e';
      }
    } else {
      el.textContent = '🚫 Not authenticated';
      el.style.color = '#991b1b';
    }
  } catch (err) {
    el.textContent = '⚠️ Error loading identity';
    el.style.color = '#9a3412';
    console.warn('[Auth] showUserBadge failed:', err);
  }
}
