-- Rapor: semua tabel terikat sekolah dan tunduk pada RLS.
ALTER TABLE report_setting ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_setting FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON report_setting
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE report_card ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON report_card
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
-- Izin baru untuk peran bawaan di sekolah yang sudah ada (hanya ditambah, hanya peran bawaan).
INSERT INTO role_permission (role_id, school_id, permission)
SELECT r.id, r.school_id, g.permission
FROM role r
JOIN (VALUES
  ('school_admin', 'report_card:read'), ('school_admin', 'report_card:manage'),
  ('principal', 'report_card:read'),
  ('curriculum', 'report_card:read'), ('curriculum', 'report_card:manage'),
  ('operator', 'report_card:read'), ('operator', 'report_card:manage'),
  ('teacher', 'report_card:read')
) AS g(role_key, permission) ON g.role_key = r.key
WHERE r.is_system
ON CONFLICT DO NOTHING;
