/**
 * Reusable House Number Autocomplete Component
 * 
 * Uses the optimized /api/houses endpoint with streets_index
 * Provides autocomplete dropdown for house numbers on a selected street
 * Handles voter lookup and auto-fill functionality
 * 
 * Usage:
 * const houseAutocomplete = new HouseAutocomplete({
 *   houseInputId: 'house-number',
 *   suggestionsId: 'house-suggestions',
 *   getCounty: () => formData.county,
 *   getCity: () => formData.city,
 *   getStreet: () => formData.streetName,
 *   onHouseSelected: (houseNumber, voterData) => {
 *     console.log('House selected:', houseNumber);
 *   }
 * });
 */

class HouseAutocomplete {
  constructor(config) {
    this.config = config;
    this.houseData = [];
    this.houseNumbers = [];
    
    this.houseInput = document.getElementById(config.houseInputId);
    this.suggestions = document.getElementById(config.suggestionsId);
    
    if (!this.houseInput || !this.suggestions) {
      console.error('HouseAutocomplete: Required elements not found', {
        houseInput: !!this.houseInput,
        suggestions: !!this.suggestions
      });
      return;
    }
    
    this.setupEventListeners();
    console.log('🏠 HouseAutocomplete initialized');
  }
  
  setupEventListeners() {
    // Show house numbers on focus
    this.houseInput.addEventListener('focus', () => {
      if (!this.houseInput.disabled && this.houseNumbers.length > 0) {
        this.showSuggestions();
      }
    });
    
    // Filter house numbers as user types
    this.houseInput.addEventListener('input', () => {
      if (this.houseInput.disabled) return;
      
      const value = this.houseInput.value.trim();
      
      if (this.houseNumbers.length > 0) {
        if (value.length === 0) {
          this.showSuggestions();
        } else {
          this.filterSuggestions(value);
        }
      }
      
      // Trigger callback for validation/checking
      if (value.length > 0 && this.config.onHouseInput) {
        this.config.onHouseInput(value);
      }
    });
    
    // Handle house number selection
    this.suggestions.addEventListener('click', (e) => {
      const suggestion = e.target.closest('.autocomplete-suggestion');
      if (suggestion) {
        const houseNum = suggestion.dataset.house;
        this.selectHouse(houseNum);
      }
    });
    
    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.suggestions.contains(e.target) && e.target !== this.houseInput) {
        this.hideSuggestions();
      }
    });
  }
  
  async loadHouseNumbers(streetName) {
    if (!streetName) {
      console.log('⚠️ No street name provided');
      return;
    }
    
    const county = this.config.getCounty();
    const city = this.config.getCity();
    
    if (!county || !city) {
      console.log('⚠️ County or city not available');
      return;
    }
    
    console.log('🏠 Loading house numbers for:', { county, city, street: streetName });
    
    try {
      // Use the optimized /api/houses endpoint
      const data = await window.apiPost('houses', {
        county: county,
        city: city,
        street: streetName
      });
      
      console.log('📡 Full API response:', JSON.stringify(data, null, 2));
      console.log('📡 data.ok:', data.ok);
      console.log('📡 data.houses:', data.houses);
      console.log('📡 data.houses?.length:', data.houses?.length);
      
      if (data.ok && data.houses && data.houses.length > 0) {
        this.houseData = data.houses;
        this.houseNumbers = data.houses
          .map(h => h.house_number)
          .filter(Boolean)
          .sort((a, b) => parseInt(a) - parseInt(b));
        
        console.log('✅ Loaded', this.houseNumbers.length, 'house numbers');
        
        // Auto-show suggestions after loading (like the old implementation)
        if (this.config.autoShow !== false) {
          console.log('🎯 Auto-showing suggestions after load');
          this.showSuggestions();
        }
        
        // Callback for loaded houses
        if (this.config.onHousesLoaded) {
          this.config.onHousesLoaded(this.houseNumbers, this.houseData);
        }
        
        return this.houseNumbers;
      } else {
        console.log('⚠️ No house numbers found. Response:', { ok: data.ok, hasHouses: !!data.houses, length: data.houses?.length });
        this.houseData = [];
        this.houseNumbers = [];
        return [];
      }
    } catch (error) {
      console.error('❌ Failed to load house numbers:', error);
      this.houseData = [];
      this.houseNumbers = [];
      return [];
    }
  }
  
  showSuggestions() {
    console.log('🎯 showSuggestions called. House numbers:', this.houseNumbers.length);
    
    if (this.houseNumbers.length === 0) {
      console.log('⚠️ No house numbers to show');
      return;
    }
    
    const html = this.houseNumbers.slice(0, 15).map(num => 
      `<div class="autocomplete-suggestion" data-house="${num}">${num}</div>`
    ).join('');
    
    console.log('📝 Generated HTML for', this.houseNumbers.slice(0, 15).length, 'houses');
    console.log('📍 Suggestions element:', this.suggestions);
    
    this.suggestions.innerHTML = html;
    this.suggestions.style.display = 'block';
    this.suggestions.style.backgroundColor = '#fef3c7'; // Light yellow highlight
    
    console.log('✅ Suggestions displayed, element visible:', this.suggestions.style.display);
  }
  
  filterSuggestions(value) {
    const matches = this.houseNumbers.filter(num => num.startsWith(value)).slice(0, 15);
    
    if (matches.length > 0) {
      this.suggestions.innerHTML = matches.map(num => 
        `<div class="autocomplete-suggestion" data-house="${num}">${num}</div>`
      ).join('');
      this.suggestions.style.display = 'block';
    } else {
      this.hideSuggestions();
    }
  }
  
  hideSuggestions() {
    this.suggestions.style.display = 'none';
  }
  
  selectHouse(houseNumber) {
    this.houseInput.value = houseNumber;
    this.hideSuggestions();
    
    console.log('🏠 House number selected:', houseNumber);
    
    // Find matching house data
    const matchingHouse = this.houseData.find(h => h.house_number === houseNumber);
    
    // Trigger callback
    if (this.config.onHouseSelected) {
      this.config.onHouseSelected(houseNumber, matchingHouse);
    }
  }
  
  enable() {
    this.houseInput.disabled = false;
    this.houseInput.placeholder = "e.g. 5201";
    this.houseInput.style.backgroundColor = "";
    this.houseInput.style.cursor = "";
  }
  
  disable() {
    this.houseInput.disabled = true;
    this.houseInput.value = "";
    this.houseInput.placeholder = "Select street first";
    this.houseData = [];
    this.houseNumbers = [];
    this.hideSuggestions();
  }
  
  clear() {
    this.houseInput.value = "";
    this.houseData = [];
    this.houseNumbers = [];
    this.hideSuggestions();
  }
  
  getValue() {
    return this.houseInput.value.trim();
  }
  
  getHouseData(houseNumber) {
    return this.houseData.find(h => h.house_number === houseNumber);
  }
}

// Make it globally available
window.HouseAutocomplete = HouseAutocomplete;
