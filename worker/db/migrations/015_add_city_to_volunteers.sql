-- 015_add_city_to_volunteers.sql
-- Add city to volunteers for UI autofill.

ALTER TABLE volunteers ADD COLUMN city TEXT;
