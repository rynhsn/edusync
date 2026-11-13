# Rancangan: fase 3, asesmen dan rapor

Status: **usulan, menunggu persetujuan**. Disusun 13 November 2026 pada cabang `rebuild` (HEAD = v1.2.2, migrasi terakhir 0095).
Dokumen ini hanya rancangan: tidak ada kode, migrasi, atau data yang diubah. Kueri ke DB dev bersifat baca-saja.
Terkait: [roadmap](../Planning/11-academic-roadmap.md) fase 3 dan "Revisi hasil verifikasi regulasi", [regulasi-umum.md](regulasi-umum.md)
klaim A1-A8 dan R1-R3, bagian 4 (fase 3), bagian 5 (tidak boleh dikodekan keras), bagian 6 (C3, C4, C9, C12, C16),
[AUDIT-AKADEMIK.md](AUDIT-AKADEMIK.md) F11 dan F12, [rancangan pembekuan konfigurasi nilai](rancangan-pembekuan-konfigurasi-nilai.md).

Cara membaca: "terverifikasi" = saya baca sendiri di kode atau DB dev; "asumsi" = belum dibuktikan. Ketidakpastian dirangkum di bagian 11,
keputusan produk di bagian 10.

---

## 1. Masalah dan kriteria keberhasilan

### 1.1 Masalah

| # | Masalah | Bukti (terverifikasi) | Dasar regulasi |
|---|---|---|---|
| P1 | Tidak ada jenis asesmen. Semua skor masuk nilai akhir, jadi asesmen formatif (umpan balik) yang dicatat di Edusync ikut menjadi nilai rapor. | `assessment` dan `grade_component` tanpa kategori (`packages/db/src/schema.ts:1710-1757`); `computeGrades` memakai semua penilaian kelas-mapel-semester (`apps/api/src/grading-lib.ts:79-148`). | A1, A4, A5: hanya formatif dan sumatif; formatif tidak dipakai untuk rapor, kenaikan, kelulusan; tidak digabung dengan sumatif. |
| P2 | Penilaian tidak terhubung ke TP, jadi ketercapaian TP per murid tidak dapat dihitung, padahal CP/TP/ATP berversi dan KKTP per TP (`achievement_criteria.objective_id`) sudah ada. | `assessment` tanpa kaitan TP; pemecah KKM membuang baris ber-TP (`packages/contracts/src/kktp.ts:152`, `apps/api/src/kktp-lib.ts:32`); DB dev: 3 TP, 0 kriteria ber-TP. | A1 (dibandingkan dengan kriteria ketercapaian TP), A3. |
| P3 | Deskripsi capaian rapor hanya teks per predikat (`report_setting.desc_a..d`), sama untuk semua murid berpredikat sama. | `buildDocument` (`apps/api/src/report-card-lib.ts:286`). | R1 butir 7 "deskripsi capaian kompetensi". |
| P4 | Komponen rapor minimal belum lengkap: tidak ada tanggapan orang tua/wali, deskripsi kokurikuler, mode rapor deskriptif Fase A, catatan perkembangan Fase A. | `ReportDocument` (`report-card-lib.ts:70-98`) hanya punya `homeroomNote`. | R1 butir 8 dan 12, R2, R3; celah C3 (P0). |
| P5 | Remedial tidak tercatat. Guru menimpa skor asli; riwayat dan bentuk pendampingan hilang. | `score.value` satu angka (`schema.ts:1760-1779`); dorong nilai ujian menimpa skor (`routes/exam-scores.ts:424-436`). | A8: remedial = pendampingan; tidak ada aturan nasional nilai remedial; celah C16. |
| P6 | Perencanaan pembelajaran, jurnal, dan penilaian proses pembelajaran tidak ada. | F11 (grep nol). | Tidak wajib nasional (jurnal); C12 wajib minimal 1 kali per semester (1/2026 Pasal 15-19). |

### 1.2 Kriteria keberhasilan

1. **Hasil lama identik.** Sekolah yang tidak memakai fitur baru: nilai akhir, predikat, KKM, `belowKkm`, rekap, matriks, portal, dan
   dokumen rapor draf identik byte demi byte dengan v1.2.2 pada ketiga mode hitung. Rapor final yang sudah ada tidak pernah dihitung ulang.
2. **Snapshot rapor tanpa fitur baru identik dengan v1**: `schema_version = 1`, isi jsonb sama persis (uji emas).
3. **Formatif tidak pernah memengaruhi** nilai akhir, predikat, rata-rata, peringkat, `grades_incomplete`, kenaikan, dan kelulusan.
4. **Pembekuan utuh.** Kategori komponen, kriteria per TP, aturan agregasi TP, dan kebijakan remedial yang memengaruhi angka ikut salinan
   beku semester; semester beku tidak berubah oleh perubahan konfigurasi hidup.
5. **Rapor final tidak berubah diam-diam.** Narasi, deskripsi kokurikuler, dan mode deskriptif ikut snapshot. Tanggapan orang tua yang
   ditulis sesudah final disimpan terpisah dan tidak pernah menyentuh snapshot.
6. **Aditif:** tanpa DROP, tanpa perubahan tipe; kolom baru berdefault perilaku sekarang; kode galat lama tetap; tiap tahap bisa dibatalkan
   lewat tag tanpa kehilangan data yang dibuat versi lama.
7. **Tanpa N+1:** satu kelas dihitung dengan jumlah kueri tetap (ditambah paling banyak 4 kueri batch untuk TP, override, narasi, remedial).
8. Tabel tenant baru: `school_id` + RLS ENABLE/FORCE + policy `tenant_isolation` + GRANT ke `edusync_app` + FK komposit `(school_id, x_id)`.
9. Setiap endpoint di OpenAPI dengan izin dan modul tertulis di deskripsi; suite wajib hijau: `grading`, `report-card`, `schedule`, `pkl`,
   `rbac-matrix`, `tenant-isolation`, `promotion`, `achievement-criteria`, `grading-freeze`, `portal`, `exam-scores`.
10. Tampilan: 375 px, 768 px, mode gelap, target sentuh 44 px, tabel menjadi kartu di bawah `lg`, tiga bahasa.

---

## 2. Kondisi saat ini (ringkas, terverifikasi)

- **Hitung nilai.** `computeGrades(tx, {semesterId, classId, subjectIds, studentIds, components, settings})` memuat semua `assessment` kelas
  itu, lalu `finalGrade(groups, mode)` per mapel-siswa (`packages/contracts/src/grading.ts:55-80`). Mode `percentage` tidak menormalisasi
  bobot: komponen tanpa skor menyumbang 0. `assessedSubjects` (mapel rapor) = mapel yang punya penilaian apa pun.
- **Komponen** `grade_component(id, school_id, name, weight, sort)`; API membatasi `weight` 1..100 (`routes/grading.ts:176`); pemilihan
  `percentage` mensyaratkan jumlah bobot semua komponen = 100 (`routes/grading.ts:553-561`).
- **Penilaian** `assessment.component_id NOT NULL`, `exam_id` untuk hasil CBT. Dorong nilai ujian membuat/memperbarui satu penilaian per
  kelas, `maxScore` 100, dan **menimpa** `score.value` setiap kali dipanggil ulang (`routes/exam-scores.ts:398-438`).
- **Pembekuan.** `loadGradingConfig(tx, semesterId)` memilih salinan beku (`semester_grading_config`) atau konfigurasi hidup
  (`apps/api/src/grading-config-lib.ts:61-103`). Bentuk jsonb `config_version = 1`: `components: {id,name,weight,sort}[]` dan
  `criteria` dengan **`objectiveId: z.null()`** (`packages/contracts/src/grading-config.ts:56-66`). `matchesLive` membandingkan salinan dengan
  `readLiveGradingConfig` secara kanonik (`grading-config-lib.ts:317-334`, `packages/db/src/grading-freeze.ts:41-105`).
- **Rapor.** `report_card.snapshot` jsonb, `schema_version` (selalu ditulis `REPORT_SCHEMA_VERSION = 1`, `routes/report-card.ts:127`),
  `template_key` (DB dev: 0 baris terisi). Riwayat di `report_card_snapshot`. Finalisasi membekukan konfigurasi semester lebih dulu, lalu
  `loadClassContext` + `buildDocument`. Reopen membuang snapshot aktif, mempertahankan riwayat dan salinan beku.
- **Pembaca snapshot:** `GET /v1/report-cards/:studentId` (dikembalikan apa adanya), daftar rapor (`documentSummary`), penumpang angka
  `finalSubjectRows` untuk rekap/matriks/portal, `finalReportCards` dan `finalReportDocument` portal, `grading-verify-lib.ts`, web
  `report-cards/preview.tsx`, `report-cards/pdf/report-card-pdf.tsx` (PDF dibuat di klien), `portal/children/[studentId]/reports-tab.tsx`.
- **Skema respons dokumen ganda:** `documentSchema` (`routes/report-card.ts:76-116`) dan `reportDocumentSchema` (`routes/portal.ts:204`).
  Serializer zod Fastify membuang kunci yang tidak dideklarasikan, jadi **bagian v2 yang tidak ditambahkan ke kedua skema akan hilang
  diam-diam dari respons** (asumsi kuat dari perilaku bawaan `z.object`; belum diuji).
- **Penjaga final** (`apps/api/src/report-lock-lib.ts`): per kelas untuk penilaian/skor/komponen/dorong ujian, per siswa untuk ekskul,
  absensi, jawaban CBT; catatan wali ditolak 409 bila rapor final. `PUT /v1/report-cards/settings` tidak dijaga (sengaja).
- **Portal.** Peran `guardian` dan `student` hanya `portal:read` (`packages/contracts/src/permissions.ts:214-215`); tidak ada rute tulis
  untuk wali selain pembayaran daring. `portal_link.kind` membedakan wali dan siswa (`portal-lib.ts:102-119`).
- **Fase.** Tidak ada kolom fase per kelas; fase diturunkan dari kode tingkat (`phaseForLevelCode`, `packages/contracts/src/teaching-plan.ts:49`)
  atau profil jenjang (`phaseOf`, `education-profile.ts:60`). Regulasi bagian 5 butir 1 dan 4: pemetaan fase dan ada/tidaknya angka bukan konstanta.
