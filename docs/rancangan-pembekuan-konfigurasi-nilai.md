# Rancangan: pembekuan konfigurasi nilai per semester

Status: **usulan, menunggu persetujuan**. Disusun 13 November 2026 pada cabang `rebuild` (setelah migrasi 0093).
Dokumen ini hanya rancangan: tidak ada kode, migrasi, atau data yang diubah. Kueri ke DB dev bersifat baca-saja.
Terkait: [AUDIT-AKADEMIK.md](AUDIT-AKADEMIK.md) temuan F1-F4 dan F10, [roadmap](../Planning/11-academic-roadmap.md) fase 1 dan 2B/2C,
[regulasi-umum.md](regulasi-umum.md) bagian 4-5 (cara hitung nilai akhir, bobot, dan kriteria ketuntasan adalah konfigurasi sekolah
yang boleh berubah, jadi harus bisa berubah **tanpa** mengubah semester yang sudah lewat).

Cara membaca: "terverifikasi" berarti saya baca sendiri di kode atau DB dev; "asumsi" berarti belum dibuktikan. Daftar lengkap
ketidakpastian ada di bagian 10.

---

## 1. Masalah dan kriteria keberhasilan

### 1.1 Masalah (terverifikasi)

Konfigurasi nilai hidup dan satu-sekolah: `grading_setting` (KKM, batas predikat, `calculation_mode`), `grade_component` (bobot),
`achievement_criteria` + `achievement_rubric_level` (KKTP). Tidak satu pun terikat semester (`packages/db/src/schema.ts:1028-1084, 1665-1694`).

| # | Masalah | Bukti |
|---|---|---|
| M1 | Penjaga konfigurasi hanya melihat semester AKTIF. Tanpa semester aktif, atau bila rapor final hanya ada di semester nonaktif, konfigurasi bebas diubah. | `apps/api/src/report-lock-lib.ts:80-94` (`assertNoFinalInActiveSemesters`). DB dev: semester Genap 2025/26 nonaktif punya 4 rapor final; semester aktif Ganjil 2026/27 punya 0 final (32 draf, 540 penilaian). Penjaga lolos, jadi mengubah bobot hari ini mengubah angka Genap 2025/26. |
| M2 | Portal wali, rekap mapel, dan matriks kelas menghitung ulang nilai akhir, predikat, KKM, dan "belum tuntas" dengan konfigurasi hidup untuk semester mana pun. Rapor final dibaca dari snapshot. Dua angka untuk semester yang sama bisa berbeda. | `portal-lib.ts:333-374` (`gradesFor`), `routes/grading.ts:928-942` (rekap) dan `:1039-1049` (matriks), `report-card-lib.ts:159-177`. Tes `achievement-criteria.test.ts:873` bahkan menegaskan perbedaan itu: rekap kelas yang rapornya final menampilkan KKM 60 sementara rapor bekunya 75. |
| M3 | Fase 2B/2C menambah KKTP berjenjang (empat cakupan) dan tiga mode nilai akhir, jadi jumlah tombol yang dapat menggeser angka lama bertambah. | `packages/contracts/src/kktp.ts:147-170`, `grading.ts:44-80`, migrasi 0091 dan 0092. |
| M4 | Mengubah bobot atau KKM menggeser rapor DRAF semua kelas sekaligus, termasuk draf semester lama yang belum difinalkan. | `loadClassContext` memuat konfigurasi hidup tanpa melihat semester. |
| M5 | Buka kembali lalu finalisasi ulang memakai konfigurasi hari ini, bukan konfigurasi saat rapor pertama terbit. Koreksi satu skor pada rapor tahun lalu dapat mengubah predikat seluruh kelas tanpa disadari. | `routes/report-card.ts:457` (finalisasi selalu `loadClassContext` hidup). |
| M6 | Balapan: finalisasi kelas dan `PUT /v1/grading/settings` yang berjalan bersamaan tidak saling mengunci. | Tidak ada kunci bersama di kedua jalur. |

Catatan tambahan (terverifikasi): snapshot rapor versi 1 hanya memuat `kkm`, `final`, `predicate`, `belowKkm` per mapel
(`report-card-lib.ts:76-104`), **tanpa** bobot komponen, batas predikat, mode, maupun rata-rata per komponen. Portal menampilkan
rincian per komponen (`portal-lib.ts:366-370`). Jadi snapshot saja tidak cukup untuk menggantikan perhitungan ulang.

### 1.2 Kriteria keberhasilan

1. Setelah sebuah semester punya rapor final, **tidak ada** perubahan konfigurasi hidup yang mengubah angka apa pun pada semester itu
   (rapor, portal, rekap, matriks, Excel, PDF), baik untuk kelas yang final maupun yang masih draf.
2. Angka yang ditampilkan portal dan rekap untuk kelas yang rapornya final **sama persis** dengan snapshot rapor.
3. Buka kembali lalu finalisasi ulang hanya mengubah hal yang memang diubah (skor, absensi, catatan), bukan aturan hitungnya.
4. Sekolah dapat mengubah konfigurasi untuk semester berikutnya tanpa membuka kembali rapor lama.
5. Sekolah yang tidak pernah mengubah konfigurasi tidak merasakan apa pun: semua respons untuk semester yang belum beku identik
   byte demi byte dengan sekarang.
6. Aditif: tanpa DROP kolom, tanpa perubahan tipe; kode galat yang ada tidak berganti; bisa dibatalkan lewat tag.
7. Tidak ada N+1: konfigurasi satu semester dimuat sekali per permintaan.
8. Suite wajib tetap hijau: `grading`, `report-card`, `schedule`, `pkl`, `rbac-matrix`, `tenant-isolation`, `promotion`,
   `achievement-criteria`, `portal`.

---

## 2. Opsi yang dipertimbangkan

### A. Salinan konfigurasi per semester ("beku"), resolusi: semester beku memakai salinan, selain itu konfigurasi hidup

Dua bentuk penyimpanan:

- **A1, relasional:** `semester_grading_config` + `semester_grade_component` + `semester_achievement_criteria` +
  `semester_achievement_rubric_level` (empat tabel, masing-masing RLS dan FK komposit).
- **A2, satu tabel:** `semester_grading_config` dengan kolom skalar (KKM, predikat, mode) dan dua kolom `jsonb`
  (`components`, `criteria`) yang bentuknya persis keluaran pemuat yang sudah ada (`loadComponents`, `KktpRow[]`).

| | A1 relasional | A2 satu tabel + jsonb |
|---|---|---|
| Integritas rujukan | FK ke mapel, jurusan, komponen | hanya FK komposit ke semester; id di dalam jsonb tidak ber-FK |
| Efek samping FK | menghapus komponen/jurusan/mapel yang pernah dibekukan jadi tertahan selamanya (NO ACTION) atau diam-diam mengubah salinan (CASCADE/SET NULL) | tidak ada; id yatim di dalam jsonb tidak berpengaruh pada hitungan |
| Baca | 4 kueri, dapat difilter per mapel | 1 kueri, seluruh konfigurasi semester |
| Tulis (salin) | 4 `INSERT ... SELECT` | 1 `INSERT` |
| Boilerplate | 4 tabel x (RLS, policy, grant, skema Drizzle) | 1 tabel |
| Dapat dikueri SQL | ya | terbatas (operator jsonb) |
| Sifat data | sebenarnya nilai beku yang selalu dibaca utuh dan tidak pernah di-join | cocok: sama seperti `report_card.snapshot` |

