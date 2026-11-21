# Rancangan: tahap 3B.5 (penilaian serentak lintas rombel) dan tahap 3.6 (perencanaan, jurnal mengajar, penilaian proses)

Dua tahap opsional, sudah disetujui pengguna. Induk: [rancangan-3b-3c-pilihan-mapel-kelulusan.md](rancangan-3b-3c-pilihan-mapel-kelulusan.md)
(bagian 3.2 "Penilaian lintas rombel", bagian 8) dan [rancangan-fase-3-asesmen-rapor.md](rancangan-fase-3-asesmen-rapor.md) (bagian 4.5, K16).
Regulasi: [regulasi-umum.md](regulasi-umum.md) (baris `lesson_journal` dan `teaching_module`, C12). Rancangan ini **tidak mengubah kode**.

Status kode yang dibaca (terverifikasi): 3B.1-3B.4 sudah ada (`subject-roster-lib.ts`, `schedule_entry.lane/combined_key`, `lesson-roster-lib.ts`,
`GET/PUT /v1/lesson-attendance/combined`, `CombinedSheet` di `lessons-view.tsx`). Tabel `learning_plan`, `lesson_journal`,
`learning_process_review`, `teaching_module` **belum ada** di skema. Perangkat CP/TP/ATP ada (`routes/teaching-plan.ts`, halaman `/teaching-plan`,
izin `teaching_plan:write`). `assessment` terikat satu kelas (`class_id` NOT NULL) dan dipakai rapor, penjaga `report_final`, KKM per kelas.

## 0. Urutan, dependensi, nomor migrasi

Kedua tahap saling bebas. Urutan usulan: **3B.5 dahulu** (kecil, nilai pakai langsung untuk 3B), lalu 3.6.

Jurnal `meta/_journal.json` saat ini berakhir di idx 120 `0120_exam_room`, `when` = 1798680600000 (0120 sudah terpakai pekerjaan ruang ujian yang
belum di-commit). Nomor di bawah dimulai **0121**, naik 86400000 per migrasi. Periksa ulang jurnal saat implementasi; bila ada migrasi lain
masuk lebih dulu, geser nomor dan `when` (selalu > entri terakhir).

| Tahap  | Isi                                                        | Migrasi (`when`)                       | Bergantung pada              |
| ------ | ---------------------------------------------------------- | -------------------------------------- | ---------------------------- |
| 3B.5.1 | Penanda kembar + buat/ubah serentak (API)                  | 0121 `assessment_twin` (1798767000000) | 3B.2 (selesai)               |
| 3B.5.2 | UI buat serentak + lencana kembar + ubah serentak          | -                                      | 3B.5.1                       |
| 3B.5.3 | Input skor gabungan satu lembar (opsional dalam opsional)  | -                                      | 3B.5.1                       |
| 3.6.1  | Sakelar sekolah + perencanaan pembelajaran                 | 0122 `learning_plan` (1798853400000)   | perangkat CP/TP (selesai)    |
| 3.6.2  | Jurnal mengajar di Absensi per jam                         | 0123 `lesson_journal` (1798939800000)  | 3.6.1 (sakelar), 3B.4        |
| 3.6.3  | Penilaian proses pembelajaran (C12)                        | 0124 `learning_review` (1799026200000) | 3.6.1 (sakelar)              |

Tiap tahap: backend + tes, OpenAPI (deskripsi izin/modul/galat), `rbac-matrix`, web, uji 375 px/768 px/gelap, bantuan id/en/su
(`docs/content-*.ts`), CHANGELOG, suite wajib + `phase3-baseline` hijau. Semua migrasi aditif, tanpa backfill (migrator tunduk FORCE RLS,
lihat catatan di 0120), RLS gaya 0120 (`ENABLE` + `FORCE` + kebijakan `tenant_isolation` memakai `app_school_ids()`), id `uuidv7()`,
FK komposit `(school_id, x)` ke induk. Induk yang belum punya `UNIQUE (school_id, id)` ditambahi di migrasi yang sama.

---

## 1. Tahap 3B.5 - penilaian serentak lintas rombel

### 1.1 Masalah dan pilihan

Mapel pilihan (mis. Fisika pilihan) diajar satu guru untuk murid dari beberapa rombel. Sekarang guru membuat penilaian kembar per rombel
secara manual, lalu mengisi skor per rombel. Dua opsi:

