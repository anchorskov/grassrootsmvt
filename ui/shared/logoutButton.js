import { ensureFloatingStack } from './floatingStack.js';

const STYLE_ID = 'logout-pill-styles';
const BUTTON_ID = 'logout-pill-button';

function injectStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .logout-pill {
      border: none;
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.92);
      color: #f8fafc;
      font-weight: 600;
      font-size: 0.85rem;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      cursor: pointer;
      box-shadow: 0 8px 20px rgba(15, 23, 42, 0.3);
      transition: background 0.2s ease, transform 0.15s ease;
    }
    .logout-pill:hover {
      background: rgba(14, 165, 233, 0.95);
      transform: translateY(-1px);
    }
    .logout-pill__icon {
      font-size: 1rem;
      line-height: 1;
    }
  `;
  document.head.appendChild(style);
}

export function mountLogoutButton({
  label = 'Logout',
  position = 'top-right',
  onClick = null,
} = {}) {
  if (typeof document === 'undefined') return null;
  injectStyles();
  const stack = ensureFloatingStack(position);
  if (!stack) return null;

  let button = document.getElementById(BUTTON_ID);
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.id = BUTTON_ID;
    button.className = 'logout-pill';
    button.innerHTML = `<span class="logout-pill__icon">⎋</span><span>${label}</span>`;
    stack.appendChild(button);
  }

  button.onclick = () => {
    if (typeof onClick === 'function') {
      onClick();
      return;
    }
    if (window.authGlobal?.logout) {
      window.authGlobal.logout({ returnTo: '/' });
    } else {
      window.location.href = '/';
    }
  };

  return button;
}
