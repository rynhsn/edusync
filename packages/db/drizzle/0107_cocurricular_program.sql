-- Fase 4, tahap 4.2: program kokurikuler (rancangan: docs/rancangan-fase-4-kokurikuler-madrasah.md, bagian 4.2). HANYA DDL, aditif:
-- tanpa DROP, tanpa backfill, tanpa kolom baru pada tabel yang sudah ada, tanpa baris otomatis per sekolah. Sekolah yang tidak memakai
-- fitur ini identik dengan sebelumnya.
--
-- cocurricular_program              program per tahun ajaran (semester_id NULL = sepanjang tahun); bentuk collaborative/g7kaih/other.
-- cocurricular_program_target       butir sasaran (school_profile_item) per program. Butir yang dipakai tidak bisa dihapus (API: 409 item_in_use).
-- cocurricular_program_class        rombel peserta program.
-- cocurricular_facilitator          koordinator (seluruh rombel program, class_id NULL) atau fasilitator (satu rombel).
-- Semua FK komposit (school_id, x_id); NO ACTION kecuali anak program (ON DELETE CASCADE bila program dihapus).
-- A1 rancangan terverifikasi: academic_year/semester/class_room/teacher/student sudah punya UNIQUE (school_id, id) (0087).
--
-- Rollback kode ke sebelum tahap ini membiarkan tabel ini; kode lama mengabaikannya.
-- CATATAN JURNAL: `when` manual lebih besar dari 0106 (1797384600000): 0107 = 1797471000000.
CREATE TABLE "cocurricular_program" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "academic_year_id" uuid NOT NULL,
  "semester_id" uuid,
  "form" text NOT NULL,
  "title" text NOT NULL,
  "theme" text,
  "description" text,
  "planned_periods" integer,
  "show_in_report" boolean DEFAULT true NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cocurricular_program_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "cocurricular_program_form_ck" CHECK ("form" IN ('collaborative', 'g7kaih', 'other')),
  CONSTRAINT "cocurricular_program_status_ck" CHECK ("status" IN ('draft', 'active', 'closed')),
  CONSTRAINT "cocurricular_program_title_ck" CHECK (char_length("title") BETWEEN 1 AND 200),
  CONSTRAINT "cocurricular_program_theme_ck" CHECK ("theme" IS NULL OR char_length("theme") <= 200),
  CONSTRAINT "cocurricular_program_description_ck" CHECK ("description" IS NULL OR char_length("description") <= 4000),
  CONSTRAINT "cocurricular_program_periods_ck" CHECK ("planned_periods" IS NULL OR "planned_periods" >= 0),
  CONSTRAINT "cocurricular_program_year_fk" FOREIGN KEY ("school_id", "academic_year_id") REFERENCES "academic_year"("school_id", "id"),
  CONSTRAINT "cocurricular_program_semester_fk" FOREIGN KEY ("school_id", "semester_id") REFERENCES "semester"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "cocurricular_program_year_idx" ON "cocurricular_program" ("school_id", "academic_year_id");
--> statement-breakpoint
CREATE TABLE "cocurricular_program_target" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "program_id" uuid NOT NULL,
  "profile_item_id" uuid NOT NULL,
  CONSTRAINT "cocurricular_program_target_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "cocurricular_program_target_uq" UNIQUE ("program_id", "profile_item_id"),
  CONSTRAINT "cocurricular_program_target_program_fk" FOREIGN KEY ("school_id", "program_id") REFERENCES "cocurricular_program"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "cocurricular_program_target_item_fk" FOREIGN KEY ("school_id", "profile_item_id") REFERENCES "school_profile_item"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "cocurricular_program_target_item_idx" ON "cocurricular_program_target" ("school_id", "profile_item_id");
--> statement-breakpoint
CREATE TABLE "cocurricular_program_class" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "program_id" uuid NOT NULL,
  "class_id" uuid NOT NULL,
  CONSTRAINT "cocurricular_program_class_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "cocurricular_program_class_uq" UNIQUE ("program_id", "class_id"),
  CONSTRAINT "cocurricular_program_class_program_fk" FOREIGN KEY ("school_id", "program_id") REFERENCES "cocurricular_program"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "cocurricular_program_class_class_fk" FOREIGN KEY ("school_id", "class_id") REFERENCES "class_room"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "cocurricular_program_class_class_idx" ON "cocurricular_program_class" ("school_id", "class_id");
--> statement-breakpoint
CREATE TABLE "cocurricular_facilitator" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "program_id" uuid NOT NULL,
  "teacher_id" uuid NOT NULL,
  "class_id" uuid,
  "role" text NOT NULL,
  CONSTRAINT "cocurricular_facilitator_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "cocurricular_facilitator_role_ck" CHECK ("role" IN ('coordinator', 'facilitator')),
  CONSTRAINT "cocurricular_facilitator_class_ck" CHECK ("role" = 'coordinator' OR "class_id" IS NOT NULL),
  CONSTRAINT "cocurricular_facilitator_program_fk" FOREIGN KEY ("school_id", "program_id") REFERENCES "cocurricular_program"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "cocurricular_facilitator_teacher_fk" FOREIGN KEY ("school_id", "teacher_id") REFERENCES "teacher"("school_id", "id"),
  CONSTRAINT "cocurricular_facilitator_class_fk" FOREIGN KEY ("school_id", "class_id") REFERENCES "class_room"("school_id", "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cocurricular_facilitator_uq" ON "cocurricular_facilitator" ("program_id", "teacher_id", COALESCE("class_id", '00000000-0000-0000-0000-000000000000'::uuid));
--> statement-breakpoint
CREATE INDEX "cocurricular_facilitator_teacher_idx" ON "cocurricular_facilitator" ("school_id", "teacher_id");
--> statement-breakpoint
ALTER TABLE cocurricular_program ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cocurricular_program FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON cocurricular_program
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON cocurricular_program TO edusync_app;
--> statement-breakpoint
ALTER TABLE cocurricular_program_target ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cocurricular_program_target FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON cocurricular_program_target
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON cocurricular_program_target TO edusync_app;
--> statement-breakpoint
ALTER TABLE cocurricular_program_class ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cocurricular_program_class FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON cocurricular_program_class
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON cocurricular_program_class TO edusync_app;
--> statement-breakpoint
ALTER TABLE cocurricular_facilitator ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cocurricular_facilitator FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON cocurricular_facilitator
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON cocurricular_facilitator TO edusync_app;