|                  | A. Penanda grup kembar: satu permintaan membuat satu `assessment` per rombel, diikat `twin_key` | B. Satu penilaian bercakupan multi-rombel (`assessment_class`) |
| ---------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Perubahan skema  | 1 kolom nullable                                                                                | Tabel baru; `assessment.class_id` jadi turunan                 |
| Jalur terdampak  | Nol: tiap kembar adalah `assessment` biasa                                                      | Skor, rekap, rapor, KKM per kelas, penjaga `report_final`, `assessment_exam_class_uq`, remedial, TP, ujian CBT, portal |
| Risiko garis dasar | Tidak ada                                                                                     | Tinggi                                                         |

**Keputusan: A.** Alasan: `class_id` adalah sumbu penjaga final, KKM, rapor, dan roster per mapel; menyentuhnya mengulang risiko yang
sengaja dihindari di 3B (keputusan B pada jadwal). Pola yang sama sudah dipakai `schedule_entry.combined_key` (hanya pengelompokan, tanpa
FK, kesesuaian dijaga API) dan ujian (satu penilaian per kelas peserta lewat `exam_id`). Penilaian dari ujian CBT tetap lewat `exam_id`,
`twin_key` dibiarkan NULL.

### 1.2 Model data (0121)

```sql
ALTER TABLE "assessment" ADD COLUMN "twin_key" uuid;   -- NULL = penilaian biasa (semua data lama)
CREATE INDEX "assessment_twin_idx" ON "assessment" ("school_id", "twin_key") WHERE "twin_key" IS NOT NULL;
```

Tanpa tabel baru, tanpa FK, tanpa kebijakan baru (RLS `assessment` sudah ada). Kembar = penilaian dengan `twin_key` sama; kembar bergrup satu
anggota diperlakukan biasa (UI menyembunyikan lencana).

### 1.3 Izin dan endpoint (tanpa izin baru)

Izin tetap: `grade:input` + `canInputPair(kelas, mapel)` **per rombel**, modul `grades`.

- `POST /v1/assessments`: body tambah `alsoClassIds?: uuid[]` (maks 11, tanpa `classId` utama, tanpa duplikat; 400 `too_many_twins`).
  Tanpa field ini perilaku persis sekarang. Dengan field: dalam **satu transaksi** (semua atau tidak sama sekali) tiap rombel melewati
  pemeriksaan yang sama dengan pembuatan tunggal (`requireRefs`, `canInputPair`, `assertClassReportNotFinal`, `assertComponentInSemester`,
  `assertTags`, `assertObjectivesForSubject`, pengampu = `teaching_assignment` rombel itu). Tahun ajaran rombel harus sama dengan
  semester (400 `invalid_reference`). Rombel tanpa satu pun pengambil mapel itu (`subjectRosterOf` kosong) ditolak 400 `twin_class_no_takers`.
  Semua baris diberi `twin_key` baru. Respons 201: penilaian rombel utama seperti sekarang + `twins?: {id, classId, className}[]` (sparse).
  Audit: satu entri `assessment.create` per baris + `twinCount`.
- `PUT /v1/assessments/:id`: body tambah `applyToTwins?: boolean` (bawaan `false` = perilaku sekarang). `true` menyebarkan judul, tanggal,
  skor maksimum, komponen, tanda, dan `objectiveIds` ke semua kembar. Semua atau tidak: bila ada kembar yang diblokir (`report_final`,
  `component_not_in_semester`, `score_exceeds_max`, bukan pengampu), tolak 409 `twin_blocked` dengan `blocked: {classId, className, reason}[]`;
  guru dapat mengubah satu per satu tanpa `applyToTwins`.
- `DELETE`: **tidak** menyebar (destruktif). Menghapus satu anggota hanya menghapus anggota itu.
- `GET /v1/assessments`: item membawa `twinKey?` dan `twinCount?` (hanya bila ada; sparse sehingga respons sekolah lama identik).
- 3B.5.3 (opsional): `GET/PUT /v1/assessments/twins/:twinKey/scores`: lembar gabungan murid semua kembar (urut rombel, nama); PUT menulis skor ke
  kembar milik rombel tiap murid, memakai inti penulisan skor yang sama dengan `PUT /v1/assessments/:id/scores` (diekstrak ke lib, bukan
  disalin), penjaga final per rombel/murid tetap, murid non-pengambil ditolak seperti sekarang. Pola respons mengikuti `CombinedSheet`.
  Bisa ditunda tanpa menghalangi 3B.5.1-2: guru mengisi skor per kembar seperti sekarang.

