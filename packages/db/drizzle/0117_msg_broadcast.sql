-- Siaran pengumuman lewat WhatsApp (rancangan: docs/rancangan-siaran-whatsapp.md, tahap C). HANYA DDL, aditif: tanpa DROP dan tanpa
-- perubahan tipe; kolom baru di tabel lama nullable, jadi pengumuman, batch langsung, dan pesan otomatis berperilaku sama.
--
-- announcement   + UNIQUE (school_id, id) agar bisa dirujuk FK komposit (id sudah PK, jadi tak ada baris yang tertolak).
-- msg_batch      + announcement_id (FK komposit ke announcement; ON DELETE SET NULL hanya mengosongkan kolom itu, school_id tetap) dan
--                  indeks unik parsial: paling banyak satu siaran per pengumuman.
-- msg_opt_out    nomor wali yang menolak siaran (dinormalisasi). Siaran melewatinya; pesan langsung hanya diberi peringatan.
--                  `id` ditambahkan di luar rancangan (PK tetap (school_id, phone)) supaya baris bisa dialamatkan tanpa nomor utuh.
--
-- RLS ENABLE + FORCE + kebijakan tenant_isolation, GRANT ke edusync_app (pola 0042/0115).
--
-- CATATAN JURNAL: `when` manual lebih besar dari 0116 (1798335000000): 0117 = 1798421400000.
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_school_id_uq" UNIQUE ("school_id", "id");
--> statement-breakpoint
ALTER TABLE "msg_batch" ADD COLUMN "announcement_id" uuid;
--> statement-breakpoint
ALTER TABLE "msg_batch" ADD CONSTRAINT "msg_batch_announcement_fk" FOREIGN KEY ("school_id", "announcement_id") REFERENCES "announcement"("school_id", "id") ON DELETE SET NULL ("announcement_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "msg_batch_announcement_uq" ON "msg_batch" ("school_id", "announcement_id") WHERE "kind" = 'broadcast' AND "announcement_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE "msg_opt_out" (
  "id" uuid DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "phone" text NOT NULL,
  "guardian_id" uuid,
  "source" text DEFAULT 'staff' NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "msg_opt_out_pk" PRIMARY KEY ("school_id", "phone"),
  CONSTRAINT "msg_opt_out_id_uq" UNIQUE ("id"),
  CONSTRAINT "msg_opt_out_source_ck" CHECK ("source" IN ('staff', 'portal')),
  CONSTRAINT "msg_opt_out_guardian_fk" FOREIGN KEY ("school_id", "guardian_id") REFERENCES "guardian"("school_id", "id") ON DELETE SET NULL ("guardian_id")
);
--> statement-breakpoint
ALTER TABLE msg_opt_out ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE msg_opt_out FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON msg_opt_out
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON msg_opt_out TO edusync_app;
