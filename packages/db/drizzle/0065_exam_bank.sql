-- Modul ujian: jenis ujian milik sekolah dan bank soal per mata pelajaran.
CREATE TABLE "exam_type" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "name" text NOT NULL,
  "short_name" text NOT NULL,
  "sort" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "exam_type_school_name_uq" UNIQUE ("school_id", "name")
);
--> statement-breakpoint
CREATE TABLE "question" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "subject_id" uuid NOT NULL REFERENCES "subject"("id"),
  "level" text,
  "type" text NOT NULL,
  "body" text NOT NULL,
  "options" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "answer" text,
  "explanation" text,
  "points" integer DEFAULT 1 NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "question_school_subject_idx" ON "question" ("school_id", "subject_id");
--> statement-breakpoint
ALTER TABLE exam_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_type FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON exam_type
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE question ENABLE ROW LEVEL SECURITY;
ALTER TABLE question FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON question
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
-- Izin ujian untuk peran bawaan yang sudah ada.
INSERT INTO role_permission (role_id, school_id, permission)
SELECT r.id, r.school_id, p.permission
FROM role r
JOIN (VALUES
  ('school_admin', 'exam:read'), ('school_admin', 'exam:author'), ('school_admin', 'exam:manage'),
  ('operator', 'exam:read'), ('operator', 'exam:author'), ('operator', 'exam:manage'),
  ('curriculum', 'exam:read'), ('curriculum', 'exam:author'), ('curriculum', 'exam:manage'),
  ('principal', 'exam:read'),
  ('teacher', 'exam:read'), ('teacher', 'exam:author')
) AS p(role_key, permission) ON p.role_key = r.key
WHERE r.is_system
ON CONFLICT DO NOTHING;
