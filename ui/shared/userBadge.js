// ui/shared/userBadge.js
// Reusable user badge module for displaying current user's email

let badgeInstance = null;
let logInit = false;

function isLocalEnv() {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

function getBadgePositionStyles(position) {
  switch (position) {
    case 'bottom-right':
      return { bottom: '10px', right: '10px', top: '', left: '' };
    case 'bottom-left':
      return { bottom: '10px', left: '10px', top: '', right: '' };
    case 'top-right':
    default:
      return { top: '10px', right: '10px', bottom: '', left: '' };
  }
}

function updateBadgeText() {
  if (!badgeInstance) return;
  if (window.currentUser && window.currentUser.loaded) {
    if (window.currentUser.email) {
      badgeInstance.textContent = `👤 ${window.currentUser.email}`;
    } else {
      badgeInstance.textContent = '🔒 Not logged in';
    }
  } else {
    badgeInstance.textContent = '👤 Loading user…';
  }
}

export function showUserBadge(options = {}) {
  const {
    timeout = 6000,
    persistent = false,
    position = 'top-right',
  } = options;

  // Create badge if not present
  if (!badgeInstance) {
    badgeInstance = document.createElement('div');
    badgeInstance.id = 'user-email-badge';
    badgeInstance.textContent = '👤 Loading user…';
    const styles = {
      position: 'fixed',
      background: 'rgba(37,99,235,0.1)',
      color: '#1e3a8a',
      fontSize: '0.85rem',
      padding: '6px 10px',
      borderRadius: '8px',
      border: '1px solid rgba(37,99,235,0.3)',
      zIndex: '9999',
      fontFamily: 'system-ui, sans-serif',
      transition: 'opacity 1s ease-out',
      opacity: '1',
      pointerEvents: 'none',
    };
    const pos = getBadgePositionStyles(position);
    Object.assign(styles, pos);
    Object.assign(badgeInstance.style, styles);
    const container = document.getElementById('user-badge-container') || document.body;
    container.appendChild(badgeInstance);
    if (!logInit) {
      logInit = true;
      console.log('[userBadge] Initialized user badge module');
    }
  } else {
    // Reposition if needed
    const pos = getBadgePositionStyles(position);
    Object.assign(badgeInstance.style, pos);
    badgeInstance.style.opacity = '1';
    badgeInstance.style.display = '';
  }

  // Wait for window.currentUser.loaded
  let waited = 0;
  const maxWait = 8000;
  function waitForUser() {
    if (window.currentUser && window.currentUser.loaded) {
      updateBadgeText();
      if (!isLocalEnv() && !persistent) {
        setTimeout(() => {
          badgeInstance.style.opacity = '0';
          setTimeout(() => {
            badgeInstance.style.display = 'none';
          }, 1000);
        }, timeout);
      }
    } else if (waited < maxWait) {
      updateBadgeText();
      waited += 200;
      setTimeout(waitForUser, 200);
    } else {
      badgeInstance.textContent = '🔒 Not logged in';
    }
  }
  waitForUser();
}
