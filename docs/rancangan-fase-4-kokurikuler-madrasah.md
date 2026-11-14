# Rancangan: fase 4 (kokurikuler dan madrasah)

Status: **rancangan; keputusan bawaan ditetapkan arsitek**, butir bagian 9 menunggu pemilik (bawaan aman berlaku sampai dijawab).
Disusun 14 November 2026 pada cabang `rebuild`, HEAD = `1e1e1b3` (3B dan 3C selesai; migrasi terakhir 0105, `when` 1797298200000).
Dokumen ini hanya rancangan: tidak ada kode, migrasi, atau data yang diubah.

Terkait: [roadmap](../Planning/11-academic-roadmap.md) fase 4 (prinsip 1-7, celah C4, C10, C11, standar tampilan),
[regulasi-umum.md](regulasi-umum.md) (P1-P6, bagian 4 "Fase 4"), [regulasi-madrasah-smk.md](regulasi-madrasah-smk.md) (M5-M15, G4, G15,
bagian "Fase 4"), [rancangan 3B/3C](rancangan-3b-3c-pilihan-mapel-kelulusan.md) (konvensi tabel, pola sparse, garis dasar).

Cara membaca: "terverifikasi" = dibaca sendiri di kode; "asumsi" = belum dibuktikan (bagian 10).

---

## 1. Masalah dan kriteria keberhasilan

| #   | Masalah                                                                                                                                                 | Bukti (terverifikasi)                                                                                                                                                  | Dasar               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| K-a | Kokurikuler hanya ada sebagai **teks bebas** per murid per semester. Tidak ada program/tema, bentuk kegiatan, dimensi sasaran, fasilitator, atau penilaian per dimensi. | `report_card_section.cocurricular_note` (`schema.ts:2392-2419`), `PUT /v1/report-cards/sections` (`routes/report-card.ts:554`), bendera PDF `report_setting.show_cocurricular`. | P1-P4               |
| K-b | Delapan dimensi profil lulusan dan Panca Cinta tidak ada sebagai data; tidak boleh dikodekan keras.                                                     | grep `profile_framework`, `panca`: nihil.                                                                                                                              | P1, M13, M14, G4    |
| K-c | JP kokurikuler tahunan sudah tersimpan per mapel tetapi tidak dibandingkan dengan kegiatan yang benar-benar diselenggarakan.                           | `curriculum_subject_allocation.cocurricular_yearly_periods` (`schema.ts:1203`).                                                                                        | P3, M8              |
| K-d | Madrasah: acuan `kma` hanya punya baris `smp` (MTs); MI dan MA tidak punya rumpun PAI/Bahasa Arab. Tidak ada NSM.                                       | `0020_reference_data.sql:67-79` (hanya `level_group = 'smp'`); kelompok `pai_arabic` sudah ada (`0092`); `school` hanya `npsn`.                                        | M5-M7, regulasi F0  |

**Kriteria keberhasilan:**

1. Sekolah yang tidak memakai fitur baru **identik**: `apps/api/src/phase3-baseline.test.ts` dan fixture-nya tidak diubah, `ADDITIVE_KEYS`
   tetap kosong. Semua field baru di respons dan dokumen rapor **sparse** (absen bila tidak dipakai).
2. Tidak ada kolom baru pada tabel yang didump atau diisi garis dasar (`school`, `report_card`, `report_card_snapshot`, `report_setting`,
   `subject`, `student`, `enrollment`, dst.). NSM ditaruh di tabel baru, bukan di `school`.
3. Tidak ada baris yang dibuat otomatis saat sekolah dibuat (adopsi kerangka selalu aksi eksplisit), supaya pembersihan tes garis dasar
   dan sekolah lama tidak tersentuh.
4. Isi resmi yang belum terbaca (KMA 1503/2025: JP madrasah, struktur MA keagamaan, mapel pilihan keagamaan) **tidak di-seed**.
   Yang di-seed diberi status sumber dan dapat diubah sekolah setelah diadopsi (*copy-on-adopt*, pola `ref_subject` → `subject`).
5. Tabel tenant baru: konvensi 0100 (bagian 4), terdaftar di `tenant-isolation.test.ts`; peran DB tidak diubah.
6. Penilaian kokurikuler terkunci saat rapor final (`409 report_final`), terbuka lagi setelah buka kembali; snapshot membekukan label.
7. OpenAPI ("Izin: `x`." di awal deskripsi), `rbac-matrix`, dokumentasi id/en/su, 375/768 px, mode gelap, sentuh 44 px.

