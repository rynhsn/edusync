CREATE TABLE "ref_curriculum" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ref_subject" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"curriculum_key" text NOT NULL,
	"level_group" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ref_subject_uq" UNIQUE("curriculum_key","level_group","code")
);
--> statement-breakpoint
CREATE TABLE "school_curriculum" (
	"school_id" uuid NOT NULL,
	"curriculum_key" text NOT NULL,
	"level_group" text NOT NULL,
	"adopted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_curriculum_school_id_curriculum_key_level_group_pk" PRIMARY KEY("school_id","curriculum_key","level_group")
);
--> statement-breakpoint
ALTER TABLE "ref_subject" ADD CONSTRAINT "ref_subject_curriculum_key_ref_curriculum_key_fk" FOREIGN KEY ("curriculum_key") REFERENCES "public"."ref_curriculum"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_curriculum" ADD CONSTRAINT "school_curriculum_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_curriculum" ADD CONSTRAINT "school_curriculum_curriculum_key_ref_curriculum_key_fk" FOREIGN KEY ("curriculum_key") REFERENCES "public"."ref_curriculum"("key") ON DELETE no action ON UPDATE no action;