-- Password reset OTPs. Replaces the duplicate 004_password_reset.sql / 005_password_reset_otp.sql
-- pair, which created the same table twice and made `pnpm db:migrate` fail with 42P07.
-- This file's shape is the one the running database and src/auth/password-reset.ts use:
-- a uuid id (the route inserts randomUUID()), varchar columns and timestamp without time zone.
-- The guards keep it a no-op on a database where the table was created out of band.
CREATE TABLE IF NOT EXISTS password_reset_otp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(255) NOT NULL,
  otp_hash varchar(64) NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  used_at timestamp,
  expires_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

-- Predicates must be IMMUTABLE, so `expires_at > now()` cannot appear here; `used_at IS NULL`
-- is the part that narrows the index, and the query also filters on expires_at.
CREATE INDEX IF NOT EXISTS idx_password_reset_otp_email_pending ON password_reset_otp(email, expires_at)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_password_reset_otp_expires_at ON password_reset_otp(expires_at)
  WHERE used_at IS NULL;
