-- Pesan langsung ke wali/staf terpilih (rancangan: docs/rancangan-siaran-whatsapp.md, tahap A). HANYA DDL, aditif: tanpa DROP dan
-- tanpa perubahan tipe; kolom baru di tabel lama nullable atau ber-default, jadi pesan peristiwa otomatis berperilaku sama.
--
-- msg_batch             satu pengiriman ke banyak penerima (kind = direct | broadcast): isi asli, pemilih penerima apa adanya, hitungan.
-- msg_direct_template   templat pesan langsung milik sekolah (yang bawaan ada di packages/contracts, bukan baris DB).
-- msg_message           + batch_id (FK komposit ke msg_batch), teacher_id (penerima staf), priority (0 = peristiwa/test, 1 = langsung,
--                       2 = siaran; dispatcher mengklaim menurut priority, created_at, id).
-- msg_setting           + daily_limit (batas pesan langsung/siaran per hari; bawaan 200, 0..2000).
--
-- Semua tabel baru: school_id NOT NULL, RLS ENABLE + FORCE + kebijakan tenant_isolation, GRANT ke edusync_app (pola 0042/0100).
-- Rujukan antar tabel memakai FK komposit (school_id, id) supaya tak bisa menunjuk baris sekolah lain.
--
-- CATATAN JURNAL: `when` manual lebih besar dari 0114 (1798162200000): 0115 = 1798248600000.
CREATE TABLE "msg_batch" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "body_template" text NOT NULL,
  "selection" jsonb NOT NULL,
  "recipient_count" integer NOT NULL,
  "excluded" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "cancelled_at" timestamp with time zone,
  "cancelled_by" text,
  CONSTRAINT "msg_batch_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "msg_batch_kind_ck" CHECK ("kind" IN ('direct', 'broadcast')),
  CONSTRAINT "msg_batch_title_ck" CHECK (char_length("title") BETWEEN 1 AND 120),
  CONSTRAINT "msg_batch_count_ck" CHECK ("recipient_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX "msg_batch_school_created_idx" ON "msg_batch" ("school_id", "created_at");
--> statement-breakpoint
ALTER TABLE msg_batch ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE msg_batch FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON msg_batch
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON msg_batch TO edusync_app;
--> statement-breakpoint
CREATE TABLE "msg_direct_template" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "name" text NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "msg_direct_template_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "msg_direct_template_name_uq" UNIQUE ("school_id", "name"),
  CONSTRAINT "msg_direct_template_name_ck" CHECK (char_length("name") BETWEEN 1 AND 60),
  CONSTRAINT "msg_direct_template_body_ck" CHECK (char_length("body") BETWEEN 1 AND 1000)
);
--> statement-breakpoint
ALTER TABLE msg_direct_template ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE msg_direct_template FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON msg_direct_template
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON msg_direct_template TO edusync_app;
--> statement-breakpoint
ALTER TABLE "msg_message" ADD COLUMN "batch_id" uuid;
--> statement-breakpoint
ALTER TABLE "msg_message" ADD COLUMN "teacher_id" uuid;
--> statement-breakpoint
ALTER TABLE "msg_message" ADD COLUMN "priority" smallint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "msg_message" ADD CONSTRAINT "msg_message_priority_ck" CHECK ("priority" BETWEEN 0 AND 2);
--> statement-breakpoint
ALTER TABLE "msg_message" ADD CONSTRAINT "msg_message_batch_fk" FOREIGN KEY ("school_id", "batch_id") REFERENCES "msg_batch"("school_id", "id");
--> statement-breakpoint
ALTER TABLE "msg_message" ADD CONSTRAINT "msg_message_teacher_fk" FOREIGN KEY ("school_id", "teacher_id") REFERENCES "teacher"("school_id", "id");
--> statement-breakpoint
CREATE INDEX "msg_message_batch_idx" ON "msg_message" ("batch_id", "status");
--> statement-breakpoint
ALTER TABLE "msg_setting" ADD COLUMN "daily_limit" integer DEFAULT 200 NOT NULL;
--> statement-breakpoint
ALTER TABLE "msg_setting" ADD CONSTRAINT "msg_setting_daily_limit_ck" CHECK ("daily_limit" BETWEEN 0 AND 2000);
