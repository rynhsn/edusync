# EduSync

EduSync memisahkan control plane Platform dari sistem operasional masing-masing sekolah. Platform API memegang provisioning tenant dan akses operator; provisioning di School API adalah operasi privat antar-layanan.

## Struktur repositori

| Path | Fungsi |
| --- | --- |
| `apps/platform-api` | Platform API (Fastify, PostgreSQL, port 4001): operator dan undangan, pengguna Platform, tenant, audit log, pengaturan akun. |
| `apps/school-api` | School API (Fastify, PostgreSQL terpisah, port 4002): tahun ajaran, kelas, siswa, enrollment, provisioning tenant, aktivasi School Admin. |
| `apps/web` | Aplikasi web Platform (React, Vite, Tailwind, port 5174). |
| `apps/school-web` | Aplikasi web School (React, Vite, Tailwind, port 5175). |
| `packages/contracts` | Skema Zod dan tipe yang dipakai bersama oleh API dan aplikasi web. |
| `packages/api-docs` | Menyajikan dokumen OpenAPI (JSON dan HTML) untuk tiap API. |
| `Planning/` | Catatan re-engineering sistem lama. Modul-modul ini belum diimplementasikan (lihat [Roadmap](#roadmap)). |

Sistem Platform dan School memakai database, secret autentikasi, dan sesi yang terpisah. Keduanya tidak berbagi origin maupun cookie.

## Pengembangan lokal

Prasyarat: Node.js 24, pnpm 12, dan Docker Desktop (atau Docker Engine dengan Compose).

1. Salin `.env.example` ke `.env` tanpa menimpa file yang sudah ada. Isi nilai acak yang berbeda untuk `PLATFORM_AUTH_SECRET` dan `SCHOOL_AUTH_SECRET` (minimal 32 karakter) serta `SCHOOL_PROVISIONING_SECRET` (minimal 32 karakter). Isi `PLATFORM_BOOTSTRAP_PASSWORD` privat minimal 12 karakter. Nilai-nilai ini hanya untuk pengembangan lokal; jangan dipakai di produksi. `.env` bukan file konfigurasi frontend: hanya nilai `VITE_*` yang terekspos ke kode browser.
2. Pasang dependensi workspace dan jalankan database PostgreSQL lokal (Platform di port 5433, School di port 5434):

   ```bash
   pnpm install
   docker compose up -d
   ```

3. Jalankan kedua migrasi database:

   ```bash
   pnpm db:migrate
   ```

4. Jalankan Platform API, School API, aplikasi web Platform, dan aplikasi web School:

   ```bash
   pnpm dev
   ```

   | Layanan | URL |
   | --- | --- |
   | Platform API | `http://localhost:4001` |
   | School API | `http://localhost:4002` |
   | Aplikasi web Platform | `http://localhost:5174` |
   | Aplikasi web School | `http://localhost:5175` |

   Untuk menjalankan satu aplikasi web saja, pakai `pnpm dev:web` (Platform) atau `pnpm dev:school-web` (School). Tiap API menyajikan dokumen OpenAPI di `/openapi.json`, dokumentasi interaktif di `/docs`, dan health check di `/health`.

5. Untuk membuat Platform Admin lokal pertama, set `PLATFORM_BOOTSTRAP_ENABLED=true` di `.env` privat, lalu jalankan:

   ```bash
   pnpm --filter @edusync/platform-api db:seed
   ```

   Bootstrap ini juga mensyaratkan `NODE_ENV=development`. Ia hanya membuat akun baru dan menolak mengubah atau mempromosikan akun yang sudah ada dengan email yang dikonfigurasi. Kembalikan `PLATFORM_BOOTSTRAP_ENABLED` ke `false` setelah dipakai. Jangan pernah memakai jalur bootstrap ini di produksi.

### Perintah umum

```bash
pnpm typecheck   # typecheck semua paket workspace
pnpm test        # jalankan semua suite Vitest
pnpm build       # build semua paket
pnpm db:seed     # jalankan kedua seed development (masing-masing dikunci oleh flag *_BOOTSTRAP_ENABLED sendiri)
```

## Platform

### Aplikasi web

Aplikasi web Platform membaca `VITE_PLATFORM_API_URL` (default `http://localhost:4001`). Rute publik: `/sign-in`, `/sign-up`, `/forgot-password`, dan `/invite/:token`; semua path lain adalah shell Platform yang terautentikasi: overview, tenant, operator, audit log, pengaturan, dan dokumentasi API. Kontrol pengelolaan hanya tersedia untuk Platform Admin.

### Jenis akun

| Role | Cara dibuat | Akses |
| --- | --- | --- |
| `platform_admin` | Seed bootstrap atau undangan operator | Pengelolaan penuh operator dan tenant. |
| `platform_read_only` | Undangan operator | Dapat melihat tenant dan operator; tidak dapat mengubah apa pun. |
| `platform_user` | Pendaftaran mandiri publik | Akun pelanggan yang hanya mengelola sekolah miliknya (lihat `tenant_owners`). |

### Undangan operator Platform

Hanya Platform Admin yang dapat mengelola operator Platform; pengguna dan kredensial School tetap berada di School API/database yang terpisah. Platform Admin mengelola operator dari halaman Operators di aplikasi web: mengundang, mengirim ulang, mencabut, mengubah role, serta mengaktifkan atau menonaktifkan operator. Penerima undangan mendapat tautan sekali pakai yang berlaku 48 jam, lalu mengatur password sendiri (12–128 karakter). Perubahan role dan penonaktifan operator membatalkan sesi Platform aktif mereka. Platform Admin aktif terakhir tidak dapat diturunkan atau dinonaktifkan.

Untuk mengirim undangan, atur variabel opsional di `.env` privat: `PLATFORM_SMTP_HOST`, `PLATFORM_SMTP_PORT`, `PLATFORM_SMTP_SECURE=true`, `PLATFORM_SMTP_USER`, `PLATFORM_SMTP_PASSWORD`, `PLATFORM_EMAIL_FROM`, dan `PLATFORM_PUBLIC_URL`. Alamat pengirim dibatasi ke `hi.edusync@gmail.com`; gunakan Gmail App Password, bukan password akun Gmail. Jaga kerahasiaan semua kredensial SMTP dan jangan pernah menaruhnya di variabel `VITE_*` atau kode browser. `PLATFORM_PUBLIC_URL` harus HTTPS di luar pengembangan lokal. Tanpa konfigurasi SMTP yang berfungsi, undangan tetap dibuat tetapi ditandai **Delivery failed** sehingga Platform Admin dapat mencobanya lagi dari halaman operator. Mengirim ulang akan merotasi token (tautan sebelumnya tidak berlaku) dan memulai periode 48 jam baru. Jangan mengirim email sungguhan saat verifikasi development kecuali kredensial privat sudah dikonfigurasi dan uji langsung memang disengaja.

### Reset password

`/forgot-password` mengirim kode sekali pakai (OTP) yang diverifikasi sebelum password dapat diganti. Permintaan reset memakai konfigurasi SMTP yang sama dengan undangan.

### Audit log

Aksi Platform yang sensitif (undangan dan perubahan role operator, pembuatan dan perubahan status tenant, registrasi pengguna, pembaruan profil) dicatat di `platform_audit_logs` dan ditampilkan di halaman Audit logs. School API menyimpan log audit otorisasinya sendiri (`school_authz_audit_logs`).

### Migrasi

Jalankan migrasi Platform dengan `pnpm --filter @edusync/platform-api db:migrate` setelah database Platform lokal dikonfigurasi. Migrasi `004_operator_email_normalization.sql` menambahkan indeks unik untuk email ternormalisasi dan akan berhenti jika akun Platform yang ada memiliki duplikat email ternormalisasi; selesaikan identitas tersebut secara sengaja, lalu jalankan ulang migrasi. Rute-rute menormalisasi email yang dikirim sebelum disimpan dan menegakkan keunikan terhadap akun dan undangan aktif.

## Tenant dan provisioning School

Tenant melewati status Platform berikut: `provisioning`, `active`, `suspended`, dan `provisioning_failed`.

1. Platform Admin atau `platform_user` membuat tenant beserta nama dan email School Admin. Platform API mencatatnya lalu memanggil endpoint privat School API `POST /internal/provisioning/tenants`, diautentikasi dengan `SCHOOL_PROVISIONING_SECRET` bersama.
2. School API membuat tenant School dan organisasinya, lalu mengirim email tautan aktivasi sekali pakai (berlaku 48 jam) ke School Admin. **Tidak ada password School atau kredensial yang dapat dipakai ulang yang melewati API provisioning Platform.**
3. School Admin membuka `/activate/:token` di aplikasi web School dan mengatur password sendiri. Sebelum itu, kontak admin tidak dapat masuk, dan UI Platform melaporkan aktivasi sebagai pending.
4. Jika provisioning gagal, tenant ditandai `provisioning_failed` dan Platform Admin atau `platform_user` pemilik tenant dapat mencobanya lagi. Tenant aktif dapat disuspend atau diaktifkan kembali oleh Platform Admin; perubahan diteruskan ke School API.

Email aktivasi memakai variabel opsional `SCHOOL_SMTP_HOST`, `SCHOOL_SMTP_PORT`, `SCHOOL_SMTP_SECURE`, `SCHOOL_SMTP_USER`, `SCHOOL_SMTP_PASSWORD`, dan `SCHOOL_EMAIL_FROM`, dengan fallback ke nilai `PLATFORM_SMTP_*`. Pembatasan pengirim dan panduan App Password yang sama seperti undangan Platform berlaku, dan `SCHOOL_PUBLIC_URL` harus HTTPS di luar pengembangan lokal. Tanpa konfigurasi SMTP yang berfungsi, tidak ada email yang dikirim.

## School

### Aplikasi web

`apps/school-web` adalah frontend terpisah untuk panel operasional tiap sekolah. Ia hanya berkomunikasi dengan School API (`VITE_SCHOOL_API_URL`, default `http://localhost:4002`) dan tidak berbagi origin atau sesi dengan aplikasi web Platform, sehingga `SCHOOL_TRUSTED_ORIGINS` harus memuat origin-nya (`http://localhost:5175` untuk lokal). Rute publik: `/sign-in` dan `/activate/:token`. Semua path lain adalah shell School yang terautentikasi: dashboard, siswa, kelas, dan tahun ajaran.

| Role | Akses |
| --- | --- |
| `school_admin` | Membuat, mengubah, dan menghapus data. |
| `school_staff` | Hanya baca. |

Siswa terhubung ke kelas dan tahun ajaran melalui record enrollment, jadi minimal satu kelas dan satu tahun ajaran harus ada sebelum siswa dapat didaftarkan. Status siswa adalah salah satu dari `AKTIF`, `LULUS`, `MUTASI`, atau `KELUAR`.

### Bootstrap development

Karena provisioning tidak membuat pengguna, database development yang baru tidak punya akun School untuk masuk. Selain lewat alur aktivasi di atas, Anda dapat membuat satu sekolah beserta akun pertamanya langsung. Di `.env` privat, set `NODE_ENV=development`, `SCHOOL_BOOTSTRAP_ENABLED=true`, nilai nama, slug, email, dan password `SCHOOL_BOOTSTRAP_*` (dan opsional email serta password staf), lalu jalankan:

```bash
pnpm --filter @edusync/school-api db:seed
```

Kembalikan `SCHOOL_BOOTSTRAP_ENABLED` ke `false` setelahnya. Jangan pernah memakai jalur bootstrap ini di produksi.

## Roadmap

Sudah diimplementasikan: provisioning dan siklus hidup tenant, pengelolaan operator dan pengguna, aktivasi School Admin, serta master data tahun ajaran, kelas, dan siswa.

Belum diimplementasikan (didokumentasikan di `Planning/`): absensi RFID dan kelas, nilai, penilaian non-akademik, pendaftaran online SPMB, website sekolah publik, administrasi role dan menu, serta master data lainnya (guru, orang tua, jam pelajaran, program/jurusan).