---

## 2. Keputusan desain inti

1. **Satu mekanisme kerangka untuk semua.** `ref_profile_framework` + `ref_profile_framework_item` (global, tanpa RLS, ditulis migrasi)
   memuat `profil_lulusan_2025` (8 dimensi, semua jenjang) dan `panca_cinta_2025` (5 topik, jenis `value`, hanya profil `authority =
   kemenag`). Madrasah **tidak** punya kerangka dimensi terpisah (M14). Sekolah mengadopsi ke `school_profile_item` (tenant), lalu boleh
   mengganti label, menonaktifkan, atau menambah butir. Versi baru kebijakan = kunci kerangka baru (mis. `profil_lulusan_2027`); butir lama
   tetap ada untuk data historis.
2. **Kokurikuler bukan mapel.** Tidak masuk `subject.kind`, tidak dihitung `computeGrades`, tidak memengaruhi rata-rata, peringkat,
   kelengkapan finalisasi, kenaikan, atau kelulusan.
3. **Program per tahun ajaran, penilaian per semester.** Program menyasar rombel (peserta = roster rombel, pola yang sudah dipakai di semua
   modul); penilaian sumatif per (program, butir, murid, semester) memakai tingkat rubrik sekolah.
4. **Rubrik = data sekolah.** Tingkat capaian (label, urutan, deskripsi) disimpan per sekolah; UI menawarkan isian contoh "Sangat Baik,
   Baik, Cukup, Kurang" (sumber sekunder) yang dapat diubah, bukan enum.
5. **Fasilitator kontekstual.** Guru yang ditugaskan sebagai fasilitator (rombel tertentu) atau koordinator (semua rombel program) boleh
   menilai tanpa izin luas, pola yang sama dengan wali kelas dan pembina ekskul. Tabel ini juga menjadi data C11 dan bahan C10 (beban kerja,
   perhitungannya ditunda).
6. **Rapor: dua jalur, keduanya sparse.** (a) Bagian terstruktur `cocurricular` masuk dokumen rapor v2 hanya bila murid punya penilaian;
   (b) deskripsi tetap memakai `cocurricularNote` yang sudah ada. Draf deskripsi disusun **di klien** dari penilaian dan dimasukkan ke editor
   catatan; server tidak pernah menulis catatan otomatis, jadi tidak ada perubahan diam-diam pada rapor.
7. **Bukti karya = tautan** (https, ≤ 500 karakter). Unggah berkas ditunda (belum ada pola penyimpanan berkas di skema).

---

## 3. Tahap (berurutan, satu tahap = satu commit yang bisa diuji)

| Tahap | Isi                                                                                                         | Migrasi | Bergantung pada                               |
| ----- | ----------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------- |
| 4.1   | Kerangka profil: acuan global + adopsi sekolah; halaman Pengaturan kokurikuler (dimensi, rubrik)             | 0106    | fase 0 (`school.education_profile`)           |
| 4.2   | Program kokurikuler: bentuk, tema, rombel, butir sasaran, fasilitator, rencana JP vs alokasi                 | 0107    | 4.1; 2B (`curriculum_subject_allocation`)     |
| 4.3   | Penilaian kokurikuler per semester + catatan + bukti tautan; kunci final                                     | 0108    | 4.2; fase 1 (`report-lock-lib.ts`)            |
| 4.4   | Rapor: bagian `cocurricular` di dokumen/snapshot/portal/PDF; draf deskripsi di panel catatan                 | -       | 4.3; 3.2 (`report_card_section`, v2)          |
| 4.5   | Madrasah: NSM, seed nama rumpun PAI/Arab MI dan MA, gerbang Panca Cinta, NSM di kop rapor, judul PDF i18n    | 0109    | fase 0, 2C (`pai_arabic`); 4.4 untuk kop      |
| 4.6   | Penutup: OpenAPI, dokumentasi id/en/su, `FITUR-EDUSYNC.md`, CHANGELOG, uji 375/768/gelap, rilis v1.5.0        | -       | 4.1-4.5                                       |

4.5 (kecuali kop rapor) boleh dikerjakan paralel setelah 4.1.

---

## 4. Model data

