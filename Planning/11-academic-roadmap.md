# Roadmap penyesuaian akademik (v1.1 sampai v1.6)

Turunan dari [audit akademik](../docs/AUDIT-AKADEMIK.md). Dokumen ini hanya rencana kerja; kode belum disentuh.
Status: **menunggu persetujuan**. Disusun 11 Nov 2026 dari v1.0.0.

## Prinsip

1. Aditif: tanpa DROP atau perubahan tipe kolom yang memutus kontrak; kolom baru nullable atau berdefault = perilaku sekarang.
2. Sekolah yang tidak memakai fitur baru tidak merasakan perubahan (KKTP kosong → KKM; tanpa TP → deskripsi dari predikat).
3. Satu fase = satu rilis MINOR, bisa diuji dan dibatalkan sendiri (rollback lewat tag).
4. Tabel tenant baru: `school_id` + RLS ENABLE/FORCE + policy standar, didaftarkan di `tenant-isolation.test.ts`, FK komposit `(school_id, id)`.
5. Setiap endpoint baru masuk OpenAPI; setiap fitur baru punya halaman dokumentasi dalam aplikasi (id/en/su) dan entri CHANGELOG.
6. Tes wajib hijau sebelum tag: `grading`, `report-card`, `schedule`, `pkl`, `rbac-matrix`, `tenant-isolation`, ditambah tes fase itu.
7. Satu unit sekolah = satu jenjang; lembaga boleh punya beberapa unit.

## Gambaran

| Rilis | Fase | Hasil bagi sekolah | Ukuran | Bergantung pada |
|---|---|---|---|---|
| v1.1.0 | 0. Profil jenjang | Unit memilih jenjang; fase dan fitur menyesuaikan | S | tidak ada |
| v1.2.0 | 1. Integritas rapor dan jadwal | Rapor final tidak bisa berbeda diam-diam; jadwal per semester | M | tidak ada (paralel dengan 0) |
| v1.3.0 | 2. Rollover dan kurikulum | Naik kelas satu klik; mapel punya kelompok dan JP; CP/TP/ATP; KKTP | L | 0 |
| v1.4.0 | 3. Pembelajaran dan asesmen | Jurnal mengajar, remedial, ketercapaian TP, narasi rapor | L | 2 |
| v1.5.0 | 4. Kokurikuler dan madrasah | Profil lulusan; mapel PAI/Arab; NSM | M | 0, 1 |
| v1.6.0 | 5. SMK penuh | Bidang/program/konsentrasi, PKL di rapor, UKK | M | 0, 1, 2 |

Urutan yang disarankan: **0 dan 1 berjalan bersama, lalu 2, 3, 4, 5.** Fase 1 dan rollover (fase 2) paling mendesak: yang pertama
melindungi data, yang kedua dibutuhkan sebelum akhir tahun ajaran (Juni 2027).

---

## Fase 0: profil jenjang per unit (v1.1.0)

**Tujuan:** setiap unit tahu jenjangnya; fase, model pengajar, dan fitur kejuruan diturunkan darinya.

- [ ] Migrasi: tabel acuan `ref_education_profile` (kunci `sd`, `mi`, `smp`, `mts`, `sma`, `ma`, `smk`, `mak`; berisi pemetaan tingkat → fase, model pengajar, kemampuan, kerangka profil, otoritas, `template_key` rapor).
- [ ] Migrasi: `school.education_profile` (nullable); isi sekolah yang sudah ada (SMK Miftahul Huda → `smk`, SMP IT → `smp`).
- [ ] Pendaftaran unit: wajib memilih jenjang (ikut aturan NPSN wajib); platform dapat mengubahnya selama belum ada tahun ajaran dan nilai.
- [ ] `school_level` bawaan dan `phase` diturunkan dari profil (menggantikan tombol "isi bawaan" per jenjang).
- [ ] Fitur kejuruan (PKL, UKK, program) tampil berdasarkan **kemampuan profil**, bukan nama jenjang.
- [ ] Pintasan guru kelas: "tugaskan guru ini ke semua mapel kelas" di penugasan mengajar.
- [ ] API: `GET /v1/reference/education-profiles`; OpenAPI; dokumentasi dalam aplikasi.

**Selesai bila:** sekolah lama berjalan persis seperti sebelumnya; unit baru wajib punya jenjang; menu kejuruan hanya muncul di profil kejuruan.
**Tes:** profil bawaan per jenjang, perubahan jenjang ditolak bila sudah ada data, `tenant-isolation`.
**Risiko:** rendah. Cek dulu apakah layar pendaftaran unit sudah menanyakan jenjang (belum diverifikasi).
**Keputusan:** daftar profil awal (usul: delapan di atas).

## Fase 1: integritas rapor, arsip, jadwal (v1.2.0)

**Tujuan:** tutup celah data paling berbahaya.

