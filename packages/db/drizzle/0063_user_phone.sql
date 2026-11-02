-- Nomor telepon/WA pengguna (opsional), disimpan sebagai digit berawalan 62 seperti nomor wali.
-- Belum dipakai untuk masuk; hanya agar admin dan sistem punya cara menghubungi orangnya.
ALTER TABLE "user" ADD COLUMN "phone" text;