Konvensi semua tabel tenant baru (salin dari 0104): `id uuid PRIMARY KEY DEFAULT uuidv7()`, `school_id uuid NOT NULL REFERENCES school(id)`,
`CONSTRAINT <t>_school_id_uq UNIQUE (school_id, id)`, FK komposit `(school_id, x_id) REFERENCES x(school_id, id)` (NO ACTION kecuali
disebut), `ENABLE` + `FORCE ROW LEVEL SECURITY`, policy `tenant_isolation` persis 0100, `GRANT SELECT, INSERT, UPDATE, DELETE … TO
edusync_app`. Tabel `ref_*`: tanpa `school_id`, tanpa RLS, `GRANT SELECT` saja (pola `ref_subject_group`). Hanya DDL dan seed acuan;
**tanpa backfill, tanpa kolom baru pada tabel lama**. `when` jurnal +86.400.000 per migrasi.

| Migrasi                      | `when`        |
| ---------------------------- | ------------- |
| 0106 `profile_framework`     | 1797384600000 |
| 0107 `cocurricular_program`  | 1797471000000 |
| 0108 `cocurricular_assessment` | 1797557400000 |
| 0109 `madrasah_identity`     | 1797643800000 |

Bila urutan pengerjaan bergeser, nomor mengikuti urutan (seperti 0104), `when` tetap naik dan > 1797298200000.

### 4.1 Migrasi 0106 `profile_framework` (tahap 4.1)

```
ref_profile_framework                         -- global
  key text PK                                  ('profil_lulusan_2025', 'panca_cinta_2025')
  kind text NOT NULL CHECK (kind IN ('dimension','value'))
  label_id, label_en, label_su text NOT NULL
  profile_keys text[] NULL                     (NULL = semua profil; panca_cinta = {mi,mts,ma,mak})
  source text NOT NULL                         (nomor regulasi)
  verification text NOT NULL CHECK (verification IN ('official','secondary'))
  sort int, active boolean DEFAULT true

ref_profile_framework_item                    -- global
  framework_key text REFERENCES ref_profile_framework(key), code text,
  group_code text NULL                         (Panca Cinta: bagian sumber/tanda/tali; NULL bila belum pasti)
  label_id, label_en, label_su text NOT NULL, sort int
  PRIMARY KEY (framework_key, code)

school_profile_item                           -- tenant
  id, school_id, framework_key text NOT NULL REFERENCES ref_profile_framework(key),
  ref_code text NULL                           (NULL = butir buatan sekolah)
  code text NOT NULL CHECK 1..40, label text NOT NULL CHECK 1..120, description text NULL CHECK <=1000,
  sort int DEFAULT 0, active boolean DEFAULT true, created_at, updated_at
  UNIQUE (school_id, framework_key, code)

cocurricular_rubric_level                     -- tenant
  id, school_id, code text CHECK 1..10, label text CHECK 1..60, description text NULL CHECK <=500,
  sort int NOT NULL, active boolean DEFAULT true, created_at, updated_at
  UNIQUE (school_id, code)
```

Seed: `profil_lulusan_2025` (`official`, Permendikdasmen 13/2025 Pasal 17) dengan 8 butir sesuai daftar P1; ejaan dicek ke Lampiran I
sebelum migrasi ditulis (regulasi-madrasah "Fase 4" baris 1). `panca_cinta_2025` (`secondary`, Kepdirjen Pendis 6077/2025) dengan 5 topik
M13, `group_code` NULL (pembagian tiga bagian belum dipetakan per topik). Tidak ada seed P5/P5RA: Edusync tidak punya data historis P5.

### 4.2 Migrasi 0107 `cocurricular_program` (tahap 4.2)

```
cocurricular_program
  id, school_id, academic_year_id NOT NULL, semester_id NULL   (NULL = sepanjang tahun)
  form text NOT NULL CHECK (form IN ('collaborative','g7kaih','other'))
  title text NOT NULL CHECK 1..200, theme text NULL CHECK <=200, description text NULL CHECK <=4000
  planned_periods int NULL CHECK (>= 0)      (JP yang direncanakan; dibandingkan dengan alokasi, hanya peringatan)
  show_in_report boolean NOT NULL DEFAULT true
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','closed'))
  created_by text NOT NULL, created_at, updated_at
  FK (school_id, academic_year_id), (school_id, semester_id)
  INDEX (school_id, academic_year_id)

cocurricular_program_target                  -- butir sasaran (dimensi dan/atau topik Panca Cinta)
  id, school_id, program_id, profile_item_id
  UNIQUE (program_id, profile_item_id); FK (school_id, program_id) ON DELETE CASCADE, (school_id, profile_item_id)

cocurricular_program_class
  id, school_id, program_id, class_id
  UNIQUE (program_id, class_id); FK program ON DELETE CASCADE, class_room; INDEX (school_id, class_id)

cocurricular_facilitator
  id, school_id, program_id, teacher_id, class_id NULL,
  role text NOT NULL CHECK (role IN ('coordinator','facilitator'))
  UNIQUE INDEX (program_id, teacher_id, COALESCE(class_id, nil-uuid))
  CHECK (role = 'coordinator' OR class_id IS NOT NULL)
  FK program ON DELETE CASCADE, teacher, class_room
```

