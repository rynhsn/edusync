-- Bendahara memakai daftar kelas untuk saringan dan penerbitan tagihan per kelas (halaman keuangan memanggil /v1/classes).
-- Hanya ditambah, hanya peran bawaan di sekolah yang sudah ada.
INSERT INTO role_permission (role_id, school_id, permission)
SELECT r.id, r.school_id, 'class:read'
FROM role r
WHERE r.is_system AND r.key = 'treasurer'
ON CONFLICT DO NOTHING;
