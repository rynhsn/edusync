# Audit sistem akademik Edusync dan keselarasan kurikulum

Audit **baca-saja** pada v1.0.0 (commit `8a9353e`), 11 November 2026. Tidak ada kode, migrasi, atau data yang diubah.
Cakupan sesuai tugas: SMP dan SMK, ditambah catatan kesiapan SD/MI dan madrasah di bagian 9.

Cara membaca: setiap temuan memuat **Bukti** (lokasi di kode), **Masalah**, **Usulan**, dan **Dampak** pada fitur yang ada.
Label: ✅ sudah ada · 🟡 sebagian · ❌ belum ada · 🔁 ada tetapi perlu didesain ulang. "UNCERTAIN" berarti belum diverifikasi.

Metode: empat penelusuran paralel (skema/RLS, API/izin/tes, UI/navigasi, kurikulum/PKL/histori rapor). Temuan paling
berpengaruh saya baca ulang sendiri di kode (ditandai ✔ verifikasi). Sisanya berasal dari penelusuran dan belum dibaca ulang baris demi baris.

Keputusan yang sudah diambil pemilik produk dan menjadi dasar laporan ini:
- **Satu unit sekolah = satu jenjang = satu alamat.** Satu lembaga dapat punya beberapa unit (mis. SMA A dan SMK A).
- Jangan ada satu rumus nilai untuk semua sekolah, dan jangan memaksa SMP dan SMK memakai struktur yang sama.

---

## 1. Inventaris fitur akademik yang ada

| Area                                                                                          | Status | Lokasi utama                                                     |
| --------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------- |
| Tahun ajaran, semester (Ganjil/Genap, dapat diubah)                                           | ✅     | `schema.ts:65,824`; `routes/academic-years.ts`, `semesters.ts`   |
| Kalender akademik, perencana tahunan, PDF                                                     | ✅     | `schema.ts:844`; web `calendar/`                                 |
| Kelas per tahun ajaran, jurusan (`program`), wali kelas                                       | ✅     | `schema.ts:549,564`; `academic-structure.ts`                     |
| Mata pelajaran (kode dan nama saja)                                                           | 🟡     | `schema.ts:653`                                                  |
| Penugasan guru mapel per kelas                                                                | 🟡     | `schema.ts:711` (tanpa tahun, semester, riwayat)                 |
| Bank kurikulum platform dan adopsi mapel                                                      | 🟡     | `ref_*` `schema.ts:783-805,2874`; `curriculum.ts`                |
| Jadwal pelajaran mingguan (per tahun)                                                         | 🟡     | `schema.ts:901,920`; `schedule.ts`                               |
| Absensi per jam pelajaran                                                                     | ✅     | `schema.ts:1130`; `lesson-attendance.ts`                         |
| Penilaian: komponen berbobot, penilaian, skor, rekap                                          | 🟡     | `schema.ts:1277-1358`; `grading.ts`, `grading-lib.ts`            |
| Ujian CBT/cetak, bank soal, OMR, dorong nilai ke buku nilai                                   | ✅     | `schema.ts:2480-2652`; `exam*.ts`                                |
| Rapor: draf, finalisasi, buka kembali, snapshot, PDF                                          | 🟡     | `schema.ts:1390`; `report-card.ts`, `report-card-lib.ts`         |
| Ekstrakurikuler (anggota, sesi, kehadiran, predikat)                                          | ✅     | `schema.ts:1162-1274`; `extracurricular.ts`                      |
| Tahfidz dan ibadah harian                                                                     | ✅     | `schema.ts:1768-1880`; `tahfidz.ts`                              |
| PKL: mitra, periode, penempatan, jurnal, kunjungan, aspek, nilai, portal industri, sertifikat | ✅     | `schema.ts:2018-2158`; `pkl*.ts`                                 |
| Portal wali/siswa (nilai, rapor final, CBT)                                                   | ✅     | `portal*.ts`, `exam-portal.ts`                                   |
| Kurikulum berversi, CP, TP, ATP, KKTP                                                         | ❌     | tidak ditemukan di skema, API, maupun UI                         |
| Kelompok mapel, alokasi JP, muatan lokal, fase                                                | ❌     | tidak ditemukan                                                  |
| Jurnal mengajar, modul ajar                                                                   | ❌     | tidak ditemukan (`pkl_journal` hanya untuk PKL)                  |
| Asesmen diagnostik/formatif/sumatif, teknik, rubrik                                           | ❌     | semua penilaian diperlakukan sama                                |
| Remedial, pengayaan                                                                           | ❌     | hanya teks di dokumentasi (`docs/content-academic.ts:51`)        |
| Ketercapaian TP, narasi rapor dari TP                                                         | ❌     | deskripsi rapor hanya dari predikat (`report_setting.desc_a..d`) |
| Kokurikuler dan dimensi profil lulusan                                                        | ❌     | tidak ditemukan (ekskul bukan kokurikuler)                       |
| Hierarki SMK (bidang → program → konsentrasi)                                                 | 🟡     | `program` datar (`schema.ts:549`)                                |
| UKK                                                                                           | ❌     | hanya event kalender di seed demo                                |
| Kenaikan kelas, kelulusan, rollover tahun ajaran                                              | ❌     | hanya `student.status = graduated` manual                        |

