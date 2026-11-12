# Verifikasi regulasi madrasah dan SMK, dan penilaian roadmap akademik

Riset baca-saja, 12 November 2026. Tidak ada kode atau berkas lain yang diubah. Dasar penilaian: `Planning/11-academic-roadmap.md`
dan `docs/AUDIT-AKADEMIK.md` (bagian 4, 9, Fase 4, Fase 5, F13 sampai F16, butir 2B).

## Batasan riset (baca dulu)

- Pencarian web dan pembacaan halaman dilakukan hari ini. Beberapa domain resmi **tidak dapat dibuka dari lingkungan ini**:
  `jdih.kemendikdasmen.go.id` (404), `kurikulum.kemdikbud.go.id`, `vokasi.kemdikbud.go.id`, `cdn-dapodik.kemdikbud.go.id` (DNS gagal),
  halaman Rumah Pendidikan (403). Teks KMA 347/2022 berupa citra pindaian tanpa teks (tidak terbaca). Teks lengkap KMA 1503/2025,
  KMA 450/2024, dan Lampiran II Permendikdasmen 13/2025 **tidak berhasil dibaca**.
- Yang berhasil dibaca langsung dari sumber resmi: metadata Permendikdasmen 13/2025 (peraturan.bpk.go.id), Pedoman UKK SMK TA 2025/2026
  (smk.kemendikdasmen.go.id), Panduan Kurikulum Berbasis Cinta, Keputusan Dirjen Pendis 6077/2025 (cdn.kemenag.go.id), Panduan PKL 2023 Ditjen Vokasi
  (repositori.kemendikdasmen.go.id), halaman e-Rapor SMK dan Spektrum Keahlian (Direktorat SMK), helpdesk Dapodik, dan salinan JDIH Lampiran
  struktur kurikulum SMK/MAK (berkas dihosting sebuah sekolah, berheader jdih.kemdikbud.go.id).
- Struktur JP madrasah (MI/MTs/MA) hanya dari blog pendidikan (ayomadrasah.id): **Sekunder**, angka harus dicek ke Lampiran II KMA 1503/2025.
- Tidak ada yang saya tebak. Bila tidak ditemukan atau sumber bertentangan, tertulis demikian.

## 1. Ringkasan eksekutif

**Temuan terpenting**

1. **Enum `subject_group` (general, vocational_base, vocational_concentration, vocational_project, elective, internship) tidak cukup dan sebagian menyesatkan.**
   Struktur resmi SMK Kurikulum Merdeka hanya punya dua kelompok formal (A Umum, B Kejuruan). Matematika, Bahasa Inggris, Informatika, dan Projek IPAS
   berada di kelompok **Kejuruan**, bukan umum. Tidak ada "dasar bidang keahlian" di Kurikulum Merdeka, hanya "Dasar-dasar Program Keahlian" (kelas X).
   Madrasah butuh rumpun PAI dan Bahasa Arab, "penguatan program" MA, dan pendidikan agama per agama di SMK. Usul: ganti CHECK enum di database dengan tabel
   acuan kelompok yang berversi, dan pisahkan dua dimensi (kelompok struktur dan peran mapel). Lihat bagian 4.
2. **Rantai regulasi kurikulum madrasah sudah bergeser dari asumsi roadmap.** KMA 183/2019 dan KMA 347/2022 bukan lagi acuan terbaru. Yang terbaru
   (sumber sekunder, dikuatkan halaman kanwil Kemenag): **KMA 1503/2025** (perubahan atas **KMA 450/2024**). Kurikulum 2013 dihentikan di madrasah
   mulai TA 2026/2027 (sekunder). Tanggal penetapan KMA 1503/2025 tidak ditemukan.
3. **"Kerangka profil madrasah terpisah" sebagian keliru.** Panduan resmi madrasah 2025 memakai **8 dimensi profil lulusan yang sama** dengan sekolah umum;
   yang khas madrasah adalah **Panca Cinta** (lima topik Kurikulum Berbasis Cinta, Kepdirjen Pendis 6077/2025), bukan himpunan dimensi lain.
   P5RA (Projek Penguatan Profil Pelajar Pancasila dan Rahmatan lil Alamin) diganti kokurikuler (sekunder). Kerangka lama (P5/P5RA) tetap perlu ada untuk data historis.
4. **Struktur SMK resmi (salinan JDIH):** PKL 3 tahun minimal 6 bulan (792 JP) di kelas XII; PKL 4 tahun minimal 10 bulan (1.368 JP) di kelas XIII; Projek Kreatif dan
   Kewirausahaan ada di kelas XI (dan XII 4 tahun). Berita yang menyebut PKL "diperpanjang" lewat Permendikdasmen 13/2025 **tidak terbukti**: angka itu sudah ada
   di struktur 2022. Isi tabel SMK di Permendikdasmen 13/2025 belum bisa saya baca, jadi harus dicek ulang sebelum desain dikunci.
5. **UKK bukan Permen, melainkan Pedoman Direktorat SMK TA 2025/2026 (5 Januari 2026)** dengan tiga pola (LSP, dunia kerja/asosiasi, mandiri), dua skala skor yang
   berbeda, penguji internal dan eksternal, sertifikat berlogo berbeda, dan kewajiban mengirim nilai ke e-Rapor SMK dan Dinas sebelum pengumuman kelulusan.
   Model `ukk_event/ukk_result` di roadmap perlu diperluas (bagian 3, Fase 5).
6. **Celah terbesar yang belum ada di roadmap:** (a) pemilihan mapel pilihan dan pendidikan agama **per siswa** (bukan per kelas); (b) menit per JP dan asumsi minggu
   yang berbeda per jenjang (MI 35, MTs 40, MA dan SMK 45 menit); (c) program SMK 4 tahun (tingkat XIII); (d) interoperabilitas dengan e-Rapor SMK/Dapodik dan RDM/EMIS,
   karena sekolah sudah wajib melaporkan ke sana; (e) transisi K13 di madrasah.
7. Yang **tidak ditemukan** di sumber resmi: kewajiban tahfidz/ibadah sebagai komponen rapor, format rapor madrasah resmi, KKM/KKTP khusus madrasah, definisi NSM,
   bobot nilai PKL sekolah:industri. Ini harus dijadikan **konfigurasi sekolah**, bukan aturan yang dikodekan.

## 2. Tabel klaim

Status: **T** = Terverifikasi-sumber-resmi, **S** = Sekunder, **B** = Belum-terverifikasi. "Salinan JDIH" berarti isi dokumen resmi, tetapi berkas diunduh dari server sekolah.

### 2.1 Madrasah

