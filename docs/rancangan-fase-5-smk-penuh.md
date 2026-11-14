# Rancangan: fase 5 (SMK penuh)

Status: **rancangan; keputusan bawaan ditetapkan arsitek**, butir bagian 9 menunggu pemilik (bawaan aman berlaku sampai dijawab).
Disusun 15 November 2026 pada cabang `rebuild`, HEAD = `3259b8c` (fase 4 sampai 4.5 selesai; migrasi terakhir 0109, `when` 1797643800000).
Dokumen ini hanya rancangan: tidak ada kode, migrasi, atau data yang diubah.

Terkait: [roadmap](../Planning/11-academic-roadmap.md) fase 5 dan revisi regulasi (K1-K3, G3, G5-G9, G17),
[regulasi-madrasah-smk.md](regulasi-madrasah-smk.md) (S3, S5-S7, S10-S14, bagian 3 "Fase 5", bagian 4),
[regulasi-umum.md](regulasi-umum.md) (F1, bagian "Fase 5: SMK penuh"), [rancangan fase 4](rancangan-fase-4-kokurikuler-madrasah.md) (konvensi, pola sparse).

Cara membaca: "terverifikasi" = dibaca sendiri di kode; "asumsi" = belum dibuktikan (bagian 10). Label sumber regulasi:
**T** = teks resmi terbaca, **S** = sekunder/salinan, **B** = belum terverifikasi (lihat dokumen regulasi).

---

## 1. Masalah dan kriteria keberhasilan

| #   | Masalah | Bukti (terverifikasi) | Dasar |
| --- | ------- | --------------------- | ----- |
| S-a | Tidak ada hierarki Bidang → Program → Konsentrasi Keahlian. `program` hanya kode/nama/lama/tingkat akhir. | `schema.ts:563-583` (`durationYears`, `finalLevelCode` sudah ada sejak K3). | S5-S7, S14 |
| S-b | Kelompok mapel SMK (Umum/Kejuruan) sudah ada sebagai acuan, tetapi **rapor tidak mengelompokkan** mapel. | `ref_subject_group` `general`/`vocational`/`internship` dengan `report_section` (`0092:23-35`); `report-card-lib.ts` dan PDF tidak membaca `subjectGroup`. | S3, K1 |
| S-c | Nilai PKL hidup terpisah dari rapor. Rapor hanya memuat mapel yang punya `assessment`, jadi mapel PKL (`kind = internship`) tidak pernah tampil. | `assessedSubjects` (`grading-lib.ts:251`), `loadClassContext` (`report-card-lib.ts:175-208`); `pkl_period` tanpa `semester_id`/mapel (`schema.ts:3146`). | S3, S13 |
| S-d | Bobot sekolah:industri **tersirat 50:50**: nilai aspek = rata-rata penilai yang ada. Tidak dapat dikonfigurasi. | `pklResult` (`packages/contracts/src/pkl.ts:43-57`); diuji `pkl.test.ts:593-666` (angka 82). | S10-S11 (tidak ada aturan nasional) |
| S-e | Nomor sertifikat PKL tidak tercatat. | `pkl_placement` (`schema.ts:3164`). | S10 |
| S-f | UKK tidak ada sama sekali (grep `ukk` di rute dan skema: nihil). | - | S12 (Pedoman Direktorat SMK, T) |

**Kriteria keberhasilan:**

1. `apps/api/src/phase3-baseline.test.ts` dan fixture-nya **tidak diubah**, `ADDITIVE_KEYS` tetap kosong. Sekolah non-SMK dan SMK yang
   tidak mengaktifkan fitur baru menghasilkan dokumen rapor, snapshot, leger, saran kelulusan, dan ekspor yang **identik**.
2. Tidak ada kolom baru pada tabel yang didump atau diisi garis dasar (`program`, `subject`, `report_setting`, `report_card`, dst.).
   Kolom baru hanya pada tabel PKL (tidak disentuh garis dasar) dan tabel baru. Tanpa backfill; baris lama bernilai NULL = perilaku lama.
3. `apps/api/src/pkl.test.ts` **utuh dan hijau** (bobot NULL = rumus lama persis; respons PKL hanya bertambah kunci, tes memakai
   `toMatchObject`, terverifikasi baris 402-438, 628-653).
4. Isi regulasi yang belum terbaca **tidak di-seed** (daftar spektrum 244/M/2024, JP Lampiran II 13/2025, format nomor sertifikat,
   format impor e-Rapor). Angka yang dikutip (792/1.368 JP, skala UKK) hanya menjadi **saran berlabel sumber**, bukan konstanta aturan.
