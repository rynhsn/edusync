# Edusync — Rancangan Sistem

Status: **berjalan** (M0–M1 selesai) · Diperbarui: 2026-10-29
Versi interaktif: artifak "Edusync Blueprint". Kebutuhan bisnis awal ada di `Planning/00`–`08`.

Edusync adalah platform manajemen sekolah untuk yayasan dan unit-unit sekolahnya: absensi, nilai, penilaian, SPMB, administrasi, SPP, tahfidz, PKL, dan website, dalam satu sistem multi-tenant.

## 1. Prinsip

- **Satu yayasan, banyak unit.** Tiap unit punya alamat, kurikulum, modul, dan data sendiri. Sekolah tunggal punya satu yayasan tersembunyi, jadi hanya ada satu model.
- **Daftar, bayar, aktif.** Sekolah mendaftar sendiri; setelah pembayaran terkonfirmasi, aktif otomatis.
- **Database menjaga batas.** Isolasi data dipaksa RLS, bukan disiplin penulis kode.
- **Izin menurut peran; satu orang boleh banyak peran** (izin digabung), tanpa akun ganda.
- **Modul dan harga fleksibel.** Katalog di database, bisa diubah tanpa rilis.

## 2. Arsitektur

### 2.1 Modular monolith
Satu API, satu web, satu worker, satu PostgreSQL. Modul dipisah per folder; modul saling memanggil lewat service, bukan repo. Tanpa jaringan antar-modul, jadi tidak ada operasi yang gagal setengah jalan.

### 2.2 Stack

| Lapisan | Pilihan |
| --- | --- |
| Runtime/monorepo | Node 26, pnpm 12 + Turborepo, TypeScript, ESM |
| API | Fastify 5 + fastify-type-provider-zod + @fastify/swagger, Zod 4; OpenAPI otomatis dari route (Scalar di `/docs`) |
| DB & ORM | PostgreSQL 18 + Drizzle ORM + drizzle-kit (migrasi SQL kustom untuk RLS) |
| Auth | Better Auth (email + kata sandi min. 12 karakter, plugin oneTimeToken) |
| Antrean | pg-boss lewat **outbox transaksional**: API menulis `outbox` di transaksi yang sama dengan datanya; worker menyalurkan (SKIP LOCKED + singletonKey). Tanpa Redis |
| Web | Next.js 16, Tailwind v4, shadcn/ui, TanStack Query, openapi-fetch + openapi-typescript (tipe digenerate dari OpenAPI) |
| i18n & tema | next-intl (id, en, su; urutan: cookie → Accept-Language → `id`), next-themes (terang/gelap/sistem); tanggal Sunda diformat sendiri |
| Email | Nodemailer; lokal ke Mailpit |
| Kualitas | Biome, Vitest dengan Postgres nyata (tanpa mock DB) |
| File (saat fitur unggah ada) | Abstraksi `Storage`, S3-compatible, signed URL |
| PDF/Excel/WA (rencana) | `@react-pdf/renderer` di worker, `exceljs`, adapter `NotificationChannel` (Fonnte) |

### 2.3 Struktur repositori

```
edusync/
├─ apps/
│  ├─ api/      # Fastify: routes, identity/guards, scripts (seed-dev, export-openapi)
│  ├─ worker/   # outbox relay, handler email, siklus penagihan
│  └─ web/      # Next.js: halaman utama, daftar, login, bayar, (app), (platform)
├─ packages/
│  ├─ db/        # skema Drizzle, migrasi, kebijakan RLS
│  ├─ contracts/ # katalog izin, katalog harga, aturan bersama
│  ├─ billing/   # pendaftaran, pembayaran, langganan, konsol staf
│  └─ jobs/      # antrean dan outbox
└─ Planning/
```

