# Edusync — Blueprint Rebuild dari Nol

Status: **DRAFT untuk disetujui** · Tanggal: 2026-10-29
Sumber kebutuhan bisnis: `Planning/00`–`08` (sistem lama CodeIgniter 4). Dokumen ini menggantikan README lama sebagai arah teknis.

## 1. Diagnosis kode saat ini (kenapa dibuat ulang)

| Masalah | Dampak |
| --- | --- |
| 2 backend (platform-api, school-api) + 2 frontend (web, school-web) dengan DB terpisah | Auth, mailer, migrasi, OpenAPI, UI kit **diduplikasi** (ada `repair_auth_copy.py` sebagai tambalan). Setiap fitur dikerjakan 2x. |
| Provisioning tenant lintas-layanan via shared secret | Perlu saga/state `provisioning_failed`, retry, dan sinkronisasi suspend. Kompleksitas tinggi untuk nilai rendah. |
| OpenAPI ditulis tangan (`docs/openapi.ts`) terpisah dari route | Dokumentasi mudah basi dan tidak terjamin cocok dengan perilaku sebenarnya. |
| SQL mentah + `pg.Pool`, isolasi tenant hanya lewat konvensi query | Satu `WHERE` terlupa = kebocoran data antar-sekolah. |
| Baru 3 dari ±12 modul (tahun ajaran, kelas, siswa) | 90% nilai produk (absensi, nilai, SPMB, website) belum ada. |
| Role hanya `school_admin` / `school_staff` | Tidak memadai untuk 6 role lama (kepala sekolah, bendahara, kurikulum, operator, guru). |

Yang **dipertahankan sebagai ide**: kontrak Zod bersama, aktivasi admin via token sekali pakai, audit log, rate limit, bootstrap dev yang aman, Tailwind + shadcn, i18n.

## 2. Keputusan arsitektur

### 2.1 Modular monolith, satu database, multi-tenant shared-schema + RLS
- **Satu API, satu web app, satu PostgreSQL.** Modul dipisah per folder (bukan per layanan). Microservice tidak dibutuhkan pada skala ribuan sekolah kecil.
- Tabel bisnis semua punya `school_id`. **Row-Level Security Postgres** aktif: tiap request menjalankan `SET LOCAL app.school_id = ...` dalam transaksi; query tanpa konteks tenant mengembalikan 0 baris. Isolasi dijamin database, bukan disiplin developer.
- Control plane (platform) = schema `platform` di DB yang sama. Provisioning sekolah = **satu transaksi** (sekolah + owner + undangan aktivasi) → saga dan `provisioning_failed` hilang.
- Tenant dikenali dari **subdomain** (`slug.edusync.id`), custom domain menyusul. Situs publik sekolah memakai host yang sama.
- Ditolak: DB-per-tenant (migrasi/ops berlipat), service terpisah (alasan di 2.1 atas).

### 2.2 Stack