Kelebihan A (keduanya): menyelesaikan M1, M3, M4, M5 untuk semester beku; transisi antar-semester alami; kode hitung tidak berubah
(hanya sumber konfigurasinya). Kekurangan A: (a) tidak menjamin M2 sepenuhnya, karena masukan lain masih hidup (tingkat/jurusan kelas
yang menentukan jenjang KKTP dapat diubah setelah final; nama mapel; sekolah lama yang konfigurasinya sudah berubah sebelum pembekuan
tidak bisa direkonstruksi); (b) perlu aturan kapan beku dan kapan boleh diganti; (c) penilaian baru pada semester beku harus memakai
komponen yang ada di salinan.

### B. Konfigurasi berversi dengan masa berlaku (`effective_from_semester`), tanpa menyalin

`grading_config_version` + baris komponen dan kriteria per versi; semester menunjuk versi; mengubah versi yang sudah dipakai semester
terkunci memicu salin-saat-tulis.

- Kelebihan: tanpa duplikasi antar-semester; model "benar" bila sekolah ingin merencanakan konfigurasi semester depan lebih dulu.
- Kekurangan: mengubah identitas tiga tabel yang ada (komponen dirujuk `assessment.component_id`, kriteria punya indeks unik cakupan
  ber-COALESCE); setiap rute tulis harus memutuskan "ubah di tempat atau buat versi baru"; urutan semester harus terdefinisi (tanggal
  bisa diubah); butuh pembersihan versi yatim; UI harus menjelaskan versi. Salin-saat-tulis tetap menyalin, hanya ditunda. Dengan
  2 semester per tahun dan puluhan baris per sekolah, penghematan ruangnya tidak berarti. Risiko migrasi tertinggi di antara semua opsi.

### C. Portal dan rekap semester final membaca angka dari snapshot rapor, ditambah guard yang diperluas

- Kelebihan: jaminan terkuat untuk M2 (angka tampil = angka terbit) tanpa peduli masukan mana yang berubah; murah; berlaku juga
  untuk data lama.
- Kekurangan bila berdiri sendiri: snapshot v1 tidak memuat rincian komponen, jadi rincian tetap dihitung hidup dan bisa tidak cocok
  dengan nilai akhirnya; draf semester lama tetap bergeser (M4); finalisasi ulang tetap memakai konfigurasi hari ini (M5); kelas yang
  belum final pada semester yang sama tidak terlindungi.

### D. Memperluas guard ke semua semester yang punya rapor final, tanpa pembekuan

- Kelebihan: paling sedikit kode (satu `WHERE` dihapus).
- Kekurangan fatal: begitu satu rapor final ada di semester mana pun, konfigurasi terkunci selamanya. Sekolah tidak pernah bisa
  mengganti bobot atau KKTP untuk semester berikutnya tanpa membuka kembali semua rapor lama, padahal regulasi menyerahkan cara
  hitung dan kriteria ke sekolah dan boleh berubah (regulasi-umum.md bagian 5 butir 4-5). Juga tidak menolong M4 dan M5.

### E. Snapshot rapor "swa-penjelas" (schema_version 2: simpan bobot, batas predikat, mode, dan rata-rata komponen di snapshot)

- Kelebihan: membuat C lengkap untuk kelas yang final. Kekurangan: tidak menolong draf dan finalisasi ulang; mengubah bentuk dokumen
  rapor (semua pembaca snapshot harus paham dua versi); tidak berlaku surut. Layak sebagai pelengkap kelak, bukan pengganti A.

### F. Simpan nilai akhir hasil hitung per (semester, kelas, mapel, siswa) di tabel

- Menggeser sumber kebenaran dari skor ke agregat; butuh invalidasi di setiap jalur tulis skor. Ditolak: bertentangan dengan prinsip
  "nilai dihitung dari skor" (`contracts/grading.ts:1-5`) dan menambah permukaan galat.

### G. Trigger database yang menolak perubahan konfigurasi

- Roadmap sengaja menunda trigger ("Yang sengaja tidak dikerjakan"). Trigger juga tidak tahu semester mana yang terdampak tanpa
  pembekuan. Ditolak untuk sekarang.

---

## 3. Rekomendasi: A2 + C, dengan guard yang ada dipertahankan

**Bekukan konfigurasi nilai per semester dalam satu tabel `semester_grading_config` (A2), dan untuk kelas yang rapornya final,
ambil angka terbit dari snapshot (C).** D ditolak; B ditunda sebagai evolusi bila kelak sekolah meminta perencanaan konfigurasi
per semester (baris A2 sudah merupakan "konfigurasi milik semester", jadi tidak menutup jalan itu).

Alasan singkat:

1. A2 memutus ketergantungan semester lama pada konfigurasi hidup dengan perubahan kode terkecil: tiga pemuat (`loadSettings`,
   `loadComponents`, `loadKktpRows`) diganti satu pemuat ber-`semesterId`; rumus (`computeGrades`, `resolveKkm`, `finalGrade`) tidak disentuh.
2. C menutup sisa celah A (tingkat/jurusan kelas yang diubah, sekolah lama yang konfigurasinya sudah bergeser sebelum pembekuan,
   perubahan langsung di DB): apa pun yang terjadi, angka kelas final = snapshot.
3. A2 dipilih atas A1 karena salinan adalah nilai beku yang selalu dibaca utuh; FK pada salinan lebih banyak mudaratnya (lihat tabel
   di opsi A) dan pola jsonb beku sudah dipakai proyek (`report_card.snapshot`).
4. Perilaku semester aktif tidak berubah sama sekali (guard, kode galat, dan efek penyimpanan sama), jadi sekolah tidak merasakan beda.

### 3.1 Model

- Tidak ada baris `semester_grading_config` untuk semester S: S **mengikuti konfigurasi hidup** (perilaku sekarang).
- Ada baris: S **beku** dan memakai isi baris itu untuk semua kelas pada semester itu.

Invarian yang dijaga kode dan diuji:

- **I1.** Semester yang punya minimal satu rapor final selalu punya baris beku (dibuat di transaksi finalisasi pertama; data lama lewat backfill).
- **I2.** Baris beku hanya diganti lewat dua jalur eksplisit dan teraudit, dan keduanya ditolak bila semester itu punya rapor final:
  (a) sinkron ulang manual, (b) tulis-tembus saat konfigurasi hidup diubah dan semester itu AKTIF (aturan W di bawah).
- **I3.** Untuk (semester, kelas) yang final, nilai akhir, predikat, KKM, dan "belum tuntas" yang ditampilkan di mana pun berasal dari snapshot.

### 3.2 Kapan beku dibuat

| Pemicu | `origin` | Keterangan |
|---|---|---|
| Finalisasi kelas pertama pada semester itu | `finalize` | Dibuat di awal transaksi finalisasi, **sebelum** `loadClassContext`, sehingga dokumen yang dibekukan dihitung dari salinan yang sama dengan yang dipakai pembacaan berikutnya. |
| Semester dinonaktifkan (semester lain diaktifkan) dan sudah punya penilaian atau rapor | `semester_closed` | Di `PUT /v1/semesters/:id/activate`, untuk semester yang sebelumnya aktif. Menangani "sudah lewat tetapi belum final". Satu-satunya jalur yang mengubah `semester.is_active` adalah rute ini (terverifikasi: `routes/semesters.ts:253-254`; aktivasi tahun ajaran dan rollover tidak menyentuhnya). |
| Backfill data lama | `backfill` | Bagian 4. |
| Sinkron ulang manual atau tulis-tembus | `sync` | Menimpa baris. |
| Kunci manual (opsional, langkah L9) | `manual` | Sekolah mengunci semester aktif sejak awal agar draf tidak ikut bergeser. |

