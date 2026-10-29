-- Isolasi tenant. Request tenant mengisi `app.school_ids` (daftar uuid dipisah koma) lewat withTenant().
-- Tanpa konteks, fungsi ini mengembalikan array kosong sehingga tidak ada baris yang terlihat.
CREATE FUNCTION app_school_ids() RETURNS uuid[]
  LANGUAGE sql STABLE
  AS $$
    SELECT coalesce(string_to_array(nullif(current_setting('app.school_ids', true), ''), ',')::uuid[], '{}'::uuid[])
  $$;
--> statement-breakpoint

-- Tabel yang punya kolom school_id.
ALTER TABLE academic_year ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_year FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON academic_year
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_log
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint

-- Sekolah terlihat hanya jika ada di konteks.
ALTER TABLE school ENABLE ROW LEVEL SECURITY;
ALTER TABLE school FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON school
  USING (id = ANY (app_school_ids()));
--> statement-breakpoint

-- Yayasan terlihat jika salah satu unitnya ada di konteks (subquery ikut tunduk pada RLS tabel school).
ALTER TABLE foundation ENABLE ROW LEVEL SECURITY;
ALTER TABLE foundation FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON foundation
  USING (EXISTS (SELECT 1 FROM school s WHERE s.foundation_id = foundation.id));
