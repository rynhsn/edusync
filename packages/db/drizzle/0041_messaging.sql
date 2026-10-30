CREATE TABLE "msg_message" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"student_id" uuid,
	"guardian_id" uuid,
	"to_phone" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"detail" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"dedupe_key" text,
	"not_before" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "msg_message_dedupe_uq" UNIQUE("school_id","dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "msg_setting" (
	"school_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"delay_min_seconds" integer DEFAULT 5 NOT NULL,
	"delay_max_seconds" integer DEFAULT 15 NOT NULL,
	"window_start" text DEFAULT '06:00' NOT NULL,
	"window_end" text DEFAULT '20:00' NOT NULL,
	"absent_notice_at" text DEFAULT '09:00',
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "msg_template" (
	"school_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"body" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "msg_template_school_id_event_key_pk" PRIMARY KEY("school_id","event_key")
);
--> statement-breakpoint
CREATE TABLE "wa_account" (
	"school_id" uuid PRIMARY KEY NOT NULL,
	"desired_state" text DEFAULT 'off' NOT NULL,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"qr" text,
	"phone" text,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "msg_message" ADD CONSTRAINT "msg_message_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "msg_message" ADD CONSTRAINT "msg_message_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "msg_message" ADD CONSTRAINT "msg_message_guardian_id_guardian_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardian"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "msg_setting" ADD CONSTRAINT "msg_setting_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "msg_template" ADD CONSTRAINT "msg_template_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_account" ADD CONSTRAINT "wa_account_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "msg_message_queue_idx" ON "msg_message" USING btree ("status","not_before");--> statement-breakpoint
CREATE INDEX "msg_message_school_created_idx" ON "msg_message" USING btree ("school_id","created_at");