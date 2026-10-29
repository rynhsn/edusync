-- Bank data kurikulum. Tabel acuan bersifat global dan hanya-baca bagi peran aplikasi; sekolah hanya
-- menyalin mapel dari acuan ke datanya sendiri. Isi di bawah adalah contoh awal yang umum dipakai dan
-- harus diverifikasi terhadap regulasi terbaru sebelum dipakai di produksi.
REVOKE ALL ON ref_curriculum, ref_subject FROM edusync_app;
--> statement-breakpoint
GRANT SELECT ON ref_curriculum, ref_subject TO edusync_app;
--> statement-breakpoint
ALTER TABLE school_curriculum ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_curriculum FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON school_curriculum
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
INSERT INTO ref_curriculum (key, name, description) VALUES
  ('merdeka', 'Kurikulum Merdeka', 'Struktur mapel umum per jenjang; kelompok pilihan dan muatan lokal disesuaikan sekolah.'),
  ('k13', 'Kurikulum 2013', 'Struktur mapel Kurikulum 2013 untuk sekolah yang belum beralih.'),
  ('kma', 'Kurikulum madrasah (KMA)', 'Mapel kelompok agama madrasah ditambah mapel umum.');
--> statement-breakpoint
INSERT INTO ref_subject (curriculum_key, level_group, code, name, sort) VALUES
  ('merdeka', 'smp', 'PAI', 'Pendidikan Agama dan Budi Pekerti', 1),
  ('merdeka', 'smp', 'PP', 'Pendidikan Pancasila', 2),
  ('merdeka', 'smp', 'BIN', 'Bahasa Indonesia', 3),
  ('merdeka', 'smp', 'MTK', 'Matematika', 4),
  ('merdeka', 'smp', 'IPA', 'Ilmu Pengetahuan Alam', 5),
  ('merdeka', 'smp', 'IPS', 'Ilmu Pengetahuan Sosial', 6),
  ('merdeka', 'smp', 'BIG', 'Bahasa Inggris', 7),
  ('merdeka', 'smp', 'PJOK', 'Pendidikan Jasmani, Olahraga, dan Kesehatan', 8),
  ('merdeka', 'smp', 'INF', 'Informatika', 9),
  ('merdeka', 'smp', 'SBD', 'Seni dan Budaya', 10),
  ('merdeka', 'smp', 'PRK', 'Prakarya', 11),
  ('merdeka', 'sma', 'PAI', 'Pendidikan Agama dan Budi Pekerti', 1),
  ('merdeka', 'sma', 'PP', 'Pendidikan Pancasila', 2),
  ('merdeka', 'sma', 'BIN', 'Bahasa Indonesia', 3),
  ('merdeka', 'sma', 'MTK', 'Matematika', 4),
  ('merdeka', 'sma', 'BIG', 'Bahasa Inggris', 5),
  ('merdeka', 'sma', 'PJOK', 'Pendidikan Jasmani, Olahraga, dan Kesehatan', 6),
  ('merdeka', 'sma', 'SEJ', 'Sejarah', 7),
  ('merdeka', 'sma', 'SBD', 'Seni dan Budaya', 8),
  ('merdeka', 'sma', 'INF', 'Informatika', 9),
  ('merdeka', 'sma', 'FIS', 'Fisika', 10),
  ('merdeka', 'sma', 'KIM', 'Kimia', 11),
  ('merdeka', 'sma', 'BIO', 'Biologi', 12),
  ('merdeka', 'sma', 'EKO', 'Ekonomi', 13),
  ('merdeka', 'sma', 'SOS', 'Sosiologi', 14),
  ('merdeka', 'sma', 'GEO', 'Geografi', 15),
  ('merdeka', 'smk', 'PAI', 'Pendidikan Agama dan Budi Pekerti', 1),
  ('merdeka', 'smk', 'PP', 'Pendidikan Pancasila', 2),
  ('merdeka', 'smk', 'BIN', 'Bahasa Indonesia', 3),
  ('merdeka', 'smk', 'MTK', 'Matematika', 4),
  ('merdeka', 'smk', 'BIG', 'Bahasa Inggris', 5),
  ('merdeka', 'smk', 'PJOK', 'Pendidikan Jasmani, Olahraga, dan Kesehatan', 6),
  ('merdeka', 'smk', 'SEJ', 'Sejarah', 7),
  ('merdeka', 'smk', 'SBD', 'Seni dan Budaya', 8),
  ('merdeka', 'smk', 'INF', 'Informatika', 9),
  ('merdeka', 'smk', 'DPK', 'Dasar-dasar Program Keahlian', 10),
  ('merdeka', 'smk', 'PKK', 'Projek Kreatif dan Kewirausahaan', 11),
  ('k13', 'smp', 'PAI', 'Pendidikan Agama dan Budi Pekerti', 1),
  ('k13', 'smp', 'PPKN', 'Pendidikan Pancasila dan Kewarganegaraan', 2),
  ('k13', 'smp', 'BIN', 'Bahasa Indonesia', 3),
  ('k13', 'smp', 'MTK', 'Matematika', 4),
  ('k13', 'smp', 'IPA', 'Ilmu Pengetahuan Alam', 5),
  ('k13', 'smp', 'IPS', 'Ilmu Pengetahuan Sosial', 6),
  ('k13', 'smp', 'BIG', 'Bahasa Inggris', 7),
  ('k13', 'smp', 'PJOK', 'Pendidikan Jasmani, Olahraga, dan Kesehatan', 8),
  ('k13', 'smp', 'SBK', 'Seni Budaya', 9),
  ('k13', 'smp', 'PRK', 'Prakarya', 10),
  ('kma', 'smp', 'AQH', 'Al-Qur''an Hadis', 1),
  ('kma', 'smp', 'AKH', 'Akidah Akhlak', 2),
  ('kma', 'smp', 'FQH', 'Fikih', 3),
  ('kma', 'smp', 'SKI', 'Sejarah Kebudayaan Islam', 4),
  ('kma', 'smp', 'BAR', 'Bahasa Arab', 5),
  ('kma', 'smp', 'PPKN', 'Pendidikan Pancasila dan Kewarganegaraan', 6),
  ('kma', 'smp', 'BIN', 'Bahasa Indonesia', 7),
  ('kma', 'smp', 'MTK', 'Matematika', 8),
  ('kma', 'smp', 'IPA', 'Ilmu Pengetahuan Alam', 9),
  ('kma', 'smp', 'IPS', 'Ilmu Pengetahuan Sosial', 10),
  ('kma', 'smp', 'BIG', 'Bahasa Inggris', 11),
  ('kma', 'smp', 'PJOK', 'Pendidikan Jasmani, Olahraga, dan Kesehatan', 12),
  ('kma', 'smp', 'SBK', 'Seni Budaya', 13);
