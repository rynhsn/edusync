ALTER TABLE school_tenant_admin_activation
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_failed boolean NOT NULL DEFAULT false;