- **TP berversi.** Mengubah teks TP yang dipakai ATP terbit membuat versi baru dan menonaktifkan yang lama (`routes/teaching-plan.ts:951-984`);
  hapus TP yang dirujuk ditolak `in_use` (FK 23503 sudah dipetakan, `:1042-1044`).
- **DB dev:** 9 sekolah, 612 penilaian (9 dari ujian), 4 komponen (satu sekolah, mode `weighted_average`), 8.784 skor, 3 TP, 0 kriteria,
  4 rapor final semua `schema_version = 1`, 3 baris beku. Tabel `assessment`, `score`, `report_card`, `guardian`, `grade_component`,
  `school_level` **belum** punya `UNIQUE (school_id, id)`; `student`, `subject`, `class_room`, `semester`, `learning_objective`, `teacher` sudah.

---

## 3. Keputusan desain

### 3.1 (i) Kategori asesmen

**Opsi**

| | A. Kategori di `grade_component` | B. Kategori di `assessment` | C. Keduanya (komponen bawaan, penilaian menimpa) |
|---|---|---|---|
| Tempat pengecualian | Saring komponen sebelum `finalGrade`; rumus tidak berubah | Saring skor di dalam rata-rata komponen | Keduanya |
| Mode `percentage` | Komponen formatif tidak ikut bobot; aman | Komponen yang semua penilaiannya formatif menjadi kosong dan **menyumbang 0**, menarik nilai turun | Sama buruknya dengan B |
| Konsistensi | Satu sumber; tidak ada penilaian "formatif di dalam komponen sumatif" | Bobot komponen bisa berarti setengah formatif | Dua sumber kebenaran; UI membingungkan |
| Pembekuan | Sudah ikut salinan `components` (cukup tambah dua kunci) | Kategori melekat di baris penilaian (data, bukan konfigurasi); tidak perlu salinan, tetapi kategori bisa diubah di semester beku | Keduanya |
| Ujian CBT | Guru memilih komponen formatif atau sumatif saat dorong nilai; tidak ada parameter baru | Butuh parameter kategori baru di dorong nilai | Keduanya |
| Kebiasaan sekolah | Cocok dengan praktik "komponen Formatif / Sumatif Lingkup Materi / Sumatif Akhir Semester" | Lebih luwes per penilaian | Paling luwes |

**Rekomendasi: A, ditambah tanda (bukan jenis) pada penilaian.**

- `grade_component.category` (`formative` | `summative`, bawaan `summative`) dan `grade_component.include_in_final` (bawaan `true`;
  CHECK `category = 'summative' OR include_in_final = false`, jadi formatif **terkunci** tidak masuk).
- Penilaian mewarisi kategori dari komponennya (diturunkan saat baca, tidak disimpan, supaya tidak pernah tidak sinkron). Respons API
  `assessment` menambah `category` turunan.
- Tanda di `assessment` (semua nullable, `null` = perilaku sekarang):
  - `purpose`: `initial` (asesmen awal/diagnostik). Hanya boleh pada komponen formatif (400 `initial_requires_formative`). Penghitung
    **juga** membuang penilaian `purpose = initial` apa pun komponennya (sabuk pengaman bila kategori komponen kelak diubah).
  - `summative_scope`: `material` (lingkup materi) | `end_of_semester`; hanya pada komponen sumatif (400 `scope_requires_summative`).
  - `technique`: teks dari daftar di kontrak (`test`, `observation`, `performance`, `practice`, `product`, `project`, `portfolio`,
    `assignment`, `other`). **Tanpa CHECK di DB** (pelajaran K1: daftar acuan bisa berubah), divalidasi zod.
- Komponen formatif: `weight` diabaikan; API menyimpan 0 untuk komponen formatif (perlu melonggarkan `min(1)` menjadi `min(0)` khusus
  formatif). Pemeriksaan `weights_sum_invalid` untuk mode `percentage` menjumlah **hanya komponen yang dihitung** (sumatif dan
  `include_in_final`). Untuk sekolah lama jumlahnya sama dengan sekarang.

**Bagaimana formatif dikecualikan tanpa mengubah hasil lama**

- `computeGrades` menerima komponen beserta `counts: boolean` (= sumatif dan `include_in_final`). Grup yang dikirim ke `finalGrade` hanya
  komponen `counts`; penilaian `purpose = initial` dibuang. `perComponent` tetap memuat **semua** komponen (rekap menampilkan rata-rata
  formatif sebagai umpan balik, ditandai).
- `assessedSubjects` untuk rapor menjadi "mapel yang punya penilaian pada komponen yang dihitung". Mapel yang hanya punya penilaian formatif
  tidak muncul di rapor dan tidak memicu `grades_incomplete`.
- Bukti identitas: semua komponen lama berdefault `summative/true`, tidak ada penilaian lama ber-`purpose`, jadi himpunan grup dan mapel
  sama persis dengan sekarang pada ketiga mode. Diuji dengan pola baseline (bagian 6).

**Pembekuan.** `FrozenComponent` mendapat `category?` dan `includeInFinal?` yang **hanya ditulis bila bukan bawaan** (penulisan
jarang/sparse). Akibatnya: salinan sekolah yang tidak memakai fitur tetap berbentuk v1 byte demi byte, `matchesLive` tidak berubah menjadi
`false` untuk semua salinan lama, dan `config_version` hanya naik ke 2 bila salinan memuat isi v2 (tes `grading-freeze.test.ts:164` dan
`grading-backfill.test.ts:174` tetap hijau). Pembaca menerima versi 1 dan 2; kunci yang hilang = `summative/true`, yang benar secara
historis karena sebelum fase 3 tidak ada formatif. Mengubah kategori komponen = menulis konfigurasi hidup: memakai
`assertLiveGradingConfigEditable` + aturan W, sama seperti mengubah bobot.

**Ujian CBT.** Tidak ada kolom baru di `exam`. Guru memilih komponen formatif (latihan, kuis) atau sumatif saat `POST /v1/exams/:id/grades`.
Dorong ulang **tidak boleh menimpa** `purpose`, `summative_scope`, `technique`, dan kaitan TP yang sudah diatur guru pada penilaian itu
(kolom itu tidak ada di objek `values` sekarang; tes regresi menjaga). Opsional: body menerima `technique` (bawaan `test`) hanya saat
penilaian pertama kali dibuat.

### 3.2 (ii) Kaitan penilaian ke TP dan ketercapaian TP

**Kaitan.** Tabel `assessment_objective(assessment_id, objective_id)` many-to-many, bukan jsonb. Satu skor penilaian berlaku untuk semua TP
yang dikaitkan (keputusan K5). Skor per TP di dalam satu penilaian (atau per butir soal CBT) **ditunda**: beban input guru tinggi; guru yang
butuh ketelitian per TP membuat penilaian per TP. TP harus milik mapel penilaian (`objective -> outcome.subject_id = assessment.subject_id`,
400 `objective_subject_mismatch`), aktif (400 `objective_inactive`), maksimal 20 per penilaian. Fase TP yang tidak cocok dengan fase kelas
hanya diberi peringatan di UI (tingkat-fase tidak boleh dikodekan keras).

**Masukan ketercapaian.** Per (siswa, TP): penilaian yang dikaitkan ke TP itu, pada kelas-mapel-semester itu, dengan komponen yang dihitung
(sumatif). Formatif ditampilkan di tab guru sebagai kemajuan, **tidak** dipakai untuk status rapor (keputusan K3). Skor efektif = skor asli
atau hasil kebijakan remedial (3.6).

**Agregasi** (konfigurasi sekolah, ikut salinan beku; bawaan `mean`): `mean` = rata-rata persen (rumus `componentAverage` yang sama),
`latest` = penilaian terbaru menurut tanggal, `max`. Bentuk ini mengikuti A6 (pembobotan/rata-rata untuk materi lepas atau progresif).

**Ambang per TP (pemecah bertingkat, fungsi murni baru `resolveObjectiveCriteria` di `packages/contracts/src/kktp.ts`):**

1. Kriteria ber-TP (`objective_id = TP`) dengan jenjang yang sama seperti pemecah KKM: (tingkat, program) -> (tingkat) -> (program) -> (TP saja).
2. Bila tidak ada: KKM efektif mapel dari `resolveKkm` yang sudah ada (kriteria tingkat mapel, lalu `grading_setting.kkm`).
3. Hasil per TP: `percent`, `achieved: boolean | null`, `levelLabel` (mode interval/rubrik/deskriptor memakai `isAchieved` dan level yang
   memuat nilai), `scope` sumber kriteria. Mode deskriptor tanpa rentang angka menghasilkan `null` (perlu keputusan guru).

**Penyimpanan: dihitung saat baca + override guru + beku di snapshot.**

| | Dihitung saat baca (direkomendasikan) | Tabel materialisasi yang diperbarui setiap tulis skor | Tabel yang dibekukan saat finalisasi |
|---|---|---|---|
| Kebenaran | Selalu konsisten dengan skor dan salinan beku | Butuh invalidasi di setiap jalur tulis skor, ujian, remedial, kaitan TP, KKTP; ditolak di rancangan pembekuan (opsi F) | Hanya berlaku sesudah final; draf tetap perlu hitung |
| Biaya | +3 kueri batch per kelas (kaitan, TP, override); kriteria TP dari salinan beku tanpa kueri | Murah dibaca, mahal dijaga | Duplikasi dengan snapshot |
| Arsip | Snapshot v2 menyimpan ringkasan TP dan narasi yang dipakai | - | - |

Jadi `student_objective_achievement` **hanya** menyimpan keputusan guru (override atau isian untuk TP tanpa angka, mis. observasi
dengan rubrik deskriptor), bukan hasil hitung. Nilai efektif = override bila ada, selain itu hitungan. Nama tabel mengikuti roadmap.

**Performa satu kelas.** Penilaian dan skor sudah dimuat `computeGrades`; tambahan: `assessment_objective` untuk id penilaian itu (1 kueri,
PK `(assessment_id, objective_id)`), baris TP (1 kueri), override per (semester, kelas) (1 kueri, indeks
`(school_id, semester_id, class_id, subject_id)` sesuai risiko roadmap). Kriteria TP dari salinan beku (0 kueri) atau tabel hidup (2 kueri,
seperti `loadKktpRows`). Tidak ada kueri per siswa.

