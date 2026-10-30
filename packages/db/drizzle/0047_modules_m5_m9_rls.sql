-- Tahfidz, administrasi, PKL, SPMB, dan keringanan SPP: semua tabel terikat sekolah dan tunduk pada RLS.
ALTER TABLE halaqah ENABLE ROW LEVEL SECURITY;
ALTER TABLE halaqah FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON halaqah
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE halaqah_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE halaqah_member FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON halaqah_member
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE hafalan_target ENABLE ROW LEVEL SECURITY;
ALTER TABLE hafalan_target FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hafalan_target
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE hafalan_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE hafalan_entry FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hafalan_entry
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE ibadah_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE ibadah_item FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ibadah_item
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE ibadah_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ibadah_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ibadah_log
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE letter_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE letter_template FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON letter_template
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE signer_credential ENABLE ROW LEVEL SECURITY;
ALTER TABLE signer_credential FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON signer_credential
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE letter ENABLE ROW LEVEL SECURITY;
ALTER TABLE letter FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON letter
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE letter_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE letter_counter FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON letter_counter
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE signed_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE signed_document FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON signed_document
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE pkl_partner ENABLE ROW LEVEL SECURITY;
ALTER TABLE pkl_partner FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pkl_partner
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE pkl_period ENABLE ROW LEVEL SECURITY;
ALTER TABLE pkl_period FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pkl_period
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE pkl_placement ENABLE ROW LEVEL SECURITY;
ALTER TABLE pkl_placement FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pkl_placement
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE pkl_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE pkl_journal FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pkl_journal
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE pkl_visit ENABLE ROW LEVEL SECURITY;
ALTER TABLE pkl_visit FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pkl_visit
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE pkl_aspect ENABLE ROW LEVEL SECURITY;
ALTER TABLE pkl_aspect FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pkl_aspect
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE pkl_score ENABLE ROW LEVEL SECURITY;
ALTER TABLE pkl_score FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pkl_score
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE admission_period ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_period FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON admission_period
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE application ENABLE ROW LEVEL SECURITY;
ALTER TABLE application FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON application
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE application_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_document FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON application_document
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE application_status_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_status_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON application_status_log
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE admission_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_counter FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON admission_counter
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE fin_discount_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_discount_rule FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fin_discount_rule
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE fin_student_discount ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_student_discount FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fin_student_discount
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
-- Izin baru untuk peran bawaan di sekolah yang sudah ada (hanya ditambah, hanya peran bawaan).
INSERT INTO role_permission (role_id, school_id, permission)
SELECT r.id, r.school_id, g.permission
FROM role r
JOIN (VALUES
  ('school_admin', 'tahfidz:read'),
  ('school_admin', 'tahfidz:manage'),
  ('school_admin', 'letter:read'),
  ('school_admin', 'letter:manage'),
  ('school_admin', 'letter:sign'),
  ('school_admin', 'pkl:read'),
  ('school_admin', 'pkl:manage'),
  ('school_admin', 'admission:read'),
  ('school_admin', 'admission:manage'),
  ('principal', 'tahfidz:read'),
  ('principal', 'letter:read'),
  ('principal', 'letter:sign'),
  ('principal', 'pkl:read'),
  ('principal', 'admission:read'),
  ('operator', 'tahfidz:read'),
  ('operator', 'tahfidz:manage'),
  ('operator', 'letter:read'),
  ('operator', 'letter:manage'),
  ('operator', 'pkl:read'),
  ('operator', 'pkl:manage'),
  ('operator', 'admission:read'),
  ('operator', 'admission:manage'),
  ('teacher', 'tahfidz:read'),
  ('teacher', 'pkl:read')
) AS g(role_key, permission) ON g.role_key = r.key
WHERE r.is_system
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Paket Pro ikut memuat modul baru.
UPDATE plan_preset SET modules = modules || '["tahfidz","administration","internship","admissions"]'::jsonb
WHERE key = 'pro' AND NOT (modules ?& ARRAY['tahfidz','administration','internship','admissions']);
