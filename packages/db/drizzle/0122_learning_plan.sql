-- Tahap 3.6.1: sakelar fitur per sekolah (perencanaan, jurnal, penilaian proses; semuanya mati bila baris tidak ada) dan perencanaan
-- pembelajaran (tujuan, langkah, asesmen; tautan berkas saja) beserta relasi TP. Aditif, tanpa backfill (migrator tunduk FORCE RLS).
-- Kolom `journal_enabled`, `review_enabled`, `review_min_per_semester` dipakai tahap 3.6.2 dan 3.6.3. Tidak memengaruhi nilai, rapor, atau alur lain.
-- CATATAN JURNAL: `when` manual lebih besar dari 0121 (1798767000000): 0122 = 1798853400000.

CREATE TABLE "learning_plan_setting" (
  "school_id" uuid PRIMARY KEY NOT NULL REFERENCES "school"("id"),
  "plan_enabled" boolean DEFAULT false NOT NULL,
  "journal_enabled" boolean DEFAULT false NOT NULL,
  "review_enabled" boolean DEFAULT false NOT NULL,
  "review_min_per_semester" smallint DEFAULT 1 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "learning_plan_setting_min_ck" CHECK ("review_min_per_semester" BETWEEN 1 AND 4)
);
--> statement-breakpoint
CREATE TABLE "learning_plan" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "subject_id" uuid NOT NULL,
  "academic_year_id" uuid NOT NULL,
  "semester_id" uuid,
  "level_code" text,
  "teacher_id" uuid,
  "title" text NOT NULL,
  "goals" text NOT NULL,
  "steps" text NOT NULL,
  "assessment_plan" text NOT NULL,
  "link_url" text,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "learning_plan_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "learning_plan_text_len_ck" CHECK (char_length("goals") <= 8000 AND char_length("steps") <= 8000 AND char_length("assessment_plan") <= 8000),
  CONSTRAINT "learning_plan_link_ck" CHECK ("link_url" IS NULL OR ("link_url" LIKE 'https://%' AND char_length("link_url") <= 500)),
  CONSTRAINT "learning_plan_subject_fk" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subject"("school_id", "id"),
  CONSTRAINT "learning_plan_year_fk" FOREIGN KEY ("school_id", "academic_year_id") REFERENCES "academic_year"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "learning_plan_semester_fk" FOREIGN KEY ("school_id", "semester_id") REFERENCES "semester"("school_id", "id"),
  -- Guru dihapus: perencanaan tetap, menjadi milik sekolah (hanya teacher_id yang dikosongkan).
  CONSTRAINT "learning_plan_teacher_fk" FOREIGN KEY ("school_id", "teacher_id") REFERENCES "teacher"("school_id", "id") ON DELETE SET NULL ("teacher_id")
);
--> statement-breakpoint
CREATE INDEX "learning_plan_subject_idx" ON "learning_plan" ("school_id", "subject_id", "academic_year_id");
--> statement-breakpoint
CREATE TABLE "learning_plan_objective" (
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "plan_id" uuid NOT NULL,
  "objective_id" uuid NOT NULL,
  CONSTRAINT "learning_plan_objective_pk" PRIMARY KEY ("plan_id", "objective_id"),
  CONSTRAINT "learning_plan_objective_plan_fk" FOREIGN KEY ("school_id", "plan_id") REFERENCES "learning_plan"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "learning_plan_objective_objective_fk" FOREIGN KEY ("school_id", "objective_id") REFERENCES "learning_objective"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "learning_plan_objective_objective_idx" ON "learning_plan_objective" ("school_id", "objective_id");
--> statement-breakpoint
ALTER TABLE learning_plan_setting ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE learning_plan_setting FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON learning_plan_setting
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON learning_plan_setting TO edusync_app;
--> statement-breakpoint
ALTER TABLE learning_plan ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE learning_plan FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON learning_plan
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON learning_plan TO edusync_app;
--> statement-breakpoint
ALTER TABLE learning_plan_objective ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE learning_plan_objective FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON learning_plan_objective
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON learning_plan_objective TO edusync_app;
