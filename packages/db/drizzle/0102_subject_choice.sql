-- Fase 3B, tahap 3B.1: data pilihan mata pelajaran per murid (rancangan: docs/rancangan-3b-3c-pilihan-mapel-kelulusan.md, bagian 3.1
-- dan 4.1). HANYA DDL, aditif: tanpa DROP, tanpa kolom baru pada tabel lama, tanpa backfill (tabel kosong = perilaku sebelum migrasi).
-- Rancangan menamai migrasi ini 0101; tahap 3C.1 dikerjakan lebih dulu (0101), jadi tahap ini memakai nomor berikutnya yang kosong (0102).
-- Tahap-tahap berikutnya memakai nomor berurutan menurut urutan pengerjaan, bukan nomor di rancangan.
--
-- class_subject_participation  penanda SPARSE: mapel ini di rombel ini hanya diikuti murid yang terdaftar (mode 'selected'). Tanpa baris
--                              = semua murid rombel mengikuti (perilaku sebelumnya). Hanya baris ini yang menyalakan fitur; subject.kind
--                              dan subject.religion_variant hanya metadata/saran tampilan.
-- student_subject_enrollment   murid mengambil mapel pada satu tahun ajaran (semester_id NULL) atau satu semester. Dua indeks unik
--                              parsial; larangan tumpang tindih setahun vs semester dan "semester milik tahun itu" dijaga API.
-- subject_choice_rule          aturan pilihan sekolah per (tahun, tingkat, program opsional, kelompok): batas jumlah dipilih, jumlah
--                              minimal ditawarkan, `enforce` (bawaan false = peringatan), `locked_from_semester_id` opsional.
-- subject_choice_rule_subject  mapel anggota aturan.
--
-- Tahap ini belum memengaruhi nilai, rapor, portal, jadwal, atau absensi (tahap 3B.2 dan seterusnya). Rollback kode ke sebelum
-- tahap ini membiarkan tabel-tabel ini tanpa efek pada perilaku.
--
-- CATATAN JURNAL: `when` manual lebih besar dari 0101 (1796952600000): 0102 = 1797039000000.
CREATE TABLE "class_subject_participation" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "class_id" uuid NOT NULL,
  "subject_id" uuid NOT NULL,
  "mode" text DEFAULT 'selected' NOT NULL,
  "updated_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "class_subject_participation_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "class_subject_participation_uq" UNIQUE ("class_id", "subject_id"),
  CONSTRAINT "class_subject_participation_mode_ck" CHECK ("mode" IN ('selected')),
  CONSTRAINT "class_subject_participation_class_fk" FOREIGN KEY ("school_id", "class_id") REFERENCES "class_room"("school_id", "id"),
  CONSTRAINT "class_subject_participation_subject_fk" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subject"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "class_subject_participation_class_idx" ON "class_subject_participation" ("school_id", "class_id");
