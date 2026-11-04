-- Hasil ujian: peserta, jawaban per soal, dan tautan ke penilaian di buku nilai.
CREATE TABLE "exam_attempt" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "exam_id" uuid NOT NULL REFERENCES "exam"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "student"("id"),
  "absent" boolean DEFAULT false NOT NULL,
  "updated_by" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "exam_attempt_exam_student_uq" UNIQUE ("exam_id", "student_id")
);
--> statement-breakpoint
CREATE TABLE "exam_answer" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "attempt_id" uuid NOT NULL REFERENCES "exam_attempt"("id") ON DELETE CASCADE,
  "exam_question_id" uuid NOT NULL REFERENCES "exam_question"("id") ON DELETE CASCADE,
  "answer" text,
  "score" numeric(6, 2),
  CONSTRAINT "exam_answer_attempt_question_uq" UNIQUE ("attempt_id", "exam_question_id")
);
--> statement-breakpoint
ALTER TABLE "assessment" ADD COLUMN "exam_id" uuid REFERENCES "exam"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_exam_class_uq" ON "assessment" ("exam_id", "class_id") WHERE "exam_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE exam_attempt ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_attempt FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON exam_attempt
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE exam_answer ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_answer FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON exam_answer
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
