-- Penugasan biaya per kelas/siswa, Midtrans per sekolah, templat kartu siswa/ujian.
CREATE TABLE "card_template" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"width_mm" integer DEFAULT 86 NOT NULL,
	"height_mm" integer DEFAULT 54 NOT NULL,
	"background_file_id" uuid,
	"elements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_template_name_uq" UNIQUE("school_id","kind","name"),
	CONSTRAINT "card_template_size_ck" CHECK ("card_template"."width_mm" between 20 and 300 and "card_template"."height_mm" between 20 and 300)
);
--> statement-breakpoint
CREATE TABLE "fin_fee_target" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"fee_type_id" uuid NOT NULL,
	"class_id" uuid,
	"student_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fin_fee_target_class_uq" UNIQUE("fee_type_id","class_id"),
	CONSTRAINT "fin_fee_target_student_uq" UNIQUE("fee_type_id","student_id"),
	CONSTRAINT "fin_fee_target_one_ck" CHECK (("fin_fee_target"."class_id" is null) <> ("fin_fee_target"."student_id" is null))
);
--> statement-breakpoint
CREATE TABLE "fin_gateway_setting" (
	"school_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"mode" text DEFAULT 'sandbox' NOT NULL,
	"merchant_id" text,
	"client_key" text,
	"server_key_enc" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fin_online_charge" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"order_id" text NOT NULL,
	"items" jsonb NOT NULL,
	"total" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_url" text,
	"payment_id" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "fin_online_charge_order_uq" UNIQUE("order_id"),
	CONSTRAINT "fin_online_charge_total_ck" CHECK ("fin_online_charge"."total" > 0)
);
--> statement-breakpoint
ALTER TABLE "fin_fee_type" ADD COLUMN "scope" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "card_template" ADD CONSTRAINT "card_template_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_template" ADD CONSTRAINT "card_template_background_file_id_school_file_id_fk" FOREIGN KEY ("background_file_id") REFERENCES "public"."school_file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_fee_target" ADD CONSTRAINT "fin_fee_target_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_fee_target" ADD CONSTRAINT "fin_fee_target_fee_type_id_fin_fee_type_id_fk" FOREIGN KEY ("fee_type_id") REFERENCES "public"."fin_fee_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_fee_target" ADD CONSTRAINT "fin_fee_target_class_id_class_room_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_fee_target" ADD CONSTRAINT "fin_fee_target_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_gateway_setting" ADD CONSTRAINT "fin_gateway_setting_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_online_charge" ADD CONSTRAINT "fin_online_charge_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_online_charge" ADD CONSTRAINT "fin_online_charge_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_online_charge" ADD CONSTRAINT "fin_online_charge_payment_id_fin_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."fin_payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fin_online_charge_student_idx" ON "fin_online_charge" USING btree ("student_id");--> statement-breakpoint

ALTER TABLE fin_fee_target ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_fee_target FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fin_fee_target
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE fin_gateway_setting ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_gateway_setting FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fin_gateway_setting
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE fin_online_charge ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_online_charge FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fin_online_charge
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE card_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_template FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON card_template
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