5. Tabel tenant baru memakai konvensi 0100 (salin dari rancangan fase 4 bagian 4), terdaftar di `packages/db/src/tenant-isolation.test.ts`.
6. Tulis nilai PKL dan UKK yang masuk rapor terkunci saat rapor final (`409 report_final`), termasuk lewat tautan pembimbing industri.
7. OpenAPI ("Izin: `x`." di awal deskripsi), `rbac-matrix`, dokumentasi id/en/su, 375/768 px, mode gelap, sentuh 44 px.

---

## 2. Keputusan desain inti

1. **`program` tetap unit operasional.** Kelas, alokasi JP, KKTP, kebijakan kelulusan sudah memakai `program_id`; hierarki keahlian
   ditambahkan **di atasnya** lewat tabel tautan `program_concentration` (bukan kolom `program.concentration_id` seperti tertulis di
   roadmap, karena `program` diisi garis dasar; kriteria 2). Satu konsentrasi boleh punya dua program (3 dan 4 tahun).
2. **Spektrum keahlian = data sekolah, bukan seed.** Jumlah program/konsentrasi bertentangan antarsumber (S7) dan lampiran 244/M/2024
   belum terbaca. Sekolah mengisi bidang/program/konsentrasi yang ia layani, dengan `dapodik_code` dan `source_ref` opsional (S14).
3. **PKL tetap satu modul, satu sumber nilai.** Tidak ada tabel nilai PKL kedua. Periode PKL **ditautkan** ke semester rapor dan mapel
   PKL; nilai akhir tetap dihitung `pklResult`. Rapor membaca nilai itu sebagai baris mapel.
4. **PKL masuk `subjects[]` rapor** (bukan bagian terpisah saja), supaya leger, saran kelulusan, transkrip, dan ekspor 3C.5 yang
   semuanya membaca `snapshot.subjects` (terverifikasi `ledger-lib.ts:85-137`, `graduation-lib.ts:252`, `export-lib.ts:356`) ikut
   tanpa jalur baru. Rincian PKL (tempat, tanggal, aspek, sertifikat) masuk kunci dokumen sparse `internship`.
5. **Bobot sekolah:industri = konfigurasi sekolah**, NULL = rumus lama (rata-rata penilai yang ada). Bobot 70:30 di panduan Ditjen
   Vokasi adalah aspek vs laporan (S10), sudah dapat dimodelkan lewat bobot `pkl_aspect` yang ada, jadi tidak dibuat mekanisme baru.
6. **UKK modul data sendiri, gerbang modul `internship`.** Rute `/v1/ukk/*`, izin `ukk:read`/`ukk:manage` terpisah dari `pkl:*`
   (UKK asesmen kompetensi, bukan bagian PKL; regulasi-madrasah-smk bagian 3). Gerbang billing tetap `internship` agar tidak ada modul
   katalog baru (bagian 9 butir 1).
7. **Skala UKK = data.** Dua tabel konversi Pedoman 2025/2026 (T, S12) menjadi **bawaan berlabel sumber** di kontrak; sekolah dapat
   menimpanya per pola. Snapshot membekukan label kategori.
8. **Satu baris pengaturan kejuruan per sekolah** (`vocational_setting`), dibuat hanya saat disimpan. Tanpa baris = semua fitur fase 5
   yang memengaruhi rapor **mati**.

---

## 3. Tahap (berurutan, satu tahap = satu commit yang bisa diuji)

| Tahap | Isi | Migrasi | Bergantung pada |
| ----- | --- | ------- | --------------- |
| 5.1 | Struktur keahlian: bidang/program/konsentrasi, tautan `program` → konsentrasi; tabel `vocational_setting`; tab di halaman Kelas/Program | 0110 | fase 0 (`ref_education_profile.vocational`), K3 (`program.duration_years`) |
| 5.2 | Rapor SMK berkelompok (Umum/Kejuruan/…) dan identitas keahlian di kop; sakelar `report_grouped` | - | 5.1; 3.2 (dokumen v2) |
| 5.3 | PKL sebagai mapel: tautan periode → semester + mapel PKL, bobot sekolah:industri, nomor sertifikat, kunci final; saran JP 792/1.368 | 0111 | 5.1 (pengaturan); 2B (`curriculum_subject_allocation`) |
| 5.4 | PKL di rapor/snapshot/leger/kelulusan/ekspor: baris mapel + kunci `internship` | - | 5.3; 5.2 untuk kelompok |
| 5.5 | UKK: kegiatan, penguji internal/eksternal, peserta dan hasil (percobaan, skor, kategori, sertifikat/surat keterangan), status lapor Dinas/e-Rapor | 0112 | 5.1 (konsentrasi) |
| 5.6 | UKK di rapor (kunci `ukk`, opsional), syarat kelulusan opsional, dataset ekspor `ukk_results` | - | 5.5; 3C (kelulusan, ekspor) |
| 5.7 | Penutup: menu `/calendar/year` dan `/pkl/report`, pengelompokan pengaturan akademik, OpenAPI, dokumentasi id/en/su, `FITUR-EDUSYNC.md`, CHANGELOG, uji 375/768/gelap, rilis v1.6.0 | - | 5.1-5.6 |

