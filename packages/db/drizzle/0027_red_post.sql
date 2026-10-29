CREATE TABLE "class_attendance" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"date" date NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"recorded_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_attendance_student_date_uq" UNIQUE("student_id","date")
);
--> statement-breakpoint
CREATE TABLE "lesson_period" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"starts_at" text NOT NULL,
	"ends_at" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_period_number_uq" UNIQUE("school_id","number")
);
--> statement-breakpoint
CREATE TABLE "schedule_entry" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"period_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_class_slot_uq" UNIQUE("class_id","weekday","period_id"),
	CONSTRAINT "schedule_teacher_slot_uq" UNIQUE("academic_year_id","teacher_id","weekday","period_id")
);
--> statement-breakpoint
ALTER TABLE "class_attendance" ADD CONSTRAINT "class_attendance_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_attendance" ADD CONSTRAINT "class_attendance_class_id_class_room_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class_room"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_attendance" ADD CONSTRAINT "class_attendance_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_period" ADD CONSTRAINT "lesson_period_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_entry" ADD CONSTRAINT "schedule_entry_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_entry" ADD CONSTRAINT "schedule_entry_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_entry" ADD CONSTRAINT "schedule_entry_class_id_class_room_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class_room"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_entry" ADD CONSTRAINT "schedule_entry_subject_id_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subject"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_entry" ADD CONSTRAINT "schedule_entry_teacher_id_teacher_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_entry" ADD CONSTRAINT "schedule_entry_period_id_lesson_period_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."lesson_period"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "class_attendance_class_date_idx" ON "class_attendance" USING btree ("class_id","date");