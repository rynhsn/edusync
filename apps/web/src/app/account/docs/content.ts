export type DocLocale = 'id' | 'en' | 'su';
export type DocIcon =
  | 'rocket'
  | 'users'
  | 'scan'
  | 'graduation'
  | 'wallet'
  | 'clipboard'
  | 'message'
  | 'shield'
  | 'credit'
  | 'lock';
export type DocTone = 'teal' | 'sky' | 'violet' | 'amber' | 'rose' | 'emerald' | 'slate';
export interface DocSection {
  heading: string;
  body: string;
  steps?: string[];
}
export interface DocText {
  title: string;
  summary: string;
  sections: DocSection[];
}
export interface DocArticle {
  slug: string;
  icon: DocIcon;
  tone: DocTone;
  text: Record<DocLocale, DocText>;
}

export const DOC_ARTICLES: DocArticle[] = [
  {
    slug: 'getting-started',
    icon: 'rocket',
    tone: 'teal',
    text: {
      id: {
        title: 'Memulai',
        summary: 'Langkah pertama dari masuk ke portal akun sampai sekolah siap dipakai.',
        sections: [
          {
            heading: 'Masuk ke sekolah',
            body: 'Portal akun adalah pusat yayasan untuk langganan dan tagihan. Dari sana Anda membuka setiap unit sekolah.',
            steps: [
              'Masuk dengan akun yayasan Anda.',
              'Buka bagian Unit sekolah di halaman Akun yayasan.',
              'Klik Buka sekolah pada unit yang ingin dikelola.',
            ],
          },
          {
            heading: 'Siapkan data induk',
            body: 'Isi data induk lebih dulu agar modul lain berjalan lancar. Menu ada di kelompok Data induk.',
            steps: [
              'Atur Tahun ajaran dan kalender.',
              'Tambah Kelas dan Mata pelajaran.',
              'Tambah Guru dan Siswa.',
              'Lengkapi Pengaturan sekolah.',
            ],
          },
          {
            heading: 'Undang tim',
            body: 'Guru, bendahara, dan staf lain bisa diundang lewat email dengan peran yang sesuai.',
          },
        ],
      },
      en: {
        title: 'Getting started',
        summary: 'The first steps, from signing in to the account portal until your school is ready to use.',
        sections: [
          {
            heading: 'Open your school',
            body: 'The account portal is the foundation hub for subscriptions and invoices. From there you open each school unit.',
            steps: [
              'Sign in with your foundation account.',
              'Go to the School units section on the Foundation account page.',
              'Click Open school on the unit you want to manage.',
            ],
          },
          {
            heading: 'Set up master data',
            body: 'Fill in master data first so the other modules work smoothly. The menus are in the Master data group.',
            steps: [
              'Set up Academic years and the calendar.',
              'Add Classes and Subjects.',
              'Add Teachers and Students.',
              'Complete School settings.',
            ],
          },
          {
            heading: 'Invite your team',
            body: 'Teachers, treasurers, and other staff can be invited by email with the right role.',
          },
        ],
      },
      su: {
        title: 'Ngawitan',
        summary: 'Léngkah mimiti ti lebet ka portal akun nepi ka sakola siap dianggo.',
        sections: [
          {
            heading: 'Muka sakola',
            body: 'Portal akun mangrupa puseur yayasan pikeun langganan jeung tagihan. Ti dinya anjeun muka unggal unit sakola.',
            steps: [
              'Lebet nganggo akun yayasan anjeun.',
              'Buka bagian Unit sekolah dina kaca Akun yayasan.',
              'Klik Buka sekolah dina unit nu rék diurus.',
            ],
          },
          {
            heading: 'Nyiapkeun data induk',
            body: 'Eusian heula data induk supaya modul séjénna lancar. Menuna aya dina kelompok Data induk.',
            steps: [
              'Atur Tahun ajaran jeung kalénder.',
              'Tambihan Kelas jeung Mata pelajaran.',
              'Tambihan Guru jeung Siswa.',
              'Lengkepan Pengaturan sekolah.',
            ],
          },
          {
            heading: 'Ondang tim',
            body: 'Guru, bendahara, jeung staf séjénna bisa diondang lewat surélék kalayan peran nu cocog.',
          },
        ],
      },
    },
  },
  {
    slug: 'students',
    icon: 'users',
    tone: 'sky',
    text: {
      id: {
        title: 'Menambah dan mengimpor siswa',
        summary: 'Tambahkan siswa satu per satu atau sekaligus lewat berkas Excel.',
        sections: [
          {
            heading: 'Tambah satu siswa',
            body: 'Buka menu Siswa di Data induk lalu isi data dasar seperti nama, NIS, NISN, jenis kelamin, dan tanggal lahir.',
            steps: ['Buka menu Siswa.', 'Klik tombol tambah siswa.', 'Isi data dan pilih kelas.', 'Simpan.'],
          },
          {
            heading: 'Impor dari Excel',
            body: 'Untuk banyak siswa, gunakan Impor Excel. Unduh templat, isi, lalu unggah kembali.',
            steps: [
              'Klik Impor Excel di halaman Siswa.',
              'Unduh templat dan isi datanya.',
              'Unggah berkas, periksa pratinjau, lalu impor.',
            ],
          },
          {
            heading: 'Status dan kelas',
            body: 'Siswa berstatus aktif, lulus, pindah, atau keluar. Kelas yang tampil adalah kelas pada tahun ajaran aktif.',
          },
        ],
      },
      en: {
        title: 'Adding and importing students',
        summary: 'Add students one by one or all at once with an Excel file.',
        sections: [
          {
            heading: 'Add a single student',
            body: 'Open the Students menu under Master data and fill in the basics such as name, NIS, NISN, gender, and birth date.',
            steps: [
              'Open the Students menu.',
              'Click the add student button.',
              'Fill in the details and pick a class.',
              'Save.',
            ],
          },
          {
            heading: 'Import from Excel',
            body: 'For many students, use Import Excel. Download the template, fill it in, then upload it back.',
            steps: [
              'Click Import Excel on the Students page.',
              'Download the template and fill in the data.',
              'Upload the file, check the preview, then import.',
            ],
          },
          {
            heading: 'Status and class',
            body: 'A student is active, graduated, transferred, or dropped. The class shown is the class in the active academic year.',
          },
        ],
      },
      su: {
        title: 'Nambah jeung ngimpor siswa',
        summary: 'Tambihan siswa hiji-hiji atawa sakaligus lewat berkas Excel.',
        sections: [
          {
            heading: 'Nambah hiji siswa',
            body: 'Buka menu Siswa dina Data induk, terus eusian data dasarna saperti ngaran, NIS, NISN, jenis kelamin, jeung tanggal lahir.',
            steps: [
              'Buka menu Siswa.',
              'Klik tombol tambah siswa.',
              'Eusian data tuluy pilih kelas.',
              'Simpen.',
            ],
          },
          {
            heading: 'Ngimpor ti Excel',
            body: 'Pikeun siswa nu réa, anggo Impor Excel. Unduh templatna, eusian, tuluy unggah deui.',
            steps: [
              'Klik Impor Excel dina kaca Siswa.',
              'Unduh templat tuluy eusian datana.',
              'Unggah berkas, pariksa pratinjau, tuluy impor.',
            ],
          },
          {
            heading: 'Status jeung kelas',
            body: 'Siswa bisa aktif, lulus, pindah, atawa kaluar. Kelas nu kaciri nyaéta kelas dina tahun ajaran nu aktif.',
          },
        ],
      },
    },
  },
  {
    slug: 'rfid-attendance',
    icon: 'scan',
    tone: 'emerald',
    text: {
      id: {
        title: 'Absensi RFID dan gerbang',
        summary: 'Catat kehadiran masuk dan pulang dari tap kartu siswa di kiosk gerbang.',
        sections: [
          {
            heading: 'Siapkan perangkat dan kebijakan',
            body: 'Di Pengaturan absensi, atur tab Kebijakan (batas terlambat dan jam pulang) dan tab Perangkat untuk kiosk di gerbang.',
            steps: [
              'Buka Pengaturan absensi di kelompok Kehadiran.',
              'Di tab Kebijakan, isi Terlambat setelah dan Pulang mulai.',
              'Di tab Perangkat, klik Tambah perangkat dan beri nama.',
              'Salin kunci perangkat saat tampil, karena hanya muncul sekali.',
            ],
          },
          {
            heading: 'Daftarkan kartu siswa',
            body: 'Di tab Kartu, tambahkan kode kartu RFID tiap siswa. Untuk banyak kartu, gunakan Daftar cepat per kelas atau impor dari Excel.',
          },
          {
            heading: 'Pantau di Gerbang & piket',
            body: 'Menu Gerbang & piket menampilkan kehadiran masuk dan pulang hari ini dan menyegarkan diri tiap 10 detik. Tab Jadwal piket mengatur guru piket.',
          },
        ],
      },
      en: {
        title: 'RFID attendance and the gate',
        summary: 'Record arrival and departure from student card taps at the gate kiosk.',
        sections: [
          {
            heading: 'Set up devices and policy',
            body: 'In Attendance settings, configure the Policy tab (late cutoff and departure time) and the Devices tab for the kiosk at the gate.',
            steps: [
              'Open Attendance settings in the Attendance group.',
              'In the Policy tab, fill in Late after and Departure from.',
              'In the Devices tab, click Add device and give it a name.',
              'Copy the device key when it appears, because it is shown only once.',
            ],
          },
          {
            heading: 'Register student cards',
            body: 'In the Cards tab, add each student RFID card code. For many cards, use quick registration per class or import from Excel.',
          },
          {
            heading: 'Monitor in Gate & duty',
            body: 'The Gate & duty menu shows today arrivals and departures and refreshes every 10 seconds. The Duty roster tab sets the duty teachers.',
          },
        ],
      },
      su: {
        title: 'Absensi RFID jeung gerbang',
        summary: 'Catet kahadiran asup jeung mulang tina tap kartu siswa di kiosk gerbang.',
        sections: [
          {
            heading: 'Nyiapkeun parabot jeung kabijakan',
            body: 'Dina Pengaturan absensi, atur tab Kebijakan (wates telat jeung jam mulang) jeung tab Perangkat pikeun kiosk di gerbang.',
            steps: [
              'Buka Pengaturan absensi dina kelompok Kehadiran.',
              'Dina tab Kebijakan, eusian Terlambat setelah jeung Pulang mulai.',
              'Dina tab Perangkat, klik Tambah perangkat tuluy pasihan ngaran.',
              'Salin konci perangkat basa kaluar, sabab ngan némbongan sakali.',
            ],
          },
          {
            heading: 'Ngadaptarkeun kartu siswa',
            body: 'Dina tab Kartu, tambihan kode kartu RFID unggal siswa. Pikeun kartu nu réa, anggo Daftar cepat per kelas atawa impor ti Excel.',
          },
          {
            heading: 'Mantau di Gerbang & piket',
            body: 'Menu Gerbang & piket mintonkeun kahadiran asup jeung mulang poé ieu sarta nyegerkeun diri unggal 10 detik. Tab Jadwal piket pikeun ngatur guru piket.',
          },
        ],
      },
    },
  },
  {
    slug: 'grades-report-cards',
    icon: 'graduation',
    tone: 'violet',
    text: {
      id: {
        title: 'Nilai dan rapor',
        summary: 'Atur penilaian, input nilai per mata pelajaran, lalu cetak rapor.',
        sections: [
          {
            heading: 'Atur penilaian',
            body: 'Menu Pengaturan penilaian (kelompok Akademik) dipakai untuk menyiapkan komponen dan aturan nilai sebelum guru mulai mengisi.',
          },
          {
            heading: 'Isi nilai',
            body: 'Guru mengisi nilai lewat menu Penilaian sesuai mata pelajaran dan kelas yang diampu.',
            steps: ['Buka menu Penilaian.', 'Pilih kelas dan mata pelajaran.', 'Isi nilai siswa.', 'Simpan.'],
          },
          {
            heading: 'Rapor',
            body: 'Menu Rapor menampilkan rapor tiap siswa dan bisa diunduh sebagai PDF, satu per satu atau semua sekaligus. Tampilan rapor diatur di Pengaturan rapor.',
          },
        ],
      },
      en: {
        title: 'Grades and report cards',
        summary: 'Configure grading, enter scores per subject, then print report cards.',
        sections: [
          {
            heading: 'Configure grading',
            body: 'The Grading settings menu (Academic group) is used to prepare components and rules before teachers start entering scores.',
          },
          {
            heading: 'Enter scores',
            body: 'Teachers enter scores through the Grading menu for the subjects and classes they teach.',
            steps: [
              'Open the Grading menu.',
              'Pick the class and subject.',
              'Enter student scores.',
              'Save.',
            ],
          },
          {
            heading: 'Report cards',
            body: 'The Report cards menu shows each student report card and can be downloaded as a PDF, one by one or all at once. Layout is set in Report card settings.',
          },
        ],
      },
      su: {
        title: 'Nilai jeung rapor',
        summary: 'Atur panilaian, eusian nilai per mata pelajaran, tuluy citak rapor.',
        sections: [
          {
            heading: 'Ngatur panilaian',
            body: 'Menu Pengaturan penilaian (kelompok Akademik) dipaké pikeun nyiapkeun komponén jeung aturan nilai samemeh guru ngawitan ngeusian.',
          },
          {
            heading: 'Ngeusian nilai',
            body: 'Guru ngeusian nilai lewat menu Penilaian luyu jeung mata pelajaran jeung kelas nu diampu.',
            steps: [
              'Buka menu Penilaian.',
              'Pilih kelas jeung mata pelajaran.',
              'Eusian nilai siswa.',
              'Simpen.',
            ],
          },
          {
            heading: 'Rapor',
            body: 'Menu Rapor mintonkeun rapor unggal siswa tur bisa diunduh jadi PDF, hiji-hiji atawa sakaligus. Tampilan rapor diatur dina Pengaturan rapor.',
          },
        ],
      },
    },
  },
  {
    slug: 'finance',
    icon: 'wallet',
    tone: 'amber',
    text: {
      id: {
        title: 'Keuangan sekolah (SPP, tagihan, pembayaran)',
        summary: 'Atur jenis biaya, buat tagihan siswa, terima pembayaran, dan lihat laporan.',
        sections: [
          {
            heading: 'Jenis biaya dan tarif',
            body: 'Di menu Jenis biaya & tarif, atur biaya sekolah seperti SPP beserta nominalnya per tahun ajaran dan tingkat.',
          },
          {
            heading: 'Buat tagihan',
            body: 'Menu Tagihan memuat daftar tagihan siswa per tahun ajaran dan memungkinkan pembuatan tagihan massal.',
            steps: [
              'Buka menu Tagihan di kelompok Keuangan.',
              'Pilih pembuatan tagihan massal.',
              'Tentukan jenis biaya, kelas, dan periode.',
              'Konfirmasi.',
            ],
          },
          {
            heading: 'Terima pembayaran',
            body: 'Di menu Kasir, cari siswa, pilih tagihan yang dibayar, lalu terima pembayaran dan unduh kwitansi PDF. Pembayaran yang salah dapat dibatalkan dan tercatat.',
          },
          {
            heading: 'Laporan',
            body: 'Menu Laporan keuangan merangkum penerimaan dan tunggakan sekolah.',
          },
        ],
      },
      en: {
        title: 'School finance (tuition, invoices, payments)',
        summary: 'Set up fee types, create student invoices, receive payments, and view reports.',
        sections: [
          {
            heading: 'Fee types and rates',
            body: 'In the Fee types & rates menu, set school fees such as tuition and their amounts per academic year and level.',
          },
          {
            heading: 'Create invoices',
            body: 'The Invoices menu lists student invoices per academic year and supports bulk invoice creation.',
            steps: [
              'Open the Invoices menu in the Finance group.',
              'Choose bulk invoice creation.',
              'Set the fee type, classes, and period.',
              'Confirm.',
            ],
          },
          {
            heading: 'Receive payments',
            body: 'In the Cashier menu, find the student, pick the invoices being paid, then receive the payment and download a PDF receipt. A wrong payment can be voided and is logged.',
          },
          {
            heading: 'Reports',
            body: 'The Financial reports menu summarizes the school income and outstanding balances.',
          },
        ],
      },
      su: {
        title: 'Kauangan sakola (SPP, tagihan, pambayaran)',
        summary: 'Atur jenis biaya, jieun tagihan siswa, tarima pambayaran, jeung tingali laporan.',
        sections: [
          {
            heading: 'Jenis biaya jeung tarif',
            body: 'Dina menu Jenis biaya & tarif, atur biaya sakola saperti SPP sarta nominalna per tahun ajaran jeung jenjang.',
          },
          {
            heading: 'Jieun tagihan',
            body: 'Menu Tagihan ngandung daptar tagihan siswa per tahun ajaran tur bisa nyieun tagihan sakaligus.',
            steps: [
              'Buka menu Tagihan dina kelompok Keuangan.',
              'Pilih nyieun tagihan massal.',
              'Tangtukeun jenis biaya, kelas, jeung periode.',
              'Konfirmasi.',
            ],
          },
          {
            heading: 'Narima pambayaran',
            body: 'Dina menu Kasir, golédah siswa, pilih tagihan nu dibayar, tuluy tarima pambayaran jeung unduh kwitansi PDF. Pambayaran nu lepat bisa dibatalkeun sarta kacatet.',
          },
          {
            heading: 'Laporan',
            body: 'Menu Laporan keuangan ngarangkum panarimaan jeung tunggakan sakola.',
          },
        ],
      },
    },
  },
  {
    slug: 'admissions',
    icon: 'clipboard',
    tone: 'rose',
    text: {
      id: {
        title: 'SPMB (penerimaan siswa baru)',
        summary:
          'Buka periode pendaftaran, verifikasi pendaftar, putuskan penerimaan, lalu daftarkan sebagai siswa.',
        sections: [
          {
            heading: 'Buat periode',
            body: 'Buat Periode SPMB lebih dulu agar calon murid bisa mendaftar lewat halaman publik sekolah. Bagikan tautan atau poster pendaftaran.',
          },
          {
            heading: 'Proses pendaftar',
            body: 'Pendaftar yang masuk muncul di halaman SPMB dengan status Masuk, Diverifikasi, Diterima, Ditolak, Terdaftar, atau Mundur.',
            steps: [
              'Buka SPMB dan periksa dokumen pendaftar.',
              'Verifikasi pendaftar yang lengkap.',
              'Terima atau tolak, bisa massal dengan Aksi massal.',
              'Daftarkan yang diterima sebagai siswa.',
            ],
          },
          {
            heading: 'Kuota',
            body: 'Jika periode memakai batas kuota, kartu Kuota terpakai menunjukkan persentase kuota yang terisi.',
          },
        ],
      },
      en: {
        title: 'Admissions (new student intake)',
        summary:
          'Open a registration period, verify applicants, decide on admission, then enroll them as students.',
        sections: [
          {
            heading: 'Create a period',
            body: 'Create an Admissions period first so prospective students can apply through the school public page. Share the registration link or poster.',
          },
          {
            heading: 'Process applicants',
            body: 'Incoming applicants appear on the Admissions page with the status Submitted, Verified, Accepted, Rejected, Enrolled, or Withdrawn.',
            steps: [
              'Open Admissions and check the applicant documents.',
              'Verify complete applicants.',
              'Accept or reject, in bulk with Bulk actions if needed.',
              'Enroll accepted applicants as students.',
            ],
          },
          {
            heading: 'Quota',
            body: 'If a period uses a quota limit, the Quota used card shows the percentage that has been filled.',
          },
        ],
      },
      su: {
        title: 'SPMB (panarimaan siswa anyar)',
        summary:
          'Buka periode pendaptaran, verifikasi pendaptar, putuskeun ditarima, tuluy daptarkeun jadi siswa.',
        sections: [
          {
            heading: 'Nyieun periode',
            body: 'Jieun Periode SPMB heula supaya calon murid bisa ndaptar lewat kaca publik sakola. Bagikeun tautan atawa poster pendaptaran.',
          },
          {
            heading: 'Ngolah pendaptar',
            body: 'Pendaptar nu asup némbongan dina kaca SPMB kalawan status Masuk, Diverifikasi, Diterima, Ditolak, Terdaftar, atawa Mundur.',
            steps: [
              'Buka SPMB tuluy pariksa dokumén pendaptar.',
              'Verifikasi pendaptar nu geus lengkep.',
              'Tarima atawa tolak, bisa sakaligus nganggo Aksi massal.',
              'Daptarkeun nu ditarima jadi siswa.',
            ],
          },
          {
            heading: 'Kuota',
            body: 'Lamun periode maké wates kuota, kartu Kuota terpakai nunjukkeun persén kuota nu geus kaeusi.',
          },
        ],
      },
    },
  },
  {
    slug: 'whatsapp',
    icon: 'message',
    tone: 'emerald',
    text: {
      id: {
        title: 'Notifikasi WhatsApp ke wali',
        summary:
          'Fitur ini bertahap: pengaturan dan templat pesan sudah ada, pengiriman ke wali diaktifkan menyusul.',
        sections: [
          {
            heading: 'Yang sudah tersedia',
            body: 'Menu Notifikasi WhatsApp memuat pengaturan penyedia dan templat pesan untuk tiap peristiwa. Anda bisa menyiapkannya dari sekarang.',
          },
          {
            heading: 'Atur templat pesan',
            body: 'Isi pesan bisa diubah, dan nama pengganti seperti nama siswa dapat disisipkan dengan sekali klik. Templat dapat dikembalikan ke bawaan.',
            steps: [
              'Buka menu Notifikasi WhatsApp di kelompok Komunikasi dan situs.',
              'Pilih peristiwa pada bagian templat pesan.',
              'Ubah isi pesan, sisipkan pengganti bila perlu.',
              'Simpan.',
            ],
          },
          {
            heading: 'Pengiriman bertahap',
            body: 'Pengiriman ke wali diaktifkan bertahap. Selama belum aktif, mode log uji hanya mencatat pesan tanpa mengirimnya, dan pengiriman bisa dinonaktifkan oleh pengelola platform.',
          },
        ],
      },
      en: {
        title: 'WhatsApp notifications to guardians',
        summary:
          'This feature is rolling out in stages: settings and message templates exist, sending to guardians is enabled later.',
        sections: [
          {
            heading: 'What is available',
            body: 'The WhatsApp notifications menu holds the provider settings and a message template for each event. You can prepare them now.',
          },
          {
            heading: 'Edit message templates',
            body: 'Message text can be changed, and placeholders such as the student name can be inserted with one click. Templates can be reset to the default.',
            steps: [
              'Open the WhatsApp notifications menu in the Communication and site group.',
              'Pick an event in the message templates section.',
              'Edit the text and insert placeholders if needed.',
              'Save.',
            ],
          },
          {
            heading: 'Staged delivery',
            body: 'Sending to guardians is enabled in stages. Until then, the test log mode only records messages without sending them, and sending can be switched off by the platform operator.',
          },
        ],
      },
      su: {
        title: 'Notifikasi WhatsApp ka wali',
        summary:
          'Fitur ieu kaluarna bertahap: pengaturan jeung templat pesen geus aya, ngirim ka wali diaktifkeun satuluyna.',
        sections: [
          {
            heading: 'Nu geus sayogi',
            body: 'Menu Notifikasi WhatsApp ngandung pengaturan panyadia jeung templat pesen pikeun unggal kajadian. Anjeun tiasa nyiapkeunana ti ayeuna.',
          },
          {
            heading: 'Ngatur templat pesen',
            body: 'Eusi pesen bisa diganti, sarta pengganti saperti ngaran siswa bisa diselapkeun ku sakali klik. Templat bisa dibalikkeun ka bawaan.',
            steps: [
              'Buka menu Notifikasi WhatsApp dina kelompok Komunikasi dan situs.',
              'Pilih kajadian dina bagian templat pesen.',
              'Robah eusi pesen, selapkeun pengganti lamun perlu.',
              'Simpen.',
            ],
          },
          {
            heading: 'Ngirim bertahap',
            body: 'Ngirim ka wali diaktifkeun bertahap. Salila can aktif, mode log uji ngan nyatet pesen tanpa ngirimkeunana, sarta pangirimanna bisa dipareuman ku pangurus platform.',
          },
        ],
      },
    },
  },
  {
    slug: 'roles-permissions',
    icon: 'shield',
    tone: 'slate',
    text: {
      id: {
        title: 'Peran dan izin',
        summary: 'Atur siapa boleh melakukan apa di sekolah lewat peran, lalu pasangkan ke anggota.',
        sections: [
          {
            heading: 'Peran dan izin',
            body: 'Peran adalah kumpulan izin, dan izin seseorang adalah gabungan semua perannya. Ada peran bawaan seperti Admin sekolah, Kepala sekolah, Kurikulum, Bendahara, Operator, dan Guru, ditambah peran kustom.',
            steps: [
              'Buka menu Peran di kelompok Pengguna dan akses.',
              'Klik buat peran kustom dan beri nama.',
              'Pilih minimal satu izin.',
              'Simpan; perubahan langsung berlaku bagi semua pemegang peran.',
            ],
          },
          {
            heading: 'Undang anggota',
            body: 'Di menu Anggota, undang orang lewat email dan pilih perannya. Tautan undangan berlaku 7 hari dan bisa dikirim ulang atau dicabut.',
          },
          {
            heading: 'Nonaktifkan akses',
            body: 'Anggota yang tidak lagi bertugas dapat dinonaktifkan sehingga tidak bisa masuk, dan diaktifkan kembali kapan saja.',
          },
        ],
      },
      en: {
        title: 'Roles and permissions',
        summary: 'Control who can do what in the school through roles, then assign them to members.',
        sections: [
          {
            heading: 'Roles and permissions',
            body: 'A role is a set of permissions, and a person permissions are the combination of all their roles. There are built-in roles such as School admin, Principal, Curriculum, Treasurer, Operator, and Teacher, plus custom roles.',
            steps: [
              'Open the Roles menu in the Users and access group.',
              'Click create custom role and name it.',
              'Pick at least one permission.',
              'Save; the change applies immediately to everyone holding the role.',
            ],
          },
          {
            heading: 'Invite members',
            body: 'In the Members menu, invite people by email and choose their roles. The invitation link is valid for 7 days and can be resent or revoked.',
          },
          {
            heading: 'Disable access',
            body: 'Members who no longer serve can be disabled so they cannot sign in, and re-enabled at any time.',
          },
        ],
      },
      su: {
        title: 'Peran jeung idin',
        summary: 'Atur saha nu meunang ngalakukeun naon di sakola lewat peran, tuluy pasangkeun ka anggota.',
        sections: [
          {
            heading: 'Peran jeung idin',
            body: 'Peran téh kumpulan idin, sarta idin hiji jalma nyaéta gabungan sakabéh peranna. Aya peran bawaan saperti Admin sekolah, Kepala sekolah, Kurikulum, Bendahara, Operator, jeung Guru, ditambah peran kustom.',
            steps: [
              'Buka menu Peran dina kelompok Pengguna dan akses.',
              'Klik jieun peran kustom tuluy pasihan ngaran.',
              'Pilih sahanteuna hiji idin.',
              'Simpen; parobahan langsung lumaku pikeun sakabéh nu mibanda peran.',
            ],
          },
          {
            heading: 'Ngondang anggota',
            body: 'Dina menu Anggota, ondang jalma lewat surélék tuluy pilih perananna. Tautan undangan lumaku 7 poé sarta bisa dikirim deui atawa dicabut.',
          },
          {
            heading: 'Mareuman aksés',
            body: 'Anggota nu geus teu tugas bisa dipareuman supaya teu bisa lebet, sarta bisa diaktifkeun deui iraha waé.',
          },
        ],
      },
    },
  },
  {
    slug: 'subscription-billing',
    icon: 'credit',
    tone: 'amber',
    text: {
      id: {
        title: 'Langganan, modul, perpanjang, tingkatkan paket, tambah unit sekolah, tagihan',
        summary:
          'Pantau langganan yayasan, modul yang aktif, unit sekolah, dan bayar tagihan di halaman Akun yayasan.',
        sections: [
          {
            heading: 'Lihat langganan dan modul',
            body: 'Halaman Akun yayasan menampilkan status langganan (Aktif, Masa tenggang, Ditangguhkan, Dibatalkan, atau Menunggu bayar), periode bulanan atau tahunan, tanggal berakhir, dan modul yang aktif. Halaman ini hanya bisa dilihat pemilik yayasan.',
          },
          {
            heading: 'Bayar dan perpanjang',
            body: 'Tagihan langganan muncul di bagian Tagihan dengan status Belum dibayar, Lunas, Kedaluwarsa, atau Dibatalkan. Perpanjangan dilakukan dengan membayar tagihan berikutnya.',
            steps: [
              'Buka halaman Akun yayasan.',
              'Cari tagihan berstatus Belum dibayar di bagian Tagihan.',
              'Klik Bayar sekarang dan selesaikan pembayaran.',
            ],
          },
          {
            heading: 'Tingkatkan paket atau tambah unit',
            body: 'Buka Unit sekolah lalu klik Ubah paket untuk menambah modul atau mengganti tingkat siswa; penambahan dihitung prorata untuk sisa periode dan berlaku setelah dibayar, sedangkan pelepasan modul berlaku di periode berikutnya. Untuk unit baru, klik Tambah unit sekolah, isi nama, alamat, modul, lalu bayar tagihannya.',
          },
          {
            heading: 'Jika tagihan terlambat',
            body: 'Setelah lewat jatuh tempo langganan masuk masa tenggang, lalu unit bisa ditangguhkan. Akses dibuka kembali otomatis setelah tagihan dibayar.',
          },
        ],
      },
      en: {
        title: 'Subscription, modules, renewing, upgrading, adding school units, invoices',
        summary:
          'Track the foundation subscription, active modules, school units, and pay invoices on the Foundation account page.',
        sections: [
          {
            heading: 'View subscription and modules',
            body: 'The Foundation account page shows the subscription status (Active, Grace period, Suspended, Canceled, or Awaiting payment), the monthly or yearly period, the end date, and the active modules. Only the foundation owner can see this page.',
          },
          {
            heading: 'Pay and renew',
            body: 'Subscription invoices appear under Invoices with the status Unpaid, Paid, Expired, or Void. You renew by paying the next invoice.',
            steps: [
              'Open the Foundation account page.',
              'Find an Unpaid invoice in the Invoices section.',
              'Click Pay now and complete the payment.',
            ],
          },
          {
            heading: 'Upgrade or add a unit',
            body: 'Open School units and click Change plan to add modules or switch the student tier; additions are prorated for the rest of the period and take effect once paid, while removed modules take effect next period. For a new unit, click Add school unit, fill in the name, address and modules, then pay the invoice.',
          },
          {
            heading: 'If an invoice is late',
            body: 'After the due date the subscription enters a grace period, and then units may be suspended. Access reopens automatically once the invoice is paid.',
          },
        ],
      },
      su: {
        title: 'Langganan, modul, perpanjang, naékkeun paket, nambah unit sakola, tagihan',
        summary:
          'Pantau langganan yayasan, modul nu aktif, unit sakola, jeung mayar tagihan dina kaca Akun yayasan.',
        sections: [
          {
            heading: 'Nempo langganan jeung modul',
            body: 'Kaca Akun yayasan mintonkeun status langganan (Aktif, Masa tenggang, Ditangguhkan, Dibatalkan, atawa Menunggu bayar), periode bulanan atawa taunan, tanggal réngsé, jeung modul nu aktif. Kaca ieu ngan bisa ditempo ku pamilik yayasan.',
          },
          {
            heading: 'Mayar jeung perpanjang',
            body: 'Tagihan langganan némbongan dina bagian Tagihan kalawan status Belum dibayar, Lunas, Kedaluwarsa, atawa Dibatalkan. Langganan dipanjangkeun ku mayar tagihan saterusna.',
            steps: [
              'Buka kaca Akun yayasan.',
              'Golédah tagihan status Belum dibayar dina bagian Tagihan.',
              'Klik Bayar sekarang tuluy réngsékeun pambayaran.',
            ],
          },
          {
            heading: 'Naékkeun paket atawa nambah unit',
            body: 'Buka Unit sakola tuluy pencét Robah paket pikeun nambah modul atawa ngagentos tingkat siswa; tambahanana diitung prorata pikeun sésa période sarta ngalaku sanggeus dibayar, sedengkeun modul nu dicabut ngalaku dina période hareup. Pikeun unit anyar, pencét Tambah unit sakola, eusian ngaran, alamat, modul, tuluy bayar tagihanana.',
          },
          {
            heading: 'Lamun tagihan telat',
            body: 'Sanggeus ngalangkungan jatuh tempo, langganan asup masa tenggang, tuluy unit bisa ditangguhkeun. Aksés dibuka deui otomatis sanggeus tagihan dibayar.',
          },
        ],
      },
    },
  },
  {
    slug: 'security',
    icon: 'lock',
    tone: 'slate',
    text: {
      id: {
        title: 'Keamanan akun',
        summary: 'Jaga akun tetap aman dengan kata sandi kuat dan keluar dari perangkat bersama.',
        sections: [
          {
            heading: 'Kata sandi',
            body: 'Gunakan kata sandi minimal 12 karakter. Jangan bagikan kata sandi ke siapa pun, termasuk sesama staf.',
          },
          {
            heading: 'Nama dan keluar',
            body: 'Pastikan nama akun Anda benar karena dipakai pada undangan dan catatan aktivitas. Selalu keluar setelah memakai komputer bersama.',
          },
          {
            heading: 'Pemilik yayasan',
            body: 'Hanya pemilik yayasan yang dapat melihat langganan dan tagihan. Berikan akses sekolah kepada staf lewat undangan dan peran, bukan dengan berbagi akun.',
          },
        ],
      },
      en: {
        title: 'Account security',
        summary: 'Keep your account safe with a strong password and by signing out on shared devices.',
        sections: [
          {
            heading: 'Password',
            body: 'Use a password of at least 12 characters. Never share your password with anyone, including fellow staff.',
          },
          {
            heading: 'Name and signing out',
            body: 'Make sure your account name is correct because it is used in invitations and activity records. Always sign out after using a shared computer.',
          },
          {
            heading: 'Foundation owner',
            body: 'Only the foundation owner can see the subscription and invoices. Give staff school access through invitations and roles, not by sharing an account.',
          },
        ],
      },
      su: {
        title: 'Kaamanan akun',
        summary: 'Jaga akun tetep aman ku kecap sandi nu kuat jeung kaluar tina parabot babarengan.',
        sections: [
          {
            heading: 'Kecap sandi',
            body: 'Anggo kecap sandi sahanteuna 12 karakter. Ulah dibagikeun ka saha waé, kaasup ka sasama staf.',
          },
          {
            heading: 'Ngaran jeung kaluar',
            body: 'Pastikeun ngaran akun anjeun bener sabab dipaké dina undangan jeung catetan aktivitas. Salawasna kaluar sanggeus maké komputer babarengan.',
          },
          {
            heading: 'Pamilik yayasan',
            body: 'Ngan pamilik yayasan nu bisa nempo langganan jeung tagihan. Pasihan staf aksés sakola lewat undangan jeung peran, lain ku babagi akun.',
          },
        ],
      },
    },
  },
];
