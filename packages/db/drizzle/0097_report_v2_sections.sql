-- Fase 3, tahap 3.2: komponen rapor tambahan dan snapshot v2 (rancangan: docs/rancangan-fase-3-asesmen-rapor.md, bagian 3.3-3.5 dan 4.2).
-- HANYA DDL, tanpa DROP dan tanpa perubahan tipe. Nilai bawaan kolom baru = perilaku sebelum migrasi (catatan kosong, mode numerik,
-- bagian PDF baru mati), jadi tidak ada backfill: Postgres mengisi bawaan konstan di katalog tanpa melewati RLS.
--
-- report_card_section                                 teks bebas per siswa per semester: cocurricular_note (kokurikuler) dan
--                                                     development_note (perkembangan Fase A, K11). TABEL TERPISAH, bukan kolom di
--                                                     report_card (rancangan 4.2 menyebut kolom): tes garis dasar fase 3 membekukan
--                                                     baris mentah report_card, jadi kolom baru di sana mengubah keluaran sekolah lama.
-- school_level.report_mode                            NULL | 'numeric' | 'descriptive' (NULL = numeric). Mode deskriptif Fase A (K10).
-- report_setting.show_cocurricular / show_guardian_response   bendera tampilan PDF, bawaan mati (K12).
-- report_setting.response_window_days                 jendela tanggapan wali sejak finalisasi; NULL = tanpa batas (bawaan 30, K9).
-- report_subject_narrative                            deskripsi capaian manual per siswa-mapel-semester (tanpa generator otomatis).
-- report_card_response                                tanggapan orang tua/wali atas rapor FINAL; bukan bagian snapshot.
--
-- guardian mendapat UNIQUE (school_id, id) agar FK komposit report_card_response mungkin (tabel kecil: satu indeks, kunci singkat;
-- risiko R9 di rancangan). FK ke guardian NO ACTION: wali yang punya tanggapan tidak dapat dihapus (rute hapus wali memetakan
-- 23503 ke 409 `guardian_in_use`).
--
-- Rollback kode ke sebelum tahap ini membiarkan kolom dan tabel ini; kode lama mengabaikannya (bagian v2 tidak tampil, snapshot utuh).
--
-- CATATAN JURNAL: `when` manual lebih besar dari 0096 (1796520600000): 0097 = 1796607000000.
ALTER TABLE "school_level" ADD COLUMN "report_mode" text;
--> statement-breakpoint
ALTER TABLE "school_level" ADD CONSTRAINT "school_level_report_mode_ck" CHECK ("report_mode" IS NULL OR "report_mode" IN ('numeric', 'descriptive'));
--> statement-breakpoint
ALTER TABLE "report_setting" ADD COLUMN "show_cocurricular" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "report_setting" ADD COLUMN "show_guardian_response" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "report_setting" ADD COLUMN "response_window_days" integer DEFAULT 30;
--> statement-breakpoint
ALTER TABLE "report_setting" ADD CONSTRAINT "report_setting_window_ck" CHECK ("response_window_days" IS NULL OR "response_window_days" BETWEEN 1 AND 365);
--> statement-breakpoint
ALTER TABLE "guardian" ADD CONSTRAINT "guardian_school_id_uq" UNIQUE ("school_id", "id");
--> statement-breakpoint
CREATE TABLE "report_card_section" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "semester_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "cocurricular_note" text,
  "development_note" text,
  "updated_by" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "report_card_section_uq" UNIQUE ("semester_id", "student_id"),
  CONSTRAINT "report_card_section_cocurricular_ck" CHECK ("cocurricular_note" IS NULL OR char_length("cocurricular_note") BETWEEN 1 AND 1000),
  CONSTRAINT "report_card_section_development_ck" CHECK ("development_note" IS NULL OR char_length("development_note") BETWEEN 1 AND 1000),
  CONSTRAINT "report_card_section_semester_fk" FOREIGN KEY ("school_id", "semester_id") REFERENCES "semester"("school_id", "id"),
  CONSTRAINT "report_card_section_student_fk" FOREIGN KEY ("school_id", "student_id") REFERENCES "student"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "report_card_section_student_idx" ON "report_card_section" ("school_id", "student_id");
--> statement-breakpoint
ALTER TABLE report_card_section ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE report_card_section FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON report_card_section
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON report_card_section TO edusync_app;
--> statement-breakpoint
CREATE TABLE "report_subject_narrative" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "semester_id" uuid NOT NULL,
  "class_id" uuid NOT NULL,
  "subject_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "text" text NOT NULL,
  "generated_hash" text,
  "updated_by" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "report_subject_narrative_uq" UNIQUE ("semester_id", "student_id", "subject_id"),
  CONSTRAINT "report_subject_narrative_text_ck" CHECK (char_length("text") BETWEEN 1 AND 1000),
  CONSTRAINT "report_subject_narrative_semester_fk" FOREIGN KEY ("school_id", "semester_id") REFERENCES "semester"("school_id", "id"),
  CONSTRAINT "report_subject_narrative_class_fk" FOREIGN KEY ("school_id", "class_id") REFERENCES "class_room"("school_id", "id"),
  CONSTRAINT "report_subject_narrative_subject_fk" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subject"("school_id", "id"),
  CONSTRAINT "report_subject_narrative_student_fk" FOREIGN KEY ("school_id", "student_id") REFERENCES "student"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "report_subject_narrative_class_idx" ON "report_subject_narrative" ("school_id", "semester_id", "class_id", "subject_id");
--> statement-breakpoint
ALTER TABLE report_subject_narrative ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE report_subject_narrative FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON report_subject_narrative
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON report_subject_narrative TO edusync_app;
--> statement-breakpoint
CREATE TABLE "report_card_response" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "semester_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "guardian_id" uuid NOT NULL,
  "text" text NOT NULL,
  "snapshot_version" integer,
  "recorded_by" text NOT NULL,
  "recorded_by_kind" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "report_card_response_uq" UNIQUE ("semester_id", "student_id", "guardian_id"),
  CONSTRAINT "report_card_response_text_ck" CHECK (char_length("text") BETWEEN 1 AND 1000),
  CONSTRAINT "report_card_response_kind_ck" CHECK ("recorded_by_kind" IN ('guardian', 'staff')),
  CONSTRAINT "report_card_response_semester_fk" FOREIGN KEY ("school_id", "semester_id") REFERENCES "semester"("school_id", "id"),
  CONSTRAINT "report_card_response_student_fk" FOREIGN KEY ("school_id", "student_id") REFERENCES "student"("school_id", "id"),
  CONSTRAINT "report_card_response_guardian_fk" FOREIGN KEY ("school_id", "guardian_id") REFERENCES "guardian"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "report_card_response_student_idx" ON "report_card_response" ("school_id", "student_id", "semester_id");
--> statement-breakpoint
ALTER TABLE report_card_response ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE report_card_response FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON report_card_response
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON report_card_response TO edusync_app;
