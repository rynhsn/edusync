-- Fase 5, tahap 5.5: UKK (Uji Kompetensi Keahlian) SMK (rancangan: docs/rancangan-fase-5-smk-penuh.md, bagian 4.3). HANYA DDL, aditif:
-- tanpa DROP, tanpa backfill, tanpa baris otomatis per sekolah, tanpa seed skala (skala bawaan hidup di kontrak, berlabel sumber).
-- Tabel yang didump garis dasar fase 3 tidak disentuh. Sekolah tanpa data UKK identik dengan sebelumnya.
--
-- ukk_event      kegiatan UKK per tahun ajaran, semester, dan konsentrasi keahlian; tiga pola (lsp, industry, independent).
-- ukk_assessor   penguji kegiatan: internal (guru) atau eksternal (isian bebas); diganti sekaligus lewat API.
-- ukk_result     satu baris per (kegiatan, murid, percobaan). Kategori (`band_code`, `band_label`, `competent`) diturunkan server dari
--                skala saat disimpan dan dibekukan di baris. Nomor sertifikat hanya untuk yang kompeten; surat keterangan untuk lainnya.
-- vocational_setting  kolom skala (jsonb, NULL = bawaan kontrak), bobot praktik/teori (NULL = nilai akhir diisi langsung), sakelar
--                tampil di rapor (false = rapor tidak berubah), dan pola nomor.
-- pkl_partner    UNIQUE (school_id, id) supaya mitra dunia kerja kegiatan UKK dapat memakai FK komposit (asumsi A3 rancangan).
-- Penanda lapor Dinas/e-Rapor (`reported_to_dinas_at`, `pushed_to_erapor_at`) dicatat MANUAL oleh staf; bukan integrasi.
-- CATATAN JURNAL: `when` manual lebih besar dari 0111 (1797816600000): 0112 = 1797903000000.
ALTER TABLE "pkl_partner" ADD CONSTRAINT "pkl_partner_school_id_uq" UNIQUE ("school_id", "id");
--> statement-breakpoint
CREATE TABLE "ukk_event" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "academic_year_id" uuid NOT NULL,
  "semester_id" uuid NOT NULL,
  "concentration_id" uuid NOT NULL,
  "pattern" text NOT NULL,
  "title" text NOT NULL,
  "scheme_name" text,
  "kkni_level" smallint,
  "lsp_name" text,
  "lsp_license_ref" text,
  "partner_id" uuid,
  "tuk_name" text,
  "starts_on" date,
  "ends_on" date,
  "status" text DEFAULT 'draft' NOT NULL,
  "reported_to_dinas_at" timestamp with time zone,
  "pushed_to_erapor_at" timestamp with time zone,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ukk_event_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "ukk_event_pattern_ck" CHECK ("pattern" IN ('lsp', 'industry', 'independent')),
  CONSTRAINT "ukk_event_status_ck" CHECK ("status" IN ('draft', 'active', 'closed')),
  CONSTRAINT "ukk_event_title_ck" CHECK (char_length("title") BETWEEN 1 AND 200),
  CONSTRAINT "ukk_event_scheme_ck" CHECK ("scheme_name" IS NULL OR char_length("scheme_name") <= 200),
  CONSTRAINT "ukk_event_kkni_ck" CHECK ("kkni_level" IS NULL OR "kkni_level" IN (2, 3)),
  CONSTRAINT "ukk_event_lsp_name_ck" CHECK ("lsp_name" IS NULL OR char_length("lsp_name") <= 200),
  CONSTRAINT "ukk_event_lsp_license_ck" CHECK ("lsp_license_ref" IS NULL OR char_length("lsp_license_ref") <= 200),
  CONSTRAINT "ukk_event_tuk_ck" CHECK ("tuk_name" IS NULL OR char_length("tuk_name") <= 200),
  CONSTRAINT "ukk_event_dates_ck" CHECK ("starts_on" IS NULL OR "ends_on" IS NULL OR "starts_on" <= "ends_on"),
  CONSTRAINT "ukk_event_year_fk" FOREIGN KEY ("school_id", "academic_year_id") REFERENCES "academic_year"("school_id", "id"),
  CONSTRAINT "ukk_event_semester_fk" FOREIGN KEY ("school_id", "semester_id") REFERENCES "semester"("school_id", "id"),
  CONSTRAINT "ukk_event_concentration_fk" FOREIGN KEY ("school_id", "concentration_id") REFERENCES "vocational_concentration"("school_id", "id"),
  CONSTRAINT "ukk_event_partner_fk" FOREIGN KEY ("school_id", "partner_id") REFERENCES "pkl_partner"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "ukk_event_year_idx" ON "ukk_event" ("school_id", "academic_year_id");