| # | Klaim | Status | Sumber (judul, URL, nomor/tahun) |
|---|---|---|---|
| M1 | KMA 1503/2025 "Perubahan atas KMA 450/2024 tentang Pedoman Implementasi Kurikulum pada RA, MI, MTs, MA, dan MAK"; diedarkan lewat surat Dit. KSKK Madrasah B-249/Dt.I.I/PP.00/10/2025 tanggal 20 Okt 2025. Tanggal penetapan dan berlaku KMA: **tidak ditemukan**. | S (keberadaan dan isi garis besar dikuatkan halaman resmi kanwil) | Blog MTs Muslimin Bjp, https://www.mtssmusliminbjp.sch.id/2025/11/kma-ri-nomor-1503-tahun-2025-tentang-pedoman-implementasi-kurikulum-madrasah.html ; Kemenag Jatim, https://jatim.kemenag.go.id/berita/546483/pengawas-madrasah-kupas-tuntas-panduan-kurikulum-madrasah-kma-1503-tahun-2025 |
| M2 | KMA 450/2024 (Pedoman Implementasi Kurikulum RA, MI, MTs, MA, MAK) menggantikan KMA 347/2022; diluncurkan Ditjen Pendis 10 Juli 2024; memuat P5RA. | S | NU Online, https://www.nu.or.id/nasional/kemenag-luncurkan-pedoman-implementasi-kurikulum-bagi-madrasah-Tx4RP ; kurikulummerdeka.com (blog) |
| M3 | KMA 347/2022 = Pedoman Implementasi Kurikulum Merdeka pada Madrasah. Teks pindaian tidak terbaca. | S | https://sikurma.hdmadrasah.id/upload/file_info/KMA_347_TAHUN_2022_TTG_PEDOMAN_IMPLEMENTASI_KURIKULUM_MERDEKA_PADA_MADRASAH.pdf |
| M4 | KMA 183/2019 (kurikulum PAI dan Bahasa Arab) digantikan atau diamendemen KMA 347/2022. **Sumber bertentangan**: ada yang menulis "digantikan", jurnal ALSUNIYAT menulis "amandemen"; diktum pencabutan tidak ditemukan. Jangan menyebut "dicabut" sebelum teksnya dibaca. | S | https://ejournal.upi.edu/index.php/alsuniyat/article/view/82533/0 ; abstrak UIN SGD, https://digilib.uinsgd.ac.id/99089/ |
| M5 | Struktur MI (KMA 1503/2025): 1 JP = 35 menit; kelas 1-5 dengan 36 minggu, kelas 6 dengan 32 minggu. Al-Qur'an Hadis 108/108/72/72/64 (kelas 1, 2, 3-4, 5, 6); Akidah Akhlak 72/72/72/108/96; Fikih 72/72/108/72/64; SKI tidak ada di kelas 1-2, 72/72/64 mulai kelas 3; Bahasa Arab 72/72/72/72/64. Muatan lokal 72-216 (kelas 6: 64-192). Koding dan KA pilihan di kelas 5-6. Tabel dikelompokkan kelas 3-4 (tanpa label fase). | S | Ayo Madrasah, https://www.ayomadrasah.id/2025/11/struktur-kurikulum-mi-kma-1503-2025.html |
| M6 | Struktur MTs: 1 JP = 40 menit; VII-VIII 36 minggu, IX 32 minggu. Al-Qur'an Hadis 108/72/64; Akidah Akhlak 72/72/96; Fikih 72/108/64; SKI 72/72/64; Bahasa Arab 108/108/96. Muatan lokal 72-216 (IX: 64-192). Koding dan KA pilihan (sumber memuat salah ketik di kelas IX). | S | https://www.ayomadrasah.id/2025/11/struktur-kurikulum-mts-kma-1503-2025.html |
| M7 | Struktur MA: 1 JP = 45 menit; 36 minggu. Kelas X: Al-Qur'an Hadis 72 (+36 kokurikuler), Akidah Akhlak 72, Fikih 72, SKI 72, Bahasa Arab 144. XI: 72 (Fikih 72+36), SKI 72, Bahasa Arab 72. XII: sekitar 64 per mapel PAI, Bahasa Arab 64. Mapel pilihan XI-XII: madrasah wajib membuka minimal 7, siswa memilih 4-5; dapat diganti paling lambat kelas XI semester 2. "Penguatan Program" 72-216 JP (X, XI) khusus MA Program Keagamaan, Akademik, Plus Keterampilan. Kelas XI-XII Fase F. Tafsir/Hadis dan Ilmu Kalam/Akhlak Tasawuf sebagai rincian di MA Program Keagamaan. | S | https://www.ayomadrasah.id/2025/11/struktur-kurikulum-ma-kma-1503-2025.html |
| M8 | P5RA diubah menjadi kokurikuler; JP kokurikuler dipotong dari sejumlah mapel dan dicatat di kolom tersendiri. | S | Ayo Madrasah (ketiga halaman di atas); Madarul Makwa, https://website.madarulmakwa.sch.id/kma-1503-tahun-2025-sebagai-dasar-pembelajaran-mendalam-dan-kbc-madrasah/ |
| M9 | K13 resmi dihentikan di madrasah; wajib Kurikulum Merdeka penuh mulai TA 2026/2027 (3T paling lambat 2027/2028). Nomor surat edaran tidak disebut. | S | https://www.madrasahmuba.com/2026/08/implementasi-penuh-kurikulum-merdeka-madrasah-2026-2027.html |
| M10 | Mapel umum di madrasah mengacu aturan Kemendikbudristek; PAI dan Bahasa Arab diatur Kemenag (KMA 347/2022). Ini keterangan 2022; status di bawah KMA 1503/2025 (yang memuat struktur lengkap) belum diverifikasi. | S/B | Pendis, https://pendis.kemenag.go.id/madrasah/kemenag-susun-pedoman-implementasi-kurikulum-merdeka (ringkasan hasil pencarian; halaman tidak dibuka penuh) |
| M11 | Rapor madrasah memakai Rapor Digital Madrasah (RDM), diluncurkan Ditjen Pendis 2021, terintegrasi EMIS, juga "bank nilai". Di Kepri RDM menjadi syarat kelulusan dan penerbitan ijazah (aturan daerah, bukan nasional). **Format rapor resmi, KKM, KKTP madrasah: tidak ditemukan dokumen resmi.** | S | https://www.kemenag.go.id/nasional/kemenag-luncurkan-rapor-digital-untuk-87000-madrasah-fvlthr ; https://batam.kemenag.go.id/main/detail/kasi-pendidikan-madrasah-apresiasi-ra-100-telah-menerapkan-rapor-digital-madrasah-semester-ganjil-20252026 |
| M12 | Kelulusan madrasah: telah menyelesaikan seluruh program pembelajaran dan mengikuti Ujian Madrasah; ditetapkan madrasah lewat rapat dewan guru; penetapan 2025: MA/MAK 5 Mei, MI 2 Juni (Juknis Ijazah, SK 4051/2025); 2026: pengumuman MA/MAK 4 Mei, MI/MTs 2 Juni (Kepdirjen Pendis 751/2026). Syarat "sikap minimal Baik" hanya di sumber pihak ketiga. | S | https://mtsmu2bakid.sch.id/penetapan-kelulusan-peserta-didik-madrasah-tahun-ajaran-2024-2025/ ; https://mtsmu2bakid.sch.id/wp-content/uploads/2026/01/POS-UJIAN-MADRASAH.pdf |
| M13 | Panduan Kurikulum Berbasis Cinta ditetapkan dengan Keputusan Dirjen Pendis **6077/2025**. KBC adalah pengayaan, bukan pengganti kurikulum; evaluasi berbasis proses termasuk penerapan nilai cinta. Panca Cinta = lima topik dalam tiga bagian (sumber cinta, tanda cinta, tali cinta): Cinta Allah dan Rasul-Nya; Cinta Ilmu; Cinta Lingkungan; Cinta Diri dan Sesama; Cinta Tanah Air. (Teks PDF mengonfirmasi struktur tiga bagian dan lima topik; urutan nama dari halaman kanwil.) | T | https://cdn.kemenag.go.id/storage/archives/panduan-kurikulum-berbasis-cinta.pdf (Kepdirjen Pendis 6077/2025); Kemenag Jatim (URL M1) |
| M14 | Panduan kurikulum madrasah (KMA 1503/2025) berpusat pada **8 dimensi profil lulusan** (keimanan dan ketakwaan, kewargaan, penalaran kritis, kreativitas, kolaborasi, kemandirian, kesehatan, komunikasi), dengan Panca Cinta sebagai nilai yang diinternalisasi; kegiatan dibagi intrakurikuler, kokurikuler, ekstrakurikuler. | T (halaman resmi kanwil), teks KMA belum dibaca | https://jatim.kemenag.go.id/berita/546483/... |
| M15 | "Profil Pelajar Rahmatan lil Alamin" dan P2RA/P5RA sebagai kokurikuler adalah kerangka Kurikulum Madrasah 2024-2025 yang kini diganti. | S | Hasil pencarian atas Kemenag/NU; blog |
| M16 | Tahfidz dan ibadah harian sebagai komponen penilaian rapor: **tidak ditemukan** di sumber resmi manapun. | B | - |
| M17 | NPSN dikelola Kemendikbudristek/Kemendikdasmen (Dapodik); madrasah didata di EMIS Kemenag. **Definisi dan format NSM tidak ditemukan.** Klaim "negeri memakai Dapodik, swasta EMIS" di satu sumber tampak keliru (pembedaan sebenarnya sekolah versus madrasah). | B | BPS, https://sirusa.bps.go.id/metadata/variabel/223714 ; Permendikbud 79/2015 tentang Data Pokok Pendidikan |
| M18 | SIMPATIKA sebagai sistem GTK Kemenag: **tidak diverifikasi** (tidak muncul di hasil riset). | B | - |

