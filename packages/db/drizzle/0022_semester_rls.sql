-- Semester terikat sekolah dan tunduk pada RLS.
ALTER TABLE semester ENABLE ROW LEVEL SECURITY;
ALTER TABLE semester FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON semester
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
