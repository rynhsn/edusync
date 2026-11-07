-- Isi QR / kode batang pada templat kartu dibatasi: kartu siswa hanya qrCode (kode identitas siswa), kartu ujian
-- hanya participantNo. NIS dan kode RFID tidak boleh lagi menjadi isi kode. Templat lama dialihkan; urutan elemen
-- dan semua kunci lain dipertahankan. Dijalankan sebagai pemilik tabel, jadi RLS dilepas sebentar (FORCE) lalu dipulihkan.
ALTER TABLE card_template NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Kartu siswa: QR berisi NIS/RFID dialihkan ke qrCode. Kode batang berisi NIS/RFID DIHAPUS, bukan dialihkan: kode
-- identitas ('ES1.' + 20 karakter) butuh sekitar 55 mm lebar agar terbaca, dan kode batang NIS lama jauh lebih sempit.
UPDATE card_template
SET elements = (
  SELECT COALESCE(
    jsonb_agg(
      CASE
        WHEN e ->> 'type' = 'qr' AND e ->> 'field' IN ('nis', 'rfidCode')
          THEN jsonb_set(e, '{field}', '"qrCode"'::jsonb)
        ELSE e
      END
      ORDER BY ord
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(card_template.elements) WITH ORDINALITY AS t(e, ord)
  WHERE NOT (e ->> 'type' = 'barcode' AND e ->> 'field' IN ('nis', 'rfidCode'))
)
WHERE kind = 'student'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(card_template.elements) AS x
    WHERE x ->> 'type' IN ('qr', 'barcode') AND x ->> 'field' IN ('nis', 'rfidCode')
  );
--> statement-breakpoint
UPDATE card_template
SET elements = (
  SELECT COALESCE(
    jsonb_agg(
      CASE
        WHEN e ->> 'type' IN ('qr', 'barcode') AND e ->> 'field' IS DISTINCT FROM 'participantNo'
          THEN jsonb_set(e, '{field}', '"participantNo"'::jsonb)
        ELSE e
      END
      ORDER BY ord
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(card_template.elements) WITH ORDINALITY AS t(e, ord)
)
WHERE kind = 'exam'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(card_template.elements) AS x
    WHERE x ->> 'type' IN ('qr', 'barcode') AND x ->> 'field' IS DISTINCT FROM 'participantNo'
  );
--> statement-breakpoint
ALTER TABLE card_template FORCE ROW LEVEL SECURITY;