### 2.2 SMK dan umum

| # | Klaim | Status | Sumber |
|---|---|---|---|
| S1 | Permendikdasmen **13/2025** (Perubahan atas Permendikbudristek 12/2024 tentang Kurikulum): ditetapkan **11 Juli 2025**, diundangkan dan berlaku **15 Juli 2025**, BN 2025 No. 503, Lampiran I-III 12/2024 diganti; Lampiran II memuat bagian "E. Struktur Kurikulum SMK/MAK". Tidak mencabut apapun. | T | https://peraturan.bpk.go.id/Details/322506/permendikdasmen-no-13 |
| S2 | Isi tabel struktur SMK/MAK di Permendikdasmen 13/2025 (JP, kelompok) | B | Lampiran II tidak terbaca |
| S3 | Struktur Kurikulum Merdeka SMK/MAK (salinan JDIH Lampiran Kepmendikbudristek 56/M/2022 sebagaimana diubah 262/M/2022; berkas bernama "No.56", nomor versi pasti belum dipastikan): kelompok **A Umum** dan **B Kejuruan**; kelas X kejuruan = Matematika 144, Bahasa Inggris 144, Informatika 144, Projek IPAS 216, Dasar-dasar Program Keahlian 432, total 1.656 JP/tahun; kelas XI = Matematika 108, B. Inggris 144, Mapel Konsentrasi 648, Projek Kreatif dan Kewirausahaan 180, Mapel Pilihan 144; kelas XII 3 tahun = Konsentrasi 396, PKK 90, **PKL 792**, Pilihan 108; kelas XII 4 tahun mirip XI; **kelas XIII** = Matematika 72, B. Inggris 216, PKL 1.368; 1 tahun = 36 minggu, 1 JP = 45 menit; projek profil sekitar 30% total JP; muatan lokal paling banyak 72 JP/tahun; PAI dan Budi Pekerti tersedia per agama (6 varian). Nama mapel konsentrasi = nama konsentrasi; nama mapel pilihan = pilihan siswa. | T (isi resmi, salinan) | https://tendik.smkislamiccentre.sch.id/Wakasek/Kurikulum/Struktur%20Kurikulum/Kurikulum%20Merdeka/Kepmendikbudristek%20No.56%20Struktur%20Kurikulum%20Merdeka%20SMK-MAK.pdf (salinan JDIH) |
| S4 | 56/M/2022 diubah oleh 262/M/2022 (mengganti Lampiran I). Satu situs menyebut 56/M/2022 "tidak berlaku"; JDIH menyebut "mengubah". | S, ada pertentangan | paralegal.id; JDIH scan via bpmpkaltara.kemdikbud.go.id; paud.id |
| S5 | Hierarki **Bidang Keahlian → Program Keahlian → Konsentrasi Keahlian**; tiap program minimal 1 konsentrasi; konsentrasi dapat diselenggarakan 3 atau 4 tahun (diatur keputusan unit utama). Daftar 2022: 10 bidang (Teknologi Konstruksi dan Properti; Teknologi Manufaktur dan Rekayasa; Energi dan Pertambangan; Teknologi Informasi; Kesehatan dan Pekerjaan Sosial; Agribisnis dan Agriteknologi; Kemaritiman; Bisnis dan Manajemen; Pariwisata; Seni dan Ekonomi Kreatif) dengan 50 program. | T (salinan JDIH) | URL S3 |
| S6 | Spektrum terbaru: **Kepmendikbudristek 244/M/2024** "Spektrum Keahlian dan Konversi Spektrum Keahlian SMK/MAK pada Kurikulum Merdeka"; Dapodik 2025 menyesuaikan nama program dan konsentrasi. Tanggal penetapan: **tidak konsisten** (satu ringkasan 10 Juni 2024, blog yang mengunggahnya 6 Juni 2024), jadi tidak dipakai. | T (nomor dan judul), tanggal B | Pedoman UKK 2025/2026 (URL S11) acuan normatif no. 11; https://helpdesk.pauddasmen.id/help/en-us/26-teknis-pengisian-di-dapodik/150-pengisian-kompetensi-keahlian-dilayani-jenjang-smk |
| S7 | Halaman Direktorat SMK (2026) mendaftar **50 program keahlian dan 128 konsentrasi**. Ringkasan sekunder menyebut 51 program: **bertentangan**, jumlah bidang di 244/M/2024 tidak terverifikasi. | T (halaman) / S | https://smk.kemendikdasmen.go.id/spektrum-keahlian ; komunitasbelajar.id |
| S8 | Konsentrasi keahlian awal ditetapkan Keputusan Kepala BSKAP 024/H/KR/2022; CP mapel kejuruan di BSKAP 008/H/KR/2022 (nomor lain, 033/H/KR/2022, disebut sumber lain). | S, bertentangan | hasil pencarian atas dokumen sekolah |
| S9 | Berita: Permendikdasmen 13/2025 "memperpanjang" PKL (6 bulan/792 JP dan 10 bulan/1.368 JP), memperbesar porsi kejuruan hingga 70%, TRS (rotasi antar tempat PKL), spesialisasi sejak kelas XI. Durasi PKL ternyata **sudah ada di struktur 2022** (S3); 70%, TRS, dan spesialisasi tidak terverifikasi. | S, sebagian keliru | https://radarlawu.jawapos.com/nasional/2507190011/pemerintah-ubah-struktur-kurikulum-smk-lewat-permendikdasmen-nomor-13-tahun-2025-ini-aturan-baru-tentang-pkl |
| S10 | PKL: dasar hukum Permendikbud **50/2020** tentang PKL bagi Peserta Didik; Panduan Ditjen Vokasi 2023 memuat format jurnal harian (tanggal, jam mulai/selesai, bidang, aktivitas, catatan pembimbing, refleksi), format nilai: aspek afektif (7 indikator), kognitif (3), psikomotorik (4), "Laporan PKL dan Presentasi", **nilai akhir = rata-rata A-C x 70% + D x 30%**, skala 0-100; sertifikat diberikan kepada peserta yang menyelesaikan dengan verifikasi dan validasi, memuat identitas peserta, program, tanggal, lembaga. **Peringatan:** panduan ini bersifat umum untuk "PKL/Magang" (juga magang mahasiswa vokasi) dan templatnya berkop unit kerja Ditjen Vokasi; kecocokannya sebagai format PKL SMK perlu dikonfirmasi. Panduan khusus "PKL sebagai Mata Pelajaran dalam Kurikulum Merdeka 2023" disebut di dasar hukum tetapi tidak berhasil diunduh. | T (panduan, dengan catatan) | https://repositori.kemendikdasmen.go.id/34870/ (Somantri dkk., Panduan Penyelenggaraan PKL SMK/Magang Mahasiswa Vokasi, 2023) |
| S11 | Pasal 13 Permendikbud 50/2020: penilaian PKL dilakukan oleh pembimbing dari dunia kerja, mencakup sikap, pengetahuan, keterampilan. | S (ringkasan salinan BN) | https://peraturan.go.id/files/bn1793-2020.pdf (hasil pencarian; teks tidak dibuka penuh); hukumonline |
| S12 | **UKK**: Pedoman Penyelenggaraan UKK SMK TA 2025/2026, Direktur SMK, 5 Januari 2026: asesmen kualifikasi KKNI 2 atau 3 di akhir masa studi; tiga pola (SMK bersama LSP-P1/P2/P3; dunia kerja atau asosiasi; mandiri oleh SMK bersama mitra); penguji UKK mandiri = gabungan internal (guru kejuruan relevan) dan eksternal (dunia kerja, asosiasi, atau SMK lain; mitra minimal 1 tahun kerja sama); jadwal semester 5 atau 6 (3 tahun), 7 atau 8 (4 tahun); skor LSP: belum kompeten 0-74, kompeten 75-100; skor mandiri: Sangat Kompeten 91-100, Kompeten 75-90, Cukup Kompeten 61-74, Belum Kompeten <61; sertifikat hanya bagi yang kompeten, ditandatangani LSP, dunia kerja, atau kepala sekolah bersama dunia kerja, harus mampu telusur, memuat identitas, konsentrasi, dan unit kompetensi; paspor keterampilan untuk unit yang kompeten; mengulang dengan paket soal sama; bila tetap belum kompeten terbit surat keterangan telah mengikuti UKK; skor dapat dihitung dalam nilai rapor dan/atau ijazah; hasil dikirim ke Dinas dan e-Rapor SMK sebelum pengumuman kelulusan. | T | https://smk.kemendikdasmen.go.id/storage/ukk/1767839725_Pedoman%20UKK%20Fix.pdf |
| S13 | e-Rapor SMK versi 2025.1: nilai per TP, nilai PKL per tujuan, rapor PKL dengan tanda tangan kepala sekolah atau pembimbing industri, nilai UKK dikirim ke Dapodik, penguji eksternal diimpor dari Excel, **P5 dipakai sampai sebelum 2025/2026 dan kokurikuler dipakai mulai 2025/2026**, kenaikan kelas diinput wali kelas di semester genap, SKL dan Transkrip Nilai Ijazah, integrasi tarik dan kirim Dapodik, "Kelompok Mapel". | T | https://smk.kemendikdasmen.go.id/p/e-rapor-smk |
| S14 | Dapodik: "Kompetensi Keahlian Dilayani" (program/konsentrasi) diinput admin Dinas Pendidikan, bukan sekolah; mengacu 244/M/2024 sejak Dapodik 2025. | T | helpdesk Dapodik (URL S6) |
| S15 | TKA: Permendikdasmen **9/2025** (ditetapkan 28 Mei 2025, diundangkan 3 Juni 2025, BN 2025 No. 384; mencabut Permen 31/2023); peserta kelas 6 SD/MI, 9 SMP/MTs, 12 SMA/MA/SMK/MAK, 13 SMK/MAK 4 tahun; hasil TKA tidak menentukan kelulusan, kelulusan tetap kewenangan satuan pendidikan. | S (rangkuman hasil pencarian; halaman resmi tidak terbuka) | https://jdih.kemendikdasmen.go.id/detail_peraturan?main=3527 ; https://pusatinformasi.rumahpendidikan.kemendikdasmen.go.id/hc/id/articles/52474902769689-Kenali-Tes-Kemampuan-Akademik-TKA |
| S16 | Permendikbudristek **21/2022** (Standar Penilaian): kenaikan kelas mempertimbangkan laporan kemajuan belajar semua mapel dan ekstrakurikuler (Pasal 10, sekunder). Syarat kelulusan SMK: **tidak ditemukan teks**. | S/B | https://peraturan.go.id/files/bn460-2022.pdf (tidak dibaca penuh) |
| S17 | 8 dimensi Profil Lulusan menggantikan istilah Profil Pelajar Pancasila di Permendikdasmen 13/2025; kokurikuler berisi kompetensi, muatan, beban belajar; "deep learning" adalah pendekatan, bukan kurikulum baru; Koding dan KA pilihan. | S (berita; metadata regulasi T) | https://www.detik.com/edu/sekolah/d-8024208/profil-pelajar-pancasila-kini-ganti-istilah-jadi-profil-lulusan-apa-bedanya |
| S18 | Fase SMK: X = Fase E, XI-XII (XIII untuk 4 tahun) = Fase F. | S (ringkasan SMA/MAK) | smansakurik.sch.id; kurikulummerdeka.com |
| S19 | Struktur khas Kurikulum 2018: kelompok C1 (dasar bidang), C2 (dasar program), C3 (kompetensi keahlian). **Dari pengetahuan saya, tidak dibaca ulang dalam riset ini.** Di struktur Merdeka (S3) hanya ada Dasar-dasar Program Keahlian. | B | - |
| S20 | Struktur MAK (madrasah aliyah kejuruan) tersendiri ada di lampiran KMA 1503/2025; spektrum keahlian MAK mengakomodasi spektrum SMK. Tabel MAK tidak ditemukan. | S/B | komunitasbelajar.id/2025/11/struktur-kurikulum-ra-mi-mts-ma-mak.html |