5.5 boleh dikerjakan paralel setelah 5.1. 5.4 dan 5.6 menyentuh `loadClassContext`; kerjakan berurutan untuk menghindari konflik.

---

## 4. Model data

Konvensi tabel tenant baru: persis rancangan fase 4 bagian 4 (`uuidv7()`, `school_id NOT NULL`, `UNIQUE (school_id, id)`, FK komposit
NO ACTION kecuali disebut, `ENABLE` + `FORCE ROW LEVEL SECURITY`, policy `tenant_isolation` dengan `app_school_ids()`, `GRANT … TO
edusync_app`). Hanya DDL; tanpa backfill; tanpa baris otomatis per sekolah.

| Migrasi | `when` |
| ------- | ------ |
| 0110 `vocational_structure` | 1797730200000 |
| 0111 `pkl_report_link` | 1797816600000 |
| 0112 `ukk` | 1797903000000 |

Bila urutan bergeser, nomor mengikuti urutan pengerjaan; `when` tetap naik 86.400.000 dan > 1797643800000.

### 4.1 Migrasi 0110 `vocational_structure` (tahap 5.1)

```
vocational_field                               -- bidang keahlian
  id, school_id, code text CHECK 1..20, name text CHECK 1..160,
  dapodik_code text NULL CHECK <=40, source_ref text NULL CHECK <=60   ('244/M/2024'; informatif, format B)
  sort int DEFAULT 0, active boolean DEFAULT true, created_at, updated_at
  UNIQUE (school_id, code)

vocational_program                             -- program keahlian
  id, school_id, field_id NOT NULL, code, name, dapodik_code NULL, sort, active, created_at, updated_at
  FK (school_id, field_id) → vocational_field; UNIQUE (school_id, code); INDEX (school_id, field_id)

vocational_concentration                       -- konsentrasi keahlian
  id, school_id, vocational_program_id NOT NULL, code, name, dapodik_code NULL, sort, active, created_at, updated_at
  FK (school_id, vocational_program_id) → vocational_program; UNIQUE (school_id, code)

program_concentration                          -- tautan unit operasional → konsentrasi
  program_id uuid PRIMARY KEY, school_id, concentration_id NOT NULL
  FK (school_id, program_id) → program ON DELETE CASCADE; FK (school_id, concentration_id) → vocational_concentration
  INDEX (school_id, concentration_id)

vocational_setting                             -- satu baris per sekolah, dibuat saat disimpan
  school_id uuid PRIMARY KEY REFERENCES school(id),
  report_grouped boolean NOT NULL DEFAULT false,
  updated_by text NOT NULL, updated_at
```

`ON DELETE CASCADE` hanya pada tautan, supaya penghapusan `program` (yang sudah diblok bila dipakai kelas/alokasi) tidak tersandung baris
tautan, termasuk pembersihan tes garis dasar. Hapus bidang/program/konsentrasi yang masih punya anak/tautan: 409 `in_use` (nonaktifkan).

### 4.2 Migrasi 0111 `pkl_report_link` (tahap 5.3)

```
ALTER TABLE pkl_period ADD CONSTRAINT pkl_period_school_id_uq UNIQUE (school_id, id);
ALTER TABLE pkl_period ADD COLUMN semester_id uuid NULL;     -- semester yang rapornya memuat nilai PKL
ALTER TABLE pkl_period ADD COLUMN subject_id  uuid NULL;     -- mapel PKL (kind = internship)
  FK (school_id, semester_id) → semester; FK (school_id, subject_id) → subject   (keduanya NO ACTION)
  CHECK ((semester_id IS NULL) = (subject_id IS NULL))       -- tertaut penuh atau tidak sama sekali
  INDEX (school_id, semester_id) WHERE semester_id IS NOT NULL

ALTER TABLE pkl_placement ADD COLUMN certificate_no text NULL CHECK <=80;
  UNIQUE INDEX (school_id, certificate_no) WHERE certificate_no IS NOT NULL

ALTER TABLE vocational_setting ADD COLUMN
  pkl_school_weight int NULL, pkl_industry_weight int NULL     -- keduanya NULL = rumus lama
    CHECK ((pkl_school_weight IS NULL) = (pkl_industry_weight IS NULL)
           AND (pkl_school_weight IS NULL OR (pkl_school_weight >= 0 AND pkl_industry_weight >= 0
                                              AND pkl_school_weight + pkl_industry_weight = 100)))
  pkl_certificate_pattern text NULL CHECK <=120               -- placeholder sama dengan letter_setting ({seq},{code},{roman},{year})
```

