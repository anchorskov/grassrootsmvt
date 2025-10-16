# Canvass Page Documentation

## Overview

The canvass page (`/ui/canvass/index.html`) provides a door-to-door canvassing interface for volunteers to find and contact voters in specific neighborhoods. It features advanced autocomplete functionality, progressive field enabling, and comprehensive voter lookup capabilities.

## URL Structure

The canvass page accepts filter parameters via URL query string:
```
/canvass/?county=ALBANY&city=LARAMIE&parties=Republican&parties=Democratic&parties=Unaffiliated
```

### Supported Parameters
- `county`: County name (e.g., "ALBANY")
- `city`: City name (e.g., "LARAMIE") 
- `parties`: Political party affiliations (can be repeated for multiple parties)
  - Common values: "Republican", "Democratic", "Unaffiliated"
- `district_type`: District type (optional)
- `district`: District identifier (optional)

## User Interface Components

### Instructions System
- **Toggle**: Checkbox to enable/disable step-by-step instructions (**enabled by default**)
- **Panel**: Contextual instruction display that updates based on user progress
- **Smart Updates**: Instructions change dynamically as users complete each step
- **Selection-Based**: Updates trigger primarily on dropdown selections, not continuous typing
- **States**: 
  - `street`: Initial instruction to click on street field
  - `streetFocused`: Instruction to type or select street name
  - `streetSelected`: Instruction to select house number (triggered on dropdown selection)
  - `houseSelected`: Instruction to click "Find nearby" (triggered on dropdown selection)
  - `searching`: Shows searching status
  - `results`: Confirms results found
  - `noResults`: Guides user when no results found

### Filter Display
- Shows active filters at the top of the page
- Displays parsed parameters from URL
- Format: `Filters: {"county":"ALBANY","city":"LARAMIE","parties":["Republican","Democratic","Unaffiliated"]}`

### Address Input Form
1. **House Number Field** 
   - Number input for street address
   - Initially disabled until street is selected
   - Progressive enabling based on workflow

2. **Street Field**
   - Text input with autocomplete functionality
   - Blue dropdown for street suggestions
   - On-focus loading of available streets
   - Triggers house number population when selected

3. **Number Range Field**
   - Dropdown for address range (±10, ±20, ±50, ±100)
   - Determines search radius around target address

4. **Max Addresses Field** 
   - Dropdown for result limit (5, 10, 20, 50)
   - Controls maximum number of results returned

5. **Find Nearby Button**
   - Triggers the voter lookup
   - Disabled until both house and street are provided

## Autocomplete Functionality

### Street Autocomplete
- **Trigger**: On-focus of street input field
- **Data Source**: `/api/streets` endpoint with optimized query for all unique streets
- **Behavior**: 
  - Loads ALL available streets for the filtered county/city (e.g., 2,757 streets for Casper)
  - Displays in blue dropdown menu with instant client-side filtering
  - Enables house field after selection
  - Populates house number options
  - Smart caching with automatic cache clearing on location changes

### House Number Autocomplete  
- **Trigger**: After street selection
- **Data Source**: Filtered from street selection results
- **Behavior**:
  - Shows yellow dropdown with available house numbers
  - Progressive enabling (disabled until street selected)
  - Filters numbers based on selected street

### Progressive UX Features
- **Field Dependencies**: House field disabled until street selected
- **Visual Feedback**: Color-coded dropdowns (blue for streets, yellow for houses)
- **Automatic Enabling**: Fields unlock as prerequisites are met
- **State Management**: Proper field clearing and reset on changes
- **Step-by-Step Instructions**: Optional guided workflow with contextual help
  - Toggle on/off with checkbox
  - Updates automatically as user progresses
  - Provides clear next-step guidance
  - Monitors form state and results

## API Integration

### Primary Endpoint: `/api/canvass/nearby`
**Method**: POST

**Request Body**:
```json
{
  "filters": {
    "county": "ALBANY",
    "city": "LARAMIE", 
    "parties": ["Republican", "Democratic", "Unaffiliated"]
  },
  "house": 3006,
  "street": "HAYFORD AVE",
  "range": 20,
  "limit": 20
}
```

**Response Format**:
```json
{
  "ok": true,
  "rows": [
    {
      "voter_id": "128193",
      "name": "DAVID AADLAND",
      "address": "3006 HAYFORD AVE",
      "city": "LARAMIE",
      "zip": "82072",
      "party": "Unaffiliated",
      "phone_e164": "+13073435462",
      "phone_confidence": 1
    }
  ],
  "total": 3,
  "filters_applied": {
    "county": "ALBANY",
    "city": "LARAMIE",
    "parties": ["Republican", "Democratic", "Unaffiliated"]
  }
}
```

### Database Schema Integration
The API joins across three database tables:
- **voters**: `voter_id`, `county`, `house`, `political_party`, `senate`
- **voters_addr_norm**: `voter_id`, `fn`, `ln`, `city`, `state`, `zip`  
- **best_phone**: `voter_id`, `phone_e164`, `phone_confidence`

## Results Display

### Voter Information Cards
Each result shows:
- **Name**: First and last name with voter ID
- **Address**: Complete street address
- **Location**: City, ZIP, party affiliation
- **Phone**: Phone number with confidence rating (if available)

### Action Buttons
Each voter card includes:
- **📋 Contact**: Opens enhanced contact modal with rich data collection
- **🚪 Not Home**: Quick mark as not available
- **📝 Note**: Add simple notes about interaction
- **☎️ Call**: Initiate phone call (if phone available)