API memvalidasi: semester milik tahun program; rombel milik tahun program; `class_id` fasilitator termasuk rombel program; butir sasaran
aktif. Hapus program ditolak bila sudah ada penilaian (409 `cocurricular_assessed`); arsipkan dengan `status = closed`.

### 4.3 Migrasi 0108 `cocurricular_assessment` (tahap 4.3)

```
cocurricular_assessment
  id, school_id, program_id, profile_item_id, student_id, semester_id NOT NULL,
  rubric_level_id NULL, note text NULL CHECK <=1000,
  updated_by text NOT NULL, updated_at
  CHECK (rubric_level_id IS NOT NULL OR note IS NOT NULL)
  UNIQUE (program_id, profile_item_id, student_id, semester_id)
  FK komposit ke program, school_profile_item, student, semester, cocurricular_rubric_level (semua NO ACTION)
  INDEX (school_id, semester_id, student_id)              -- muat satu semester sekaligus untuk rapor

cocurricular_evidence
  id, school_id, program_id, student_id NULL (NULL = bukti rombel/kelompok), class_id NULL,
  title text CHECK 1..200, url text NOT NULL CHECK (url ~ '^https://' AND char_length(url) <= 500),
  created_by text NOT NULL, created_at
  FK program ON DELETE CASCADE, student, class_room; INDEX (school_id, program_id)
```

Hanya penilaian **sumatif** per semester yang disimpan (formatif tidak pernah masuk rapor; catatan formatif ditunda, bagian 9).

### 4.4 Migrasi 0109 `madrasah_identity` (tahap 4.5)

```
school_identifier                            -- tenant, satu baris per sekolah
  school_id uuid PRIMARY KEY REFERENCES school(id),
  nsm text NULL CHECK (nsm IS NULL OR nsm ~ '^[0-9]{8,16}$'),     (longgar: panjang resmi belum diverifikasi)
  updated_by text NOT NULL, updated_at
  UNIQUE INDEX (nsm) WHERE nsm IS NOT NULL
  RLS + policy tenant_isolation + GRANT

INSERT INTO ref_subject (curriculum_key, level_group, code, name, sort)      -- hanya nama, tanpa JP
  ('kma','sd', AQH/AKH/FQH/SKI/BAR …), ('kma','sma', AQH/AKH/FQH/SKI/BAR …)  ON CONFLICT DO NOTHING
UPDATE ref_curriculum SET description = '… JP dan mapel khusus MA mengikuti KMA 1503/2025; isi sendiri.' WHERE key = 'kma'
```

Lima nama itu sama dengan baris `kma`/`smp` yang sudah ada (0020) dan konsisten di M5-M7; tidak ada angka JP, tidak ada mapel MA Program
Keagamaan (Tafsir/Hadis, Ilmu Kalam, dst.), tidak ada aturan "SKI mulai kelas 3": semuanya diisi sekolah lewat mapel dan alokasi
(`curriculum_subject_allocation`) yang sudah ada. Madrasah mengadopsi `merdeka` (mapel umum) **dan** `kma` (rumpun PAI/Arab):
`school_curriculum` ber-PK `(school_id, curriculum_key, level_group)` sehingga dua acuan didukung (terverifikasi `schema.ts:1544`).
Baris `kma` mendapat `subject_group = 'pai_arabic'` saat diadopsi (pemetaan kode di jalur adopsi).

---

## 5. Izin, modul, endpoint