---

## 2. Peta entitas dan relasi akademik

```
school ─┬─ school_setting (1:1)           ─ school_level (kode tingkat, bebas isi)
        ├─ academic_year ─┬─ semester
        │                 ├─ class_room ── enrollment ── student
        │                 │      │  (program_id?, homeroom_teacher_id?)
        │                 ├─ calendar_event
        │                 ├─ schedule_entry ── lesson_attendance
        │                 ├─ extracurricular_member / halaqah / pkl_period
        ├─ subject ── teaching_assignment (class, subject → teacher)
        ├─ grading_setting (1:1)  grade_component (per sekolah)
        │     assessment (semester, class, subject, component) ── score (student)
        │     report_card (semester, student, class, snapshot jsonb)
        └─ school_curriculum (curriculum_key, level_group, adopted_at)

platform (tanpa school_id): ref_curriculum, ref_subject (curriculum_key, level_group, code), ref_school_level
```

Temuan struktural dari peta ini (detail di bagian 3):
- `subject`, `teaching_assignment`, `lesson_period`, `grade_component`, `grading_setting` **tidak terikat tahun ajaran atau semester**.
- Salinan mapel dari bank tidak menyimpan asal-usulnya (tanpa FK ke `ref_subject`).
- `class_room.level` dan `question.level` berupa teks bebas yang hanya cocok dengan `school_level.code` secara konvensi.

---

## 3. Temuan terperinci

Prioritas: **P0** kritis, **P1** tinggi, **P2** menengah, **P3** rendah.

### Integritas data dan rapor

**F1 (P0) 🔁 Rapor final hanya dijaga di satu jalur.** ✔ verifikasi
- **Bukti:** `409 report_final` hanya dilempar di `report-card.ts:388-394` (catatan wali kelas). Tidak ada penjaga di edit komponen/KKM
  (`grading.ts:341,403,443,485,512`), penilaian dan skor (`:613,658,685,803`), dorong nilai ujian (`exam-scores.ts`, tanpa pengecekan `final`),
  penilaian ekskul (`extracurricular.ts:949`), pengaturan rapor (`report-card.ts:221`), absensi harian (`gate.ts`, `gate-manual.ts`),
  pindah kelas siswa (`people.ts:225,236`), dan penugasan guru/wali kelas (`academic-structure.ts:487,575`).
  Tes `report-card.test.ts:753` malah memastikan perubahan setelah finalisasi **diterima** dan snapshot tetap beku.
- **Masalah:** nilai hidup (buku nilai, rekap, portal nilai) bisa berbeda dari rapor yang sudah diterbitkan tanpa ada yang tahu. Finalisasi ulang setelah
  buka kembali lalu mengganti nilai di rapor tanpa disadari.
- **Usulan:** satu fungsi pengecek terpusat (`assertNotFinal` per kelas/siswa dan semester) dipasang di semua jalur di atas, dengan kode error 409
  `report_final`. Keputusan produk: penguncian per kelas atau per siswa, dan apakah koreksi absensi diizinkan (lihat bagian 11).
- **Dampak:** perilaku lama yang diubah hanya "edit setelah final diterima". Semua tes lain tetap. Satu tes (`:753`) harus diperbarui.

**F2 (P0) 🔁 Buka kembali menghapus snapshot tanpa arsip.** ✔ verifikasi
- **Bukti:** `report-card.ts:547-555` mengatur `snapshot: null`; finalisasi ulang menimpa lewat `onConflictDoUpdate` (`:496-505`). Log audit hanya mencatat jumlah (`:564`).
- **Masalah:** rapor yang sudah dicetak atau dikirim tidak dapat direkonstruksi setelah buka kembali.
- **Usulan:** tabel riwayat `report_card_snapshot` (versi, waktu, oleh siapa) yang diisi saat finalisasi dan reopen. Aditif.
- **Dampak:** tidak ada pada alur yang ada.

**F3 (P0) 🟡 Snapshot rapor tidak punya versi skema.**
- **Bukti:** `report_card.snapshot` jsonb nullable tanpa `schema_version` (`schema.ts:1390-1419`); `ReportDocument` tanpa penanda versi (`report-card.ts:76-116`); portal melakukan cast langsung (`portal-lib.ts:414`).
- **Masalah:** begitu bagian baru (kokurikuler, PKL, keputusan kenaikan) ditambahkan, snapshot lama tidak bisa dibedakan dari yang baru.
- **Usulan:** kolom `schema_version integer default 1` dan `template_key`; render menurut versi.
- **Dampak:** nol bagi rapor lama (versi 1).