### 3.3 Aturan tulis konfigurasi hidup

Berlaku untuk `PUT /v1/grading/settings`, `POST/PUT/DELETE /v1/grading/components`, `POST /v1/grading/components/defaults`,
`POST/PUT/DELETE /v1/achievement-criteria`:

1. Ambil kunci penasihat transaksi per sekolah `grading-config:<school_id>` (finalisasi mengambil kunci yang sama; menutup M6).
2. **Guard tetap:** bila semester aktif punya rapor final, tolak `409 report_final` dengan pesan yang sama seperti sekarang.
   Endpoint yang hari ini tidak dijaga (`POST` komponen, `defaults`, `DELETE` komponen) **tetap tidak dijaga**: ketiganya tidak dapat
   mengubah angka yang ada (komponen baru belum punya penilaian; komponen hanya bisa dihapus bila tak dipakai penilaian; pada ketiga
   mode, komponen tanpa skor dilewati atau menyumbang 0, lihat `contracts/grading.ts:59-79`).
3. Tulis ke tabel hidup seperti sekarang.
4. **Aturan W (tulis-tembus):** bila semester aktif punya baris beku dan tidak punya rapor final (dan bukan `origin = manual`), baris
   beku semester aktif ditulis ulang dari konfigurasi hidup dalam transaksi yang sama, dicatat di audit. Semester nonaktif tidak pernah disentuh.

Mengapa guard dipertahankan padahal dengan pembekuan ia tidak lagi diperlukan untuk integritas: (a) kompatibilitas, semua tes dan
pesan yang ada tetap berlaku; (b) mencegah kebingungan "saya ubah KKM tetapi semester berjalan tidak berubah". Melonggarkannya
(mengizinkan menyiapkan konfigurasi semester depan saat semester aktif sudah final) adalah keputusan produk K2 di bagian 10.

Mengapa aturan W: pesan guard menyuruh "buka kembali rapornya lebih dulu". Tanpa W, setelah buka kembali semester aktif tetap beku,
perubahan diterima tetapi tidak berefek pada semester berjalan, dan itu jebakan. Dengan W, alur "buka kembali, ubah KKM, finalkan lagi"
pada semester aktif bekerja persis seperti hari ini.

Kelemahan W yang diketahui: bila semester lama yang beku (konfigurasi v1) diaktifkan kembali setelah konfigurasi hidup berubah (v2),
lalu admin mengubah satu kolom, semester itu melompat seluruhnya dari v1 ke v2+ubah. Mitigasi: `GET /v1/grading/settings` membawa
status semester aktif (`matchesLive`), layar pengaturan menampilkan peringatan sebelum menyimpan, respons `PUT` menyebut semester yang
ikut disinkronkan. Alternatif yang lebih ketat ada di keputusan K1.

### 3.4 Bagaimana rekomendasi menangani tiap kasus

| Kasus | Perilaku |
|---|---|
| Semester sudah lewat, belum final | Beku saat dinonaktifkan (`semester_closed`) atau lewat backfill. Draf berhenti bergeser. Finalisasi terlambat memakai konfigurasi saat semester ditutup. Bila sekolah memang ingin aturan terbaru, jalankan sinkron ulang (ditolak bila sudah ada final). Semester yang tanggalnya lewat tetapi masih ditandai aktif tetap mengikuti hidup: "aktif" berarti "sedang dikerjakan". |
| Buka kembali (reopen) | Baris beku **tidak** dihapus. Rapor kembali draf dan dihitung dari salinan beku, jadi hanya perubahan skor/absensi/catatan yang tampak. |
| Finalisasi ulang | Memakai salinan beku yang sama. Angka berubah hanya bila datanya diubah. Disarankan (L9): respons reopen menyertakan `changedSinceFinal`, jumlah siswa yang hitungan ulangnya berbeda dari snapshot yang dibuang, supaya perbedaan tidak pernah diam-diam. |
| Koreksi konfigurasi semester lama | Buka kembali semua kelas semester itu, `POST /v1/semesters/:id/grading-config/sync`, finalkan lagi. Eksplisit, teraudit, dan riwayat snapshot lama tetap ada di `report_card_snapshot`. |
| Transisi antar-semester | Ganjil selesai dan final (beku). Aktifkan Genap (belum beku, mengikuti hidup). Ubah bobot/KKTP/mode: lolos guard karena Genap belum punya final; hanya Genap yang terpengaruh. Menyiapkan konfigurasi Genap sebelum Genap diaktifkan tetap ditolak 409 selama Ganjil aktif dan final (sama seperti sekarang; lihat K2). |
| KKTP, rubrik, mode per semester | Seluruhnya ada di salinan: skalar (KKM sekolah, predikat A/B/C, mode) dan `criteria` (baris KKTP aktif tingkat mapel beserta levelnya). `resolveKkm` dijalankan atas salinan dengan tingkat dan jurusan kelas. Kriteria per TP (`objective_id`) belum dipakai penghitung, jadi belum disalin; fase 3 wajib memperluasnya (naikkan `config_version`). |
| Rapor draf | Kelas pada semester beku memakai salinan; pada semester belum beku memakai hidup. Jadi M4 kini terbatas pada semester aktif yang belum punya final, yang memang perilaku yang dimaksud. Untuk sekolah yang ingin lebih ketat: kunci manual (L9) dan dialog konfirmasi berisi jumlah kelas terdampak. |
| Kelas lintas semester | Konfigurasi dipecah per semester, bukan per kelas. Kelas yang sama bisa beku di Ganjil dan hidup di Genap; jenjang KKTP tetap memakai tingkat dan jurusan kelas itu. |
| Siswa pindah kelas | Jalur hidup tetap memakai kelas enrollment tahun itu; jalur final memakai `report_card.class_id` dan snapshot. |
| Ekspor Excel rekap | Dibuat di klien dari respons `GET /v1/grading/recap` (`recap-panel.tsx:55-76`), jadi otomatis memakai komponen dan bobot semester itu serta angka snapshot bila final. Tidak ada kode ekspor yang perlu diubah. |
| PDF rapor | Final: dari snapshot (sudah begitu). Draf: dari `loadClassContext` yang kini sadar semester. |
| Portal | `gradesFor`: bila rapor siswa pada semester itu final, `final`, `predicate`, `kkm`, `belowKkm`, dan rata-rata diambil dari snapshot; rincian komponen dihitung dengan salinan beku. Bila belum final: hitung dengan konfigurasi efektif semester. Daftar dan dokumen rapor portal sudah memakai snapshot. |
| Rekap mapel dan matriks kelas | Sama: tumpangkan angka snapshot untuk siswa yang rapornya final pada (semester, kelas) itu; sisanya dihitung dengan konfigurasi efektif. |
| Penilaian baru pada semester beku | `componentId` wajib ada di daftar komponen semester itu; bila tidak, `409 component_not_in_semester`. Tanpa ini, skor pada komponen yang dibuat setelah pembekuan akan diabaikan diam-diam oleh penghitung. Berlaku juga untuk dorong nilai ujian (`routes/exam-scores.ts:339-384`). |
| Semester dihapus | Baris beku ikut terhapus (CASCADE). Aman karena semester yang punya rapor atau penilaian tidak dapat dihapus (FK `report_card` dan `assessment` ke `semester` adalah NO ACTION; terverifikasi di DB dev). |
| Promosi dan rollover | Tidak membaca konfigurasi nilai (hanya memeriksa keberadaan rapor final, `routes/promotion.ts:831-837`). Tidak berubah. |