**Pembekuan kriteria TP.** `semester_grading_config` mendapat kolom **baru** `objective_criteria jsonb NOT NULL DEFAULT '[]'` dan
`objective_aggregation text NULL`, bukan memasukkan baris ber-TP ke `criteria`. Alasan (terverifikasi): skema baca v1
`frozenCriteriaSchema` mewajibkan `objectiveId: z.null()`, jadi bila baris ber-TP masuk `criteria`, kode lama setelah rollback akan
**gagal parse (500)** untuk semester itu. Kolom terpisah diabaikan kode lama. `readLiveGradingConfig` dan `matchesLive` diperluas;
kolom baru yang kosong tidak mengubah hasil perbandingan.

**TP yang berubah.** Aturan versi TP diperluas: mengubah teks TP yang **dikaitkan ke penilaian** (bukan hanya ATP terbit) membuat versi baru
(`usedByPublished` -> `usedByPublishedOrAssessed`). Penilaian tetap menunjuk TP lama; draf menampilkan teks TP yang dikaitkan; snapshot
menyimpan teks saat final. Hapus TP yang dikaitkan ditolak `in_use` lewat FK yang sudah dipetakan.

### 3.3 (iii) Snapshot rapor v2

**Prinsip: bagian v2 ditulis jarang (sparse).** Snapshot berversi 2 hanya bila dokumen memakai minimal satu bagian v2; selain itu dokumen
dan `schema_version` persis v1. Ini satu-satunya cara memenuhi kriteria 2 tanpa mengubah tes yang menegaskan `schemaVersion: 1`
(`report-card.test.ts:1114`).

Bagian v2 (semua opsional di `ReportDocument`; tipe dan zod dipindah ke satu tempat `packages/contracts/src/report-document.ts`, dipakai
`routes/report-card.ts` dan `routes/portal.ts` agar tidak ada lagi dua skema yang bisa menyimpang):

```ts
interface ReportDocumentV2Extras {
  reportMode?: 'descriptive';                       // hanya bila tingkat kelas bermode deskriptif (Fase A, keputusan K10)
  cocurricularNote?: string;                        // deskripsi kokurikuler teks bebas per murid (3.4 butir d)
  developmentNote?: string;                         // catatan perkembangan Fase A (K11)
  subjects: (V1Subject & {
    descriptionSource?: 'manual' | 'objectives';    // absen = dari predikat (v1)
    objectives?: {                                  // absen bila mapel tanpa TP terkait
      assessed: number; achieved: number;
      high: { id: string; code: string | null; text: string }[];
      low: { id: string; code: string | null; text: string }[];
    };
  })[];
}
```

- **Mode deskriptif Fase A.** Angka tetap dihitung dan disimpan di snapshot (`final`, `predicate`, `kkm`) agar leger, verifikasi, penumpang
  angka, dan promosi konsisten; semua *renderer* (pratinjau, PDF, portal) menyembunyikan kolom angka, predikat, dan peringkat bila
  `reportMode = 'descriptive'`, dan endpoint portal **memproyeksikan** dokumen tanpa `final`/`predicate`/`rank`. Kelengkapan finalisasi
  (`grades_incomplete`) untuk mode deskriptif = setiap mapel punya deskripsi (manual atau dari TP), bukan nilai akhir. Alternatif "tidak
  menghitung angka sama sekali" dicatat di K10.
- **Konfigurasi mode** di `school_level.report_mode` (`numeric` | `descriptive`, `NULL` = numeric), bukan dari fase yang dikodekan keras. UI
  menyarankan `descriptive` untuk tingkat yang fasenya A menurut profil jenjang. Mode tidak memengaruhi angka, jadi tidak ikut salinan beku;
  ia beku di snapshot saat final (seperti `report_setting`).
- **Tanggapan orang tua bukan bagian snapshot.** Ditulis sesudah final, disimpan di tabel sendiri, dan ditumpangkan saat baca sebagai field
  respons `guardianResponses` (bukan isi jsonb). Snapshot tidak pernah diubah sesudah final.
- **Rapor v1 tidak pernah dihitung ulang.** Jalur final mengembalikan snapshot apa adanya (perilaku sekarang). Renderer bercabang dengan
  deteksi fitur (field ada atau tidak) dan, untuk kejelasan, `schemaVersion` yang kini ikut respons dokumen **hanya bila 2** (dari kolom
  `report_card.schema_version`; dokumen draf membawa versi yang akan ditulis bila difinalkan). Dokumen v1 dirender dengan tata letak v1.

**Siapa membaca apa**

| Pembaca | `schema_version` | Perubahan |
|---|---|---|
| `GET /v1/report-cards/:studentId` | Ya (sparse) | Skema respons dari kontrak bersama; menambah `guardianResponses` (staf) |
| `GET /v1/portal/children/:id/report-cards/:semesterId` | Ya | Proyeksi deskriptif; `guardianResponses` hanya milik wali itu (K9) |
| Daftar rapor, `finalReportCards` (`documentSummary`) | Tidak | Mode deskriptif: `average` disembunyikan di portal saja |
| `finalSubjectRows` (rekap, matriks, portal nilai) | Tidak | Hanya membaca `subjects[].final/predicate/kkm/belowKkm`, yang stabil di v1 dan v2 |
| `grading-verify-lib.ts` | Tidak | Membandingkan angka; tidak terdampak |
| Web `preview.tsx`, `pdf/report-card-pdf.tsx`, `reports-tab.tsx` | Ya | Bagian kokurikuler, catatan perkembangan, tanggapan wali, mode deskriptif |

**`template_key`.** Tetap tidak dipakai di fase 3 (ditulis `NULL`). `schema_version` = bentuk data; `template_key` disimpan untuk tata letak
per jenjang (madrasah, SMK) di fase 4-5. Memakai `template_key = 'descriptive'` untuk Fase A ditolak: mode adalah isi dokumen, dan rapor
yang sama harus bisa dirender ulang hanya dari snapshot (K15).

**Bagian kokurikuler dan tanggapan di PDF.** Agar PDF sekolah lama tidak berubah tanpa diminta, dua bendera baru di `report_setting`:
`show_cocurricular` dan `show_guardian_response` (bawaan `false`; rekomendasi menyalakannya demi 12 komponen minimal, K12). Bila menyala,
bagian ditampilkan walau kosong (kotak tanggapan kosong untuk tulisan tangan).

### 3.4 (iv) Narasi rapor

**Aturan otomatis** (fungsi murni `buildObjectiveNarrative` di `packages/contracts/src/report-card.ts`, parameter dari `report_setting`):

1. Kandidat = TP mapel itu yang punya status efektif (hitung atau override) untuk siswa itu. TP tanpa skor dan tanpa override diabaikan.
2. `high` = TP tercapai, diurutkan persen menurun; `low` = TP belum tercapai, diurutkan persen menaik. Seri dipecah urutan ATP
   (`learning_flow_item.sort_order` ATP terbit tahun itu bila ada), lalu `learning_objective.sort_order`, lalu kode. Override tanpa angka
   diurutkan sesudah yang berangka.
3. Ambil paling banyak `narrative_max_items` (bawaan 2) per sisi.
4. Kalimat dari templat sekolah (`narrative_high_template`, `narrative_low_template`, `NULL` = templat bawaan di kontrak, mis.
   "Menunjukkan penguasaan yang baik dalam {tp}." dan "Perlu bimbingan dalam {tp}."). Bila semua tercapai, kalimat `low` dihilangkan
   (K6). Bila tidak ada kandidat sama sekali: **fallback persis v1** (`descriptionOf(predicate)`, tanpa `descriptionSource`).

**Sunting guru.** Tabel `report_subject_narrative` (satu teks per siswa-mapel-semester). Teks manual menang atas otomatis
(`descriptionSource = 'manual'`). Disimpan juga `generated_hash` (hash teks otomatis saat disunting); bila teks otomatis sekarang berbeda,
UI menandai "narasi otomatis berubah sejak disunting" supaya teks manual yang usang tidak lolos tanpa sadar. `NULL`/kosong menghapus
suntingan (kembali otomatis).

**Siapa dan kapan.** Guru pengampu kelas-mapel itu (`canInputPair`: `grade:input` + penugasan, atau `grade:configure`) dan pemegang
`report_card:manage`. Wali kelas membaca semua mapel kelasnya; mengedit hanya bila juga pengampu (K7). Hanya selama rapor siswa itu draf:
409 `report_final` per siswa. Finalisasi membekukan teks efektif (manual atau otomatis) ke snapshot. Reopen: suntingan manual tetap ada;
teks otomatis dihitung ulang dari data terkini; finalisasi ulang membekukan lagi. Teks maksimal 1.000 karakter.

### 3.5 (v) Tanggapan orang tua/wali

- **Entitas** `report_card_response`: satu tanggapan per (semester, siswa, wali). Disimpan `snapshot_version` (versi riwayat
  `report_card_snapshot` saat ditulis) supaya setelah reopen dan finalisasi ulang UI dapat menulis "tanggapan atas versi sebelumnya".
- **Siapa:** wali lewat portal (tautan `kind = guardian`, anak terhubung lewat `student_guardian`), izin baru **`portal:respond`** untuk peran
  sistem `guardian` (disebarkan ke sekolah lama oleh `syncSystemRolePermissions`; peran `student` tidak mendapatkannya). Staf (wali kelas
  atau `report_card:manage`) boleh **menyalin** tanggapan dari rapor kertas atas nama wali (`recorded_by_kind = staff`), karena banyak wali
  tidak memakai portal.
- **Kapan:** hanya bila rapor **final** (409 `report_not_final`); dapat diubah selama jendela tanggapan (bawaan 30 hari sejak finalisasi,
  `report_setting.response_window_days`, `NULL` = tanpa batas; K9), sesudahnya 409 `response_closed`. Reopen tidak menghapus tanggapan.
- **Hubungan dengan final:** tanggapan **tidak** dijaga `report_final` (justru mensyaratkannya) dan tidak menyentuh snapshot.
- **Privasi:** teks polos maksimal 1.000 karakter, tanpa lampiran; terlihat oleh penulisnya, wali kelas, pemegang `report_card:read_all`
  /`manage`. Wali lain dari anak yang sama **tidak** melihat secara bawaan (keluarga terpisah; K9). Diaudit (`report_card.response`), dibatasi
  laju seperti rute portal lain. Tidak dikirim ke WhatsApp (ditunda sampai akhir proyek, sesuai keputusan pemilik).

