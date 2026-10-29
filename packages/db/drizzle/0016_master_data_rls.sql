-- Semua tabel master data terikat sekolah dan tunduk pada RLS.
ALTER TABLE program ENABLE ROW LEVEL SECURITY;
ALTER TABLE program FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON program
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE class_room ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_room FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON class_room
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE student ENABLE ROW LEVEL SECURITY;
ALTER TABLE student FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON student
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE enrollment ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON enrollment
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE subject ENABLE ROW LEVEL SECURITY;
ALTER TABLE subject FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON subject
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE teacher ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON teacher
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE teaching_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE teaching_assignment FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON teaching_assignment
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
-- Izin baru untuk peran bawaan di sekolah yang sudah ada (sekolah baru mendapatkannya dari SYSTEM_ROLES).
-- Peran yang sudah diubah sekolah tidak dikurangi; hanya ditambah, dan hanya untuk peran bawaan.
INSERT INTO role_permission (role_id, school_id, permission)
SELECT r.id, r.school_id, g.permission
FROM role r
JOIN (VALUES
  ('school_admin', 'class:read'), ('school_admin', 'class:manage'),
  ('school_admin', 'student:read'), ('school_admin', 'student:manage'),
  ('school_admin', 'teacher:read'), ('school_admin', 'teacher:manage'),
  ('school_admin', 'subject:read'), ('school_admin', 'subject:manage'),
  ('principal', 'class:read'), ('principal', 'student:read'), ('principal', 'teacher:read'), ('principal', 'subject:read'),
  ('curriculum', 'class:read'), ('curriculum', 'class:manage'),
  ('curriculum', 'subject:read'), ('curriculum', 'subject:manage'),
  ('curriculum', 'student:read'), ('curriculum', 'teacher:read'),
  ('treasurer', 'student:read'),
  ('operator', 'class:read'), ('operator', 'class:manage'),
  ('operator', 'student:read'), ('operator', 'student:manage'),
  ('operator', 'teacher:read'), ('operator', 'teacher:manage'),
  ('operator', 'subject:read'), ('operator', 'subject:manage'),
  ('teacher', 'class:read'), ('teacher', 'student:read'), ('teacher', 'subject:read')
) AS g(role_key, permission) ON g.role_key = r.key
WHERE r.is_system
ON CONFLICT DO NOTHING;
