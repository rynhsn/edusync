-- Penagihan otomatis sekolah: aturan per jenis biaya dan log setiap upaya (otomatis atau manual).
CREATE TABLE "fin_auto_billing_rule" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"fee_type_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"run_day" smallint,
	"due_mode" text NOT NULL,
	"due_day" smallint,
	"due_days" smallint,
	"class_ids" jsonb,
	"semester_run" text,
	"semester_offset_days" smallint,
	"run_on" date,
	"installments" smallint,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fin_auto_billing_rule_fee_uq" UNIQUE("school_id","fee_type_id"),
	CONSTRAINT "fin_auto_billing_rule_run_day_ck" CHECK ("fin_auto_billing_rule"."run_day" is null or "fin_auto_billing_rule"."run_day" between 1 and 28),
	CONSTRAINT "fin_auto_billing_rule_due_day_ck" CHECK ("fin_auto_billing_rule"."due_day" is null or "fin_auto_billing_rule"."due_day" between 1 and 28),
	CONSTRAINT "fin_auto_billing_rule_due_days_ck" CHECK ("fin_auto_billing_rule"."due_days" is null or "fin_auto_billing_rule"."due_days" between 0 and 120),
	CONSTRAINT "fin_auto_billing_rule_offset_ck" CHECK ("fin_auto_billing_rule"."semester_offset_days" is null or "fin_auto_billing_rule"."semester_offset_days" between -60 and 180),
	CONSTRAINT "fin_auto_billing_rule_installments_ck" CHECK ("fin_auto_billing_rule"."installments" is null or "fin_auto_billing_rule"."installments" between 2 and 12)
);
--> statement-breakpoint
CREATE TABLE "fin_auto_billing_run" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"academic_year_id" uuid,
	"period" text NOT NULL,
	"scheduled_for" date NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"missing_plan_count" integer DEFAULT 0 NOT NULL,
	"free_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"trigger" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fin_auto_billing_rule" ADD CONSTRAINT "fin_auto_billing_rule_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_auto_billing_rule" ADD CONSTRAINT "fin_auto_billing_rule_fee_type_id_fin_fee_type_id_fk" FOREIGN KEY ("fee_type_id") REFERENCES "public"."fin_fee_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_auto_billing_run" ADD CONSTRAINT "fin_auto_billing_run_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_auto_billing_run" ADD CONSTRAINT "fin_auto_billing_run_rule_id_fin_auto_billing_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."fin_auto_billing_rule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_auto_billing_run" ADD CONSTRAINT "fin_auto_billing_run_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fin_auto_billing_run_rule_idx" ON "fin_auto_billing_run" USING btree ("rule_id","started_at");--> statement-breakpoint
CREATE INDEX "fin_auto_billing_run_school_idx" ON "fin_auto_billing_run" USING btree ("school_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fin_auto_billing_run_ok_uq" ON "fin_auto_billing_run" USING btree ("rule_id","academic_year_id","period") WHERE "fin_auto_billing_run"."trigger" = 'auto' and "fin_auto_billing_run"."status" = 'ok';--> statement-breakpoint
ALTER TABLE fin_auto_billing_rule ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE fin_auto_billing_rule FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON fin_auto_billing_rule
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE fin_auto_billing_run ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE fin_auto_billing_run FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON fin_auto_billing_run
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