API memvalidasi: semester milik tahun ajaran periode; mapel aktif dengan `kind = 'internship'` (400 `invalid_reference`).
Rumus (kontrak murni, `pklResult(aspects, scores, weights?)`): tanpa `weights` = kode sekarang persis; dengan `weights`, nilai aspek =
rata-rata tertimbang penilai **yang ada** (bobot dinormalisasi atas penilai yang mengisi). JP 792/1.368 **tidak disimpan baru**: dipakai
`curriculum_subject_allocation.yearly_periods`/`weeks` yang sudah ada untuk mapel PKL; UI hanya memberi saran berlabel (bagian 6).

### 4.3 Migrasi 0112 `ukk` (tahap 5.5)

```
ukk_event
  id, school_id, academic_year_id NOT NULL, semester_id NOT NULL, concentration_id NOT NULL,
  pattern text NOT NULL CHECK (pattern IN ('lsp','industry','independent')),
  title text CHECK 1..200, scheme_name text NULL CHECK <=200,       (skema LSP / paket soal)
  kkni_level smallint NULL CHECK (kkni_level IN (2,3)),
  lsp_name text NULL, lsp_license_ref text NULL, partner_id uuid NULL (pkl_partner sebagai mitra dunia kerja; tanpa FK komposit, lihat A3),
  tuk_name text NULL CHECK <=200, starts_on date NULL, ends_on date NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','closed')),
  reported_to_dinas_at timestamptz NULL, pushed_to_erapor_at timestamptz NULL,   (penanda manual; bukan integrasi)
  created_by text NOT NULL, created_at, updated_at
  FK (school_id, academic_year_id), (school_id, semester_id), (school_id, concentration_id); INDEX (school_id, academic_year_id)

ukk_assessor
  id, school_id, event_id, kind text CHECK (kind IN ('internal','external')),
  teacher_id NULL, name text NULL CHECK <=160, institution text NULL CHECK <=200, qualification text NULL CHECK <=300,
  CHECK ((kind = 'internal' AND teacher_id IS NOT NULL) OR (kind = 'external' AND name IS NOT NULL))
  FK (school_id, event_id) → ukk_event ON DELETE CASCADE, (school_id, teacher_id) → teacher
  UNIQUE INDEX (event_id, COALESCE(teacher_id, nil-uuid), COALESCE(name, ''))

ukk_result                                      -- satu baris per (kegiatan, murid, percobaan)
  id, school_id, event_id, student_id, attempt_no smallint NOT NULL DEFAULT 1 CHECK (1..5),
  practice_score numeric(5,2) NULL, theory_score numeric(5,2) NULL,   (0..100; informatif kecuali bobot diatur)
  final_score numeric(5,2) NULL CHECK (0..100),
  band_code text NULL, band_label text NULL, competent boolean NULL,  (diturunkan server dari skala saat simpan)
  certificate_no text NULL, statement_no text NULL,                   (sertifikat bila kompeten; surat keterangan bila tidak)
  passport_units text[] NULL,                                         (unit kompetensi yang kompeten; paspor keterampilan)
  note text NULL CHECK <=1000, updated_by text NOT NULL, updated_at
  UNIQUE (event_id, student_id, attempt_no)
  CHECK (certificate_no IS NULL OR competent IS TRUE)
  FK (school_id, event_id) → ukk_event (NO ACTION), (school_id, student_id) → student
  UNIQUE INDEX (school_id, certificate_no) WHERE certificate_no IS NOT NULL; INDEX (school_id, student_id)

ALTER TABLE vocational_setting ADD COLUMN
  ukk_bands jsonb NULL,                     -- {lsp|industry|independent: [{code,label,min,competent}]}; NULL = bawaan kontrak
  ukk_practice_weight int NULL, ukk_theory_weight int NULL  (NULL = final_score diisi langsung; CHECK jumlah 100 seperti PKL)
  ukk_in_report boolean NOT NULL DEFAULT false,
  ukk_certificate_pattern text NULL
```

Bawaan skala di kontrak (`UKK_DEFAULT_BANDS`, sumber "Pedoman UKK SMK TA 2025/2026", T): `lsp` = Belum Kompeten 0-74, Kompeten 75-100;
`independent` = Belum Kompeten < 61, Cukup Kompeten 61-74, Kompeten 75-90, Sangat Kompeten 91-100. **`industry` tidak disebut eksplisit
di sumber**: bawaan memakai skala `lsp`, ditandai "periksa" di UI (bagian 9 butir 5). Batas `competent`: kategori yang ditandai
`competent` (bawaan: ≥ 75). Hasil yang dipakai rapor/kelulusan = percobaan **terakhir** bernilai per (kegiatan, murid).

---

## 5. Izin, modul, endpoint

| Izin | Arti | Peran bawaan |
| ---- | ---- | ------------ |
| `ukk:read` | Baca kegiatan, penguji, hasil UKK | `school_admin`, `principal`, `curriculum`, `operator`, `teacher` |
| `ukk:manage` | Kelola kegiatan, penguji, hasil, nomor, penanda lapor | `school_admin`, `curriculum` |

