-- Fase 4, tahap 4.5: identitas madrasah (rancangan: docs/rancangan-fase-4-kokurikuler-madrasah.md, bagian 4.4). HANYA DDL dan seed acuan,
-- aditif: tanpa DROP, tanpa backfill, tanpa kolom baru pada tabel yang sudah ada (NSM di tabel baru, bukan di `school`), tanpa baris
-- otomatis per sekolah. Sekolah yang tidak mengisi NSM identik dengan sebelumnya.
--
-- school_identifier : satu baris per sekolah, hanya dibuat saat NSM disimpan. CHECK 8-16 digit sengaja longgar (format resmi NSM belum
--                     diverifikasi); memperketatnya kelak butuh pembersihan data. NSM unik lintas sekolah (indeks unik parsial).
-- ref_subject (kma) : lima NAMA mapel PAI/Arab untuk MI (`sd`) dan MA (`sma`), sama dengan baris `kma`/`smp` (MTs) di 0020. TANPA JP,
--                     tanpa mapel MA Program Keagamaan, tanpa aturan "SKI mulai kelas 3": isi resmi KMA 1503/2025 belum terbaca, sekolah
--                     mengisinya sendiri lewat mapel dan alokasi yang sudah ada. ON CONFLICT DO NOTHING: aman diulang.
-- CATATAN JURNAL: `when` manual lebih besar dari 0108 (1797557400000): 0109 = 1797643800000.
CREATE TABLE "school_identifier" (
  "school_id" uuid PRIMARY KEY NOT NULL REFERENCES "school"("id"),
  "nsm" text,
  "updated_by" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "school_identifier_nsm_ck" CHECK ("nsm" IS NULL OR "nsm" ~ '^[0-9]{8,16}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "school_identifier_nsm_uq" ON "school_identifier" ("nsm") WHERE "nsm" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE school_identifier ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE school_identifier FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON school_identifier
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON school_identifier TO edusync_app;
--> statement-breakpoint
INSERT INTO ref_subject (curriculum_key, level_group, code, name, sort) VALUES
  ('kma', 'sd', 'AQH', 'Al-Qur''an Hadis', 1),
  ('kma', 'sd', 'AKH', 'Akidah Akhlak', 2),
  ('kma', 'sd', 'FQH', 'Fikih', 3),
  ('kma', 'sd', 'SKI', 'Sejarah Kebudayaan Islam', 4),
  ('kma', 'sd', 'BAR', 'Bahasa Arab', 5),
  ('kma', 'sma', 'AQH', 'Al-Qur''an Hadis', 1),
  ('kma', 'sma', 'AKH', 'Akidah Akhlak', 2),
  ('kma', 'sma', 'FQH', 'Fikih', 3),
  ('kma', 'sma', 'SKI', 'Sejarah Kebudayaan Islam', 4),
  ('kma', 'sma', 'BAR', 'Bahasa Arab', 5)
ON CONFLICT (curriculum_key, level_group, code) DO NOTHING;
--> statement-breakpoint
UPDATE ref_curriculum SET description = 'Rumpun PAI dan Bahasa Arab madrasah (nama mapel saja). JP dan mapel khusus MA mengikuti KMA 1503/2025; isi sendiri.' WHERE key = 'kma';
