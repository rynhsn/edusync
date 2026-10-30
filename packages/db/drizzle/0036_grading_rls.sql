-- Penilaian: semua tabel terikat sekolah dan tunduk pada RLS.
ALTER TABLE grading_setting ENABLE ROW LEVEL SECURITY;
ALTER TABLE grading_setting FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON grading_setting
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE grade_component ENABLE ROW LEVEL SECURITY;
ALTER TABLE grade_component FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON grade_component
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE assessment ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON assessment
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE score ENABLE ROW LEVEL SECURITY;
ALTER TABLE score FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON score
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
-- Izin baru untuk peran bawaan di sekolah yang sudah ada (hanya ditambah, hanya peran bawaan).
INSERT INTO role_permission (role_id, school_id, permission)
SELECT r.id, r.school_id, g.permission
FROM role r
JOIN (VALUES
  ('school_admin', 'grade:read'), ('school_admin', 'grade:input'), ('school_admin', 'grade:configure'),
  ('principal', 'grade:read'),
  ('curriculum', 'grade:read'), ('curriculum', 'grade:configure'),
  ('operator', 'grade:read'), ('operator', 'grade:configure'), ('operator', 'grade:input'),
  ('teacher', 'grade:read'), ('teacher', 'grade:input')
) AS g(role_key, permission) ON g.role_key = r.key
WHERE r.is_system
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Item katalog modul `grades` (sudah ada di katalog awal; baris yang ada tidak ditimpa).
INSERT INTO catalog_item (kind, key, name, price_monthly, sort)
VALUES ('module', 'grades', 'Nilai dan rapor', 75000, 11)
ON CONFLICT DO NOTHING;