| Izin                   | Arti                                                         | Peran bawaan                                                     |
| ---------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| `cocurricular:read`    | Baca kerangka, program, penilaian, bukti                     | `school_admin`, `principal`, `curriculum`, `operator`, `teacher` |
| `cocurricular:manage`  | Adopsi kerangka, rubrik, program, rombel, fasilitator; menilai semua rombel | `school_admin`, `curriculum`                          |

Menilai dan menambah bukti: `cocurricular:manage` **atau** fasilitator rombel itu **atau** koordinator program (hak kontekstual, helper
baru `canAssessCocurricular(tx, ctx, programId, classId)` lewat `teacher.member_id`). Roadmap menyebut `cocurricular:assess`; tidak dibuat
karena hak kontekstual sudah menutupnya (bagian 9 butir 3). NSM: `school:manage`. Izin baru masuk `PERMISSIONS` dan `SYSTEM_ROLES`,
sampai ke sekolah lama lewat `syncSystemRolePermissions`. **Modul:** kokurikuler → `grades` (Nilai dan rapor); NSM dan seed → inti.

| Tahap | Endpoint                                                                                     | Izin                                         | Galat baru                                                       |
| ----- | -------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| 4.1   | `GET /v1/reference/profile-frameworks` (beserta butir; disaring profil sekolah)               | `cocurricular:read`                          | -                                                                |
| 4.1   | `GET/PUT /v1/cocurricular/profile-items`, `POST …/adopt` `{frameworkKey}` (idempoten)         | `cocurricular:read` / `manage`               | 400 `framework_not_for_profile`; 409 `item_in_use` (hapus → nonaktif) |
| 4.1   | `GET/PUT /v1/cocurricular/rubric-levels` (tulis batch)                                       | `cocurricular:read` / `manage`               | 409 `item_in_use`                                                |
| 4.2   | `GET/POST /v1/cocurricular/programs`, `GET/PUT/DELETE /v1/cocurricular/programs/:id`          | `read` / `manage`                            | 400 `invalid_reference`; 409 `cocurricular_assessed`             |
| 4.2   | `PUT /v1/cocurricular/programs/:id/classes`, `…/targets`, `…/facilitators` (ganti seluruh)    | `manage`                                     | 409 `cocurricular_assessed` (melepas rombel/butir yang sudah dinilai) |
| 4.2   | `GET /v1/cocurricular/periods-summary?academicYearId=` (rencana JP vs alokasi per tingkat)    | `read`                                       | -                                                                |
| 4.3   | `GET /v1/cocurricular/programs/:id/assessments?semesterId=&classId=`                          | `read` + hak lihat rombel                    | -                                                                |
| 4.3   | `PUT /v1/cocurricular/programs/:id/assessments` (batch ≤ 500 sel)                             | `manage` atau fasilitator/koordinator        | 409 `report_final`, `program_closed`; 400 `student_not_in_class`, `too_many_items` |
| 4.3   | `GET/POST/DELETE /v1/cocurricular/programs/:id/evidence`                                      | sama                                         | 400 `invalid_url`                                                |
| 4.5   | `GET/PUT /v1/school/identifier` (`nsm`)                                                      | anggota sekolah (baca) / `school:manage`     | 409 `nsm_taken`                                                  |

Guard: `assertStudentsReportNotFinal(tx, semesterId, studentIds)` (ada, `report-lock-lib.ts:44`) pada tulis penilaian dan bukti per murid;
pada pelepasan rombel/butir dan penghapusan program yang punya penilaian di semester final, tolak 409 `report_final`. Program `closed`
menolak tulis (409 `program_closed`) tetapi tetap tampil di rapor.

---

## 6. UI (mobile lebih dulu)