**F4 (P1) 🔁 Konfigurasi nilai bersifat satu-sekolah dan tidak berversi.**
- **Bukti:** `grading_setting` satu baris per sekolah dengan `kkm integer` (`schema.ts:1277-1286`); `grade_component` unik per (sekolah, nama), tanpa tahun/semester/mapel (`:1289-1302`); rumus di `contracts/grading.ts:30-67` (rata-rata tertimbang yang dinormalisasi, predikat A/B/C/D).
- **Masalah:** KKM tidak bisa berbeda per mapel/tingkat, bobot tidak bisa berubah antar tahun tanpa memengaruhi data lama. Perubahan konfigurasi memengaruhi rapor draf semua kelas.
- **Usulan:** tambah mode perhitungan dan kebijakan remedial sebagai kolom berdefault di `grading_setting` (rumus lama tetap bawaan), serta KKTP bertingkat (lihat F10).
- **Dampak:** hasil perhitungan lama identik selama kolom berada di nilai bawaan.

**F5 (P1) ❌ Tidak ada kenaikan kelas, kelulusan, dan rollover tahun ajaran.**
- **Bukti:** `academic-years.ts:57-135` hanya menambah/mengaktifkan tahun; kelas, penugasan guru, dan semester terikat satu tahun (`schema.ts:564,824`); pindah kelas hanya lewat `PUT /v1/students/:id/class` (`people.ts:655`) dan impor siswa; `student.status` `graduated` diisi manual (`schema.ts:610`).
- **Masalah:** setiap akhir tahun admin membangun ulang kelas, penugasan guru, dan penempatan siswa dengan tangan. Ini kemungkinan beban operasional pertama yang dirasakan sekolah (akhir tahun ajaran Juni 2027).
- **Usulan:** wizard rollover (salin kelas dan penugasan ke tahun baru, tempatkan siswa menurut keputusan naik/tinggal/lulus), idempoten dan transaksional. Kolom keputusan di `report_card` atau tabel `promotion_decision`.
- **Dampak:** fitur baru; tidak mengubah data yang ada.

**F6 (P1) 🔁 Jadwal tidak bisa berbeda per semester; penugasan guru tanpa riwayat.** ✔ verifikasi sebagian
- **Bukti:** `schedule_class_slot_uq (class, weekday, period)` dan `schedule_teacher_slot_uq (year, teacher, weekday, period)` (`schema.ts:947-948`), tanpa `semester_id`; `lesson_period` tanpa tahun (`:901-914`); `teaching_assignment` unik (class, subject) tanpa tahun/semester/tanggal (`:711-730`) dan penggantian guru menimpa baris.
- **Masalah:** jadwal Genap yang berbeda dari Ganjil ditolak `23505`; pergantian guru di tengah tahun menghapus jejak.
- **Usulan:** `semester_id` nullable pada `schedule_entry` dengan unique parsial; `teaching_assignment_history` yang diisi otomatis; `homeroom_assignment_history`.
- **Dampak:** perlu mengganti dua constraint unik; risiko pada validasi bentrok jadwal (uji `schedule.test.ts`).

### Kurikulum

**F7 (P1) 🔁 Mapel hasil adopsi tidak punya asal-usul, kelompok, JP, atau tingkat.** ✔ verifikasi
- **Bukti:** `subject` hanya `code`, `name` (`schema.ts:653-665`); adopsi menyalin kode dan nama saja dengan `onConflictDoNothing` (`curriculum.ts:232-236`) dan mencatat `adopted_at` di `school_curriculum` (`schema.ts:808-821`); selisih "mapel baru" hanya berbasis kode (`curriculum.ts:164-170`).
- **Masalah:** tidak ada kelompok mapel (umum/kejuruan/pilihan/muatan lokal), JP, urutan rapor, atau jejak versi. Mapel yang diganti nama atau dihapus sekolah muncul lagi sebagai "baru".
- **Usulan:** kolom aditif di `subject` (`ref_subject_id`, `subject_group`, `is_local_content`, `sort_order`, `active`) dan tabel `curriculum_subject_allocation` per (tahun, tingkat, program, mapel) untuk JP. Salinan bank tetap _copy-on-adopt_.
- **Dampak:** nol bagi data lama (semua kolom nullable/berdefault).

**F8 (P1) ✅ Perubahan acuan platform tidak mengubah sekolah secara diam-diam.** ✔ verifikasi sebagian
- **Bukti:** adopsi adalah salinan sekali jalan; ubah nama atau impor acuan hanya menyentuh `ref_*` (`platform-reference.ts:394-396,528-534`); penghapusan kurikulum atau tingkat yang dipakai ditolak (`:330-332,455-464,230-241`).
- **Catatan:** acuan hanya berisi nama mapel (tanpa CP/TP/fase/versi). Bagian ini aman dan harus dipertahankan saat menambah CP/TP.

