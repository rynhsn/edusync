# Wishlist dan sisa pekerjaan

Diperbarui 2 Nov 2026. Status modul M0 sampai M11 ada di `09-rebuild-blueprint.md`. Di sini hanya yang belum selesai atau baru diusulkan.

## A. Akan dikerjakan berikutnya

1. **Pindahkan kartu RFID** dari Pengaturan absensi ke menu sendiri Kehadiran, Kartu RFID, dan tampilkan juga di profil siswa. Pengaturan absensi hanya berisi kebijakan dan perangkat.
2. **Domain sendiri per sekolah, tahap 1.** Tabel `school_domain`, alur verifikasi DNS (CNAME dan TXT), pemeriksaan origin yang membaca domain terverifikasi (bukan `TRUSTED_ORIGINS`), pemetaan domain ke sekolah untuk situs publik dan SPMB. HTTPS otomatis menunggu server produksi.
3. **Verifikasi tampilan di browser** untuk layar yang baru dibuat dan belum pernah dilihat: setelan sekolah, portal akun yayasan (upgrade, tambah unit, bantuan, dokumentasi), konsol platform, halaman impor baru, TimeField, portal wali, pengumuman admin, pengaturan situs. Termasuk mobile 375px dan mode gelap.
4. **PDF belum pernah dilihat di layar:** surat, sertifikat PKL, rapor, kwitansi, laporan tunggakan.
5. **Tombol Kembali yang tersisa:** halaman dengan gaya lama ("← Kembali"), halaman siswa rinci, dan impor kartu RFID saat akses ditolak.
6. **Perbaikan kecil:** tanggal mentah `2026-10-30` di tab anggota ekskul; label tanda tangan rapor ("Wali kelas", "Kepala sekolah") masuk i18n; daftar nama bulan ganda diganti `Intl`.
7. **Tes yang rapuh:** tes platform bergantung pada data sisa di database dev; sediakan skrip pembersih yayasan uji (`yayasan-*`). Tes worker tidak boleh dijalankan selagi worker dev menyala.
8. **Bangun ulang graph graphify** (basi sejak `eb97547`) dan pakai untuk analisis dampak sebelum mengubah skema atau izin.

## B. Wishlist, butuh akun atau keputusan

| Item | Butuh |
| ---- | ----- |
| Pembayaran online wali (gateway untuk SPP) | Akun penyedia pembayaran |
| Uji Midtrans sandbox untuk langganan, termasuk webhook lewat terowongan | Akun Midtrans sandbox |
| WhatsApp platform: satu nomor milik platform untuk notifikasi ke pemilik yayasan (sambutan, invoice, perpanjangan) dengan saluran WhatsApp atau email | Keputusan, nomor khusus |
| Antarmuka pengirim WhatsApp yang bisa diganti ke WhatsApp Business Cloud API (resmi, bayar per pesan, templat disetujui Meta) | Akun Meta Business, keputusan biaya |
| Email SMTP asli, verifikasi email saat daftar, notifikasi masa tenggang | Layanan SMTP |
| Verifikasi dua langkah untuk staf, perintah membuat admin pertama di produksi | Keputusan |
| Hosting produksi, domain dasar final, HTTPS otomatis | Server dan domain |
| Tes E2E otomatis (Playwright atau TestSprite). TestSprite macet saat bootstrap dan tidak bisa menjangkau subdomain sekolah lewat terowongan | Rancangan akses uji tanpa subdomain |
| Tinjauan terjemahan Sunda oleh penutur asli | Penutur asli |
| Dokumentasi fitur di Notion | Otorisasi Notion |

## C. Fitur yang belum ada

- **Dashboard kepala sekolah dan yayasan** (sisa M11), dan laporan lintas modul.
- **Batas tier siswa belum ditegakkan.** `maxStudents` tersimpan di katalog, tetapi tidak ada pengecekan saat siswa ditambah.
- **Kelola pemilik yayasan:** tambah dan hapus pemilik (sekarang hanya daftar).
- **Denda SPP berulang tiap bulan** (sekarang satu tagihan hanya kena denda sekali).
- **Lighthouse minimal 90** untuk situs publik dan situs sekolah di domain luar.
- **Uji beban, tinjauan keamanan, latihan pemulihan cadangan** (M12).
- **Kolom formulir SPMB yang bisa diatur sekolah** (agama, jalur, pilihan jurusan). Fitur besar.
- **Tampilan wali untuk tahfidz** dengan lembar ibadah yang bisa dibaca di portal (cek kelengkapan).

## D. Data dinamis yang masih hardcode (sisa audit)

Prioritas sedang sampai rendah. Yang tinggi sudah dikerjakan (zona waktu, tingkat kelas, semester, hari efektif, metode pembayaran, jatuh tempo denda, kategori ekskul, ambang PKL, format nomor surat, dokumen SPMB, bank kurikulum, parameter penagihan, aturan kirim ulang WhatsApp).

- Templat pesan WhatsApp bawaan belum mengikuti i18n.
- Kebijakan gerbang per hari (jam masuk berbeda tiap hari).
- Daftar item ibadah per sekolah dan kualitas setoran.
- Predikat ekskul A sampai D tanpa ambang atau deskripsi.
- Kategori pengumuman dan batas teks.
- Label status kehadiran (mis. "izin" menjadi "dispensasi").
- Hubungan wali dengan keterangan bebas; alasan siswa keluar sebagai daftar.
- Batas impor, batas laporan, dan batas unggah per tier.
- Rate limit dan masa berlaku undangan lewat env atau pengaturan platform.
- Templat komponen nilai bawaan milik sekolah sendiri.
- Subdomain yang dicadangkan dan batas jumlah unit pendaftaran.

## E. Catatan keputusan

- Guru memegang `student:read`, sehingga bisa melihat daftar seluruh siswa. Perlu diputuskan apakah dibatasi ke kelas yang diampu.
- Dokumen SPMB wajib (KK, akta, pas foto) kini ditegakkan untuk sekolah yang memakai pengaturan bawaan. Ini mengubah perilaku sekolah lama.
- Sesi login terikat per alamat. Layanan uji eksternal yang memakai terowongan tidak bisa menjangkau subdomain sekolah.