### 2.4 Pemisahan data (RLS)
- Semua tabel sekolah punya `school_id`. Tiap request tenant berjalan dalam transaksi dengan `app.school_ids` (uuid[]) dari keanggotaan; kebijakan memakai `app_school_ids()`. Query tanpa konteks mengembalikan 0 baris.
- Dua peran database: `edusync_app` (tunduk RLS) untuk request sekolah; `edusync_platform` (BYPASSRLS) hanya untuk pendaftaran, webhook pembayaran, dan konsol staf. Tabel penagihan hanya bisa ditulis peran platform.
- Helper `withTenant(db, schoolIds, fn)`. Tes otomatis mencoba membaca/menulis/mengubah/menghapus data sekolah lain; build gagal bila berhasil.

## 3. Alamat dan sesi

| Alamat | Isi | Pengguna |
| --- | --- | --- |
| `APP_DOMAIN` (edusync.id; lokal `localhost:3000`) | Halaman depan, daftar, login utama, portal akun yayasan, `/platform` | Pemilik/admin yayasan, staf Edusync |
| `<slug>.APP_DOMAIN` | Dashboard dan situs satu unit | Admin sekolah, kepala sekolah, guru, operator, bendahara, wali, siswa |
| Domain milik sekolah | Tahap 1: situs publik dan SPMB. Tahap 2: dashboard dan portal | Pengunjung; warga sekolah (tahap 2) |

- Next meneruskan `/v1/*` dan `/api/auth/*` ke API lewat alamat yang sama, sehingga **cookie sesi terikat satu alamat** (host-only). Tiap alamat berdiri sendiri.
- `GET /v1/config` mengembalikan `baseDomain`. API mempercayai domain dasar dan subdomainnya (skema mengikuti `AUTH_URL`; https di produksi).
- **Pindah alamat tanpa login ulang:** alamat asal menukar sesi menjadi token sekali pakai (1 menit, disimpan sebagai hash); browser pindah membawa token; halaman tujuan menghapusnya dari URL, menukarnya menjadi sesi alamat itu, dan token hangus. Asal permintaan diperiksa.
- **Gerbang (`/`):** belum masuk → login; di alamat sekolah → dashboard; di alamat utama → staf ke `/platform`, anggota sekolah dipindah ke alamat sekolahnya. Sekolah yang tidak ada dan bukan milik pengguna dijawab sama (alamat tidak bisa ditebak).
- Konsol staf, daftar, dan pembayaran hanya hidup di alamat utama.

### Domain milik sekolah
Tabel `school_domains(school_id, hostname, kind, status: pending|verified|active|failed, verification_token, is_primary)`. Admin menambah hostname → sistem menampilkan CNAME dan TXT → pemeriksa DNS berkala (job) → `verified` → HTTPS otomatis (Caddy on-demand TLS; endpoint `ask` hanya untuk hostname terdaftar dan terverifikasi) → subdomain bawaan dialihkan 301.
- **Tahap 1 (M10):** situs publik dan SPMB, tanpa login di domain luar.
- **Tahap 2 (lanjut):** dashboard di domain sekolah memakai token pindah alamat yang sama.
- Batasan: apex tanpa `www` perlu ALIAS/A; pantau batas penerbitan sertifikat; cegah hostname yang mengarah ke domain platform lain; domain dilepas bila langganan berhenti. Entitlement `custom_domain` pada paket tertentu.

## 4. Yayasan, unit, dan orang

- `foundation` 1—N `school` (unit). Keanggotaan `member` bercakupan unit; satu akun bisa jadi guru di unit A dan admin di unit B.
- `person` di tingkat yayasan untuk guru/pegawai dan wali (guru lintas unit, wali dengan anak di dua unit, satu kontak WhatsApp). Siswa per unit, ditautkan ke `person` agar mutasi internal menjaga riwayat.
- Langganan di tingkat yayasan, item per unit dan modul. Kurikulum dan jenjang per unit. Kalender yayasan diwariskan ke unit.
- SPMB internal untuk lulusan unit lain di yayasan yang sama.

