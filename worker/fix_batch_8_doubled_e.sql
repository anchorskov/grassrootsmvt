-- Batch Fix: Remove 8 more duplicate "E E" records
-- All have correct versions already in database

DELETE FROM streets_index WHERE street_core = 'E 23RD' AND street_prefix = 'E' AND raw_address = '2132 E E 23RD ST';
DELETE FROM streets_index WHERE street_core = 'E 27TH' AND street_prefix = 'E' AND raw_address = '1631 E E 27TH ST';
DELETE FROM streets_index WHERE street_core = 'E 3RD' AND street_prefix = 'E' AND raw_address = '3054 E E 3RD ST';
DELETE FROM streets_index WHERE street_core = 'E 4TH' AND street_prefix = 'E' AND raw_address = '3035 E E 4TH ST';
DELETE FROM streets_index WHERE street_core = 'E 6TH' AND street_prefix = 'E' AND raw_address = '2215 E E 6TH ST';
DELETE FROM streets_index WHERE street_core = 'E 8TH' AND street_prefix = 'E' AND raw_address = '2840 E E 8TH ST';
DELETE FROM streets_index WHERE street_core = 'E' AND street_prefix = 'E' AND street_type = 'ST' AND raw_address = '601 E E ST';
DELETE FROM streets_index WHERE street_core = 'E HANSEN' AND street_prefix = 'E' AND raw_address = '300 E E HANSEN AVE';

-- Verify
SELECT 'Deleted count:' as status, COUNT(*) as should_be_zero
FROM streets_index 
WHERE raw_address IN ('2132 E E 23RD ST', '1631 E E 27TH ST', '3054 E E 3RD ST', '3035 E E 4TH ST', '2215 E E 6TH ST', '2840 E E 8TH ST', '601 E E ST', '300 E E HANSEN AVE');
