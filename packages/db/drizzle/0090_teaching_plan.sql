-- Fase 2B tahap 2: CP, TP, dan ATP milik sekolah. Aditif seluruhnya dan opsional; tanpa seed isi regulasi.
-- Izin `teaching_plan:write` tidak diisi di sini (tabel role ber-RLS); sampai ke sekolah lama lewat syncSystemRolePermissions.

-- 1. Capaian pembelajaran (CP).
CREATE TABLE "learning_outcome" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "subject_id" uuid NOT NULL,
  "phase" text NOT NULL,
  "code" text,
  "description" text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "supersedes_id" uuid,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "learning_outcome_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "learning_outcome_phase_ck" CHECK ("phase" IN ('A', 'B', 'C', 'D', 'E', 'F')),
  CONSTRAINT "learning_outcome_subject_fk" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subject"("school_id", "id"),
  CONSTRAINT "learning_outcome_supersedes_fk" FOREIGN KEY ("school_id", "supersedes_id") REFERENCES "learning_outcome"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "learning_outcome_subject_idx" ON "learning_outcome" ("school_id", "subject_id");
--> statement-breakpoint
ALTER TABLE learning_outcome ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE learning_outcome FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON learning_outcome
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON learning_outcome TO edusync_app;
--> statement-breakpoint

-- 2. Tujuan pembelajaran (TP) di bawah CP.
CREATE TABLE "learning_objective" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "outcome_id" uuid NOT NULL,
  "code" text,
  "description" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "supersedes_id" uuid,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "learning_objective_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "learning_objective_outcome_fk" FOREIGN KEY ("school_id", "outcome_id") REFERENCES "learning_outcome"("school_id", "id"),
  CONSTRAINT "learning_objective_supersedes_fk" FOREIGN KEY ("school_id", "supersedes_id") REFERENCES "learning_objective"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "learning_objective_outcome_idx" ON "learning_objective" ("school_id", "outcome_id");
--> statement-breakpoint
ALTER TABLE learning_objective ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE learning_objective FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON learning_objective
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON learning_objective TO edusync_app;
--> statement-breakpoint

-- 3. Alur tujuan pembelajaran (ATP) per mapel dan tahun ajaran.
CREATE TABLE "learning_flow" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "subject_id" uuid NOT NULL,
  "academic_year_id" uuid NOT NULL,
  "level_code" text,
  "phase" text,
  "name" text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "supersedes_id" uuid,
  "status" text DEFAULT 'draft' NOT NULL,
  "published_at" timestamp with time zone,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "learning_flow_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "learning_flow_status_ck" CHECK ("status" IN ('draft', 'published')),
  CONSTRAINT "learning_flow_phase_ck" CHECK ("phase" IS NULL OR "phase" IN ('A', 'B', 'C', 'D', 'E', 'F')),
  CONSTRAINT "learning_flow_subject_fk" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subject"("school_id", "id"),
  CONSTRAINT "learning_flow_year_fk" FOREIGN KEY ("school_id", "academic_year_id") REFERENCES "academic_year"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "learning_flow_supersedes_fk" FOREIGN KEY ("school_id", "supersedes_id") REFERENCES "learning_flow"("school_id", "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "learning_flow_uq" ON "learning_flow" ("school_id", "subject_id", "academic_year_id", "name", COALESCE("level_code", ''), "version");
--> statement-breakpoint
CREATE INDEX "learning_flow_year_idx" ON "learning_flow" ("school_id", "academic_year_id", "subject_id");
--> statement-breakpoint
ALTER TABLE learning_flow ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE learning_flow FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON learning_flow
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON learning_flow TO edusync_app;
--> statement-breakpoint

-- 4. Item ATP: urutan TP beserta alokasi minggu, JP, dan semester.
CREATE TABLE "learning_flow_item" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "flow_id" uuid NOT NULL,
  "objective_id" uuid NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "weeks" integer,
  "periods" integer,
  "semester_id" uuid,
  "note" text,
  CONSTRAINT "learning_flow_item_uq" UNIQUE ("flow_id", "objective_id"),
  CONSTRAINT "learning_flow_item_weeks_ck" CHECK ("weeks" IS NULL OR "weeks" >= 0),
  CONSTRAINT "learning_flow_item_periods_ck" CHECK ("periods" IS NULL OR "periods" >= 0),
  CONSTRAINT "learning_flow_item_flow_fk" FOREIGN KEY ("school_id", "flow_id") REFERENCES "learning_flow"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "learning_flow_item_objective_fk" FOREIGN KEY ("school_id", "objective_id") REFERENCES "learning_objective"("school_id", "id"),
  CONSTRAINT "learning_flow_item_semester_fk" FOREIGN KEY ("school_id", "semester_id") REFERENCES "semester"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "learning_flow_item_objective_idx" ON "learning_flow_item" ("school_id", "objective_id");
--> statement-breakpoint
ALTER TABLE learning_flow_item ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE learning_flow_item FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON learning_flow_item
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON learning_flow_item TO edusync_app;
