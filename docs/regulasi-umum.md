# Verifikasi regulasi akademik umum (SD/MI, SMP/MTs, SMA/MA, SMK/MAK) dan penilaian roadmap Edusync

Disusun 12 November 2026. Riset baca-saja: tidak ada kode, migrasi, atau data yang diubah. Dokumen ini memeriksa asumsi regulasi di
[`Planning/11-academic-roadmap.md`](../Planning/11-academic-roadmap.md) dan [`docs/AUDIT-AKADEMIK.md`](AUDIT-AKADEMIK.md)
(yang menyebut rincian regulasi "dari ingatan dan belum diverifikasi").

Cakupan: sekolah umum di bawah Kemendikdasmen. Madrasah (Kemenag) hanya disinggung keterkaitannya dan **belum diverifikasi ke teks resmi**.

## Cara membaca status

| Status | Arti |
|---|---|
| **Terverifikasi-sumber-resmi** | Teks atau metadata resmi dibaca langsung (PDF peraturan di BPK/peraturan.go.id/JDIH, halaman BPK, atau terbitan BSKAP di domain resmi/belajar.id). |
| **Sekunder** | Hanya dari media, blog, atau situs pihak ketiga. Hanya petunjuk. |
| **Belum-terverifikasi** | Tidak ditemukan, bertentangan antar-sumber, atau sumber resmi tidak dapat dibuka. |

Keterbatasan: situs `kemendikdasmen.go.id` dan pusat bantuan TKA menolak akses otomatis (HTTP 403) sehingga halaman resminya tidak terbaca;
tanggal "diundangkan" beberapa peraturan hanya terbaca dari ringkasan BPK, bukan dari lembar pengesahan PDF.

---

## 1. Ringkasan eksekutif

1. **Tidak ada "Kurikulum 2025" baru.** Yang terjadi: Permendikdasmen 13/2025 (ditetapkan 11 Jul 2025, berlaku 15 Jul 2025) *mengubah*
   Permendikbudristek 12/2024. Isinya: pendekatan **pembelajaran mendalam** masuk kerangka dasar, mapel pilihan **Koding dan Kecerdasan
   Artifisial (KKA)** mulai TA 2025/2026 bertahap, kokurikuler didefinisikan ulang, struktur kurikulum dan JP diperbarui. Capaian Pembelajaran
   kini dari Keputusan Kepala BSKAP 046/H/KR/2025 (16 Jul 2025; mencabut 32/H/KR/2024). Istilah "Kurikulum Merdeka" tetap dipakai
   luas, tetapi dasar hukumnya sekarang rangkaian Permendikdasmen di atas.
2. **Fase A-F dan pemetaan kelas di roadmap benar**, dengan satu tambahan: SMK program 4 tahun memetakan kelas XI-XIII ke Fase F (Panduan
   Pembelajaran dan Asesmen/PPA 2025, Tabel 3.1).
3. **Struktur kurikulum terbukti terukur dan wajib dapat dikonfigurasi:** JP per mapel per tahun terbagi **intrakurikuler dan kokurikuler**;
   durasi 1 JP berbeda per jenjang (SD 35, SMP 40, SMA/SMK 45 menit); minggu efektif per tahun berbeda (36, tetapi 32 untuk kelas VI, IX, XII).
   Roadmap 2B hanya menyebut "JP mingguan/tahunan": perlu dua kolom (intra dan kokurikuler) plus menit per JP.
4. **KKM sudah tidak ada dalam panduan resmi 2025** (kata "KKM" nol kali muncul di PPA 2025). Dasar resmi: Permendikbudristek 21/2022 Pasal 9 ayat (8)
   membandingkan capaian dengan *kriteria ketercapaian tujuan pembelajaran*. PPA menegaskan kriteria itu "bukan berupa angka, melainkan kalimat", tetapi memberi contoh rubrik dan interval. Rancangan KKTP
   multi-mode di roadmap tepat; fallback ke `grading_setting.kkm` boleh dipertahankan sebagai kompatibilitas, jangan sebagai konsep utama.
5. **Asesmen resmi hanya dua: formatif dan sumatif** (21/2022 Pasal 9). "Diagnostik" bukan jenis ketiga; di PPA 2025 ia adalah asesmen awal
   (bagian formatif). Formatif **tidak boleh** dipakai untuk nilai rapor, kenaikan kelas, atau kelulusan (PPA). Roadmap 3 sudah sejalan, tetapi
   `category=diagnostik` perlu dipetakan sebagai tujuan/waktu, bukan jenis.
6. **Kenaikan kelas dan kelulusan tidak punya rumus nasional.** Satuan pendidikan menetapkan mekanisme sendiri berdasarkan pedoman
   (21/2022 Pasal 10-11; PPA 2025 Bagian C). Ambang kehadiran, jumlah mapel tak tuntas, dan kriteria lain **harus dapat dikonfigurasi dan tidak boleh di-hardcode**.
   Tinggal kelas adalah "kasus luar biasa" dan perlu musyawarah dewan pendidik. Media melaporkan (Okt 2026, **sekunder**) kemungkinan perubahan mulai
   TA 2027/2028; kebijakan belum final.
7. **Kelulusan: ujian satuan pendidikan, bukan TKA.** TKA (Permendikdasmen 9/2025, 28 Mei 2025; mencabut Permendikbudristek 31/2023 tentang Uji Kesetaraan)
   bukan syarat kelulusan. Hasilnya tidak di ijazah (SHTKA, sumber **sekunder**) dan dipakai di jalur prestasi SPMB 2026.
8. **Rapor SD-SMK minimal 12 komponen** (PPA 2025). Roadmap melewatkan dua yang eksplisit: **Tanggapan Orang Tua/Wali** dan **kolom Deskripsi Capaian
   Kokurikuler**. Kokurikuler sudah wajib di rapor sejak panduan 2025, jadi jangan menunggu fase 4 untuk setidaknya kolom deskripsinya.
9. **Kokurikuler: P5 digantikan.** Berlaku sekarang: delapan dimensi profil lulusan (Permendikdasmen 13/2025 Pasal 17), tiga bentuk (pembelajaran
   kolaboratif lintas disiplin, Gerakan 7 Kebiasaan Anak Indonesia Hebat/G7KAIH, "cara lainnya"), tema ditentukan satuan pendidikan, alokasi JP
   per tahun per kelas tercantum di Panduan Kokurikuler 2025. Roadmap fase 4 sudah memakai kerangka berversi: benar.
10. **Beban kerja guru:** Permendikdasmen 11/2025 (berlaku 1 Jul 2025) mensyaratkan **minimal 24, maksimal 40 jam tatap muka/minggu**; klaim "16 jam" yang beredar di satu
    situs **tidak sesuai** teks resmi. Ada peran baru "Guru wali" (SMP/SMA/SMK) dan "koordinator pembelajaran berbasis projek", serta ekuivalensi wali kelas = 2 jam tatap muka.
11. **Standar Proses baru (Permendikdasmen 1/2026, 2 Jan 2026)** mencabut 16/2022: dokumen perencanaan minimal hanya tujuan, langkah, dan asesmen. **Tidak mewajibkan format modul ajar
    tertentu**, dan menambah **penilaian proses pembelajaran** (refleksi guru, sejawat, kepala sekolah, murid, minimal 1x per semester).
12. **Yang tidak dapat dipastikan:** kalender pendidikan nasional dan hari efektif (tidak ada dokumen nasional resmi yang ditemukan; kalender provinsi/Kemenag berbeda),
    status penjurusan SMA IPA/IPS/Bahasa (struktur resmi 13/2025 **tidak** memuat jurusan; berita bertentangan sampai 5 Nov 2026), isi resmi
    kurikulum madrasah (KMA 1503/2025), aturan e-Rapor/Dapodik terbaru.
13. **Celah terbesar di roadmap:** mutasi siswa (masuk dan keluar), ujian sekolah dan kelulusan/ijazah, legger, Guru wali dan penilaian proses pembelajaran,
    kolom rapor yang hilang, kerangka SPMB (Permendikdasmen 3/2025), serta antarmuka data ke Dapodik/e-Rapor. Detail dan prioritas di bagian 6.

---

## 2. Tabel klaim

### 2.1 Kurikulum, struktur, JP, mapel

