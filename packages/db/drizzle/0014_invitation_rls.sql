-- Undangan terikat pada sekolah. Pengelola anggota memakai peran aplikasi (tunduk pada RLS) untuk membuat,
-- melihat, dan mencabut. Pencarian lewat token (sebelum ada konteks tenant) dan penerimaan undangan memakai
-- peran platform.
ALTER TABLE invitation ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitation FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invitation
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
