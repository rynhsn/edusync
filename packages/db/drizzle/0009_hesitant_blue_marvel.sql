CREATE TABLE "platform_staff" (
	"user_id" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "school" ADD COLUMN "student_tier" text DEFAULT 't300' NOT NULL;--> statement-breakpoint
ALTER TABLE "school" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "platform_staff" ADD CONSTRAINT "platform_staff_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;