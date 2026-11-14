-- Fase 4, tahap 4.1: kerangka profil (rancangan: docs/rancangan-fase-4-kokurikuler-madrasah.md, bagian 2 dan 4.1). HANYA DDL dan seed
-- acuan global, aditif: tanpa DROP, tanpa backfill, tanpa kolom baru pada tabel yang sudah ada, tanpa baris otomatis per sekolah
-- (adopsi kerangka selalu aksi eksplisit lewat API). Sekolah yang tidak memakai fitur ini identik dengan sebelumnya.
--
-- ref_profile_framework / ref_profile_framework_item   acuan GLOBAL (tanpa school_id, tanpa RLS, GRANT SELECT saja; pola ref_subject_group).
-- school_profile_item                                  butir kerangka yang diadopsi sekolah (tenant; label/aktif dapat diubah, butir buatan sendiri boleh).
-- cocurricular_rubric_level                            tingkat capaian rubrik per sekolah (tenant; isian contoh hanya saran UI, bukan enum).
--
-- Status sumber seed (kolom `verification`):
--   profil_lulusan_2025 = 'official'  : delapan dimensi dari Permendikdasmen 13/2025 Pasal 17. EJAAN LABEL belum dicek ke Lampiran I
--                                       (teks lampiran belum dibaca); label dapat diganti sekolah setelah diadopsi.
--   panca_cinta_2025    = 'secondary' : lima topik Panca Cinta (Kepdirjen Pendis 6077/2025). Urutan dan nama diambil dari halaman kanwil
--                                       (sumber sekunder), bukan dari teks resmi; `group_code` (sumber/tanda/tali cinta) sengaja NULL
--                                       karena pemetaan per topik belum pasti. Tidak ada teks resmi yang dikutip.
-- Tidak ada seed P5/P5RA (Edusync tidak punya data historis P5). Versi kebijakan baru = kunci kerangka baru; butir lama tetap ada.
--
-- Rollback kode ke sebelum tahap ini membiarkan tabel ini; kode lama mengabaikannya.
-- CATATAN JURNAL: `when` manual lebih besar dari 0105 (1797298200000): 0106 = 1797384600000.
CREATE TABLE "ref_profile_framework" (
  "key" text PRIMARY KEY NOT NULL,
  "kind" text NOT NULL,
  "label_id" text NOT NULL,
  "label_en" text NOT NULL,
  "label_su" text NOT NULL,
  "profile_keys" text[],
  "source" text NOT NULL,
  "verification" text NOT NULL,
  "sort" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  CONSTRAINT "ref_profile_framework_kind_ck" CHECK ("kind" IN ('dimension', 'value')),
  CONSTRAINT "ref_profile_framework_verification_ck" CHECK ("verification" IN ('official', 'secondary'))
);
--> statement-breakpoint
CREATE TABLE "ref_profile_framework_item" (
  "framework_key" text NOT NULL REFERENCES "ref_profile_framework"("key"),
  "code" text NOT NULL,
  "group_code" text,
  "label_id" text NOT NULL,
  "label_en" text NOT NULL,
  "label_su" text NOT NULL,
  "sort" integer DEFAULT 0 NOT NULL,
  PRIMARY KEY ("framework_key", "code")
);
--> statement-breakpoint
REVOKE ALL ON ref_profile_framework FROM edusync_app;
--> statement-breakpoint
REVOKE ALL ON ref_profile_framework_item FROM edusync_app;
--> statement-breakpoint
GRANT SELECT ON ref_profile_framework TO edusync_app;
--> statement-breakpoint
GRANT SELECT ON ref_profile_framework_item TO edusync_app;
--> statement-breakpoint
INSERT INTO ref_profile_framework (key, kind, label_id, label_en, label_su, profile_keys, source, verification, sort) VALUES
  ('profil_lulusan_2025', 'dimension', 'Dimensi Profil Lulusan 2025', 'Graduate Profile Dimensions 2025', 'Dimensi Profil Lulusan 2025', NULL, 'Permendikdasmen 13/2025 Pasal 17', 'official', 10),
  ('panca_cinta_2025', 'value', 'Panca Cinta (Kurikulum Berbasis Cinta)', 'Panca Cinta (Love-Based Curriculum)', 'Panca Cinta (Kurikulum Berbasis Cinta)', ARRAY['mi','mts','ma','mak'], 'Kepdirjen Pendis 6077/2025', 'secondary', 20);
