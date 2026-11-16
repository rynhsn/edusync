# Riwayat versi

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/) dan penomoran [SemVer](https://semver.org/lang/id/):
`MAJOR.MINOR.PATCH`. Naik PATCH untuk perbaikan, MINOR untuk fitur baru yang tetap kompatibel, MAJOR untuk perubahan yang
memutus kompatibilitas. Produksi hanya berubah saat tag `vX.Y.Z` dikirim; tulis bagian versinya di sini lebih dulu.

Cara merilis: tulis bagian baru di bawah "Belum dirilis" lalu ganti judulnya menjadi `## [x.y.z] - tanggal`, kemudian
`pnpm release x.y.z` dan `git push edusync HEAD:main vx.y.z`.

## [0.6.6] - 2026-11-16

### Ditambahkan

- **Pratinjau pesan WhatsApp mengikuti tampilan WhatsApp**: baris berawalan `> ` tampil sebagai kutipan, `- ` atau `* ` sebagai daftar
  berpoin, dan `1. ` sebagai daftar bernomor, di samping format tebal, miring, coret, dan kode. Teks yang dikirim tidak berubah.

## [0.6.5] - 2026-11-16

### Ditambahkan

- Bank kurikulum referensi dilengkapi (migrasi 0119, hanya menambah baris; baris lama tidak diubah): Kurikulum 2013 untuk
  SD/MI, SMA/MA, dan SMK/MAK; Kurikulum madrasah (KMA) untuk SMK/MAK (lima mapel PAI/Arab, rumpun `pai_arabic` ikut
  tertaut lewat adopsi seperti kurikulum madrasah lain); Kurikulum Merdeka untuk SD/MI. Hanya kode dan nama mapel, tanpa
  JP. Ini contoh struktur umum, sesuaikan dengan kebijakan sekolah; bukan klaim isi resmi regulasi.

## [0.6.4] - 2026-11-15

### Diperbaiki

- Alamat sekolah (`<slug>.<domain>`) yang sekolahnya sudah dihapus atau tidak pernah ada kini menampilkan halaman
  "Sekolah tidak ditemukan" dengan tombol ke situs utama, bukan lagi halaman login. Jawabannya sama untuk "dihapus" dan
  "tidak pernah ada". Sekolah yang ada (termasuk yang ditangguhkan), domain sendiri sekolah, alamat utama, dan konsol
  platform tidak berubah. API: `GET /v1/public/school-exists?slug=` (publik, dibatasi 120 per menit per IP, hanya
  mengembalikan `exists`).

## [0.6.3] - 2026-11-15

### Diubah

- Satu sumber data kepala sekolah untuk dokumen. Menu Surat > Penandatangan kini punya penanda **Kepala Sekolah**
  (paling banyak satu penandatangan aktif per sekolah; menandai yang baru melepas tanda yang lama setelah konfirmasi).
  Nama dan NIP-nya dipakai di rapor, SKL kelulusan, dan sertifikat PKL. Sekolah yang tidak menandai siapa pun tidak
  berubah: isian kepala sekolah di Pengaturan rapor tetap menjadi cadangan (dan tetap tersimpan bila penanda dipasang).
  Pengaturan rapor menampilkan kepala sekolah dari Penandatangan sebagai keterangan baca saja dengan tautan ke menu itu.
  Rapor yang sudah final tidak berubah (snapshot tetap membekukan nilai yang berlaku saat finalisasi). Migrasi 0118
  aditif (kolom `signer_credential.is_principal` dan indeks unik parsial). API: penandatangan memuat `isPrincipal`
  (`POST/PUT /v1/letters/signers`), pengaturan rapor memuat `signerPrincipal` (baca saja), dan lembar nilai PKL memuat
  `principal`.


### Diperbaiki

- Rapor dan leger: wali kelas tidak lagi langsung melihat galat "Anda tidak punya izin" karena kelas pertama pada daftar
  bukan kelasnya. Pengguna tanpa akses luas hanya melihat kelas yang ia walikan (terpilih otomatis), dan bila belum
  menjadi wali kelas muncul keterangan untuk menghubungi admin. Admin, kepala sekolah, dan kurikulum tetap melihat semua
  kelas. Daftar kelas (`GET /v1/classes`) memuat penanda baru `homeroomIsMe`.

- Halaman peran dan izin: semua modul dan aksi (Lihat semua, Jalankan, Atur ulang, Tanggapi, Kirim, Siarkan, dst.) kini berlabel rapi berhuruf awal kapital di id/en/su, tidak lagi tampil sebagai kode mentah. Tes baru menjaga setiap modul dan aksi punya label.
- Menu samping di ponsel: tombol tutup (X) pindah ke baris judul sendiri dengan target sentuh 44 px, tidak lagi menimpa pemilih sekolah.

## [0.6.2] - 2026-11-15

### Diperbaiki

- **Tulisan melingkar pada segel verifikasi surat** terpotong di tengah ulangan sehingga terbaca ganda ("SMK SMK Miftahul Huda").
  Kini nama sekolah diulang utuh dan mengisi lingkaran persis; nama panjang dipotong dengan "…".

## [0.6.1] - 2026-11-15

### Diubah

- **Penyedia pesan WhatsApp di produksi tidak lagi dikunci file `.env`.** `MESSAGING_PROVIDER` kini hanya berlaku di pengembangan dan uji;
  di produksi diabaikan dan penyedia ditentukan pengaturan di konsol platform (bawaan `whatsapp`). Sebelumnya, nilai `log` di `.env`
  server membuat pesan hanya dicatat dan tidak pernah dikirim, dan pilihan di platform tidak berlaku.

## [0.6.0] - 2026-11-15

Pengiriman WhatsApp pindah dari whatsapp-web.js (Chromium) ke Baileys (WebSocket, tanpa browser). Antarmuka, antrean kirim,
jeda acak, status/QR di halaman Notifikasi WhatsApp, dan pengaturan platform tidak berubah.

### Ditambahkan

- **Pesan langsung WhatsApp ke wali atau staf terpilih** (tahap A rancangan siaran, `docs/rancangan-siaran-whatsapp.md`): tab baru Notifikasi WhatsApp > Pesan langsung untuk memanggil orang tua murid tertentu atau mengabari beberapa wali/staf. Penerima dipilih per murid, rombel, wali, atau staf (seluruh sekolah/semua staf dan > 30 penerima butuh izin siaran); nomor dinormalisasi dan digabung per nomor (wali dua anak = satu pesan, `{{student}}` menjadi "A dan B"). Templat pesan langsung bawaan (Pemanggilan orang tua dst.) dan templat milik sekolah, pengganti `{{guardian}}`, `{{student}}`, `{{class}}`, `{{school}}`, `{{date}}`, `{{teacher}}`, pratinjau gelembung WhatsApp (header/footer sekolah ikut), pratinjau jumlah penerima beserta yang tidak dikirim, sisa batas harian, dan konfirmasi dengan `expectedTotal` (mengetik jumlah bila > 30). Riwayat batch dengan bilah status, rincian per penerima, **Batalkan yang antre** dan **Kirim ulang yang gagal**. Isi yang memuat deret 16 digit (mirip NIK) ditolak. Semua lewat antrean, pengirim, jeda acak, dan jendela kirim yang sama dengan pesan otomatis.
  - Dispatcher mengklaim menurut `priority, created_at, id`: pesan peristiwa otomatis dan pesan uji (0) didahulukan atas pesan langsung (1) dan siaran (2). Perilaku pesan otomatis tidak berubah.
  - **Batas harian** `msg_setting.daily_limit` (bawaan 200, 0..2000; kolom Pengaturan > "Batas pesan langsung per hari") menghitung pesan langsung/siaran yang dibuat sejak 00.00 waktu sekolah, kecuali yang dibatalkan; dibatasi `dailyLimitMax` platform (bawaan 500, di `platform_setting.messaging`, tanpa migrasi). Nomor yang belum punya kiriman sukses lebih tua dari 7 hari dibatasi 50 per hari. 100 slot antrean tetap dicadangkan untuk pesan peristiwa.
  - Migrasi 0115 (aditif; RLS, GRANT, dan FK komposit): tabel `msg_batch` dan `msg_direct_template`; `msg_message` + `batch_id`, `teacher_id`, `priority`; `msg_setting` + `daily_limit`.
  - Izin baru `message:send` (admin sekolah, kepala sekolah, operator) dan `message:broadcast` (admin sekolah, operator); sekolah lama mendapatkannya lewat sinkron izin peran bawaan saat migrasi. Guru belum mendapat izin baru.
  - API baru (semua modul `messaging`, terdokumentasi di OpenAPI): `GET /v1/messaging/recipients/search`, `POST /v1/messaging/recipients/preview`, `POST/GET /v1/messaging/batches`, `GET /v1/messaging/batches/{id}`, `POST …/cancel`, `POST …/retry-failed`, dan `GET/POST/PUT/DELETE /v1/messaging/direct-templates`. `GET/PUT /v1/messaging/settings` menambah `dailyLimit` (opsional pada PUT; dihilangkan = tidak diubah) dan `PUT /v1/platform/messaging` menambah `dailyLimitMax` (opsional). Galat baru: `count_changed`, `daily_limit`, `queue_full`, `messaging_disabled`, `sensitive_content`, `no_recipients`, `duplicate_batch`, `batch_cancelled`, `invalid_daily_limit`.
  - Panduan "Notifikasi WhatsApp" di Dokumentasi diperluas (id, en, su).

- **Lampiran dokumen/gambar pada pesan langsung WhatsApp** (tahap B rancangan siaran): di tab Pesan langsung, tombol Pilih berkas melampirkan satu PDF, JPG, atau PNG (maksimal 2 MB) yang dikirim ke tiap penerima dengan isi pesan sebagai keterangan (caption); header/footer sekolah ikut di caption. Jenis diperiksa dari isi berkas (magic bytes), bukan hanya dari nama atau `mime`; pratinjau gelembung menampilkan gambar atau kartu PDF, dan batas ukuran/jenis diperiksa di klien dan server. Pesan tanpa lampiran berperilaku persis sama.
  - Isi berkas disimpan di database (`msg_attachment`, bytea, RLS dipaksa) dan **dihapus 7 hari setelah batch selesai** (24 jam bila tak dipakai batch mana pun) oleh penjadwal worker tiap jam; nama, ukuran, jenis, dan hash tetap untuk riwayat. Pesan yang masih antre saat isinya sudah dihapus menjadi `failed` dengan detail `attachment_expired` dan tidak diulang. Worker membaca berkas lewat peran platform dengan cache memori (LRU, maks 20 MB) agar siaran besar tidak membaca berkas berulang dari database.
  - Baileys: PDF dikirim sebagai dokumen, gambar sebagai image, dengan caption. Teks (header + isi + footer) lebih panjang dari 1.024 karakter dikirim lebih dulu sebagai pesan teks, lalu berkas tanpa caption dalam satu klaim antrean; bila pengiriman berkas gagal setelah teks terkirim, percobaan ulang mengirim teksnya lagi. Kontrak `WaClient.sendMessage`/`MessageSender.send` menerima lampiran opsional; `LogSender` mencatat `[lampiran nama, ukuran]`.
  - Migrasi 0116 (aditif; RLS, GRANT): tabel `msg_attachment`; `msg_batch` + `attachment_id` (FK komposit).
  - API baru (OpenAPI): `POST /v1/messaging/attachments` (izin `message:send`, JSON `{fileName, mime, dataBase64}`, badan maks 3 MB) dan `GET /v1/messaging/attachments/{id}/content` (izin `message:send`; 410 bila isi sudah dihapus); `POST /v1/messaging/batches` menerima `attachmentId` (opsional); rincian dan daftar batch memuat `attachment` (null bila tanpa lampiran). Galat baru: `attachment_type`, `attachment_too_large`, `invalid_base64`, `attachment_invalid`, `attachment_expired`. Audit: `messaging.attachment.upload`; `messaging.batch.create` mencatat `attachment`.
  - Panduan "Notifikasi WhatsApp" di Dokumentasi diperluas (id, en, su).

- **Siaran pengumuman lewat WhatsApp** (tahap C rancangan siaran): di halaman Pengumuman, pengumuman yang sudah terbit punya tombol **Siarkan lewat WhatsApp** (juga ditawarkan sebagai tindakan di pemberitahuan setelah menerbitkan) yang membuka dialog pratinjau: sasaran, pesan dalam gelembung WhatsApp, lampiran opsional (PDF/JPG/PNG dari tahap B), jumlah penerima beserta yang dilewati, sisa batas harian, dan perkiraan lama; lebih dari 30 penerima wajib mengetik jumlahnya. Siaran **terpisah dari penerbitan**: galat WhatsApp tidak pernah menggagalkan `publish`, dan tidak pernah terkirim otomatis. Perilaku pengumuman dan pesan otomatis yang ada tidak berubah.
  - Sasaran mengikuti audiens pengumuman: `portal` ke wali, `staff` ke staf, `all`/`public` ke wali (staf dicentang manual); wali dapat dipersempit per rombel/tingkat lewat API. Murid tidak pernah jadi sasaran. Isi: `*judul*` + isi sebagai teks polos (pengganti `{{...}}` tidak diproses), dipotong 1.000 karakter dengan "Selengkapnya di portal sekolah."; deret 16 digit ditolak.
  - Maksimal satu siaran per pengumuman. Pengumuman ditarik ke draf (tombol, atau PUT berstatus draf) atau dihapus: pesan siaran yang masih antre menjadi `skipped/cancelled`; yang sudah terkirim tidak disentuh.
  - Siaran memakai prioritas antrean 2 dan **jeda minimum 10 detik** antar pesan walau pengaturan sekolah lebih kecil (pesan lain tidak berubah); batas harian, antrean cadangan, jendela kirim, dan kedaluwarsa tetap berlaku.
  - **Opt-out siaran**: tab baru Notifikasi WhatsApp > Opt-out siaran (izin `message:manage`) untuk menandai wali yang menolak siaran, berdasarkan nomor ternormalisasi. Siaran melewati mereka (`excluded.optedOut`); pesan langsung dan pesan otomatis tetap terkirim, pratinjau pesan langsung hanya menampilkan peringatan (`optedOutWarning`).
  - Migrasi 0117 (aditif; RLS, GRANT, FK komposit): `announcement` + UNIQUE `(school_id, id)`; `msg_batch` + `announcement_id` (FK komposit `ON DELETE SET NULL (announcement_id)`, indeks unik parsial satu siaran per pengumuman); tabel `msg_opt_out` (PK `(school_id, phone)`, ditambah kolom `id` agar bisa dialamatkan tanpa nomor utuh).
  - API baru (OpenAPI): `POST /v1/announcements/{id}/broadcast/preview`, `POST /v1/announcements/{id}/broadcast`, `GET /v1/announcements/{id}/broadcast` (status), dan `GET/PUT /v1/messaging/opt-outs`, `DELETE /v1/messaging/opt-outs/{id}`. Siaran butuh `announcement:manage` + `message:broadcast` dan modul `announcements` + `messaging`. `POST /v1/messaging/recipients/preview` menambah `optedOutWarning`. Galat baru: `already_broadcast`, `not_published`, `announcement_expired`, `broadcast_target`. Audit: `announcement.broadcast`, `announcement.broadcast.cancel`, `messaging.opt_out.set`, `messaging.opt_out.remove`.
  - Panduan Pengumuman/WhatsApp di Dokumentasi diperluas (id, en, su).

- **Surat sebagai lampiran WhatsApp** (tahap D rancangan siaran): di rincian surat keluar yang sudah ditandatangani (dan belum dicabut), tombol **Kirim lewat WhatsApp** membuat PDF surat di perangkat, mengunggahnya, lalu membuka tab Pesan langsung dengan PDF terlampir dan, bila surat untuk murid tertentu, murid itu sudah terpilih (pesan ke wali muridnya; bisa diubah). Surat tanpa murid: penerima dipilih manual. Alur penerbitan, penandatanganan, dan pencabutan surat tidak berubah.
  - `POST /v1/letters/{id}/whatsapp-attachment` (izin `letter:read` + `message:send`; modul `administration` + `messaging`; JSON `{fileName, dataBase64}`, maks 2 MB asli): server memverifikasi isi berupa PDF (magic bytes) dan **menolak bila SHA-256 unggahan berbeda dari `signed_document.pdf_sha256`** (409 `hash_mismatch`); hash belum terdaftar didaftarkan dari unggahan itu hanya oleh penandatangan atau pemilik `letter:manage` (409 `hash_not_registered` selain itu). Surat dicabut: 409 `revoked`; belum ditandatangani: 409 `not_signed`; surat sekolah lain: 404 (RLS). Balikan sama dengan `POST /v1/messaging/attachments`, dan lampirannya dipakai lewat `POST /v1/messaging/batches` yang ada. Audit `letter.whatsapp`.
  - Tanpa migrasi: `msg_attachment` tidak diberi `letter_id` (rujukan surat tercatat di audit `letter.whatsapp`; `letter` memang tidak punya UNIQUE `(school_id, id)`).
  - Panduan Notifikasi WhatsApp di Dokumentasi diperluas (id, en, su).

- **Header dan footer pesan WhatsApp**: tiap sekolah dapat mengisi teks pembuka dan penutup (beberapa baris, format `*tebal*` dst., pengganti `{{school}}`, maks 300 karakter) di Notifikasi WhatsApp > Pengaturan, lengkap dengan pratinjau gelembung. Dipasang saat kirim (header + isi + footer): berlaku juga untuk pesan yang masih antre dan pesan uji, sedangkan isi pesan di riwayat tetap asli. Kosong = persis seperti sebelumnya. Kolom baru `header_text`/`footer_text` di `msg_setting` (migrasi 0114, aditif); `PUT /v1/messaging/settings` menerima `headerText`/`footerText` (opsional; dihilangkan = tidak diubah).

### Diubah

- **Templat pesan WhatsApp**: kolom isi lebih tinggi untuk pesan beberapa baris, dan pratinjau tampil sebagai gelembung obrolan WhatsApp dengan format `*tebal*`, `_miring_`, `~coret~`, dan kode. Teks yang dikirim tidak berubah.

- **Pesan uji tetap terkirim walau pengiriman otomatis sekolah dimatikan** (sebelumnya langsung berstatus "dilewati"). Pesan lain tetap dilewati.

- **Pustaka WhatsApp di worker: Baileys** (`@whiskeysockets/baileys`, versi 7.0.0-rc14 dikunci persis). Tanpa Chrome/Chromium dan
  puppeteer: memori per sekolah turun dari sekitar 300 MB menjadi beberapa puluh MB, dan Dockerfile/server tidak perlu memasang
  Chrome. Batas `WA_MAX_CLIENTS` tetap berlaku (bawaan 20). Sambung ulang untuk putus sementara otomatis (jeda bertahap); bila
  dikeluarkan dari ponsel (logout) kredensial dibuang dan status menjadi Terputus; sesi yang diambil perangkat lain tidak
  direbut kembali. Pembatasan laju WhatsApp muncul sebagai galat kirim biasa dan dicoba ulang oleh aturan kirim ulang.
- **Sesi WhatsApp disimpan di database**, tabel baru `wa_auth_state` (migrasi 0113, aditif): satu baris per kunci, nilai
  terenkripsi AES-256-GCM dari `AUTH_SECRET`, RLS dipaksa, dan peran aplikasi (API) tidak punya akses baca sama sekali. Sesi
  bertahan saat worker dimulai ulang, ikut cadangan database, dan tidak lagi bergantung pada folder `.wa-sessions`.
  Kredensial tidak dicatat ke log maupun audit. Mengganti `AUTH_SECRET` membuat sesi tersimpan tak terbaca; sekolah perlu
  menautkan ulang.
- Kartu Status worker di konsol platform tidak lagi menampilkan Chrome: kini menampilkan pustaka (Baileys) dan waktu laporan
  terakhir. Pada API, `runtime.chrome` menjadi opsional dan usang (laporan worker lama masih terbaca).

### Dihapus

- Variabel `WA_CHROME_PATH` dan `WA_SESSION_DIR` (diabaikan bila masih ada di `.env`), dependensi whatsapp-web.js, serta
  pembersih folder sesi lama.

### Perlu tindakan saat memperbarui

- **Semua sekolah yang sudah tertaut WhatsApp harus memindai ulang kode QR satu kali.** Sesi whatsapp-web.js tidak bisa
  dipindahkan ke Baileys. Setelah worker baru berjalan, akun sekolah yang sebelumnya Terhubung kembali ke Menunggu pemindaian;
  pesan tetap antre dan terkirim setelah tertaut ulang (pesan yang melewati masa kedaluwarsa sesuai aturan yang ada tetap
  dibuang). Di ponsel: Perangkat tertaut > Tautkan perangkat. Halaman Notifikasi WhatsApp menampilkan pengingat ini di bawah
  kode QR.
- Folder `.wa-sessions` lama (profil Chrome) boleh dihapus dari server setelah semua sekolah tertaut ulang. Hapus juga
  `WA_CHROME_PATH` dan `WA_SESSION_DIR` dari `.env` bila ada.

## [0.5.0] - 2026-11-15

Revisi kurikulum selesai (Fase 3 sampai 5). Nomor rilis sebelumnya (1.0.0 sampai 1.4.0) diubah menjadi 0.0.0 sampai 0.4.0;
v1.0.0 disimpan untuk rilis stabil berikutnya. Tag lamanya kini bernama `archive/v0.x.y`.

Fase 3 (asesmen dan rapor), tahap 3.3 sampai 3.5: kaitan tujuan pembelajaran (TP), ketercapaian TP per murid, narasi rapor dari
TP, serta remedial dan pengayaan. Nilai akhir, predikat, rekap, dan portal nilai tidak berubah selama sekolah tidak memilih
kebijakan nilai remedial selain "hanya mencatat" (bawaan). Rapor murid yang belum punya status TP sama persis dengan
v0.4.0 (teks per predikat, bentuk data versi 1); hanya murid dan mata pelajaran yang punya ketercapaian TP mendapat narasi baru.

### Ditambahkan

- **Kaitan penilaian ke TP.** Guru dapat mengaitkan sebuah penilaian ke satu atau beberapa TP mata pelajaran yang sama (maksimal
  20 per penilaian; TP harus aktif) saat membuat atau mengubah penilaian, atau lewat pengaturan khusus. Satu skor penilaian
  berlaku untuk semua TP yang dikaitkan; guru yang butuh ketelitian per TP membuat penilaian per TP. Penilaian hasil ujian CBT
  boleh dikaitkan, dan mengirim ulang nilai ujian tidak menghapus kaitannya. Selama rapor kelas final, kaitan tidak dapat diubah.
- **Ketercapaian TP per murid** (matriks murid x TP per kelas, mata pelajaran, dan semester). Dihitung saat dibuka dari skor
  penilaian sumatif yang dikaitkan: persen, status tercapai atau belum, label level, dan asal ambangnya. Penilaian formatif
  tidak dihitung; ringkasannya tampil terpisah sebagai kemajuan. Ambang dicari berjenjang: kriteria ketercapaian per TP
  (angka, interval, rubrik, atau deskriptor; menurut tingkat dan jurusan kelas) lalu KKM mata pelajaran lalu KKM sekolah.
- **Aturan agregasi** bila satu TP dinilai beberapa kali: rata-rata (bawaan), penilaian terbaru, atau nilai tertinggi. Diatur
  per sekolah di pengaturan nilai, ikut disalin ke konfigurasi beku semester (semester yang sudah dibekukan tidak berubah bila
  pengaturan diubah), dan ditolak bila semester aktif sudah punya rapor final, sama seperti mengubah bobot dan KKM.
- **Keputusan guru atas ketercapaian TP** (override) per murid dan TP: status tercapai atau belum, label level, dan alasan
  (maksimal 500 karakter). Keputusan guru menang atas hitungan dan berlaku untuk TP tanpa angka (mis. observasi). Ditolak bila
  rapor murid itu pada semester tersebut sudah final.
- **Versi TP.** Mengubah teks TP yang sudah dipakai penilaian (selain yang sudah dipakai alur tujuan pembelajaran terbit)
  membuat versi baru: penilaian dan alur lama tetap menunjuk versi lama, dan versi lama dinonaktifkan. Menghapus TP yang
  dikaitkan ke penilaian atau sudah punya keputusan guru ditolak (`in_use`).
- Kode galat baru: `objective_subject_mismatch`, `objective_inactive`, `too_many_objectives` (terjemahan id, en, su).
- **Narasi rapor dari TP.** Deskripsi capaian tiap mata pelajaran kini disusun otomatis dari ketercapaian TP murid itu: TP yang
  tercapai disebut sebagai kekuatan (persen tertinggi dulu) dan TP yang belum tercapai sebagai bahan bimbingan (persen terendah
  dulu), paling banyak 2 TP per sisi. Persen yang sama diurutkan menurut alur tujuan pembelajaran (ATP) yang terbit, lalu urutan
  TP. Bila semua TP tercapai, kalimat bimbingan tidak ditulis. Hanya TP yang punya status (dari skor atau keputusan guru) yang
  dihitung; penilaian formatif tidak ikut. Murid tanpa TP berstatus di suatu mata pelajaran tetap mendapat teks per predikat
  seperti sebelumnya.
- **Prioritas teks**: suntingan guru menang atas narasi dari TP, dan narasi dari TP menang atas teks per predikat. Menghapus
  suntingan mengembalikan teks otomatis. Rapor draf selalu memakai data terkini; saat difinalkan, teks yang berlaku dibekukan
  ke rapor (disertai ringkasan TP yang disebut) dan rapor final tidak berubah walau skor berubah kemudian. Buka kembali rapor
  mempertahankan suntingan guru dan menghitung ulang teks otomatis; finalisasi ulang membekukan lagi.
- **Penanda narasi usang.** Setiap suntingan guru mencatat teks otomatis saat itu. Bila skor atau TP berubah sehingga teks
  otomatis berbeda, daftar deskripsi menandai suntingan itu `stale`, dan finalisasi mengembalikan jumlahnya
  (`staleNarratives`) sebagai peringatan tanpa menghentikan finalisasi.
- **Pengaturan narasi sekolah** di pengaturan rapor: jumlah TP per sisi (1-5, bawaan 2) dan templat kalimat kekuatan dan
  bimbingan (harus memuat `{tp}`, maksimal 300 karakter; kosong = templat bawaan). Templat berlaku per sekolah, bukan per
  bahasa tampilan. Di kelas bermode deskriptif (Fase A) narasi dari TP juga memenuhi syarat kelengkapan deskripsi.
- **Remedial dan pengayaan.** Guru mencatat kegiatan pendampingan (remedial atau pengayaan) per kelas, mata pelajaran, dan
  semester: judul, keterangan, tanggal, TP sasaran, dan murid peserta beserta status (direncanakan, berjalan, selesai, batal) dan
  catatan hasil. Pengayaan hanya dicatat dan tidak memengaruhi nilai.
- **Percobaan remedial.** Hasil asesmen ulang dicatat per penilaian dan murid (percobaan ke-1, ke-2, dan seterusnya, maksimal 20)
  dengan nilai, tanggal, catatan, dan pendampingan terkait. Nilai asli di buku nilai tidak pernah ditimpa. Nilai remedial tidak
  boleh melebihi skor maksimum penilaian (`score_out_of_range`). Mengirim ulang nilai ujian CBT hanya mengubah skor asli;
  percobaan remedial tetap, dan audit mencatat jumlah skor yang berubah.
- **Kebijakan nilai remedial** di pengaturan nilai (pemegang izin konfigurasi nilai): hanya mencatat (`record_only`, bawaan:
  nilai akhir tetap dari skor asli), memakai percobaan terakhir (`replace_latest`), nilai tertinggi (`max`), tertinggi dengan
  batas KKM efektif mata pelajaran (`cap_at_criteria`: remedial paling tinggi menaikkan ke KKM, skor asli yang sudah di atas
  KKM tidak diturunkan), atau rata-rata skor asli dan percobaan terakhir (`mean_with_original`). Tidak ada aturan nasional,
  jadi kebijakan diserahkan ke sekolah dan tidak dikunci. Nilai efektif dipakai nilai akhir (rekap, leger, rapor draf, portal)
  dan ketercapaian TP. Kebijakan ikut disalin ke konfigurasi beku semester (semester yang sudah dibekukan tidak berubah bila
  kebijakan diubah; salinan lama dibaca sebagai hanya mencatat) dan ditolak (`report_final`) bila semester aktif sudah punya
  rapor final. Rapor final tetap dari snapshot dan tidak berubah oleh hasil remedial.
- **Daftar murid yang perlu remedial** per kelas, mata pelajaran, dan semester: murid dengan skor asli di bawah KKM efektif pada
  penilaian sumatif, beserta nilai efektif dan apakah masih di bawah KKM.
- Rekap nilai membawa `remedial` (jumlah percobaan dan sumber nilai) per murid hanya bila ada percobaan, dan `remedialPolicy`
  hanya bila kebijakan bukan bawaan; nilai portal membawa penanda yang sama per mata pelajaran. Kode galat baru:
  `score_out_of_range`, `too_many_attempts`, `invalid_dates` (terjemahan id, en, su).
- **Mutasi murid dan riwayat rombel.** Sekolah dapat mencatat murid pindah atau putus sekolah (tanggal efektif, alasan, sekolah
  tujuan beserta NPSN, nomor dan tanggal surat) dan murid pindahan masuk (membuat murid, penempatan kelas, dan sekolah asal).
  Murid yang keluar mempertahankan penempatannya, dan keterangan nilai dari rapor draf semester berjalan dibekukan saat ia keluar.
  Mutasi dapat diubah keterangannya dan mutasi keluar dapat dibatalkan (status kembali aktif). Murid berstatus pindah lama yang
  belum tercatat dapat dilengkapi catatannya. Halaman riwayat akademik murid menampilkan rombel per tahun ajaran beserta
  perpindahannya, keputusan kenaikan, status rapor, dan mutasi.
- **Rapor final murid pindah tidak lagi hilang dari daftar kelas.** Murid yang keluar sesudah suatu semester berakhir tetap tampil
  di daftar rapor kelas semester itu, dan ikut bila rapor kelas dibuka kembali lalu difinalkan ulang. Murid yang pindah rombel
  setelah semester berakhir tetap tercatat di rombel lamanya untuk semester itu. Sekolah tanpa mutasi atau perpindahan rombel
  melihat daftar yang sama persis seperti sebelumnya.
- **Larangan mutasi pada semester genap tingkat akhir.** Pindah sekolah (keluar atau masuk) pada semester terakhir tahun ajaran
  untuk kelas tingkat akhir ditolak (`transfer_final_level_even_semester`). Admin dengan izin kelola sekolah dapat menimpanya
  dengan alasan tertulis yang tercatat pada mutasi dan audit; tanpa izin itu galatnya `exception_requires_school_manage`. Putus
  sekolah tidak terkena larangan.
- Kode galat baru: `transfer_final_level_even_semester`, `exception_requires_school_manage`, `student_not_active`,
  `transfer_not_cancellable`, `student_status_changed`, `transfer_superseded` (terjemahan id, en, su).
- **Pilihan mata pelajaran per murid (data dan aturan).** Sekolah dapat menandai sebuah mapel di sebuah rombel sebagai "berdasarkan
  pilihan" (hanya diikuti murid yang terdaftar), lalu mencatat pilihan tiap murid untuk satu tahun ajaran atau satu semester
  (dengan "ganti pilihan mulai semester X"). Pilihan agama dapat diisi dari agama murid tanpa menebak; murid yang agamanya kosong
  atau tidak punya pasangan mapel dilaporkan terpisah. Aturan pilihan per sekolah (jumlah dipilih, jumlah minimal ditawarkan,
  satu seni, satu agama, batas ganti pilihan) disimpan sebagai data dan bawaannya hanya peringatan; sekolah boleh menyalakan
  penolakan per aturan. Ringkasan rombel menampilkan peringatan dan murid yang belum memilih. Izin baru `subject_choice:manage`
  (admin sekolah, kurikulum, operator; wali kelas boleh mengatur rombelnya sendiri). Tahap ini hanya data dan aturan: nilai,
  rekap, rapor, portal, jadwal, dan absensi belum berubah, dan sekolah tanpa penanda mapel identik dengan sebelumnya. Mengubah
  pilihan yang memengaruhi semester dengan rapor final ditolak (`report_final`). Kode galat baru: `subject_not_selected_mode`,
  `choice_rule_violation`, `scope_overlap`, `choice_locked`.
- **Pilihan mapel memengaruhi nilai, rapor, dan portal.** Untuk mapel yang ditandai "berdasarkan pilihan" di sebuah rombel,
  hanya murid yang mengambilnya (setahun atau pada semester yang dinilai) yang muncul di lembar skor, rekap mapel, matriks kelas,
  ketercapaian TP, remedial, pendampingan, deskripsi capaian, dan hitungan `total`/`filled` penilaian; menyimpan skor, keputusan
  TP, percobaan remedial, deskripsi, atau peserta pendampingan untuk murid yang tidak mengambil mapel itu ditolak
  (`student_not_taking_subject`). Pada matriks kelas, sel mapel yang tidak diambil murid ditandai `notTaken`. Rapor per murid
  hanya memuat mapel yang ia ambil; murid tidak dianggap "belum lengkap" untuk mapel yang tidak ia ambil (finalisasi tidak lagi
  memaksa `force` untuk kelas campuran), dan rata-rata serta peringkat dihitung atas mapel yang diambil masing-masing murid
  (sekolah yang menilai peringkat lintas pilihan tidak adil dapat mematikan tampilan peringkat di pengaturan rapor). Portal wali
  dan murid menampilkan nilai dan skor terbaru hanya untuk mapel yang diambil anak. Dorong nilai ujian ke buku nilai hanya
  memberi skor kepada murid yang mengambil mapel ujian dan melaporkan jumlah yang dilewati (`skippedNotTaking`). Skor lama murid
  yang belum terdaftar tidak dihapus: skor itu hanya tersembunyi dan tampil lagi bila penanda dimatikan atau murid didaftarkan.
  Sekolah tanpa penanda identik dengan sebelumnya; rapor final tetap dari snapshot dan bentuk dokumen rapor tidak berubah.
  Kode galat baru: `student_not_taking_subject`.
- **Legger kelas.** Halaman baru "Legger" (dari tombol di halaman Rapor) menampilkan nilai akhir seluruh murid satu kelas pada
  satu semester dalam satu matriks murid x mapel, lengkap dengan predikat di bawah KKM, rata-rata, peringkat (bila pengaturan rapor
  menampilkannya), sakit, izin, alpa, terlambat, status rapor (draf atau final), dan sumber angka. Rapor final dibaca dari
  snapshot (tidak berubah walau skor diubah kemudian); draf dihitung dari nilai terkini dengan rumus yang sama dengan rapor dan
  rekap. Daftar murid sama dengan daftar rapor (aktif, lulusan, dan murid pindah atau keluar sesudah semester berakhir); sel mapel
  yang tidak diambil murid ditandai `notTaken` dan tidak masuk rata-rata. Kelas bermode rapor deskriptif memuat penanda
  `reportMode` supaya angka tidak dibagikan ke wali. Unduh Excel dan cetak atau simpan PDF dibuat di peramban. Endpoint baru
  `GET /v1/report-cards/ledger` (izin `report_card:read` dan wali kelas itu atau pemegang kelola rapor; modul `grades`; 400
  `invalid_reference`), tanpa migrasi. Layar kirim nilai ujian ke buku nilai kini memberi tahu jumlah murid yang dilewati karena
  tidak mengambil mapel, dan galat `student_not_taking_subject` memiliki pesan terjemahan.
- **Berita acara musyawarah dewan pendidik dan tinggal kelas di tingkat akhir.** Halaman baru "Berita acara" (dari tombol di halaman
  Kenaikan kelas) mencatat hasil rapat dewan pendidik per tahun ajaran: jenis rapat (kenaikan kelas, kelulusan, lainnya), tanggal,
  tempat, kelas opsional, agenda, ringkasan, ketua, sekretaris, dan peserta (guru atau nama bebas, peran, jabatan). Keputusan
  kenaikan murid ditautkan ke berita acara, di wizard Kenaikan kelas (per murid atau per kelas) atau dengan mencentang murid di
  berita acara; menautkan tidak mengubah keputusan, dan tanggal musyawarah murid mengikuti tanggal berita acara. Rekap (jumlah naik,
  tinggal, dan lulus total dan per kelas, serta daftar murid tinggal kelas dengan alasan dan tindak lanjut) dihitung dari keputusan
  tertaut; saat berita acara difinalkan rekap itu dibekukan dan keputusan tertaut terkunci (409 `meeting_final`) sampai berita acara
  dibuka kembali. Berita acara dapat dicetak atau disimpan sebagai PDF dari peramban. Endpoint baru `GET/POST /v1/council-meetings`,
  `GET/PUT/DELETE /v1/council-meetings/{id}`, `POST /v1/council-meetings/{id}/finalize`, `POST .../reopen`,
  `PUT .../decisions`, dan laporan ringkas `GET /v1/academic-years/{id}/promotions/summary` (baca: `report_card:read_all`; tulis:
  `promotion:manage`). `PUT /v1/academic-years/{id}/promotions` menerima `meetingId` per baris (dihilangkan = dipertahankan) dan
  daftar keputusan mengembalikannya hanya bila tertaut. Migrasi 0103 (aditif): tabel `council_meeting` dan
  `council_meeting_attendee` (RLS dan kunci asing komposit) serta kolom `promotion_decision.meeting_id` (boleh kosong).
- **Tinggal kelas di tingkat akhir kini mendapat kelas tujuan.** Salin tahun ajaran menyalin kelas tingkat akhir (nama dan tingkat
  sama, beserta wali kelas dan penugasan guru) hanya bila sudah ada murid yang diputuskan tinggal kelas di kelas itu (parameter
  `copyFinalLevelForRetained`, bawaan true; peringatan `final_level_copied_for_retained`); bila kelas sebaya hasil kenaikan dengan
  nama yang sama sudah ada, murid itu bergabung di sana tanpa salinan. Di langkah Keputusan siswa, murid tingkat akhir yang tinggal
  kelas dapat dipilihkan kelas tujuan eksplisit di tahun tujuan. Tanpa kelas tujuan, murid tetap dilaporkan `no_target_class` seperti
  sebelumnya. Pendaftaran tahun sumber tidak dihapus sehingga riwayat rombel utuh. Tanpa keputusan tinggal kelas di tingkat akhir,
  hasil salin tahun ajaran tidak berubah.
- **Kelulusan.** Halaman baru "Kelulusan" (dari tombol di halaman Kenaikan kelas dan menu samping) untuk sekolah yang ingin menetapkan
  kelulusan secara formal. Per tahun ajaran, sekolah mengatur kriteria: bobot nilai rapor dan bobot tiap ujian sekolah (jumlah bobot
  tidak harus 100; yang dipakai porsinya), rapor yang dipakai (tahun terakhir, semua rapor final, atau tingkat tertentu), pembulatan,
  rata-rata minimal, nilai minimal mapel wajib, daftar mapel wajib, teks kriteria, tanggal pengumuman, dan templat nomor SKL. Tidak ada
  angka bawaan: semuanya pilihan sekolah. Sekolah mencatat ujian sekolah (nama dan bentuk bebas) dan nilainya per murid dan mapel
  (ketik atau tempel dari spreadsheet). Edusync menghitung SARAN nilai kelulusan per mapel dan rata-rata dari nilai rapor (hanya
  dari rapor yang sudah final; tidak pernah dihitung ulang dari data hidup) dan nilai ujian, menandai murid yang rapornya belum final
  atau nilainya belum lengkap, dan menjelaskan kriteria yang belum terpenuhi; sekolah yang menetapkan hasilnya (lulus, tidak lulus,
  atau ditunda) dengan tanggal kelulusan, catatan, dan berita acara opsional. Penetapan membekukan transkrip (nilai rapor per
  semester, nilai ujian, nilai kelulusan per mapel, rata-rata, kriteria yang dipakai), membuat nomor SKL dari templat, dan menulis
  keputusan kenaikan murid (lulus menjadi `graduate`, tidak lulus menjadi `retain`, ditunda tidak ditulis). Rapor yang belum final
  atau nilai yang belum lengkap hanya dapat ditetapkan dengan `force` dan alasan tertulis yang ikut dibekukan. Penetapan dapat dibuka
  kembali (transkrip dibuang dan keputusan kenaikan yang ditulisnya dicabut; nomor SKL tetap) selama keputusan kenaikannya belum
  diterapkan atau berita acara tertaut belum final. Nomor ijazah diketik operator (unik per sekolah; Edusync tidak membuat format dan
  tidak mencetak ijazah) dan boleh dicatat setelah penetapan final. SKL dan transkrip dicetak atau disimpan sebagai PDF dari peramban.
  Status murid `graduated` tetap hanya berubah saat kenaikan kelas diterapkan. Tahun ajaran dengan kriteria kelulusan: keputusan
  `graduate` di wizard kenaikan hanya berlaku bila sudah ditetapkan (409 `graduation_not_determined`; keputusan yang berbeda dari
  penetapan final ditolak 409 `graduation_final`) dan penerapan melewati keputusan lulus yang belum ditetapkan
  (`graduation_not_determined` pada `unplaced`). Sekolah tanpa kriteria kelulusan identik dengan sebelumnya. Penetapan final
  mengunci kriteria, ujian, dan nilai ujian tahun itu (409 `graduation_final`). Endpoint baru: `GET/PUT/DELETE
  /v1/academic-years/{id}/graduation-policy`, `GET/POST /v1/academic-years/{id}/school-exams`, `PUT/DELETE /v1/school-exams/{id}`,
  `GET/PUT /v1/school-exams/{id}/scores`, `GET/PUT /v1/academic-years/{id}/graduations`, `POST .../graduations/finalize`, `POST
  .../graduations/reopen`, dan `PUT .../graduations/diploma-numbers` (izin baru `graduation:read` untuk Admin sekolah, Kurikulum,
  Kepala sekolah, dan Operator; `graduation:manage` untuk Admin sekolah dan Kurikulum; modul `grades`). Daftar keputusan kenaikan
  memuat `graduationPolicy` dan `graduationResult` hanya bila tahun itu punya kriteria. Migrasi 0104 (aditif): tabel
  `graduation_policy`, `school_exam`, `school_exam_score`, dan `graduation_decision` (RLS, kunci asing komposit, CHECK, dan nomor
  unik per sekolah).
- **Jadwal paralel dan kelas gabungan.** Satu slot jadwal kelas (hari + jam) kini boleh berisi beberapa sel pada jalur (`lane` 0 sampai 9)
  berbeda, hanya bila semua mata pelajaran di slot itu bermode pilihan (`selected`) di kelas itu; selain itu ditolak 400
  `parallel_requires_selected` (sel tunggal di jalur 0 tetap boleh berisi mapel apa pun). Beberapa rombel dapat membentuk satu
  pertemuan gabungan lewat `combinedKey` yang sama: sel di kelas berbeda dengan guru, mapel, hari, jam, dan cakupan (setahun atau
  semester) yang sama tidak dihitung bentrok guru (`teacher_busy`); anggota yang tidak cocok ditolak 400 `combined_mismatch`. Tanpa
  `combinedKey`, `teacher_busy` persis seperti sebelumnya, dan seorang guru tetap tidak bisa mengisi dua jalur di slot yang sama.
  `PUT /v1/schedule/cell` menerima `lane` dan `combinedKey` opsional, `DELETE /v1/schedule/cell` menerima `lane` (bawaan 0), dan
  `GET /v1/schedule` memuat `lane` dan `combinedKey` hanya pada sel yang bukan bawaan (sparse). Halaman Jadwal pelajaran menampilkan
  beberapa kartu per slot (label Paralel dan Gabungan), tombol Tambah jalur paralel, dan pilihan Pertemuan gabungan dengan kelas lain
  (id, en, su; bantuan di artikel Pilihan mata pelajaran). Sekolah yang tidak memakai jalur paralel atau kelas gabungan tidak melihat
  perubahan apa pun. Absensi per jam, jadwal hari ini, dan laporan jam belum diisi masih memperlakukan tiap sel sebagai sel biasa
  (roster pengambil dan absensi gabungan menyusul di tahap berikutnya). Migrasi 0105: kolom `lane` dan `combined_key` pada
  `schedule_entry` (berdefault aman, tanpa backfill) dan penggantian indeks unik jadwal: indeks slot kelas kini menyertakan `lane`,
  indeks slot guru dibatasi pada sel tanpa kunci gabungan (indeks baru dibuat sebelum yang lama dihapus; keunikan lama terjaga
  persis karena semua baris lama berjalur 0 dan tanpa kunci).
- **Absensi per jam untuk mapel pilihan dan pertemuan gabungan** (tahap 3B.4). Lembar absensi satu jam (`GET` dan `PUT
  /v1/lesson-attendance`) untuk mapel yang berpenanda pilihan di rombelnya kini hanya memuat murid yang mengambil mapel itu pada
  semester tanggal tersebut; menyimpan untuk murid yang tidak mengambil ditolak 400 `invalid_reference`. Mapel tanpa penanda
  persis seperti sebelumnya. Endpoint baru `GET` dan `PUT /v1/lesson-attendance/combined` (izin `attendance:read` ditambah guru
  jadwal, guru piket, atau `attendance:configure`, sama dengan absensi satu jam): lembar satu pertemuan gabungan menggabungkan murid
  semua sel ber-`combinedKey` sama, dan satu kali simpan menulis baris `lesson_attendance` ke sel rombel masing-masing murid (skema
  tidak berubah; semua atau tidak sama sekali). Rapor final salah satu murid pada semester tanggal itu menolak 409 `report_final`
  (pada absensi satu jam tetap tanpa penjaga ini seperti sebelumnya). `GET /v1/lessons` dan `GET /v1/attendance/report/lessons-unfilled`
  menghitung `total` dari murid pengambil untuk mapel pilihan dan memuat `lane` serta `combinedKey` hanya bila dipakai (sparse); jam
  tanpa satu pun pengambil tidak pernah dianggap belum diisi, juga pada hitungan `lessons.unfilled` di dasbor. Kartu jam di halaman
  Absensi per jam berlabel Gabungan atau Jalur, dengan tombol Isi bersama dan lembar yang dikelompokkan per rombel (id, en, su;
  bantuan di artikel Pilihan mata pelajaran).
- **Pilihan mapel ikut tahun ajaran baru.** `POST /v1/academic-years/:id/rollover` menyalin penanda mapel pilihan rombel ke kelas hasil
  salinan (`copySubjectChoices`, bawaan true; kelas tujuan yang sudah punya penanda tidak diubah; `participationCopied`, hanya
  bila ada). `POST /v1/academic-years/:id/promotions/apply` membawa pilihan mapel setahun murid yang ditempatkan (`promote` dan `retain`)
  ke tahun tujuan bila kelas tujuannya juga menandai mapel itu pilihan (`copySubjectChoices`, bawaan true): hasil memuat
  `choicesCopied` dan `choicesDropped` (mapel yang tak lagi berpenanda di kelas tujuan), keduanya hanya bila murid punya pilihan.
  Pilihan per semester tidak dibawa, pilihan yang sudah ada di tahun tujuan tidak ditimpa, dan penempatan murid tidak memperhitungkan
  pilihan. Sekolah tanpa mapel pilihan mendapat respons yang sama persis seperti sebelumnya. Tanpa migrasi baru.
- **Ekspor akademik generik** (tahap 3C.5): halaman Ekspor data dan `GET /v1/exports/academic` (`academicYearId`, `semesterId`,
  `dataset`, `format=csv|json`) untuk lima dataset: `rombel`, `class_subjects`, `subject_choices`, `final_grades`, `descriptions`. Format
  `edusync-academic-v1` milik Edusync, BUKAN format impor e-Rapor, Dapodik, atau EMIS (tidak ada klaim kompatibilitas); kode identitas
  (NPSN, NISN, NIS, kode mapel sekolah dan acuan) disertakan untuk pemetaan manual. Nilai akhir dan deskripsi hanya dari snapshot
  rapor final (draf tidak pernah ikut); NIK tidak pernah disertakan dan tidak ada opsi untuk menyertakannya. CSV UTF-8 dengan BOM,
  pemisah `;`, sel berawalan rumus diberi apostrof; JSON memuat kamus kolom. Izin baru `data_export:run` (admin sekolah, kurikulum,
  operator; menyebar ke sekolah lama lewat sinkron peran); dataset nilai dan deskripsi memerlukan modul `grades` (400
  `dataset_requires_module`). Setiap ekspor tercatat di jejak audit. Tanpa migrasi baru.
- **Kerangka profil kokurikuler** (fase 4, tahap 4.1; rancangan: `docs/rancangan-fase-4-kokurikuler-madrasah.md`): halaman Pengaturan
  kokurikuler (Nilai dan rapor) untuk mengadopsi kerangka profil dan mengisi rubrik tingkat capaian. Kerangka acuan global
  `GET /v1/reference/profile-frameworks`: `profil_lulusan_2025` (delapan dimensi, Permendikdasmen 13/2025 Pasal 17, sumber resmi; ejaan
  label belum dicocokkan dengan lampiran) dan `panca_cinta_2025` (lima topik, Kepdirjen Pendis 6077/2025, bertanda SUMBER SEKUNDER:
  nama dan urutan dari halaman kanwil, bukan teks resmi; hanya untuk jenjang MI, MTs, MA, MAK). Sekolah mengadopsi lewat
  `POST /v1/cocurricular/profile-items/adopt` (idempoten, tidak menimpa label yang sudah diubah; 400 `framework_not_for_profile`),
  lalu menyimpan daftar butir lewat `GET/PUT /v1/cocurricular/profile-items` (ubah label, nonaktifkan, tambah butir sendiri) dan rubrik
  lewat `GET/PUT /v1/cocurricular/rubric-levels` (maks. 12 tingkat; isian contoh Sangat Baik, Baik, Cukup, Kurang hanya saran di layar,
  bukan data bawaan). Tidak ada baris yang dibuat otomatis saat sekolah dibuat; sekolah yang tidak memakainya identik dengan sebelumnya.
  Izin baru `cocurricular:read` (admin sekolah, kepala sekolah, kurikulum, operator, guru) dan `cocurricular:manage` (admin sekolah,
  kurikulum), menyebar ke sekolah lama lewat sinkron peran; modul `grades`. Migrasi 0106 (empat tabel baru: dua acuan global, dua tabel
  sekolah ber-RLS; tanpa kolom baru pada tabel lama). Kokurikuler bukan mapel dan tidak memengaruhi nilai, peringkat, kenaikan, atau
  kelulusan. Program, penilaian, dan rapor kokurikuler menyusul di tahap 4.2 sampai 4.4.
- **Program kokurikuler** (fase 4, tahap 4.2): halaman Program kokurikuler (Nilai dan rapor) berisi daftar program per tahun ajaran
  (kartu di ponsel, tabel di layar lebar; guru dengan izin baca hanya melihat) dan halaman detail untuk mengelola rombel peserta,
  butir sasaran (dimensi profil lulusan atau topik Panca Cinta milik sekolah), serta koordinator dan fasilitator. Bentuk program:
  kolaboratif, 7 Kebiasaan Anak Indonesia Hebat, atau lainnya; satu semester atau sepanjang tahun; status draf, aktif, atau ditutup.
  Endpoint `GET/POST /v1/cocurricular/programs`, `GET/PUT/DELETE /v1/cocurricular/programs/:id`, `PUT .../classes`, `.../targets`,
  `.../facilitators` (ganti seluruh daftar), dan `GET /v1/cocurricular/periods-summary` (rencana JP program dibandingkan JP kokurikuler
  pada alokasi kurikulum per tingkat; hanya peringatan, tidak pernah menolak). Butir kerangka yang sudah menjadi sasaran program tidak
  bisa dihapus (409 `item_in_use`; nonaktifkan saja). Tanpa izin baru (memakai `cocurricular:read` dan `cocurricular:manage` dari 4.1);
  modul `grades`. Migrasi 0107 (empat tabel tenant baru ber-RLS dengan FK komposit; tanpa kolom baru pada tabel lama, tanpa baris
  otomatis). Penilaian murid, bukti, dan bagian rapor menyusul di tahap 4.3 dan 4.4; kokurikuler tetap bukan mapel dan tidak
  memengaruhi nilai, peringkat, kenaikan, atau kelulusan.
- **Penilaian kokurikuler** (fase 4, tahap 4.3): tab Penilaian dan Bukti pada halaman program kokurikuler. Guru menilai tiap murid pada
  butir sasaran program per semester dan rombel dengan satu tingkat rubrik sekolah dan/atau catatan (maks. 1000 karakter); hanya
  penilaian sumatif yang disimpan. Layar: kartu per murid di ponsel, matriks murid x butir dari lebar `lg`, isi massal per butir, simpan
  eksplisit dengan penanda belum disimpan (batch dibagi otomatis per 500 sel). Endpoint `GET /v1/cocurricular/programs/:id/assessments`
  dan `.../assessment-options`, `PUT .../assessments` (upsert; sel kosong menghapus), serta `GET/POST/DELETE .../evidence` (bukti karya
  hanya TAUTAN https, maks. 500 karakter, per rombel atau program; unggah berkas belum ada). **Hak menilai kontekstual** tanpa izin baru:
  `cocurricular:manage`, koordinator program (semua rombel program), atau fasilitator rombel itu; gerbang rute cukup
  `cocurricular:read`. Guru lain ditolak (403) dan tidak melihat penilaian rombel yang bukan miliknya (kepala sekolah, kurikulum, dan
  operator melihat semua tanpa dapat mengubah). Galat baru: 409 `report_final` (rapor murid itu pada semester itu sudah final; buka
  kembali dulu), 409 `program_closed`, 400 `student_not_in_class`, 400 `too_many_items` (> 500 sel), 400 `invalid_url`. Program yang
  sudah dinilai tidak bisa dihapus, dan rombel atau butir yang sudah dinilai tidak bisa dilepas dari program: 409
  `cocurricular_assessed` (atau `report_final` bila penilaian itu ada pada rapor yang sudah final); tingkat rubrik yang sudah dipakai
  tidak bisa dihapus (409 `item_in_use`; nonaktifkan). Migrasi 0108 (dua tabel tenant baru ber-RLS dengan FK komposit; tanpa kolom baru
  pada tabel lama, tanpa baris otomatis). Kokurikuler tetap bukan mapel dan tidak memengaruhi nilai, peringkat, kenaikan, atau
  kelulusan; bagian rapor kokurikuler menyusul di tahap 4.4.
- **Rapor kokurikuler** (fase 4, tahap 4.4): dokumen rapor memuat bagian terstruktur `cocurricular` (per program: butir, tingkat rubrik,
  catatan) HANYA bila murid punya penilaian pada program yang diatur tampil di rapor. Murid tanpa penilaian: dokumen dan snapshot
  persis seperti sebelumnya (kunci tidak ada, bentuk data versi 1). Bagian ini ikut dibekukan di snapshot beserta nama butir dan
  tingkatnya (mengganti label sesudah final tidak mengubah rapor; buka kembali untuk memperbarui), terbaca di respons staf dan portal
  orang tua, serta digambar di pratinjau dan PDF. Di Catatan rapor ada tombol "Susun dari penilaian kokurikuler" yang menyusun draf
  deskripsi di layar ke kolom Catatan kokurikuler; guru menyunting dan menyimpannya lewat `PUT /v1/report-cards/sections`, server
  tidak pernah mengisi catatan itu otomatis. Kokurikuler yang belum dinilai TIDAK menghalangi finalisasi: daftar rapor
  (`GET /v1/report-cards`) hanya menambah lencana info sparse `cocurricularMissing: true` bagi murid berstatus draf yang rombelnya ikut
  program kokurikuler aktif yang tampil di rapor tetapi belum dinilai pada semester itu. Tanpa migrasi dan tanpa kolom baru. Bantuan
  baru "Kokurikuler di rapor" (id/en/su).
- **Madrasah** (fase 4, tahap 4.5; migrasi 0109): kolom NSM (8 sampai 16 angka, rentang longgar karena format resmi belum diverifikasi) di Pengaturan
  sekolah tab Identitas, hanya untuk jenjang berotoritas Kemenag (MI, MTs, MA, MAK). Disimpan di tabel baru `school_identifier` (bukan kolom
  `school`; tanpa baris otomatis), unik lintas sekolah (409 `nsm_taken`), diubah lewat `GET/PUT /v1/school/identifier` (izin
  `school:manage`; galat `invalid_nsm`, `nsm_not_applicable`). NSM yang terisi masuk dokumen rapor sebagai kunci sparse `schoolNsm` dan
  tampil di kop pratinjau, PDF, dan portal; ikut dibekukan di snapshot. Sekolah tanpa NSM: dokumen persis seperti sebelumnya. Bank
  kurikulum KMA kini memuat lima nama mapel rumpun PAI dan Bahasa Arab (Al-Qur'an Hadis, Akidah Akhlak, Fikih, SKI, Bahasa Arab)
  untuk MI dan MA, selain MTs; tanpa jam pelajaran dan tanpa mapel khusus MA karena KMA 1503/2025 belum terbaca. Adopsi KMA memberi
  salinan lima mapel itu kelompok `pai_arabic`, dan madrasah mengadopsi kurikulum umum dan KMA bersamaan. Judul PDF rapor, label NSM,
  dan bagian Penilaian kokurikuler di PDF kini mengikuti bahasa pengguna (id/en/su). Bantuan baru "Madrasah" (id/en/su).
- **SMK: struktur keahlian** (fase 5, tahap 5.1; migrasi 0110): hierarki Bidang, Program, dan Konsentrasi Keahlian yang diisi sekolah sendiri
  (tanpa seed: daftar resmi berbeda antarsumber dan lampiran 244/M/2024 belum terbaca; kode Dapodik dan rujukan sumber opsional).
  Tabel baru `vocational_field`, `vocational_program`, `vocational_concentration`, `program_concentration` (tautan jurusan unit kelas ke
  konsentrasi, satu konsentrasi boleh dipakai dua jurusan 3 dan 4 tahun; bukan kolom baru di `program`), dan `vocational_setting`
  (satu baris per sekolah, hanya dibuat saat disimpan). Semua tabel ber-RLS dengan FK komposit. Endpoint `/v1/vocational/fields`,
  `/v1/vocational/programs-of-expertise`, `/v1/vocational/concentrations` (daftar, buat, ubah, hapus; 409 `in_use` bila masih punya
  isi atau tautan) dan `PUT /v1/programs/{id}/concentration`, memakai izin `class:read` dan `class:manage`, bergerbang modul
  `internship` dan hanya jenjang kejuruan (404 `not_vocational`). Halaman baru Kelas, tombol Keahlian (/classes/expertise) dengan
  hierarki bertingkat yang dapat dibuka, dan pilihan konsentrasi di dialog Jurusan. Tanpa perubahan pada kelas, nilai, atau rapor.
- **SMK: rapor berkelompok** (fase 5, tahap 5.2; tanpa migrasi): sakelar baru `GET/PUT /v1/vocational/settings/report` (izin
  `report_card:read` dan `report_card:manage`; bawaan mati) di Pengaturan rapor. Bila menyala, dokumen rapor memuat kunci sparse
  `subjects[].group` (kelompok mapel dari `ref_subject_group`: kunci, label Indonesia, dan bagian; dibekukan di snapshot), mapel diurut
  per kelompok (mapel tanpa kelompok di akhir), dan `expertise` (bidang, program, konsentrasi) bila jurusan rombel ditautkan ke
  konsentrasi. Pratinjau, PDF, dan portal menampilkan subjudul kelompok dan identitas keahlian di kop. Sekolah non-SMK dan SMK tanpa
  sakelar: dokumen, snapshot, leger, saran kelulusan, dan ekspor identik dengan sebelumnya. Bantuan baru "SMK: bidang, program,
  konsentrasi keahlian dan rapor berkelompok" (id/en/su).
- **SMK: PKL ditautkan ke rapor** (fase 5, tahap 5.3; migrasi 0111, aditif): periode PKL kini dapat ditautkan ke semester dan mapel PKL
  (`pkl_period.semester_id` dan `subject_id`, berpasangan, FK komposit; mapel harus aktif dan berjenis PKL, semester pada tahun ajaran
  periode) lewat `semesterId` dan `subjectId` opsional di `POST/PUT /v1/pkl/periods` (galat `pkl_link_incomplete` dan
  `invalid_reference`; dihilangkan saat mengubah = tautan tidak berubah, keduanya null = lepas). Bobot penilai sekolah:industri
  (jumlah 100) dan pola nomor sertifikat diatur lewat `GET/PUT /v1/vocational/settings/pkl` (izin `pkl:read` dan `pkl:manage`,
  jenjang kejuruan; `invalid_weights`, `invalid_pattern`); bobot kosong = rumus lama persis (rata-rata penilai yang ada), dengan bobot
  nilai aspek = rata-rata tertimbang penilai yang mengisi (`pklResult(aspects, scores, weights?)`). Nomor sertifikat PKL
  (`pkl_placement.certificate_no`, unik per sekolah): `PUT /v1/pkl/placements/{id}/certificate` dan penomoran massal
  `POST /v1/pkl/periods/{id}/certificates` (pola bawaan `PKL/{seq}/{code}/{year}` hanya usulan; format resmi tidak ada; galat
  `certificate_taken`, `placement_not_completed`); nomor ikut dicetak di sertifikat PDF. Nilai PKL dikunci saat rapor final: mengisi
  nilai lewat staf, guru pembimbing, atau tautan pembimbing industri pada periode tertaut ditolak `409 report_final` (halaman tautan
  menampilkan keterangan terkunci lewat `reportLocked`), begitu pula mengubah nomor sertifikat dan mengganti atau melepas tautan
  semester yang rapornya final. Lembar nilai dan penempatan bertambah kunci `weights`, `certificateNo`, dan `reportLinked`. UI: bagian
  Masuk rapor di formulir periode, kartu Bobot penilai dan Nomor sertifikat di Pengaturan PKL, nomor di panel nilai, dan saran lama
  PKL (792 JP kelas XII program 3 tahun, 1.368 JP kelas XIII program 4 tahun; salinan struktur kurikulum SMK 2022, hanya saran
  berlabel sumber, bukan validasi) di alokasi mapel PKL. Periode tanpa tautan berperilaku persis seperti sebelumnya.
- **SMK: nilai PKL di rapor** (fase 5, tahap 5.4; tanpa migrasi): untuk periode tertaut, nilai akhir PKL menjadi baris mapel PKL di
  `subjects[]` rapor (kunci sparse `source: "internship"`; predikat memakai ambang PKL) dan rincian per penempatan di kunci dokumen
  `internship` (tempat, tanggal, hari hadir menurut jurnal, pembimbing, nilai per aspek, nilai akhir, predikat, nomor sertifikat).
  Hanya murid yang punya penempatan non-batal yang mengambil mapel itu; dua penempatan pada mapel dan semester yang sama dirata-rata.
  Nilai PKL ikut rata-rata, peringkat, dan kelengkapan finalisasi; leger, saran kelulusan, transkrip, dan ekspor nilai akhir ikut
  otomatis lewat snapshot (tanpa jalur baru). Pratinjau, PDF (blok Praktik Kerja Lapangan), dan portal menampilkannya; mode deskriptif
  membuang angka blok PKL di portal. Tanpa periode tertaut dokumen tetap v1 dan identik. Bantuan baru "Nilai PKL di rapor, bobot
  penilai, dan nomor sertifikat" (id/en/su).
- **SMK: UKK, data dan hasil** (fase 5, tahap 5.5; migrasi 0112, aditif; izin baru `ukk:read` dan `ukk:manage`): modul UKK (Uji Kompetensi
  Keahlian) di bawah gerbang modul `internship` dan jenjang kejuruan. Kegiatan per tahun ajaran, semester, dan konsentrasi keahlian
  (`/v1/ukk/events`) dengan tiga pola (`lsp`, `industry`, `independent`), skema/paket soal, level KKNI, LSP, TUK, dan mitra dunia kerja;
  penguji internal (guru) dan eksternal (isian bebas) diganti sekaligus; hasil per murid dengan percobaan (uji ulang sampai 5), nilai
  praktik, teori, dan akhir, kategori yang diturunkan server dari skala dan dibekukan di baris, serta unit kompetensi (paspor keterampilan).
  Penguji internal boleh mengisi hasil kegiatannya tanpa `ukk:manage`. Skala bawaan (Pedoman UKK SMK TA 2025/2026: LSP biner 75; mandiri
  Belum Kompeten < 61, Cukup Kompeten 61-74, Kompeten 75-90, Sangat Kompeten 91-100) hanya usulan berlabel sumber yang dapat ditimpa
  sekolah per pola; skala pola industri tidak disebut eksplisit di sumber, jadi memakai skala LSP dan ditandai "periksa Pedoman". Bobot
  praktik:teori opsional (kosong = nilai akhir diisi langsung). Nomor sertifikat (kompeten) dan surat keterangan (belum kompeten) lewat
  `POST /v1/ukk/events/{id}/numbers` (pola bawaan `UKK/{seq}/{code}/{year}` hanya usulan, idempoten, satu urutan bersama). Penanda sudah
  dilaporkan ke Dinas dan diunggah ke e-Rapor dicatat manual (bukan integrasi). Pengaturan di `GET/PUT /v1/vocational/settings/ukk`.
  Galat baru: `ukk_assessed`, `event_closed`, `student_not_in_concentration`, `too_many_items`, `invalid_bands`, `invalid_attempt`,
  `max_attempts`. UI: `/ukk`, `/ukk/[id]` (Ringkasan, Penguji, Hasil, Dokumen), dan `/ukk/settings`, mobile lebih dulu. Sekolah tanpa data
  UKK: tidak ada perubahan apa pun.
- **SMK: UKK di rapor, kelulusan, dan ekspor** (fase 5, tahap 5.6; tanpa migrasi): sakelar `inReport` (bawaan mati) menambah kunci dokumen
  sparse `ukk` pada rapor (judul kegiatan, pola, konsentrasi, percobaan terakhir bernilai, nilai akhir, kategori beku, nomor), dibekukan
  di snapshot dan hanya memuat kegiatan yang bukan draf; saat menyala, hasil UKK dikunci `409 report_final` bila rapor murid final. Mode
  deskriptif membuang blok di portal. Syarat kelulusan UKK opsional `requireUkkCompetent` pada kebijakan kelulusan: hanya SARAN (kegagalan
  `ukk_not_competent` atau `ukk_missing` pada saran, tidak pernah menolak penetapan; Pedoman tidak menyatakan UKK menentukan kelulusan);
  skor UKK tidak masuk ijazah. Dataset ekspor baru `ukk_results` (semua percobaan kegiatan non-draf, kategori beku, penanda `is_latest`,
  tanpa NIK, CSV/JSON generik pada `GET /v1/exports/academic`; pemetaan ke templat impor e-Rapor SMK tidak dikarang karena formatnya belum
  diverifikasi). Tanpa sakelar dan tanpa syarat: dokumen rapor, snapshot, leger, saran kelulusan, dan ekspor lain identik dengan
  sebelumnya. Bantuan baru "UKK: kegiatan, penguji, hasil, skala, nomor, dan rapor" (id/en/su).

### Diubah

- **Pindah kelas siswa** (`PUT /v1/students/{id}/class`) kini mencatat riwayat rombel (tanggal efektif dan alasan opsional) dan
  ditolak (`report_final`) bila rapor siswa itu, atau rapor kelas lama atau barunya, sudah final pada semester tahun itu yang
  memuat hari ini atau tanggal efektif; buka kembali rapornya lebih dulu. Sebelumnya pindah kelas selalu diterima dan
  menimpa penempatan tanpa jejak. Sekolah tanpa rapor final tidak melihat perbedaan selain adanya riwayat.

### Catatan rollback

- Kembali ke versi sebelum tahap ini aman dan tidak berefek pada angka: kaitan TP, keputusan guru, dan agregasi tidak dipakai
  versi lama, jadi nilai akhir, predikat, rekap, dan rapor tidak berubah. Tabel dan kolom baru dibiarkan. Kriteria per TP di
  konfigurasi beku disimpan di kolom terpisah sehingga versi lama mengabaikannya (tidak ada galat baca); kriteria per TP di
  pengaturan hidup tetap diabaikan pemecah KKM versi lama. Ketercapaian TP tidak tampil selama rollback dan tampil kembali
  setelah maju lagi. Rapor final tidak terpengaruh (snapshot).
- Narasi rapor dari TP (tahap 3.4): tidak berefek pada angka. Setelah kembali ke versi sebelumnya, deskripsi capaian rapor DRAF
  kembali dari predikat (suntingan guru tetap tampil); rapor final aman karena dibaca dari snapshot (teks dan ringkasan TP
  tampil lagi setelah maju). Kolom pengaturan narasi dibiarkan dan diabaikan versi lama.
- Remedial dan pengayaan (tahap 3.5): kebijakan nilai remedial diabaikan setelah kembali ke versi sebelumnya (kembali ke hanya
  mencatat). Sekolah yang memakai kebijakan selain hanya mencatat akan melihat angka DRAF kembali ke skor asli (nilai akhir,
  rekap, leger, portal, dan ketercapaian TP); rapor final aman karena dibaca dari snapshot. Sekolah dengan kebijakan bawaan
  tidak terpengaruh. Pendampingan, peserta, dan percobaan remedial dibiarkan di database dan tampil lagi setelah maju; kolom
  kebijakan di konfigurasi beku diabaikan versi lama. Disarankan rollback hanya sebelum sekolah memakai kebijakan lain.
- Pilihan mata pelajaran per murid (tahap 3B.1): tabel `class_subject_participation`, `student_subject_enrollment`,
  `subject_choice_rule`, dan `subject_choice_rule_subject` dibiarkan di database; versi lama tidak membacanya sehingga tidak ada
  efek pada nilai, rapor, jadwal, atau absensi (tahap ini memang belum memakainya). Data pilihan tetap ada dan tampil lagi setelah
  maju. Izin `subject_choice:manage` pada peran sekolah dibiarkan dan diabaikan versi lama.
- Pilihan mapel memengaruhi nilai, rapor, dan portal (tahap 3B.2): tidak ada tabel atau kolom baru. Setelah kembali ke versi
  sebelumnya, sekolah yang memakai penanda "berdasarkan pilihan" akan melihat DRAF rapor, rekap, matriks, dan portal kembali
  memuat semua mapel rombel untuk semua murid (murid yang tidak mengambil mapel tampil dengan nilai kosong dan rapor "belum
  lengkap" sampai maju lagi); lembar skor kembali menerima skor untuk semua murid rombel. Skor yang sudah tersimpan tidak
  hilang. Rapor final aman karena dibaca dari snapshot (hanya berisi mapel yang diambil murid). Sekolah tanpa penanda tidak
  terpengaruh.
- Berita acara musyawarah dan tinggal kelas di tingkat akhir (tahap 3C.3): tabel `council_meeting` dan `council_meeting_attendee`
  serta kolom `promotion_decision.meeting_id` dibiarkan di database dan tampil lagi setelah maju. Setelah kembali ke versi
  sebelumnya, halaman dan endpoint berita acara tidak ada; versi lama mengabaikan `meeting_id` sehingga keputusan kenaikan tetap
  berlaku apa adanya (tanggal musyawarah murid yang sudah terisi tidak berubah) dan penguncian oleh berita acara final tidak
  berlaku. Kelas tingkat akhir yang sudah disalin untuk murid yang tinggal kelas tetap ada (kelas biasa) dan murid yang sudah
  ditempatkan di dalamnya tetap di sana; salin tahun ajaran versi lama kembali tidak menyalin kelas tingkat akhir.
- Jadwal paralel dan kelas gabungan (tahap 3B.3): kolom `lane` dan `combined_key` dibiarkan di database. Setelah kembali ke versi
  sebelumnya, sel berjalur lebih dari 0 dan sel bergabung tampil sebagai sel biasa (beberapa kartu di slot yang sama bisa tampil
  tumpang tindih di kisi lama dan tidak dapat diedit) dan tidak ada galat baca. Indeks unik lama (satu sel per kelas per slot, satu
  sel per guru per slot) tidak ada lagi: bila versi lama dipasang ulang dengan `drizzle` dan masih ada baris berjalur lebih dari 0 atau
  ber-kunci, pembuatan indeks lama gagal sampai baris itu dikosongkan. Sekolah yang tidak memakai jalur paralel atau kelas gabungan
  tidak terpengaruh.
- Absensi gabungan dan pilihan mapel pada rollover (tahap 3B.4): tanpa migrasi, jadi tidak ada yang tertinggal di database selain
  baris yang sudah ditulis (penanda mapel pilihan dan pilihan murid di tahun tujuan, absensi per sel). Setelah kembali ke versi
  sebelumnya, lembar absensi satu jam memuat seluruh murid rombel lagi (termasuk yang tidak mengambil mapelnya) dan jumlah
  `total` kembali menghitung seluruh rombel; absensi yang sudah tercatat tetap utuh.
- Ekspor akademik generik (tahap 3C.5): tanpa migrasi dan tanpa tabel baru; hanya izin `data_export:run` ditambahkan ke peran. Setelah
  kembali ke versi sebelumnya rute ekspor hilang dan izin itu diabaikan; baris jejak audit `export.academic` yang sudah ada tetap.
- Kerangka profil kokurikuler (tahap 4.1): tabel `ref_profile_framework`, `ref_profile_framework_item`, `school_profile_item`, dan
  `cocurricular_rubric_level` serta izin `cocurricular:read` dan `cocurricular:manage` dibiarkan di database dan tampil lagi setelah
  maju. Setelah kembali ke versi sebelumnya halaman dan endpoint kokurikuler tidak ada; tidak ada efek pada nilai, rapor, kenaikan,
  atau kelulusan karena belum ada yang membacanya.
- Program kokurikuler (tahap 4.2): tabel `cocurricular_program`, `cocurricular_program_target`, `cocurricular_program_class`, dan
  `cocurricular_facilitator` dibiarkan di database. Setelah kembali ke versi sebelumnya halaman dan endpoint program tidak ada dan
  penghapusan butir kerangka tidak lagi dicegah (FK database tetap menolak menghapus butir yang masih menjadi sasaran program).
- Penilaian kokurikuler (tahap 4.3): tabel `cocurricular_assessment` dan `cocurricular_evidence` dibiarkan di database. Setelah kembali ke
  versi sebelumnya tab dan endpoint penilaian/bukti tidak ada dan tidak berefek pada nilai, rapor, kenaikan, atau kelulusan (belum ada
  yang membacanya). Penjagaan 409 saat menghapus program, melepas rombel/butir, atau menghapus tingkat rubrik yang sudah dinilai tidak
  berlaku di versi lama; FK database (NO ACTION) tetap menolak penghapusan itu (galat umum, bukan 409), jadi data penilaian tidak
  hilang. Sekolah yang belum menilai tidak terpengaruh.
- Madrasah (tahap 4.5): tabel `school_identifier` dan mapel acuan KMA untuk MI/MA dibiarkan di database. Setelah kembali ke versi sebelumnya
  kolom NSM tidak ada dan kunci `schoolNsm` pada snapshot rapor final diabaikan (rapor tetap terbaca tanpa NSM); mapel sekolah yang sudah
  diadopsi tetap utuh. Tidak ada efek pada nilai, kenaikan, atau kelulusan.
- SMK (tahap 5.1 dan 5.2): tabel struktur keahlian dan `vocational_setting` dibiarkan di database. Setelah kembali ke versi sebelumnya
  hierarki keahlian dan sakelar tidak terbaca, rapor tidak lagi berkelompok, dan kunci `group` serta `expertise` pada snapshot rapor final
  diabaikan (rapor tetap terbaca tanpa keduanya). Tidak ada efek pada nilai, kenaikan, atau kelulusan.
- SMK (tahap 5.3 dan 5.4): kolom `pkl_period.semester_id`/`subject_id`, `pkl_placement.certificate_no`, dan kolom bobot/pola di
  `vocational_setting` dibiarkan di database. Setelah kembali ke versi sebelumnya periode tertaut diperlakukan tanpa tautan: baris PKL
  hilang dari rapor DRAF (rapor final aman, dibaca dari snapshot; kunci `internship` dan `source` diabaikan), bobot penilai diabaikan
  (nilai kembali rata-rata penilai) dan nilai PKL tidak lagi terkunci saat rapor final. Tidak ada tabel baru; tidak ada efek pada sekolah
  yang tidak menautkan periode.
- SMK (tahap 5.5 dan 5.6): tabel `ukk_event`, `ukk_assessor`, `ukk_result`, kolom skala/bobot/sakelar/pola di `vocational_setting`, dan
  constraint `pkl_partner_school_id_uq` dibiarkan di database. Setelah kembali ke versi sebelumnya menu dan rute UKK tidak ada, data
  tetap tersimpan, kunci `ukk` pada snapshot rapor final diabaikan (rapor tetap terbaca tanpa blok UKK), rapor draf tidak lagi memuat
  UKK, dan syarat kelulusan UKK tidak diperiksa. Tidak ada efek pada nilai, kenaikan, atau kelulusan.
- Rapor kokurikuler (tahap 4.4): tanpa migrasi. Snapshot rapor final yang sudah memuat `cocurricular` tetap utuh di database; versi lama tidak
  membacanya (kunci itu diabaikan saat respons dibentuk), sehingga rapor final tetap terbaca seperti rapor tanpa bagian kokurikuler
  terstruktur. Tidak ada efek pada nilai, kenaikan, atau kelulusan.
- Kelulusan (tahap 3C.4): tabel `graduation_policy`, `school_exam`, `school_exam_score`, dan `graduation_decision` serta izin
  `graduation:read` dan `graduation:manage` dibiarkan di database dan tampil lagi setelah maju. Setelah kembali ke versi
  sebelumnya, halaman dan endpoint kelulusan tidak ada dan keputusan `graduate` di wizard kenaikan kembali bebas dipilih (penjaga
  `graduation_not_determined` tidak berlaku) serta diterapkan seperti biasa. Keputusan kenaikan yang sudah ditulis oleh penetapan
  tetap berlaku apa adanya, jadi murid yang sudah ditetapkan lulus tetap lulus saat kenaikan diterapkan; transkrip beku, nomor SKL,
  dan nomor ijazah tetap tersimpan tetapi tidak dapat dilihat sampai maju lagi. Sekolah tanpa kriteria kelulusan tidak terpengaruh.
- Legger kelas (tahap 3C.2): tidak ada tabel atau kolom baru. Setelah kembali ke versi sebelumnya halaman Legger dan endpoint-nya
  tidak ada; tidak ada efek pada nilai atau rapor (leger Excel lama di halaman Rapor tetap tersedia).
- Mutasi murid dan riwayat rombel (tahap 3C.1): tabel `student_transfer` dan `enrollment_change` dibiarkan di database dan
  tampil lagi setelah maju. Setelah kembali ke versi sebelumnya, murid berstatus pindah kembali dikecualikan dari daftar rapor
  kelas (rapor final mereka tetap aman di snapshot dan tetap terbaca lewat dokumen tunggal), dan membuka kembali lalu
  memfinalkan ulang rapor kelas tidak lagi menyertakan mereka; pindah kelas kembali menimpa penempatan tanpa riwayat dan tanpa
  penjaga `report_final`; larangan semester genap tingkat akhir tidak berlaku (hanya berlaku lewat halaman mutasi). Status murid
  yang diubah lewat mutasi tetap pada nilainya.

## [0.4.0] - 2026-11-13

Fase 3 (asesmen dan rapor), tahap 3.2: komponen rapor tambahan dan tanggapan orang tua. Rapor sekolah yang tidak memakai
bagian baru tetap sama persis dengan sebelumnya (bentuk data versi 1); bagian baru hanya muncul untuk siswa yang memakainya.

### Ditambahkan

- **Deskripsi kokurikuler dan catatan perkembangan** per siswa per semester (maksimal 1.000 karakter), diisi oleh wali kelas
  atau pengelola rapor selama rapor masih draf. Catatan perkembangan dipakai pada rapor deskriptif Fase A.
- **Mode rapor deskriptif (Fase A)** per tingkat kelas di pengaturan tingkat. Angka tetap dihitung dan disimpan untuk
  keperluan internal (leger, verifikasi, kenaikan kelas), tetapi tidak ditampilkan di portal wali: dokumen, predikat, KKM,
  peringkat, dan rata-rata disembunyikan. Rapor baru dapat difinalkan bila setiap mata pelajaran sudah punya deskripsi.
- **Nilai di portal disembunyikan untuk kelas bermode deskriptif**: tab nilai dan ikhtisar portal wali tidak lagi memuat angka
  (nilai akhir, predikat, KKM, rata-rata, rata-rata komponen, umpan balik formatif, skor terbaru) bagi anak di tingkat bermode
  deskriptif, dan daftar rapor staf di mode itu menghitung kelengkapan dari deskripsi per mata pelajaran, bukan nilai akhir.
- **Deskripsi capaian manual per mata pelajaran** yang ditulis guru pengampu (atau pengelola rapor), menggantikan deskripsi
  otomatis menurut predikat pada rapor siswa itu. Tetap tersimpan saat rapor dibuka kembali.
- **Tanggapan orang tua/wali atas rapor final** lewat portal (izin baru `portal:respond`, hanya peran Wali, bukan Siswa).
  Satu tanggapan per wali per anak per semester, teks polos maksimal 1.000 karakter, dapat ditulis selama 30 hari sejak rapor
  difinalkan (dapat diatur atau tanpa batas). Hanya terlihat oleh penulisnya, wali kelas, dan pengelola rapor; wali lain tidak
  melihatnya. Staf dapat menyalin tanggapan dari rapor kertas atas nama wali. Bila rapor dibuka kembali dan difinalkan ulang,
  tanggapan lama tetap ada dan ditandai berasal dari versi sebelumnya. Wali yang sudah punya tanggapan tidak dapat dihapus.
- **Pengaturan rapor**: bendera tampilan bagian kokurikuler dan tanggapan wali pada PDF (bawaan mati) dan lama jendela tanggapan.

### Catatan rollback

- Kembali ke versi sebelum tahap ini aman: tabel dan kolom baru dibiarkan dan tidak diubah. Bagian baru rapor (kokurikuler,
  perkembangan, deskripsi manual, mode deskriptif) tidak tampil di versi lama, tetapi snapshot rapor final tetap utuh dan
  tampil kembali setelah maju lagi. Tanggapan wali tidak dapat ditulis selama rollback. Rapor draf di tingkat bermode
  deskriptif kembali menampilkan angka dan predikat selama rollback.

## [0.3.0] - 2026-11-13

Fase 3 (asesmen dan rapor), tahap 3.0 dan 3.1: persiapan internal dan kategori asesmen. Sekolah yang tidak memakai komponen
formatif tidak merasakan perubahan: nilai, predikat, rekap, rapor, dan portal sama persis dengan v0.2.2.

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

### Ditambahkan

- **Kategori asesmen: formatif dan sumatif.** Tiap komponen nilai kini punya kategori. Komponen **sumatif** (bawaan, semua komponen
  yang sudah ada) ikut nilai akhir seperti biasa. Komponen **formatif** (mis. kuis, latihan, observasi) adalah umpan balik: nilainya
  dicatat dan terlihat di rekap, tetapi **tidak pernah** masuk nilai akhir, predikat, peringkat, kelengkapan nilai saat memfinalkan
  rapor, maupun kenaikan kelas. Bobot komponen formatif diabaikan, dan pada mode persentase hanya komponen sumatif yang dihitung ke
  jumlah 100. Mapel yang baru punya penilaian formatif tidak muncul di rapor dan tidak membuat siswa dianggap belum lengkap.
- **Tanda pada penilaian:** asesmen awal (diagnostik) pada komponen formatif, lingkup sumatif (lingkup materi atau akhir
  semester) pada komponen sumatif, dan teknik asesmen. Tanda ini tidak mengubah nilai. Asesmen awal tidak pernah ikut nilai
  akhir.
- **Rekap, matriks leger, dan portal orang tua** menampilkan rata-rata formatif terpisah dari nilai (portal: berlabel "umpan
  balik, tidak masuk nilai rapor"). Rapor dan snapshot tidak memuat formatif; bentuk dokumen rapor tidak berubah.
- **Ujian CBT:** hasil ujian dapat didorong ke komponen formatif (penilaian formatif). Dorong ulang tidak menimpa tanda yang sudah
  diatur guru.
- Mengubah kategori komponen mengubah konfigurasi nilai: ditolak selama semester aktif punya rapor final, sama seperti mengubah
  bobot. Salinan beku konfigurasi semester hanya memuat keterangan kategori bila ada komponen formatif; sekolah tanpa formatif
  tidak berubah sama sekali.
- Migrasi 0096 (aditif, tanpa DROP; nilai bawaan = perilaku sekarang, tanpa pengisian data).

**Catatan rollback.** Versi sebelum rilis ini mengabaikan kategori. Bila rilis ini dibatalkan **setelah ada sekolah yang memakai
komponen formatif**, komponen formatif itu kembali ikut nilai akhir draf (dan salinan beku semester yang memuatnya), sehingga angka
draf dapat berubah. Rapor yang sudah final aman karena dibaca dari snapshot. Disarankan membatalkan hanya sebelum sekolah
memakai komponen formatif.

## [0.2.2] - 2026-11-13

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

## [0.2.1] - 2026-11-13

Perbaikan setelah v0.2.0.

### Diperbaiki

- **Status WhatsApp sekolah bisa salah** bila dua peristiwa klien datang berdekatan (mis. "siap" menimpa "terputus"): penulisan
  status ke `wa_account` kini berurutan per sekolah. Tes worker yang kadang gagal di CI karena hal ini ikut diperbaiki.
- **Lembar nilai ujian dan penilaian ekskul tahun lampau** kini memuat siswa yang sudah lulus (baca-saja, berlencana "Lulus",
  tidak ikut tersimpan), sejalan dengan rapor dan rekap. Tambah anggota, absensi sesi, dan penilaian tetap hanya siswa aktif.
- **Tampilan ponsel**: detail ekstrakurikuler (kartu ringkasan lebih ringkas, tab 2x2, tabel sesi, anggota, penilaian, dan
  laporan menjadi kartu, lembar absensi dengan tombol 44 px), tab penempatan PKL, dan tab Laporan keuangan tidak lagi terpotong
  atau melebar di layar sempit. Tampilan desktop tidak berubah.
- Tes billing dan katalog tidak lagi bergantung pada harga katalog di database (yang bisa diubah operator di konsol platform).

## [0.2.0] - 2026-11-13

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

## [0.1.2] - 2026-11-11

### Ditambahkan

- **Versi tampil di antarmuka**: nomor versi ("Versi 0.1.2") di dasar menu samping panel sekolah dan konsol platform; arahkan
  kursor untuk melihat kode commit. Sumbernya `GET /v1/version` (publik, sama dengan `/version` untuk operasional).

## [0.1.1] - 2026-11-11

Perbaikan setelah v0.1.0 dipasang di server.

### Diperbaiki

- **Port API di server**: port 4000 ternyata dipakai aplikasi lain di server yang sama (`edusync.service` milik aplikasi Node
  lain), sehingga API gagal start (`EADDRINUSE`) setelah deploy v0.1.0. API kini memakai port 4100 (`API_PORT` di `.env`
  server); templat Caddy (`tls-ask`), `init-env.sh`, dan pengecekan versi di workflow Deploy membaca port itu, tidak lagi
  mengunci 4000.
- **Izin peran bawaan tidak sampai ke sekolah yang sudah ada**: migrasi yang membaca tabel `role` (ber-RLS) berjalan sebagai
  pemilik tabel dan melihat nol baris, sehingga `INSERT ... SELECT` untuk izin baru (`account:reset` di migrasi 0079 dan
  `report_card:read_all`/`grade:read_all` di migrasi 0087) tidak menambah apa pun di server. `pnpm db:migrate` kini
  melengkapi izin peran bawaan lewat koneksi platform setelah migrasi (hanya menambah, aman diulang).
- Langkah "Cek versi" di workflow Deploy mencoba ulang sampai API siap, sehingga catatan rilis GitHub tidak terlewat.

## [0.1.0] - 2026-11-11

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

## [0.0.0] - 2026-11-10

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
