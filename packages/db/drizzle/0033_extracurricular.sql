CREATE TABLE "extracurricular" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"description" text,
	"coach_teacher_id" uuid,
	"external_coach" text,
	"weekday" integer,
	"starts_at" text,
	"ends_at" text,
	"location" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extracurricular_school_name_uq" UNIQUE("school_id","name")
);
--> statement-breakpoint
CREATE TABLE "extracurricular_assessment" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"extracurricular_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"semester_id" uuid NOT NULL,
	"predicate" text NOT NULL,
	"note" text,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extracurricular_assessment_uq" UNIQUE("extracurricular_id","student_id","semester_id")
);
--> statement-breakpoint
CREATE TABLE "extracurricular_attendance" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"recorded_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extracurricular_attendance_uq" UNIQUE("session_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "extracurricular_member" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"extracurricular_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"joined_on" date DEFAULT current_date NOT NULL,
	CONSTRAINT "extracurricular_member_uq" UNIQUE("extracurricular_id","student_id","academic_year_id")
);
--> statement-breakpoint
CREATE TABLE "extracurricular_session" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"extracurricular_id" uuid NOT NULL,
	"date" date NOT NULL,
	"topic" text,
	"recorded_by" text NOT NULL,
	CONSTRAINT "extracurricular_session_uq" UNIQUE("extracurricular_id","date")
);
--> statement-breakpoint
ALTER TABLE "extracurricular" ADD CONSTRAINT "extracurricular_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracurricular" ADD CONSTRAINT "extracurricular_coach_teacher_id_teacher_id_fk" FOREIGN KEY ("coach_teacher_id") REFERENCES "public"."teacher"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracurricular_assessment" ADD CONSTRAINT "extracurricular_assessment_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracurricular_assessment" ADD CONSTRAINT "extracurricular_assessment_extracurricular_id_extracurricular_id_fk" FOREIGN KEY ("extracurricular_id") REFERENCES "public"."extracurricular"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracurricular_assessment" ADD CONSTRAINT "extracurricular_assessment_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracurricular_assessment" ADD CONSTRAINT "extracurricular_assessment_semester_id_semester_id_fk" FOREIGN KEY ("semester_id") REFERENCES "public"."semester"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracurricular_attendance" ADD CONSTRAINT "extracurricular_attendance_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracurricular_attendance" ADD CONSTRAINT "extracurricular_attendance_session_id_extracurricular_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."extracurricular_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracurricular_attendance" ADD CONSTRAINT "extracurricular_attendance_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracurricular_member" ADD CONSTRAINT "extracurricular_member_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracurricular_member" ADD CONSTRAINT "extracurricular_member_extracurricular_id_extracurricular_id_fk" FOREIGN KEY ("extracurricular_id") REFERENCES "public"."extracurricular"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracurricular_member" ADD CONSTRAINT "extracurricular_member_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracurricular_member" ADD CONSTRAINT "extracurricular_member_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracurricular_session" ADD CONSTRAINT "extracurricular_session_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracurricular_session" ADD CONSTRAINT "extracurricular_session_extracurricular_id_extracurricular_id_fk" FOREIGN KEY ("extracurricular_id") REFERENCES "public"."extracurricular"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "extracurricular_member_student_idx" ON "extracurricular_member" USING btree ("student_id");