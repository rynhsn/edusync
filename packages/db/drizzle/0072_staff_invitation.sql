-- Undangan menjadi staf platform. Hanya hash token yang disimpan; satu undangan tertunda per email.
CREATE TABLE "staff_invitation" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_invitation_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "staff_invitation_role_check" CHECK ("role" IN ('admin', 'read_only'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "staff_invitation_pending_email_uq" ON "staff_invitation" USING btree ("email") WHERE "accepted_at" is null and "revoked_at" is null;--> statement-breakpoint
-- Seperti platform_setting dan site_asset: hanya peran platform; peran aplikasi tidak boleh menyentuhnya.
REVOKE ALL ON staff_invitation FROM edusync_app;
