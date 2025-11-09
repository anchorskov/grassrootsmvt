const STACK_PREFIX = 'floating-ui-stack';
const STACK_STYLE_ID = 'floating-ui-stack-styles';
const STACK_CLASS = 'floating-ui-stack';

const STACK_POSITIONS = {
  'top-left':   { top: '12px', left: '12px' },
  'top-right':  { top: '12px', right: '12px' },
  'bottom-left': { bottom: '12px', left: '12px' },
  'bottom-right': { bottom: '12px', right: '12px' },
};

function injectStackStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STACK_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STACK_STYLE_ID;
  style.textContent = `
    .${STACK_CLASS} {
      position: fixed;
      display: flex;
      flex-direction: column;
      gap: 10px;
      z-index: 250;
      pointer-events: none;
    }
    .${STACK_CLASS} > * {
      pointer-events: auto;
    }
  `;
  document.head.appendChild(style);
}

function getPositionCoords(position) {
  return STACK_POSITIONS[position] || STACK_POSITIONS['top-left'];
}

export function ensureFloatingStack(position = 'top-left') {
  if (typeof document === 'undefined') return null;
  injectStackStyles();
  const id = `${STACK_PREFIX}-${position}`;
  let stack = document.getElementById(id);
  if (!stack) {
    stack = document.createElement('div');
    stack.id = id;
    stack.className = `${STACK_CLASS} ${STACK_CLASS}--${position}`;
    document.body.appendChild(stack);
  }
  const coords = getPositionCoords(position);
  stack.style.alignItems = position.endsWith('right') ? 'flex-end' : 'flex-start';
  stack.style.top = '';
  stack.style.right = '';
  stack.style.bottom = '';
  stack.style.left = '';
  Object.assign(stack.style, coords);
  return stack;
}