## 5. Peran dan izin

- Katalog izin `resource:action` (member, role, academic_year, audit, ...). Peran bawaan per sekolah: `school_admin`, `principal`, `curriculum`, `treasurer`, `operator`, `teacher` (portal `guardian`/`student` menyusul). Izin diperiksa **di API** (sumber kebenaran); menu dan tombol hanya mengikuti izin.
- **Multi-peran:** `member` 1—N `member_role`; izin = gabungan semua peran. Audit mencatat peran sumber izin. Aturan pemisahan tugas bisa diaktifkan per sekolah.
- **Peran vs penugasan:** peran memberi izin umum; penugasan membatasi konteks: `teaching_assignment`, `homeroom_assignment`, `extracurricular_advisor`, `halaqah_musyrif`, `pkl_supervisor`. Data guru dibatasi oleh penugasan.
- **Guard API:** `requireUser`, `requireTenant` (header `x-school-id`; cek keanggotaan dan sekolah aktif), `requirePermission`, `requireModule` (entitlement), `requireStaff`.
- **Tingkat yayasan:** pemilik yayasan mengurus langganan dan tagihan di alamat utama (belum dibangun); admin sekolah tidak melihat tagihan.
- **Staf Edusync:** tabel `platform_staff` (peran `admin` / `read_only`), bukan anggota sekolah; dibuat lewat perintah di server (seed hanya di dev).
- Pengecualian izin per individu (tambah/cabut, dengan alasan dan tanggal berakhir): direncanakan.

## 6. Pendaftaran dan langganan

**Alur:** daftar akun (kata sandi min. 12, ulangi, validasi) → isi yayasan, unit, alamat (diperiksa ketersediaannya, dipesan 24 jam), modul, jumlah siswa → invoice dan halaman pembayaran → kembali ke `/register/status/<id>` (memeriksa otomatis) → webhook → satu transaksi: yayasan, unit, peran, admin, langganan, entitlement, email sambutan (lewat outbox) → pindah ke alamat sekolah tanpa login ulang.

- **Katalog** di DB (`catalog_item`); harga bawaan hanya contoh. `quoteUnits`: dasar + modul + tingkat jumlah siswa; tahunan = 10 bulan; modul bersyarat ikut ditambahkan (mis. penilaian butuh nilai).
- **Penyedia pembayaran (adapter):** `dev` (simulasi bertanda tangan HMAC; dilarang di produksi) dan `midtrans` (Snap, `callbacks.finish` ke halaman status). Logika langganan hanya menerima kabar yang sudah diverifikasi.
- **Webhook** idempoten (`payment` unik `(provider, event_id)`); jumlah berbeda dan pembayaran terlambat ditangani dan diuji.
- **Status:** `pending_payment` (kedaluwarsa 24 jam, alamat dilepas) → `active` → `past_due` (tenggang 7 hari, sekolah tetap jalan) → `suspended` (alasan `billing`; data aman, dibuka saat lunas) → `canceled` (data disimpan 90 hari).
- **Perpanjangan:** invoice dibuat 7 hari sebelum jatuh tempo (email); pembayaran menyambung dari akhir periode. Naik paket segera (selisih harga), turun paket di periode berikutnya.
- **Staf:** penangguhan (`staff`) tidak dilepas pembayaran; aktivasi komplimen (pembayaran senilai 0, di-audit) untuk pilot.
- **SPP siswa tidak melewati Edusync:** wali membayar ke QRIS/rekening milik sekolah, mengunggah bukti, bendahara memverifikasi (`pending → verified | rejected`). Tanpa gateway sekolah, tanpa penampungan dana.

## 7. Konsol platform (`/platform`)
Daftar yayasan dan unit (status, tanggal berakhir, invoice terbuka, pencarian); pendaftaran tertunda; penangguhan/aktivasi dengan alasan wajib; aktivasi komplimen; audit lintas sekolah. Sebelum produksi: verifikasi dua langkah dan sesi lebih pendek untuk staf.

