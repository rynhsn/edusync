-- Fase 3C, tahap 3C.3: berita acara musyawarah dewan pendidik dan tautan keputusan kenaikan (rancangan:
-- docs/rancangan-3b-3c-pilihan-mapel-kelulusan.md, bagian 3.6 dan 4.4). HANYA DDL, aditif: tanpa DROP, tanpa backfill
-- (tabel kosong dan meeting_id NULL = perilaku sebelum migrasi). Rancangan menamai migrasi ini 0104; nomor mengikuti urutan
-- pengerjaan (0103).
--
-- council_meeting           berita acara: tahun ajaran, jenis (promotion | graduation | other), tanggal, tempat, agenda, ringkasan,
--                           kelas opsional (class_id; NULL = seluruh tahun), status draft | final. Saat final, `minutes` (jsonb)
--                           membekukan rekap keputusan tertaut (jumlah naik/tinggal/lulus dan daftar tinggal kelas beserta
--                           alasan dan tindak lanjut); CHECK menjamin berita acara final selalu punya `minutes`.
-- council_meeting_attendee  peserta rapat: guru (opsional) atau nama bebas, peran chair | secretary | member, jabatan (teks bebas).
-- promotion_decision.meeting_id  tautan opsional keputusan kenaikan ke berita acara (NULL = tanpa berita acara). FK komposit
--                           NO ACTION: berita acara yang masih ditautkan tidak bisa dihapus; API melepas tautan lebih dulu.
--
-- Rollback kode ke sebelum tahap ini membiarkan tabel dan kolom ini; kode lama mengabaikan meeting_id, dan keputusan kenaikan
-- tetap berlaku (tanggal rapat per murid `meeting_date` tidak berubah).
CREATE TABLE "council_meeting" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "academic_year_id" uuid NOT NULL,
  "semester_id" uuid,
  "class_id" uuid,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "held_on" date NOT NULL,
  "location" text,
  "chair_name" text,
  "secretary_name" text,
  "agenda" text,
  "summary" text,
  "minutes" jsonb,
  "status" text DEFAULT 'draft' NOT NULL,
  "finalized_at" timestamp with time zone,
  "finalized_by" text,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "council_meeting_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "council_meeting_kind_ck" CHECK ("kind" IN ('promotion', 'graduation', 'other')),
  CONSTRAINT "council_meeting_status_ck" CHECK ("status" IN ('draft', 'final')),
  CONSTRAINT "council_meeting_title_ck" CHECK (char_length("title") BETWEEN 1 AND 160),
  CONSTRAINT "council_meeting_location_ck" CHECK ("location" IS NULL OR char_length("location") <= 200),
  CONSTRAINT "council_meeting_chair_ck" CHECK ("chair_name" IS NULL OR char_length("chair_name") <= 160),
  CONSTRAINT "council_meeting_secretary_ck" CHECK ("secretary_name" IS NULL OR char_length("secretary_name") <= 160),
  CONSTRAINT "council_meeting_agenda_ck" CHECK ("agenda" IS NULL OR char_length("agenda") <= 4000),
  CONSTRAINT "council_meeting_summary_ck" CHECK ("summary" IS NULL OR char_length("summary") <= 8000),
  CONSTRAINT "council_meeting_final_minutes_ck" CHECK ("status" = 'draft' OR "minutes" IS NOT NULL),
  CONSTRAINT "council_meeting_year_fk" FOREIGN KEY ("school_id", "academic_year_id") REFERENCES "academic_year"("school_id", "id"),
  CONSTRAINT "council_meeting_semester_fk" FOREIGN KEY ("school_id", "semester_id") REFERENCES "semester"("school_id", "id"),
  CONSTRAINT "council_meeting_class_fk" FOREIGN KEY ("school_id", "class_id") REFERENCES "class_room"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "council_meeting_year_idx" ON "council_meeting" ("school_id", "academic_year_id");
--> statement-breakpoint
ALTER TABLE council_meeting ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE council_meeting FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON council_meeting
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON council_meeting TO edusync_app;
--> statement-breakpoint
CREATE TABLE "council_meeting_attendee" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "meeting_id" uuid NOT NULL,
  "teacher_id" uuid,
  "name" text NOT NULL,
  "position_title" text,
  "role" text DEFAULT 'member' NOT NULL,
  "sort" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "council_meeting_attendee_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "council_meeting_attendee_role_ck" CHECK ("role" IN ('chair', 'secretary', 'member')),
  CONSTRAINT "council_meeting_attendee_name_ck" CHECK (char_length("name") BETWEEN 1 AND 160),
  CONSTRAINT "council_meeting_attendee_position_ck" CHECK ("position_title" IS NULL OR char_length("position_title") <= 120),
  CONSTRAINT "council_meeting_attendee_meeting_fk" FOREIGN KEY ("school_id", "meeting_id") REFERENCES "council_meeting"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "council_meeting_attendee_teacher_fk" FOREIGN KEY ("school_id", "teacher_id") REFERENCES "teacher"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "council_meeting_attendee_meeting_idx" ON "council_meeting_attendee" ("school_id", "meeting_id");
--> statement-breakpoint
ALTER TABLE council_meeting_attendee ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE council_meeting_attendee FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON council_meeting_attendee
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON council_meeting_attendee TO edusync_app;
--> statement-breakpoint
ALTER TABLE "promotion_decision" ADD COLUMN "meeting_id" uuid;
--> statement-breakpoint
ALTER TABLE "promotion_decision" ADD CONSTRAINT "promotion_decision_meeting_fk" FOREIGN KEY ("school_id", "meeting_id") REFERENCES "council_meeting"("school_id", "id");
--> statement-breakpoint
CREATE INDEX "promotion_decision_meeting_idx" ON "promotion_decision" ("school_id", "meeting_id") WHERE "meeting_id" IS NOT NULL;
