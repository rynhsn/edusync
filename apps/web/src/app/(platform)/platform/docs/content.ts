import type { DocArticle } from '@/lib/docs-types';

/** Dokumentasi konsol platform, satu artikel per modul konsol. Isi: id, en, su. */
export const PLATFORM_DOCS: DocArticle[] = [
  {
    slug: 'overview',
    icon: 'rocket',
    tone: 'teal',
    text: {
      id: {
        title: 'Ikhtisar konsol',
        summary: 'Peran staf platform, alur kerja harian, dan peta modul konsol.',
        sections: [
          {
            heading: 'Dua peran staf',
            body: 'Admin platform bisa melihat sekaligus mengubah: menangguhkan unit, mengaktifkan tanpa pembayaran, mengubah katalog, pembayaran, pesan, dan bank kurikulum. Peran Hanya lihat dapat membuka semua halaman tetapi tombol ubahnya tidak muncul. Peran Anda tampil di bagian bawah menu.',
            href: '/platform',
          },
          {
            heading: 'Alur kerja harian',
            body: 'Mulai dari Ringkasan platform, lalu tangani hal yang butuh tindakan.',
            steps: [
              'Buka Lembaga & unit dan baca kartu ringkasan: unit ditangguhkan, invoice terbuka, dan pendaftaran tertunda.',
              'Buka Pendaftaran tertunda bila angkanya lebih dari nol.',
              'Periksa lembaga yang berstatus Masa tenggang atau punya unit ditangguhkan.',
              'Tinjau Audit untuk memastikan tindakan hari ini tercatat.',
            ],
            href: '/platform',
          },
          {
            heading: 'Peta modul',
            body: 'Menu dibagi menjadi Operasi (Lembaga & unit, Pendaftaran tertunda, Pembayaran), Katalog (Harga & modul, Bank kurikulum), dan Sistem (WhatsApp, Audit). Setiap modul punya artikel sendiri di dokumentasi ini.',
          },
          {
            heading: 'Bantuan',
            body: 'Panduan operator berisi daftar periksa singkat untuk aktivasi komplimen, penangguhan, perubahan katalog, dan WhatsApp. Centang di sana hanya tersimpan di peramban Anda.',
            href: '/platform/guide',
          },
        ],
      },
      en: {
        title: 'Console overview',
        summary: 'Platform staff roles, the daily workflow, and a map of the console modules.',
        sections: [
          {
            heading: 'Two staff roles',
            body: 'A platform admin can view and change things: suspend units, activate without payment, and edit the catalog, payments, messaging, and curriculum bank. The Read only role can open every page but the edit buttons do not appear. Your role is shown at the bottom of the menu.',
            href: '/platform',
          },
          {
            heading: 'Daily workflow',
            body: 'Start from the Platform overview, then handle whatever needs action.',
            steps: [
              'Open Foundations & units and read the summary cards: suspended units, open invoices, and pending registrations.',
              'Open Pending registrations if the count is above zero.',
              'Check foundations in Grace period or with suspended units.',
              'Review the Audit page to confirm today actions were recorded.',
            ],
            href: '/platform',
          },
          {
            heading: 'Module map',
            body: 'The menu is grouped into Operations (Foundations & units, Pending registrations, Payments), Catalog (Prices & modules, Curriculum bank), and System (WhatsApp, Audit). Each module has its own article in this documentation.',
          },
          {
            heading: 'Help',
            body: 'The operator guide has short checklists for complimentary activation, suspension, catalog changes, and WhatsApp. Ticks there are only saved in your browser.',
            href: '/platform/guide',
          },
        ],
      },
      su: {
        title: 'Ihtisar konsol',
        summary: 'Peran staf platform, alur damel unggal poé, jeung peta modul konsol.',
        sections: [
          {
            heading: 'Dua peran staf',
            body: 'Admin platform tiasa ningali sareng ngarobih: nangguhkeun unit, ngaktipkeun tanpa pamayaran, ngarobih katalog, pamayaran, pesen, jeung bank kurikulum. Peran Ngan ningali tiasa muka sadaya kaca tapi tombol robahna teu aya. Peran anjeun katingali di handapeun menu.',
            href: '/platform',
          },
          {
            heading: 'Alur damel unggal poé',
            body: 'Mimitian ti Ringkesan platform, tuluy tangani nu peryogi tindakan.',
            steps: [
              'Buka Lembaga & unit tuluy baca kartu ringkesan: unit ditangguhkeun, invoice muka, jeung pendaptaran nunggu.',
              'Buka Pendaptaran nunggu lamun angkana leuwih ti nol.',
              'Pariksa lembaga nu statusna Mangsa tenggang atawa nu unitna ditangguhkeun.',
              'Tilik Audit pikeun mastikeun tindakan dinten ieu kacatet.',
            ],
            href: '/platform',
          },
          {
            heading: 'Peta modul',
            body: 'Menu dibagi jadi Operasi (Lembaga & unit, Pendaptaran nunggu, Pamayaran), Katalog (Harga & modul, Bank kurikulum), jeung Sistem (WhatsApp, Audit). Unggal modul boga artikel sorangan dina dokuméntasi ieu.',
          },
          {
            heading: 'Pitulung',
            body: 'Pituduh operator eusina daptar pariksa singget pikeun aktivasi komplimen, penangguhan, parobahan katalog, jeung WhatsApp. Centang di dinya ngan disimpen dina pangotéh anjeun.',
            href: '/platform/guide',
          },
        ],
      },
    },
  },
  {
    slug: 'foundations',
    icon: 'building',
    tone: 'sky',
    text: {
      id: {
        title: 'Lembaga & unit',
        summary:
          'Memantau lembaga, membuka detail, serta menangguhkan atau mengaktifkan kembali unit sekolah.',
        sections: [
          {
            heading: 'Kartu ringkasan',
            body: 'Di atas daftar ada enam kartu: jumlah lembaga, unit aktif, unit ditangguhkan, invoice terbuka, MRR perkiraan, dan pendaftaran tertunda. MRR dihitung dari tagihan terbayar terakhir tiap langganan aktif, tanpa komplimen. Kartu pendaftaran tertunda bisa diklik.',
            href: '/platform',
          },
          {
            heading: 'Mencari dan menyaring',
            body: 'Daftar menampilkan nama dan alamat lembaga, jumlah unit, status langganan, tanggal periode berakhir, dan invoice terbuka.',
            steps: [
              'Ketik nama atau alamat lembaga di kolom Cari lembaga.',
              'Pilih status langganan: Aktif, Masa tenggang, Ditangguhkan, Dibatalkan, atau Tanpa langganan.',
              'Buka menu aksi di baris lembaga lalu pilih Lihat detail atau Salin alamat.',
              'Klik Hapus saringan bila hasil kosong.',
            ],
            href: '/platform',
          },
          {
            heading: 'Detail lembaga',
            body: 'Detail memuat langganan (bulanan atau tahunan dan tanggal berakhir), daftar unit, invoice terbaru, pembayaran, dan modul aktif per unit beserta masa berlakunya. Pembayaran komplimen ditandai Tanpa pembayaran (komplimen).',
          },
          {
            heading: 'Menangguhkan dan mengaktifkan unit',
            body: 'Hanya Admin platform yang melihat tombolnya. Penangguhan oleh staf membuat sekolah langsung tidak bisa dipakai dan tidak dilepas oleh pembayaran; penangguhan karena tagihan terbuka kembali setelah tagihan dibayar. Alasan wajib diisi dan tercatat di audit.',
            steps: [
              'Buka Lihat detail pada lembaga yang dimaksud.',
              'Di bagian Unit, klik Tangguhkan atau Aktifkan kembali pada unit yang tepat.',
              'Tulis Alasan yang jelas.',
              'Klik tombol konfirmasi di dialog.',
              'Cek halaman Audit untuk memastikan catatannya muncul.',
            ],
            href: '/platform',
          },
        ],
      },
      en: {
        title: 'Foundations & units',
        summary: 'Monitor foundations, open their details, and suspend or reactivate school units.',
        sections: [
          {
            heading: 'Summary cards',
            body: 'Above the list are six cards: foundations, active units, suspended units, open invoices, estimated MRR, and pending registrations. MRR is calculated from the last paid invoice of each active subscription, excluding complimentary ones. The pending registrations card is clickable.',
            href: '/platform',
          },
          {
            heading: 'Searching and filtering',
            body: 'The list shows each foundation name and address, number of units, subscription status, period end date, and open invoices.',
            steps: [
              'Type a foundation name or address in the Search foundations field.',
              'Pick a subscription status: Active, Grace period, Suspended, Canceled, or No subscription.',
              'Open the row action menu and choose View detail or Copy address.',
              'Click Clear filters when the result is empty.',
            ],
            href: '/platform',
          },
          {
            heading: 'Foundation detail',
            body: 'The detail shows the subscription (monthly or yearly and end date), the unit list, recent invoices, payments, and active modules per unit with their validity date. Complimentary payments are labelled No payment (complimentary).',
          },
          {
            heading: 'Suspending and reactivating units',
            body: 'Only Platform admins see the buttons. A staff suspension makes the school unusable at once and payment does not lift it; a billing suspension lifts after the invoice is paid. A reason is required and recorded in the audit.',
            steps: [
              'Open View detail on the foundation.',
              'In the Units section, click Suspend or Reactivate on the right unit.',
              'Write a clear Reason.',
              'Click the confirm button in the dialog.',
              'Check the Audit page to confirm the entry appears.',
            ],
            href: '/platform',
          },
        ],
      },
      su: {
        title: 'Lembaga & unit',
        summary: 'Mantuan lembaga, muka detailna, jeung nangguhkeun atawa ngaktipkeun deui unit sakola.',
        sections: [
          {
            heading: 'Kartu ringkesan',
            body: 'Di luhureun daptar aya genep kartu: jumlah lembaga, unit aktip, unit ditangguhkeun, invoice muka, MRR kira-kira, jeung pendaptaran nunggu. MRR diitung tina tagihan anu dibayar pangeusina unggal langganan aktip, tanpa komplimen. Kartu pendaptaran nunggu bisa diklik.',
            href: '/platform',
          },
          {
            heading: 'Milarian jeung nyaring',
            body: 'Daptar nembongkeun ngaran jeung alamat lembaga, jumlah unit, status langganan, tanggal mangsa réngsé, jeung invoice muka.',
            steps: [
              'Ketik ngaran atawa alamat lembaga dina kolom Cari lembaga.',
              'Pilih status langganan: Aktip, Mangsa tenggang, Ditangguhkeun, Dibatalkeun, atawa Tanpa langganan.',
              'Buka menu aksi dina baris lembaga tuluy pilih Tingali detail atawa Salin alamat.',
              'Klik Busékeun saringan lamun hasilna kosong.',
            ],
            href: '/platform',
          },
          {
            heading: 'Detail lembaga',
            body: 'Detail eusina langganan (bulanan atawa taunan jeung tanggal réngsé), daptar unit, invoice panganyarna, pamayaran, jeung modul aktip unggal unit sareng mangsa lakuna. Pamayaran komplimen ditandaan Tanpa pamayaran (komplimen).',
          },
          {
            heading: 'Nangguhkeun jeung ngaktipkeun unit',
            body: 'Ngan Admin platform nu ningali tombolna. Penangguhan ku staf ngajadikeun sakola langsung teu bisa dipaké jeung teu dileupaskeun ku pamayaran; penangguhan alatan tagihan dibuka deui sanggeus tagihan dibayar. Alesan wajib dieusian jeung kacatet dina audit.',
            steps: [
              'Buka Tingali detail dina lembaga nu dimaksud.',
              'Dina bagian Unit, klik Tangguhkeun atawa Aktipkeun deui dina unit nu pas.',
              'Tulis Alesan nu écés.',
              'Klik tombol konfirmasi dina dialog.',
              'Pariksa kaca Audit pikeun mastikeun catetanana muncul.',
            ],
            href: '/platform',
          },
        ],
      },
    },
  },
  {
    slug: 'registrations',
    icon: 'clipboard',
    tone: 'violet',
    text: {
      id: {
        title: 'Pendaftaran tertunda',
        summary:
          'Pendaftaran lembaga yang belum dibayar, dan cara mengaktifkannya tanpa pembayaran untuk sekolah pilot.',
        sections: [
          {
            heading: 'Apa isi halaman ini',
            body: 'Halaman ini mendaftar pendaftaran yang belum dibayar. Tiap kartu menampilkan nama lembaga, jumlah unit, siklus (bulanan atau tahunan), tanggal kedaluwarsa, dan tanggal dibuat. Lembaga baru muncul di daftar Lembaga & unit setelah pendaftarannya dibayar atau diaktifkan tanpa pembayaran.',
            href: '/platform/pending',
          },
          {
            heading: 'Tidak ada tombol setujui atau tolak',
            body: 'Konsol tidak memiliki langkah setujui atau tolak. Satu-satunya tindakan staf adalah aktivasi tanpa pembayaran. Pendaftaran yang tidak dibayar sampai kedaluwarsa akan dilepas alamat sekolahnya; pendaftar harus mendaftar ulang. Lama masa pesanan diatur di parameter penagihan.',
          },
          {
            heading: 'Aktivasi tanpa pembayaran',
            body: 'Hanya untuk sekolah pilot atau mitra yang tidak membayar, dan hanya Admin platform yang melihat tombolnya. Aktivasi dicatat sebagai pembayaran komplimen senilai nol, di riwayat pembayaran dan di audit beserta alasan. Peran Hanya lihat melihat catatan bahwa perannya hanya dapat melihat.',
            steps: [
              'Pastikan pendaftaran memang pilot atau sudah disetujui di luar konsol.',
              'Pada kartu pendaftaran, klik Aktifkan tanpa pembayaran.',
              'Tulis alasan yang jelas, misalnya siapa yang menyetujui dan sampai kapan.',
              'Klik Konfirmasi.',
              'Cek lembaga di Lembaga & unit dan catat tanggal perpanjangannya.',
            ],
            href: '/platform/pending',
          },
        ],
      },
      en: {
        title: 'Pending registrations',
        summary:
          'Foundation registrations that have not been paid, and how to activate them without payment for pilot schools.',
        sections: [
          {
            heading: 'What this page lists',
            body: 'This page lists registrations that are still unpaid. Each card shows the foundation name, number of units, billing cycle (monthly or yearly), expiry date, and creation date. A new foundation only appears in Foundations & units after its registration is paid or activated without payment.',
            href: '/platform/pending',
          },
          {
            heading: 'No approve or reject button',
            body: 'The console has no approve or reject step. The only staff action is activation without payment. An unpaid registration that reaches its expiry releases the school address, and the registrant must register again. The length of the reservation is set in the billing parameters.',
          },
          {
            heading: 'Activating without payment',
            body: 'Only for pilot schools or partners who do not pay, and only Platform admins see the button. The activation is recorded as a complimentary payment of zero, in the payment history and in the audit with the reason. Read only staff see a note that their role can only view.',
            steps: [
              'Make sure the registration really is a pilot or was approved outside the console.',
              'On the registration card, click Activate without payment.',
              'Write a clear reason, for example who approved it and until when.',
              'Click Confirm.',
              'Check the foundation in Foundations & units and note its renewal date.',
            ],
            href: '/platform/pending',
          },
        ],
      },
      su: {
        title: 'Pendaptaran nunggu',
        summary:
          'Pendaptaran lembaga nu acan dibayar, jeung cara ngaktipkeunana tanpa pamayaran pikeun sakola pilot.',
        sections: [
          {
            heading: 'Naon eusi kaca ieu',
            body: 'Kaca ieu daptar pendaptaran nu acan dibayar. Unggal kartu nembongkeun ngaran lembaga, jumlah unit, siklus (bulanan atawa taunan), tanggal kadaluwarsa, jeung tanggal dijieun. Lembaga anyar muncul dina Lembaga & unit sanggeus pendaptaranna dibayar atawa diaktipkeun tanpa pamayaran.',
            href: '/platform/pending',
          },
          {
            heading: 'Teu aya tombol satuju atawa tolak',
            body: 'Konsol teu boga léngkah satuju atawa tolak. Hiji-hijina tindakan staf nyaéta aktivasi tanpa pamayaran. Pendaptaran nu teu dibayar nepi ka kadaluwarsa dileupaskeun alamat sakolana; pendaptar kudu daptar deui. Lilana mangsa pesenan diatur dina parameter penagihan.',
          },
          {
            heading: 'Aktivasi tanpa pamayaran',
            body: 'Ngan pikeun sakola pilot atawa mitra nu teu mayar, jeung ngan Admin platform nu ningali tombolna. Aktivasi dicatet minangka pamayaran komplimen sanilai nol, dina riwayat pamayaran jeung dina audit sareng alesanana. Peran Ngan ningali ningali catetan yén peranna ngan bisa ningali.',
            steps: [
              'Pastikeun pendaptaran memang pilot atawa geus disatujuan di luar konsol.',
              'Dina kartu pendaptaran, klik Aktipkeun tanpa pamayaran.',
              'Tulis alesan nu écés, upamana saha nu nyatujuan jeung nepi ka iraha.',
              'Klik Konfirmasi.',
              'Pariksa lembaga dina Lembaga & unit tuluy catet tanggal perpanjanganana.',
            ],
            href: '/platform/pending',
          },
        ],
      },
    },
  },
  {
    slug: 'payments',
    icon: 'credit',
    tone: 'amber',
    text: {
      id: {
        title: 'Pembayaran & penagihan',
        summary: 'Penyedia pembayaran langganan sekolah dan parameter penagihan global.',
        sections: [
          {
            heading: 'Penyedia pembayaran',
            body: 'Pilihannya Simulasi (tanpa uang, hanya pengembangan) atau Midtrans (Snap). Server yang berjalan sebagai produksi tidak menyediakan Simulasi. Badge Sumber pengaturan menunjukkan apakah nilai berasal dari konsol ini atau dari variabel lingkungan server (bila belum pernah diatur di konsol).',
            href: '/platform/payments',
          },
          {
            heading: 'Mengatur Midtrans',
            body: 'Pengaturan berlaku tanpa restart untuk pendaftaran dan tagihan berikutnya. Kunci server disimpan terenkripsi dan tidak pernah ditampilkan lagi, hanya empat karakter terakhirnya.',
            steps: [
              'Pilih penyedia Midtrans (Snap).',
              'Pilih lingkungan: Sandbox (uji) atau Produksi (uang sungguhan).',
              'Isi Kunci server Midtrans dari dasbor Midtrans, Settings, Access Keys. Kosongkan untuk mempertahankan kunci yang tersimpan.',
              'Salin Notification URL lalu daftarkan di dasbor Midtrans, Settings, Configuration, Payment Notification URL. Alamat harus dapat dijangkau dari internet.',
              'Klik Simpan pengaturan.',
            ],
            href: '/platform/payments',
          },
          {
            heading: 'Parameter penagihan',
            body: 'Empat angka global di kartu Parameter penagihan: masa tenggang (bawaan 7 hari), pengingat perpanjangan (invoice dibuat 7 hari sebelum periode habis), masa pesanan pendaftaran (24 jam), dan bayar tahunan (10 bulan). Pengali tahunan memengaruhi harga baru dan perpanjangan. Nilai di luar rentang ditolak.',
            steps: [
              'Ubah angka yang diperlukan; rentang yang diizinkan tampil bila salah.',
              'Klik Isi nilai bawaan untuk mengembalikan ke bawaan (belum tersimpan).',
              'Klik Simpan parameter.',
            ],
            href: '/platform/payments',
          },
          {
            heading: 'Hak akses dan dampak',
            body: 'Hanya Admin platform yang dapat mengubah; Hanya lihat melihat nilai saja. Invoice yang sudah dibuat tidak berubah, hanya siklus dan pendaftaran berikutnya yang memakai nilai baru.',
          },
        ],
      },
      en: {
        title: 'Payments & billing',
        summary: 'The payment provider for school subscriptions and the global billing parameters.',
        sections: [
          {
            heading: 'Payment provider',
            body: 'Choose Simulation (no money, development only) or Midtrans (Snap). A server running as production does not offer Simulation. The Settings source badge shows whether the values come from this console or from server environment variables (when never set in the console).',
            href: '/platform/payments',
          },
          {
            heading: 'Setting up Midtrans',
            body: 'Settings apply without a restart to the next registrations and invoices. The server key is stored encrypted and is never shown again, only its last four characters.',
            steps: [
              'Select the Midtrans (Snap) provider.',
              'Choose the environment: Sandbox (test) or Production (real money).',
              'Enter the Midtrans server key from the Midtrans dashboard, Settings, Access Keys. Leave it empty to keep the stored key.',
              'Copy the Notification URL and register it in the Midtrans dashboard, Settings, Configuration, Payment Notification URL. The address must be reachable from the internet.',
              'Click Save settings.',
            ],
            href: '/platform/payments',
          },
          {
            heading: 'Billing parameters',
            body: 'Four global numbers in the Billing parameters card: grace period (default 7 days), renewal reminder (the invoice is created 7 days before the period ends), registration reservation (24 hours), and yearly payment (10 months). The yearly multiplier affects new prices and renewals. Values outside the range are rejected.',
            steps: [
              'Change the numbers you need; the allowed range shows when a value is wrong.',
              'Click Fill defaults to restore the defaults (not saved yet).',
              'Click Save parameters.',
            ],
            href: '/platform/payments',
          },
          {
            heading: 'Access and impact',
            body: 'Only Platform admins can change these; Read only staff can see the values. Invoices already created do not change, only later cycles and registrations use the new values.',
          },
        ],
      },
      su: {
        title: 'Pamayaran & penagihan',
        summary: 'Panyadia pamayaran langganan sakola jeung parameter penagihan global.',
        sections: [
          {
            heading: 'Panyadia pamayaran',
            body: 'Pilihanana Simulasi (tanpa duit, ngan pikeun pamekaran) atawa Midtrans (Snap). Server nu jalan minangka produksi teu nyadiakeun Simulasi. Badge Sumber pangaturan nembongkeun naha nilaina asalna ti konsol ieu atawa ti variabel lingkungan server (lamun can kungsi diatur di konsol).',
            href: '/platform/payments',
          },
          {
            heading: 'Ngatur Midtrans',
            body: 'Pangaturan lumaku tanpa restart pikeun pendaptaran jeung tagihan satuluyna. Konci server disimpen dienkripsi jeung teu pernah ditembongkeun deui, ngan opat karakter pamungkasna.',
            steps: [
              'Pilih panyadia Midtrans (Snap).',
              'Pilih lingkungan: Sandbox (uji) atawa Produksi (duit sabenerna).',
              'Eusian Konci server Midtrans tina dasbor Midtrans, Settings, Access Keys. Kosongkeun pikeun nahan konci nu geus disimpen.',
              'Salin Notification URL tuluy daptarkeun dina dasbor Midtrans, Settings, Configuration, Payment Notification URL. Alamatna kudu bisa dihontal tina internét.',
              'Klik Simpen pangaturan.',
            ],
            href: '/platform/payments',
          },
          {
            heading: 'Parameter penagihan',
            body: 'Opat angka global dina kartu Parameter penagihan: mangsa tenggang (biasana 7 poé), pangéling perpanjangan (invoice dijieun 7 poé saméméh mangsa béak), mangsa pesenan pendaptaran (24 jam), jeung mayar taunan (10 bulan). Pangali taunan mangaruhan harga anyar jeung perpanjangan. Nilai di luar rentang ditolak.',
            steps: [
              'Robah angka nu diperlukeun; rentang nu diidinan muncul lamun nilaina lepat.',
              'Klik Eusian nilai baku pikeun mulangkeun ka baku (can disimpen).',
              'Klik Simpen parameter.',
            ],
            href: '/platform/payments',
          },
          {
            heading: 'Hak aksés jeung pangaruh',
            body: 'Ngan Admin platform nu bisa ngarobih; Ngan ningali ngan ningali nilaina. Invoice nu geus dijieun teu robah, ngan siklus jeung pendaptaran satuluyna nu maké nilai anyar.',
          },
        ],
      },
    },
  },
  {
    slug: 'catalog',
    icon: 'package',
    tone: 'rose',
    text: {
      id: {
        title: 'Harga & modul (katalog)',
        summary: 'Mengelola modul, tingkat siswa, harga, syarat antarmodul, dan paket siap pakai.',
        sections: [
          {
            heading: 'Isi katalog',
            body: 'Katalog terdiri dari item berjenis Inti, Modul, dan Tingkat siswa, masing-masing dengan harga per bulan, ditambah Paket siap pakai. Paket hanya pilihan cepat di halaman daftar; harga tetap dihitung dari item katalog.',
            href: '/platform/catalog',
          },
          {
            heading: 'Mengubah dan menambah item',
            body: 'Hanya Admin platform yang melihat tombol ubah dan tambah. Harga baru berlaku untuk pendaftaran dan tagihan perpanjangan berikutnya; invoice yang sudah dibuat tidak berubah.',
            steps: [
              'Klik ikon pensil pada baris item untuk mengubah nama, harga, urutan, atau status aktif.',
              'Untuk item baru, klik Tambah modul atau tingkat, pilih jenis, lalu isi Kunci, nama, dan harga.',
              'Kunci tidak dapat diubah setelah dibuat.',
              'Klik Simpan atau Tambah.',
            ],
            href: '/platform/catalog',
          },
          {
            heading: 'Aturan modul dan tingkat siswa',
            body: 'Modul punya Syarat modul: memilih modul itu otomatis menambah modul yang dicentang. Tingkat siswa punya Batas siswa aktif; kosong berarti tanpa batas. Modul baru baru berfungsi bila fiturnya sudah ada di kode; di katalog ia hanya menjadi pilihan yang bisa dibeli.',
          },
          {
            heading: 'Paket siap pakai',
            body: 'Paket berisi nama (maksimal 40 karakter), deskripsi (maksimal 200), tingkat siswa, dan daftar modul. Menghapus paket tidak mengubah langganan siapa pun.',
            steps: [
              'Klik Buat paket dan isi Kunci, nama, dan deskripsi.',
              'Pilih tingkat siswa dan centang modulnya.',
              'Simpan, lalu cek tampilan halaman daftar.',
              'Untuk menyembunyikan paket, ubah lalu hilangkan centang Aktif; paket nonaktif tidak tampil di halaman daftar.',
            ],
            href: '/platform/catalog',
          },
          {
            heading: 'Nonaktifkan, jangan hapus',
            body: 'Item katalog tidak bisa dihapus, hanya dinonaktifkan. Item nonaktif tidak tampil untuk pendaftar baru, tetapi sekolah yang sudah berlangganan tetap ditagih dengan harganya. Item Inti tidak boleh dinonaktifkan.',
          },
        ],
      },
      en: {
        title: 'Prices & modules (catalog)',
        summary: 'Manage modules, student tiers, prices, module requirements, and ready-made plans.',
        sections: [
          {
            heading: 'What the catalog contains',
            body: 'The catalog has items of kind Core, Module, and Student tier, each with a monthly price, plus ready-made Plans. Plans are only quick choices on the registration page; prices are still computed from the catalog items.',
            href: '/platform/catalog',
          },
          {
            heading: 'Editing and adding items',
            body: 'Only Platform admins see the edit and add buttons. A new price applies to later registrations and renewal invoices; invoices already created do not change.',
            steps: [
              'Click the pencil icon on an item row to change its name, price, order, or active status.',
              'For a new item, click Add module or tier, choose the kind, then fill in the Key, name, and price.',
              'The key cannot be changed once created.',
              'Click Save or Add.',
            ],
            href: '/platform/catalog',
          },
          {
            heading: 'Module and tier rules',
            body: 'A module has Module requirements: selecting it automatically adds the modules ticked there. A student tier has an Active student limit; empty means unlimited. A new module only works once its feature exists in the code; in the catalog it just becomes something purchasable.',
          },
          {
            heading: 'Ready-made plans',
            body: 'A plan has a name (up to 40 characters), a description (up to 200), a student tier, and a list of modules. Deleting a plan does not change anyone subscription.',
            steps: [
              'Click Create plan and fill in the Key, name, and description.',
              'Pick the student tier and tick its modules.',
              'Save, then check how the registration page looks.',
              'To hide a plan, edit it and untick Active; inactive plans do not show on the registration page.',
            ],
            href: '/platform/catalog',
          },
          {
            heading: 'Deactivate, do not delete',
            body: 'Catalog items cannot be deleted, only deactivated. Inactive items do not show for new registrants, but schools already subscribed are still billed at their price. Core items cannot be deactivated.',
          },
        ],
      },
      su: {
        title: 'Harga & modul (katalog)',
        summary: 'Ngatur modul, tingkat siswa, harga, sarat antarmodul, jeung paket siap pakéna.',
        sections: [
          {
            heading: 'Eusi katalog',
            body: 'Katalog diwangun ku item jenis Inti, Modul, jeung Tingkat siswa, unggal item boga harga sabulan, ditambah Paket siap pakéna. Paket ngan pilihan gancang dina kaca daptar; harga tetep diitung tina item katalog.',
            href: '/platform/catalog',
          },
          {
            heading: 'Ngarobih jeung nambihan item',
            body: 'Ngan Admin platform nu ningali tombol robah jeung tambah. Harga anyar lumaku pikeun pendaptaran jeung tagihan perpanjangan satuluyna; invoice nu geus dijieun teu robah.',
            steps: [
              'Klik ikon pénsil dina baris item pikeun ngarobih ngaran, harga, urutan, atawa status aktip.',
              'Pikeun item anyar, klik Tambih modul atawa tingkat, pilih jenisna, tuluy eusian Konci, ngaran, jeung harga.',
              'Konci teu bisa dirobah sanggeus dijieun.',
              'Klik Simpen atawa Tambih.',
            ],
            href: '/platform/catalog',
          },
          {
            heading: 'Aturan modul jeung tingkat siswa',
            body: 'Modul boga Sarat modul: milih modul eta otomatis nambihan modul nu dicentang. Tingkat siswa boga Wates siswa aktip; kosong hartina taya wates. Modul anyar karék jalan lamun fiturna geus aya dina kode; dina katalog ngan jadi pilihan nu bisa dipeuli.',
          },
          {
            heading: 'Paket siap pakéna',
            body: 'Paket eusina ngaran (pangmaksimalna 40 karakter), pedaran (200), tingkat siswa, jeung daptar modul. Mupus paket teu ngarobah langganan saha waé.',
            steps: [
              'Klik Jieun paket tuluy eusian Konci, ngaran, jeung pedaran.',
              'Pilih tingkat siswa tuluy centang modulna.',
              'Simpen, tuluy pariksa tampilan kaca daptar.',
              'Pikeun nyumputkeun paket, robah tuluy leungitkeun centang Aktip; paket nonaktip teu muncul dina kaca daptar.',
            ],
            href: '/platform/catalog',
          },
          {
            heading: 'Nonaktipkeun, ulah mupus',
            body: 'Item katalog teu bisa dipupus, ngan bisa dinonaktipkeun. Item nonaktip teu muncul pikeun pendaptar anyar, tapi sakola nu geus langganan tetep ditagih nurutkeun hargana. Item Inti teu meunang dinonaktipkeun.',
          },
        ],
      },
    },
  },
  {
    slug: 'curriculum',
    icon: 'book',
    tone: 'emerald',
    text: {
      id: {
        title: 'Bank kurikulum',
        summary: 'Acuan global jenjang, kurikulum, dan mata pelajaran yang disalin oleh sekolah.',
        sections: [
          {
            heading: 'Apa itu bank kurikulum',
            body: 'Bank kurikulum adalah acuan global untuk semua sekolah, terdiri dari jenjang, kurikulum, dan mapel acuan. Sekolah menyalin mapel acuan lalu bebas mengubahnya, jadi perubahan di sini tidak menimpa data sekolah. Semua staf dapat melihat; hanya Admin platform yang dapat mengubah.',
            href: '/platform/curriculum',
          },
          {
            heading: 'Jenjang dan kurikulum',
            body: 'Kartu ringkasan menampilkan jenjang aktif, kurikulum, mapel acuan, dan adopsi sekolah. Jenjang nonaktif disembunyikan dari pilihan sekolah, tetapi adopsi yang sudah ada tidak berubah.',
            steps: [
              'Klik Tambah jenjang dan isi Kunci (mis. sd, smp, paket_c), nama, dan urutan. Kunci tidak bisa diubah.',
              'Klik Tambah kurikulum dengan kunci dan nama.',
              'Untuk menyembunyikan jenjang, ubah lalu nonaktifkan.',
              'Penghapusan hanya bisa bila tidak dipakai: jenjang tanpa mapel acuan dan adopsi; kurikulum yang belum diadopsi sekolah (mapel acuannya ikut terhapus).',
            ],
            href: '/platform/curriculum',
          },
          {
            heading: 'Mapel acuan dan impor',
            body: 'Pilih kurikulum untuk mengelola mapel acuannya per jenjang. Kode mapel unik per kurikulum dan jenjang. Mapel baru muncul di sekolah yang sudah mengadopsi kurikulum dan jenjang itu sebagai acuan baru yang bisa diadopsi.',
            steps: [
              'Pilih kurikulum, lalu Tambah mapel untuk satu per satu.',
              'Atau klik Impor dan pilih berkas CSV, atau tempel isi tabel dari Excel.',
              'Satu baris per mapel: kode, nama, urutan (opsional), dipisah tab, titik koma, atau koma.',
              'Cek jumlah baris terbaca, lalu impor. Kode yang sudah ada diperbarui namanya.',
            ],
            href: '/platform/curriculum',
          },
          {
            heading: 'Dampak ke sekolah',
            body: 'Mengubah nama mapel acuan tidak menimpa mapel yang sudah disalin sekolah. Item yang masih dipakai tidak bisa dihapus; nonaktifkan bila perlu.',
          },
        ],
      },
      en: {
        title: 'Curriculum bank',
        summary: 'The global reference of levels, curricula, and subjects that schools copy from.',
        sections: [
          {
            heading: 'What the bank is',
            body: 'The curriculum bank is a global reference for all schools, made of levels, curricula, and reference subjects. Schools copy reference subjects and can then edit them freely, so changes here do not overwrite school data. All staff can view; only Platform admins can change.',
            href: '/platform/curriculum',
          },
          {
            heading: 'Levels and curricula',
            body: 'The summary cards show active levels, curricula, reference subjects, and school adoptions. Inactive levels are hidden from school choices, but existing adoptions do not change.',
            steps: [
              'Click Add level and fill in the Key (e.g. sd, smp, paket_c), name, and order. The key cannot be changed.',
              'Click Add curriculum with a key and name.',
              'To hide a level, edit it and deactivate it.',
              'Deleting is only possible when unused: a level with no reference subjects and no adoptions; a curriculum no school has adopted (its reference subjects are deleted with it).',
            ],
            href: '/platform/curriculum',
          },
          {
            heading: 'Reference subjects and import',
            body: 'Pick a curriculum to manage its reference subjects per level. A subject code is unique per curriculum and level. A new subject appears in schools that already adopted that curriculum and level as a new reference they can adopt.',
            steps: [
              'Pick a curriculum, then Add subject for one at a time.',
              'Or click Import and choose a CSV file, or paste the table from Excel.',
              'One row per subject: code, name, order (optional), separated by tab, semicolon, or comma.',
              'Check the number of rows read, then import. Existing codes get their name updated.',
            ],
            href: '/platform/curriculum',
          },
          {
            heading: 'Impact on schools',
            body: 'Renaming a reference subject does not overwrite subjects schools already copied. Items still in use cannot be deleted; deactivate them if needed.',
          },
        ],
      },
      su: {
        title: 'Bank kurikulum',
        summary: 'Acuan global jenjang, kurikulum, jeung mata pelajaran nu disalin ku sakola.',
        sections: [
          {
            heading: 'Naon éta bank kurikulum',
            body: 'Bank kurikulum nyaéta acuan global pikeun sakabéh sakola, diwangun ku jenjang, kurikulum, jeung mapél acuan. Sakola nyalin mapél acuan tuluy bébas ngarobihna, ku kituna parobahan di dieu teu nimpa data sakola. Sakabéh staf bisa ningali; ngan Admin platform nu bisa ngarobih.',
            href: '/platform/curriculum',
          },
          {
            heading: 'Jenjang jeung kurikulum',
            body: 'Kartu ringkesan nembongkeun jenjang aktip, kurikulum, mapél acuan, jeung adopsi sakola. Jenjang nonaktip disumputkeun tina pilihan sakola, tapi adopsi nu geus aya teu robah.',
            steps: [
              'Klik Tambih jenjang tuluy eusian Konci (upamana sd, smp, paket_c), ngaran, jeung urutan. Konci teu bisa dirobah.',
              'Klik Tambih kurikulum nganggo konci jeung ngaran.',
              'Pikeun nyumputkeun jenjang, robah tuluy nonaktipkeun.',
              'Mupus ngan bisa lamun teu dipaké: jenjang tanpa mapél acuan jeung adopsi; kurikulum nu can diadopsi sakola (mapél acuanana milu kapupus).',
            ],
            href: '/platform/curriculum',
          },
          {
            heading: 'Mapél acuan jeung impor',
            body: 'Pilih kurikulum pikeun ngatur mapél acuanana per jenjang. Kode mapél unik per kurikulum jeung jenjang. Mapél anyar muncul di sakola nu geus ngadopsi kurikulum jeung jenjang eta minangka acuan anyar nu bisa diadopsi.',
            steps: [
              'Pilih kurikulum, tuluy Tambih mapél pikeun hiji-hiji.',
              'Atawa klik Impor tuluy pilih bérkas CSV, atawa témpél eusi tabel tina Excel.',
              'Hiji baris pikeun hiji mapél: kode, ngaran, urutan (opsional), dipisah ku tab, titik koma, atawa koma.',
              'Pariksa jumlah baris kabaca, tuluy impor. Kode nu geus aya dirobah ngaranna.',
            ],
            href: '/platform/curriculum',
          },
          {
            heading: 'Pangaruh ka sakola',
            body: 'Ngarobih ngaran mapél acuan teu nimpa mapél nu geus disalin ku sakola. Item nu masih dipaké teu bisa dipupus; nonaktipkeun lamun perlu.',
          },
        ],
      },
    },
  },
  {
    slug: 'messaging',
    icon: 'send',
    tone: 'slate',
    text: {
      id: {
        title: 'Pesan WhatsApp',
        summary:
          'Pengaturan global pengiriman pesan, aturan kirim ulang, dan pemantauan worker serta akun sekolah.',
        sections: [
          {
            heading: 'Saklar dan penyedia',
            body: 'Saklar Aktifkan pengiriman pesan berlaku untuk semua sekolah; bila mati, tidak ada pesan yang dikirim. Penyedia dapat berupa WhatsApp atau Log uji (hanya mencatat, tidak mengirim). Log uji ditolak di produksi. Batas antrean per sekolah menolak pesan baru bila antrean sekolah sudah penuh.',
            href: '/platform/messaging',
          },
          {
            heading: 'Aturan kirim ulang',
            body: 'Berlaku untuk pesan berikutnya tanpa restart worker. Hanya Admin platform yang dapat menyimpan; Hanya lihat melihat nilainya.',
            steps: [
              'Isi Jeda antar percobaan dalam menit, 1 sampai 10 bilangan dipisah koma (mis. 1, 5, 30, 120, 360). Percobaan yang melewati daftar memakai jeda terakhir.',
              'Isi Percobaan maksimum (1 sampai 20); setelah itu pesan ditandai gagal.',
              'Isi Kedaluwarsa pesan dalam jam (1 sampai 168) untuk pesan tertahan karena WhatsApp sekolah belum siap.',
              'Isi Batas usia tap dalam jam (1 sampai 72); tap kiosk yang lebih tua tidak lagi diberitahukan ke wali.',
              'Klik Simpan.',
            ],
            href: '/platform/messaging',
          },
          {
            heading: 'Status worker dan kunci lewat env',
            body: 'Kartu Status worker dilaporkan sendiri oleh worker saat start dan tiap beberapa menit. Bila Chrome belum terdeteksi, isi WA_CHROME_PATH di .env worker dengan jalur chrome.exe atau Chromium lalu restart worker. Variabel MESSAGING_PROVIDER pada worker mengunci pilihan penyedia; pilihan di konsol tidak berlaku sampai env dikosongkan.',
          },
          {
            heading: 'Statistik dan akun sekolah',
            body: 'Halaman menyegarkan diri tiap 15 detik. Terlihat jumlah pesan 24 jam terakhir menurut status (Antre, Terkirim, Gagal, Dilewati) dan jumlah akun WhatsApp sekolah menurut status sambungan (Terhubung, Menunggu pemindaian, Menyambung, Gagal, Terputus). Akun yang menunggu pemindaian QR dipindai oleh admin sekolah.',
          },
        ],
      },
      en: {
        title: 'WhatsApp messaging',
        summary:
          'Global message sending settings, retry rules, and monitoring of the worker and school accounts.',
        sections: [
          {
            heading: 'Switch and provider',
            body: 'The Enable message sending switch applies to every school; when off, no messages are sent. The provider can be WhatsApp or Test log (records only, does not send). Test log is rejected in production. The per-school queue limit rejects new messages once a school queue is full.',
            href: '/platform/messaging',
          },
          {
            heading: 'Retry rules',
            body: 'Applies to the next messages without restarting the worker. Only Platform admins can save; Read only staff see the values.',
            steps: [
              'Fill Delay between attempts in minutes, 1 to 10 numbers separated by commas (e.g. 1, 5, 30, 120, 360). Attempts beyond the list use the last delay.',
              'Fill Maximum attempts (1 to 20); after that the message is marked failed.',
              'Fill Message expiry in hours (1 to 168) for messages held back because the school WhatsApp is not ready.',
              'Fill Tap age limit in hours (1 to 72); older kiosk taps are no longer notified to guardians.',
              'Click Save.',
            ],
            href: '/platform/messaging',
          },
          {
            heading: 'Worker status and env-locked values',
            body: 'The Worker status card is self-reported by the worker at start and every few minutes. If Chrome is not detected, set WA_CHROME_PATH in the worker .env to the chrome.exe or Chromium path and restart the worker. The MESSAGING_PROVIDER variable on the worker locks the provider choice; the console choice does not apply until the env is cleared.',
          },
          {
            heading: 'Statistics and school accounts',
            body: 'The page refreshes itself every 15 seconds. It shows the message count of the last 24 hours by status (Queued, Sent, Failed, Skipped) and the number of school WhatsApp accounts by connection status (Connected, Waiting for scan, Connecting, Failed, Disconnected). Accounts waiting for a QR scan must be scanned by the school admin.',
          },
        ],
      },
      su: {
        title: 'Pesen WhatsApp',
        summary: 'Pangaturan global ngirim pesen, aturan kirim deui, jeung mantuan worker sarta akun sakola.',
        sections: [
          {
            heading: 'Saklar jeung panyadia',
            body: 'Saklar Aktipkeun pangiriman pesen lumaku pikeun sakabéh sakola; lamun pareum, taya pesen nu dikirim. Panyadia bisa WhatsApp atawa Log uji (ngan nyatet, teu ngirim). Log uji ditolak di produksi. Wates antrian per sakola nolak pesen anyar lamun antrian sakola geus pinuh.',
            href: '/platform/messaging',
          },
          {
            heading: 'Aturan kirim deui',
            body: 'Lumaku pikeun pesen satuluyna tanpa restart worker. Ngan Admin platform nu bisa nyimpen; Ngan ningali ningali nilaina.',
            steps: [
              'Eusian Jeda antara percobaan dina menit, 1 nepi ka 10 angka dipisah koma (upamana 1, 5, 30, 120, 360). Percobaan nu ngaliwatan daptar maké jeda pamungkas.',
              'Eusian Percobaan maksimum (1 nepi ka 20); sanggeusna pesen ditandaan gagal.',
              'Eusian Kadaluwarsa pesen dina jam (1 nepi ka 168) pikeun pesen nu katahan lantaran WhatsApp sakola can siap.',
              'Eusian Wates umur tap dina jam (1 nepi ka 72); tap kiosk nu leuwih heubeul teu diwartoskeun deui ka wali.',
              'Klik Simpen.',
            ],
            href: '/platform/messaging',
          },
          {
            heading: 'Status worker jeung konci ku env',
            body: 'Kartu Status worker dilaporkeun ku worker sorangan nalika start jeung unggal sababaraha menit. Lamun Chrome can kadeteksi, eusian WA_CHROME_PATH dina .env worker nganggo jalur chrome.exe atawa Chromium tuluy restart worker. Variabel MESSAGING_PROVIDER dina worker ngonci pilihan panyadia; pilihan di konsol teu lumaku nepi ka env dikosongkeun.',
          },
          {
            heading: 'Statistik jeung akun sakola',
            body: 'Kaca nyegerkeun sorangan unggal 15 detik. Nembongkeun jumlah pesen 24 jam ka tukang nurutkeun status (Antri, Kakirim, Gagal, Dilewatan) jeung jumlah akun WhatsApp sakola nurutkeun status sambungan (Nyambung, Nungguan pamindaian, Nyambungkeun, Gagal, Pegat). Akun nu nungguan pamindaian QR kudu dipindai ku admin sakola.',
          },
        ],
      },
    },
  },
  {
    slug: 'audit',
    icon: 'history',
    tone: 'violet',
    text: {
      id: {
        title: 'Jejak audit',
        summary: 'Catatan tindakan staf dan perubahan penting lintas sekolah.',
        sections: [
          {
            heading: 'Apa yang tercatat',
            body: 'Halaman Audit menampilkan tindakan staf dan perubahan penting lintas sekolah, terbaru di atas. Tiap catatan punya waktu, aksi (mis. catalog.item.update), dan rincian. Alasan yang Anda tulis saat menangguhkan atau mengaktifkan tanpa pembayaran ikut tercatat.',
            href: '/platform/audit',
          },
          {
            heading: 'Area aksi',
            body: 'Awalan sebelum titik pertama menunjukkan area, dengan warna berbeda: school, registration, catalog, payment, billing, messaging, dan reference. Halaman memuat 200 catatan terbaru.',
          },
          {
            heading: 'Mencari catatan',
            body: 'Semua peran staf, termasuk Hanya lihat, dapat membuka halaman ini. Halaman hanya untuk dibaca; tidak ada tombol ubah atau hapus.',
            steps: [
              'Ketik kata kunci di Cari aksi atau rincian; pencarian mencocokkan nama aksi dan isi rincian.',
              'Pilih area di saringan untuk mempersempit.',
              'Baca jumlah catatan di kanan atas untuk memastikan hasilnya.',
              'Bandingkan waktu dan rincian dengan kejadian yang sedang diselidiki.',
            ],
            href: '/platform/audit',
          },
        ],
      },
      en: {
        title: 'Audit trail',
        summary: 'A record of staff actions and important changes across schools.',
        sections: [
          {
            heading: 'What is recorded',
            body: 'The Audit page shows staff actions and important changes across schools, newest first. Each entry has a time, an action (e.g. catalog.item.update), and details. The reason you write when suspending or activating without payment is recorded too.',
            href: '/platform/audit',
          },
          {
            heading: 'Action areas',
            body: 'The prefix before the first dot is the area, shown in different colours: school, registration, catalog, payment, billing, messaging, and reference. The page loads the 200 most recent entries.',
          },
          {
            heading: 'Finding entries',
            body: 'All staff roles, including Read only, can open this page. It is read-only; there is no edit or delete button.',
            steps: [
              'Type a keyword in Search action or details; it matches action names and detail content.',
              'Pick an area in the filter to narrow down.',
              'Read the entry count at the top right to confirm the result.',
              'Compare the time and details with the event you are investigating.',
            ],
            href: '/platform/audit',
          },
        ],
      },
      su: {
        title: 'Tapak audit',
        summary: 'Catetan tindakan staf jeung parobahan penting lintas sakola.',
        sections: [
          {
            heading: 'Naon nu kacatet',
            body: 'Kaca Audit nembongkeun tindakan staf jeung parobahan penting lintas sakola, nu panganyarna di luhur. Unggal catetan boga waktu, aksi (upamana catalog.item.update), jeung rincian. Alesan nu anjeun tulis nalika nangguhkeun atawa ngaktipkeun tanpa pamayaran milu kacatet.',
            href: '/platform/audit',
          },
          {
            heading: 'Area aksi',
            body: 'Awalan saméméh titik kahiji nandakeun area, ku warna béda: school, registration, catalog, payment, billing, messaging, jeung reference. Kaca ngamuat 200 catetan panganyarna.',
          },
          {
            heading: 'Milarian catetan',
            body: 'Sakabéh peran staf, kaasup Ngan ningali, bisa muka kaca ieu. Kaca ieu ngan keur dibaca; taya tombol robah atawa pupus.',
            steps: [
              'Ketik kecap konci dina Cari aksi atawa rincian; pamilarian cocog jeung ngaran aksi jeung eusi rincian.',
              'Pilih area dina saringan pikeun nyaruakeun.',
              'Baca jumlah catetan di katuhu luhur pikeun mastikeun hasilna.',
              'Bandingkeun waktu jeung rincian jeung kajadian nu keur ditalungtik.',
            ],
            href: '/platform/audit',
          },
        ],
      },
    },
  },
];
