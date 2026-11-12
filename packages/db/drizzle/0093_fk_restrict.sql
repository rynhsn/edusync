-- Review keamanan fase 2A-2C: tiga FK komposit yang CASCADE diganti NO ACTION (menolak penghapusan induk) supaya menghapus jurusan, mata pelajaran, atau
-- kelas tidak diam-diam menghapus data akademik yang merujuknya. NO ACTION (bukan RESTRICT) dipilih agar pelanggaran memakai kode
-- Postgres 23503 yang sudah dipetakan handler API ke 409 `in_use`; RESTRICT memakai 23001. Hanya aturan FK yang berubah; tidak ada data disentuh.
--   * curriculum_allocation_program_fk / curriculum_allocation_subject_fk (0089): alokasi JP kurikulum ikut terhapus saat
--     jurusan atau mapelnya dihapus. Sekarang penghapusan ditolak (API: 409 `in_use`); hapus atau pindahkan alokasinya dulu.
--   * promotion_decision_from_class_fk (0088): keputusan kenaikan kelas ikut terhapus saat kelas asalnya dihapus.
-- Tidak diubah (dilaporkan saja, sengaja tetap CASCADE karena induknya jarang dihapus atau anak bersifat turunan):
--   * promotion_decision_year_fk, curriculum_allocation_year_fk, school_curriculum_version_year_fk, learning_flow_year_fk:
--     menghapus TAHUN AJARAN menghapus keputusan, alokasi, versi kurikulum, dan ATP (beserta item) tahun itu.
--   * promotion_decision_student_fk, report_card_snapshot_{semester,student,class}_fk (0087): menghapus siswa, semester,
--     atau kelas menghapus potret rapor finalnya. Kelas dan siswa dengan enrollment tertahan FK enrollment.
--   * teaching_assignment_history_{class,subject}_fk, homeroom_assignment_history_class_fk (0087): riwayat penugasan ikut terhapus
--     bersama kelas/mapelnya (penugasan aktif sendiri menahan penghapusan).
--   * learning_flow_item_flow_fk, achievement_rubric_level_criteria_fk: anak murni milik induk.
--
-- CATATAN JURNAL: kolom `when` di meta/_journal.json untuk migrasi 0086 dan seterusnya berada di masa depan (tanggal sistem saat ditulis
-- 2026-11-12, `when` 0086 = 2026-11-26, naik +1 hari per migrasi). drizzle-orm hanya menjalankan migrasi yang `when`-nya LEBIH BESAR dari `created_at` migrasi terakhir yang
-- tercatat, jadi migrasi baru WAJIB memakai `when` manual yang lebih tinggi dari entri terakhir (0093 = 1796261400000;
-- berikutnya mis. +86400000), bukan waktu sekarang, kalau tidak migrasi itu dilewati tanpa kesalahan.
ALTER TABLE "curriculum_subject_allocation" DROP CONSTRAINT "curriculum_allocation_program_fk";
--> statement-breakpoint
ALTER TABLE "curriculum_subject_allocation" ADD CONSTRAINT "curriculum_allocation_program_fk" FOREIGN KEY ("school_id", "program_id") REFERENCES "program"("school_id", "id") ON DELETE NO ACTION;
--> statement-breakpoint
ALTER TABLE "curriculum_subject_allocation" DROP CONSTRAINT "curriculum_allocation_subject_fk";
--> statement-breakpoint
ALTER TABLE "curriculum_subject_allocation" ADD CONSTRAINT "curriculum_allocation_subject_fk" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subject"("school_id", "id") ON DELETE NO ACTION;
--> statement-breakpoint
ALTER TABLE "promotion_decision" DROP CONSTRAINT "promotion_decision_from_class_fk";
--> statement-breakpoint
ALTER TABLE "promotion_decision" ADD CONSTRAINT "promotion_decision_from_class_fk" FOREIGN KEY ("school_id", "from_class_id") REFERENCES "class_room"("school_id", "id") ON DELETE NO ACTION;