--> statement-breakpoint
CREATE INDEX "ukk_event_semester_idx" ON "ukk_event" ("school_id", "semester_id");
--> statement-breakpoint
CREATE TABLE "ukk_assessor" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "event_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "teacher_id" uuid,
  "name" text,
  "institution" text,
  "qualification" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ukk_assessor_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "ukk_assessor_kind_ck" CHECK ("kind" IN ('internal', 'external')),
  CONSTRAINT "ukk_assessor_who_ck" CHECK (
    ("kind" = 'internal' AND "teacher_id" IS NOT NULL)
    OR ("kind" = 'external' AND "name" IS NOT NULL AND char_length("name") BETWEEN 1 AND 160)
  ),
  CONSTRAINT "ukk_assessor_institution_ck" CHECK ("institution" IS NULL OR char_length("institution") <= 200),
  CONSTRAINT "ukk_assessor_qualification_ck" CHECK ("qualification" IS NULL OR char_length("qualification") <= 300),
  CONSTRAINT "ukk_assessor_event_fk" FOREIGN KEY ("school_id", "event_id") REFERENCES "ukk_event"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "ukk_assessor_teacher_fk" FOREIGN KEY ("school_id", "teacher_id") REFERENCES "teacher"("school_id", "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ukk_assessor_person_uq" ON "ukk_assessor" ("event_id", COALESCE("teacher_id", '00000000-0000-0000-0000-000000000000'::uuid), COALESCE("name", ''));
--> statement-breakpoint
CREATE INDEX "ukk_assessor_teacher_idx" ON "ukk_assessor" ("school_id", "teacher_id") WHERE "teacher_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE "ukk_result" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "event_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "attempt_no" smallint DEFAULT 1 NOT NULL,
  "practice_score" numeric(5, 2),
  "theory_score" numeric(5, 2),
  "final_score" numeric(5, 2),
  "band_code" text,
  "band_label" text,
  "competent" boolean,
  "certificate_no" text,
  "statement_no" text,
  "passport_units" text[],
  "note" text,
  "updated_by" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ukk_result_attempt_uq" UNIQUE ("event_id", "student_id", "attempt_no"),
  CONSTRAINT "ukk_result_attempt_ck" CHECK ("attempt_no" BETWEEN 1 AND 5),
  CONSTRAINT "ukk_result_practice_ck" CHECK ("practice_score" IS NULL OR "practice_score" BETWEEN 0 AND 100),
  CONSTRAINT "ukk_result_theory_ck" CHECK ("theory_score" IS NULL OR "theory_score" BETWEEN 0 AND 100),
  CONSTRAINT "ukk_result_final_ck" CHECK ("final_score" IS NULL OR "final_score" BETWEEN 0 AND 100),
  CONSTRAINT "ukk_result_certificate_ck" CHECK ("certificate_no" IS NULL OR ("competent" IS TRUE AND char_length("certificate_no") BETWEEN 1 AND 80)),
  CONSTRAINT "ukk_result_statement_ck" CHECK ("statement_no" IS NULL OR char_length("statement_no") BETWEEN 1 AND 80),
  CONSTRAINT "ukk_result_note_ck" CHECK ("note" IS NULL OR char_length("note") <= 1000),
  CONSTRAINT "ukk_result_event_fk" FOREIGN KEY ("school_id", "event_id") REFERENCES "ukk_event"("school_id", "id"),
  CONSTRAINT "ukk_result_student_fk" FOREIGN KEY ("school_id", "student_id") REFERENCES "student"("school_id", "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ukk_result_certificate_uq" ON "ukk_result" ("school_id", "certificate_no") WHERE "certificate_no" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "ukk_result_statement_uq" ON "ukk_result" ("school_id", "statement_no") WHERE "statement_no" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "ukk_result_student_idx" ON "ukk_result" ("school_id", "student_id");
--> statement-breakpoint
ALTER TABLE "vocational_setting" ADD COLUMN "ukk_bands" jsonb;
--> statement-breakpoint
ALTER TABLE "vocational_setting" ADD COLUMN "ukk_practice_weight" integer;
--> statement-breakpoint
ALTER TABLE "vocational_setting" ADD COLUMN "ukk_theory_weight" integer;
--> statement-breakpoint
ALTER TABLE "vocational_setting" ADD COLUMN "ukk_in_report" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "vocational_setting" ADD COLUMN "ukk_certificate_pattern" text;
--> statement-breakpoint
ALTER TABLE "vocational_setting" ADD CONSTRAINT "vocational_setting_ukk_weights_ck" CHECK (
  ("ukk_practice_weight" IS NULL) = ("ukk_theory_weight" IS NULL)
  AND ("ukk_practice_weight" IS NULL OR ("ukk_practice_weight" >= 0 AND "ukk_theory_weight" >= 0 AND "ukk_practice_weight" + "ukk_theory_weight" = 100))
);
--> statement-breakpoint
ALTER TABLE "vocational_setting" ADD CONSTRAINT "vocational_setting_ukk_pattern_ck" CHECK ("ukk_certificate_pattern" IS NULL OR char_length("ukk_certificate_pattern") <= 120);
--> statement-breakpoint
ALTER TABLE ukk_event ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ukk_event FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON ukk_event
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ukk_event TO edusync_app;
--> statement-breakpoint
ALTER TABLE ukk_assessor ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ukk_assessor FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON ukk_assessor
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ukk_assessor TO edusync_app;
--> statement-breakpoint
ALTER TABLE ukk_result ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ukk_result FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON ukk_result
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ukk_result TO edusync_app;
