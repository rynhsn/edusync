import type { DocArticle } from '@/lib/docs-types';

/** Panduan kerja panel sekolah per modul: keuangan, SPMB, surat, pengumuman, WhatsApp, portal, website. Isi: id, en, su. */
export const SERVICE_DOCS: DocArticle[] = [
  {
    slug: 'finance',
    icon: 'wallet',
    tone: 'amber',
    group: 'finance',
    module: 'finance',
    text: {
      id: {
        title: 'Keuangan: tagihan, kasir, dan laporan',
        summary:
          'Panduan bendahara: menyiapkan biaya dan tarif, membuat tagihan, menerima pembayaran di kasir, lalu memantau tunggakan dan denda.',
        forWho:
          'Bendahara dan Admin sekolah. Kepala sekolah dan Operator hanya dapat melihat tagihan dan laporan.',
        sections: [
          {
            heading: 'Menyiapkan jenis biaya dan tarif',
            body: 'Sebelum membuat tagihan, sekolah perlu mendaftarkan jenis biaya (misalnya SPP, uang gedung, seragam) dan berapa nominalnya. Jenis biaya bersifat Bulanan, Sekali bayar, atau Tahunan. Nominal diatur per tahun ajaran dan per tingkat. Bila ada tarif khusus satu tingkat, tarif itu dipakai lebih dulu daripada tarif "Semua tingkat".',
            steps: [
              'Buka menu Keuangan, lalu Jenis biaya & tarif.',
              'Klik Tambah jenis biaya, isi namanya, dan pilih sifatnya.',
              'Pilih Tahun ajaran, lalu klik Tambah tarif.',
              'Pilih jenis biaya dan tingkat, isi Nominal (Rupiah), lalu simpan. Ulangi untuk tingkat yang tarifnya berbeda.',
            ],
            tip: 'Mulailah dari satu jenis biaya, misalnya SPP bulanan, dan pastikan tarifnya benar sebelum menambah yang lain.',
            href: '/finance/settings',
          },
          {
            heading: 'Menentukan siapa yang ditagih (Berlaku untuk)',
            body: 'Setiap jenis biaya punya pilihan Berlaku untuk: Semua siswa, Kelas tertentu, atau Siswa tertentu. Saat Buat tagihan dijalankan, hanya siswa yang masuk sasaran yang ditagih. Siswa lain dihitung di hasil sebagai "Di luar sasaran" dan tidak dianggap kekurangan tarif.',
            steps: [
              'Buka Keuangan, Jenis biaya & tarif, lalu klik Tambah jenis biaya (atau Ubah pada jenis biaya yang ada).',
              'Pada Berlaku untuk, pilih Kelas tertentu lalu centang kelasnya, atau pilih Siswa tertentu lalu cari dan pilih siswanya.',
              'Simpan. Daftar jenis biaya menampilkan lencana cakupan dan ringkasan sasarannya.',
              'Di Kasir, setelah memilih siswa, jenis biaya yang berlaku untuknya tampil di bawah kartu siswa.',
            ],
            tip: 'Contoh: Renang cukup dipasang ke kelas yang mengikuti renang; Praktikum dipasang ke siswa tertentu saja.',
            warning:
              'Kelas sasaran dipilih dari tahun ajaran yang sedang dipilih. Di Buat tagihan, memilih kelas di luar sasaran jenis biaya akan menampilkan peringatan karena tidak ada siswa yang ditagih.',
            href: '/finance/settings',
          },
          {
            heading: 'Memberi keringanan atau beasiswa',
            body: 'Di halaman Jenis biaya & tarif, buat aturan potongan (persen atau nominal, untuk satu jenis biaya atau semua), lalu pasang ke satu kelas atau beberapa siswa tertentu. Potongan ini otomatis dipakai saat tagihan baru dibuat.',
            steps: [
              'Di kartu Keringanan dan beasiswa, klik Tambah aturan. Isi nama aturan, jenis potongan, dan besarnya.',
              'Pada bagian Pasang ke siswa, pilih aturan yang tadi dibuat.',
              'Pilih Lingkup: Satu kelas atau Siswa tertentu, lalu pilih kelas atau siswanya dan isi alasan.',
              'Klik Pasang, lalu baca hasil pemasangan.',
            ],
            warning:
              'Keringanan hanya berlaku untuk tagihan yang dibuat sesudahnya. Tagihan yang sudah ada tidak berubah.',
            href: '/finance/settings',
          },
          {
            heading: 'Membuat tagihan untuk satu kelas atau semua siswa',
            body: 'Tagihan dibuat untuk siswa aktif sesuai tarif tingkat kelasnya. Bila Anda menjalankannya dua kali untuk jenis biaya dan bulan yang sama, tagihan yang sudah ada dilewati sehingga tidak menjadi ganda.',
            steps: [
              'Buka menu Tagihan, pilih Tahun ajaran, lalu klik Buat tagihan.',
              'Pilih Jenis biaya. Untuk jenis Bulanan, pilih juga Periode (bulan dan tahunnya).',
              'Pilih Kelas bila hanya untuk satu kelas, atau biarkan Semua kelas.',
              'Isi Jatuh tempo.',
              'Untuk biaya yang bukan bulanan, Anda boleh memilih Cicilan 2 sampai 12 kali.',
              'Klik Buat tagihan, lalu baca hasilnya: dibuat, sudah ada (dilewati), tanpa tarif, atau tarif nol.',
            ],
            warning:
              'Tagihan dibuat sekaligus untuk banyak siswa. Periksa jenis biaya, kelas, dan bulan sebelum menekan tombol. Tagihan yang sudah ada pembayarannya tidak dapat dibatalkan.',
            href: '/finance/invoices',
          },
          {
            heading: 'Menerima pembayaran SPP di kasir',
            body: 'Satu kwitansi bisa melunasi beberapa tagihan milik satu siswa. Nomor kwitansi berurutan setiap tahun dan dapat diunduh sebagai PDF.',
            steps: [
              'Buka menu Kasir, lalu ketik nama atau NIS siswa (minimal 2 huruf) dan pilih siswanya.',
              'Centang tagihan yang dibayar. Untuk pembayaran sebagian, ubah Jumlah bayar.',
              'Pilih Metode dan Tanggal bayar. Isi Catatan bila perlu.',
              'Klik Terima pembayaran, periksa ringkasannya, lalu konfirmasi.',
              'Buka Riwayat pembayaran untuk melihat atau mengunduh kwitansi (PDF).',
            ],
            tip: 'Daftar metode bayar yang muncul di kasir dapat diatur di Jenis biaya & tarif, kartu Metode pembayaran.',
            warning:
              'Setelah dikonfirmasi, pembayaran langsung tercatat dan kwitansi terbit. Periksa nama siswa dan jumlahnya dulu.',
            href: '/finance',
          },
          {
            heading: 'Membatalkan pembayaran yang salah catat',
            body: 'Bila pembayaran tercatat pada siswa atau jumlah yang salah, batalkan pembayarannya. Tagihannya kembali menjadi belum dibayar, dan pembatalan tercatat beserta alasannya.',
            steps: [
              'Buka Kasir dan pilih siswa yang bersangkutan.',
              'Di Riwayat pembayaran, cari kwitansi yang salah.',
              'Klik Batalkan pembayaran, isi Alasan, lalu konfirmasi.',
              'Catat ulang pembayaran yang benar bila perlu.',
            ],
            warning:
              'Kwitansi yang dibatalkan tidak dapat dipakai lagi. Hanya Bendahara atau Admin sekolah yang dapat melakukannya.',
            href: '/finance',
          },
          {
            heading: 'Melihat tunggakan dan menerapkan denda',
            body: 'Menu Laporan keuangan punya tab Tunggakan (per siswa dan per kelas, pada tanggal yang Anda pilih), Kas harian (penerimaan per metode, jenis biaya, dan hari; rentang paling lama 366 hari), dan Denda. Tunggakan dan Kas harian dapat diekspor ke Excel atau PDF.',
            steps: [
              'Buka menu Laporan keuangan, lalu pilih tab yang dibutuhkan dan atur tanggalnya.',
              'Klik Ekspor Excel atau Ekspor PDF bila ingin menyimpan atau mencetak laporan.',
              'Untuk denda, buka tab Denda dan periksa tagihan yang kena denda.',
              'Klik Terapkan denda, lalu konfirmasi untuk menerbitkan tagihan denda.',
            ],
            warning:
              'Denda baru berlaku bila denda keterlambatan sudah diaktifkan di Jenis biaya & tarif. Nominal denda dibekukan saat tagihan denda dibuat, dan tidak berubah bila aturan denda diganti kemudian.',
            href: '/finance/reports',
          },
          {
            heading: 'Mengaktifkan pembayaran online (Midtrans)',
            body: 'Sekolah dapat menerima pembayaran tagihan secara online lewat akun Midtrans milik sekolah sendiri, dengan uang langsung masuk ke akun sekolah. Setelah diaktifkan, wali dan siswa dapat mencentang tagihan di portal lalu menekan Bayar online. Kwitansi tercatat otomatis saat Midtrans mengabarkan pembayaran berhasil.',
            steps: [
              'Daftar atau masuk ke dasbor Midtrans. Untuk mencoba, pakai mode Sandbox dulu.',
              'Di Midtrans, buka Settings, lalu Access Keys, kemudian salin Merchant ID, Client Key, dan Server Key.',
              'Di edusync, buka Keuangan, lalu Pembayaran online (Midtrans). Pilih Mode, isi Merchant ID, Client Key, dan Server Key, centang Aktifkan pembayaran online, lalu klik Simpan.',
              'Salin Alamat notifikasi pembayaran, lalu tempel di Midtrans pada Settings, Configuration, kolom Payment Notification URL, kemudian klik Update.',
              'Klik Uji koneksi. Bila berhasil, coba satu pembayaran kecil dari portal wali, lalu cek di menu Transaksi online.',
              'Setelah uji coba, ubah Mode menjadi Production dengan kunci production, lalu simpan lagi.',
            ],
            tip: 'Kunci Sandbox diawali SB-Mid- dan kunci Production diawali Mid-. Mode dan kunci harus cocok.',
            warning:
              'Server Key bersifat rahasia. Jangan dibagikan ke orang lain. Setelah tersimpan, kunci tidak ditampilkan lagi; kosongkan kolomnya bila ingin mempertahankan kunci yang ada.',
            href: '/finance/gateway',
          },
        ],
        faq: [
          {
            q: 'Pembayaran sudah dicatat tetapi tagihan masih belum lunas, kenapa?',
            a: 'Kemungkinan pembayaran dicatat sebagian, karena Jumlah bayar lebih kecil dari sisa tagihan. Statusnya menjadi Sebagian. Buka Kasir, pilih siswa itu lagi, lalu terima sisanya.',
          },
          {
            q: 'Saya salah memasukkan jumlah atau salah memilih siswa. Bagaimana memperbaikinya?',
            a: 'Buka Kasir, pilih siswa, lalu di Riwayat pembayaran klik Batalkan pembayaran pada kwitansi yang salah dan isi alasannya. Tagihan kembali terbuka. Setelah itu catat pembayaran yang benar.',
          },
          {
            q: 'Setelah Buat tagihan, ada siswa yang tidak mendapat tagihan. Kenapa?',
            a: 'Hasilnya menyebut jumlah siswa "tanpa tarif" atau "tarif nol". Artinya tarif untuk tingkat siswa itu belum diisi. Tambahkan tarifnya di Jenis biaya & tarif, lalu jalankan Buat tagihan lagi. Tagihan yang sudah ada dilewati, jadi tidak ganda.',
          },
          {
            q: 'Saya mengubah tarif, tetapi tagihan lama tidak ikut berubah. Kenapa?',
            a: 'Perubahan tarif, keringanan, atau denda hanya berlaku untuk tagihan yang dibuat sesudahnya. Untuk satu tagihan lama, buka daftar Tagihan lalu pilih Ubah tagihan.',
          },
          {
            q: 'Tagihan tidak bisa dibatalkan. Apa yang harus dilakukan?',
            a: 'Tagihan yang sudah ada pembayarannya memang tidak dapat dibatalkan. Batalkan dulu pembayarannya di Kasir (Riwayat pembayaran), lalu batalkan tagihannya.',
          },
        ],
      },
      en: {
        title: 'Finance: invoices, cashier, and reports',
        summary:
          'A guide for the treasurer: set up fees and rates, create invoices, receive payments at the cashier, then follow arrears and late fees.',
        forWho: 'Treasurer and School admin. The Principal and Operator can only view invoices and reports.',
        sections: [
          {
            heading: 'Setting up fee types and rates',
            body: 'Before creating invoices, the school needs to list its fee types (for example tuition, building fee, uniform) and their amounts. A fee type is Monthly, One-time, or Yearly. Amounts are set per academic year and per level. A rate for one level is used before the "All levels" rate.',
            steps: [
              'Open the Finance menu, then Fee types & rates.',
              'Click Add fee type, fill in the name, and choose its kind.',
              'Choose the Academic year, then click Add rate.',
              'Choose the fee type and level, fill in Amount (Rupiah), and save. Repeat for levels with a different rate.',
            ],
            tip: 'Start with one fee type, for example monthly tuition, and make sure its rates are right before adding others.',
            href: '/finance/settings',
          },
          {
            heading: 'Choosing who is billed (Applies to)',
            body: 'Every fee type has an Applies to option: All students, Specific classes, or Specific students. When Generate invoices runs, only students within the targets are billed. Everyone else is counted in the result as "Outside targets" and is not treated as a missing rate.',
            steps: [
              'Open Finance, Fee types & rates, then click Add fee type (or Edit on an existing one).',
              'Under Applies to, choose Specific classes and tick the classes, or choose Specific students and search for and select them.',
              'Save. The fee type list shows a scope badge and a summary of the targets.',
              'In the Cashier, once a student is chosen, the fee types that apply to them appear under the student card.',
            ],
            tip: 'Example: assign Swimming only to the classes that take swimming; assign Lab practicum to specific students only.',
            warning:
              'Target classes are picked from the selected academic year. In Generate invoices, choosing a class outside the fee type targets shows a warning because no student would be billed.',
            href: '/finance/settings',
          },
          {
            heading: 'Giving a discount or scholarship',
            body: 'On the Fee types & rates page, create a discount rule (percent or fixed amount, for one fee type or all), then assign it to a class or to specific students. The discount is used automatically when new invoices are created.',
            steps: [
              'In the Discounts and scholarships card, click Add rule. Fill in the rule name, discount type, and amount.',
              'In the Assign to students part, choose the rule you just created.',
              'Choose the Scope: One class or Specific students, pick the class or students, and give a reason.',
              'Click Assign, then read the result.',
            ],
            warning:
              'A discount only applies to invoices created after it is assigned. Existing invoices do not change.',
            href: '/finance/settings',
          },
          {
            heading: 'Creating invoices for one class or all students',
            body: 'Invoices are created for active students using the rate of their class level. If you run it twice for the same fee type and month, invoices that already exist are skipped, so nothing is duplicated.',
            steps: [
              'Open the Invoices menu, choose the Academic year, then click Generate invoices.',
              'Choose the Fee type. For a Monthly type, also choose the Period (month and year).',
              'Choose a Class for one class only, or leave All classes.',
              'Fill in the Due date.',
              'For fees that are not monthly, you may choose 2 to 12 installments.',
              'Click Generate invoices, then read the result: created, already existed (skipped), no rate, or zero rate.',
            ],
            warning:
              'Invoices are created for many students at once. Check the fee type, class, and month before pressing the button. An invoice that already has payments cannot be voided.',
            href: '/finance/invoices',
          },
          {
            heading: 'Receiving tuition payments at the cashier',
            body: 'One receipt can settle several invoices of one student. Receipt numbers run in order each year and can be downloaded as PDF.',
            steps: [
              'Open the Cashier menu, type the student name or student number (at least 2 letters), and pick the student.',
              'Tick the invoices being paid. For a partial payment, change the Payment amount.',
              'Choose the Method and Payment date. Add a Note if needed.',
              'Click Receive payment, check the summary, then confirm.',
              'Open Payment history to view or download the receipt (PDF).',
            ],
            tip: 'The payment methods shown at the cashier can be set in Fee types & rates, in the Payment methods card.',
            warning:
              'Once confirmed, the payment is recorded right away and a receipt is issued. Check the student name and the amount first.',
            href: '/finance',
          },
          {
            heading: 'Voiding a wrongly recorded payment',
            body: 'If a payment was recorded for the wrong student or the wrong amount, void the payment. The invoice goes back to unpaid, and the voiding is logged together with its reason.',
            steps: [
              'Open the Cashier and pick the student concerned.',
              'In Payment history, find the wrong receipt.',
              'Click Void payment, fill in the Reason, then confirm.',
              'Record the correct payment if needed.',
            ],
            warning: 'A voided receipt cannot be used again. Only the Treasurer or School admin can do this.',
            href: '/finance',
          },
          {
            heading: 'Checking arrears and applying late fees',
            body: 'The Financial reports menu has an Arrears tab (per student and per class, on the date you choose), a Daily cash tab (receipts by method, fee type, and day; up to 366 days), and a Late fees tab. Arrears and Daily cash can be exported to Excel or PDF.',
            steps: [
              'Open Financial reports, choose the tab you need, and set the dates.',
              'Click Export Excel or Export PDF to save or print the report.',
              'For late fees, open the Late fees tab and review the invoices that are overdue.',
              'Click Apply late fees, then confirm to issue the late fee invoices.',
            ],
            warning:
              'Late fees only apply once the late fee is switched on in Fee types & rates. The late fee amount is frozen when its invoice is created and does not change if the rule is changed later.',
            href: '/finance/reports',
          },
          {
            heading: 'Enabling online payments (Midtrans)',
            body: 'The school can accept invoice payments online through its own Midtrans account, with the money going straight to the school account. Once enabled, guardians and students can tick invoices in the portal and press Pay online. The receipt is recorded automatically when Midtrans reports a successful payment.',
            steps: [
              'Sign up or sign in to the Midtrans dashboard. To try it out, use Sandbox mode first.',
              'In Midtrans, open Settings, then Access Keys, and copy the Merchant ID, Client Key, and Server Key.',
              'In edusync, open Finance, then Online payments (Midtrans). Choose the Mode, fill in the Merchant ID, Client Key, and Server Key, tick Enable online payments, then click Save.',
              'Copy the Payment notification address and paste it in Midtrans under Settings, Configuration, in the Payment Notification URL field, then click Update.',
              'Click Test connection. If it works, try one small payment from a guardian portal, then check it in Online transactions.',
              'After testing, change the Mode to Production with the production keys and save again.',
            ],
            tip: 'Sandbox keys start with SB-Mid- and Production keys start with Mid-. The mode and the keys must match.',
            warning:
              'The Server Key is secret. Do not share it. Once saved it is never shown again; leave the field empty to keep the existing key.',
            href: '/finance/gateway',
          },
        ],
        faq: [
          {
            q: 'The payment is recorded but the invoice is still not paid off. Why?',
            a: 'The payment was probably partial, because the Payment amount was lower than the balance. The status becomes Partial. Open the Cashier, pick the student again, and receive the remainder.',
          },
          {
            q: 'I entered the wrong amount or picked the wrong student. How do I fix it?',
            a: 'Open the Cashier, pick the student, then in Payment history click Void payment on the wrong receipt and give a reason. The invoice opens again. Then record the correct payment.',
          },
          {
            q: 'After Generate invoices, some students got no invoice. Why?',
            a: 'The result lists students with "no rate" or "zero rate". It means the rate for that student level is not filled in. Add the rate in Fee types & rates, then run Generate invoices again. Existing invoices are skipped, so nothing is duplicated.',
          },
          {
            q: 'I changed a rate, but old invoices did not change. Why?',
            a: 'Changes to rates, discounts, or late fees only apply to invoices created afterwards. For a single old invoice, open the Invoices list and choose Edit invoice.',
          },
          {
            q: 'An invoice cannot be voided. What should I do?',
            a: 'An invoice that already has payments cannot be voided. First void its payment in the Cashier (Payment history), then void the invoice.',
          },
        ],
      },
      su: {
        title: 'Kauangan: tagihan, kasir, jeung laporan',
        summary:
          'Pituduh bendahara: nyiapkeun biaya jeung tarif, nyieun tagihan, narima pambayaran di kasir, tuluy mantau tunggakan jeung denda.',
        forWho:
          'Bendahara jeung Admin sakola. Kepala sakola jeung Operator ngan tiasa ningali tagihan jeung laporan.',
        sections: [
          {
            heading: 'Nyiapkeun jenis biaya jeung tarif',
            body: 'Samemeh nyieun tagihan, sakola kedah ngadaptarkeun jenis biaya (contona SPP, artos gedong, saragam) jeung nominalna. Jenis biaya sifatna Bulanan, Sakali bayar, atawa Taunan. Nominal diatur per tahun ajaran jeung per jenjang. Upami aya tarif husus hiji jenjang, tarif eta dipake heula tibatan tarif "Sadaya jenjang".',
            steps: [
              'Buka menu Kauangan, tuluy Jenis biaya & tarif.',
              'Klik Tambah jenis biaya, eusian namina, tuluy pilih sifatna.',
              'Pilih Tahun ajaran, tuluy klik Tambah tarif.',
              'Pilih jenis biaya jeung jenjang, eusian Nominal (Rupiah), tuluy simpen. Ulangan pikeun jenjang nu tarifna benten.',
            ],
            tip: 'Mimitian ku hiji jenis biaya, contona SPP bulanan, tuluy pastikeun tarifna bener samemeh nambihan nu sanes.',
            href: '/finance/settings',
          },
          {
            heading: 'Nangtukeun saha nu ditagih (Lumaku pikeun)',
            body: 'Unggal jenis biaya boga pilihan Lumaku pikeun: Sakabéh siswa, Kelas nu tangtu, atawa Siswa nu tangtu. Basa Jieun tagihan dijalankeun, ngan siswa nu asup sasaran nu ditagih. Siswa sejenna diitung dina hasil minangka "Di luar sasaran" jeung lain kakurangan tarif.',
            steps: [
              'Buka Kauangan, Jenis biaya & tarif, tuluy klik Tambah jenis biaya (atawa Robah dina jenis biaya nu aya).',
              'Dina Lumaku pikeun, pilih Kelas nu tangtu tuluy centang kelasna, atawa pilih Siswa nu tangtu tuluy pilarian jeung pilih siswana.',
              'Simpen. Daptar jenis biaya mintonkeun lencana cakupan jeung ringkesan sasaranna.',
              'Di Kasir, sanggeus milih siswa, jenis biaya nu lumaku pikeun manéhna tembong handapeun kartu siswa.',
            ],
            tip: 'Conto: Ngojay cukup dipasang ka kelas nu milu ngojay; Praktikum dipasang ka siswa nu tangtu wungkul.',
            warning:
              'Kelas sasaran dipilih tina taun ajaran nu keur dipilih. Dina Jieun tagihan, milih kelas di luar sasaran jenis biaya bakal mintonkeun peringatan sabab taya siswa nu ditagih.',
            href: '/finance/settings',
          },
          {
            heading: 'Masihan keringanan atawa beasiswa',
            body: 'Dina kaca Jenis biaya & tarif, jieun aturan potongan (persen atawa nominal, pikeun hiji jenis biaya atawa sadayana), tuluy pasang ka hiji kelas atawa sababaraha siswa nu tangtu. Potongan ieu otomatis dipake waktu tagihan anyar dijieun.',
            steps: [
              'Dina kartu Keringanan jeung beasiswa, klik Tambah aturan. Eusian nami aturan, jenis potongan, jeung gedéna.',
              'Dina bagian Pasang ka siswa, pilih aturan nu karak dijieun.',
              'Pilih Lingkup: Hiji kelas atawa Siswa nu tangtu, tuluy pilih kelas atawa siswana jeung eusian alesanna.',
              'Klik Pasang, tuluy baca hasil pamasanganna.',
            ],
            warning:
              'Keringanan ngan lumaku pikeun tagihan nu dijieun saparantos eta. Tagihan nu parantos aya teu robah.',
            href: '/finance/settings',
          },
          {
            heading: 'Nyieun tagihan pikeun hiji kelas atawa sadaya siswa',
            body: 'Tagihan dijieun pikeun siswa aktif numutkeun tarif jenjang kelasna. Upami dijalankeun dua kali pikeun jenis biaya jeung bulan nu sarua, tagihan nu parantos aya dileueut sangkan teu dobel.',
            steps: [
              'Buka menu Tagihan, pilih Tahun ajaran, tuluy klik Jieun tagihan.',
              'Pilih Jenis biaya. Pikeun jenis Bulanan, pilih oge Periode (bulan jeung taunna).',
              'Pilih Kelas upami ngan pikeun hiji kelas, atawa sina Sadaya kelas.',
              'Eusian Jatuh tempo.',
              'Pikeun biaya nu lain bulanan, tiasa milih Cicilan 2 dugi ka 12 kali.',
              'Klik Jieun tagihan, tuluy baca hasilna: dijieun, parantos aya (dileueut), tanpa tarif, atawa tarif nol.',
            ],
            warning:
              'Tagihan dijieun sakaligus pikeun seueur siswa. Pariksa jenis biaya, kelas, jeung bulan samemeh mencét tombol. Tagihan nu parantos aya pambayaranna teu tiasa dibatalkeun.',
            href: '/finance/invoices',
          },
          {
            heading: 'Narima pambayaran SPP di kasir',
            body: 'Hiji kwitansi tiasa ngalunasan sababaraha tagihan milik hiji siswa. Nomer kwitansi berurutan unggal taun jeung tiasa diunduh jadi PDF.',
            steps: [
              'Buka menu Kasir, tuluy ketik nami atawa NIS siswa (sahenteuna 2 hurup) jeung pilih siswana.',
              'Centang tagihan nu dibayar. Pikeun pambayaran sabagian, robah Jumlah bayar.',
              'Pilih Metode jeung Tanggal bayar. Eusian Catetan upami peryogi.',
              'Klik Tarima pambayaran, pariksa ringkesanna, tuluy konfirmasi.',
              'Buka Riwayat pambayaran pikeun ningali atawa ngaunduh kwitansi (PDF).',
            ],
            tip: 'Daptar cara mayar nu mucunghul di kasir tiasa diatur dina Jenis biaya & tarif, kartu Metode pambayaran.',
            warning:
              'Saparantos dikonfirmasi, pambayaran langsung kacatet jeung kwitansi terbit. Pariksa heula nami siswa jeung jumlahna.',
            href: '/finance',
          },
          {
            heading: 'Ngabatalkeun pambayaran nu salah dicatet',
            body: 'Upami pambayaran kacatet ka siswa atawa jumlah nu lepat, batalkeun pambayaranna. Tagihanna balik jadi acan dibayar, sarta pembatalanna kacatet jeung alesanna.',
            steps: [
              'Buka Kasir tuluy pilih siswa nu aya sangkutna.',
              'Dina Riwayat pambayaran, golédah kwitansi nu lepat.',
              'Klik Batalkeun pambayaran, eusian Alesan, tuluy konfirmasi.',
              'Catet deui pambayaran nu bener upami peryogi.',
            ],
            warning:
              'Kwitansi nu dibatalkeun teu tiasa dipake deui. Ngan Bendahara atawa Admin sakola nu tiasa ngalakukeunana.',
            href: '/finance',
          },
          {
            heading: 'Ningali tunggakan jeung nerapkeun denda',
            body: 'Menu Laporan kauangan gaduh tab Tunggakan (per siswa jeung per kelas, dina tanggal nu dipilih), Kas poéan (panarimaan per cara, jenis biaya, jeung poé; paling lami 366 poé), jeung Denda. Tunggakan jeung Kas poéan tiasa diékspor ka Excel atawa PDF.',
            steps: [
              'Buka Laporan kauangan, pilih tab nu dipikabutuh, tuluy atur tanggalna.',
              'Klik Ékspor Excel atawa Ékspor PDF upami hoyong nyimpen atawa nyitak laporan.',
              'Pikeun denda, buka tab Denda tuluy pariksa tagihan nu kakeunaan denda.',
              'Klik Terapkeun denda, tuluy konfirmasi pikeun nerbitkeun tagihan denda.',
            ],
            warning:
              'Denda ngan lumaku upami denda telat parantos dihurungkeun dina Jenis biaya & tarif. Nominal denda dikonci waktu tagihan dendana dijieun, sarta teu robah upami aturan denda diganti saparantosna.',
            href: '/finance/reports',
          },
          {
            heading: 'Ngaktipkeun pambayaran online (Midtrans)',
            body: 'Sakola tiasa nampi pambayaran tagihan sacara online ngalangkungan akun Midtrans milik sakola nyalira, kalayan artos langsung lebet ka akun sakola. Saparantos diaktipkeun, wali jeung siswa tiasa nyentang tagihan di portal tuluy mencét Bayar online. Kwitansi kacatet otomatis nalika Midtrans ngabarkeun pambayaran hasil.',
            steps: [
              'Daptar atawa lebet ka dasbor Midtrans. Pikeun nyobaan, paké mode Sandbox heula.',
              'Di Midtrans, buka Settings, tuluy Access Keys, tuluy salin Merchant ID, Client Key, jeung Server Key.',
              'Di edusync, buka Keuangan, tuluy Pambayaran online (Midtrans). Pilih Mode, eusian Merchant ID, Client Key, jeung Server Key, centang Aktipkeun pambayaran online, tuluy klik Simpen.',
              'Salin Alamat béwara pambayaran, tuluy tempelkeun dina Midtrans di Settings, Configuration, kolom Payment Notification URL, tuluy klik Update.',
              'Klik Uji sambungan. Upami hasil, cobian hiji pambayaran leutik tina portal wali, tuluy cek di menu Transaksi online.',
              'Saparantos nyobaan, robah Mode jadi Production kalayan konci production, tuluy simpen deui.',
            ],
            tip: 'Konci Sandbox diawalan SB-Mid- jeung konci Production diawalan Mid-. Mode jeung konci kudu cocog.',
            warning:
              'Server Key rahasia. Ulah dibagikeun ka batur. Saparantos kasimpen, konci teu bakal ditémbongkeun deui; kosongkeun kolomna upami hayang ngajaga konci nu aya.',
            href: '/finance/gateway',
          },
        ],
        faq: [
          {
            q: 'Pambayaran parantos kacatet tapi tagihan acan lunas, naha?',
            a: 'Kamungkinan pambayaran kacatet sabagian, margi Jumlah bayar langkung alit tibatan sesa tagihan. Statusna jadi Sabagian. Buka Kasir, pilih siswa eta deui, tuluy tarima sesana.',
          },
          {
            q: 'Abdi lepat ngasupkeun jumlah atawa lepat milih siswa. Kumaha ngabenerkeunana?',
            a: 'Buka Kasir, pilih siswa, tuluy dina Riwayat pambayaran klik Batalkeun pambayaran dina kwitansi nu lepat jeung eusian alesanna. Tagihan kabuka deui. Saparantosna catet pambayaran nu bener.',
          },
          {
            q: 'Saparantos Jieun tagihan, aya siswa nu teu meunang tagihan. Naha?',
            a: 'Hasilna nyebatkeun jumlah siswa "tanpa tarif" atawa "tarif nol". Hartosna tarif pikeun jenjang siswa eta acan dieusian. Tambihkeun tarifna dina Jenis biaya & tarif, tuluy jalankeun Jieun tagihan deui. Tagihan nu parantos aya dileueut, jadi teu dobel.',
          },
          {
            q: 'Abdi ngarobah tarif, tapi tagihan lami teu milu robah. Naha?',
            a: 'Parobahan tarif, keringanan, atawa denda ngan lumaku pikeun tagihan nu dijieun saparantosna. Pikeun hiji tagihan lami, buka daptar Tagihan tuluy pilih Robah tagihan.',
          },
          {
            q: 'Tagihan teu tiasa dibatalkeun. Naon nu kedah dilakukeun?',
            a: 'Tagihan nu parantos aya pambayaranna emang teu tiasa dibatalkeun. Batalkeun heula pambayaranna di Kasir (Riwayat pambayaran), tuluy batalkeun tagihanna.',
          },
        ],
      },
    },
  },
  {
    slug: 'admissions',
    icon: 'clipboard',
    tone: 'rose',
    group: 'finance',
    module: 'admissions',
    text: {
      id: {
        title: 'SPMB: penerimaan murid baru',
        summary:
          'Panduan panitia SPMB: membuka pendaftaran, membagikan tautan, memeriksa berkas, memutuskan penerimaan, lalu mendaftarkan sebagai siswa.',
        forWho: 'Admin sekolah dan Operator (panitia SPMB). Kepala sekolah dapat melihat data pendaftar.',
        sections: [
          {
            heading: 'Membuka periode pendaftaran',
            body: 'Periode menentukan jadwal, tingkat, tahun ajaran, dan kuota. Calon murid hanya dapat mendaftar bila periode berstatus Aktif dan hari ini berada di antara tanggal buka dan tanggal tutup.',
            steps: [
              'Buka menu SPMB, lalu Periode SPMB, dan klik Tambah periode.',
              'Isi nama periode, tingkat, tahun ajaran, Tanggal buka, dan Tanggal tutup.',
              'Isi Kuota, atau kosongkan bila tanpa batas.',
              'Biarkan Aktif tercentang, lalu simpan.',
            ],
            tip: 'Tanggal tutup sebaiknya diberi sedikit kelonggaran, supaya calon murid yang mendaftar di hari terakhir tidak tertolak.',
            href: '/admissions/periods',
          },
          {
            heading: 'Membagikan tautan dan mengatur dokumen yang diminta',
            body: 'Calon murid mendaftar dari ponsel lewat halaman pendaftaran publik sekolah, tanpa perlu akun. Mereka mengisi data calon murid dan wali, mengunggah dokumen (PDF, JPG, atau PNG, paling besar 2 MB per berkas), lalu menerima nomor pendaftaran dan kode untuk mengecek status. Kode QR adalah gambar kotak-kotak yang dapat dipindai kamera ponsel untuk membuka halaman tertentu.',
            steps: [
              'Buka Periode SPMB, lalu lihat kartu Tautan pendaftaran publik.',
              'Klik Salin untuk mengirim tautan lewat pesan, atau Cetak poster untuk poster berkode QR.',
              'Pada kartu Jenis dokumen pendaftaran, tambahkan dokumen yang diminta dan tandai mana yang Wajib.',
            ],
            tip: 'Klik Buka halaman untuk melihat formulir seperti yang dilihat calon murid sebelum tautannya dibagikan.',
            href: '/admissions/periods',
          },
          {
            heading: 'Memeriksa berkas dan memutuskan penerimaan',
            body: 'Halaman SPMB menampilkan jumlah pendaftar per status, grafik pendaftar 14 hari terakhir, dan kuota yang terpakai. Buka satu pendaftar untuk melihat data, dokumen, dan riwayat statusnya. Alurnya: Masuk, Diverifikasi, lalu Diterima atau Ditolak.',
            steps: [
              'Buka menu SPMB. Saring menurut periode atau status, atau cari nama, nomor, atau wali.',
              'Buka seorang pendaftar, lalu periksa data dan Pratinjau dokumennya.',
              'Klik Verifikasi bila berkas lengkap dan benar.',
              'Klik Terima atau Tolak. Isi Catatan keputusan bila perlu.',
              'Untuk banyak pendaftar sekaligus, centang barisnya lalu pakai Aksi massal.',
            ],
            warning:
              'Catatan keputusan dapat dibaca pendaftar saat mengecek status, jadi tulis dengan sopan dan jelas. Pendaftar yang Terdaftar atau Mundur tidak dapat diubah lagi.',
            href: '/admissions',
          },
          {
            heading: 'Mendaftarkan pendaftar yang diterima sebagai siswa',
            body: 'Pendaftar berstatus Diterima dapat dijadikan siswa. Data calon murid dan walinya langsung dibuat di daftar siswa, dan Anda dapat menempatkannya di kelas pada tahun ajaran aktif.',
            steps: [
              'Buka pendaftar yang berstatus Diterima.',
              'Klik Daftarkan sebagai siswa.',
              'Pilih Kelas, atau pilih Tanpa kelas dulu bila belum ditentukan.',
              'Konfirmasi. Statusnya menjadi Terdaftar dan muncul tombol Buka daftar siswa.',
            ],
            warning:
              'Setelah Terdaftar, status tidak dapat diubah lagi. Pendaftaran gagal bila NISN calon murid sudah dipakai siswa lain.',
            href: '/admissions',
          },
        ],
        faq: [
          {
            q: 'Calon murid mengatakan tidak bisa mendaftar. Apa yang harus diperiksa?',
            a: 'Buka Periode SPMB. Pastikan periodenya Aktif, hari ini berada di antara Tanggal buka dan Tanggal tutup, dan kuota belum penuh. Bila belum ada periode yang dibuka, formulir tidak tersedia.',
          },
          {
            q: 'Saya klik Terima, tetapi ditolak. Kenapa?',
            a: 'Kuota periode sudah penuh. Kuota yang terpakai adalah jumlah pendaftar Diterima ditambah Terdaftar. Buka Periode SPMB, pilih Ubah pada periodenya, lalu naikkan Kuota.',
          },
          {
            q: 'Pendaftar yang sudah ditolak ternyata layak diterima. Bisakah dibuka lagi?',
            a: 'Bisa. Pendaftar yang Ditolak dapat dibuka kembali ke Diverifikasi lewat aksi Buka kembali (verifikasi ulang). Setelah itu Anda dapat memilih Terima.',
          },
          {
            q: 'Wali lupa kode untuk mengecek status. Bagaimana?',
            a: 'Kode itu hanya tampil sekali saat mendaftar dan tidak bisa ditampilkan lagi. Cari nama atau nomor pendaftarannya di halaman SPMB, lalu sampaikan statusnya kepada wali.',
          },
          {
            q: 'Daftarkan sebagai siswa gagal. Apa penyebabnya?',
            a: 'Biasanya NISN calon murid sudah dipakai oleh siswa lain. Periksa data di daftar siswa dan pastikan NISN pendaftar sudah benar.',
          },
        ],
      },
      en: {
        title: 'Admissions: new student intake',
        summary:
          'A guide for the admissions committee: open applications, share the link, review files, decide, and enrol applicants as students.',
        forWho:
          'School admin and Operator (the admissions committee). The Principal can view applicant data.',
        sections: [
          {
            heading: 'Opening an application period',
            body: 'A period sets the schedule, level, academic year, and quota. Applicants can only apply while the period is Active and today falls between the open date and the close date.',
            steps: [
              'Open the Admissions menu, then Admission periods, and click Add period.',
              'Fill in the period name, level, academic year, Open date, and Close date.',
              'Fill in the Quota, or leave it empty for no limit.',
              'Keep Active ticked, then save.',
            ],
            tip: 'Give the close date a little slack, so applicants who register on the last day are not turned away.',
            href: '/admissions/periods',
          },
          {
            heading: 'Sharing the link and setting the documents asked for',
            body: 'Applicants register from their phone on the public application page of the school, with no account needed. They fill in the student and guardian details, upload documents (PDF, JPG, or PNG, up to 2 MB each), then receive a registration number and a code to check their status. A QR code is a square picture that a phone camera can scan to open a certain page.',
            steps: [
              'Open Admission periods and find the Public application link card.',
              'Click Copy to send the link in a message, or Print poster for a poster with a QR code.',
              'In the Application document types card, add the documents you ask for and mark which are Required.',
            ],
            tip: 'Click Open page to see the form as applicants see it before you share the link.',
            href: '/admissions/periods',
          },
          {
            heading: 'Reviewing files and deciding',
            body: 'The Admissions page shows the number of applicants per status, a chart of the last 14 days, and the quota used. Open an applicant to see their data, documents, and status history. The flow is: Submitted, Verified, then Accepted or Rejected.',
            steps: [
              'Open the Admissions menu. Filter by period or status, or search by name, number, or guardian.',
              'Open an applicant, then check the data and the document Preview.',
              'Click Verify when the files are complete and correct.',
              'Click Accept or Reject. Fill in the Decision note if needed.',
              'For many applicants at once, tick their rows and use Bulk action.',
            ],
            warning:
              'The decision note can be read by the applicant when checking status, so write it politely and clearly. An applicant who is Enrolled or Withdrawn cannot be changed again.',
            href: '/admissions',
          },
          {
            heading: 'Enrolling accepted applicants as students',
            body: 'An applicant with the Accepted status can become a student. The student and guardian data are created in the student list right away, and you can place the student in a class of the active academic year.',
            steps: [
              'Open an applicant with the Accepted status.',
              'Click Enrol as student.',
              'Choose a Class, or choose No class yet if it is not decided.',
              'Confirm. The status becomes Enrolled and an Open student list button appears.',
            ],
            warning:
              'Once Enrolled, the status cannot be changed again. Enrolling fails if the NISN is already used by another student.',
            href: '/admissions',
          },
        ],
        faq: [
          {
            q: 'An applicant says they cannot register. What should I check?',
            a: 'Open Admission periods. Make sure the period is Active, today is between the Open date and the Close date, and the quota is not full. If no period is open, the form is not available.',
          },
          {
            q: 'I clicked Accept but it was refused. Why?',
            a: 'The period quota is full. Quota used is the number of Accepted plus Enrolled applicants. Open Admission periods, choose Edit on the period, and raise the Quota.',
          },
          {
            q: 'A rejected applicant turns out to be eligible. Can it be reopened?',
            a: 'Yes. A Rejected applicant can be reopened to Verified with the Reopen (re-verify) action. After that you can choose Accept.',
          },
          {
            q: 'A guardian lost the code to check status. What now?',
            a: 'The code is shown only once at registration and cannot be shown again. Search the name or registration number on the Admissions page, then tell the guardian the status.',
          },
          {
            q: 'Enrol as student failed. What is the cause?',
            a: 'Usually the applicant NISN is already used by another student. Check the student list and make sure the applicant NISN is correct.',
          },
        ],
      },
      su: {
        title: 'SPMB: panarimaan murid anyar',
        summary:
          'Pituduh panitia SPMB: muka pendaptaran, ngabagikeun tautan, mariksa berkas, mutuskeun panarimaan, tuluy ndaptarkeun jadi siswa.',
        forWho: 'Admin sakola jeung Operator (panitia SPMB). Kepala sakola tiasa ningali data pendaptar.',
        sections: [
          {
            heading: 'Muka periode pendaptaran',
            body: 'Periode nangtukeun jadwal, jenjang, tahun ajaran, jeung kuota. Calon murid ngan tiasa ndaptar upami periodena Aktif jeung poé ieu aya di antara tanggal buka jeung tanggal tutup.',
            steps: [
              'Buka menu SPMB, tuluy Periode SPMB, jeung klik Tambah periode.',
              'Eusian nami periode, jenjang, tahun ajaran, Tanggal buka, jeung Tanggal tutup.',
              'Eusian Kuota, atawa kosongkeun upami taya wates.',
              'Sina Aktif tetep dicentang, tuluy simpen.',
            ],
            tip: 'Tanggal tutup sae dipasihan kaleluasaan saeutik, sangkan calon murid nu ndaptar dina poé panungtung teu katolak.',
            href: '/admissions/periods',
          },
          {
            heading: 'Ngabagikeun tautan jeung ngatur dokumén nu dipénta',
            body: 'Calon murid ndaptar tina ponsel lewat kaca pendaptaran umum sakola, teu peryogi akun. Maranéhna ngeusian data calon murid jeung wali, ngunggah dokumén (PDF, JPG, atawa PNG, paling ageung 2 MB sabiji), tuluy narima nomer pendaptaran jeung kode pikeun mariksa status. Kode QR nya éta gambar kotak-kotak nu tiasa dipindai ku kaméra ponsel pikeun muka kaca nu tangtu.',
            steps: [
              'Buka Periode SPMB, tuluy tingali kartu Tautan pendaptaran umum.',
              'Klik Salin pikeun ngirim tautan lewat pesen, atawa Citak poster pikeun poster kode QR.',
              'Dina kartu Jenis dokumén pendaptaran, tambihkeun dokumén nu dipénta jeung tandaan mana nu Wajib.',
            ],
            tip: 'Klik Buka kaca pikeun ningali formulir sakumaha nu katingali ku calon murid samemeh tautan dibagikeun.',
            href: '/admissions/periods',
          },
          {
            heading: 'Mariksa berkas jeung mutuskeun panarimaan',
            body: 'Kaca SPMB mintonkeun jumlah pendaptar per status, grafik pendaptar 14 poé katukang, jeung kuota nu parantos kapake. Buka hiji pendaptar pikeun ningali data, dokumén, jeung riwayat statusna. Alurna: Asup, Diverifikasi, tuluy Ditampi atawa Ditolak.',
            steps: [
              'Buka menu SPMB. Saring ku periode atawa status, atawa golédah nami, nomer, atawa wali.',
              'Buka hiji pendaptar, tuluy pariksa data jeung Pratinjau dokuménna.',
              'Klik Verifikasi upami berkasna lengkep jeung leres.',
              'Klik Tampi atawa Tolak. Eusian Catetan kaputusan upami peryogi.',
              'Pikeun seueur pendaptar sakaligus, centang barisna tuluy pake Aksi massal.',
            ],
            warning:
              'Catetan kaputusan tiasa dibaca ku pendaptar waktu mariksa status, jadi tulis nu sopan jeung écés. Pendaptar nu Kadaptar atawa Mundur teu tiasa dirobah deui.',
            href: '/admissions',
          },
          {
            heading: 'Ndaptarkeun pendaptar nu ditampi jadi siswa',
            body: 'Pendaptar nu statusna Ditampi tiasa dijieun siswa. Data calon murid jeung walina langsung dijieun dina daptar siswa, sarta tiasa ditempatkeun di kelas dina tahun ajaran aktif.',
            steps: [
              'Buka pendaptar nu statusna Ditampi.',
              'Klik Daptarkeun jadi siswa.',
              'Pilih Kelas, atawa pilih Tanpa kelas heula upami acan ditangtukeun.',
              'Konfirmasi. Statusna jadi Kadaptar sarta aya tombol Buka daptar siswa.',
            ],
            warning:
              'Saparantos Kadaptar, status teu tiasa dirobah deui. Pendaptaran gagal upami NISN parantos dipake siswa sanes.',
            href: '/admissions',
          },
        ],
        faq: [
          {
            q: 'Aya calon murid nyarios teu tiasa ndaptar. Naon nu kedah dipariksa?',
            a: 'Buka Periode SPMB. Pastikeun periodena Aktif, poé ieu aya di antara Tanggal buka jeung Tanggal tutup, sarta kuota acan pinuh. Upami taya periode nu kabuka, formulir teu sayogi.',
          },
          {
            q: 'Abdi klik Tampi, tapi ditolak. Naha?',
            a: 'Kuota periode parantos pinuh. Kuota nu kapake nya éta jumlah pendaptar Ditampi tambah Kadaptar. Buka Periode SPMB, pilih Robah dina periodena, tuluy naékkeun Kuota.',
          },
          {
            q: 'Pendaptar nu parantos ditolak tétéla pantes ditampi. Tiasa dibuka deui?',
            a: 'Tiasa. Pendaptar nu Ditolak tiasa dibuka deui ka Diverifikasi ku aksi Buka deui (verifikasi ulang). Saparantosna tiasa milih Tampi.',
          },
          {
            q: 'Wali hilap kode pikeun mariksa status. Kumaha?',
            a: 'Kode eta ngan mucunghul sakali waktu ndaptar sarta teu tiasa dipintonkeun deui. Golédah nami atawa nomer pendaptaranna di kaca SPMB, tuluy wartosan wali statusna.',
          },
          {
            q: 'Daptarkeun jadi siswa gagal. Naon sababna?',
            a: 'Biasana NISN calon murid parantos dipake ku siswa sanes. Pariksa daptar siswa tuluy pastikeun NISN pendaptar bener.',
          },
        ],
      },
    },
  },
  {
    slug: 'letters',
    icon: 'file',
    tone: 'sky',
    group: 'services',
    module: 'administration',
    text: {
      id: {
        title: 'Administrasi surat',
        summary:
          'Panduan operator TU: menyusun surat keluar bernomor otomatis, menandatanganinya, mencatat surat masuk, dan mengelola templat.',
        forWho:
          'Operator dan Admin sekolah untuk menyusun surat. Kepala sekolah atau pejabat penandatangan lain untuk menandatangani.',
        sections: [
          {
            heading: 'Menyusun dan menandatangani surat keluar',
            body: 'Surat keluar disusun dari templat atau ditulis sendiri, dengan pratinjau kertas A4. Nomor surat dibuat otomatis saat draf pertama kali disimpan, dan draf masih boleh diubah atau dihapus.',
            steps: [
              'Buka menu Surat, lalu klik Surat keluar baru.',
              'Pilih Templat (atau Tanpa templat) dan, bila perlu, pilih siswa. Isian seperti {{nama}}, {{nis}}, dan {{kelas}} terisi otomatis.',
              'Isi Penerima, Tanggal surat, dan Isi surat. Lihat hasilnya di Pratinjau.',
              'Klik Simpan draf.',
              'Penandatangan membuka detail surat lalu klik Tandatangani.',
              'Konfirmasi dengan Ya, tandatangani. PDF berkode QR langsung terunduh.',
            ],
            tip: 'Kode QR di surat bisa dipindai siapa pun untuk memeriksa keaslian surat, tanpa perlu masuk ke aplikasi.',
            warning:
              'Surat yang sudah ditandatangani tidak dapat diubah atau dihapus lagi. Baca sekali lagi sebelum menandatangani.',
            href: '/letters',
          },
          {
            heading: 'Mencatat surat masuk',
            body: 'Di tab Surat masuk, catat setiap surat yang diterima sekolah. Nomor agenda dibuat otomatis. Anda dapat menambahkan nomor surat dari pengirim, ringkasan isi, dan catatan Disposisi (arahan ke siapa surat diteruskan).',
            steps: [
              'Buka menu Surat, lalu pilih tab Surat masuk.',
              'Klik Catat surat masuk.',
              'Isi pengirim, tanggal surat, dan Ringkasan isi. Nomor surat pengirim boleh dikosongkan.',
              'Isi Disposisi bila ada arahan, lalu simpan.',
            ],
            tip: 'Surat masuk boleh diubah kapan saja, misalnya untuk menambah disposisi menyusul.',
            href: '/letters',
          },
          {
            heading: 'Menyiapkan penandatangan dan tanda tangan',
            body: 'Hanya pejabat yang terdaftar sebagai penandatangan yang dapat menandatangani surat, misalnya Kepala sekolah. Gambar tanda tangan bersifat pribadi dan hanya tercetak pada surat yang ia tandatangani.',
            steps: [
              'Pengelola surat membuka menu Penandatangan, lalu klik Tambah penandatangan.',
              'Pilih Anggota, lalu isi Nama pada surat dan Jabatan.',
              'Penandatangan membuka Penandatangan, pada kartu Tanda tangan saya memilih Gambar atau Unggah, lalu klik Simpan tanda tangan.',
            ],
            tip: 'Untuk unggahan, pakai foto tanda tangan di kertas putih. Gambar PNG atau JPG otomatis diperkecil hingga maksimal 150 KB.',
            href: '/letters/signers',
          },
          {
            heading: 'Menyiapkan templat dan format nomor surat',
            body: 'Templat adalah kerangka surat atau sertifikat yang datanya terisi otomatis. Format nomor mengatur kode sekolah dan pola nomor untuk surat keluar dan nomor agenda.',
            steps: [
              'Buka menu Templat surat.',
              'Bila belum ada templat, klik Pasang templat bawaan (surat keterangan siswa aktif, surat panggilan orang tua, dan sertifikat). Atau klik Templat baru untuk membuat sendiri.',
              'Pada kartu Format nomor, isi Kode sekolah dan pola nomor, lalu klik Simpan format.',
            ],
            warning:
              'Pola nomor wajib memuat urutan. Perubahan format hanya berlaku untuk surat berikutnya, nomor yang sudah terbit tidak berubah.',
            href: '/letters/templates',
          },
          {
            heading: 'Mencabut surat yang sudah ditandatangani',
            body: 'Surat yang sudah ditandatangani tidak bisa diedit. Bila isinya keliru atau surat tidak berlaku lagi, cabut suratnya lalu susun surat baru.',
            steps: [
              'Buka detail surat yang bersangkutan.',
              'Klik Cabut surat.',
              'Isi Alasan pencabutan, lalu konfirmasi.',
            ],
            warning:
              'Pencabutan tidak dapat dibatalkan. Siapa pun yang memindai kode QR surat itu akan melihat bahwa surat telah dicabut beserta alasannya.',
            href: '/letters',
          },
        ],
        faq: [
          {
            q: 'Tombol Tandatangani tidak bisa dipakai. Kenapa?',
            a: 'Akun Anda belum terdaftar sebagai penandatangan. Minta pengelola surat menambahkan Anda di menu Penandatangan. Setelah itu buat tanda tangan Anda di kartu Tanda tangan saya.',
          },
          {
            q: 'Surat sudah ditandatangani tetapi ada salah ketik. Bagaimana?',
            a: 'Surat yang sudah ditandatangani tidak dapat diubah. Cabut suratnya dengan alasan yang jelas, lalu susun dan tandatangani surat baru.',
          },
          {
            q: 'Pilihan templat kosong saat menyusun surat. Apa yang harus dilakukan?',
            a: 'Belum ada templat. Buka menu Templat surat dan klik Pasang templat bawaan. Anda juga dapat memilih Tanpa templat dan menulis surat sendiri.',
          },
          {
            q: 'Halaman pemeriksaan surat menyatakan berkas tidak cocok. Kenapa?',
            a: 'PDF yang dicetak ulang tidak identik dengan berkas saat penandatanganan. Pencocokan berkas hanya berlaku untuk PDF yang diunduh pertama kali, tetapi keaslian suratnya tetap dapat diperiksa lewat kode QR.',
          },
          {
            q: 'Penandatangan atau templat tidak bisa dihapus. Apa solusinya?',
            a: 'Penandatangan atau templat yang sudah dipakai surat tidak dapat dihapus. Nonaktifkan saja, maka tidak muncul lagi di pilihan tetapi surat lama tetap aman.',
          },
        ],
      },
      en: {
        title: 'Letter administration',
        summary:
          'A guide for administrative staff: compose outgoing letters with automatic numbers, sign them, log incoming letters, and manage templates.',
        forWho:
          'Operator and School admin to compose letters. The Principal or another signing official to sign them.',
        sections: [
          {
            heading: 'Composing and signing an outgoing letter',
            body: 'Outgoing letters are composed from a template or written freely, with an A4 paper preview. The letter number is generated automatically when the draft is first saved, and a draft can still be edited or deleted.',
            steps: [
              'Open the Letters menu, then click New outgoing letter.',
              'Choose a Template (or No template) and, if needed, pick a student. Fields such as {{nama}}, {{nis}}, and {{kelas}} fill in automatically.',
              'Fill in Recipient, Letter date, and Letter body. Check the result in the Preview.',
              'Click Save draft.',
              'The signer opens the letter detail and clicks Sign.',
              'Confirm with Yes, sign. The PDF with a QR code downloads right away.',
            ],
            tip: 'Anyone can scan the QR code on the letter to check that it is genuine, without logging in to the app.',
            warning: 'A signed letter can no longer be edited or deleted. Read it once more before signing.',
            href: '/letters',
          },
          {
            heading: 'Logging an incoming letter',
            body: 'In the Incoming letters tab, log every letter the school receives. The agenda number is generated automatically. You can add the sender letter number, a summary, and a Disposition note (an instruction on who the letter is passed on to).',
            steps: [
              'Open the Letters menu, then choose the Incoming letters tab.',
              'Click Log incoming letter.',
              'Fill in the sender, letter date, and Summary. The sender letter number can be left empty.',
              'Fill in the Disposition if there is an instruction, then save.',
            ],
            tip: 'An incoming letter can be edited at any time, for example to add a disposition later.',
            href: '/letters',
          },
          {
            heading: 'Setting up signers and signatures',
            body: 'Only officials registered as signers can sign letters, for example the Principal. The signature image is private and is printed only on letters that person signs.',
            steps: [
              'The letter manager opens the Signers menu, then clicks Add signer.',
              'Pick a Member, then fill in the Name on letter and the Title.',
              'The signer opens Signers, and in the My signature card chooses Draw or Upload, then clicks Save signature.',
            ],
            tip: 'For an upload, use a photo of the signature on white paper. PNG or JPG images are automatically reduced to at most 150 KB.',
            href: '/letters/signers',
          },
          {
            heading: 'Setting up templates and the letter number format',
            body: 'A template is a letter or certificate skeleton whose data fills in automatically. The number format sets the school code and the number pattern for outgoing letters and agenda numbers.',
            steps: [
              'Open the Letter templates menu.',
              'If there are no templates yet, click Install default templates (active student certificate, parent summons, and certificate). Or click New template to make your own.',
              'In the Number format card, fill in the School code and the number pattern, then click Save format.',
            ],
            warning:
              'The number pattern must include the sequence. A format change only applies to later letters, numbers already issued do not change.',
            href: '/letters/templates',
          },
          {
            heading: 'Revoking a signed letter',
            body: 'A signed letter cannot be edited. If its content is wrong or it is no longer valid, revoke the letter and compose a new one.',
            steps: [
              'Open the detail of the letter concerned.',
              'Click Revoke letter.',
              'Fill in the Reason for revoking, then confirm.',
            ],
            warning:
              'Revoking cannot be undone. Anyone who scans the QR code of that letter will see that it was revoked, together with the reason.',
            href: '/letters',
          },
        ],
        faq: [
          {
            q: 'The Sign button cannot be used. Why?',
            a: 'Your account is not registered as a signer. Ask the letter manager to add you in the Signers menu. After that, create your signature in the My signature card.',
          },
          {
            q: 'The letter is signed but has a typo. What now?',
            a: 'A signed letter cannot be edited. Revoke it with a clear reason, then compose and sign a new letter.',
          },
          {
            q: 'The template list is empty when composing a letter. What should I do?',
            a: 'There are no templates yet. Open the Letter templates menu and click Install default templates. You can also choose No template and write the letter yourself.',
          },
          {
            q: 'The letter check page says the file does not match. Why?',
            a: 'A reprinted PDF is not identical to the file made at signing time. File matching only holds for the PDF downloaded the first time, but the letter authenticity can still be checked through its QR code.',
          },
          {
            q: 'A signer or template cannot be deleted. What is the solution?',
            a: 'A signer or template already used by letters cannot be deleted. Just deactivate it: it no longer appears in the choices, but old letters stay safe.',
          },
        ],
      },
      su: {
        title: 'Administrasi surat',
        summary:
          'Pituduh operator TU: nyusun surat kaluar nu nomerna otomatis, nandatanganan, nyatet surat asup, jeung kokolakeun citakan.',
        forWho:
          'Operator jeung Admin sakola pikeun nyusun surat. Kepala sakola atawa pajabat panandatangan sanes pikeun nandatanganan.',
        sections: [
          {
            heading: 'Nyusun jeung nandatanganan surat kaluar',
            body: 'Surat kaluar disusun tina citakan atawa ditulis sorangan, jeung pratinjau kertas A4. Nomer surat dijieun otomatis waktu draf mimiti disimpen, sarta draf masih tiasa dirobah atawa dihapus.',
            steps: [
              'Buka menu Surat, tuluy klik Surat kaluar anyar.',
              'Pilih Citakan (atawa Tanpa citakan) jeung, upami peryogi, pilih siswa. Eusian saperti {{nama}}, {{nis}}, jeung {{kelas}} kaeusi otomatis.',
              'Eusian Panarima, Tanggal surat, jeung Eusi surat. Tingali hasilna dina Pratinjau.',
              'Klik Simpen draf.',
              'Panandatangan muka rincian surat tuluy klik Tandatanganan.',
              'Konfirmasi ku Enya, tandatanganan. PDF kode QR langsung diunduh.',
            ],
            tip: 'Kode QR dina surat tiasa dipindai ku saha waé pikeun mariksa kaasliannana, tanpa kedah asup ka aplikasi.',
            warning:
              'Surat nu parantos ditandatanganan teu tiasa dirobah atawa dihapus deui. Baca sakali deui samemeh nandatanganan.',
            href: '/letters',
          },
          {
            heading: 'Nyatet surat asup',
            body: 'Dina tab Surat asup, catet unggal surat nu ditarima ku sakola. Nomer agenda dijieun otomatis. Tiasa nambihan nomer surat ti nu ngirim, ringkesan eusi, jeung catetan Disposisi (arahan surat diteruskeun ka saha).',
            steps: [
              'Buka menu Surat, tuluy pilih tab Surat asup.',
              'Klik Catet surat asup.',
              'Eusian nu ngirim, tanggal surat, jeung Ringkesan eusi. Nomer surat nu ngirim tiasa dikosongkeun.',
              'Eusian Disposisi upami aya arahan, tuluy simpen.',
            ],
            tip: 'Surat asup tiasa dirobah iraha waé, contona pikeun nambihan disposisi saparantosna.',
            href: '/letters',
          },
          {
            heading: 'Nyiapkeun panandatangan jeung tanda tangan',
            body: 'Ngan pajabat nu kadaptar salaku panandatangan nu tiasa nandatanganan surat, contona Kepala sakola. Gambar tanda tangan sipatna pribadi jeung ngan kacitak dina surat nu ditandatanganan ku manehna.',
            steps: [
              'Pangurus surat muka menu Panandatangan, tuluy klik Tambah panandatangan.',
              'Pilih Anggota, tuluy eusian Nami dina surat jeung Jabatan.',
              'Panandatangan muka Panandatangan, dina kartu Tanda tangan abdi milih Gambar atawa Unggah, tuluy klik Simpen tanda tangan.',
            ],
            tip: 'Pikeun unggahan, paké poto tanda tangan dina kertas bodas. Gambar PNG atawa JPG otomatis dialitkeun paling ageung 150 KB.',
            href: '/letters/signers',
          },
          {
            heading: 'Nyiapkeun citakan jeung format nomer surat',
            body: 'Citakan nya éta kerangka surat atawa sertipikat nu datana kaeusi otomatis. Format nomer ngatur kode sakola jeung pola nomer pikeun surat kaluar jeung nomer agenda.',
            steps: [
              'Buka menu Citakan surat.',
              'Upami acan aya citakan, klik Pasang citakan bawaan (surat katerangan siswa aktif, surat timbalan kolot, jeung sertipikat). Atawa klik Citakan anyar pikeun nyieun sorangan.',
              'Dina kartu Format nomer, eusian Kode sakola jeung pola nomer, tuluy klik Simpen format.',
            ],
            warning:
              'Pola nomer wajib ngandung urutan. Parobahan format ngan lumaku pikeun surat saterusna, nomer nu parantos terbit teu robah.',
            href: '/letters/templates',
          },
          {
            heading: 'Nyabut surat nu parantos ditandatanganan',
            body: 'Surat nu parantos ditandatanganan teu tiasa dirobah. Upami eusina lepat atawa surat teu lumaku deui, cabut suratna tuluy susun surat anyar.',
            steps: [
              'Buka rincian surat nu aya sangkutna.',
              'Klik Cabut surat.',
              'Eusian Alesan nyabut, tuluy konfirmasi.',
            ],
            warning:
              'Pencabutan teu tiasa dibatalkeun. Saha waé nu mindai kode QR surat eta bakal ningali yén surat parantos dicabut jeung alesanna.',
            href: '/letters',
          },
        ],
        faq: [
          {
            q: 'Tombol Tandatanganan teu tiasa dipake. Naha?',
            a: 'Akun anjeun acan kadaptar salaku panandatangan. Pénta pangurus surat nambihan anjeun dina menu Panandatangan. Saparantosna jieun tanda tangan anjeun dina kartu Tanda tangan abdi.',
          },
          {
            q: 'Surat parantos ditandatanganan tapi aya salah ketik. Kumaha?',
            a: 'Surat nu parantos ditandatanganan teu tiasa dirobah. Cabut suratna jeung alesan nu écés, tuluy susun jeung tandatanganan surat anyar.',
          },
          {
            q: 'Pilihan citakan kosong waktu nyusun surat. Naon nu kedah dilakukeun?',
            a: 'Citakan acan aya. Buka menu Citakan surat tuluy klik Pasang citakan bawaan. Tiasa oge milih Tanpa citakan sarta nulis surat sorangan.',
          },
          {
            q: 'Kaca pamariksaan surat nyebatkeun berkas teu cocog. Naha?',
            a: 'PDF nu dicitak deui teu sarua jeung berkas waktu nandatanganan. Pamariksaan berkas ngan mangpaat pikeun PDF nu diunduh pangmimitina, tapi kaaslian surat tetep tiasa dipariksa lewat kode QR.',
          },
          {
            q: 'Panandatangan atawa citakan teu tiasa dihapus. Kumaha solusina?',
            a: 'Panandatangan atawa citakan nu parantos dipake surat teu tiasa dihapus. Nonaktifkeun wé: moal mucunghul deui dina pilihan, tapi surat lami tetep aman.',
          },
        ],
      },
    },
  },
  {
    slug: 'announcements',
    icon: 'megaphone',
    tone: 'violet',
    group: 'services',
    module: 'announcements',
    text: {
      id: {
        title: 'Pengumuman dan agenda',
        summary:
          'Panduan menulis berita, agenda, dan pemberitahuan untuk situs sekolah, portal wali, dan staf.',
        forWho: 'Admin sekolah dan Operator. Peran lain hanya dapat membaca pengumuman.',
        sections: [
          {
            heading: 'Menulis dan menerbitkan pengumuman',
            body: 'Setiap pengumuman punya kategori Berita, Agenda, atau Pemberitahuan. Isinya berupa teks biasa: pisahkan paragraf dengan satu baris kosong, dan jangan memakai tag HTML.',
            steps: [
              'Buka menu Pengumuman, lalu klik Tulis pengumuman.',
              'Isi Judul dan Isi, lalu pilih Kategori.',
              'Pilih Audiens: Publik, Portal wali dan siswa, Staf, atau Semua.',
              'Isi Tampil sampai bila pengumuman punya batas waktu.',
              'Lihat tab Pratinjau untuk melihat tampilannya di situs sekolah.',
              'Centang Terbitkan sekarang agar langsung terbit, atau biarkan kosong untuk menyimpannya sebagai draf. Lalu klik Simpan.',
            ],
            tip: 'Simpan sebagai draf dulu bila tulisan masih perlu diperiksa orang lain, lalu terbitkan dengan tombol Terbitkan di daftar.',
            href: '/announcements',
          },
          {
            heading: 'Menentukan siapa yang membaca',
            body: 'Publik tampil di situs sekolah tanpa perlu masuk. Portal wali dan siswa hanya terlihat oleh wali dan siswa yang sudah masuk portal. Staf hanya terlihat oleh guru dan staf, di dasbor mereka. Semua tampil di ketiganya.',
            href: '/announcements',
          },
          {
            heading: 'Menayangkan agenda kegiatan',
            body: 'Agenda adalah pengumuman untuk acara yang punya tanggal, misalnya ujian atau rapat wali. Agenda yang akan datang tampil di bagian Agenda pada situs sekolah.',
            steps: [
              'Klik Tulis pengumuman, lalu pilih kategori Agenda.',
              'Isi Tanggal acara. Agenda wajib punya tanggal acara.',
              'Pilih Audiens Publik atau Semua agar tampil di situs, lalu terbitkan.',
            ],
            href: '/announcements',
          },
          {
            heading: 'Menyematkan, menarik, atau menghapus pengumuman',
            body: 'Dari daftar pengumuman, setiap baris punya pilihan Terbitkan atau Tarik ke draf, Sematkan agar tampil di bagian atas, Ubah, dan Hapus. Saringan Status, Kategori, dan Audiens membantu menemukan pengumuman.',
            steps: [
              'Buka menu Pengumuman dan cari pengumumannya.',
              'Klik Sematkan agar tampil di atas, atau Tarik ke draf untuk menyembunyikannya sementara.',
              'Klik Hapus hanya bila pengumuman memang tidak dipakai lagi, lalu konfirmasi.',
            ],
            warning:
              'Menghapus pengumuman bersifat permanen dan langsung hilang dari situs. Untuk sekadar menyembunyikan, pilih Tarik ke draf.',
            href: '/announcements',
          },
        ],
        faq: [
          {
            q: 'Pengumuman sudah dibuat tetapi tidak tampil di situs sekolah. Kenapa?',
            a: 'Periksa empat hal: statusnya Terbit (bukan Draf), Audiens-nya Publik atau Semua, tanggal Tampil sampai belum lewat, dan situs sekolah sudah diterbitkan di menu Situs sekolah.',
          },
          {
            q: 'Saya tidak melihat tombol Tulis pengumuman. Kenapa?',
            a: 'Menulis dan mengubah pengumuman hanya untuk Admin sekolah dan Operator. Peran lain dapat membaca saja. Hubungi admin sekolah bila Anda perlu ikut menulis.',
          },
          {
            q: 'Saya ingin pengumuman hilang dari situs tetapi tidak ingin menghapusnya. Bisa?',
            a: 'Bisa. Klik Tarik ke draf pada pengumumannya. Pengumuman tersimpan dan dapat diterbitkan lagi kapan saja.',
          },
          {
            q: 'Pengumuman Agenda tidak mau tersimpan. Apa yang kurang?',
            a: 'Agenda wajib punya Tanggal acara. Isi tanggalnya, lalu simpan lagi.',
          },
        ],
      },
      en: {
        title: 'Announcements and agenda',
        summary:
          'A guide to writing news, agenda items, and notices for the school website, the parent portal, and staff.',
        forWho: 'School admin and Operator. Other roles can only read announcements.',
        sections: [
          {
            heading: 'Writing and publishing an announcement',
            body: 'Every announcement has a category: News, Agenda, or Notice. The body is plain text: separate paragraphs with one blank line, and do not use HTML tags.',
            steps: [
              'Open the Announcements menu, then click Write announcement.',
              'Fill in the Title and Body, then choose the Category.',
              'Choose the Audience: Public, Parent and student portal, Staff, or All.',
              'Fill in Show until if the announcement has a deadline.',
              'Check the Preview tab to see how it looks on the school website.',
              'Tick Publish now to publish right away, or leave it empty to save as a draft. Then click Save.',
            ],
            tip: 'Save as a draft first if the text still needs checking by someone else, then publish it with the Publish button in the list.',
            href: '/announcements',
          },
          {
            heading: 'Choosing who reads it',
            body: 'Public shows on the school website without needing to sign in. Parent and student portal is only seen by guardians and students who have signed in to the portal. Staff is only seen by teachers and staff, on their dashboard. All shows in all three.',
            href: '/announcements',
          },
          {
            heading: 'Posting an agenda item',
            body: 'An agenda item is an announcement for an event with a date, for example an exam or a parent meeting. Upcoming agenda items appear in the Agenda section of the school website.',
            steps: [
              'Click Write announcement, then choose the Agenda category.',
              'Fill in the Event date. An agenda item must have an event date.',
              'Choose the Public or All audience so it shows on the website, then publish.',
            ],
            href: '/announcements',
          },
          {
            heading: 'Pinning, withdrawing, or deleting an announcement',
            body: 'In the announcement list, each row has Publish or Return to draft, Pin to keep it at the top, Edit, and Delete. The Status, Category, and Audience filters help you find announcements.',
            steps: [
              'Open the Announcements menu and find the announcement.',
              'Click Pin to keep it on top, or Return to draft to hide it for now.',
              'Click Delete only if the announcement is truly no longer needed, then confirm.',
            ],
            warning:
              'Deleting an announcement is permanent and it disappears from the website at once. To only hide it, choose Return to draft.',
            href: '/announcements',
          },
        ],
        faq: [
          {
            q: 'The announcement is created but does not show on the school website. Why?',
            a: 'Check four things: the status is Published (not Draft), the Audience is Public or All, the Show until date has not passed, and the school website has been published in the School website menu.',
          },
          {
            q: 'I do not see the Write announcement button. Why?',
            a: 'Writing and editing announcements is only for School admin and Operator. Other roles can only read. Contact the school admin if you need to write too.',
          },
          {
            q: 'I want an announcement off the website without deleting it. Is that possible?',
            a: 'Yes. Click Return to draft on the announcement. It is kept and can be published again at any time.',
          },
          {
            q: 'An Agenda announcement will not save. What is missing?',
            a: 'An agenda item must have an Event date. Fill in the date, then save again.',
          },
        ],
      },
      su: {
        title: 'Pengumuman jeung agenda',
        summary: 'Pituduh nulis warta, agenda, jeung béwara pikeun situs sakola, portal wali, jeung staf.',
        forWho: 'Admin sakola jeung Operator. Peran sanes ngan tiasa maca pengumuman.',
        sections: [
          {
            heading: 'Nulis jeung nerbitkeun pengumuman',
            body: 'Unggal pengumuman gaduh kategori Warta, Agenda, atawa Béwara. Eusina téks biasa: pisahkeun paragraf ku hiji baris kosong, sarta ulah maké tag HTML.',
            steps: [
              'Buka menu Pengumuman, tuluy klik Tulis pengumuman.',
              'Eusian Judul jeung Eusi, tuluy pilih Kategori.',
              'Pilih Pamiarsa: Umum, Portal wali jeung siswa, Staf, atawa Sadayana.',
              'Eusian Mintonkeun dugi ka upami pengumuman gaduh wates waktu.',
              'Tingali tab Pratinjau pikeun ningali tampilanna di situs sakola.',
              'Centang Terbitkeun ayeuna pikeun langsung terbit, atawa kosongkeun pikeun disimpen jadi draf. Tuluy klik Simpen.',
            ],
            tip: 'Simpen jadi draf heula upami tulisan masih kedah dipariksa ku batur, tuluy terbitkeun ku tombol Terbitkeun dina daptar.',
            href: '/announcements',
          },
          {
            heading: 'Nangtukeun saha nu maca',
            body: 'Umum mucunghul di situs sakola tanpa kedah asup. Portal wali jeung siswa ngan katingali ku wali jeung siswa nu parantos asup portal. Staf ngan katingali ku guru jeung staf, di dasbor maranéhna. Sadayana mucunghul di tiluanana.',
            href: '/announcements',
          },
          {
            heading: 'Mintonkeun agenda kagiatan',
            body: 'Agenda nya éta pengumuman pikeun acara nu gaduh tanggal, contona ujian atawa rapat wali. Agenda nu bakal datang mucunghul dina bagian Agenda situs sakola.',
            steps: [
              'Klik Tulis pengumuman, tuluy pilih kategori Agenda.',
              'Eusian Tanggal acara. Agenda wajib gaduh tanggal acara.',
              'Pilih Pamiarsa Umum atawa Sadayana sangkan mucunghul di situs, tuluy terbitkeun.',
            ],
            href: '/announcements',
          },
          {
            heading: 'Nyémat, narik, atawa ngahapus pengumuman',
            body: 'Dina daptar pengumuman, unggal baris gaduh Terbitkeun atawa Tarik ka draf, Sémat supaya aya di luhur, Robah, jeung Hapus. Saringan Status, Kategori, jeung Pamiarsa mantuan milarian pengumuman.',
            steps: [
              'Buka menu Pengumuman tuluy golédah pengumumanana.',
              'Klik Sémat supaya aya di luhur, atawa Tarik ka draf pikeun nyumputkeunana samentawis.',
              'Klik Hapus ngan upami pengumuman memang teu dipake deui, tuluy konfirmasi.',
            ],
            warning:
              'Ngahapus pengumuman sipatna permanén jeung langsung leungit tina situs. Pikeun ngan nyumputkeun, pilih Tarik ka draf.',
            href: '/announcements',
          },
        ],
        faq: [
          {
            q: 'Pengumuman parantos dijieun tapi teu mucunghul di situs sakola. Naha?',
            a: 'Pariksa opat hal: statusna Terbit (lain Draf), Pamiarsana Umum atawa Sadayana, tanggal Mintonkeun dugi ka acan lewat, jeung situs sakola parantos diterbitkeun dina menu Situs sakola.',
          },
          {
            q: 'Abdi teu ningali tombol Tulis pengumuman. Naha?',
            a: 'Nulis jeung ngarobah pengumuman ngan pikeun Admin sakola jeung Operator. Peran sanes ngan tiasa maca. Hubungi admin sakola upami anjeun kedah milu nulis.',
          },
          {
            q: 'Abdi hoyong pengumuman leungit tina situs tapi teu hoyong ngahapusna. Tiasa?',
            a: 'Tiasa. Klik Tarik ka draf dina pengumumanana. Pengumuman kasimpen jeung tiasa diterbitkeun deui iraha waé.',
          },
          {
            q: 'Pengumuman Agenda teu tiasa disimpen. Naon nu kakurangan?',
            a: 'Agenda wajib gaduh Tanggal acara. Eusian tanggalna, tuluy simpen deui.',
          },
        ],
      },
    },
  },
  {
    slug: 'messaging',
    icon: 'message',
    tone: 'emerald',
    group: 'services',
    module: 'messaging',
    text: {
      id: {
        title: 'Notifikasi WhatsApp',
        summary:
          'Panduan menghubungkan WhatsApp sekolah dan mengatur pesan otomatis ke wali tentang kehadiran, pembayaran, dan rapor.',
        forWho: 'Admin sekolah dan Operator. Kepala sekolah dapat melihat riwayat pesan.',
        sections: [
          {
            heading: 'Menghubungkan WhatsApp sekolah',
            body: 'Satu nomor WhatsApp dipakai untuk semua pesan dari sekolah. Status sambungan di tab Koneksi dapat berupa Terhubung, Menunggu pemindaian, Menyambung, Gagal, atau Terputus.',
            steps: [
              'Buka menu Notifikasi WhatsApp, pilih tab Koneksi, lalu klik Hubungkan WhatsApp.',
              'Tunggu kode QR muncul. Halaman memeriksa sendiri setiap 3 detik.',
              'Di ponsel yang memakai nomor sekolah, buka WhatsApp, ketuk Perangkat tertaut, lalu Tautkan perangkat.',
              'Arahkan kamera ke kode QR di layar. Bila berhasil, status berubah menjadi Terhubung dan nomor sekolah tampil.',
              'Pada kartu Kirim pesan uji, kirim satu pesan ke nomor Anda sendiri untuk memastikan sambungan berfungsi.',
            ],
            warning:
              'Pakai nomor khusus sekolah, bukan nomor pribadi. Cara menyambung ini tidak resmi dari WhatsApp, sehingga nomor bisa saja diblokir.',
            href: '/messaging',
          },
          {
            heading: 'Mengatur jam kirim dan isi pesan',
            body: 'Di tab Pengaturan, Anda mengatur kapan dan bagaimana pesan dikirim. Setiap peristiwa punya isi pesan sendiri yang bisa dinyalakan atau dimatikan sendiri-sendiri.',
            steps: [
              'Buka tab Pengaturan, lalu nyalakan Aktifkan notifikasi.',
              'Isi Kirim mulai jam dan Kirim sampai jam. Pesan di luar jam ini menunggu sampai jam berikutnya.',
              'Atur Jeda acak minimum dan maksimum antar-pesan, serta Jam pengingat belum tiba.',
              'Pada bagian Peristiwa dan templat pesan, ubah isi pesan bila perlu. Klik nama pengganti (misalnya nama siswa) untuk menyisipkannya, lihat Pratinjau, lalu Simpan. Klik Kembalikan ke bawaan untuk mengulang.',
            ],
            tip: 'Jeda acak membuat pesan tidak terkirim serentak, sehingga lebih aman bagi nomor sekolah.',
            href: '/messaging',
          },
          {
            heading: 'Mengetahui pesan apa saja yang dikirim ke wali',
            body: 'Pesan otomatis dikirim untuk: siswa tiba dan siswa pulang (dari tap kartu di gerbang), belum tiba (pada jam pengingat), bolos pelajaran (hadir di gerbang tetapi ditandai alpa di satu jam pelajaran), pembayaran diterima, tagihan jatuh tempo, dan rapor terbit. Pesan dikirim ke setiap nomor wali yang valid, satu pesan per nomor, wali utama lebih dulu.',
            tip: 'Pastikan nomor ponsel wali terisi di data siswa. Tanpa nomor yang valid, tidak ada pesan yang bisa dikirim.',
            href: '/messaging',
          },
          {
            heading: 'Memeriksa dan mengirim ulang pesan',
            body: 'Tab Riwayat menampilkan pesan dengan status Antre, Mengirim, Terkirim, Gagal, atau Dilewati. Nomor tujuan disamarkan untuk menjaga privasi.',
            steps: [
              'Buka tab Riwayat.',
              'Saring menurut Status atau Peristiwa untuk mempersempit daftar.',
              'Lihat kolom Detail pada pesan yang Gagal atau Dilewati untuk mengetahui sebabnya.',
              'Setelah masalahnya beres, klik Kirim ulang.',
            ],
            warning:
              'Kirim ulang benar-benar mengirim pesan itu lagi ke wali. Pastikan penyebab kegagalannya sudah diperbaiki.',
            href: '/messaging',
          },
        ],
        faq: [
          {
            q: 'WhatsApp terputus, bagaimana menyambungkan lagi?',
            a: 'Buka Notifikasi WhatsApp, tab Koneksi, lalu klik Hubungkan WhatsApp dan pindai kode QR seperti pertama kali. Gunakan ponsel dengan nomor sekolah yang sama, lewat Perangkat tertaut di WhatsApp.',
          },
          {
            q: 'Wali mengatakan tidak menerima pesan. Apa yang harus diperiksa?',
            a: 'Periksa berurutan: status Koneksi harus Terhubung, Aktifkan notifikasi menyala, isi pesan untuk peristiwa itu menyala, dan wali punya nomor ponsel yang valid di data siswa. Lalu cek tab Riwayat untuk melihat statusnya.',
          },
          {
            q: 'Pesan berstatus Gagal atau Dilewati. Apakah bisa dikirim lagi?',
            a: 'Bisa. Buka tab Riwayat, lihat Detail untuk mengetahui sebabnya, perbaiki bila perlu (misalnya sambungkan ulang WhatsApp), lalu klik Kirim ulang.',
          },
          {
            q: 'Pesan baru terkirim keesokan harinya. Kenapa?',
            a: 'Pesan yang dibuat di luar jam kirim menunggu sampai jam berikutnya. Ubah Kirim mulai jam dan Kirim sampai jam di tab Pengaturan bila perlu.',
          },
          {
            q: 'Muncul tulisan "Mode uji". Apa artinya?',
            a: 'Pada mode uji, pesan hanya dicatat dan tidak dikirim ke WhatsApp. Bila tulisan lain menyebut pengiriman dinonaktifkan oleh pengelola platform, hubungi pengelola Edusync.',
          },
        ],
      },
      en: {
        title: 'WhatsApp notifications',
        summary:
          'A guide to connecting the school WhatsApp and setting up automatic messages to guardians about attendance, payments, and report cards.',
        forWho: 'School admin and Operator. The Principal can view the message history.',
        sections: [
          {
            heading: 'Connecting the school WhatsApp',
            body: 'One WhatsApp number is used for all messages from the school. The connection status in the Connection tab can be Connected, Waiting for scan, Connecting, Failed, or Disconnected.',
            steps: [
              'Open the WhatsApp notifications menu, choose the Connection tab, then click Connect WhatsApp.',
              'Wait for the QR code to appear. The page checks by itself every 3 seconds.',
              'On the phone that uses the school number, open WhatsApp, tap Linked devices, then Link a device.',
              'Point the camera at the QR code on the screen. When it works, the status changes to Connected and the school number is shown.',
              'In the Send test message card, send one message to your own number to confirm the connection works.',
            ],
            warning:
              'Use a number dedicated to the school, not a personal one. This way of connecting is not official from WhatsApp, so the number could be blocked.',
            href: '/messaging',
          },
          {
            heading: 'Setting sending hours and message text',
            body: 'In the Settings tab you set when and how messages are sent. Each event has its own message text that can be switched on or off separately.',
            steps: [
              'Open the Settings tab, then switch on Enable notifications.',
              'Fill in Send from hour and Send until hour. Messages outside these hours wait until the next window.',
              'Set the minimum and maximum Random delay between messages, and the Not-yet-arrived reminder time.',
              'In Events and message templates, change the message text if needed. Click a placeholder name (for example student name) to insert it, check the Preview, then Save. Click Reset to default to start over.',
            ],
            tip: 'The random delay stops messages from going out all at once, which is safer for the school number.',
            href: '/messaging',
          },
          {
            heading: 'Knowing which messages go to guardians',
            body: 'Automatic messages are sent for: student arrives and student leaves (from card taps at the gate), not yet arrived (at the reminder time), skipped class (present at the gate but marked absent in one lesson), payment received, invoice overdue, and report card published. A message goes to every valid guardian number, one message per number, the primary guardian first.',
            tip: 'Make sure the guardian mobile number is filled in on the student data. Without a valid number, no message can be sent.',
            href: '/messaging',
          },
          {
            heading: 'Checking and resending messages',
            body: 'The History tab lists messages with the status Queued, Sending, Sent, Failed, or Skipped. Destination numbers are masked for privacy.',
            steps: [
              'Open the History tab.',
              'Filter by Status or Event to narrow the list.',
              'Look at the Detail column of a Failed or Skipped message to learn the cause.',
              'Once the problem is fixed, click Resend.',
            ],
            warning:
              'Resend really sends that message to the guardian again. Make sure the cause of the failure has been fixed.',
            href: '/messaging',
          },
        ],
        faq: [
          {
            q: 'WhatsApp is disconnected. How do I connect it again?',
            a: 'Open WhatsApp notifications, the Connection tab, then click Connect WhatsApp and scan the QR code as the first time. Use the phone with the same school number, through Linked devices in WhatsApp.',
          },
          {
            q: 'A guardian says they received no message. What should I check?',
            a: 'Check in order: the Connection status must be Connected, Enable notifications is on, the message for that event is on, and the guardian has a valid mobile number on the student data. Then look in the History tab to see the status.',
          },
          {
            q: 'A message is Failed or Skipped. Can it be sent again?',
            a: 'Yes. Open the History tab, read the Detail to learn the cause, fix it if needed (for example reconnect WhatsApp), then click Resend.',
          },
          {
            q: 'A message was only sent the next day. Why?',
            a: 'Messages created outside the sending hours wait until the next window. Change Send from hour and Send until hour in the Settings tab if needed.',
          },
          {
            q: 'A "Test mode" note appears. What does it mean?',
            a: 'In test mode, messages are only recorded and not sent to WhatsApp. If another note says sending is switched off by the platform operator, contact the Edusync operator.',
          },
        ],
      },
      su: {
        title: 'Béwara WhatsApp',
        summary:
          'Pituduh nyambungkeun WhatsApp sakola jeung ngatur pesen otomatis ka wali ngeunaan kahadiran, pambayaran, jeung rapor.',
        forWho: 'Admin sakola jeung Operator. Kepala sakola tiasa ningali riwayat pesen.',
        sections: [
          {
            heading: 'Nyambungkeun WhatsApp sakola',
            body: 'Hiji nomer WhatsApp dipake pikeun sadaya pesen ti sakola. Status sambungan dina tab Sambungan tiasa Nyambung, Ngantosan pindai, Nyambungkeun, Gagal, atawa Peuntas.',
            steps: [
              'Buka menu Béwara WhatsApp, pilih tab Sambungan, tuluy klik Sambungkeun WhatsApp.',
              'Antosan kode QR mucunghul. Kaca mariksa sorangan unggal 3 detik.',
              'Dina ponsel nu maké nomer sakola, buka WhatsApp, ketok Parangkat tertaut, tuluy Tautkeun parangkat.',
              'Arahkeun kaméra ka kode QR dina layar. Upami hasil, status robah jadi Nyambung sarta nomer sakola katingali.',
              'Dina kartu Kirim pesen uji, kirim hiji pesen ka nomer anjeun sorangan pikeun mastikeun sambungan jalan.',
            ],
            warning:
              'Paké nomer husus sakola, lain nomer pribadi. Cara nyambung ieu lain resmi ti WhatsApp, jadi nomer tiasa waé diblokir.',
            href: '/messaging',
          },
          {
            heading: 'Ngatur jam ngirim jeung eusi pesen',
            body: 'Dina tab Pangaturan, anjeun ngatur iraha jeung kumaha pesen dikirim. Unggal kajadian gaduh eusi pesen sorangan nu tiasa dihurungkeun atawa dipareuman sorangan-sorangan.',
            steps: [
              'Buka tab Pangaturan, tuluy hurungkeun Hurungkeun béwara.',
              'Eusian Kirim mimiti jam jeung Kirim dugi ka jam. Pesen di luar jam ieu ngantosan dugi ka jandéla saterusna.',
              'Atur Jeda acak minimum jeung maksimum antar-pesen, sarta Jam pangingét acan sumping.',
              'Dina bagian Kajadian jeung citakan pesen, robah eusi pesen upami peryogi. Klik nami panggantos (contona nami siswa) pikeun nyisipkeunana, tingali Pratinjau, tuluy Simpen. Klik Balikkeun ka bawaan pikeun ngulang.',
            ],
            tip: 'Jeda acak ngajadikeun pesen teu kaluar sakaligus, jadi langkung aman pikeun nomer sakola.',
            href: '/messaging',
          },
          {
            heading: 'Terang pesen naon waé nu dikirim ka wali',
            body: 'Pesen otomatis dikirim pikeun: siswa sumping jeung siswa mulih (tina tap kartu di gerbang), acan sumping (dina jam pangingét), bolos pelajaran (hadir di gerbang tapi ditandaan alpa dina hiji jam pelajaran), pambayaran ditarima, tagihan jatuh tempo, jeung rapor terbit. Pesen dikirim ka unggal nomer wali nu valid, hiji pesen per nomer, wali utama heula.',
            tip: 'Pastikeun nomer ponsel wali kaeusi dina data siswa. Tanpa nomer nu valid, taya pesen nu tiasa dikirim.',
            href: '/messaging',
          },
          {
            heading: 'Mariksa jeung ngirim deui pesen',
            body: 'Tab Riwayat mintonkeun pesen jeung status Antre, Ngirim, Kakirim, Gagal, atawa Dileueut. Nomer tujuan disamarkeun pikeun ngajaga privasi.',
            steps: [
              'Buka tab Riwayat.',
              'Saring ku Status atawa Kajadian pikeun ngaheureutan daptar.',
              'Tingali kolom Rincian dina pesen nu Gagal atawa Dileueut pikeun terang sababna.',
              'Saparantos masalahna beres, klik Kirim deui.',
            ],
            warning:
              'Kirim deui sabenerna ngirim pesen eta ka wali sakali deui. Pastikeun sabab gagalna parantos dibenerkeun.',
            href: '/messaging',
          },
        ],
        faq: [
          {
            q: 'WhatsApp peuntas, kumaha nyambungkeunana deui?',
            a: 'Buka Béwara WhatsApp, tab Sambungan, tuluy klik Sambungkeun WhatsApp jeung pindai kode QR sapertos mimiti. Paké ponsel nu nomerna sarua jeung nomer sakola, lewat Parangkat tertaut dina WhatsApp.',
          },
          {
            q: 'Wali nyarios teu narima pesen. Naon nu kedah dipariksa?',
            a: 'Pariksa sacara berurutan: status Sambungan kedah Nyambung, Hurungkeun béwara hurung, pesen pikeun kajadian eta hurung, jeung wali gaduh nomer ponsel nu valid dina data siswa. Tuluy tingali tab Riwayat pikeun ningali statusna.',
          },
          {
            q: 'Pesen statusna Gagal atawa Dileueut. Tiasa dikirim deui?',
            a: 'Tiasa. Buka tab Riwayat, tingali Rincian pikeun terang sababna, benerkeun upami peryogi (contona sambungkeun deui WhatsApp), tuluy klik Kirim deui.',
          },
          {
            q: 'Pesen karak kakirim énjingna. Naha?',
            a: 'Pesen nu dijieun di luar jam ngirim ngantosan dugi ka jandéla saterusna. Robah Kirim mimiti jam jeung Kirim dugi ka jam dina tab Pangaturan upami peryogi.',
          },
          {
            q: 'Aya tulisan "Mode uji". Naon hartosna?',
            a: 'Dina mode uji, pesen ngan dicatet sarta teu dikirim ka WhatsApp. Upami aya tulisan sanes nu nyebatkeun pangiriman dipareuman ku pangurus platform, hubungi pangurus Edusync.',
          },
        ],
      },
    },
  },
  {
    slug: 'parent-portal',
    icon: 'users',
    tone: 'teal',
    group: 'services',
    module: 'parent_portal',
    text: {
      id: {
        title: 'Portal wali dan siswa',
        summary:
          'Panduan mengundang wali atau siswa agar dapat melihat kehadiran, nilai, tagihan, dan rapor lewat ponsel. Memerlukan modul Absensi.',
        forWho: 'Admin sekolah dan Operator yang mengelola data siswa.',
        sections: [
          {
            heading: 'Mengundang wali atau siswa',
            body: 'Undangan berupa tautan sekali pakai untuk satu orang, berlaku 14 hari. Wali yang diundang harus sudah tercatat pada data siswa di halaman Siswa.',
            steps: [
              'Buka menu Akun portal, lalu ketik nama, NIS, atau NISN siswa di kolom Cari siswa.',
              'Pilih wali yang diundang, atau pilih siswa itu sendiri.',
              'Isi Email bila ingin undangan hanya bisa diterima dengan email itu (boleh dikosongkan).',
              'Klik Buat tautan, lalu klik Salin dan kirim tautannya kepada orang yang diundang.',
            ],
            warning:
              'Tautan undangan hanya tampil sekali. Salin sebelum menutup jendelanya. Bila hilang, buat undangan baru.',
            href: '/portal-admin',
          },
          {
            heading: 'Membantu wali menerima undangan',
            body: 'Orang yang diundang membuka tautan, lalu melihat nama sekolah dan siswa yang tertaut. Mereka membuat akun sendiri, atau menautkan akun yang sudah ada bila emailnya sudah terdaftar.',
            steps: [
              'Buka tautan undangan dari sekolah.',
              'Isi Nama lengkap dan kata sandi (minimal 12 karakter). Email yang dipakai untuk masuk sudah terisi dari undangan bila Anda mengisinya.',
              'Klik Buat akun dan masuk. Bila emailnya sudah punya akun, masukkan kata sandi akun itu lalu klik Terima dan masuk.',
            ],
            tip: 'Tuntun wali lewat telepon atau pesan pada kali pertama. Setelah itu mereka dapat masuk sendiri kapan saja.',
          },
          {
            heading: 'Mengetahui apa yang dilihat wali dan siswa',
            body: 'Wali melihat anak yang tertaut pada datanya, sedangkan siswa hanya melihat dirinya sendiri. Beranda memuat kelas, kehadiran 30 hari terakhir, tunggakan, nilai terbaru, dan pengumuman untuk portal. Rincian per anak punya tab Absensi, Nilai, Tagihan (beserta kwitansi), Rapor yang sudah final, Tahfidz, dan Kabar. Bagian tertentu hanya muncul bila modulnya aktif di sekolah.',
          },
          {
            heading: 'Mencabut undangan atau akun portal',
            body: 'Halaman Akun portal menampilkan Undangan (Menunggu, Dipakai, Kedaluwarsa, Dicabut) dan Akun aktif. Undangan yang belum dipakai dapat dicabut, dan akun yang sudah jadi dapat dicabut aksesnya.',
            steps: [
              'Buka menu Akun portal.',
              'Pada daftar Undangan, klik Cabut. Atau pada Akun aktif, klik Cabut akun.',
              'Konfirmasi pencabutan.',
            ],
            warning:
              'Setelah akun dicabut, orang itu tidak dapat membuka portal lagi, dan bila tidak punya peran lain di sekolah ia tidak bisa masuk. Wali atau siswa tetap dapat diundang ulang.',
            href: '/portal-admin',
          },
        ],
        faq: [
          {
            q: 'Wali tidak muncul di pilihan saat mengundang. Kenapa?',
            a: 'Siswa itu belum punya wali di datanya. Buka halaman Siswa, tambahkan wali (nama dan nomor ponselnya), lalu kembali ke Akun portal.',
          },
          {
            q: 'Wali kehilangan tautan undangan. Bagaimana?',
            a: 'Tautan hanya tampil sekali dan tidak bisa dilihat lagi. Buat undangan baru untuk orang yang sama. Undangan lama yang belum dipakai otomatis dicabut.',
          },
          {
            q: 'Wali mengatakan tautan tidak berlaku. Apa penyebabnya?',
            a: 'Tautan sudah dipakai, dicabut, atau melewati 14 hari. Lihat statusnya di daftar Undangan, lalu buat undangan baru bila perlu.',
          },
          {
            q: 'Wali sudah punya akun tetapi lupa kata sandi. Bagaimana?',
            a: 'Minta wali memakai pilihan lupa kata sandi di halaman masuk. Kode akan dikirim ke email akunnya, lalu wali dapat membuat kata sandi baru.',
          },
          {
            q: 'Wali tidak melihat tagihan atau nilai anaknya. Kenapa?',
            a: 'Setiap bagian portal hanya aktif bila modulnya aktif di sekolah. Tagihan memakai data keuangan sekolah dan hanya rapor yang sudah final yang tampil. Tanyakan kepada admin sekolah apakah modulnya sudah dinyalakan.',
          },
        ],
      },
      en: {
        title: 'Parent and student portal',
        summary:
          'A guide to inviting guardians or students so they can view attendance, grades, invoices, and report cards on their phone. Requires the Attendance module.',
        forWho: 'School admin and Operator who manage student data.',
        sections: [
          {
            heading: 'Inviting a guardian or student',
            body: 'An invitation is a single-use link for one person, valid for 14 days. The guardian being invited must already be recorded on the student data in the Students page.',
            steps: [
              'Open the Portal accounts menu, then type the student name, student number, or NISN in the Find student field.',
              'Pick the guardian to invite, or the student themselves.',
              'Fill in Email if the invitation should only be accepted with that email (it can be left empty).',
              'Click Create link, then click Copy and send the link to the invited person.',
            ],
            warning:
              'The invitation link is shown only once. Copy it before closing the window. If it is lost, create a new invitation.',
            href: '/portal-admin',
          },
          {
            heading: 'Helping a guardian accept the invitation',
            body: 'The invited person opens the link and sees the school name and the linked student. They create their own account, or link an existing one if the email is already registered.',
            steps: [
              'Open the invitation link from the school.',
              'Fill in the Full name and a password (at least 12 characters). The email used to sign in is already filled from the invitation if you entered one.',
              'Click Create account and sign in. If the email already has an account, enter that account password and click Accept and sign in.',
            ],
            tip: 'Guide guardians by phone or message the first time. After that they can sign in by themselves at any time.',
          },
          {
            heading: 'Knowing what guardians and students see',
            body: 'A guardian sees the children linked to their record, while a student sees only themselves. The home page shows the class, the last 30 days of attendance, arrears, the latest grades, and announcements for the portal. Each child has tabs for Attendance, Grades, Invoices (with receipts), finalized Report cards, Tahfidz, and News. Some parts only appear when their module is active at the school.',
          },
          {
            heading: 'Revoking an invitation or portal account',
            body: 'The Portal accounts page shows Invitations (Pending, Used, Expired, Revoked) and Active accounts. An unused invitation can be revoked, and an existing account can have its access revoked.',
            steps: [
              'Open the Portal accounts menu.',
              'In the Invitations list, click Revoke. Or in Active accounts, click Revoke account.',
              'Confirm the revoking.',
            ],
            warning:
              'Once an account is revoked, that person can no longer open the portal, and if they have no other role at the school they cannot sign in. The guardian or student can still be invited again.',
            href: '/portal-admin',
          },
        ],
        faq: [
          {
            q: 'The guardian does not appear in the choices when inviting. Why?',
            a: 'That student has no guardian in their data yet. Open the Students page, add the guardian (name and mobile number), then return to Portal accounts.',
          },
          {
            q: 'A guardian lost the invitation link. What now?',
            a: 'The link is shown only once and cannot be viewed again. Create a new invitation for the same person. Older unused invitations are revoked automatically.',
          },
          {
            q: 'A guardian says the link is not valid. What is the cause?',
            a: 'The link was already used, revoked, or older than 14 days. Check its status in the Invitations list, then create a new invitation if needed.',
          },
          {
            q: 'A guardian already has an account but forgot the password. What now?',
            a: 'Ask the guardian to use the forgot password option on the sign-in page. A code is sent to the email of the account, and then they can set a new password.',
          },
          {
            q: 'A guardian does not see the invoices or grades of their child. Why?',
            a: 'Each part of the portal is only active when its module is active at the school. Invoices use the school finance data and only finalized report cards are shown. Ask the school admin whether the module has been switched on.',
          },
        ],
      },
      su: {
        title: 'Portal wali jeung siswa',
        summary:
          'Pituduh ngauleman wali atawa siswa supaya tiasa ningali kahadiran, nilai, tagihan, jeung rapor lewat ponsel. Peryogi modul Absénsi.',
        forWho: 'Admin sakola jeung Operator nu ngokolakeun data siswa.',
        sections: [
          {
            heading: 'Ngauleman wali atawa siswa',
            body: 'Uleman mangrupa tautan sakali pake pikeun hiji jalma, lumaku 14 poé. Wali nu diuleman kedah parantos kacatet dina data siswa di kaca Siswa.',
            steps: [
              'Buka menu Akun portal, tuluy ketik nami, NIS, atawa NISN siswa dina kolom Golédah siswa.',
              'Pilih wali nu diuleman, atawa pilih siswa sorangan.',
              'Eusian Email upami hoyong uleman ngan tiasa ditampi ku email eta (tiasa dikosongkeun).',
              'Klik Jieun tautan, tuluy klik Salin sarta kirim tautanna ka jalma nu diuleman.',
            ],
            warning:
              'Tautan uleman ngan mucunghul sakali. Salin heula samemeh nutup jandélana. Upami leungit, jieun uleman anyar.',
            href: '/portal-admin',
          },
          {
            heading: 'Mantuan wali narima uleman',
            body: 'Jalma nu diuleman muka tautan, tuluy ningali nami sakola jeung siswa nu tertaut. Maranéhna nyieun akun sorangan, atawa nautkeun akun nu parantos aya upami emailna parantos kadaptar.',
            steps: [
              'Buka tautan uleman ti sakola.',
              'Eusian Nami lengkep jeung kecap sandi (sahenteuna 12 karakter). Email nu dipake asup parantos kaeusi tina uleman upami anjeun ngeusianana.',
              'Klik Jieun akun jeung asup. Upami email eta parantos gaduh akun, asupkeun kecap sandi akun eta tuluy klik Tampi jeung asup.',
            ],
            tip: 'Tuyun wali ngaliwatan telepon atawa pesen waktu mimiti. Saparantosna maranéhna tiasa asup sorangan iraha waé.',
          },
          {
            heading: 'Terang naon nu katingali ku wali jeung siswa',
            body: 'Wali ningali anak nu tertaut kana datana, sedengkeun siswa ngan ningali dirina sorangan. Béréndang ngandung kelas, kahadiran 30 poé katukang, tunggakan, nilai pangahirna, jeung pengumuman pikeun portal. Rincian per anak gaduh tab Absénsi, Nilai, Tagihan (jeung kwitansi), Rapor nu parantos final, Tahfidz, jeung Warta. Bagian tangtu ngan mucunghul upami modulna aktif di sakola.',
          },
          {
            heading: 'Nyabut uleman atawa akun portal',
            body: 'Kaca Akun portal mintonkeun Uleman (Ngantosan, Dipake, Kadaluwarsa, Dicabut) jeung Akun aktif. Uleman nu acan dipake tiasa dicabut, sarta akun nu parantos dijieun tiasa dicabut aksésna.',
            steps: [
              'Buka menu Akun portal.',
              'Dina daptar Uleman, klik Cabut. Atawa dina Akun aktif, klik Cabut akun.',
              'Konfirmasi pencabutan.',
            ],
            warning:
              'Saparantos akun dicabut, jalma eta teu tiasa muka portal deui, sarta upami teu gaduh peran sanes di sakola manehna teu tiasa asup. Wali atawa siswa tetep tiasa diuleman deui.',
            href: '/portal-admin',
          },
        ],
        faq: [
          {
            q: 'Wali teu mucunghul dina pilihan waktu ngauleman. Naha?',
            a: 'Siswa eta acan gaduh wali dina datana. Buka kaca Siswa, tambihkeun wali (nami jeung nomer ponselna), tuluy balik ka Akun portal.',
          },
          {
            q: 'Wali leungit tautan uleman. Kumaha?',
            a: 'Tautan ngan mucunghul sakali sarta teu tiasa ditingali deui. Jieun uleman anyar pikeun jalma nu sarua. Uleman lami nu acan dipake otomatis dicabut.',
          },
          {
            q: 'Wali nyarios tautan teu lumaku. Naon sababna?',
            a: 'Tautan parantos dipake, dicabut, atawa langkung ti 14 poé. Tingali statusna dina daptar Uleman, tuluy jieun uleman anyar upami peryogi.',
          },
          {
            q: 'Wali parantos gaduh akun tapi hilap kecap sandi. Kumaha?',
            a: 'Pénta wali maké pilihan hilap kecap sandi dina kaca asup. Kode bakal dikirim ka email akunna, tuluy wali tiasa nyieun kecap sandi anyar.',
          },
          {
            q: 'Wali teu ningali tagihan atawa nilai anakna. Naha?',
            a: 'Unggal bagian portal ngan aktif upami modulna aktif di sakola. Tagihan maké data kauangan sakola jeung ngan rapor nu parantos final nu mucunghul. Tanyakeun ka admin sakola naha modulna parantos dihurungkeun.',
          },
        ],
      },
    },
  },
  {
    slug: 'website',
    icon: 'globe',
    tone: 'slate',
    group: 'services',
    module: 'website',
    text: {
      id: {
        title: 'Website sekolah',
        summary:
          'Panduan mengatur halaman depan situs sekolah, menerbitkannya, dan memakai alamat milik sekolah sendiri.',
        forWho: 'Admin sekolah dan Operator yang mengurus situs publik sekolah.',
        sections: [
          {
            heading: 'Mengisi profil situs sekolah',
            body: 'Halaman Situs sekolah punya pratinjau langsung tampilan beranda di ponsel, jadi Anda dapat melihat hasilnya sambil mengisi. Perubahan baru berlaku setelah disimpan.',
            steps: [
              'Buka menu Situs sekolah, lalu isi Slogan dan pilih Warna aksen (atau tulis Kode warna #RRGGBB).',
              'Isi Tentang sekolah, Visi, dan Misi. Tulis satu poin misi per baris.',
              'Isi kontak: Alamat, Telepon, Email, WhatsApp, dan Tautan peta yang diawali http:// atau https://.',
              'Klik Simpan perubahan.',
            ],
            tip: 'Untuk Tautan peta, tempel tautan dari Google Maps. Tautan "Sematkan peta" akan tampil sebagai peta langsung.',
            href: '/site-settings',
          },
          {
            heading: 'Menerbitkan situs',
            body: 'Situs baru dapat dilihat pengunjung setelah diterbitkan. Selama belum diterbitkan, alamat situs hanya menampilkan bahwa situs tidak tersedia.',
            steps: [
              'Buka menu Situs sekolah, lalu cari bagian Publikasi.',
              'Nyalakan saklar Publikasikan situs.',
              'Klik Simpan perubahan.',
              'Klik Buka situs publik untuk memeriksa tampilannya, atau Salin tautan untuk membagikan alamat situs.',
            ],
            warning:
              'Mematikan Publikasikan situs membuat situs tidak dapat dibuka pengunjung, termasuk tautan pendaftaran yang sudah dibagikan.',
            href: '/site-settings',
          },
          {
            heading: 'Mengetahui isi situs yang tampil',
            body: 'Beranda menampilkan slogan, tentang sekolah, visi, misi, dan kontak dari profil. Berita dan agenda diambil dari menu Pengumuman (yang Audiens-nya Publik atau Semua). Tombol Daftar murid baru muncul bila modul SPMB aktif dan ada periode pendaftaran yang sedang dibuka. Tanpa modul Pengumuman, bagian berita dan agenda kosong.',
          },
          {
            heading: 'Memakai alamat milik sekolah sendiri',
            body: 'Situs sekolah, pendaftaran SPMB, dan pemeriksaan keaslian surat dapat tampil di alamat milik sekolah, misalnya www.sekolahanda.sch.id. Paling banyak 3 alamat. Alamat ini harus sudah dibeli sekolah dari penyedia nama domain. DNS adalah pengaturan di tempat Anda membeli alamat itu yang mengarahkan alamat ke situs sekolah.',
            steps: [
              'Di halaman Situs sekolah, klik Kelola domain, lalu isi Nama domain tanpa http:// dan tanpa garis miring.',
              'Klik Tambah. Salin dua catatan DNS yang ditampilkan.',
              'Pasang kedua catatan itu di pengaturan DNS tempat alamat Anda dibeli (atau minta bantuan penyedianya).',
              'Tunggu beberapa menit hingga beberapa jam, lalu klik Periksa sekarang. Status berubah menjadi Terverifikasi bila kedua catatan sesuai.',
            ],
            tip: 'Bila pemeriksaan menunjukkan Belum sesuai, bandingkan kolom Diharapkan dengan Ditemukan lalu perbaiki catatan DNS-nya. Anda dapat memeriksa lagi kapan saja.',
            warning:
              'Dasbor sekolah dan halaman masuk tetap memakai alamat Edusync, dan alamat itu tetap bisa dipakai walau alamat milik sekolah dihapus. Menghapus alamat milik sekolah membuat situs tidak tampil lagi di sana.',
            href: '/site-settings/domains',
          },
        ],
        faq: [
          {
            q: 'Pengunjung melihat tulisan situs tidak tersedia. Kenapa?',
            a: 'Situs belum diterbitkan. Buka Situs sekolah, nyalakan Publikasikan situs di bagian Publikasi, lalu klik Simpan perubahan.',
          },
          {
            q: 'Saya sudah mengisi profil, tetapi tampilan situs belum berubah. Kenapa?',
            a: 'Perubahan baru berlaku setelah Anda mengklik Simpan perubahan. Bila ada tulisan "Ada perubahan yang belum disimpan", simpan dulu.',
          },
          {
            q: 'Berita dan agenda tidak muncul di situs. Apa yang harus diperiksa?',
            a: 'Berita dan agenda berasal dari menu Pengumuman. Pastikan pengumumannya sudah Terbit dan Audiens-nya Publik atau Semua, serta modul Pengumuman aktif di sekolah.',
          },
          {
            q: 'Tombol Daftar murid baru tidak muncul. Kenapa?',
            a: 'Tombol itu hanya muncul bila modul SPMB aktif dan ada periode pendaftaran yang sedang dibuka. Periksa menu Periode SPMB.',
          },
          {
            q: 'Status alamat sendiri tetap Belum sesuai. Apa yang salah?',
            a: 'Catatan DNS belum sama dengan yang diminta. Buka Kelola domain, lihat hasil pemeriksaan (Diharapkan dan Ditemukan), perbaiki catatannya di tempat alamat dibeli, tunggu, lalu klik Periksa sekarang lagi.',
          },
        ],
      },
      en: {
        title: 'School website',
        summary:
          'A guide to setting up the front page of the school website, publishing it, and using an address the school owns.',
        forWho: 'School admin and Operator who look after the public school website.',
        sections: [
          {
            heading: 'Filling in the site profile',
            body: 'The School website page has a live preview of the home page on a phone, so you can see the result while filling it in. Changes only take effect once saved.',
            steps: [
              'Open the School website menu, then fill in the Tagline and choose an Accent color (or write a Color code #RRGGBB).',
              'Fill in About the school, Vision, and Mission. Write one mission point per line.',
              'Fill in the contacts: Address, Phone, Email, WhatsApp, and a Map link that starts with http:// or https://.',
              'Click Save changes.',
            ],
            tip: 'For the Map link, paste a link from Google Maps. An "Embed map" link will show as a live map.',
            href: '/site-settings',
          },
          {
            heading: 'Publishing the site',
            body: 'The site can be seen by visitors once it is published. Until then, the site address only shows that the site is unavailable.',
            steps: [
              'Open the School website menu, then find the Publication part.',
              'Switch on Publish site.',
              'Click Save changes.',
              'Click Open public site to check how it looks, or Copy link to share the site address.',
            ],
            warning:
              'Switching Publish site off makes the site unavailable to visitors, including application links that were already shared.',
            href: '/site-settings',
          },
          {
            heading: 'Knowing what the site shows',
            body: 'The home page shows the tagline, about, vision, mission, and contacts from the profile. News and agenda come from the Announcements menu (those with the Public or All audience). The Register new students button appears when the Admissions module is active and an application period is open. Without the Announcements module, the news and agenda parts are empty.',
          },
          {
            heading: 'Using an address the school owns',
            body: 'The school website, admissions registration, and letter authenticity checks can appear at an address the school owns, for example www.yourschool.sch.id. Up to 3 addresses. The address must already be bought by the school from a domain name provider. DNS is the setting where you bought the address that points the address to the school site.',
            steps: [
              'On the School website page, click Manage domains, then fill in the Domain name without http:// and without a slash.',
              'Click Add. Copy the two DNS records shown.',
              'Set both records in the DNS settings where your address was bought (or ask the provider for help).',
              'Wait a few minutes to a few hours, then click Check now. The status becomes Verified when both records match.',
            ],
            tip: 'If the check shows Not matching, compare the Expected column with Found and fix the DNS records. You can check again at any time.',
            warning:
              'The school dashboard and sign-in page keep using the Edusync address, and that address still works even if the school own address is removed. Removing the school own address means the site no longer shows there.',
            href: '/site-settings/domains',
          },
        ],
        faq: [
          {
            q: 'Visitors see that the site is unavailable. Why?',
            a: 'The site is not published yet. Open School website, switch on Publish site in the Publication part, then click Save changes.',
          },
          {
            q: 'I filled in the profile, but the site has not changed. Why?',
            a: 'Changes only take effect after you click Save changes. If you see "There are unsaved changes", save first.',
          },
          {
            q: 'News and agenda do not show on the site. What should I check?',
            a: 'News and agenda come from the Announcements menu. Make sure the announcement is Published with the Public or All audience, and the Announcements module is active at the school.',
          },
          {
            q: 'The Register new students button does not appear. Why?',
            a: 'That button only appears when the Admissions module is active and an application period is open. Check the Admission periods menu.',
          },
          {
            q: 'The status of our own address stays Not matching. What is wrong?',
            a: 'The DNS records are not yet the same as requested. Open Manage domains, read the check result (Expected and Found), fix the records where the address was bought, wait, then click Check now again.',
          },
        ],
      },
      su: {
        title: 'Situs sakola',
        summary:
          'Pituduh ngatur kaca hareup situs sakola, nerbitkeunana, jeung maké alamat milik sakola sorangan.',
        forWho: 'Admin sakola jeung Operator nu ngurus situs umum sakola.',
        sections: [
          {
            heading: 'Ngeusian profil situs sakola',
            body: 'Kaca Situs sakola gaduh pratinjau langsung tampilan béréndang dina ponsel, jadi anjeun tiasa ningali hasilna bari ngeusian. Parobahan ngan lumaku saparantos disimpen.',
            steps: [
              'Buka menu Situs sakola, tuluy eusian Slogan jeung pilih Warna aksen (atawa tulis Kode warna #RRGGBB).',
              'Eusian Ngeunaan sakola, Visi, jeung Misi. Tulis hiji poin misi per baris.',
              'Eusian kontak: Alamat, Telepon, Email, WhatsApp, jeung Tautan peta nu dimimitian ku http:// atawa https://.',
              'Klik Simpen parobahan.',
            ],
            tip: 'Pikeun Tautan peta, tempelkeun tautan tina Google Maps. Tautan "Sematkan peta" bakal mucunghul jadi peta langsung.',
            href: '/site-settings',
          },
          {
            heading: 'Nerbitkeun situs',
            body: 'Situs tiasa ditingali ku nu nganjang saparantos diterbitkeun. Samemeh kitu, alamat situs ngan mintonkeun yén situs teu sayogi.',
            steps: [
              'Buka menu Situs sakola, tuluy golédah bagian Publikasi.',
              'Hurungkeun saklar Terbitkeun situs.',
              'Klik Simpen parobahan.',
              'Klik Buka situs umum pikeun mariksa tampilanna, atawa Salin tautan pikeun ngabagikeun alamat situs.',
            ],
            warning:
              'Mareuman Terbitkeun situs ngajadikeun situs teu tiasa dibuka ku nu nganjang, kaasup tautan pendaptaran nu parantos dibagikeun.',
            href: '/site-settings',
          },
          {
            heading: 'Terang eusi situs nu mucunghul',
            body: 'Béréndang mintonkeun slogan, ngeunaan sakola, visi, misi, jeung kontak tina profil. Warta jeung agenda dicandak tina menu Pengumuman (nu Pamiarsana Umum atawa Sadayana). Tombol Daptar murid anyar mucunghul upami modul SPMB aktif jeung aya periode pendaptaran nu kabuka. Tanpa modul Pengumuman, bagian warta jeung agenda kosong.',
          },
          {
            heading: 'Maké alamat milik sakola sorangan',
            body: 'Situs sakola, pendaptaran SPMB, jeung pamariksaan kaaslian surat tiasa mucunghul dina alamat milik sakola, contona www.sakolaanjeun.sch.id. Paling seueur 3 alamat. Alamat ieu kedah parantos dipeuli ku sakola ti panyadia nami domain. DNS nya éta pangaturan di tempat anjeun meuli alamat eta nu ngarahkeun alamat ka situs sakola.',
            steps: [
              'Dina kaca Situs sakola, klik Kokolakeun domain, tuluy eusian Nami domain tanpa http:// jeung tanpa garis miring.',
              'Klik Tambah. Salin dua catetan DNS nu dipintonkeun.',
              'Pasang dua catetan eta dina pangaturan DNS tempat alamat anjeun dipeuli (atawa pénta bantosan panyadiana).',
              'Antosan sababaraha menit dugi ka sababaraha jam, tuluy klik Pariksa ayeuna. Status robah jadi Terverifikasi upami dua catetan eta cocog.',
            ],
            tip: 'Upami pamariksaan nunjukkeun Acan cocog, bandingkeun kolom Diarepkeun jeung Kapanggih tuluy benerkeun catetan DNS-na. Tiasa mariksa deui iraha waé.',
            warning:
              'Dasbor sakola jeung kaca asup tetep maké alamat Edusync, sarta alamat eta tetep tiasa dipake sanajan alamat milik sakola dihapus. Ngahapus alamat milik sakola ngajadikeun situs teu mucunghul deui di dinya.',
            href: '/site-settings/domains',
          },
        ],
        faq: [
          {
            q: 'Nu nganjang ningali tulisan situs teu sayogi. Naha?',
            a: 'Situs acan diterbitkeun. Buka Situs sakola, hurungkeun Terbitkeun situs dina bagian Publikasi, tuluy klik Simpen parobahan.',
          },
          {
            q: 'Abdi parantos ngeusian profil, tapi tampilan situs acan robah. Naha?',
            a: 'Parobahan ngan lumaku saparantos anjeun klik Simpen parobahan. Upami aya tulisan "Aya parobahan nu acan disimpen", simpen heula.',
          },
          {
            q: 'Warta jeung agenda teu mucunghul di situs. Naon nu kedah dipariksa?',
            a: 'Warta jeung agenda asalna tina menu Pengumuman. Pastikeun pengumumanana parantos Terbit jeung Pamiarsana Umum atawa Sadayana, sarta modul Pengumuman aktif di sakola.',
          },
          {
            q: 'Tombol Daptar murid anyar teu mucunghul. Naha?',
            a: 'Tombol eta ngan mucunghul upami modul SPMB aktif jeung aya periode pendaptaran nu kabuka. Pariksa menu Periode SPMB.',
          },
          {
            q: 'Status alamat sorangan tetep Acan cocog. Naon nu lepat?',
            a: 'Catetan DNS acan sarua jeung nu dipénta. Buka Kokolakeun domain, tingali hasil pamariksaan (Diarepkeun jeung Kapanggih), benerkeun catetanana di tempat alamat dipeuli, antosan, tuluy klik Pariksa ayeuna deui.',
          },
        ],
      },
    },
  },
];