### 1.4 Dampak ke nilai, KKM, roster, rapor

- **Nilai:** tiap kembar `assessment` biasa; `computeGrades`, rekap, matriks, remedial, ketercapaian TP **tidak berubah**. Skor tetap per
  penilaian (per rombel). Murid pindah rombel: skor tetap di kembar rombel lama (perilaku sekarang); tidak ada salinan silang.
- **KKM/KKTP:** dihitung per (rombel, mapel) lewat `kkmResolverForClass`; kembar di rombel berbeda dapat memiliki kriteria berbeda bila
  dikonfigurasi berbeda. Tidak ada KKM "bersama". Ini disengaja dan dicatat di bantuan.
- **Roster per mapel:** tiap kembar memakai `subjectRosterOf(kelas, mapel, semester)`, jadi hanya pengambil rombel itu yang punya baris skor.
  Perubahan pilihan mapel setelah penilaian dibuat tidak menyalin/menghapus skor (aturan 3B.2 berlaku).
- **Rapor/snapshot:** tidak ada perubahan; `twin_key` tidak masuk dokumen rapor, snapshot, `semester_grading_config`, atau `config_version`.
- **Sakelar per sekolah:** tidak perlu. Fitur hanya aktif bila permintaan memuat `alsoClassIds`/`applyToTwins`; sekolah yang tidak memakainya
  tidak berubah. `phase3-baseline` tidak berubah (kolom nullable, field respons sparse).

### 1.5 UI mobile

Form "Buat penilaian" (`grading`): bagian "Berlaku juga untuk rombel lain" tampil bila guru punya pasangan (rombel lain, mapel sama) pada
tahun yang sama; chip rombel (centang), bawaan kosong; ringkasan "dibuat untuk 3 rombel, 48 pengambil". Daftar penilaian: lencana
"Kembar 3 rombel" dan, pada form ubah, kotak "terapkan ke semua kembar". 375 px: chip membungkus, tombol penuh lebar; tabel gabungan 3B.5.3 jadi kartu per murid di bawah `lg`.

### 1.6 Tes

Buat serentak sukses (N baris, `twin_key` sama, pengampu per rombel benar); gagal semua bila satu rombel final/bukan pengampu/tanpa pengambil;
tanpa `alsoClassIds` identik lama; `applyToTwins` menyebar dan 409 `twin_blocked`; hapus satu tidak menyentuh kembar; isolasi tenant (kembar
sekolah lain tidak terlihat; RLS); respons lama tanpa `twinKey`; `phase3-baseline` hijau. 3B.5.3: PUT gabungan routing per rombel + non-pengambil ditolak.

### 1.7 Risiko

Guru mengira KKM/nilai bersama (mitigasi: teks bantuan + lencana); kembar menyimpang setelah diedit satu-satu (diterima: itu fleksibilitas; lencana
tidak mengklaim identik); satu rombel final menghalangi penyebaran (mitigasi: `twin_blocked` jelas, ubah manual).

---

## 2. Tahap 3.6 - perencanaan pembelajaran, jurnal mengajar, penilaian proses

Prinsip regulasi: bukan kewajiban nasional kecuali penilaian proses (C12). Istilah netral **"perencanaan pembelajaran"** (bukan "RPP"/"modul ajar"
sebagai format wajib). Perencanaan minimal tujuan, langkah, asesmen. Penilaian proses minimal 1x/semester oleh refleksi guru, sejawat,
kepala sekolah, murid. **Tidak ada fitur yang memengaruhi nilai, rapor, kenaikan, atau memblokir alur lain.**

### 2.1 Sakelar per sekolah (3.6.1, 0122)

```sql
CREATE TABLE "learning_plan_setting" (
  "school_id" uuid PRIMARY KEY REFERENCES "school"("id"),
  "plan_enabled" boolean NOT NULL DEFAULT false,
  "journal_enabled" boolean NOT NULL DEFAULT false,
  "review_enabled" boolean NOT NULL DEFAULT false,
  "review_min_per_semester" smallint NOT NULL DEFAULT 1 CHECK ("review_min_per_semester" BETWEEN 1 AND 4),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);  -- + RLS tenant_isolation
```

