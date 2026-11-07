-- Rekening bank sekolah untuk pembayaran transfer (ditampilkan di portal wali/siswa).
CREATE TABLE "fin_bank_account" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"bank_name" text NOT NULL,
	"account_number" text NOT NULL,
	"account_holder" text NOT NULL,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fin_bank_account" ADD CONSTRAINT "fin_bank_account_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fin_bank_account_school_idx" ON "fin_bank_account" USING btree ("school_id","sort");--> statement-breakpoint
ALTER TABLE fin_bank_account ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE fin_bank_account FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON fin_bank_account
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
