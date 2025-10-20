// File: /ui/canvass/canvass.js
import env from '/config/environments.js';
import { StreetAutocomplete } from '/shared/streetAutocomplete.js';
import { ensureAccess, showUserBadge } from '/js/auth-bootstrap.js';

//
// === INIT + AUTH ===
//
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Canvass module loaded');
  await ensureAccess(env);

  const badge = document.querySelector('.online-indicator');
  await showUserBadge(env, badge);

  // Make env globally accessible for event handlers
  window.environmentConfig = env;

  setupAutocomplete();
  setupEventListeners();
  showFiltersBadge(fromQuery());
});

//
// === HELPERS ===
//
const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => [...document.querySelectorAll(sel)];
const API = (p) => env.getApiUrl(p.replace(/^\/?(api\/)?/, 'api/'));

function fromQuery() {
  const u = new URL(location.href);
  const parties = u.searchParams.getAll('parties');
  return {
    county: (u.searchParams.get('county') || '').toUpperCase() || null,
    city: (u.searchParams.get('city') || '').toUpperCase() || null,
    district_type: u.searchParams.get('district_type') || null,
    district: u.searchParams.get('district') || null,
    parties: parties.length ? parties : [],
  };
}

function showFiltersBadge(filters) {
  const badge = qs('#filtersBadge');
  badge.textContent = 'Filters: ' + JSON.stringify(filters);
}

function setMsg(text) {
  qs('#msg').textContent = text || '';
}

function toast(message, ms = 800) {
  const t = qs('#toast');
  t.textContent = message;
  t.style.display = 'block';
  setTimeout(() => (t.style.display = 'none'), ms);
}

function resetSearch() {
  // Clear form inputs
  qs('#street').value = '';
  qs('#house').value = '';
  
  // Reset house field state
  const houseInput = qs('#house');
  houseInput.disabled = true;
  houseInput.placeholder = 'Select street first';
  
  // Hide suggestions
  qs('#streetSuggestions').style.display = 'none';
  qs('#houseSuggestions').style.display = 'none';
  
  // Clear results and messages
  qs('#results').innerHTML = '';
  setMsg('');
  
  // Hide reset button
  const resetBtn = qs('#resetBtn');
  if (resetBtn) {
    resetBtn.style.display = 'none';
  }
  
  // Focus on street input for new search
  qs('#street').focus();
  
  console.log('🔄 Search reset - ready for new street selection');
}

function showResetButton() {
  // Check if reset button already exists
  let resetBtn = qs('#resetBtn');
  if (!resetBtn) {
    // Create reset button and add it to the button container
    resetBtn = document.createElement('button');
    resetBtn.id = 'resetBtn';
    resetBtn.className = 'primary';
    resetBtn.textContent = '🔄 New Search';
    resetBtn.style.flex = '1';
    resetBtn.style.minWidth = '120px';
    resetBtn.onclick = resetSearch;
    
    // Add it to the button container div
    const findBtn = qs('#btnFind');
    const buttonContainer = findBtn.parentNode;
    buttonContainer.appendChild(resetBtn);
  }
  
  resetBtn.style.display = 'block';
}

//
// === AUTOCOMPLETE SETUP ===
//
function setupAutocomplete() {
  const filters = fromQuery();
  const houseInput = qs('#house');
  const streetInput = qs('#street');
  const houseSuggestions = qs('#houseSuggestions');

  const streetAutocomplete = new StreetAutocomplete({
    streetInputId: 'street',
    suggestionsId: 'streetSuggestions',
    getCounty: () => filters.county,
    getCity: () => filters.city,
    onStreetSelected: async (streetName) => {
      enableHouseField();
      await populateHouseNumbers(streetName, filters);
    },
  });

  function enableHouseField() {
    houseInput.disabled = false;
    houseInput.placeholder = 'e.g. 5201';
  }

  async function populateHouseNumbers(streetName, filters) {
    try {
      const response = await fetch(API('canvass/nearby'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters, street: streetName, limit: 100 }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const numbers = [...new Set(
        data.rows
          .map((r) => r.address.match(/^(\d+)/)?.[1])
          .filter(Boolean)
      )].sort((a, b) => a - b);

      // Set up suggestions
      houseSuggestions.innerHTML = numbers
        .slice(0, 15)
        .map((n) => `<div class="autocomplete-suggestion" data-house="${n}">${n}</div>`)
        .join('');
      houseSuggestions.style.display = 'block';
      houseSuggestions.onclick = (e) => {
        if (e.target.dataset.house) {
          houseInput.value = e.target.dataset.house;
          houseSuggestions.style.display = 'none';
        }
      };
    } catch (err) {
      console.warn('Failed to populate house numbers', err);
    }
  }
}

//
// === API LOGIC ===
//
async function findNearby() {
  const house = Number(qs('#house').value || 0);
  const street = (qs('#street').value || '').trim().toUpperCase();
  const range = Number(qs('#range').value);
  const limit = Number(qs('#limit').value);
  const filters = fromQuery();

  if (!house || !street) {
    setMsg('Enter a house number and street.');
    return;
  }

  setMsg('Searching…');

  try {
    const response = await fetch(API('canvass/nearby'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filters, house, street, range, limit }),
    });

    if (!response.ok) throw new Error('HTTP ' + response.status);
    const json = await response.json();

    await renderList(json.rows || []);
    setMsg(`Found ${json.rows?.length || 0} nearby addresses.`);
    showResetButton();
  } catch (e) {
    console.error('Error in findNearby:', e);
    setMsg('Error: ' + e.message);
  }
}

