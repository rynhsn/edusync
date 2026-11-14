-- Fase 4, tahap 4.3: penilaian kokurikuler (rancangan: docs/rancangan-fase-4-kokurikuler-madrasah.md, bagian 4.3). HANYA DDL, aditif:
-- tanpa DROP, tanpa backfill, tanpa kolom baru pada tabel yang sudah ada, tanpa baris otomatis per sekolah. Sekolah yang tidak memakai
-- fitur ini identik dengan sebelumnya.
--
-- cocurricular_assessment  penilaian sumatif per (program, butir sasaran, murid, semester): tingkat rubrik dan/atau catatan. Hanya sumatif.
-- cocurricular_evidence    bukti karya berupa tautan https (maks. 500 karakter); student_id/class_id NULL = bukti program/rombel.
-- Semua FK komposit (school_id, x_id), NO ACTION kecuali bukti yang ikut terhapus bersama programnya (ON DELETE CASCADE).
-- Penghapusan program/rombel/butir/tingkat yang sudah dinilai ditolak API (409 cocurricular_assessed / item_in_use); FK NO ACTION adalah jaring pengaman.
--
-- Rollback kode ke sebelum tahap ini membiarkan tabel ini; kode lama mengabaikannya. Catatan: FK NO ACTION dari penilaian ke program
-- membuat kode lama (4.2) gagal menghapus program yang sudah dinilai (galat 500 bukan 409) sampai maju lagi.
-- CATATAN JURNAL: `when` manual lebih besar dari 0107 (1797471000000): 0108 = 1797557400000.
CREATE TABLE "cocurricular_assessment" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "program_id" uuid NOT NULL,
  "profile_item_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "semester_id" uuid NOT NULL,
  "rubric_level_id" uuid,
  "note" text,
  "updated_by" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cocurricular_assessment_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "cocurricular_assessment_cell_uq" UNIQUE ("program_id", "profile_item_id", "student_id", "semester_id"),
  CONSTRAINT "cocurricular_assessment_value_ck" CHECK ("rubric_level_id" IS NOT NULL OR "note" IS NOT NULL),
  CONSTRAINT "cocurricular_assessment_note_ck" CHECK ("note" IS NULL OR char_length("note") <= 1000),
  CONSTRAINT "cocurricular_assessment_program_fk" FOREIGN KEY ("school_id", "program_id") REFERENCES "cocurricular_program"("school_id", "id"),
  CONSTRAINT "cocurricular_assessment_item_fk" FOREIGN KEY ("school_id", "profile_item_id") REFERENCES "school_profile_item"("school_id", "id"),
  CONSTRAINT "cocurricular_assessment_student_fk" FOREIGN KEY ("school_id", "student_id") REFERENCES "student"("school_id", "id"),
  CONSTRAINT "cocurricular_assessment_semester_fk" FOREIGN KEY ("school_id", "semester_id") REFERENCES "semester"("school_id", "id"),
  CONSTRAINT "cocurricular_assessment_level_fk" FOREIGN KEY ("school_id", "rubric_level_id") REFERENCES "cocurricular_rubric_level"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "cocurricular_assessment_sem_student_idx" ON "cocurricular_assessment" ("school_id", "semester_id", "student_id");
--> statement-breakpoint
CREATE INDEX "cocurricular_assessment_level_idx" ON "cocurricular_assessment" ("school_id", "rubric_level_id");
--> statement-breakpoint
CREATE INDEX "cocurricular_assessment_item_idx" ON "cocurricular_assessment" ("school_id", "profile_item_id");
--> statement-breakpoint
CREATE TABLE "cocurricular_evidence" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "program_id" uuid NOT NULL,
  "student_id" uuid,
  "class_id" uuid,
  "title" text NOT NULL,
  "url" text NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cocurricular_evidence_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "cocurricular_evidence_title_ck" CHECK (char_length("title") BETWEEN 1 AND 200),
  CONSTRAINT "cocurricular_evidence_url_ck" CHECK ("url" ~ '^https://' AND char_length("url") <= 500),
  CONSTRAINT "cocurricular_evidence_program_fk" FOREIGN KEY ("school_id", "program_id") REFERENCES "cocurricular_program"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "cocurricular_evidence_student_fk" FOREIGN KEY ("school_id", "student_id") REFERENCES "student"("school_id", "id"),
  CONSTRAINT "cocurricular_evidence_class_fk" FOREIGN KEY ("school_id", "class_id") REFERENCES "class_room"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "cocurricular_evidence_program_idx" ON "cocurricular_evidence" ("school_id", "program_id");
--> statement-breakpoint
ALTER TABLE cocurricular_assessment ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cocurricular_assessment FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON cocurricular_assessment
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON cocurricular_assessment TO edusync_app;
--> statement-breakpoint
ALTER TABLE cocurricular_evidence ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cocurricular_evidence FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON cocurricular_evidence
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON cocurricular_evidence TO edusync_app;
