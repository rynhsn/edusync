# Riwayat versi

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/) dan penomoran [SemVer](https://semver.org/lang/id/):
`MAJOR.MINOR.PATCH`. Naik PATCH untuk perbaikan, MINOR untuk fitur baru yang tetap kompatibel, MAJOR untuk perubahan yang
memutus kompatibilitas. Produksi hanya berubah saat tag `vX.Y.Z` dikirim; tulis bagian versinya di sini lebih dulu.

Cara merilis: tulis bagian baru di bawah "Belum dirilis" lalu ganti judulnya menjadi `## [x.y.z] - tanggal`, kemudian
`pnpm release x.y.z` dan `git push edusync HEAD:main vx.y.z`.

## Belum dirilis

### Ditambahkan

- **Jenjang unit**: satu unit sekolah punya satu jenjang (SD, MI, SMP, MTs, SMA, MA, SMK, MAK). Jenjang wajib dipilih saat
  mendaftarkan lembaga dan saat menambah unit, dan menentukan tingkat kelas bawaan beserta fasenya (A sampai F).
  Staf platform dapat mengisi jenjang sekolah lama dan mengganti jenjang selama unit belum punya tahun ajaran. Daftar profil
  ada di `GET /v1/education-profiles`; jenjang unit ikut di `GET /v1/me` dan identitas sekolah.
- Menu PKL hanya tampil di jenjang kejuruan (SMK, MAK); sekolah yang belum punya jenjang tetap melihatnya.
- Pengaturan sekolah: tingkat kelas bawaan diisi sesuai jenjang unit (tanpa memilih jenjang manual).
- Penugasan guru: untuk SD/MI, tombol "tetapkan ke semua mapel kosong" menugaskan satu guru kelas ke seluruh mapel yang belum
  punya pengampu tanpa menimpa guru khusus.

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
