CREATE TABLE "admission_counter" (
	"school_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"last" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "admission_counter_school_id_year_pk" PRIMARY KEY("school_id","year")
);
--> statement-breakpoint
CREATE TABLE "admission_period" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"name" text NOT NULL,
	"level" text NOT NULL,
	"opens_on" date NOT NULL,
	"closes_on" date NOT NULL,
	"quota" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admission_period_name_uq" UNIQUE("school_id","name")
);
--> statement-breakpoint
CREATE TABLE "application" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"reg_number" text NOT NULL,
	"tracking_code_hash" text NOT NULL,
	"full_name" text NOT NULL,
	"gender" text NOT NULL,
	"birth_place" text,
	"birth_date" date NOT NULL,
	"nisn" text,
	"previous_school" text,
	"address" text,
	"program_id" uuid,
	"guardian_name" text NOT NULL,
	"guardian_phone" text NOT NULL,
	"guardian_email" text,
	"status" text DEFAULT 'submitted' NOT NULL,
	"decision_note" text,
	"student_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_reg_uq" UNIQUE("school_id","reg_number")
);
--> statement-breakpoint
CREATE TABLE "application_document" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"file_name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"data_base64" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_status_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"note" text,
	"actor" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fin_discount_rule" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"value" integer NOT NULL,
	"fee_type_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fin_discount_rule_name_uq" UNIQUE("school_id","name")
);
--> statement-breakpoint
CREATE TABLE "fin_student_discount" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fin_student_discount_uq" UNIQUE("student_id","rule_id","academic_year_id")
);
--> statement-breakpoint
CREATE TABLE "hafalan_entry" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"halaqah_id" uuid,
	"date" date NOT NULL,
	"kind" text NOT NULL,
	"surah_from" integer NOT NULL,
	"ayah_from" integer NOT NULL,
	"surah_to" integer NOT NULL,
	"ayah_to" integer NOT NULL,
	"quality" text DEFAULT 'fluent' NOT NULL,
	"note" text,
	"recorded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hafalan_target" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"semester_id" uuid NOT NULL,
	"ziyadah_ayahs" integer DEFAULT 0 NOT NULL,
	"murajaah_ayahs" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hafalan_target_uq" UNIQUE("student_id","semester_id")
);
--> statement-breakpoint
CREATE TABLE "halaqah" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mentor_teacher_id" uuid,
	"schedule_note" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "halaqah_year_name_uq" UNIQUE("academic_year_id","name")
);
--> statement-breakpoint
CREATE TABLE "halaqah_member" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"halaqah_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "halaqah_member_student_year_uq" UNIQUE("student_id","academic_year_id")
);
--> statement-breakpoint
CREATE TABLE "ibadah_item" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'daily' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ibadah_item_name_uq" UNIQUE("school_id","name")
);
--> statement-breakpoint
CREATE TABLE "ibadah_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"date" date NOT NULL,
	"done" boolean NOT NULL,
	"note" text,
	"recorded_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ibadah_log_uq" UNIQUE("student_id","item_id","date")
);
--> statement-breakpoint
CREATE TABLE "letter" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"number" text NOT NULL,
	"subject" text NOT NULL,
	"party" text NOT NULL,
	"letter_date" date NOT NULL,
	"body" text,
	"template_id" uuid,
	"student_id" uuid,
	"disposition_note" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "letter_number_uq" UNIQUE("school_id","direction","number")
);
--> statement-breakpoint
CREATE TABLE "letter_counter" (
	"school_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"year" integer NOT NULL,
	"last" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "letter_counter_school_id_direction_year_pk" PRIMARY KEY("school_id","direction","year")
);
--> statement-breakpoint
CREATE TABLE "letter_template" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'letter' NOT NULL,
	"body" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "letter_template_name_uq" UNIQUE("school_id","name")
);
--> statement-breakpoint
CREATE TABLE "pkl_aspect" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"weight" integer NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "pkl_aspect_name_uq" UNIQUE("school_id","name")
);
--> statement-breakpoint
CREATE TABLE "pkl_journal" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"placement_id" uuid NOT NULL,
	"date" date NOT NULL,
	"activity" text NOT NULL,
	"present" boolean DEFAULT true NOT NULL,
	"source" text NOT NULL,
	"recorded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pkl_journal_day_uq" UNIQUE("placement_id","date")
);
--> statement-breakpoint
CREATE TABLE "pkl_partner" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"field" text,
	"address" text,
	"contact_name" text,
	"phone" text,
	"email" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pkl_partner_name_uq" UNIQUE("school_id","name")
);
--> statement-breakpoint
CREATE TABLE "pkl_period" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pkl_period_name_uq" UNIQUE("school_id","academic_year_id","name")
);
--> statement-breakpoint
CREATE TABLE "pkl_placement" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"supervisor_teacher_id" uuid,
	"industry_supervisor_name" text,
	"industry_supervisor_phone" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"access_token_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pkl_placement_student_period_uq" UNIQUE("period_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "pkl_score" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"placement_id" uuid NOT NULL,
	"aspect_id" uuid NOT NULL,
	"assessor" text NOT NULL,
	"value" integer NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pkl_score_uq" UNIQUE("placement_id","aspect_id","assessor")
);
--> statement-breakpoint
CREATE TABLE "pkl_visit" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"placement_id" uuid NOT NULL,
	"date" date NOT NULL,
	"teacher_id" uuid,
	"notes" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signed_document" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"letter_id" uuid NOT NULL,
	"signer_id" uuid NOT NULL,
	"token" text NOT NULL,
	"pdf_sha256" text,
	"signer_name" text NOT NULL,
	"signer_title" text NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	CONSTRAINT "signed_document_token_uq" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "signer_credential" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"name" text NOT NULL,
	"nip" text,
	"title" text NOT NULL,
	"signature_data" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signer_member_uq" UNIQUE("school_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "admission_counter" ADD CONSTRAINT "admission_counter_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_period" ADD CONSTRAINT "admission_period_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_period" ADD CONSTRAINT "admission_period_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_period_id_admission_period_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."admission_period"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_program_id_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."program"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_document" ADD CONSTRAINT "application_document_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_document" ADD CONSTRAINT "application_document_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_status_log" ADD CONSTRAINT "application_status_log_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_status_log" ADD CONSTRAINT "application_status_log_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_discount_rule" ADD CONSTRAINT "fin_discount_rule_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_discount_rule" ADD CONSTRAINT "fin_discount_rule_fee_type_id_fin_fee_type_id_fk" FOREIGN KEY ("fee_type_id") REFERENCES "public"."fin_fee_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_student_discount" ADD CONSTRAINT "fin_student_discount_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_student_discount" ADD CONSTRAINT "fin_student_discount_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_student_discount" ADD CONSTRAINT "fin_student_discount_rule_id_fin_discount_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."fin_discount_rule"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_student_discount" ADD CONSTRAINT "fin_student_discount_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hafalan_entry" ADD CONSTRAINT "hafalan_entry_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hafalan_entry" ADD CONSTRAINT "hafalan_entry_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hafalan_entry" ADD CONSTRAINT "hafalan_entry_halaqah_id_halaqah_id_fk" FOREIGN KEY ("halaqah_id") REFERENCES "public"."halaqah"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hafalan_target" ADD CONSTRAINT "hafalan_target_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hafalan_target" ADD CONSTRAINT "hafalan_target_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hafalan_target" ADD CONSTRAINT "hafalan_target_semester_id_semester_id_fk" FOREIGN KEY ("semester_id") REFERENCES "public"."semester"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "halaqah" ADD CONSTRAINT "halaqah_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "halaqah" ADD CONSTRAINT "halaqah_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "halaqah" ADD CONSTRAINT "halaqah_mentor_teacher_id_teacher_id_fk" FOREIGN KEY ("mentor_teacher_id") REFERENCES "public"."teacher"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "halaqah_member" ADD CONSTRAINT "halaqah_member_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "halaqah_member" ADD CONSTRAINT "halaqah_member_halaqah_id_halaqah_id_fk" FOREIGN KEY ("halaqah_id") REFERENCES "public"."halaqah"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "halaqah_member" ADD CONSTRAINT "halaqah_member_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "halaqah_member" ADD CONSTRAINT "halaqah_member_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ibadah_item" ADD CONSTRAINT "ibadah_item_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ibadah_log" ADD CONSTRAINT "ibadah_log_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ibadah_log" ADD CONSTRAINT "ibadah_log_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ibadah_log" ADD CONSTRAINT "ibadah_log_item_id_ibadah_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."ibadah_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter" ADD CONSTRAINT "letter_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter" ADD CONSTRAINT "letter_template_id_letter_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."letter_template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter" ADD CONSTRAINT "letter_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_counter" ADD CONSTRAINT "letter_counter_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_template" ADD CONSTRAINT "letter_template_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pkl_aspect" ADD CONSTRAINT "pkl_aspect_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pkl_journal" ADD CONSTRAINT "pkl_journal_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pkl_journal" ADD CONSTRAINT "pkl_journal_placement_id_pkl_placement_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."pkl_placement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pkl_partner" ADD CONSTRAINT "pkl_partner_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pkl_period" ADD CONSTRAINT "pkl_period_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pkl_period" ADD CONSTRAINT "pkl_period_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pkl_placement" ADD CONSTRAINT "pkl_placement_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pkl_placement" ADD CONSTRAINT "pkl_placement_period_id_pkl_period_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."pkl_period"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pkl_placement" ADD CONSTRAINT "pkl_placement_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pkl_placement" ADD CONSTRAINT "pkl_placement_partner_id_pkl_partner_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."pkl_partner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pkl_placement" ADD CONSTRAINT "pkl_placement_supervisor_teacher_id_teacher_id_fk" FOREIGN KEY ("supervisor_teacher_id") REFERENCES "public"."teacher"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pkl_score" ADD CONSTRAINT "pkl_score_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pkl_score" ADD CONSTRAINT "pkl_score_placement_id_pkl_placement_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."pkl_placement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pkl_score" ADD CONSTRAINT "pkl_score_aspect_id_pkl_aspect_id_fk" FOREIGN KEY ("aspect_id") REFERENCES "public"."pkl_aspect"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pkl_visit" ADD CONSTRAINT "pkl_visit_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pkl_visit" ADD CONSTRAINT "pkl_visit_placement_id_pkl_placement_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."pkl_placement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pkl_visit" ADD CONSTRAINT "pkl_visit_teacher_id_teacher_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signed_document" ADD CONSTRAINT "signed_document_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signed_document" ADD CONSTRAINT "signed_document_letter_id_letter_id_fk" FOREIGN KEY ("letter_id") REFERENCES "public"."letter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signed_document" ADD CONSTRAINT "signed_document_signer_id_signer_credential_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."signer_credential"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signer_credential" ADD CONSTRAINT "signer_credential_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signer_credential" ADD CONSTRAINT "signer_credential_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_period_status_idx" ON "application" USING btree ("period_id","status");--> statement-breakpoint
CREATE INDEX "hafalan_entry_student_date_idx" ON "hafalan_entry" USING btree ("student_id","date");--> statement-breakpoint
CREATE INDEX "halaqah_member_halaqah_idx" ON "halaqah_member" USING btree ("halaqah_id");--> statement-breakpoint
CREATE INDEX "ibadah_log_item_date_idx" ON "ibadah_log" USING btree ("item_id","date");--> statement-breakpoint
CREATE INDEX "letter_school_date_idx" ON "letter" USING btree ("school_id","letter_date");--> statement-breakpoint
CREATE INDEX "pkl_placement_partner_idx" ON "pkl_placement" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "signed_document_letter_idx" ON "signed_document" USING btree ("letter_id");