### 3.5 Performa

- Pemuat tunggal `loadGradingConfig(tx, semesterId)`: semester beku = **1 kueri** (menggantikan 4: pengaturan, komponen, kriteria,
  level); semester hidup = kueri yang sama seperti sekarang. Dipanggil sekali per permintaan lalu diteruskan ke `computeGrades`
  dan pemecah KKM. Tidak ada kueri per siswa atau per mapel.
- Tumpangan snapshot: 1 kueri `report_card` per (semester, kelas) yang memilih `snapshot -> 'subjects'` saja; portal 1 baris.
- Ukuran salinan: umumnya beberapa KB. Perkiraan terburuk (asumsi, tidak diukur): ratusan kriteria berlevel, sekitar 100 KB per
  semester; masih wajar dibaca sekali per permintaan. Bila kelak terbukti berat, pindahkan `criteria` ke tabel anak (A1) tanpa
  mengubah antarmuka pemuat.
- Finalisasi: tambahan 1 kunci penasihat dan paling banyak 1 `INSERT`.

### 3.6 Yang sengaja di luar cakupan

- `report_setting` (deskripsi predikat, penanda tangan, tampilan peringkat) tetap hidup untuk draf dan beku di snapshot saat final.
  Tes yang ada mengharapkan itu (`report-card.test.ts:834-843`). Ia tidak mengubah angka. Catatan: roadmap fase 1 menyebut
  "pengaturan rapor" sebagai jalur yang dijaga, tetapi `PUT /v1/report-cards/settings` tidak punya penjaga (terverifikasi); karena
  final dibaca dari snapshot, ini tidak berbahaya dan dibiarkan.
- Riwayat versi baris beku: yang tersimpan hanya versi terakhir plus log audit (ringkasan sebelum dan sesudah). Tabel riwayat bisa
  ditambah kelak bila diperlukan.
- Roster rekap (siswa aktif saat ini) tidak diubah.

---

## 4. Migrasi data dan kompatibilitas mundur

### 4.1 Mengapa backfill tidak boleh di berkas SQL migrasi

Semua tabel tenant memakai FORCE ROW LEVEL SECURITY, jadi pemilik tabel pun terkena policy dan tanpa `app.school_ids` tidak melihat
baris. Di DB dev pemilik `edusync` kebetulan superuser dan BYPASSRLS (terverifikasi), jadi `INSERT ... SELECT` di migrasi akan
"berhasil" di dev lalu **diam-diam tidak melakukan apa pun** di produksi bila pemiliknya bukan superuser (konfigurasi produksi tidak
saya verifikasi). Proyek sudah mencatat jebakan ini (komentar `packages/db/src/roles.ts:23-27` dan kepala migrasi 0088-0090).

### 4.2 Cara aman

1. Migrasi SQL `0094_semester_grading_config` hanya DDL (bagian 6).
2. Fungsi TypeScript di `packages/db/src/grading-freeze.ts`:
   - `freezeSemesterGradingConfig(ex, { schoolId, semesterId, origin, actorId, overwrite })`: membaca konfigurasi hidup dengan
     **filter `school_id` eksplisit di setiap kueri** (pemuat API yang ada mengandalkan RLS dan tidak memfilter `school_id`;
     memakainya pada koneksi BYPASSRLS akan mencampur sekolah). Fungsi ini juga dipakai jalur runtime supaya bentuk salinan satu sumber.
   - `backfillSemesterGradingConfigs(platformDb)`: untuk tiap sekolah, dalam transaksi sendiri, bekukan (`origin = backfill`,
     `ON CONFLICT DO NOTHING`) setiap semester yang (a) punya rapor final, atau (b) nonaktif, `ends_on` sudah lewat, dan punya
     penilaian. Semester aktif dan semester mendatang tidak disentuh. Mengembalikan jumlah baris dibuat.
3. `packages/db/src/migrate.ts` memanggilnya setelah `syncSystemRolePermissions`, lewat koneksi platform (`edusync_platform`,
   BYPASSRLS; terverifikasi di dev). Idempoten. Bila `DATABASE_PLATFORM_URL` kosong, cetak peringatan keras (sekarang dilewati diam-diam).
4. Skrip mandiri `pnpm --filter @edusync/db backfill:grading-config` untuk menjalankan ulang, dan skrip verifikasi baca-saja yang,
   untuk setiap rapor final, menghitung ulang dengan salinan beku dan membandingkan `final`, `predicate`, `kkm` dengan snapshot,
   lalu melaporkan jumlah selisih per sekolah, semester, kelas.

### 4.3 Batas kejujuran backfill

Konfigurasi saat rapor lama difinalkan **tidak tersimpan di mana pun**, jadi backfill menyalin konfigurasi hari ini. Akibatnya:

- Bila sekolah belum pernah mengubah konfigurasi sejak finalisasi: salinan tepat, laporan verifikasi nol selisih.
- Bila sudah berubah: salinan tidak sama dengan aturan saat terbit. Tidak ada regresi (portal dan rekap hari ini pun memakai
  konfigurasi hari ini), dan berkat C angka kelas final tetap dari snapshot. Dampak tersisa hanya saat buka kembali lalu finalisasi
  ulang; laporan verifikasi menunjukkan kelas mana yang berisiko, dan `changedSinceFinal` (L9) memperingatkan saat itu terjadi.
- DB dev: 4 rapor final (Genap 2025/26, KKM 75 di snapshot, konfigurasi hidup KKM 75, 4 komponen berjumlah 100, tanpa KKTP).
  Kemungkinan besar cocok, tetapi saya **tidak** menghitung ulang untuk membuktikannya.

### 4.4 Kompatibilitas API dan klien

- Tidak ada field yang dihapus atau berganti tipe. Field baru semuanya opsional: `source` pada rekap, matriks, dan nilai portal
  (**hanya dikirim bila bernilai `report`**, supaya respons jalur hidup identik byte demi byte), `activeSemesterConfig` pada
  `GET /v1/grading/settings`, `syncedSemesterId` pada respons tulis konfigurasi, parameter kueri opsional `semesterId` pada
  `GET /v1/achievement-criteria/resolve`.
- Kode galat lama tetap. Kode baru: `409 component_not_in_semester`, dan `409 grading_config_locked` (hanya bila L9 dikerjakan).
- Klien lama (web sebelum pembaruan, aplikasi lain) tetap berfungsi; mereka hanya tidak menampilkan label baru.
- Perubahan perilaku yang disengaja, wajib masuk CHANGELOG:
  1. semester nonaktif yang beku tidak lagi mengikuti konfigurasi hidup;
  2. portal, rekap, dan matriks untuk kelas final menampilkan angka rapor terbit;
  3. penilaian pada semester beku harus memakai komponen yang berlaku di semester itu;
  4. buka kembali tidak lagi berarti "hitung dengan aturan terbaru" untuk semester nonaktif.