- [ ] `report-lock-lib.ts`: `assertClassReportNotFinal`, `assertClassesReportNotFinal`, `assertStudentsReportNotFinal` (409 `report_final`, menyebut kelas/siswa yang terkunci).
- [ ] Pasang di semua jalur mutasi: penilaian dan skor, komponen dan KKM, dorong nilai ujian, skor lembar jawaban ujian, penilaian ekskul, pengaturan rapor, absensi harian (koreksi manual), nilai PKL (termasuk tautan industri), penugasan guru dan wali kelas, pindah kelas siswa.
- [ ] `report_card.schema_version` (default 1) dan `template_key`; render menurut versi.
- [ ] Tabel `report_card_snapshot` (riwayat): diisi saat finalisasi dan buka kembali; buka kembali tidak lagi menghapus riwayat.
- [ ] `schedule_entry.semester_id` (nullable) dan unique parsial per tahun atau per semester; validasi campuran tahunan/semester.
- [ ] `teaching_assignment_history` dan `homeroom_assignment_history`, diisi otomatis dari route yang ada.
- [ ] Ganti `WIDE_ROLES` (cocok nama peran) dengan izin eksplisit.
- [ ] Perbarui tes `report-card.test.ts:753` (kini menegaskan edit setelah final diterima).

**Selesai bila:** semua jalur di atas ditolak `409 report_final` saat final dan diterima lagi setelah buka kembali; jadwal Genap berbeda dari Ganjil bisa disimpan; riwayat snapshot tersedia.
**Tes:** suite baru `report-lock.test.ts` (setiap jalur, final dan reopen), `schedule.test.ts`, `report-card.test.ts`, `rbac-matrix`.
**Risiko:** perilaku berubah (edit setelah final tidak diterima lagi) → tulis jelas di CHANGELOG; penggantian dua constraint jadwal → uji bentrok.
**Keputusan yang perlu dijawab (usulan bawaan bila tidak ada jawaban):**
1. Penguncian per kelas (*usulan: ya*, sesuai finalisasi sekarang) atau per siswa.
2. Koreksi absensi harian setelah final: ditolak (*usulan*) atau diizinkan.
3. Portal industri PKL saat rapor final: baca-saja (*usulan*) atau tetap menerima tanpa mengubah snapshot.

## Fase 2: rollover dan kurikulum (v1.3.0)

**Tujuan:** pekerjaan akhir tahun satu klik, dan struktur kurikulum yang benar.

*2A. Rollover dan kenaikan kelas*
- [ ] Wizard salin tahun ajaran: kelas, penugasan guru, dan kalender ke tahun baru; idempoten dan transaksional.
- [ ] Keputusan naik/tinggal/lulus per siswa (`report_card.decision` atau tabel `promotion_decision`), diisi sebelum finalisasi semester genap.
- [ ] Penempatan siswa ke kelas tahun baru dari keputusan; tingkat akhir menjadi `graduated`.
- [ ] Izin `promotion:manage`.

*2B. Struktur mata pelajaran dan kurikulum*
- [ ] `subject`: `ref_subject_id`, `subject_group`, `is_local_content`, `sort_order`, `active`.
- [ ] `curriculum_subject_allocation` (JP mingguan/tahunan per tahun, tingkat, program, mapel); `school_curriculum_version`.
- [ ] Adopsi kurikulum jadi halaman **Kurikulum** (bukan hanya dialog di Mapel); selisih "mapel baru" memakai `ref_subject_id`, bukan hanya kode.
- [ ] `learning_outcome` (CP), `learning_objective` (TP), `learning_flow` dan `learning_flow_item` (ATP berversi); relasi TP lewat tabel, bukan jsonb. Salinan dari acuan platform bersifat *copy-on-adopt*.
- [ ] `achievement_criteria` + `achievement_rubric_level` (KKTP: numerik desimal, interval, deskriptor, rubrik) dan pemecah berjenjang dengan fallback ke `grading_setting.kkm`; `grading_setting.calculation_mode` berdefault rumus sekarang.
- [ ] Izin `curriculum:manage`, `teaching_plan:write`.

**Selesai bila:** sekolah menyalin satu tahun ajaran ke berikutnya tanpa mengetik ulang; sekolah yang tidak memakai KKTP/TP menghasilkan angka dan rapor identik dengan sebelumnya.
**Tes:** rollover (idempoten, tingkat akhir), 4 mode KKTP, snapshot rapor lama tetap sama, isolasi tenant tabel baru.
**Risiko:** performa pemecah KKTP → muat peta kriteria satu kelas sekaligus; kompleksitas rollover → mulai dari kelas dan penugasan saja.
**Keputusan:** *team teaching* (lebih dari satu guru aktif per mapel-kelas) atau satu guru dengan riwayat (*usulan: satu guru + riwayat*).

## Fase 3: pembelajaran dan asesmen (v1.4.0)