Penguji internal (guru di `ukk_assessor`) boleh mengisi hasil kegiatannya tanpa `ukk:manage` (helper `canAssessUkk(tx, ctx, eventId)`
lewat `teacher.member_id`, pola fasilitator fase 4). Nilai penguji eksternal diinput staf (tautan bertoken ditunda, bagian 9 butir 6).
Struktur keahlian memakai izin yang sudah ada (`class:read` / `class:manage`, sama dengan `/v1/programs`). Izin baru masuk `PERMISSIONS`
dan `SYSTEM_ROLES`, sampai ke sekolah lama lewat `syncSystemRolePermissions`. **Modul:** semua rute fase 5 bergerbang `internship` dan
hanya untuk profil `vocational = true` (selain itu 404 `not_vocational`, pola `hiddenByProfile` di web).

| Tahap | Endpoint | Izin | Galat baru |
| ----- | -------- | ---- | ---------- |
| 5.1 | `GET/POST /v1/vocational/fields`, `PUT/DELETE …/:id`; sama untuk `/programs-of-expertise`, `/concentrations` | `class:read` / `class:manage` | 409 `in_use`; 400 `invalid_reference` |
| 5.1 | `PUT /v1/programs/:id/concentration` `{concentrationId \| null}` | `class:manage` | 400 `invalid_reference` |
| 5.2 | `GET/PUT /v1/vocational/settings/report` `{reportGrouped}` | `report_card:read` / `report_card:manage` | - |
| 5.3 | `PUT /v1/pkl/periods/:id` menerima `semesterId`, `subjectId` (opsional, berpasangan) | `pkl:manage` | 400 `invalid_reference`, `pkl_link_incomplete`; 409 `report_final` (melepas/mengganti tautan semester yang rapornya final) |
| 5.3 | `GET/PUT /v1/vocational/settings/pkl` `{schoolWeight, industryWeight, certificatePattern}` (endpoint baru; `/v1/pkl/settings-thresholds` tidak diubah karena diuji `toEqual`) | `pkl:read` / `pkl:manage` | 400 `invalid_weights` |
| 5.3 | `PUT /v1/pkl/placements/:id/certificate` `{certificateNo \| null}`, `POST /v1/pkl/periods/:id/certificates` (penomoran massal untuk penempatan `completed`) | `pkl:manage` | 409 `certificate_taken`, `placement_not_completed` |
| 5.3 | Ubah: `PUT /v1/pkl/placements/:id/scores` dan `PUT /v1/public/pkl/:token/scores` | tetap | 409 `report_final` bila periode tertaut dan rapor murid final |
| 5.5 | `GET/POST /v1/ukk/events`, `GET/PUT/DELETE /v1/ukk/events/:id` | `ukk:read` / `ukk:manage` | 409 `ukk_assessed` (hapus kegiatan bernilai; tutup dengan `closed`) |
| 5.5 | `PUT /v1/ukk/events/:id/assessors` (ganti seluruh) | `ukk:manage` | 400 `invalid_reference` |
| 5.5 | `GET /v1/ukk/events/:id/results`, `PUT …/results` (batch ≤ 500), `POST …/results/:studentId/retake` | `ukk:read` / `ukk:manage` atau penguji internal | 409 `report_final`, `event_closed`; 400 `student_not_in_concentration`, `too_many_items` |
| 5.5 | `POST /v1/ukk/events/:id/numbers` (sertifikat untuk kompeten, surat keterangan untuk lainnya; idempoten) | `ukk:manage` | 409 `certificate_taken` |
| 5.5 | `PUT /v1/ukk/events/:id/reporting` `{reportedToDinasAt, pushedToEraporAt}` | `ukk:manage` | - |
| 5.5 | `GET/PUT /v1/vocational/settings/ukk` (skala, bobot, `ukkInReport`, pola nomor) | `ukk:read` / `ukk:manage` | 400 `invalid_bands` (tumpang tindih/celah 0-100) |
| 5.6 | `POST /v1/exports` dataset baru `ukk_results` (dari `ukk_result` + label beku; CSV generik) | `data_export:run` | - |

Peserta UKK = murid aktif di rombel yang `program_id`-nya tertaut ke konsentrasi kegiatan pada tahun kegiatan (validasi API).
Guard rapor: `assertStudentsReportNotFinal(tx, semesterId, studentIds)` (`report-lock-lib.ts:44`) pada tulis nilai PKL (periode tertaut)
dan hasil UKK (semester kegiatan) bila `ukk_in_report`; tautan industri mengembalikan 409 yang sama dan UI publik menampilkannya.

---

## 6. UI (mobile lebih dulu)

