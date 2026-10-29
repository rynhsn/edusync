-- Peran aplikasi. Hanya untuk pengembangan lokal; produksi memakai kata sandi rahasia.
-- edusync_app    : dipakai request tenant. TIDAK boleh melewati RLS.
-- edusync_platform: dipakai konsol platform dan webhook. Melewati RLS, pemakaiannya sengaja sempit.
CREATE ROLE edusync_app LOGIN PASSWORD 'edusync_app_dev' NOSUPERUSER NOBYPASSRLS;
CREATE ROLE edusync_platform LOGIN PASSWORD 'edusync_platform_dev' NOSUPERUSER BYPASSRLS;
GRANT CONNECT ON DATABASE edusync TO edusync_app, edusync_platform;
ALTER DEFAULT PRIVILEGES FOR ROLE edusync IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO edusync_app, edusync_platform;
ALTER DEFAULT PRIVILEGES FOR ROLE edusync IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO edusync_app, edusync_platform;
GRANT USAGE ON SCHEMA public TO edusync_app, edusync_platform;
