-- Nomor peserta ujian permanen per murid per semester + jenis ujian, dengan format yang dapat diatur sekolah per jenis ujian.
-- Aditif, tanpa backfill (migrator tunduk FORCE RLS): nomor ditetapkan otomatis saat kartu peserta pertama kali dimuat.
-- Kolom baru pada exam_type: format kosong = bawaan `{jenis}-{yy}-{urut:3}`; lingkup urut 'class' (per kelas) atau 'school'.
-- CATATAN JURNAL: `when` manual lebih besar dari 0124 (1799026200000): 0125 = 1799112600000.
-- Nomor ikut terhapus bersama semester, jenis ujian, atau murid (data turunan); kelas dihapus: snapshot kelas dikosongkan.

ALTER TABLE "exam_type" ADD COLUMN "participant_no_format" text;
--> statement-breakpoint
ALTER TABLE "exam_type" ADD COLUMN "participant_no_seq_scope" text DEFAULT 'class' NOT NULL;
--> statement-breakpoint
ALTER TABLE "exam_type" ADD COLUMN "participant_no_seq_start" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "exam_type" ADD CONSTRAINT "exam_type_participant_no_ck" CHECK (
  "participant_no_seq_scope" IN ('class', 'school')
  AND "participant_no_seq_start" BETWEEN 1 AND 999999
  AND ("participant_no_format" IS NULL OR char_length("participant_no_format") BETWEEN 1 AND 40)
);
--> statement-breakpoint

CREATE TABLE "exam_participant_number" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "semester_id" uuid NOT NULL,
  "exam_type_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "class_id" uuid,
  "seq" integer NOT NULL,
  "number" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "exam_participant_number_student_uq" UNIQUE ("school_id", "semester_id", "exam_type_id", "student_id"),
  CONSTRAINT "exam_participant_number_number_uq" UNIQUE ("school_id", "semester_id", "exam_type_id", "number"),
  CONSTRAINT "exam_participant_number_seq_ck" CHECK ("seq" > 0),
  CONSTRAINT "exam_participant_number_number_ck" CHECK (char_length("number") BETWEEN 1 AND 200),
  CONSTRAINT "exam_participant_number_semester_fk" FOREIGN KEY ("school_id", "semester_id") REFERENCES "semester"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "exam_participant_number_type_fk" FOREIGN KEY ("school_id", "exam_type_id") REFERENCES "exam_type"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "exam_participant_number_student_fk" FOREIGN KEY ("school_id", "student_id") REFERENCES "student"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "exam_participant_number_class_fk" FOREIGN KEY ("school_id", "class_id") REFERENCES "class_room"("school_id", "id") ON DELETE SET NULL ("class_id")
);
--> statement-breakpoint
CREATE INDEX "exam_participant_number_class_idx" ON "exam_participant_number" ("school_id", "semester_id", "exam_type_id", "class_id");
--> statement-breakpoint
ALTER TABLE exam_participant_number ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE exam_participant_number FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON exam_participant_number
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON exam_participant_number TO edusync_app;
