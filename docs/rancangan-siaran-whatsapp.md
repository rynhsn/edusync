# Rancangan: Siaran dan pesan langsung WhatsApp (rilis 0.6.0)

Status: rancangan, belum diimplementasikan. Dibangun di atas modul `messaging` yang ada (Baileys, antrean `msg_message`,
`Dispatcher`). Tidak ada arsitektur baru: semua pesan tetap lewat satu antrean, satu pengirim, satu jeda acak per sekolah.

## 0. Titik pijak (kode yang ada)

| Hal | Lokasi | Catatan untuk rancangan ini |
|---|---|---|
| Antrean + riwayat | `msg_message` (`packages/db/src/schema.ts`), RLS 0042 | Satu baris per penerima; `dedupe_key` unik per sekolah; `to_phone` wajib. |
| Pengantre | `enqueueMessages`, `enqueueRaw` (`packages/db/src/messaging.ts`) | Dedupe per nomor (`normalizePhone`); batas `maxQueuedPerSchool` (bawaan 500) diam-diam membuang. |
| Pengirim | `Dispatcher.serveSchool` (`apps/worker/src/messaging/dispatcher.ts`) | 1 pesan/sekolah/putaran, jeda acak `delay_min..max` (5–15 dtk), jendela kirim, backoff 1m..6j, maks 5 percobaan, `not_on_whatsapp` tidak diulang. Urutan klaim: `created_at` saja. |
| Sakelar | `msg_setting.enabled` + `platform.enabled` | `enabled=false` → pesan selain `test` jadi `skipped/disabled`. |
| Klien WA | `BaileysClient.sendMessage(chatId, text)` (`baileys-client.ts`), `WaSocket.sendMessage(jid, {text})` | Hanya teks; perlu diperlebar untuk dokumen. |
| Pengirim abstrak | `MessageSender.send(schoolId, phone, text)` (`sender.ts`) | `LogSender`/`FakeSender` ikut diubah. |
| Pengumuman | `announcement.audience`: `public`/`portal`/`staff`/`all`; `POST /v1/announcements/:id/publish` | Tidak disentuh transaksinya. |
| Surat | `letter`, `signed_document.pdf_sha256`; PDF dibuat **di klien** (`apps/api/src/routes/letters.ts` ±1178) | Server tidak punya PDF surat; klien yang mengunggah. |
| Kontak | `guardian.phone` via `student_guardian`; `teacher.phone`; `class.homeroom_teacher_id` | Staf = baris `teacher` aktif bernomor. |
| Berkas | Pola `bytea` + `mime` + `size` (`school_file`, batas per rute + `bodyLimit`) | Dipakai ulang untuk lampiran. |
| Izin | `message:read`, `message:manage` (`packages/contracts/src/permissions.ts`) | Tambah dua izin baru. |

## 1. Tahap dan dependensi

```
A (pesan langsung teks) ──► B (lampiran) ──► D (surat sebagai lampiran)
        └──────────────────► C (siaran pengumuman; lampiran opsional bila B sudah ada)
```

A wajib lebih dulu (tabel `msg_batch`, prioritas antrean, batas harian, pemilih penerima). B dan C boleh paralel setelah A.
D butuh B. Tiap tahap bisa dirilis sendiri di balik izin dan modul yang sudah ada.

### Tahap A — Pesan langsung teks ke wali/staf terpilih + riwayat

1. Migrasi 0115 (lihat §2): `msg_batch`, `msg_direct_template`; `msg_message` + `batch_id`, `teacher_id`, `priority`;
   `msg_setting` + `daily_limit`.
2. Dispatcher: klaim `order by priority, created_at, id` (satu baris SQL di `serveSchool`). Prioritas: 0 = peristiwa
   otomatis & `test`, 1 = pesan langsung, 2 = siaran. Tanpa ini, notifikasi kedatangan menunggu di belakang ratusan siaran.
3. `packages/db/src/messaging.ts`: `resolveRecipients(tx, selection)` dan `enqueueBatch(tx, …)` (lihat §5); dipakai A dan C.
4. Endpoint pratinjau, buat batch, daftar batch, rincian batch, batalkan batch (§4).
5. UI mobile (§6), OpenAPI + halaman dokumentasi `apps/web/src/app/(app)/docs/content-services.ts`.

