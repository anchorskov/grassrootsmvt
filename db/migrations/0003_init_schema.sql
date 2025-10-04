-- Migration number: 0003 	 2025-10-03T22:01:09.288Z
-- Core voters (only columns we query)
CREATE TABLE IF NOT EXISTS voters (
	voter_id TEXT PRIMARY KEY,
	political_party TEXT,
	county TEXT,
	senate TEXT,
	house TEXT
);

-- Materialized normalized address (from v_voters_addr_norm)
CREATE TABLE IF NOT EXISTS voters_addr_norm (
	voter_id TEXT PRIMARY KEY,
	ln TEXT,
	fn TEXT,
	addr1 TEXT,
	city TEXT,
	state TEXT,
	zip TEXT,
	senate TEXT,
	house TEXT
);

-- Materialized best phone (from v_best_phone)
CREATE TABLE IF NOT EXISTS best_phone (
	voter_id TEXT PRIMARY KEY,
	phone_e164 TEXT,
	confidence_code INTEGER,
	is_wy_area INTEGER,
	imported_at TEXT
);

-- Call activity log (same as your local)
CREATE TABLE IF NOT EXISTS call_activity (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	ts TEXT NOT NULL,
	voter_id TEXT,
	outcome TEXT,
	volunteer_email TEXT,
	payload_json TEXT
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_voters_county   ON voters(county);
CREATE INDEX IF NOT EXISTS idx_voters_party    ON voters(political_party);
CREATE INDEX IF NOT EXISTS idx_voters_house    ON voters(house);
CREATE INDEX IF NOT EXISTS idx_voters_senate   ON voters(senate);

CREATE INDEX IF NOT EXISTS idx_norm_city       ON voters_addr_norm(city);
CREATE INDEX IF NOT EXISTS idx_norm_zip        ON voters_addr_norm(zip);
CREATE INDEX IF NOT EXISTS idx_norm_addr1_city ON voters_addr_norm(addr1, city);

CREATE INDEX IF NOT EXISTS idx_best_phone_vid  ON best_phone(voter_id);

CREATE INDEX IF NOT EXISTS idx_call_ts         ON call_activity(ts);
CREATE INDEX IF NOT EXISTS idx_call_vid        ON call_activity(voter_id);
