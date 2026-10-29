-- Penagihan hanya ditulis oleh peran platform (pendaftaran, webhook pembayaran, aktivasi).
-- Peran aplikasi (tenant) tidak boleh mengubah satu pun tabel ini; ia hanya membaca entitlement miliknya
-- untuk memeriksa modul yang aktif.
REVOKE ALL ON catalog_item, registration, slug_reservation, invoice, payment, subscription, entitlement
  FROM edusync_app;
--> statement-breakpoint
GRANT SELECT ON catalog_item TO edusync_app;
--> statement-breakpoint
GRANT SELECT ON entitlement TO edusync_app;
--> statement-breakpoint
ALTER TABLE entitlement ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlement FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON entitlement FOR SELECT
  USING (school_id = ANY (app_school_ids()));
--> statement-breakpoint
-- Tabel yang berisi data pribadi dan keuangan tidak punya policy untuk peran aplikasi sama sekali.
ALTER TABLE registration ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration FORCE ROW LEVEL SECURITY;
ALTER TABLE invoice ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice FORCE ROW LEVEL SECURITY;
ALTER TABLE payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment FORCE ROW LEVEL SECURITY;
ALTER TABLE subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription FORCE ROW LEVEL SECURITY;
ALTER TABLE slug_reservation ENABLE ROW LEVEL SECURITY;
ALTER TABLE slug_reservation FORCE ROW LEVEL SECURITY;
