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
    
    this.getDistrictFilters = config.getDistrictFilters || (() => null);

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

    const region = this.getRegionContext();
    if (region.mode === 'invalid') {
      console.log('⚠️ Region context incomplete:', region.reason);
      return;
    }

    const payload = this.buildRegionPayload(region);
    if (!payload) {
      console.warn('⚠️ Unable to build region payload for houses');
      return;
    }
    payload.street = streetName.toUpperCase().trim();
    
    console.log('🏠 Loading house numbers for:', { ...payload });
    
    try {
      // Use the optimized /api/houses endpoint
      const data = await window.apiPost('houses', payload);
      
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

  getRegionContext() {
    const districtInfo = this.getNormalizedDistrictFilters();
    if (districtInfo?.mode === 'invalid') {
      return { mode: 'invalid', reason: districtInfo.reason };
    }
    if (districtInfo?.mode === 'district') {
      return districtInfo;
    }

    const county = (this.config.getCounty?.() || '').toUpperCase().trim();
    const city = (this.config.getCity?.() || '').toUpperCase().trim();
    if (county && city) {
      return { mode: 'countyCity', county, city };
    }
    if (county || city) {
      return { mode: 'invalid', reason: 'partial-county' };
    }
    return { mode: 'invalid', reason: 'missing-region' };
  }

  getNormalizedDistrictFilters() {
    const raw = typeof this.getDistrictFilters === 'function' ? this.getDistrictFilters() : null;
    if (!raw) return null;
    const type = this.normalizeDistrictType(raw.district_type ?? raw.type ?? raw.districtType ?? raw.mode);
    const code = this.normalizeDistrictCode(raw.district ?? raw.code ?? raw.districtCode ?? raw.value);
    const city = this.normalizeCityValue(raw.district_city ?? raw.city ?? raw.cityWithinDistrict);
    const hasInput = [raw.district_type, raw.type, raw.district, raw.code, raw.districtType, raw.district_city]
      .some(val => val !== undefined && val !== null && String(val).trim() !== '');
    if (type && code) {
      return { mode: 'district', district_type: type, district: code, district_city: city };
    }
    if (hasInput) {
      return { mode: 'invalid', reason: 'district-incomplete' };
    }
    return null;
  }

  normalizeDistrictType(value) {
    if (!value) return null;
    const normalized = value.toString().trim().toLowerCase();
    if (normalized === 'house' || normalized === 'senate') {
      return normalized;
    }
    return null;
  }

  normalizeDistrictCode(value) {
    if (value === null || value === undefined) return null;
    const trimmed = value.toString().trim();
    if (!trimmed) return null;
    const num = Number(trimmed);
    if (!Number.isNaN(num)) {
      return String(Math.abs(num)).padStart(2, '0');
    }
    return trimmed.toUpperCase();
  }

  buildRegionPayload(region) {
    if (!region) return null;
    if (region.mode === 'district') {
      const payload = {
        district_type: region.district_type,
        district: region.district,
      };
      if (region.district_city) {
        payload.district_city = region.district_city;
      }
      return payload;
    }
    if (region.mode === 'countyCity') {
      return {
        county: region.county,
        city: region.city,
      };
    }
    return null;
  }

  normalizeCityValue(value) {
    if (value === null || value === undefined) return null;
    const trimmed = value.toString().trim();
    if (!trimmed) return null;
    return trimmed.toUpperCase();
  }
}

// Make it globally available
window.HouseAutocomplete = HouseAutocomplete;
