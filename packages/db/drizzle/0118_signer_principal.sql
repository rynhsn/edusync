-- Satu sumber data kepala sekolah untuk dokumen. HANYA DDL, aditif: kolom baru bernilai bawaan false, jadi sekolah yang tidak
-- menandai siapa pun berperilaku sama (rapor/SKL/sertifikat tetap membaca report_setting sebagai cadangan).
-- signer_credential + is_principal; indeks unik parsial: paling banyak satu kepala sekolah AKTIF per sekolah.
-- RLS signer_credential sudah ada sejak 0047.
--
-- CATATAN JURNAL: `when` manual lebih besar dari 0117 (1798421400000): 0118 = 1798507800000.
ALTER TABLE "signer_credential" ADD COLUMN "is_principal" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "signer_principal_uq" ON "signer_credential" ("school_id") WHERE "is_principal" AND "active";
