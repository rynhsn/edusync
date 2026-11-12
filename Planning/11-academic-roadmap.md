# Roadmap penyesuaian akademik (v1.1 sampai v1.6)

Turunan dari [audit akademik](../docs/AUDIT-AKADEMIK.md). Dokumen ini hanya rencana kerja; kode belum disentuh.
Status: fase 0, 1, 2A, dan 2B sudah dikerjakan (lihat "Status pelaksanaan" dan "Revisi hasil verifikasi regulasi" di bawah). Disusun 11 Nov 2026
dari v1.0.0; direvisi 12 Nov 2026 setelah verifikasi regulasi dan uji peramban.

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

## Status pelaksanaan (12 Nov 2026)

| Fase | Status | Rujukan |
|---|---|---|
| 0. Profil jenjang | Selesai, dirilis v1.1.0 | `ec17cd5`, `1c20196` |
| 1. Integritas rapor dan jadwal | Selesai, dirilis v1.1.0 | `443b281` |
| 2A. Rollover dan kenaikan kelas | Selesai, belum dirilis | `34148b9`, migrasi 0088 |
| 2B. Struktur mapel, CP/TP/ATP, KKTP | Selesai, belum dirilis | `7477227`, migrasi 0089-0091 |
| 2C. Koreksi hasil verifikasi regulasi (K1-K5, K7, C5) | Selesai, belum dirilis | migrasi 0092; K6 (istilah) hanya sebagian: "KKM" dan "KKTP" dieja lengkap, "siswa" belum diganti "murid" |
| 2D. Pembekuan konfigurasi nilai per semester | Selesai, belum dirilis | migrasi 0094-0095; rancangan di `docs/rancangan-pembekuan-konfigurasi-nilai.md` |
| 3-5 | Belum dimulai | lihat revisi di bawah |

Tindak lanjut yang tercatat dari 2D: (1) lulusan (`student.status = graduated`) keluar dari roster rapor draf, rekap, dan portal
tahun terakhirnya, sehingga rapor final mereka tidak tampil di rekap kelas; perlu keputusan apakah roster tahun sumber memuat siswa
lulus; (2) pembatasan penulisan CP/TP guru per tahun ajaran; (3) perluasan izin rollover; (4) harga katalog di DB dev tidak sama
dengan yang diasumsikan lima tes billing.

Sisa 2C yang belum dikerjakan: tingkat akhir belum diturunkan otomatis dari lama studi (hanya dari tingkat akhir yang diisi);
seed profil madrasah dan SMK menunggu pembacaan teks resmi.

Teruji di peramban (12 Nov): wizard rollover sampai selesai (idempoten), portal wali dengan KKM per mapel, pratinjau dan PDF rapor,
penolakan `report_final` pada KKTP, peran guru dan baca-saja, bahasa Sunda dan Inggris. Belum teruji: tablet 768 px secara penuh,
`levels_not_configured`, siswa tanpa kelas tujuan (`unplaced`), peringatan nama kelas, `too_many_items`.

## Revisi hasil verifikasi regulasi (12 Nov 2026)

Dasar: [regulasi-umum.md](../docs/regulasi-umum.md) dan [regulasi-madrasah-smk.md](../docs/regulasi-madrasah-smk.md). Kedua dokumen memuat tabel
klaim dengan status sumber (resmi, sekunder, belum terverifikasi). Ringkasnya: **arah roadmap sesuai, tetapi ada koreksi pada hal yang
sudah terlanjur dibuat (2A, 2B) dan celah alur akademik yang belum ada.** Batasan: beberapa teks resmi tidak terbaca (Lampiran II
Permendikdasmen 13/2025, KMA 1503/2025, CP BSKAP 046/H/KR/2025), jadi angka JP dan struktur madrasah/SMK terbaru wajib dicek ulang
sebelum dijadikan data acuan.

**Yang dibenarkan:** fase A-F dan pemetaan tingkat; KKTP menggantikan KKM (KKM tidak lagi ada di panduan resmi 2025, KKM sekolah kini hanya
fallback); CP/TP/ATP dibuat guru (tidak ada acuan nasional wajib untuk TP/ATP); satu unit satu jenjang; aditif dan berversi; delapan dimensi
profil lulusan untuk sekolah umum.

**Koreksi pada yang sudah dibuat (diusulkan sebagai fase 2C, sebelum rilis v1.2.0):**

| # | Koreksi | Alasan | Prioritas |
|---|---|---|---|
| K1 | `subject.subject_group`: hapus CHECK enum, ganti tabel acuan berversi `ref_subject_group` (kunci, label i18n, profil berlaku, urutan rapor); pisahkan kelompok struktur dari peran mapel; tambah penanda agama per agama dan pilihan | SMK resmi hanya punya kelompok Umum dan Kejuruan (Matematika, B. Inggris, Informatika, Projek IPAS ada di Kejuruan); tidak ada "dasar bidang" di Kurikulum Merdeka; madrasah butuh rumpun PAI/Arab | P0 |
| K2 | Alokasi JP: dua kolom (intrakurikuler dan kokurikuler), konfigurasi menit per JP dan minggu efektif per tingkat, PKL dalam minggu | Lampiran II 13/2025; 35/40/45 menit; 36 minggu, 32 minggu kelas akhir | P0 |
| K3 | Tingkat akhir tidak konstan: simpan lama program atau tingkat akhir pada program/kelas (SMK 3 atau 4 tahun, XII atau XIII) | SMK 4 tahun: XI-XIII Fase F | P0 |
| K4 | Wizard kenaikan kelas: jangan menyarankan "lulus" otomatis; pisahkan "selesai tingkat akhir" dari "ditetapkan lulus"; tambah status naik dengan catatan, alasan, dan catatan musyawarah | Tidak ada rumus nasional; kelulusan butuh ujian satuan pendidikan dan penetapan sekolah | P0 |
| K5 | `calculation_mode`: tiga nilai resmi (pembobotan, persentase, rata-rata), bukan satu | Panduan Pembelajaran dan Asesmen 2025 | P1 |
| K6 | Istilah di UI: murid, satuan pendidikan, kriteria ketercapaian; "KKM" hanya alias; label fallback "batas ketuntasan sekolah" | Selaras regulasi | P1 |
| K7 | Rollover: jangan menyalin tanggal kalender tanpa konfirmasi (minggu efektif dan kalender per tahun berbeda); pesan peringatan API perlu terjemahan | Kalender nasional tidak berformat tetap; temuan uji UI | P1 |

