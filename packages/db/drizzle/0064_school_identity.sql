-- Identitas sekolah (logo, alamat lengkap, kontak) dan berkas biner kecil milik sekolah.
-- Situs publik memilih: ikut identitas sekolah atau isi sendiri (custom).
CREATE TABLE "school_file" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "kind" text NOT NULL,
  "mime" text NOT NULL,
  "size" integer NOT NULL,
  "data" bytea NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "school_file_school_idx" ON "school_file" ("school_id", "kind");
--> statement-breakpoint
CREATE TABLE "school_identity" (
  "school_id" uuid PRIMARY KEY NOT NULL REFERENCES "school"("id"),
  "official_name" text,
  "logo_file_id" uuid REFERENCES "school_file"("id") ON DELETE SET NULL,
  "street" text,
  "village" text,
  "district" text,
  "city" text,
  "province" text,
  "postal_code" text,
  "phone" text,
  "fax" text,
  "email" text,
  "website" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "school_profile" ADD COLUMN "identity_source" text DEFAULT 'school' NOT NULL;
--> statement-breakpoint
-- Situs yang sudah punya alamat/telepon/email sendiri tetap memakainya.
UPDATE "school_profile" SET "identity_source" = 'custom'
WHERE "address" IS NOT NULL OR "phone" IS NOT NULL OR "email" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE school_file ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_file FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON school_file
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE school_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_identity FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON school_identity
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
