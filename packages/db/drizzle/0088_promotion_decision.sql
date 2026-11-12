-- Fase 2A: keputusan kenaikan kelas per siswa pada akhir tahun ajaran (naik, tinggal, lulus) sebelum penempatan ke tahun
-- baru. Aditif: tidak mengubah tabel lama selain kunci komposit (school_id, id) pada academic_year.
-- Izin `promotion:manage` tidak diisi di sini (tabel role ber-RLS); sampai ke sekolah lama lewat syncSystemRolePermissions.

ALTER TABLE "academic_year" ADD CONSTRAINT "academic_year_school_id_uq" UNIQUE ("school_id", "id");
--> statement-breakpoint

CREATE TABLE "promotion_decision" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "academic_year_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "from_class_id" uuid NOT NULL,
  "decision" text NOT NULL,
  "to_class_id" uuid,
  "note" text,
  "decided_by" text,
  "decided_at" timestamp with time zone DEFAULT now() NOT NULL,
  "applied_at" timestamp with time zone,
  CONSTRAINT "promotion_decision_decision_ck" CHECK ("decision" IN ('promote', 'retain', 'graduate')),
  CONSTRAINT "promotion_decision_graduate_ck" CHECK ("decision" <> 'graduate' OR "to_class_id" IS NULL),
  CONSTRAINT "promotion_decision_year_student_uq" UNIQUE ("academic_year_id", "student_id"),
  CONSTRAINT "promotion_decision_year_fk" FOREIGN KEY ("school_id", "academic_year_id") REFERENCES "academic_year"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "promotion_decision_student_fk" FOREIGN KEY ("school_id", "student_id") REFERENCES "student"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "promotion_decision_from_class_fk" FOREIGN KEY ("school_id", "from_class_id") REFERENCES "class_room"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "promotion_decision_to_class_fk" FOREIGN KEY ("school_id", "to_class_id") REFERENCES "class_room"("school_id", "id") ON DELETE SET NULL ("to_class_id")
);
--> statement-breakpoint
CREATE INDEX "promotion_decision_year_idx" ON "promotion_decision" ("school_id", "academic_year_id");
--> statement-breakpoint
ALTER TABLE promotion_decision ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE promotion_decision FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON promotion_decision
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON promotion_decision TO edusync_app;
