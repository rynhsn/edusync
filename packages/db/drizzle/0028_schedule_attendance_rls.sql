-- Jadwal dan absensi terikat sekolah dan tunduk pada RLS.
ALTER TABLE lesson_period ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_period FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON lesson_period
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE schedule_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_entry FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON schedule_entry
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE class_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_attendance FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON class_attendance
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
-- Izin baru untuk peran bawaan di sekolah yang sudah ada (hanya ditambah, hanya peran bawaan).
INSERT INTO role_permission (role_id, school_id, permission)
SELECT r.id, r.school_id, g.permission
FROM role r
JOIN (VALUES
  ('school_admin', 'schedule:read'), ('school_admin', 'schedule:manage'),
  ('school_admin', 'attendance:read'), ('school_admin', 'attendance:manage'),
  ('principal', 'schedule:read'), ('principal', 'attendance:read'),
  ('curriculum', 'schedule:read'), ('curriculum', 'schedule:manage'), ('curriculum', 'attendance:read'),
  ('operator', 'schedule:read'), ('operator', 'schedule:manage'),
  ('operator', 'attendance:read'), ('operator', 'attendance:manage'),
  ('teacher', 'schedule:read'), ('teacher', 'attendance:read'), ('teacher', 'attendance:manage')
) AS g(role_key, permission) ON g.role_key = r.key
WHERE r.is_system
ON CONFLICT DO NOTHING;
