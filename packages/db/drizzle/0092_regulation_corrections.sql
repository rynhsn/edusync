-- Fase 2C: koreksi hasil verifikasi regulasi atas fase 2A/2B (K1-K5). Aditif dan kompatibel mundur: kolom baru nullable atau
-- berdefault; satu-satunya yang dihapus adalah CHECK yang membatasi NILAI (bukan data): `subject_group_ck` (diganti FK ke
-- tabel acuan) dan `grading_setting_calculation_mode_ck` (diperluas).

-- K1. Kelompok mapel sebagai tabel acuan platform (tanpa school_id, tanpa RLS; sama dengan ref_education_profile).
-- CATATAN: daftar di bawah adalah ACUAN AWAL yang masih harus diverifikasi ke Lampiran II Permendikdasmen 13/2025 dan
-- KMA 1503/2025 (teks keduanya belum terbaca). Kunci lama dipertahankan agar data lama tetap valid.
CREATE TABLE "ref_subject_group" (
  "key" text PRIMARY KEY,
  "label_id" text NOT NULL,
  "label_en" text NOT NULL,
  "label_su" text NOT NULL,
  "profile_keys" text[],
  "report_section" text,
  "sort" integer NOT NULL DEFAULT 0,
  "active" boolean NOT NULL DEFAULT true
);
--> statement-breakpoint
REVOKE ALL ON ref_subject_group FROM edusync_app;
--> statement-breakpoint
GRANT SELECT ON ref_subject_group TO edusync_app;
--> statement-breakpoint
INSERT INTO ref_subject_group (key, label_id, label_en, label_su, profile_keys, report_section, sort) VALUES
  ('religion', 'Pendidikan Agama dan Budi Pekerti', 'Religious Education and Character', 'Atikan Agama jeung Budi Pekerti', NULL, 'A', 10),
  ('general', 'Kelompok Mata Pelajaran Umum', 'General Subjects', 'Kelompok Mata Pelajaran Umum', NULL, 'A', 20),
  ('pai_arabic', 'Rumpun PAI dan Bahasa Arab', 'Islamic Studies and Arabic', 'Rumpun PAI jeung Basa Arab', ARRAY['mi','mts','ma','mak'], 'A', 30),
  ('vocational', 'Kelompok Kejuruan', 'Vocational Subjects', 'Kelompok Kejuruan', ARRAY['smk','mak'], 'B', 40),
  ('vocational_base', 'Dasar Program Keahlian (data lama)', 'Program Foundation (legacy)', 'Dasar Program Keahlian (data heubeul)', ARRAY['smk','mak'], 'B', 41),
  ('vocational_concentration', 'Konsentrasi Keahlian (data lama)', 'Skill Concentration (legacy)', 'Konsentrasi Keahlian (data heubeul)', ARRAY['smk','mak'], 'B', 42),
  ('vocational_project', 'Projek Kejuruan (data lama)', 'Vocational Project (legacy)', 'Projek Kejuruan (data heubeul)', ARRAY['smk','mak'], 'B', 43),
  ('internship', 'Praktik Kerja Lapangan', 'Work-based Internship', 'Praktik Kerja Lapangan', ARRAY['smk','mak'], 'B', 44),
  ('program_strengthening', 'Penguatan Program', 'Program Strengthening', 'Penguatan Program', ARRAY['ma','mak'], 'B', 50),
  ('elective', 'Mata Pelajaran Pilihan', 'Elective Subjects', 'Mata Pelajaran Pilihan', NULL, 'C', 60),
  ('arts_craft', 'Seni/Prakarya Pilihan', 'Arts and Crafts (elective)', 'Seni/Prakarya Pilihan', NULL, 'C', 70),
  ('local_content', 'Muatan Lokal', 'Local Content', 'Muatan Lokal', NULL, 'C', 80);
