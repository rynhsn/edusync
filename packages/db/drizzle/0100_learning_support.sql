-- Fase 3, tahap 3.5: remedial dan pengayaan (rancangan: docs/rancangan-fase-3-asesmen-rapor.md, bagian 3.6 dan 4.4). HANYA DDL,
-- aditif: tanpa DROP dan tanpa perubahan tipe. Bawaan = perilaku sebelum migrasi (kebijakan NULL = record_only, tanpa percobaan),
-- jadi tidak ada backfill (bawaan kolom tidak melewati RLS). Rancangan menamai migrasi ini 0099; nomor 0098 dan 0099 sudah dipakai
-- tahap 3.3 dan 3.4, jadi tahap ini 0100.
--
-- learning_support                     satu kegiatan pendampingan (kind = remedial | enrichment) pada kelas-mapel-semester.
-- learning_support_objective           TP sasaran (many-to-many). FK ke pendampingan CASCADE, ke TP NO ACTION.
-- learning_support_participant         murid peserta, status, catatan hasil. FK ke pendampingan CASCADE, ke murid NO ACTION.
-- score_remedial_attempt               hasil asesmen ulang per (penilaian, murid, percobaan ke-n). Skor ASLI di score.value TIDAK
--                                      pernah ditimpa; dorong nilai ujian hanya mengubah score.value, percobaan tetap (R13).
--                                      FK ke penilaian NO ACTION (rute hapus penilaian menghapus percobaannya secara eksplisit),
--                                      ke murid NO ACTION, ke pendampingan SET NULL hanya pada support_id (school_id NOT NULL).
-- grading_setting.remedial_policy      NULL = record_only | 'record_only' | 'replace_latest' | 'max' | 'cap_at_criteria' |
--                                      'mean_with_original'. Tidak dikunci ke satu pilihan (K8: tidak ada aturan nasional).
-- semester_grading_config.remedial_policy  salinan beku kebijakan (sparse: NULL bila bawaan); kode lama mengabaikannya.
--
-- Rollback kode ke sebelum tahap ini membiarkan tabel dan kolom ini; kebijakan diabaikan (kembali record_only) sehingga angka draf
-- sekolah yang memakai kebijakan selain record_only kembali ke skor asli; rapor final aman (dibaca dari snapshot).
--
-- CATATAN JURNAL: `when` manual lebih besar dari 0099 (1796779800000): 0100 = 1796866200000.
ALTER TABLE "grading_setting" ADD COLUMN "remedial_policy" text;
--> statement-breakpoint
ALTER TABLE "grading_setting" ADD CONSTRAINT "grading_setting_remedial_policy_ck" CHECK ("remedial_policy" IS NULL OR "remedial_policy" IN ('record_only', 'replace_latest', 'max', 'cap_at_criteria', 'mean_with_original'));
--> statement-breakpoint
ALTER TABLE "semester_grading_config" ADD COLUMN "remedial_policy" text;
--> statement-breakpoint
ALTER TABLE "semester_grading_config" ADD CONSTRAINT "semester_grading_config_remedial_policy_ck" CHECK ("remedial_policy" IS NULL OR "remedial_policy" IN ('record_only', 'replace_latest', 'max', 'cap_at_criteria', 'mean_with_original'));
--> statement-breakpoint
CREATE TABLE "learning_support" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "semester_id" uuid NOT NULL,
  "class_id" uuid NOT NULL,
  "subject_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "starts_on" date,
  "ends_on" date,
  "teacher_id" uuid,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "learning_support_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "learning_support_kind_ck" CHECK ("kind" IN ('remedial', 'enrichment')),
  CONSTRAINT "learning_support_title_ck" CHECK (char_length("title") BETWEEN 1 AND 120),
  CONSTRAINT "learning_support_description_ck" CHECK ("description" IS NULL OR char_length("description") <= 2000),
  CONSTRAINT "learning_support_dates_ck" CHECK ("starts_on" IS NULL OR "ends_on" IS NULL OR "starts_on" <= "ends_on"),
  CONSTRAINT "learning_support_semester_fk" FOREIGN KEY ("school_id", "semester_id") REFERENCES "semester"("school_id", "id"),
  CONSTRAINT "learning_support_class_fk" FOREIGN KEY ("school_id", "class_id") REFERENCES "class_room"("school_id", "id"),
  CONSTRAINT "learning_support_subject_fk" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subject"("school_id", "id"),
  CONSTRAINT "learning_support_teacher_fk" FOREIGN KEY ("school_id", "teacher_id") REFERENCES "teacher"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "learning_support_scope_idx" ON "learning_support" ("school_id", "semester_id", "class_id", "subject_id");