## 8. Katalog modul

- **Inti (selalu ada):** identitas + peran, yayasan dan unit, pendaftaran dan langganan, konsol platform, email dan antrean, tampilan dan bahasa, master data, kalender akademik, bank data kurikulum, audit, pengaturan sekolah.
- **Modul (dibeli per unit):** Jadwal pelajaran, Absensi (RFID + kelas), Ekstrakurikuler, Nilai + rapor, Penilaian non-akademik, Tahfidz + ibadah, Administrasi, PKL, SPMB, SPP + tagihan, Website + pengumuman, Portal wali/siswa, Dashboard + laporan.
- **Tahap lanjut:** UKS, alumni, keuangan sekolah (kas, BOS), API dan webhook, kepegawaian, LMS, perpustakaan/inventaris, domain sendiri untuk dashboard.
- Siklus hidup siswa (naik kelas massal, kelulusan, mutasi, buku induk) ada di master data, bukan modul berbayar.
- Paket contoh: Starter (Nilai), Standard (+ Absensi, Jadwal, Penilaian, Portal wali), Pro (+ SPMB, Website, Administrasi, SPP). Harga belum ditetapkan.

## 9. Domain dan model data

Penamaan kode Inggris; label UI default Indonesia. Tabel sekolah: `id` (uuid), `school_id`, `created_at/updated_at`, `deleted_at` untuk entitas yang di-soft-delete, `created_by`.

| Modul | Tabel inti | Aturan penting |
| --- | --- | --- |
| Platform & langganan | `foundation`, `school` (`student_tier`, `suspended_reason`), `catalog_item`, `registration`, `slug_reservation`, `invoice`, `payment`, `subscription`, `entitlement`, `platform_staff` | RLS pada tabel sekolah; penagihan hanya ditulis peran platform |
| Identitas | `user`, `session`, `account`, `verification`, `member`, `role`, `role_permission`, `member_role` | Penonaktifan mencabut sesi |
| Pendukung | `outbox`, `audit_log` | Outbox ditulis di transaksi data |
| Master data | `academic_year`, `semester`, `program`, `class`, `student`, `guardian`, `teacher`, `subject`, `teaching_assignment`, `lesson_period`, `enrollment` | NIS/NISN/RFID unik per sekolah; satu tahun ajaran aktif; riwayat enrollment tidak dihapus; impor Excel dengan pratinjau + laporan error per baris |
| Kalender | `calendar_event(type: holiday/exam/activity/break, scope: school/class/program)` | Hari efektif dari kalender; tidak ada alpa di hari libur; ekspor iCal |
| Bank data | schema `reference` (tanpa `school_id`, ber-versi): kurikulum, struktur mapel, komponen nilai, aspek rubrik, templat rapor, wilayah, surah/juz, libur nasional | Disalin ke unit lalu bebas diubah; pembaruan acuan sebagai perbandingan, tidak menimpa; satu sekolah boleh banyak jenjang |
| Absensi | `rfid_card`, `kiosk_device`, `attendance_policy`, `tap_event` (immutable), `daily_attendance`, `class_session`, `class_attendance` | Lihat 9.1 |
| Nilai | `assessment_component` (bobot), `grade`, `grade_lock` | UTS/UAS/pengetahuan/praktik adalah komponen terkonfigurasi; kunci per semester oleh kurikulum |
| Penilaian | `rubric_aspect`, `rubric_scale`, `student_assessment` | Kepribadian, ekskul, kokurikuler memakai satu mesin rubrik |
| Tahfidz | `halaqah`, `hafalan_target`, `hafalan_entry` (ziyadah/murajaah), `ibadah_item`, `ibadah_log` | Wali melihat progres lewat portal; rapor tahfidz memakai templat rapor |
| Administrasi | `signer_credential`, `signed_document`, surat masuk/keluar, disposisi, template, arsip | Lihat 9.2 |
| PKL (SMK) | `pkl_partner`, `pkl_period`, `pkl_placement`, `pkl_journal`, `pkl_visit`, `pkl_assessment` | Pembimbing industri lewat tautan terbatas; surat dan sertifikat dari template Administrasi |
| SPMB | `admission_period`, `application`, `application_document`, `application_status_log` | `submitted → verified → accepted/rejected → enrolled`; "enrolled" membuat `student` otomatis; dokumen maks. 2 MB (PDF/JPG/PNG), cek magic bytes, honeypot + rate limit |
| SPP | `fee_item`, `fee_plan` (bulanan/tahunan/sekali/cicilan; per tingkat/program/kelas/siswa), `fee_discount`, invoice siswa, `payment` | Nominal 0 = gratis; denda opsional; verifikasi manual oleh bendahara |
| Website | `site_settings`, `page`, `block` (JSON bertipe), `post`, `media`, `contact_message`, `download` | Rich-text disanitasi; draft/publish; SEO; cache per tenant |
| Notifikasi | `notification_template`, `notification_log` | Idempoten, coba ulang |

