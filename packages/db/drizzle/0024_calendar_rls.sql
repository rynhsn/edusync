-- Acara kalender terikat sekolah dan tunduk pada RLS.
ALTER TABLE calendar_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_event FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON calendar_event
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
