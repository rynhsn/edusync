CREATE TABLE "report_card" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"semester_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"homeroom_note" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"finalized_at" timestamp with time zone,
	"finalized_by" text,
	"snapshot" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_card_semester_student_uq" UNIQUE("semester_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "report_setting" (
	"school_id" uuid PRIMARY KEY NOT NULL,
	"principal_name" text,
	"principal_nip" text,
	"city" text,
	"address" text,
	"desc_a" text DEFAULT 'Menunjukkan penguasaan yang sangat baik pada seluruh capaian pembelajaran.' NOT NULL,
	"desc_b" text DEFAULT 'Menunjukkan penguasaan yang baik pada sebagian besar capaian pembelajaran.' NOT NULL,
	"desc_c" text DEFAULT 'Menunjukkan penguasaan yang cukup pada capaian pembelajaran; perlu peningkatan pada beberapa bagian.' NOT NULL,
	"desc_d" text DEFAULT 'Perlu bimbingan lebih lanjut untuk mencapai capaian pembelajaran.' NOT NULL,
	"show_rank" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "class_room" ADD COLUMN "homeroom_teacher_id" uuid;--> statement-breakpoint
ALTER TABLE "report_card" ADD CONSTRAINT "report_card_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_card" ADD CONSTRAINT "report_card_semester_id_semester_id_fk" FOREIGN KEY ("semester_id") REFERENCES "public"."semester"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_card" ADD CONSTRAINT "report_card_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_card" ADD CONSTRAINT "report_card_class_id_class_room_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class_room"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_setting" ADD CONSTRAINT "report_setting_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_card_class_idx" ON "report_card" USING btree ("class_id","semester_id");--> statement-breakpoint
ALTER TABLE "class_room" ADD CONSTRAINT "class_room_homeroom_teacher_id_teacher_id_fk" FOREIGN KEY ("homeroom_teacher_id") REFERENCES "public"."teacher"("id") ON DELETE no action ON UPDATE no action;