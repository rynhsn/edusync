-- Header dan footer pesan WhatsApp per sekolah. HANYA DDL, aditif: dua kolom nullable di msg_setting (RLS sudah ada dari 0042).
-- Dipasang saat kirim oleh worker; msg_message.body tetap isi asli. null = tanpa header/footer (perilaku lama).
-- CATATAN JURNAL: `when` manual lebih besar dari 0113 (1798075800000): 0114 = 1798162200000.
ALTER TABLE "msg_setting" ADD COLUMN "header_text" text;
--> statement-breakpoint
ALTER TABLE "msg_setting" ADD COLUMN "footer_text" text;