### Enhanced Contact Modal
The contact modal provides comprehensive data collection:

#### **Contact Method Selection**
- 🚪 Door-to-door
- 📞 Phone call

#### **Contact Outcomes**
- ✅ Connected - Had conversation
- 💬 Brief interaction  
- 📄 Left information
- ❌ Not interested
- 🚪 No answer / Not home
- 🚫 Refused to talk
- 📍 Wrong address/moved
- ⛔ Requested Do Not Contact

#### **Progressive Data Collection**
Based on positive outcomes (Connected, Brief, Info Left):
- **Quick Captures**: Volunteer interest, update preferences, callback permission
- **Contact Information**: Email collection with consent checkboxes
- **Issue Interests**: Term limits, public lands, other topics
- **Notes**: Free-form additional details

#### **Smart Features**
- Progressive disclosure (sections appear based on selections)
- Form validation and error handling
- Visual feedback on successful submission
- Backwards compatibility with existing simple actions

## Code Architecture

### Environment Detection
- Uses `config/environments.js` for environment-aware API calls
- Automatic localhost vs production detection
- Authentication bypass in local development

### API Client Integration
- Uses `src/apiClient.js` for standardized API communication
- Fallback to direct fetch if `apiFetch` unavailable
- Proper error handling and response parsing

### Key Functions

#### `fromQS()`
Parses URL query string parameters into filter object
```javascript
function fromQS() {
  const u = new URL(location.href);
  const parties = u.searchParams.getAll('parties');
  return {
    county: (u.searchParams.get('county')||'').toUpperCase() || null,
    city: (u.searchParams.get('city')||'').toUpperCase() || null,
    parties: parties.length ? parties : []
  };
}
```

#### `findNearby()`
Main search function that calls API and renders results
```javascript
async function findNearby() {
  const house = Number(document.getElementById('house').value || 0);
  const street = (document.getElementById('street').value || '').trim().toUpperCase();
  const filters = fromQS();
  
  const j = await jsonFetch(API('/canvass/nearby'), {
    method: 'POST',
    body: JSON.stringify({ filters, house, street, range, limit })
  });
  
  renderList(j.rows || []);
}
```

#### `StreetAutocomplete` Component
Reusable street autocomplete functionality using the optimized `/api/streets` endpoint
```javascript
const streetAutocomplete = new StreetAutocomplete({
  streetInputId: 'street',
  suggestionsId: 'streetSuggestions', 
  getCounty: () => fromQS().county,
  getCity: () => fromQS().city,
  onStreetSelected: (streetName) => {
    enableHouseField();
    updateInstruction('streetSelected');
    populateHouseNumbers(streetName);
  },
  onHouseFieldChange: (enabled) => {
    if (enabled) enableHouseField();
    else disableHouseField();
  }
});
```

#### `populateHouseNumbers()`
Enables and populates house number options after street selection
```javascript
function populateHouseNumbers(selectedStreet) {
  const houses = streetCache.filter(row => 
    row.address.includes(selectedStreet)
  ).map(row => row.house);
  
  enableHouseField();
  setupHouseAutocomplete(houses);
}
```

#### `updateInstruction(step)`
Updates the instruction text based on current workflow step
```javascript
function updateInstruction(step) {
  if (!instructionsToggle.checked) return;
  currentStep = step;
  instructionText.textContent = instructions[step] || instructions.street;
}
```

#### Instructions Event Listeners
Monitors user interactions to provide contextual guidance
```javascript
// Street field events
streetInput.addEventListener('focus', () => updateInstruction('streetFocused'));
streetInput.addEventListener('input', () => {
  if (streetInput.value.trim().length > 2) {
    updateInstruction('streetSelected');
  }
});

// Results monitoring
const observer = new MutationObserver(() => {
  const hasResults = resultsDiv.children.length > 0 && 
                    !resultsDiv.textContent.includes('No nearby addresses');
  if (hasResults) {
    updateInstruction('results');
  }
});
```

## Testing and Debugging

### Debug Features
- Comprehensive console logging with emoji prefixes
- Request/response tracking
- State change monitoring
- Error handling with detailed messages

### Test Data
Works with seeded data including:
- ALBANY county, LARAMIE city
- Multiple political parties
- Sample addresses like "3006 HAYFORD AVE"
- Test voters: David, Monique, and Jake Aadland

### API Testing
Direct API testing available via curl:
```bash
curl -X POST http://localhost:8787/api/canvass/nearby \
  -H "Content-Type: application/json" \
  -d '{"filters":{"county":"ALBANY","city":"LARAMIE","parties":["Unaffiliated"]},"house":3006,"street":"HAYFORD AVE","range":20,"limit":20}'
```

## Performance Considerations

### Caching Strategy
- Street data cached after first load (`streetCache`)
- Avoids repeated API calls for autocomplete
- Efficient filtering of cached results

### Progressive Loading
- Streets loaded on-demand (on-focus)
- House numbers populated only after street selection
- Minimal initial page load

### Error Handling
- Graceful degradation if API unavailable
- User-friendly error messages
- Automatic retry capabilities

## Production Deployment

### Environment Differences
- **Local Development**: Direct worker API calls to `localhost:8787`
- **Production**: Routed through Cloudflare with authentication
- **Authentication**: Bypassed in local, required in production
- **CORS**: Handled differently in each environment

### Security
- Authentication integration via `apiClient.js`
- Secure credential handling
- Proper CORS configuration
- Input validation and sanitization