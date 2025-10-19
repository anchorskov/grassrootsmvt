// ui/js/streetAutocomplete.js
// Single-design, same-origin autocomplete for streets.
// Constructor:
//   const ac = new StreetAutocomplete(inputEl, { minChars?:2, onSelect?(value:string) })
// It calls /api/streets via env.getApiUrl('streets') with POST {county, city, q}
// You can override `ac.search = async (q)=>{...}` from the page to pass county/city.

function resolveEnv() {
  // Page may import environments.js as ESM or have window.environmentConfig already.
  if (typeof window !== 'undefined') {
    if (window.environmentConfig) return window.environmentConfig;
    if (window.GrassrootsEnv && typeof window.GrassrootsEnv.getApiUrl === 'function') {
      return {
        config: { environment: 'legacy' },
        shouldBypassAuth: () => false,
        getApiUrl: (endpoint, params = {}) => window.GrassrootsEnv.getApiUrl(endpoint, params),
        debug: (...args) => console.log('[env]', ...args),
      };
    }
  }
  return {
    config: { environment: 'unknown' },
    shouldBypassAuth: () => false,
    getApiUrl: (endpoint) => endpoint.startsWith('/') ? endpoint : `/api/${endpoint}`,
    debug: () => {},
  };
}

export class StreetAutocomplete {
  constructor(inputEl, opts = {}) {
    if (!inputEl) throw new Error('StreetAutocomplete: input element is required');
    this.env = resolveEnv();
    this.input = inputEl;
    this.opts = Object.assign({ minChars: 2, onSelect: null }, opts);
    this.suggestions = [];
    this.highlightIdx = -1;
    this.popup = null;
    this._bind();
  }

  _bind() {
    this.input.setAttribute('autocomplete', 'off');
    this.input.addEventListener('input', () => this._onInput());
    this.input.addEventListener('keydown', (e) => this._onKeydown(e));
    document.addEventListener('click', (e) => {
      if (this.popup && !this.popup.contains(e.target) && e.target !== this.input) {
        this.close();
      }
    });
  }

  async _onInput() {
    const q = this.input.value.trim();
    if (q.length < this.opts.minChars) {
      this.close();
      return;
    }
    try {
      await this.search(q);
      this.render();
    } catch (err) {
      console.warn('StreetAutocomplete search failed:', err);
      this.close();
    }
  }

  async search(q) {
    // Default search uses POST /api/streets with only q; page can override to include county/city.
    const url = this.env.getApiUrl('streets');
    const r = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q })
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    this.suggestions = (data.streets || []).map(s => s.name || s);
  }

  render() {
    if (!this.suggestions.length) {
      this.close();
      return;
    }
    if (!this.popup) {
      this.popup = document.createElement('div');
      Object.assign(this.popup.style, {
        position: 'absolute',
        zIndex: 1000,
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        boxShadow: '0 4px 14px rgba(0,0,0,.1)',
        maxHeight: '240px',
        overflowY: 'auto',
        minWidth: this.input.offsetWidth + 'px',
      });
      document.body.appendChild(this.popup);
    }
    const rect = this.input.getBoundingClientRect();
    Object.assign(this.popup.style, {
      top: `${rect.bottom + window.scrollY + 4}px`,
      left: `${rect.left + window.scrollX}px`,
      width: `${rect.width}px`,
    });

    this.popup.innerHTML = '';
    this.suggestions.forEach((text, idx) => {
      const item = document.createElement('div');
      item.textContent = text;
      Object.assign(item.style, {
        padding: '.5rem .75rem',
        cursor: 'pointer',
        borderBottom: '1px solid #f1f5f9',
        background: idx === this.highlightIdx ? '#eef6ff' : '#fff',
      });
      item.addEventListener('mouseenter', () => {
        this.highlightIdx = idx;
        this.render();
      });
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this._choose(text);
      });
      this.popup.appendChild(item);
    });
  }

  _onKeydown(e) {
    if (!this.popup) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.highlightIdx = Math.min(this.highlightIdx + 1, this.suggestions.length - 1);
      this.render();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.highlightIdx = Math.max(this.highlightIdx - 1, 0);
      this.render();
    } else if (e.key === 'Enter') {
      if (this.highlightIdx >= 0 && this.highlightIdx < this.suggestions.length) {
        e.preventDefault();
        this._choose(this.suggestions[this.highlightIdx]);
      }
    } else if (e.key === 'Escape') {
      this.close();
    }
  }

  _choose(value) {
    this.input.value = value || '';
    this.close();
    if (typeof this.opts.onSelect === 'function') {
      this.opts.onSelect(value);
    }
  }

  close() {
    this.highlightIdx = -1;
    if (this.popup && this.popup.parentNode) {
      this.popup.parentNode.removeChild(this.popup);
    }
    this.popup = null;
  }
}

// Expose on window for non-module pages if needed
if (typeof window !== 'undefined') {
  window.StreetAutocomplete = window.StreetAutocomplete || StreetAutocomplete;
}