### 3.6 (vi) Remedial dan pengayaan

**Entitas** (pendampingan tercatat, bukan sekadar nilai baru):

- `learning_support`: satu kegiatan pendampingan (`kind` = `remedial` | `enrichment`) pada kelas-mapel-semester: judul, bentuk intervensi
  (teks), tanggal mulai/selesai, guru. TP sasaran lewat `learning_support_objective` (many-to-many).
- `learning_support_participant`: murid peserta, status (`planned`, `in_progress`, `completed`, `cancelled`), catatan hasil.
- `score_remedial_attempt`: hasil asesmen ulang per (penilaian, murid, percobaan ke-n), opsional menunjuk `learning_support`. **Skor asli di
  `score.value` tidak pernah ditimpa oleh remedial.** Roadmap menyebut "kolom nilai asli dan nilai remedial pada `score`"; ditolak karena
  dorong ujian menimpa `score.value` (riwayat akan rusak) dan kolom di `score` hanya memuat satu percobaan.
- Pengayaan tidak menghasilkan skor yang memengaruhi nilai; hanya peserta, catatan, dan (opsional) TP.

**Kebijakan nilai** (`grading_setting.remedial_policy`, ikut salinan beku sebagai kolom `remedial_policy` di `semester_grading_config`):

| Nilai | Skor efektif untuk nilai akhir dan ketercapaian TP |
|---|---|
| `NULL` / `record_only` (bawaan) | Skor asli; remedial hanya dicatat. Hasil hitung identik dengan sebelum fase 3. |
| `replace_latest` | Percobaan terakhir yang berisi nilai |
| `max` | Maksimum skor asli dan semua percobaan |
| `cap_at_criteria` | Seperti `max`, dibatasi ambang ketuntasan mapel (KKM efektif mapel, persen dari `max_score`). Tersedia sebagai pilihan, **bukan bawaan** (A8: tidak ada aturan nasional). |
| `mean_with_original` | Rata-rata skor asli dan percobaan terakhir |

`computeGrades` memuat percobaan hanya bila kebijakan efektif bukan `record_only` (1 kueri batch). Penulisan percobaan dijaga
`assertClassReportNotFinal`. Hapus penilaian ikut menghapus percobaannya secara eksplisit di rute (seperti skor), dengan jumlah di audit;
FK NO ACTION sebagai jaring pengaman. Mengubah kebijakan = menulis konfigurasi hidup (guard + aturan W).

### 3.7 (vii) Yang sengaja ditunda

- Skor per TP di dalam satu penilaian dan pemetaan butir soal CBT ke TP.
- Modul kokurikuler penuh (program, dimensi profil, rubrik, fasilitator): fase 4; fase 3 hanya teks bebas per murid.
- Tata letak rapor per jenjang lewat `template_key`; judul PDF dalam terjemahan (fase 4).
- Struktur "perkembangan fondasi" Fase A yang terperinci (aspek, rubrik): regulasi belum dibaca; fase 3 memakai satu teks.
- Narasi otomatis dengan model bahasa; narasi untuk ekstrakurikuler.
- Ekspor e-Rapor/Dapodik (C7): bentuk snapshot v2 sengaja memuat deskripsi per mapel supaya ekspor kelak mudah.
- Notifikasi WhatsApp tanggapan wali; tanda tangan digital wali.
- Trigger DB penjaga final (tetap ditunda sesuai roadmap).
- Rumus kenaikan/kelulusan dari ketercapaian TP (tidak ada rumus nasional; keputusan sekolah).

---

## 4. Skema, kontrak API, dan guard

Nomor migrasi dan `when` jurnal (manual, lebih besar dari 0095 = `1796434200000`, langkah sehari seperti sebelumnya):
0096 = `1796520600000`, 0097 = `1796607000000`, 0098 = `1796693400000`, 0099 = `1796779800000`, 0100 = `1796866200000`.
Semua berkas SQL hanya DDL. Kolom `NOT NULL DEFAULT` konstan di Postgres 11+ hanya mengubah katalog, dan nilai bawaan kolom tidak tunduk RLS,
jadi tidak ada backfill data yang diperlukan.

Pola standar untuk **setiap** tabel baru (tidak diulang di bawah):

```sql
CONSTRAINT "<t>_school_id_uq" UNIQUE ("school_id", "id"),        -- bila tabel punya id dan dirujuk
ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <t> FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON <t> USING (school_id = ANY (app_school_ids())) WITH CHECK (school_id = ANY (app_school_ids()));
GRANT SELECT, INSERT, UPDATE, DELETE ON <t> TO edusync_app;
```

`tenant-isolation.test.ts` menemukan tabel ber-`school_id` otomatis. Tabel induk lama yang belum punya `UNIQUE (school_id, id)` diberi
constraint itu (pasti berhasil karena `id` sudah PK; membangun satu indeks; ukuran tabel produksi tidak saya ketahui, lihat risiko R9).

### 4.1 Migrasi 0096 `assessment_category` (tahap 3.1)

```sql
ALTER TABLE "grade_component" ADD COLUMN "category" text DEFAULT 'summative' NOT NULL;
ALTER TABLE "grade_component" ADD COLUMN "include_in_final" boolean DEFAULT true NOT NULL;
ALTER TABLE "grade_component" ADD CONSTRAINT "grade_component_category_ck" CHECK ("category" IN ('formative', 'summative'));
ALTER TABLE "grade_component" ADD CONSTRAINT "grade_component_final_ck" CHECK ("category" = 'summative' OR "include_in_final" = false);
ALTER TABLE "assessment" ADD COLUMN "purpose" text;            -- NULL | 'initial'
ALTER TABLE "assessment" ADD COLUMN "summative_scope" text;    -- NULL | 'material' | 'end_of_semester'
ALTER TABLE "assessment" ADD COLUMN "technique" text;          -- daftar di kontrak, tanpa CHECK
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_purpose_ck" CHECK ("purpose" IS NULL OR "purpose" = 'initial');
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_scope_ck"
  CHECK ("summative_scope" IS NULL OR "summative_scope" IN ('material', 'end_of_semester'));
```

### 4.2 Migrasi 0097 `report_v2_sections` (tahap 3.2)

```sql
ALTER TABLE "report_card" ADD COLUMN "cocurricular_note" text;
ALTER TABLE "report_card" ADD COLUMN "development_note" text;
ALTER TABLE "school_level" ADD COLUMN "report_mode" text;
ALTER TABLE "school_level" ADD CONSTRAINT "school_level_report_mode_ck"
  CHECK ("report_mode" IS NULL OR "report_mode" IN ('numeric', 'descriptive'));
ALTER TABLE "report_setting" ADD COLUMN "show_cocurricular" boolean DEFAULT false NOT NULL;
ALTER TABLE "report_setting" ADD COLUMN "show_guardian_response" boolean DEFAULT false NOT NULL;
ALTER TABLE "report_setting" ADD COLUMN "response_window_days" integer DEFAULT 30;     -- NULL = tanpa batas
ALTER TABLE "report_setting" ADD CONSTRAINT "report_setting_window_ck"
  CHECK ("response_window_days" IS NULL OR "response_window_days" BETWEEN 1 AND 365);
ALTER TABLE "guardian" ADD CONSTRAINT "guardian_school_id_uq" UNIQUE ("school_id", "id");

CREATE TABLE "report_subject_narrative" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "semester_id" uuid NOT NULL, "class_id" uuid NOT NULL, "subject_id" uuid NOT NULL, "student_id" uuid NOT NULL,
  "text" text NOT NULL,
  "generated_hash" text,                      -- hash teks otomatis saat disunting (3.4); NULL di tahap 3.2
  "updated_by" text NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "report_subject_narrative_uq" UNIQUE ("semester_id", "student_id", "subject_id"),
  CONSTRAINT "report_subject_narrative_text_ck" CHECK (char_length("text") BETWEEN 1 AND 1000),
  CONSTRAINT "report_subject_narrative_semester_fk" FOREIGN KEY ("school_id", "semester_id") REFERENCES "semester"("school_id", "id"),
  CONSTRAINT "report_subject_narrative_class_fk" FOREIGN KEY ("school_id", "class_id") REFERENCES "class_room"("school_id", "id"),
  CONSTRAINT "report_subject_narrative_subject_fk" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subject"("school_id", "id"),
  CONSTRAINT "report_subject_narrative_student_fk" FOREIGN KEY ("school_id", "student_id") REFERENCES "student"("school_id", "id")
);
CREATE INDEX "report_subject_narrative_class_idx" ON "report_subject_narrative" ("school_id", "semester_id", "class_id", "subject_id");

CREATE TABLE "report_card_response" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "semester_id" uuid NOT NULL, "student_id" uuid NOT NULL, "guardian_id" uuid NOT NULL,
  "text" text NOT NULL,
  "snapshot_version" integer,                 -- versi report_card_snapshot saat ditulis
  "recorded_by" text NOT NULL,                -- user.id
  "recorded_by_kind" text NOT NULL,           -- 'guardian' | 'staff'
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "report_card_response_uq" UNIQUE ("semester_id", "student_id", "guardian_id"),
  CONSTRAINT "report_card_response_text_ck" CHECK (char_length("text") BETWEEN 1 AND 1000),
  CONSTRAINT "report_card_response_kind_ck" CHECK ("recorded_by_kind" IN ('guardian', 'staff')),
  CONSTRAINT "report_card_response_semester_fk" FOREIGN KEY ("school_id", "semester_id") REFERENCES "semester"("school_id", "id"),
  CONSTRAINT "report_card_response_student_fk" FOREIGN KEY ("school_id", "student_id") REFERENCES "student"("school_id", "id"),
  CONSTRAINT "report_card_response_guardian_fk" FOREIGN KEY ("school_id", "guardian_id") REFERENCES "guardian"("school_id", "id")
);
CREATE INDEX "report_card_response_student_idx" ON "report_card_response" ("school_id", "student_id", "semester_id");
```

