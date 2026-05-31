-- Add phone number storage and welcome-text tracking to pulse opt-ins
ALTER TABLE pulse_optins ADD COLUMN phone_e164 TEXT;
ALTER TABLE pulse_optins ADD COLUMN welcome_sent_at DATETIME;

CREATE INDEX IF NOT EXISTS idx_pulse_phone_e164 ON pulse_optins(phone_e164);
