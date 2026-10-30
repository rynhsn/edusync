CREATE TABLE "attendance_card" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"code" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_card_code_uq" UNIQUE("school_id","code")
);
--> statement-breakpoint
CREATE TABLE "attendance_device" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_device_key_uq" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "attendance_policy" (
	"school_id" uuid PRIMARY KEY NOT NULL,
	"late_after" text DEFAULT '07:15' NOT NULL,
	"departure_from" text DEFAULT '12:00' NOT NULL,
	"debounce_seconds" integer DEFAULT 30 NOT NULL,
	"methods" jsonb DEFAULT '["rfid","qr","manual"]'::jsonb NOT NULL,
	"notify_parents" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_attendance" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"date" date NOT NULL,
	"check_in_at" timestamp with time zone,
	"check_out_at" timestamp with time zone,
	"status" text NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_attendance_student_date_uq" UNIQUE("student_id","date")
);
--> statement-breakpoint
CREATE TABLE "duty_roster" (
	"school_id" uuid NOT NULL,
	"date" date NOT NULL,
	"teacher_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "duty_roster_date_teacher_id_pk" PRIMARY KEY("date","teacher_id")
);
--> statement-breakpoint
CREATE TABLE "lesson_attendance" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"schedule_entry_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"date" date NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"recorded_by" text NOT NULL,
	"substitute" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_attendance_uq" UNIQUE("schedule_entry_id","student_id","date")
);
--> statement-breakpoint
CREATE TABLE "tap_event" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"source" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"device_id" uuid,
	"recorded_by" text,
	"client_id" text,
	CONSTRAINT "tap_event_client_uq" UNIQUE("school_id","client_id")
);
--> statement-breakpoint
ALTER TABLE "attendance_card" ADD CONSTRAINT "attendance_card_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_card" ADD CONSTRAINT "attendance_card_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_device" ADD CONSTRAINT "attendance_device_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_policy" ADD CONSTRAINT "attendance_policy_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_attendance" ADD CONSTRAINT "daily_attendance_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_attendance" ADD CONSTRAINT "daily_attendance_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_roster" ADD CONSTRAINT "duty_roster_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_roster" ADD CONSTRAINT "duty_roster_teacher_id_teacher_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_attendance" ADD CONSTRAINT "lesson_attendance_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_attendance" ADD CONSTRAINT "lesson_attendance_schedule_entry_id_schedule_entry_id_fk" FOREIGN KEY ("schedule_entry_id") REFERENCES "public"."schedule_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_attendance" ADD CONSTRAINT "lesson_attendance_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tap_event" ADD CONSTRAINT "tap_event_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tap_event" ADD CONSTRAINT "tap_event_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tap_event" ADD CONSTRAINT "tap_event_device_id_attendance_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."attendance_device"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_card_student_idx" ON "attendance_card" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "daily_attendance_school_date_idx" ON "daily_attendance" USING btree ("school_id","date");--> statement-breakpoint
CREATE INDEX "duty_roster_school_date_idx" ON "duty_roster" USING btree ("school_id","date");--> statement-breakpoint
CREATE INDEX "lesson_attendance_school_date_idx" ON "lesson_attendance" USING btree ("school_id","date");--> statement-breakpoint
CREATE INDEX "tap_event_student_at_idx" ON "tap_event" USING btree ("student_id","at");