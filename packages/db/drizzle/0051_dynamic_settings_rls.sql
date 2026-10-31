-- Data dinamis: pengaturan per sekolah (RLS) dan acuan platform (global, hanya-baca bagi peran aplikasi).
ALTER TABLE school_setting ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_setting FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON school_setting
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE school_level ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_level FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON school_level
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE fin_payment_method ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_payment_method FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fin_payment_method
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE extracurricular_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracurricular_category FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON extracurricular_category
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE pkl_setting ENABLE ROW LEVEL SECURITY;
ALTER TABLE pkl_setting FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pkl_setting
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE letter_setting ENABLE ROW LEVEL SECURITY;
ALTER TABLE letter_setting FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON letter_setting
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE admission_document_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_document_type FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON admission_document_type
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
-- Jenjang acuan global.
REVOKE ALL ON ref_school_level FROM edusync_app;
--> statement-breakpoint
GRANT SELECT ON ref_school_level TO edusync_app;
--> statement-breakpoint
INSERT INTO ref_school_level (key, name, sort) VALUES
  ('sd', 'SD / MI', 1),
  ('smp', 'SMP / MTs', 2),
  ('sma', 'SMA / MA', 3),
  ('smk', 'SMK', 4)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Metode pembayaran bawaan untuk sekolah yang sudah ada.
INSERT INTO fin_payment_method (school_id, key, label, sort)
SELECT s.id, v.key, v.label, v.sort
FROM school s
CROSS JOIN (VALUES ('cash', 'Tunai', 1), ('transfer', 'Transfer', 2), ('other', 'Lainnya', 3)) AS v(key, label, sort)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Kategori ekskul bawaan.
INSERT INTO extracurricular_category (school_id, key, label, icon, tone, sort)
SELECT s.id, v.key, v.label, v.icon, v.tone, v.sort
FROM school s
CROSS JOIN (VALUES
  ('sport', 'Olahraga', 'trophy', 'emerald', 1),
  ('art', 'Seni', 'palette', 'rose', 2),
  ('religion', 'Keagamaan', 'book', 'teal', 3),
  ('science', 'Sains', 'flask', 'sky', 4),
  ('scout', 'Pramuka', 'tent', 'amber', 5),
  ('other', 'Lainnya', 'sparkles', 'slate', 6)
) AS v(key, label, icon, tone, sort)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Jenis dokumen SPMB bawaan.
INSERT INTO admission_document_type (school_id, key, label, required, sort)
SELECT s.id, v.key, v.label, v.required, v.sort
FROM school s
CROSS JOIN (VALUES
  ('kk', 'Kartu Keluarga', true, 1),
  ('birth_certificate', 'Akta kelahiran', true, 2),
  ('previous_certificate', 'Ijazah / SKL', false, 3),
  ('photo', 'Pas foto', true, 4),
  ('other', 'Lainnya', false, 5)
) AS v(key, label, required, sort)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Tingkat kelas: diambil dari tingkat yang sudah dipakai kelas di tiap sekolah.
INSERT INTO school_level (school_id, code, label, sort)
SELECT school_id, level, 'Tingkat ' || level, ROW_NUMBER() OVER (PARTITION BY school_id ORDER BY level) * 10
FROM (SELECT DISTINCT school_id, level FROM class_room WHERE level IS NOT NULL AND level <> '') c
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Syarat modul dan batas siswa dipindah dari kode ke katalog.
UPDATE catalog_item SET requires = '["grades"]'::jsonb WHERE kind = 'module' AND key = 'assessments';
--> statement-breakpoint
UPDATE catalog_item SET requires = '["attendance"]'::jsonb WHERE kind = 'module' AND key = 'parent_portal';
--> statement-breakpoint
UPDATE catalog_item SET requires = '["administration"]'::jsonb WHERE kind = 'module' AND key = 'internship';
--> statement-breakpoint
UPDATE catalog_item SET max_students = 300 WHERE kind = 'tier' AND key = 't300';
--> statement-breakpoint
UPDATE catalog_item SET max_students = 800 WHERE kind = 'tier' AND key = 't800';
--> statement-breakpoint
UPDATE catalog_item SET max_students = 1500 WHERE kind = 'tier' AND key = 't1500';
--> statement-breakpoint
-- Izin pengaturan sekolah.
INSERT INTO role_permission (role_id, school_id, permission)
SELECT r.id, r.school_id, 'school:manage'
FROM role r
WHERE r.is_system AND r.key IN ('school_admin', 'operator')
ON CONFLICT DO NOTHING;