--> statement-breakpoint
ALTER TABLE class_subject_participation ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE class_subject_participation FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON class_subject_participation
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON class_subject_participation TO edusync_app;
--> statement-breakpoint
CREATE TABLE "student_subject_enrollment" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "student_id" uuid NOT NULL,
  "subject_id" uuid NOT NULL,
  "academic_year_id" uuid NOT NULL,
  "semester_id" uuid,
  "source" text NOT NULL,
  "note" text,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "student_subject_enrollment_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "student_subject_enrollment_source_ck" CHECK ("source" IN ('choice', 'religion', 'arts', 'admin')),
  CONSTRAINT "student_subject_enrollment_note_ck" CHECK ("note" IS NULL OR char_length("note") <= 500),
  CONSTRAINT "student_subject_enrollment_student_fk" FOREIGN KEY ("school_id", "student_id") REFERENCES "student"("school_id", "id"),
  CONSTRAINT "student_subject_enrollment_subject_fk" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subject"("school_id", "id"),
  CONSTRAINT "student_subject_enrollment_year_fk" FOREIGN KEY ("school_id", "academic_year_id") REFERENCES "academic_year"("school_id", "id"),
  CONSTRAINT "student_subject_enrollment_semester_fk" FOREIGN KEY ("school_id", "semester_id") REFERENCES "semester"("school_id", "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "student_subject_enrollment_year_uq" ON "student_subject_enrollment" ("student_id", "subject_id", "academic_year_id") WHERE "semester_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "student_subject_enrollment_semester_uq" ON "student_subject_enrollment" ("student_id", "subject_id", "semester_id") WHERE "semester_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "student_subject_enrollment_year_subject_idx" ON "student_subject_enrollment" ("school_id", "academic_year_id", "subject_id");
--> statement-breakpoint
CREATE INDEX "student_subject_enrollment_student_idx" ON "student_subject_enrollment" ("school_id", "student_id");
--> statement-breakpoint
ALTER TABLE student_subject_enrollment ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE student_subject_enrollment FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON student_subject_enrollment
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON student_subject_enrollment TO edusync_app;
--> statement-breakpoint
CREATE TABLE "subject_choice_rule" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "academic_year_id" uuid NOT NULL,
  "level_code" text NOT NULL,
  "program_id" uuid,
  "group_key" text NOT NULL,
  "label" text NOT NULL,
  "min_choices" integer,
  "max_choices" integer,
  "min_offered" integer,
  "enforce" boolean DEFAULT false NOT NULL,
  "locked_from_semester_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "subject_choice_rule_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "subject_choice_rule_group_key_ck" CHECK (char_length("group_key") BETWEEN 1 AND 40),
  CONSTRAINT "subject_choice_rule_label_ck" CHECK (char_length("label") BETWEEN 1 AND 120),
  CONSTRAINT "subject_choice_rule_level_ck" CHECK (char_length("level_code") BETWEEN 1 AND 40),
  CONSTRAINT "subject_choice_rule_range_ck" CHECK ("min_choices" IS NULL OR "max_choices" IS NULL OR "min_choices" <= "max_choices"),
  CONSTRAINT "subject_choice_rule_nonneg_ck" CHECK (("min_choices" IS NULL OR "min_choices" >= 0) AND ("max_choices" IS NULL OR "max_choices" >= 0) AND ("min_offered" IS NULL OR "min_offered" >= 0)),
  CONSTRAINT "subject_choice_rule_year_fk" FOREIGN KEY ("school_id", "academic_year_id") REFERENCES "academic_year"("school_id", "id"),
  CONSTRAINT "subject_choice_rule_program_fk" FOREIGN KEY ("school_id", "program_id") REFERENCES "program"("school_id", "id"),
  CONSTRAINT "subject_choice_rule_semester_fk" FOREIGN KEY ("school_id", "locked_from_semester_id") REFERENCES "semester"("school_id", "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "subject_choice_rule_uq" ON "subject_choice_rule" ("school_id", "academic_year_id", "level_code", COALESCE("program_id", '00000000-0000-0000-0000-000000000000'::uuid), "group_key");
--> statement-breakpoint
CREATE INDEX "subject_choice_rule_year_idx" ON "subject_choice_rule" ("school_id", "academic_year_id");
--> statement-breakpoint
ALTER TABLE subject_choice_rule ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE subject_choice_rule FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON subject_choice_rule
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON subject_choice_rule TO edusync_app;
--> statement-breakpoint
CREATE TABLE "subject_choice_rule_subject" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "rule_id" uuid NOT NULL,
  "subject_id" uuid NOT NULL,
  CONSTRAINT "subject_choice_rule_subject_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "subject_choice_rule_subject_uq" UNIQUE ("rule_id", "subject_id"),
  CONSTRAINT "subject_choice_rule_subject_rule_fk" FOREIGN KEY ("school_id", "rule_id") REFERENCES "subject_choice_rule"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "subject_choice_rule_subject_subject_fk" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subject"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "subject_choice_rule_subject_subject_idx" ON "subject_choice_rule_subject" ("school_id", "subject_id");
--> statement-breakpoint
ALTER TABLE subject_choice_rule_subject ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE subject_choice_rule_subject FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON subject_choice_rule_subject
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON subject_choice_rule_subject TO edusync_app;
