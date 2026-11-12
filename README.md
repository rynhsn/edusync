# Edusync

Platform manajemen sekolah multi-tenant (yayasan dengan banyak unit sekolah). Rancangan lengkap ada di `Planning/09-rebuild-blueprint.md`.

## Prasyarat

Node 26, pnpm 12, Docker Desktop (harus sudah berjalan).

## Menjalankan di lokal

Jalankan satu per satu, dari akar repo:

1. Salin konfigurasi (sekali; berkas `.env` tidak ikut git). Bila ada kunci baru di `.env.example`, tambahkan sendiri ke `.env`.

```bash
cp .env.example .env
```

2. Nyalakan database dan Mailpit (sekali; kontainer tetap hidup selama Docker Desktop menyala).

```bash
docker compose up -d
```

3. Pasang dependensi (ulangi hanya bila ada paket baru).

```bash
pnpm install
```

4. Migrasi database dan antrean (ulangi hanya bila ada perubahan tabel; aman diulang).

```bash
pnpm db:migrate
```

5. Data contoh: yayasan, dua unit, dan tiga akun uji (sekali).

```bash
pnpm --filter @edusync/api seed:dev
```

6. Jalankan API, worker, dan web.

```bash
pnpm dev
```

| Apa                                                                     | Alamat                                                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Aplikasi web (halaman utama, daftar, login, konsol staf di `/platform`) | http://localhost:3000                                                                 |
| Sekolah (contoh seed)                                                   | http://smpit-miftahul-huda.localhost:3000 dan http://smk-miftahul-huda.localhost:3000 |
| Dokumentasi API                                                         | http://localhost:4000/docs                                                            |
| Kotak email uji (Mailpit)                                               | http://localhost:8025                                                                 |

Setiap sekolah punya alamat sendiri: `<alamat-sekolah>.localhost:3000`. Chrome, Edge, dan Firefox mengarahkan `*.localhost` ke komputer Anda tanpa pengaturan tambahan. Sesi login terikat ke alamat tempat login dilakukan, jadi guru masuk di alamat sekolahnya, dan staf serta pemilik yayasan di alamat utama. Pindah sekolah memindahkan alamat dengan token sekali pakai (satu menit).

Akun contoh: `admin@edusync.dev` (admin yayasan dan admin platform), `guru@edusync.test`, dan `siswa@edusync.test` (siswa contoh SMK untuk mencoba ujian CBT). Kata sandi ketiganya ada di `.env`, baris `DEV_SEED_PASSWORD`.

### Port yang dipakai

| Port | Layanan                           | Dari mana                                            |
| ---- | --------------------------------- | ---------------------------------------------------- |
| 3000 | Web (Next.js)                     | `apps/web` (`next dev -p 3000`)                      |
| 4000 | API (Fastify, dokumen di `/docs`) | `API_PORT` di `.env`                                 |
| 5440 | PostgreSQL 18 (Docker)            | `docker-compose.yml`, dipetakan ke 5432 di kontainer |
| 8025 | Mailpit, kotak email uji (web)    | `docker-compose.yml`                                 |
| 1025 | Mailpit, SMTP                     | `SMTP_PORT` worker, bawaan 1025                      |

Worker tidak membuka port; ia memakai antrean di PostgreSQL. Port 5000 tidak dipakai proyek ini.

### Setelah komputer dinyalakan ulang

Data tetap ada di volume Docker, jadi tidak perlu migrasi atau seed ulang. Jalankan satu per satu dari akar repo:

1. Nyalakan Docker Desktop dan tunggu sampai siap.
2. Nyalakan database dan Mailpit (bila belum hidup sendiri).

```bash
docker compose up -d
```

3. Pastikan database berstatus `healthy`.

```bash
docker compose ps
```

4. Jalankan API, worker, dan web, lalu buka http://localhost:3000.

```bash
pnpm dev
```

Bila ada perubahan tabel sejak terakhir, jalankan `pnpm db:migrate` sebelum langkah 4. Bila port 3000 atau 4000 bentrok, cari prosesnya di PowerShell: `Get-NetTCPConnection -LocalPort 3000 | Select OwningProcess`.

