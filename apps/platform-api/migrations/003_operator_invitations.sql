CREATE TABLE IF NOT EXISTS platform_operator_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (email = lower(btrim(email))),
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('platform_admin', 'platform_read_only')),
  token_hash text NOT NULL UNIQUE,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  sent_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  delivery_failed boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS platform_operator_invitations_email_created_idx
  ON platform_operator_invitations (email, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_operator_invitations_pending_idx
  ON platform_operator_invitations (expires_at)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS platform_operator_invitations_active_email_uidx
  ON platform_operator_invitations (email)
  WHERE active = true AND accepted_at IS NULL AND revoked_at IS NULL;
