-- Introduce the `platform_user` account type: a customer account that manages only the
-- schools it owns. Ownership is a relation of its own because `tenants.created_by` records
-- who performed the creation (an operator may create a school on behalf of a customer),
-- not who manages the school afterwards.

-- 1. Ownership relation.
CREATE TABLE IF NOT EXISTS tenant_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'platform_owner' CHECK (role IN ('platform_owner', 'platform_user')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS tenant_owners_user_idx ON tenant_owners(user_id);
CREATE INDEX IF NOT EXISTS tenant_owners_tenant_idx ON tenant_owners(tenant_id);

-- 2. Denormalized owner on `tenants` so the read path can filter without a join.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'owner_user_id'
  ) THEN
    ALTER TABLE tenants ADD COLUMN owner_user_id text REFERENCES "user"(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS tenants_owner_user_id_idx ON tenants(owner_user_id) WHERE owner_user_id IS NOT NULL;

-- 3. Backfill: a tenant created by an existing account starts owned by that account.
-- Rows whose `created_by` does not match a Platform user (or is empty) stay unowned and
-- remain visible to operators only.
UPDATE tenants t
SET owner_user_id = t.created_by
WHERE t.owner_user_id IS NULL
  AND t.created_by IS NOT NULL
  AND EXISTS (SELECT 1 FROM "user" u WHERE u.id = t.created_by);

INSERT INTO tenant_owners (tenant_id, user_id, role)
SELECT t.id, t.owner_user_id, 'platform_owner'
FROM tenants t
WHERE t.owner_user_id IS NOT NULL
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- 4. The `"user".role` column carries no CHECK constraint, so `platform_user` needs no
-- widening here. Operator invitations stay operator-only: `platform_user` accounts are
-- created through public self-registration, never through an operator invitation.
