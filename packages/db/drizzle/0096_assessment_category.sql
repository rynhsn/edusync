-- Fase 3, tahap 3.1: kategori asesmen (rancangan: docs/rancangan-fase-3-asesmen-rapor.md, bagian 3.1 dan 4.1).
-- Semua aditif: tanpa DROP dan tanpa perubahan tipe. Nilai bawaan = perilaku sebelum migrasi (komponen sumatif dan ikut nilai
-- akhir; penilaian tanpa tanda), jadi tidak ada backfill: Postgres mengisi bawaan konstan di katalog tanpa melewati RLS.
--
-- grade_component.category      'summative' (bawaan) | 'formative'. Penilaian mewarisi kategori komponennya (diturunkan saat baca).
-- grade_component.include_in_final  bawaan true. CHECK mengunci komponen formatif tidak pernah masuk nilai akhir.
-- assessment.purpose            NULL | 'initial' (asesmen awal/diagnostik sebagai TUJUAN, bukan jenis).
-- assessment.summative_scope    NULL | 'material' (lingkup materi) | 'end_of_semester'.
-- assessment.technique          teks bebas dari daftar kontrak; sengaja TANPA CHECK (daftar acuan bisa berubah), divalidasi API.
--
-- Rollback kode ke sebelum tahap ini membiarkan kolom ini; kode lama mengabaikannya (komponen formatif kembali ikut nilai akhir
-- draf; rapor final aman karena dibaca dari snapshot).
--
-- CATATAN JURNAL: `when` manual lebih besar dari 0095 (1796434200000), lihat catatan di 0093.
ALTER TABLE "grade_component" ADD COLUMN "category" text DEFAULT 'summative' NOT NULL;
--> statement-breakpoint
ALTER TABLE "grade_component" ADD COLUMN "include_in_final" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "grade_component" ADD CONSTRAINT "grade_component_category_ck" CHECK ("category" IN ('formative', 'summative'));
--> statement-breakpoint
ALTER TABLE "grade_component" ADD CONSTRAINT "grade_component_final_ck" CHECK ("category" = 'summative' OR "include_in_final" = false);
--> statement-breakpoint
ALTER TABLE "assessment" ADD COLUMN "purpose" text;
--> statement-breakpoint
ALTER TABLE "assessment" ADD COLUMN "summative_scope" text;
--> statement-breakpoint
ALTER TABLE "assessment" ADD COLUMN "technique" text;
--> statement-breakpoint
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_purpose_ck" CHECK ("purpose" IS NULL OR "purpose" = 'initial');
--> statement-breakpoint
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_scope_ck" CHECK ("summative_scope" IS NULL OR "summative_scope" IN ('material', 'end_of_semester'));