| # | Klaim | Status | Sumber (judul, URL, nomor/tahun) |
|---|---|---|---|
| K1 | Permendikdasmen 13/2025 mengubah Permendikbudristek 12/2024 tentang Kurikulum PAUD, dasar, menengah. Ditetapkan 11 Jul 2025, diundangkan dan berlaku 15 Jul 2025. | Terverifikasi-sumber-resmi | BPK: https://peraturan.bpk.go.id/Details/322506/permendikdasmen-no-13 ; PDF https://peraturan.bpk.go.id/Download/384307/Permendikdasmen-no-13-tahun-2025.pdf |
| K2 | Permendikbudristek 12/2024: ditetapkan 25 Mar 2024, diundangkan 26 Mar 2024; kini diubah oleh 13/2025. | Terverifikasi-sumber-resmi | https://peraturan.bpk.go.id/Details/281847/permendikbudriset-no-12-tahun-2024 |
| K3 | Kerangka dasar kurikulum kini memuat "pendekatan pembelajaran mendalam" (Pasal 3 ayat 2 huruf f). | Terverifikasi-sumber-resmi | PDF 13/2025, Pasal I butir 1 |
| K4 | Mapel pilihan Koding dan Kecerdasan Artifisial diselenggarakan mulai TA 2025-2026 secara bertahap (Pasal 32A). Sifatnya pilihan, "sesuai sumber daya" sekolah, 2 JP/minggu = 72 JP/tahun (SD kelas V, SMP VII-IX, SMA X, SMK X); SMA XI-XII termasuk pilihan 5 JP/minggu. | Terverifikasi-sumber-resmi | PDF 13/2025, Pasal 32A dan Lampiran II tabel 4-12 |
| K5 | Struktur kurikulum terpisah untuk PAUD, SD/MI, SMP/MTs, SMA/MA, SMK/MAK, SDLB-SMALB, kesetaraan (Pasal 6). | Terverifikasi-sumber-resmi | PDF 13/2025, Pasal I butir 2 |
| K6 | 1 JP = 35 menit (SD), 40 (SMP), 45 (SMA/SMK); asumsi 36 minggu/tahun, kecuali kelas VI, IX, XII = 32 minggu. | Terverifikasi-sumber-resmi | PDF 13/2025, Lampiran II (catatan di tiap tabel) |
| K7 | Setiap mapel punya alokasi **Intrakurikuler** dan **Kokurikuler** per tahun; total JP = jumlah keduanya. Contoh SMP VII-VIII: Bahasa Indonesia 180+36=216; Matematika 144+36=180. | Terverifikasi-sumber-resmi | PDF 13/2025, Lampiran II tabel 6 |
| K8 | Bahasa Inggris masuk struktur wajib SD mulai kelas III (72 JP/tahun); tidak ada pada kelas I-II. | Terverifikasi-sumber-resmi | PDF 13/2025, Lampiran II tabel 1-4 |
| K9 | Muatan lokal paling banyak 2 JP/minggu (72 JP/tahun); dapat berupa mapel berdiri sendiri, diintegrasikan ke mapel lain, atau ke kokurikuler. | Terverifikasi-sumber-resmi | PDF 13/2025, Lampiran II (catatan dan butir penjelasan) |
| K10 | SMA kelas X: IPA dan IPS tidak dipisah menjadi mapel spesifik. Kelas XI-XII: kelompok wajib + pilihan; sekolah wajib menyediakan minimal 7 mapel pilihan; murid memilih 4-5 mapel (20-25 JP/minggu); boleh mengganti pilihan paling lambat kelas XI semester 2. | Terverifikasi-sumber-resmi | PDF 13/2025, Lampiran II bagian D |
| K11 | Struktur SMK: Mapel Umum + Mapel Kejuruan (Matematika, B. Inggris, Informatika, Projek IPAS, Dasar-Dasar Program Keahlian, Konsentrasi Keahlian, Kreativitas-Inovasi-Kewirausahaan, mapel pilihan) + **PKL sebagai mata pelajaran**, minimal 10 bulan atau 26 minggu efektif, blok 46 JP/minggu. | Terverifikasi-sumber-resmi | PDF 13/2025, Lampiran II bagian E (tabel 11-13, penjelasan umum) |
| K12 | Keputusan Kepala BSKAP 046/H/KR/2025 adalah CP berlaku (ditetapkan 16 Jul 2025), mencabut 32/H/KR/2024. | Sekunder | https://www.komunitasbelajar.id/2025/07/keputusan-kepala-bskap-nomor-046hkr2025.html ; https://www.fredimalabali.com/read/6/keputusan-kepala-bskap-no-46-tahun-2025-tentang-capaian-pembelajaran-jenjang-paud-sd-smp-sma-smk . PPA 2025 (resmi) merujuknya sebagai rujukan, tetapi PDF 046 tidak dibaca langsung. |
| K13 | Keputusan Kepala BKPDM 20/2026 mengubah CP **hanya** mapel Pendidikan Agama dan Budi Pekerti; mapel lain tetap 046/H/KR/2025. | Sekunder | https://www.pembelajaranmendalam.com/2026/08/download-cp-nomor-20-tahun-2026-pdf.html (blog; tanggal berlaku tidak tercantum) |
| K14 | Permendikdasmen 12/2025 Standar Isi (ditetapkan 10 Jul 2025, berlaku 15 Jul 2025) mencabut Permendikbudristek 8/2024. | Terverifikasi-sumber-resmi | https://peraturan.bpk.go.id/Details/322494 |
| K15 | Daftar SNP kini: SKL = Permendikdasmen 10/2025; Isi = 12/2025; Proses = 1/2026; Penilaian = Permendikbudristek 21/2022 (masih); Tendik = 21/2025; Sarpras = Permendikbudristek 22/2023; Pengelolaan = 26/2025; Pembiayaan = Permendikbudristek 18/2023. | Terverifikasi-sumber-resmi (daftar situs PSKP); isi tiap peraturan tidak semua dibaca | https://pskp.kemendikdasmen.go.id/standar-nasional-pendidikan-a/ |
| K16 | Struktur kurikulum SMA yang resmi tidak memuat jurusan IPA/IPS/Bahasa. Wacana menghidupkan kembali penjurusan muncul Apr 2025; Presiden meminta kaji ulang; satu berita 5 Nov 2026 menyebut "bertahap". | Belum-terverifikasi (status kebijakan) | https://www.antaranews.com/berita/4766089/mendikdasmen-kembali-berlakukan-penjurusan-ipa-ips-dukung-tka ; https://gorontalo.antaranews.com/berita/315885/mendikdasmen-presiden-minta-kaji-ulang-soal-penjurusan-sma (media) |

### 2.2 Fase

| # | Klaim | Status | Sumber |
|---|---|---|---|
| F1 | Fase A = kelas I-II; B = III-IV; C = V-VI; D = VII-IX; E = X (SMA/SMK/MA/MAK); F = XI-XII (SMA/MA/MAK; SMK 3 tahun) dan XI-XIII (SMK 4 tahun). PAUD = Fase Fondasi. | Terverifikasi-sumber-resmi | Panduan Pembelajaran dan Asesmen, Edisi Revisi 2025 (BSKAP), Tabel 3.1, https://uploads.belajar.id/document/files/Pembelajaran_dan_Asesmen_2025_01k17ee2v8pqwqybn0y9n8pcd1.pdf |
| F2 | Fase "umumnya", bukan kaku: murid pendidikan khusus bisa mengikuti fase berbeda dari kelasnya berdasarkan asesmen diagnostik. | Terverifikasi-sumber-resmi | PPA 2025, bagian pendidikan khusus |

### 2.3 Asesmen, ketuntasan, nilai