--> statement-breakpoint
ALTER TABLE learning_support ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE learning_support FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON learning_support
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON learning_support TO edusync_app;
--> statement-breakpoint
CREATE TABLE "learning_support_objective" (
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "support_id" uuid NOT NULL,
  "objective_id" uuid NOT NULL,
  CONSTRAINT "learning_support_objective_pk" PRIMARY KEY ("support_id", "objective_id"),
  CONSTRAINT "learning_support_objective_support_fk" FOREIGN KEY ("school_id", "support_id") REFERENCES "learning_support"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "learning_support_objective_objective_fk" FOREIGN KEY ("school_id", "objective_id") REFERENCES "learning_objective"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "learning_support_objective_objective_idx" ON "learning_support_objective" ("school_id", "objective_id");
--> statement-breakpoint
ALTER TABLE learning_support_objective ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE learning_support_objective FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON learning_support_objective
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON learning_support_objective TO edusync_app;
--> statement-breakpoint
CREATE TABLE "learning_support_participant" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "support_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "status" text DEFAULT 'planned' NOT NULL,
  "outcome_note" text,
  "updated_by" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "learning_support_participant_uq" UNIQUE ("support_id", "student_id"),
  CONSTRAINT "learning_support_participant_status_ck" CHECK ("status" IN ('planned', 'in_progress', 'completed', 'cancelled')),
  CONSTRAINT "learning_support_participant_note_ck" CHECK ("outcome_note" IS NULL OR char_length("outcome_note") <= 1000),
  CONSTRAINT "learning_support_participant_support_fk" FOREIGN KEY ("school_id", "support_id") REFERENCES "learning_support"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "learning_support_participant_student_fk" FOREIGN KEY ("school_id", "student_id") REFERENCES "student"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "learning_support_participant_student_idx" ON "learning_support_participant" ("school_id", "student_id");
--> statement-breakpoint
ALTER TABLE learning_support_participant ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE learning_support_participant FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON learning_support_participant
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON learning_support_participant TO edusync_app;
--> statement-breakpoint
CREATE TABLE "score_remedial_attempt" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "assessment_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "support_id" uuid,
  "attempt_no" integer NOT NULL,
  "value" numeric(6, 2),
  "taken_on" date NOT NULL,
  "note" text,
  "recorded_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "score_remedial_attempt_uq" UNIQUE ("assessment_id", "student_id", "attempt_no"),
  CONSTRAINT "score_remedial_attempt_no_ck" CHECK ("attempt_no" BETWEEN 1 AND 20),
  CONSTRAINT "score_remedial_attempt_value_ck" CHECK ("value" IS NULL OR "value" >= 0),
  CONSTRAINT "score_remedial_attempt_note_ck" CHECK ("note" IS NULL OR char_length("note") <= 500),
  CONSTRAINT "score_remedial_attempt_assessment_fk" FOREIGN KEY ("school_id", "assessment_id") REFERENCES "assessment"("school_id", "id"),
  CONSTRAINT "score_remedial_attempt_student_fk" FOREIGN KEY ("school_id", "student_id") REFERENCES "student"("school_id", "id"),
  CONSTRAINT "score_remedial_attempt_support_fk" FOREIGN KEY ("school_id", "support_id") REFERENCES "learning_support"("school_id", "id") ON DELETE SET NULL ("support_id")
);
--> statement-breakpoint
CREATE INDEX "score_remedial_attempt_assessment_idx" ON "score_remedial_attempt" ("school_id", "assessment_id");
--> statement-breakpoint
ALTER TABLE score_remedial_attempt ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE score_remedial_attempt FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON score_remedial_attempt
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON score_remedial_attempt TO edusync_app;
