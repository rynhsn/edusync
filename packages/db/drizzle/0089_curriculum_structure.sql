-- Fase 2B tahap 1: metadata mapel, alokasi JP per tahun/tingkat/program, dan versi kurikulum per tahun/tingkat.
-- Aditif: kolom baru nullable/berdefault, tanpa DROP; perilaku lama tidak berubah.
-- Izin `curriculum:manage` tidak diisi di sini (tabel role ber-RLS); sampai ke sekolah lama lewat syncSystemRolePermissions.

-- 1. Metadata mapel.
ALTER TABLE "subject" ADD COLUMN "ref_subject_id" uuid REFERENCES "ref_subject"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "subject" ADD COLUMN "subject_group" text;
--> statement-breakpoint
ALTER TABLE "subject" ADD COLUMN "is_local_content" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "subject" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "subject" ADD COLUMN "active" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "subject" ADD CONSTRAINT "subject_group_ck" CHECK ("subject_group" IS NULL OR "subject_group" IN ('general', 'vocational_base', 'vocational_concentration', 'vocational_project', 'elective', 'internship'));
--> statement-breakpoint
CREATE INDEX "subject_ref_subject_idx" ON "subject" ("school_id", "ref_subject_id");
--> statement-breakpoint

-- 2. Kunci komposit (school_id, id) pada program untuk FK komposit.
ALTER TABLE "program" ADD CONSTRAINT "program_school_id_uq" UNIQUE ("school_id", "id");
--> statement-breakpoint

-- 3. Alokasi JP per (tahun ajaran, tingkat, program, mapel). program_id kosong = semua program.
CREATE TABLE "curriculum_subject_allocation" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "academic_year_id" uuid NOT NULL,
  "level_code" text NOT NULL,
  "program_id" uuid,
  "subject_id" uuid NOT NULL,
  "weekly_periods" integer,
  "yearly_periods" integer,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "curriculum_allocation_weekly_ck" CHECK ("weekly_periods" IS NULL OR "weekly_periods" >= 0),
  CONSTRAINT "curriculum_allocation_yearly_ck" CHECK ("yearly_periods" IS NULL OR "yearly_periods" >= 0),
  CONSTRAINT "curriculum_allocation_year_fk" FOREIGN KEY ("school_id", "academic_year_id") REFERENCES "academic_year"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "curriculum_allocation_subject_fk" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subject"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "curriculum_allocation_program_fk" FOREIGN KEY ("school_id", "program_id") REFERENCES "program"("school_id", "id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_allocation_uq" ON "curriculum_subject_allocation" ("academic_year_id", "level_code", COALESCE("program_id", '00000000-0000-0000-0000-000000000000'::uuid), "subject_id");
--> statement-breakpoint
CREATE INDEX "curriculum_allocation_year_idx" ON "curriculum_subject_allocation" ("school_id", "academic_year_id");
--> statement-breakpoint
ALTER TABLE curriculum_subject_allocation ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE curriculum_subject_allocation FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON curriculum_subject_allocation
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON curriculum_subject_allocation TO edusync_app;
--> statement-breakpoint

-- 4. Versi kurikulum yang dipakai per (tahun ajaran, tingkat).
CREATE TABLE "school_curriculum_version" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "academic_year_id" uuid NOT NULL,
  "level_code" text NOT NULL,
  "curriculum_key" text NOT NULL REFERENCES "ref_curriculum"("key"),
  "effective_from" date,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "school_curriculum_version_uq" UNIQUE ("academic_year_id", "level_code"),
  CONSTRAINT "school_curriculum_version_year_fk" FOREIGN KEY ("school_id", "academic_year_id") REFERENCES "academic_year"("school_id", "id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "school_curriculum_version_year_idx" ON "school_curriculum_version" ("school_id", "academic_year_id");
--> statement-breakpoint
ALTER TABLE school_curriculum_version ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE school_curriculum_version FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON school_curriculum_version
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON school_curriculum_version TO edusync_app;
