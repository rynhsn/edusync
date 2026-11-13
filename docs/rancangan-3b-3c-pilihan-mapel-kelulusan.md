# Rancangan: fase 3B (pilihan mapel per murid) dan 3C (kelulusan, mutasi, legger, ekspor, tinggal kelas)

Status: **keputusan bawaan ditetapkan arsitek atas delegasi pemilik produk**; hanya butir bertanda "perlu konfirmasi" (bagian 10.2) yang
menunggu pemilik. Disusun 14 November 2026 pada cabang `rebuild`, HEAD = `65263ca` (fase 3 tahap 3.0-3.5 selesai, belum dirilis; migrasi
terakhir 0100, `when` 1796866200000). Dokumen ini hanya rancangan: tidak ada kode, migrasi, atau data yang diubah; kueri ke DB dev baca-saja.

Terkait: [roadmap](../Planning/11-academic-roadmap.md) (prinsip 1-7, celah C1-C11, standar tampilan), [regulasi-umum.md](regulasi-umum.md)
(klaim K10, R4-R6, S4, G9; bagian 4 butir 2A/2B; bagian 5; bagian 6 C1, C2, C4, C5, C6, C13, C15, C18, C19, C22),
[regulasi-madrasah-smk.md](regulasi-madrasah-smk.md) (G1 pilihan dan agama per murid, G3 SMK 4 tahun, G6 interop, G7 kelulusan),
[rancangan fase 3](rancangan-fase-3-asesmen-rapor.md) (pola sparse, snapshot, garis dasar), [rancangan pembekuan](rancangan-pembekuan-konfigurasi-nilai.md).

**Catatan penomoran celah.** Roadmap dan `regulasi-umum.md` bagian 6 memakai nomor C berbeda. Dokumen ini memakai nomor **roadmap**:
C1 pilihan mapel (= regulasi C13), C2 ujian/kelulusan (= regulasi C2 + C18), C3 mutasi (= regulasi C1), C5 tinggal kelas administratif
(= regulasi C15), C6 legger dan berita acara (= regulasi C4 + C5), C7 interop (= regulasi C6).

Cara membaca: "terverifikasi" = dibaca sendiri di kode atau DB dev; "asumsi" = belum dibuktikan (dirangkum di bagian 11).

---

## 1. Masalah dan kriteria keberhasilan

### 1.1 Masalah 3B (pilihan mapel per murid)

| #   | Masalah                                                                                                                                                                                                                                                                    | Bukti (terverifikasi)                                                                                                                                                                                           | Dasar                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| B1  | Semua murid satu rombel dianggap mengambil semua mapel rombel. Murid SMA XI-XII yang memilih 4-5 dari minimal 7 mapel pilihan, murid beragama berbeda, dan murid yang memilih satu cabang seni/prakarya mendapat nilai kosong, rapor "belum lengkap", dan peringkat salah. | Penilaian, roster, rapor diikat ke rombel (bagian 2). `subject.kind` dan `subject.religion_variant` hanya metadata 2C, tidak dibaca perilaku apa pun (grep: hanya `academic-structure.ts`, tes, dan web Mapel). | K10 (13/2025 Lampiran II bagian D), regulasi-madrasah G1 |
| B2  | Jadwal tidak bisa menyatakan "blok pilihan": satu slot rombel hanya satu mapel; guru yang sama mengajar gabungan dua rombel pada slot yang sama ditolak `teacher_busy`.                                                                                                    | Indeks unik `schedule_class_slot_year_uq (class_id, weekday, period_id)` dan pemeriksaan `teacher_busy` (`routes/schedule.ts:425-447`).                                                                         | K10 (20-25 JP/minggu pilihan)                            |
| B3  | Rapor final yang memuat mapel yang tidak diambil murid tidak bisa dibetulkan tanpa membuka kembali; kelengkapan finalisasi (`grades_incomplete`) memaksa `force` untuk kelas campuran.                                                                                     | `completenessOf`/`liveSummary` menghitung semua `assessedSubjects` kelas (`report-card-lib.ts:216-227, 354`).                                                                                                   | R1                                                       |

### 1.2 Masalah 3C

| #   | Masalah                                                                                                                                                                                                                                        | Bukti (terverifikasi)                                                                                                                                                                                                | Dasar                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| C-a | Kelulusan = keputusan kenaikan `graduate` yang langsung mengubah `student.status` saat penerapan. Tidak ada ujian satuan pendidikan, komponen/bobot, penetapan, tanggal lulus, SKL, nomor ijazah, transkrip, atau "tidak lulus".               | `applyDecisions` `routes/promotion.ts:754-776, 943-953`; tabel `promotion_decision` tanpa kolom kelulusan (`schema.ts:799-832`).                                                                                     | R6, regulasi bagian 4 butir 2A ("keliru bila otomatis"), G7 |
| C-b | Mutasi tidak tercatat. Status `transferred` diubah bebas lewat `PUT /v1/students/:id` tanpa tanggal, alasan, sekolah tujuan. Pindah rombel dalam tahun **menimpa** `enrollment.class_id` (riwayat hilang) dan **tidak dijaga** `report_final`. | `placeStudent` `routes/people.ts:217-239` (`onConflictDoUpdate set classId`); tidak ada panggilan `assert*ReportNotFinal` di `people.ts`.                                                                            | S4 (3/2025 Pasal 55-58)                                     |
| C-c | Rapor final murid yang sudah pindah keluar hilang dari daftar rapor kelas, dan bila rapor kelas dibuka kembali lalu difinalkan ulang, murid itu tidak ikut (roster mengecualikan `transferred`/`dropped`).                                     | `historicalRosterOf` (`attendance-lib.ts:75-92`) dan daftar rapor iterasi `c.roster` (`routes/report-card.ts:306-322`). Dokumen tunggal tetap terbaca lewat `resolveReportStudent` (`report-card-access-lib.ts:61`). | integritas arsip                                            |
| C-d | Tidak ada legger kelas dan berita acara musyawarah dewan pendidik; `promotion_decision` hanya punya `reason`, `follow_up`, `meeting_date` per murid.                                                                                           | `schema.ts:816-821`.                                                                                                                                                                                                 | R5, regulasi C4/C5                                          |
| C-e | Tidak ada ekspor data akademik untuk dilaporkan ke e-Rapor/Dapodik/EMIS; pekerjaan ganda.                                                                                                                                                      | grep: tidak ada rute ekspor akademik.                                                                                                                                                                                | A9, G9 (sekunder)                                           |
| C-f | Tinggal kelas di tingkat akhir tidak punya kelas tujuan: rollover tidak menyalin kelas tingkat akhir, jadi `retain` tingkat akhir selalu `unplaced: no_target_class`. Riwayat rombel per murid tidak punya tampilan.                           | Deskripsi rollover `routes/promotion.ts:1261-1262`; `pickClass` `:722-733`.                                                                                                                                          | R5, C5                                                      |

### 1.3 Kriteria keberhasilan (keduanya)

1. **Sekolah yang tidak memakai fitur baru identik byte demi byte**: rekap, matriks, daftar rapor, dokumen rapor (draf dan final), portal,
   jadwal, absensi per jam, kenaikan kelas. `apps/api/src/phase3-baseline.test.ts` dan fixture-nya **tidak diubah** dan tetap hijau
   (termasuk `ADDITIVE_KEYS` tetap kosong: semua field baru di respons bersifat sparse, absen bila fitur tidak dipakai).
2. **Tidak ada kolom baru pada tabel yang didump garis dasar** (`report_card` seluruh kolom kecuali `id`; `report_card_snapshot` dan
   `semester_grading_config` kolom terpilih). Tabel yang diisi tes garis dasar (`school`, `student`, `enrollment`, `class_room`, `subject`,
   `assessment`, `score`, `grade_component`, `grading_setting`, `achievement_criteria`, `daily_attendance`) **tidak mendapat kolom baru**
   dalam rancangan ini (lebih ketat dari yang dibutuhkan; kolom nullable tetap aman tetapi tidak diperlukan).
3. **Mapel wajib kelas tetap implisit**: tidak ada satu pun baris pilihan yang perlu dibuat untuk sekolah lama.
4. Murid hanya muncul di roster nilai, rekap, rapor, portal, dan absensi per jam untuk mapel yang ia ambil, **hanya bila** mapel itu
   ditandai "berdasarkan pilihan" di rombelnya.
5. Kelulusan ditetapkan sekolah (tidak otomatis dari tingkat akhir), dengan ujian satuan pendidikan dan komponen yang **dikonfigurasi
   sekolah**; transkrip dibekukan saat penetapan; tanpa konfigurasi kelulusan, alur `graduate` sekarang tidak berubah.
6. Mutasi masuk/keluar dan pindah rombel tercatat (tanggal, alasan, asal/tujuan), riwayat rombel utuh, rapor final tidak hilang dari arsip.
7. Tabel tenant baru: `school_id` + RLS ENABLE/FORCE + policy `tenant_isolation` + GRANT `edusync_app` + `UNIQUE (school_id, id)` + FK
   komposit `(school_id, x_id)`; terdaftar di `tenant-isolation.test.ts`. Peran DB tidak diubah.
8. Semua endpoint di OpenAPI, deskripsi diawali "Izin: `x`.", modul tertulis, `rbac-matrix` diperbarui; dokumentasi dalam aplikasi id/en/su.
9. Tampilan: 375 px, 768 px, mode gelap, target sentuh 44 px, tabel menjadi kartu di bawah `lg`, footer dialog terjangkau.
10. Tanpa N+1: perhitungan satu kelas menambah paling banyak **1** kueri batch untuk partisipasi mapel.

---

## 2. Kondisi saat ini (ringkas, terverifikasi)

**Asumsi "satu rombel = satu himpunan mapel untuk semua murid" ada di setiap lapisan:**

