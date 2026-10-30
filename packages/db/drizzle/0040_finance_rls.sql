-- Keuangan sekolah: semua tabel terikat sekolah dan tunduk pada RLS.
ALTER TABLE fin_fee_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_fee_type FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fin_fee_type
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE fin_fee_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_fee_plan FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fin_fee_plan
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE fin_invoice ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_invoice FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fin_invoice
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE fin_payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_payment FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fin_payment
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE fin_payment_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_payment_item FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fin_payment_item
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE fin_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_counter FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fin_counter
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
-- Izin baru untuk peran bawaan di sekolah yang sudah ada (hanya ditambah, hanya peran bawaan).
INSERT INTO role_permission (role_id, school_id, permission)
SELECT r.id, r.school_id, g.permission
FROM role r
JOIN (VALUES
  ('school_admin', 'finance:read'), ('school_admin', 'finance:pay'), ('school_admin', 'finance:manage'),
  ('treasurer', 'finance:read'), ('treasurer', 'finance:pay'), ('treasurer', 'finance:manage'),
  ('principal', 'finance:read'),
  ('operator', 'finance:read')
) AS g(role_key, permission) ON g.role_key = r.key
WHERE r.is_system
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Item katalog modul `finance` (harga awal; operator platform boleh mengubahnya). Baris yang sudah ada tidak ditimpa.
INSERT INTO catalog_item (kind, key, name, price_monthly, sort)
VALUES ('module', 'finance', 'Keuangan sekolah', 75000, 23)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Paket Pro ikut memuat keuangan sekolah.
UPDATE plan_preset SET modules = modules || '["finance"]'::jsonb
WHERE key = 'pro' AND NOT (modules ? 'finance');