| Lapisan | Pilihan | Alasan |
| --- | --- | --- |
| Runtime/monorepo | Node 26, pnpm workspaces + **Turborepo** (cache build/test) | Sudah dipakai; Turbo memangkas waktu CI. |
| Bahasa | TypeScript strict, ESM | Satu bahasa di seluruh stack, kontrak dibagi. |
| API | **Fastify 5** + `fastify-type-provider-zod` + `@fastify/swagger` | Zod di route = validasi **dan** OpenAPI otomatis (tidak ada openapi.ts manual). Sudah dikenal di repo. |
| DB & ORM | PostgreSQL 18 + **Drizzle ORM** + drizzle-kit | Type-safe, SQL-dekat, mendukung RLS/policy dan migrasi ter-versi. |
| Auth | **Better Auth** (organization plugin) satu instance | Sudah terbukti di repo; user global, membership per sekolah, perannya per sekolah. |
| Otorisasi | RBAC berbasis **permission** (`student:read`, `grade:write`, …); role = kumpulan permission, bisa dikustom per sekolah | Menggantikan 3 tabel hack lama (`role_sidebar_settings`, `button_settings`, `custom_sidebar_menus`): menu & tombol diturunkan dari permission. |
| Background job | **pg-boss** (antrian di Postgres) | Tanpa Redis. Untuk WhatsApp, email, PDF, import besar; ada retry dan jadwal. |
| Web | **Next.js (App Router)** + React + Tailwind v4 + shadcn/ui | Satu app: situs publik **SSR/SEO** (website sekolah, SPMB), dashboard sekolah, konsol platform, kiosk (PWA). |
| Data fetching | TanStack Query + klien **openapi-fetch** yang digenerate dari OpenAPI API | Tipe frontend selalu sinkron dengan API; tidak ada tipe ganda. |
| Form/tabel | react-hook-form + Zod resolver, TanStack Table | Standar de-facto. |
| File | Abstraksi `Storage` → **MinIO (dev) / S3-compatible atau Cloudflare R2 (prod)**, signed URL | Menggantikan `WRITEPATH/uploads`; aman, bisa scale. |
| PDF | `@react-pdf/renderer` (job di worker) | Tanpa headless browser; ringan menggantikan Dompdf. |
| Excel | `exceljs` | Import/export siswa dan nilai. |
| WhatsApp | Adapter `NotificationChannel` (Fonnte dulu), email via SMTP/Nodemailer | Provider bisa diganti tanpa ubah domain. |
| Kualitas | **Biome** (lint+format), Vitest, Testcontainers (Postgres nyata), Playwright (E2E), GitHub Actions | Satu tool lint cepat; test tidak mock DB. |
| Observability | pino (log terstruktur), Sentry, `/health` + `/ready` | Cukup untuk awal; OTel menyusul. |
| Deploy | Docker image (api, web, worker) + Caddy; target VPS (Coolify/Compose) | Murah, latensi baik di Indonesia, mudah dipindah. |

### 2.3 Struktur repositori

```
edusync/
├─ apps/
│  ├─ api/            # Fastify; src/modules/<modul>/{routes,service,repo,schema}.ts
│  ├─ worker/         # pg-boss consumer (import api/modules sebagai library)
│  └─ web/            # Next.js: (public) (school) (platform) (kiosk)
├─ packages/
│  ├─ db/             # Drizzle schema, migrasi, RLS policies, seed
│  ├─ contracts/      # Zod bersama (input/output, enum, permission list)
│  ├─ ui/             # shadcn/ui + design tokens (satu-satunya UI kit)
│  ├─ config/         # tsconfig, biome, env schema
│  └─ testing/        # factory data, helper Testcontainers
├─ Planning/          # dokumen bisnis lama + blueprint ini (dipertahankan)
├─ docs/              # ADR singkat, runbook
└─ docker-compose.yml # postgres, minio, mailpit
```

Aturan modul: `routes` hanya HTTP; `service` berisi logika + transaksi; `repo` satu-satunya yang menyentuh Drizzle. Modul tidak saling impor repo — hanya service/event. Domain event internal (`student.enrolled`, `attendance.recorded`) lewat outbox tabel + pg-boss.

## 3. Domain & model data (ringkas)

Penamaan kode: **Inggris**; label UI default **Bahasa Indonesia** (i18n sejak awal). Semua tabel: `id` (uuid v7), `school_id`, `created_at/updated_at`, kolom `deleted_at` untuk entitas yang di-soft-delete (siswa, guru, dll.), `created_by`.

