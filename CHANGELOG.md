# Riwayat versi

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/) dan penomoran [SemVer](https://semver.org/lang/id/):
`MAJOR.MINOR.PATCH`. Naik PATCH untuk perbaikan, MINOR untuk fitur baru yang tetap kompatibel, MAJOR untuk perubahan yang
memutus kompatibilitas. Produksi hanya berubah saat tag `vX.Y.Z` dikirim; tulis bagian versinya di sini lebih dulu.

Cara merilis: tulis bagian baru di bawah "Belum dirilis" lalu ganti judulnya menjadi `## [x.y.z] - tanggal`, kemudian
`pnpm release x.y.z` dan `git push edusync HEAD:main vx.y.z`.

## Belum dirilis

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
