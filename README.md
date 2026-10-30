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

Akun contoh: `admin@edusync.test`, `guru@edusync.test`, `staff@edusync.test` (staf platform). Kata sandi ada di `.env`, baris `DEV_SEED_PASSWORD`.

## Perintah lain

```bash
pnpm test        # semua tes (Docker harus menyala)
pnpm lint        # Biome
pnpm typecheck   # TypeScript
```

Mengosongkan database sama sekali: `docker compose down -v`, lalu ulangi langkah 2 sampai 5.

## Konfigurasi alamat

- `APP_DOMAIN`: domain dasar sekolah (`localhost:3000` di lokal; domain produksi nanti). Host dan port saja, tanpa `http://`.
- `API_URL`: alamat API yang dipakai web untuk meneruskan permintaan (`/v1` dan `/api/auth`) dari alamat mana pun.

## Struktur

- `apps/api` Fastify + Zod. OpenAPI dibuat otomatis dari skema route.
- `apps/web` Next.js, Tailwind, shadcn/ui, tiga bahasa (id, en, su).
- `apps/worker` pekerja latar belakang (pg-boss): email, outbox, siklus penagihan, pengirim pesan WhatsApp.
- `packages/db` skema Drizzle, migrasi, kebijakan RLS.
- `packages/contracts` katalog izin, katalog harga, aturan bersama.
- `packages/billing` pendaftaran, pembayaran, langganan, konsol staf.
- `packages/jobs` antrean dan outbox.

## Isolasi tenant

Request tenant memakai peran `edusync_app` (tunduk pada RLS) dan `withTenant(db, schoolIds, fn)`. Peran `edusync_platform` melewati RLS dan hanya untuk konsol staf, pendaftaran, dan webhook pembayaran.

## Pembayaran

Bawaan: penyedia `dev` (tanpa uang, hanya lokal). Midtrans sandbox: isi `PAYMENT_PROVIDER=midtrans` dan `MIDTRANS_SERVER_KEY` di `.env`. Jangan pernah meng-commit kunci tersebut.

## Modul dan layar penting

- **Kiosk absensi:** buka `/kiosk` di tablet/PC gerbang, tempel kunci perangkat dari Pengaturan absensi › Perangkat. Pembaca RFID USB cukup dicolok.
- **WhatsApp:** jalankan worker dengan `MESSAGING_PROVIDER=log` (bawaan di dev) untuk uji tanpa mengirim. Untuk kirim sungguhan: `MESSAGING_PROVIDER=whatsapp`, `WA_CHROME_PATH` (jalur Chrome/Chromium), lalu hubungkan nomor lewat halaman Notifikasi WhatsApp (pindai QR). Gunakan nomor khusus sekolah.
- **Seed contoh:** `pnpm --filter @edusync/api seed:dev` memberi sekolah contoh semua modul, jenis biaya dan tarif, serta pengaturan rapor.
- **Tahfidz, administrasi, PKL, SPMB:** menu "Pembinaan" dan "Administrasi" (butuh entitlement modul). Pendaftaran murid baru publik di `/apply`, verifikasi surat di `/verify/{token}`, tautan pembimbing PKL di `/pkl/{token}`. Data contoh: `pnpm --filter @edusync/api seed:dev` (kode pelacakan SPMB demo `DEMO2SPMB1..`).