| Modul | Tabel inti | Aturan penting |
| --- | --- | --- |
| **Platform** | `schools`, `school_domains`, `platform_staff`, `activation_tokens`, `audit_logs` | Status: `active`/`suspended`. Token aktivasi di-hash, 48 jam, sekali pakai. Tanpa password lewat jaringan. |
| **Identity** | `user`, `member(school_id, role_id)`, `role`, `role_permission`, `session` | Satu user bisa jadi guru di sekolah A dan wali murid di B. Penonaktifan mencabut sesi. |
| **Master data** | `academic_year`, `semester`, `program`, `class`, `student`, `guardian`, `student_guardian`, `teacher`, `subject`, `teaching_assignment`, `lesson_period`, `enrollment` | NIS/NISN/RFID unik per sekolah. Hanya satu tahun ajaran aktif. Siswa soft-delete; riwayat enrollment tidak pernah dihapus. Import Excel dengan **preview + laporan error per baris**. |
| **Attendance** | `rfid_card`, `kiosk_device`, `attendance_policy`, `tap_event` (log mentah, immutable), `daily_attendance` (turunan), `class_session`, `class_attendance`, `attendance_status` (konfigurable) | Lihat 3.1. |
| **Grades** | `assessment_component` (bobot per mapel/semester, dapat dikonfigurasi), `grade`, `grade_lock` | UTS/UAS/Pengetahuan/Praktik dari sistem lama menjadi **komponen terkonfigurasi**, bukan kolom hardcode. Nilai 0–100; kunci nilai per semester oleh kurikulum. Rapor PDF. |
| **Assessments** | `rubric_aspect`, `rubric_scale`, `student_assessment` | Kepribadian, ekskul, kokurikuler disatukan satu mesin rubrik (skala A–D, aspek dapat diatur) — hilangkan 3 tabel & 3 alur duplikat. |
| **SPMB** | `admission_period`, `application`, `application_document`, `application_status_log` | Alur: `submitted → verified → accepted/rejected → enrolled`. "Enrolled" menciptakan `student` otomatis (tidak input ulang). Dokumen max 2 MB (PDF/JPG/PNG), cek MIME magic-bytes, honeypot + rate limit + Turnstile (opsional). Bukti PDF. |
| **Website** | `site_settings`, `page`, `post`, `block` (JSON terstruktur bertipe: hero, program, prestasi, testimoni, agenda, FAQ, galeri), `media`, `contact_message`, `download` | Sistem lama punya ±10 tabel konten homepage → diganti model **page + block** satu tabel. Konten rich-text disanitasi (allowlist) saat simpan. Publish/draft, slug unik, SEO meta, ISR cache per tenant. |
| **Notification** | `outbox`, `notification_template`, `notification_log` | Idempoten, retry, jejak pengiriman. |
| **Audit** | `audit_log` | Semua mutasi sensitif: siapa, apa, sebelum/sesudah, IP. |

### 3.1 Desain absensi RFID (bagian paling berisiko)
- Kiosk = `kiosk_device` dengan **API key sendiri** (bukan endpoint publik terbuka seperti sistem lama), terikat ke sekolah, bisa dicabut.
- `POST /kiosk/taps` **idempoten** (`client_event_id`); waktu otoritatif = server, `client_time` hanya disimpan. Kiosk (PWA) **antri offline** lalu sinkron.
- Tap mentah disimpan immutable di `tap_event`; `daily_attendance` dihitung dari policy (jam masuk, batas terlambat, jam pulang minimum, jendela debounce double-tap, zona waktu sekolah `Asia/Jakarta`). Policy bisa berubah tanpa merusak data historis (recompute dari log).
- Tap kedua dalam jendela debounce diabaikan; tap pertama = masuk, tap valid berikutnya = pulang. Kartu tak dikenal/siswa nonaktif ditolak dengan alasan dan dicatat.
- Notifikasi WhatsApp ke wali dikirim via outbox, bukan inline dalam request tap.

### 3.2 RBAC
Role bawaan (seed per sekolah, dapat diubah): `school_admin`, `principal` (kepala sekolah), `curriculum`, `treasurer`, `operator`, `teacher`, `guardian`/`student` (portal, fase lanjut). Permission dicek di **API** (sumber kebenaran) dan dipakai UI hanya untuk menyembunyikan menu/tombol. Data guru dibatasi ke kelas/mapel yang ditugaskan (ABAC ringan lewat `teaching_assignment`).

## 4. Lintas-sektor (non-fungsional)

