-- Fase 3, tahap 3.4: narasi rapor dari tujuan pembelajaran (rancangan: docs/rancangan-fase-3-asesmen-rapor.md, bagian 3.4 dan 4.3).
-- HANYA DDL, aditif: tanpa DROP dan tanpa perubahan tipe. Bawaan = perilaku sebelum migrasi, jadi tidak ada backfill (bawaan kolom
-- tidak melewati RLS):
--   * report_setting.narrative_max_items      TP per sisi (tinggi/rendah) pada narasi otomatis, bawaan 2 (K6), 1..5.
--   * report_setting.narrative_high_template  templat kalimat sisi tinggi memuat {tp}; NULL = templat bawaan di kontrak.
--   * report_setting.narrative_low_template   templat kalimat sisi rendah; NULL = templat bawaan di kontrak.
-- Tabel report_setting TIDAK didump tes garis dasar fase 3 (fixture membekukan baris report_card dan salinan beku saja), jadi kolom
-- baru di sini tidak mengubah keluaran sekolah lama. `report_subject_narrative.generated_hash` sudah dibuat di 0097 dan dipakai
-- mulai tahap ini sebagai penanda narasi manual usang (R7); tidak ada kolom baru di sana.
--
-- Rollback kode ke sebelum tahap ini membiarkan kolom ini; kode lama mengabaikannya (narasi draf kembali dari predikat; rapor final
-- aman karena dibaca dari snapshot).
--
-- CATATAN JURNAL: `when` manual lebih besar dari 0098 (1796693400000): 0099 = 1796779800000.
ALTER TABLE "report_setting" ADD COLUMN "narrative_max_items" integer DEFAULT 2 NOT NULL;
--> statement-breakpoint
ALTER TABLE "report_setting" ADD COLUMN "narrative_high_template" text;
--> statement-breakpoint
ALTER TABLE "report_setting" ADD COLUMN "narrative_low_template" text;
--> statement-breakpoint
ALTER TABLE "report_setting" ADD CONSTRAINT "report_setting_narrative_items_ck" CHECK ("narrative_max_items" BETWEEN 1 AND 5);
--> statement-breakpoint
ALTER TABLE "report_setting" ADD CONSTRAINT "report_setting_narrative_templates_ck" CHECK (
  ("narrative_high_template" IS NULL OR (position('{tp}' in "narrative_high_template") > 0 AND char_length("narrative_high_template") <= 300))
  AND ("narrative_low_template" IS NULL OR (position('{tp}' in "narrative_low_template") > 0 AND char_length("narrative_low_template") <= 300))
);
