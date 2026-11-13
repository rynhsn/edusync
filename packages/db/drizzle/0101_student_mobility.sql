-- Fase 3C, tahap 3C.1: mutasi murid dan riwayat rombel (rancangan: docs/rancangan-3b-3c-pilihan-mapel-kelulusan.md, bagian 3.5 dan
-- 4.3). HANYA DDL, aditif: tanpa DROP, tanpa kolom baru pada tabel lama, tanpa backfill (tabel kosong = perilaku sebelum migrasi).
-- Rancangan menamai migrasi ini 0103; tahap ini dikerjakan PERTAMA, jadi memakai nomor berikutnya yang kosong (0101).
-- Tahap-tahap berikutnya memakai nomor berurutan menurut urutan pengerjaan, bukan nomor di rancangan.
--
-- student_transfer   mutasi murid (direction in | out; kind transfer | dropped). Murid keluar mempertahankan enrollment;
--                    `departure_document` = salinan dokumen rapor DRAF saat keluar (keterangan nilai saat pindah, bukan baris
--                    report_card karena satu baris final di report_card mengunci seluruh rombel). `exception_reason` terisi
--                    hanya bila larangan semester genap tingkat akhir ditimpa pemegang school:manage (dicatat audit).
--                    `document_file_id` disiapkan untuk lampiran surat pindah (belum dipakai API tahap ini).
-- enrollment_change  riwayat pindah rombel dalam satu tahun ajaran (`enrollment.class_id` tetap hanya menyimpan rombel kini).
--                    from_class_id NULL tidak dipakai (penempatan pertama bukan perpindahan); to_class_id NULL = dicabut dari rombel.
--
-- Rollback kode ke sebelum tahap ini membiarkan tabel ini; murid berstatus pindah kembali dikecualikan dari daftar rapor
-- kelas (rapor final mereka tetap aman di snapshot dan tetap terbaca lewat dokumen tunggal), dan pindah rombel kembali menimpa
-- `enrollment.class_id` tanpa riwayat dan tanpa penjaga report_final.
--
-- CATATAN JURNAL: `when` manual lebih besar dari 0100 (1796866200000): 0101 = 1796952600000.
CREATE TABLE "student_transfer" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "student_id" uuid NOT NULL,
  "direction" text NOT NULL,
  "kind" text DEFAULT 'transfer' NOT NULL,
  "effective_on" date NOT NULL,
  "academic_year_id" uuid NOT NULL,
  "class_id" uuid,
  "reason" text NOT NULL,
  "reason_note" text,
  "counterpart_school_name" text,
  "counterpart_npsn" text,
  "letter_number" text,
  "letter_date" date,
  "document_file_id" uuid REFERENCES "school_file"("id") ON DELETE SET NULL,
  "departure_document" jsonb,
  "exception_reason" text,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "student_transfer_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "student_transfer_direction_ck" CHECK ("direction" IN ('in', 'out')),
  CONSTRAINT "student_transfer_kind_ck" CHECK ("kind" IN ('transfer', 'dropped')),
  CONSTRAINT "student_transfer_kind_direction_ck" CHECK ("direction" = 'out' OR "kind" = 'transfer'),
  CONSTRAINT "student_transfer_reason_ck" CHECK (char_length("reason") BETWEEN 1 AND 40),
  CONSTRAINT "student_transfer_reason_note_ck" CHECK ("reason_note" IS NULL OR char_length("reason_note") <= 1000),
  CONSTRAINT "student_transfer_school_name_ck" CHECK ("counterpart_school_name" IS NULL OR char_length("counterpart_school_name") <= 200),
  CONSTRAINT "student_transfer_npsn_ck" CHECK ("counterpart_npsn" IS NULL OR "counterpart_npsn" ~ '^[0-9]{8}$'),
  CONSTRAINT "student_transfer_letter_number_ck" CHECK ("letter_number" IS NULL OR char_length("letter_number") <= 100),
  CONSTRAINT "student_transfer_exception_ck" CHECK ("exception_reason" IS NULL OR char_length("exception_reason") BETWEEN 1 AND 500),
  CONSTRAINT "student_transfer_student_fk" FOREIGN KEY ("school_id", "student_id") REFERENCES "student"("school_id", "id"),
  CONSTRAINT "student_transfer_year_fk" FOREIGN KEY ("school_id", "academic_year_id") REFERENCES "academic_year"("school_id", "id"),
  CONSTRAINT "student_transfer_class_fk" FOREIGN KEY ("school_id", "class_id") REFERENCES "class_room"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "student_transfer_student_idx" ON "student_transfer" ("school_id", "student_id");
--> statement-breakpoint
CREATE INDEX "student_transfer_year_direction_idx" ON "student_transfer" ("school_id", "academic_year_id", "direction");
--> statement-breakpoint
ALTER TABLE student_transfer ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE student_transfer FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON student_transfer
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON student_transfer TO edusync_app;
--> statement-breakpoint
CREATE TABLE "enrollment_change" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "student_id" uuid NOT NULL,
  "academic_year_id" uuid NOT NULL,
  "from_class_id" uuid,
  "to_class_id" uuid,
  "effective_on" date NOT NULL,
  "reason" text,
  "actor_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "enrollment_change_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "enrollment_change_distinct_ck" CHECK ("from_class_id" IS DISTINCT FROM "to_class_id"),
  CONSTRAINT "enrollment_change_reason_ck" CHECK ("reason" IS NULL OR char_length("reason") <= 500),
  CONSTRAINT "enrollment_change_student_fk" FOREIGN KEY ("school_id", "student_id") REFERENCES "student"("school_id", "id"),
  CONSTRAINT "enrollment_change_year_fk" FOREIGN KEY ("school_id", "academic_year_id") REFERENCES "academic_year"("school_id", "id"),
  CONSTRAINT "enrollment_change_from_fk" FOREIGN KEY ("school_id", "from_class_id") REFERENCES "class_room"("school_id", "id"),
  CONSTRAINT "enrollment_change_to_fk" FOREIGN KEY ("school_id", "to_class_id") REFERENCES "class_room"("school_id", "id")
);
--> statement-breakpoint
CREATE INDEX "enrollment_change_from_idx" ON "enrollment_change" ("school_id", "academic_year_id", "from_class_id");
--> statement-breakpoint
CREATE INDEX "enrollment_change_to_idx" ON "enrollment_change" ("school_id", "academic_year_id", "to_class_id");
--> statement-breakpoint
CREATE INDEX "enrollment_change_student_idx" ON "enrollment_change" ("school_id", "student_id");
--> statement-breakpoint
ALTER TABLE enrollment_change ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE enrollment_change FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON enrollment_change
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON enrollment_change TO edusync_app;