| Layar | Isi |
| ----- | --- |
| Kelas → tab **Keahlian** (hanya profil kejuruan) | Pohon Bidang → Program → Konsentrasi; < `lg` daftar bertingkat yang dapat dibuka (44 px), ≥ `lg` tiga kolom. Tiap konsentrasi menampilkan program (unit) tertaut beserta lama 3/4 tahun. Formulir `program` mendapat select konsentrasi. Label "Spektrum: isi sesuai SK Dinas/Dapodik; kode Dapodik opsional". |
| `/pkl/periods` (formulir periode) | Bagian "Masuk rapor": select semester (tahun periode) + select mapel PKL (`kind = internship`); keterangan "nilai PKL menjadi nilai mapel ini di rapor semester tersebut, ikut rata-rata dan leger". Pita kunci bila rapor final. |
| `/pkl/settings` | Kartu baru "Bobot penilai" (sekolah/industri, slider berpasangan jumlah 100, tombol "kembalikan ke rata-rata") dan "Nomor sertifikat" (pola + pratinjau). Ambang predikat tetap di kartu lama. |
| Panel nilai penempatan | Menampilkan bobot aktif dan nomor sertifikat; tombol nomori. |
| Kurikulum → alokasi mapel PKL | Petunjuk saran (bukan validasi): "Struktur 2022 (salinan JDIH): 792 JP kelas XII program 3 tahun, 1.368 JP kelas XIII program 4 tahun. Periksa Lampiran II Permendikdasmen 13/2025." Konstanta `PKL_PERIOD_SUGGESTIONS` di kontrak dengan `source`. |
| `/ukk` (menu kejuruan) | Daftar kegiatan per tahun; filter konsentrasi/status; kartu < `lg`; "Kegiatan baru" di footer lengket 375 px. |
| `/ukk/[id]` | Tab: Ringkasan (pola, skema, TUK, KKNI, penanda lapor Dinas/e-Rapor), Penguji (internal pilih guru, eksternal isian), Hasil, Dokumen. **Hasil:** ≥ `lg` tabel murid × (praktik, teori, akhir, kategori, percobaan); < `lg` kartu per murid, input angka 44 px, kategori dihitung langsung, "belum disimpan" + footer lengket; tombol "Uji ulang" membuat percobaan baru. Baca-saja + pita bila rapor final atau kegiatan ditutup. |
| `/ukk/settings` | Skala per pola dengan bawaan Pedoman (berlabel sumber; `industry` berlabel "periksa"), bobot praktik/teori, "tampilkan di rapor", pola nomor. |
| Pengaturan rapor | Sakelar "Kelompokkan mapel (Umum/Kejuruan)" (hanya profil kejuruan). |
| Rapor PDF | Bila dikelompokkan: subjudul per `report_section` dengan label kelompok beku. Kop: Bidang/Program/Konsentrasi bila ada. Baris mapel PKL seperti mapel lain; di bawah tabel, blok "Praktik Kerja Lapangan" (tempat, tanggal, lama, kehadiran jurnal, nilai per aspek, sertifikat). Blok UKK bila `ukk_in_report`. |

Semua layar: 375 px, 768 px, mode gelap, tiga bahasa tanpa terpotong, tanpa gulir horizontal halaman.

---

## 7. Dampak ke rapor, snapshot, leger, kelulusan, ekspor (tahap 5.2, 5.4, 5.6)

Semua kunci baru **sparse** dan didaftarkan di `packages/contracts/src/report-document.ts` (satu tempat, karena serializer membuang kunci
yang tidak dideklarasikan).

1. **Kunci mapel baru** (masuk `REPORT_V2_SUBJECT_KEYS`):
   - `group?: { key, label, section }` hanya bila `vocational_setting.report_grouped` dan mapel punya `subject_group`. Label beku.
   - `source?: 'internship'` hanya pada baris PKL.
2. **Kunci dokumen baru** (masuk `REPORT_V2_DOCUMENT_KEYS`):
   - `expertise?: { field, program, concentration }` hanya bila rombel murid bertaut konsentrasi **dan** `report_grouped` aktif
     (supaya SMK yang baru mengisi struktur tidak berubah rapornya diam-diam).
   - `internship?: { periodName, partner, startsOn, endsOn, presentDays, schoolSupervisor, industrySupervisor, aspects: {name, value}[],
     final, predicate, certificateNo? }[]` hanya bila murid punya penempatan non-batal pada periode yang tertaut ke semester itu.
   - `ukk?: { title, pattern, concentration, attempt, finalScore, band: {code,label}, competent, certificateNo?, statementNo? }[]`
     hanya bila `ukk_in_report` dan murid punya hasil pada kegiatan bersemester itu.
