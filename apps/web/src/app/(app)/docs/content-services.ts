import type { DocArticle } from '@/lib/docs-types';

/** Dokumentasi panel sekolah per modul: keuangan, SPMB, surat, pengumuman, WhatsApp, portal, website. Isi: id, en, su. */
export const SERVICE_DOCS: DocArticle[] = [
  {
    slug: 'finance',
    icon: 'wallet',
    tone: 'amber',
    module: 'finance',
    text: {
      id: {
        title: 'Keuangan: tagihan, kasir, dan laporan',
        summary:
          'Atur jenis biaya dan tarif, buat tagihan, terima pembayaran di kasir, lalu pantau tunggakan dan denda.',
        sections: [
          {
            heading: 'Jenis biaya dan tarif',
            body: 'Jenis biaya (contoh: SPP, uang gedung, seragam) punya sifat Bulanan, Sekali bayar, atau Tahunan. Nominalnya diatur sebagai tarif per jenis biaya, per tahun ajaran, dan per tingkat; tarif satu tingkat mengalahkan tarif "Semua tingkat".',
            steps: [
              'Buka menu Jenis biaya & tarif (perlu izin kelola keuangan).',
              'Tambah jenis biaya dan pilih sifatnya.',
              'Pilih tahun ajaran, lalu Tambah tarif: jenis biaya, tingkat, dan nominal dalam rupiah.',
              'Ulangi untuk setiap tingkat yang tarifnya berbeda.',
            ],
            href: '/finance/settings',
          },
          {
            heading: 'Keringanan, denda, dan metode bayar',
            body: 'Di halaman yang sama, buat aturan keringanan atau beasiswa (persen atau nominal, untuk satu jenis biaya atau semua) lalu pasang ke satu kelas atau siswa tertentu. Atur juga denda keterlambatan (nominal tetap atau persen, masa toleransi, batas denda) dan daftar metode pembayaran yang tampil di kasir.',
            href: '/finance/settings',
          },
          {
            heading: 'Membuat tagihan',
            body: 'Tagihan dibuat untuk semua siswa aktif di tahun ajaran itu sesuai tarif tingkat kelasnya. Menjalankannya dua kali tidak membuat tagihan ganda: yang sudah ada dilewati.',
            steps: [
              'Buka menu Tagihan, pilih tahun ajaran, lalu klik Buat tagihan.',
              'Pilih jenis biaya; untuk jenis Bulanan tentukan bulan dan tahunnya.',
              'Pilih kelas bila hanya untuk satu kelas, atau biarkan semua kelas.',
              'Untuk jenis non-bulanan, Anda boleh memilih cicilan 2 sampai 12 kali.',
              'Konfirmasi, lalu baca hasilnya: dibuat, sudah ada (dilewati), tanpa tarif, atau tarif nol.',
            ],
            href: '/finance/invoices',
          },
          {
            heading: 'Menerima pembayaran di Kasir',
            body: 'Satu kwitansi dapat melunasi beberapa tagihan milik satu siswa. Nomor kwitansi berurutan per tahun (KWT-tahun-nomor) dan dapat diunduh sebagai PDF.',
            steps: [
              'Buka Kasir, lalu cari siswa dengan nama atau NIS (minimal 2 huruf).',
              'Centang tagihan yang dibayar; jumlah bayar boleh diubah untuk pembayaran sebagian.',
              'Pilih metode dan tanggal bayar, tambahkan catatan bila perlu.',
              'Klik Terima pembayaran, lalu konfirmasi.',
              'Lihat atau unduh kwitansi dari Riwayat pembayaran.',
            ],
            href: '/finance',
          },
          {
            heading: 'Laporan tunggakan dan denda',
            body: 'Laporan keuangan punya tab Tunggakan (per siswa dan per kelas, per tanggal tertentu), Kas harian (penerimaan per metode, jenis biaya, dan hari; maksimal 366 hari), dan Denda. Tunggakan dan Kas harian bisa diekspor ke Excel atau PDF. Di tab Denda, periksa tagihan yang lewat tempo lalu klik Terapkan denda untuk menerbitkan tagihan denda.',
            href: '/finance/reports',
          },
          {
            heading: 'Yang perlu diperhatikan',
            body: 'Kasir hanya terbuka bagi yang berizin menerima pembayaran (bendahara dan admin); peran lain hanya melihat tagihan dan laporan, dan pengaturan butuh izin kelola keuangan. Tagihan yang sudah ada pembayarannya tidak bisa dibatalkan; batalkan dulu kwitansinya (tercatat beserta alasan, sisa tagihan pulih). Perubahan tarif, keringanan, atau denda tidak mengubah tagihan yang sudah dibuat, dan nominal denda dibekukan saat tagihan denda dibuat.',
          },
        ],
      },
      en: {
        title: 'Finance: invoices, cashier, and reports',
        summary:
          'Set up fee types and rates, create invoices, receive payments at the cashier, then follow arrears and late fees.',
        sections: [
          {
            heading: 'Fee types and rates',
            body: 'A fee type (for example tuition, building fee, uniform) is Monthly, One-time, or Yearly. Amounts are set as rates per fee type, academic year, and level; a rate for one level overrides the "All levels" rate.',
            steps: [
              'Open the Fee types & rates menu (needs the finance manage permission).',
              'Add a fee type and choose its kind.',
              'Pick the academic year, then Add rate: fee type, level, and amount in rupiah.',
              'Repeat for every level with a different rate.',
            ],
            href: '/finance/settings',
          },
          {
            heading: 'Discounts, late fees, and payment methods',
            body: 'On the same page, create discount or scholarship rules (percent or fixed amount, for one fee type or all) and assign them to a whole class or specific students. You can also set the late fee (fixed or percent, grace days, cap) and the payment methods shown at the cashier.',
            href: '/finance/settings',
          },
          {
            heading: 'Creating invoices',
            body: 'Invoices are created for all active students of that academic year using the rate for their class level. Running it twice does not duplicate invoices: existing ones are skipped.',
            steps: [
              'Open the Invoices menu, pick the academic year, then click Generate invoices.',
              'Choose the fee type; for a Monthly type, set the month and year.',
              'Choose a class for one class only, or leave all classes.',
              'For non-monthly types you may choose 2 to 12 installments.',
              'Confirm, then read the result: created, already existed (skipped), no rate, or zero rate.',
            ],
            href: '/finance/invoices',
          },
          {
            heading: 'Receiving payments at the Cashier',
            body: 'One receipt can settle several invoices of a single student. Receipt numbers run in order per year (KWT-year-number) and can be downloaded as PDF.',
            steps: [
              'Open the Cashier, then find the student by name or student number (at least 2 letters).',
              'Tick the invoices being paid; the amount can be lowered for a partial payment.',
              'Choose the method and payment date, and add a note if needed.',
              'Click Receive payment, then confirm.',
              'View or download the receipt from Payment history.',
            ],
            href: '/finance',
          },
          {
            heading: 'Arrears and late fee reports',
            body: 'Financial reports has an Arrears tab (per student and per class, as of a date), a Daily cash tab (receipts by method, fee type, and day; up to 366 days), and a Late fees tab. Arrears and Daily cash can be exported to Excel or PDF. In Late fees, review overdue invoices and click Apply late fees to issue the late fee invoices.',
            href: '/finance/reports',
          },
          {
            heading: 'Things to keep in mind',
            body: 'The Cashier is only open to those allowed to receive payments (treasurer and admin); other roles only view invoices and reports, and settings need the finance manage permission. An invoice that already has payments cannot be voided; void its receipt first (logged with a reason, the balance is restored). Changing rates, discounts, or late fees does not change invoices already created, and a late fee amount is frozen when its invoice is created.',
          },
        ],
      },
      su: {
        title: 'Kauangan: tagihan, kasir, jeung laporan',
        summary:
          'Atur jenis biaya jeung tarif, jieun tagihan, tarima pambayaran di kasir, tuluy pantau tunggakan jeung denda.',
        sections: [
          {
            heading: 'Jenis biaya jeung tarif',
            body: 'Jenis biaya (contona SPP, artos gedong, saragam) sifatna Bulanan, Sakali bayar, atawa Taunan. Nominalna diatur salaku tarif per jenis biaya, per tahun ajaran, jeung per jenjang; tarif hiji jenjang leuwih diutamakeun tibatan tarif "Sadaya jenjang".',
            steps: [
              'Buka menu Jenis biaya & tarif (peryogi idin ngokolakeun kauangan).',
              'Tambahkeun jenis biaya tuluy pilih sifatna.',
              'Pilih tahun ajaran, tuluy Tambah tarif: jenis biaya, jenjang, jeung nominal dina rupiah.',
              'Ulangan pikeun tiap jenjang nu tarifna benten.',
            ],
            href: '/finance/settings',
          },
          {
            heading: 'Keringanan, denda, jeung cara mayar',
            body: 'Dina kaca nu sami, jieun aturan keringanan atawa beasiswa (persen atawa nominal, pikeun hiji jenis biaya atawa sadayana) tuluy pasang ka hiji kelas atawa siswa nu tangtu. Atur oge denda telat (nominal tetep atawa persen, mangsa kaleluasaan, wates denda) jeung daptar cara mayar nu mucunghul di kasir.',
            href: '/finance/settings',
          },
          {
            heading: 'Nyieun tagihan',
            body: 'Tagihan dijieun pikeun sadaya siswa aktif dina tahun ajaran eta numutkeun tarif jenjang kelasna. Lamun dijalankeun dua kali, tagihan teu jadi dobel: nu parantos aya dileueut.',
            steps: [
              'Buka menu Tagihan, pilih tahun ajaran, tuluy klik Jieun tagihan.',
              'Pilih jenis biaya; pikeun jenis Bulanan, tangtukeun bulan jeung taunna.',
              'Pilih kelas lamun ngan pikeun hiji kelas, atawa sina sadaya kelas.',
              'Pikeun jenis non-bulanan, tiasa milih nyicil 2 dugi ka 12 kali.',
              'Konfirmasi, tuluy baca hasilna: dijieun, parantos aya (dileueut), tanpa tarif, atawa tarif nol.',
            ],
            href: '/finance/invoices',
          },
          {
            heading: 'Narima pambayaran di Kasir',
            body: 'Hiji kwitansi tiasa ngalunasan sababaraha tagihan milik hiji siswa. Nomer kwitansi berurutan per taun (KWT-taun-nomer) tur tiasa diunduh jadi PDF.',
            steps: [
              'Buka Kasir, tuluy golédah siswa ku nami atawa NIS (sahenteuna 2 hurup).',
              'Centang tagihan nu dibayar; jumlah bayar tiasa diaping pikeun pambayaran sabagian.',
              'Pilih cara jeung tanggal mayar, tambahan catetan upami peryogi.',
              'Klik Tarima pamayaran, tuluy konfirmasi.',
              'Tingali atawa unduh kwitansi tina Riwayat pambayaran.',
            ],
            href: '/finance',
          },
          {
            heading: 'Laporan tunggakan jeung denda',
            body: 'Laporan kauangan gaduh tab Tunggakan (per siswa jeung per kelas, per tanggal nu tangtu), Kas poéan (panarimaan per cara, jenis biaya, jeung poé; paling lami 366 poé), jeung Denda. Tunggakan jeung Kas poéan tiasa diékspor ka Excel atawa PDF. Dina tab Denda, pariksa tagihan nu parantos lewat tempo tuluy klik Terapkeun denda pikeun nerbitkeun tagihan denda.',
            href: '/finance/reports',
          },
          {
            heading: 'Nu kedah diperhatikeun',
            body: 'Kasir ngan kabuka pikeun nu gaduh idin narima pambayaran (bendahara jeung admin); peran sanes ngan tiasa ningali tagihan jeung laporan, sarta pangaturan peryogi idin ngokolakeun kauangan. Tagihan nu parantos aya pambayaranna teu tiasa dibatalkeun; batalkeun heula kwitansina (kacatet jeung alesanna, sesa tagihan balik). Parobahan tarif, keringanan, atawa denda teu ngarobah tagihan nu parantos dijieun, sarta nominal denda dikonci waktu tagihan dendana dijieun.',
          },
        ],
      },
    },
  },
  {
    slug: 'admissions',
    icon: 'clipboard',
    tone: 'rose',
    module: 'admissions',
    text: {
      id: {
        title: 'SPMB: penerimaan murid baru',
        summary:
          'Buka periode pendaftaran, bagikan formulir publik, tinjau berkas, putuskan penerimaan, lalu daftarkan sebagai siswa.',
        sections: [
          {
            heading: 'Membuat periode pendaftaran',
            body: 'Periode menentukan jadwal, tingkat, tahun ajaran, dan kuota. Calon murid hanya bisa mendaftar saat periode berstatus aktif dan hari ini berada di antara tanggal buka dan tutup.',
            steps: [
              'Buka Periode SPMB (perlu izin kelola SPMB), lalu klik Tambah periode.',
              'Isi nama, tingkat, tahun ajaran, tanggal buka, dan tanggal tutup.',
              'Isi kuota, atau kosongkan bila tanpa batas.',
              'Biarkan Aktif tercentang, lalu simpan.',
            ],
            href: '/admissions/periods',
          },
          {
            heading: 'Formulir publik dan jenis dokumen',
            body: 'Tautan pendaftaran publik (halaman /apply di alamat sekolah) dapat disalin, dibuka, atau dicetak sebagai poster berkode QR dari halaman Periode SPMB. Pendaftar tanpa akun mengisi data calon murid dan wali, mengunggah dokumen (PDF, JPG, atau PNG, maksimal 2 MB per berkas), lalu menerima nomor pendaftaran dan kode pelacakan untuk cek status di /apply/status. Jenis dokumen yang diminta, dan mana yang wajib, diatur di kartu Jenis dokumen pendaftaran.',
            href: '/admissions/periods',
          },
          {
            heading: 'Meninjau dan memutuskan',
            body: 'Halaman SPMB menampilkan statistik, pendaftar 14 hari terakhir, dan kuota terpakai. Buka satu pendaftar untuk melihat data, dokumen, dan linimasa statusnya.',
            steps: [
              'Buka SPMB, saring menurut periode, status, atau cari nama, nomor, atau wali.',
              'Buka pendaftar, periksa data dan pratinjau dokumennya.',
              'Pilih Verifikasi bila berkas lengkap dan benar.',
              'Pilih Terima atau Tolak; catatan keputusan terlihat oleh pendaftar saat cek status.',
              'Untuk banyak pendaftar sekaligus, centang barisnya lalu pakai Aksi massal.',
            ],
            href: '/admissions',
          },
          {
            heading: 'Mendaftarkan sebagai siswa',
            body: 'Pendaftar yang berstatus Diterima dapat dipilih Daftarkan sebagai siswa. Data pendaftar dibuat menjadi siswa beserta walinya dalam satu langkah, dengan pilihan menempatkannya di kelas pada tahun ajaran aktif; statusnya menjadi Terdaftar dan ada tautan ke daftar siswa.',
            href: '/admissions',
          },
          {
            heading: 'Yang perlu diperhatikan',
            body: 'Status mengikuti alur: Masuk, Diverifikasi, Diterima, Terdaftar. Ditolak hanya bisa dibuka kembali ke Diverifikasi, dan Terdaftar atau Mundur tidak bisa diubah lagi. Menerima pendaftar ditolak bila kuota periode penuh (kuota terpakai = diterima + terdaftar), pendaftaran sebagai siswa gagal bila NISN sudah dipakai siswa lain, dan periode atau jenis dokumen yang sudah punya pendaftar tidak bisa dihapus, hanya dinonaktifkan. Kode pelacakan hanya tampil sekali kepada pendaftar dan tidak bisa ditampilkan ulang.',
          },
        ],
      },
      en: {
        title: 'Admissions: new student intake',
        summary:
          'Open an application period, share the public form, review files, decide, then enrol applicants as students.',
        sections: [
          {
            heading: 'Creating an application period',
            body: 'A period sets the schedule, level, academic year, and quota. Applicants can only apply while the period is active and today falls between its open and close dates.',
            steps: [
              'Open Admission periods (needs the admissions manage permission), then click Add period.',
              'Fill in the name, level, academic year, open date, and close date.',
              'Set a quota, or leave it empty for no limit.',
              'Keep Active ticked, then save.',
            ],
            href: '/admissions/periods',
          },
          {
            heading: 'Public form and document types',
            body: 'The public application link (the /apply page on the school address) can be copied, opened, or printed as a poster with a QR code from the Admission periods page. Applicants need no account: they fill in the student and guardian details, upload documents (PDF, JPG, or PNG, up to 2 MB each), then receive a registration number and tracking code to check status at /apply/status. The documents requested, and which are required, are set in the Application document types card.',
            href: '/admissions/periods',
          },
          {
            heading: 'Reviewing and deciding',
            body: 'The Admissions page shows statistics, applicants of the last 14 days, and quota used. Open an applicant to see their data, documents, and status timeline.',
            steps: [
              'Open Admissions and filter by period or status, or search by name, number, or guardian.',
              'Open an applicant and check the data and document previews.',
              'Choose Verify when the files are complete and correct.',
              'Choose Accept or Reject; the decision note is visible to the applicant when checking status.',
              'For many applicants at once, tick their rows and use Bulk action.',
            ],
            href: '/admissions',
          },
          {
            heading: 'Enrolling as a student',
            body: 'An applicant with the Accepted status can be enrolled with Enrol as student. The applicant data becomes a student and guardian in one step, optionally placed in a class of the active academic year; the status becomes Enrolled and a link to the student list appears.',
            href: '/admissions',
          },
          {
            heading: 'Things to keep in mind',
            body: 'Status follows the flow: Submitted, Verified, Accepted, Enrolled. A Rejected application can only be reopened to Verified, and Enrolled or Withdrawn cannot be changed again. Accepting is refused when the period quota is full (quota used = accepted + enrolled), enrolling fails if the NISN already belongs to another student, and a period or document type that already has applicants cannot be deleted, only deactivated. The tracking code is shown to the applicant only once and cannot be shown again.',
          },
        ],
      },
      su: {
        title: 'SPMB: panarimaan murid anyar',
        summary:
          'Buka periode pendaptaran, bagikeun formulir umum, pariksa berkas, putuskeun panarimaan, tuluy daptarkeun jadi siswa.',
        sections: [
          {
            heading: 'Nyieun periode pendaptaran',
            body: 'Periode nangtukeun jadwal, jenjang, tahun ajaran, jeung kuota. Calon murid ngan tiasa ndaptar waktu periodena aktif jeung poé ieu aya di antara tanggal buka jeung tutup.',
            steps: [
              'Buka Periode SPMB (peryogi idin ngokolakeun SPMB), tuluy klik Tambah periode.',
              'Eusian nami, jenjang, tahun ajaran, tanggal buka, jeung tanggal tutup.',
              'Eusian kuota, atawa kosongkeun lamun taya wates.',
              'Sina Aktif tetep dicentang, tuluy simpen.',
            ],
            href: '/admissions/periods',
          },
          {
            heading: 'Formulir umum jeung jenis dokumen',
            body: 'Tautan pendaptaran umum (kaca /apply di alamat sakola) tiasa disalin, dibuka, atawa dicitak jadi poster kode QR tina kaca Periode SPMB. Pendaptar teu peryogi akun: ngeusian data calon murid jeung wali, ngunggah dokumen (PDF, JPG, atawa PNG, paling ageung 2 MB sabiji), tuluy narima nomer pendaptaran jeung kode palacakan pikeun mariksa status di /apply/status. Dokumen nu dipénta, jeung nu wajib, diatur dina kartu Jenis dokumen pendaptaran.',
            href: '/admissions/periods',
          },
          {
            heading: 'Mariksa jeung mutuskeun',
            body: 'Kaca SPMB mintonkeun statistik, pendaptar 14 poé katukang, jeung kuota nu parantos kapake. Buka hiji pendaptar pikeun ningali data, dokumen, jeung linimasa statusna.',
            steps: [
              'Buka SPMB, saring ku periode atawa status, atawa golédah nami, nomer, atawa wali.',
              'Buka pendaptar, pariksa data jeung pratinjau dokumenna.',
              'Pilih Verifikasi lamun berkasna lengkep jeung leres.',
              'Pilih Tampi atawa Tolak; catetan kaputusan katingali ku pendaptar waktu mariksa status.',
              'Pikeun seueur pendaptar sakaligus, centang barisna tuluy pake Aksi massal.',
            ],
            href: '/admissions',
          },
          {
            heading: 'Ndaptarkeun jadi siswa',
            body: 'Pendaptar nu statusna Ditampi tiasa dipilih Daptarkeun jadi murid. Data pendaptar dijieun jadi siswa sarta walina dina sakali lengkah, bisa ditempatkeun di kelas dina tahun ajaran aktif; statusna jadi Kadaptar jeung aya tautan ka daptar siswa.',
            href: '/admissions',
          },
          {
            heading: 'Nu kedah diperhatikeun',
            body: 'Status nuturkeun alur: Asup, Diverifikasi, Ditampi, Kadaptar. Nu Ditolak ngan tiasa dibuka deui ka Diverifikasi, sarta Kadaptar atawa Mundur teu tiasa dirobah deui. Nampi pendaptar ditolak lamun kuota periode pinuh (kuota kapake = ditampi + kadaptar), ndaptarkeun jadi siswa gagal lamun NISN parantos dipake siswa sanes, sarta periode atawa jenis dokumen nu parantos aya pendaptarna teu tiasa dihapus, ngan tiasa dinonaktifkeun. Kode palacakan ngan mucunghul sakali ka pendaptar sarta teu tiasa dipintonkeun deui.',
          },
        ],
      },
    },
  },
  {
    slug: 'letters',
    icon: 'file',
    tone: 'sky',
    module: 'administration',
    text: {
      id: {
        title: 'Administrasi surat',
        summary:
          'Susun surat keluar bernomor otomatis dengan tanda tangan QR, catat surat masuk, kelola penandatangan dan templat.',
        sections: [
          {
            heading: 'Surat keluar',
            body: 'Surat keluar disusun dari templat atau ditulis sendiri, dengan pratinjau kertas A4. Nomor dibuat otomatis berurutan per tahun saat draf pertama kali disimpan, dan draf masih bisa diubah atau dihapus.',
            steps: [
              'Buka Surat, lalu klik Surat keluar baru.',
              'Pilih templat (atau tanpa templat) dan siswa bila perlu; pengganti seperti {{nama}}, {{nis}}, dan {{kelas}} terisi otomatis.',
              'Isi penerima, tanggal, dan isi surat, lalu simpan draf.',
              'Buka detail surat, klik Tandatangani, lalu konfirmasi; PDF berkode QR langsung diunduh.',
            ],
            href: '/letters',
          },
          {
            heading: 'Surat masuk dan disposisi',
            body: 'Di tab Surat masuk, catat surat yang diterima sekolah. Nomor agenda dibuat otomatis, dan Anda dapat mengisi nomor dari pengirim, ringkasan isi, dan catatan disposisi. Surat masuk boleh diubah kapan saja.',
            href: '/letters',
          },
          {
            heading: 'Penandatangan',
            body: 'Hanya anggota yang terdaftar sebagai penandatangan dan berizin menandatangani yang dapat menandatangani surat. Tanda tangan digambar atau diunggah (PNG atau JPG, otomatis diperkecil hingga maksimal 150 KB) oleh penandatangan sendiri dan hanya dipakai pada surat yang ia tandatangani.',
            steps: [
              'Buka Penandatangan (pengelola surat atau penandatangan).',
              'Pengelola: Tambah penandatangan, pilih anggota sekolah, isi nama pada surat dan jabatan.',
              'Penandatangan: buka kartu Tanda tangan saya, gambar atau unggah tanda tangan, lalu simpan.',
            ],
            href: '/letters/signers',
          },
          {
            heading: 'Templat dan format nomor',
            body: 'Templat berupa kerangka surat atau sertifikat dengan pengganti data. Bila belum ada templat, klik Pasang templat bawaan (surat keterangan siswa aktif, surat panggilan orang tua, sertifikat). Kartu Format nomor mengatur kode sekolah dan pola nomor surat keluar serta nomor agenda; pola wajib memuat urutan.',
            href: '/letters/templates',
          },
          {
            heading: 'Yang perlu diperhatikan',
            body: 'Surat yang sudah ditandatangani tidak bisa diubah atau dihapus, hanya dicabut dengan alasan (halaman verifikasi lalu menampilkan status dicabut). Setiap surat bertanda tangan punya tautan dan QR yang dapat diperiksa siapa pun tanpa login, tetapi halaman itu tidak menampilkan isi surat. Mencetak ulang PDF menghasilkan berkas yang tidak identik, sehingga pencocokan berkas di halaman verifikasi hanya berlaku untuk PDF yang diunduh pertama kali. Penandatangan atau templat yang sudah dipakai surat tidak bisa dihapus, hanya dinonaktifkan; perubahan format nomor hanya berlaku untuk surat berikutnya.',
          },
        ],
      },
      en: {
        title: 'Letter administration',
        summary:
          'Compose outgoing letters with automatic numbers and a QR signature, log incoming letters, and manage signers and templates.',
        sections: [
          {
            heading: 'Outgoing letters',
            body: 'Outgoing letters are composed from a template or written freely, with an A4 paper preview. The number is generated automatically in order per year when the draft is first saved, and a draft can still be edited or deleted.',
            steps: [
              'Open Letters, then click New outgoing letter.',
              'Choose a template (or none) and a student if needed; placeholders such as {{nama}}, {{nis}}, and {{kelas}} fill in automatically.',
              'Fill in the recipient, date, and body, then save the draft.',
              'Open the letter detail, click Sign, then confirm; the QR-coded PDF downloads right away.',
            ],
            href: '/letters',
          },
          {
            heading: 'Incoming letters and dispositions',
            body: 'In the Incoming letters tab, log letters the school receives. The agenda number is generated automatically, and you can enter the sender number, a summary, and a disposition note. Incoming letters can be edited at any time.',
            href: '/letters',
          },
          {
            heading: 'Signers',
            body: 'Only members registered as signers and allowed to sign can sign letters. The signature is drawn or uploaded (PNG or JPG, automatically reduced to at most 150 KB) by the signer personally and is used only on letters that person signs.',
            steps: [
              'Open Signers (letter managers or signers).',
              'Manager: Add signer, pick a school member, and fill in the name on letters and the title.',
              'Signer: open the My signature card, draw or upload the signature, then save.',
            ],
            href: '/letters/signers',
          },
          {
            heading: 'Templates and number format',
            body: 'A template is a letter or certificate skeleton with data placeholders. If none exist yet, click Install default templates (active student certificate, parent summons, certificate). The Number format card sets the school code and the pattern for outgoing letter numbers and agenda numbers; the pattern must include the sequence.',
            href: '/letters/templates',
          },
          {
            heading: 'Things to keep in mind',
            body: 'A signed letter cannot be edited or deleted, only revoked with a reason (the verification page then shows it as revoked). Every signed letter has a link and QR that anyone can check without logging in, but that page does not show the letter content. Reprinting the PDF yields a non-identical file, so file matching on the verification page only holds for the PDF downloaded the first time. A signer or template already used by letters cannot be deleted, only deactivated; number format changes apply only to later letters.',
          },
        ],
      },
      su: {
        title: 'Administrasi surat',
        summary:
          'Susun surat kaluar nu nomerna otomatis jeung tanda tangan QR, catet surat asup, kokolakeun panandatangan jeung citakan.',
        sections: [
          {
            heading: 'Surat kaluar',
            body: 'Surat kaluar disusun tina citakan atawa ditulis sorangan, jeung pratinjau kertas A4. Nomerna dijieun otomatis berurutan per taun waktu draf mimiti disimpen, sarta draf masih tiasa dirobah atawa dihapus.',
            steps: [
              'Buka Surat, tuluy klik Surat kaluar anyar.',
              'Pilih citakan (atawa tanpa citakan) jeung siswa upami peryogi; panggantos saperti {{nama}}, {{nis}}, jeung {{kelas}} kaeusi otomatis.',
              'Eusian panarima, tanggal, jeung eusi surat, tuluy simpen draf.',
              'Buka rincian surat, klik Tandatanganan, tuluy konfirmasi; PDF kode QR langsung diunduh.',
            ],
            href: '/letters',
          },
          {
            heading: 'Surat asup jeung disposisi',
            body: 'Dina tab Surat asup, catet surat nu ditarima ku sakola. Nomer agenda dijieun otomatis, sarta tiasa ngeusian nomer ti nu ngirim, ringkesan eusi, jeung catetan disposisi. Surat asup tiasa dirobah iraha waé.',
            href: '/letters',
          },
          {
            heading: 'Panandatangan',
            body: 'Ngan anggota nu kadaptar salaku panandatangan jeung gaduh idin nandatanganan nu tiasa nandatanganan surat. Tanda tangan digambar atawa diunggah (PNG atawa JPG, otomatis dialitkeun paling ageung 150 KB) ku panandatangan sorangan sarta ngan dipake dina surat nu ditandatanganan ku manehna.',
            steps: [
              'Buka Panandatangan (pangurus surat atawa panandatangan).',
              'Pangurus: Tambah panandatangan, pilih anggota sakola, eusian nami dina surat jeung jabatan.',
              'Panandatangan: buka kartu Tanda tangan abdi, gambar atawa unggah tanda tangan, tuluy simpen.',
            ],
            href: '/letters/signers',
          },
          {
            heading: 'Citakan jeung format nomer',
            body: 'Citakan nya éta kerangka surat atawa sertipikat jeung panggantos data. Upami acan aya citakan, klik Pasang citakan bawaan (surat katerangan siswa aktif, surat timbalan kolot, sertipikat). Kartu Format nomer ngatur kode sakola jeung pola nomer surat kaluar sarta nomer agenda; polana wajib ngandung urutan.',
            href: '/letters/templates',
          },
          {
            heading: 'Nu kedah diperhatikeun',
            body: 'Surat nu parantos ditandatanganan teu tiasa dirobah atawa dihapus, ngan tiasa dicabut jeung alesan (kaca verifikasi tuluy mintonkeun status dicabut). Unggal surat nu ditandatanganan gaduh tautan jeung QR nu tiasa dipariksa ku saha waé tanpa asup, tapi eta kaca teu mintonkeun eusi surat. Nyitak deui PDF ngahasilkeun berkas nu teu sarua, kituna pamariksaan berkas di kaca verifikasi ngan mangpaat pikeun PDF nu diunduh pangmimitina. Panandatangan atawa citakan nu parantos dipake surat teu tiasa dihapus, ngan tiasa dinonaktifkeun; parobahan format nomer ngan ngalarapkeun surat saterusna.',
          },
        ],
      },
    },
  },
  {
    slug: 'announcements',
    icon: 'megaphone',
    tone: 'violet',
    module: 'announcements',
    text: {
      id: {
        title: 'Pengumuman dan agenda',
        summary: 'Tulis berita, agenda, dan pemberitahuan untuk situs sekolah, portal wali, dan staf.',
        sections: [
          {
            heading: 'Menulis pengumuman',
            body: 'Pengumuman punya kategori Berita, Agenda, atau Pemberitahuan. Isi berupa teks biasa; paragraf dipisah satu baris kosong dan tag HTML ditolak.',
            steps: [
              'Buka Pengumuman (perlu izin kelola pengumuman), lalu klik Tulis pengumuman.',
              'Isi judul dan isi, lalu pilih kategori.',
              'Pilih audiens: Publik, Portal wali dan siswa, Staf, atau Semua.',
              'Untuk Agenda, isi tanggal acara. Isi Tampil sampai bila ada batas waktu.',
              'Centang Terbitkan sekarang untuk langsung terbit, atau biarkan kosong untuk disimpan sebagai draf.',
            ],
            href: '/announcements',
          },
          {
            heading: 'Siapa yang melihat',
            body: 'Publik tampil di situs sekolah tanpa login, Portal hanya di portal wali dan siswa, Staf hanya untuk guru dan staf (muncul di dasbor), dan Semua tampil di ketiganya. Tab Pratinjau menunjukkan tampilannya di situs sebelum disimpan.',
            href: '/announcements',
          },
          {
            heading: 'Menerbitkan, menyematkan, dan menarik',
            body: 'Dari daftar, gunakan Terbitkan atau Tarik ke draf, Sematkan agar tampil di bagian atas, Ubah, dan Hapus. Saringan status, kategori, dan audiens membantu mencari pengumuman.',
            href: '/announcements',
          },
          {
            heading: 'Yang perlu diperhatikan',
            body: 'Hanya pengumuman yang terbit dan belum lewat tanggal Tampil sampai yang terlihat orang lain. Agenda wajib punya tanggal acara, dan agenda mendatang tampil di bagian Agenda situs sekolah. Menghapus pengumuman bersifat permanen; bila hanya ingin menyembunyikan, tarik ke draf. Izin melihat dimiliki hampir semua peran sekolah, tetapi menulis dan mengubah hanya untuk peran dengan izin kelola pengumuman (admin dan operator).',
          },
        ],
      },
      en: {
        title: 'Announcements and agenda',
        summary:
          'Write news, agenda items, and notices for the school website, the parent portal, and staff.',
        sections: [
          {
            heading: 'Writing an announcement',
            body: 'An announcement is News, Agenda, or Notice. The body is plain text; separate paragraphs with one blank line, and HTML tags are rejected.',
            steps: [
              'Open Announcements (needs the announcement manage permission), then click Write announcement.',
              'Fill in the title and body, then choose the category.',
              'Choose the audience: Public, Parent and student portal, Staff, or All.',
              'For an Agenda item, set the event date. Set Show until if there is a deadline.',
              'Tick Publish now to publish right away, or leave it empty to save as a draft.',
            ],
            href: '/announcements',
          },
          {
            heading: 'Who sees it',
            body: 'Public shows on the school website without login, Portal only on the parent and student portal, Staff only for teachers and staff (shown on the dashboard), and All shows in all three. The Preview tab shows how it looks on the site before saving.',
            href: '/announcements',
          },
          {
            heading: 'Publishing, pinning, and withdrawing',
            body: 'From the list, use Publish or Return to draft, Pin to keep it at the top, Edit, and Delete. Status, category, and audience filters help you find announcements.',
            href: '/announcements',
          },
          {
            heading: 'Things to keep in mind',
            body: 'Only announcements that are published and not past their Show until date are visible to others. An agenda item must have an event date, and upcoming agenda items appear in the Agenda section of the school website. Deleting an announcement is permanent; to just hide it, return it to draft. Almost every school role can view, but writing and editing is only for roles with the announcement manage permission (admin and operator).',
          },
        ],
      },
      su: {
        title: 'Pengumuman jeung agenda',
        summary: 'Tulis warta, agenda, jeung béwara pikeun situs sakola, portal wali, jeung staf.',
        sections: [
          {
            heading: 'Nulis pengumuman',
            body: 'Pengumuman gaduh kategori Warta, Agenda, atawa Béwara. Eusina téks biasa; paragraf dipisahkeun ku hiji baris kosong, sarta tag HTML ditolak.',
            steps: [
              'Buka Pengumuman (peryogi idin ngokolakeun pengumuman), tuluy klik Tulis pengumuman.',
              'Eusian judul jeung eusi, tuluy pilih kategori.',
              'Pilih pamiarsa: Umum, Portal wali jeung siswa, Staf, atawa Sadayana.',
              'Pikeun Agenda, eusian tanggal acara. Eusian Mintonkeun dugi ka upami aya wates waktu.',
              'Centang Terbitkeun ayeuna pikeun langsung terbit, atawa kosongkeun pikeun disimpen jadi draf.',
            ],
            href: '/announcements',
          },
          {
            heading: 'Saha nu ningali',
            body: 'Umum mucunghul di situs sakola tanpa asup, Portal ngan di portal wali jeung siswa, Staf ngan pikeun guru jeung staf (mucunghul di dasbor), sarta Sadayana mucunghul di tiluanana. Tab Pratinjau mintonkeun tampilanna di situs saméméh disimpen.',
            href: '/announcements',
          },
          {
            heading: 'Nerbitkeun, nyémat, jeung narik',
            body: 'Tina daptar, paké Terbitkeun atawa Tarik ka draf, Sémat supaya aya di luhur, Robah, jeung Hapus. Saringan status, kategori, jeung pamiarsa mantuan milarian pengumuman.',
            href: '/announcements',
          },
          {
            heading: 'Nu kedah diperhatikeun',
            body: 'Ngan pengumuman nu parantos terbit jeung can lewat tanggal Mintonkeun dugi ka nu katingali ku batur. Agenda wajib gaduh tanggal acara, sarta agenda nu bakal datang mucunghul dina bagian Agenda situs sakola. Ngahapus pengumuman sipatna permanén; upami ngan hoyong nyumputkeun, tarik ka draf. Idin ningali aya dina ampir sadaya peran sakola, tapi nulis jeung ngarobah ngan pikeun peran nu gaduh idin ngokolakeun pengumuman (admin jeung operator).',
          },
        ],
      },
    },
  },
  {
    slug: 'messaging',
    icon: 'message',
    tone: 'emerald',
    module: 'messaging',
    text: {
      id: {
        title: 'Notifikasi WhatsApp',
        summary:
          'Hubungkan nomor WhatsApp sekolah, atur templat pesan, dan kirim kabar kehadiran, pembayaran, serta rapor ke wali.',
        sections: [
          {
            heading: 'Menghubungkan WhatsApp',
            body: 'Satu nomor WhatsApp dipakai untuk semua pesan sekolah. Di tab Koneksi, status tampil sebagai Terhubung, Menunggu pemindaian, Menyambung, Gagal, atau Terputus. Menghubungkan dan memutus butuh izin kelola pesan.',
            steps: [
              'Buka Notifikasi WhatsApp, tab Koneksi, lalu klik Hubungkan WhatsApp.',
              'Tunggu kode QR muncul (halaman memeriksa setiap 3 detik).',
              'Di ponsel nomor sekolah, buka WhatsApp, Perangkat tertaut, lalu Tautkan perangkat.',
              'Pindai kode QR; status berubah menjadi Terhubung dan nomor tampil.',
              'Kirim pesan uji ke nomor Anda untuk memastikan sambungan berfungsi. Klik Putuskan bila ingin memutus.',
            ],
            href: '/messaging',
          },
          {
            heading: 'Penyedia pesan',
            body: 'Penyedia pesan mengikuti pilihan platform Edusync, kecuali dikunci lewat variabel lingkungan MESSAGING_PROVIDER di server, yang lalu menimpa pilihan platform. Bila penyedia berupa mode uji (log), pesan hanya dicatat dan tidak dikirim; bila pengiriman dimatikan oleh pengelola platform, halaman memberi tahu dan WhatsApp tidak tersambung.',
            href: '/messaging',
          },
          {
            heading: 'Pengaturan dan templat pesan',
            body: 'Di tab Pengaturan, aktifkan notifikasi, tentukan jendela jam kirim, jeda acak antar-pesan, dan jam pengingat "belum tiba". Tiap peristiwa punya templat yang dapat diaktifkan sendiri-sendiri dan disisipi pengganti data (nama siswa, kelas, jam, jumlah, dan sebagainya), dengan pratinjau data contoh dan tombol Kembalikan ke bawaan.',
            href: '/messaging',
          },
          {
            heading: 'Peristiwa yang dikirim ke wali',
            body: 'Peristiwanya: siswa tiba dan pulang (dari tap kiosk gerbang), belum tiba (pada jam pengingat), bolos pelajaran (hadir di gerbang tetapi ditandai alpa di satu jam pelajaran), pembayaran diterima, tagihan jatuh tempo, dan rapor terbit. Pesan dikirim ke setiap nomor wali siswa yang valid (satu pesan per nomor unik), wali utama lebih dulu.',
            href: '/messaging',
          },
          {
            heading: 'Riwayat dan kirim ulang',
            body: 'Tab Riwayat menampilkan pesan dengan status Antre, Mengirim, Terkirim, Gagal, atau Dilewati; nomor tujuan disamarkan. Dapat disaring menurut status dan peristiwa. Pesan Gagal atau Dilewati dapat dikirim ulang dengan tombol Kirim ulang.',
            href: '/messaging',
          },
          {
            heading: 'Yang perlu diperhatikan',
            body: 'Pesan hanya dibuat bila saklar global platform, notifikasi sekolah, dan templat peristiwa itu semuanya aktif, serta wali punya nomor ponsel yang valid. Memakai WhatsApp tidak resmi dapat membuat nomor diblokir, jadi pakai nomor khusus sekolah, bukan nomor pribadi. Absensi, pembayaran, dan rapor tetap tersimpan walau pesan gagal dibuat; tap lama yang dikirim ulang dari kiosk offline tidak lagi diberitahukan.',
          },
        ],
      },
      en: {
        title: 'WhatsApp notifications',
        summary:
          'Connect the school WhatsApp number, set message templates, and send attendance, payment, and report card news to guardians.',
        sections: [
          {
            heading: 'Connecting WhatsApp',
            body: 'One WhatsApp number is used for all school messages. In the Connection tab the status shows as Connected, Waiting for scan, Connecting, Failed, or Disconnected. Connecting and disconnecting need the message manage permission.',
            steps: [
              'Open WhatsApp notifications, the Connection tab, then click Connect WhatsApp.',
              'Wait for the QR code to appear (the page checks every 3 seconds).',
              'On the phone of the school number, open WhatsApp, Linked devices, then Link a device.',
              'Scan the QR code; the status changes to Connected and the number is shown.',
              'Send a test message to your own number to confirm the connection works. Click Disconnect to disconnect.',
            ],
            href: '/messaging',
          },
          {
            heading: 'Message provider',
            body: 'The message provider follows the Edusync platform choice, unless it is locked by the MESSAGING_PROVIDER environment variable on the server, which then overrides the platform choice. In test mode (log) messages are only recorded, not sent; if sending is switched off by the platform operator, the page says so and WhatsApp does not connect.',
            href: '/messaging',
          },
          {
            heading: 'Settings and message templates',
            body: 'In the Settings tab, enable notifications, set the sending hours window, the random delay between messages, and the "not yet arrived" reminder time. Each event has a template that can be switched on separately and filled with data placeholders (student name, class, time, amount, and so on), with a sample-data preview and a Reset to default button.',
            href: '/messaging',
          },
          {
            heading: 'Events sent to guardians',
            body: 'The events are: student arrives and leaves (from gate kiosk taps), not yet arrived (at the reminder time), skipped class (present at the gate but marked absent in one lesson), payment received, invoice overdue, and report card published. A message goes to every valid guardian number of the student (one message per unique number), the primary guardian first.',
            href: '/messaging',
          },
          {
            heading: 'History and resending',
            body: 'The History tab lists messages with the status Queued, Sending, Sent, Failed, or Skipped; destination numbers are masked. You can filter by status and event. Failed or Skipped messages can be resent with the Resend button.',
            href: '/messaging',
          },
          {
            heading: 'Things to keep in mind',
            body: 'A message is only created when the platform global switch, the school notifications, and that event template are all on, and the guardian has a valid mobile number. Using unofficial WhatsApp can get the number blocked, so use a dedicated school number, not a personal one. Attendance, payments, and report cards are still saved even if a message cannot be created; old taps resent from an offline kiosk are no longer announced.',
          },
        ],
      },
      su: {
        title: 'Béwara WhatsApp',
        summary:
          'Sambungkeun nomer WhatsApp sakola, atur citakan pesen, tuluy kirim béwara kahadiran, pambayaran, jeung rapor ka wali.',
        sections: [
          {
            heading: 'Nyambungkeun WhatsApp',
            body: 'Hiji nomer WhatsApp dipake pikeun sadaya pesen sakola. Dina tab Sambungan, status mucunghul salaku Nyambung, Ngantosan pindai, Nyambungkeun, Gagal, atawa Peuntas. Nyambungkeun jeung peuntaskeun peryogi idin ngokolakeun pesen.',
            steps: [
              'Buka Béwara WhatsApp, tab Sambungan, tuluy klik Sambungkeun WhatsApp.',
              'Antosan kode QR mucunghul (kaca mariksa unggal 3 detik).',
              'Dina ponsel nomer sakola, buka WhatsApp, Parangkat tertaut, tuluy Tautkeun parangkat.',
              'Pindai kode QR; status robah jadi Nyambung sarta nomer katingali.',
              'Kirim pesen uji ka nomer anjeun pikeun mastikeun sambungan jalan. Klik Peuntaskeun upami hoyong peuntas.',
            ],
            href: '/messaging',
          },
          {
            heading: 'Panyadia pesen',
            body: 'Panyadia pesen nuturkeun pilihan platform Edusync, iwal dikonci ku variabel lingkungan MESSAGING_PROVIDER di server, nu tuluy meunangkeun luhur pilihan platform. Upami panyadiana mode uji (log), pesen ngan dicatet sarta teu dikirim; upami pangiriman dipareuman ku pangurus platform, kaca ngawartosan sarta WhatsApp teu nyambung.',
            href: '/messaging',
          },
          {
            heading: 'Pangaturan jeung citakan pesen',
            body: 'Dina tab Pangaturan, hurungkeun béwara, tangtukeun jandéla jam ngirim, jeda acak antar-pesen, jeung jam pangingét "acan sumping". Unggal kajadian gaduh citakan nu tiasa dihurungkeun sorangan-sorangan jeung disisipan panggantos data (nami siswa, kelas, jam, jumlah, jste.), jeung pratinjau data conto sarta tombol Balikkeun ka bawaan.',
            href: '/messaging',
          },
          {
            heading: 'Kajadian nu dikirim ka wali',
            body: 'Kajadianana: siswa sumping jeung mulih (tina tap kiosk gerbang), acan sumping (dina jam pangingét), bolos pelajaran (hadir di gerbang tapi ditandaan alpa dina hiji jam pelajaran), pambayaran ditarima, tagihan jatuh tempo, jeung rapor terbit. Pesen dikirim ka unggal nomer wali siswa nu valid (hiji pesen per nomer unik), wali utama heula.',
            href: '/messaging',
          },
          {
            heading: 'Riwayat jeung kirim deui',
            body: 'Tab Riwayat mintonkeun pesen jeung status Antre, Ngirim, Kakirim, Gagal, atawa Dileueut; nomer tujuan disamarkeun. Tiasa disaring ku status jeung kajadian. Pesen Gagal atawa Dileueut tiasa dikirim deui ku tombol Kirim deui.',
            href: '/messaging',
          },
          {
            heading: 'Nu kedah diperhatikeun',
            body: 'Pesen ngan dijieun upami saklar global platform, béwara sakola, jeung citakan kajadian eta sadayana hurung, sarta wali gaduh nomer ponsel nu valid. Maké WhatsApp teu resmi tiasa nyieun nomer diblokir, kituna paké nomer husus sakola, lain nomer pribadi. Absénsi, pambayaran, jeung rapor tetep kasimpen sanajan pesen gagal dijieun; tap lawas nu dikirim deui ti kiosk offline teu diwartosankeun deui.',
          },
        ],
      },
    },
  },
  {
    slug: 'parent-portal',
    icon: 'users',
    tone: 'teal',
    module: 'parent_portal',
    text: {
      id: {
        title: 'Portal wali dan siswa',
        summary:
          'Undang wali atau siswa agar dapat melihat kehadiran, nilai, tagihan, dan rapor lewat ponsel. Memerlukan modul Absensi.',
        sections: [
          {
            heading: 'Mengundang wali atau siswa',
            body: 'Undangan berupa tautan sekali pakai yang berlaku 14 hari untuk satu orang. Wali yang diundang harus sudah tercatat pada data siswa di halaman Siswa.',
            steps: [
              'Buka Akun portal (perlu izin kelola siswa), lalu cari siswa dengan nama, NIS, atau NISN.',
              'Pilih wali yang diundang, atau pilih siswa itu sendiri.',
              'Isi email bila ingin tautan juga dikirim ke email itu dan akunnya dikunci ke email tersebut (opsional).',
              'Klik Buat tautan, lalu salin dan kirim tautan ke orang yang diundang.',
            ],
            href: '/portal-admin',
          },
          {
            heading: 'Menerima undangan',
            body: 'Orang yang diundang membuka tautan, melihat nama sekolah dan siswa yang tertaut, lalu membuat akun dengan nama, email, dan kata sandi minimal 12 karakter. Bila emailnya sudah punya akun, cukup memasukkan kata sandinya untuk menautkan akun itu.',
          },
          {
            heading: 'Yang dilihat wali dan siswa',
            body: 'Wali melihat anak yang tertaut pada datanya; siswa hanya melihat dirinya. Beranda memuat kelas, kehadiran 30 hari terakhir, tunggakan, nilai terbaru, dan pengumuman portal; rincian per anak berisi tab Absensi, Nilai, Tagihan (beserta kwitansi), Rapor yang sudah final, Tahfidz, dan Kabar. Setiap bagian hanya aktif bila modulnya aktif di sekolah.',
          },
          {
            heading: 'Memantau dan mencabut',
            body: 'Halaman Akun portal menampilkan undangan (menunggu, dipakai, kedaluwarsa, dicabut) dan akun aktif. Undangan yang belum dipakai dapat dicabut, dan akun yang sudah dibuat dapat dicabut aksesnya; wali atau siswa bisa diundang ulang setelahnya.',
            href: '/portal-admin',
          },
          {
            heading: 'Yang perlu diperhatikan',
            body: 'Tautan undangan hanya tampil sekali setelah dibuat; bila hilang, buat undangan baru (undangan lama untuk orang yang sama otomatis dicabut). Mencabut akun menghapus tautan portal dan peran wali atau siswanya, dan bila tidak ada peran lain, orang itu tidak bisa masuk lagi; akun loginnya sendiri tidak dihapus. Rapor yang tampil hanya yang sudah final, dan tagihan memakai perhitungan keuangan sekolah.',
          },
        ],
      },
      en: {
        title: 'Parent and student portal',
        summary:
          'Invite guardians or students to view attendance, grades, invoices, and report cards on their phone. Requires the Attendance module.',
        sections: [
          {
            heading: 'Inviting a guardian or student',
            body: 'An invitation is a single-use link valid for 14 days for one person. The guardian must already be recorded on the student in the Students page.',
            steps: [
              'Open Portal accounts (needs the student manage permission), then find the student by name, student number, or NISN.',
              'Pick the guardian to invite, or the student themselves.',
              'Optionally enter an email to also send the link there and lock the account to that email.',
              'Click Create link, then copy it and send it to the invited person.',
            ],
            href: '/portal-admin',
          },
          {
            heading: 'Accepting an invitation',
            body: 'The invited person opens the link, sees the school and the linked student, then creates an account with a name, email, and a password of at least 12 characters. If the email already has an account, entering its password is enough to link it.',
          },
          {
            heading: 'What guardians and students see',
            body: 'A guardian sees the children linked to their record; a student sees only themselves. The home page shows the class, the last 30 days of attendance, arrears, the latest grades, and portal announcements; each child has tabs for Attendance, Grades, Invoices (with receipts), finalized Report cards, Tahfidz, and News. Each part is only active when its module is active at the school.',
          },
          {
            heading: 'Monitoring and revoking',
            body: 'The Portal accounts page lists invitations (pending, used, expired, revoked) and active accounts. An unused invitation can be revoked, and an existing account can have its access revoked; the guardian or student can be invited again afterwards.',
            href: '/portal-admin',
          },
          {
            heading: 'Things to keep in mind',
            body: 'The invitation link is shown only once after it is created; if it is lost, create a new one (older unused invitations for the same person are revoked automatically). Revoking an account removes the portal link and the guardian or student role, and if there is no other role the person can no longer sign in; the login account itself is not deleted. Only finalized report cards are shown, and invoices use the school finance calculation.',
          },
        ],
      },
      su: {
        title: 'Portal wali jeung siswa',
        summary:
          'Uleman wali atawa siswa supaya tiasa ningali kahadiran, nilai, tagihan, jeung rapor ngalangkungan ponsel. Peryogi modul Absénsi.',
        sections: [
          {
            heading: 'Ngauleman wali atawa siswa',
            body: 'Uleman mangrupa tautan sakali pake nu lumaku 14 poé pikeun hiji jalma. Wali nu diuleman kedah parantos kacatet dina data siswa di kaca Siswa.',
            steps: [
              'Buka Akun portal (peryogi idin ngokolakeun siswa), tuluy golédah siswa ku nami, NIS, atawa NISN.',
              'Pilih wali nu diuleman, atawa pilih siswa sorangan.',
              'Eusian email upami hoyong tautan oge dikirim ka email eta jeung akunna dikonci ka email eta (opsional).',
              'Klik Jieun tautan, tuluy salin sarta kirim tautan ka jalma nu diuleman.',
            ],
            href: '/portal-admin',
          },
          {
            heading: 'Narima uleman',
            body: 'Jalma nu diuleman muka tautan, ningali nami sakola jeung siswa nu tertaut, tuluy nyieun akun ku nami, email, jeung kecap sandi sahenteuna 12 karakter. Upami email eta parantos gaduh akun, cekap ngasupkeun kecap sandina pikeun nautkeun akun eta.',
          },
          {
            heading: 'Nu katingali ku wali jeung siswa',
            body: 'Wali ningali anak nu tertaut kana datana; siswa ngan ningali dirina. Béréndang ngandung kelas, kahadiran 30 poé katukang, tunggakan, nilai pangahirna, jeung pengumuman portal; rincian per anak ngandung tab Absénsi, Nilai, Tagihan (jeung kwitansi), Rapor nu parantos final, Tahfidz, jeung Warta. Unggal bagian ngan aktif upami modulna aktif di sakola.',
          },
          {
            heading: 'Mantau jeung nyabut',
            body: 'Kaca Akun portal mintonkeun uleman (ngantosan, dipake, kadaluwarsa, dicabut) jeung akun aktif. Uleman nu acan dipake tiasa dicabut, sarta akun nu parantos dijieun tiasa dicabut aksésna; wali atawa siswa tiasa diuleman deui saparantosna.',
            href: '/portal-admin',
          },
          {
            heading: 'Nu kedah diperhatikeun',
            body: 'Tautan uleman ngan mucunghul sakali saparantos dijieun; upami leungit, jieun uleman anyar (uleman lami nu acan dipake pikeun jalma nu sarua otomatis dicabut). Nyabut akun miceun tautan portal jeung peran wali atawa siswana, sarta upami teu aya peran sanes, jalma eta teu tiasa asup deui; akun login na sorangan teu dihapus. Rapor nu katingali ngan nu parantos final, sarta tagihan maké itungan kauangan sakola.',
          },
        ],
      },
    },
  },
  {
    slug: 'website',
    icon: 'globe',
    tone: 'slate',
    module: 'website',
    text: {
      id: {
        title: 'Website sekolah',
        summary: 'Atur profil situs publik sekolah, terbitkan, dan pasang domain milik sekolah sendiri.',
        sections: [
          {
            heading: 'Mengatur profil situs',
            body: 'Halaman Situs sekolah memuat pratinjau langsung tampilan beranda di ponsel. Perubahan baru berlaku setelah Anda menyimpannya. Halaman ini butuh izin kelola pengumuman.',
            steps: [
              'Buka Situs sekolah, lalu isi slogan dan pilih warna aksen (atau kode #RRGGBB).',
              'Isi Tentang sekolah, Visi, dan Misi (satu poin per baris).',
              'Isi kontak: alamat, telepon, email, WhatsApp, dan tautan peta http atau https.',
              'Klik Simpan perubahan.',
            ],
            href: '/site-settings',
          },
          {
            heading: 'Menerbitkan situs',
            body: 'Gunakan saklar Publikasikan situs untuk menerbitkan. Bila mati, alamat situs publik menampilkan bahwa situs tidak tersedia. Alamat situs dapat disalin atau dibuka dari halaman pengaturan.',
            href: '/site-settings',
          },
          {
            heading: 'Isi situs publik',
            body: 'Beranda menampilkan slogan, tentang, visi, misi, dan kontak dari profil, kabar dan agenda dari modul Pengumuman (audiens Publik atau Semua), serta tombol Daftar murid baru bila modul SPMB aktif dan ada periode yang dibuka. Tanpa modul Pengumuman, bagian kabar dan agenda kosong.',
          },
          {
            heading: 'Domain sendiri',
            body: 'Situs sekolah, pendaftaran SPMB, dan verifikasi surat dapat ditampilkan di domain milik sekolah, misalnya www.sekolahanda.sch.id, maksimal 3 domain. Perlu izin kelola sekolah.',
            steps: [
              'Buka Kelola domain dari halaman Situs sekolah, lalu isi nama domain tanpa http:// dan tanpa garis miring.',
              'Pasang dua catatan DNS yang ditampilkan di pengelola DNS domain: TXT verifikasi dan CNAME (atau A untuk domain utama).',
              'Tunggu DNS menyebar (beberapa menit hingga beberapa jam).',
              'Klik Periksa sekarang; status berubah menjadi Terverifikasi bila kedua catatan sesuai.',
            ],
            href: '/site-settings/domains',
          },
          {
            heading: 'Yang perlu diperhatikan',
            body: 'Domain sendiri hanya berlaku untuk situs publik, pendaftaran SPMB, dan verifikasi surat; dasbor dan halaman masuk tetap di alamat sekolah pada domain Edusync, yang juga tetap berfungsi setelah domain dihapus. Sertifikat HTTPS dipasang oleh server produksi. Bila pemeriksaan gagal, lihat rincian Diharapkan dan Ditemukan lalu perbaiki catatan DNS, dan periksa lagi kapan saja.',
          },
        ],
      },
      en: {
        title: 'School website',
        summary: 'Set up the public school site profile, publish it, and attach the school own domain.',
        sections: [
          {
            heading: 'Setting up the site profile',
            body: 'The School website page includes a live preview of the home page on a phone. Changes only take effect after you save. This page needs the announcement manage permission.',
            steps: [
              'Open School website, then fill in the tagline and pick an accent color (or a #RRGGBB code).',
              'Fill in About the school, Vision, and Mission (one point per line).',
              'Fill in contacts: address, phone, email, WhatsApp, and an http or https map link.',
              'Click Save changes.',
            ],
            href: '/site-settings',
          },
          {
            heading: 'Publishing the site',
            body: 'Use the Publish site switch to publish. When it is off, the public site address shows that the site is unavailable. The site address can be copied or opened from the settings page.',
            href: '/site-settings',
          },
          {
            heading: 'What the public site shows',
            body: 'The home page shows the tagline, about, vision, mission, and contacts from the profile, news and agenda from the Announcements module (Public or All audience), and a Register new students button when the Admissions module is active and a period is open. Without the Announcements module, the news and agenda parts are empty.',
          },
          {
            heading: 'Custom domain',
            body: 'The school website, admissions registration, and letter verification can be shown on a domain the school owns, for example www.yourschool.sch.id, up to 3 domains. This needs the school manage permission.',
            steps: [
              'Open Manage domains from the School website page, then enter the domain name without http:// and without a slash.',
              'Add the two DNS records shown in the DNS manager of the domain: the verification TXT and a CNAME (or A for a root domain).',
              'Wait for DNS to propagate (a few minutes to a few hours).',
              'Click Check now; the status becomes Verified when both records match.',
            ],
            href: '/site-settings/domains',
          },
          {
            heading: 'Things to keep in mind',
            body: 'A custom domain only applies to the public site, admissions registration, and letter verification; the dashboard and sign-in page stay at the school address on the Edusync domain, which also keeps working after a domain is removed. The HTTPS certificate is installed by the production server. If a check fails, read the Expected and Found details and fix the DNS records, and check again at any time.',
          },
        ],
      },
      su: {
        title: 'Situs sakola',
        summary: 'Atur profil situs umum sakola, terbitkeun, tuluy pasang domain milik sakola sorangan.',
        sections: [
          {
            heading: 'Ngatur profil situs',
            body: 'Kaca Situs sakola ngandung pratinjau langsung tampilan béréndang dina ponsel. Parobahan ngan lumaku saparantos disimpen. Kaca ieu peryogi idin ngokolakeun pengumuman.',
            steps: [
              'Buka Situs sakola, tuluy eusian slogan jeung pilih warna aksen (atawa kode #RRGGBB).',
              'Eusian Ngeunaan sakola, Visi, jeung Misi (hiji poin per baris).',
              'Eusian kontak: alamat, telepon, email, WhatsApp, jeung tautan peta http atawa https.',
              'Klik Simpen parobahan.',
            ],
            href: '/site-settings',
          },
          {
            heading: 'Nerbitkeun situs',
            body: 'Paké saklar Terbitkeun situs pikeun nerbitkeun. Upami pareum, alamat situs umum mintonkeun yén situs teu sayogi. Alamat situs tiasa disalin atawa dibuka tina kaca pangaturan.',
            href: '/site-settings',
          },
          {
            heading: 'Eusi situs umum',
            body: 'Béréndang mintonkeun slogan, ngeunaan, visi, misi, jeung kontak tina profil, warta jeung agenda tina modul Pengumuman (pamiarsa Umum atawa Sadayana), sarta tombol Daptar murid anyar upami modul SPMB aktif jeung aya periode nu kabuka. Tanpa modul Pengumuman, bagian warta jeung agenda kosong.',
          },
          {
            heading: 'Domain sorangan',
            body: 'Situs sakola, pendaptaran SPMB, jeung verifikasi surat tiasa dipintonkeun dina domain milik sakola, contona www.sakolaanjeun.sch.id, paling seueur 3 domain. Peryogi idin ngokolakeun sakola.',
            steps: [
              'Buka Kokolakeun domain tina kaca Situs sakola, tuluy eusian nami domain tanpa http:// jeung tanpa garis miring.',
              'Pasang dua catetan DNS nu dipintonkeun dina pangurus DNS domain: TXT verifikasi jeung CNAME (atawa A pikeun domain utama).',
              'Antosan DNS nyebar (sababaraha menit dugi ka sababaraha jam).',
              'Klik Pariksa ayeuna; status robah jadi Terverifikasi upami dua catetan eta cocog.',
            ],
            href: '/site-settings/domains',
          },
          {
            heading: 'Nu kedah diperhatikeun',
            body: 'Domain sorangan ngan lumaku pikeun situs umum, pendaptaran SPMB, jeung verifikasi surat; dasbor jeung kaca asup tetep di alamat sakola dina domain Edusync, nu oge tetep jalan saparantos domain dihapus. Sertipikat HTTPS dipasang ku server produksi. Upami pamariksaan gagal, tingali rincian Diarepkeun jeung Kapanggih tuluy benerkeun catetan DNS, sarta pariksa deui iraha waé.',
          },
        ],
      },
    },
  },
];