**F9 (P1) ❌ Tidak ada kurikulum berversi, fase, CP, TP, ATP.**
- **Bukti:** `ref_curriculum` hanya `key, name, description` (`schema.ts:783-787`); `school_curriculum` hanya `adopted_at` (`:818`); tidak ada tabel CP/TP/ATP; `DEFAULT_LEVELS` hanya mengisi kode tingkat (`contracts/school-settings.ts:12-17`).
- **Usulan (sesuai prinsip "jangan terlalu abstrak"):**
  1. `school_curriculum_version` per (tahun ajaran, tingkat) yang menunjuk kurikulum dan berlaku mulai kapan.
  2. `learning_outcome` (CP) dan `learning_objective` (TP) milik sekolah, disalin dari acuan bila ada, dengan `version` dan `supersedes_id`.
  3. ATP sebagai `learning_flow` + `learning_flow_item` (mendukung beberapa alur dan revisi). Relasi TP memakai **tabel relasi**, bukan array jsonb, agar bisa diberi FK dan diquery.
  4. Seluruhnya opsional: sekolah yang tidak memakai TP tetap berjalan seperti sekarang.
- **Dampak:** aditif.

**F10 (P1) ❌ KKTP fleksibel.**
- **Bukti:** KKM tunggal berbasis integer (lihat F4); `belowKkm` hanya penanda (`report-card-lib.ts:282`).
- **Usulan:** `achievement_criteria` dengan mode `numeric | interval | descriptor | rubric`, desimal, dan resolusi berjenjang: TP → (mapel, tingkat, program) → (mapel, tingkat) → `grading_setting.kkm`.
- **Dampak:** bila tabel kosong, perhitungan lama tidak berubah.

### Pelaksanaan dan penilaian

**F11 (P2) ❌ Jurnal mengajar dan modul ajar.** Tidak ada (semua hasil grep nol di skema, API, UI). Usulan: `lesson_journal` yang terikat `schedule_entry` + tanggal, ditaruh di layar **Absensi per jam** yang sama (satu layar kerja), dan `teaching_module` yang fleksibel (berkas, tautan, atau ringkasan). Tidak memaksa format dokumen.

**F12 (P2) ❌ Kategori asesmen, teknik, remedial, pengayaan, ketercapaian TP.**
- **Bukti:** `assessment` dan `grade_component` tidak punya kategori atau teknik (`schema.ts:1289-1336`); `score.value` satu angka (`:1339-1358`); tidak ada logika remedial (`grading-lib.ts`).
- **Usulan:** kolom berdefault `category='summative'`, `technique`, `include_in_final` pada `assessment`/`grade_component`; `score_remedial_attempt` untuk riwayat; `student_objective_achievement` dan `report_subject_narrative` untuk narasi (dengan fallback ke `desc_a..d`). Kebijakan nilai remedial dipilih sekolah.
- **Dampak:** aditif; rumus lama tidak berubah selama nilai bawaan dipakai.

**F13 (P2) ❌ Kokurikuler dan dimensi profil lulusan.**
- **Bukti:** tidak ada tabel atau menu; ekskul (`schema.ts:1162-1274`) adalah konsep lain.
- **Usulan:** jangan menyalin menu P5 lama. Rancang berdasarkan **kerangka profil yang dapat dipilih dan berversi** (`ref_profile_framework` berisi dimensi), karena kerangka berganti kebijakan dan berbeda antara sekolah umum (8 dimensi, 2025) dan madrasah. Tabel: jenis kegiatan per sekolah, program per semester, pilihan dimensi, rubrik, kelompok dan fasilitator, catatan per siswa per dimensi.
- **Dampak:** aditif; ditampilkan di rapor lewat `schema_version >= 2`.

### SMK

**F14 (P2) 🟡 `program` datar, tanpa bidang/program/konsentrasi.** Bukti: `schema.ts:549-561`; `program` tidak dirujuk `pkl*`. Usulan: hierarki tiga tingkat yang dijembatani kolom `program.concentration_id` agar `class_room.program_id`, kalender, SPMB, dan PKL tetap utuh.

**F15 (P2) 🟡 PKL berdiri sendiri.** ✔ verifikasi sebagian
- **Bukti:** PKL tidak muncul di `ReportDocument` (hasil grep "pkl" di `report-card*.ts` nol); nilai dan bobot aspek mudah diubah dan dihitung ulang setiap baca (`pkl.ts:247-273`); tidak ada finalisasi PKL; sertifikat dibuat di sisi klien tanpa tabel atau nomor (`pdf/certificate-pdf.tsx`).
- **Usulan:** `pkl_period.semester_id` opsional dan bobot sekolah:industri; ringkasan PKL pada rapor SMK; nomor sertifikat tercatat. Jangan menyentuh jalur tautan industri yang sudah ada (token SHA-256, `pkl-public.ts`).

**F16 (P2) ❌ UKK.** Hanya event kalender di seed demo. Usulan: `ukk_event` dan `ukk_result` di bawah modul `internship`, per konsentrasi.

### Multi-tenant dan integritas

