-- Add Pulse opt-in columns to voter_contact_staging
ALTER TABLE voter_contact_staging ADD COLUMN pulse_optin BOOLEAN DEFAULT FALSE;
ALTER TABLE voter_contact_staging ADD COLUMN pulse_phone_digits TEXT;

SELECT 'Pulse columns added successfully' as status;
