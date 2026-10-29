-- Pemilik yayasan hanya dibaca dan ditulis lewat peran platform; peran aplikasi tidak boleh melihat atau mengubahnya.
REVOKE ALL ON foundation_owner FROM edusync_app;
--> statement-breakpoint
ALTER TABLE foundation_owner ENABLE ROW LEVEL SECURITY;
ALTER TABLE foundation_owner FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Yayasan yang sudah aktif: pemiliknya adalah pengguna yang mendaftarkannya.
INSERT INTO foundation_owner (foundation_id, user_id)
SELECT foundation_id, user_id FROM registration WHERE foundation_id IS NOT NULL
ON CONFLICT DO NOTHING;