//
// === RESULT RENDERING ===
//
async function renderList(rows) {
  const el = qs('#results');
  el.innerHTML = '';

  if (!rows.length) {
    el.innerHTML = '<div class="muted">No nearby addresses.</div>';
    return;
  }

  // Optional: fetch contact status
  let contactStatus = {};
  try {
    const voter_ids = rows.map((r) => r.voter_id).join(',');
    const res = await fetch(API(`contact/status?voter_ids=${voter_ids}`), { credentials: 'include' });
    if (res.ok) contactStatus = (await res.json()).contacts || {};
  } catch (err) {
    console.warn('Contact status failed:', err);
  }

  for (const r of rows) {
    const contact = contactStatus[r.voter_id];
    const contactInfo = contact
      ? `
        <div style="margin-top:4px; padding:4px 8px; background:#f8fafc; border-left:3px solid #2563eb; font-size:0.85rem;">
          📋 ${contact.outcome} by ${contact.volunteer_email?.split('@')[0] || 'Unknown'}
        </div>
      `
      : '';

    const div = document.createElement('div');
    div.innerHTML = `
      <div class="person-name">${r.name || 'Name Unknown'} 
        <span style="font-size:0.8rem;font-weight:400;color:#64748b;">(ID: ${r.voter_id})</span>
      </div>
      <div class="addr">${r.address}</div>
      <div class="location-details">${r.city || ''} ${r.zip || ''} 
        <span class="chip">${r.party || 'Unknown Party'}</span>
      </div>
      ${contactInfo}
      <div class="toolbar" style="margin-top:8px;">
        <button data-id="${r.voter_id}" data-a="contacted" class="primary">📋 Contact</button>
        <button data-id="${r.voter_id}" data-a="no_answer">🚪 Not Home</button>
        <button data-id="${r.voter_id}" data-a="call" ${r.phone_e164 ? '' : 'disabled'}>📞 Call</button>
      </div>
    `;
    el.appendChild(div);
  }

  qsa('button[data-a]').forEach((btn) => {
    btn.onclick = () => handleAction(btn);
  });
}

//
// === ACTION HANDLERS ===
//
async function handleAction(btn) {
  const action = btn.dataset.a;
  const id = btn.dataset.id;

  if (action === 'call') {
    sessionStorage.setItem('vol.call_prefill', JSON.stringify({ voter_id: id }));
    toast('Opening call...');
    setTimeout(() => (location.href = `/call.html?voter_id=${id}`), 700);
    return;
  }

  if (action === 'contacted') {
    const contactUrl = `/contact-form/index.html?voter_id=${id}`;
    location.href = contactUrl;
    return;
  }

  if (action === 'no_answer') {
    try {
      await fetch(API('complete'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voter_id: id, outcome: 'no_answer' }),
      });
      btn.closest('.toolbar').querySelectorAll('button').forEach((b) => (b.disabled = true));
    } catch (err) {
      alert('Save failed: ' + err.message);
    }
  }
}

//
// === EVENT LISTENERS ===
//
function setupEventListeners() {
  qs('#btnFind').addEventListener('click', findNearby);

  // Enter key triggers findNearby
  qs('#street').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      findNearby();
    }
  });

  // Focus on street input after results - show helpful message
  qs('#street').addEventListener('focus', (e) => {
    const results = qs('#results');
    
    // If there are results displayed, show helpful message about reset
    if (results && results.innerHTML.trim() && results.innerHTML !== '<div class="muted">No nearby addresses.</div>') {
      setMsg('💡 Tip: Use the "New Search" button to search a different street, or clear this field to start over.');
    }
  });

  // When street input changes, handle reset logic
  qs('#street').addEventListener('input', (e) => {
    const results = qs('#results');
    
    if (!e.target.value.trim()) {
      // If user cleared the street field and there are results, auto-reset
      if (results && results.innerHTML.trim() && results.innerHTML !== '<div class="muted">No nearby addresses.</div>') {
        console.log('🔄 Auto-reset triggered by clearing street field');
        // Clear everything except the street field (which user is actively editing)
        qs('#house').value = '';
        const houseInput = qs('#house');
        houseInput.disabled = true;
        houseInput.placeholder = 'Select street first';
        qs('#streetSuggestions').style.display = 'none';
        qs('#houseSuggestions').style.display = 'none';
        qs('#results').innerHTML = '';
        
        // Hide reset button
        const resetBtn = qs('#resetBtn');
        if (resetBtn) {
          resetBtn.style.display = 'none';
        }
      }
      setMsg('');
    }
  });
}