--> statement-breakpoint
INSERT INTO ref_profile_framework_item (framework_key, code, group_code, label_id, label_en, label_su, sort) VALUES
  ('profil_lulusan_2025', 'faith', NULL, 'Keimanan dan ketakwaan kepada Tuhan YME', 'Faith and devotion to God Almighty', 'Iman jeung takwa ka Gusti Nu Maha Esa', 10),
  ('profil_lulusan_2025', 'citizenship', NULL, 'Kewargaan', 'Citizenship', 'Kawargaan', 20),
  ('profil_lulusan_2025', 'critical_reasoning', NULL, 'Penalaran kritis', 'Critical reasoning', 'Panalaran kritis', 30),
  ('profil_lulusan_2025', 'creativity', NULL, 'Kreativitas', 'Creativity', 'Kréativitas', 40),
  ('profil_lulusan_2025', 'collaboration', NULL, 'Kolaborasi', 'Collaboration', 'Kolaborasi', 50),
  ('profil_lulusan_2025', 'independence', NULL, 'Kemandirian', 'Independence', 'Kamandirian', 60),
  ('profil_lulusan_2025', 'health', NULL, 'Kesehatan', 'Health', 'Kaséhatan', 70),
  ('profil_lulusan_2025', 'communication', NULL, 'Komunikasi', 'Communication', 'Komunikasi', 80),
  ('panca_cinta_2025', 'love_god', NULL, 'Cinta Allah dan Rasul-Nya', 'Love of Allah and His Messenger', 'Cinta ka Allah jeung Rasul-Na', 10),
  ('panca_cinta_2025', 'love_knowledge', NULL, 'Cinta Ilmu', 'Love of knowledge', 'Cinta Élmu', 20),
  ('panca_cinta_2025', 'love_environment', NULL, 'Cinta Lingkungan', 'Love of the environment', 'Cinta Lingkungan', 30),
  ('panca_cinta_2025', 'love_self_others', NULL, 'Cinta Diri dan Sesama', 'Love of self and others', 'Cinta Diri jeung Sasama', 40),
  ('panca_cinta_2025', 'love_country', NULL, 'Cinta Tanah Air', 'Love of the homeland', 'Cinta Tanah Cai', 50);
--> statement-breakpoint
CREATE TABLE "school_profile_item" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "framework_key" text NOT NULL REFERENCES "ref_profile_framework"("key"),
  "ref_code" text,
  "code" text NOT NULL,
  "label" text NOT NULL,
  "description" text,
  "sort" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "school_profile_item_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "school_profile_item_code_uq" UNIQUE ("school_id", "framework_key", "code"),
  CONSTRAINT "school_profile_item_code_ck" CHECK (char_length("code") BETWEEN 1 AND 40),
  CONSTRAINT "school_profile_item_label_ck" CHECK (char_length("label") BETWEEN 1 AND 120),
  CONSTRAINT "school_profile_item_description_ck" CHECK ("description" IS NULL OR char_length("description") <= 1000)
);
--> statement-breakpoint
ALTER TABLE school_profile_item ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE school_profile_item FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON school_profile_item
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON school_profile_item TO edusync_app;
--> statement-breakpoint
CREATE TABLE "cocurricular_rubric_level" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "code" text NOT NULL,
  "label" text NOT NULL,
  "description" text,
  "sort" integer NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cocurricular_rubric_level_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "cocurricular_rubric_level_code_uq" UNIQUE ("school_id", "code"),
  CONSTRAINT "cocurricular_rubric_level_code_ck" CHECK (char_length("code") BETWEEN 1 AND 10),
  CONSTRAINT "cocurricular_rubric_level_label_ck" CHECK (char_length("label") BETWEEN 1 AND 60),
  CONSTRAINT "cocurricular_rubric_level_description_ck" CHECK ("description" IS NULL OR char_length("description") <= 500)
);
--> statement-breakpoint
ALTER TABLE cocurricular_rubric_level ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cocurricular_rubric_level FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON cocurricular_rubric_level
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON cocurricular_rubric_level TO edusync_app;
