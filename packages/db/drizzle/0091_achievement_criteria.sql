-- Fase 2B tahap 3: KKTP (kriteria ketercapaian tujuan pembelajaran) dan mode perhitungan nilai. Aditif seluruhnya:
-- tanpa baris kriteria, KKM tetap `grading_setting.kkm`. Izin memakai `curriculum:manage` dan `subject:read` yang sudah ada.

-- 1. Kriteria per mapel, opsional per tingkat, program, dan tujuan pembelajaran (TP).
CREATE TABLE "achievement_criteria" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "subject_id" uuid NOT NULL,
  "level_code" text,
  "program_id" uuid,
  "objective_id" uuid,
  "mode" text NOT NULL,
  "threshold" numeric(5, 2),
  "note" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "achievement_criteria_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "achievement_criteria_mode_ck" CHECK ("mode" IN ('numeric', 'interval', 'descriptor', 'rubric')),
  CONSTRAINT "achievement_criteria_threshold_ck" CHECK ("threshold" IS NULL OR ("threshold" >= 0 AND "threshold" <= 100)),
  CONSTRAINT "achievement_criteria_subject_fk" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subject"("school_id", "id"),
  CONSTRAINT "achievement_criteria_program_fk" FOREIGN KEY ("school_id", "program_id") REFERENCES "program"("school_id", "id"),
  CONSTRAINT "achievement_criteria_objective_fk" FOREIGN KEY ("school_id", "objective_id") REFERENCES "learning_objective"("school_id", "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "achievement_criteria_scope_uq" ON "achievement_criteria" ("school_id", "subject_id", COALESCE("level_code", ''), COALESCE("program_id", '00000000-0000-0000-0000-000000000000'::uuid), COALESCE("objective_id", '00000000-0000-0000-0000-000000000000'::uuid));
--> statement-breakpoint
CREATE INDEX "achievement_criteria_subject_idx" ON "achievement_criteria" ("school_id", "subject_id");
--> statement-breakpoint
ALTER TABLE achievement_criteria ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE achievement_criteria FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON achievement_criteria
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON achievement_criteria TO edusync_app;
--> statement-breakpoint

-- 2. Level rubrik/interval/deskriptor milik satu kriteria.
CREATE TABLE "achievement_rubric_level" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "criteria_id" uuid NOT NULL,
  "label" text NOT NULL,
  "descriptor" text,
  "min_score" numeric(5, 2),
  "max_score" numeric(5, 2),
  "is_achieved" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "achievement_rubric_level_min_ck" CHECK ("min_score" IS NULL OR ("min_score" >= 0 AND "min_score" <= 100)),
  CONSTRAINT "achievement_rubric_level_max_ck" CHECK ("max_score" IS NULL OR ("max_score" >= 0 AND "max_score" <= 100)),
  CONSTRAINT "achievement_rubric_level_range_ck" CHECK ("min_score" IS NULL OR "max_score" IS NULL OR "min_score" <= "max_score"),
  CONSTRAINT "achievement_rubric_level_criteria_fk" FOREIGN KEY ("school_id", "criteria_id") REFERENCES "achievement_criteria"("school_id", "id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "achievement_rubric_level_criteria_idx" ON "achievement_rubric_level" ("school_id", "criteria_id");
--> statement-breakpoint
ALTER TABLE achievement_rubric_level ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE achievement_rubric_level FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON achievement_rubric_level
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON achievement_rubric_level TO edusync_app;
--> statement-breakpoint

-- 3. Mode perhitungan nilai akhir; hanya rumus sekarang (rata-rata tertimbang) yang sah, kolom disiapkan untuk mode lain.
ALTER TABLE "grading_setting" ADD COLUMN "calculation_mode" text DEFAULT 'weighted_average' NOT NULL;
--> statement-breakpoint
ALTER TABLE "grading_setting" ADD CONSTRAINT "grading_setting_calculation_mode_ck" CHECK ("calculation_mode" IN ('weighted_average'));