**F17 (P2) 🟡 RLS lengkap, tetapi FK antar-tabel tenant tidak mengikat `school_id`.** ✔ verifikasi sebagian
- **Bukti:** semua tabel ber-`school_id` punya RLS ENABLE+FORCE+policy dan dijaga tes (`tenant-isolation.test.ts:128-152`); semua FK satu kolom (`schema.ts`, mis. `:927-943,1312-1324,1397-1405`); `exam.class_ids` jsonb tanpa FK (`:2553`); validasi lintas-sekolah bertumpu pada pola `requireRefs` di aplikasi.
- **Masalah:** database tidak menjamin sebuah baris merujuk entitas sekolah yang sama. Keamanan bertumpu pada validasi aplikasi, dan satu route baru yang lupa memvalidasi bisa menautkan UUID sekolah lain (tidak bisa membacanya, tetapi bisa menautkannya).
- **Usulan:** untuk **tabel baru saja** pakai `UNIQUE (school_id, id)` pada induk dan FK komposit pada anak. Jangan retrofit tabel lama sekarang (biaya tinggi, risiko migrasi).
- **Dampak:** hanya tabel baru.

**F18 (P2) 🟡 Keterkaitan tahun/semester tidak dipaksa di database.** Bukti: `assessment.semester_id` tidak diikat ke tahun kelasnya; `schedule_entry.academic_year_id` tidak diikat ke tahun kelas; rentang semester hanya divalidasi API (`master-data.test.ts:931-947`). Usulan: validasi di API untuk jalur baru; tidak perlu trigger di tahap awal.

**F19 (P3) 🔁 Hak istimewa dicocokkan lewat nama peran.** ✔ verifikasi
- **Bukti:** `WIDE_ROLES = ['principal','curriculum']` di `report-card.ts:38` dan `grading.ts:41`, dipakai di `:135` dan `:139` dengan `ctx.roles.some(...)`.
- **Masalah:** peran kustom bernama lain tidak setara; hak ditentukan oleh nama, bukan izin.
- **Usulan:** ganti dengan izin eksplisit (mis. `report_card:read_all`).

### Izin, modul, UI

**F20 (P2) 🟡 Izin akademik belum memadai untuk fitur baru.** Bukti: `permissions.ts:5-54` tidak punya `curriculum:*`, jurnal, kokurikuler, UKK, atau kenaikan kelas; bank soal memakai `exam:*`; adopsi kurikulum memakai `subject:manage`. Usulan (aditif): `curriculum:manage`, `teaching_plan:write`, `cocurricular:manage|assess`, `ukk:manage`, `promotion:manage`, dipetakan ke peran bawaan. Tes `rbac-matrix.test.ts` otomatis memaksa setiap route baru punya gerbang.

**F21 (P3) 🟡 Modul.** Kunci modul `assessments` ada di katalog (`catalog.ts:48-55`) tetapi tidak ada route yang memakainya (UNCERTAIN maksudnya). Modul `internship` mensyaratkan `administration` (`catalog.ts:62-69`) sedangkan dokumentasi dalam aplikasi menyebut "Administrasi" di satu tempat dan `internship` di tempat lain. Perlu diputuskan dan diseragamkan.

**F22 (P2) 🔁 Navigasi dan pengaturan tersebar.** Bukti: pengaturan akademik ada di tujuh tempat (`app-shell.tsx:246-271`); adopsi kurikulum hanya sebuah dialog di halaman Mapel (`subjects-view.tsx:192`); `/calendar/year` dan `/pkl/report` tanpa item menu; Absensi per jam berada di grup Kehadiran. Usulan: perluas halaman yang ada (tab atau sub-rute), jangan menambah menu yang tumpang tindih. Rinci di bagian 7.

**F23 (P3) 🟡 PDF dengan judul keras berbahasa Indonesia.** Bukti: `report-card-pdf.tsx:118,149,176,203`. Perlu untuk kesiapan madrasah/bahasa lain. Kunci terjemahan UI sudah selaras id/en/su (0 selisih).

**F24 (P3) 🟡 Tes.** Tidak ada tes yang mencoba mengubah nilai setelah final selain yang menegaskan hasil sebaliknya; tidak ada tes tenant-isolation per route untuk tahfidz, ekskul, PKL; hak kontekstual (guru, pembina, pembimbing) tidak tercakup `rbac-matrix` karena hanya menguji gerbang izin dan modul, sehingga route baru yang lupa memanggil pengecek kepemilikan tidak terdeteksi.

---

## 4. Analisis keselarasan kurikulum

| Konsep Kurikulum Merdeka dan kebijakan 2025 | Kondisi Edusync                                       | Celah                                                                  |
| ------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| Fase (A–F) dan tingkat                      | hanya kode tingkat bebas (`school_level`), tanpa fase | tambah pemetaan tingkat → fase (turunan dari profil jenjang, bagian 9) |
| Struktur kurikulum, kelompok mapel, JP      | daftar mapel datar                                    | F7                                                                     |
| CP → TP → ATP                               | tidak ada                                             | F9                                                                     |
| KKTP (bukan KKM tunggal)                    | KKM integer tunggal                                   | F4, F10                                                                |
| Asesmen diagnostik/formatif/sumatif         | tidak dibedakan                                       | F12                                                                    |
| Rapor dengan deskripsi capaian berbasis TP  | deskripsi dari predikat                               | F12                                                                    |
| Modul ajar fleksibel, jurnal mengajar       | tidak ada                                             | F11                                                                    |
| Kokurikuler dan profil lulusan              | tidak ada                                             | F13                                                                    |
| Pembedaan SMK (konsentrasi, PKL, UKK)       | PKL ada; hierarki dan UKK tidak                       | F14–F16                                                                |