| Layar                                   | Isi                                                                                                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/cocurricular` (menu Nilai dan rapor)  | Daftar program per tahun ajaran; filter semester/status; kartu di bawah `lg`, tabel di atasnya; tombol "Program baru" di footer lengket pada 375 px.         |
| `/cocurricular/[id]`                    | Tab: Ringkasan (bentuk, tema, JP rencana vs alokasi, peringatan bila melebihi), Rombel dan fasilitator, Penilaian, Bukti.                                   |
| Tab Penilaian                           | Pilih semester + rombel. ≥ `lg`: matriks murid × butir (select tingkat). < `lg`: satu kartu per murid, butir bertumpuk, select 44 px, catatan dapat dibuka; simpan batch dengan footer lengket dan indikator "belum disimpan". Isi massal "semua = tingkat X" per butir. Terkunci (baca-saja + pita) bila rapor final. |
| `/cocurricular/settings`                | Adopsi kerangka (Panca Cinta hanya tampil untuk profil kemenag, berlabel "sumber sekunder, periksa"), ubah label/aktif butir, rubrik dengan tombol "isi contoh". |
| Panel catatan rapor (sudah ada)         | Tombol "Susun dari penilaian kokurikuler": menyusun draf teks di klien (templat i18n) ke editor `cocurricularNote`; guru menyunting lalu menyimpan lewat endpoint lama. |
| Pengaturan sekolah                      | Kolom NSM (hanya profil `authority = kemenag`).                                                                                                             |
| Rapor PDF                               | Bagian kokurikuler: tabel program → butir → tingkat (+ catatan) di bawah deskripsi, hanya bila `showCocurricular` dan ada data; kop memuat NSM bila ada; judul PDF lewat terjemahan. |

Semua layar: 375 px, 768 px, mode gelap, tiga bahasa tanpa terpotong, tanpa gulir horizontal halaman.

---

## 7. Dampak ke rapor dan snapshot (tahap 4.4, 4.5)

1. Kunci dokumen baru, **sparse**, ditambahkan ke `REPORT_V2_DOCUMENT_KEYS` (`packages/contracts/src/report-document.ts:149`):
   - `cocurricular?: { programId, title, form, items: { code, label, framework, level: { code, label } | null, note? }[] }[]`
     hanya bila murid punya ≥ 1 penilaian di semester itu pada program `show_in_report`. Label diambil saat menyusun, jadi snapshot
     membekukan nama butir dan tingkat (perubahan label kemudian tidak mengubah rapor final).
   - `schoolNsm?: string` hanya bila NSM terisi. Kunci tingkat atas (bukan di dalam `school`) supaya deteksi versi tetap bekerja dan
     dokumen v1 tidak pernah memuat kunci asing.
2. Pemuatan: `loadCocurricular(tx, semesterId)` satu kueri per semester → `Map<studentId, …>`, pola `loadSectionNotes`
   (`report-card-lib.ts:393`); diteruskan lewat `StudentV2Input`. Tanpa N+1.
3. `reportDocumentSchemaVersion` → 2 bila kunci hadir. Dokumen tanpa data kokurikuler dan tanpa NSM = v1, jsonb sama persis; garis dasar
   tidak berubah (sekolahnya tidak punya baris di tabel baru; tidak ada seed otomatis per sekolah).
4. Kelengkapan finalisasi (`grades_incomplete`) **tidak** memperhitungkan kokurikuler; daftar rapor boleh memberi lencana info sparse
   `cocurricularMissing?` (bagian 9 butir 4).
5. Portal: `portalReportDocumentSchema` mewarisi kunci dari v2, jadi wali melihat bagian yang sama. Mode deskriptif Fase A tetap
   menampilkan tingkat rubrik (label kualitatif, bukan angka).
6. `matchesLive`/perbandingan snapshot membandingkan dokumen utuh, jadi kunci baru ikut terbandingkan tanpa kode khusus (asumsi A2).
7. Ekspor akademik 3C.5 tidak diubah pada fase ini.

---

## 8. Uji

| Uji                                     | Isi                                                                                                                   |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `phase3-baseline.test.ts`               | **Tidak diubah**, wajib hijau di setiap tahap.                                                                        |
| `tenant-isolation.test.ts`              | Daftarkan 9 tabel tenant baru.                                                                                        |
| `rbac-matrix`                           | Dua izin baru, gerbang modul `grades`.                                                                                |
| `cocurricular.test.ts` (baru)           | Adopsi idempoten; Panca Cinta ditolak untuk profil non-kemenag; fasilitator hanya rombelnya, koordinator semua; guru lain 403; `report_final` lalu buka kembali; `cocurricular_assessed`; `program_closed`; URL bukti non-https ditolak; isolasi per route. |
| `report-document.test.ts`               | Versi 2 bila `cocurricular`/`schoolNsm` hadir; v1 identik tanpa keduanya.                                             |
| `report-card-v2.test.ts`                | Snapshot membekukan label setelah label butir diganti; portal memuat bagian yang sama.                                |
| Migrasi                                 | Seed `kma` sd/sma idempoten (`ON CONFLICT DO NOTHING`); adopsi `merdeka` + `kma` sekaligus pada sekolah MI.             |
| Peramban                                | 375/768/gelap pada matriks penilaian dan pengaturan; tiga bahasa.                                                     |

Tes wajib roadmap (`grading`, `report-card`, `schedule`, `pkl`, `rbac-matrix`, `tenant-isolation`) hijau sebelum tag.

---

## 9. Risiko dan keputusan terbuka

**Risiko**

| Risiko                                                                                     | Mitigasi                                                                                                       |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Isi KMA 1503/2025 berbeda dari sumber sekunder (nama mapel, struktur MA)                     | Seed hanya lima nama yang sudah ada untuk MTs; semua dapat diubah sekolah; JP tidak di-seed.                   |
| Label Panca Cinta atau ejaan 8 dimensi berbeda dari teks resmi                               | Status `verification` di acuan; label disalin ke sekolah dan dapat diganti; snapshot membekukan label.        |
| Kunci dokumen baru merusak garis dasar                                                       | Sparse + tanpa seed per sekolah; garis dasar dijalankan di CI tiap tahap.                                      |
| Murid pindah rombel di tengah semester                                                      | Penilaian dikunci per murid-semester, bukan per rombel; rapor memuat semua penilaian murid di semester itu.   |
| Matriks besar di layar kecil                                                                | Kartu per murid < `lg`, batch ≤ 500 sel, simpan eksplisit.                                                     |
| Kebijakan kokurikuler berubah lagi                                                           | Kerangka berversi per kunci; program menyimpan butir sekolah, bukan kode keras.                                |

**Keputusan terbuka (bawaan aman berlaku sampai dijawab)**

| #  | Pertanyaan                                                                                      | Bawaan                                                                                     |
| -- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1  | Kokurikuler di modul `grades` atau modul berbayar sendiri?                                      | `grades` (usulan roadmap); kokurikuler wajib di rapor, jadi jangan dipisah berbayar.        |
| 2  | Seed lima nama PAI/Arab untuk MI dan MA sebelum KMA 1503 terbaca?                               | Ya, hanya nama (sudah ada untuk MTs), tanpa JP dan tanpa mapel MA keagamaan.               |
| 3  | Izin `cocurricular:assess` terpisah?                                                            | Tidak; `manage` + hak kontekstual fasilitator/koordinator.                                 |
| 4  | Kokurikuler kosong menghalangi finalisasi rapor?                                                | Tidak; hanya lencana info.                                                                 |
| 5  | Catatan formatif kokurikuler, kelompok di dalam rombel, unggah berkas bukti                    | Ditunda (v1.5 hanya sumatif, rombel, tautan).                                              |
| 6  | Program disalin saat rollover?                                                                   | Tidak; tambah "salin dari tahun lalu" bila diminta.                                        |
| 7  | Deskripsi kokurikuler otomatis di server?                                                       | Tidak; draf disusun di klien dan disimpan guru lewat `cocurricularNote`.                   |
| 8  | Format NSM                                                                                       | CHECK longgar 8-16 digit; diperketat setelah format resmi diverifikasi (memperketat butuh pembersihan data). |
| 9  | Templat rapor madrasah (RDM) berbeda?                                                           | Tidak di fase ini; `template_key` tetap bawaan (format resmi tidak ditemukan, M11).        |
| 10 | Beban kerja fasilitator (C10/G15)                                                               | Data dicatat (`cocurricular_facilitator`), perhitungan ditunda ke fitur beban kerja.       |

---

## 10. Asumsi dan ketidakpastian

- A1: `teacher`, `class_room`, `semester`, `academic_year`, `student` sudah punya `UNIQUE (school_id, id)` untuk FK komposit (dipakai
  migrasi 0100-0105; cek ulang saat menulis 0107).
- A2: perbandingan snapshot vs dokumen hidup membandingkan jsonb utuh (cek `report-card-lib.ts` saat tahap 4.4).
- A3: jalur adopsi kurikulum dapat memetakan kode `kma` ke `subject_group = 'pai_arabic'` tanpa mengubah adopsi `merdeka`.
- A4: daftar 8 dimensi resmi (Pasal 17); nama Panca Cinta dari halaman kanwil (sekunder); NSM 12 digit hanya pengetahuan umum, belum diverifikasi.
- Belum dibaca: Lampiran I Permendikdasmen 13/2025 (ejaan dimensi), alur perkembangan dimensi, KMA 1503/2025, SK Dirjen Pendis 9941/2025.
