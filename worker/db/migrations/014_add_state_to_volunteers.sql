-- 014_add_state_to_volunteers.sql
-- Add a state field to volunteers and volunteer_staging to capture location.

ALTER TABLE volunteers ADD COLUMN state TEXT;
ALTER TABLE volunteer_staging ADD COLUMN state TEXT;