Pembedaan tiga lapis yang diminta dan kondisinya sekarang:
- **Referensi platform** (`ref_*`): ada, hanya nama mapel.
- **Kustomisasi sekolah** (`subject`, `school_curriculum`): ada, minim metadata.
- **Transaksi akademik** (`assessment`, `score`, `report_card`, ...): ada, tetapi sebagian besar tidak terikat versi kurikulum.

Seed acuan (`0020_reference_data.sql`): `merdeka` untuk SMP, SMA, SMK; `k13` untuk SMP; `kma` (madrasah) untuk SMP/MTs saja. Tidak ada seed untuk SD, tidak ada kurikulum 2025, dan SMK hanya mapel umum ditambah DPK dan PKK tanpa mapel konsentrasi. Header seed sendiri menyatakan data itu contoh yang harus diverifikasi terhadap regulasi.

---

## 5. Rekomendasi desain database (ringkas, semua aditif)

1. `school.education_profile` (kunci profil jenjang) dan tabel acuan `ref_education_profile` (bagian 9).
2. `subject`: `ref_subject_id`, `subject_group`, `is_local_content`, `sort_order`, `active`.
3. `curriculum_subject_allocation`, `school_curriculum_version`.
4. `learning_outcome`, `learning_objective`, `learning_flow`, `learning_flow_item`, serta tabel relasi `assessment_objective`, `lesson_journal_objective`, `teaching_module_objective`.
5. `achievement_criteria` + `achievement_rubric_level`.
6. `assessment`/`grade_component`: `category`, `technique`, `include_in_final`; `grading_setting`: `calculation_mode`, `remedial_policy`, `narrative_mode`; `score_remedial_attempt`; `student_objective_achievement`; `report_subject_narrative`.
7. `report_card`: `schema_version`, `template_key`, `decision*`; tabel `report_card_snapshot` (riwayat).
8. `schedule_entry.semester_id` + unique parsial; `teaching_assignment_history`; `homeroom_assignment_history`.
9. Kokurikuler: `ref_profile_framework` (kerangka dan dimensi), jenis kegiatan, program, dimensi program, rubrik, kelompok, catatan per siswa per dimensi.
10. SMK: `vocational_field/program/concentration` + `program.concentration_id`; `pkl_period.semester_id` dan bobot; `ukk_event`, `ukk_result`.
11. Standar untuk **tabel baru**: `school_id` + RLS ENABLE/FORCE + policy standar, didaftarkan di `tenant-isolation.test.ts`; FK komposit `(school_id, id)`.

Aturan migrasi: tanpa DROP atau perubahan tipe yang memutus kontrak. Perhatikan catatan operasional proyek ini: `when` entri jurnal migrasi tidak boleh lebih rendah dari yang sudah diterapkan, atau migrator melewatinya diam-diam.

## 6. Rekomendasi API dan service

- `report-lock-lib.ts` dengan `assertClassReportNotFinal`, `assertClassesReportNotFinal`, `assertStudentsReportNotFinal`; dipanggil di dalam transaksi tiap jalur pada F1.
- Pemecah KKTP (`resolveAchievement`) yang memuat peta kriteria satu kelas sekaligus di `loadClassContext` (hindari N+1).
- Endpoint baru ditempatkan di berkas route terpisah per area (kurikulum, rencana ajar, kokurikuler, UKK, kenaikan kelas) mengikuti pola `requirePermission` + `requireModule`, dan semuanya didokumentasikan di OpenAPI.
- Bidang baru pada payload lama berstatus `.optional()` agar klien lama tetap diterima.
- Pertahankan `computeGrades` apa adanya sebagai jalur bawaan; mode baru ditambahkan sebagai cabang, bukan menimpa.

## 7. Rekomendasi UI dan navigasi

Prinsip: memperluas halaman yang ada, bukan menu baru yang tumpang tindih.

| Peran          | Diperluas                                                                                             | Baru                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Admin/operator | **Pengaturan sekolah** (pilih jenjang), **Jadwal** (filter semester), **Kelas**                       | wizard **Kenaikan kelas dan rollover**                     |
| Kurikulum      | **Mapel** (kelompok, JP, asal), adopsi kurikulum jadi halaman **Kurikulum** (versi, CP/TP/ATP)        | **Kokurikuler**, **UKK** (hanya jenjang kejuruan)          |
| Kepala sekolah | **Rapor**                                                                                             | panel ringkas keterlaksanaan kurikulum dan ketercapaian TP |
| Guru           | **Absensi per jam** (+ jurnal mengajar), **Penilaian** (kategori, teknik, TP, tab remedial/pengayaan) | **Perangkat ajar saya** (TP, ATP, KKTP, modul ajar)        |
| Wali kelas     | **Rapor** (kelengkapan, keputusan kenaikan, finalisasi)                                               | tidak ada                                                  |
| Wali/siswa     | **Portal** (rapor final menampilkan bagian baru bila `schema_version >= 2`)                           | tidak ada                                                  |

