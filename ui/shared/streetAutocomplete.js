/**
 * Reusable Street Autocomplete Component
 * 
 * Provides intelligent street name autocomplete for any form workflow.
 * Uses optimized /api/streets endpoint with client-side caching for performance.
 * 
 * Usage:
 *   const autocomplete = new StreetAutocomplete({
 *     streetInputId: 'street-name',
 *     suggestionsId: 'street-suggestions', 
 *     getCounty: () => formData.county,
 *     getCity: () => formData.city,
 *     onStreetSelected: (streetName) => { ... },
 *     onHouseFieldChange: (enabled) => { ... }
 *   });
 */

class StreetAutocomplete {
  constructor(options) {
    // Validate required options
    this.streetInput = document.getElementById(options.streetInputId);
    this.suggestions = document.getElementById(options.suggestionsId);
    
    if (!this.streetInput || !this.suggestions) {
      throw new Error('Street input and suggestions elements are required');
    }
    
    // Configuration
    this.getCounty = options.getCounty || (() => null);
    this.getCity = options.getCity || (() => null);
    this.onStreetSelected = options.onStreetSelected || (() => {});
    this.onHouseFieldChange = options.onHouseFieldChange || (() => {});
    this.apiEndpoint = options.apiEndpoint || (() => {
      if (window.GrassrootsEnv) return window.GrassrootsEnv.getApiUrl('/api/streets');
      if (window.environmentConfig) return window.environmentConfig.getApiUrl('streets');
      // Final fallback - avoid hard-coded origins
      const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      return (isLocal ? 'http://localhost:8787' : 'https://api.grassrootsmvt.org') + '/api/streets';
    })();
    this.apiRequest = options.apiRequest || null; // Custom API request function
    this.maxSuggestions = options.maxSuggestions || 20;
    this.enableHouseAfterChars = options.enableHouseAfterChars || 3;
    
    // State
    this.allStreets = [];
    this.currentCounty = null;
    this.currentCity = null;
    this.isLoading = false;
    
    this.init();
  }
  
  init() {
    this.setupEventListeners();
    this.addStyles();
  }
  
