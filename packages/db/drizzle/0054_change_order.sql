-- Perubahan paket dari portal akun yayasan. Hanya ditulis oleh peran platform, seperti tabel penagihan lain.
CREATE TABLE "change_order" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"foundation_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"school_id" uuid,
	"payload" jsonb NOT NULL,
	"status" text NOT NULL,
	"invoice_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "change_order" ADD CONSTRAINT "change_order_foundation_id_foundation_id_fk" FOREIGN KEY ("foundation_id") REFERENCES "public"."foundation"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "change_order" ADD CONSTRAINT "change_order_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "change_order" ADD CONSTRAINT "change_order_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "change_order" ADD CONSTRAINT "change_order_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "change_order_foundation_idx" ON "change_order" USING btree ("foundation_id");
--> statement-breakpoint
REVOKE ALL ON change_order FROM edusync_app;
--> statement-breakpoint
ALTER TABLE change_order ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE change_order FORCE ROW LEVEL SECURITY;
