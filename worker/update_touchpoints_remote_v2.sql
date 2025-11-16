-- Update remote touchpoints with latest local changes
-- Changes: term_limits_core body, property_tax body/cta, snap icebreaker, right_to_life label/issue_tag

UPDATE campaign_touchpoints SET
  body = 'We''re working with Jimmy to pass term limits in the US House and Senate  because career politicians have lost touch with everyday people like us. When politicians spend 20, 30, even 40 years in office, they start caring more about keeping their seat than solving problems. Term limits mean fresh ideas, new energy, and representatives who actually listen because they know they''re going back home to live under the same laws they pass. It''s about making government work for Wyoming families again, not political insiders.',
  updated_at = CURRENT_TIMESTAMP
WHERE touchpoint_id = 'term_limits_core';

UPDATE campaign_touchpoints SET
  body = 'We''re reaching out to voters who care about building a culture of transparency and accountability first, excuses last. Join us and help set a higher standard.  Transparency first. Accountability always. Washington representatives answer to the citizens of Wyoming.',
  cta_question = 'Can we count on your support for transparency as way to protect Wyoming taxpayers?   Would you share your email with the campaign?  Can we text you reminders about things like local polling places,  primary dates, town halls and candidate meet and greet events.',
  updated_at = CURRENT_TIMESTAMP
WHERE touchpoint_id = 'property_tax_relief_intro';

UPDATE campaign_touchpoints SET
  icebreaker = 'Hi, this is [Your Name] calling with Jimmy Skovgard''s  United States Senate campaign.. Is now a good time to talk about food assistance?',
  updated_at = CURRENT_TIMESTAMP
WHERE touchpoint_id = 'snap_support';

UPDATE campaign_touchpoints SET
  label = 'Technology & Family Values',
  issue_tag = 'technology',
  updated_at = CURRENT_TIMESTAMP
WHERE touchpoint_id = 'right_to_life';