## 3. Penilaian roadmap per butir

Label: **sesuai**, **perlu penyesuaian**, **keliru**, **belum bisa diverifikasi**.

### Fase 0 dan bagian 9 audit (profil jenjang)

| Butir | Penilaian | Alasan dan usulan |
|---|---|---|
| Delapan kunci profil (`sd, mi, smp, mts, sma, ma, smk, mak`) | **sesuai** | Cocok dengan jenjang di KMA (RA, MI, MTs, MA, MAK) dan struktur Kemendikdasmen. `mak` sebaiknya dipetakan ke kemampuan kejuruan yang sama dengan `smk`, tetapi otoritasnya Kemenag. |
| "Otoritas" (Kemendikdasmen atau Kemenag) per profil | **perlu penyesuaian** | Otoritas berbeda per **bagian struktur**, bukan per sekolah: PAI/Bahasa Arab diatur Kemenag, sementara KMA 1503/2025 kini memuat struktur lengkap madrasah (M1, M7). Simpan sebagai `structure_source` per struktur kurikulum (acuan beserta nomor regulasi), bukan sebagai sifat tetap profil. |
| Pemetaan tingkat → fase | **perlu penyesuaian** | SMK: X = E, XI-XIII = F. MI: tabel resmi mengelompokkan kelas 3-4 (M5). Kunci pemetaan per (profil, tingkat), termasuk tingkat 13. |
| Model pengajar (guru kelas atau guru mapel) | **sesuai** | Tidak bertentangan dengan sumber. |
| Menit per JP dan jumlah minggu | **tidak ada di roadmap** | MI 35, MTs 40, MA 45, SMK 45 menit; minggu efektif 36 (kelas akhir MI/MTs/SMP 32) (S3, M5-M7). Tambahkan ke profil atau struktur. |
| NSM, kode EMIS (Fase 4) | **belum bisa diverifikasi** | Definisi dan format NSM tidak ditemukan di sumber resmi (M17). Simpan sebagai teks identitas opsional, tanpa validasi format keras, sampai ada acuan. |

