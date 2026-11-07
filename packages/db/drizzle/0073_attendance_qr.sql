-- Kode QR absensi cadangan (kartu siswa dicetak dengan QR, dipindai guru saat kiosk RFID mati).
-- Disimpan sebagai attendance_card(kind = 'qr'); kolom kind berupa teks sehingga tidak perlu mengubah tipe.
-- Setiap siswa paling banyak punya satu kode QR (dibuat ulang dengan menghapus yang lama lalu memasukkan yang baru).
CREATE UNIQUE INDEX "attendance_card_qr_student_uq" ON "attendance_card" USING btree ("student_id") WHERE "kind" = 'qr';