### Tahap B — Lampiran dokumen

1. Migrasi 0116: `msg_attachment` (RLS), `msg_batch.attachment_id`.
2. Unggah: `POST /v1/messaging/attachments` JSON `{fileName, mime, dataBase64}`, `bodyLimit` 3 MB (pola `cards.ts`).
   Batas: **2 MB asli**; jenis **`application/pdf`, `image/jpeg`, `image/png`** saja, diverifikasi dari *magic bytes*
   (`%PDF-`, `FF D8 FF`, `89 50 4E 47`), bukan hanya `mime` kiriman. Simpan `sha256`.
3. Penyimpanan: `bytea` di Postgres (sama seperti `school_file`); tanpa object storage baru. Lampiran yang tak dipakai
   batch dalam 24 jam, atau batch-nya sudah final > 7 hari, **dihapus isinya** (`data = null`, `purged_at = now()`);
   metadata tetap untuk riwayat/audit. Pembersihan = penjadwal baru di `apps/worker/src/messaging/schedulers.ts`
   (peran platform), tiap jam.
4. Akses: RLS `tenant_isolation`; API hanya mengembalikan metadata (nama, ukuran, jenis), tak ada endpoint unduh isi
   bagi pengguna sekolah kecuali pengirim memeriksa ulang (`GET …/attachments/:id/content`, izin `message:send`).
5. Worker: klaim mengembalikan `batch_id`; bila batch punya lampiran, worker membaca `msg_attachment` (pool platform,
   saring `school_id` juga), menyimpan `Buffer` di cache memori kecil (LRU, kunci `attachment_id`, maks ±20 MB) agar
   siaran 200 penerima tidak membaca 2 MB × 200 dari DB. `data` null → `failed`, `detail = 'attachment_expired'`, tidak diulang.
6. Kirim: `MessageSender.send(schoolId, phone, text, attachment?)`, `attachment = {data, mime, fileName}`.
   Baileys: PDF → `{ document: Buffer, mimetype, fileName, caption: text }`; gambar → `{ image: Buffer, caption: text }`.
   `WaSocket.sendMessage` diperlebar ke `AnyMessageContent`. Header/footer (`composeMessage`) tetap dipasang ke caption.
   Spike wajib sebelum implementasi: batas panjang caption di klien WA; bila terpotong, kirim teks lalu dokumen sebagai
   dua kirim dalam satu klaim (satu status).

### Tahap C — Siaran pengumuman

1. Migrasi 0117: `msg_batch.announcement_id` + indeks unik parsial (satu siaran per pengumuman), `msg_opt_out`.
2. **Tidak** menggabungkan ke transaksi `publish`. Setelah terbit, UI menawarkan "Siarkan lewat WhatsApp" yang memanggil
   `POST /v1/announcements/:id/broadcast` (pratinjau dulu). Galat WhatsApp tak pernah menggagalkan penerbitan.
3. Sasaran mengikuti `audience`: `portal` → wali; `staff` → staf; `all`/`public` → wali dan/atau staf (pengguna memilih,
   bawaan wali saja). Boleh dipersempit per rombel/tingkat. Murid tidak pernah jadi sasaran (§8).
4. Isi: `*{judul}*\n\n{isi}` dipotong 1.000 karakter + "Selengkapnya di portal sekolah." bila lebih. Isi pengumuman
   dianggap teks polos (tanpa render markdown/HTML).
5. Tarik ke draf (`unpublish`) atau hapus pengumuman → pesan batch yang masih `queued` menjadi `skipped/cancelled`.
6. Opt-out wali berlaku untuk siaran (§7).

### Tahap D — Integrasi surat

1. Migrasi 0118: `msg_attachment.letter_id`.
2. Di halaman surat (status `signed`, ada `studentId`): "Kirim ke wali via WhatsApp". Klien sudah membuat PDF berQR;
   klien mengunggahnya ke `POST /v1/letters/:id/whatsapp-attachment`. Server **menolak** bila `sha256` ≠
   `signed_document.pdf_sha256` yang terdaftar (409 `hash_mismatch`), atau surat `revoked`/draf (409). Bila hash belum
   terdaftar, server mendaftarkannya dulu lewat logika rute `PUT …/hash` yang ada (sekali tulis).
