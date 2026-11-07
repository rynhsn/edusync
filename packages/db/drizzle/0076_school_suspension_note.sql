-- Alasan dan waktu penangguhan sekolah, supaya tampil di panel sekolah, portal pemilik, dan konsol platform.
-- Sebelumnya teks alasan staf hanya ada di audit_log.details. Kolom boleh kosong (sekolah aktif / data lama).
ALTER TABLE "school" ADD COLUMN "suspended_note" text;
--> statement-breakpoint
ALTER TABLE "school" ADD COLUMN "suspended_at" timestamp with time zone;
--> statement-breakpoint
-- Isi awal untuk sekolah yang sudah ditangguhkan dari catatan audit terbaru. Dijalankan sebagai pemilik tabel,
-- jadi RLS dilepas sebentar (FORCE) lalu dipulihkan.
ALTER TABLE school NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_log NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
UPDATE school s
SET suspended_at = a.created_at,
    suspended_note = CASE WHEN s.suspended_reason = 'staff' THEN left(a.details ->> 'reason', 300) ELSE NULL END
FROM (
  SELECT DISTINCT ON (sc.id) sc.id AS school_id, al.created_at, al.details
  FROM school sc
  JOIN audit_log al
    ON (al.action = 'school.suspended' AND al.school_id = sc.id AND sc.suspended_reason = 'staff')
    OR (al.action = 'subscription.suspended' AND al.entity_id = sc.foundation_id::text AND sc.suspended_reason = 'billing')
  WHERE sc.status = 'suspended'
  ORDER BY sc.id, al.created_at DESC
) a
WHERE s.id = a.school_id;
--> statement-breakpoint
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE school FORCE ROW LEVEL SECURITY;