- Rollback lewat tag: kode lama mengabaikan tabel baru (aditif). Bila kemudian maju lagi, perubahan konfigurasi yang dibuat selama
  jendela rollback tidak tertulis-tembus ke semester aktif yang beku; status `matchesLive` dan sinkron ulang menanganinya.
- `when` jurnal migrasi wajib manual dan lebih besar dari 0093 (`1796261400000`): pakai `1796347800000` untuk 0094 dan
  `1796434200000` untuk 0095 (catatan di kepala 0093).

---

## 5. Dampak per modul dan berkas yang berubah

| Modul | Dampak |
|---|---|
| Grading | Pemuat konfigurasi sadar semester; rute tulis memanggil kunci + guard + aturan W; validasi komponen pada penilaian; rekap dan matriks menumpangkan snapshot. Rumus tidak berubah. |
| Rapor | Finalisasi membuat beku lebih dulu; `loadClassContext` memuat konfigurasi efektif semester; reopen tidak menyentuh beku. Dokumen dan PDF tidak berubah bentuk (`schema_version` tetap 1). |
| Portal | `gradesFor` memakai snapshot bila final; selain itu konfigurasi efektif. |
| Rekap/Excel | Lewat respons API; tidak ada perubahan kode ekspor. |
| KKTP | Rute tulis memakai guard dan aturan W yang sama; `resolve` menerima `semesterId`; panel KKTP menampilkan status semester aktif. |
| Semester | Aktivasi membekukan semester yang ditinggalkan; dua endpoint baru di bawah `/v1/semesters/:id/grading-config`. |
| Promosi/rollover | Tidak ada perubahan kode. Tes promosi harus tetap hijau karena finalisasi kini menulis satu baris tambahan. |
| Ujian (dorong nilai) | Validasi komponen terhadap semester beku. |

Berkas (baru ditandai +):

- `packages/db/drizzle/0094_semester_grading_config.sql` +, `packages/db/drizzle/meta/_journal.json`
- `packages/db/src/schema.ts` (tabel baru), `packages/db/src/grading-freeze.ts` +, `packages/db/src/grading-freeze.test.ts` +,
  `packages/db/src/migrate.ts`, `packages/db/src/index.ts` (ekspor), `packages/db/package.json` (skrip backfill)
- `packages/contracts/src/grading-config.ts` + (tipe dan skema zod salinan), `packages/contracts/src/index.ts`, `packages/contracts/openapi.json` (hasil ekspor)
- `apps/api/src/grading-config-lib.ts` +, `apps/api/src/grading-lib.ts`, `apps/api/src/kktp-lib.ts`, `apps/api/src/report-card-lib.ts`,
  `apps/api/src/portal-lib.ts`, `apps/api/src/report-lock-lib.ts`
- `apps/api/src/routes/grading.ts`, `routes/report-card.ts`, `routes/achievement-criteria.ts`, `routes/semesters.ts`, `routes/exam-scores.ts`
  (`routes/portal.ts` hanya skema respons)
- Tes: `apps/api/src/grading-freeze.test.ts` +, `achievement-criteria.test.ts`, `report-card.test.ts`, `portal.test.ts`, `grading.test.ts`,
  `rbac-matrix.test.ts` (bila daftar rutenya eksplisit)
- Web: `apps/web/src/lib/api-types.ts` (hasil `gen:api`), `apps/web/src/app/(app)/grades/settings/settings-view.tsx`,
  `grades/recap-panel.tsx`, `portal/children/[studentId]/grades-tab.tsx`, `report-cards/report-cards-view.tsx`,
  `academic-years/semesters-panel.tsx`, `curriculum/kktp-panel.tsx`, `messages/{id,en,su}.json`, `docs/content-academic.ts`
- Dokumen: `CHANGELOG.md`, `docs/FITUR-EDUSYNC.md`, `Planning/11-academic-roadmap.md`

---

## 6. Skema, antarmuka, dan guard

### 6.1 Tabel

```sql
-- 0094_semester_grading_config.sql (hanya DDL; pengisian data lama lewat migrator TypeScript, lihat rancangan bagian 4)
CREATE TABLE "semester_grading_config" (
  "semester_id" uuid PRIMARY KEY NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "school"("id"),
  "kkm" integer NOT NULL,
  "predicate_a" integer NOT NULL,
  "predicate_b" integer NOT NULL,
  "predicate_c" integer NOT NULL,
  "calculation_mode" text NOT NULL,
  "components" jsonb NOT NULL,
  "criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "config_version" integer DEFAULT 1 NOT NULL,
  "origin" text NOT NULL,
  "frozen_by" text,
  "frozen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "semester_grading_config_school_semester_uq" UNIQUE ("school_id", "semester_id"),
  CONSTRAINT "semester_grading_config_semester_fk" FOREIGN KEY ("school_id", "semester_id")
    REFERENCES "semester"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "semester_grading_config_mode_ck"
    CHECK ("calculation_mode" IN ('weighted_average', 'percentage', 'simple_average')),
  CONSTRAINT "semester_grading_config_origin_ck"
    CHECK ("origin" IN ('finalize', 'semester_closed', 'sync', 'backfill', 'manual')),
  CONSTRAINT "semester_grading_config_components_ck" CHECK (jsonb_typeof("components") = 'array'),
  CONSTRAINT "semester_grading_config_criteria_ck" CHECK (jsonb_typeof("criteria") = 'array')
);
--> statement-breakpoint
ALTER TABLE semester_grading_config ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE semester_grading_config FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON semester_grading_config
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON semester_grading_config TO edusync_app;
```

Catatan desain:

- Kunci primer `semester_id` (satu baris per semester) sekaligus indeks pencarian; `UNIQUE (school_id, semester_id)` mengikuti
  konvensi kunci komposit. Induk `semester_school_id_uq` sudah ada sejak 0087. Tidak perlu indeks lain.
- FK ke semester CASCADE: lihat baris "Semester dihapus" di 3.4.
- **Sengaja tanpa CHECK rentang atau urutan** pada KKM dan predikat: tabel hidup tidak punya CHECK itu, dan baris hidup yang ganjil
  tidak boleh membuat finalisasi gagal karena salinannya ditolak. Validasi tetap di API saat konfigurasi hidup ditulis.
- `edusync_platform` mendapat hak lewat default privileges (terlihat di `pg_default_acl` dev); tambahkan GRANT eksplisit bila
  lingkungan lain tidak memilikinya.
- Tes `tenant-isolation` menemukan tabel ber-`school_id` secara otomatis (`tenant-isolation.test.ts:128-152`); tidak perlu didaftarkan manual.

Bentuk jsonb (`config_version = 1`), didefinisikan sekali di `packages/contracts/src/grading-config.ts` dan divalidasi zod saat dibaca:

```ts
export interface FrozenComponent { id: string; name: string; weight: number; sort: number }
/** KktpRow + mapelnya. Hanya baris aktif tanpa TP: `objectiveId` selalu null, `active` selalu true. */
export interface FrozenCriteria extends KktpRow { subjectId: string }
export interface FrozenGradingConfig {
  kkm: number; predicateA: number; predicateB: number; predicateC: number;
  calculationMode: CalculationMode;
  components: FrozenComponent[];   // SEMUA komponen sekolah saat dibekukan, urut sort lalu nama
  criteria: FrozenCriteria[];
}
```