- **Keamanan:** RLS, cookie `httpOnly/SameSite`, CSRF untuk mutasi cookie, rate limit per IP + per akun, argon2id, validasi upload (magic bytes, ukuran, nama acak, storage privat, signed URL), sanitasi HTML, secret hanya di env tervalidasi Zod (gagal start jika salah), header keamanan (CSP), audit log, dependency audit di CI. Bootstrap dev tetap dikunci `NODE_ENV=development`.
- **Performa:** indeks sesuai pola (`school_id, class_id, date`), pagination cursor di daftar besar, N+1 dicegah di repo, hasil laporan berat lewat job + cache.
- **Data:** soft-delete + restore; migrasi maju-saja (expand/contract) agar deploy tanpa downtime; backup `pg_dump` harian + uji restore; retensi tap/log terdokumentasi (privasi data anak).
- **Dokumentasi:** OpenAPI **dihasilkan dari route** (tidak ditulis tangan); setiap endpoint wajib `summary`, skema request/response/error. ADR singkat per keputusan besar di `docs/adr`.
- **Test pyramid:** unit untuk aturan murni (status absensi, bobot nilai), integrasi dengan Postgres nyata (termasuk **tes bocor-tenant**: sekolah A tak bisa membaca B), E2E Playwright untuk alur kritis (aktivasi, tap RFID, input nilai, SPMB, publik).

## 5. Rencana kerja (milestone, urut dependensi)

| M | Isi | Selesai bila |
| --- | --- | --- |
| **M0 Fondasi** | Monorepo, CI, `packages/db` + RLS, env, Fastify + OpenAPI otomatis, Better Auth, RBAC, audit, outbox/pg-boss, `ui` + app shell + i18n, docker-compose dev | `pnpm dev` jalan; tes bocor-tenant hijau; CI hijau; login + daftar permission bekerja |
| **M1 Platform** | Konsol platform: sekolah, subdomain, aktivasi admin, suspend/aktifkan, staf platform, audit viewer, reset password | Buat sekolah → email aktivasi → admin masuk, dalam 1 transaksi |
| **M2 Master data** | Tahun ajaran/semester, program, kelas, siswa, guru, wali, mapel, penugasan, jam pelajaran, enrollment, import/export Excel | Operator mengimpor 500 siswa dengan laporan error per baris |
| **M3 Absensi** | Kiosk RFID, policy, rekap harian, absensi kelas, status kustom, notifikasi WA, laporan PDF/Excel | Simulasi 1000 tap/menit tanpa duplikat; recompute policy benar |
| **M4 Nilai & Penilaian** | Komponen & bobot, input nilai, kunci, rubrik non-akademik, rapor PDF | Rapor satu kelas dihasilkan sebagai job |
| **M5 SPMB** | Periode, form publik, upload dokumen, review, bukti PDF, konversi ke siswa | Pendaftar diterima → siswa terbuat tanpa input ulang |
| **M6 Website** | Page/block CMS, berita, kontak, unduhan, SEO, cache | Situs publik sekolah skor Lighthouse ≥ 90 |
| **M7 Hardening & rilis** | Uji beban, review keamanan, backup/restore drill, deploy produksi, runbook | Checklist rilis lengkap |

Prioritas lama (absensi, auth, nilai, siswa) dipenuhi lewat urutan M0→M4; website/SPMB setelahnya. Di luar cakupan awal: billing/langganan, aplikasi mobile native, portal wali/siswa penuh, 2FA (disiapkan oleh Better Auth, diaktifkan kemudian).

## 6. Prosedur "hapus dan mulai dari nol"

1. Tag arsip: `git tag legacy-v0 && git push --tags` (kode lama tetap terbaca di riwayat).
2. Branch `rebuild`; hapus `apps/*`, `packages/*`, `repair_auth_copy.py`, lockfile, migrasi lama. **Pertahankan** `Planning/`, `.claude/`, `.gitignore`, `.env.example` (diperbarui).
3. Indeks ulang CodeGraph setelah scaffold M0 (`codegraph index`) agar pencarian kode tetap hemat token.
4. Tiap fitur: satu PR kecil, tes menyertai, endpoint ter-dokumentasi di OpenAPI otomatis, konsep/fitur dicatat di Notion.