3. Lalu alur pesan langsung A dengan lampiran itu, penerima diisi otomatis wali murid surat (bisa diubah).
4. Surat tanpa murid (mis. undangan staf): penerima dipilih manual.

## 2. Model data (aditif, RLS multi-tenant)

Semua tabel baru: `school_id NOT NULL`, `ENABLE` + `FORCE ROW LEVEL SECURITY`, kebijakan `tenant_isolation`
(`school_id = ANY (app_school_ids())`), `GRANT SELECT, INSERT, UPDATE, DELETE … TO edusync_app` (pola 0042/0100).
Rujukan antar tabel baru memakai FK komposit `(school_id, id)` agar tak bisa menunjuk baris sekolah lain.
Tidak ada kolom yang dihapus/diubah tipenya; kolom baru di tabel lama nullable atau ber-default.

| Migrasi | `when` | Isi |
|---|---|---|
| `0115_msg_direct` | 1798248600000 | Tabel `msg_batch`, `msg_direct_template`; `msg_message` + `batch_id uuid null`, `teacher_id uuid null`, `priority smallint not null default 0`; FK komposit `msg_message(school_id,batch_id) → msg_batch(school_id,id)`; indeks `msg_message_batch_idx(batch_id, status)`; `msg_setting` + `daily_limit integer not null default 200` (`check 0..2000`). |
| `0116_msg_attachment` | 1798335000000 | Tabel `msg_attachment`; `msg_batch` + `attachment_id` (FK komposit). |
| `0117_msg_broadcast` | 1798421400000 | `msg_batch` + `announcement_id` (FK ke `announcement`, `on delete set null`); unik parsial `(school_id, announcement_id) where kind = 'broadcast' and announcement_id is not null`; tabel `msg_opt_out`. |
| `0118_msg_letter` | 1798507800000 | `msg_attachment` + `letter_id` (FK ke `letter`). |

Jurnal: entri `idx` 115–118 di `packages/db/drizzle/meta/_journal.json` dengan `when` di atas (lebih besar dari 0114 =
1798162200000). Catat di kepala tiap SQL seperti 0114.

Kolom inti:

- `msg_batch`: `id`, `school_id`, `kind` (`direct`|`broadcast`), `title` (subjek internal), `body_template` (teks asli
  dengan pengganti), `selection jsonb` (spesifikasi pemilih apa adanya, untuk audit), `recipient_count`,
  `excluded jsonb` (`{noPhone, invalid, duplicate, optedOut}` hitungan), `created_by text` (user id), `created_at`,
  `cancelled_at`, `cancelled_by`; unik `(school_id, id)`.
- `msg_attachment`: `id`, `school_id`, `file_name`, `mime` (enum 3 jenis, `check`), `size` (`check <= 2097152`),
  `sha256`, `data bytea null`, `purged_at`, `created_by`, `created_at`; unik `(school_id, id)`.
- `msg_opt_out`: `school_id`, `phone` (dinormalisasi), `guardian_id null`, `source` (`staff`|`portal`), `created_by`,
  `created_at`; PK `(school_id, phone)`. Kunci nomor, karena dedupe juga per nomor.
- `msg_direct_template`: `id`, `school_id`, `name`, `body`, `created_at`, `updated_at`; unik `(school_id, name)`.
  Bawaan (mis. "Pemanggilan orang tua") ada di `packages/contracts/src/messaging.ts`, bukan baris DB.
- `msg_message.event_key` baru: `direct`, `broadcast` (teks bebas, sudah `text`). `student_id` diisi bila penerima wali
  dalam konteks murid; `teacher_id` bila penerima staf.

## 3. Izin baru

| Izin | Arti | Peran bawaan |
|---|---|---|
| `message:send` | Pesan langsung ke penerima terpilih (A, D), unggah lampiran | `school_admin`, `principal`, `operator` |
| `message:broadcast` | Siaran ke rombel/seluruh sekolah dan siaran pengumuman (C) | `school_admin`, `operator` |

