-- Tahap 3.6.3: penilaian proses pembelajaran (C12; opsional per sekolah lewat `learning_plan_setting.review_enabled`).
-- Aditif, tanpa backfill (migrator tunduk FORCE RLS). Tidak memengaruhi nilai, rapor, atau alur lain; hanya melaporkan, tidak memblokir.
-- CATATAN JURNAL: `when` manual lebih besar dari 0123 (1798939800000): 0124 = 1799026200000.
-- Guru dihapus: tinjauan tentang dirinya ikut terhapus (CASCADE); guru penilai sejawat dihapus: tinjauan tetap, penilai dikosongkan.

CREATE TABLE "learning_process_review" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "semester_id" uuid NOT NULL,
  "teacher_id" uuid NOT NULL,
  "reviewer_kind" text NOT NULL,
  "reviewer_teacher_id" uuid,
  "reviewed_on" date NOT NULL,
  "ratings" jsonb,
  "respondent_count" integer,
  "note" text,
  "shared_with_teacher" boolean DEFAULT false NOT NULL,
  "recorded_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "learning_process_review_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "learning_process_review_kind_ck" CHECK ("reviewer_kind" IN ('self', 'peer', 'principal', 'student')),
  CONSTRAINT "learning_process_review_respondents_ck" CHECK ("respondent_count" IS NULL OR "respondent_count" > 0),
  CONSTRAINT "learning_process_review_note_ck" CHECK ("note" IS NULL OR char_length("note") <= 2000),
  CONSTRAINT "learning_process_review_semester_fk" FOREIGN KEY ("school_id", "semester_id") REFERENCES "semester"("school_id", "id"),
  CONSTRAINT "learning_process_review_teacher_fk" FOREIGN KEY ("school_id", "teacher_id") REFERENCES "teacher"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "learning_process_review_reviewer_fk" FOREIGN KEY ("school_id", "reviewer_teacher_id") REFERENCES "teacher"("school_id", "id") ON DELETE SET NULL ("reviewer_teacher_id")
);
--> statement-breakpoint
CREATE INDEX "learning_process_review_teacher_idx" ON "learning_process_review" ("school_id", "semester_id", "teacher_id");
--> statement-breakpoint
ALTER TABLE learning_process_review ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE learning_process_review FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON learning_process_review
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON learning_process_review TO edusync_app;