Baris tidak ada = semuanya mati (sparse, seperti `grading_setting`). Tiga sakelar karena sekolah mungkin hanya mau jurnal.
`GET /v1/learning-plan/settings` (bacaan: pengguna dengan `subject:read`; web memakainya untuk menampilkan/menyembunyikan menu dan bagian Absensi),
`PUT` (izin `curriculum:manage`; audit). Endpoint fitur saat mati menjawab kode baru `403 feature_disabled` (bukan `module_disabled`, supaya
tidak tertukar dengan entitlement berbayar). Alasan tabel sendiri, bukan kolom di `school_setting`/`grading_setting`:
tidak menyentuh tabel yang dibekukan/di-dump garis dasar, dan mudah dihapus bila fitur dicabut. Tidak ada entitlement baru (ikut modul
yang sudah ada, lihat K-B).

Sekolah yang tidak menyalakan: tidak ada baris data, tidak ada menu, tidak ada bagian di layar Absensi per jam, tidak ada perubahan pada
respons endpoint lama (`GET /v1/lesson-attendance` tidak diubah; jurnal memakai endpoint terpisah). Dokumen rapor/snapshot tidak berubah.

### 2.2 Tahap 3.6.1 - perencanaan pembelajaran (0122)

```sql
CREATE TABLE "learning_plan" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7(), "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "subject_id" uuid NOT NULL, "academic_year_id" uuid NOT NULL, "semester_id" uuid,        -- NULL = setahun
  "level_code" text,                                                                       -- NULL = semua tingkat
  "teacher_id" uuid,                                                                       -- pemilik (guru), boleh NULL (milik sekolah)
  "title" text NOT NULL, "goals" text NOT NULL, "steps" text NOT NULL, "assessment_plan" text NOT NULL,
  "link_url" text,                                                                         -- tautan eksternal (https), opsional
  "created_by" text, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  -- FK komposit: subject, academic_year, semester, teacher
  CONSTRAINT "learning_plan_text_len_ck" CHECK (char_length("goals") <= 8000 AND char_length("steps") <= 8000 AND char_length("assessment_plan") <= 8000)
);
CREATE TABLE "learning_plan_objective" (            -- relasi TP ternormalisasi (bukan jsonb)
  "school_id" uuid NOT NULL, "plan_id" uuid NOT NULL, "objective_id" uuid NOT NULL,
  PRIMARY KEY ("plan_id", "objective_id")           -- FK komposit plan CASCADE, objective NO ACTION
);
```

Tiga kolom teks adalah "minimal tujuan, langkah, asesmen"; tanpa form panjang, tanpa unggah berkas (belum ada `school_file`; tautan saja,
lihat K-C). Tidak ada versi/penerbitan (beda dengan ATP): perencanaan boleh disunting bebas.

- Endpoint: `GET /v1/learning-plans?subjectId&academicYearId&semesterId` ; `POST`, `PUT /:id`, `DELETE /:id`, `PUT /:id/objectives`.
- Izin: baca `subject:read`; tulis `teaching_plan:write` dan pengampu mapel itu atau `curriculum:manage` (fungsi `assertCanWrite` di `teaching-plan.ts`
  dipakai ulang, diekspor). Validasi TP: `assertObjectivesForSubject`-setara (TP milik mapel, aktif, maks 20).
- Galat: 403 `feature_disabled`, 400 `objective_subject_mismatch`/`objective_inactive`/`too_many_objectives`, 404.
- Web: tab "Perencanaan" di halaman `/teaching-plan` (muncul bila `plan_enabled`): daftar per mapel/semester, formulir tiga kolom, pemilih TP massal.
  375 px: satu kolom, textarea penuh lebar, pemilih TP sebagai lembar bawah.

### 2.3 Tahap 3.6.2 - jurnal mengajar di Absensi per jam (0123)

```sql
CREATE TABLE "lesson_journal" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7(), "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "schedule_entry_id" uuid NOT NULL, "date" date NOT NULL,
  "topic" text NOT NULL, "note" text,                         -- ringkasan materi, catatan/kendala/refleksi singkat
  "plan_id" uuid,                                             -- perencanaan terkait (opsional)
  "actual_teacher_id" uuid,                                   -- diisi bila yang mengisi bukan guru jadwal (guru pengganti)
  "recorded_by" text NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "lesson_journal_uq" UNIQUE ("schedule_entry_id", "date")     -- FK komposit schedule_entry CASCADE; plan SET NULL; teacher NO ACTION
);
CREATE TABLE "lesson_journal_objective" (
  "school_id" uuid NOT NULL, "journal_id" uuid NOT NULL, "objective_id" uuid NOT NULL,
  PRIMARY KEY ("journal_id", "objective_id")
);
```