Siaran pengumuman butuh `announcement:manage` **dan** `message:broadcast`, modul `announcements` **dan** `messaging`.
Integrasi surat butuh `letter:read` + `message:send`, modul `administration` + `messaging`. Riwayat batch: `message:read`.
`teacher` tidak mendapat izin baru di 0.6.0 (lihat keputusan terbuka #1). Perbarui `permissions.test.ts`.

## 4. Endpoint (semua `requireModule('messaging')`, `withTenant`, OpenAPI)

| Metode & jalur | Izin | Keterangan |
|---|---|---|
| `POST /v1/messaging/recipients/preview` | `message:send` | Body: `selection` (§5) + `kind`. Balikan: `total`, `excluded{…}`, `sample` (≤ 10 nama + nomor disamarkan), `dailyRemaining`, `queueRemaining`, `accountReady`, `enabled`. Tanpa efek. |
| `POST /v1/messaging/batches` | `message:send` (`message:broadcast` bila pemilih bukan daftar individu atau > 30 penerima) | Body: `selection`, `body`, `templateId?`, `attachmentId?`, `expectedTotal`. 409 `count_changed` bila hasil resolusi ≠ `expectedTotal` (konfirmasi basi); 409 `daily_limit`, `queue_full`, `messaging_disabled`; 400 `sensitive_content`, `unknown_placeholder`. Satu transaksi; semua atau tidak sama sekali. |
| `GET /v1/messaging/batches` | `message:read` | Daftar batch + hitungan status. |
| `GET /v1/messaging/batches/:id` | `message:read` | Rincian + penerima (nama, nomor disamarkan `maskPhone`, status, `detail`). |
| `POST /v1/messaging/batches/:id/cancel` | `message:send` | `queued` → `skipped/cancelled`. `sending` tidak disentuh. |
| `POST /v1/messaging/batches/:id/retry-failed` | `message:send` | Pesan `failed` (kecuali `not_on_whatsapp`, `attachment_expired`, `opted_out`) → `queued`, `attempts = 0`; tetap terhitung batas harian. |
| `GET/POST/PUT/DELETE /v1/messaging/direct-templates` | baca `message:read`, tulis `message:manage` | Templat bebas bernama. |
| `POST /v1/messaging/attachments` (B) | `message:send` | Unggah; balikan metadata. |
| `GET/PUT/DELETE /v1/messaging/opt-outs` (C) | `message:manage` | Kelola opt-out (nomor disamarkan di daftar). |
| `POST /v1/announcements/:id/broadcast` (+ `/preview`) (C) | `announcement:manage` + `message:broadcast` | Pengumuman harus `published` dan belum kedaluwarsa; 409 `already_broadcast`. |
| `POST /v1/letters/:id/whatsapp-attachment` (D) | `letter:read` + `message:send` | Unggah PDF surat dengan verifikasi hash. |

Retry per pesan yang ada (`POST /v1/messaging/messages/:id/retry`) tetap berlaku.

## 5. Resolusi penerima dan pengantrean

`selection` (Zod, maks 500 id per larik):
`{ students?: uuid[], classes?: uuid[], gradeLevels?: string[], wholeSchool?: true, guardians?: uuid[], teachers?: uuid[],
allStaff?: true, guardianScope?: 'primary'|'all' }` (bawaan `primary`: wali utama, jatuh ke wali lain bila utama tak
bernomor).

Murid/rombel hanya yang `status = 'active'` dan terdaftar di tahun ajaran aktif. Aturan `resolveRecipients`:

1. Kumpulkan pasangan (penerima, konteks murid). `normalizePhone` setiap nomor; null → `excluded.noPhone`/`invalid`.
2. Dedupe per nomor ternormalisasi (wali dengan dua anak = satu pesan; `{{student}}` menjadi "A dan B").
   Nomor wali yang sama dengan nomor staf → satu pesan, prioritas sebagai wali.
3. Siaran: buang nomor di `msg_opt_out` → `excluded.optedOut`.
4. Render per penerima dengan `renderTemplate`; pengganti yang diizinkan hanya `{{guardian}}`, `{{student}}`,
   `{{class}}`, `{{school}}`, `{{date}}`, `{{teacher}}` (staf). Lainnya → 400 `unknown_placeholder`.
5. Sisipkan `msg_message` dengan `batch_id`, `priority` (1 langsung, 2 siaran), `dedupe_key = batch:{id}:{nomor}`,
   `on conflict do nothing`.

`enqueueBatch` **tidak** memakai jalur "diam-diam membuang" `enqueueMessages`: semua pemeriksaan dijalankan di depan dan
menghasilkan 409 eksplisit. Untuk melindungi notifikasi otomatis, `queued` batch + baru tidak boleh melebihi
`maxQueuedPerSchool − 100` (100 slot dicadangkan untuk peristiwa).

## 6. UI mobile (`apps/web/src/app/(app)/messaging/`)

Halaman "Kirim pesan" (tab baru di samping Pengaturan/Riwayat), satu kolom, alur bertahap:

1. **Penerima**: segmen `Murid | Rombel | Wali | Staf`; pencarian nama (pakai pemilih murid yang ada), cip terpilih yang
   bisa dihapus. Pilihan "Seluruh sekolah" hanya tampil dengan `message:broadcast`.
2. **Pesan**: pilih templat atau teks bebas; penghitung karakter; tombol sisip pengganti; lampiran (B) dengan nama,
   ukuran, jenis; pratinjau gelembung WhatsApp (komponen pratinjau templat yang sudah ada, termasuk header/footer).
3. **Tinjau**: hasil `preview`: "128 wali akan menerima. 6 tanpa nomor, 2 tidak valid, 4 ganda, 3 menolak siaran",
   sisa kuota harian, perkiraan durasi (`total × rata-rata jeda`), peringatan bila WhatsApp tidak `ready` atau sakelar
   `enabled` mati (tombol kirim nonaktif).
4. **Konfirmasi**: dialog dengan jumlah tepat; > 30 penerima wajib mengetik jumlahnya. Kirim membawa `expectedTotal`.
5. **Riwayat batch**: daftar kartu (judul, pengirim, waktu, bilah status terkirim/antre/gagal/dilewati), rincian per
   penerima, tombol batalkan dan kirim ulang yang gagal.

Pengumuman (C): setelah "Terbitkan" berhasil, lembar bawah "Siarkan lewat WhatsApp?" dengan sasaran terkunci sesuai
`audience`, lalu langkah 3–4 di atas. Surat (D): tombol di rincian surat bertanda tangan, membuka langkah 2 dengan
lampiran dan penerima terisi. Semua teks di `apps/web/messages/{en,id,su}.json`.

## 7. Perlindungan pengiriman dan risiko pemblokiran nomor

- **Tetap satu jalur**: jeda acak per sekolah, jendela kirim, backoff, `maxAttempts`, kedaluwarsa (semua sudah ada)
  berlaku sama untuk batch. Tidak ada jalur kirim cepat.
- **Batas harian per sekolah**: `msg_setting.daily_limit` (bawaan 200) menghitung pesan `priority > 0` yang dibuat sejak
  00:00 waktu sekolah, semua status kecuali `skipped/cancelled`. Pengaturan platform baru `dailyLimitMax`
  (jsonb `platform_setting.messaging`, tanpa migrasi, bawaan 500) membatasi nilai sekolah.
- **Nomor baru**: bila `wa_account` tersambung < 7 hari, batas harian efektif `min(daily_limit, 50)`.
- **Siaran memakai jeda minimum lebih besar**: `delay_min` efektif `max(delay_min, 10)` untuk `priority = 2`.
- **Opt-out wali**: staf menandai di halaman wali; (opsional, keputusan #4) sakelar di portal wali. Berlaku untuk siaran;
  pesan langsung ke opt-out ditampilkan sebagai peringatan, tetap boleh dikirim.
- **Dedupe & validasi**: `normalizePhone`, dedupe per nomor dalam batch, `dedupe_key` unik mencegah klik ganda;
  `not_on_whatsapp` tidak diulang dan ditampilkan agar data wali diperbaiki.
- **Variasi isi**: dorong pengganti `{{guardian}}`/`{{student}}` agar pesan tidak identik (pratinjau memberi saran bila
  tidak ada pengganti di siaran > 30 penerima).

Risiko yang tetap ada: WhatsApp dapat memblokir nomor sekolah untuk pola siaran massal walau ada jeda; Baileys adalah
klien tak resmi. Mitigasi di atas menurunkan, tidak menghilangkan, risiko. UI menampilkan peringatan ini sekali saat
siaran pertama.

## 8. Privasi dan audit

- Hanya nomor dari `guardian.phone` (lewat `student_guardian` murid aktif) dan `teacher.phone`. Tidak ada nomor ketik
  bebas di batch (pesan uji tetap terpisah). Murid tidak dikirimi (`student.phone` tidak dipakai).
- Isi bebas ditolak bila memuat deret 16 digit (pola NIK) → 400 `sensitive_content`. Nilai tidak dapat dideteksi andal:
  pengganti nilai/NIK tidak disediakan, dan UI memperingatkan. Isi batch disimpan untuk audit.
- `audit(tx, ctx, 'messaging.batch.create', 'msg_batch', id, {kind, total, attachment: bool})`; juga `cancel`,
  `retry-failed`, `attachment.upload`, `opt_out.set`, `announcement.broadcast`, `letter.whatsapp`. Isi pesan tidak
  diduplikasi ke audit (sudah di `msg_batch`).
- Nomor disamarkan (`maskPhone`) di semua respons daftar. `GET` lampiran isi hanya untuk pengirim ber-izin.
- Lampiran dibersihkan sesuai §1B; WhatsApp sendiri menyimpan salinan di ponsel penerima — dinyatakan di UI.

## 9. Status, kegagalan, coba ulang

Status per penerima memakai kolom yang ada: `queued → sending → sent | failed | skipped`. `detail` baru:
`cancelled`, `opted_out`, `attachment_expired`. Status batch dihitung (bukan disimpan): `sending` bila ada `queued/sending`,
selain itu `done`. `sent` berarti diterima server WhatsApp, bukan dibaca (tanda baca tidak dilacak di 0.6.0).

Kegagalan: `not_ready` dan galat jaringan mengikuti backoff yang ada; `expired` (WhatsApp sekolah tidak siap > `expiryHours`)
→ `skipped/expired`, bisa dikirim ulang lewat `retry-failed`.

## 10. Ketergantungan pada modul messaging

- Modul `messaging` aktif wajib untuk semua endpoint baru. Pratinjau tetap jalan saat sakelar mati, pembuatan batch → 409
  `messaging_disabled` bila `msg_setting.enabled = false` atau platform `enabled = false` (tidak membuat pesan yang
  pasti `skipped`). Bila sakelar dimatikan saat batch berjalan, dispatcher yang ada sudah menandai sisanya
  `skipped/disabled`.
- Penyedia `log` (pengembangan) mencatat dokumen sebagai `[lampiran nama, ukuran]` di `LogSender`.

## 11. Pengujian minimum

`packages/db`: resolusi penerima (dedupe kakak-adik, wali utama, opt-out, nomor tidak valid), RLS lintas sekolah untuk
4 tabel baru, FK komposit menolak `batch_id` sekolah lain. Worker: urutan prioritas, lampiran dari cache, `attachment_expired`,
pembatalan di tengah. API: `count_changed`, `daily_limit`, `queue_full`, `sensitive_content`, izin per peran, hash surat
tidak cocok. Kontrak: validasi magic bytes.

## 12. Keputusan terbuka (default aman dipakai sampai diputuskan)

| # | Pertanyaan | Default |
|---|---|---|
| 1 | Wali kelas boleh memanggil orang tua murid rombelnya sendiri? | Tidak di 0.6.0; kandidat 0.6.x dengan izin `message:send_homeroom` yang dibatasi `homeroom_teacher_id`. |
| 2 | Batas harian bawaan | 200/sekolah, maks platform 500, 50 untuk nomor < 7 hari. |
| 3 | Ukuran & jenis lampiran | 2 MB; PDF/JPG/PNG. |
| 4 | Opt-out dari portal wali / balasan "STOP" | Hanya oleh staf; portal menyusul; balasan masuk tidak diproses (worker belum mendengar pesan masuk). |
| 5 | Opt-out juga memblokir pesan langsung? | Tidak; hanya peringatan. |
| 6 | Siaran pengumuman `public`/`all` ke staf juga? | Bawaan wali saja; staf dicentang manual. |
| 7 | Siaran otomatis saat terbit tanpa langkah tinjau? | Tidak pernah; selalu pratinjau + konfirmasi. |
| 8 | Masa simpan isi lampiran | 7 hari setelah batch final; metadata selamanya. |
| 9 | Pesan ke murid (nomor murid) | Tidak. |
| 10 | Pemotongan pengumuman panjang | 1.000 karakter + rujukan portal. |
| 11 | Ambang konfirmasi ketik-jumlah | > 30 penerima. |
