-- Harden the password reset OTP store (migration 005 follow-up).
--
-- 1. Timestamps become timestamptz. Migration 005 used `timestamp without time zone`,
--    while node-postgres serializes a JS Date using the *host* offset and `now()` returns
--    UTC. On a UTC+7 host that stored local wall-clock (09:41) next to a UTC `now()`
--    (02:31), so every `expires_at > now()` check over-granted by exactly 7 hours.
--    platform_operator_invitations already uses timestamptz; this aligns the two tables.
--    `USING <col> AT TIME ZONE 'UTC'` reads the legacy naive values as UTC, which can only
--    shorten a stale OTP's window, never extend it. Live OTPs are invalidated rather than
--    resurrected with a longer life.
-- 2. otp_hash is unique. Two pending codes for the same address are never intended, and a
--    collision-free hash column lets the lookup be a single-row probe.
-- 3. Email is stored normalized, matching the Platform user and invitation tables.

-- Fail loudly rather than silently discarding rows: a duplicate hash means the store is
-- already in a state this migration cannot reason about.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM password_reset_otp GROUP BY otp_hash HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate password_reset_otp.otp_hash values must be resolved before migration 006';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM password_reset_otp WHERE email <> lower(btrim(email))) THEN
    RAISE EXCEPTION 'Non-normalized password_reset_otp emails must be resolved before migration 006';
  END IF;
END $$;

ALTER TABLE password_reset_otp
  ALTER COLUMN expires_at TYPE timestamptz USING expires_at AT TIME ZONE 'UTC';

ALTER TABLE password_reset_otp
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';

ALTER TABLE password_reset_otp
  ALTER COLUMN used_at TYPE timestamptz USING used_at AT TIME ZONE 'UTC';

ALTER TABLE password_reset_otp
  ALTER COLUMN created_at SET DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'password_reset_otp_email_normalized_check') THEN
    ALTER TABLE password_reset_otp ADD CONSTRAINT password_reset_otp_email_normalized_check CHECK (email = lower(btrim(email)));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS password_reset_otp_hash_uidx ON password_reset_otp (otp_hash);

-- Lookup support for the normalized-email path; the original index was built on the raw
-- varchar column and is kept for backwards compatibility with existing query plans.
CREATE INDEX IF NOT EXISTS password_reset_otp_email_normalized_idx ON password_reset_otp (lower(btrim(email)));
