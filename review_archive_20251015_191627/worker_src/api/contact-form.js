// API endpoints for the progressive contact form flow

// 1. GET /api/contact-form/counties
// Returns list of all counties
async function getCounties(env) {
  const query = `SELECT DISTINCT county FROM voters ORDER BY county`;
  const result = await env.d1.prepare(query).all();
  return result.results.map(r => r.county);
}

// 2. GET /api/contact-form/cities?county=ALBANY  
// Returns cities in specified county
async function getCitiesByCounty(env, county) {
  const query = `
    SELECT DISTINCT a.city 
    FROM v_voters_addr_norm a 
    JOIN voters v ON a.voter_id = v.voter_id 
    WHERE v.county = ? 
    ORDER BY a.city
  `;
  const result = await env.d1.prepare(query).bind(county).all();
  return result.results.map(r => r.city);
}

// 3. GET /api/contact-form/streets?county=ALBANY&city=LARAMIE
// Returns street names in specified county/city
async function getStreetsByLocation(env, county, city) {
  const query = `
    SELECT DISTINCT 
      TRIM(REPLACE(REPLACE(addr1, SUBSTR(addr1, 1, INSTR(addr1, ' ')-1), ''), '  ', ' ')) as street_name,
      COUNT(*) as voter_count
    FROM v_voters_addr_norm a 
    JOIN voters v ON a.voter_id = v.voter_id 
    WHERE v.county = ? AND a.city = ?
      AND addr1 IS NOT NULL
    GROUP BY street_name
    HAVING street_name != '' AND LENGTH(street_name) > 3
    ORDER BY voter_count DESC, street_name
    LIMIT 50
  `;
  const result = await env.d1.prepare(query).bind(county, city).all();
  return result.results;
}

// 4. GET /api/contact-form/check-address?county=ALBANY&city=LARAMIE&street=MAIN+ST&number=123
// Check if specific address exists
async function checkExistingAddress(env, county, city, street, houseNumber) {
  const query = `
    SELECT 
      v.voter_id,
      a.fn as first_name,
      a.ln as last_name,
      a.addr1,
      a.city,
      v.political_party,
      p.phone_e164
    FROM voters v
    JOIN v_voters_addr_norm a ON v.voter_id = a.voter_id
    LEFT JOIN v_best_phone p ON v.voter_id = p.voter_id
    WHERE v.county = ? AND a.city = ?
      AND (
        UPPER(a.addr1) LIKE UPPER(?) 
        OR UPPER(a.addr1) LIKE UPPER(?)
      )
    ORDER BY a.addr1
  `;
  
  const pattern1 = `${houseNumber} ${street}%`;
  const pattern2 = `${houseNumber}${street}%`;
  
  const result = await env.d1.prepare(query)
    .bind(county, city, pattern1, pattern2)
    .all();
  
  return {
    exists: result.results.length > 0,
    matches: result.results
  };
}

// 5. POST /api/contact-form/search-names
// Fuzzy search for similar names in area
async function searchSimilarNames(env, { county, city, firstName, lastName }) {
  const query = `
    SELECT 
      v.voter_id,
      a.fn as first_name,
      a.ln as last_name,
      a.addr1,
      a.city,
      v.political_party,
      p.phone_e164,
      CASE 
        WHEN UPPER(a.ln) = UPPER(?) AND UPPER(a.fn) = UPPER(?) THEN 100
        WHEN UPPER(a.ln) = UPPER(?) AND UPPER(SUBSTR(a.fn, 1, 1)) = UPPER(SUBSTR(?, 1, 1)) THEN 80
        WHEN UPPER(a.ln) = UPPER(?) THEN 60
        WHEN UPPER(a.fn) = UPPER(?) AND UPPER(a.ln) LIKE UPPER(?) || '%' THEN 70
        ELSE 40
      END as match_score
    FROM voters v
    JOIN v_voters_addr_norm a ON v.voter_id = a.voter_id
    LEFT JOIN v_best_phone p ON v.voter_id = p.voter_id
    WHERE v.county = ? AND a.city = ?
      AND (
        UPPER(a.ln) LIKE UPPER(?) || '%'
        OR UPPER(a.fn) LIKE UPPER(?) || '%'
        OR UPPER(a.ln) LIKE '%' || UPPER(?) || '%'
      )
    ORDER BY match_score DESC, a.ln, a.fn
    LIMIT 10
  `;
  
  const result = await env.d1.prepare(query)
    .bind(
      lastName, firstName, // exact match check
      lastName, firstName, // last + first initial
      lastName, // last name only
      firstName, lastName, // first + partial last
      county, city, // location filter
      lastName, firstName, lastName // fuzzy search
    )
    .all();
  
  return result.results;
}

// 6. POST /api/contact-form/submit
// Submit new contact to staging table
async function submitContactStaging(env, contactData, volunteerEmail = 'volunteer') {
  const {
    // Search fields
    county, city, streetName, houseNumber,
    // Personal info (using aligned field names)
    firstName, lastName, middleName, suffix,
    // Address (using aligned field names)
    fullAddress, unitNumber, zipCode,
    // Contact (using aligned field names)
    phonePrimary, phoneSecondary, email,
    // Political (using aligned field names)
    estimatedParty, votingLikelihood,
    // Interaction
    contactMethod, interactionNotes, issuesInterested, volunteerNotes,
    // Verification
    potentialMatches
  } = contactData;
  
  const needsReview = potentialMatches && potentialMatches.length > 0;
  
  const query = `
    INSERT INTO voter_contact_staging (
      submitted_by, search_county, search_city, search_street_name, search_house_number,
      fn, ln, middle_name, suffix, addr1, house_number, street_name, unit_number,
      city, county, state, zip, phone_e164, phone_secondary, email,
      political_party, voting_likelihood, contact_method, interaction_notes,
      issues_interested, volunteer_notes, potential_matches, needs_manual_review
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  const result = await env.d1.prepare(query)
    .bind(
      volunteerEmail, county, city, streetName, houseNumber,
      firstName, lastName, middleName, suffix,
      fullAddress, houseNumber, streetName, unitNumber, city, county, 'WY', zipCode,
      phonePrimary, phoneSecondary, email,
      estimatedParty, votingLikelihood,
      contactMethod, interactionNotes, issuesInterested, volunteerNotes,
      JSON.stringify(potentialMatches || []), needsReview ? 1 : 0
    )
    .run();
  
  // Get the voter_id for the newly created record
  const voterResult = await env.d1.prepare(
    `SELECT voter_id FROM voter_contact_staging WHERE staging_id = ?`
  ).bind(result.meta.last_row_id).first();
  
  return {
    success: true,
    stagingId: result.meta.last_row_id,
    voterId: voterResult?.voter_id,
    needsReview
  };
}

export {
  getCounties,
  getCitiesByCounty,
  getStreetsByLocation,
  checkExistingAddress,
  searchSimilarNames,
  submitContactStaging
};