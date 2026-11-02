-- Modul 'fees' (SPP dan tagihan) dan 'assessments' (Penilaian non-akademik) dijual di katalog tetapi tidak
-- mengaktifkan fitur apa pun: SPP dan tagihan sudah dilayani modul 'finance', dan tidak ada halaman penilaian
-- non-akademik. Dinonaktifkan agar tidak dibeli lagi; langganan dan hak akses yang sudah ada tidak berubah
-- (penagihan tetap membaca katalog lengkap untuk langganan berjalan). Staf platform bisa mengaktifkannya kembali.
UPDATE catalog_item SET active = false WHERE kind = 'module' AND key IN ('fees', 'assessments');
--> statement-breakpoint
-- Paket siap pilih tidak boleh memuat modul yang tidak bisa dibeli (penawaran harga akan menolaknya).
UPDATE plan_preset SET modules = COALESCE(
  (SELECT jsonb_agg(m) FROM jsonb_array_elements(modules) AS m WHERE (m #>> '{}') NOT IN ('fees', 'assessments')),
  '[]'::jsonb
);
