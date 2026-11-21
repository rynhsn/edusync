-- Tahap 3.6.2: jurnal mengajar di Absensi per jam (opsional per sekolah lewat `learning_plan_setting.journal_enabled`) beserta relasi TP.
-- Aditif, tanpa backfill (migrator tunduk FORCE RLS). Tidak memengaruhi nilai, rapor, atau absensi. Satu jurnal per (sel jadwal, tanggal).
-- CATATAN JURNAL: `when` manual lebih besar dari 0122 (1798853400000): 0123 = 1798939800000.
-- `schedule_entry` belum punya UNIQUE (school_id, id) untuk FK komposit; ditambahkan di sini (aditif, id sudah unik).

ALTER TABLE "schedule_entry" ADD CONSTRAINT "schedule_entry_school_id_uq" UNIQUE ("school_id", "id");
--> statement-breakpoint
CREATE TABLE "lesson_journal" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "schedule_entry_id" uuid NOT NULL,
  "date" date NOT NULL,
  "topic" text NOT NULL,
  "note" text,
  "plan_id" uuid,
  "actual_teacher_id" uuid,
  "recorded_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "lesson_journal_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "lesson_journal_uq" UNIQUE ("schedule_entry_id", "date"),
  CONSTRAINT "lesson_journal_text_ck" CHECK (char_length("topic") BETWEEN 1 AND 200 AND ("note" IS NULL OR char_length("note") <= 2000)),
  CONSTRAINT "lesson_journal_entry_fk" FOREIGN KEY ("school_id", "schedule_entry_id") REFERENCES "schedule_entry"("school_id", "id") ON DELETE CASCADE,
  -- Perencanaan dihapus: jurnal tetap, hanya plan_id yang dikosongkan.
  CONSTRAINT "lesson_journal_plan_fk" FOREIGN KEY ("school_id", "plan_id") REFERENCES "learning_plan"("school_id", "id") ON DELETE SET NULL ("plan_id"),
  CONSTRAINT "lesson_journal_teacher_fk" FOREIGN KEY ("school_id", "actual_teacher_id") REFERENCES "teacher"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "lesson_journal_school_date_idx" ON "lesson_journal" ("school_id", "date");
--> statement-breakpoint
CREATE TABLE "lesson_journal_objective" (
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "journal_id" uuid NOT NULL,
  "objective_id" uuid NOT NULL,
  CONSTRAINT "lesson_journal_objective_pk" PRIMARY KEY ("journal_id", "objective_id"),
  CONSTRAINT "lesson_journal_objective_journal_fk" FOREIGN KEY ("school_id", "journal_id") REFERENCES "lesson_journal"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "lesson_journal_objective_objective_fk" FOREIGN KEY ("school_id", "objective_id") REFERENCES "learning_objective"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "lesson_journal_objective_objective_idx" ON "lesson_journal_objective" ("school_id", "objective_id");
--> statement-breakpoint
ALTER TABLE lesson_journal ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE lesson_journal FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON lesson_journal
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON lesson_journal TO edusync_app;
--> statement-breakpoint
ALTER TABLE lesson_journal_objective ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE lesson_journal_objective FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON lesson_journal_objective
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON lesson_journal_objective TO edusync_app;
