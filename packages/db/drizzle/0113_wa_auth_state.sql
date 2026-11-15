-- Ganti whatsapp-web.js (Chromium) dengan Baileys (WebSocket). HANYA DDL, aditif: satu tabel baru, tanpa DROP/backfill.
-- wa_auth_state menyimpan kredensial sesi Baileys per sekolah: satu baris per kunci (`creds`, `session:...`, `pre-key:...`),
-- nilai berupa teks TERENKRIPSI (AES-256-GCM, kunci turunan AUTH_SECRET). Hanya worker (peran platform) yang boleh membacanya:
-- akses peran aplikasi dicabut supaya API tenant tidak pernah bisa membaca kredensial, dan RLS tetap dipaksa.
-- Sesi whatsapp-web.js lama (folder WA_SESSION_DIR) tidak bisa dimigrasi: sekolah yang sudah tertaut perlu memindai QR lagi.
-- CATATAN JURNAL: `when` manual lebih besar dari 0112 (1797903000000): 0113 = 1798075800000.
CREATE TABLE "wa_auth_state" (
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "key" text NOT NULL,
  "value" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "wa_auth_state_school_id_key_pk" PRIMARY KEY ("school_id", "key")
);
--> statement-breakpoint
ALTER TABLE wa_auth_state ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE wa_auth_state FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON wa_auth_state
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
REVOKE ALL ON wa_auth_state FROM edusync_app;
