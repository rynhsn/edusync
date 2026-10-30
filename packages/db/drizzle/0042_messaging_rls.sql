-- Pesan ke wali murid: semua tabel terikat sekolah dan tunduk pada RLS.
ALTER TABLE msg_setting ENABLE ROW LEVEL SECURITY;
ALTER TABLE msg_setting FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON msg_setting
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE msg_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE msg_template FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON msg_template
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE wa_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_account FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON wa_account
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE msg_message ENABLE ROW LEVEL SECURITY;
ALTER TABLE msg_message FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON msg_message
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