FK ke `guardian` NO ACTION: menghapus wali yang punya tanggapan ditolak `in_use` (perlu dicek apakah rute hapus wali sudah memetakan 23503;
lihat `guardian-remove.test.ts`). Bila hapus wali harus tetap bisa, ganti ke `ON DELETE SET NULL` dengan `guardian_id` nullable (K9).

### 4.3 Migrasi 0098 `objective_achievement` (tahap 3.3, ditambah kolom narasi 3.4)

```sql
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_school_id_uq" UNIQUE ("school_id", "id");

CREATE TABLE "assessment_objective" (
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "assessment_id" uuid NOT NULL,
  "objective_id" uuid NOT NULL,
  CONSTRAINT "assessment_objective_pk" PRIMARY KEY ("assessment_id", "objective_id"),
  CONSTRAINT "assessment_objective_assessment_fk" FOREIGN KEY ("school_id", "assessment_id")
    REFERENCES "assessment"("school_id", "id") ON DELETE CASCADE,   -- hanya tautan; hapus penilaian sudah dijaga report_final
  CONSTRAINT "assessment_objective_objective_fk" FOREIGN KEY ("school_id", "objective_id")
    REFERENCES "learning_objective"("school_id", "id")              -- NO ACTION: hapus TP terkait -> 409 in_use
);
CREATE INDEX "assessment_objective_objective_idx" ON "assessment_objective" ("school_id", "objective_id");

CREATE TABLE "student_objective_achievement" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "semester_id" uuid NOT NULL, "class_id" uuid NOT NULL, "subject_id" uuid NOT NULL,
  "student_id" uuid NOT NULL, "objective_id" uuid NOT NULL,
  "achieved" boolean,                          -- keputusan guru; NULL = tidak menimpa status
  "level_label" text,                          -- label level rubrik/deskriptor
  "note" text,
  "updated_by" text NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "student_objective_achievement_uq" UNIQUE ("semester_id", "student_id", "objective_id"),
  CONSTRAINT "student_objective_achievement_some_ck"
    CHECK ("achieved" IS NOT NULL OR "level_label" IS NOT NULL OR "note" IS NOT NULL),
  CONSTRAINT "student_objective_achievement_note_ck" CHECK ("note" IS NULL OR char_length("note") <= 500)
  -- + FK komposit ke semester, class_room, subject, student, learning_objective (pola seperti di atas, NO ACTION)
);
CREATE INDEX "student_objective_achievement_scope_idx"
  ON "student_objective_achievement" ("school_id", "semester_id", "class_id", "subject_id");

ALTER TABLE "semester_grading_config" ADD COLUMN "objective_criteria" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "semester_grading_config" ADD COLUMN "objective_aggregation" text;   -- NULL = mean
ALTER TABLE "semester_grading_config" ADD CONSTRAINT "semester_grading_config_objective_criteria_ck"
  CHECK (jsonb_typeof("objective_criteria") = 'array');
ALTER TABLE "grading_setting" ADD COLUMN "objective_aggregation" text;            -- NULL = mean
ALTER TABLE "grading_setting" ADD CONSTRAINT "grading_setting_objective_aggregation_ck"
  CHECK ("objective_aggregation" IS NULL OR "objective_aggregation" IN ('mean', 'latest', 'max'));
-- sama untuk semester_grading_config (CHECK identik)

-- untuk 3.4 (boleh di migrasi terpisah 0098b bila 3.4 dirilis terpisah):
ALTER TABLE "report_setting" ADD COLUMN "narrative_max_items" integer DEFAULT 2 NOT NULL;
ALTER TABLE "report_setting" ADD COLUMN "narrative_high_template" text;   -- NULL = templat bawaan kontrak
ALTER TABLE "report_setting" ADD COLUMN "narrative_low_template" text;
ALTER TABLE "report_setting" ADD CONSTRAINT "report_setting_narrative_items_ck" CHECK ("narrative_max_items" BETWEEN 1 AND 5);
```

### 4.4 Migrasi 0099 `learning_support` (tahap 3.5)

```sql
CREATE TABLE "learning_support" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "semester_id" uuid NOT NULL, "class_id" uuid NOT NULL, "subject_id" uuid NOT NULL,
  "kind" text NOT NULL,                          -- 'remedial' | 'enrichment'
  "title" text NOT NULL, "description" text,
  "starts_on" date, "ends_on" date,
  "teacher_id" uuid,
  "created_by" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "learning_support_school_id_uq" UNIQUE ("school_id", "id"),
  CONSTRAINT "learning_support_kind_ck" CHECK ("kind" IN ('remedial', 'enrichment')),
  CONSTRAINT "learning_support_dates_ck" CHECK ("starts_on" IS NULL OR "ends_on" IS NULL OR "starts_on" <= "ends_on")
  -- FK komposit ke semester, class_room, subject, teacher
);
CREATE INDEX "learning_support_scope_idx" ON "learning_support" ("school_id", "semester_id", "class_id", "subject_id");

CREATE TABLE "learning_support_objective" (
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "support_id" uuid NOT NULL, "objective_id" uuid NOT NULL,
  CONSTRAINT "learning_support_objective_pk" PRIMARY KEY ("support_id", "objective_id")
  -- FK komposit: support ON DELETE CASCADE, learning_objective NO ACTION
);

CREATE TABLE "learning_support_participant" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "support_id" uuid NOT NULL, "student_id" uuid NOT NULL,
  "status" text DEFAULT 'planned' NOT NULL,
  "outcome_note" text,
  "updated_by" text NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "learning_support_participant_uq" UNIQUE ("support_id", "student_id"),
  CONSTRAINT "learning_support_participant_status_ck"
    CHECK ("status" IN ('planned', 'in_progress', 'completed', 'cancelled'))
  -- FK komposit: support ON DELETE CASCADE, student NO ACTION
);

CREATE TABLE "score_remedial_attempt" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "assessment_id" uuid NOT NULL, "student_id" uuid NOT NULL,
  "support_id" uuid,
  "attempt_no" integer NOT NULL,
  "value" numeric(6, 2),
  "taken_on" date NOT NULL,
  "note" text,
  "recorded_by" text NOT NULL, "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "score_remedial_attempt_uq" UNIQUE ("assessment_id", "student_id", "attempt_no"),
  CONSTRAINT "score_remedial_attempt_no_ck" CHECK ("attempt_no" BETWEEN 1 AND 20),
  CONSTRAINT "score_remedial_attempt_value_ck" CHECK ("value" IS NULL OR "value" >= 0)
  -- FK komposit: assessment NO ACTION (rute hapus penilaian menghapus eksplisit), student NO ACTION, learning_support SET NULL
);
CREATE INDEX "score_remedial_attempt_assessment_idx" ON "score_remedial_attempt" ("school_id", "assessment_id");

ALTER TABLE "grading_setting" ADD COLUMN "remedial_policy" text;            -- NULL = record_only
ALTER TABLE "semester_grading_config" ADD COLUMN "remedial_policy" text;
-- CHECK identik di keduanya:
--   "remedial_policy" IS NULL OR "remedial_policy" IN ('record_only','replace_latest','max','cap_at_criteria','mean_with_original')
```

Batas atas `value` terhadap `max_score` diperiksa di API (sama seperti skor sekarang, perlu dicek aturannya di `PUT /v1/assessments/:id/scores`).

### 4.5 Migrasi 0100 (opsional, tahap 3.6)

`learning_plan` (perencanaan pembelajaran: mapel, kelas atau tingkat, semester, judul, tujuan/TP lewat tabel kaitan, langkah, asesmen,
tautan/berkas), `lesson_journal` (terikat `schedule_entry` + tanggal; ringkasan, TP yang dibahas, catatan), dan `learning_process_review`
(semester, guru yang ditinjau, `reviewer_kind` = `self` | `peer` | `principal` | `student`, tanggal, catatan, isian rubrik jsonb opsional).
Rinci saat tahap ini disetujui; semua opsional dan bernama netral.

### 4.6 Perubahan kontrak API

Semua field baru opsional pada body; pada respons, field baru di **API** boleh selalu ada (aditif), tetapi isi **jsonb tersimpan**
(snapshot, salinan beku) wajib sparse. Izin dan modul ditulis di deskripsi OpenAPI; `rbac-matrix` diperbarui untuk setiap rute baru.