| Lapisan         | Perilaku sekarang                                                                                                                                                                                           | Rujukan                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Penempatan      | `enrollment` UNIQUE `(student_id, academic_year_id)`: satu rombel per tahun. Pindah = UPDATE `class_id`.                                                                                                    | `schema.ts:651-673`, `people.ts:217-239`     |
| Penugasan guru  | `teaching_assignment` UNIQUE `(class_id, subject_id)`, satu guru; tanpa `UNIQUE (school_id, id)`.                                                                                                           | `schema.ts:1087-1106`                        |
| Jadwal          | Sel per `(class, weekday, period)` (+ semester); guru otomatis dari penugasan; `teacher_busy` lintas kelas.                                                                                                 | `schema.ts:1298-1340`, `schedule.ts:367-490` |
| Absensi per jam | Roster = `rosterOf(entry.classId)`, semua murid aktif rombel.                                                                                                                                               | `lesson-attendance.ts:211, 298`              |
| Penilaian       | `assessment.class_id` + `subject_id`; skor ditolak bila murid bukan anggota aktif rombel (`rosterOf`).                                                                                                      | `grading.ts:1385-1394`                       |
| Hitung nilai    | `computeGrades` menghitung SETIAP `(mapel, murid)` dari daftar `studentIds`.                                                                                                                                | `grading-lib.ts:116-232`                     |
| Mapel rapor     | `assessedSubjects(sem, class)` = mapel yang punya penilaian dihitung, **sama untuk semua murid**.                                                                                                           | `grading-lib.ts:240-268`                     |
| Rapor           | `loadClassContext` memakai `historicalRosterOf` (aktif + lulus); rata-rata dan peringkat atas mapel kelas; kelengkapan finalisasi atas mapel kelas.                                                         | `report-card-lib.ts:149-213, 354`            |
| Portal          | `gradesFor` = `assessedSubjects` rombel murid.                                                                                                                                                              | `portal-lib.ts` (`gradesFor`)                |
| Kenaikan        | Keputusan per murid; `graduate` hanya tingkat akhir (`isFinalLevel`, `program.final_level_code`); penerapan menempatkan murid dan mengubah status `graduated`. Rollover tidak menyalin kelas tingkat akhir. | `promotion.ts:640-964, 1066-1265`            |
| Status murid    | `student.status` enum `active/graduated/transferred/dropped`, bebas diubah lewat `PUT /v1/students/:id` (`student:manage`).                                                                                 | `schema.ts:632`, `people.ts:619-652`         |
| Penjaga final   | Per kelas (satu baris final mengunci kelas) atau per murid; `assertClassYearNotClosed` untuk penugasan/wali. Pindah rombel tidak dijaga.                                                                    | `report-lock-lib.ts`                         |

**Data DB dev (14 Nov):** 10 sekolah (1 berprofil `smk`, 9 `null`); murid 153 aktif, 5 lulus, 2 pindah, 2 keluar; 30 mapel semua
`compulsory`, 0 bervarian agama; 251 enrollment; 108 penugasan; 306 sel jadwal; 2.560 absensi per jam; 0 keputusan kenaikan; rapor 32
draf, 4 final; 0 program dengan `duration_years`. `UNIQUE (school_id, id)` sudah ada pada `academic_year`, `class_room`, `semester`,
`student`, `subject`, `teacher`, `program`; **belum** pada `enrollment`, `teaching_assignment`, `schedule_entry`, `report_card`,
`promotion_decision`, `school_level`.

**Lain-lain terverifikasi:** `student.religion` memakai `other` sedangkan `subject.religion_variant` memakai `belief` (tidak simetris);
`semester` tidak punya nomor urut (semester genap = semester dengan `starts_on` terbesar pada tahun itu, pola yang sudah dipakai
`promotion.ts:857-862`); SPMB tidak punya kolom jalur (tidak ada jalur mutasi); izin baru sampai ke sekolah lama lewat
`syncSystemRolePermissions` (pola migrasi 0088); `promotion` tidak bergerbang modul, rapor bergerbang modul `grades`.

---

## 3. Keputusan desain

### 3.1 (i) Model pilihan mapel per murid

**Opsi**

|              | A. Baris per murid untuk semua mapel                                                                           | B. Mode partisipasi per (rombel, mapel) + baris hanya untuk mapel bermode pilihan | C. Turunkan dari data lain (agama murid, ada-tidaknya baris)                                                                                                   |
| ------------ | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sekolah lama | Wajib backfill semua murid x mapel (tabel ber-RLS: migrator TS) dan setiap penempatan baru harus menulis baris | **Tanpa baris; identik**                                                          | Tanpa baris                                                                                                                                                    |
| Kebenaran    | Eksplisit                                                                                                      | Eksplisit di tempat yang perlu                                                    | Rapuh: baris pertama yang dibuat langsung menyembunyikan mapel dari murid lain; `other` vs `belief` ambigu; mengubah agama murid mengubah draf rapor diam-diam |
| Biaya hitung | Join untuk semua mapel                                                                                         | 1 kueri batch, kosong untuk sekolah lama                                          | Sama dengan B                                                                                                                                                  |
| Rollover     | Salin semua baris                                                                                              | Salin mode + pilihan                                                              | -                                                                                                                                                              |

**Keputusan: B.**

- `class_subject_participation (class_id, subject_id, mode)`: **sparse**, baris hanya bila mode bukan bawaan. Satu-satunya nilai mode
  yang disimpan: `selected` ("hanya murid yang terdaftar"). Tidak ada baris = `all` = perilaku sekarang. Disimpan per rombel (bukan per
  tingkat atau alokasi kurikulum) karena penilaian, rapor, dan penjaga final semuanya per rombel; UI menyediakan "terapkan ke semua
  rombel tingkat X (dan program Y)" yang menulis banyak baris dalam satu transaksi.
- `student_subject_enrollment (student_id, subject_id, academic_year_id, semester_id NULL, source)`: murid mengambil mapel itu pada tahun
  itu (`semester_id` NULL) atau hanya semester tertentu. Pola cakupan sama dengan `schedule_entry` (setahun vs semester, tidak boleh
  bertumpuk). `source`: `choice` (mapel pilihan), `religion` (pendidikan agama), `arts` (seni/prakarya satu jenis), `admin` (lainnya,
  mis. muatan lokal pilihan, program kebutuhan khusus).
- **Aturan efektif:** murid M mengambil mapel S di rombel K pada semester X bila (a) tidak ada baris partisipasi `(K, S)`, atau (b) ada dan
  M punya baris `(S, tahun K)` dengan `semester_id` NULL atau = X. Satu fungsi tunggal `takersOf(tx, {classId, semesterId, subjectIds})`
  mengembalikan `Map<subjectId, Set<studentId>> | null` (null = tidak ada mapel bermode pilihan di rombel ini, nol biaya selanjutnya).