## 7. Yang perlu Anda siapkan/pasang

| Item | Untuk |
| --- | --- |
| Node 26, pnpm (sudah ada), **Docker Desktop** | Postgres, MinIO, Mailpit lokal + Testcontainers |
| **GitHub CLI** `gh` (login) | PR dan CI; konektor GitHub gagal terhubung di sesi ini |
| Otorisasi **Notion** (`/mcp`) | Dokumentasi fitur/konsep sesuai aturan kerja Anda |
| Akun **Fonnte** (token) — bisa menyusul sebelum M3 | WhatsApp |
| Akun SMTP/App Password (bisa Mailpit dulu) | Email aktivasi/reset |
| Domain + VPS — bisa menyusul sebelum M7 | Produksi, wildcard subdomain |
| Playwright browsers (saya pasang via `pnpm`) | E2E |

## 8. Keputusan yang perlu dikonfirmasi

1. **Satu backend + satu web app** (rekomendasi) vs mempertahankan pemisahan Platform/School.
2. **Next.js** (SSR untuk situs publik/SPMB; rekomendasi) vs Vite SPA + situs publik terpisah.
3. **Hosting**: VPS + Docker (rekomendasi) vs PaaS (Railway/Fly).
4. ~~Pendaftaran mandiri~~ **Diputuskan 2026-10-29:** sekolah mendaftar sendiri, membayar, dan aktif otomatis (lihat bagian 9).

## 9. Revisi 1 (2026-10-29)

- **UI:** Tailwind v4 + shadcn/ui, seluruh komponen di `packages/ui`.
- **Git:** Git CLI sudah cukup. Perlu akun GitHub; GitHub Desktop opsional, `gh` tidak wajib.
- **Dokumentasi fitur:** halaman web di dalam aplikasi (`/docs`, MDX) dengan referensi API dari OpenAPI; sementara memakai artifact. Notion tidak dipakai.
- **Pendaftaran mandiri + aktif otomatis:** daftar akun (verifikasi email) → data sekolah + subdomain (dipesan 24 jam) → pilih paket/modul → invoice gateway → webhook (tanda tangan diperiksa, idempoten) → satu transaksi: `school`, `subscription`, keanggotaan admin, entitlement modul → langsung masuk. Staf platform hanya memantau dan menangani kasus khusus.
- **Langganan:** tabel `plan`, `module`, `price`, `subscription`, `subscription_item`, `invoice`, `payment`, `entitlement`. Katalog di database (ubah harga tanpa deploy). Modul inti selalu termasuk; modul lain per sekolah. Harga = dasar + modul + tingkat jumlah siswa aktif. Entitlement dicek di API (`requireEntitlement`), menu, kiosk, dan situs publik. Status: `pending_payment`, `active`, `past_due` (tenggang 7 hari), `suspended` (hanya baca), `canceled` (data disimpan 90 hari). Naik paket segera (prorata), turun paket di periode berikutnya.
- **Payment gateway:** "gratis" = tanpa biaya setup/bulanan, hanya potongan per transaksi + sandbox. Rekomendasi Midtrans (Snap), dibungkus adapter `PaymentProvider` agar bisa pindah ke Xendit. Tarif terkini belum terverifikasi (pencarian web gagal) — periksa di situs resmi. Auto-debit VA/QRIS umumnya tidak ada, jadi perpanjangan memakai invoice berulang (pengingat H-7, H-3, H-0 via email + WA). Produksi butuh verifikasi identitas/usaha dan rekening bank.
- **Roadmap:** M1 menjadi "Pendaftaran dan langganan" (mode sandbox).

## 10. Katalog modul (revisi 2, 2026-10-29)

