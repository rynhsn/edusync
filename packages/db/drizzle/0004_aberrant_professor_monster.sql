CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid,
	"queue" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enqueued_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox" USING btree ("status","created_at");