### 6.2 Fungsi inti (`apps/api/src/grading-config-lib.ts`)

```ts
export interface EffectiveGradingConfig {
  semesterId: string;
  settings: GradingSettings;
  components: { id: string; name: string; weight: number; sort: number }[];
  /** null = semester mengikuti konfigurasi hidup. */
  frozen: { origin: FreezeOrigin; frozenAt: Date } | null;
  /** Pemecah KKM untuk satu kelas; dari salinan (tanpa kueri) atau dari tabel hidup (2 kueri, seperti sekarang). */
  kkmResolver(tx: Tx, p: { levelCode: string | null; programId: string | null; subjectIds: string[] }): Promise<KktpResolver>;
}
export function loadGradingConfig(tx: Tx, semesterId: string): Promise<EffectiveGradingConfig>;
export function ensureSemesterFrozen(tx: Tx, ctx: { schoolId: string; userId: string | null }, semesterId: string, origin: FreezeOrigin): Promise<void>;
export function lockGradingConfig(tx: Tx, schoolId: string): Promise<void>;          // pg_advisory_xact_lock
export function assertLiveGradingConfigEditable(tx: Tx, schoolId: string): Promise<void>; // kunci + 409 report_final
export function syncActiveSemesterFreeze(tx: Tx, ctx: TenantContext): Promise<string | null>; // aturan W; id semester atau null
export function assertComponentInSemester(tx: Tx, semesterId: string, componentId: string): Promise<void>;
export function finalSubjectRows(tx: Tx, semesterId: string, classId: string): Promise<Map<string, ReportDocument['subjects']>>; // studentId -> baris snapshot
```

`loadSettings`, `loadComponents`, `loadKktpRows` tetap ada sebagai pemuat konfigurasi **hidup** (dipakai layar pengaturan dan pembuat
salinan); pemanggil yang menghitung nilai sebuah semester wajib pindah ke `loadGradingConfig`. `computeGrades` tidak berubah tanda tangannya.

### 6.3 Endpoint

| Endpoint | Gerbang | Isi |
|---|---|---|
| `GET /v1/semesters/:id/grading-config` (baru) | `grade:read`, modul `grades` | Konfigurasi efektif semester dan statusnya: `frozen`, `origin`, `frozenAt`, `matchesLive`, `finalClassCount`. 404 bila semester bukan milik sekolah. |
| `POST /v1/semesters/:id/grading-config/sync` (baru) | `grade:configure`, modul `grades` | Menimpa salinan dengan konfigurasi hidup (membuatnya bila belum ada). `409 report_final` bila semester itu punya rapor final. Audit `grading_config.sync`. |
| `GET /v1/grading/settings` | tetap | + `activeSemesterConfig` opsional: `{ semesterId, frozen, origin, frozenAt, matchesLive, hasFinal }`. |
| `PUT /v1/grading/settings`, komponen, KKTP (tulis) | tetap | + `syncedSemesterId` opsional pada respons bila aturan W berjalan. Deskripsi OpenAPI diperbarui. |
| `GET /v1/grading/recap`, `/recap/class`, `GET /v1/portal/children/:id/grades` | tetap | + `source: 'report'` opsional bila angka berasal dari snapshot. |
| `GET /v1/achievement-criteria/resolve` | tetap | + kueri opsional `semesterId`: pecah terhadap konfigurasi efektif semester itu. |
| `POST /v1/assessments`, `PUT /v1/assessments/:id`, dorong nilai ujian | tetap | + `409 component_not_in_semester`. |
| `POST /v1/report-cards/finalize` | tetap | Membekukan semester lebih dulu; respons tidak berubah. |
| `PUT /v1/semesters/:id/activate` | tetap | Membekukan semester yang ditinggalkan; respons tidak berubah. |

### 6.4 Guard dan galat

| Kode | Status | Kapan | Pesan |
|---|---|---|---|
| `report_final` (ada) | 409 | Tulis konfigurasi hidup saat semester aktif punya rapor final. Tidak berubah. | "Pengaturan nilai tidak bisa diubah karena sudah ada rapor final pada semester aktif. Buka kembali rapor kelas tersebut lebih dulu." |
| `report_final` (ada, jalur baru) | 409 | Sinkron ulang pada semester yang punya rapor final. | "Konfigurasi nilai semester ini tidak bisa diganti karena masih ada rapor final: {kelas}. Buka kembali rapornya lebih dulu." |
| `component_not_in_semester` (baru) | 409 | Penilaian atau dorong nilai ujian memakai komponen yang tidak ada di konfigurasi beku semester itu. | "Komponen \"{nama}\" belum berlaku pada semester ini karena konfigurasi nilainya sudah dikunci. Pakai komponen yang berlaku, atau terapkan pengaturan terkini ke semester ini lebih dulu." |
| `grading_config_locked` (baru, hanya L9) | 409 | Tulis konfigurasi hidup saat semester aktif dikunci manual. | "Konfigurasi nilai semester aktif dikunci. Buka kuncinya di pengaturan nilai sebelum mengubah." |

`assertNoFinalInActiveSemesters` diganti `assertLiveGradingConfigEditable` (isi pemeriksaan sama, ditambah kunci penasihat). Guard
**tidak** diperluas ke semua semester (opsi D), karena I1 sudah menjamin semester berfinal tidak lagi membaca konfigurasi hidup.

---

## 7. Strategi uji

### 7.1 Skenario regresi wajib (suite baru `apps/api/src/grading-freeze.test.ts`, kecuali disebut lain)

1. **Hasil lama identik.** Sekolah tanpa baris beku: respons rekap, matriks, dokumen rapor draf, dan nilai portal sama persis dengan
   keluaran sebelum perubahan untuk ketiga mode dan keempat cakupan KKTP (perluas pola baseline di `achievement-criteria.test.ts:826-829`).
   Setelah L2 (sebelum ada pemicu beku), **seluruh suite yang ada harus hijau tanpa satu pun tes diubah**.
2. **Beku = hidup pada saat dibekukan.** Dokumen draf sesaat sebelum finalisasi sama dengan snapshot (kecuali `status`, `generatedAt`);
   sudah ada polanya di `report-card.test.ts:760-769`.
3. **Semester final kebal.** Setelah final, ubah `grading_setting`, bobot komponen, mode, dan KKTP **langsung di DB** (melewati guard,
   meniru bug atau skrip): rapor, daftar rapor, rekap, matriks, dan portal kelas final tidak berubah; kelas lain pada semester yang
   sama yang masih draf juga tidak berubah.
4. **Semester nonaktif berfinal.** Aktifkan semester baru, ubah konfigurasi lewat API (diterima): semester lama tidak berubah di semua
   permukaan; semester baru berubah. Ini skenario M1.
5. **Sudah lewat, belum final.** Semester dengan penilaian dinonaktifkan: baris `semester_closed` terbentuk; perubahan hidup tidak
   menggeser drafnya; finalisasi terlambat menghasilkan angka konfigurasi lama. Semester tanpa penilaian tidak dibekukan.
6. **Reopen dan finalisasi ulang.** Final, ubah hidup lewat DB, reopen, finalkan lagi tanpa mengubah skor: snapshot baru sama dengan
   yang lama (kecuali `generatedAt`). Ubah satu skor: hanya mapel dan siswa itu yang berubah.
