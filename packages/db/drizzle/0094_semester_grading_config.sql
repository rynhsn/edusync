-- Pembekuan konfigurasi nilai per semester (rancangan: docs/rancangan-pembekuan-konfigurasi-nilai.md, tahap A, langkah L1).
-- HANYA DDL. Pengisian data lama (backfill) sengaja tidak di sini: semua tabel tenant memakai FORCE ROW LEVEL SECURITY, jadi
-- INSERT ... SELECT di berkas migrasi diam-diam tidak melakukan apa pun bila pemilik tabel bukan BYPASSRLS. Backfill lewat
-- migrator TypeScript dengan koneksi platform (tahap B).
--
-- Satu baris per semester. Tidak ada baris = semester mengikuti konfigurasi hidup (perilaku sebelum migrasi ini). Ada baris =
-- semester beku dan memakai salinan ini. Kolom `components` dan `criteria` berbentuk jsonb (`config_version` = 1; bentuknya
-- didefinisikan di packages/contracts/src/grading-config.ts). Aditif: tidak ada kolom yang dihapus atau berganti tipe.
--
-- Sengaja tanpa CHECK rentang atau urutan pada KKM dan predikat: tabel hidup tidak punya CHECK itu, dan baris hidup yang ganjil
-- tidak boleh membuat finalisasi gagal karena salinannya ditolak. Validasi tetap di API saat konfigurasi hidup ditulis.
--
-- FK komposit ke semester(school_id, id) (semester_school_id_uq sejak 0087) ON DELETE CASCADE: semester yang punya rapor atau
-- penilaian tidak dapat dihapus (FK report_card dan assessment NO ACTION), jadi hanya semester kosong yang membawa salinannya pergi.
--
-- CATATAN JURNAL: `when` di meta/_journal.json wajib manual dan lebih tinggi dari 0093 (1796261400000): 0094 = 1796347800000.
CREATE TABLE "semester_grading_config" (
  "semester_id" uuid PRIMARY KEY NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "kkm" integer NOT NULL,
  "predicate_a" integer NOT NULL,
  "predicate_b" integer NOT NULL,
  "predicate_c" integer NOT NULL,
  "calculation_mode" text NOT NULL,
  "components" jsonb NOT NULL,
  "criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "config_version" integer DEFAULT 1 NOT NULL,
  "origin" text NOT NULL,
  "frozen_by" text,
  "frozen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "semester_grading_config_school_semester_uq" UNIQUE ("school_id", "semester_id"),
  CONSTRAINT "semester_grading_config_semester_fk" FOREIGN KEY ("school_id", "semester_id")
    REFERENCES "semester"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "semester_grading_config_mode_ck"
    CHECK ("calculation_mode" IN ('weighted_average', 'percentage', 'simple_average')),
  CONSTRAINT "semester_grading_config_origin_ck"
    CHECK ("origin" IN ('finalize', 'semester_closed', 'sync', 'backfill', 'manual')),
  CONSTRAINT "semester_grading_config_components_ck" CHECK (jsonb_typeof("components") = 'array'),
  CONSTRAINT "semester_grading_config_criteria_ck" CHECK (jsonb_typeof("criteria") = 'array')
);
--> statement-breakpoint
ALTER TABLE semester_grading_config ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE semester_grading_config FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON semester_grading_config
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON semester_grading_config TO edusync_app;
