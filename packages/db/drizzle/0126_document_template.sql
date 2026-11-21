-- Templat dokumen yang dapat disesuaikan sekolah (SKL dan sertifikat PKL): satu baris per (sekolah, jenis).
-- Aditif, tanpa data awal: tanpa baris = templat bawaan di kode (keluaran sama seperti sebelumnya).
-- CATATAN JURNAL: `when` manual lebih besar dari 0125 (1799112600000): 0126 = 1799199000000.

CREATE TABLE "document_template" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "kind" text NOT NULL,
  "config" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "document_template_kind_uq" UNIQUE ("school_id", "kind"),
  CONSTRAINT "document_template_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "document_template_kind_ck" CHECK ("kind" IN ('skl', 'pkl_certificate')),
  CONSTRAINT "document_template_config_ck" CHECK (jsonb_typeof("config") = 'object' AND pg_column_size("config") <= 20000)
);
--> statement-breakpoint
ALTER TABLE document_template ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE document_template FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON document_template
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON document_template TO edusync_app;
