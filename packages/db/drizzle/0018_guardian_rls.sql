-- Wali murid dan tautannya ke siswa terikat sekolah dan tunduk pada RLS.
ALTER TABLE guardian ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON guardian
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE student_guardian ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_guardian FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON student_guardian
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
