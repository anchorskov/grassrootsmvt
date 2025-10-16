# 💡 COPILOT INSTRUCTION — UI-to-API Integration for Volunteer Actions

**Files:**
- `/ui/volunteer/phone.html`
- `/ui/volunteer/canvass.html`

## 🎯 Goal
Replace placeholder UI actions with real API calls to the production D1-backed endpoints.

## ✅ Requirements

### 1. Real Voter Data Loading
Replace fake voter lists with `/api/voters` results:

```javascript
// Replace placeholder arrays with:
async function fetchVoters() {
  const { house, city } = parseUrlParams();
  const query = [];
  if (house) query.push(`house_district=${encodeURIComponent(house)}`);
  if (city) query.push(`city=${encodeURIComponent(city)}`);
  
  const response = await authenticatedFetch(`/api/voters${query.length ? '?' + query.join('&') : ''}`);
  const data = await response.json();
  return data.voters || [];
}
```

### 2. Dynamic Template Loading
Populate message templates dynamically from `/api/templates`:

```javascript
// Phone banking templates
const templatesResp = await authenticatedFetch('/api/templates?category=phone');
const templatesData = await templatesResp.json();
const phoneTemplates = templatesData.templates || [];

// Canvassing templates  
const templatesResp = await authenticatedFetch('/api/templates?category=canvass');
const templatesData = await templatesResp.json();
const canvassTemplates = templatesData.templates || [];

// Populate dropdown
const pitchSelect = document.getElementById('pitch');
templates.forEach(template => {
  const option = document.createElement('option');
  option.value = template.template_name;
  option.textContent = template.template_name;
  pitchSelect.appendChild(option);
});
```

### 3. Volunteer Action Logging
Log volunteer actions to respective endpoints:

#### Phone Banking → `/api/call`
```javascript
async function submitCall() {
  const payload = {
    voter_id: currentVoter.voter_id,
    call_result: document.querySelector('input[name="result"]:checked').value,
    notes: document.getElementById('notes').value,
    pulse_opt_in: document.getElementById('pulseOptIn').checked,
    pitch_used: document.getElementById('pitch').value
  };
  
  const response = await authenticatedFetch('/api/call', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
```

#### Canvassing → `/api/canvass`
```javascript
async function submitCanvass() {
  const payload = {
    voter_id: currentVoter.voter_id,
    result: document.querySelector('input[name="result"]:checked').value,
    notes: document.getElementById('notes').value,
    pulse_opt_in: document.getElementById('pulseOptIn').checked,
    pitch_used: document.getElementById('pitch').value,
    location_lat: locationLat,
    location_lng: locationLng,
    door_status: document.getElementById('doorStatus').value,
    followup_needed: document.getElementById('followUp').checked
  };
  
  const response = await authenticatedFetch('/api/canvass', {
    method: 'POST', 
    body: JSON.stringify(payload)
  });
}
```

#### Pulse Opt-ins → `/api/pulse`
```javascript
// If pulse opt-in is checked, submit separately
if (payload.pulse_opt_in) {
  await authenticatedFetch('/api/pulse', {
    method: 'POST',
    body: JSON.stringify({ 
      voter_id: payload.voter_id, 
      contact_method: 'sms', 
      consent_source: 'call' // or 'canvass'
    })
  });
}
```

### 4. API Client Wrapper Usage
Use `authenticatedFetch()` wrapper for all requests (from JWT integration).

### 5. UI Feedback System
Show UI feedback with toast notifications:

```javascript
function showMessage(message, type) {
  const toast = document.createElement('div');
  toast.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 ${
    type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
  }`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.remove(), 3000);
}

// Usage:
showMessage('✅ Call logged successfully', 'success');
showMessage('⚠️ Network issue, please retry', 'error');
```

### 6. Retry Logic
Include retry logic on 500 or network errors (max 3 retries):

```javascript
async function retryableAPICall(url, options, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await authenticatedFetch(url, options);
      if (response.ok) return response;
      
      if (attempt === maxRetries) {
        throw new Error(`API call failed after ${maxRetries} attempts`);
      }
      
      // Exponential backoff: 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
    } catch (error) {
      if (attempt === maxRetries) throw error;
    }
  }
}
```

### 7. Automatic Next Voter Loading
Automatically load the next voter after submission:

```javascript
async function moveToNextVoter() {
  currentIndex++;
  if (currentIndex < voters.length) {
    showCurrentVoter(); // Display next voter
  } else {
    showCompletionMessage(); // All voters contacted
  }
}
```

## 🔧 Implementation Steps

1. **Replace voter data loading** with real `/api/voters` calls
2. **Connect template loading** from `/api/templates` endpoints  
3. **Implement call submission** to `/api/call` endpoint
4. **Implement canvass submission** to `/api/canvass` endpoint
5. **Add pulse opt-in integration** with `/api/pulse` endpoint
6. **Add error handling and retry logic** for network failures
7. **Implement success/error toast notifications**
8. **Test automatic voter progression** after successful submission

## 🧪 Testing Checklist

- [ ] Voter data loads from real API (not placeholder arrays)
- [ ] Message templates populate dynamically in dropdowns
- [ ] Phone banking form submits successfully to `/api/call`
- [ ] Canvassing form submits successfully to `/api/canvass`  
- [ ] Pulse opt-ins are recorded via `/api/pulse`
- [ ] Error handling shows user-friendly messages
- [ ] Retry logic works for network failures
- [ ] Next voter loads automatically after submission
- [ ] All data persists correctly in D1 database

---

## 📘 After Completion — Request Summary

**📘 UI–API Integration Summary**
✅ phone.html and canvass.html use live D1 voter data  
✅ Templates load dynamically  
✅ Volunteer actions persist in call_activity and canvass_activity  
✅ Pulse opt-ins recorded in pulse_optins  
✅ End-to-end tested with production API