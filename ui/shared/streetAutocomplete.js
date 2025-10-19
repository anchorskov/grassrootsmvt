// ui/js/streetAutocomplete.js
'use strict';

(function () {
  //
  // Resolve environment config robustly, with a safe same-origin fallback.
  //
  async function resolveEnv() {
    // If already present and has getApiUrl, use it.
    const ec = window.environmentConfig;
    if (ec && typeof ec.getApiUrl === 'function') return ec;

    // Try importing the module (works on CF Pages/Workers).
    try {
      const mod = await import('/config/environments.js');
      const env = mod.default || mod.environmentConfig || mod;
      if (env && typeof env.getApiUrl === 'function') {
        window.environmentConfig = env;
        return env;
      }
    } catch (_) {
      // ignore; we'll fall back below
    }

    // Last-ditch same-origin builder: /api/<endpoint>[?params]
    const fallback = {
      getApiUrl(endpoint, params = {}) {
        const ep = String(endpoint || '').replace(/^\//, '');
        const path = ep.startsWith('api/') ? `/${ep}` : `/api/${ep}`;
        const u = new URL(path, location.origin);
        Object.entries(params || {}).forEach(([k, v]) => {
          if (v != null) u.searchParams.set(k, String(v));
        });
        return u.toString();
      },
      shouldBypassAuth: () => false,
      config: { environment: 'unknown' }
    };
    window.environmentConfig = fallback;
    return fallback;
  }

  class StreetAutocomplete {
    /**
     * Supports two constructor signatures:
     * 1. StreetAutocomplete(inputEl, opts) - new API: pass DOM element directly
     * 2. StreetAutocomplete(options) - legacy API: pass options object with streetInputId
     */
    constructor(inputElOrOptions, legacyOpts = {}) {
      // Detect API usage pattern
      if (typeof inputElOrOptions === 'object' && inputElOrOptions.streetInputId) {
        // Legacy API: options object with streetInputId
        this.opts = inputElOrOptions;
        this.input = document.getElementById(this.opts.streetInputId);
        this.suggestionsEl = document.getElementById(this.opts.suggestionsId);
        
        if (!this.input) {
          throw new Error(`StreetAutocomplete: element with id '${this.opts.streetInputId}' not found`);
        }
      } else {
        // New API: input element passed directly
        if (!inputElOrOptions) throw new Error('StreetAutocomplete: input element required');
        this.input = inputElOrOptions;
        this.opts = Object.assign(
          { minChars: 2, debounceMs: 200, onSelect: null },
          legacyOpts || {}
        );
        this.suggestionsEl = null;
      }

      // Common initialization
      this.suggestions = [];
      this.highlightIndex = -1;
      this.menu = null;

      // Async init: resolve env, set URL builder, bind events.
      this._ready = this.init();
    }

    async init() {
      this.env = await resolveEnv();
      this.apiUrl = (endpoint, params = {}) => this.env.getApiUrl(endpoint, params);
      this.bind();
    }

    bind() {
      // Build dropdown container only for new API (when no suggestionsEl provided)
      if (!this.suggestionsEl) {
        this.menu = document.createElement('div');
        this.menu.style.position = 'absolute';
        this.menu.style.zIndex = '1000';
        this.menu.style.background = 'white';
        this.menu.style.border = '1px solid #cbd5e1';
        this.menu.style.borderRadius = '8px';
        this.menu.style.boxShadow = '0 2px 10px rgba(0,0,0,0.08)';
        this.menu.style.padding = '4px 0';
        this.menu.style.display = 'none';
        document.body.appendChild(this.menu);

        // Position on resize/scroll
        const reposition = () => {
          const r = this.input.getBoundingClientRect();
          this.menu.style.left = `${window.scrollX + r.left}px`;
          this.menu.style.top = `${window.scrollY + r.bottom + 4}px`;
          this.menu.style.minWidth = `${r.width}px`;
        };
        window.addEventListener('resize', reposition);
        window.addEventListener('scroll', reposition, true);
        this.input.addEventListener('focus', reposition);
      }

      // Debounced input listener
      let timer = null;
      const minChars = this.opts.minChars || 2;
      const debounceMs = this.opts.debounceMs || 200;
      
      this.input.addEventListener('input', () => {
        clearTimeout(timer);
        const q = this.input.value.trim();
        if (q.length < minChars) {
          this.hide();
          return;
        }
        timer = setTimeout(() => this.search(q), debounceMs);
      });

      // Keyboard navigation (only for new API with menu)
      if (!this.suggestionsEl) {
        this.input.addEventListener('keydown', (e) => {
          if (this.menu.style.display === 'none') return;

          if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.move(1);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.move(-1);
          } else if (e.key === 'Enter') {
            if (this.highlightIndex >= 0) {
              e.preventDefault();
              this.pick(this.suggestions[this.highlightIndex]);
            }
          } else if (e.key === 'Escape') {
            this.hide();
          }
        });
      }

      // Close on outside click
      document.addEventListener('click', (e) => {
        if (e.target === this.input) return;
        if (this.menu && this.menu.contains(e.target)) return;
        if (this.suggestionsEl && this.suggestionsEl.contains(e.target)) return;
        this.hide();
      });
    }

    async search(prefix) {
      // Ensure env is ready for first call
      if (!this.env) await this._ready;

      try {
        let data;
        
        // Check if using legacy API with custom apiRequest function
        if (this.opts.apiRequest && typeof this.opts.apiRequest === 'function') {
          // Legacy API: use custom apiRequest with county/city
          const county = this.opts.getCounty ? this.opts.getCounty() : null;
          const city = this.opts.getCity ? this.opts.getCity() : null;
          
          if (!county || !city) {
            console.warn('StreetAutocomplete: County and city required for API request');
            this.suggestions = [];
            this.render();
            return;
          }
          
          data = await this.opts.apiRequest({ county, city });
          
          // Handle legacy API response format
          this.suggestions = (data?.streets || []).map((s) =>
            typeof s === 'string' ? s : s?.name || ''
          ).filter(Boolean);
          
          // Filter by prefix locally since legacy API returns all streets
          if (prefix) {
            this.suggestions = this.suggestions.filter(street => 
              street.toUpperCase().includes(prefix.toUpperCase())
            );
          }
          
        } else {
          // New API: use neighborhoods endpoint
          const url = this.apiUrl('neighborhoods', { q: prefix, kind: 'street' });
          const r = await fetch(url, { credentials: 'include' });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          data = await r.json();

          // Expect an array of streets (string names or {name} objects)
          this.suggestions = (Array.isArray(data) ? data : data?.results || []).map((s) =>
            typeof s === 'string' ? s : s?.name || ''
          ).filter(Boolean);
        }

        this.render();
      } catch (err) {
        // Fail quietly to avoid UX noise; optionally log
        console.warn('StreetAutocomplete fetch failed:', err);
        this.suggestions = [];
        this.render();
      }
    }

    render() {
      if (!this.suggestions.length) {
        this.hide();
        return;
      }

      // Use legacy suggestions element if available, otherwise use menu
      const container = this.suggestionsEl || this.menu;
      
      if (this.suggestionsEl) {
        // Legacy API: use existing suggestions div with existing styles
        container.innerHTML = this.suggestions.map(s => 
          `<div class="autocomplete-suggestion" data-street="${s}">${s}</div>`
        ).join('');
        container.style.display = 'block';
        
        // Add click handlers for legacy API
        container.querySelectorAll('.autocomplete-suggestion').forEach(el => {
          el.addEventListener('click', () => {
            const street = el.dataset.street;
            if (street) {
              this.pick(street);
            }
          });
        });
      } else {
        // New API: use dynamically created menu
        const r = this.input.getBoundingClientRect();
        this.menu.style.left = `${window.scrollX + r.left}px`;
        this.menu.style.top = `${window.scrollY + r.bottom + 4}px`;
        this.menu.style.minWidth = `${r.width}px`;
        this.menu.innerHTML = '';

        this.suggestions.forEach((s, i) => {
          const item = document.createElement('div');
          item.textContent = s;
          item.style.padding = '6px 10px';
          item.style.cursor = 'pointer';
          item.style.whiteSpace = 'nowrap';
          item.addEventListener('mouseenter', () => this.highlight(i));
          item.addEventListener('mouseleave', () => this.highlight(-1));
          item.addEventListener('mousedown', (e) => {
            e.preventDefault(); // keep focus
            this.pick(s);
          });
          if (i === this.highlightIndex) {
            item.style.background = '#eef2ff';
          }
          this.menu.appendChild(item);
        });

        this.menu.style.display = 'block';
      }
    }

    move(delta) {
      if (!this.suggestions.length) return;
      const n = this.suggestions.length;
      this.highlightIndex = (this.highlightIndex + delta + n) % n;
      this.render();
    }

    highlight(i) {
      this.highlightIndex = i;
      // re-render minimal: toggle backgrounds
      [...this.menu.children].forEach((el, idx) => {
        el.style.background = idx === i ? '#eef2ff' : '';
      });
    }

    pick(value) {
      this.input.value = value;
      this.hide();
      
      // Handle both legacy and new API callbacks
      if (typeof this.opts.onSelect === 'function') {
        this.opts.onSelect(value);
      }
      if (typeof this.opts.onStreetSelected === 'function') {
        this.opts.onStreetSelected(value);
      }
      
      // Trigger change for any listeners
      const ev = new Event('change', { bubbles: true });
      this.input.dispatchEvent(ev);
    }

    hide() {
      if (this.suggestionsEl) {
        this.suggestionsEl.style.display = 'none';
      }
      if (this.menu) {
        this.menu.style.display = 'none';
      }
      this.highlightIndex = -1;
    }
  }

  // Expose globally
  window.StreetAutocomplete = StreetAutocomplete;
})();
