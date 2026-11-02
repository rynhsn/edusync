-- Domain sendiri sekolah. Tabel ber-RLS tenant; resolusi host (publik, tanpa konteks sekolah) lewat fungsi
-- SECURITY DEFINER yang hanya mengembalikan slug sekolah aktif untuk hostname terverifikasi.
CREATE TABLE "school_domain" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"hostname" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"verification_token" text NOT NULL,
	"verified_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_domain_hostname_uq" UNIQUE("hostname"),
	CONSTRAINT "school_domain_hostname_lower_ck" CHECK ("school_domain"."hostname" = lower("school_domain"."hostname"))
);
--> statement-breakpoint
ALTER TABLE "school_domain" ADD CONSTRAINT "school_domain_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "school_domain_school_idx" ON "school_domain" USING btree ("school_id");
--> statement-breakpoint
ALTER TABLE school_domain ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE school_domain FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON school_domain
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON school_domain TO edusync_app;
--> statement-breakpoint
CREATE FUNCTION resolve_school_domain(host text) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.slug FROM school_domain d JOIN school s ON s.id = d.school_id
  WHERE d.hostname = lower(host) AND d.status = 'verified' AND s.status = 'active'
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION resolve_school_domain(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION resolve_school_domain(text) TO edusync_app, edusync_platform;
