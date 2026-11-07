-- Reset kata sandi dibantu admin sekolah: laporan publik dan tautan reset sekali pakai.
CREATE TABLE "password_reset_request" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"identifier_given" text,
	"claimed_name" text NOT NULL,
	"claimed_info" text,
	"contact_phone" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"matched_user_id" text,
	"handled_by" text,
	"handled_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_request_status_ck" CHECK ("status" in ('new', 'in_progress', 'done', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "password_reset_link" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"request_id" uuid,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"channel_sent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_link_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "password_reset_link_channel_ck" CHECK ("channel_sent" is null or "channel_sent" in ('email', 'whatsapp'))
);
--> statement-breakpoint
ALTER TABLE "password_reset_request" ADD CONSTRAINT "password_reset_request_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_request" ADD CONSTRAINT "password_reset_request_matched_user_id_user_id_fk" FOREIGN KEY ("matched_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_link" ADD CONSTRAINT "password_reset_link_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_link" ADD CONSTRAINT "password_reset_link_request_id_password_reset_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."password_reset_request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_link" ADD CONSTRAINT "password_reset_link_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "password_reset_request_school_idx" ON "password_reset_request" USING btree ("school_id","status","created_at");--> statement-breakpoint
CREATE INDEX "password_reset_request_phone_idx" ON "password_reset_request" USING btree ("contact_phone","created_at");--> statement-breakpoint
CREATE INDEX "password_reset_link_school_idx" ON "password_reset_link" USING btree ("school_id","user_id");--> statement-breakpoint
ALTER TABLE password_reset_request ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE password_reset_request FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON password_reset_request
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE password_reset_link ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE password_reset_link FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON password_reset_link
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
-- Izin baru `account:reset` untuk peran bawaan admin sekolah dan operator di sekolah yang sudah ada.
INSERT INTO role_permission (role_id, school_id, permission)
SELECT r.id, r.school_id, 'account:reset'
FROM role r
WHERE r.is_system AND r.key IN ('school_admin', 'operator')
ON CONFLICT DO NOTHING;