Pembenahan kecil yang murah: item menu untuk `/calendar/year` dan `/pkl/report`, kelompokkan pengaturan akademik, dan pindahkan judul PDF ke terjemahan.

## 8. Rekomendasi izin dan peran

Pertahankan 8 peran dan semua izin yang ada. Tambahkan secara aditif: `curriculum:manage` (admin, kurikulum), `teaching_plan:write` (admin, kurikulum, guru), `cocurricular:manage` (admin, kurikulum), `cocurricular:assess` (admin, kurikulum, guru), `ukk:manage` (admin, kurikulum, guru penguji), `promotion:manage` (admin, kurikulum). Ganti `WIDE_ROLES` dengan izin eksplisit (F19). Hak kontekstual (wali kelas, guru mapel, pembina, pembimbing PKL, pengasuh halaqah) tetap seperti sekarang dan perlu tes khusus karena `rbac-matrix` tidak menjangkaunya.

## 9. Jenjang: profil jenjang, SMP vs SMK, SD/MI dan madrasah

**Keputusan:** satu unit = satu jenjang = satu alamat; satu lembaga boleh punya beberapa unit.

**Kondisi sekarang:** tabel `school` tidak punya kolom jenjang (hanya NPSN, `schema.ts:34-63`). Jenjang hanya tersirat dari tingkat kelas bawaan dan dari adopsi kurikulum (`school_curriculum.level_group`). `ref_school_level` berisi `sd` (SD/MI), `smp` (SMP/MTs), `sma` (SMA/MA), `smk`.

**Usulan: profil jenjang di tingkat unit.**
- Kolom `school.education_profile` (`sd`, `mi`, `smp`, `mts`, `sma`, `ma`, `smk`, `mak`) dan tabel acuan `ref_education_profile` yang membawa: pemetaan tingkat → fase, model pengajar (guru kelas atau guru mapel), kemampuan (peminatan, kejuruan), kelompok mapel bawaan, kerangka profil, otoritas (Kemendikdasmen atau Kemenag), dan format rapor.
- Fitur muncul menurut **kemampuan** profil (PKL dan UKK bila kejuruan), bukan dengan memeriksa tulisan "SMK".
- Perubahan jenjang hanya oleh platform dan hanya selama belum ada data akademik.

| Aspek            | SMP                | SMK                                                                             |
| ---------------- | ------------------ | ------------------------------------------------------------------------------- |
| Fase             | 7–9 → D            | X → E; XI–XII → F                                                               |
| Struktur jurusan | tidak wajib        | bidang → program → konsentrasi, terhubung ke `program`                          |
| Kelompok mapel   | umum, muatan lokal | umum, kejuruan (dasar program, konsentrasi, projek, pilihan), PKL, muatan lokal |
| ATP/KKTP         | per mapel + fase   | per fase, atau per program/konsentrasi                                          |
| Kokurikuler      | tema umum          | ditambah tema kebekerjaan                                                       |
| PKL dan UKK      | tidak tampil       | aktif penuh (PKL sudah ada; UKK baru)                                           |
| Kelulusan        | tingkat akhir 9    | tingkat akhir XII (atau XIII)                                                   |

**SD/MI dan madrasah (kesiapan):**
- SD/MI: tingkat 1–6 sudah ada di bawaan, tetapi tidak ada seed mapel `sd`, tidak ada fase A–C, dan penugasan guru adalah satu guru per (kelas, mapel) sehingga guru kelas harus ditugaskan satu per satu. Cukup tambah pintasan "tugaskan guru ini ke semua mapel kelas"; tidak perlu tabel baru.
- Madrasah: seed `kma` ada untuk MTs saja (AQH, AKH, FQH, SKI, BAR, dan mapel umum); belum ada untuk MI dan MA. Tidak ada kolom NSM, EMIS, atau tipe madrasah. Tahfidz sudah ada sebagai modul tersendiri tetapi belum masuk rapor. Kerangka profil madrasah belum ada (karena itu F13 menyarankan kerangka profil yang dapat dipilih).
- Kenaikan kelas SD/MI dan keputusan kelulusan memakai mekanisme F5 yang sama.

## 10. Roadmap berprioritas

