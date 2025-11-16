-- Batch Fix: Remove 4 records with embedded apartment/unit numbers
-- These are unit numbers that got mixed into street_core
-- All have correct versions already in database

DELETE FROM streets_index WHERE street_core = ' 16TH 2' AND street_prefix = 'E' AND raw_address = '1925 1/2 E 16TH ST 2';
DELETE FROM streets_index WHERE street_core = '12TH' AND street_prefix = 'E' AND street_canonical = 'E 12TH 218 ST' AND raw_address = '3900 E 12TH ST 218';
DELETE FROM streets_index WHERE street_core = '18TH' AND street_prefix = 'E' AND street_canonical = 'E 18TH 703 ST' AND raw_address = '3840 E 18TH ST 703';
DELETE FROM streets_index WHERE street_core = 'ROBIN 218' AND street_type = 'LN' AND raw_address = '4 ROBIN LN 218';

-- Verify
SELECT 'Deleted count:' as status, COUNT(*) as should_be_zero
FROM streets_index 
WHERE raw_address IN ('1925 1/2 E 16TH ST 2', '3900 E 12TH ST 218', '3840 E 18TH ST 703', '4 ROBIN LN 218');