7. **Reopen pada semester aktif lalu ubah konfigurasi (aturan W).** Diterima, salinan ikut berubah, draf mengikuti, `syncedSemesterId` terisi.
8. **Sinkron ulang.** Ditolak `report_final` selagi ada final; diterima setelah semua kelas dibuka; diaudit.
9. **Komponen di luar semester.** Komponen dibuat setelah pembekuan: penilaian pada semester beku ditolak `component_not_in_semester`;
   pada semester hidup diterima. Dorong nilai ujian sama.
10. **Komponen dihapus setelah beku.** Komponen tak terpakai dihapus: angka semester beku tidak berubah pada ketiga mode.
11. **KKTP per semester.** Kriteria per (tingkat, jurusan) dibekukan; kriteria hidup diubah dan dihapus; KKM dan `belowKkm` semester
    beku tetap; `resolve?semesterId=` mengembalikan nilai beku.
12. **Tumpangan snapshot.** Ubah tingkat kelas setelah final (mengubah jenjang KKTP): portal dan rekap tetap menampilkan angka snapshot, `source = report`.
13. **Kelas lintas semester.** Kelas yang sama: Ganjil beku, Genap hidup; angka masing-masing memakai konfigurasinya.
14. **Balapan.** Finalisasi dan `PUT /v1/grading/settings` bersamaan: salah satu menunggu; hasil akhirnya konsisten (settings ditolak
    409, atau finalisasi membekukan konfigurasi baru).
15. **Multi-tenant.** Sekolah B tidak dapat membaca atau menyinkronkan semester sekolah A (404); salinan sekolah A tidak pernah memuat
    komponen atau kriteria sekolah B, **termasuk lewat jalur backfill BYPASSRLS** (`packages/db/src/grading-freeze.test.ts`, meniru
    `roles-sync.test.ts`); baris beku tidak dapat ditulis dengan `school_id` sekolah lain (WITH CHECK) atau semester sekolah lain (FK komposit).
16. **Backfill.** Idempoten (jalan kedua = 0 baris); hanya semester berfinal atau lewat-berpenilaian; semester aktif tidak dibekukan.
17. **Performa.** Hitung kueri `loadClassContext` untuk semester beku (ambang tetap) agar N+1 tidak menyusup.

### 7.2 Tes yang harus diperbarui

| Berkas | Perubahan |
|---|---|
| `achievement-criteria.test.ts:873` | Kini mengharapkan rekap kelas final menampilkan KKM hidup 60. Harus menjadi 75 (snapshot). |
| `achievement-criteria.test.ts:875-876` | Kini mengharapkan kelas draf pada semester yang sama mengikuti KKM 60 yang disisipkan langsung ke DB. Dengan pembekuan per semester harus tetap 75. |
| `report-card.test.ts` blok "penjaga rapor final" (`:877-`) | Diperkirakan tetap hijau karena kode dan pesan guard tidak berubah. Tambah asersi bahwa finalisasi membuat baris beku dan reopen tidak menghapusnya. Bagian setelah baris 1004 belum saya baca. |
| `portal.test.ts`, `grading.test.ts` | Belum saya baca penuh. Bila ada asersi `toEqual` atas respons untuk kelas yang final, field `source` baru bisa mematahkannya. |
| `rbac-matrix.test.ts` | Dua endpoint baru wajib punya gerbang izin dan modul. |
| `promotion.test.ts`, `schedule.test.ts`, `pkl.test.ts` | Tidak diharapkan berubah; jalankan sebagai regresi. |

---

## 8. Risiko, mitigasi, dan rencana rilis bertahap

### 8.1 Risiko

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Satu pemanggil lupa pindah ke `loadGradingConfig` | Permukaan itu tetap membaca hidup | L2 memindahkan semua pemanggil (daftar terverifikasi: `report-card-lib.ts:159-177`, `portal-lib.ts:338-354`, `routes/grading.ts:928-942` dan `:1039-1049`); tambahkan tes yang gagal bila `loadSettings` dipakai di luar daftar putih. |
| Backfill terlewat (URL platform kosong) | Semester lama berfinal tetap mengikuti hidup | Peringatan keras di migrator; skrip mandiri; C tetap melindungi angka kelas final. |
| Backfill tidak sama dengan aturan saat terbit | Finalisasi ulang rapor lama bisa berubah | Laporan verifikasi; `changedSinceFinal` saat reopen; didokumentasikan. |
| Aturan W melompatkan konfigurasi semester lama yang diaktifkan ulang | Draf semester itu berubah lebih banyak dari yang diedit | Peringatan `matchesLive = false` di layar; keputusan K1. |
| Pengguna bingung: "ubah KKM, semester lalu tidak berubah" | Tiket dukungan | Lencana "konfigurasi dikunci" di rekap dan rapor; halaman bantuan; tombol sinkron ulang dengan penjelasan. |
| Bentuk jsonb berubah di fase 3 (KKTP per TP, remedial) | Salinan lama tak terbaca | `config_version` + pembaca per versi; salinan lama tidak pernah dimigrasi. |
| `component_not_in_semester` menolak alur yang dulu diterima | Guru tak bisa memakai komponen baru di semester beku | Pesan menjelaskan jalan keluar; hanya mungkin pada semester beku. |
| Kunci penasihat per sekolah menambah antrean | Finalisasi beberapa kelas bersamaan jadi berurutan | Kunci hanya selama transaksi; finalisasi satu kelas singkat. |
| Semester aktif tidak konsisten dengan tahun ajaran aktif (aktivasi tahun tidak menyentuh semester; terverifikasi `routes/academic-years.ts:105-135`) | Semester lama bisa tetap "aktif" setelah tahun baru diaktifkan | Di luar cakupan; pembekuan tetap benar (aktif = hidup). Catat sebagai temuan terpisah. |

### 8.2 Langkah kecil untuk agen `developer`

Tiap langkah berdiri sendiri, meninggalkan cabang hijau, dan dapat ditinjau terpisah.

| # | Langkah | Selesai bila |
|---|---|---|
| L0 | Jalankan sembilan suite wajib dan catat hasilnya sebagai garis dasar. | Daftar hijau/merah tersimpan di deskripsi PR. |
| L1 | Migrasi 0094 (DDL saja, `when` manual), tabel di `schema.ts`, tipe dan zod di `contracts/grading-config.ts`, `freezeSemesterGradingConfig` di `packages/db` beserta tes unit (bentuk salinan, filter `school_id`, `overwrite`). Belum dipakai runtime. | Migrasi naik di DB bersih dan DB dev; `tenant-isolation` hijau; tes baru hijau. |
| L2 | `grading-config-lib.ts` dengan `loadGradingConfig`; pindahkan empat pemanggil. Belum ada yang membuat baris beku. | **Semua suite hijau tanpa mengubah satu tes pun**; skenario 1 dan 17 lulus. |
| L3 | Beku saat finalisasi; kunci penasihat; `assertLiveGradingConfigEditable` menggantikan guard lama; aturan W; `assertComponentInSemester` di penilaian dan dorong nilai ujian. Perbarui `achievement-criteria.test.ts:873-876`. | Skenario 2, 3, 6, 7, 9, 10, 11, 13, 14 lulus. |
| L4 | Beku saat semester dinonaktifkan (`routes/semesters.ts`). | Skenario 4 dan 5 lulus. |
| L5 | Tumpangan snapshot di `gradesFor`, rekap, dan matriks; field `source`. | Skenario 12 lulus; `portal` dan `grading` hijau. |
| L6 | Endpoint `GET` dan `POST .../sync`; `activeSemesterConfig`; `syncedSemesterId`; `resolve?semesterId`; ekspor OpenAPI (`openapi:export`) dan `gen:api`. | Skenario 8 dan 15 (bagian API) lulus; `rbac-matrix` hijau; `openapi.json` dan `api-types.ts` terbarui. |
| L7 | Backfill di `migrate.ts`, skrip mandiri, skrip verifikasi baca-saja, tes backfill. | Skenario 15 (jalur BYPASSRLS) dan 16 lulus; di DB dev terbentuk tepat satu baris (Genap 2025/26) dan laporan verifikasi dilampirkan. |
| L8 | Web: status dan peringatan di pengaturan nilai dan panel KKTP, lencana di rekap, rapor, dan portal, tombol sinkron di panel semester; id/en/su; halaman bantuan; CHANGELOG; FITUR. | Diuji pada 375 px, 768 px, mode gelap, tiga bahasa (standar tampilan roadmap). |
| L9 (opsional) | Kunci manual (`origin = manual`, `grading_config_locked`); `changedSinceFinal` pada reopen; dialog konfirmasi berisi jumlah kelas terdampak. | Tes tambahan lulus; keputusan K1-K3 terjawab. |
| L10 | Temuan terkait di bagian 9 yang disetujui "kerjakan sekarang". | Lihat bagian 9. |