| Fase  | Isi                                                                                                                                   | Prioritas | Risiko utama                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------- |
| **0** | Profil jenjang di unit (kolom, acuan platform, layar pilih jenjang, migrasi sekolah yang ada); pintasan guru kelas                    | P0        | rendah                                                     |
| **1** | Penjaga rapor final di semua jalur (F1); arsip dan versi snapshot (F2, F3); jadwal per semester dan riwayat penugasan (F6)            | P0        | mengganti dua constraint jadwal                            |
| **2** | Rollover dan kenaikan kelas (F5); metadata mapel dan JP (F7); kurikulum berversi, CP/TP/ATP (F9); KKTP dan mode perhitungan (F4, F10) | P1        | kompleksitas pemecah KKTP; performa rapor                  |
| **3** | Jurnal mengajar dan modul ajar (F11); kategori asesmen, remedial, ketercapaian TP, narasi rapor (F12)                                 | P2        | agregasi TP saat render rapor satu kelas                   |
| **4** | Kerangka profil dan kokurikuler (F13); seed SD dan madrasah, NSM/EMIS (bagian 9)                                                      | P2        | kerangka profil dan kebijakan berubah; verifikasi regulasi |
| **5** | Hierarki SMK, PKL → rapor, UKK (F14–F16); izin baru (F20); pembersihan menu dan PDF (F22, F23)                                        | P2        | tidak boleh memutus PKL yang ada                           |

Setiap fase menyertakan tes regresi (`grading`, `report-card`, `schedule`, `pkl`, `rbac-matrix`, `tenant-isolation`) dan entri CHANGELOG. Tiap fase bisa dirilis sendiri sebagai versi MINOR.

## 11. Risiko dan kompatibilitas mundur

**Syarat kompatibilitas**
1. Tanpa DROP atau perubahan tipe kolom yang memutus kontrak; semua kolom baru nullable atau berdefault yang sama dengan perilaku sekarang.
2. `computeGrades` menghasilkan angka identik untuk semua data lama. KKTP kosong → fallback ke `grading_setting.kkm`; komponen lama otomatis `summative` dan `include_in_final = true`.
3. Rapor final lama (`schema_version` 1) dirender apa adanya dan tidak pernah dihitung ulang.
4. PKL: 3 route publik dan seluruh route `pkl.ts` tidak berubah kontrak. Kolom baru opsional.
5. OpenAPI: field baru `.optional()`; klien lama tetap diterima.
6. Tabel tenant baru wajib masuk tes isolasi (RLS) dan memakai pola FK komposit.

**Risiko**
- Mengganti unique `schedule_entry` dapat memengaruhi deteksi bentrok jadwal.
- Penjaga rapor final mengubah perilaku yang sekarang diterima (tes `report-card.test.ts:753` harus diubah); perlu pengumuman kepada pengguna (CHANGELOG).
- Retrofit FK komposit pada tabel lama berisiko tinggi dan manfaatnya kecil dibanding biaya; ditunda.
- Ketergantungan regulasi (kerangka profil, peminatan SMA, kebijakan madrasah) dapat berubah; karena itu dirancang sebagai data acuan yang berversi, bukan kode.
- Aturan migrasi proyek (`when` jurnal) dan peran DB tetap harus dipatuhi.

**Keputusan produk yang menunggu persetujuan**
1. Penguncian rapor per kelas atau per siswa; apakah koreksi absensi harian diizinkan setelah final.
2. Bagaimana portal industri PKL berperilaku saat rapor siswa sudah final (tolak dan baca-saja, atau tetap menerima tetapi tidak mengubah snapshot).
3. Kokurikuler masuk modul **Nilai dan rapor** atau modul tersendiri.
4. Dukungan _team teaching_ (lebih dari satu guru aktif per mapel-kelas) atau cukup satu guru dengan riwayat.
5. Kebijakan nilai remedial bawaan untuk sekolah baru.
6. Daftar profil jenjang awal, dan apakah madrasah masuk fase awal atau menyusul.

## 12. Hal yang belum pasti (UNCERTAIN)

- Isi sebenarnya tabel `ref_school_level` dan `ref_subject` di server produksi (hanya dibaca dari migrasi dan skema).
- Apakah layar pendaftaran unit sudah menanyakan jenjang (tidak ditemukan di kontrak; belum diperiksa di UI pendaftaran).
- Perlakuan portal nilai wali terhadap nilai draf (`portal-lib.ts:332` memakai nilai hidup; belum dibaca penuh).
- Kasus semester yang masih direferensikan saat dihapus (hanya semester aktif yang jelas diblokir).
- Aturan kepemilikan penulis ujian (`exam:author`) per mapel; maksud kunci modul `assessments`; apakah tombol finalisasi menangani 403 dengan baik.
- Rincian regulasi (nomor keputusan, kerangka profil madrasah, kebijakan peminatan SMA 2025) saya sebut dari ingatan dan **belum diverifikasi** ke sumber resmi.
- Dokumen eksternal `docs/.md` (rancangan v2.0 dari asisten lain): klaim kode yang saya cek benar (hanya satu penjaga `report_final`; unik jadwal tanpa semester; KKM integer), tetapi nama menunya (`/settings`, `/academic`, `/lesson-attendance`) tidak sesuai rute aplikasi, dan usulan `school_setting.stage` (SMP/SMK per sekolah) digantikan oleh profil jenjang di atas.

---

_Tidak ada perubahan kode, migrasi, atau data dalam audit ini. Menunggu persetujuan roadmap sebelum implementasi._
