-- Data guru dan wali dilengkapi seperti data siswa supaya login dengan NIK berlaku untuk semua orang.
-- Semua kolom boleh kosong (tanpa kehilangan data). NIK unik per sekolah hanya bila terisi; guru yang juga wali
-- sah memiliki NIK sama di dua tabel, jadi tidak ada keunikan lintas tabel.
ALTER TABLE "guardian" ADD COLUMN "nik" text;
--> statement-breakpoint
ALTER TABLE "guardian" ADD COLUMN "address" text;
--> statement-breakpoint
ALTER TABLE "guardian" ADD COLUMN "occupation" text;
--> statement-breakpoint
ALTER TABLE "teacher" ADD COLUMN "nik" text;
--> statement-breakpoint
ALTER TABLE "teacher" ADD COLUMN "phone" text;
--> statement-breakpoint
ALTER TABLE "teacher" ADD COLUMN "email" text;
--> statement-breakpoint
ALTER TABLE "teacher" ADD COLUMN "gender" text;
--> statement-breakpoint
ALTER TABLE "teacher" ADD COLUMN "birth_place" text;
--> statement-breakpoint
ALTER TABLE "teacher" ADD COLUMN "birth_date" date;
--> statement-breakpoint
ALTER TABLE "teacher" ADD COLUMN "address" text;
--> statement-breakpoint
ALTER TABLE "teacher" ADD COLUMN "religion" text;
--> statement-breakpoint
ALTER TABLE "teacher" ADD COLUMN "education" text;
--> statement-breakpoint
ALTER TABLE "guardian" ADD CONSTRAINT "guardian_nik_ck" CHECK ("nik" IS NULL OR "nik" ~ '^[0-9]{16}$');
--> statement-breakpoint
ALTER TABLE "teacher" ADD CONSTRAINT "teacher_nik_ck" CHECK ("nik" IS NULL OR "nik" ~ '^[0-9]{16}$');
--> statement-breakpoint
ALTER TABLE "teacher" ADD CONSTRAINT "teacher_gender_ck" CHECK ("gender" IS NULL OR "gender" IN ('L', 'P'));
--> statement-breakpoint
CREATE UNIQUE INDEX "guardian_school_nik_uq" ON "guardian" ("school_id", "nik") WHERE "nik" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_school_nik_uq" ON "teacher" ("school_id", "nik") WHERE "nik" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "student_school_nik_uq" ON "student" ("school_id", "nik") WHERE "nik" IS NOT NULL AND "deleted_at" IS NULL;
