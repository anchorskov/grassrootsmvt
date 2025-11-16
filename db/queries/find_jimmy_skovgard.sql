-- Query to find voter records for Jimmy Skovgard
-- Uses v_voters_addr_norm view joined with voters table
-- Returns: voter_id, fn, ln, addr1, city, county, house, senate, political_party

SELECT 
  v.voter_id,
  a.fn,
  a.ln,
  a.addr1,
  a.city,
  v.county,
  v.house,
  v.senate,
  v.political_party
FROM v_voters_addr_norm a
JOIN voters v ON a.voter_id = v.voter_id
WHERE UPPER(a.fn) = 'JIMMY'
  AND UPPER(a.ln) = 'SKOVGARD'
LIMIT 25;

-- Result:
-- voter_id: 158596
-- fn: JIMMY
-- ln: SKOVGARD
-- addr1: 5685 HANLY ST
-- city: CASPER
-- county: NATRONA
-- house: 59
-- senate: 29
-- political_party: Republican
