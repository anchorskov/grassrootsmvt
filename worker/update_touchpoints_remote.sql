-- Update remote touchpoints to match local customizations
-- Jimmy Skovgard for US Senate campaign messaging

UPDATE campaign_touchpoints SET
  icebreaker = 'Hi, this is [Your Name] with the Skovgard for US Senate campaign. Do you have a time to talk about term limits?',
  body = 'We''re working Jimmy to pass term limits in the US House and Senate  because career politicians have lost touch with everyday people like us. When politicians spend 20, 30, even 40 years in office, they start caring more about keeping their seat than solving problems. Term limits mean fresh ideas, new energy, and representatives who actually listen because they know they''re going back home to live under the same laws they pass. It''s about making government work for Wyoming families again, not political insiders.',
  cta_question = 'Can we count on your vote to support term limits and take our government back from career politicians?  Would you share your email with the campaign?  Can we text you reminders about things like local polling places,  primary dates, town halls and candidate meet and greet events.',
  updated_at = CURRENT_TIMESTAMP
WHERE touchpoint_id = 'term_limits_core';

UPDATE campaign_touchpoints SET
  icebreaker = 'Hi, this is [Your Name] with Jimmy Skovgard''s  United States Senate campaign. Do you have a moment to talk about supporting working families?',
  body = 'We''re reaching out because child care costs in Wyoming are among the highest in the nation, making it harder for families to make ends meet. Our campaign believes term limits will bring fresh perspectives to the legislature—from new voices who understand the real challenges facing working parents. Career politicians have had years to address this, but families are still struggling. Would affordable child care make a difference for your family or someone you know?',
  cta_question = 'Can we count on your support to bring new voices to Cheyenne who will prioritize Wyoming families?   Would you share your email with the campaign?  Can we text you reminders about things like local polling places,  primary dates, town halls and candidate meet and greet events.',
  updated_at = CURRENT_TIMESTAMP
WHERE touchpoint_id = 'child_care_intro';

UPDATE campaign_touchpoints SET
  icebreaker = 'Hi, this is [Your Name] calling on behalf of Jimmy Skovgard''s  United States Senate campaign. Do you have a moment to talk about transparency first and  Accountability?',
  body = 'We''re reaching out to voters who care about building a culture of transparency and accountability first, excuses last. Join us and help set a higher standard.  Transparency first. Accountability always. Cheyenne answers to us.',
  cta_question = 'Can we count on your support for term limits as a way to protect Wyoming taxpayers?   Would you share your email with the campaign?  Can we text you reminders about things like local polling places,  primary dates, town halls and candidate meet and greet events.',
  updated_at = CURRENT_TIMESTAMP
WHERE touchpoint_id = 'property_tax_relief_intro';

UPDATE campaign_touchpoints SET
  icebreaker = 'Hi, this is [Your Name] calling with Jimmy Skovgard''s  United States Senate campaign.. Is now a good time?',
  body = 'I''m reaching out about an issue that affects thousands of Wyoming families—access to food assistance. Despite working full-time, many of our neighbors still struggle to put food on the table. We believe term limits will help break the gridlock in Cheyenne and bring in legislators who focus on practical solutions instead of political games. Fresh leadership means officials who understand that keeping families fed isn''t a partisan issue—it''s a Wyoming value.',
  cta_question = 'Would you support term limits as a way to get our legislature focused on helping working families? Would you share your email with the campaign?  Can we text you reminders about things like local polling places,  primary dates, town halls and candidate meet and greet events.',
  updated_at = CURRENT_TIMESTAMP
WHERE touchpoint_id = 'snap_support';

UPDATE campaign_touchpoints SET
  icebreaker = 'Hello, I''m [Your Name] with Jimmy Skovgard''s  United States Senate campaign.. Do you have a minute to discuss healthcare access in our state?',
  body = 'Wyoming has some of the longest travel distances to quality healthcare in the country, and many of our rural communities are losing access to basic medical services. We support a universal health care solution that covers everyone at lower total cost. If covering everyone costs less, why is universal care not on the agenda in Washington? Publish the numbers. Hold open hearings. Compare plans side by side. Wyoming families deserve answers, not slogans. Let us set a clear goal, lower costs and guaranteed access, and demand an honest vote in the open.',
  cta_question = 'Will you join us in supporting term limits to bring accountable leadership to healthcare policy?   Would you share your email with the campaign?  Can we text you reminders about things like local polling places,  primary dates, town halls and candidate meet and greet events?',
  updated_at = CURRENT_TIMESTAMP
WHERE touchpoint_id = 'healthcare_wy';

UPDATE campaign_touchpoints SET
  icebreaker = 'Hi, this is [Your Name] with Jimmy Skovgard''s  United States Senate campaign. Could I take a moment of your time?',
  body = 'Our campaign is about giving Wyoming families a real microphone. We already send emails and post on social media, yet our voices remain scattered. Let us build a simple tool that collects verified input statewide and delivers a clear, auditable signal to our representatives within hours. In Wyoming, when we need a tool, we build it. We will stand up a transparent platform so every family can weigh in, see the count, and hold leadership to the result.',
  cta_question = 'Can we count on you to support term limits and ensure our values are represented in Cheyenne?   Would you share your email with the campaign?  Can we text you reminders about things like local polling places,  primary dates, town halls and candidate meet and greet events.',
  updated_at = CURRENT_TIMESTAMP
WHERE touchpoint_id = 'right_to_life';

UPDATE campaign_touchpoints SET
  icebreaker = 'Hello, I''m [Your Name] with Jimmy Skovgard''s  United States Senate campaign.. Do you have a moment to talk about...',
  body = 'I wanted to talk with you about something that really matters—the character and integrity of the people representing us in Cheyenne. Term limits aren''t just about getting new faces in office; they''re about restoring public service to what it should be: regular citizens stepping up to serve their community and then returning to their lives. When politicians make a career out of elected office, they start serving themselves instead of us. Public service means this: step up, serve with humility, and go home when the work is done. Term limits help restore that standard by replacing self-interest with duty. Career-minded officials drift into comfort and performance, not results. Blaming immigrants for every problem is a distraction from the job. Wyoming deserves representatives who stand up for us, tell the truth,',
  cta_question = 'Will you support term limits to restore integrity and true public service to Wyoming government?   Would you share your email with the campaign?  Can we text you reminders about things like local polling places,  primary dates, town halls and candidate meet and greet events.',
  updated_at = CURRENT_TIMESTAMP
WHERE touchpoint_id = 'character_integrity';
