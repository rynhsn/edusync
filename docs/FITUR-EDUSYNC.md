# Edusync: menu dan fitur

Edusync adalah aplikasi manajemen sekolah multi-tenant. Satu **lembaga** (yayasan) punya satu atau lebih **unit sekolah**,
dan tiap unit punya data, pengguna, serta langganan modulnya sendiri. Dokumen ini menjelaskan semua area dan menu menurut
versi 1.0.0. Panduan langkah demi langkah per fitur ada di menu **Dokumentasi** di dalam aplikasi (Indonesia, Inggris,
Sunda); referensi API ada di `/docs` pada server API.

Daftar isi: [Struktur](#struktur) · [Akun dan masuk](#akun-dan-masuk) · [Konsol sekolah](#konsol-sekolah) ·
[Portal wali dan siswa](#portal-wali-dan-siswa) · [Halaman publik](#halaman-publik) · [Portal pemilik lembaga](#portal-pemilik-lembaga) ·
[Konsol platform](#konsol-platform) · [Peran dan izin](#peran-dan-izin) · [Modul berlangganan](#modul-berlangganan)

---

## Struktur

| Tingkat      | Isi                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------- |
| Platform     | Staf Edusync: mengelola lembaga, katalog langganan, pembayaran, email, situs pemasaran, dukungan. |
| Lembaga      | Pemilik/pengelola lembaga, tagihan langganan, daftar unit sekolah.                                |
| Unit sekolah | Seluruh data akademik, keuangan, dan pengguna sekolah. Alamat: `<slug-sekolah>.edusync.web.id`.   |

Satu akun (satu email atau NIK, satu kata sandi) bisa punya peran berbeda di banyak sekolah. Akses ke sekolah lain hanya
lewat undangan, dan data orang (siswa, wali, guru) tetap milik tiap sekolah. Pengguna berpindah sekolah, lembaga, atau
konsol platform dari menu **Pindah ke** di bilah samping; layar **Pilih tujuan** muncul setelah login bila akun punya lebih dari satu tujuan.

## Akun dan masuk

- **Masuk** dengan email atau NIK (NIK boleh memakai spasi, titik, atau strip). Tidak ada nama pengguna.
- **Lupa kata sandi**: kode OTP lewat email atau WhatsApp (pengiriman WhatsApp nyata masih ditunda), dengan petunjuk nomor
  tersamar. Akun yang tidak bisa dipulihkan sendiri dapat meminta **lapor ke admin sekolah** (menu _Permintaan reset sandi_).
- **Profil saya**: ubah nama, kata sandi, dan keluarkan perangkat yang tidak dikenal.
- **Undangan**: staf, guru, wali, dan staf platform diundang lewat email; tautan membuat atau menautkan akun.
- **Bantuan sandi** (`/bantuan-sandi`): halaman panduan publik untuk yang tidak bisa masuk.

## Konsol sekolah

Menu bilah samping disusun per kelompok dan **hanya tampil bila pengguna punya izin dan sekolah berlangganan modulnya**.
Menu bertanda (P) adalah pengaturan, ditaruh di bagian bawah kelompoknya.

### Ringkasan

- **Ringkasan** (`/dashboard`): beranda sesuai peran: angka penting, langkah awal (onboarding) untuk sekolah baru, sambutan per peran.

### Data induk

- **Siswa**: daftar, pencarian, tambah/ubah, status, impor massal dari Excel/CSV, NIK utuh untuk pengelola dan tersamar untuk pembaca biasa, lencana kelengkapan data, kode identitas QR/barcode.
- **Data wali**: daftar wali, pencarian, status akun portal, undang wali, hapus aman (ditolak bila masih terhubung ke siswa).
- **Kartu cetak**: kartu siswa dan kartu ujian; desain dapat diatur lewat editor tata letak (QR, barcode, foto, teks), ada templat siap pakai.
- **Guru**: data diri lengkap (NIK, NUPTK opsional untuk guru honorer, HP, email, alamat), akun login guru, impor.
- **Kelas**: tingkat, kelas, wali kelas, penempatan siswa.
- **Mata pelajaran**: daftar mapel, kurikulum, pengampu.
- **Tahun ajaran**: tahun ajaran dan semester (label semester selalu memuat tahun ajarannya).
- **Kalender**: kalender akademik dan hari libur.
- **Pengaturan sekolah** (P): identitas sekolah (NPSN wajib), jenjang, logo, pengaturan dasar.

### Kehadiran (modul Absensi)

- **Rekap absensi**: rekap harian dan bulanan per kelas/siswa.
- **Absensi per jam**: guru mencatat kehadiran per jam pelajaran.
- **Gerbang & piket**: layar petugas gerbang, pemindaian kartu, riwayat datang dan pulang; kiosk mandiri di `/kiosk`.
- **Absen datang & pulang**: pencatatan manual oleh guru sebagai cadangan saat kiosk atau listrik bermasalah.
- **Kartu RFID**: pendaftaran kartu, tautan kartu ke siswa, impor.
- **Pengaturan absensi** (P): jam masuk/pulang, aturan terlambat, perangkat kiosk, kartu.

### Akademik

- **Jadwal pelajaran** (modul Jadwal): jam pelajaran, jadwal per kelas dan per guru.
- **Penilaian** (modul Nilai dan rapor): input nilai per mapel dan semester, bobot, rekap.
- **Rapor**: penyusunan dan cetak rapor PDF.
- **Ekstrakurikuler**: kegiatan, anggota, penilaian.
- **Ujian**: ujian dan skor, pemindaian lembar jawaban, kartu peserta.
- **Bank soal**: butir soal milik guru/sekolah, dipakai menyusun ujian.
- **Lembar ujian cetak** (P) dan **Jenis ujian** (P).
- **Pengaturan penilaian** (P) dan **Pengaturan rapor** (P): komponen nilai, predikat, templat rapor.

### Tahfidz dan ibadah (modul Tahfidz dan ibadah)

- **Tahfidz**: setoran hafalan per siswa, capaian per juz, riwayat.
- **Ibadah harian**: pencatatan ibadah harian siswa.
- **Pengaturan ibadah** (P): jenis ibadah dan target, pengaturan tahfidz.

### PKL dan prakerin (modul PKL dan prakerin)

- **PKL**: penempatan siswa di industri, pembimbing, jurnal dan penilaian, laporan.
- **Mitra industri**: data dunia usaha/industri.
- **Periode dan aspek** (P): periode PKL dan aspek penilaian.
- Halaman publik `/pkl` untuk mitra.

### Keuangan (modul Keuangan sekolah)

- **Kasir**: penerimaan pembayaran tunai atau transfer, struk.
- **Tagihan**: pembuatan tagihan, tagihan otomatis berkala, pembatalan, status.
- **Laporan keuangan**: laporan harian, rekap per periode.
- **Transaksi online**: pembayaran yang masuk lewat gerbang pembayaran.
- **Pembayaran online (Midtrans)** (P): kunci Midtrans per sekolah (kunci server wajib; Merchant ID opsional), rekening sekolah.
- **Jenis biaya & tarif** (P): jenis biaya per semester, tarif, penetapan biaya ke seluruh sekolah, kelas, atau siswa tertentu (misalnya biaya renang).

### Penerimaan murid (modul SPMB)

- **SPMB**: pendaftar, verifikasi berkas, seleksi, penerimaan.
- **Periode SPMB** (P): periode, jalur, jenis dokumen. Formulir pendaftaran publik di `/apply`.

### Surat dan administrasi (modul Administrasi)

- **Surat**: surat masuk dan keluar, penyusunan dari templat, nomor surat, tanda tangan.
- **Penandatangan**: pejabat dan tanda tangannya (juga dapat dibuka penandatangan untuk tanda tangannya sendiri).
- **Templat surat** (P).
- Verifikasi keaslian surat lewat tautan/QR di `/verify`.

### Komunikasi dan situs

- **Pengumuman** (modul Pengumuman dan agenda): pengumuman dan agenda sekolah, tampil di situs.
- **Notifikasi WhatsApp** (modul Notifikasi WhatsApp): antrean dan log pesan ke wali (pengiriman nyata ditunda; saat ini dicatat saja).
- **Akun portal** (modul Portal wali dan siswa): mengundang wali/siswa ke portal, status akun.
- **Situs sekolah** (P, modul Website): konten situs publik, domain sendiri sekolah (terverifikasi).

### Pengguna dan akses

- **Anggota**: staf sekolah, undangan, peran per anggota.
- **Peran**: daftar peran bawaan dan izinnya.
- **Permintaan reset sandi**: permintaan pemulihan akun yang diteruskan ke admin sekolah.

### Bawah

- **Laporan** (admin sekolah): tiket bantuan ke tim platform, dengan lencana balasan baru dan notifikasi email.
- **Dokumentasi**: panduan di dalam aplikasi untuk tiap fitur dan peran.

### Layar khusus

- **Sekolah ditangguhkan**: bila langganan tidak diperpanjang atau ditangguhkan platform, pengguna melihat layar khusus dengan alasan penangguhan; data tetap utuh.
- **Pilih tujuan**: pemilihan sekolah/lembaga/konsol setelah login bila ada lebih dari satu.

## Portal wali dan siswa

Rute `/portal` (peran Wali dan Siswa, izin `portal:read`):
- Ringkasan anak: absensi, nilai, rapor, tagihan, tahfidz/ibadah, PKL.
- **Ujian**: daftar dan hasil ujian.
- Pembayaran tagihan online (`/pay`).
- Seorang wali dengan anak di beberapa sekolah dan guru yang mengajar di beberapa sekolah memakai satu akun yang sama.

## Halaman publik

| Alamat                                            | Fungsi                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| `/` dan `/landing`                                | Situs pemasaran Edusync (konten dan gambar diatur di konsol platform). |
| `/register`                                       | Pendaftaran lembaga baru dan pembayaran langganan.                     |
| `/login`, `/forgot-password`, `/reset`, `/invite` | Masuk, pemulihan, undangan.                                            |
| `/site`                                           | Situs publik tiap sekolah (profil, pengumuman, agenda).                |
| `/apply`                                          | Formulir pendaftaran SPMB.                                             |
| `/verify`                                         | Verifikasi keaslian surat/dokumen.                                     |
| `/kiosk`                                          | Layar kiosk absensi.                                                   |
| `/pkl`                                            | Halaman mitra PKL.                                                     |
| `/pay`                                            | Pembayaran tagihan.                                                    |

## Portal pemilik lembaga

Untuk pengelola lembaga: daftar unit sekolah, penambahan unit baru, langganan dan tagihan lembaga (kenaikan paket, modul),
status pembayaran, dan pindah ke konsol tiap unit.

## Konsol platform

Hanya untuk staf Edusync (peran admin atau baca-saja). Dibuka lewat **Pindah ke → Konsol platform**.

| Menu                    | Fungsi                                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Lembaga (`/platform`)   | Daftar lembaga dan unit, status langganan, tagihan, pembekuan/penangguhan dengan alasan, langganan gratis (komplimen). |
| Menunggu                | Pendaftaran yang belum dibayar atau perlu tindakan.                                                                    |
| Audit                   | Catatan tindakan staf platform.                                                                                        |
| Katalog                 | Paket, modul, dan harga langganan.                                                                                     |
| Pembayaran              | Konfigurasi penyedia pembayaran platform.                                                                              |
| Email                   | Pengaturan SMTP pengiriman email sistem.                                                                               |
| Pesan                   | Konfigurasi pesan WhatsApp/penyedia pesan.                                                                             |
| Kurikulum               | Bank kurikulum bersama.                                                                                                |
| Situs                   | Ikon, gambar, dan konten situs pemasaran Edusync.                                                                      |
| Pengguna                | Akun pengguna lintas lembaga.                                                                                          |
| Staf                    | Staf platform dan undangan jadi pengelola platform.                                                                    |
| Dukungan                | Tiket dari admin sekolah, balasan, notifikasi email.                                                                   |
| Panduan dan Dokumentasi | Panduan operasional platform.                                                                                          |
| Profil                  | Profil staf platform.                                                                                                  |

## Peran dan izin

Peran bawaan (per sekolah, dapat diperiksa di menu **Peran**):

| Peran          | Gambaran                                                                |
| -------------- | ----------------------------------------------------------------------- |
| Admin sekolah  | Semua izin sekolah.                                                     |
| Kepala sekolah | Hanya membaca hampir semua data; dapat menandatangani surat.            |
| Kurikulum      | Akademik: jadwal, penilaian, rapor, ujian, kurikulum.                   |
| Bendahara      | Keuangan: tagihan, kasir, laporan, gerbang pembayaran.                  |
| Operator       | Pemasukan data induk dan administrasi sehari-hari.                      |
| Guru           | Absensi per jam, nilai mapelnya, ujian, tahfidz/PKL sebagai pembimbing. |
| Wali           | Portal anak (`portal:read`).                                            |
| Siswa          | Portal diri sendiri (`portal:read`).                                    |

Izin berformat `sumber:aksi` (`student:read`, `finance:manage`, `attendance:configure`, dan seterusnya). Menu, tombol aksi, dan
endpoint API semua mengikuti izin yang sama; keamanan data antar-sekolah dijaga di tingkat database (RLS).

## Modul berlangganan

Sekolah berlangganan paket berdasarkan jumlah siswa (sampai 300, 301 sampai 800, 801 sampai 1.500) dan modul tambahan.
Menu modul yang tidak dilanggan disembunyikan.

| Modul                             | Cakupan                                                 |
| --------------------------------- | ------------------------------------------------------- |
| Modul inti                        | Data induk, tahun ajaran, pengguna, peran, dokumentasi. |
| Absensi                           | Rekap, per jam, gerbang, kartu RFID, absen manual.      |
| Nilai dan rapor                   | Penilaian dan rapor.                                    |
| Penilaian non-akademik            | Penilaian di luar mapel.                                |
| Jadwal pelajaran                  | Jadwal per kelas dan guru.                              |
| SPMB                              | Penerimaan murid baru.                                  |
| Website sekolah                   | Situs publik dan domain sendiri.                        |
| Administrasi                      | Surat dan penandatangan.                                |
| SPP dan tagihan, Keuangan sekolah | Tagihan, kasir, laporan, pembayaran online.             |
| Tahfidz dan ibadah                | Setoran hafalan dan ibadah harian.                      |
| PKL dan prakerin                  | Penempatan dan penilaian PKL.                           |
| Portal wali dan siswa             | Akses orang tua dan siswa.                              |
| Pengumuman dan agenda             | Pengumuman dan agenda sekolah.                          |
| Ekstrakurikuler                   | Kegiatan dan penilaiannya.                              |
| Notifikasi WhatsApp               | Pesan otomatis ke wali (pengiriman nyata menyusul).     |

## Catatan

- Versi berjalan: lihat `GET /version` di API; riwayat perubahan: [CHANGELOG.md](../CHANGELOG.md) dan halaman Releases di GitHub.
- Dokumen ini menggambarkan menu dan fitur pada v1.0.0; perbarui bersama CHANGELOG saat fitur berubah.
- Pengiriman WhatsApp nyata ke wali belum aktif; pesan hanya dicatat.
