-- Lampiran dokumen/gambar pada pesan langsung (rancangan: docs/rancangan-siaran-whatsapp.md, tahap B). HANYA DDL, aditif: tanpa DROP
-- dan tanpa perubahan tipe; kolom baru di tabel lama nullable, jadi batch dan pesan tanpa lampiran berperilaku sama.
--
-- msg_attachment   berkas lampiran (bytea, pola school_file): jenis PDF/JPEG/PNG, maks 2 MB. `data` dikosongkan (null) oleh penjadwal
--                  worker bila tak dipakai batch dalam 24 jam atau batch terakhirnya selesai > 7 hari; metadata tetap untuk riwayat.
-- msg_batch        + attachment_id (FK komposit ke msg_attachment).
--
-- RLS ENABLE + FORCE + kebijakan tenant_isolation, GRANT ke edusync_app (pola 0042/0115).
--
-- CATATAN JURNAL: `when` manual lebih besar dari 0115 (1798248600000): 0116 = 1798335000000.
CREATE TABLE "msg_attachment" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "file_name" text NOT NULL,
  "mime" text NOT NULL,
  "size" integer NOT NULL,
  "sha256" text NOT NULL,
  "data" bytea,
  "purged_at" timestamp with time zone,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "msg_attachment_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "msg_attachment_mime_ck" CHECK ("mime" IN ('application/pdf', 'image/jpeg', 'image/png')),
  CONSTRAINT "msg_attachment_size_ck" CHECK ("size" BETWEEN 1 AND 2097152),
  CONSTRAINT "msg_attachment_name_ck" CHECK (char_length("file_name") BETWEEN 1 AND 120)
);
--> statement-breakpoint
CREATE INDEX "msg_attachment_school_created_idx" ON "msg_attachment" ("school_id", "created_at");
--> statement-breakpoint
ALTER TABLE msg_attachment ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE msg_attachment FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON msg_attachment
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON msg_attachment TO edusync_app;
--> statement-breakpoint
ALTER TABLE "msg_batch" ADD COLUMN "attachment_id" uuid;
--> statement-breakpoint
ALTER TABLE "msg_batch" ADD CONSTRAINT "msg_batch_attachment_fk" FOREIGN KEY ("school_id", "attachment_id") REFERENCES "msg_attachment"("school_id", "id");
