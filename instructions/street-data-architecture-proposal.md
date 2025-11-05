# Street Data Architecture Proposal

## Problem Statement
The `streets_index` table provides clean, canonical street names but has no connection to individual voter house numbers. The canvass workflow needs both street lists AND house numbers for each street.

## Current Data Structure

### streets_index
- **Purpose**: Canonical street names per city/county
- **Fields**: `city_county_id`, `street_prefix`, `street_core`, `street_type`, `street_suffix`, `street_canonical`, `raw_address`
- **Limitation**: `raw_address` is just ONE example address, not linked to voters
- **Record count**: 17,691 streets

### voter_addresses
- **Purpose**: Actual voter residential addresses
- **Fields**: `voter_id`, `kind`, `addr1`, `city`, `state`, `zip`
- **Format**: `addr1` = "5201 RAVEN ST" (unparsed, house number + street name)
- **Limitation**: Not normalized, requires parsing

### wy_city_county
- **Purpose**: City/county reference table
- **Fields**: `id`, `city_raw`, `county_raw`, `city_norm`, `county_norm`
- **Used by**: `streets_index` via `city_county_id` foreign key

## Solution Options

### Option 1: Hybrid Approach (RECOMMENDED) ⭐

**Strategy**: Use `streets_index` for street list, query `voter_addresses` for house numbers

**API Flow**:
```
1. GET streets → Query streets_index (fast, clean)
2. GET houses → Query voter_addresses WHERE street matches (parse addr1)
3. GET voters → Query voter_addresses WHERE house + street match
```

**Pros**:
- ✅ No schema changes
- ✅ Uses clean street data
- ✅ Real voter house numbers
- ✅ Can implement immediately

**Cons**:
- ⚠️ Requires addr1 parsing for house numbers
- ⚠️ Two-step query process

**Implementation**:
```sql
-- Step 1: Get streets (from streets_index)
SELECT si.street_canonical 
FROM streets_index si
JOIN wy_city_county cc ON si.city_county_id = cc.id
WHERE cc.county_norm = ? AND cc.city_norm = ?
ORDER BY si.street_canonical;

-- Step 2: Get house numbers for selected street
SELECT DISTINCT
  TRIM(SUBSTR(va.addr1, 1, INSTR(va.addr1, ' ')-1)) as house_number,
  COUNT(*) as voter_count
FROM voter_addresses va
JOIN voters v ON va.voter_id = v.voter_id
WHERE v.county = ?
  AND UPPER(va.city) = ?
  AND UPPER(TRIM(SUBSTR(va.addr1, INSTR(va.addr1, ' ')+1))) = ?
  AND va.kind = 'residential'
GROUP BY house_number
ORDER BY CAST(house_number AS INTEGER);
```

---

### Option 2: Create street_addresses Table

**Strategy**: Pre-parse and cache all street/house combinations

**New Table**:
```sql
CREATE TABLE street_addresses (
  id INTEGER PRIMARY KEY,
  city_county_id INTEGER NOT NULL,
  street_canonical TEXT NOT NULL,
  house_number TEXT NOT NULL,
  house_suffix TEXT,
  full_address TEXT NOT NULL,
  voter_count INTEGER DEFAULT 0,
  FOREIGN KEY(city_county_id) REFERENCES wy_city_county(id)
);
CREATE INDEX idx_street_addresses_lookup 
  ON street_addresses(city_county_id, street_canonical);
```

**Pros**:
- ✅ Pre-parsed, no runtime parsing
- ✅ Fast queries
- ✅ Single source of truth

**Cons**:
- ❌ New table to maintain
- ❌ Data migration required
- ❌ Must rebuild when voter data updates
- ❌ More storage

---

### Option 3: Add Parsed Fields to voter_addresses

**Strategy**: Extend voter_addresses with normalized fields

**Schema Change**:
```sql
ALTER TABLE voter_addresses ADD COLUMN house_number TEXT;
ALTER TABLE voter_addresses ADD COLUMN street_name TEXT;
CREATE INDEX idx_va_location_street ON voter_addresses(city, street_name);
```

**Pros**:
- ✅ No new tables
- ✅ No runtime parsing
- ✅ Direct queries

**Cons**:
- ❌ Modifies core voter table
- ❌ Data duplication
- ❌ Must reparse when addresses change
- ❌ Requires migration of existing data

---

## Recommended Implementation Plan

### Phase 1: Implement Hybrid Approach (Immediate)

1. **Update POST /api/streets** to use `streets_index`:
```javascript
// worker/src/index.js
router.post('/streets', async (request, env, ctx) => {
  const { county, city } = await readJson(request);
  const result = await db.prepare(`
    SELECT si.street_canonical as name
    FROM streets_index si
    JOIN wy_city_county cc ON si.city_county_id = cc.id
    WHERE cc.county_norm = UPPER(?) AND cc.city_norm = UPPER(?)
    ORDER BY si.street_canonical
  `).bind(county, city).all();
  
  return ctx.jsonResponse({
    ok: true,
    streets: result.results.map(r => ({ name: r.name })),
    total: result.results.length
  });
});
```

2. **Create NEW POST /api/houses endpoint**:
```javascript
router.post('/houses', async (request, env, ctx) => {
  const { county, city, street } = await readJson(request);
  const result = await db.prepare(`
    SELECT DISTINCT
      TRIM(SUBSTR(va.addr1, 1, INSTR(va.addr1, ' ')-1)) as house_number,
      COUNT(*) as voter_count
    FROM voter_addresses va
    JOIN voters v ON va.voter_id = v.voter_id
    WHERE UPPER(v.county) = UPPER(?)
      AND UPPER(va.city) = UPPER(?)
      AND UPPER(TRIM(SUBSTR(va.addr1, INSTR(va.addr1, ' ')+1))) = UPPER(?)
      AND va.kind = 'residential'
      AND va.addr1 IS NOT NULL
      AND INSTR(va.addr1, ' ') > 0
    GROUP BY house_number
    ORDER BY CAST(house_number AS INTEGER)
  `).bind(county, city, street).all();
  
  return ctx.jsonResponse({
    ok: true,
    houses: result.results,
    total: result.results.length
  });
});
```

3. **Update canvass page** to use two-step flow

### Phase 2: Performance Optimization (If Needed)

Monitor query performance. If house number queries are slow:
- Consider implementing Option 2 (street_addresses table)
- Or add indexes on computed columns
- Or cache results in KV storage

### Phase 3: Data Quality (Future)

- Add address validation
- Handle edge cases (apartments, suites, P.O. boxes)
- Implement address normalization service

---

## Decision Criteria

Choose **Option 1** if:
- ✅ You need a solution today
- ✅ You want minimal risk
- ✅ Performance is acceptable (< 500ms queries)

Choose **Option 2** if:
- Query performance is critical (< 50ms required)
- You have time for proper migration
- Voter data updates infrequently

Choose **Option 3** if:
- You need to extend voter_addresses anyway
- You want to normalize all address parsing
- You have control over voter data pipeline

---

## Next Steps

1. **Immediate**: Implement Option 1 (Hybrid Approach)
2. **Test**: Verify street list and house number queries work
3. **Monitor**: Track query performance and user feedback
4. **Iterate**: Optimize based on real usage patterns

---

## Questions to Answer

1. How often does voter data get updated?
2. What's the acceptable query response time?
3. Are there other workflows that need parsed address data?
4. Do you control the voter data import pipeline?

Answering these will help determine if you should stick with Option 1 or eventually migrate to Option 2 or 3.
