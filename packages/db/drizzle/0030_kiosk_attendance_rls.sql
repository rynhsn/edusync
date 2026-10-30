-- Absensi gerbang, piket, dan absensi per jam: semua terikat sekolah dan tunduk pada RLS.
ALTER TABLE attendance_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_policy FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON attendance_policy
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE attendance_device ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_device FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON attendance_device
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE attendance_card ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_card FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON attendance_card
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE tap_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE tap_event FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tap_event
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE daily_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_attendance FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON daily_attendance
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE duty_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE duty_roster FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON duty_roster
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
ALTER TABLE lesson_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_attendance FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON lesson_attendance
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
-- Catatan tap tidak boleh diubah atau dihapus oleh aplikasi. Peran platform tetap boleh (penghapusan data sekolah).
CREATE FUNCTION forbid_tap_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user = 'edusync_app' THEN
    RAISE EXCEPTION 'tap_event tidak boleh diubah atau dihapus';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER tap_event_immutable BEFORE UPDATE OR DELETE ON tap_event
  FOR EACH ROW EXECUTE FUNCTION forbid_tap_event_mutation();
--> statement-breakpoint
-- Izin baru untuk peran bawaan di sekolah yang sudah ada.
INSERT INTO role_permission (role_id, school_id, permission)
SELECT r.id, r.school_id, g.permission
FROM role r
JOIN (VALUES
  ('school_admin', 'attendance:configure'),
  ('operator', 'attendance:configure')
) AS g(role_key, permission) ON g.role_key = r.key
WHERE r.is_system
ON CONFLICT DO NOTHING;
