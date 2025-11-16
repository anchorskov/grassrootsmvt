-- Seed campaign_touchpoints with issue-based conversation scripts
-- Each touchpoint targets a specific voter concern with tailored messaging

INSERT INTO campaign_touchpoints (
  touchpoint_id,
  label,
  icebreaker,
  body,
  cta_question,
  issue_tag,
  channels,
  priority,
  is_active
) VALUES

-- Child Care & Family Support
(
  'child_care_intro',
  'Child Care & Working Families',
  'Hi, this is [Your Name] with the Wyoming Term Limits campaign. Do you have a moment to talk about supporting working families?',
  'We''re reaching out because child care costs in Wyoming are among the highest in the nation, making it harder for families to make ends meet. Our campaign believes term limits will bring fresh perspectives to the legislature—people who understand the real challenges facing working parents. Career politicians have had years to address this, but families are still struggling. Would affordable child care make a difference for your family or someone you know?',
  'Can we count on your support to bring new voices to Cheyenne who will prioritize Wyoming families?',
  'child_care',
  'phone,door',
  10,
  1
),

-- SNAP & Food Security
(
  'snap_support',
  'Food Security & SNAP Access',
  'Hi, this is [Your Name] calling with the Wyoming Term Limits initiative. Is now a good time?',
  'I''m reaching out about an issue that affects thousands of Wyoming families—access to food assistance. Despite working full-time, many of our neighbors still struggle to put food on the table. We believe term limits will help break the gridlock in Cheyenne and bring in legislators who focus on practical solutions instead of political games. Fresh leadership means officials who understand that keeping families fed isn''t a partisan issue—it''s a Wyoming value.',
  'Would you support term limits as a way to get our legislature focused on helping working families?',
  'snap',
  'phone,door',
  15,
  1
),

-- Healthcare Access
(
  'healthcare_wy',
  'Healthcare Access in Wyoming',
  'Hello, I''m [Your Name] with Wyoming Term Limits. Do you have a minute to discuss healthcare access in our state?',
  'Wyoming has some of the longest travel distances to quality healthcare in the country, and many of our rural communities are losing access to basic medical services. We believe term limits will help by bringing in new legislators who aren''t beholden to special interests and who understand that access to care shouldn''t depend on your ZIP code. Career politicians have let this problem grow for years. It''s time for fresh voices who will prioritize Wyoming families over political connections.',
  'Will you join us in supporting term limits to bring accountable leadership to healthcare policy?',
  'healthcare',
  'phone,door',
  20,
  1
),

-- Right to Life
(
  'right_to_life',
  'Protecting Life & Family Values',
  'Hi, this is [Your Name] with the Term Limits for Wyoming campaign. Could I take a moment of your time?',
  'Our campaign is built on the principle that every life has value and that families—not career politicians—should be making decisions about their most personal choices. We believe term limits will help ensure our legislature stays accountable to Wyoming values, not special interests or political party bosses. When politicians spend decades in office, they lose touch with the people they serve. New leadership means representatives who respect life, faith, and the traditional values that make Wyoming strong.',
  'Can we count on you to support term limits and ensure our values are represented in Cheyenne?',
  'right_to_life',
  'phone,door',
  25,
  1
),

-- Character & Integrity
(
  'character_integrity',
  'Character, Integrity & Public Service',
  'Hello, I''m [Your Name] calling on behalf of Wyoming Term Limits. Is this a convenient time?',
  'I wanted to talk with you about something that really matters—the character and integrity of the people representing us in Cheyenne. Term limits aren''t just about getting new faces in office; they''re about restoring public service to what it should be: regular citizens stepping up to serve their community and then returning to their lives. When politicians make a career out of elected office, they start serving themselves instead of us. Wyoming deserves representatives who come to Cheyenne with humility, serve with honor, and go home when their work is done.',
  'Will you support term limits to restore integrity and true public service to Wyoming government?',
  'integrity',
  'phone,door',
  30,
  1
),

-- Term Limits Core Message
(
  'term_limits_core',
  'Term Limits - Core Message',
  'Hi, this is [Your Name] with the Wyoming Term Limits campaign. Do you have a quick minute?',
  'We''re working to pass term limits in Wyoming because career politicians have lost touch with everyday people like us. When politicians spend 20, 30, even 40 years in office, they start caring more about keeping their seat than solving problems. Term limits mean fresh ideas, new energy, and representatives who actually listen because they know they''re going back home to live under the same laws they pass. It''s about making government work for Wyoming families again, not political insiders.',
  'Can we count on your vote to support term limits and take our government back from career politicians?',
  'term_limits',
  'phone,door,event',
  5,
  1
),

-- Property Tax Relief (existing - updated for consistency)
(
  'property_tax_relief_intro',
  'Property Tax Relief for Homeowners',
  'Hi, this is [Your Name] calling on behalf of the Wyoming Term Limits campaign. Is this a good time to talk for just a minute?',
  'We''re reaching out to voters who care about keeping property taxes fair and reasonable. Our campaign is focused on bringing accountability to the legislature through term limits, which we believe will help prevent career politicians from raising taxes on hardworking Wyoming families. When politicians spend decades in office, they lose touch with the burden that rising property taxes put on homeowners, ranchers, and small business owners.',
  'Can we count on your support for term limits as a way to protect Wyoming taxpayers?',
  'property_tax',
  'phone,door',
  12,
  1
)

ON CONFLICT(touchpoint_id) DO UPDATE SET
  label = excluded.label,
  icebreaker = excluded.icebreaker,
  body = excluded.body,
  cta_question = excluded.cta_question,
  issue_tag = excluded.issue_tag,
  channels = excluded.channels,
  priority = excluded.priority,
  is_active = excluded.is_active,
  updated_at = CURRENT_TIMESTAMP;