| Tahap | Endpoint | Izin / modul | Perubahan | Galat baru |
|---|---|---|---|---|
| 3.1 | `GET/POST/PUT /v1/grading/components` | tetap | `category`, `includeInFinal` (body opsional, bawaan sumatif/true); `weight` 0 untuk formatif | 400 `invalid_component_category` |
| 3.1 | `PUT /v1/grading/settings` | tetap | `weights_sum_invalid` menjumlah komponen yang dihitung saja | - |
| 3.1 | `POST/PUT /v1/assessments`, `GET /v1/assessments` | tetap | `purpose`, `summativeScope`, `technique`; respons + `category` turunan | 400 `initial_requires_formative`, `scope_requires_summative` |
| 3.1 | `GET /v1/grading/recap` | tetap | `components[].category`, `includeInFinal` | - |
| 3.1 | `GET /v1/portal/children/:id/grades`, ringkasan skor portal | tetap | `components[].category`; skor terbaru + `category` | - |
| 3.1 | `POST /v1/exams/:id/grades` | tetap | `technique` opsional (hanya saat dibuat); dorong ulang tidak menyentuh tanda dan kaitan TP | - |
| 3.2 | `GET /v1/report-cards/:studentId` | tetap | Skema dari kontrak bersama; `schemaVersion?`, bagian v2, `guardianResponses?` | - |
| 3.2 | `PUT /v1/report-cards/sections` (baru) | `report_card:read` + wali kelas atau `report_card:manage`; modul `grades` | `cocurricularNote?`, `developmentNote?` (undefined = tetap, null = hapus) | 409 `report_final` |
| 3.2 | `GET/PUT /v1/report-cards/narratives` (baru) | `report_card:read` (baca) / pengampu atau `report_card:manage` (tulis); `grades` | daftar per siswa: `generated`, `manual`, `effective`, `stale`; tulis batch | 409 `report_final`, 403 |
| 3.2 | `GET/PUT /v1/report-cards/responses` (baru) | baca: hak lihat kelas; tulis (salin kertas): wali kelas atau `manage`; `grades` | tanggapan per wali | 409 `report_not_final`, `response_closed` |
| 3.2 | `GET/PUT /v1/portal/children/:id/report-cards/:semesterId/response` (baru) | `portal:respond`; `parent_portal` + `grades`; hanya tautan wali | baca/tulis tanggapan sendiri | 403 `not_guardian`, 409 `report_not_final`, `response_closed`, 404 |
| 3.2 | `PUT /v1/report-cards/settings` | tetap | `showCocurricular`, `showGuardianResponse`, `responseWindowDays` (opsional) | - |
| 3.2 | `GET/POST/PUT /v1/school/levels` | tetap | `reportMode` | - |
| 3.2 | `POST /v1/report-cards/finalize` | tetap | kelengkapan deskriptif; tulis `schema_version` 2 bila ada bagian v2 | pesan `grades_incomplete` menyebut "deskripsi" untuk mode deskriptif |
| 3.3 | `PUT /v1/assessments/:id/objectives` (baru) dan `objectiveIds?` di POST/PUT penilaian | `grade:input` + pengampu; `grades` | ganti himpunan TP | 400 `objective_subject_mismatch`, `objective_inactive`, `too_many_objectives`; 409 `report_final` |
| 3.3 | `GET /v1/grading/objective-achievement` (baru) | `grade:read` + hak baca pasangan; `grades` | matriks TP x siswa: `percent`, `achieved`, `levelLabel`, `source` (`computed`/`override`), `scope` | - |
| 3.3 | `PUT /v1/grading/objective-achievement` (baru) | `grade:input` + pengampu; `grades` | override batch | 409 `report_final` |
| 3.3 | `GET /v1/semesters/:id/grading-config` | tetap | + `objectiveCriteria`, `objectiveAggregation` | - |
| 3.3 | `PUT /v1/grading/settings` | tetap | `objectiveAggregation?` | - |
| 3.3 | `PUT /v1/objectives/:id` | tetap | versi baru bila TP dipakai penilaian | - |
| 3.4 | `GET /v1/report-cards/narratives` | tetap | `generated` dari TP; `stale` | - |
| 3.4 | `PUT /v1/report-cards/settings` | tetap | `narrativeMaxItems`, templat | 400 templat tanpa `{tp}` |
| 3.5 | `GET/POST /v1/learning-supports`, `PUT/DELETE /v1/learning-supports/:id`, `PUT /v1/learning-supports/:id/participants` (baru) | `grade:input` + pengampu; `grades` | pendampingan dan peserta | 409 `report_final` |
| 3.5 | `GET/POST /v1/assessments/:id/remedial-attempts`, `DELETE /v1/remedial-attempts/:id` (baru) | `grade:input` + pengampu; `grades` | percobaan | 400 `score_out_of_range`; 409 `report_final` |
| 3.5 | `PUT /v1/grading/settings` | tetap | `remedialPolicy?` | - |
| 3.5 | `GET /v1/grading/recap` | tetap | per siswa `remedial?: { attempts, effectiveSource }` (hanya bila ada) | - |

Izin baru: **`portal:respond`** (peran `guardian`). Tidak ada izin baru untuk narasi, remedial, atau TP (memakai `grade:input` dan hak
kontekstual yang ada). Modul: semua di `grades`; rute tanggapan portal juga `parent_portal`. Catatan: rute CP/TP (`routes/teaching-plan.ts`)
tidak memakai `requireModule` (terverifikasi); di luar cakupan, tetapi rute kaitan TP baru tetap di bawah `grades`.

### 4.7 Perubahan guard `report_final`

| Jalur | Guard |
|---|---|
| Ubah `category`/`include_in_final` komponen, `objective_aggregation`, `remedial_policy`, KKTP ber-TP | `assertLiveGradingConfigEditable` + aturan W (sama dengan bobot/KKM) |
| Tanda penilaian (`purpose`, `summative_scope`, `technique`), kaitan TP | `assertClassReportNotFinal` (penilaian sudah dijaga) |
| Override ketercapaian TP, percobaan remedial, peserta pendampingan | `assertClassReportNotFinal` (kelas-semester) |
| `learning_support` (buat/ubah/hapus) | `assertClassReportNotFinal` (data penyusun narasi dan nilai efektif) |
| Narasi manual, `cocurricular_note`, `development_note` | `assertStudentsReportNotFinal` per siswa (seperti catatan wali) |
| `school_level.report_mode`, pengaturan narasi dan bendera rapor | Tidak dijaga (tidak mengubah angka; final dibaca dari snapshot), sama dengan `report_setting` hari ini |
| Teks TP | Tidak dijaga; versi baru bila dipakai penilaian; snapshot menyimpan teks |
| Tanggapan wali | **Kebalikan:** mensyaratkan final (409 `report_not_final`) |
| Reopen | Tidak menghapus narasi manual, override, remedial, tanggapan; salinan beku tetap |

Pesan galat baru id/en/su di `messages/*.json` web; pesan API tetap bahasa Indonesia seperti sekarang.

---

## 5. Dampak per modul dan berkas

| Modul | Dampak |
|---|---|
| Penilaian | Kategori komponen, tanda penilaian, saring komponen di `computeGrades`, `assessedSubjects` rapor, kaitan TP, matriks ketercapaian, remedial, kebijakan |
| Pembekuan | `FrozenComponent` sparse, `objective_criteria`, `objective_aggregation`, `remedial_policy`; `readLiveGradingConfig`, `matchesLive`, pembaca versi 1/2 |
| Rapor | Kontrak dokumen bersama, bagian v2 sparse, narasi, mode deskriptif, kelengkapan, tanggapan, `schema_version` 2 |
| Portal | Label kategori, proyeksi deskriptif, tanggapan wali, izin `portal:respond` |
| Ujian | Dorong nilai mempertahankan tanda dan kaitan TP; komponen formatif boleh |
| Kurikulum/TP | Versi TP bila dipakai penilaian |
| Pengaturan sekolah | `school_level.report_mode` |
| Promosi/rollover | Tidak berubah (hanya memeriksa keberadaan rapor final); rollover **tidak** menyalin narasi, override, remedial |

Berkas (baru ditandai +):

- DB: `packages/db/drizzle/0096..0100_*.sql` +, `drizzle/meta/_journal.json`, `packages/db/src/schema.ts`, `packages/db/src/grading-freeze.ts`
  (+ tesnya), `packages/db/src/grading-backfill.ts` (tidak diubah perilakunya; diuji ulang), `packages/db/src/index.ts`
- Kontrak: `packages/contracts/src/grading.ts` (tanpa perubahan rumus; tipe kategori), `assessment-category.ts` +, `grading-config.ts`
  (versi 2, field sparse, skema `objective_criteria`), `kktp.ts` (`resolveObjectiveCriteria`), `objective-achievement.ts` + (agregasi,
  status, kebijakan remedial, semuanya murni), `report-document.ts` + (tipe dan zod dokumen v1/v2), `report-card.ts`
  (`buildObjectiveNarrative`), `permissions.ts` (`portal:respond`), `index.ts`, `openapi.json` (ekspor)
- API: `grading-lib.ts`, `grading-config-lib.ts`, `kktp-lib.ts`, `objective-achievement-lib.ts` +, `remedial-lib.ts` +, `report-card-lib.ts`,
  `portal-lib.ts`, `report-lock-lib.ts` (tidak berubah; dipakai), `grading-verify-lib.ts` (dicek saja), `routes/grading.ts`,
  `routes/report-card.ts`, `routes/report-card-narratives.ts` +, `routes/report-card-responses.ts` +, `routes/portal.ts`,
  `routes/exam-scores.ts`, `routes/teaching-plan.ts`, `routes/school-settings.ts`, `routes/learning-support.ts` +
- Web: `apps/web/src/lib/api-types.ts` (`gen:api`), `grades/settings/settings-view.tsx` (kategori komponen, agregasi, kebijakan remedial),
  `grades/assessments-panel.tsx` (tanda, TP), `grades/recap-panel.tsx` (formatif terpisah, remedial), `grades/objective-achievement-panel.tsx` +,
  `grades/learning-support-panel.tsx` +, `report-cards/report-cards-view.tsx` (bagian, narasi), `report-cards/narratives-panel.tsx` +,
  `report-cards/preview.tsx`, `report-cards/pdf/report-card-pdf.tsx`, `report-cards/settings/settings-view.tsx`,
  `portal/children/[studentId]/{grades-tab,reports-tab}.tsx`, halaman pengaturan tingkat, `messages/{id,en,su}.json`, `docs/content-academic.ts`
- Tes: lihat bagian 6. Dokumen: `CHANGELOG.md`, `docs/FITUR-EDUSYNC.md`, `Planning/11-academic-roadmap.md`

Daftar berkas web adalah perkiraan terbaik; saya hanya membaca nama berkas dan potongan pratinjau/PDF.

---

## 6. Strategi uji

### 6.1 Skenario regresi wajib

