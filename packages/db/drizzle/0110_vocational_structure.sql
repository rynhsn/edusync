-- Fase 5, tahap 5.1: struktur keahlian SMK (rancangan: docs/rancangan-fase-5-smk-penuh.md, bagian 4.1). HANYA DDL, aditif:
-- tanpa DROP, tanpa backfill, tanpa kolom baru pada tabel yang sudah ada (tautan program -> konsentrasi di tabel baru, bukan di `program`),
-- tanpa baris otomatis per sekolah, tanpa seed spektrum keahlian (diisi sekolah; isi 244/M/2024 belum terbaca). Sekolah non-SMK dan SMK
-- yang tidak mengisi struktur ini identik dengan sebelumnya.
--
-- vocational_field         bidang keahlian.            vocational_program   program keahlian (di bawah bidang).
-- vocational_concentration konsentrasi keahlian (di bawah program keahlian).
-- program_concentration    tautan `program` (unit operasional: kelas, JP, KKTP) -> konsentrasi. ON DELETE CASCADE agar hapus `program`
--                          tidak tersandung baris tautan. Satu konsentrasi boleh punya dua program (3 dan 4 tahun).
-- vocational_setting       satu baris per sekolah, dibuat hanya saat disimpan. report_grouped = false: rapor tidak dikelompokkan
--                          dan kop tanpa identitas keahlian (perilaku lama).
-- Hapus bidang/program/konsentrasi yang masih punya anak atau tautan ditolak FK (API: 409 in_use).
-- CATATAN JURNAL: `when` manual lebih besar dari 0109 (1797643800000): 0110 = 1797730200000.
CREATE TABLE "vocational_field" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "code" text NOT NULL,
  "name" text NOT NULL,
  "dapodik_code" text,
  "source_ref" text,
  "sort" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vocational_field_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "vocational_field_code_uq" UNIQUE ("school_id", "code"),
  CONSTRAINT "vocational_field_code_ck" CHECK (char_length("code") BETWEEN 1 AND 20),
  CONSTRAINT "vocational_field_name_ck" CHECK (char_length("name") BETWEEN 1 AND 160),
  CONSTRAINT "vocational_field_dapodik_ck" CHECK ("dapodik_code" IS NULL OR char_length("dapodik_code") <= 40),
  CONSTRAINT "vocational_field_source_ck" CHECK ("source_ref" IS NULL OR char_length("source_ref") <= 60)
);
--> statement-breakpoint
CREATE TABLE "vocational_program" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "field_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "dapodik_code" text,
  "sort" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vocational_program_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "vocational_program_code_uq" UNIQUE ("school_id", "code"),
  CONSTRAINT "vocational_program_code_ck" CHECK (char_length("code") BETWEEN 1 AND 20),
  CONSTRAINT "vocational_program_name_ck" CHECK (char_length("name") BETWEEN 1 AND 160),
  CONSTRAINT "vocational_program_dapodik_ck" CHECK ("dapodik_code" IS NULL OR char_length("dapodik_code") <= 40),
  CONSTRAINT "vocational_program_field_fk" FOREIGN KEY ("school_id", "field_id") REFERENCES "vocational_field"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "vocational_program_field_idx" ON "vocational_program" ("school_id", "field_id");
--> statement-breakpoint
CREATE TABLE "vocational_concentration" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "vocational_program_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "dapodik_code" text,
  "sort" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vocational_concentration_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "vocational_concentration_code_uq" UNIQUE ("school_id", "code"),
  CONSTRAINT "vocational_concentration_code_ck" CHECK (char_length("code") BETWEEN 1 AND 20),
  CONSTRAINT "vocational_concentration_name_ck" CHECK (char_length("name") BETWEEN 1 AND 160),
  CONSTRAINT "vocational_concentration_dapodik_ck" CHECK ("dapodik_code" IS NULL OR char_length("dapodik_code") <= 40),
  CONSTRAINT "vocational_concentration_program_fk" FOREIGN KEY ("school_id", "vocational_program_id") REFERENCES "vocational_program"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "vocational_concentration_program_idx" ON "vocational_concentration" ("school_id", "vocational_program_id");
--> statement-breakpoint
CREATE TABLE "program_concentration" (
  "program_id" uuid PRIMARY KEY NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "concentration_id" uuid NOT NULL,
  CONSTRAINT "program_concentration_program_fk" FOREIGN KEY ("school_id", "program_id") REFERENCES "program"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "program_concentration_concentration_fk" FOREIGN KEY ("school_id", "concentration_id") REFERENCES "vocational_concentration"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "program_concentration_concentration_idx" ON "program_concentration" ("school_id", "concentration_id");
--> statement-breakpoint
CREATE TABLE "vocational_setting" (
  "school_id" uuid PRIMARY KEY NOT NULL REFERENCES "school"("id"),
  "report_grouped" boolean DEFAULT false NOT NULL,
  "updated_by" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE vocational_field ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE vocational_field FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON vocational_field
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON vocational_field TO edusync_app;
--> statement-breakpoint
ALTER TABLE vocational_program ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE vocational_program FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON vocational_program
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON vocational_program TO edusync_app;
--> statement-breakpoint
ALTER TABLE vocational_concentration ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE vocational_concentration FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON vocational_concentration
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON vocational_concentration TO edusync_app;
--> statement-breakpoint
ALTER TABLE program_concentration ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE program_concentration FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON program_concentration
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON program_concentration TO edusync_app;
--> statement-breakpoint
ALTER TABLE vocational_setting ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE vocational_setting FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON vocational_setting
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON vocational_setting TO edusync_app;
