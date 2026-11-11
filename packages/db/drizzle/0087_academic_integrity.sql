-- Fase 1 audit akademik: versi snapshot rapor dan riwayatnya, jadwal per semester, riwayat penugasan guru dan wali kelas,
-- serta izin eksplisit pengganti pencocokan nama peran. Semua aditif: baris lama berperilaku seperti sebelumnya.

-- 1. Rapor: versi skema snapshot (1 = bentuk sekarang) dan kunci templat render.
ALTER TABLE "report_card" ADD COLUMN "schema_version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "report_card" ADD COLUMN "template_key" text;
--> statement-breakpoint

-- 2. Kunci komposit (school_id, id) pada induk yang dirujuk tabel baru, supaya FK komposit memaksa satu sekolah.
ALTER TABLE "semester" ADD CONSTRAINT "semester_school_id_uq" UNIQUE ("school_id", "id");
--> statement-breakpoint
ALTER TABLE "student" ADD CONSTRAINT "student_school_id_uq" UNIQUE ("school_id", "id");
--> statement-breakpoint
ALTER TABLE "class_room" ADD CONSTRAINT "class_room_school_id_uq" UNIQUE ("school_id", "id");
--> statement-breakpoint
ALTER TABLE "teacher" ADD CONSTRAINT "teacher_school_id_uq" UNIQUE ("school_id", "id");
--> statement-breakpoint
ALTER TABLE "subject" ADD CONSTRAINT "subject_school_id_uq" UNIQUE ("school_id", "id");
--> statement-breakpoint

-- Catatan: riwayat ikut terhapus bersama induknya (kelas, siswa, semester, mapel); kolom guru menjadi kosong bila gurunya dihapus.
-- 3. Riwayat snapshot rapor: setiap finalisasi dan buka kembali tercatat; snapshot lama tidak lagi hilang.
CREATE TABLE "report_card_snapshot" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "semester_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "class_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "kind" text NOT NULL,
  "schema_version" integer DEFAULT 1 NOT NULL,
  "snapshot" jsonb,
  "actor_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "report_card_snapshot_kind_ck" CHECK ("kind" IN ('finalized', 'reopened')),
  CONSTRAINT "report_card_snapshot_version_uq" UNIQUE ("semester_id", "student_id", "version"),
  CONSTRAINT "report_card_snapshot_semester_fk" FOREIGN KEY ("school_id", "semester_id") REFERENCES "semester"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "report_card_snapshot_student_fk" FOREIGN KEY ("school_id", "student_id") REFERENCES "student"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "report_card_snapshot_class_fk" FOREIGN KEY ("school_id", "class_id") REFERENCES "class_room"("school_id", "id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "report_card_snapshot_student_idx" ON "report_card_snapshot" ("school_id", "student_id", "semester_id");
--> statement-breakpoint
ALTER TABLE report_card_snapshot ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE report_card_snapshot FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON report_card_snapshot
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint

-- 4. Jadwal per semester: semester_id kosong = berlaku sepanjang tahun ajaran (seperti sekarang). Keunikan per cakupan.
ALTER TABLE "schedule_entry" ADD COLUMN "semester_id" uuid REFERENCES "semester"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "schedule_entry" DROP CONSTRAINT "schedule_class_slot_uq";
--> statement-breakpoint
ALTER TABLE "schedule_entry" DROP CONSTRAINT "schedule_teacher_slot_uq";
--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_class_slot_year_uq" ON "schedule_entry" ("class_id", "weekday", "period_id") WHERE "semester_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_class_slot_sem_uq" ON "schedule_entry" ("semester_id", "class_id", "weekday", "period_id") WHERE "semester_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_teacher_slot_year_uq" ON "schedule_entry" ("academic_year_id", "teacher_id", "weekday", "period_id") WHERE "semester_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_teacher_slot_sem_uq" ON "schedule_entry" ("semester_id", "teacher_id", "weekday", "period_id") WHERE "semester_id" IS NOT NULL;
--> statement-breakpoint

-- 5. Riwayat penugasan guru mapel dan wali kelas; diisi otomatis oleh route penugasan.
CREATE TABLE "teaching_assignment_history" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "class_id" uuid NOT NULL,
  "subject_id" uuid NOT NULL,
  "teacher_id" uuid,
  "previous_teacher_id" uuid,
  "action" text NOT NULL,
  "actor_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "teaching_assignment_history_action_ck" CHECK ("action" IN ('assigned', 'changed', 'released')),
  CONSTRAINT "teaching_assignment_history_class_fk" FOREIGN KEY ("school_id", "class_id") REFERENCES "class_room"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "teaching_assignment_history_subject_fk" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subject"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "teaching_assignment_history_teacher_fk" FOREIGN KEY ("school_id", "teacher_id") REFERENCES "teacher"("school_id", "id") ON DELETE SET NULL ("teacher_id"),
  CONSTRAINT "teaching_assignment_history_prev_teacher_fk" FOREIGN KEY ("school_id", "previous_teacher_id") REFERENCES "teacher"("school_id", "id") ON DELETE SET NULL ("previous_teacher_id")
);
--> statement-breakpoint
CREATE INDEX "teaching_assignment_history_class_idx" ON "teaching_assignment_history" ("school_id", "class_id", "created_at");
--> statement-breakpoint
CREATE TABLE "homeroom_assignment_history" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "class_id" uuid NOT NULL,
  "teacher_id" uuid,
  "previous_teacher_id" uuid,
  "actor_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "homeroom_assignment_history_class_fk" FOREIGN KEY ("school_id", "class_id") REFERENCES "class_room"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "homeroom_assignment_history_teacher_fk" FOREIGN KEY ("school_id", "teacher_id") REFERENCES "teacher"("school_id", "id") ON DELETE SET NULL ("teacher_id"),
  CONSTRAINT "homeroom_assignment_history_prev_teacher_fk" FOREIGN KEY ("school_id", "previous_teacher_id") REFERENCES "teacher"("school_id", "id") ON DELETE SET NULL ("previous_teacher_id")
);
--> statement-breakpoint
CREATE INDEX "homeroom_assignment_history_class_idx" ON "homeroom_assignment_history" ("school_id", "class_id", "created_at");
--> statement-breakpoint
ALTER TABLE teaching_assignment_history ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE teaching_assignment_history FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON teaching_assignment_history
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE homeroom_assignment_history ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE homeroom_assignment_history FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON homeroom_assignment_history
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint

-- 6. Izin eksplisit pengganti pencocokan nama peran `principal` dan `curriculum` (membaca semua kelas).
INSERT INTO role_permission (role_id, school_id, permission)
SELECT r.id, r.school_id, p.permission
FROM role r
CROSS JOIN (VALUES ('report_card:read_all'), ('grade:read_all')) AS p(permission)
WHERE r.is_system AND r.key IN ('school_admin', 'principal', 'curriculum')
ON CONFLICT DO NOTHING;