Pengiriman WhatsApp sungguhan butuh `MESSAGING_PROVIDER=whatsapp` dan `WA_CHROME_PATH` di `.env`; tanpa itu worker hanya mencatat pesan ke log. Rinciannya di bagian [Modul dan layar penting](#modul-dan-layar-penting).

## Perintah lain

```bash
pnpm test        # semua tes (Docker harus menyala)
pnpm lint        # Biome
pnpm typecheck   # TypeScript
```

Jangan menjalankan tes worker selagi worker dev menyala: keduanya memakai antrean yang sama.

Mengosongkan database sama sekali: `docker compose down -v`, lalu ulangi langkah 2 sampai 5.

## Konfigurasi alamat

- `APP_DOMAIN`: domain dasar sekolah (`localhost:3000` di lokal; domain produksi nanti). Host dan port saja, tanpa `http://`.
- `API_URL`: alamat API yang dipakai web untuk meneruskan permintaan (`/v1` dan `/api/auth`) dari alamat mana pun.
- `TRUSTED_ORIGINS`: alamat yang boleh memakai sesi, dipisah koma. Web meneruskan permintaan lewat alamatnya sendiri, jadi isinya alamat web.
- `CUSTOM_DOMAIN_TARGET`: host tujuan CNAME/A untuk domain milik sekolah. Kosong = host `APP_DOMAIN` tanpa port.

## Struktur

- `apps/api` Fastify + Zod. OpenAPI dibuat otomatis dari skema route.
- `apps/web` Next.js, Tailwind, shadcn/ui, tiga bahasa (id, en, su).
- `apps/worker` pekerja latar belakang (pg-boss): email, outbox, siklus penagihan, pengirim pesan WhatsApp.
- `packages/db` skema Drizzle, migrasi, kebijakan RLS.
- `packages/contracts` katalog izin, katalog harga, aturan bersama.
- `packages/billing` pendaftaran, pembayaran, langganan, konsol staf.
- `packages/jobs` antrean dan outbox.
- `deploy` berkas Caddy, unit systemd, dan skrip pasang server produksi; `scripts/release.mjs` pembuat rilis.

## Siklus langganan

Worker menjalankan `sweepSubscriptions` secara berkala: lewat jatuh tempo menjadi `past_due` (masa tenggang, sekolah tetap jalan), lewat `graceDays` menjadi `suspended` (semua sekolah lembaga `status=suspended`, `suspendedReason=billing`, panggilan data 403 `school_suspended`), dan pembayaran perpanjangan membuka kembali otomatis. Tiap peralihan mengantre satu email ke semua pemilik lembaga (`packages/billing/src/notices.ts`) dalam transaksi yang sama dengan perubahan statusnya, jadi tidak terkirim ganda. Web membaca `schoolStatus` dan `suspendedReason` dari `GET /v1/me` dan menampilkan layar "Sekolah ini sedang ditangguhkan".

## Isolasi tenant

Request tenant memakai peran `edusync_app` (tunduk pada RLS) dan `withTenant(db, schoolIds, fn)`. Peran `edusync_platform` melewati RLS dan hanya untuk konsol staf, pendaftaran, dan webhook pembayaran.

## Pembayaran

Bawaan: penyedia `dev` (tanpa uang, hanya lokal). Midtrans sandbox: isi `PAYMENT_PROVIDER=midtrans` dan `MIDTRANS_SERVER_KEY` di `.env` sebagai dasar, lalu nilai di **Platform › Pembayaran** menimpanya (kunci di sana tersimpan terenkripsi). Jangan pernah meng-commit kunci tersebut.

## Modul dan layar penting

- **Kiosk absensi:** buka `/kiosk` di tablet/PC gerbang, tempel kunci perangkat dari Pengaturan absensi › Perangkat. Pembaca RFID USB cukup dicolok. Satu perangkat bisa melayani beberapa unit di lembaga yang sama: di Pengaturan absensi › Perangkat, pilih "Jangkauan perangkat" (kartu tiap siswa tercatat di unitnya sendiri; kartu dengan kode sama di dua unit ditolak).
- **Absen cadangan lewat QR:** saat kiosk RFID mati, guru membuka Absen datang & pulang › tab Pindai QR dan memindai QR di kartu siswa dengan kamera ponsel (butuh HTTPS atau localhost). QR adalah kode identitas siswa `ES1.<kode acak>` (satu per siswa, tabel `student_identity_code`, tidak terikat modul) yang dibuat otomatis saat data cetak kartu dimuat (`GET /v1/cards/students`) dan tampil di kartu siswa bawaan; templat lama perlu menambah elemen QR dengan kolom "QR identitas siswa". Kode hanya menunjuk siswa; menu pemindai yang menentukan tindakan, dan pemindai wajib login + izin fiturnya. Endpoint: `POST /v1/gate/scan` (absensi), `GET /v1/students/{id}/identity-code`, `POST /v1/students/{id}/identity-code/rotate` (buat ulang bila kartu hilang; mencabut kode untuk semua fitur). Kiosk RFID tetap cara utama dan tidak menerima kode QR.
- **WhatsApp:** jalankan worker dengan `MESSAGING_PROVIDER=log` (bawaan di dev) untuk uji tanpa mengirim. Untuk kirim sungguhan: `MESSAGING_PROVIDER=whatsapp`, `WA_CHROME_PATH` (jalur Chrome/Chromium), lalu hubungkan nomor lewat halaman Notifikasi WhatsApp (pindai QR). Gunakan nomor khusus sekolah.
- **Seed contoh:** `pnpm --filter @edusync/api seed:dev` memberi sekolah contoh semua modul, jenis biaya dan tarif, serta pengaturan rapor.
- **Tahfidz, administrasi, PKL, SPMB:** menu "Pembinaan" dan "Administrasi" (butuh entitlement modul). Pendaftaran murid baru publik di `/apply`, verifikasi surat di `/verify/{token}`, tautan pembimbing PKL di `/pkl/{token}`. Data contoh: `pnpm --filter @edusync/api seed:dev` (kode pelacakan SPMB demo `DEMO2SPMB1..`).
