-- Fase 3B, tahap 3B.3: jadwal paralel dan gabungan (rancangan: docs/rancangan-3b-3c-pilihan-mapel-kelulusan.md, bagian 3.1 dan 4.2).
-- Rancangan menamai migrasi ini 0102; nomor mengikuti urutan pengerjaan (0105).
--
-- Dua kolom baru di schedule_entry (aditif, berdefault aman; tanpa backfill):
--   lane          smallint NOT NULL DEFAULT 0, 0..9. Satu slot kelas boleh punya beberapa sel pada lane berbeda (jalur paralel);
--                 syarat "semua mapel di slot itu berpenanda pilihan" dijaga API (400 parallel_requires_selected), bukan DB.
--   combined_key  uuid NULL. Sel di rombel berbeda dengan guru, mapel, slot, dan cakupan sama + kunci sama = satu pertemuan gabungan.
--                 Hanya pengelompokan (tanpa FK); kesesuaian anggota kelompok dijaga API (400 combined_mismatch).
--
-- SATU-SATUNYA penggantian indeks dalam rancangan (indeks, bukan kolom/tabel; setara penggantian constraint jadwal di 0087). Semua
-- baris lama berlane 0 dan tanpa kunci, jadi keunikan lama terjaga persis:
--   indeks unik slot kelas   -> ditambah lane (class_id, weekday, period_id, lane), versi tahunan dan semester;
--   indeks unik slot guru    -> dibatasi pada sel TANPA kunci gabungan (combined_key IS NULL). Selisih dari rancangan: rancangan memakai
--                               COALESCE(combined_key, id) sebagai kolom indeks, tetapi itu membuat setiap baris tanpa kunci unik
--                               sendiri dan indeks tidak lagi mencegah apa pun. Indeks parsial mempertahankan jaminan lama persis untuk
--                               sel biasa; pengecualian untuk sel bergabung (guru yang sama di beberapa rombel) dan larangan
--                               mencampur sel bergabung dengan sel biasa dijaga API (409 teacher_busy).
-- Indeks baru dibuat sebelum yang lama dihapus; semuanya dalam satu transaksi migrasi.
--
-- Rollback kode ke sebelum tahap ini: baris lane > 0 tetap tersimpan dan diperlakukan sebagai sel biasa oleh kode lama; indeks lama
-- harus dibuat ulang bila baris lane > 0 / ber-kunci sudah ada (kehilangan keunikan itu disengaja, lihat rancangan bagian 7).
--
-- CATATAN JURNAL: `when` manual lebih besar dari 0104 (1797211800000): 0105 = 1797298200000.
ALTER TABLE "schedule_entry" ADD COLUMN "lane" smallint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "schedule_entry" ADD CONSTRAINT "schedule_entry_lane_ck" CHECK ("lane" BETWEEN 0 AND 9);
--> statement-breakpoint
ALTER TABLE "schedule_entry" ADD COLUMN "combined_key" uuid;
--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_class_slot_year_lane_uq" ON "schedule_entry" ("class_id", "weekday", "period_id", "lane") WHERE "semester_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_class_slot_sem_lane_uq" ON "schedule_entry" ("semester_id", "class_id", "weekday", "period_id", "lane") WHERE "semester_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_teacher_slot_year_solo_uq" ON "schedule_entry" ("academic_year_id", "teacher_id", "weekday", "period_id") WHERE "semester_id" IS NULL AND "combined_key" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_teacher_slot_sem_solo_uq" ON "schedule_entry" ("semester_id", "teacher_id", "weekday", "period_id") WHERE "semester_id" IS NOT NULL AND "combined_key" IS NULL;
--> statement-breakpoint
DROP INDEX "schedule_class_slot_year_uq";
--> statement-breakpoint
DROP INDEX "schedule_class_slot_sem_uq";
--> statement-breakpoint
DROP INDEX "schedule_teacher_slot_year_uq";
--> statement-breakpoint
DROP INDEX "schedule_teacher_slot_sem_uq";
--> statement-breakpoint
CREATE INDEX "schedule_entry_combined_idx" ON "schedule_entry" ("school_id", "combined_key") WHERE "combined_key" IS NOT NULL;
