CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS school_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_tenant_id uuid NOT NULL UNIQUE,
  organization_id text UNIQUE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Better Auth owns users, accounts, sessions, organization memberships, and roles.
-- Keep tenant domain data outside its schema and link it to exactly one organization.
CREATE TABLE IF NOT EXISTS school_provisioning_requests (
  platform_tenant_id uuid PRIMARY KEY,
  school_tenant_id uuid NOT NULL UNIQUE REFERENCES school_tenants(id) ON DELETE CASCADE,
  request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS school_authz_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES school_tenants(id) ON DELETE CASCADE,
  actor_user_id text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS school_authz_audit_tenant_created_idx
ON school_authz_audit_logs(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES school_tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_on < ends_on),
  UNIQUE (tenant_id, name),
  UNIQUE (tenant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS academic_years_one_active_per_tenant_idx
ON academic_years(tenant_id) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS school_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES school_tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  grade_level smallint NOT NULL CHECK (grade_level BETWEEN 1 AND 12),
  capacity integer CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES school_tenants(id) ON DELETE CASCADE,
  nis text NOT NULL,
  nisn text,
  full_name text NOT NULL,
  gender char(1) CHECK (gender IS NULL OR gender IN ('L', 'P')),
  status text NOT NULL DEFAULT 'AKTIF' CHECK (status IN ('AKTIF', 'LULUS', 'MUTASI', 'KELUAR')),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS students_tenant_nis_active_idx ON students(tenant_id, nis) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS students_tenant_nisn_active_idx ON students(tenant_id, nisn) WHERE deleted_at IS NULL AND nisn IS NOT NULL;
CREATE INDEX IF NOT EXISTS students_tenant_name_active_idx ON students(tenant_id, full_name) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS student_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES school_tenants(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  class_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, student_id) REFERENCES students(tenant_id, id),
  FOREIGN KEY (tenant_id, academic_year_id) REFERENCES academic_years(tenant_id, id),
  FOREIGN KEY (tenant_id, class_id) REFERENCES school_classes(tenant_id, id),
  UNIQUE (tenant_id, student_id, academic_year_id)
);

CREATE INDEX IF NOT EXISTS student_enrollments_tenant_class_year_idx
ON student_enrollments(tenant_id, class_id, academic_year_id);
