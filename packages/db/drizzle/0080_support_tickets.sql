-- Laporan (tiket bantuan) dari sekolah/pemilik yayasan ke tim platform. Tabel tingkat platform tanpa RLS.
CREATE SEQUENCE IF NOT EXISTS support_ticket_no_seq;
--> statement-breakpoint
CREATE TABLE "support_ticket" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"ticket_no" text DEFAULT 'TKT-' || lpad(nextval('support_ticket_no_seq')::text, 6, '0') NOT NULL,
	"origin" text NOT NULL,
	"school_id" uuid,
	"foundation_id" uuid,
	"created_by" text NOT NULL,
	"creator_name" text NOT NULL,
	"creator_email" text NOT NULL,
	"subject" text NOT NULL,
	"category" text NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_staff_id" text,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_by_side" text NOT NULL,
	"school_unread" boolean DEFAULT false NOT NULL,
	"platform_unread" boolean DEFAULT true NOT NULL,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_ticket_ticket_no_unique" UNIQUE("ticket_no"),
	CONSTRAINT "support_ticket_origin_check" CHECK ("origin" IN ('school', 'owner')),
	CONSTRAINT "support_ticket_category_check" CHECK ("category" IN ('account', 'billing', 'bug', 'feature', 'data', 'other')),
	CONSTRAINT "support_ticket_priority_check" CHECK ("priority" IN ('low', 'normal', 'high', 'urgent')),
	CONSTRAINT "support_ticket_status_check" CHECK ("status" IN ('open', 'in_progress', 'waiting_reporter', 'resolved', 'closed')),
	CONSTRAINT "support_ticket_side_check" CHECK ("last_message_by_side" IN ('school', 'platform')),
	CONSTRAINT "support_ticket_subject_len" CHECK (char_length("subject") BETWEEN 1 AND 150)
);
--> statement-breakpoint
CREATE TABLE "support_message" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_user_id" text NOT NULL,
	"author_name" text NOT NULL,
	"author_side" text NOT NULL,
	"body" text NOT NULL,
	"internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_message_side_check" CHECK ("author_side" IN ('school', 'platform')),
	CONSTRAINT "support_message_body_len" CHECK (char_length("body") BETWEEN 1 AND 5000),
	CONSTRAINT "support_message_internal_check" CHECK (NOT "internal" OR "author_side" = 'platform')
);
--> statement-breakpoint
CREATE TABLE "support_email_throttle" (
	"ticket_id" uuid NOT NULL,
	"recipient" text NOT NULL,
	"kind" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_email_throttle_ticket_id_recipient_kind_pk" PRIMARY KEY("ticket_id","recipient","kind")
);
--> statement-breakpoint
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_foundation_id_foundation_id_fk" FOREIGN KEY ("foundation_id") REFERENCES "public"."foundation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_assigned_staff_id_platform_staff_user_id_fk" FOREIGN KEY ("assigned_staff_id") REFERENCES "public"."platform_staff"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_message" ADD CONSTRAINT "support_message_ticket_id_support_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_email_throttle" ADD CONSTRAINT "support_email_throttle_ticket_id_support_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_ticket_school_idx" ON "support_ticket" USING btree ("school_id","last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "support_ticket_foundation_idx" ON "support_ticket" USING btree ("foundation_id","last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "support_ticket_status_idx" ON "support_ticket" USING btree ("status","last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "support_ticket_platform_unread_idx" ON "support_ticket" USING btree ("last_message_at") WHERE "support_ticket"."platform_unread";--> statement-breakpoint
CREATE INDEX "support_message_ticket_idx" ON "support_message" USING btree ("ticket_id","created_at");--> statement-breakpoint
-- Seperti staff_invitation dan site_asset: hanya peran platform; peran aplikasi tidak boleh menyentuhnya.
REVOKE ALL ON support_ticket FROM edusync_app;--> statement-breakpoint
REVOKE ALL ON support_message FROM edusync_app;--> statement-breakpoint
REVOKE ALL ON support_email_throttle FROM edusync_app;--> statement-breakpoint
REVOKE ALL ON SEQUENCE support_ticket_no_seq FROM edusync_app;