--> statement-breakpoint
ALTER TABLE "subject" DROP CONSTRAINT "subject_group_ck";
--> statement-breakpoint
ALTER TABLE "subject" ADD CONSTRAINT "subject_subject_group_fk" FOREIGN KEY ("subject_group") REFERENCES "ref_subject_group"("key");
--> statement-breakpoint
ALTER TABLE "subject" ADD COLUMN "kind" text DEFAULT 'compulsory' NOT NULL;
--> statement-breakpoint
ALTER TABLE "subject" ADD COLUMN "religion_variant" text;
--> statement-breakpoint
ALTER TABLE "subject" ADD CONSTRAINT "subject_kind_ck" CHECK ("kind" IN ('compulsory', 'elective', 'local_content', 'project', 'internship'));
--> statement-breakpoint
ALTER TABLE "subject" ADD CONSTRAINT "subject_religion_variant_ck" CHECK ("religion_variant" IS NULL OR "religion_variant" IN ('islam', 'christian', 'catholic', 'hindu', 'buddhist', 'confucian', 'belief'));
--> statement-breakpoint
-- Selaraskan jenis mapel dengan metadata lama yang sudah ada.
UPDATE "subject" SET "kind" = CASE
  WHEN "subject_group" = 'internship' THEN 'internship'
  WHEN "subject_group" = 'vocational_project' THEN 'project'
  WHEN "subject_group" = 'elective' THEN 'elective'
  WHEN "is_local_content" THEN 'local_content'
  ELSE "kind" END
WHERE "subject_group" IN ('internship', 'vocational_project', 'elective') OR "is_local_content";
--> statement-breakpoint

-- K2. JP: weekly/yearly = intrakurikuler; kokurikuler tahunan dan minggu (PKL) kolom terpisah. Konfigurasi per tingkat.
ALTER TABLE "curriculum_subject_allocation" ADD COLUMN "cocurricular_yearly_periods" integer;
--> statement-breakpoint
ALTER TABLE "curriculum_subject_allocation" ADD COLUMN "weeks" integer;
--> statement-breakpoint
ALTER TABLE "curriculum_subject_allocation" ADD CONSTRAINT "curriculum_allocation_cocurricular_ck" CHECK ("cocurricular_yearly_periods" IS NULL OR "cocurricular_yearly_periods" >= 0);
--> statement-breakpoint
ALTER TABLE "curriculum_subject_allocation" ADD CONSTRAINT "curriculum_allocation_weeks_ck" CHECK ("weeks" IS NULL OR "weeks" >= 0);
--> statement-breakpoint
ALTER TABLE "school_level" ADD COLUMN "period_minutes" integer;
--> statement-breakpoint
ALTER TABLE "school_level" ADD COLUMN "effective_weeks" integer;
--> statement-breakpoint
ALTER TABLE "school_level" ADD CONSTRAINT "school_level_period_minutes_ck" CHECK ("period_minutes" IS NULL OR "period_minutes" > 0);
--> statement-breakpoint
ALTER TABLE "school_level" ADD CONSTRAINT "school_level_effective_weeks_ck" CHECK ("effective_weeks" IS NULL OR "effective_weeks" > 0);
--> statement-breakpoint

-- K3. Tingkat akhir per program (SMK 3 atau 4 tahun).
ALTER TABLE "program" ADD COLUMN "duration_years" integer;
--> statement-breakpoint
ALTER TABLE "program" ADD COLUMN "final_level_code" text;
--> statement-breakpoint
ALTER TABLE "program" ADD CONSTRAINT "program_duration_years_ck" CHECK ("duration_years" IS NULL OR "duration_years" IN (3, 4));
--> statement-breakpoint

-- K4. Catatan keputusan kenaikan kelas.
ALTER TABLE "promotion_decision" ADD COLUMN "reason" text;
--> statement-breakpoint
ALTER TABLE "promotion_decision" ADD COLUMN "follow_up" text;
--> statement-breakpoint
ALTER TABLE "promotion_decision" ADD COLUMN "meeting_date" date;
--> statement-breakpoint

-- K5. Mode nilai akhir: pembobotan, persentase, rata-rata.
ALTER TABLE "grading_setting" DROP CONSTRAINT "grading_setting_calculation_mode_ck";
--> statement-breakpoint
ALTER TABLE "grading_setting" ADD CONSTRAINT "grading_setting_calculation_mode_ck" CHECK ("calculation_mode" IN ('weighted_average', 'percentage', 'simple_average'));
