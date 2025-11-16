-- Lookup query for Jimmy Skovgard (example of name->address join)
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
FROM v_voters_addr_norm AS a
JOIN voters AS v ON a.voter_id = v.voter_id
WHERE UPPER(a.fn) = 'JIMMY'
  AND UPPER(a.ln) = 'SKOVGARD'
LIMIT 25;
