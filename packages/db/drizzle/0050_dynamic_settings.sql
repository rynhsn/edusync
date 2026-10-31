CREATE TABLE "admission_document_type" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admission_document_type_uq" UNIQUE("school_id","key")
);
--> statement-breakpoint
CREATE TABLE "extracurricular_category" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"icon" text DEFAULT 'trophy' NOT NULL,
	"tone" text DEFAULT 'teal' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extracurricular_category_uq" UNIQUE("school_id","key")
);
--> statement-breakpoint
CREATE TABLE "fin_payment_method" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fin_payment_method_uq" UNIQUE("school_id","key")
);
--> statement-breakpoint
CREATE TABLE "letter_setting" (
	"school_id" uuid PRIMARY KEY NOT NULL,
	"school_code" text,
	"number_pattern" text DEFAULT '{seq}/{code}/{roman}/{year}' NOT NULL,
	"agenda_pattern" text DEFAULT '{seq}/{year}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pkl_setting" (
	"school_id" uuid PRIMARY KEY NOT NULL,
	"threshold_a" integer DEFAULT 90 NOT NULL,
	"threshold_b" integer DEFAULT 80 NOT NULL,
	"threshold_c" integer DEFAULT 70 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ref_school_level" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_level" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_level_uq" UNIQUE("school_id","code")
);
--> statement-breakpoint
CREATE TABLE "school_setting" (
	"school_id" uuid PRIMARY KEY NOT NULL,
	"working_days" jsonb DEFAULT '[1,2,3,4,5,6]'::jsonb NOT NULL,
	"semester_names" jsonb DEFAULT '["Ganjil","Genap"]'::jsonb NOT NULL,
	"lesson_default_start" text DEFAULT '07:00' NOT NULL,
	"lesson_default_minutes" integer DEFAULT 40 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_item" ADD COLUMN "requires" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_item" ADD COLUMN "max_students" integer;--> statement-breakpoint
ALTER TABLE "fin_late_fee_setting" ADD COLUMN "due_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "admission_document_type" ADD CONSTRAINT "admission_document_type_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracurricular_category" ADD CONSTRAINT "extracurricular_category_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_payment_method" ADD CONSTRAINT "fin_payment_method_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_setting" ADD CONSTRAINT "letter_setting_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pkl_setting" ADD CONSTRAINT "pkl_setting_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_level" ADD CONSTRAINT "school_level_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_setting" ADD CONSTRAINT "school_setting_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;