3. **Baris PKL di `subjects[]`.** `loadClassContext` memuat satu kueri batch `loadInternship(tx, semId, studentIds)` (periode tertaut →
   penempatan → aspek → nilai → bobot) lalu: mapel PKL ditambahkan ke daftar mapel, nilai dimasukkan ke peta `grades` sebagai
   `StudentGrade` (`perComponent: []`, `final` = `pklResult`, `predicate` = ambang `pkl_setting`), dan **hanya** murid yang berpenempatan
   dianggap mengambil mapel itu (dipadukan ke `takers`). Lebih dari satu penempatan pada (semester, mapel) yang sama (rotasi) = rata-rata
   nilai akhir yang ada (bagian 9 butir 3). Rata-rata, peringkat, dan `grades_incomplete` ikut memperlakukannya sebagai mapel.
4. `reportDocumentSchemaVersion` → 2 bila salah satu kunci hadir. Tanpa periode tertaut, tanpa `report_grouped`, tanpa `ukk_in_report`:
   dokumen v1, jsonb sama persis. Garis dasar tidak berubah (sekolahnya non-SMK, tidak punya baris di tabel baru).
5. **Snapshot** membekukan nilai, predikat, label kelompok, nama tempat, dan kategori UKK. Perubahan bobot/ambang/skala setelah final
   tidak mengubah rapor final; `matchesLive` membandingkan dokumen utuh, jadi perubahan itu terlihat sebagai "berbeda dari hidup" (A2 fase 4).
6. **Leger:** jalur final membaca snapshot (otomatis); jalur draf memakai `loadClassContext` (otomatis setelah butir 3). Kolom PKL muncul
   hanya di rombel yang punya penempatan tertaut.
7. **Kelulusan:** saran membaca `snapshot.subjects` (`graduation-lib.ts:252`), jadi PKL ikut rata-rata rapor bila sekolah menautkan
   periode. Transkrip beku ikut. Syarat UKK: kunci opsional `requireUkkCompetent?: boolean` di `graduationConfigSchema` (bawaan absen =
   tidak dipakai; Pedoman tidak menyatakan UKK menentukan kelulusan, jadi hanya saran, bukan penolakan). Skor UKK **tidak** masuk ijazah
   pada fase ini (bagian 9 butir 7).
8. **Ekspor 3C.5:** `final_grades` dan `descriptions` dari snapshot otomatis memuat baris PKL (`subject_kind = internship`). Dataset baru
   `ukk_results` (NISN, nama, konsentrasi, kode Dapodik, pola, skema, percobaan, skor, kategori, kompeten, nomor) sebagai CSV generik;
   **pemetaan kolom ke templat impor e-Rapor SMK tidak dikarang** (format B), cukup kolom stabil yang dapat dipetakan.
9. **Portal** mewarisi skema v2: wali melihat baris PKL dan blok PKL/UKK yang sama. Mode deskriptif Fase A tidak relevan untuk SMK.

---

## 8. Uji

| Uji | Isi |
| --- | --- |
| `phase3-baseline.test.ts` | **Tidak diubah**, wajib hijau di setiap tahap. |
| `pkl.test.ts` | **Tidak diubah**, wajib hijau (rumus tanpa bobot identik; kunci respons hanya bertambah). |
| `packages/contracts/src/pkl.test.ts` | Tambah: bobot 70:30, satu penilai saja, bobot NULL = hasil lama. |
| `tenant-isolation.test.ts` | Daftarkan 8 tabel tenant baru (`vocational_*` ×3, `program_concentration`, `vocational_setting`, `ukk_event`, `ukk_assessor`, `ukk_result`). |
| `rbac-matrix` | `ukk:read`/`ukk:manage`, gerbang `internship`, profil non-kejuruan 404. |
| `vocational-structure.test.ts` (baru) | Hierarki, kode unik, `in_use`, tautan program, isolasi lintas sekolah. |
| `pkl-report.test.ts` (baru) | Tautan periode → baris PKL di rapor, leger, saran kelulusan, ekspor; bobot; rotasi dua penempatan; `report_final` lewat staf **dan** tautan industri; buka kembali; periode tak tertaut = dokumen v1 identik. |
| `ukk.test.ts` (baru) | Tiga pola, skala bawaan dan timpaan, batas 61/75/91, uji ulang (percobaan terakhir), nomor hanya untuk kompeten, surat keterangan, penguji internal boleh/guru lain 403, `ukk_assessed`, `event_closed`, ekspor. |
| `report-document.test.ts` | v2 bila `group`/`source`/`expertise`/`internship`/`ukk` hadir; v1 identik tanpa. |
| Peramban | 375/768/gelap: tab Keahlian, formulir periode, hasil UKK, PDF berkelompok; tiga bahasa. |

Tes wajib roadmap (`grading`, `report-card`, `schedule`, `pkl`, `rbac-matrix`, `tenant-isolation`) hijau sebelum tag.

---

## 9. Risiko dan keputusan terbuka

**Risiko**

