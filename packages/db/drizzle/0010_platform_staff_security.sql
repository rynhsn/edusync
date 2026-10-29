-- Staf platform hanya dibaca dan ditulis lewat peran platform. Peran aplikasi tidak boleh melihat
-- siapa saja stafnya, apalagi menambah staf.
REVOKE ALL ON platform_staff FROM edusync_app;
--> statement-breakpoint
ALTER TABLE platform_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_staff FORCE ROW LEVEL SECURITY;
