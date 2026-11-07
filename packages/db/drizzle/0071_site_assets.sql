-- Gambar situs Edusync (ikon, logo, hero, OG) yang diatur staf platform. Satu baris per slot.
CREATE TABLE "site_asset" (
	"key" text PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"data" bytea NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Seperti platform_setting: hanya peran platform; peran aplikasi tidak boleh menyentuhnya.
REVOKE ALL ON site_asset FROM edusync_app;
