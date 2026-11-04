-- Ujian: ujian per mapel, soal di dalam ujian (salinan dari bank soal), dan pengaturan lembar cetak.
CREATE TABLE "exam" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "exam_type_id" uuid REFERENCES "exam_type"("id") ON DELETE SET NULL,
  "type_name" text NOT NULL,
  "type_short" text NOT NULL,
  "title" text NOT NULL,
  "semester_id" uuid NOT NULL REFERENCES "semester"("id"),
  "subject_id" uuid NOT NULL REFERENCES "subject"("id"),
  "class_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "mode" text DEFAULT 'paper' NOT NULL,
  "exam_date" date,
  "start_time" text,
  "duration_minutes" integer,
  "status" text DEFAULT 'draft' NOT NULL,
  "paper" jsonb,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "exam_school_idx" ON "exam" ("school_id", "semester_id");
--> statement-breakpoint
CREATE TABLE "exam_question" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "exam_id" uuid NOT NULL REFERENCES "exam"("id") ON DELETE CASCADE,
  "source_question_id" uuid REFERENCES "question"("id") ON DELETE SET NULL,
  "sort" integer DEFAULT 0 NOT NULL,
  "type" text NOT NULL,
  "body" text NOT NULL,
  "options" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "answer" text,
  "points" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "exam_question_exam_idx" ON "exam_question" ("exam_id", "sort");
--> statement-breakpoint
CREATE TABLE "exam_paper_setting" (
  "school_id" uuid PRIMARY KEY NOT NULL REFERENCES "school"("id"),
  "config" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE exam ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON exam
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE exam_question ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_question FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON exam_question
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE exam_paper_setting ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_paper_setting FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON exam_paper_setting
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