### Fase 2B (kelompok mapel, JP, KKTP)

| Butir | Penilaian | Alasan dan usulan |
|---|---|---|
| Enum `subject_group` (6 nilai) | **keliru untuk SMK, kurang untuk madrasah** | Lihat bagian 4. |
| `curriculum_subject_allocation` (JP mingguan/tahunan per tahun, tingkat, program, mapel) | **perlu penyesuaian** | Struktur resmi menyimpan JP **tahunan** per mapel dengan kolom intrakurikuler, kokurikuler, dan total; mulok dan pilihan berupa **rentang** (72-216; pilihan 72/144/180); "mapel konsentrasi" bernama sama dengan konsentrasi; ada variasi program 3 vs 4 tahun dan blok PKL (S3, M7). Tambahkan: `jp_intra`, `jp_cocurricular`, `jp_min`/`jp_max`, `period_minutes`, `weeks_assumed`, `program_duration_years` (3 atau 4), dan `concentration_id`. JP mingguan harus diturunkan, bukan disimpan sebagai sumber kebenaran. |
| `is_local_content` boolean | **sesuai** | Mulok bukan kelompok sendiri; tetap flag (batas atas 72 JP di SMK, 72-216 di madrasah). |
| KKTP numerik, interval, deskriptor, rubrik | **perlu penyesuaian** | KKTP berasal dari panduan pembelajaran dan asesmen Kemendikbudristek; untuk madrasah tidak ditemukan dokumen KKM/KKTP resmi (M11). Pertahankan KKTP **dapat dikonfigurasi** dan fallback ke KKM. UKK memakai skala 0-100 dengan ambang berbeda (bagian Fase 5). |
| Adopsi kurikulum sebagai salinan (copy-on-adopt) dengan `ref_subject_id` | **sesuai** | Selaras dengan perubahan regulasi yang sering (KMA 450 → 1503, Permendikdasmen 13/2025). |

### Fase 4 (kokurikuler dan madrasah)

