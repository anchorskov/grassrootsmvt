-- 010_add_campaign_touchpoints.sql
-- Campaign touchpoint management: pre-scripted conversation flows for volunteers.
-- Each touchpoint has a label, icebreaker, body script, and optional CTA.
-- Segments table allows targeting touchpoints by voter attributes (party, district, etc).

CREATE TABLE IF NOT EXISTS campaign_touchpoints (
  touchpoint_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  icebreaker TEXT NOT NULL,
  body TEXT NOT NULL,
  cta_question TEXT,
  issue_tag TEXT,
  channels TEXT DEFAULT 'phone',
  priority INTEGER DEFAULT 100,
  is_active INTEGER DEFAULT 1,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaign_touchpoint_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  touchpoint_id TEXT NOT NULL REFERENCES campaign_touchpoints(touchpoint_id),
  segment_key TEXT NOT NULL,
  segment_value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_touchpoint_segments_key
  ON campaign_touchpoint_segments (segment_key);

CREATE INDEX IF NOT EXISTS idx_touchpoint_segments_touchpoint
  ON campaign_touchpoint_segments (touchpoint_id, segment_key);

-- Seed with one example touchpoint for property tax relief outreach
INSERT OR IGNORE INTO campaign_touchpoints (
  touchpoint_id,
  label,
  icebreaker,
  body,
  cta_question,
  issue_tag,
  channels,
  priority,
  is_active
) VALUES (
  'property_tax_relief_intro',
  'Property Tax Relief Introduction',
  'Hi, this is [Your Name] calling on behalf of the Wyoming Term Limits campaign. Is this a good time to talk for just a minute?',
  'We''re reaching out to voters who care about keeping property taxes fair and reasonable. Our campaign is focused on bringing accountability to the legislature through term limits, which we believe will help prevent career politicians from raising taxes on hardworking Wyoming families. Does property tax relief matter to you and your household?',
  'Can we count on your support for term limits as a way to protect Wyoming taxpayers?',
  'property_tax',
  'phone',
  100,
  1
);