| # | Skenario | Suite |
|---|---|---|
| T1 | **Hasil lama identik.** Garis dasar dibekukan sebelum 3.1 (fixture JSON): rekap, matriks, dokumen draf, daftar rapor, nilai portal untuk tiga mode dan empat cakupan KKTP; sesudah tiap tahap respons sama persis (kecuali field API aditif yang didaftar eksplisit). | `phase3-baseline.test.ts` + |
| T2 | **Snapshot emas v1.** Finalisasi sekolah tanpa fitur baru: `schema_version = 1`, jsonb snapshot sama persis dengan fixture (kecuali `generatedAt`); salinan beku tetap `config_version = 1` dan `matchesLive = true`. | `report-card`, `grading-freeze` |
| T3 | **Formatif tidak memengaruhi.** Tambah komponen formatif berbobot apa pun + skor ekstrem (0 dan 100) pada tiga mode: `final`, `predicate`, rata-rata, peringkat, `grades_incomplete`, mapel rapor, keputusan promosi tidak berubah; `perComponent` memuat rata-rata formatif. Penilaian `purpose = initial` di komponen sumatif (dimasukkan langsung di DB) juga diabaikan. | `assessment-category.test.ts` +, `promotion` |
| T4 | **Mode persentase.** Komponen formatif tidak ikut jumlah 100; mengubah sumatif menjadi formatif tidak membuat nilai turun karena "menyumbang 0". | idem |
| T5 | **Pembekuan kategori.** Bekukan, ubah kategori komponen hidup lewat DB: semester beku tetap; aturan W menyinkronkan semester aktif tanpa final; salinan v2 dibaca; salinan v1 dibaca sebagai sumatif. | `grading-freeze` |
| T6 | **Ujian CBT.** Dorong ke komponen formatif: penilaian formatif, tidak masuk nilai akhir. Dorong ulang tidak mengubah `technique`, `purpose`, kaitan TP; skor asli berubah tetapi percobaan remedial tetap. | `exam-scores` |
| T7 | **Rapor v1 tidak berubah.** Rapor final v1 (dibuat sebelum migrasi, fixture) dibaca lewat semua pembaca sesudah setiap tahap: respons sama persis; renderer web dites dengan fixture v1 (uji komponen). | `report-card`, `portal` |
| T8 | **Snapshot v2.** Satu murid dengan catatan kokurikuler: `schema_version = 2` untuk murid itu saja; murid lain di kelas sama tetap v1. Mode deskriptif: portal tidak memuat angka; staf memuatnya; kelengkapan memakai deskripsi. | `report-card-v2.test.ts` + |
| T9 | **Reopen dan finalisasi ulang.** Narasi manual, override, remedial, tanggapan bertahan; tanggapan diberi tanda versi lama; finalisasi ulang tanpa perubahan data menghasilkan snapshot sama (kecuali `generatedAt`). | idem |
| T10 | **Guard.** Setiap jalur baru di tabel 4.7 ditolak 409 `report_final` saat final dan diterima sesudah reopen; tanggapan wali ditolak sebelum final. | `report-lock.test.ts` / suite tahap |
| T11 | **Ketercapaian TP.** Empat mode kriteria per TP x empat jenjang cakupan, fallback ke KKM mapel lalu KKM sekolah; tiga agregasi; override menang; formatif tidak dihitung; jumlah kueri tetap untuk 40 murid x 10 TP. | `objective-achievement.test.ts` + |
| T12 | **Narasi.** Urutan tinggi/rendah, seri, batas item, semua tercapai, tanpa kandidat = teks v1 persis; sunting manual, `stale`, hapus suntingan. | `report-narrative.test.ts` + |
| T13 | **Remedial.** Lima kebijakan pada tiga mode; `record_only` identik dengan tanpa percobaan; `cap_at_criteria` memakai KKM efektif; kebijakan beku per semester; hapus penilaian menghapus percobaan. | `remedial.test.ts` + |
| T14 | **Multi-tenant.** Sekolah B tidak dapat membaca/menulis kaitan TP, override, narasi, tanggapan, pendampingan sekolah A (404); FK komposit menolak TP/penilaian/wali sekolah lain; tabel baru ikut `tenant-isolation`. Backfill/pembekuan lewat koneksi BYPASSRLS tidak mencampur `objective_criteria` antar sekolah. | `tenant-isolation`, suite tahap, `packages/db/src/grading-freeze.test.ts` |
| T15 | **Portal.** Wali hanya anaknya; tautan siswa ditolak menulis tanggapan; wali lain tidak melihat tanggapan; jendela tanggapan; modul nonaktif. | `portal` |
| T16 | **RBAC.** Semua rute baru di `rbac-matrix` (izin + modul); `portal:respond` hanya di peran guardian; sinkron peran menambahkannya ke sekolah lama. | `rbac-matrix`, `roles-sync` |
| T17 | **Versi TP.** Ubah teks TP yang dipakai penilaian: versi baru; snapshot final menampilkan teks lama; hapus TP terpakai 409 `in_use`. | `teaching-plan` |

### 6.2 Tes lama yang pasti atau mungkin berubah

| Berkas | Perubahan |
|---|---|
| `grading.test.ts` | Pasti: validasi `weight` (0 untuk formatif), `weights_sum_invalid` hanya komponen dihitung. Mungkin: asersi `toEqual` atas daftar komponen/penilaian bila ada (field `category` baru). Belum dibaca penuh. |
| `rbac-matrix.test.ts` | Pasti: rute baru. |
| `report-card.test.ts` | Tidak diharapkan berubah berkat sparse (`:1114` tetap `schemaVersion: 1`). Tambahan untuk v2. |
| `portal.test.ts` | Mungkin: `components[].category` pada nilai portal bila diasersikan dengan `toEqual`. |
| `exam-scores.test.ts` | Tambahan (T6); yang lama tetap. |
| `grading-freeze.test.ts`, `grading-backfill.test.ts` | Tidak diharapkan berubah (sparse, `config_version` 1); tambahan untuk v2. |
| `teaching-plan.test.ts` | Pasti bila ada tes "ubah TP di tempat" untuk TP yang kemudian dikaitkan penilaian (tidak ada sekarang karena kaitannya baru). |
| `packages/contracts/src/permissions.test.ts` | Pasti: `portal:respond` di guardian, tidak di student. |

---

## 7. Rencana migrasi data

- **Tidak ada backfill data yang diperlukan.** Semua kolom baru berdefault perilaku sekarang (`summative`, `true`, `NULL`, `'[]'`), diisi
  oleh Postgres saat DDL tanpa melewati RLS. Tabel baru mulai kosong.
- **Salinan beku lama** (DB dev: 3 baris) tidak dimigrasi: pembaca versi 1 menafsirkan kunci yang hilang sebagai sumatif/tanpa kriteria TP/
  `record_only`, yang benar secara historis. `config_version` lama dibiarkan.
- **Rapor final lama** (DB dev: 4, semuanya v1) tidak disentuh dan tidak dihitung ulang.
- **Izin `portal:respond`:** disebarkan ke peran sistem `guardian` semua sekolah oleh `syncSystemRolePermissions` yang sudah dipanggil
  `packages/db/src/migrate.ts` lewat koneksi platform (peran DB tidak diubah). Bila `DATABASE_PLATFORM_URL` kosong, migrator sudah mencetak
  peringatan; jalankan skrip sinkron.
- **Bila kelak dibutuhkan** pengisian data (mis. menandai komponen bernama "Formatif" sebagai formatif): **jangan** di SQL migrasi (RLS FORCE
  membuat `UPDATE` diam-diam tidak berefek di produksi bila pemilik tabel bukan superuser); buat migrator TypeScript lewat koneksi platform
  dengan filter `school_id` eksplisit, mengikuti `grading-backfill.ts`. Rekomendasi saya: **jangan** menebak dari nama; biarkan sekolah memilih
  di layar pengaturan (mengubah nilai rapor sekolah tanpa persetujuan tidak dapat diterima).
- **Rollback per tahap** (deploy tag lama; tabel dan kolom baru dibiarkan):
  - 3.1: kode lama mengabaikan kategori, jadi **komponen formatif kembali ikut nilai akhir** untuk draf dan semester beku yang memuatnya; rapor
    final aman (snapshot). Wajib ditulis di CHANGELOG dan catatan rilis: rollback setelah sekolah memakai formatif mengubah angka draf.
  - 3.2: bagian v2 tidak ditampilkan versi lama (zod membuang kunci); snapshot tetap utuh dan tampil lagi setelah maju. Tanggapan wali tidak
    dapat ditulis selama rollback.
  - 3.3/3.4: tidak ada efek pada angka; narasi kembali dari predikat untuk draf; final aman. `objective_criteria` diabaikan (kolom terpisah, bukan
    `criteria`, sehingga tidak ada galat parse).
  - 3.5: kebijakan remedial diabaikan (kembali `record_only`): angka draf dapat berubah bila sekolah memakai kebijakan selain `record_only`.

---

## 8. Pemecahan tahap implementasi

Urutan berbeda sedikit dari usulan awal: **komponen rapor tambahan (celah P0 C3) dan infrastruktur snapshot v2 didahulukan sebelum
ketercapaian TP**, karena (a) prioritas regulasinya P0, (b) bagian v2 pertama berupa teks bebas sehingga pola sparse, kontrak dokumen bersama,
dan semua renderer teruji dengan risiko rendah sebelum narasi otomatis yang lebih rumit memakainya, (c) mode deskriptif membutuhkan deskripsi
manual per mapel, yang sekaligus menjadi fondasi narasi. Tiap tahap: backend dulu (migrasi, kontrak, API, tes, OpenAPI), lalu web; masing-masing
dirilis sebagai MINOR sendiri (perkiraan v1.3.0 sampai v1.8.0) dan dapat dibatalkan lewat tag.

| Tahap | Isi | Selesai bila | Tes wajib tambahan |
|---|---|---|---|
| **3.0 Fondasi (PATCH, tanpa perubahan perilaku)** | Fixture garis dasar T1 dan snapshot emas T2 dari v1.2.2; pindahkan skema dokumen ke `contracts/report-document.ts` dan pakai di kedua rute; pembaca salinan beku menerima `config_version` 1 dan 2. | Semua suite hijau **tanpa mengubah satu tes pun**; `openapi.json` tidak berubah secara semantik. | T1, T2 sebagai tes baru |
| **3.1 Kategori asesmen** | Migrasi 0096; kategori komponen, tanda penilaian, saring di `computeGrades`, `assessedSubjects` rapor, validasi bobot, salinan sparse, aturan dorong ujian; web: pengaturan komponen, formulir penilaian, rekap (formatif terpisah, label "tidak masuk nilai rapor"), portal. | T1-T6 hijau; sekolah lama identik; dokumentasi dalam aplikasi. | T3-T6, T10 (tanda), T14, T16 |
| **3.2 Snapshot v2 dan komponen rapor** | Migrasi 0097; `cocurricular_note`, `development_note`, `report_mode`, deskripsi manual per mapel (`report_subject_narrative` tanpa otomatis), tanggapan wali (staf + portal, `portal:respond`), bendera tampilan, `schema_version` 2 sparse, kelengkapan deskriptif, proyeksi portal; web: pratinjau, PDF, portal, panel narasi manual, pengaturan tingkat. | T2, T7-T10, T15 hijau; rapor tanpa bagian baru tetap v1. | T7-T10, T14-T16 |
| **3.3 Kaitan TP dan ketercapaian** | Migrasi 0098 (tanpa kolom narasi bila dipisah); `assessment_objective`, pemecah kriteria TP, agregasi, override, pembekuan `objective_criteria`, versi TP; web: pilih TP di penilaian, tab **Ketercapaian TP**. Rapor **belum** berubah. | T11, T14, T17 hijau; jumlah kueri tetap; rapor identik. | T11, T14, T17 |
| **3.4 Narasi rapor dari TP** | Generator, templat, `stale`, `objectives` di snapshot, `descriptionSource = objectives`; web: panel narasi menampilkan otomatis vs suntingan, pengaturan templat. | T12 dan T1 hijau (tanpa TP = teks v1 persis). | T12, T9 |
| **3.5 Remedial dan pengayaan** | Migrasi 0099; pendampingan, peserta, percobaan, kebijakan + beku, nilai efektif di hitung dan ketercapaian TP; web: tab **Remedial dan pengayaan**, kebijakan di pengaturan, penanda di rekap. | T13 hijau; `record_only` identik. | T13, T6, T10, T14 |
| **3.6 Opsional** | Perencanaan pembelajaran, jurnal di layar Absensi per jam, penilaian proses pembelajaran (C12); dapat dimatikan per sekolah. | Rancangan rinci disetujui lebih dulu. | suite sendiri, `tenant-isolation` |

