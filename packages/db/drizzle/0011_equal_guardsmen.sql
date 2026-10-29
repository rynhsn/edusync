CREATE TABLE "foundation_owner" (
	"foundation_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "foundation_owner_foundation_id_user_id_pk" PRIMARY KEY("foundation_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "foundation_owner" ADD CONSTRAINT "foundation_owner_foundation_id_foundation_id_fk" FOREIGN KEY ("foundation_id") REFERENCES "public"."foundation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_owner" ADD CONSTRAINT "foundation_owner_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "foundation_owner_user_idx" ON "foundation_owner" USING btree ("user_id");