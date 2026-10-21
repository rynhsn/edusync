-- Enforce the same normalized address used by operator invitation flows.
-- Keep existing records intact; fail this migration rather than silently rewriting identities.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "user"
    GROUP BY lower(btrim(email))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate normalized Platform user emails must be resolved before migration 004';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "user"
    WHERE email <> lower(btrim(email))
  ) THEN
    RAISE EXCEPTION 'Non-normalized Platform user emails must be resolved before migration 004';
  END IF;
  IF EXISTS (
    SELECT 1 FROM platform_operator_invitations
    WHERE email <> lower(btrim(email))
  ) THEN
    RAISE EXCEPTION 'Non-normalized invitation emails must be resolved before migration 004';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'platform_user_email_normalized_check'
  ) THEN
    ALTER TABLE "user"
      ADD CONSTRAINT platform_user_email_normalized_check
      CHECK (email = lower(btrim(email)));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS platform_user_email_normalized_uidx
  ON "user" (lower(btrim(email)));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'platform_operator_invitation_email_normalized_check'
  ) THEN
    ALTER TABLE platform_operator_invitations
      ADD CONSTRAINT platform_operator_invitation_email_normalized_check
      CHECK (email = lower(btrim(email)));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS platform_operator_invitations_token_lookup_idx
  ON platform_operator_invitations (token_hash)
  WHERE active = true AND accepted_at IS NULL AND revoked_at IS NULL;

