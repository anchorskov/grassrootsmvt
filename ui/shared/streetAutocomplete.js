// ui/shared/streetAutocomplete.js
// GrassrootsMVT — universal autocomplete component
// Works in both module and classic script contexts (Cloudflare Pages compatible)

import { getApiUrl, shouldBypassAuth } from '/config/environments.js';

/**
 * StreetAutocomplete
 * - Listens to text input and fetches street suggestions from /api/streets
 * - Works in dev (CORS) and production (Access) seamlessly
 * - Debounced requests with robust error handling
 */
export class StreetAutocomplete {
  /**
   * Accepts either:
   *   new StreetAutocomplete('#street', '#streetSuggestions')
   * or a config object:
   *   new StreetAutocomplete({
   *     streetInputId: 'street',
   *     suggestionsId: 'streetSuggestions',
   *     getCounty: () => 'NATRONA',
   *     getCity: () => 'CASPER',
   *     onStreetSelected: (name) => {}
   *   })
   */
  constructor(a, b) {
    // Backward compatible: two selector strings
    if (typeof a === 'string' || typeof b === 'string') {
      this.input = document.querySelector(a);
      this.dropdown = document.querySelector(b);
      this.getCounty = () => null;
      this.getCity = () => null;
      this.onStreetSelected = null;
    } else if (a && typeof a === 'object') {
      const cfg = a;
      const streetSel = cfg.streetSelector || (cfg.streetInputId ? `#${cfg.streetInputId}` : null);
      const dropSel = cfg.dropdownSelector || (cfg.suggestionsId ? `#${cfg.suggestionsId}` : null);
      this.input = streetSel ? document.querySelector(streetSel) : null;
      this.dropdown = dropSel ? document.querySelector(dropSel) : null;
      this.getCounty = typeof cfg.getCounty === 'function' ? cfg.getCounty : () => null;
      this.getCity = typeof cfg.getCity === 'function' ? cfg.getCity : () => null;
      this.onStreetSelected = typeof cfg.onStreetSelected === 'function' ? cfg.onStreetSelected : null;
    } else {
      console.warn('[StreetAutocomplete] Invalid constructor args.');
      return;
    }

    this.timer = null;
    if (!this.input || !this.dropdown) {
      console.warn('[StreetAutocomplete] Missing input or dropdown element.');
      return;
    }
    this.init();
  }

  init() {
    // Input event for typing
    this.input.addEventListener('input', e => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.lookup(e.target.value.trim()), 250);
    });

    // Focus event for showing all streets when clicked
    this.input.addEventListener('focus', async () => {
      if (this.input.value.trim() === '') {
        console.log('🎯 Street field focused, loading all streets...');
        await this.loadAllStreets();
      }
    });

    // Click-to-select on suggestion list
    this.dropdown.addEventListener('click', (e) => {
      const opt = e.target.closest('.option');
      if (!opt) return;
      const label = opt.getAttribute('data-label') || opt.textContent.trim();
      if (!label) return;
      this.input.value = label;
      this.clear();
      if (this.onStreetSelected) {
        try { this.onStreetSelected(label); } catch {}
      }
    });

    // Hide dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.input.contains(e.target) && !this.dropdown.contains(e.target)) {
        this.clear();
      }
    });
  }

  async lookup(query) {
    if (query.length < 2) return this.clear();
    const creds = shouldBypassAuth() ? 'omit' : 'include';

    try {
      const params = {
        query,                      // keep existing API shape
        county: this.getCounty ? this.getCounty() : null,
        city: this.getCity ? this.getCity() : null
      };
      const res = await fetch(getApiUrl('streets', params), {
        credentials: creds,
        headers: { Accept: 'application/json' }
      });

      if (!res.ok) {
        console.warn('[StreetAutocomplete] API returned', res.status);
        return this.clear();
      }

      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data) ? data : data.results || data.streets || [];
      if (!Array.isArray(list) || list.length === 0) return this.clear();

      this.renderSuggestions(list);

    } catch (err) {
      console.error('[StreetAutocomplete] Fetch failed:', err);
      this.clear();
    }
  }

  async loadAllStreets() {
    const creds = shouldBypassAuth() ? 'omit' : 'include';

    try {
      const params = {
        query: '',                  // Empty query
        county: this.getCounty ? this.getCounty() : null,
        city: this.getCity ? this.getCity() : null,
        limit: 100,                 // Show more streets for browsing
        showAll: true               // Flag to bypass minimum query length
      };

      // Use POST method for better parameter handling
      const res = await fetch(getApiUrl('streets'), {
        method: 'POST',
        credentials: creds,
        headers: { 
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
      });

      if (!res.ok) {
        console.warn('[StreetAutocomplete] API returned', res.status);
        this.showError('Error loading streets');
        return;
      }

      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data) ? data : data.results || data.streets || [];
      
      if (list.length === 0) {
        this.showMessage('No streets found for this area');
        return;
      }

      this.renderSuggestions(list.slice(0, 50)); // Limit for performance
      console.log(`📋 Loaded ${list.length} streets for browsing`);

    } catch (err) {
      console.error('[StreetAutocomplete] Failed to load all streets:', err);
      this.showError('Error loading streets');
    }
  }

  renderSuggestions(list) {
    this.dropdown.innerHTML = list
      .map(i => {
        const label = typeof i === 'string' ? i : (i.label || i.name || '');
        return `<div class="option" data-label="${label}">${label}</div>`;
      })
      .join('');
    
    this.dropdown.style.display = 'block';
  }

  showMessage(message) {
    this.dropdown.innerHTML = `<div class="option disabled">${message}</div>`;
    this.dropdown.style.display = 'block';
  }

  showError(message) {
    this.dropdown.innerHTML = `<div class="option error">${message}</div>`;
    this.dropdown.style.display = 'block';
  }

  clear() {
    if (this.dropdown) {
      this.dropdown.innerHTML = '';
      this.dropdown.style.display = 'none';
    }
  }
}

// Make available to non-module consumers
if (typeof window !== 'undefined') {
  window.StreetAutocomplete = StreetAutocomplete;
}