- Endpoint: `GET /v1/lesson-journals?scheduleEntryId&date` (+ rentang tanggal untuk riwayat guru), `PUT /v1/lesson-journals` (upsert per sel+tanggal, `objectiveIds`
  opsional maks 10), `DELETE`. Memakai `authorizeLesson` yang diekspor dari `lesson-attendance.ts` (pemilik jadwal, `attendance:configure`, guru
  piket hari itu) dan validasi tanggal yang sama dengan PUT absensi (hari jadwal, di dalam semester sel, `entryAppliesOn`, tidak di masa depan, bukan libur).
  Modul `attendance`. Jurnal **tidak** diblokir `report_final` (bukan data nilai) dan **tidak** diwajibkan sebelum absensi.
- Pertemuan gabungan: satu penyimpanan di lembar gabungan menulis baris yang sama ke tiap sel (satu jurnal per sel, karena kuncinya sel+tanggal).
- Web: di `LessonSheet`/`CombinedSheet` (`lessons-view.tsx`) bagian lipat "Jurnal" di bawah daftar murid, tampil hanya bila `journal_enabled`:
  topik (wajib untuk menyimpan jurnal), catatan, chip TP (dari perencanaan terkait bila ada), tombol simpan sendiri (terpisah dari simpan
  absensi supaya satu tidak menggagalkan yang lain). Halaman kecil "Jurnal saya" (riwayat per mapel). Sekolah yang mati: bagian itu tidak dirender.
- Audit: `lesson_journal.save` dengan `substitute` bila `actual_teacher_id`.

### 2.4 Tahap 3.6.3 - penilaian proses pembelajaran, C12 (0124)

```sql
CREATE TABLE "learning_process_review" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7(), "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "semester_id" uuid NOT NULL, "teacher_id" uuid NOT NULL,                  -- guru yang ditinjau
  "reviewer_kind" text NOT NULL CHECK ("reviewer_kind" IN ('self','peer','principal','student')),
  "reviewer_teacher_id" uuid,                                                -- hanya untuk peer (guru penilai)
  "reviewed_on" date NOT NULL,
  "ratings" jsonb,                                                           -- {kunci_butir: 1..4}, kunci dari kontrak, tervalidasi zod
  "respondent_count" integer CHECK ("respondent_count" IS NULL OR "respondent_count" > 0),  -- hanya untuk student (agregat)
  "note" text, "shared_with_teacher" boolean NOT NULL DEFAULT false,
  "recorded_by" text NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(),
  -- FK komposit: semester, teacher, reviewer_teacher
);
CREATE INDEX ON "learning_process_review" ("school_id", "semester_id", "teacher_id");
```

- Butir rubrik di `packages/contracts` (`LEARNING_REVIEW_ITEMS`, netral: perencanaan, pelaksanaan, penilaian, tindak lanjut; skala 1-4 + catatan),
  tidak dapat dikustom di tahap ini (K-E). Bentuk disimpan sparse; butir tidak dikenal ditolak 400 `invalid_rating`.
- Murid sebagai penilai: **agregat anonim** (`respondent_count`, tanpa identitas murid), diinput staf dari survei kertas/formulir sekolah; portal
  murid tetap `portal:read` (tanpa jalur tulis baru, konsisten keputusan 3.3 pada rancangan 3B).
- **Izin baru** `teaching_review:manage` (satu-satunya izin baru di rancangan ini): diberikan ke `school_admin` (otomatis), `principal`, `curriculum`.
  Alasan: kepala sekolah tidak punya `teaching_plan:write`/`curriculum:manage`, dan menilai guru lain tidak boleh melekat pada izin menulis perangkat.
  Guru (`teaching_plan:write` + `review_enabled`) hanya boleh membuat/ubah/hapus tinjauan `self` miliknya dan melihat tinjauan lain tentang dirinya
  **hanya bila** `shared_with_teacher = true` (bawaan `false`).
- Endpoint: `GET /v1/learning-reviews?semesterId&teacherId` ; `POST/PUT/DELETE /v1/learning-reviews` ; `GET /v1/learning-reviews/coverage?semesterId`
  (per guru aktif: hitungan per `reviewer_kind` dan `met` bila total >= `review_min_per_semester`; aturan C12 = minimal 1x/semester
  atas keempat sudut pandang bila sekolah memilih "lengkap", lihat K-D). Hanya melaporkan; **tidak memblokir** apa pun, tanpa notifikasi (WhatsApp ditunda).