- [ ] `lesson_journal` (terikat jadwal dan tanggal; panel di layar **Absensi per jam**) dan `teaching_module` fleksibel (berkas, tautan, ringkasan).
- [ ] `assessment` dan `grade_component`: `category` (diagnostik/formatif/sumatif), `technique`, `include_in_final`; formatif tidak mengubah nilai akhir.
- [ ] `score_remedial_attempt`, kolom nilai asli dan nilai remedial pada `score`, kebijakan nilai remedial per sekolah (`remedial_policy`).
- [ ] `student_objective_achievement` dan `report_subject_narrative`: narasi dari TP tertinggi/terendah, dapat diubah guru; tanpa TP fallback ke `desc_a..d`.
- [ ] Tab **Remedial dan pengayaan** dan **Ketercapaian TP** di halaman Penilaian; **Perangkat ajar saya** untuk guru.

**Selesai bila:** rapor sekolah tanpa TP identik dengan v1 (uji snapshot); formatif tidak memengaruhi nilai akhir; riwayat remedial tersimpan.
**Risiko:** agregasi TP saat render rapor satu kelas → indeks komposit `(school_id, semester_id, class_id, subject_id)` dan query batch.
**Keputusan:** kebijakan remedial bawaan (*usulan: batas nilai = KKTP*).

## Fase 4: kokurikuler dan madrasah (v1.5.0)

- [ ] `ref_profile_framework` (kerangka dan dimensinya; **berversi dan dapat dipilih**): kerangka 8 dimensi profil lulusan (2025) untuk sekolah umum, kerangka madrasah terpisah. Isi kerangka diverifikasi ke regulasi resmi dulu.
- [ ] Jenis kegiatan per sekolah, program per semester, dimensi terpilih, rubrik, kelompok dan fasilitator, catatan per siswa per dimensi, bukti karya.
- [ ] Bagian Kokurikuler di rapor (`schema_version` 2) dan kunci final.
- [ ] Seed acuan: SD, kelanjutan `kma` untuk MI dan MA, mapel rumpun PAI dan Bahasa Arab; kolom NSM (dan petunjuk EMIS).
- [ ] Judul PDF rapor masuk terjemahan.
- [ ] Izin `cocurricular:manage|assess`.

**Keputusan:** kokurikuler masuk modul **Nilai dan rapor** (*usulan*) atau modul sendiri; madrasah masuk di fase ini atau digeser.
**Risiko:** kebijakan dan kerangka profil dapat berubah → disimpan sebagai data acuan berversi, bukan kode.

## Fase 5: SMK penuh (v1.6.0)

- [ ] `vocational_field/program/concentration` dan `program.concentration_id`; tab Bidang → Program → Konsentrasi di halaman Kelas/Program (hanya profil kejuruan). `class_room.program_id`, kalender, SPMB, PKL tetap berfungsi.
- [ ] `pkl_period.semester_id` dan bobot nilai sekolah:industri; ringkasan PKL di rapor SMK; nomor sertifikat PKL tercatat.
- [ ] `ukk_event` dan `ukk_result` (skema, penguji internal/eksternal, nilai praktik/teori, predikat, nomor sertifikat) di bawah modul `internship`; izin `ukk:manage`.
- [ ] Pembersihan menu: item untuk `/calendar/year` dan `/pkl/report`, pengelompokan pengaturan akademik.

**Selesai bila:** semua fitur PKL yang ada (termasuk tautan industri) lolos tanpa regresi; SMK bisa menyelenggarakan dan menilai UKK per konsentrasi.
**Tes:** `pkl.test.ts` utuh, `ukk.test.ts`, rapor SMK versi 2.

---

## Pekerjaan lintas fase

- **Dokumentasi:** tiap fase menambah halaman bantuan (id/en/su) dan memperbarui `docs/FITUR-EDUSYNC.md`.
- **Tes yang masih kurang (dari audit):** tes isolasi per route untuk tahfidz, ekskul, PKL; tes hak kontekstual (guru, pembina, pembimbing) karena `rbac-matrix` hanya menguji gerbang izin dan modul.
- **Rilis:** `pnpm release x.y.z`, entri CHANGELOG, push tag; pastikan CI hijau lebih dulu. Rollback: Run workflow Deploy dengan tag lama.
- **Migrasi:** `when` jurnal tidak boleh lebih rendah dari yang sudah diterapkan; peran DB `edusync_app`/`edusync_platform` tidak diubah.
- **Verifikasi regulasi:** isi kerangka profil, struktur mapel Kurikulum Merdeka/2025, dan kurikulum madrasah dicek ke sumber resmi sebelum fase 2 dan 4 (belum dilakukan).

## Yang sengaja tidak dikerjakan

- FK komposit pada tabel lama (biaya tinggi, risiko migrasi); hanya untuk tabel baru.
- Trigger database untuk penjaga rapor final (jaring pengaman opsional; pertimbangkan setelah fase 1 stabil).
- Satu unit dengan beberapa jenjang (diputuskan: satu unit satu jenjang).
- PAUD/TK, SLB, Paket A/B/C, pondok salaf: di luar cakupan awal.
- Ekspor/impor Dapodik dan EMIS: menyusul setelah fase 4.
