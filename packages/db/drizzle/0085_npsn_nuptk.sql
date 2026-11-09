-- NPSN (8 digit) per unit sekolah: wajib saat mendaftar, tetapi sekolah lama dibiarkan kosong (tidak dibuat tidak sah).
-- Unik di seluruh platform bila terisi. NUPTK (16 digit) guru opsional; unik per sekolah bila terisi.
ALTER TABLE "school" ADD COLUMN "npsn" text;
--> statement-breakpoint
ALTER TABLE "teacher" ADD COLUMN "nuptk" text;
--> statement-breakpoint
ALTER TABLE "school" ADD CONSTRAINT "school_npsn_ck" CHECK ("npsn" IS NULL OR "npsn" ~ '^[0-9]{8}$');
--> statement-breakpoint
ALTER TABLE "teacher" ADD CONSTRAINT "teacher_nuptk_ck" CHECK ("nuptk" IS NULL OR "nuptk" ~ '^[0-9]{16}$');
--> statement-breakpoint
CREATE UNIQUE INDEX "school_npsn_uq" ON "school" ("npsn") WHERE "npsn" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_school_nuptk_uq" ON "teacher" ("school_id", "nuptk") WHERE "nuptk" IS NOT NULL;