- Web: `/teaching-plan` tab "Penilaian proses" (admin/kepala sekolah/kurikulum: ringkasan kecakupan per guru + tambah tinjauan; guru: refleksi diri
  + hasil yang dibagikan). 375 px: kartu per guru dengan lencana kecakupan, formulir rubrik sebagai daftar butir bersegmen 1-4.

### 2.5 Dampak lintas-tahap 3.6

Rapor, snapshot, `schema_version`, `computeGrades`, KKM, konfigurasi beku, kenaikan, roster: **tidak ada**. `phase3-baseline` tidak berubah
(tabel baru tidak ada di daftar bersih-bersih/garis dasar; sekolah baseline tanpa baris `learning_plan_setting`). Rollover tahun ajaran:
perencanaan **tidak** disalin otomatis (K-F). Ekspor/arsip: tidak diperluas. Retensi: data milik sekolah, ikut aturan penghapusan sekolah yang ada.

### 2.6 Tes 3.6

Sakelar mati: semua endpoint baru 403 `feature_disabled`, `GET /v1/lesson-attendance` identik, menu tersembunyi; hidup per sekolah (sekolah A tidak
memengaruhi B). RLS: baris sekolah lain tak terbaca/tertulis, FK komposit menolak referensi lintas sekolah. Perencanaan: izin pengampu vs bukan, TP
mapel lain ditolak. Jurnal: pemilik, guru piket, pengganti (`actual_teacher_id`), tanggal tak valid, unik per sel+tanggal, gabungan menulis semua sel,
tidak terblokir `report_final`. Penilaian proses: guru tidak bisa menulis `peer`/`principal`, `shared_with_teacher` default, kecakupan, rating tak dikenal.
`rbac-matrix` untuk setiap rute dan izin baru; OpenAPI memuat izin/galat.

### 2.7 Risiko 3.6

Beban input guru (mitigasi: semua opsional, hanya `topic` wajib pada jurnal; sakelar mati bawaan); penyalahgunaan sebagai penilaian kinerja (mitigasi:
`shared_with_teacher` bawaan salah, tidak ada skor gabungan/peringkat guru, tanpa ekspor); regresi layar Absensi per jam (mitigasi: jurnal di bagian
dan permintaan terpisah, tes snapshot respons lama); kebocoran data antarsekolah (RLS + FK komposit + tes).

---

## 3. Keputusan terbuka (bawaan aman berlaku sampai dijawab)

| Id  | Pertanyaan                                                                        | Bawaan aman                                                                                  |
| --- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| K-A | 3B.5: batas rombel per penilaian serentak dan apakah mapel non-pilihan boleh      | 12 rombel; API umum, UI menonjolkan hanya mapel berpenanda pilihan                           |
| K-B | Modul/entitlement perencanaan dan penilaian proses (belum ada modul khusus)       | Perencanaan dan penilaian proses di bawah `grades`, jurnal di bawah `attendance`; tanpa modul baru |
| K-C | Unggah berkas perencanaan (belum ada `school_file`)                               | Tautan https saja; berkas ditunda sampai ada penyimpanan berkas sekolah                      |
| K-D | Arti "minimal 1x/semester": total tinjauan atau per sudut pandang                 | Per guru: total >= `review_min_per_semester` (bawaan 1); mode "keempat sudut pandang" ditunda |
| K-E | Rubrik penilaian proses dapat dikustom per sekolah                                | Butir tetap dari kontrak; kustom ditunda                                                     |
| K-F | Rollover menyalin perencanaan ke tahun berikut                                    | Tidak disalin; tombol "salin dari tahun lalu" manual menyusul bila diminta                   |
| K-G | Jurnal wajib sebelum absensi/hanya pengingat                                      | Sama sekali tidak wajib; tanpa pengingat                                                     |
| K-H | Murid/wali melihat jurnal (materi hari itu) di portal                             | Tidak; staf saja                                                                             |
| K-I | 3B.5.3 input skor gabungan dikerjakan atau ditunda                                | Ditunda sampai 3B.5.1-2 dipakai (opsional)                                                  |
| K-J | Penyebaran hapus/detach grup kembar                                               | Tidak ada; hapus satu anggota saja, grup <2 tampak biasa                                     |
