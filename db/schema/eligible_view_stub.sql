-- Remove after importing real voters_* tables.

CREATE TABLE IF NOT EXISTS voters_raw (
  voter_id TEXT PRIMARY KEY,
  first_name TEXT, last_name TEXT, ra_city TEXT, ra_zip TEXT
);
CREATE TABLE IF NOT EXISTS voters_norm (
  voter_id TEXT PRIMARY KEY,
  party_form5 TEXT
);
CREATE TABLE IF NOT EXISTS v_best_phone (
  voter_id TEXT PRIMARY KEY,
  phone_e164 TEXT
);

DROP VIEW IF EXISTS v_eligible_call;
CREATE VIEW v_eligible_call AS
SELECT r.voter_id, r.first_name, r.last_name, r.ra_city, r.ra_zip,
       n.party_form5 AS party, bp.phone_e164,
       '1900-01-01' AS last_contact_at
FROM voters_raw r
JOIN voters_norm n USING(voter_id)
LEFT JOIN v_best_phone bp USING(voter_id);

-- seed one fake voter so /call/next returns something
INSERT OR IGNORE INTO voters_raw(voter_id,first_name,last_name,ra_city,ra_zip)
VALUES ('V123','Test','Voter','Casper','82601');
INSERT OR IGNORE INTO voters_norm(voter_id,party_form5) VALUES ('V123','Unaffiliated');
INSERT OR IGNORE INTO v_best_phone(voter_id,phone_e164) VALUES ('V123','+13075551234');
