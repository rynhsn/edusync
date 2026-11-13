# Riwayat versi

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/) dan penomoran [SemVer](https://semver.org/lang/id/):
`MAJOR.MINOR.PATCH`. Naik PATCH untuk perbaikan, MINOR untuk fitur baru yang tetap kompatibel, MAJOR untuk perubahan yang
memutus kompatibilitas. Produksi hanya berubah saat tag `vX.Y.Z` dikirim; tulis bagian versinya di sini lebih dulu.

Cara merilis: tulis bagian baru di bawah "Belum dirilis" lalu ganti judulnya menjadi `## [x.y.z] - tanggal`, kemudian
`pnpm release x.y.z` dan `git push edusync HEAD:main vx.y.z`.

## Belum dirilis

## [1.2.3] - 2026-11-13

Persiapan internal fase 3 (asesmen dan rapor). Tidak ada perubahan perilaku bagi sekolah: nilai, predikat, rekap, rapor, dan
portal sama persis dengan v1.2.2.

### Diubah

- **Skema dokumen rapor kini satu tempat** (`packages/contracts`), dipakai bersama oleh rute rapor staf, rute portal, dan
  pembuat dokumen, tidak lagi diduplikasi di dua rute. Bentuk respons tidak berubah; deskripsi bidang pada dokumen portal di
  dokumentasi API kini sama dengan rute rapor staf.
- **Pembaca salinan beku konfigurasi nilai mengenal `config_version` 1 dan 2.** Kunci yang tidak ada ditafsirkan sebagai nilai
  bawaan (sumatif, tanpa kriteria per TP, rata-rata, hanya dicatat). Salinan yang ditulis tetap berversi 1 dan isinya tidak
  berubah. Tidak ada tabel, kolom, atau migrasi baru.
- **Tes garis dasar** untuk tiga mode nilai dan empat cakupan KKTP (rekap, matriks, rapor draf dan final, daftar rapor, nilai
  portal, snapshot, salinan beku) dan tes yang membuktikan bahwa respons API membuang kunci dokumen rapor yang tidak
  dideklarasikan di skema, sebagai jaring pengaman tahap berikutnya.

## [1.2.2] - 2026-11-13

Dua pengetatan hak akses hasil audit.

### Diubah

- **Guru hanya bisa menyusun CP, TP, dan ATP untuk tahun ajaran yang berjalan atau akan datang.** Sebelumnya guru yang pernah
  mengampu sebuah mata pelajaran di tahun ajaran mana pun, termasuk yang sudah lama berakhir, masih boleh mengubah perangkat
  ajar mata pelajaran itu. Kini guru harus punya penugasan pada mata pelajaran itu di kelas yang tahun ajarannya belum
  berakhir (tahun ajaran baru hasil salin tahun ajaran juga dihitung). Untuk ATP, penugasannya harus di kelas tahun ajaran ATP
  itu. Pemegang izin kelola kurikulum tetap boleh untuk semua mata pelajaran. Bila ditolak, pesannya menjelaskan hal ini.
- **Salin tahun ajaran kini mengikuti izin tiap bagian.** Selain izin kenaikan kelas, menyalin kelas, wali kelas, dan penugasan
  guru butuh izin kelola kelas; kalender butuh izin kelola tahun ajaran; alokasi dan versi kurikulum butuh izin kelola
  kurikulum; dan ATP butuh izin menyusun perangkat ajar. Bagian yang tidak diizinkan dilewati dengan peringatan (bukan ditolak),
  dan di halaman Kenaikan kelas kotak centangnya mati disertai keterangan izin yang dibutuhkan. Admin dan peran Kurikulum
  bawaan tidak terpengaruh.
- Di halaman **Peran dan izin**, izin kenaikan kelas dan kelola kurikulum kini berlencana "Berdampak besar" beserta
  keterangan apa yang bisa diubahnya, agar tidak diberikan sembarangan.

## [1.2.1] - 2026-11-13

Perbaikan setelah v1.2.0.

### Diperbaiki

- **Status WhatsApp sekolah bisa salah** bila dua peristiwa klien datang berdekatan (mis. "siap" menimpa "terputus"): penulisan
  status ke `wa_account` kini berurutan per sekolah. Tes worker yang kadang gagal di CI karena hal ini ikut diperbaiki.
- **Lembar nilai ujian dan penilaian ekskul tahun lampau** kini memuat siswa yang sudah lulus (baca-saja, berlencana "Lulus",
  tidak ikut tersimpan), sejalan dengan rapor dan rekap. Tambah anggota, absensi sesi, dan penilaian tetap hanya siswa aktif.
- **Tampilan ponsel**: detail ekstrakurikuler (kartu ringkasan lebih ringkas, tab 2x2, tabel sesi, anggota, penilaian, dan
  laporan menjadi kartu, lembar absensi dengan tombol 44 px), tab penempatan PKL, dan tab Laporan keuangan tidak lagi terpotong
  atau melebar di layar sempit. Tampilan desktop tidak berubah.
- Tes billing dan katalog tidak lagi bergantung pada harga katalog di database (yang bisa diubah operator di konsol platform).

## [1.2.0] - 2026-11-13

### Ditambahkan

- **Kenaikan kelas dan rollover tahun ajaran** (fase 2A): halaman **Kenaikan kelas** (`/promotion`) dengan empat langkah. Salin
  kelas, wali kelas, penugasan guru, dan kalender ke tahun ajaran baru (ada pratinjau, aman dijalankan ulang); tentukan
  naik/tinggal/lulus per siswa; lalu terapkan. Data tahun lama, termasuk rapor final, tidak diubah. Izin baru
  `promotion:manage` (admin dan kurikulum), tabel `promotion_decision` (migrasi 0088), dan empat endpoint di tag Academic.
  Nama kelas yang tidak diawali kode tingkat (mis. "VII A") tidak dinaikkan otomatis; namanya tetap dan muncul sebagai peringatan.
- **Struktur mapel dan kurikulum** (fase 2B): halaman **Kurikulum** (`/curriculum`) dengan tab Struktur mapel (JP mingguan dan
  tahunan per tahun ajaran, tingkat, dan program), Versi kurikulum, Adopsi dari acuan, dan KKTP. Mapel kini punya kelompok,
  muatan lokal, urutan, status aktif, dan asal acuan (`ref_subject_id`), sehingga mapel yang diganti nama tidak muncul lagi
  sebagai "baru" saat acuan diperbarui. Izin baru `curriculum:manage`. Migrasi 0089.
- **Perangkat ajar** (fase 2B): halaman **Perangkat ajar saya** (`/teaching-plan`) untuk CP, TP, dan ATP berversi milik sekolah.
  Mengubah CP/TP yang sudah dipakai ATP terbit membuat versi baru; ATP terbit terkunci dan diubah lewat versi baru. Guru hanya
  menulis untuk mapel yang diampu. Izin baru `teaching_plan:write`. Migrasi 0090. Isi CP/TP tidak disediakan; sekolah menulis sendiri.
- **KKTP** (fase 2B): KKM bisa ditetapkan per mapel, tingkat, dan program dengan empat mode (angka desimal, rentang, deskriptor,
  rubrik). Urutan: mapel+tingkat+program, mapel+tingkat, mapel+program, mapel, lalu KKM sekolah. Tanpa kriteria hasil sama persis
  seperti sebelumnya; rapor final yang sudah dibekukan tidak berubah. Mengubah kriteria ditolak (409 `report_final`) selama ada
  rapor final di semester aktif. Rekap nilai, rapor, dan portal memakai KKM per mapel. Migrasi 0091.
- Rollover tahun ajaran kini juga menyalin struktur kurikulum (`copyCurriculum`) dan ATP terbit sebagai draf (`copyTeachingPlans`).

### Ditambahkan (integritas nilai antar-semester)

- **Aturan nilai tersimpan per semester**: bobot komponen, KKM, predikat, mode nilai akhir, dan kriteria ketercapaian dibekukan per
  semester (saat rapor kelas pertama difinalkan atau saat semester ditinggalkan), sehingga mengubah aturan nilai tidak lagi
  menggeser angka semester yang rapornya sudah terbit. Rekap dan portal wali untuk kelas yang rapornya final menampilkan angka
  rapor terbit ("Sesuai rapor"). Pengaturan nilai memiliki kartu status per semester dan tombol "Samakan dengan aturan hari ini"
  (ditolak selama ada rapor final). Perubahan aturan pada semester aktif yang sudah beku dan belum final ikut diterapkan ke
  salinan bekunya. Data lama dibekukan otomatis saat migrasi (`pnpm --filter @edusync/db backfill:grading-config`; skrip
  verifikasi baca-saja `verify:grading-config`). Migrasi 0094. Komponen yang dibuat sesudah pembekuan ditolak
  (409 `component_not_in_semester`) sampai konfigurasi disinkronkan.
- **Siswa yang sudah ditetapkan lulus tetap tampil di rapor, rekap, dan matriks kelas tahun terakhirnya** (selama punya
  enrollment di tahun kelas itu), dan rapornya dapat difinalkan sebelum atau sesudah kelulusan ditetapkan. Absensi, gerbang,
  kartu, dan jalur operasional lain tetap hanya memuat siswa aktif.
- Arsip rapor final tidak lagi ikut terhapus saat kelas, siswa, atau semesternya dihapus; penghapusan ditolak (409 `in_use`).
  Migrasi 0095.
- Pengaturan KKTP kini mensyaratkan modul Nilai dan rapor.

### Diubah (koreksi hasil verifikasi regulasi, fase 2C)

- **Kelompok mapel dari acuan**: batasan nilai tetap pada `subject_group` diganti tabel acuan `ref_subject_group` (label tiga bahasa,
  berlaku per jenjang); kunci lama tetap sah. Mapel kini punya jenis (wajib, pilihan, muatan lokal, projek, PKL) dan varian agama.
  Daftar kelompok adalah acuan awal yang masih harus dicocokkan dengan lampiran struktur kurikulum. Migrasi 0092.
- **JP dua kolom**: alokasi mapel memisahkan JP intrakurikuler dan kokurikuler serta jumlah minggu (untuk PKL); tiap tingkat kelas dapat
  menyimpan menit per JP dan minggu efektif (angka 35/40/45 menit dan 36 minggu hanya muncul sebagai saran).
- **Tingkat akhir per program**: program punya lama studi (3 atau 4 tahun) dan tingkat akhir sendiri (mis. XII atau XIII untuk SMK).
- **Kenaikan kelas**: di tingkat akhir tidak ada keputusan bawaan; "ditetapkan lulus" harus dipilih eksplisit karena kelulusan ditetapkan
  sekolah setelah ujian satuan pendidikan. Keputusan dapat memuat alasan, tindak lanjut, dan tanggal musyawarah.
- **Mode nilai akhir**: tiga pilihan (pembobotan, persentase, rata-rata); bawaan tetap pembobotan sehingga hasil lama tidak berubah.
- **Rollover**: kalender tidak lagi disalin secara bawaan (tanggal perlu diperiksa); peringatan dan alasan siswa yang belum
  ditempatkan memiliki kode stabil dan diterjemahkan di antarmuka.
- **Perbaikan hasil review**: mode nilai persentase ditolak bila jumlah bobot komponen bukan 100; tingkat akhir program divalidasi
  dan tingkat yang masih dipakai tidak bisa dihapus; siswa yang kelas tujuannya tidak ada kini masuk daftar "belum ditempatkan"
  (tidak lagi dimasukkan ke kelas pertama); keputusan lulus divalidasi ulang dan pratinjau memperingatkan rapor yang belum final;
  catatan keputusan tidak lagi terhapus saat tidak dikirim; penerapan kenaikan diserialkan per tahun ajaran sumber; menghapus
  program, mapel, atau kelas yang masih dirujuk alokasi atau keputusan ditolak (migrasi 0093); ATP tidak bisa diterbitkan bila
  memuat tujuan nonaktif.
- **Tampilan**: target sentuh 44 px di ponsel, dialog dengan tombol aksi yang selalu terjangkau, tabel menjadi kartu di layar sempit,
  dan beberapa halaman yang melebar di ponsel diperbaiki. Label "KKM" dan "KKTP" dieja lengkap.

## [1.1.2] - 2026-11-11

### Ditambahkan

- **Versi tampil di antarmuka**: nomor versi ("Versi 1.1.2") di dasar menu samping panel sekolah dan konsol platform; arahkan
  kursor untuk melihat kode commit. Sumbernya `GET /v1/version` (publik, sama dengan `/version` untuk operasional).

## [1.1.1] - 2026-11-11

Perbaikan setelah v1.1.0 dipasang di server.

### Diperbaiki

- **Port API di server**: port 4000 ternyata dipakai aplikasi lain di server yang sama (`edusync.service` milik aplikasi Node
  lain), sehingga API gagal start (`EADDRINUSE`) setelah deploy v1.1.0. API kini memakai port 4100 (`API_PORT` di `.env`
  server); templat Caddy (`tls-ask`), `init-env.sh`, dan pengecekan versi di workflow Deploy membaca port itu, tidak lagi
  mengunci 4000.
- **Izin peran bawaan tidak sampai ke sekolah yang sudah ada**: migrasi yang membaca tabel `role` (ber-RLS) berjalan sebagai
  pemilik tabel dan melihat nol baris, sehingga `INSERT ... SELECT` untuk izin baru (`account:reset` di migrasi 0079 dan
  `report_card:read_all`/`grade:read_all` di migrasi 0087) tidak menambah apa pun di server. `pnpm db:migrate` kini
  melengkapi izin peran bawaan lewat koneksi platform setelah migrasi (hanya menambah, aman diulang).
- Langkah "Cek versi" di workflow Deploy mencoba ulang sampai API siap, sehingga catatan rilis GitHub tidak terlewat.

## [1.1.0] - 2026-11-11

Jenjang unit (Fase 0) dan integritas rapor, arsip, serta jadwal per semester (Fase 1).

### Ditambahkan

- **Jenjang unit**: satu unit sekolah punya satu jenjang (SD, MI, SMP, MTs, SMA, MA, SMK, MAK). Jenjang wajib dipilih saat
  mendaftarkan lembaga dan saat menambah unit, dan menentukan tingkat kelas bawaan beserta fasenya (A sampai F).
  Staf platform dapat mengisi jenjang sekolah lama dan mengganti jenjang selama unit belum punya tahun ajaran. Daftar profil
  ada di `GET /v1/education-profiles`; jenjang unit ikut di `GET /v1/me` dan identitas sekolah.
- Menu PKL hanya tampil di jenjang kejuruan (SMK, MAK); sekolah yang belum punya jenjang tetap melihatnya.
- Pengaturan sekolah: tingkat kelas bawaan diisi sesuai jenjang unit (tanpa memilih jenjang manual).
- Penugasan guru: untuk SD/MI, tombol "tetapkan ke semua mapel kosong" menugaskan satu guru kelas ke seluruh mapel yang belum
  punya pengampu tanpa menimpa guru khusus.

- **Rapor final terkunci** (`409 report_final`): setelah rapor kelas difinalkan, perubahan skor dan penilaian, nilai ujian yang
  dikirim ke buku nilai (juga lembar jawaban yang sudah terkirim), jawaban dan pengumpulan CBT siswa, penilaian ekskul,
  koreksi absensi harian pada semester itu, serta pengaturan nilai (KKM, predikat, bobot) selama semester aktif punya rapor
  final, ditolak sampai rapor dibuka kembali. Wali kelas dan guru pengampu tidak bisa diganti bila semua semester tahun ajaran
  kelas itu sudah final. Pengaturan rapor (nama kepala sekolah, deskripsi) dan pindah kelas siswa sengaja tidak dikunci.
- **Riwayat snapshot rapor** (`report_card_snapshot`): tiap finalisasi dan buka kembali tercatat per siswa dengan nomor versi;
  snapshot yang pernah difinalkan tidak lagi hilang saat rapor dibuka kembali. Rapor menyimpan `schema_version` dan
  `template_key` untuk bentuk dokumen di masa depan.
- **Jadwal per semester**: `semesterId` opsional pada `GET /v1/schedule` dan `PUT`/`DELETE /v1/schedule/cell`. Kosong = setahun
  penuh (perilaku lama); terisi = khusus semester itu, sehingga jadwal Ganjil dan Genap boleh berbeda. Sel tahunan dan sel
  semester tidak boleh bertumpuk di slot kelas yang sama (`409 schedule_scope_conflict`); bentrok guru dicek lintas
  cakupan. Absensi jam pelajaran, jam berjalan, dan laporan hanya membaca sel yang berlaku pada tanggalnya. Layar Jadwal
  mendapat pemilih cakupan.
- **Riwayat penugasan**: penetapan, penggantian, dan pelepasan guru pengampu (`teaching_assignment_history`) serta pergantian
  wali kelas (`homeroom_assignment_history`) tercatat otomatis.
- Izin baru `report_card:read_all` dan `grade:read_all` (admin sekolah, kepala sekolah, kurikulum) menggantikan pencocokan
  nama peran `principal`/`curriculum` di rapor dan nilai; peran sistem di sekolah yang sudah ada diperbarui oleh migrasi.

### Perubahan

- Sekolah lama diisi jenjangnya dari kurikulum yang sudah diadopsi bila tepat satu kelompok jenjang; sisanya kosong sampai
  diisi staf platform.
- `POST /v1/registrations` dan penambahan unit baru mensyaratkan `educationProfile`.

## [1.0.0] - 2026-11-10

Rilis produksi pertama.

### Ditambahkan

- Platform multi-tenant: lembaga, unit sekolah, peran per sekolah, undangan, dan pindah sekolah/lembaga dari satu akun.
- Akademik, absensi (kiosk, kartu QR/barcode, absen manual cadangan), nilai, rapor, ujian, tahfidz, ibadah, PKL/prakerin.
- Keuangan: tagihan, jenis biaya per semester, penetapan biaya ke kelas atau siswa tertentu, tagihan otomatis, pembayaran
  daring (Midtrans per sekolah).
- Data siswa, guru, dan wali lengkap (NIK, NPSN, NUPTK), impor, kartu siswa dan kartu ujian dengan desain yang dapat diatur.
- Login dengan email atau NIK, pemulihan kata sandi lewat OTP, tiket bantuan dari sekolah ke admin platform.
- Pengaturan situs platform (ikon, gambar, konten), layar sekolah ditangguhkan, logo dan ikon bawaan Edusync.
- Dokumentasi API di `/docs` dan halaman bantuan dalam bahasa Indonesia, Inggris, dan Sunda.
