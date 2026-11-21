-- Ruang ujian (opsional): daftar ruang per sekolah dan penempatan siswa per semester + jenis ujian. Sekolah yang tidak memakai ruang
-- tidak mengisi tabel ini dan perilaku lama tidak berubah (`room` pada data kartu peserta tetap kosong). Semua aditif; tanpa backfill
-- (migrator berjalan sebagai pemilik tabel yang ikut terkena FORCE RLS, jadi INSERT ... SELECT dari tabel RLS di migrasi tidak akan memasukkan apa pun).
-- Penempatan ikut terhapus bersama ruang, semester, siswa, atau jenis ujiannya (data turunan, mudah dibuat ulang).
-- CATATAN JURNAL: `when` manual lebih besar dari 0119 (1798594200000): 0120 = 1798680600000.

-- 1. Kunci komposit (school_id, id) pada jenis ujian supaya FK komposit memaksa satu sekolah.
ALTER TABLE "exam_type" ADD CONSTRAINT "exam_type_school_id_uq" UNIQUE ("school_id", "id");
--> statement-breakpoint

-- 2. Ruang ujian. capacity kosong = tanpa batas.
CREATE TABLE "exam_room" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "name" text NOT NULL,
  "capacity" integer,
  "sort" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "exam_room_capacity_ck" CHECK ("capacity" IS NULL OR "capacity" > 0),
  CONSTRAINT "exam_room_school_name_uq" UNIQUE ("school_id", "name"),
  CONSTRAINT "exam_room_school_id_uq" UNIQUE ("school_id", "id")
);
--> statement-breakpoint

-- 3. Penempatan siswa ke ruang untuk satu semester dan jenis ujian (satu ruang per siswa).
CREATE TABLE "exam_room_assignment" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "semester_id" uuid NOT NULL,
  "exam_type_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "room_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "exam_room_assignment_student_uq" UNIQUE ("semester_id", "exam_type_id", "student_id"),
  CONSTRAINT "exam_room_assignment_semester_fk" FOREIGN KEY ("school_id", "semester_id") REFERENCES "semester"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "exam_room_assignment_type_fk" FOREIGN KEY ("school_id", "exam_type_id") REFERENCES "exam_type"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "exam_room_assignment_student_fk" FOREIGN KEY ("school_id", "student_id") REFERENCES "student"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "exam_room_assignment_room_fk" FOREIGN KEY ("school_id", "room_id") REFERENCES "exam_room"("school_id", "id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "exam_room_assignment_room_idx" ON "exam_room_assignment" ("school_id", "room_id");
--> statement-breakpoint
ALTER TABLE exam_room ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE exam_room FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON exam_room
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE exam_room_assignment ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE exam_room_assignment FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON exam_room_assignment
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