- **Tidak bergantung pada `subject.kind`**: `kind = 'elective'` mungkin sudah diisi sekolah (2C) sebagai metadata; menjadikannya pemicu akan
  mengubah perilaku sekolah itu diam-diam. `kind` dan `religion_variant` dipakai hanya sebagai **saran UI** ("mapel ini bertanda pilihan;
  aktifkan mode pilihan?").
- **Aturan pilihan (validasi, tidak dikodekan keras):** `subject_choice_rule` per (tahun, tingkat, program opsional): `group_key`
  (`elective`, `arts`, `religion`, bebas), `min_choices`, `max_choices`, daftar mapel anggota (`subject_choice_rule_subject`), `min_offered`
  opsional. Seed saran (bukan paksaan): SMA XI-XII `elective` min 4 maks 5, ditawarkan minimal 7; seni/prakarya min 1 maks 1; agama min 1
  maks 1. **Bawaan: peringatan, bukan penolakan** (`enforce = false`); sekolah boleh menyalakan `enforce` yang membuat penyimpanan pilihan di
  luar batas ditolak 400 `choice_rule_violation`. Alasan: angka regulasi bisa berubah (bagian 5 butir 2) dan kebijakan penjurusan SMA belum
  final (K16).
- **Ganti pilihan sampai XI semester 2:** tidak dikodekan. Yang dikodekan hanya penjaga integritas: mengubah pilihan untuk semester yang
  rapor murid itu sudah final ditolak 409 `report_final` (rapor final tidak boleh berubah). Batas kebijakan sekolah opsional per aturan:
  `locked_from_semester_id` (setelah semester itu dimulai, perubahan ditolak 409 `choice_locked` kecuali pemegang `curriculum:manage`
  dengan `override: true`, tercatat di audit). Helper "ganti pilihan mulai semester X" memecah baris setahun menjadi baris per semester.
- **Pendidikan agama per murid:** setiap varian agama adalah mapel tersendiri (sudah demikian di 2C: `religion_variant` per baris `subject`).
  Rombel campuran menandai tiap varian `selected`; tombol "isi dari agama murid" membuat baris `source = religion` dengan pemetaan
  `islam→islam ... confucian→confucian`, `other→belief` hanya bila sekolah punya tepat satu mapel `belief`; murid tanpa agama atau tanpa
  pasangan dilaporkan `unmatched` (tidak ditebak). Baris eksplisit (bukan turunan langsung dari `student.religion`) supaya perubahan data
  murid tidak mengubah rapor diam-diam.
- **Paket pilihan per rombel (jalur tanpa fitur):** sekolah yang membentuk rombel per paket pilihan (seluruh rombel XI-1 mengambil Fisika,
  Kimia, Biologi, Matematika Tingkat Lanjut) **tidak perlu fitur ini**: model sekarang sudah benar. Dokumentasi dalam aplikasi
  menyarankan jalur ini sebagai yang paling sederhana; 3B untuk rombel campuran dan agama.

### 3.2 (ii) Dampak pada roster, nilai, rapor, jadwal, absensi, rollover, pembekuan

**Roster per mapel.** Fungsi baru di `attendance-lib.ts` (fungsi lama tidak diubah):
- `subjectRosterOf(tx, classId, subjectId, semesterId, {historical})` = `rosterOf`/`historicalRosterOf` ∩ `takersOf`. Dipakai: simpan skor
  (`grading.ts:1388`), daftar skor penilaian, rekap per mapel, ketercapaian TP, narasi, pendampingan/remedial, absensi per jam.
- Simpan skor untuk murid yang tidak mengambil: 400 `student_not_taking_subject` (kode baru; sekolah lama tidak pernah memicunya).
- Dorong nilai ujian CBT: murid yang tidak mengambil **dilewati** dan dihitung di `skippedNotTaking` (field sparse) alih-alih menggagalkan.

**`computeGrades`.** Parameter opsional `takers?: Map<subjectId, Set<studentId>>`. Bila diberikan, pasangan (mapel, murid) yang tidak
mengambil **tidak dimasukkan ke peta hasil** (bukan `final: null`), sehingga pemanggil yang memakai `?.final ?? null` tidak berubah dan
pembeda "tidak mengambil" vs "belum dinilai" tersedia. Rumus `finalGrade` tidak disentuh.

**Rapor.**
- `ClassContext` mendapat `takers: Map | null`. Mapel rapor per murid = `subjects.filter(s => takes(s, murid))`; dengan `takers = null`
  sama persis dengan sekarang. `buildDocument`, `liveSummary`, `completenessOf`, rata-rata (`averageOfFinals`) memakai daftar per murid.
- Kelengkapan finalisasi (`grades_incomplete`) dihitung atas mapel yang diambil murid. Murid dengan nol mapel yang diambil di suatu mapel
  pilihan tidak memicu galat.
- **Peringkat:** tetap rata-rata nilai akhir mapel yang diambil masing-masing murid (aturan sama, himpunan mapel berbeda). Konsekuensi
  ditulis di dokumentasi; `report_setting.show_rank` sudah ada bila sekolah menilai peringkat lintas pilihan tidak adil. Tidak ada
  pengaturan baru.
- **Snapshot:** bentuk dokumen tidak berubah (dokumen sudah per murid; mapel yang tidak diambil cukup tidak ada di `subjects`). Tidak ada
  kenaikan `schema_version`, tidak ada field baru di snapshot. Rapor final lama tidak dihitung ulang.
- **Matriks kelas (`/v1/grading/recap/class`):** sel untuk mapel yang tidak diambil membawa `notTaken: true` (sparse; absen untuk sekolah
  lama). Rekap per mapel hanya memuat pengambil.
- **Portal:** mapel anak = mapel rombel yang ia ambil. Tambahan baca-saja sparse `chosenSubjects?` di ringkasan anak bila ada baris pilihan.

**Penjaga final.** Menulis `student_subject_enrollment` untuk murid M pada cakupan semester X (atau setahun: semua semester tahun itu) ditolak
409 `report_final` bila rapor M pada semester itu final. Menulis `class_subject_participation` untuk rombel K ditolak 409 `report_final` bila
ada semester tahun K yang rapornya final untuk K **dan** perubahan mengubah himpunan pengambil semester itu (pemeriksaan sederhana dan
aman: tolak bila ada semester final pada tahun rombel; pesan menyarankan buka kembali).

**Pembekuan konfigurasi nilai.** Pilihan mapel adalah **data**, bukan konfigurasi rumus; tidak masuk `semester_grading_config`
(`config_version`, `matchesLive` tidak berubah). Integritas dijaga oleh penjaga `report_final` di atas dan oleh snapshot rapor.

**Jadwal: blok pilihan dan kelas gabungan.**

|                  | A. Kelompok belajar sebagai entitas baru (penilaian, jadwal, absensi per kelompok)                    | B. Tetap per rombel + jalur paralel dan kunci gabungan                                    | C. Rombel tambahan per mapel pilihan (murid ter-enroll di banyak kelas) |
| ---------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Perubahan        | Besar: `assessment.class_id`, rapor per rombel, penjaga final per kelas semua harus mengenal kelompok | Kecil: 2 kolom di `schedule_entry`, satu indeks diganti, satu pengecualian `teacher_busy` | Melanggar `enrollment_student_year_uq`; semua roster kacau              |
| Rapor/wali kelas | Harus memetakan kelompok ke rombel                                                                    | Tetap per rombel                                                                          | Rusak                                                                   |
| Risiko regresi   | Tinggi                                                                                                | Rendah                                                                                    | Sangat tinggi                                                           |

**Keputusan: B.**
- `schedule_entry.lane smallint NOT NULL DEFAULT 0`: satu slot rombel boleh punya beberapa sel pada `lane` berbeda **hanya bila** semua mapel
  di slot itu bermode `selected` di rombel itu (validasi API, 400 `parallel_requires_selected`). Indeks unik kelas diganti menjadi
  `(class_id, weekday, period_id, lane)` (dan versi semester); karena semua baris lama `lane = 0`, keunikan lama terjaga persis.
- `schedule_entry.combined_key uuid NULL`: sel di rombel berbeda dengan guru, mapel, slot, cakupan yang sama dan `combined_key` sama adalah
  **satu pertemuan gabungan**; `teacher_busy` dilewati untuk pasangan itu. Tanpa `combined_key`, `teacher_busy` persis seperti sekarang.
- Tabel `schedule_entry` tidak didump garis dasar dan tidak diisi tes garis dasar (terverifikasi), jadi kolom berdefault aman.
- Penugasan guru tetap per (rombel, mapel): guru Fisika pilihan ditugaskan di XI-1 dan XI-2. Tanpa perubahan tabel.

**Absensi per jam.** Roster sel = `subjectRosterOf(entry.classId, entry.subjectId, semester tanggal itu)`. Pertemuan gabungan: endpoint baru
`GET/PUT /v1/lesson-attendance/combined` menerima `combinedKey` + tanggal, menampilkan gabungan roster semua sel ber-kunci sama, dan menulis
baris `lesson_attendance` ke sel masing-masing murid (skema `lesson_attendance` tidak berubah). Penjaga final per murid tetap berlaku.

**Penilaian lintas rombel.** Penilaian tetap per rombel (rapor dan penjaga per rombel). Kenyamanan "buat penilaian yang sama di beberapa
rombel sekaligus" ditunda ke 3B.5 (bagian 8); sampai itu, guru membuat penilaian per rombel (perilaku sekarang).

**Rollover dan kenaikan.**
- Rollover menyalin `class_subject_participation` ke rombel hasil salinan (mapel yang sama).
- Penerapan keputusan (`promote`/`retain`) menyalin baris pilihan **setahun** murid ke tahun tujuan bila rombel tujuan juga menandai mapel
  itu `selected` (pilihan berlanjut XI ke XII). Opsi body `copySubjectChoices` (bawaan `true`); hasil melaporkan `choicesCopied` dan
  `choicesDropped` (sparse). Baris per semester tidak disalin (pilihan transisi). X ke XI tidak punya baris sumber, jadi dipilih baru.
- Penempatan otomatis ke rombel tujuan **tidak** memperhitungkan pilihan (tidak menebak); sekolah memilih `toClassId` eksplisit bila
  rombel dibentuk per paket. Ditulis jujur di dokumentasi.

### 3.3 (iii) UI pemilihan

**Keputusan: admin/kurikulum dan wali kelas menginput; portal murid/wali baca-saja.**
- Alasan: portal hanya `portal:read`/`portal:respond` (`permissions.ts:215-216`); jalur tulis murid menambah permukaan serangan, alur
  persetujuan, dan tenggat yang bervariasi per sekolah; praktik sekolah umumnya formulir kertas/rapat. Pengajuan pilihan lewat portal
  dengan persetujuan ditunda (bagian 3.9).
- Halaman **Kelas → tab "Mapel dan peserta"** (per rombel): daftar mapel rombel, sakelar "berdasarkan pilihan", matriks murid x mapel
  pilihan dengan centang (di bawah `lg`: kartu per murid berisi chip mapel), penghitung per aturan (mis. "4 dari 4-5"), peringatan aturan,
  tombol "isi dari agama murid", "salin dari tahun lalu", "ganti mulai semester".
- Halaman **Kurikulum → "Aturan pilihan"**: aturan per tingkat/program, mapel anggota, batas, `enforce`, `locked_from_semester_id`.
- Hak tulis: `curriculum:manage` (semua rombel) atau wali kelas rombel itu (pola `canViewClass`/wali); baca: `class:read`.
- Profil murid dan portal: daftar mapel yang diambil per tahun.

### 3.4 (iv) Kelulusan

**Prinsip:** kelulusan ditetapkan satuan pendidikan setelah ujian satuan pendidikan dan pertimbangan laporan kemajuan belajar (R6); tidak ada
rumus nasional (bagian 5 butir 6). Edusync menghitung **saran** angka, manusia menetapkan.

**Model (sparse: sekolah tanpa kebijakan kelulusan = alur sekarang).**
- `graduation_policy` per tahun ajaran (opsional per program): komponen dan bobot nilai ijazah dalam jsonb tervalidasi zod
  (`reportWeight`, `examWeights` per ujian, cakupan semester rapor: `final_level`/`all_levels`/daftar tingkat, pembulatan, ambang
  kehadiran opsional sebagai **saran**, teks kriteria), `skl_number_template` (mis. `{seq}/SKL/{year}`), `announce_on`. Adanya baris =
  sekolah memakai alur kelulusan formal untuk tahun itu.
- `school_exam` (ujian satuan pendidikan): nama, bentuk (`written`, `practical`, `portfolio`, `assignment`, `project`, `other`; daftar di
  kontrak, tanpa CHECK DB, pelajaran K1), tanggal. `school_exam_score`: nilai per (ujian, murid, mapel) 0-100 desimal.
- `graduation_decision` per (tahun, murid): `result` (`graduated`, `not_graduated`, `deferred`), `status` (`draft`, `final`),
  `graduated_on` (tanggal kelulusan), `skl_number`, `diploma_number` (nomor ijazah/seri, **teks diketik operator**, tanpa format dan tanpa
  pembangkit: format resmi belum diriset), `transcript` jsonb (dibekukan saat `final`: nilai rapor per semester yang dipakai, nilai ujian,
  nilai ijazah per mapel, rata-rata), `meeting_id` (berita acara), `note`.
- Nilai rapor masukan diambil **hanya dari snapshot rapor final** (`report_card.snapshot.subjects[].final`), bukan dihitung ulang dari data
  hidup; semester yang belum final dilaporkan sebagai peringatan `report_not_final` dan tidak boleh difinalkan tanpa `force` + alasan.

**Keterkaitan dengan wizard kenaikan (2A).**
- Tanpa `graduation_policy` untuk tahun itu: **identik** (keputusan `graduate` disimpan dan diterapkan seperti sekarang).
- Dengan kebijakan: penetapan final kelulusan (`POST .../graduations/finalize`) **menulis** `promotion_decision` (`graduated` → `graduate`,
  `not_graduated` → `retain`, `deferred` → tidak ditulis) bila belum diterapkan; `PUT /v1/academic-years/:id/promotions` menolak keputusan
  `graduate` yang tidak didukung penetapan final: 409 `graduation_not_determined`. Satu arah: modul kelulusan memasok keputusan; penerapan
  status `graduated` tetap **satu tempat** (penerapan kenaikan), sehingga perilaku roster historis dan peringatan
  `graduate_report_not_final` tidak berubah.
- Membuka kembali penetapan (`reopen`) ditolak 409 `promotion_applied` bila keputusan kenaikan murid itu sudah diterapkan.
- Tidak lulus/mengulang: `retain` di tingkat akhir, ditempatkan di rombel tingkat akhir tahun tujuan (lihat 3.8).
- TKA tidak pernah menjadi komponen bawaan (R9); sekolah boleh menambah ujian bernama apa pun, tetapi tidak ada kaitan ke TKA.

**Dokumen.** SKL dan transkrip dibuat PDF di klien (pola `report-card-pdf.tsx`) dari `transcript` beku dan identitas sekolah; judul dan label
masuk terjemahan. Ijazah **tidak dicetak** Edusync (blanko/format resmi di luar cakupan dan belum diverifikasi); hanya nomornya dicatat.
Akreditasi (C22) dicatat sebagai teks di identitas sekolah bila diperlukan SKL (ditunda; SKL tanpa akreditasi tetap dapat dicetak).

### 3.5 (v) Mutasi murid

**Model.**
- `student_transfer`: `direction` (`in`, `out`), `effective_on`, `academic_year_id`, `class_id` (rombel saat keluar / rombel penempatan saat
  masuk), `reason` (kode: `parent_relocation`, `school_choice`, `other`; daftar di kontrak) + `reason_note`, `counterpart_school_name`,
  `counterpart_npsn` (teks, 8 digit bila diisi), `letter_number`, `letter_date`, `document_file_id` (surat pindah/persetujuan, `school_file`),
  `departure_document` jsonb (dokumen rapor draf yang dibekukan saat keluar, lihat bawah), `exception_reason` (lihat larangan), `created_by`.
- `enrollment_change`: riwayat pindah rombel dalam tahun: `student_id`, `academic_year_id`, `from_class_id`, `to_class_id`, `effective_on`,
  `reason`, `actor`. Ditulis oleh `placeStudent` setiap kali `class_id` berubah (aditif; tabel `enrollment` tidak diubah).

**Alur keluar (`POST /v1/students/:id/transfer-out`):** dalam satu transaksi: validasi larangan; bekukan dokumen rapor draf semester berjalan
ke `departure_document` (salinan `buildDocument` apa adanya, bukan baris `report_card`, karena satu baris final di `report_card` mengunci
seluruh rombel; ini bukan "rapor final" melainkan "keterangan nilai saat pindah"); set `student.status = 'transferred'`; enrollment
**tidak dihapus**. Murid `dropped` memakai alur yang sama dengan `reason = dropped` (`direction = out`) dan status `dropped`.

**Alur masuk (`POST /v1/students/transfer-in`):** membuat murid (atau memakai murid hasil SPMB) + penempatan + baris `direction = in` dengan
sekolah asal. Nilai sekolah asal: **berkas lampiran** (rapor asal), bukan impor angka (impor angka ditunda; format sumber tidak seragam).

**Larangan (S4, resmi):** mekanisme pindahan tidak berlaku pada semester genap tingkat akhir (VI, IX, XII, XII/XIII sesuai
`program.final_level_code`). Bawaan: transfer masuk dan keluar pada semester terakhir tahun ajaran untuk murid di rombel tingkat akhir ditolak
409 `transfer_final_level_even_semester`. Pengecualian dengan `exception_reason` wajib, hanya pemegang `school:manage`, tercatat audit
(**perlu konfirmasi**, bagian 10.2). `dropped` (putus sekolah) tidak terkena larangan.

**Efek ke roster historis dan rapor.**
- Fungsi baru `semesterRosterOf(tx, classId, semester)` untuk pembacaan/finalisasi rapor: `historicalRosterOf` **ditambah** murid
  `transferred`/`dropped` yang punya `student_transfer.direction = out` dengan `effective_on > semester.ends_on` dan enrollment tahun itu di
  rombel tersebut (ikut sepanjang semester itu, jadi rapornya tetap tampil, bisa dibuka kembali dan difinalkan ulang), **dikurangi/ditambah**
  menurut `enrollment_change` (murid yang pindah rombel setelah semester berakhir tetap tercatat di rombel lama untuk semester itu).
- Tanpa baris `student_transfer`/`enrollment_change` hasilnya sama persis dengan `historicalRosterOf` (sekolah lama identik; murid
  `transferred` lama tanpa catatan tetap dikecualikan seperti sekarang).
- Daftar rapor kelas (`GET /v1/report-cards`) memakai `semesterRosterOf`; selain itu tetap.
- Jalur tulis operasional (`rosterOf`) tidak berubah: murid pindah tidak bisa dinilai lagi.

**Pindah rombel dalam tahun (`PUT /v1/students/:id/class`):** tambah penjaga: ditolak 409 `report_final` bila rapor murid itu final pada
**semester yang sedang berjalan** (semester yang memuat hari ini) di rombel lama atau baru; selalu menulis `enrollment_change`. Ini perubahan
perilaku kecil (sebelumnya selalu diterima) yang memenuhi janji roadmap fase 1 ("pindah kelas siswa" di daftar jalur yang dijaga); dicatat di
CHANGELOG. Body opsional `effectiveOn`, `reason`.

### 3.6 (vi) Legger dan berita acara musyawarah dewan pendidik

**Legger** (tanpa tabel): `GET /v1/report-cards/ledger?semesterId&classId` (satu semester) atau `?academicYearId&classId` (dua semester
berdampingan). Baris per murid (pakai `semesterRosterOf`): nilai akhir per mapel (dari snapshot bila final, hidup bila draf, ditandai),
`notTaken` untuk mapel tak diambil, rata-rata, peringkat (bila `show_rank`), ketidakhadiran, ekskul, keputusan kenaikan/kelulusan bila ada.
Unduhan XLSX/CSV dan PDF dibuat di klien. Izin sama dengan daftar rapor (`report_card:read` + hak lihat kelas).

**Berita acara:** `council_meeting` (tahun, semester opsional, `kind`: `promotion`, `graduation`, `other`; `held_on`, `location`,
`chair_name`, `secretary_name`, `agenda`, `summary`, `status` draft/final, `finalized_at`) dan `council_meeting_attendee` (guru dari
`teacher` atau nama bebas, peran: `chair`/`secretary`/`member`, `signed`). Keputusan dibungkus lewat kolom baru **nullable**
`promotion_decision.meeting_id` dan `graduation_decision.meeting_id`. Isi berita acara (daftar murid tinggal kelas/tidak lulus beserta
alasan, rekap jumlah) diturunkan saat dibaca dan **dibekukan** ke `council_meeting.minutes` jsonb saat final; final mengunci keterkaitan
(mengubah keputusan yang tertaut ke berita acara final: 409 `meeting_final`). `meeting_date` lama tetap ada; bila `meeting_id` diisi,
`meeting_date` diisi otomatis dari `held_on` untuk konsistensi.

### 3.7 (vii) Ekspor minimal e-Rapor/Dapodik/EMIS

**Fakta jujur:** format impor e-Rapor/Dapodik/EMIS yang **benar-benar diterima** belum diverifikasi (regulasi-umum G9 sekunder, G10 belum
diriset; regulasi-madrasah G6). Karena itu: **ekspor generik terdokumentasi, tanpa klaim kompatibilitas**, dengan kode identitas yang
memudahkan pemetaan manual (NPSN sekolah, NISN, NIS, kode mapel sekolah, `ref_subject` kode acuan bila ada).

- `GET /v1/exports/academic?academicYearId&semesterId&dataset=…&format=csv|json` dengan dataset: `rombel` (rombel, tingkat, program, wali
  kelas, anggota: NISN, NIS, nama, JK, tanggal lahir), `class_subjects` (rombel x mapel: kode, nama, kelompok, guru, JP alokasi, mode
  pilihan), `subject_choices` (murid x mapel bila mode pilihan), `final_grades` (nilai akhir dan predikat per murid-mapel **hanya dari rapor
  final**; draf hanya dengan `includeDraft=true` dan kolom `status`), `descriptions` (deskripsi capaian dari snapshot).
- CSV UTF-8 dengan BOM, pemisah `;` (Excel lokal Indonesia), header berkode stabil berbahasa Inggris + dokumen kamus kolom di halaman bantuan.
  Nama format `edusync-academic-v1`; perubahan kolom = versi baru.
- NIK **tidak** disertakan secara bawaan; `includeNik=true` hanya untuk pemegang `student:manage` dan tercatat audit (**perlu konfirmasi**).
- Batas ukuran: dialirkan per halaman 1.000 baris; satu tahun satu sekolah jauh di bawah itu.

### 3.8 (viii) Tinggal kelas administratif

Sudah ada: keputusan `retain` per murid, alasan, tindak lanjut, tanggal rapat, enrollment per tahun (riwayat lintas tahun utuh). Yang ditambah:
- **Tingkat akhir:** rollover menerima `copyFinalLevelForRetained` (bawaan `true`): kelas tingkat akhir disalin **hanya bila** ada keputusan
  `retain` (atau `not_graduated`) di tingkat akhir untuk kelas itu, dengan nama sama. Tanpa keputusan semacam itu hasil rollover sama dengan
  sekarang (tes rollover lama hijau).
- **Riwayat rombel:** `GET /v1/students/:id/academic-history`: per tahun ajaran: rombel (dan perpindahan dari `enrollment_change`), keputusan
  kenaikan/kelulusan, status rapor per semester, mutasi. Ditampilkan di profil murid (kartu linimasa, nyaman di ponsel).
- Nilai tahun yang diulang tetap utuh (rapor per (semester, murid) dan semester berbeda tiap tahun; tidak ada penimpaan).
- "Naik dengan catatan/pendampingan": tetap `promote` + `follow_up` (sudah ada); tidak ada nilai keputusan baru.

### 3.9 (ix) Yang sengaja ditunda

| Butir                                                                                                                                  | Alasan                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Pengajuan pilihan mapel oleh murid/wali di portal dengan persetujuan                                                                   | Permukaan tulis portal baru; alur kertas sudah lazim; perlu data pemakaian 3B dulu                    |
| Kelompok belajar lintas rombel sebagai entitas penuh (penilaian dan rapor per kelompok)                                                | Perombakan besar; opsi B cukup                                                                        |
| Penempatan otomatis rombel dari paket pilihan                                                                                          | Menebak; berisiko                                                                                     |
| Impor nilai angka dari sekolah asal                                                                                                    | Format sumber tidak seragam                                                                           |
| Pencetakan ijazah, verifikasi ijazah daring, pembangkit nomor seri                                                                     | Format resmi belum diriset                                                                            |
| Sinkron langsung e-Rapor/Dapodik/EMIS/RDM, impor Dapodik                                                                               | Skema belum terverifikasi                                                                             |
| TKA sebagai data murid (regulasi C19)                                                                                                  | P3                                                                                                    |
| Penjurusan SMA                                                                                                                         | Kebijakan belum final (K16)                                                                           |
| FK komposit pada tabel lama tanpa `UNIQUE (school_id, id)` (`enrollment`, `teaching_assignment`, `report_card`, `promotion_decision`)  | Prinsip roadmap; tabel baru merujuk lewat `student`/`class_room`/`subject`/`academic_year`/`semester` |

---

## 4. Skema, kontrak API, guard

Konvensi semua tabel baru (dari 0100): `id uuid PRIMARY KEY DEFAULT uuidv7()`, `school_id uuid NOT NULL REFERENCES school(id)`,
`CONSTRAINT <t>_school_id_uq UNIQUE (school_id, id)`, FK komposit `(school_id, x_id) REFERENCES x(school_id, id)` (NO ACTION), lalu
`ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, `CREATE POLICY tenant_isolation …` (salin persis dari 0100), `GRANT SELECT,
INSERT, UPDATE, DELETE … TO edusync_app`. CHECK panjang teks seperti 0100. Hanya DDL; tidak ada backfill (bawaan kolom tidak melewati RLS).
`when` jurnal: +86.400.000 per migrasi dari 1796866200000 (0101 = 1796952600000, dst.).

### 4.1 Migrasi 0101 `subject_participation` (3B.1)

```
class_subject_participation
  id, school_id, class_id uuid NOT NULL, subject_id uuid NOT NULL,
  mode text NOT NULL DEFAULT 'selected'  CHECK (mode IN ('selected')),
  updated_by text NOT NULL, created_at, updated_at
  UNIQUE (class_id, subject_id); FK (school_id,class_id)->class_room, (school_id,subject_id)->subject
  INDEX (school_id, class_id)

student_subject_enrollment
  id, school_id, student_id uuid NOT NULL, subject_id uuid NOT NULL, academic_year_id uuid NOT NULL,
  semester_id uuid NULL, source text NOT NULL CHECK (source IN ('choice','religion','arts','admin')),
  note text NULL CHECK (char_length<=500), created_by text NOT NULL, created_at, updated_at
  UNIQUE INDEX (student_id, subject_id, academic_year_id) WHERE semester_id IS NULL
  UNIQUE INDEX (student_id, subject_id, semester_id)      WHERE semester_id IS NOT NULL
  FK komposit ke student, subject, academic_year, semester
  INDEX (school_id, academic_year_id, subject_id); INDEX (school_id, student_id)
  (larangan tumpuk setahun vs semester divalidasi API dalam transaksi, seperti jadwal; semester harus milik tahun itu: API)

subject_choice_rule
  id, school_id, academic_year_id NOT NULL, level_code text NOT NULL, program_id uuid NULL,
  group_key text NOT NULL CHECK (char_length 1..40), label text NOT NULL,
  min_choices int NULL, max_choices int NULL, min_offered int NULL,
  enforce boolean NOT NULL DEFAULT false, locked_from_semester_id uuid NULL, created_at, updated_at
  CHECK (min_choices IS NULL OR max_choices IS NULL OR min_choices <= max_choices), CHECK nilai >= 0
  UNIQUE INDEX (school_id, academic_year_id, level_code, COALESCE(program_id, nil-uuid), group_key)
  FK komposit ke academic_year, program, semester

subject_choice_rule_subject
  id, school_id, rule_id uuid NOT NULL, subject_id uuid NOT NULL
  UNIQUE (rule_id, subject_id); FK (school_id, rule_id) ON DELETE CASCADE, (school_id, subject_id) NO ACTION
```

### 4.2 Migrasi 0102 `schedule_parallel` (3B.3)

```
ALTER TABLE schedule_entry ADD COLUMN lane smallint NOT NULL DEFAULT 0  CHECK (lane BETWEEN 0 AND 9);
ALTER TABLE schedule_entry ADD COLUMN combined_key uuid NULL;
-- ganti dua indeks unik slot kelas (keunikan lama terjaga karena semua baris lama lane = 0):
CREATE UNIQUE INDEX schedule_class_slot_year_lane_uq ON schedule_entry (class_id, weekday, period_id, lane) WHERE semester_id IS NULL;
CREATE UNIQUE INDEX schedule_class_slot_sem_lane_uq  ON schedule_entry (semester_id, class_id, weekday, period_id, lane) WHERE semester_id IS NOT NULL;
DROP INDEX schedule_class_slot_year_uq; DROP INDEX schedule_class_slot_sem_uq;
-- indeks guru TETAP (guru satu sel per slot per cakupan); sel gabungan = satu guru di beberapa rombel, jadi indeks guru diganti juga:
CREATE UNIQUE INDEX schedule_teacher_slot_year_comb_uq ON schedule_entry (academic_year_id, teacher_id, weekday, period_id, COALESCE(combined_key, id)) WHERE semester_id IS NULL;
(+ versi semester), lalu DROP dua indeks guru lama.
CREATE INDEX schedule_entry_combined_idx ON schedule_entry (school_id, combined_key) WHERE combined_key IS NOT NULL;
```
Catatan: ini satu-satunya DROP dalam rancangan (indeks, bukan kolom/tabel), setara penggantian constraint jadwal di fase 1. Dibuat sebelum
dihapus dalam satu migrasi transaksional. Drizzle `schema.ts` diperbarui agar `db:generate` tidak berbeda.

### 4.3 Migrasi 0103 `student_mobility` (3C.1)

```
student_transfer
  id, school_id, student_id NOT NULL, direction text NOT NULL CHECK IN ('in','out'),
  kind text NOT NULL DEFAULT 'transfer' CHECK IN ('transfer','dropped'),
  effective_on date NOT NULL, academic_year_id NOT NULL, class_id uuid NULL,
  reason text NOT NULL (daftar di kontrak, tanpa CHECK), reason_note text NULL (<=1000),
  counterpart_school_name text NULL (<=200), counterpart_npsn text NULL CHECK (NULL OR ~ '^[0-9]{8}$'),
  letter_number text NULL, letter_date date NULL, document_file_id uuid NULL REFERENCES school_file(id) ON DELETE SET NULL,
  departure_document jsonb NULL, exception_reason text NULL, created_by text NOT NULL, created_at
  CHECK (direction = 'out' OR kind = 'transfer')
  FK komposit ke student, academic_year, class_room
  INDEX (school_id, student_id); INDEX (school_id, academic_year_id, direction)

enrollment_change
  id, school_id, student_id NOT NULL, academic_year_id NOT NULL, from_class_id NULL, to_class_id NULL,
  effective_on date NOT NULL, reason text NULL (<=500), actor_id text NULL, created_at
  CHECK (from_class_id IS DISTINCT FROM to_class_id)
  FK komposit ke student, academic_year, class_room (dua)
  INDEX (school_id, academic_year_id, from_class_id); INDEX (school_id, academic_year_id, to_class_id); INDEX (school_id, student_id)
```

### 4.4 Migrasi 0104 `council_meeting` (3C.3)

```
council_meeting
  id, school_id, academic_year_id NOT NULL, semester_id NULL,
  kind text NOT NULL CHECK IN ('promotion','graduation','other'), title text NOT NULL (1..160),
  held_on date NOT NULL, location text NULL, chair_name text NULL, secretary_name text NULL,
  agenda text NULL (<=4000), summary text NULL (<=8000), minutes jsonb NULL,
  status text NOT NULL DEFAULT 'draft' CHECK IN ('draft','final'), finalized_at timestamptz NULL, finalized_by text NULL,
  created_by text NOT NULL, created_at, updated_at
  CHECK (status = 'draft' OR minutes IS NOT NULL)
  INDEX (school_id, academic_year_id)

council_meeting_attendee
  id, school_id, meeting_id NOT NULL, teacher_id NULL, name text NOT NULL (1..160),
  role text NOT NULL CHECK IN ('chair','secretary','member'), sort int NOT NULL DEFAULT 0
  FK (school_id, meeting_id) ON DELETE CASCADE; (school_id, teacher_id) NO ACTION

ALTER TABLE promotion_decision ADD COLUMN meeting_id uuid NULL;
ALTER TABLE promotion_decision ADD CONSTRAINT promotion_decision_meeting_fk
  FOREIGN KEY (school_id, meeting_id) REFERENCES council_meeting(school_id, id);   -- NO ACTION; NULL = perilaku sekarang
CREATE INDEX promotion_decision_meeting_idx ON promotion_decision (school_id, meeting_id) WHERE meeting_id IS NOT NULL;
```
`promotion_decision` tidak didump garis dasar dan tidak diisi tes garis dasar (terverifikasi), jadi kolom nullable aman.

### 4.5 Migrasi 0105 `graduation` (3C.4)

```
graduation_policy
  id, school_id, academic_year_id NOT NULL, program_id NULL,
  config jsonb NOT NULL (zod: reportWeight, examWeights{examId:weight}, reportScope, rounding, minAttendancePercent?, criteriaText?),
  config_version int NOT NULL DEFAULT 1, skl_number_template text NULL, announce_on date NULL, created_at, updated_at
  UNIQUE INDEX (school_id, academic_year_id, COALESCE(program_id, nil-uuid))

school_exam
  id, school_id, academic_year_id NOT NULL, name text NOT NULL (1..120), form text NOT NULL (daftar di kontrak),
  starts_on date NULL, ends_on date NULL, created_at, updated_at   CHECK (starts_on <= ends_on)

school_exam_score
  id, school_id, exam_id NOT NULL, student_id NOT NULL, subject_id NOT NULL,
  value numeric(5,2) NULL CHECK (value IS NULL OR value BETWEEN 0 AND 100), note text NULL, updated_by text NOT NULL, updated_at
  UNIQUE (exam_id, student_id, subject_id); FK (school_id, exam_id) NO ACTION, ke student, subject
  INDEX (school_id, exam_id, subject_id)

graduation_decision
  id, school_id, academic_year_id NOT NULL, student_id NOT NULL, class_id NOT NULL,
  result text NULL CHECK (NULL OR IN ('graduated','not_graduated','deferred')),
  status text NOT NULL DEFAULT 'draft' CHECK IN ('draft','final'),
  graduated_on date NULL, skl_number text NULL, diploma_number text NULL, transcript jsonb NULL, meeting_id uuid NULL,
  note text NULL, decided_by text NULL, finalized_at timestamptz NULL, updated_at
  UNIQUE (academic_year_id, student_id)
  CHECK (status = 'draft' OR (result IS NOT NULL AND transcript IS NOT NULL))
  CHECK (result IS DISTINCT FROM 'graduated' OR status = 'draft' OR graduated_on IS NOT NULL)
  UNIQUE INDEX (school_id, skl_number) WHERE skl_number IS NOT NULL
  UNIQUE INDEX (school_id, diploma_number) WHERE diploma_number IS NOT NULL
  FK komposit ke academic_year, student, class_room, council_meeting
```

### 4.6 Izin, modul, peran bawaan

| Izin baru               | Arti                                                            | Peran bawaan                                                                                           |
| ----------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `subject_choice:manage` | Mode partisipasi, pilihan murid, aturan pilihan                 | `school_admin`, `curriculum`, `operator` (wali kelas: hak kontekstual tanpa izin ini, hanya rombelnya) |
| `graduation:manage`     | Kebijakan, ujian satuan pendidikan, nilai ujian, penetapan, SKL | `school_admin`, `curriculum`                                                                           |
| `graduation:read`       | Baca kelulusan, transkrip                                       | `school_admin`, `curriculum`, `principal`, `operator`                                                  |
| `data_export:run`       | Ekspor akademik                                                 | `school_admin`, `curriculum`, `operator`                                                               |

Mutasi memakai `student:manage` (sudah: admin, operator); riwayat akademik `student:read`; berita acara memakai `promotion:manage` (tulis)
dan `report_card:read_all` (baca, termasuk kepala sekolah); legger memakai hak daftar rapor. Modul: kelulusan, legger, nilai ujian, ekspor
`final_grades`/`descriptions` → `grades`; pilihan mapel, mutasi, berita acara, ekspor rombel → tanpa modul (inti, seperti `promotion`).
Izin baru masuk `PERMISSIONS` dan `SYSTEM_ROLES`, sampai ke sekolah lama lewat `syncSystemRolePermissions` (tanpa SQL ke tabel peran).

### 4.7 Perubahan kontrak API

| Tahap | Endpoint                                                                                                                                | Izin; modul                                                    | Perubahan                                                                      | Galat baru                                                                                                                            |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 3B.1  | `GET/PUT /v1/classes/:id/subject-participation` (baru)                                                                                  | `class:read` / `subject_choice:manage` atau wali kelas         | daftar mapel rombel + `mode`; tulis batch                                      | 409 `report_final`                                                                                                                    |
| 3B.1  | `GET/PUT /v1/classes/:id/subject-choices` (baru)                                                                                        | sama                                                           | matriks murid x mapel bermode pilihan; tulis batch (`semesterId?`, `source`)   | 400 `subject_not_selected_mode`, `choice_rule_violation` (hanya bila `enforce`), `scope_overlap`; 409 `report_final`, `choice_locked` |
| 3B.1  | `POST /v1/classes/:id/subject-choices/from-religion` (baru)                                                                             | sama                                                           | isi dari agama murid; hasil `created`, `unmatched[]`                           | -                                                                                                                                     |
| 3B.1  | `GET/POST/PUT/DELETE /v1/subject-choice-rules` (baru)                                                                                   | `subject:read` / `subject_choice:manage`                       | aturan + mapel anggota                                                         | 400 `invalid_reference`                                                                                                               |
| 3B.2  | `PUT /v1/assessments/:id/scores`                                                                                                        | tetap                                                          | murid tak mengambil ditolak                                                    | 400 `student_not_taking_subject`                                                                                                      |
| 3B.2  | `GET /v1/assessments/:id/scores`, `/v1/grading/recap`, `/v1/grading/objective-achievement`, narasi, pendampingan                        | tetap                                                          | roster = pengambil                                                             | -                                                                                                                                     |
| 3B.2  | `GET /v1/grading/recap/class`                                                                                                           | tetap                                                          | sel `notTaken?: true` (sparse)                                                 | -                                                                                                                                     |
| 3B.2  | `GET /v1/report-cards`, `/:studentId`, `POST /finalize`                                                                                 | tetap                                                          | mapel, rata-rata, kelengkapan per murid                                        | -                                                                                                                                     |
| 3B.2  | `POST /v1/exams/:id/grades`                                                                                                             | tetap                                                          | `skippedNotTaking?` (sparse)                                                   | -                                                                                                                                     |
| 3B.2  | Portal ringkasan anak dan nilai                                                                                                         | tetap                                                          | mapel yang diambil; `chosenSubjects?`                                          | -                                                                                                                                     |
| 3B.3  | `PUT /v1/schedule/cell`                                                                                                                 | tetap                                                          | `lane?` (0..9, bawaan 0), `combinedKey?`                                       | 400 `parallel_requires_selected`, `combined_mismatch`                                                                                 |
| 3B.3  | `GET /v1/schedule…`                                                                                                                     | tetap                                                          | `lane`, `combinedKey` hanya bila bukan bawaan (sparse)                         | -                                                                                                                                     |
| 3B.4  | `GET/PUT /v1/lesson-attendance/combined` (baru)                                                                                         | `attendance:read`/`attendance:manage` + pengampu; `attendance` | roster gabungan, tulis ke sel masing-masing                                    | 409 `report_final`                                                                                                                    |
| 3B.4  | rute absensi per jam lama                                                                                                               | tetap                                                          | roster = pengambil                                                             | -                                                                                                                                     |
| 3B.4  | `POST /v1/academic-years/:id/rollover`, `/promotions/apply`                                                                             | tetap                                                          | `copySubjectChoices?` (bawaan true); hasil `choicesCopied?`, `choicesDropped?` | -                                                                                                                                     |
| 3C.1  | `POST /v1/students/:id/transfer-out`, `POST /v1/students/transfer-in`, `GET /v1/students/:id/transfers` (baru)                          | `student:manage` / `student:read`                              | mutasi                                                                         | 409 `transfer_final_level_even_semester`, `student_not_active`; 403 `exception_requires_school_manage`                                |
| 3C.1  | `PUT /v1/students/:id/class`                                                                                                            | tetap                                                          | `effectiveOn?`, `reason?`; tulis riwayat                                       | **409 `report_final`** (perilaku baru)                                                                                                |
| 3C.1  | `GET /v1/students/:id/academic-history` (baru)                                                                                          | `student:read`                                                 | riwayat rombel, keputusan, rapor, mutasi                                       | -                                                                                                                                     |
| 3C.1  | `GET /v1/report-cards`                                                                                                                  | tetap                                                          | roster = `semesterRosterOf`                                                    | -                                                                                                                                     |
| 3C.2  | `GET /v1/report-cards/ledger` (baru)                                                                                                    | `report_card:read` + hak lihat kelas; `grades`                 | legger                                                                         | 400 `invalid_reference`                                                                                                               |
| 3C.3  | `GET/POST/PUT /v1/council-meetings`, `POST /:id/finalize`, `POST /:id/reopen` (baru)                                                    | `promotion:manage` / `report_card:read_all`                    | berita acara                                                                   | 409 `meeting_final`                                                                                                                   |
| 3C.3  | `PUT /v1/academic-years/:id/promotions`                                                                                                 | tetap                                                          | `meetingId?` per baris                                                         | 409 `meeting_final`; 400 `invalid_reference`                                                                                          |
| 3C.3  | `POST /v1/academic-years/:id/rollover`                                                                                                  | tetap                                                          | `copyFinalLevelForRetained?` (bawaan true)                                     | -                                                                                                                                     |
| 3C.4  | `GET/PUT /v1/academic-years/:id/graduation-policy`, `…/school-exams` (CRUD), `PUT /v1/school-exams/:id/scores` (baru)                   | `graduation:read`/`graduation:manage`; `grades`                | kebijakan, ujian, nilai                                                        | 409 `graduation_final`                                                                                                                |
| 3C.4  | `GET /v1/academic-years/:id/graduations`, `PUT …/graduations` (draf), `POST …/graduations/finalize`, `POST …/graduations/reopen` (baru) | sama                                                           | saran angka, penetapan, transkrip beku, menulis keputusan kenaikan             | 409 `report_not_final` (tanpa `force`), `promotion_applied`, `graduation_final`; 400 `not_final_level`                                |
| 3C.4  | `PUT /v1/academic-years/:id/promotions`                                                                                                 | tetap                                                          | bila ada kebijakan kelulusan                                                   | 409 `graduation_not_determined`                                                                                                       |
| 3C.5  | `GET /v1/exports/academic` (baru)                                                                                                       | `data_export:run` (+ `grades` untuk dataset nilai)             | CSV/JSON                                                                       | 400 `dataset_requires_module`                                                                                                         |

Semua respons lama: field baru sparse (absen bila fitur tak dipakai), sehingga `phase3-baseline` tidak perlu `ADDITIVE_KEYS`.

### 4.8 Perubahan guard

| Guard                                                        | Di mana                                  | Aturan                                                           |
| ------------------------------------------------------------ | ---------------------------------------- | ---------------------------------------------------------------- |
| `assertStudentsReportNotFinal`                               | tulis pilihan murid                      | per semester cakupan (setahun = semua semester tahun itu)        |
| `assertClassYearHasNoFinal` (baru, di `report-lock-lib.ts`)  | tulis mode partisipasi rombel            | tolak bila ada semester tahun rombel yang final untuk rombel itu |
| `assertStudentsReportNotFinal` (semester berjalan)           | `PUT /v1/students/:id/class`             | rombel lama dan baru                                             |
| `assertStudentsReportNotFinalOnDate`                         | absensi gabungan                         | sama dengan absensi per jam sekarang                             |
| `assertGraduationNotFinal` (baru)                            | nilai ujian satuan pendidikan, kebijakan | 409 `graduation_final` bila ada penetapan final tahun itu        |
| `assertMeetingNotFinal` (baru)                               | keputusan kenaikan/kelulusan tertaut     | 409 `meeting_final`                                              |
| `promotion_applied` (ada)                                    | buka kembali kelulusan                   | sudah diterapkan → tolak                                         |

---

## 5. Dampak per modul dan daftar berkas

| Modul                  | Dampak                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| Struktur akademik      | Tab mapel dan peserta per rombel; aturan pilihan; salinan mode pada rollover              |
| Penilaian              | Roster per mapel di semua jalur tulis/baca nilai; `takers` di `computeGrades`             |
| Rapor                  | Mapel per murid; `semesterRosterOf`; legger; snapshot tidak berubah bentuk                |
| Jadwal/absensi per jam | `lane`, `combinedKey`, roster pengambil, sesi gabungan                                    |
| Kenaikan               | Salin pilihan; kelas tingkat akhir untuk yang mengulang; `meetingId`; integrasi kelulusan |
| Murid                  | Mutasi, riwayat rombel, penjaga pindah rombel                                             |
| Portal                 | Mapel yang diambil; tanpa tulis baru                                                      |
| Ujian CBT              | Lewati non-pengambil saat dorong nilai                                                    |

**Berkas (perkiraan, untuk agen `developer`):**
- DB: `packages/db/src/schema.ts`, `packages/db/drizzle/0101..0105_*.sql`, `meta/_journal.json`, `packages/db/src/index.ts` (ekspor).
- Kontrak: `packages/contracts/src/permissions.ts`, baru `subject-choice.ts`, `graduation.ts` (zod `config`, `transcript`), `transfer.ts`,
  `export.ts`; `report-document.ts` tidak berubah.
- API lib: `attendance-lib.ts` (`subjectRosterOf`, `semesterRosterOf`), baru `subject-choice-lib.ts` (`takersOf`, validasi aturan), `grading-lib.ts`
  (`takers`), `report-card-lib.ts`, `portal-lib.ts`, `report-lock-lib.ts`, baru `graduation-lib.ts`, `transfer-lib.ts`, `ledger-lib.ts`,
  `export-lib.ts`.
- API rute: `academic-structure.ts`, baru `subject-choices.ts`, `grading.ts`, `report-card.ts`, `report-card-narratives.ts`,
  `learning-support.ts`, `exam-scores.ts`, `schedule.ts`, `lesson-attendance.ts`, `promotion.ts`, `people.ts`, `admissions.ts` (penempatan
  lewat `placeStudent` menulis riwayat), baru `transfers.ts`, `council-meetings.ts`, `graduation.ts`, `exports.ts`, `portal.ts`.
- Tes: `tenant-isolation.test.ts`, `rbac-matrix` (berkas tes matriks izin), baru `subject-choice.test.ts`, `schedule-parallel.test.ts`,
  `transfer.test.ts`, `council-meeting.test.ts`, `graduation.test.ts`, `export.test.ts`, `ledger.test.ts`.
- Web: `apps/web/src/app/(app)/classes` (tab peserta), `curriculum` (aturan pilihan), `schedule` (lajur paralel dan gabungan), `lessons`
  (sesi gabungan), `grades`, `report-cards` (legger, PDF SKL/transkrip pakai pola `report-cards/pdf`), `promotion` (berita acara, kelulusan),
  `students` (mutasi, riwayat), `portal` (mapel diambil), `docs` (bantuan id/en/su), `src/lib/api-types.ts`; `docs/FITUR-EDUSYNC.md`,
  `CHANGELOG`.

---

## 6. Strategi uji

### 6.1 Skenario regresi wajib

| #   | Skenario                                                                                                                                                                                                                                                               | Tes                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| T1  | **Garis dasar utuh**: `phase3-baseline.test.ts` tanpa perubahan berkas dan fixture, hijau setelah setiap tahap                                                                                                                                                         | yang ada                                                                               |
| T2  | Sekolah tanpa pilihan: kueri tambahan `takersOf` mengembalikan `null`; rekap, matriks, rapor, portal sama; jadwal dan absensi per jam sama                                                                                                                             | `subject-choice.test.ts` (perbandingan sebelum/sesudah menyalakan lalu mematikan mode) |
| T3  | Roster per mapel: skor non-pengambil 400; rekap hanya pengambil; matriks `notTaken`; rapor murid tanpa mapel itu; kelengkapan finalisasi tanpa `force`; peringkat atas mapel sendiri                                                                                   | `subject-choice.test.ts`                                                               |
| T4  | Pilihan per semester: ganti di semester 2; rapor semester 1 final tidak berubah; tulis semester final 409                                                                                                                                                              | idem                                                                                   |
| T5  | Agama: isi dari agama murid, `unmatched`                                                                                                                                                                                                                               | idem                                                                                   |
| T6  | Jadwal: lajur paralel hanya mapel `selected`; gabungan lintas rombel lolos `teacher_busy`, tanpa kunci tetap 409; tes jadwal lama hijau                                                                                                                                | `schedule-parallel.test.ts`, `schedule.test.ts`                                        |
| T7  | Absensi gabungan menulis ke sel masing-masing; penjaga final per murid                                                                                                                                                                                                 | `lesson-attendance`                                                                    |
| T8  | Rollover dan penerapan: mode tersalin, pilihan setahun berlanjut, `copySubjectChoices=false`; tes rollover lama hijau                                                                                                                                                  | `promotion.test.ts` + baru                                                             |
| T9  | Mutasi keluar: status, dokumen keberangkatan, rapor final semester lalu tetap di daftar kelas dan bisa difinalkan ulang setelah buka kembali; larangan semester genap tingkat akhir dan pengecualian `school:manage`                                                   | `transfer.test.ts`, `graduate-roster.test.ts` tetap hijau                              |
| T10 | Pindah rombel: riwayat tercatat, 409 saat final semester berjalan, rapor semester lalu tetap di rombel lama                                                                                                                                                            | `transfer.test.ts`                                                                     |
| T11 | Kelulusan: tanpa kebijakan = alur lama; dengan kebijakan: saran angka dari snapshot final, `report_not_final`, finalisasi membekukan transkrip dan menulis keputusan kenaikan, `graduation_not_determined`, buka kembali setelah diterapkan 409, nomor SKL/ijazah unik | `graduation.test.ts`, `promotion.test.ts`                                              |
| T12 | Tinggal kelas tingkat akhir: rollover membuat kelas tingkat akhir hanya bila ada `retain`; penerapan menempatkan                                                                                                                                                       | `promotion.test.ts`                                                                    |
| T13 | Berita acara: final membekukan `minutes`, keputusan tertaut terkunci, buka kembali                                                                                                                                                                                     | `council-meeting.test.ts`                                                              |
| T14 | Legger: nilai dari snapshot bila final; kolom tidak diambil                                                                                                                                                                                                            | `ledger.test.ts`                                                                       |
| T15 | Ekspor: tanpa NIK bawaan, nilai hanya final, kamus kolom stabil, modul                                                                                                                                                                                                 | `export.test.ts`                                                                       |
| T16 | Multi-tenant: setiap tabel baru di `tenant-isolation.test.ts`; FK komposit menolak id sekolah lain                                                                                                                                                                     | yang ada + daftar                                                                      |
| T17 | RBAC: setiap rute baru di matriks; wali kelas hanya rombelnya; guru tanpa izin 403                                                                                                                                                                                     | `rbac-matrix`                                                                          |
| T18 | Portal: anak melihat mapel yang diambil; wali tidak bisa menulis pilihan                                                                                                                                                                                               | `portal.test.ts`                                                                       |
| T19 | Suite wajib roadmap: `grading`, `report-card`, `schedule`, `pkl`, `rbac-matrix`, `tenant-isolation`, `promotion`, `grading-freeze`, `portal`, `exam-scores`                                                                                                            | yang ada                                                                               |
| T20 | UI: 375 px dan 768 px, mode gelap, tiga bahasa, untuk tab peserta, jadwal lajur, mutasi, legger, kelulusan                                                                                                                                                             | uji peramban manual + tangkapan                                                        |

### 6.2 Tes lama yang berubah

| Tes                                                                                   | Perubahan                                                                                                                                                                          |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tes yang menegaskan `PUT /v1/students/:id/class` diterima saat rapor final (bila ada) | Kini 409 `report_final`; perbarui dengan alasan CHANGELOG                                                                                                                          |
| Tes indeks/bentrok jadwal                                                             | Tidak diharapkan berubah (lane 0); periksa pesan galat yang menyebut nama indeks                                                                                                   |
| `rbac-matrix`                                                                         | Tambahan rute dan izin                                                                                                                                                             |
| Tes rollover                                                                          | Tidak diharapkan berubah (kelas tingkat akhir hanya bila ada `retain`) kecuali tes yang memuat `retain` tingkat akhir dan menegaskan `no_target_class`: kini ditempatkan; perbarui |
| `phase3-baseline.test.ts`                                                             | **Tidak boleh berubah**                                                                                                                                                            |

---

## 7. Rencana migrasi data

- Tidak ada backfill. Semua tabel baru kosong = perilaku sekarang; kolom baru `lane = 0`, `combined_key`, `meeting_id` NULL.
- Murid `transferred`/`dropped` lama tanpa `student_transfer`: tetap dikecualikan seperti sekarang. Alat opsional (bukan migrasi): halaman
  Mutasi menampilkan "murid berstatus pindah tanpa catatan" dan formulir melengkapinya (tanggal, sekolah tujuan); setelah dilengkapi, rapor
  final mereka kembali tampil di daftar rapor kelas. Tidak ada tebakan tanggal otomatis.
- `promotion_decision.meeting_date` lama dibiarkan; tidak dikonversi ke berita acara.
- Sekolah yang ingin memakai pilihan mapel di tahun berjalan: menyalakan mode per rombel **sebelum** finalisasi semester; bila semester sudah
  final, buka kembali dulu (penjaga). Ditulis di bantuan.
- Rollback lewat tag: kode lama mengabaikan tabel/kolom baru. Akibatnya (ditulis di CHANGELOG): draf rapor sekolah yang memakai pilihan kembali
  menampilkan semua mapel; jadwal paralel/gabungan tetap tersimpan tetapi kode lama memperlakukan sel lajur >0 sebagai sel biasa (tampilan
  ganda) dan pengecekan `teacher_busy` lama bisa menolak suntingan; rapor final aman (snapshot). Indeks jadwal baru tetap (lebih longgar
  hanya pada lajur >0, yang tidak dibuat kode lama).

---

## 8. Pemecahan tahap implementasi

Urutan menurut risiko dan nilai: kerusakan data (mutasi, riwayat) dan kebutuhan akhir tahun (kelulusan Juni 2027) diutamakan; pilihan mapel inti
(P0 SMA) sebelum jadwal paralel. Tiap tahap: backend + tes → web → uji ponsel 375 px/768 px/gelap → bantuan id/en/su → CHANGELOG. Tiap tahap
diakhiri suite wajib + `phase3-baseline` hijau.

| Tahap                                                   | Isi                                                                                                                                                                                                                | Migrasi | Selesai bila                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------- |
| **3C.1** Mutasi dan riwayat rombel                      | `student_transfer`, `enrollment_change`, keluar/masuk, larangan, dokumen keberangkatan, `semesterRosterOf` di daftar/finalisasi rapor, penjaga pindah rombel, `academic-history`, halaman Mutasi + linimasa profil | 0103    | T9, T10, T16-T19; garis dasar hijau; murid pindah tak hilang dari arsip                        |
| **3B.1** Data pilihan mapel                             | tiga tabel + aturan, `takersOf`, API tulis/baca, isi dari agama, tab peserta + aturan pilihan (web)                                                                                                                | 0101    | T4, T5 (bagian data), T16, T17; belum memengaruhi nilai (flag dibaca hanya oleh layar pilihan) |
| **3B.2** Pilihan memengaruhi nilai dan rapor            | `subjectRosterOf` di semua jalur, `computeGrades.takers`, rapor per murid, matriks `notTaken`, portal, CBT                                                                                                         | -       | T2, T3, T18, T19; garis dasar hijau                                                            |
| **3C.2** Legger                                         | endpoint + unduhan XLSX/CSV/PDF klien                                                                                                                                                                              | -       | T14; kartu di ponsel, tabel gulir horizontal di desktop                                        |
| **3C.3** Berita acara + tinggal kelas tingkat akhir     | `council_meeting`, `meeting_id`, PDF berita acara, `copyFinalLevelForRetained`                                                                                                                                     | 0104    | T12, T13                                                                                       |
| **3C.4** Kelulusan                                      | kebijakan, ujian satuan pendidikan, nilai, saran, penetapan, transkrip, SKL PDF, integrasi wizard kenaikan                                                                                                         | 0105    | T11; tanpa kebijakan alur lama identik                                                         |
| **3B.3** Jadwal paralel dan gabungan                    | `lane`, `combined_key`, indeks, validasi, kisi jadwal berlajur                                                                                                                                                     | 0102    | T6; tes jadwal lama hijau                                                                      |
| **3B.4** Absensi gabungan + salin pilihan saat rollover | endpoint gabungan, roster pengambil di absensi per jam, `copySubjectChoices`                                                                                                                                       | -       | T7, T8                                                                                         |
| **3C.5** Ekspor generik                                 | `GET /v1/exports/academic`, kamus kolom                                                                                                                                                                            | -       | T15                                                                                            |
| **3B.5** (opsional) Penilaian serentak lintas rombel    | buat penilaian kembar per rombel bersama                                                                                                                                                                           | mungkin | ditentukan setelah pemakaian 3B                                                                |

Catatan urutan: 3C.1 pertama karena memperbaiki kehilangan data yang sedang terjadi (C-b, C-c) dan karena `semesterRosterOf` dipakai 3B.2 dan
3C.2. 3B.1 dan 3B.2 dipisah supaya data bisa diisi dan diperiksa sebelum memengaruhi angka. 3C.4 harus selesai sebelum Mei 2027.

---

## 9. Risiko dan mitigasi

| #   | Risiko                                                                                          | Dampak                       | Mitigasi                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Filter pengambil terlupa di salah satu jalur (rekap vs rapor vs portal beda)                    | Angka berbeda antar layar    | Satu fungsi `takersOf`/`subjectRosterOf`; tes konsistensi T3 membandingkan rekap, matriks, rapor, portal untuk murid yang sama                 |
| R2  | Field baru tidak sparse                                                                         | Garis dasar merah            | Garis dasar tak boleh diubah; tinjau tiap respons; pembuat field memakai pola `...(x ? {x} : {})`                                              |
| R3  | Menyalakan mode `selected` setelah nilai diisi menyembunyikan skor murid yang belum didaftarkan | "Nilai hilang"               | Skor tidak pernah dihapus; layar mode menampilkan jumlah murid berskor yang akan tersembunyi dan meminta konfirmasi; mematikan mode memulihkan |
| R4  | Penggantian indeks jadwal                                                                       | Bentrok lama lolos           | Indeks baru dibuat sebelum yang lama dihapus; tes bentrok lama; lane 0 = keunikan lama                                                         |
| R5  | `semesterRosterOf` salah memasukkan/mengeluarkan murid                                          | Rapor hilang/ganda           | Tanpa baris mutasi = `historicalRosterOf` (uji emas); kasus tepi tanggal (efektif = akhir semester) diuji                                      |
| R6  | Penjaga baru pindah rombel mengganggu operator                                                  | Keluhan                      | Hanya semester berjalan yang final; pesan jelas; CHANGELOG                                                                                     |
| R7  | Kelulusan dan kenaikan menjadi dua sumber kebenaran                                             | Status lulus tidak konsisten | Kelulusan hanya memasok `promotion_decision`; status diubah satu tempat                                                                        |
| R8  | Peringkat lintas pilihan dianggap tidak adil                                                    | Keluhan                      | Dokumentasi; `show_rank` sudah ada                                                                                                             |
| R9  | Ekspor dianggap "kompatibel e-Rapor"                                                            | Salah harap                  | Label "format generik Edusync, bukan format impor resmi" di UI, OpenAPI, bantuan                                                               |
| R10 | Kebocoran data pribadi lewat ekspor                                                             | Privasi                      | Tanpa NIK bawaan; izin khusus; audit                                                                                                           |
| R11 | Performa matriks pilihan rombel besar (40 murid x 12 mapel)                                     | Lambat di ponsel             | Satu kueri; kartu per murid di ponsel; simpan batch                                                                                            |
| R12 | Asimetri `other`/`belief`                                                                       | Pemetaan agama salah         | Tidak menebak; `unmatched`                                                                                                                     |

---

## 10. Daftar keputusan

### 10.1 Ditetapkan (bawaan tegas, dipakai implementasi)

| #   | Keputusan                                | Bawaan                                                                                                                             |
| --- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Model pilihan                            | Mode per (rombel, mapel) sparse + baris pilihan hanya untuk mapel bermode pilihan (3.1 B)                                          |
| D2  | Pemicu perilaku                          | Hanya `class_subject_participation`; `subject.kind`/`religion_variant` sekadar saran UI                                            |
| D3  | Cakupan pilihan                          | Setahun, atau per semester (pola jadwal)                                                                                           |
| D4  | Aturan 4-5 dari 7, seni satu, agama satu | Data aturan per sekolah, seed saran, **peringatan** (`enforce` bawaan false)                                                       |
| D5  | Batas ganti pilihan                      | Hanya penjaga `report_final` + `locked_from_semester_id` opsional                                                                  |
| D6  | Agama per murid                          | Mapel per varian, baris eksplisit, isi dari agama tanpa menebak                                                                    |
| D7  | Siapa memilih                            | Admin/kurikulum/wali kelas; portal baca-saja                                                                                       |
| D8  | Peringkat                                | Rata-rata mapel yang diambil masing-masing; tanpa pengaturan baru                                                                  |
| D9  | Snapshot rapor                           | Bentuk tidak berubah, tanpa `schema_version` baru                                                                                  |
| D10 | Kelas gabungan                           | Tetap per rombel; `lane` + `combined_key` di jadwal                                                                                |
| D11 | Rollover pilihan                         | Mode tersalin; pilihan setahun berlanjut bila rombel tujuan bermode sama (`copySubjectChoices` true)                               |
| D12 | Kelulusan                                | Formal hanya bila ada `graduation_policy` tahun itu; nilai rapor dari snapshot final; status lulus tetap diubah penerapan kenaikan |
| D13 | Nomor ijazah                             | Teks diketik, unik per sekolah, tanpa format/pembangkit; ijazah tidak dicetak                                                      |
| D14 | SKL/transkrip                            | PDF klien dari transkrip beku; templat nomor SKL per kebijakan                                                                     |
| D15 | Rapor murid pindah semester berjalan     | Dokumen keberangkatan beku di `student_transfer`, bukan finalisasi `report_card`                                                   |
| D16 | Nilai sekolah asal                       | Lampiran berkas, tanpa impor angka                                                                                                 |
| D17 | Pindah rombel                            | Riwayat `enrollment_change`; penjaga final semester berjalan                                                                       |
| D18 | Berita acara                             | Tabel sendiri, `meeting_id` nullable, final membekukan isi dan mengunci keputusan tertaut                                          |
| D19 | Ekspor                                   | CSV/JSON generik `edusync-academic-v1`, nilai hanya final, tanpa klaim kompatibilitas                                              |
| D20 | Tinggal kelas tingkat akhir              | Rollover membuat kelas tingkat akhir hanya bila ada `retain`                                                                       |
| D21 | Izin                                     | `subject_choice:manage`, `graduation:manage`, `graduation:read`, `data_export:run` dengan peta peran di 4.6                        |
| D22 | Urutan tahap                             | 3C.1 → 3B.1 → 3B.2 → 3C.2 → 3C.3 → 3C.4 → 3B.3 → 3B.4 → 3C.5 (→ 3B.5)                                                              |

### 10.2 Perlu konfirmasi pemilik (bawaan aman berlaku sampai dijawab)

| #   | Hal                                                          | Kenapa tidak boleh diputuskan sendiri                                                                                                 | Bawaan aman                                                                                                                                                              |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| K1  | Pengecualian larangan mutasi semester genap tingkat akhir    | Regulasi (S4) menyatakan mekanisme pindahan tidak berlaku; membuka pengecualian berarti Edusync mengizinkan sesuatu di luar ketentuan | Ditolak; pengecualian hanya `school:manage` dengan alasan wajib dan audit. Bila pemilik menolak pengecualian sama sekali, cukup menghapus jalur override (tanpa migrasi) |
| K2  | NIK dalam ekspor                                             | Data pribadi sensitif keluar dari sistem                                                                                              | Tidak disertakan; opsi `includeNik` hanya `student:manage` + audit. Alternatif paling aman: hapus opsi                                                                   |
| K3  | Format berkas yang benar-benar diterima e-Rapor/Dapodik/EMIS | Tidak dapat diverifikasi dari sumber yang dibaca                                                                                      | Ekspor generik tanpa klaim; pemilik/sekolah perlu menyediakan contoh berkas impor resmi sebelum format khusus dibuat                                                     |

Tidak ada tindakan destruktif terhadap data dalam rancangan ini (satu-satunya DROP adalah penggantian indeks jadwal dengan keunikan lama terjaga).

---

## 11. Asumsi dan ketidakpastian

1. **Format ekspor resmi** (e-Rapor SMA/SMK, Dapodik, EMIS/RDM): belum diverifikasi (K3).
2. **Format dan nomor ijazah/SKL**: aturan resmi belum diriset (regulasi-umum bagian 7); hanya pencatatan teks.
3. **Komponen kelulusan**: tidak ada rumus nasional (R6, bagian 5 butir 6); bobot sepenuhnya konfigurasi.
4. **Angka 4-5 dari minimal 7 dan ganti sampai XI semester 2** terverifikasi untuk SMA (K10); untuk MA dan SMK berasal dari sumber sekunder
   (regulasi-madrasah G1); karena itu hanya seed saran.
5. **Kebijakan penjurusan SMA** belum final (K16); model pilihan per murid tetap berlaku apa pun hasilnya (penjurusan = paket pilihan per rombel).
6. **"Semester genap"** diturunkan dari semester dengan `starts_on` terbesar pada tahun ajaran (pola yang ada); sekolah dengan lebih dari dua
   semester per tahun (tidak lazim) akan memakai semester terakhir.
7. Asumsi kuat: serializer zod Fastify membuang kunci tak dideklarasikan (rancangan fase 3 bagian 2), jadi setiap field sparse baru harus
   ditambahkan ke skema respons, termasuk skema dokumen di kontrak bersama.
8. Belum diverifikasi apakah ada tes lama yang menegaskan pindah rombel diterima saat rapor final; diperiksa pada 3C.1.
9. Belum diverifikasi apakah tes rollover menegaskan `no_target_class` untuk `retain` tingkat akhir; diperiksa pada 3C.3.
10. Kurikulum madrasah (KMA 1503/2025) dan rumpun PAI: rancangan netral (mapel per varian/aturan pilihan berlaku sama), seed menunggu verifikasi.
11. DB dev tidak punya data pilihan, agama per mapel, atau keputusan kenaikan; perilaku pada data nyata sekolah SMA belum teramati.
