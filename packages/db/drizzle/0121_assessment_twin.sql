-- Penilaian kembar lintas rombel (tahap 3B.5): satu permintaan membuat satu `assessment` biasa per rombel, diikat `twin_key`.
-- Kolom nullable tanpa backfill: NULL = penilaian biasa (semua data lama), sehingga perilaku, rapor, dan snapshot tidak berubah.
-- Tanpa tabel baru dan tanpa FK; kesesuaian anggota grup dijaga API. RLS `assessment` sudah ada.
-- CATATAN JURNAL: `when` manual lebih besar dari 0120 (1798680600000): 0121 = 1798767000000.
ALTER TABLE "assessment" ADD COLUMN "twin_key" uuid;
--> statement-breakpoint
CREATE INDEX "assessment_twin_idx" ON "assessment" ("school_id", "twin_key") WHERE "twin_key" IS NOT NULL;
