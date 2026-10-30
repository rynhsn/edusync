-- Ekstrakurikuler: semua tabel terikat sekolah dan tunduk pada RLS.
ALTER TABLE extracurricular ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracurricular FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON extracurricular
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE extracurricular_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracurricular_member FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON extracurricular_member
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE extracurricular_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracurricular_session FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON extracurricular_session
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE extracurricular_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracurricular_attendance FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON extracurricular_attendance
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE extracurricular_assessment ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracurricular_assessment FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON extracurricular_assessment
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
-- Izin baru untuk peran bawaan di sekolah yang sudah ada (hanya ditambah, hanya peran bawaan).
INSERT INTO role_permission (role_id, school_id, permission)
SELECT r.id, r.school_id, g.permission
FROM role r
JOIN (VALUES
  ('school_admin', 'extracurricular:read'), ('school_admin', 'extracurricular:manage'),
  ('principal', 'extracurricular:read'),
  ('curriculum', 'extracurricular:read'), ('curriculum', 'extracurricular:manage'),
  ('operator', 'extracurricular:read'), ('operator', 'extracurricular:manage'),
  ('teacher', 'extracurricular:read')
) AS g(role_key, permission) ON g.role_key = r.key
WHERE r.is_system
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Item katalog modul (harga awal; operator platform boleh mengubahnya). Baris yang sudah ada tidak ditimpa.
INSERT INTO catalog_item (kind, key, name, price_monthly, sort)
VALUES ('module', 'extracurricular', 'Ekstrakurikuler', 50000, 22)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Paket siap pakai yang memuat modul akademik ikut memuat ekstrakurikuler.
UPDATE plan_preset SET modules = modules || '["extracurricular"]'::jsonb
WHERE key IN ('standard', 'pro') AND NOT (modules ? 'extracurricular');