Jurusan: `program` bertingkat (jurusan/peminatan SMA; bidang → program → kompetensi keahlian SMK), acuannya di bank data.

### 9.1 Absensi RFID
- Kiosk (PWA) = `kiosk_device` dengan API key sendiri yang bisa dicabut; tanpa endpoint terbuka.
- `POST /kiosk/taps` idempoten (`client_event_id`); waktu otoritatif server, `client_time` disimpan saja; antrean offline lalu sinkron.
- Tap mentah immutable; `daily_attendance` dihitung dari kebijakan (jam masuk, batas terlambat, jam pulang minimum, jendela debounce, zona waktu sekolah). Kebijakan bisa berubah dan status dihitung ulang dari log.
- Tap pertama = masuk; tap valid berikutnya = pulang; tap dalam jendela debounce diabaikan; kartu tak dikenal/siswa nonaktif ditolak dan dicatat. Notifikasi ke wali lewat outbox, bukan inline.

### 9.2 Administrasi: tanda tangan QR
Menandatangani membuat `signed_document` (hash SHA-256 PDF, penandatangan, waktu, nomor surat) dengan token acak; QR mengarah ke `/verify/{token}` (halaman publik: nomor, penerbit, penandatangan, waktu, status; opsi unggah PDF untuk mencocokkan hash). Surat bisa dicabut (`revoked`). Ini tanda tangan sederhana, bukan TTE tersertifikasi; cukup untuk surat internal. Tanda tangan dan stempel disimpan privat dan hanya dipakai penandatangannya.

## 10. Keamanan dan mutu

- **Keamanan:** RLS dan dua peran database; sesi cookie httpOnly terikat alamat; kata sandi di-hash, min. 12 karakter; asal permintaan terbatas pada domain dasar dan subdomainnya; rate limit, header keamanan, validasi Zod untuk semua input, konfigurasi divalidasi saat start; unggahan diperiksa (ukuran, isi, nama acak, penyimpanan privat, tautan bertanda tangan); audit log aksi sensitif dengan pelaku, alasan, dan peran sumber izin.
- **Mutu:** tes dengan Postgres nyata (isolasi tenant, izin, penagihan, antrean, email sampai Mailpit); tes kelengkapan kunci terjemahan tiga bahasa; migrasi maju-saja dan aman diulang; cadangan harian dengan uji pemulihan sebelum produksi; pekerjaan latar idempoten; CI menjalankan migrasi, lint, tipe, dan seluruh tes.
- **Dokumentasi:** OpenAPI dihasilkan dari route (tidak ditulis tangan); setiap endpoint wajib `summary` dan skema request/response/error; fitur dan konsep didokumentasikan sebagai halaman web.
- **Performa:** indeks sesuai pola (`school_id, class_id, date`), pagination cursor, laporan berat lewat job.
- **Data:** soft-delete + restore; retensi tap/log terdokumentasi (privasi data anak).