Urutan rilis: L1-L8 dalam satu rilis MINOR yang sama dengan 2A-2C yang belum dirilis (lebih baik daripada merilis KKTP dan tiga mode
tanpa pembekuan, karena keduanya memperbesar M2 dan M3). Jalankan skrip verifikasi di staging dengan salinan data produksi sebelum
tag. Rollback: deploy tag lama; tabel baru dibiarkan.

---

## 9. Temuan integritas lain yang ditunda

| Temuan | Fakta (terverifikasi) | Saran |
|---|---|---|
| `report_card_snapshot` ter-CASCADE saat kelas, siswa, atau semester dihapus (0087) | Tiga FK komposit `ON DELETE CASCADE` (DB dev: `confdeltype = c`). Jangkauan nyata sempit: siswa hanya dihapus lunak (`routes/people.ts:703`); semester dan kelas tertahan FK `report_card` yang NO ACTION selama baris rapor ada. Celah tersisa: `report_card.class_id` ditimpa saat catatan disimpan atau kelas difinalkan ulang setelah siswa pindah (`routes/report-card.ts:412, 516`), sehingga riwayat snapshot bisa menunjuk kelas lama yang tidak lagi ditahan apa pun, lalu ikut terhapus bersama kelas itu. | **Kerjakan sekarang** (L10), murah dan searah dengan 0093: migrasi 0095 mengganti ketiga FK menjadi `ON DELETE NO ACTION`. Menurut komentar 0093, 23503 sudah dipetakan ke `409 in_use` (pemetaannya tidak saya verifikasi). Arsip rapor terbit tidak boleh hilang sebagai efek samping. |
| Guru boleh menulis CP/TP berdasarkan penugasan tahun mana pun | `assertCanWrite` (`routes/teaching-plan.ts:56-73`) menerima penugasan apa pun pada mapel itu tanpa melihat tahun ajaran kelasnya; guru yang mengampu tahun lalu tetap bisa menulis. | **Tunda ke awal fase 3**, sebelum TP memengaruhi narasi rapor. Saat ini CP/TP tidak masuk hitungan nilai. Perbaikannya kecil: gabungkan `class_room` dan batasi ke tahun ajaran aktif (untuk ATP: tahun ATP itu). Putuskan dulu apakah "aktif" mengikuti tahun ajaran atau semester, karena keduanya bisa tidak selaras (lihat risiko terakhir 8.1). |
| `requireModule` pada achievement-criteria | Kelima rute hanya memakai `requirePermission`; tidak ada `requireModule` (`routes/achievement-criteria.ts:280, 317, 380, 429, 480`), padahal KKTP mengubah hasil modul `grades`. | **Kerjakan sekarang** (L10): 2B belum dirilis, jadi belum ada sekolah yang bergantung pada perilaku ini. Tambahkan `requireModule('grades')` pada POST, PUT, DELETE, dan `resolve`; biarkan GET daftar dengan `subject:read` agar halaman Kurikulum tetap dapat menampilkannya baca-saja. Endpoint baru di rancangan ini sudah memakai gerbang modul. Perbarui `rbac-matrix`. |
| Perluasan izin rollover | Keempat rute promosi dan rollover memakai satu izin `promotion:manage` (`routes/promotion.ts:945, 1033, 1220, 1261`). Saya mengasumsikan temuan ini berarti memisahkan penetapan oleh wali kelas dari pengesahan (regulasi-umum.md 2A: "izin penetapan oleh wali kelas vs pengesahan kepala sekolah"). | **Tunda** (bukan integritas nilai; butuh keputusan produk). Saat dikerjakan: izin baru `promotion:propose` (wali kelas, hanya kelasnya, hanya mengisi usulan) terpisah dari `promotion:manage` (pengesahan, penerapan, rollover); sampaikan ke sekolah lama lewat `syncSystemRolePermissions`; jangan melebarkan `promotion:manage` itu sendiri. |

---

## 10. Asumsi, ketidakpastian, dan keputusan yang menunggu

Yang **tidak** saya verifikasi:

- Suite tes tidak saya jalankan. Daftar tes yang perlu diubah (7.2) berasal dari membaca sebagian berkas; `portal.test.ts`,
  `grading.test.ts`, dan `report-card.test.ts` setelah baris 1004 belum dibaca penuh.
- Hak peran pemilik DB di produksi (alasan utama backfill lewat koneksi platform). Di dev pemilik adalah superuser.
- Kecocokan 4 rapor final di DB dev dengan hitungan ulang (tidak dihitung).
- Pemetaan 23503 ke `409 in_use` di handler API (hanya dari komentar 0093).
- Ukuran terburuk kolom `criteria` (perkiraan, bukan pengukuran).
- Alur dorong nilai ujian dan berkas web hanya dibaca sekilas; daftar berkas web di bagian 5 adalah perkiraan terbaik.
- Makna persis "perluasan izin rollover" (lihat bagian 9).
- Apakah ada sekolah produksi yang sudah mengubah konfigurasi setelah memfinalkan rapor; skrip verifikasi L7 yang akan menjawabnya.

Keputusan produk yang perlu dijawab (usulan bawaan dicetak miring):

- **K1.** Semester lama yang beku diaktifkan kembali lalu konfigurasi hidup diubah: *tulis-tembus dengan peringatan (aturan W)*,
  atau tolak `409` sampai admin memilih "terapkan pengaturan terkini" secara eksplisit.
- **K2.** Guard semester aktif: *pertahankan seperti sekarang*, atau longgarkan agar konfigurasi semester depan bisa disiapkan saat
  semester aktif sudah final (aman secara integritas setelah pembekuan, tetapi mengubah perilaku dan tes).
- **K3.** Kunci manual semester aktif dan dialog konfirmasi dampak (L9): *tunda sampai ada permintaan sekolah*.
- **K4.** Backfill semester lewat yang belum punya rapor final: *ya, bekukan* (menghentikan pergeseran draf lama), atau hanya semester berfinal.
- **K5.** Rilis bersama 2A-2C: *ya*.
