-- Saklar global pesan (platform_setting 'messaging') harus terbaca saat membuat pesan di transaksi tenant, padahal
-- peran aplikasi tidak boleh membaca platform_setting (memuat kunci pembayaran terenkripsi). Jalan keluarnya fungsi
-- SECURITY DEFINER yang hanya membuka baris 'messaging', dengan kebijakan RLS sempit untuk pemilik fungsi.
CREATE POLICY messaging_flag_read ON platform_setting FOR SELECT TO CURRENT_USER
  USING (key = 'messaging');
--> statement-breakpoint
CREATE FUNCTION messaging_platform_config() RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT value FROM platform_setting WHERE key = 'messaging'
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION messaging_platform_config() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION messaging_platform_config() TO edusync_app, edusync_platform;