- **Inti (tidak dijual terpisah):** identity + RBAC, master data, audit, pengaturan sekolah, notifikasi dasar, **kalender akademik**.
- **V1:** Absensi (RFID + kelas), Nilai + rapor, Penilaian non-akademik, SPMB, Website, Jadwal pelajaran, Portal wali/siswa (baca saja), Pengumuman + agenda, **Administrasi** (usulan: V1 akhir, menunggu keputusan V1/V2).
- **V2:** SPP + tagihan siswa, Kedisiplinan + BK, Ujian online (CBT), Ekspor Dapodik (hanya ekspor berkas).
- **V3:** Kepegawaian + absensi guru, LMS ringan, Perpustakaan + inventaris.
- **Siklus hidup siswa** (naik kelas massal, kelulusan, mutasi, buku induk) ada di Master data (M2), bukan modul berbayar.
- Paket usulan: Starter (Nilai + Pengumuman), Standard (+ Absensi, Jadwal, Penilaian, Portal wali, Administrasi), Pro (+ SPMB, Website). Modul V2 dijual terpisah. Harga belum ditetapkan.

### Kalender akademik
Tabel `calendar_event(type: holiday|exam|activity|break, start, end, scope: school|class|program)` terikat `academic_year`/`semester`. Hari efektif dihitung dari kalender; absensi tidak menandai alpa pada hari libur; jadwal menolak sesi di hari libur. Ekspor iCal, tampil di portal dan website. Libur nasional dapat di-seed per tahun, sekolah menambah sendiri.

### Administrasi: tanda tangan QR
- `signer_credential`: gambar tanda tangan + stempel per penandatangan (jabatan), disimpan di storage privat; hanya penandatangan sendiri yang bisa memakainya.
- Menandatangani = membuat `signed_document` (hash SHA-256 PDF, penandatangan, waktu, nomor surat) + token acak; QR di PDF mengarah ke `/verify/{token}` (halaman publik: nomor, penerbit, penandatangan, waktu, status; opsi unggah PDF untuk mencocokkan hash).
- Surat bisa dicabut (status `revoked`), halaman verifikasi menampilkannya.
- Batasan: ini tanda tangan sederhana, bukan tanda tangan elektronik tersertifikasi (TTE). Cukup untuk surat internal sekolah; dokumen yang butuh kekuatan hukum penuh perlu penyedia TTE.
- Fitur lain: surat masuk/keluar dengan nomor otomatis, disposisi, template surat dari data siswa, arsip dokumen, permintaan layanan dari wali (butuh Portal wali).

## 11. Revisi 3 (2026-10-29): keputusan modul

**Diputuskan:** Administrasi masuk V1. SPP masuk V1, dengan aturan sepenuhnya mengikuti sekolah (gratis sampai detail). Kurikulum disesuaikan per sekolah dengan **bank data** sebagai acuan. Jenjang beragam.

**Milestone (menggantikan bagian 5):** M0 Fondasi · M1 Pendaftaran dan langganan · M2 Master data, kalender, bank data kurikulum, siklus hidup siswa · M3 Jadwal + Absensi (+ ekskul) · M4 Nilai dan penilaian · M5 SPMB · M6 Administrasi · M7 SPP · M8 Website + Pengumuman · M9 Portal wali + Dashboard · M10 Rilis.

### Bank data dan kurikulum
- Schema `reference` (tanpa `school_id`, hanya baca, ber-versi): kurikulum (Merdeka, K13, KMA madrasah, dll.), struktur mapel per jenjang/fase, komponen nilai default, aspek rubrik, templat rapor, wilayah, agama, libur nasional.
- Sekolah **mengadopsi** acuan = salin ke data sekolah (`curriculum`, `subject`, `assessment_component`, `report_template`), lalu bebas diubah. Pembaruan acuan baru ditawarkan sebagai perbandingan (diff), tidak menimpa.
- Satu sekolah boleh punya banyak jenjang (mis. SD + SMP). Struktur tingkat/fase mengikuti kurikulum yang diadopsi, bukan angka tetap.

