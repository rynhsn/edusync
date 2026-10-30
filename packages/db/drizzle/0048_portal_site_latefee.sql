CREATE TABLE "announcement" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"category" text DEFAULT 'news' NOT NULL,
	"audience" text DEFAULT 'all' NOT NULL,
	"event_date" date,
	"pinned" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fin_late_fee_setting" (
	"school_id" uuid PRIMARY KEY NOT NULL,
	"mode" text DEFAULT 'none' NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"grace_days" integer DEFAULT 0 NOT NULL,
	"cap_amount" integer,
	"fee_type_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_invite" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"guardian_id" uuid,
	"student_id" uuid,
	"token_hash" text NOT NULL,
	"email" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_invite_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "portal_link" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"guardian_id" uuid,
	"student_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_link_member_uq" UNIQUE("member_id"),
	CONSTRAINT "portal_link_target_ck" CHECK (("portal_link"."kind" = 'guardian' and "portal_link"."guardian_id" is not null and "portal_link"."student_id" is null) or ("portal_link"."kind" = 'student' and "portal_link"."student_id" is not null and "portal_link"."guardian_id" is null))
);
--> statement-breakpoint
CREATE TABLE "school_profile" (
	"school_id" uuid PRIMARY KEY NOT NULL,
	"tagline" text,
	"about" text,
	"vision" text,
	"mission" text,
	"address" text,
	"phone" text,
	"email" text,
	"whatsapp" text,
	"map_url" text,
	"accent_color" text,
	"published" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_late_fee_setting" ADD CONSTRAINT "fin_late_fee_setting_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_late_fee_setting" ADD CONSTRAINT "fin_late_fee_setting_fee_type_id_fin_fee_type_id_fk" FOREIGN KEY ("fee_type_id") REFERENCES "public"."fin_fee_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_invite" ADD CONSTRAINT "portal_invite_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_invite" ADD CONSTRAINT "portal_invite_guardian_id_guardian_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardian"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_invite" ADD CONSTRAINT "portal_invite_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_link" ADD CONSTRAINT "portal_link_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_link" ADD CONSTRAINT "portal_link_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_link" ADD CONSTRAINT "portal_link_guardian_id_guardian_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardian"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_link" ADD CONSTRAINT "portal_link_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_profile" ADD CONSTRAINT "school_profile_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcement_school_pub_idx" ON "announcement" USING btree ("school_id","status","published_at");--> statement-breakpoint
CREATE INDEX "portal_invite_school_idx" ON "portal_invite" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "portal_link_school_idx" ON "portal_link" USING btree ("school_id");