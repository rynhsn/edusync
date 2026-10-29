-- Paket siap pakai dapat dibaca publik (ditampilkan di halaman daftar) tetapi hanya ditulis peran platform.
REVOKE ALL ON plan_preset FROM edusync_app;
--> statement-breakpoint
GRANT SELECT ON plan_preset TO edusync_app;
--> statement-breakpoint
-- Pengaturan platform (termasuk kunci penyedia pembayaran terenkripsi) tidak boleh terbaca peran aplikasi sama sekali.
REVOKE ALL ON platform_setting FROM edusync_app;
--> statement-breakpoint
ALTER TABLE platform_setting ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_setting FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
INSERT INTO plan_preset (key, name, description, modules, tier, sort) VALUES
  ('starter', 'Starter', 'Untuk sekolah yang baru mulai: nilai dan rapor.', '["grades"]', 't300', 1),
  ('standard', 'Standard', 'Absensi, nilai, penilaian, jadwal, dan portal wali.', '["attendance","grades","assessments","schedule","parent_portal"]', 't300', 2),
  ('pro', 'Pro', 'Semua modul utama termasuk SPMB, website, administrasi, dan SPP.', '["attendance","grades","assessments","schedule","admissions","website","administration","fees","parent_portal","announcements"]', 't300', 3)
ON CONFLICT DO NOTHING;
