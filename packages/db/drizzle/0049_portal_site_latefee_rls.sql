-- Denda SPP, portal, pengumuman, profil situs: semua tabel terikat sekolah dan tunduk pada RLS.
ALTER TABLE fin_late_fee_setting ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_late_fee_setting FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fin_late_fee_setting
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE portal_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_link FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON portal_link
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE portal_invite ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_invite FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON portal_invite
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE announcement ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON announcement
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE school_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_profile FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON school_profile
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
-- Peran bawaan baru (wali dan siswa) untuk sekolah yang sudah ada.
INSERT INTO role (school_id, key, name, is_system)
SELECT s.id, v.key, v.name, true
FROM school s
CROSS JOIN (VALUES ('guardian', 'Wali'), ('student', 'Siswa')) AS v(key, name)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Izin baru untuk peran bawaan di sekolah yang sudah ada (hanya ditambah, hanya peran bawaan).
INSERT INTO role_permission (role_id, school_id, permission)
SELECT r.id, r.school_id, g.permission
FROM role r
JOIN (VALUES
  ('principal', 'announcement:read'),
  ('curriculum', 'announcement:read'),
  ('treasurer', 'announcement:read'),
  ('operator', 'announcement:read'),
  ('operator', 'announcement:manage'),
  ('teacher', 'announcement:read'),
  ('guardian', 'portal:read'),
  ('student', 'portal:read')
) AS g(role_key, permission) ON g.role_key = r.key
WHERE r.is_system
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permission (role_id, school_id, permission)
SELECT r.id, r.school_id, p.permission
FROM role r
CROSS JOIN (VALUES ('portal:read'), ('announcement:read'), ('announcement:manage')) AS p(permission)
WHERE r.is_system AND r.key = 'school_admin'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Paket Pro ikut memuat modul portal, pengumuman, dan situs.
UPDATE plan_preset SET modules = modules || '["parent_portal","announcements","website"]'::jsonb
WHERE key = 'pro' AND NOT (modules ?& ARRAY['parent_portal','announcements','website']);