| Butir | Penilaian | Alasan dan usulan |
|---|---|---|
| Kerangka 8 dimensi profil lulusan (2025) untuk sekolah umum | **sesuai** | Nama dimensi konsisten di berita Kemendikdasmen dan panduan Kemenag (M14, S17). Teks Lampiran I (SKL) Permendikdasmen 13/2025 belum dibaca: pastikan ejaan resmi sebelum seed. |
| "Kerangka madrasah terpisah" | **perlu penyesuaian (sebagian keliru)** | Madrasah memakai 8 dimensi yang sama (M14). Yang khas: **Panca Cinta**, lima topik KBC (M13), dan kerangka lama P5RA (M15). Usul: `ref_profile_framework` dengan tiga entri berversi: `profil_lulusan_2025` (8 dimensi, umum dan madrasah), `panca_cinta_2025` (kerangka topik/nilai, bukan dimensi, hanya madrasah, opsional), `p5_legacy`/`p5ra_legacy` (data historis). Nama dimensi tidak boleh di-hardcode; simpan ber-id dan berlabel i18n. |
| Kokurikuler menggantikan P5/P5RA (mulai 2025/2026) | **sesuai** | e-Rapor SMK mengonfirmasi peralihan P5 → kokurikuler 2025/2026 (S13); KMA 1503 memuat kokurikuler (M8). Tambah: JP kokurikuler dipotong dari JP mapel (lihat allocation) dan fasilitator/koordinator memiliki beban kerja resmi (M7, sekunder). |
| Seed `kma` untuk MI dan MA, mapel rumpun PAI dan Bahasa Arab | **perlu penyesuaian** | Lima mapel (Al-Qur'an Hadis, Akidah Akhlak, Fikih, SKI, Bahasa Arab) sesuai di MI, MTs, MA (M5-M7). Tetapi SKI **tidak ada di kelas 1-2 MI**; MA Program Keagamaan memecah mapel menjadi Tafsir/Hadis dan Ilmu Kalam/Akhlak Tasawuf; MA punya mapel pilihan keagamaan lanjutan (Ilmu Tafsir, Ilmu Hadis, Ushul Fikih, dst.). Seed harus per tingkat dan opsional, bukan satu daftar per jenjang. Angka JP seed harus diberi label "perlu dicek ke Lampiran II KMA 1503/2025". |
| Kolom NSM (dan petunjuk EMIS) | **belum bisa diverifikasi** | Lihat Fase 0. |
| Tahfidz masuk penilaian | **belum bisa diverifikasi** | Tidak ada kewajiban resmi di sumber yang saya temukan (M16). Jadikan komponen opsional (mis. sebagai ekstrakurikuler, muatan lokal keagamaan, atau catatan rapor), bukan mapel wajib. |
| "Kebijakan dan kerangka profil dapat berubah, simpan sebagai data berversi" | **sesuai** | Terbukti: KMA 183 → 347 → 450 → 1503 dalam enam tahun. |
| Ekspor/impor Dapodik dan EMIS "menyusul setelah fase 4" | **perlu penyesuaian** | Lihat celah G6. Sekolah SMK diwajibkan mengirim nilai UKK ke e-Rapor SMK/Dinas (S12) dan memakai e-Rapor SMK gratis. Tanpa ekspor/impor, Edusync akan menjadi pekerjaan ganda. |

### Fase 5 (SMK penuh)

| Butir | Penilaian | Alasan dan usulan |
|---|---|---|
| `vocational_field/program/concentration` + `program.concentration_id` | **sesuai** (hierarki), **perlu penyesuaian** (data) | Hierarki dikonfirmasi (S5). Daftar bidang/program/konsentrasi **jangan di-hardcode**: Spektrum berubah (2018 → 2022 → 244/M/2024), sumber bertentangan soal jumlah (S7). Simpan sebagai acuan berversi per Kepmen, dengan `source_ref = "244/M/2024"`, dapat diimpor. Dapodik mengisi "kompetensi keahlian dilayani" lewat Dinas (S14): sediakan kolom pemetaan ke kode Dapodik. |
| `pkl_period.semester_id`, bobot sekolah:industri | **perlu penyesuaian** | PKL adalah **mapel** dengan CP dan TP, dijalankan blok 18 minggu (3 tahun) atau 27-28 minggu (4 tahun) (S3); e-Rapor SMK menilai PKL per tujuan (S13). Bobot 70:30 di panduan Ditjen Vokasi adalah antara rata-rata aspek dan laporan/presentasi, **bukan** sekolah:industri; Permen 50/2020 menyebut penilaian oleh pembimbing industri (S10-S11). Bobot sekolah:industri harus konfigurasi per sekolah. Hubungkan nilai PKL ke mapel PKL (`subject_group = internship`) di rapor. |
| Ringkasan PKL di rapor SMK, nomor sertifikat PKL | **sesuai** | e-Rapor SMK mencetak rapor PKL (S13); panduan mewajibkan sertifikat dengan verifikasi. Format nomor tidak diatur di sumber yang saya baca: buat `numbering_pattern` konfigurasi. |
| Jurnal PKL | **sesuai**, perlu penyesuaian kecil | Kolom jurnal resmi mirip dengan jurnal yang ada (S10). Catatan: refleksi peserta adalah kolom tersendiri. |
| `ukk_event` dan `ukk_result` (skema, penguji internal/eksternal, nilai praktik/teori, predikat, nomor sertifikat) | **perlu penyesuaian** | Tiga pola penyelenggara (LSP, dunia kerja, mandiri) menentukan skala dan penandatangan (S12). Tambahkan: `pattern` (lsp/industry/independent), `lsp_license_ref` dan `scheme` (LSP), `tuk` (tempat uji; verifikasi oleh Dinas untuk mandiri), asesor bertipe internal/eksternal beserta kualifikasi (sertifikat BNSP atau pengalaman; mitra >= 1 tahun), `attempt_no` (mengulang dengan paket sama), hasil `competent/not_competent` **dan** skor 0-100 dengan **dua tabel konversi yang berbeda** (LSP: 75 batas; mandiri: 4 kategori, batas 61/75/91), `skill_passport_units`, dokumen `surat_keterangan_mengikuti`, `reported_to_dinas_at`, `pushed_to_erapor_at`, dan flag "skor masuk rapor/ijazah". Konfigurasi, bukan konstanta. |
| UKK "di bawah modul `internship`" | **perlu penyesuaian** | UKK adalah asesmen kelulusan/kompetensi (indikator SKL), bukan bagian PKL, walau dapat terintegrasi dengan PKL dalam keadaan kahar (S12). Modul terpisah atau sub-modul `assessment` lebih tepat; izin `ukk:manage` tetap. |
| "Rapor SMK versi 2" | **perlu penyesuaian** | Rapor SMK mencakup nilai mapel per kelompok, ekstrakurikuler, kokurikuler (2025/2026), PKL, dan UKK (S13). Struktur snapshot harus dapat memuat bagian-bagian ini sebagai blok opsional. |

### Bagian 4 audit (tabel keselarasan kurikulum)

| Butir | Penilaian |
|---|---|
| "Fase (A-F) dan tingkat" | sesuai (SMK E dan F; lihat S18) |
| "Struktur kurikulum, kelompok mapel, JP" | sesuai sebagai celah, **perlu penyesuaian** pada rancangan (bagian 4) |
| "Pembedaan SMK (konsentrasi, PKL, UKK)" | sesuai |
| "Seed: tidak ada kurikulum 2025" | sesuai; Permendikdasmen 13/2025 bukan kurikulum baru melainkan perubahan Standar (S17), jadi `kurikulum 2025` tidak boleh dibuat sebagai kunci kurikulum baru, cukup versi/struktur. |
| Bagian 9, tabel SMP vs SMK: "Kelompok mapel SMK: umum, kejuruan (dasar program, konsentrasi, projek, pilihan), PKL, muatan lokal" | **perlu penyesuaian**: tidak ada "dasar bidang" (sudah terkoreksi di tabel ini), tetapi Matematika, B. Inggris, Informatika, dan Projek IPAS termasuk kelompok **Kejuruan** (S3). |
| Bagian 9, tabel: "Kelulusan: tingkat akhir XII (atau XIII)" | **sesuai** (XIII untuk 4 tahun, S3) |
| Bagian 9, "SD/MI ... fase A-C" | belum bisa diverifikasi untuk MI (tabel resmi tidak melabeli fase); pemetaan Kemendikbudristek kelas 1-2 = A, 3-4 = B, 5-6 = C adalah pengetahuan umum, tidak dibaca ulang. |
| "SD/MI cukup pintasan guru kelas" | **perlu penyesuaian**: di MI, mapel PAI/Arab sering diajar guru mapel terpisah; pintasan harus dapat mengecualikan mapel tertentu. |

## 4. Enum `subject_group`: apakah cukup?

**Tidak.** Saat ini enum berupa konstanta TypeScript (`packages/contracts/src/curriculum.ts`) **dan** constraint CHECK di database
(`packages/db/drizzle/0089_curriculum_structure.sql`), sehingga setiap perubahan regulasi memerlukan migrasi.

### Masalah

1. **Hanya dua kelompok formal di SMK** (A Umum, B Kejuruan). Enum menyiratkan `general` untuk Matematika/B. Inggris/Informatika/Projek IPAS di SMK, padahal secara resmi
   mereka kelompok Kejuruan (S3). Rapor SMK mengelompokkan menurut ini.
2. `vocational_base` ambigu: di Kurikulum Merdeka hanya ada **"Dasar-dasar Program Keahlian"** (kelas X), bukan dasar bidang (kelompok C1 hanya di Kurikulum 2018, S19).
   Nama nilai sebaiknya `vocational_program_base`.
3. `vocational_project` bertabrakan: ada dua hal berbeda, **Projek IPAS** (kelas X, kejuruan) dan **Projek Kreatif dan Kewirausahaan** (kelas XI-XII).
4. Madrasah: tidak ada tempat untuk rumpun PAI (Al-Qur'an Hadis, Akidah Akhlak, Fikih, SKI), Bahasa Arab, "penguatan program" MA, dan pilihan keagamaan MA.
5. **Pendidikan agama per agama** ("PAI dan Budi Pekerti", Kristen, Katolik, Buddha, Hindu, Khonghucu, plus kepercayaan) terdaftar sebagai satu baris dengan enam varian: wajib diikuti
   sesuai agama siswa (S3). Enum tidak memuatnya.
6. `elective` mencakup dua hal berbeda: pilihan siswa (SMK, MA) dan mapel tambahan/koding.
7. **Kokurikuler bukan mapel**, melainkan potongan JP dari mapel (M7-M8). Jangan masukkan ke enum.
8. `internship` sudah benar tetapi PKL adalah mapel blok, bukan JP mingguan.

### Usul

- **Hapus CHECK enum** pada `subject.subject_group`; ganti menjadi `ref_subject_group` (kunci, label i18n, profil berlaku, urutan rapor, `report_section`) dan validasi di API terhadap tabel
  acuan. Lakukan migrasi aditif (jangan DROP: ubah CHECK menjadi referensi lunak lewat pengecekan aplikasi atau FK ke `ref_subject_group.key`).
- Pisahkan **dua dimensi**:
  - `structure_group` (kelompok formal di regulasi; mengatur urutan dan subtotal rapor): `general` (A), `vocational` (B), `islamic_studies` (rumpun PAI madrasah), `arabic`, `elective`,
    `local_content`, `additional` (muatan tambahan/penguatan program), `special_needs`.
  - `role` (peran mapel di struktur): `religion_civic` (agama), `program_base` (dasar program keahlian), `concentration`, `creative_entrepreneurship_project`, `science_social_project` (Projek IPAS),
    `internship`, `student_elective`, `coding_ai`, `program_strengthening`, `foreign_language`, dll.
  Cukup satu tabel acuan dengan kolom `group_key` dan `role_key`; tidak perlu dua kolom di `subject` bila lebih ringan (satu kunci ber-hierarki).
- Tambah **`religion_scope`** (nullable) pada mapel agama agar siswa otomatis dipetakan ke varian yang sesuai.
- Tambah **`elective_mode`**: `fixed`, `student_choice`, `school_offer_min` (mis. MA minimal 7 pilihan dan siswa memilih 4-5).
- Daftar kelompok harus **dikonfigurasi per profil dan versi regulasi**, bukan kode: mis. profil `smk` memuat `general` dan `vocational` sebagai kelompok rapor, profil `ma` memuat `islamic_studies`, `arabic`, `general`, `elective`, `local_content`.
- Jangan tambahkan `vocational_field_base` (dasar bidang) sebagai bawaan; sediakan sebagai opsi untuk sekolah yang masih menjalankan Kurikulum 2018, bila ada.

## 5. Daftar celah (belum ada di roadmap) dan prioritas

**P0: tentukan sebelum Fase 2B/4/5 dikunci**

| # | Celah | Alasan |
|---|---|---|
| G1 | **Pemilihan mapel pilihan per siswa** (`student_subject_enrollment`) dan penugasan mapel per agama per siswa. Saat ini penugasan guru per (kelas, mapel). | SMK kelas XI-XII punya mapel pilihan 144/108 JP yang dipilih siswa, mapel agama per agama, MA memilih 4-5 pilihan (S3, M7). Tanpa ini nilai dan rapor pilihan tidak bisa benar. |
| G2 | **Menit per JP, minggu efektif, dan JP rentang** pada struktur. | MI 35/MTs 40/MA dan SMK 45 menit; minggu 36 atau 32; mulok/pilihan berupa rentang. |
| G3 | **Program SMK 4 tahun**: tingkat XIII, PKL 1.368 JP, struktur berbeda per lama program. | Struktur resmi memuat tabel khusus (S3); UKK semester 7 atau 8 (S12); TKA kelas 13 (S15). Pengaruh ke rollover, kelulusan, dan tingkat akhir. |
| G4 | **Kerangka profil: satu kerangka 8 dimensi bersama + topik Panca Cinta + kerangka lama** (lihat Fase 4). | Roadmap berasumsi kerangka madrasah terpisah. |
| G5 | **PKL blok** memengaruhi jadwal, kehadiran, dan JP: kelas XII 3 tahun menjalani PKL 18 minggu (sisa 18 minggu untuk mapel lain). | Jadwal dan absensi per jam harus dapat "menonaktifkan" siswa PKL; menyangkut Fase 1 (`schedule`). |

**P1: sebelum rilis SMK/madrasah**

| # | Celah | Alasan |
|---|---|---|
| G6 | **Interop e-Rapor SMK/Dapodik dan RDM/EMIS** (impor siswa, mapel, nilai; ekspor nilai UKK, rapor, transkrip). Roadmap menunda ke setelah Fase 4. | Pelaporan wajib: UKK ke Dinas dan e-Rapor SMK (S12); RDM menjadi syarat ijazah di sebagian wilayah (M11). Minimal sediakan format ekspor dan petakan kode (NPSN, NISN, kode mapel Dapodik). |
| G7 | **Kelulusan dan ijazah**: SKL, transkrip nilai ijazah, ujian madrasah/ujian sekolah, penetapan lewat rapat dewan, tanggal pengumuman, kaitannya dengan TKA. Roadmap Fase 2A hanya "graduated". | e-Rapor SMK membuat SKL dan transkrip (S13); madrasah memakai Ujian Madrasah dan juknis ijazah (M12). Kriteria kelulusan tidak ditemukan di teks resmi, jadi harus konfigurasi sekolah. |
| G8 | **PKL per TP/CP PKL**, rotasi beberapa tempat PKL (TRS, sekunder), tanda tangan kepala sekolah atau pembimbing industri pada rapor PKL, pembimbing sekolah dan pembimbing industri sebagai peran berbeda. | S10, S13, S9. |
| G9 | **UKK**: pola penyelenggara, TUK, penguji internal dan eksternal, skema LSP, paspor keterampilan, surat keterangan, ulang uji, kondisi kahar (portofolio, daring, bertahap, terintegrasi PKL). Lihat Fase 5. | S12. |
| G10 | **Identitas madrasah**: NSM, NPSN, kode EMIS, status (negeri/swasta), jenis (MIN/MTsN/MAN) dan program MA (Keagamaan, Akademik, Plus Keterampilan). | M7, M17. |
| G11 | **Transisi K13 di madrasah** (K13 hingga 2025/2026, Merdeka penuh 2026/2027; 3T 2027/2028). Edusync menyimpan kurikulum per unit tahun ajaran; sekolah masih bisa berada di K13 pada transisi. | M9 (sekunder). |

**P2: setelah rilis awal**

| # | Celah | Alasan |
|---|---|---|
| G12 | Mapel Koding dan Kecerdasan Artifisial sebagai pilihan (maks. 2 JP/minggu) di MI kelas 5-6, MTs, MA, SMP/SMA. | M5-M7, S17. |
| G13 | Muatan kebutuhan khusus untuk sekolah inklusif (mapel "Kebutuhan Khusus" di MI; layanan program kebutuhan khusus di SMK). | M5, S3. |
| G14 | Kalender akademik madrasah (Kepdirjen Pendis tiap tahun) berbeda dari Kemendikdasmen; jendela SAS, SAT, dan ujian. | Hasil pencarian menyebut dua nomor berbeda untuk kalender 2026/2027 (4261 dan 4860): belum diverifikasi. |
| G15 | Beban kerja guru kokurikuler (koordinator dan fasilitator) dan JP kokurikuler. | M7 (sekunder). |
| G16 | "Mapel kelompok C (kejuruan) bersama": Projek IPAS dan "Projek Kreatif dan Kewirausahaan" sebagai mapel berbasis projek dengan asesmen sendiri. | S3. |
| G17 | Surat keterangan UKK dan sertifikat kompetensi sebagai dokumen bernomor dan **mampu telusur** (verifikasi publik). | S12. |

## 6. Hal yang harus dapat dikonfigurasi (jangan di-hardcode)

1. Daftar kelompok mapel dan peran mapel per profil dan versi regulasi (bagian 4).
2. Spektrum keahlian (bidang, program, konsentrasi) sebagai acuan berversi per Kepmen (244/M/2024 saat ini), dengan pemetaan ke kode Dapodik.
3. Dimensi profil dan nama kerangka (8 dimensi 2025, Panca Cinta, P5/P5RA historis), berlabel i18n dan berversi.
4. Menit per JP, minggu efektif per tingkat, durasi program SMK (3 atau 4), lama PKL minimal.
5. Skala dan ambang UKK per pola (LSP versus mandiri), predikat, dan tabel konversi.
6. Bobot nilai PKL (sekolah versus industri; aspek versus laporan) dan format nomor sertifikat.
7. Kriteria kenaikan kelas dan kelulusan, minimal nilai sikap, bobot ujian madrasah/sekolah.
8. KKM atau KKTP per sekolah (madrasah belum punya acuan resmi yang ditemukan).
9. Mapel agama per agama dan varian kepercayaan.
10. Apakah tahfidz/ibadah masuk rapor, dan sebagai apa.

## 7. Pekerjaan lanjutan yang disarankan sebelum kode

Urut berdasar nilai:

1. Unduh dan baca teks resmi **Lampiran II Permendikdasmen 13/2025** (struktur SMK/MAK dan SMA/MA) dan **KMA 1503/2025** (Lampiran struktur MI, MTs, MA, MAK) dari JDIH
   Kemendikdasmen/Kemenag, lalu bandingkan dengan angka JP di bagian 2. Dua dokumen ini menentukan seed dan struktur.
2. Pastikan nomor versi salinan struktur SMK (56/M/2022 atau 262/M/2022) dan apakah masih berlaku setelah 13/2025.
3. Cari teks resmi Panduan Pembelajaran dan Asesmen (KKTP, kenaikan kelas, kelulusan) dan Panduan PKL sebagai Mata Pelajaran (2023).
4. Cari dokumen resmi RDM/EMIS: format rapor madrasah, KKM/KKTP, definisi NSM.
5. Verifikasi nomor dan tanggal Kepmendikbudristek 244/M/2024 dan jumlah bidang/program/konsentrasi pada lampirannya.

## Daftar sumber utama

Resmi (dibaca langsung):
- Peraturan Menteri Pendidikan Dasar dan Menengah 13/2025 (metadata): https://peraturan.bpk.go.id/Details/322506/permendikdasmen-no-13
- Pedoman Penyelenggaraan UKK SMK TA 2025/2026 (Direktorat SMK, 5 Jan 2026): https://smk.kemendikdasmen.go.id/storage/ukk/1767839725_Pedoman%20UKK%20Fix.pdf
- Panduan Kurikulum Berbasis Cinta, Kepdirjen Pendis 6077/2025: https://cdn.kemenag.go.id/storage/archives/panduan-kurikulum-berbasis-cinta.pdf
- Panduan Penyelenggaraan PKL SMK/Magang Mahasiswa Vokasi 2023: https://repositori.kemendikdasmen.go.id/34870/
- e-Rapor SMK: https://smk.kemendikdasmen.go.id/p/e-rapor-smk
- Spektrum Keahlian SMK (Direktorat SMK): https://smk.kemendikdasmen.go.id/spektrum-keahlian
- Helpdesk Dapodik, kompetensi keahlian: https://helpdesk.pauddasmen.id/help/en-us/26-teknis-pengisian-di-dapodik/150-pengisian-kompetensi-keahlian-dilayani-jenjang-smk
- Kemenag Jatim, KMA 1503/2025: https://jatim.kemenag.go.id/berita/546483/pengawas-madrasah-kupas-tuntas-panduan-kurikulum-madrasah-kma-1503-tahun-2025
- Salinan JDIH struktur kurikulum Merdeka SMK/MAK (host sekolah): URL di S3

Sekunder (penunjuk, wajib dicek): ayomadrasah.id (struktur MI, MTs, MA), mtssmusliminbjp.sch.id (KMA 1503), NU Online (KMA 450), madrasahmuba.com (K13 berakhir),
mtsmu2bakid.sch.id (kelulusan madrasah), komunitasbelajar.id (244/M/2024, juknis UKK 2026), radarlawu.jawapos.com (PKL 2025), detik.com (profil lulusan), hukumonline (Permen 50/2020).