## 11. Lingkungan lokal
Lihat `README.md`. Konfigurasi penting di `.env`: `DATABASE_*_URL` (owner/app/platform/jobs), `AUTH_SECRET`, `AUTH_URL`, `TRUSTED_ORIGINS`, `SMTP_*`, `PAYMENT_PROVIDER` + `PAYMENT_DEV_SECRET`/`MIDTRANS_SERVER_KEY`, `APP_DOMAIN`, `API_URL`, `DEV_SEED_PASSWORD`. Akun seed: `admin@edusync.test`, `guru@edusync.test`, `staff@edusync.test`; sekolah contoh `smpit-miftahul-huda` dan `smk-miftahul-huda`.

## 12. Rencana dan status

| M | Isi | Status / selesai bila |
| --- | --- | --- |
| M0 | Fondasi: monorepo, RLS, yayasan dan unit, login, peran rangkap, audit, antrean, tampilan, 3 bahasa | **Selesai** |
| M1 | Pendaftaran dan langganan, konsol staf, subdomain sekolah, sesi per alamat | **Selesai** (mode simulasi; Midtrans sandbox belum diuji akun sungguhan) |
| M2 | Master data, kalender, bank data kurikulum, jurusan, siklus hidup siswa, impor Excel | 500 siswa diimpor dengan laporan error per baris; guru terlihat di dua unit |
| M3 | Jadwal, absensi (kiosk RFID), ekskul, WhatsApp | 1000 tap/menit tanpa duplikat; hitung ulang kebijakan benar |
| M4 | Nilai dan penilaian | Rapor satu kelas dibuat sebagai job |
| M5 | Tahfidz dan ibadah | Musyrif mencatat satu halaqah; wali melihat progres |
| M6 | Administrasi | Surat bertanda tangan QR diverifikasi publik; surat dicabut terlihat |
| M7 | PKL dan prakerin | Satu siswa melewati penempatan, jurnal, penilaian, sertifikat |
| M8 | SPMB | Pendaftar diterima otomatis menjadi siswa |
| M9 | SPP dan tagihan | Satu unit gratis dan satu unit dengan cicilan + beasiswa dari konfigurasi yang sama |
| M10 | Website, pengumuman, domain sendiri (situs publik + SPMB) | Lighthouse ≥ 90; satu unit tampil di domain luar dengan HTTPS otomatis |
| M11 | Portal wali/siswa, dashboard kepala sekolah dan yayasan | Wali melihat absensi, nilai, tahfidz, tagihan anaknya |
| M12 | Rilis: uji beban, tinjauan keamanan, latihan pemulihan, produksi | Daftar periksa rilis lengkap |

Pilot Miftahul Huda (SMP IT + SMK, ±15 guru, sebagian lintas unit) masuk akal setelah M2–M4, memakai aktivasi komplimen.

### Berikutnya dan terbuka
- Peran pemilik yayasan dan portal akun: langganan, tagihan, bayar perpanjangan, ubah paket dan unit.
- Pengelolaan peran dan anggota lewat layar, undangan guru, pengecualian izin per orang.
- Uji Midtrans sandbox (butuh terowongan, notification URL `/v1/webhooks/payments/midtrans`).
- Verifikasi email saat daftar; notifikasi masa tenggang; SMTP sungguhan.
- Verifikasi dua langkah staf; perintah pembuatan admin pertama di produksi.
- E2E Playwright; penyimpanan berkas; hosting produksi dan domain dasar final (VPS + Docker + Caddy, atau PaaS).
- Teks Sunda perlu ditinjau penutur asli. Harga katalog belum ditetapkan.