### SPP fleksibel
- `fee_item` (SPP, uang gedung, seragam, kegiatan), `fee_plan` (frekuensi: bulanan/tahunan/sekali/cicilan; berlaku per tingkat, program, kelas, atau siswa), `fee_discount` (beasiswa, saudara kandung), `invoice` siswa, `payment`. Nominal 0 = gratis. Denda keterlambatan opsional.
- Dua mode pembayaran: **catat manual** (tunai/transfer, unggah bukti, bendahara memverifikasi) dan **online** (VA/QRIS).
- **Risiko uang:** pembayaran siswa harus masuk ke rekening sekolah, bukan Edusync. Menampung dana pihak lain bisa memerlukan izin penyelenggara pembayaran. Usulan: sekolah menghubungkan akun gateway miliknya sendiri (kunci disimpan terenkripsi), atau memakai mode catat manual. Perlu keputusan.

### Usulan modul tambahan (menunggu persetujuan)
V1: Dashboard dan laporan, Ekstrakurikuler (sistem lama punya absensi ekskul). V2: Yayasan dan multi-sekolah. V3: Kesehatan siswa (UKS), Alumni, Keuangan sekolah (kas, dana BOS), API dan webhook.

## 12. Revisi 4 (2026-10-29): yayasan, SPP, V3

**Diputuskan:** SPP dibayar ke sekolah lewat QRIS milik sekolah atau transfer rekening sekolah; opsional dan diatur sekolah. Yayasan dan multi-sekolah masuk **V1** (pilot: Miftahul Huda, unit SMP IT dan SMK). Dashboard dan Ekstrakurikuler masuk V1. Modul V3 (UKS, Alumni, Keuangan sekolah, API dan webhook) tetap direncanakan.

### SPP tanpa gateway
Edusync tidak menyentuh uang SPP. Sekolah mengisi gambar QRIS dan/atau data rekening. Wali membayar di luar sistem, mengunggah bukti pada tagihan, bendahara memverifikasi (`payment.status: pending → verified | rejected`). Tidak ada kunci gateway milik sekolah, tidak ada risiko penampungan dana. Integrasi gateway sekolah bisa ditambahkan nanti sebagai opsi.

### Hierarki yayasan
- `foundation` 1—N `school` (unit). Sekolah tunggal otomatis punya yayasan tersembunyi, jadi hanya ada satu model.
- Keanggotaan: `member` bercakupan yayasan atau unit. Peran `foundation_admin` melihat semua unit; peran lain per unit.
- RLS: request mengisi `app.school_ids` (uuid[]) dari keanggotaan; kebijakan `school_id = ANY(app.school_ids)`. Tes bocor-tenant diperluas: antar yayasan tidak boleh bocor; antar unit hanya lewat izin.
- `person` ada di level yayasan untuk guru/pegawai dan wali (guru lintas unit, wali dengan anak di dua unit, satu kontak WhatsApp). Siswa tetap per unit, ditautkan ke `person` agar mutasi internal SMP IT → SMK menjaga riwayat.
- Langganan di level yayasan, item per unit dan modul, satu invoice. Entitlement dicek per unit. Kurikulum dan jenjang per unit.
- Subdomain per unit; konsol yayasan di subdomain yayasan. Satu login untuk semua.
- Kalender: acara yayasan diwariskan ke unit, unit menambah sendiri.
- SPMB internal untuk lulusan unit lain di yayasan yang sama.

### Dampak rencana
Hierarki dan RLS multi-unit harus ada sejak **M0** (mahal diubah belakangan). M1 membuat pendaftaran sebagai yayasan. Untuk pilot Miftahul Huda, paket `komplimen` (tanpa tagihan) agar pengujian M2–M4 tidak menunggu pembayaran.

