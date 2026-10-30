CREATE TABLE "fin_counter" (
	"school_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"last" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "fin_counter_school_id_year_pk" PRIMARY KEY("school_id","year")
);
--> statement-breakpoint
CREATE TABLE "fin_fee_plan" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"fee_type_id" uuid NOT NULL,
	"level" text,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fin_fee_plan_uq" UNIQUE NULLS NOT DISTINCT("academic_year_id","fee_type_id","level"),
	CONSTRAINT "fin_fee_plan_amount_ck" CHECK ("fin_fee_plan"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "fin_fee_type" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fin_fee_type_school_name_uq" UNIQUE("school_id","name")
);
--> statement-breakpoint
CREATE TABLE "fin_invoice" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"fee_type_id" uuid NOT NULL,
	"period" text,
	"title" text NOT NULL,
	"amount" integer NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"discount_reason" text,
	"due_date" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"void_reason" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fin_invoice_uq" UNIQUE NULLS NOT DISTINCT("student_id","academic_year_id","fee_type_id","period"),
	CONSTRAINT "fin_invoice_amount_ck" CHECK ("fin_invoice"."amount" >= 0),
	CONSTRAINT "fin_invoice_discount_ck" CHECK ("fin_invoice"."discount" >= 0 and "fin_invoice"."discount" <= "fin_invoice"."amount")
);
--> statement-breakpoint
CREATE TABLE "fin_payment" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"receipt_no" text NOT NULL,
	"student_id" uuid NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"method" text NOT NULL,
	"total" integer NOT NULL,
	"note" text,
	"recorded_by" text NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" text,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fin_payment_receipt_uq" UNIQUE("school_id","receipt_no"),
	CONSTRAINT "fin_payment_total_ck" CHECK ("fin_payment"."total" > 0)
);
--> statement-breakpoint
CREATE TABLE "fin_payment_item" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	CONSTRAINT "fin_payment_item_amount_ck" CHECK ("fin_payment_item"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "fin_counter" ADD CONSTRAINT "fin_counter_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_fee_plan" ADD CONSTRAINT "fin_fee_plan_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_fee_plan" ADD CONSTRAINT "fin_fee_plan_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_fee_plan" ADD CONSTRAINT "fin_fee_plan_fee_type_id_fin_fee_type_id_fk" FOREIGN KEY ("fee_type_id") REFERENCES "public"."fin_fee_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_fee_type" ADD CONSTRAINT "fin_fee_type_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_invoice" ADD CONSTRAINT "fin_invoice_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_invoice" ADD CONSTRAINT "fin_invoice_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_invoice" ADD CONSTRAINT "fin_invoice_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_invoice" ADD CONSTRAINT "fin_invoice_fee_type_id_fin_fee_type_id_fk" FOREIGN KEY ("fee_type_id") REFERENCES "public"."fin_fee_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_payment" ADD CONSTRAINT "fin_payment_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_payment" ADD CONSTRAINT "fin_payment_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_payment_item" ADD CONSTRAINT "fin_payment_item_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_payment_item" ADD CONSTRAINT "fin_payment_item_payment_id_fin_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."fin_payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_payment_item" ADD CONSTRAINT "fin_payment_item_invoice_id_fin_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."fin_invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fin_invoice_year_idx" ON "fin_invoice" USING btree ("academic_year_id","student_id");--> statement-breakpoint
CREATE INDEX "fin_payment_student_idx" ON "fin_payment" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "fin_payment_paid_idx" ON "fin_payment" USING btree ("school_id","paid_at");--> statement-breakpoint
CREATE INDEX "fin_payment_item_payment_idx" ON "fin_payment_item" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "fin_payment_item_invoice_idx" ON "fin_payment_item" USING btree ("invoice_id");