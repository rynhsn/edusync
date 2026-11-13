-- Fase 3, tahap 3.3: kaitan penilaian ke tujuan pembelajaran (TP) dan ketercapaian TP (rancangan: docs/rancangan-fase-3-asesmen-rapor.md,
-- bagian 3.2 dan 4.3). HANYA DDL, aditif: tanpa DROP dan tanpa perubahan tipe. Bawaan = perilaku sebelum migrasi (tanpa kaitan TP,
-- tanpa override, agregasi NULL = rata-rata, kriteria TP beku '[]'), jadi tidak ada backfill (bawaan kolom tidak melewati RLS).
--
-- assessment.UNIQUE (school_id, id)                  agar FK komposit assessment_objective mungkin (satu indeks pada tabel penilaian;
--                                                    risiko R9 di rancangan: ukur jumlah baris produksi sebelum menerapkan).
-- assessment_objective                               kaitan many-to-many penilaian <-> TP. Satu skor penilaian berlaku untuk semua TP
--                                                    yang dikaitkan (K5). FK ke penilaian ON DELETE CASCADE (hanya tautan; hapus penilaian
--                                                    sudah dijaga report_final); FK ke TP NO ACTION: menghapus TP yang dikaitkan ditolak
--                                                    (rute memetakan 23503 ke 409 in_use).
-- student_objective_achievement                      HANYA keputusan guru (override) per siswa-TP-semester dengan status, label level, dan
--                                                    alasan; BUKAN hasil hitung (ketercapaian dihitung saat dibaca dari skor).
-- grading_setting.objective_aggregation              NULL = mean | 'mean' | 'latest' | 'max' (K4).
-- semester_grading_config.objective_aggregation      salinan beku aturan agregasi (sparse: NULL bila bawaan).
-- semester_grading_config.objective_criteria         salinan beku kriteria per TP, kolom TERPISAH dari `criteria` karena skema baca v1
--                                                    `criteria` mewajibkan objectiveId null (kode lama gagal parse bila ada baris ber-TP).
--                                                    Kolom ini diabaikan kode lama. Bawaan '[]'.
--
-- Rollback kode ke sebelum tahap ini membiarkan tabel dan kolom ini; kode lama mengabaikannya (tidak ada efek pada angka).
--
-- CATATAN JURNAL: `when` manual lebih besar dari 0097 (1796607000000): 0098 = 1796693400000.
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_school_id_uq" UNIQUE ("school_id", "id");
--> statement-breakpoint
ALTER TABLE "grading_setting" ADD COLUMN "objective_aggregation" text;
--> statement-breakpoint
ALTER TABLE "grading_setting" ADD CONSTRAINT "grading_setting_objective_aggregation_ck" CHECK ("objective_aggregation" IS NULL OR "objective_aggregation" IN ('mean', 'latest', 'max'));
--> statement-breakpoint
ALTER TABLE "semester_grading_config" ADD COLUMN "objective_criteria" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "semester_grading_config" ADD COLUMN "objective_aggregation" text;
--> statement-breakpoint
ALTER TABLE "semester_grading_config" ADD CONSTRAINT "semester_grading_config_objective_criteria_ck" CHECK (jsonb_typeof("objective_criteria") = 'array');
--> statement-breakpoint
ALTER TABLE "semester_grading_config" ADD CONSTRAINT "semester_grading_config_objective_aggregation_ck" CHECK ("objective_aggregation" IS NULL OR "objective_aggregation" IN ('mean', 'latest', 'max'));
--> statement-breakpoint
CREATE TABLE "assessment_objective" (
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "assessment_id" uuid NOT NULL,
  "objective_id" uuid NOT NULL,
  CONSTRAINT "assessment_objective_pk" PRIMARY KEY ("assessment_id", "objective_id"),
  CONSTRAINT "assessment_objective_assessment_fk" FOREIGN KEY ("school_id", "assessment_id") REFERENCES "assessment"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "assessment_objective_objective_fk" FOREIGN KEY ("school_id", "objective_id") REFERENCES "learning_objective"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "assessment_objective_objective_idx" ON "assessment_objective" ("school_id", "objective_id");
--> statement-breakpoint
ALTER TABLE assessment_objective ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE assessment_objective FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON assessment_objective
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON assessment_objective TO edusync_app;
--> statement-breakpoint
CREATE TABLE "student_objective_achievement" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "semester_id" uuid NOT NULL,
  "class_id" uuid NOT NULL,
  "subject_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "objective_id" uuid NOT NULL,
  "achieved" boolean,
  "level_label" text,
  "note" text,
  "updated_by" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "student_objective_achievement_uq" UNIQUE ("semester_id", "student_id", "objective_id"),
  CONSTRAINT "student_objective_achievement_some_ck" CHECK ("achieved" IS NOT NULL OR "level_label" IS NOT NULL OR "note" IS NOT NULL),
  CONSTRAINT "student_objective_achievement_note_ck" CHECK ("note" IS NULL OR char_length("note") <= 500),
  CONSTRAINT "student_objective_achievement_label_ck" CHECK ("level_label" IS NULL OR char_length("level_label") BETWEEN 1 AND 60),
  CONSTRAINT "student_objective_achievement_semester_fk" FOREIGN KEY ("school_id", "semester_id") REFERENCES "semester"("school_id", "id"),
  CONSTRAINT "student_objective_achievement_class_fk" FOREIGN KEY ("school_id", "class_id") REFERENCES "class_room"("school_id", "id"),
  CONSTRAINT "student_objective_achievement_subject_fk" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subject"("school_id", "id"),
  CONSTRAINT "student_objective_achievement_student_fk" FOREIGN KEY ("school_id", "student_id") REFERENCES "student"("school_id", "id"),
  CONSTRAINT "student_objective_achievement_objective_fk" FOREIGN KEY ("school_id", "objective_id") REFERENCES "learning_objective"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "student_objective_achievement_scope_idx" ON "student_objective_achievement" ("school_id", "semester_id", "class_id", "subject_id");
--> statement-breakpoint
ALTER TABLE student_objective_achievement ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE student_objective_achievement FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON student_objective_achievement
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON student_objective_achievement TO edusync_app;
