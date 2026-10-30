ALTER TABLE "attendance_policy" DROP COLUMN "notify_parents";--> statement-breakpoint
-- Izin baru untuk peran bawaan di sekolah yang sudah ada (hanya ditambah, hanya peran bawaan).
INSERT INTO role_permission (role_id, school_id, permission)
SELECT r.id, r.school_id, g.permission
FROM role r
JOIN (VALUES
  ('school_admin', 'message:read'), ('school_admin', 'message:manage'),
  ('principal', 'message:read'),
  ('operator', 'message:read'), ('operator', 'message:manage')
) AS g(role_key, permission) ON g.role_key = r.key
WHERE r.is_system
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Item katalog modul `messaging` (harga awal; operator platform boleh mengubahnya). Baris yang sudah ada tidak ditimpa.
INSERT INTO catalog_item (kind, key, name, price_monthly, sort)
VALUES ('module', 'messaging', 'Notifikasi WhatsApp', 40000, 24)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Paket Pro ikut memuat notifikasi WhatsApp.
UPDATE plan_preset SET modules = modules || '["messaging"]'::jsonb
WHERE key = 'pro' AND NOT (modules ? 'messaging');
