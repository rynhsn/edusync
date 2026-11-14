-- Fase 5, tahap 5.3: PKL sebagai mapel rapor (rancangan: docs/rancangan-fase-5-smk-penuh.md, bagian 4.2). HANYA DDL, aditif:
-- tanpa DROP, tanpa backfill, tanpa baris otomatis. Semua kolom baru NULL = perilaku lama (tanpa tautan, tanpa bobot, tanpa nomor).
-- Kolom baru hanya pada tabel PKL dan `vocational_setting` (tabel baru 0110); tabel yang didump garis dasar fase 3 tidak disentuh.
--
-- pkl_period.semester_id/subject_id  periode PKL ditautkan ke semester rapor dan mapel PKL (subject.kind = internship, diperiksa API).
--                                    Tertaut penuh atau tidak sama sekali (CHECK). Rapor semester itu memuat nilai PKL sebagai mapel.
-- pkl_placement.certificate_no       nomor sertifikat PKL, unik per sekolah bila terisi.
-- vocational_setting                 bobot penilai sekolah:industri (keduanya NULL = rumus lama: rata-rata penilai yang ada) dan pola
--                                    nomor sertifikat (placeholder seperti nomor surat: {seq}, {code}, {roman}, {month}, {year}).
-- CATATAN JURNAL: `when` manual lebih besar dari 0110 (1797730200000): 0111 = 1797816600000.
ALTER TABLE "pkl_period" ADD CONSTRAINT "pkl_period_school_id_uq" UNIQUE ("school_id", "id");
--> statement-breakpoint
ALTER TABLE "pkl_period" ADD COLUMN "semester_id" uuid;
--> statement-breakpoint
ALTER TABLE "pkl_period" ADD COLUMN "subject_id" uuid;
--> statement-breakpoint
ALTER TABLE "pkl_period" ADD CONSTRAINT "pkl_period_semester_fk" FOREIGN KEY ("school_id", "semester_id") REFERENCES "semester"("school_id", "id");
--> statement-breakpoint
ALTER TABLE "pkl_period" ADD CONSTRAINT "pkl_period_subject_fk" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subject"("school_id", "id");
--> statement-breakpoint
ALTER TABLE "pkl_period" ADD CONSTRAINT "pkl_period_link_ck" CHECK (("semester_id" IS NULL) = ("subject_id" IS NULL));
--> statement-breakpoint
CREATE INDEX "pkl_period_semester_idx" ON "pkl_period" ("school_id", "semester_id") WHERE "semester_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "pkl_placement" ADD COLUMN "certificate_no" text;
--> statement-breakpoint
ALTER TABLE "pkl_placement" ADD CONSTRAINT "pkl_placement_certificate_ck" CHECK ("certificate_no" IS NULL OR char_length("certificate_no") BETWEEN 1 AND 80);
--> statement-breakpoint
CREATE UNIQUE INDEX "pkl_placement_certificate_uq" ON "pkl_placement" ("school_id", "certificate_no") WHERE "certificate_no" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "vocational_setting" ADD COLUMN "pkl_school_weight" integer;
--> statement-breakpoint
ALTER TABLE "vocational_setting" ADD COLUMN "pkl_industry_weight" integer;
--> statement-breakpoint
ALTER TABLE "vocational_setting" ADD COLUMN "pkl_certificate_pattern" text;
--> statement-breakpoint
ALTER TABLE "vocational_setting" ADD CONSTRAINT "vocational_setting_pkl_weights_ck" CHECK (
  ("pkl_school_weight" IS NULL) = ("pkl_industry_weight" IS NULL)
  AND ("pkl_school_weight" IS NULL OR ("pkl_school_weight" >= 0 AND "pkl_industry_weight" >= 0 AND "pkl_school_weight" + "pkl_industry_weight" = 100))
);
--> statement-breakpoint
ALTER TABLE "vocational_setting" ADD CONSTRAINT "vocational_setting_pkl_pattern_ck" CHECK ("pkl_certificate_pattern" IS NULL OR char_length("pkl_certificate_pattern") <= 120);