  setupEventListeners() {
    // Focus event - load streets if needed
    this.streetInput.addEventListener('focus', () => this.handleFocus());
    
    // Input event - filter streets and manage house field
    this.streetInput.addEventListener('input', () => this.handleInput());
    
    // Click event - handle suggestion selection
    this.suggestions.addEventListener('click', (e) => this.handleSuggestionClick(e));
    
    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => this.handleOutsideClick(e));
  }
  
  addStyles() {
    // Ensure required CSS classes exist
    if (!document.querySelector('style[data-street-autocomplete]')) {
      const style = document.createElement('style');
      style.setAttribute('data-street-autocomplete', 'true');
      style.textContent = `
        .autocomplete-container { position: relative; }
        .autocomplete-suggestions { 
          position: absolute; 
          top: 100%; 
          left: 0; 
          right: 0; 
          background: white; 
          border: 2px solid #2563eb; 
          border-top: none; 
          border-radius: 0 0 10px 10px; 
          max-height: 200px; 
          overflow-y: auto; 
          z-index: 9999; 
          display: none; 
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        .autocomplete-suggestion { 
          padding: 12px 16px; 
          cursor: pointer; 
          border-bottom: 1px solid #f1f5f9; 
          font-weight: 500;
          background: white;
        }
        .autocomplete-suggestion:hover { background: #f8fafc; border-color: #e2e8f0; }
        .autocomplete-suggestion:last-child { border-bottom: none; }
        .autocomplete-suggestion.loading { color: #6b7280; font-style: italic; }
        .autocomplete-suggestion.error { color: #dc2626; }
        .autocomplete-suggestion.no-results { color: #6b7280; font-style: italic; }
      `;
      document.head.appendChild(style);
    }
  }
  
  async handleFocus() {
    const county = this.getCounty();
    const city = this.getCity();
    
    console.log('🎯 Street input focused, location:', { county, city });
    
    if (!county || !city) {
      console.warn('⚠️ Missing county or city for street loading');
      this.showMessage('Please select county and city first', 'no-results');
      return;
    }
    
    // Check if we need to reload streets
    if (this.needsReload(county, city)) {
      console.log('🔄 Need to reload streets for', { county, city });
      await this.loadStreets(county, city);
    } else if (this.allStreets.length > 0) {
      // Show existing streets
      console.log('✅ Using cached streets:', this.allStreets.length);
      this.showStreetSuggestions(this.allStreets, '');
    }
  }
  
  handleInput() {
    const value = this.streetInput.value.toUpperCase().trim();
    
    // Filter existing streets
    if (this.allStreets.length > 0) {
      this.showStreetSuggestions(this.allStreets, value);
    }
    
    // Manage house field state
    if (value.length === 0) {
      this.onHouseFieldChange(false); // Disable house field
    } else if (value.length >= this.enableHouseAfterChars) {
      this.onHouseFieldChange(true); // Enable house field
    }
  }
  
  handleSuggestionClick(e) {
    if (e.target.classList.contains('autocomplete-suggestion') && e.target.dataset.street) {
      const streetName = e.target.dataset.street;
      this.streetInput.value = streetName;
      this.suggestions.style.display = 'none';
      
      // Enable house field and notify parent
      this.onHouseFieldChange(true);
      this.onStreetSelected(streetName);
    }
  }
  
  handleOutsideClick(e) {
    if (!this.streetInput.contains(e.target) && !this.suggestions.contains(e.target)) {
      this.suggestions.style.display = 'none';
    }
  }
  
  needsReload(county, city) {
    return this.currentCounty !== county || 
           this.currentCity !== city || 
           this.allStreets.length === 0;
  }
  
  async loadStreets(county, city) {
    if (this.isLoading) return;
    
    console.log('🔄 Starting loadStreets for:', { county, city });
    console.log('🔧 API configuration:', { 
      hasApiRequest: !!this.apiRequest, 
      apiEndpoint: this.apiEndpoint 
    });
    
    this.isLoading = true;
    this.showMessage('Loading streets...', 'loading');
    
    try {
      let data;
      
      if (this.apiRequest) {
        // Use custom API request function (with authentication)
        console.log('🔗 Using custom apiRequest function');
        data = await this.apiRequest({ county, city });
        console.log('📡 API response received:', data);
      } else {
        // Use direct fetch (fallback)
        console.log('🌐 Using direct fetch to:', this.apiEndpoint);
        const response = await fetch(this.apiEndpoint, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ county, city })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        data = await response.json();
        console.log('📡 Fetch response received:', data);
      }
      
      if (data.streets && data.streets.length > 0) {
        // Cache streets and location
        this.allStreets = data.streets.map(s => s.name).sort();
        this.currentCounty = county;
        this.currentCity = city;
        
        console.log(`✅ Loaded ${this.allStreets.length} streets for ${county}/${city}`);
        
        // Show all streets initially
        this.showStreetSuggestions(this.allStreets, '');
      } else {
        this.showMessage('No streets found for this area', 'no-results');
      }
    } catch (error) {
      console.error('Failed to load streets:', error);
      this.showMessage('Error loading streets', 'error');
    } finally {
      this.isLoading = false;
    }
  }
  
  showStreetSuggestions(streets, filterText) {
    const filteredStreets = filterText ? 
      streets.filter(street => street.includes(filterText)).slice(0, this.maxSuggestions) :
      streets.slice(0, this.maxSuggestions);
      
    if (filteredStreets.length > 0) {
      this.suggestions.innerHTML = filteredStreets.map(street => 
        `<div class="autocomplete-suggestion" data-street="${street}">${street}</div>`
      ).join('');
      this.suggestions.style.display = 'block';
      this.suggestions.style.backgroundColor = '#f0f9ff';
    } else if (filterText) {
      this.showMessage('No matching streets found', 'no-results');
    }
  }
  
  showMessage(message, className = '') {
    this.suggestions.innerHTML = `<div class="autocomplete-suggestion ${className}">${message}</div>`;
    this.suggestions.style.display = 'block';
  }
  
  // Public methods for external control
  clearCache() {
    this.allStreets = [];
    this.currentCounty = null;
    this.currentCity = null;
    this.streetInput.value = '';
    this.suggestions.style.display = 'none';
    this.onHouseFieldChange(false);
  }
  
  setValue(streetName) {
    this.streetInput.value = streetName;
    this.suggestions.style.display = 'none';
    if (streetName && streetName.length >= this.enableHouseAfterChars) {
      this.onHouseFieldChange(true);
    }
  }
  
  getValue() {
    return this.streetInput.value;
  }
  
  destroy() {
    // Clean up event listeners if needed
    this.suggestions.style.display = 'none';
  }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StreetAutocomplete;
}

// Also attach to window for direct script inclusion
if (typeof window !== 'undefined') {
  window.StreetAutocomplete = StreetAutocomplete;
}