**Celah yang belum ada di roadmap:**

| # | Celah | Prioritas | Fase usulan |
|---|---|---|---|
| C1 | Pilihan mapel per murid (SMA XI-XII 4-5 pilihan dari minimal 7, agama per murid, seni/prakarya satu jenis); memengaruhi rapor, jadwal, rollover | P0 untuk SMA, P1 lainnya | 3B |
| C2 | Ujian satuan pendidikan, penetapan kelulusan, SKL, nomor ijazah | P0 | 3C |
| C3 | Mutasi murid masuk dan keluar (SPMB 3/2025 Pasal 55-58) | P0 | 3C |
| C4 | Komponen rapor yang kurang: tanggapan orang tua/wali, deskripsi kokurikuler, mode rapor deskriptif Fase A | P0 | 3 |
| C5 | Tinggal kelas administratif dengan riwayat rombel utuh (sudah didukung `retain`; perlu laporan dan riwayat) | P0 | 2C |
| C6 | Legger kelas dan berita acara musyawarah dewan pendidik | P1 | 3C |
| C7 | Ekspor minimal untuk e-Rapor/Dapodik/EMIS (rombel, mapel per kelas, nilai akhir, deskripsi); format dan skema belum terverifikasi | P1 | naik ke sekitar fase 3 |
| C8 | Guru wali dan pemisahan wali kelas dan guru BK sebagai peran | P1-P2 | 4 |
| C9 | Penilaian proses pembelajaran (refleksi guru/sejawat/kepala sekolah, minimal 1 kali per semester) | P2 | 3 |
| C10 | Beban kerja guru 24-40 jam tatap muka (dihitung dari penugasan dan jadwal) | P2 | 4 |
| C11 | Pendampingan atau peran pendamping untuk kokurikuler (team teaching hanya untuk projek) | P2 | 4 |

**Perubahan pada fase berikutnya (sesuai hasil verifikasi):**
- **Fase 3:** jenis asesmen resmi hanya formatif dan sumatif; diagnostik menjadi penanda asesmen awal; formatif tidak pernah masuk nilai rapor,
  kenaikan, atau kelulusan. Remedial dicatat sebagai pendampingan, tanpa mengunci "batas = KKTP". Jurnal mengajar dan modul ajar bersifat
  opsional (tidak ada kewajiban nasional) dengan nama netral "perencanaan pembelajaran".
- **Fase 4:** kerangka profil madrasah **bukan** himpunan dimensi terpisah: madrasah memakai delapan dimensi yang sama; yang khas adalah
  Panca Cinta (Kepdirjen Pendis 6077/2025). Seed madrasah (mapel PAI/Arab, JP) menunggu pembacaan KMA 1503/2025. Kokurikuler memuat bentuk
  kolaboratif lintas disiplin, G7KAIH, atau lainnya, dengan alokasi JP tahunan.
- **Fase 5:** PKL adalah mapel (792 JP kelas XII program 3 tahun; 1.368 JP kelas XIII program 4 tahun) dan nilainya masuk rapor; bobot
  sekolah:industri menjadi konfigurasi (tidak ada aturan nasional). UKK mengikuti Pedoman Direktorat SMK (tiga pola penyelenggara, dua
  skala skor, penguji internal/eksternal, pengiriman nilai ke e-Rapor SMK sebelum pengumuman kelulusan).

**Tidak boleh dikodekan keras (konfigurasi atau acuan berversi):** pemetaan tingkat-fase, struktur kurikulum dan JP, menit per JP, jumlah dan
nama dimensi profil, cara hitung nilai akhir, kriteria ketuntasan dan kebijakan remedial, aturan kenaikan dan kelulusan, kalender dan
semester, kuota SPMB, format rapor, penjurusan SMA (kebijakan belum final).

**Standar tampilan (berlaku untuk semua fase berikutnya):** setiap halaman baru diuji pada 375 px, 768 px, dan mode gelap; target sentuh
minimal 44 px; tabel menjadi kartu di bawah `lg`; dialog dengan footer aksi yang selalu terjangkau; tiga bahasa tanpa teks terpotong.

**Keputusan yang menunggu persetujuan:** (1) apakah fase 2C (K1-K7) dikerjakan sebelum rilis v1.2.0; (2) urutan fase 3, 3B, 3C; (3) apakah
fitur kelulusan (C2) dan mutasi (C3) dimajukan sebelum kokurikuler dan madrasah.

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