| # | Klaim | Status | Sumber |
|---|---|---|---|
| A1 | Penilaian hasil belajar berbentuk **formatif** dan **sumatif**; sumatif (SD ke atas) menjadi dasar kenaikan kelas dan kelulusan; dilakukan dengan membandingkan capaian dengan kriteria ketercapaian tujuan pembelajaran. | Terverifikasi-sumber-resmi | Permendikbudristek 21/2022 Pasal 9 (ditetapkan 26 Apr 2022, diundangkan 28 Apr 2022, berlaku; BPK: https://peraturan.bpk.go.id/Details/224425/permendikbudriset-no-21-tahun-2022) |
| A2 | 21/2022 masih tercatat Berlaku dan belum ada pengganti Standar Penilaian per Nov 2026 yang ditemukan. | Terverifikasi-sumber-resmi (status BPK) dengan catatan: pencarian tidak menemukan penggantinya, bukan bukti mutlak | BPK idem; daftar SNP PSKP (K15) |
| A3 | Istilah "KKM" tidak ada di PPA 2025 (0 kemunculan); yang ada "kriteria ketercapaian tujuan pembelajaran", disebut bukan angka melainkan kalimat, dengan contoh rubrik, interval, dan deskripsi. | Terverifikasi-sumber-resmi | PPA 2025 hlm. 44-46, 56 |
| A4 | Formatif tidak berisiko tinggi; tidak dipakai menentukan nilai rapor, kenaikan kelas, atau kelulusan; hasil formatif dan sumatif tidak digabung. | Terverifikasi-sumber-resmi | PPA 2025 hlm. 36 dan 52 |
| A5 | Asesmen awal di awal pembelajaran dianggap bagian formatif; "asesmen diagnostik" disebut terutama untuk pendidikan khusus. | Terverifikasi-sumber-resmi | PPA 2025 |
| A6 | Pengolahan nilai rapor: tiga opsi, **pembobotan, persentase, rata-rata**. Pembobotan/persentase untuk materi progresif; rata-rata untuk materi lepas. Pendidik/satuan pendidikan bebas memilih. | Terverifikasi-sumber-resmi | PPA 2025 hlm. 56-57 |
| A7 | Sumatif tidak wajib di tengah atau akhir semester; dilakukan sesuai kebutuhan untuk satu atau lebih TP. PPA juga menyebut "sumatif lingkup materi" dan "satu kali sumatif akhir semester" sebagai contoh. | Terverifikasi-sumber-resmi | PPA 2025 hlm. 46, bagian contoh pengolahan |
| A8 | Remedial = pendampingan mempelajari kembali kriteria yang belum tercapai, bukan semata soal atau tugas; pengayaan = tantangan lebih kompleks, bukan soal lebih sulit. Tidak ada aturan nilai remedial (mis. nilai maksimal = KKM) di panduan. | Terverifikasi-sumber-resmi | PPA 2025 hlm. 46 |
| A9 | Pelaporan sekurang-kurangnya setiap akhir semester; juga disampaikan "melalui e-rapor/dapodik". | Terverifikasi-sumber-resmi | PPA 2025 hlm. 65-66 |
| A10 | Ketentuan lama "tidak naik kelas bila 3 mapel di bawah ketuntasan" ada di panduan penilaian SD lama; tidak muncul di PPA 2025. | Sekunder (ringkasan hasil pencarian atas panduan lama) | repositori.kemendikdasmen.go.id (Panduan Penilaian lama); tidak dibaca langsung. Jangan dipakai. |

### 2.4 Rapor, kenaikan kelas, kelulusan, TKA

| # | Klaim | Status | Sumber |
|---|---|---|---|
| R1 | Rapor SD/MI-SMA/MA-SMK/MAK minimal: (1) identitas murid, (2) nama satuan pendidikan, (3) kelas, (4) semester, (5) mapel, (6) nilai, (7) deskripsi capaian kompetensi, (8) deskripsi capaian kokurikuler, (9) ekstrakurikuler, (10) ketidakhadiran, (11) catatan wali kelas, (12) tanggapan orang tua/wali. Format dan deskripsi diserahkan ke satuan pendidikan. | Terverifikasi-sumber-resmi | PPA 2025 hlm. 65 |
| R2 | Fase A: rapor boleh dengan atau tanpa nilai; tanpa nilai, deskripsi menggantikan angka. | Terverifikasi-sumber-resmi | PPA 2025 hlm. 66 |
| R3 | Asesmen kokurikuler dilaporkan di **kolom tersendiri** pada rapor; memakai asesmen formatif dan sumatif; boleh diintegrasikan ke intrakurikuler tetapi deskripsi kokurikuler tetap di kolom rapor. | Terverifikasi-sumber-resmi | Panduan Kokurikuler 2025 (BSKAP), https://kurikulum.kemendikdasmen.go.id/service/download.php?kategori=rujukan&id=121 , hlm. 33-35 |
| R4 | Kenaikan kelas: mekanisme dan kriteria ditetapkan satuan pendidikan berdasarkan pedoman; mempertimbangkan laporan kemajuan belajar semua mapel, ekstrakurikuler, prestasi lain selama satu tahun ajaran. | Terverifikasi-sumber-resmi | 21/2022 Pasal 10-11; PPA 2025 Bagian C hlm. 66 |
| R5 | Tidak naik kelas hanya "kasus luar biasa", lewat musyawarah para pendidik; kehadiran sebagai pertimbangan dengan ambang ditentukan sekolah; ada contoh alternatif (naik dengan pendampingan, catatan khusus). | Terverifikasi-sumber-resmi | PPA 2025 hlm. 66-68 |
| R6 | Kelulusan: pertimbangan laporan kemajuan belajar kelas V-VI (SD), setiap tingkat (SMP, SMA); **ujian yang diselenggarakan satuan pendidikan** pada tahun terakhir (portofolio, penugasan, tes tertulis, dll.), tidak harus serentak; kehadiran; ditetapkan satuan pendidikan; ijazah diberikan akhir semester genap oleh satuan pendidikan terakreditasi; pengolahan nilai ijazah diserahkan ke sekolah. | Terverifikasi-sumber-resmi | 21/2022 Pasal 10 ayat (2); PPA 2025 hlm. 69-70 |
| R7 | Wacana: tidak naik kelas tidak lagi otomatis, mulai TA 2027/2028, masih dikaji, belum ada Permen. | Sekunder | https://www.detik.com/bali/berita/d-8712091/mulai-2027-siswa-tak-otomatis-naik-kelas-lagi ; https://www.gebrak.id/?p=59342 |
| R8 | TKA diatur Permendikdasmen 9/2025 (ditetapkan 28 Mei 2025, diundangkan dan berlaku 3 Jun 2025; mencabut Permendikbudristek 31/2023 tentang Uji Kesetaraan). Mengatur penyelenggaraan, hasil, pemantauan, evaluasi, pelaporan. | Terverifikasi-sumber-resmi (metadata BPK); isi pasal tidak dibaca | https://peraturan.bpk.go.id/Details/321171 ; PDF https://peraturan.bpk.go.id/Download/382910/Permendikdasmen-no-9-tahun-2025.pdf |
| R9 | TKA bukan penentu kelulusan SD/SMP (kelulusan ditentukan satuan pendidikan); TKA SD/SMP April 2026 (SMP 6-16 Apr, SD 20-30 Apr); mapel Bahasa Indonesia dan Matematika; nilai tidak di ijazah, ada di SHTKA; skala SD/SMP 0-100, SMA/SMK 200-800. | Sekunder (siaran pers Kemendikdasmen terindeks, halaman tidak terbaca otomatis) | https://www.kemendikdasmen.go.id/en/press-release/14544-tka-sd-dan-smp-2026-digelar-april-kemendikdasmen-pemetaan-mutu-bukan-penentu-kelulusan ; https://www.tempo.co/politik/kemendikdasmen-tka-bukan-penentu-kelulusan-sd-dan-smp-2026-2107549 |
| R10 | Klaim "Permendikdasmen 9/2026 mengintegrasikan Asesmen Nasional dengan TKA" (satu artikel jurnal). | Belum-terverifikasi, kemungkinan salah ketik dari 9/2025 | https://journal.unpas.ac.id/index.php/pendas/article/download/45559/25708 |

### 2.5 Kokurikuler dan profil lulusan

| # | Klaim | Status | Sumber |
|---|---|---|---|
| P1 | Kompetensi kokurikuler "memperkuat" **delapan** dimensi: keimanan dan ketakwaan kepada Tuhan YME; kewargaan; penalaran kritis; kreativitas; kolaborasi; kemandirian; kesehatan; komunikasi. Alur perkembangan ditetapkan pejabat bidang kurikulum. | Terverifikasi-sumber-resmi | Permendikdasmen 13/2025 Pasal 17 (PDF K1) |
| P2 | Bentuk kokurikuler: pembelajaran kolaboratif lintas disiplin, G7KAIH, dan/atau cara lainnya; muatan berupa tema yang dikembangkan satuan pendidikan; beban belajar = alokasi waktu satu tahun ajaran; dikembangkan sekolah mengacu panduan pejabat kurikulum. | Terverifikasi-sumber-resmi | 13/2025 Pasal 16, 18, 19 |
| P3 | Alokasi kokurikuler (JP/tahun): SD I-II 216, III-IV 252, V 252, VI 224; SMP VII-VIII 360, IX 320; SMA X 396, XI 144, XII 128; SMK X 180, XI 144, XII 32 (3 tahun) atau 144 (4 tahun). | Terverifikasi-sumber-resmi (angka berbeda tipis di panduan vs Lampiran II 13/2025 untuk beberapa kelas; Lampiran lebih utama) | Panduan Kokurikuler 2025 Tabel 6-7; 13/2025 Lampiran II |
| P4 | Satu kegiatan boleh menyasar satu atau lebih dimensi; koordinator pembelajaran berbasis projek mendapat beban 2 jam tatap muka per rombel, maks 3 rombel. | Terverifikasi-sumber-resmi | Panduan Kokurikuler 2025 hlm. 31; Permendikdasmen 11/2025 Pasal 11 |
| P5 | "Profil Pelajar Pancasila/P5" tidak muncul sebagai kerangka di 13/2025 dan panduan kokurikuler 2025. | Terverifikasi-sumber-resmi (tidak ada); tidak diuji apakah dokumen lain masih menyebutnya | PDF 13/2025; Panduan Kokurikuler 2025 |
| P6 | Kerangka profil khusus madrasah: tidak ditemukan sumber resmi. Madrasah mengikuti KMA 1503/2025 (Kemenag) yang menambah pembelajaran mendalam dan Kurikulum Berbasis Cinta; CP PAI-Bahasa Arab lewat SK Dirjen Pendis 9941/2025. | Sekunder | https://kurikulummerdeka.com/kma-1503-2025-struktur-kurikulum-ma/ ; https://kurikulummerdeka.com/sk-dirjen-pendis-no-9941-tahun-2025-cp-capaian-pembelajaran-pai-dan-b-arab-pada-madrasah/ |

### 2.6 Administrasi guru dan pelaporan

| # | Klaim | Status | Sumber |
|---|---|---|---|
| G1 | Permendikdasmen 11/2025 Pemenuhan Beban Kerja Guru: ditetapkan 26 Jun 2025, diundangkan dan berlaku 1 Jul 2025; mencabut Permendikbud 15/2018 dan Permendikbudristek 25/2024. | Terverifikasi-sumber-resmi | https://peraturan.bpk.go.id/Details/322487 ; PDF https://peraturan.bpk.go.id/Download/384287/Permendikdasmen-no-11-tahun-2025.pdf |
| G2 | Jam kerja 37 jam 30 menit/minggu; pembelajaran **paling sedikit 24, paling banyak 40 jam tatap muka/minggu**; pengecualian (struktur kurikulum tak memungkinkan, pendidikan khusus, layanan khusus, sekolah luar negeri, dll.); BK: pembimbingan minimal 5 rombel/tahun. | Terverifikasi-sumber-resmi | PDF 11/2025 Pasal 13 dan 20 |
| G3 | Klaim "minimal 16 jam" (satu situs) **bertentangan** dengan teks resmi. | Sekunder, ditolak | https://infopendidikan.bic.id/beban-kerja-guru-16-jam-tpg-permendikdasmen-2025/ (outlier) |
| G4 | Tugas tambahan setara jam tatap muka, antara lain wali kelas 2 jam, pembina OSIS 2, pembina ekstrakurikuler 2 (min. 20 murid), koordinator pembelajaran berbasis projek 2, wakil kepala/ketua program keahlian 12; tugas tambahan lain kumulatif maks 6 jam. | Terverifikasi-sumber-resmi | PDF 11/2025 Pasal 11, 15, 16 dan lampiran ekuivalensi |
| G5 | **Guru wali**: guru mapel (SMP/SMA/SMK) yang mendampingi murid (akademik, kompetensi, keterampilan, karakter) sejak masuk sampai lulus, berkolaborasi dengan guru BK dan wali kelas; ditetapkan kepala sekolah. | Terverifikasi-sumber-resmi | PDF 11/2025 Pasal 9 dan 18 |
| G6 | Permendikdasmen 1/2026 Standar Proses: ditetapkan 2 Jan 2026, berlaku sejak diundangkan (BPK: 5 Jan 2026); mencabut Permendikbudristek 16/2022 dan Permendiknas 3/2008. Dokumen perencanaan minimal: tujuan pembelajaran, langkah pembelajaran, asesmen. Penilaian proses pembelajaran: refleksi guru, sejawat, kepala sekolah, murid, masing-masing minimal 1x per semester. Beban belajar formal dalam satuan jam pelajaran. | Terverifikasi-sumber-resmi (PDF peraturan.go.id; tanggal berlaku dari ringkasan BPK https://peraturan.bpk.go.id/Details/344196) | https://www.peraturan.go.id/filespengundangan/Permendikdasmen-no-1-tahun-2026.pdf |
| G7 | "Modul ajar" tidak diwajibkan sebagai istilah/format; PPA 2025 menyebut perencanaan pembelajaran dapat berupa "RPP atau Modul Ajar". | Terverifikasi-sumber-resmi | PPA 2025 hlm. 28-29; 1/2026 Pasal 5 |
| G8 | "Jurnal mengajar" tidak diwajibkan oleh peraturan yang dibaca (hanya jurnal refleksi murid/PKL sebagai instrumen). Praktik administrasi sekolah/dinas, bukan kewajiban nasional yang terverifikasi. | Belum-terverifikasi (tidak ditemukan) | Pencarian di PPA 2025, 1/2026, 11/2025 |
| G9 | Rapor disampaikan juga lewat e-rapor/Dapodik; e-Rapor SMA versi 2025 wajib sinkron ke Dapodik (surat dinas 3188, 19 Des 2025); Dapodik versi 2026.b; tenggat sinkron semester ganjil 2026/2027: 31 Agustus 2026 (satu sumber). | Sekunder (kecuali kalimat PPA di A9) | https://www.gebrak.id/2025/12/resmi-berlaku-ini-kelebihan-e-rapor.html ; https://achmadnurhidayat.id/kemendikdasmen-tetapkan-tenggat-sinkronisasi-dapodik |
| G10 | SIMPATIKA (madrasah, Kemenag) dan EMIS: hanya disebut sebagai keterkaitan; tidak diriset. | Belum-terverifikasi | - |

### 2.7 SPMB, mutasi, kalender

| # | Klaim | Status | Sumber |
|---|---|---|---|
| S1 | Permendikdasmen 3/2025 tentang Sistem Penerimaan Murid Baru, ditetapkan 26 Feb 2025, berlaku sejak diundangkan; **mencabut Permendikbud 1/2021** (PPDB). | Terverifikasi-sumber-resmi | PDF https://peraturan.bpk.go.id/Download/376799/Permendikdasmen-no-3-tahun-2025.pdf Pasal 66 |
| S2 | Jalur untuk SD/SMP/SMA: Domisili, Afirmasi, Prestasi (dikecualikan untuk SD), Mutasi. Kuota minimal: domisili SD 70%, SMP 40%, SMA 30%; afirmasi SD 15%, SMP 20%, SMA 30%; prestasi SMP 25%, SMA 30%; mutasi maksimal 5%. Pemerintah daerah menetapkan persentase. | Terverifikasi-sumber-resmi | PDF 3/2025 Pasal 6, 7, 30 |
| S3 | Usia SD: 7 tahun pada 1 Juli (prioritas); boleh mendaftar minimal 6 tahun; minimal 5 tahun 6 bulan dengan rekomendasi psikolog/dewan guru; SD tidak boleh mensyaratkan tes baca-tulis-hitung. SMP maks 15 tahun, SMA/SMK maks 21 tahun pada 1 Juli. | Terverifikasi-sumber-resmi | PDF 3/2025 Pasal 11-13 |
| S4 | **Murid pindahan** diatur sendiri (Bab III): berlaku bagi yang pindah selain pada semester genap kelas 6 SD, 9 SMP, 12 SMA, 12/13 SMK; berdasarkan persetujuan kepala satuan pendidikan asal dan tujuan; murid dari sistem nasional diterima di tingkat lanjutan. | Terverifikasi-sumber-resmi | PDF 3/2025 Pasal 55-58 |
| S5 | SPMB 2026/2027 tetap empat jalur dan kuota tidak berubah; nilai TKA dapat dipakai di jalur prestasi; juknis per daerah; SE Dirjen 0301/2026. | Sekunder | https://rri.co.id/samarinda/nasional/2387503/spmb-2026-tetap-gunakan-empat-jalur-nilai-tka-bisa-masuk-jalur-prestasi |
| S6 | Kalender pendidikan: TA 2026/2027 umumnya mulai 13 Juli 2026, semester genap sekitar 4 Januari 2027, ujung tahun ajaran Juni 2027 (Jatim 18/19 Juni); madrasah berkalender Kemenag sendiri. Dokumen nasional resmi tidak ditemukan; draf Permendikdasmen 26/2025 yang terbaca tidak memuat ketentuan semester/hari efektif. | Belum-terverifikasi | https://www.datadikdasmen.com/2026/06/kaldik-2026-2027.html ; https://dindik.jatimprov.go.id/images/upload/KALENDER%20PENDIDIKAN%202026-2027.pdf (provinsi) |

---

## 3. Ringkasan temuan per topik (rujukan cepat)

**Status kurikulum.** Basis hukum aktif: PP 57/2021 jo. PP 4/2022 → Permendikbudristek 12/2024 (kurikulum) **sebagaimana diubah** Permendikdasmen 13/2025;
Standar Isi 12/2025; SKL 10/2025; Standar Proses 1/2026; Standar Penilaian 21/2022. CP: BSKAP 046/H/KR/2025 (+ perubahan Agama 2026, sekunder).
Istilah yang kini muncul di dokumen resmi: **murid** (bukan "peserta didik/siswa"), **satuan pendidikan**, **pembelajaran mendalam**, **kokurikuler** (bukan P5), **dimensi profil lulusan**, **kriteria ketercapaian tujuan pembelajaran**.

**Struktur/JP yang harus bisa dimodelkan** (dari Lampiran II 13/2025):
- JP menit: 35/40/45; minggu efektif 36 atau 32 per kelas; total JP = intra + kokurikuler.
- Mapel wajib per kelas, **pilihan** (KKA; SMA XI-XII; SMK pilihan), **muatan lokal** (maks 72 JP), **seni/prakarya pilihan satu** (murid memilih satu jenis).
- SMA XI-XII: sekolah menyediakan ≥ 7 pilihan, murid 4-5, boleh ganti paling lambat XI semester 2 → pilihan mapel **per murid**, bukan hanya per kelas.
- SMK: Dasar Program Keahlian, Konsentrasi Keahlian (nama menyesuaikan program), PKL sebagai mapel blok ≥ 26 minggu efektif, program 3 atau 4 tahun.
- Penyesuaian: Program Kebutuhan Khusus (inklusif), percepatan/pengayaan individual, kelas olahraga/seni memakai alokasi kokurikuler, kepercayaan terhadap Tuhan YME, BK.

**Asesmen dan nilai.** Dua jenis (formatif, sumatif); kriteria ketercapaian per TP berbentuk deskripsi/rubrik/interval; tiga opsi pengolahan nilai; formatif tidak masuk nilai akhir; tidak ada rumus nasional bobot; tidak ada aturan nasional "nilai remedial".

**Rapor, kenaikan, kelulusan.** Lihat R1-R6. Ujian sekolah hanya di tahun terakhir; ijazah dari satuan pendidikan terakreditasi; TKA terpisah dan bukan syarat lulus.

**Kalender/semester.** Tidak ada sumber nasional yang terverifikasi; perlakukan sebagai data per sekolah/dinas.

**Administrasi guru.** Beban kerja 24-40 jam tatap muka; peran baru Guru wali dan koordinator pembelajaran berbasis projek; perencanaan minimal 3 komponen; penilaian proses pembelajaran periodik.

**Pelaporan nasional.** Dapodik dan e-Rapor adalah kewajiban praktik (sekunder), bukan fungsi yang dapat diganti satu aplikasi; interoperabilitas perlu diverifikasi ke dokumen teknis Dapodik. SIMPATIKA/EMIS untuk madrasah: hanya keterkaitan.

**SPMB.** Lihat S1-S6.

---

## 4. Penilaian roadmap per butir

Skala: **sesuai** / **perlu penyesuaian** / **keliru** / **belum bisa diverifikasi**.

### Prinsip umum roadmap

| Prinsip | Penilaian | Alasan dan usulan |
|---|---|---|
| 1-6 (aditif, rilis MINOR, RLS, OpenAPI, tes) | Sesuai | Netral terhadap regulasi dan konsisten dengan kebutuhan fleksibilitas. |
| 7. Satu unit = satu jenjang | Sesuai | Struktur kurikulum resmi memang per jenjang. Catatan: SMK 3 vs 4 tahun bukan jenjang berbeda tetapi **parameter program** (lihat Fase 5 dan 2A). |
| Keselarasan istilah | Perlu penyesuaian | Pakai "murid", "satuan pendidikan", "kokurikuler", "dimensi profil lulusan", "kriteria ketercapaian tujuan pembelajaran" di UI/OpenAPI/dokumentasi; sediakan alias "siswa", "KKM" hanya sebagai kompatibilitas. |

### Fase 0: profil jenjang

| Butir | Penilaian | Alasan dan usulan |
|---|---|---|
| `ref_education_profile` (sd, mi, smp, mts, sma, ma, smk, mak) | Sesuai | Cocok dengan Pasal 6 13/2025 (struktur per jenjang, madrasah setara). Pertimbangkan kunci profil terpisah dari **otoritas** (Kemendikdasmen/Kemenag) agar MI-MTs-MA tidak sekadar salinan SD-SMP-SMA. |
| Pemetaan tingkat → fase | Sesuai (dengan tambahan) | A:I-II, B:III-IV, C:V-VI, D:VII-IX, E:X, F:XI-XII; **SMK 4 tahun: XI-XIII = F**. Simpan sebagai data acuan berversi, bukan kode. Fase "umumnya": izinkan penimpaan per murid (pendidikan khusus/asesmen). |
| Tingkat akhir | Perlu penyesuaian | Tingkat akhir tidak konstan: SD VI, SMP IX, SMA XII, SMK XII atau XIII (program 4 tahun). Tambahkan `program_duration` atau `last_grade` pada program/kelas, bukan pada jenjang. Untuk kelulusan SD, pertimbangan memakai laporan kelas V-VI. |
| Model pengajar guru kelas vs guru mapel | Sesuai | SD guru kelas; catatan: guru mapel khusus (PAI, PJOK, B. Inggris) sering terpisah. Pintasan "tugaskan ke semua mapel kelas" harus bisa dikecualikan per mapel. |
| Fitur kejuruan muncul menurut kemampuan profil | Sesuai | PKL ada sebagai **mapel** di struktur SMK (13/2025); modelkan juga keterkaitan ke `subject`/alokasi JP, bukan hanya modul `internship`. |
| NPSN wajib | Belum bisa diverifikasi | Bukan wilayah regulasi yang diteliti; madrasah memakai NSM. |

### Fase 1: integritas rapor, arsip, jadwal

| Butir | Penilaian | Alasan dan usulan |
|---|---|---|
| Penjaga rapor final, snapshot berversi, riwayat | Sesuai | Regulasi hanya mensyaratkan rapor disampaikan ≥ setiap akhir semester; integritas internal adalah praktik baik. Arsip snapshot juga membantu sinkron ke e-Rapor. |
| `schema_version` dan `template_key` | Sesuai, dan penting | Format rapor diserahkan ke satuan pendidikan (PPA hlm. 65); minimal 12 komponen. Versi harus menyertakan daftar komponen minimal, termasuk tanggapan orang tua dan kokurikuler. |
| Koreksi absensi setelah final | Perlu penyesuaian | Absensi adalah komponen rapor (ketidakhadiran) sekaligus input kenaikan kelas. Usulan bawaan "ditolak" tepat, tetapi sediakan jalur koreksi **berwenang dan tercatat** (buka kembali) karena sengketa kehadiran memengaruhi keputusan naik/tinggal. |
| Jadwal per semester | Sesuai | Struktur kurikulum dihitung per tahun, tetapi pelaksanaan tiap semester bisa berbeda; perlu juga **JP menit per jenjang** agar jadwal memvalidasi total JP. |
| Riwayat penugasan guru dan wali kelas | Sesuai | Wali kelas diakui setara 2 jam tatap muka (11/2025); riwayat mendukung laporan beban kerja. |
| Ganti `WIDE_ROLES` | Sesuai | Netral regulasi. |

### Fase 2A: rollover dan kenaikan kelas

| Butir | Penilaian | Alasan dan usulan |
|---|---|---|
| Wizard salin tahun ajaran | Sesuai | Perhatikan: jumlah minggu efektif/kalender per tahun bisa berubah, jangan menyalin tanggal tanpa konfirmasi. |
| Keputusan naik/tinggal/lulus per siswa | Perlu penyesuaian | (a) **Tidak ada rumus nasional**: sediakan kebijakan per sekolah (kriteria kehadiran, jumlah mapel belum tuntas, dll.) hanya sebagai **saran**, keputusan manual oleh dewan pendidik. (b) Catat **alasan**, tindak lanjut (pendampingan), tanggal musyawarah dan peserta; "tinggal kelas" = kasus luar biasa. (c) Siapkan fleksibilitas bila kebijakan tidak otomatis naik berlaku 2027/28 (sekunder). (d) Status "naik dengan catatan/pendampingan" perlu, bukan hanya naik/tinggal/lulus. |
| Tingkat akhir menjadi `graduated` | Keliru bila otomatis | Lulus butuh **ujian satuan pendidikan** di tahun terakhir dan penetapan kelulusan oleh sekolah (PPA hlm. 69). Pisahkan "naik ke tingkat akhir selesai" dari "ditetapkan lulus". Penerbitan ijazah dan SKL adalah langkah tersendiri. Jangan menjadikan TKA syarat. |
| Penempatan siswa ke kelas tahun baru | Sesuai | Untuk SMA XI-XII/SMK: penempatan perlu mengikuti **mapel pilihan** murid; kelas bisa campuran. |
| Izin `promotion:manage` | Sesuai | Tambahkan izin penetapan oleh wali kelas vs pengesahan kepala sekolah/dewan guru. |

### Fase 2B: struktur mapel dan kurikulum

| Butir | Penilaian | Alasan dan usulan |
|---|---|---|
| `subject.subject_group`, `is_local_content`, `sort_order` | Perlu penyesuaian | Kelompok resmi: Wajib, Pilihan, Muatan Lokal; SMK: Umum, Kejuruan (dengan subkelompok), PKL. Tambah `kind` (wajib/pilihan/mulok/kejuruan), `is_religion_variant` (PAI/Kristen/Katolik/Buddha/Hindu/Khonghucu: murid ikut sesuai agama), dan "kepercayaan". Mapel Seni/Prakarya: murid memilih satu jenis. |
| `curriculum_subject_allocation` JP mingguan/tahunan per tahun, tingkat, program | Perlu penyesuaian | Pisahkan **JP intrakurikuler** dan **JP kokurikuler** per mapel per tahun; simpan **menit per JP** dan **minggu efektif** per tingkat; JP mulok ≤ 72; KKA 72 (SD V, SMP, SMA X, SMK X) dan 180 JP/tahun per mapel pilihan SMA XI-XII; PKL dalam minggu/bulan, bukan hanya JP. Semua diisi dari data acuan berversi (Lampiran II 13/2025 sebagai seed, diverifikasi per angka). |
| Adopsi kurikulum jadi halaman Kurikulum | Sesuai | Versi acuan wajib: Permendikbudristek 12/2024 jo. Permendikdasmen 13/2025 harus tertulis di `school_curriculum_version`, bukan "Kurikulum 2025". Perubahan Lampiran 13/2025 vs 12/2024 bisa membuat data lama berbeda. |
| `learning_outcome` CP, `learning_objective` TP, ATP | Perlu penyesuaian | CP resmi dari BSKAP 046/H/KR/2025, per fase (sebagian per elemen). TP dan ATP **disusun guru**, tidak ada acuan nasional wajib. Salin acuan CP boleh; TP/ATP hanya templat opsional. CP Agama diubah 2026 (sekunder): data acuan harus punya versi per mapel, bukan per paket. |
| KKTP (numerik, interval, deskriptor, rubrik) | Sesuai | Selaras PPA (rubrik, interval, deskripsi). Catatan: PPA menyatakan kriteria "bukan angka"; mode numerik tetap sah sebagai batas internal tetapi bukan acuan utama. |
| Fallback ke `grading_setting.kkm` | Perlu penyesuaian | Boleh untuk kompatibilitas, namun beri label "batas ketuntasan/kriteria" dan jangan mendorong sekolah baru memakai KKM seragam. |
| `grading_setting.calculation_mode` | Sesuai | Resmi ada **tiga**: pembobotan, persentase, rata-rata; jadikan enumerasi ini. |
| Izin `curriculum:manage`, `teaching_plan:write` | Sesuai | - |
| Keputusan: satu guru + riwayat vs team teaching | Perlu penyesuaian | Beban kerja 11/2025 menghitung jam per guru; "guru wali" dan koordinator projek juga perlu. Team teaching (mis. IPA terpadu, projek) nyata di SMK dan kokurikuler. Usulan "satu guru + riwayat" untuk mapel; sediakan **peran pendamping** minimal untuk kokurikuler. |

### Fase 3: pembelajaran dan asesmen

| Butir | Penilaian | Alasan dan usulan |
|---|---|---|
| `lesson_journal` dan `teaching_module` | Perlu penyesuaian (diturunkan prioritasnya) | Tidak ada kewajiban nasional "jurnal mengajar" yang ditemukan; ini kebutuhan operasional sekolah/dinas. Modul ajar bukan format wajib (1/2026 Pasal 5; PPA: RPP atau modul ajar). Buat **opsional** dengan nama netral ("perencanaan pembelajaran"), minimal tujuan, langkah, asesmen. Tambahkan **penilaian proses pembelajaran** (refleksi guru, sejawat, kepala sekolah, murid; minimal 1x/semester). |
| `assessment.category` diagnostik/formatif/sumatif | Perlu penyesuaian | Jenis resmi: formatif dan sumatif. Gunakan `category in {formatif, sumatif}` dan tambahkan `purpose = asesmen_awal` (diagnostik) sebagai tag/waktu. Diagnostik tidak memengaruhi nilai. |
| `technique`, rubrik | Sesuai | PPA menyebut tes, observasi, performa (praktik, produk, projek, portofolio), rubrik, ceklis, catatan anekdotal. |
| `include_in_final` | Perlu penyesuaian | Formatif tidak boleh masuk nilai rapor/kenaikan/kelulusan dan tidak digabung dengan sumatif. Jadikan formatif **terkunci false**; `include_in_final` hanya relevan untuk sumatif. Tambahkan "sumatif lingkup materi" dan "sumatif akhir semester" sebagai tag, bukan jenis wajib. |
| Remedial dan pengayaan | Perlu penyesuaian | Remedial = pendampingan, bukan sekadar nilai baru; simpan intervensi dan hasil. `remedial_policy` boleh opsional per sekolah; usulan bawaan "batas = KKTP" jangan dikunci karena tidak ada aturan nasional; bawaan yang aman: simpan nilai asli dan hasil remedial, sekolah memilih. Pengayaan perlu entitas sendiri. |
| Narasi rapor dari TP tertinggi/terendah | Sesuai | Selaras "deskripsi capaian kompetensi". Rapor Fase A boleh tanpa nilai (deskripsi menggantikan angka): perlu mode rapor "deskriptif". |
| Kokurikuler | Lihat fase 4 | - |

### Fase 4: kokurikuler dan madrasah

| Butir | Penilaian | Alasan dan usulan |
|---|---|---|
| `ref_profile_framework` berversi, 8 dimensi untuk sekolah umum | Sesuai | Delapan dimensi terverifikasi (13/2025 Pasal 17). Daftar canonical: keimanan dan ketakwaan kepada Tuhan YME, kewargaan, penalaran kritis, kreativitas, kolaborasi, kemandirian, kesehatan, komunikasi. Alur perkembangan ditetapkan terpisah oleh pejabat kurikulum: simpan sebagai data berversi (belum dibaca). |
| Kerangka madrasah terpisah | Belum bisa diverifikasi | Tidak ditemukan sumber resmi; KMA 1503/2025 sekunder. Jangan seed isi sebelum dibaca ke teks Kemenag. |
| Jenis kegiatan, program, dimensi, rubrik, kelompok, catatan, bukti | Perlu penyesuaian | Bentuk resmi: **pembelajaran kolaboratif lintas disiplin, G7KAIH, cara lainnya**; muatan = **tema** (dikembangkan sekolah); asesmen formatif dan sumatif; **alokasi JP tahunan** per kelas harus dilacak vs alokasi struktur. Rubrik panduan memakai predikat (Sangat Baik/Baik/Cukup/Kurang, sekunder). |
| Bagian Kokurikuler di rapor (`schema_version` 2) | Perlu penyesuaian | Sudah wajib sebagai **kolom/deskripsi tersendiri** (PPA 2025). Pindahkan setidaknya kolom deskripsi kokurikuler (teks bebas) ke fase 1 atau 3 agar rapor sesuai minimal 12 komponen. |
| Seed SD, `kma`, mapel PAI/Arab, NSM/EMIS | Sebagian belum diverifikasi | Seed SD sekarang bisa dari Lampiran II 13/2025 (resmi). Seed madrasah menunggu KMA 1503/2025 dan SK Dirjen Pendis 9941/2025 (sekunder). |
| Judul PDF rapor masuk terjemahan | Sesuai | Netral regulasi. |
| Izin `cocurricular:manage|assess` | Sesuai | Koordinator pembelajaran berbasis projek adalah peran nyata (11/2025). |

### Fase 5: SMK penuh

| Butir | Penilaian | Alasan dan usulan |
|---|---|---|
| bidang → program → konsentrasi keahlian | Sesuai | Struktur resmi memakai "Program Keahlian", "Konsentrasi Keahlian" (mapel namanya mengikuti). Verifikasi istilah **"Bidang Keahlian"**: SPMB 3/2025 Pasal 13 memakai "bidang keahlian, program keahlian, atau kompetensi keahlian". Perhatikan "kompetensi keahlian" (istilah lama) vs "konsentrasi keahlian" (2024-2025); sediakan alias. |
| PKL: semester, bobot sekolah:industri, nomor sertifikat | Perlu penyesuaian | PKL adalah **mapel** (≥ 26 minggu efektif ≈ 10 bulan, blok 46 JP/minggu). Pastikan PKL terikat ke tahun/semester kelas XI-XII sesuai tabel, dan nilainya masuk rapor sebagai mapel. Bobot sekolah:industri tidak ditemukan sebagai aturan nasional: jadikan konfigurasi. |
| UKK (`ukk_event`, `ukk_result`) | Belum bisa diverifikasi | Tidak diriset. Verifikasi ke aturan uji kompetensi keahlian (sertifikasi kompetensi, LSP P1) sebelum fase 5. Kaitkan dengan PKL dan kelulusan SMK. |
| Program 3 vs 4 tahun | Celah | Kelas XIII memakai Fase F; kokurikuler XII program 3 tahun = 32 JP vs 144 JP program 4 tahun. Tingkat akhir = XII atau XIII. |
| Pembersihan menu | Sesuai | - |

### Pekerjaan lintas fase

| Butir | Penilaian | Alasan dan usulan |
|---|---|---|
| Dokumentasi, tes, rilis | Sesuai | - |
| "Verifikasi regulasi sebelum fase 2 dan 4 (belum dilakukan)" | Terpenuhi sebagian oleh dokumen ini | Sisa: baca PDF BSKAP 046/H/KR/2025 (alur CP per elemen), alur perkembangan dimensi profil lulusan, KMA 1503/2025, aturan UKK, dokumen teknis Dapodik/e-Rapor. |
| "Ekspor/impor Dapodik dan EMIS menyusul setelah fase 4" | Perlu penyesuaian | Dapodik adalah sumber data pokok dan rapor disampaikan lewat e-Rapor/Dapodik (PPA). Sekolah tidak bisa menghapus pekerjaan ganda tanpa interop. Naikkan prioritas ke sekitar fase 2-3 dengan format ekspor minimal (rombel, mapel per kelas, nilai akhir, deskripsi) meski sinkron otomatis menyusul. Belum diverifikasi: skema Dapodik/e-Rapor. |

---

## 5. Yang tidak boleh di-hardcode (data acuan berversi atau konfigurasi sekolah)

1. Pemetaan tingkat → fase, termasuk SMK 3/4 tahun; fase "umumnya" (bisa dioverride).
2. Struktur kurikulum dan JP (intra + kokurikuler), menit per JP, minggu efektif, kelompok mapel, daftar mapel pilihan, batas mulok, KKA: keluarga data acuan berversi yang diganti jika Permendikdasmen berubah (13/2025 sudah mengganti Lampiran I-III sebelumnya).
3. Jumlah dimensi dan nama dimensi profil lulusan; alur perkembangannya (ditetapkan pejabat kurikulum, dapat berubah).
4. Cara menghitung nilai akhir (tiga opsi), bobot, penamaan predikat, ada/tidaknya angka (Fase A boleh tanpa nilai).
5. Kriteria ketercapaian, ambang tuntas, kebijakan remedial; jangan menanam "KKM 75" atau "nilai remedial maksimum = KKM".
6. Aturan kenaikan kelas: ambang kehadiran, jumlah mapel tak tuntas, siapa memutuskan, bentuk tindak lanjut. Aturan kelulusan: bentuk ujian sekolah, komponen, bobot nilai ijazah, "tingkat akhir".
7. Tingkat akhir dan tahun kelulusan: SD VI, SMP IX, SMA XII, SMK XII/XIII.
8. Semester (jumlah dan tanggal), hari efektif, kalender (provinsi/kabupaten/Kemenag berbeda).
9. Kuota dan jalur SPMB (pemerintah daerah menetapkan persentase, juknis daerah).
10. Beban kerja guru (24-40 jam, ekuivalensi tugas tambahan) dan daftar tugas tambahan.
11. Penjurusan/peminatan SMA (kebijakan belum final).
12. Format rapor (diserahkan ke sekolah) dan label kolom.

---

## 6. Celah: hal penting alur akademik yang belum ada di roadmap

Prioritas: **P0** mendesak untuk kesesuaian atau mengurangi risiko, **P1** tinggi, **P2** menengah, **P3** nanti.

| # | Celah | Dasar | Prioritas | Catatan |
|---|---|---|---|---|
| C1 | **Mutasi/perpindahan murid** (masuk dan keluar), termasuk larangan pindah pada semester genap tingkat akhir, persetujuan kepala sekolah asal dan tujuan, penempatan tingkat (sistem nasional vs luar negeri), surat pindah dan transfer nilai/rapor | 3/2025 Bab III Pasal 55-58 | P0 | Terdampak langsung rapor final, rollover, dan snapshot. Tidak ada di roadmap. |
| C2 | **Ujian satuan pendidikan dan kelulusan** (pencatatan bentuk ujian, hasil, penetapan lulus oleh sekolah, SKL, nomor ijazah, pencetakan, akreditasi sekolah) | 21/2022 Pasal 10; PPA hlm. 69-70 | P0 | Roadmap 2A menyamakan tingkat akhir dengan `graduated`. Perlu fitur kelulusan terpisah. |
| C3 | **Kolom rapor yang hilang**: tanggapan orang tua/wali, deskripsi kokurikuler, mode rapor Fase A tanpa nilai, catatan wali Fase A (perkembangan fondasi) | PPA 2025 hlm. 65-66 | P0 | Rapor yang tidak memuat 12 komponen minimal berisiko tidak patuh. |
| C4 | **Legger/rekap nilai kelas** (matriks murid x mapel) untuk rapat kenaikan/kelulusan dan arsip | Praktik; bukan wajib resmi | P1 | Berguna untuk musyawarah dewan pendidik (R5). |
| C5 | **Rapat/musyawarah dewan pendidik**: berita acara keputusan tidak naik kelas dan alasan | PPA hlm. 66 | P1 | Pasangkan dengan 2A. |
| C6 | **Interoperabilitas Dapodik/e-Rapor/SIMPATIKA/EMIS**: ekspor, impor, NISN/NIK/ID, rombel, mapel per kelas, sinkron nilai per semester; tenggat sinkron | PPA hlm. 65-66 (rapor lewat e-rapor/dapodik); sumber sekunder untuk tenggat | P1 | Tentukan dulu format yang benar-benar diterima; belum diverifikasi. |
| C7 | **SPMB** (jalur domisili/afirmasi/prestasi/mutasi, kuota, usia, KK ≥ 1 tahun, tidak ada tes calistung di SD, nilai TKA di jalur prestasi) | 3/2025 | P2 (bila produk menyertakan penerimaan murid; AUDIT menyebut SPMB sudah ada) | Verifikasi modul SPMB yang ada terhadap Pasal 6-13 dan 30; kuota harus dikonfigurasi per daerah. |
| C8 | **Guru wali** (pendampingan 1 guru ke beberapa murid sejak masuk hingga lulus), kolaborasi dengan wali kelas dan guru BK | 11/2025 Pasal 9, 18 | P1 | Peran baru nyata untuk SMP/SMA/SMK; tidak ada di roadmap. |
| C9 | **Wali kelas vs Guru BK** sebagai peran terpisah; layanan BK; pembimbingan ≥ 5 rombel/tahun | 11/2025 Pasal 13 | P2 | Pisahkan dari peran wali kelas; hak akses catatan BK sensitif. |
| C10 | **Beban kerja guru** (jam tatap muka 24-40, ekuivalensi, pemeriksaan pemenuhan) dan laporan ke Dapodik/PMM | 11/2025 | P2 | Dapat dihitung dari penugasan + jadwal + tugas tambahan. |
| C11 | **Absensi guru** | Tidak ditemukan sebagai kewajiban Permendikdasmen; praktik kepegawaian | P3 | Jangan dijadikan fitur akademik; beda dari beban kerja. |
| C12 | **Penilaian proses pembelajaran** (refleksi guru, sejawat, supervisi kepala sekolah, survei murid, ≥ 1x/semester) | 1/2026 Pasal 15-19 | P2 | Fitur kecil tetapi baru dan eksplisit. |
| C13 | **Pilihan mapel per murid** (SMA XI-XII 4-5 pilihan, ganti sampai XI semester 2; agama per murid; seni/prakarya pilihan satu jenis) | 13/2025 Lampiran II | P0 untuk SMA, P1 lainnya | Rapor, jadwal, dan rollover bergantung pada ini. Tidak ada di roadmap. |
| C14 | **Percepatan dan pengayaan individual**; Program Kebutuhan Khusus (inklusif); murid kecerdasan istimewa; layanan kepercayaan | 13/2025 Lampiran II | P2 | Mulai dari flag per murid dan kolom catatan. |
| C15 | **Tinggal kelas administratif**: murid mengulang di kelas yang sama, rollover tanpa naik, riwayat rombel, nilai kelas lama tetap utuh | R5; AUDIT 2A | P0 | Rollover harus mengakomodasi. |
| C16 | **Remedial administratif**: jadwal remedial, daftar murid, hasil per TP, bukan hanya kolom nilai | PPA hlm. 46 | P2 | Sudah sebagian di fase 3. |
| C17 | **Pelaksanaan kalender** (semester, libur, pembagian rapor) sebagai data per sekolah; mendukung kalender Kemenag | S6 | P1 | Roadmap memiliki kalender akademik (audit); pastikan semester bukan konstanta. |
| C18 | **Ijazah, SKL, transkrip** (nomor, cetak, verifikasi): nilai ijazah diolah sekolah | PPA hlm. 70 | P1 (bagian dari C2) | Aturan format ijazah per peraturan terpisah; belum diriset. |
| C19 | **TKA sebagai data murid** (peserta, hasil/SHTKA bila diberikan), bukan syarat lulus | 9/2025 (sekunder untuk detail) | P3 | Simpan referensi hasil; jangan memengaruhi kelulusan. |
| C20 | **PKL sebagai mapel SMK** (≥ 26 minggu efektif, blok) dan kaitan ke jadwal, rapor, kelulusan | 13/2025 | P1 | Roadmap memperlakukan PKL modul tersendiri. |
| C21 | **Ekstrakurikuler wajib minimal kepramukaan/kepanduan lain** | 13/2025 Pasal 22 | P3 | Validasi bahwa sekolah menyediakan; rapor memuat kegiatan ekstrakurikuler. |
| C22 | **Kepatuhan akreditasi** sebagai prasyarat ijazah | PPA hlm. 70 | P3 | Data sekolah. |

---

## 7. Hal yang tidak ditemukan atau saling bertentangan

- **Kalender pendidikan nasional dan hari efektif:** tidak ada dokumen nasional resmi yang berhasil dibaca; draf Permendikdasmen 26/2025 yang terbaca bertanda "Rancangan" dan tidak memuat ketentuan semester/kalender. Jangan menanam tanggal.
- **Penjurusan SMA:** media April 2025 menyatakan jurusan akan dihidupkan lagi; Presiden meminta kaji ulang; satu berita berikutnya (Nov 2026) menyebut keputusan bertahap. Struktur resmi 13/2025 tidak memuat jurusan. Status final: belum jelas.
- **Beban kerja guru:** satu situs menyebut 16 jam; teks resmi 11/2025 menyebut 24 jam minimum. Dipakai teks resmi.
- **SPMB "Permendikdasmen 3/2026":** satu situs menyebut ini; semua sumber lain dan teks resmi menyebut **3/2025**. Dianggap salah ketik.
- **Permendikdasmen "9/2026" integrasi AN-TKA:** hanya satu artikel jurnal; dianggap salah ketik dari 9/2025; tidak terverifikasi.
- **TKA dan status wajib:** media memberi bingkai berbeda (wajib vs sukarela); teks 9/2025 tidak dibaca per pasal; satu ringkasan menyebut TKA tidak wajib bagi semua murid. Perlakukan TKA sebagai opsional dan terpisah dari kelulusan sampai pasal dibaca.
- **Nomor Keputusan BSKAP untuk panduan:** PPA 2025 tercantum Edisi Revisi 2025 (revisi ke-3 per sumber sekunder); nomor SK penetapan PPA tidak ditemukan. Nomor 058/H/KR/2025 yang sempat dicari tidak ditemukan sama sekali.
- **Kurikulum madrasah:** KMA 1503/2025 dikatakan sebagian sumber "mengubah" dan sebagian "menggantikan" KMA 450/2024; KMA 512/2026 hanya muncul satu sumber. Belum bisa dipakai sebagai dasar seed.
- **SHTKA dan skala nilai TKA:** hanya sekunder (halaman Rumah Pendidikan ditolak akses otomatis).
- **Tanggal pengundangan:** untuk beberapa peraturan (3/2025, 1/2026) lembar pengundangan PDF kosong dalam hasil ekstraksi; tanggal diambil dari BPK atau sekunder.
- **Kegiatan di luar jangkauan riset ini:** ijazah/SKL format dan nomor, UKK SMK, skema teknis Dapodik/e-Rapor, SIMPATIKA/EMIS, kurikulum madrasah, pendidikan khusus dan kesetaraan.

---

## 8. Daftar sumber utama

Resmi (dibaca langsung):
- Permendikdasmen 13/2025 (Perubahan Permendikbudristek 12/2024 tentang Kurikulum): https://peraturan.bpk.go.id/Details/322506/permendikdasmen-no-13 (PDF: https://peraturan.bpk.go.id/Download/384307/Permendikdasmen-no-13-tahun-2025.pdf)
- Permendikbudristek 12/2024: https://peraturan.bpk.go.id/Details/281847/permendikbudriset-no-12-tahun-2024
- Permendikbudristek 21/2022 Standar Penilaian: https://peraturan.bpk.go.id/Details/224425/permendikbudriset-no-21-tahun-2022
- Permendikdasmen 12/2025 Standar Isi: https://peraturan.bpk.go.id/Details/322494
- Permendikdasmen 1/2026 Standar Proses: https://www.peraturan.go.id/filespengundangan/Permendikdasmen-no-1-tahun-2026.pdf ; https://peraturan.bpk.go.id/Details/344196
- Permendikdasmen 11/2025 Beban Kerja Guru: https://peraturan.bpk.go.id/Details/322487 (PDF https://peraturan.bpk.go.id/Download/384287/Permendikdasmen-no-11-tahun-2025.pdf)
- Permendikdasmen 9/2025 TKA (hanya metadata): https://peraturan.bpk.go.id/Details/321171
- Permendikdasmen 3/2025 SPMB: https://peraturan.bpk.go.id/Download/376799/Permendikdasmen-no-3-tahun-2025.pdf
- BSKAP, Panduan Pembelajaran dan Asesmen, Edisi Revisi 2025: https://uploads.belajar.id/document/files/Pembelajaran_dan_Asesmen_2025_01k17ee2v8pqwqybn0y9n8pcd1.pdf
- BSKAP, Panduan Kokurikuler 2025: https://kurikulum.kemendikdasmen.go.id/service/download.php?kategori=rujukan&id=121
- PSKP, daftar SNP: https://pskp.kemendikdasmen.go.id/standar-nasional-pendidikan-a/

Sekunder (hanya petunjuk, ditandai di tabel): komunitasbelajar.id, datadikdasmen.com, pembelajaranmendalam.com, kurikulummerdeka.com, infopendidikan.bic.id, detik.com, antaranews.com, gebrak.id, tempo.co, rri.co.id, achmadnurhidayat.id, journal.unpas.ac.id.
