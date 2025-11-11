const STYLE_ID = 'session-timeout-styles';
const OVERLAY_ID = 'session-timeout-overlay';

function injectStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .session-timeout-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.65);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 400;
      padding: 20px;
    }
    .session-timeout-overlay.open {
      display: flex;
    }
    .session-timeout-card {
      background: #ffffff;
      color: #0f172a;
      border-radius: 16px;
      max-width: 420px;
      width: min(420px, 90vw);
      padding: 24px;
      box-shadow: 0 20px 40px rgba(15, 23, 42, 0.25);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .session-timeout-card h2 {
      margin: 0;
      font-size: 1.35rem;
    }
    .session-timeout-card p {
      margin: 0;
      line-height: 1.5;
    }
    .session-timeout-countdown {
      font-weight: 700;
      color: #b45309;
    }
    .session-timeout-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      justify-content: flex-end;
      margin-top: 12px;
    }
    .session-timeout-actions button {
      border: none;
      border-radius: 999px;
      padding: 10px 16px;
      font-weight: 600;
      cursor: pointer;
    }
    .session-timeout-continue {
      background: #0ea5e9;
      color: #f8fafc;
    }
    .session-timeout-logout {
      background: #f1f5f9;
      color: #0f172a;
    }
  `;
  document.head.appendChild(style);
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function defaultLogout() {
  if (window.authGlobal?.logout) {
    window.authGlobal.logout({ returnTo: '/' });
  } else {
    window.location.href = '/';
  }
}

function createOverlay({ title, message, continueLabel, logoutLabel }) {
  injectStyles();
  let overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'session-timeout-overlay';
    overlay.innerHTML = `
      <div class="session-timeout-card" role="dialog" aria-modal="true" aria-labelledby="session-timeout-title">
        <h2 id="session-timeout-title">${title}</h2>
        <p class="session-timeout-message">
          ${message}
          <br />
          <strong>Auto-logout in <span class="session-timeout-countdown">10:00</span></strong>
        </p>
        <div class="session-timeout-actions">
          <button type="button" class="session-timeout-logout">${logoutLabel}</button>
          <button type="button" class="session-timeout-continue">${continueLabel}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  return {
    overlay,
    countdownEl: overlay.querySelector('.session-timeout-countdown'),
    continueBtn: overlay.querySelector('.session-timeout-continue'),
    logoutBtn: overlay.querySelector('.session-timeout-logout'),
  };
}

export function initSessionTimeout({
  idleMinutes = 20,
  graceMinutes = 10,
  title = 'Still there?',
  message = 'You\'ve been inactive for a bit. To protect voter information, we plan to sign you out soon.',
  continueLabel = 'Continue session',
  logoutLabel = 'Logout now',
  onLogout = defaultLogout,
} = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  if (window.__sessionTimeoutController) {
    window.__sessionTimeoutController.update({ idleMinutes, graceMinutes, onLogout });
    return window.__sessionTimeoutController;
  }

  const config = { idleMinutes, graceMinutes, title, message, continueLabel, logoutLabel, onLogout };
  const overlayParts = createOverlay(config);
  const state = {
    warningVisible: false,
    idleMs: Math.max(1, idleMinutes) * 60 * 1000,
    graceMs: Math.max(1, graceMinutes) * 60 * 1000,
  };
  let idleTimer = null;
  let countdownTimer = null;
  let logoutTimer = null;

  function hideWarning() {
    state.warningVisible = false;
    overlayParts.overlay.classList.remove('open');
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    if (logoutTimer) {
      clearTimeout(logoutTimer);
      logoutTimer = null;
    }
  }

  function triggerLogout() {
    hideWarning();
    try {
      onLogout();
    } catch (err) {
      console.error('[sessionTimeout] logout hook failed', err);
      defaultLogout();
    }
  }

  function startCountdown() {
    const endAt = Date.now() + state.graceMs;
    overlayParts.countdownEl.textContent = formatCountdown(state.graceMs);
    countdownTimer = setInterval(() => {
      const remaining = endAt - Date.now();
      overlayParts.countdownEl.textContent = formatCountdown(remaining);
    }, 1000);
    logoutTimer = setTimeout(triggerLogout, state.graceMs);
  }

  function showWarning() {
    state.warningVisible = true;
    overlayParts.overlay.classList.add('open');
    startCountdown();
  }

  function resetIdleTimer() {
    if (state.warningVisible) return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(showWarning, state.idleMs);
  }

  const activityHandler = () => {
    if (state.warningVisible) return;
    resetIdleTimer();
  };

  ['click', 'mousemove', 'keydown', 'scroll', 'touchstart'].forEach(eventName => {
    document.addEventListener(eventName, activityHandler, { passive: true });
  });

  overlayParts.continueBtn.addEventListener('click', () => {
    hideWarning();
    resetIdleTimer();
  });
  overlayParts.logoutBtn.addEventListener('click', triggerLogout);

  resetIdleTimer();

  const controller = {
    update(newOpts = {}) {
      if (typeof newOpts.idleMinutes === 'number') {
        state.idleMs = Math.max(1, newOpts.idleMinutes) * 60 * 1000;
      }
      if (typeof newOpts.graceMinutes === 'number') {
        state.graceMs = Math.max(1, newOpts.graceMinutes) * 60 * 1000;
      }
      if (typeof newOpts.onLogout === 'function') {
        onLogout = newOpts.onLogout;
      }
      resetIdleTimer();
    },
    destroy() {
      hideWarning();
      if (idleTimer) clearTimeout(idleTimer);
      ['click', 'mousemove', 'keydown', 'scroll', 'touchstart'].forEach(eventName => {
        document.removeEventListener(eventName, activityHandler);
      });
      overlayParts.overlay.remove();
      window.__sessionTimeoutController = null;
    },
  };

  window.__sessionTimeoutController = controller;
  return controller;
}