Setiap tahap mengulang suite wajib (bagian 1.2 butir 9) sebelum tag, plus uji peramban sesuai standar tampilan.

---

## 9. Risiko dan mitigasi

| # | Risiko | Dampak | Mitigasi |
|---|---|---|---|
| R1 | Satu jalur hitung lupa menyaring formatif (rekap, matriks, portal, rapor, verifikasi) | Formatif bocor ke nilai | Penyaringan di dalam `computeGrades` (satu tempat), bukan di pemanggil; T3 memeriksa semua permukaan |
| R2 | Mode `percentage` dan komponen formatif berbobot | Nilai turun | Bobot formatif 0 dan diabaikan; validasi jumlah hanya komponen dihitung; T4 |
| R3 | Field sparse tidak sengaja selalu ditulis | `matchesLive` false massal, snapshot lama/baru beda, tes lama merah | Tes emas T2; pembuat jsonb memakai helper `omitDefaults` yang diuji |
| R4 | Bagian v2 dibuang serializer karena skema respons tidak diperbarui | Data hilang diam-diam dari API | Skema dokumen tunggal di kontrak (3.0); tes membaca respons, bukan DB |
| R5 | Rollback setelah formatif/remedial dipakai | Angka draf berubah | Catatan rilis; rapor final aman; rollback disarankan hanya sebelum sekolah memakai fitur |
| R6 | Beban input guru (TP per penilaian, override, narasi) | Fitur tidak dipakai | Semua opsional; tanpa TP rapor tetap seperti v1; pilih TP massal; override hanya untuk pengecualian |
| R7 | Narasi manual usang setelah skor diubah | Rapor tidak cocok dengan data | `generated_hash` + penanda `stale` + peringatan saat finalisasi (jumlah narasi usang) |
| R8 | Privasi tanggapan wali | Kebocoran antar wali | Hanya penulis + staf; tes T15; teks polos, batas panjang, audit |
| R9 | `ADD CONSTRAINT UNIQUE (school_id, id)` pada `assessment`/`guardian` produksi | Kunci tabel saat membangun indeks | Ukur jumlah baris produksi dulu; bila besar, `CREATE UNIQUE INDEX CONCURRENTLY` di luar transaksi lalu `ADD CONSTRAINT ... USING INDEX` (perlu cek apakah migrator Drizzle menjalankan berkas dalam transaksi) |
| R10 | Kinerja ketercapaian TP satu kelas besar | Halaman lambat | Kueri batch tetap; indeks cakupan; ambang jumlah kueri di T11 |
| R11 | Kebingungan versi TP (teks berubah setelah penilaian) | Narasi draf memakai teks lama | Versi baru, tautan ke versi terbaru di UI; snapshot menyimpan teks |
| R12 | Fase A: sekolah salah set mode, atau angka tetap tersimpan padahal "tanpa nilai" | Ketidaksesuaian harapan | Mode per tingkat dengan saran dari profil; K10 meminta keputusan eksplisit soal penyimpanan angka |
| R13 | Dorong ujian menimpa skor asli setelah ada remedial | Riwayat tidak konsisten | Percobaan terpisah; T6; dorong ulang mencatat audit jumlah skor yang berubah |
| R14 | Kata "diagnostik" di UI | Tidak sesuai regulasi | Label "asesmen awal (diagnostik)" sebagai tujuan, bukan jenis |
| R15 | Tanggapan wali menghalangi hapus wali (FK NO ACTION) | Operasi admin gagal | Cek `guardian-remove`; bila perlu SET NULL (K9) |

---

## 10. Keputusan produk yang menunggu persetujuan

Usulan bawaan dicetak miring; dipakai bila tidak ada jawaban.

| # | Keputusan | Usulan bawaan | Alasan |
|---|---|---|---|
| K1 | Letak kategori: komponen, penilaian, atau keduanya | _Komponen; penilaian hanya membawa tanda tujuan, lingkup sumatif, teknik_ | Satu sumber, aman di mode persentase, sudah ikut pembekuan |
| K2 | Formatif terlihat di portal wali | _Ya, terpisah dan berlabel "umpan balik, tidak masuk nilai rapor"_ | Formatif berguna bagi orang tua; tidak digabung dengan sumatif (A4) |
| K3 | Formatif ikut ketercapaian TP untuk rapor | _Tidak; tampil sebagai kemajuan di tab guru_ | A4: formatif tidak dipakai untuk rapor |
| K4 | Agregasi ketercapaian TP | _Rata-rata (`mean`), dapat diganti `latest`/`max` per sekolah_ | A6 menyerahkan cara olah ke sekolah |
| K5 | Satu skor berlaku untuk semua TP penilaian itu | _Ya; skor per TP ditunda_ | Beban input; guru bisa membuat penilaian per TP |
| K6 | Jumlah TP di narasi dan perlakuan "semua tercapai" | _2 per sisi; kalimat "perlu bimbingan" dihilangkan bila semua tercapai_ | Narasi ringkas; templat dapat diubah sekolah |
| K7 | Siapa menyunting narasi mapel | _Guru pengampu dan `report_card:manage`; wali kelas hanya membaca_ | Penilai mapel yang bertanggung jawab atas deskripsinya |
| K8 | Kebijakan remedial bawaan | _`record_only`; pilihan lain termasuk `cap_at_criteria` tersedia, tidak dikunci_ | A8; hasil lama identik; menggantikan usulan roadmap "batas = KKTP" |
| K9 | Tanggapan wali: jendela, visibilitas, salinan staf, hapus wali | _30 hari, hanya penulis + staf, staf boleh menyalin dari kertas, hapus wali ditolak bila ada tanggapan_ | Privasi keluarga; banyak wali tanpa portal |
| K10 | Fase A: simpan angka di snapshot tetapi disembunyikan, atau tidak menghitung angka | _Simpan, sembunyikan di semua tampilan, proyeksikan keluar dari portal_ | Konsistensi leger/promosi; sekolah tetap bisa berpindah mode |
| K11 | Catatan perkembangan Fase A terpisah dari catatan wali | _Ya, kolom sendiri, tampil hanya di mode deskriptif_ | R2/C3 menyebutnya sebagai komponen; struktur rinci ditunda |
| K12 | Bagian kokurikuler dan tanggapan di PDF | _Bendera bawaan mati untuk sekolah lama; layar pengaturan menyarankan menyalakan_ | PDF lama tidak berubah tanpa diminta; kepatuhan 12 komponen tetap mudah |
| K13 | Urutan tahap (komponen rapor sebelum TP) | _Ya, seperti bagian 8_ | P0 dulu, risiko rendah dulu |
| K14 | TP yang dipakai penilaian diubah: versi atau di tempat | _Versi baru_ | Konsisten dengan ATP terbit; arsip jelas |
| K15 | `template_key` | _Tetap tidak dipakai sampai fase 4/5_ | Bentuk data cukup diwakili `schema_version` |
| K16 | Tahap 3.6 (perencanaan, jurnal, penilaian proses) di fase 3 atau ditunda | _Dikerjakan terakhir, opsional, rancangan rinci terpisah_ | Tidak wajib nasional kecuali C12; nilai pakai lebih rendah dari C3 |
| K17 | Penomoran rilis | _Satu MINOR per tahap 3.1-3.5, 3.0 sebagai PATCH_ | Sesuai prinsip "beberapa MINOR kecil" |

---

## 11. Asumsi dan ketidakpastian

- Suite tes tidak saya jalankan; daftar 6.2 berasal dari pembacaan sebagian (`grading.test.ts`, `portal.test.ts` belum dibaca penuh).
- Perilaku serializer Fastify-zod yang membuang kunci tak dideklarasikan saya simpulkan dari perilaku bawaan `z.object`; belum diuji.
- Berkas web hanya dibaca sekilas (pratinjau dan PDF memakai `description` dan `homeroomNote`); daftar berkas web adalah perkiraan.
- Ukuran tabel `assessment`, `guardian` di produksi (untuk R9) dan apakah migrator menjalankan tiap berkas dalam transaksi: belum dicek.
- Apakah rute hapus wali memetakan 23503 ke `in_use`: belum dicek.
- Batas atas skor terhadap `max_score` pada `PUT /v1/assessments/:id/scores`: belum dibaca; remedial harus memakai aturan yang sama.
- Isi rinci "perkembangan fondasi" Fase A dan bentuk tanggapan orang tua di PPA 2025 hanya dari ringkasan di `regulasi-umum.md` (R1, R2), bukan
  pembacaan langsung; struktur sengaja minimal.
- Templat kalimat narasi bawaan dalam tiga bahasa perlu ditinjau penutur; teks rapor resmi biasanya bahasa Indonesia, jadi templat disimpan
  per sekolah, bukan per bahasa antarmuka (asumsi).
- Angka `when` migrasi mengikuti pola +86.400.000 dari 0094-0095; harus diperiksa ulang terhadap jurnal saat implementasi bila ada migrasi lain
  yang masuk lebih dulu.