| Risiko | Mitigasi |
| ------ | -------- |
| PKL masuk rata-rata/peringkat mengubah angka SMK yang menautkan periode | Aksi eksplisit per periode dengan keterangan di formulir; tanpa tautan perilaku lama. |
| Nilai PKL diubah pembimbing industri setelah rapor final | Guard `report_final` di rute publik; tautan dapat dicabut. |
| PKL belum dinilai memblok finalisasi (`grades_incomplete`) | Perilaku benar untuk mapel; daftar rapor menyebut "PKL belum dinilai" agar penyebab jelas. |
| Mapel pilihan (`takers`) menyaring baris PKL | Pengambil PKL ditentukan penempatan dan dipadukan ke `takers`; diuji di `pkl-report.test.ts`. |
| PKL 4 tahun melintasi dua semester (≈ 30 minggu) | Satu periode = satu semester rapor; sekolah membuat dua periode bila ingin nilai di dua rapor. |
| Murid PKL tercatat alpa di presensi per jam (G5) | **Di luar cakupan fase 5**; dicatat sebagai celah; rekomendasi: penanda "sedang PKL" dari penempatan aktif di presensi per jam (fase berikut). |
| Spektrum dan skala UKK berubah | Data sekolah + bawaan kontrak berlabel sumber; snapshot membekukan label. |
| Nomor sertifikat bentrok saat penomoran massal paralel | Indeks unik parsial + penomoran dalam satu transaksi dengan kunci baris `vocational_setting`. |

**Keputusan terbuka (bawaan aman berlaku sampai dijawab)**

| # | Pertanyaan | Bawaan |
| - | ---------- | ------ |
| 1 | UKK modul katalog sendiri atau di bawah `internship`? | Gerbang `internship`, izin dan rute sendiri; pindah modul kelak cukup ganti gerbang. |
| 2 | Nilai PKL ikut rata-rata dan peringkat rapor? | Ya (PKL adalah mapel, S3); hanya bila periode ditautkan. |
| 3 | Beberapa penempatan pada semester yang sama (rotasi/TRS) | Rata-rata nilai akhir; rincian tiap tempat di blok `internship`. |
| 4 | Predikat baris PKL: ambang `pkl_setting` atau ambang nilai rapor? | Ambang `pkl_setting` (satu predikat untuk PKL di semua layar). |
| 5 | Skala pola `industry` | Sama dengan `lsp` (biner, 75), berlabel "periksa Pedoman"; dapat ditimpa. |
| 6 | Tautan bertoken untuk penguji eksternal UKK | Ditunda; staf menginput. |
| 7 | Skor UKK masuk nilai rapor mapel/ijazah | Tidak; hanya blok `ukk` opsional dan syarat kelulusan opsional (saran). |
| 8 | Seed spektrum 244/M/2024 | Tidak sampai lampiran dibaca; sediakan impor CSV bila diminta. |
| 9 | Verifikasi publik sertifikat PKL/UKK (G17) | Ditunda; nomor tercatat unik. Kelak memakai pola `signed_document`. |
| 10 | Ekspor format impor e-Rapor SMK / kirim Dapodik | CSV generik; pemetaan setelah templat resmi diperoleh. |
| 11 | Projek IPAS dan Projek Kreatif dan Kewirausahaan (G16) | Tetap mapel biasa (`kind = project`); tidak ada fitur khusus di fase 5. |

---

## 10. Asumsi dan ketidakpastian

- A1: `semester`, `subject`, `teacher`, `student`, `program`, `academic_year` punya `UNIQUE (school_id, id)` (terverifikasi 0087, 0088,
  `schema.ts:581`); `pkl_period` belum, ditambah di 0111.
- A2: `takersOf`/`SubjectTakers` dapat menerima pengambil tambahan tanpa mengubah hasil sekolah tanpa mapel pilihan (cek
  `subject-roster-lib.ts:42` saat 5.4).
- A3: `pkl_partner` tidak punya `UNIQUE (school_id, id)`; `ukk_event.partner_id` divalidasi API (atau tambah konstrain di 0112).
- A4: daftar rapor dan PDF dapat membaca `report_section` dari label beku di dokumen tanpa memuat ulang `ref_subject_group`.
- Sumber: 792/1.368 JP dan kelompok A/B dari salinan JDIH struktur 2022 (S3, T-salinan); isi Lampiran II 13/2025 (S2) **B**. Skala UKK,
  tiga pola, penguji, sertifikat/surat keterangan dari Pedoman UKK 2025/2026 (S12, T). Bobot sekolah:industri, format nomor, format
  e-Rapor, syarat kelulusan SMK: **tidak ada sumber**, jadi konfigurasi.
- Belum dibaca: Lampiran II Permendikdasmen 13/2025, lampiran 244/M/2024, Panduan "PKL sebagai Mata Pelajaran" 2023, templat impor e-Rapor SMK.
