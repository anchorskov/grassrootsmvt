# Street Autocomplete Component Usage Guide

## Overview
The `StreetAutocomplete` component provides intelligent street name autocomplete for any form workflow. It uses the optimized `/api/streets` endpoint with client-side caching for performance.

## Features
- **Complete Coverage**: Loads ALL streets for a county/city (e.g., 2,757 streets for Casper vs 88 from limited API)
- **Smart Caching**: One API call per county/city, then instant client-side filtering
- **Progressive Enhancement**: House field management, error handling, accessible UI
- **Reusable**: Works across all forms (contact, canvass, staging, etc.)

## Quick Start

### 1. Include the Script
```html
<script src="../shared/streetAutocomplete.js"></script>
```

### 2. HTML Structure
```html
<div class="form-group">
  <label for="street-name">Street Name *</label>
  <div class="autocomplete-container">
    <input type="text" id="street-name" placeholder="Main St" required>
    <div id="street-suggestions" class="autocomplete-suggestions"></div>
  </div>
</div>
```

### 3. Initialize Component
```javascript
const streetAutocomplete = new StreetAutocomplete({
  streetInputId: 'street-name',
  suggestionsId: 'street-suggestions',
  getCounty: () => formData.county,
  getCity: () => formData.city,
  onStreetSelected: (streetName) => {
    console.log('Street selected:', streetName);
    // Your custom logic here
  },
  onHouseFieldChange: (enabled) => {
    if (enabled) {
      enableHouseField();
    } else {
      disableHouseField();
    }
  }
});
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `streetInputId` | string | required | ID of the street input field |
| `suggestionsId` | string | required | ID of the suggestions container |
| `getCounty` | function | `() => null` | Function returning current county |
| `getCity` | function | `() => null` | Function returning current city |
| `onStreetSelected` | function | `() => {}` | Callback when street is selected |
| `onHouseFieldChange` | function | `() => {}` | Callback for house field state (enabled/disabled) |
| `apiEndpoint` | string | `http://localhost:8787/api/streets` | Street data endpoint |
| `maxSuggestions` | number | 20 | Max suggestions to display |
| `enableHouseAfterChars` | number | 3 | Characters needed to enable house field |

## Public Methods

### `clearCache()`
Clears cached streets and resets form state. Call when county/city changes.
```javascript
streetAutocomplete.clearCache();
```

### `setValue(streetName)`
Programmatically set the street value.
```javascript
streetAutocomplete.setValue('MAIN ST');
```

### `getValue()`
Get the current street value.
```javascript
const currentStreet = streetAutocomplete.getValue();
```

### `destroy()`
Clean up component (removes event listeners).
```javascript
streetAutocomplete.destroy();
```

## Usage Examples

### Contact Form Integration
```javascript
const streetAutocomplete = new StreetAutocomplete({
  streetInputId: 'street-name',
  suggestionsId: 'street-suggestions',
  getCounty: () => formData.county,
  getCity: () => formData.city,
  onStreetSelected: (streetName) => {
    enableHouseField();
    populateHouseNumbers(streetName);
    checkAddress();
  },
  onHouseFieldChange: (enabled) => {
    if (enabled) enableHouseField();
    else disableHouseField();
  }
});

// Clear cache when location changes
document.getElementById('county').addEventListener('change', () => {
  streetAutocomplete.clearCache();
});
```

### Canvass Form Integration
```javascript
const streetAutocomplete = new StreetAutocomplete({
  streetInputId: 'street',
  suggestionsId: 'streetSuggestions',
  getCounty: () => fromQS().county,
  getCity: () => fromQS().city,
  onStreetSelected: (streetName) => {
    updateInstruction('streetSelected');
    enableHouseField();
    populateHouseNumbers(streetName);
  }
});
```

### Simple Form Integration
```javascript
// Minimal setup for basic street autocomplete
const streetAutocomplete = new StreetAutocomplete({
  streetInputId: 'street-field',
  suggestionsId: 'street-dropdown',
  getCounty: () => document.getElementById('county').value,
  getCity: () => document.getElementById('city').value
});
```

## CSS Classes
The component automatically adds required CSS. You can override these classes:

- `.autocomplete-container` - Wrapper for input and suggestions
- `.autocomplete-suggestions` - Dropdown container
- `.autocomplete-suggestion` - Individual suggestion item
- `.autocomplete-suggestion:hover` - Hover state
- `.autocomplete-suggestion.loading` - Loading state
- `.autocomplete-suggestion.error` - Error state
- `.autocomplete-suggestion.no-results` - No results state

## Performance Notes
- **One Query**: Loads all streets for county/city once
- **Memory Usage**: ~50KB for large cities like Casper (2,757 streets)
- **Filtering**: Instant client-side filtering as user types
- **Caching**: 1-hour cache headers, automatic cache clearing on location change

## Migration from Old Implementation
Replace this:
```javascript
// OLD - Limited to 88 streets
setupStreetAutocomplete();
```

With this:
```javascript
// NEW - Complete coverage (2,757+ streets)
const streetAutocomplete = new StreetAutocomplete({
  streetInputId: 'street-name',
  suggestionsId: 'street-suggestions',
  getCounty: () => formData.county,
  getCity: () => formData.city,
  onStreetSelected: handleStreetSelection,
  onHouseFieldChange: handleHouseFieldState
});
```