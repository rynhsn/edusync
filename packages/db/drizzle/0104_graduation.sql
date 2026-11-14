-- Fase 3C, tahap 3C.4: kelulusan (rancangan: docs/rancangan-3b-3c-pilihan-mapel-kelulusan.md, bagian 3.4 dan 4.5). HANYA DDL, aditif:
-- tanpa DROP, tanpa backfill, tanpa kolom baru pada tabel yang sudah ada (tabel baru kosong = perilaku sebelum migrasi: sekolah tanpa
-- graduation_policy tetap memakai alur kenaikan lama). Rancangan menamai migrasi ini 0105; nomor mengikuti urutan pengerjaan (0104).
--
-- graduation_policy     kebijakan kelulusan per tahun ajaran (bobot komponen, ambang, mapel wajib di `config` jsonb tervalidasi API) dan
--                       templat nomor SKL. Adanya baris = sekolah memakai alur kelulusan formal untuk tahun itu. Satu baris per
--                       (tahun, program); API saat ini hanya memakai baris tanpa program (program_id NULL).
-- school_exam           ujian satuan pendidikan (nama, bentuk, tanggal). Bentuk tanpa CHECK (daftar di kontrak).
-- school_exam_score     nilai ujian per (ujian, murid, mapel), 0..100.
-- graduation_decision   keputusan per (tahun, murid): lulus | tidak lulus | ditunda, draf | final. Saat final, `transcript` (jsonb)
--                       membekukan nilai yang dipakai; CHECK menjamin keputusan final selalu punya hasil dan transkrip, dan kelulusan
--                       final punya tanggal. Nomor SKL dan nomor ijazah unik per sekolah. `promotion_synced` menandai keputusan
--                       kenaikan (promotion_decision) yang ditulis oleh penetapan ini, agar dapat dicabut saat dibuka kembali.
--
-- Rollback kode ke sebelum tahap ini membiarkan tabel ini; kode lama mengabaikannya (keputusan kenaikan yang sudah ditulis tetap berlaku).
CREATE TABLE "graduation_policy" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "academic_year_id" uuid NOT NULL,
  "program_id" uuid,
  "config" jsonb NOT NULL,
  "config_version" integer DEFAULT 1 NOT NULL,
  "skl_number_template" text,
  "announce_on" date,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "graduation_policy_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "graduation_policy_template_ck" CHECK ("skl_number_template" IS NULL OR char_length("skl_number_template") BETWEEN 1 AND 80),
  CONSTRAINT "graduation_policy_year_fk" FOREIGN KEY ("school_id", "academic_year_id") REFERENCES "academic_year"("school_id", "id"),
  CONSTRAINT "graduation_policy_program_fk" FOREIGN KEY ("school_id", "program_id") REFERENCES "program"("school_id", "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "graduation_policy_uq" ON "graduation_policy" ("school_id", "academic_year_id", COALESCE("program_id", '00000000-0000-0000-0000-000000000000'::uuid));
--> statement-breakpoint
ALTER TABLE graduation_policy ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE graduation_policy FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON graduation_policy
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON graduation_policy TO edusync_app;
--> statement-breakpoint
CREATE TABLE "school_exam" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "academic_year_id" uuid NOT NULL,
  "name" text NOT NULL,
  "form" text NOT NULL,
  "starts_on" date,
  "ends_on" date,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "school_exam_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "school_exam_name_ck" CHECK (char_length("name") BETWEEN 1 AND 120),
  CONSTRAINT "school_exam_form_ck" CHECK (char_length("form") BETWEEN 1 AND 40),
  CONSTRAINT "school_exam_dates_ck" CHECK ("starts_on" IS NULL OR "ends_on" IS NULL OR "starts_on" <= "ends_on"),
  CONSTRAINT "school_exam_year_fk" FOREIGN KEY ("school_id", "academic_year_id") REFERENCES "academic_year"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "school_exam_year_idx" ON "school_exam" ("school_id", "academic_year_id");
--> statement-breakpoint
ALTER TABLE school_exam ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE school_exam FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON school_exam
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON school_exam TO edusync_app;
--> statement-breakpoint
CREATE TABLE "school_exam_score" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "exam_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "subject_id" uuid NOT NULL,
  "value" numeric(5, 2),
  "note" text,
  "updated_by" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "school_exam_score_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "school_exam_score_uq" UNIQUE ("exam_id", "student_id", "subject_id"),
  CONSTRAINT "school_exam_score_value_ck" CHECK ("value" IS NULL OR "value" BETWEEN 0 AND 100),
  CONSTRAINT "school_exam_score_note_ck" CHECK ("note" IS NULL OR char_length("note") <= 300),
  CONSTRAINT "school_exam_score_exam_fk" FOREIGN KEY ("school_id", "exam_id") REFERENCES "school_exam"("school_id", "id"),
  CONSTRAINT "school_exam_score_student_fk" FOREIGN KEY ("school_id", "student_id") REFERENCES "student"("school_id", "id"),
  CONSTRAINT "school_exam_score_subject_fk" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subject"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "school_exam_score_exam_idx" ON "school_exam_score" ("school_id", "exam_id", "subject_id");
--> statement-breakpoint
CREATE INDEX "school_exam_score_student_idx" ON "school_exam_score" ("school_id", "student_id");
--> statement-breakpoint
ALTER TABLE school_exam_score ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE school_exam_score FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON school_exam_score
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON school_exam_score TO edusync_app;
--> statement-breakpoint
CREATE TABLE "graduation_decision" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "academic_year_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "class_id" uuid NOT NULL,
  "result" text,
  "status" text DEFAULT 'draft' NOT NULL,
  "graduated_on" date,
  "skl_number" text,
  "skl_seq" integer,
  "diploma_number" text,
  "transcript" jsonb,
  "meeting_id" uuid,
  "note" text,
  "promotion_synced" boolean DEFAULT false NOT NULL,
  "decided_by" text,
  "finalized_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "graduation_decision_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "graduation_decision_student_uq" UNIQUE ("academic_year_id", "student_id"),
  CONSTRAINT "graduation_decision_result_ck" CHECK ("result" IS NULL OR "result" IN ('graduated', 'not_graduated', 'deferred')),
  CONSTRAINT "graduation_decision_status_ck" CHECK ("status" IN ('draft', 'final')),
  CONSTRAINT "graduation_decision_final_ck" CHECK ("status" = 'draft' OR ("result" IS NOT NULL AND "transcript" IS NOT NULL)),
  CONSTRAINT "graduation_decision_date_ck" CHECK ("result" IS DISTINCT FROM 'graduated' OR "status" = 'draft' OR "graduated_on" IS NOT NULL),
  CONSTRAINT "graduation_decision_skl_ck" CHECK ("skl_number" IS NULL OR char_length("skl_number") BETWEEN 1 AND 120),
  CONSTRAINT "graduation_decision_diploma_ck" CHECK ("diploma_number" IS NULL OR char_length("diploma_number") BETWEEN 1 AND 60),
  CONSTRAINT "graduation_decision_note_ck" CHECK ("note" IS NULL OR char_length("note") <= 1000),
  CONSTRAINT "graduation_decision_year_fk" FOREIGN KEY ("school_id", "academic_year_id") REFERENCES "academic_year"("school_id", "id"),
  CONSTRAINT "graduation_decision_student_fk" FOREIGN KEY ("school_id", "student_id") REFERENCES "student"("school_id", "id"),
  CONSTRAINT "graduation_decision_class_fk" FOREIGN KEY ("school_id", "class_id") REFERENCES "class_room"("school_id", "id"),
  CONSTRAINT "graduation_decision_meeting_fk" FOREIGN KEY ("school_id", "meeting_id") REFERENCES "council_meeting"("school_id", "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "graduation_decision_skl_uq" ON "graduation_decision" ("school_id", "skl_number") WHERE "skl_number" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "graduation_decision_diploma_uq" ON "graduation_decision" ("school_id", "diploma_number") WHERE "diploma_number" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "graduation_decision_seq_uq" ON "graduation_decision" ("school_id", "academic_year_id", "skl_seq") WHERE "skl_seq" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "graduation_decision_year_idx" ON "graduation_decision" ("school_id", "academic_year_id");
--> statement-breakpoint
CREATE INDEX "graduation_decision_meeting_idx" ON "graduation_decision" ("school_id", "meeting_id") WHERE "meeting_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE graduation_decision ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE graduation_decision FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON graduation_decision
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON graduation_decision TO edusync_app;
