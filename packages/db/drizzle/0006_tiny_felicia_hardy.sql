CREATE TABLE "catalog_item" (
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"price_monthly" integer NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "catalog_item_kind_key_pk" PRIMARY KEY("kind","key")
);
--> statement-breakpoint
CREATE TABLE "entitlement" (
	"school_id" uuid NOT NULL,
	"module_key" text NOT NULL,
	"subscription_id" uuid NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	CONSTRAINT "entitlement_school_id_module_key_pk" PRIMARY KEY("school_id","module_key")
);
--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"registration_id" uuid,
	"foundation_id" uuid,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text NOT NULL,
	"lines" jsonb NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_provider_ref_unique" UNIQUE("provider_ref")
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"status" text NOT NULL,
	"amount" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_provider_event_uq" UNIQUE("provider","event_id")
);
--> statement-breakpoint
CREATE TABLE "registration" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"foundation_name" text NOT NULL,
	"period" text NOT NULL,
	"units" jsonb NOT NULL,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"foundation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slug_reservation" (
	"slug" text PRIMARY KEY NOT NULL,
	"registration_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"foundation_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"period" text NOT NULL,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entitlement" ADD CONSTRAINT "entitlement_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement" ADD CONSTRAINT "entitlement_subscription_id_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscription"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_registration_id_registration_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registration"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_foundation_id_foundation_id_fk" FOREIGN KEY ("foundation_id") REFERENCES "public"."foundation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration" ADD CONSTRAINT "registration_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration" ADD CONSTRAINT "registration_foundation_id_foundation_id_fk" FOREIGN KEY ("foundation_id") REFERENCES "public"."foundation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slug_reservation" ADD CONSTRAINT "slug_reservation_registration_id_registration_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registration"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_foundation_id_foundation_id_fk" FOREIGN KEY ("foundation_id") REFERENCES "public"."foundation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_registration_idx" ON "invoice" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "registration_user_idx" ON "registration" USING btree ("user_id");