### Pertanyaan terbuka
SMK: perlu PKL/prakerin dan kompetensi keahlian? SMP IT: perlu tahfidz dan monitoring ibadah (mutaba'ah)? Guru lintas unit: berapa banyak?

## 13. Revisi 5 (2026-10-29): PKL, Tahfidz, peran rangkap

**Milestone final usulan (menggantikan bagian 11):** M0 Fondasi · M1 Pendaftaran dan langganan · M2 Master data (jurusan, kompetensi keahlian, kalender, bank data) · M3 Jadwal + Absensi + Ekskul · M4 Nilai · M5 Tahfidz dan ibadah · M6 Administrasi · M7 PKL · M8 SPMB · M9 SPP · M10 Website + Pengumuman · M11 Portal + Dashboard · M12 Rilis. PKL setelah Administrasi karena memakai template surat; Tahfidz lebih awal karena pilot.

### Peran rangkap
- `member` (orang di unit) 1—N `member_role`. Izin = gabungan semua peran yang dipegang. Peran bisa berbeda per unit. Satu `person` = satu login.
- Peran (izin umum) dipisah dari **penugasan** (konteks): `teaching_assignment` (pengampu mapel+kelas), `homeroom_assignment` (wali kelas), `extracurricular_advisor`, `halaqah_musyrif`, `pkl_supervisor`. Data guru dibatasi oleh penugasan, bukan oleh peran.
- Audit log mencatat peran sumber izin. Aturan pemisahan tugas opsional per sekolah.
- Pilot: ±15 guru, sebagian mengajar di SMP IT dan SMK.

### Jurusan (SMA sederajat)
`program` bertingkat: jurusan/peminatan (IPA, IPS, dll. untuk SMA) atau bidang → program → kompetensi keahlian (SMK), dengan acuan di bank data. Kelas dan kurikulum mengacu ke `program`.

### PKL / prakerin (SMK)
`pkl_partner` (DUDI), `pkl_period`, `pkl_placement` (siswa, mitra, periode, pembimbing sekolah, pembimbing industri), `pkl_journal` (harian, bisa lampiran foto), `pkl_visit` (kunjungan monitoring), `pkl_assessment` (rubrik dari sekolah, dinilai pembimbing industri dan sekolah), sertifikat dan surat (pengantar, tugas, permohonan) lewat template modul Administrasi dengan tanda tangan QR. Pembimbing industri mengakses lewat tautan masuk terbatas, tanpa akun staf penuh.

### Tahfidz dan ibadah (SMP IT)
`halaqah` (musyrif, anggota, jadwal), `hafalan_target`, `hafalan_entry` (jenis ziyadah/murajaah, surah, ayat awal-akhir, kualitas, catatan), `ibadah_item` (daftar mutaba'ah yang diatur sekolah) dan `ibadah_log` harian. Acuan surah/juz di bank data. Wali melihat progres lewat portal. Rapor tahfidz mengikuti templat rapor.

## 14. Domain sendiri (2026-10-29)

- **Tabel:** `school_domains(school_id, hostname, kind: platform_subdomain|custom, status: pending|verified|active|failed, verification_token, verified_at, is_primary)`.
- **Alur:** admin menambah hostname → sistem menampilkan `CNAME` ke alamat Edusync dan `TXT` bukti kepemilikan → pemeriksa DNS berkala (job) → status `verified` → sertifikat HTTPS diterbitkan otomatis (Caddy on-demand TLS; endpoint `ask` hanya mengizinkan hostname yang terdaftar dan terverifikasi) → subdomain bawaan dialihkan 301 ke domain utama.
- **Tahap 1 (M10, V1):** situs publik dan SPMB per unit. Tanpa login di domain luar, jadi cookie, CORS, dan tautan email tidak berubah. Dashboard dan portal tetap di `slug.edusync.id`.
- **Tahap 2 (V3):** dashboard dan portal wali di domain sekolah (sesi per host, `trustedOrigins` dinamis, tautan email memakai host utama).
- **Batasan:** apex tanpa `www` memerlukan ALIAS/A record; batas penerbitan sertifikat perlu dipantau; hostname dicegah mengarah ke domain platform lain (anti pembajakan), dan domain dilepas bila langganan berhenti.
- **Paket:** entitlement `custom_domain` pada paket tertentu atau modul tambahan.
- **Hosting:** mengandalkan VPS dengan Caddy. Jika pindah ke PaaS, perlu layanan setara (mis. Cloudflare for SaaS).
