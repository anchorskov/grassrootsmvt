-- Batch Fix: Remove 5 duplicate "E E" records
-- All have correct versions already in the database

-- 1. E E ADAMS AVE → E ADAMS AVE exists
DELETE FROM streets_index WHERE street_core = 'E ADAMS' AND street_prefix = 'E' AND street_type = 'AVE' AND raw_address = '202 E E ADAMS AVE';

-- 2. E E ST → No E ST found, but this is just "E" street
DELETE FROM streets_index WHERE street_core = 'E' AND street_prefix = 'E' AND street_type = 'ST' AND raw_address = '1642 E E ST';

-- 3. E E PROSSER RD → E PROSSER RD exists
DELETE FROM streets_index WHERE street_core = 'E PROSSER' AND street_prefix = 'E' AND street_type = 'RD' AND raw_address = '609 E E PROSSER RD UNIT 42';

-- 4. E E 15TH ST → E 15TH ST exists
DELETE FROM streets_index WHERE street_core = 'E 15TH' AND street_prefix = 'E' AND street_type = 'ST' AND raw_address = '2611 E E 15TH ST APT 103';

-- 5. E E 18TH ST → E 18TH ST exists
DELETE FROM streets_index WHERE street_core = 'E 18TH' AND street_prefix = 'E' AND street_type = 'ST' AND raw_address = '923 E E 18TH ST';

-- Verify deletions
SELECT 'Deleted records check:' as status, COUNT(*) as should_be_zero
FROM streets_index 
WHERE raw_address IN ('202 E E ADAMS AVE', '1642 E E ST', '609 E E PROSSER RD UNIT 42', '2611 E E 15TH ST APT 103', '923 E E 18TH ST');
