import { ensureFloatingStack } from './floatingStack.js';

const STYLE_ID = 'help-modal-styles';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .help-toggle {
      position: relative;
      background: rgba(15, 23, 42, 0.85);
      color: white;
      padding: 6px 12px;
      border-radius: 999px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.9rem;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.2);
    }
    .help-toggle input {
      width: 36px;
      height: 20px;
      appearance: none;
      background: rgba(255, 255, 255, 0.3);
      border-radius: 999px;
      position: relative;
      cursor: pointer;
      outline: none;
      transition: background 0.2s ease-in-out;
    }
    .help-toggle input:checked {
      background: #38bdf8;
    }
    .help-toggle input::after {
      content: '';
      width: 16px;
      height: 16px;
      background: white;
      border-radius: 50%;
      position: absolute;
      top: 2px;
      left: 2px;
      transition: transform 0.2s ease-in-out;
    }
    .help-toggle input:checked::after {
      transform: translateX(16px);
    }
    .help-modal {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.65);
      z-index: 200;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .help-modal.open {
      display: flex;
    }
    .help-modal__card {
      background: white;
      color: #0f172a;
      width: min(900px, 90vw);
      max-height: 90vh;
      border-radius: 16px;
      box-shadow: 0 20px 40px rgba(15, 23, 42, 0.25);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .help-modal__header {
      padding: 16px 24px;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .help-modal__title {
      font-size: 1.1rem;
      font-weight: 600;
      margin: 0;
    }
    .help-modal__close {
      background: transparent;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: #475569;
    }
    .help-modal__body {
      padding: 20px 24px;
      overflow-y: auto;
      line-height: 1.6;
    }
    .help-modal__body h1,
    .help-modal__body h2,
    .help-modal__body h3 {
      margin-top: 1.25rem;
      margin-bottom: 0.5rem;
      color: #0f172a;
    }
    .help-modal__body ul {
      padding-left: 1.25rem;
      margin: 0.75rem 0;
    }
    .help-modal__body ol {
      padding-left: 1.25rem;
      margin: 0.75rem 0;
    }
    .help-modal__body p {
      margin: 0.5rem 0;
    }
    .help-modal__body strong {
      color: #0f172a;
    }
    .help-modal__loading {
      text-align: center;
      color: #475569;
    }
  `;
  document.head.appendChild(style);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applyInlineFormatting(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

function markdownToHtml(markdown) {
  const lines = markdown.split(/\r?\n/);
  let html = '';
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      html += '</ul>';
      inUl = false;
    }
    if (inOl) {
      html += '</ol>';
      inOl = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      closeLists();
      html += '<p></p>';
      continue;
    }

    if (trimmed.startsWith('### ')) {
      closeLists();
      html += `<h3>${applyInlineFormatting(escapeHtml(trimmed.slice(4).trim()))}</h3>`;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      closeLists();
      html += `<h2>${applyInlineFormatting(escapeHtml(trimmed.slice(3).trim()))}</h2>`;
      continue;
    }
    if (trimmed.startsWith('# ')) {
      closeLists();
      html += `<h1>${applyInlineFormatting(escapeHtml(trimmed.slice(2).trim()))}</h1>`;
      continue;
    }

    const olMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (olMatch) {
      if (!inOl) {
        closeLists();
        html += '<ol>';
        inOl = true;
      }
      html += `<li>${applyInlineFormatting(escapeHtml(olMatch[2]))}</li>`;
      continue;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inUl) {
        closeLists();
        html += '<ul>';
        inUl = true;
      }
      html += `<li>${applyInlineFormatting(escapeHtml(trimmed.slice(2).trim()))}</li>`;
      continue;
    }

    closeLists();
    html += `<p>${applyInlineFormatting(escapeHtml(trimmed))}</p>`;
  }

  closeLists();
  return html;
}

async function fetchHelpContent(path) {
  const response = await fetch(path, { headers: { 'Cache-Control': 'no-cache' } });
  if (!response.ok) {
    throw new Error(`Unable to load help content (${response.status})`);
  }
  const text = await response.text();
  return markdownToHtml(text);
}

export function initHelpModal({
  helpPath,
  title = 'Instructions',
  toggleLabel = 'Show instructions',
  position = 'top-right',
} = {}) {
  if (!helpPath) {
    console.warn('[helpModal] helpPath is required');
    return;
  }

  injectStyles();

  const modal = document.createElement('div');
  modal.className = 'help-modal';
  modal.innerHTML = `
    <div class="help-modal__card" role="dialog" aria-modal="true" aria-labelledby="help-modal-title">
      <div class="help-modal__header">
        <h2 class="help-modal__title" id="help-modal-title">${title}</h2>
        <button class="help-modal__close" aria-label="Close help">&times;</button>
      </div>
      <div class="help-modal__body">
        <div class="help-modal__loading">Loading instructions…</div>
      </div>
    </div>
  `;

  const toggle = document.createElement('label');
  toggle.className = 'help-toggle';
  toggle.style.pointerEvents = 'auto';
  toggle.innerHTML = `
    <span>${toggleLabel}</span>
    <input type="checkbox" aria-label="${toggleLabel}">
  `;

  document.body.appendChild(modal);
  const floatingStack = ensureFloatingStack(position);
  floatingStack.appendChild(toggle);

  const checkbox = toggle.querySelector('input');
  const closeBtn = modal.querySelector('.help-modal__close');
  const body = modal.querySelector('.help-modal__body');
  let loaded = false;
  let loading = false;

  const close = () => {
    checkbox.checked = false;
    modal.classList.remove('open');
  };

  const open = async () => {
    modal.classList.add('open');
    if (loaded || loading) return;
    loading = true;
    try {
      const html = await fetchHelpContent(helpPath);
      body.innerHTML = html;
      loaded = true;
    } catch (err) {
      console.error('[helpModal] failed to load help content', err);
      body.innerHTML = `<p style="color:#dc2626;">Unable to load help content. Please try again.</p>`;
    } finally {
      loading = false;
    }
  };

  checkbox.addEventListener('change', () => {
    if (checkbox.checked) {
      open();
    } else {
      close();
    }
  });

  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', event => {
    if (event.target === modal) {
      close();
    }
  });
}
