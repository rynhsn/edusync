-- Outbox: tenant hanya dapat menulis dan membaca barisnya sendiri. Worker memakai peran platform
-- (melewati RLS) untuk memindahkan semua baris ke antrean. Baris tanpa school_id hanya dibuat peran platform.
ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON outbox
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
