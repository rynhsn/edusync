-- Arsip rapor terbit tidak boleh hilang sebagai efek samping (rancangan pembekuan konfigurasi nilai, bagian 9, langkah L10).
-- Tiga FK komposit `report_card_snapshot_{semester,student,class}_fk` (0087) diganti dari ON DELETE CASCADE menjadi NO ACTION:
-- menghapus kelas, siswa, atau semester yang masih punya potret rapor ditolak dengan kode Postgres 23503, yang handler API
-- sudah petakan ke 409 `in_use` (hapus kelas: routes/academic-structure.ts; hapus semester: routes/semesters.ts).
-- NO ACTION (bukan RESTRICT) dipilih seperti 0093 agar memakai 23503 yang sama dengan FK lain. Tidak ada data yang disentuh.
--
-- Mengapa perlu: `report_card.class_id` ditimpa saat catatan disimpan atau rapor difinalkan ulang setelah siswa pindah kelas,
-- sehingga potret lama dapat menunjuk kelas yang tidak lagi ditahan FK mana pun (report_card, enrollment); dengan CASCADE kelas
-- itu dapat dihapus dan riwayat rapor terbitnya ikut lenyap.
--
-- Pemeriksaan FK CASCADE lain ke `report_card` atau `report_card_snapshot`: tidak ada. `report_card` hanya dirujuk oleh dirinya
-- sendiri sebagai anak (FK ke school/semester/class_room/student, semuanya NO ACTION) dan tidak ada tabel yang merujuk
-- `report_card` atau `report_card_snapshot`. Sisa CASCADE dari sisi snapshot: tidak ada (FK `school_id` ke school NO ACTION).
--
-- CATATAN JURNAL: `when` manual lebih besar dari 0094 (1796347800000), lihat catatan di 0093.
ALTER TABLE "report_card_snapshot" DROP CONSTRAINT "report_card_snapshot_semester_fk";
--> statement-breakpoint
ALTER TABLE "report_card_snapshot" ADD CONSTRAINT "report_card_snapshot_semester_fk" FOREIGN KEY ("school_id", "semester_id") REFERENCES "semester"("school_id", "id") ON DELETE NO ACTION;
--> statement-breakpoint
ALTER TABLE "report_card_snapshot" DROP CONSTRAINT "report_card_snapshot_student_fk";
--> statement-breakpoint
ALTER TABLE "report_card_snapshot" ADD CONSTRAINT "report_card_snapshot_student_fk" FOREIGN KEY ("school_id", "student_id") REFERENCES "student"("school_id", "id") ON DELETE NO ACTION;
--> statement-breakpoint
ALTER TABLE "report_card_snapshot" DROP CONSTRAINT "report_card_snapshot_class_fk";
--> statement-breakpoint
ALTER TABLE "report_card_snapshot" ADD CONSTRAINT "report_card_snapshot_class_fk" FOREIGN KEY ("school_id", "class_id") REFERENCES "class_room"("school_id", "id") ON DELETE NO ACTION;
