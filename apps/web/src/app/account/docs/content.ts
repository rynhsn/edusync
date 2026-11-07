import type { DocArticle } from '@/lib/docs-types';

export type { DocArticle, DocIcon, DocLocale, DocSection, DocText, DocTone } from '@/lib/docs-types';

/** Panduan Portal Akun untuk pengelola lembaga: langganan, tagihan, unit, keamanan, dan cara membuka sekolah. Isi: id, en, su. */
export const DOC_ARTICLES: DocArticle[] = [
  {
    slug: 'first-steps',
    icon: 'rocket',
    tone: 'emerald',
    group: 'start',
    text: {
      id: {
        title: 'Panduan awal pengelola lembaga',
        summary:
          'Kartu Mulai di sini di Ringkasan menuntun Anda dari pembayaran sampai membuka sekolah dan mengundang tim.',
        forWho: 'Pengelola lembaga yang baru selesai mendaftar dan membayar.',
        sections: [
          {
            heading: 'Memakai kartu Mulai di sini',
            body: 'Kartu ini muncul di Ringkasan dan hilang sendiri bila semua langkah selesai. Anda juga bisa menutupnya dengan tombol X; penutupan hanya berlaku di peramban yang Anda pakai.',
            steps: [
              'Buka Ringkasan pada Menu akun.',
              'Pastikan langganan berstatus aktif dan Tagihan terbuka bernilai nol.',
              'Pada kartu Sekolah Anda, klik Buka sekolah.',
            ],
            href: '/account',
          },
          {
            heading: 'Mengisi sekolah setelah dibuka',
            body: 'Pekerjaan harian dikerjakan di panel sekolah, bukan di Portal Akun. Mulailah dari identitas sekolah dan data induk.',
            steps: [
              'Lengkapi identitas sekolah di Pengaturan sekolah.',
              'Tambah Tahun ajaran, Kelas, dan Mata pelajaran.',
              'Buka menu Anggota lalu klik Kirim undangan untuk admin sekolah dan guru.',
            ],
            tip: 'Guru dan staf masuk lewat alamat sekolah, bukan lewat Portal Akun. Jangan bagikan kata sandi Anda.',
          },
        ],
        faq: [
          {
            q: 'Kartu Mulai di sini hilang. Bagaimana menampilkannya lagi?',
            a: 'Kartu hilang bila semua langkah selesai atau Anda menutupnya. Panduan yang sama selalu ada di artikel ini.',
          },
        ],
      },
      en: {
        title: 'Getting started guide for institution managers',
        summary:
          'The Start here card on the Overview takes you from payment to opening the school and inviting your team.',
        forWho: 'Institution managers who have just registered and paid.',
        sections: [
          {
            heading: 'Using the Start here card',
            body: 'This card appears on the Overview and disappears by itself when every step is done. You can also close it with the X button; closing only applies to the browser you use.',
            steps: [
              'Open Overview in the account menu.',
              'Make sure the subscription is active and Open invoices is zero.',
              'On the Your schools card, click Open school.',
            ],
            href: '/account',
          },
          {
            heading: 'Filling in the school once it is open',
            body: 'Daily work happens in the school panel, not in the Account Portal. Start with the school identity and master data.',
            steps: [
              'Complete the school identity in School settings.',
              'Add the Academic year, Classes, and Subjects.',
              'Open Members and click Send invitation for school admins and teachers.',
            ],
            tip: 'Teachers and staff sign in through the school address, not the Account Portal. Never share your password.',
          },
        ],
        faq: [
          {
            q: 'The Start here card is gone. How do I see it again?',
            a: 'The card disappears when every step is done or when you close it. The same guide is always available in this article.',
          },
        ],
      },
      su: {
        title: 'Pituduh awal pangurus lembaga',
        summary:
          'Kartu Mimitian ti dieu di Ringkesan nungtun Anjeun ti pamayaran nepi ka muka sakola jeung ngulem tim.',
        forWho: 'Pangurus lembaga nu karék réngsé ngadaptar jeung mayar.',
        sections: [
          {
            heading: 'Maké kartu Mimitian ti dieu',
            body: 'Kartu ieu aya di Ringkesan sarta leungit sorangan lamun sakabéh léngkah geus réngsé. Anjeun ogé bisa nutupna ku tombol X; panutupan ngan lumaku di pangbaruan nu dipaké.',
            steps: [
              'Buka Ringkesan dina Menu akun.',
              'Pastikeun langganan aktif jeung Tagihan kabuka nol.',
              'Dina kartu Sakola Anjeun, klik Buka sakola.',
            ],
            href: '/account',
          },
          {
            heading: 'Ngeusian sakola sanggeus dibuka',
            body: 'Gawé unggal poé dilakukeun di panel sakola, lain di Portal Akun. Mimitian ti identitas sakola jeung data induk.',
            steps: [
              'Lengkepan identitas sakola di Setélan sakola.',
              'Tambihan Taun ajar, Kelas, jeung Mata pelajaran.',
              'Buka menu Anggota terus klik Kirim uleman pikeun admin sakola jeung guru.',
            ],
            tip: 'Guru jeung staf lebet lewat alamat sakola, lain lewat Portal Akun. Ulah bagikeun kecap akses Anjeun.',
          },
        ],
        faq: [
          {
            q: 'Kartu Mimitian ti dieu leungit. Kumaha nampilkeun deui?',
            a: 'Kartu leungit lamun sakabéh léngkah réngsé atawa Anjeun nutupna. Pituduh nu sarua salawasna aya dina artikel ieu.',
          },
        ],
      },
    },
  },
  {
    slug: 'getting-started',
    icon: 'rocket',
    tone: 'teal',
    group: 'start',
    text: {
      id: {
        title: 'Memulai sebagai pengelola lembaga',
        summary:
          'Dari masuk ke Portal Akun, membuka sekolah, sampai tim sekolah siap bekerja. Portal Akun adalah tempat Anda mengurus langganan dan tagihan.',
        forWho:
          'Pengelola lembaga yang baru mendaftarkan lembaga dan ingin tahu apa yang dikerjakan lebih dulu.',
        sections: [
          {
            heading: 'Masuk ke Portal Akun',
            body: 'Portal Akun adalah halaman milik lembaga. Di sini Anda melihat langganan, unit sekolah, dan tagihan. Pekerjaan harian sekolah (siswa, absensi, nilai) tidak dikerjakan di sini, melainkan di sekolahnya masing-masing.',
            steps: [
              'Buka halaman masuk Edusync, isi Email dan Kata sandi, lalu klik Masuk.',
              'Buka Ringkasan pada Menu akun.',
              'Periksa empat angka di bagian atas: Unit sekolah, Modul aktif, Sisa periode (hari), dan Tagihan terbuka.',
            ],
            tip: 'Menu akun berisi Ringkasan, Unit sekolah, Langganan dan modul, Tagihan dan pembayaran, Pengelola lembaga, Bantuan, Dokumentasi, serta Profil dan keamanan.',
            href: '/account',
          },
          {
            heading: 'Membuka sekolah dari Portal Akun',
            body: 'Setiap sekolah di lembaga Anda adalah satu unit. Dari Portal Akun Anda membuka unit itu untuk mulai bekerja di dalamnya.',
            steps: [
              'Buka Unit sekolah pada Menu akun.',
              'Cari unit yang ingin dikelola.',
              'Klik Buka sekolah.',
              'Di dalam sekolah, buka menu Dokumentasi untuk panduan kerja per modul.',
            ],
            href: '/account/units',
          },
          {
            heading: 'Menyiapkan sekolah untuk pertama kali',
            body: 'Isi data dasar lebih dulu supaya modul lain berjalan lancar. Menunya ada di kelompok Data induk di dalam sekolah.',
            steps: [
              'Atur Tahun ajaran dan kalender.',
              'Tambah Kelas dan Mata pelajaran.',
              'Tambah Guru dan Siswa.',
              'Lengkapi Pengaturan sekolah.',
            ],
            tip: 'Langkah rinci tiap menu ada di panduan Dokumentasi di panel sekolah (menu Dokumentasi).',
          },
          {
            heading: 'Mengundang guru dan staf',
            body: 'Guru, bendahara, dan staf lain masuk lewat undangan email, bukan lewat akun Anda. Setiap orang mendapat peran sesuai tugasnya.',
            steps: [
              'Buka sekolah, lalu buka menu Anggota di kelompok Pengguna dan akses.',
              'Isi Email dan pilih Peran.',
              'Klik Kirim undangan.',
              'Penerima membuka tautan di email dan membuat akun atau masuk untuk menerima.',
            ],
            warning:
              'Jangan membagikan email dan kata sandi Anda kepada staf. Akun Anda memegang langganan dan tagihan lembaga.',
          },
        ],
        faq: [
          {
            q: 'Saya tidak melihat halaman Akun lembaga. Kenapa?',
            a: 'Halaman ini hanya untuk pengelola lembaga. Guru dan staf sekolah masuk lewat alamat sekolah masing-masing. Bila Anda seharusnya pengelola, hubungi orang yang mendaftarkan lembaga.',
          },
          {
            q: 'Saya lupa kata sandi. Bagaimana?',
            a: 'Di halaman masuk, klik Lupa kata sandi?, isi email, lalu klik Kirim kode. Masukkan kode 6 digit dari email (berlaku 10 menit) dan kata sandi baru. Lihat artikel Keamanan akun untuk langkah lengkap.',
          },
          {
            q: 'Dari mana saya mulai mengisi sekolah?',
            a: 'Klik Buka sekolah di Unit sekolah, lalu isi Data induk: Tahun ajaran, Kelas, Mata pelajaran, Guru, dan Siswa. Panduan tiap menu ada di menu Dokumentasi dalam sekolah.',
          },
          {
            q: 'Di mana saya melihat berapa lama langganan masih berlaku?',
            a: 'Buka Ringkasan. Kartu Sisa periode (hari) menunjukkan sisa hari, dan tanggal berakhirnya tertulis di bawahnya.',
          },
        ],
      },
      en: {
        title: 'Getting started as an institution manager',
        summary:
          'From signing in to the Account portal and opening a school to getting the school team ready. The Account portal is where you handle the subscription and invoices.',
        forWho: 'Institution managers who have just registered and want to know what to do first.',
        sections: [
          {
            heading: 'Signing in to the Account portal',
            body: 'The Account portal belongs to your institution. Here you see the subscription, school units, and invoices. Daily school work (students, attendance, grades) is not done here, but inside each school.',
            steps: [
              'Open the Edusync sign-in page, fill in Email and Password, then click Sign in.',
              'Open Overview in the Account menu.',
              'Check the four numbers at the top: School units, Active modules, Days left in period, and Open invoices.',
            ],
            tip: 'The Account menu has Overview, School units, Subscription and modules, Billing and payments, Institution managers, Help, Documentation, and Profile and security.',
            href: '/account',
          },
          {
            heading: 'Opening a school from the Account portal',
            body: 'Every school in your institution is a unit. From the Account portal you open a unit to start working inside it.',
            steps: [
              'Open School units in the Account menu.',
              'Find the unit you want to manage.',
              'Click Open school.',
              'Inside the school, open the Documentation menu for work guides per module.',
            ],
            href: '/account/units',
          },
          {
            heading: 'Setting up the school for the first time',
            body: 'Fill in the basics first so the other modules work smoothly. The menus are in the Master data group inside the school.',
            steps: [
              'Set up Academic years and the calendar.',
              'Add Classes and Subjects.',
              'Add Teachers and Students.',
              'Complete School settings.',
            ],
            tip: 'Detailed steps for each menu are in the Documentation guides in the school panel (the Documentation menu).',
          },
          {
            heading: 'Inviting teachers and staff',
            body: 'Teachers, treasurers, and other staff join through an email invitation, not through your account. Each person gets a role that fits their job.',
            steps: [
              'Open the school, then open the Members menu in the Users and access group.',
              'Fill in the Email and pick a Role.',
              'Click Send invitation.',
              'The recipient opens the link in the email and creates an account or signs in to accept.',
            ],
            warning:
              'Do not share your email and password with staff. Your account holds the institution subscription and invoices.',
          },
        ],
        faq: [
          {
            q: 'I cannot see the Institution account page. Why?',
            a: 'This page is only for institution managers. Teachers and school staff sign in at their own school address. If you should be a manager, contact the person who registered the institution.',
          },
          {
            q: 'I forgot my password. What now?',
            a: 'On the sign-in page, click Forgot password?, enter your email, then click Send code. Enter the 6-digit code from the email (valid for 10 minutes) and a new password. See the Account security article for the full steps.',
          },
          {
            q: 'Where do I start filling in the school?',
            a: 'Click Open school under School units, then fill in Master data: Academic years, Classes, Subjects, Teachers, and Students. Guides for each menu are in the Documentation menu inside the school.',
          },
          {
            q: 'Where can I see how long the subscription is still valid?',
            a: 'Open Overview. The Days left in period card shows the days remaining, and the end date is written below it.',
          },
        ],
      },
      su: {
        title: 'Ngawitan jadi pangurus lembaga',
        summary:
          'Ti lebet ka Portal Akun, muka sakola, nepi ka tim sakola siap digawé. Portal Akun téh tempat anjeun ngurus langganan jeung tagihan.',
        forWho:
          'Pangurus lembaga nu karék ngadaptarkeun lembaga sarta hayang nyaho naon nu dikerjakeun heula.',
        sections: [
          {
            heading: 'Lebet ka Portal Akun',
            body: 'Portal Akun téh kaca milik lembaga. Di dieu anjeun ningali langganan, unit sakola, jeung tagihan. Pagawéan sapopoé sakola (siswa, absénsi, nilai) teu dikerjakeun di dieu, tapi di unggal sakola.',
            steps: [
              'Buka kaca lebet Edusync, eusian Surélék jeung Kecap sandi, tuluy klik Lebet.',
              'Buka Ringkesan dina Ménu akun.',
              'Parios opat angka di luhur: Unit sakola, Modul aktif, Sésa période (poé), jeung Tagihan nu muka.',
            ],
            tip: 'Ménu akun eusina Ringkesan, Unit sakola, Langganan jeung modul, Tagihan jeung pambayaran, Pangurus lembaga, Bantuan, Dokuméntasi, jeung Profil jeung kaamanan.',
            href: '/account',
          },
          {
            heading: 'Muka sakola ti Portal Akun',
            body: 'Unggal sakola di lembaga anjeun téh hiji unit. Ti Portal Akun anjeun muka unit éta pikeun ngawitan digawé di jerona.',
            steps: [
              'Buka Unit sakola dina Ménu akun.',
              'Golédah unit nu rék diurus.',
              'Klik Buka sakola.',
              'Di jero sakola, buka ménu Dokuméntasi pikeun pituduh gawé per modul.',
            ],
            href: '/account/units',
          },
          {
            heading: 'Nyiapkeun sakola pikeun kahiji kali',
            body: 'Eusian heula data dasar supaya modul séjénna lancar. Ménuna aya dina kelompok Data induk di jero sakola.',
            steps: [
              'Atur Tahun ajaran jeung kalénder.',
              'Tambihan Kelas jeung Mata pelajaran.',
              'Tambihan Guru jeung Siswa.',
              'Lengkepan Pengaturan sekolah.',
            ],
            tip: 'Léngkah lengkep unggal ménu aya dina pituduh Dokuméntasi di panel sakola (ménu Dokuméntasi).',
          },
          {
            heading: 'Ngondang guru jeung staf',
            body: 'Guru, bendahara, jeung staf séjénna lebet ngaliwatan undangan surélék, lain ngaliwatan akun anjeun. Unggal jalma meunang peran nu luyu jeung tugasna.',
            steps: [
              'Buka sakola, tuluy buka ménu Anggota dina kelompok Pengguna dan akses.',
              'Eusian Surélék jeung pilih Peran.',
              'Klik Kirim undangan.',
              'Panarima muka tautan dina surélék tuluy nyieun akun atawa lebet pikeun narima.',
            ],
            warning:
              'Ulah ngabagikeun surélék jeung kecap sandi anjeun ka staf. Akun anjeun nyepeng langganan jeung tagihan lembaga.',
          },
        ],
        faq: [
          {
            q: 'Abdi teu mendak kaca Akun lembaga. Naha?',
            a: 'Kaca ieu ngan pikeun pangurus lembaga. Guru jeung staf sakola lebet ngaliwatan alamat sakola masing-masing. Upami anjeun kedahna pangurus, hubungi jalma nu ngadaptarkeun lembaga.',
          },
          {
            q: 'Abdi poho kecap sandi. Kumaha?',
            a: 'Di kaca lebet, klik Lupa kata sandi?, eusian surélék, tuluy klik Kirim kode. Asupkeun kode 6 angka tina surélék (lumaku 10 menit) jeung kecap sandi anyar. Tingali artikel Kaamanan akun pikeun léngkah lengkepna.',
          },
          {
            q: 'Ti mana abdi ngawitan ngeusian sakola?',
            a: 'Klik Buka sakola dina Unit sakola, tuluy eusian Data induk: Tahun ajaran, Kelas, Mata pelajaran, Guru, jeung Siswa. Pituduh unggal ménu aya dina ménu Dokuméntasi di jero sakola.',
          },
          {
            q: 'Di mana abdi tiasa ningali sabaraha lami langganan masih lumaku?',
            a: 'Buka Ringkesan. Kartu Sésa période (poé) nunjukkeun sésa poé, sarta tanggal réngséna ditulis di handapeunana.',
          },
        ],
      },
    },
  },
  {
    slug: 'students',
    icon: 'users',
    tone: 'sky',
    group: 'school_ops',
    text: {
      id: {
        title: 'Data siswa dan jumlah siswa di paket',
        summary:
          'Gambaran singkat memasukkan siswa ke sekolah, dan menyesuaikan paket dengan jumlah siswa. Langkah rinci ada di panduan Dokumentasi di panel sekolah.',
        forWho: 'Pengelola lembaga yang ingin tahu cara memasukkan siswa dan kapan paket perlu dinaikkan.',
        sections: [
          {
            heading: 'Memasukkan banyak siswa sekaligus',
            body: 'Untuk puluhan siswa atau lebih, impor dari Excel jauh lebih cepat. Pekerjaan ini dilakukan di dalam sekolah, bukan di Portal Akun.',
            steps: [
              'Buka Unit sekolah lalu klik Buka sekolah.',
              'Buka menu Siswa di kelompok Data induk, lalu klik Impor Excel dan unduh templat.',
              'Isi templat. Yang wajib hanya Nama dan Jenis Kelamin (L atau P), dan isi Kelas persis seperti nama kelas.',
              'Unggah berkas dan periksa pratinjau.',
              'Klik impor bila semua baris sudah benar.',
            ],
            warning:
              'Bila ada satu baris yang salah, tidak ada siswa yang disimpan. Satu berkas paling banyak 1000 baris.',
            href: '/account/units',
          },
          {
            heading: 'Menambah satu siswa',
            body: 'Untuk siswa pindahan atau tambahan di tengah tahun, tambahkan satu per satu.',
            steps: [
              'Buka sekolah, lalu buka menu Siswa.',
              'Klik Tambah siswa dan isi nama serta jenis kelamin.',
              'Pilih Kelas bila sudah ada, lalu klik Tambah.',
            ],
            tip: 'Belum punya semua data? Simpan nama dan jenis kelamin dulu, lengkapi nanti lewat Ubah. Panduan lengkapnya ada di artikel Mengelola data siswa dan wali di menu Dokumentasi sekolah.',
          },
          {
            heading: 'Menyesuaikan paket dengan jumlah siswa',
            body: 'Setiap unit punya pilihan Jumlah siswa pada paketnya. Pilih tingkat yang sesuai dengan jumlah siswa aktif di sekolah itu.',
            steps: [
              'Buka Unit sekolah dan klik Ubah paket pada unit itu.',
              'Pada Jumlah siswa, pilih tingkat yang sesuai.',
              'Periksa Ringkasan: Dibayar sekarang dan Total.',
              'Klik Bayar dan terapkan, lalu selesaikan pembayaran.',
            ],
            warning:
              'Kenaikan tingkat berlaku setelah dibayar dan dihitung prorata untuk sisa periode. Penurunan tingkat baru berlaku di periode berikutnya.',
            href: '/account/units',
          },
        ],
        faq: [
          {
            q: 'Impor Excel gagal terus. Apa yang harus saya periksa?',
            a: 'Periksa tiga hal: judul kolom tidak diubah, Jenis Kelamin hanya L atau P, dan isi Kelas sama persis dengan nama kelas pada tahun ajaran aktif. Pratinjau menandai baris yang salah.',
          },
          {
            q: 'Siswa kami bertambah banyak. Apa yang perlu saya lakukan?',
            a: 'Buka Unit sekolah, klik Ubah paket, lalu pilih tingkat Jumlah siswa yang lebih besar dan bayar. Kenaikan langsung berlaku setelah pembayaran terkonfirmasi.',
          },
          {
            q: 'Siapa yang boleh menambah atau mengubah data siswa?',
            a: 'Di dalam sekolah, Admin sekolah dan Operator. Peran lain hanya melihat. Pengelola lembaga yang membuka sekolah dari Portal Akun menjadi admin awalnya.',
          },
        ],
      },
      en: {
        title: 'Student records and student count in your plan',
        summary:
          'A short overview of getting students into the school and matching your plan to the student count. Detailed steps are in the Documentation guides in the school panel.',
        forWho:
          'Institution managers who want to know how to bring students in and when the plan needs to go up.',
        sections: [
          {
            heading: 'Bringing in many students at once',
            body: 'For dozens of students or more, importing from Excel is much faster. This is done inside the school, not in the Account portal.',
            steps: [
              'Open School units and click Open school.',
              'Open the Students menu in the Master data group, then click Import Excel and download the template.',
              'Fill in the template. Only Name and Gender (L or P) are required, and Class must match the class name exactly.',
              'Upload the file and check the preview.',
              'Click import when every row is correct.',
            ],
            warning: 'If even one row is wrong, no student is saved. One file can hold at most 1000 rows.',
            href: '/account/units',
          },
          {
            heading: 'Adding a single student',
            body: 'For a transfer student or a mid-year addition, add them one by one.',
            steps: [
              'Open the school, then open the Students menu.',
              'Click Add a student and fill in the name and gender.',
              'Pick a Class if there is one, then click Add.',
            ],
            tip: 'Do not have all the details? Save the name and gender first and complete the rest later with Edit. The full guide is the article Managing students and guardians in the school Documentation menu.',
          },
          {
            heading: 'Matching your plan to the student count',
            body: 'Each unit has a Student count choice in its plan. Pick the tier that fits the number of active students in that school.',
            steps: [
              'Open School units and click Change plan on that unit.',
              'Under Student count, pick the right tier.',
              'Check the Summary: Pay now and Total.',
              'Click Pay and apply, then complete the payment.',
            ],
            warning:
              'A higher tier takes effect once paid and is prorated for the rest of the period. A lower tier only takes effect next period.',
            href: '/account/units',
          },
        ],
        faq: [
          {
            q: 'Excel import keeps failing. What should I check?',
            a: 'Check three things: the column titles are unchanged, Gender is only L or P, and Class matches the class name in the active academic year exactly. The preview marks the wrong rows.',
          },
          {
            q: 'Our student numbers have grown. What do I do?',
            a: 'Open School units, click Change plan, pick a larger Student count tier, and pay. The increase takes effect as soon as payment is confirmed.',
          },
          {
            q: 'Who can add or change student records?',
            a: 'Inside the school, School admins and Operators. Other roles can only view. The manager who opens a school from the Account portal becomes its first admin.',
          },
        ],
      },
      su: {
        title: 'Data siswa jeung jumlah siswa dina paket',
        summary:
          'Gambaran singget nyokot siswa ka sakola, jeung nyaluyukeun paket jeung jumlah siswa. Léngkah lengkep aya dina pituduh Dokuméntasi di panel sakola.',
        forWho: 'Pangurus lembaga nu hayang nyaho cara nyokot siswa jeung iraha paket kudu dinaékkeun.',
        sections: [
          {
            heading: 'Nyokot réa siswa sakaligus',
            body: 'Pikeun puluhan siswa atawa leuwih, ngimpor ti Excel leuwih gancang. Pagawéan ieu dilakukeun di jero sakola, lain di Portal Akun.',
            steps: [
              'Buka Unit sakola tuluy klik Buka sakola.',
              'Buka ménu Siswa dina kelompok Data induk, tuluy klik Impor Excel jeung unduh templatna.',
              'Eusian templat. Nu wajib ngan Nama jeung Jenis Kelamin (L atawa P), sarta eusi Kelas kudu persis jeung ngaran kelas.',
              'Unggah berkas tuluy pariksa pratinjau.',
              'Klik impor lamun sakabéh baris geus bener.',
            ],
            warning:
              'Lamun aya hiji baris nu lepat, taya siswa nu disimpen. Hiji berkas pang réana 1000 baris.',
            href: '/account/units',
          },
          {
            heading: 'Nambahan hiji siswa',
            body: 'Pikeun siswa pindahan atawa tambahan di tengah taun, tambihan hiji-hiji.',
            steps: [
              'Buka sakola, tuluy buka ménu Siswa.',
              'Klik Tambah siswa tuluy eusian ngaran jeung jenis kelamin.',
              'Pilih Kelas lamun geus aya, tuluy klik Tambah.',
            ],
            tip: 'Can gaduh sakabéh data? Simpen heula ngaran jeung jenis kelamin, lengkepan engké lewat Ubah. Pituduh lengkepna aya dina artikel Ngurus data siswa jeung wali dina ménu Dokuméntasi sakola.',
          },
          {
            heading: 'Nyaluyukeun paket jeung jumlah siswa',
            body: 'Unggal unit boga pilihan Jumlah siswa dina paketna. Pilih tingkat nu cocog jeung jumlah siswa aktip di sakola éta.',
            steps: [
              'Buka Unit sakola tuluy klik Robah paket dina unit éta.',
              'Dina Jumlah siswa, pilih tingkat nu cocog.',
              'Parios Ringkesan: Dibayar ayeuna jeung Total.',
              'Klik Bayar jeung larapkeun, tuluy réngsékeun pambayaran.',
            ],
            warning:
              'Naékkeun tingkat ngalaku sanggeus dibayar sarta diitung prorata pikeun sésa période. Nurunkeun tingkat ngalakuna dina période hareup.',
            href: '/account/units',
          },
        ],
        faq: [
          {
            q: 'Impor Excel gagal waé. Naon nu kudu dipariksa?',
            a: 'Parios tilu hal: judul kolom teu dirobah, Jenis Kelamin ngan L atawa P, jeung eusi Kelas persis sarua jeung ngaran kelas dina taun ajaran aktip. Pratinjau méré tanda baris nu lepat.',
          },
          {
            q: 'Siswa kami beuki réa. Naon nu kudu dilakukeun?',
            a: 'Buka Unit sakola, klik Robah paket, pilih tingkat Jumlah siswa nu leuwih badag tuluy bayar. Naékna langsung ngalaku sanggeus pambayaran dikonfirmasi.',
          },
          {
            q: 'Saha nu meunang nambahan atawa ngarobah data siswa?',
            a: 'Di jero sakola, Admin sekolah jeung Operator. Peran séjénna ngan bisa ningali. Pangurus lembaga nu muka sakola ti Portal Akun jadi admin awalna.',
          },
        ],
      },
    },
  },
  {
    slug: 'rfid-attendance',
    icon: 'scan',
    tone: 'emerald',
    group: 'school_ops',
    text: {
      id: {
        title: 'Absensi kartu dan gerbang',
        summary:
          'Gambaran singkat menyalakan absensi lewat kartu siswa di gerbang. Langkah rinci ada di panduan Dokumentasi di panel sekolah.',
        forWho: 'Pengelola lembaga yang ingin sekolahnya memakai absensi kartu di gerbang.',
        sections: [
          {
            heading: 'Memastikan modul Absensi aktif',
            body: 'Menu absensi, kartu, dan gerbang hanya muncul di sekolah yang modul Absensi-nya aktif.',
            steps: [
              'Buka Unit sekolah dan lihat daftar modul pada unit itu.',
              'Bila Absensi belum ada, klik Ubah paket.',
              'Centang Absensi, periksa Ringkasan, lalu klik Bayar dan terapkan.',
            ],
            href: '/account/units',
          },
          {
            heading: 'Menyiapkan gerbang dan kartu di sekolah',
            body: 'Pekerjaan ini dilakukan di dalam sekolah, biasanya oleh Admin sekolah atau Operator. Urutannya sebagai berikut.',
            steps: [
              'Buka sekolah, lalu buka Pengaturan absensi di kelompok Kehadiran. Di tab Kebijakan, isi Terlambat setelah dan Pulang mulai.',
              'Di tab Perangkat, klik Tambah perangkat dan beri nama untuk perangkat di gerbang. Salin kunci yang tampil.',
              'Buka menu Kartu RFID dan daftarkan kartu siswa. Untuk satu kelas sekaligus, pakai Daftar cepat atau impor dari Excel.',
              'Pasang kunci tadi di halaman kiosk pada perangkat gerbang.',
            ],
            warning:
              'Kunci perangkat lengkap hanya tampil sekali. Bila hilang, pakai Ganti kunci di tab Perangkat; kunci lama langsung tidak berlaku.',
          },
          {
            heading: 'Memantau kehadiran',
            body: 'Menu Gerbang & piket menampilkan siapa yang masuk dan pulang hari ini, dan menyegarkan diri tiap 10 detik. Tab Jadwal piket mengatur guru piket.',
            tip: 'Panduan lengkapnya ada di artikel Kartu RFID, kiosk, dan gerbang pada menu Dokumentasi sekolah.',
          },
        ],
        faq: [
          {
            q: 'Menu Absensi atau Kartu RFID tidak ada di sekolah kami. Kenapa?',
            a: 'Kemungkinan modul Absensi belum aktif. Buka Unit sekolah, klik Ubah paket, tambahkan Absensi, lalu bayar. Menu muncul setelah pembayaran terkonfirmasi. Bila modul sudah aktif, mungkin peran akun staf tidak mengizinkan; minta Admin sekolah memeriksanya di menu Anggota.',
          },
          {
            q: 'Kunci perangkat gerbang hilang. Apa yang harus dilakukan?',
            a: 'Buka sekolah, masuk ke Pengaturan absensi tab Perangkat, klik Ganti kunci pada perangkatnya, lalu salin kunci baru dan tempel di halaman kiosk.',
          },
          {
            q: 'Kartu siswa ditempel tetapi tidak tercatat. Apa yang diperiksa?',
            a: 'Pastikan kartu siswa itu sudah terdaftar di menu Kartu RFID dan perangkat gerbang tidak dinonaktifkan di tab Perangkat. Periksa juga bahwa kunci yang terpasang di kiosk adalah yang terbaru.',
          },
        ],
      },
      en: {
        title: 'Card attendance and the gate',
        summary:
          'A short overview of turning on card-based attendance at the gate. Detailed steps are in the Documentation guides in the school panel.',
        forWho: 'Institution managers who want their school to use card attendance at the gate.',
        sections: [
          {
            heading: 'Making sure the Attendance module is active',
            body: 'The attendance, card, and gate menus only appear in a school whose Attendance module is active.',
            steps: [
              'Open School units and look at the module list on that unit.',
              'If Attendance is missing, click Change plan.',
              'Tick Attendance, check the Summary, then click Pay and apply.',
            ],
            href: '/account/units',
          },
          {
            heading: 'Setting up the gate and cards in the school',
            body: 'This is done inside the school, usually by a School admin or an Operator. The order is as follows.',
            steps: [
              'Open the school, then open Attendance settings in the Attendance group. In the Policy tab, fill in Late after and Departure from.',
              'In the Devices tab, click Add device and name the gate device. Copy the key that appears.',
              'Open the RFID cards menu and register student cards. For a whole class, use quick registration or import from Excel.',
              'Enter the key on the kiosk page of the gate device.',
            ],
            warning:
              'The full device key is shown only once. If it is lost, use Change key in the Devices tab; the old key stops working immediately.',
          },
          {
            heading: 'Monitoring attendance',
            body: 'The Gate & duty menu shows who arrived and left today and refreshes every 10 seconds. The Duty roster tab sets the duty teachers.',
            tip: 'The full guide is the article RFID cards, kiosk, and gate in the school Documentation menu.',
          },
        ],
        faq: [
          {
            q: 'The Attendance or RFID cards menu is missing in our school. Why?',
            a: 'The Attendance module may not be active. Open School units, click Change plan, add Attendance, and pay. The menu appears once payment is confirmed. If the module is active, the staff account role may not allow it; ask the School admin to check in the Members menu.',
          },
          {
            q: 'We lost the gate device key. What now?',
            a: 'Open the school, go to Attendance settings, Devices tab, click Change key on the device, then copy the new key and paste it on the kiosk page.',
          },
          {
            q: 'A student taps a card but nothing is recorded. What should I check?',
            a: 'Make sure the card is registered in the RFID cards menu and the gate device is not disabled in the Devices tab. Also check that the key on the kiosk is the latest one.',
          },
        ],
      },
      su: {
        title: 'Absénsi kartu jeung gerbang',
        summary:
          'Gambaran singget ngahurungkeun absénsi lewat kartu siswa di gerbang. Léngkah lengkep aya dina pituduh Dokuméntasi di panel sakola.',
        forWho: 'Pangurus lembaga nu hayang sakolana maké absénsi kartu di gerbang.',
        sections: [
          {
            heading: 'Mastikeun modul Absénsi aktip',
            body: 'Ménu absénsi, kartu, jeung gerbang ngan némbongan di sakola nu modul Absénsi-na aktip.',
            steps: [
              'Buka Unit sakola tuluy tingali daptar modul dina unit éta.',
              'Lamun Absénsi acan aya, klik Robah paket.',
              'Centang Absénsi, parios Ringkesan, tuluy klik Bayar jeung larapkeun.',
            ],
            href: '/account/units',
          },
          {
            heading: 'Nyiapkeun gerbang jeung kartu di sakola',
            body: 'Pagawéan ieu dilakukeun di jero sakola, biasana ku Admin sekolah atawa Operator. Urutanana kieu.',
            steps: [
              'Buka sakola, tuluy buka Pengaturan absensi dina kelompok Kehadiran. Dina tab Kebijakan, eusian Terlambat setelah jeung Pulang mulai.',
              'Dina tab Perangkat, klik Tambah perangkat tuluy pasihan ngaran pikeun parabot di gerbang. Salin konci nu kaluar.',
              'Buka ménu Kartu RFID tuluy daptarkeun kartu siswa. Pikeun sakelas sakaligus, anggo Daftar cepat atawa impor ti Excel.',
              'Pasang konci tadi dina kaca kiosk di parabot gerbang.',
            ],
            warning:
              'Konci parabot lengkep ngan némbongan sakali. Lamun leungit, anggo Ganti kunci dina tab Perangkat; konci heubeul langsung teu lumaku.',
          },
          {
            heading: 'Mantau kahadiran',
            body: 'Ménu Gerbang & piket mintonkeun saha nu asup jeung mulang poé ieu, sarta nyegerkeun diri unggal 10 detik. Tab Jadwal piket pikeun ngatur guru piket.',
            tip: 'Pituduh lengkepna aya dina artikel Kartu RFID, kiosk, jeung gerbang dina ménu Dokuméntasi sakola.',
          },
        ],
        faq: [
          {
            q: 'Ménu Absénsi atawa Kartu RFID teu aya di sakola kami. Naha?',
            a: 'Meureun modul Absénsi acan aktip. Buka Unit sakola, klik Robah paket, tambihan Absénsi, tuluy bayar. Ménu némbongan sanggeus pambayaran dikonfirmasi. Lamun modulna geus aktip, meureun peran akun staf teu ngidinan; mundut Admin sekolah mariksa dina ménu Anggota.',
          },
          {
            q: 'Konci parabot gerbang leungit. Kumaha?',
            a: 'Buka sakola, lebet ka Pengaturan absensi tab Perangkat, klik Ganti kunci dina parabotna, tuluy salin konci anyar jeung tempelkeun dina kaca kiosk.',
          },
          {
            q: 'Kartu siswa geus ditempelkeun tapi teu kacatet. Naon nu dipariksa?',
            a: 'Pastikeun kartuna geus kadaptar dina ménu Kartu RFID jeung parabot gerbang teu dipareuman dina tab Perangkat. Parios ogé yén konci dina kiosk téh nu panganyarna.',
          },
        ],
      },
    },
  },
  {
    slug: 'grades-report-cards',
    icon: 'graduation',
    tone: 'violet',
    group: 'school_ops',
    text: {
      id: {
        title: 'Nilai dan rapor',
        summary:
          'Gambaran singkat menyalakan modul Nilai dan rapor dan urutan kerja guru. Langkah rinci ada di panduan Dokumentasi di panel sekolah.',
        forWho: 'Pengelola lembaga yang ingin sekolahnya mengisi nilai dan mencetak rapor di Edusync.',
        sections: [
          {
            heading: 'Memastikan modul Nilai dan rapor aktif',
            body: 'Menu Penilaian dan Rapor hanya tersedia di sekolah yang modul Nilai dan rapor-nya aktif.',
            steps: [
              'Buka Unit sekolah dan lihat daftar modul pada unit itu.',
              'Bila Nilai dan rapor belum ada, klik Ubah paket.',
              'Centang Nilai dan rapor, periksa Ringkasan, lalu klik Bayar dan terapkan.',
            ],
            warning:
              'Melepas modul ini berlaku di periode berikutnya. Setelah itu menu nilai dan rapor tidak tersedia lagi di sekolah.',
            href: '/account/units',
          },
          {
            heading: 'Menyiapkan data pendukung',
            body: 'Nilai dan rapor mengikuti data induk sekolah. Pastikan data ini sudah terisi sebelum guru mulai.',
            steps: [
              'Buka sekolah, lalu periksa Tahun ajaran dan Kelas.',
              'Periksa Mata pelajaran dan Guru.',
              'Pastikan Siswa sudah masuk ke kelasnya.',
            ],
          },
          {
            heading: 'Urutan kerja di sekolah',
            body: 'Pekerjaan ini dilakukan di dalam sekolah. Garis besarnya sebagai berikut.',
            steps: [
              'Atur komponen dan aturan nilai di Pengaturan penilaian (kelompok Akademik).',
              'Guru mengisi nilai lewat menu Penilaian sesuai kelas dan mata pelajaran yang diampu.',
              'Atur tampilan rapor di Pengaturan rapor.',
              'Buka menu Rapor untuk melihat atau mengunduh rapor sebagai PDF, satu per satu atau semua sekaligus.',
            ],
            tip: 'Panduan lengkap ada di artikel Nilai dan Rapor pada menu Dokumentasi sekolah.',
          },
        ],
        faq: [
          {
            q: 'Guru tidak melihat menu Penilaian. Kenapa?',
            a: 'Ada dua kemungkinan. Modul Nilai dan rapor belum aktif (cek di Unit sekolah, lalu Ubah paket), atau guru belum diundang dengan peran yang sesuai. Minta Admin sekolah memeriksa di menu Anggota.',
          },
          {
            q: 'Siapa yang mengisi nilai?',
            a: 'Guru mengisi nilai untuk kelas dan mata pelajaran yang diampunya. Pengelola lembaga tidak perlu mengisi nilai dari Portal Akun.',
          },
          {
            q: 'Rapor belum bisa diunduh. Apa yang kurang?',
            a: 'Biasanya nilai belum diisi atau data kelas dan siswa belum lengkap. Periksa dulu Penilaian untuk kelas itu, lalu buka lagi menu Rapor.',
          },
        ],
      },
      en: {
        title: 'Grades and report cards',
        summary:
          'A short overview of turning on the Grades and report cards module and the order teachers work in. Detailed steps are in the Documentation guides in the school panel.',
        forWho:
          'Institution managers who want their school to enter grades and print report cards in Edusync.',
        sections: [
          {
            heading: 'Making sure the Grades and report cards module is active',
            body: 'The Grading and Report cards menus are only available in a school whose Grades and report cards module is active.',
            steps: [
              'Open School units and look at the module list on that unit.',
              'If Grades and report cards is missing, click Change plan.',
              'Tick Grades and report cards, check the Summary, then click Pay and apply.',
            ],
            warning:
              'Removing this module takes effect next period. After that, the grade and report card menus are no longer available in the school.',
            href: '/account/units',
          },
          {
            heading: 'Preparing the supporting data',
            body: 'Grades and report cards follow the school master data. Make sure it is filled in before teachers start.',
            steps: [
              'Open the school, then check Academic years and Classes.',
              'Check Subjects and Teachers.',
              'Make sure Students are placed in their classes.',
            ],
          },
          {
            heading: 'The work order inside the school',
            body: 'This is done inside the school. In outline:',
            steps: [
              'Set the components and rules in Grading settings (Academic group).',
              'Teachers enter scores through the Grading menu for the classes and subjects they teach.',
              'Set the report card layout in Report card settings.',
              'Open the Report cards menu to view or download report cards as PDF, one by one or all at once.',
            ],
            tip: 'The full guide is the article Grades and report cards in the school Documentation menu.',
          },
        ],
        faq: [
          {
            q: 'Teachers cannot see the Grading menu. Why?',
            a: 'Two possibilities. The Grades and report cards module is not active (check School units, then Change plan), or the teacher was not invited with a suitable role. Ask the School admin to check in the Members menu.',
          },
          {
            q: 'Who enters the grades?',
            a: 'Teachers enter grades for the classes and subjects they teach. The institution manager does not need to enter grades from the Account portal.',
          },
          {
            q: 'A report card cannot be downloaded yet. What is missing?',
            a: 'Usually scores are not entered yet or the class and student data is incomplete. Check Grading for that class first, then open Report cards again.',
          },
        ],
      },
      su: {
        title: 'Nilai jeung rapor',
        summary:
          'Gambaran singget ngahurungkeun modul Nilai jeung rapor sarta urutan gawé guru. Léngkah lengkep aya dina pituduh Dokuméntasi di panel sakola.',
        forWho: 'Pangurus lembaga nu hayang sakolana ngeusian nilai jeung nyitak rapor di Edusync.',
        sections: [
          {
            heading: 'Mastikeun modul Nilai jeung rapor aktip',
            body: 'Ménu Penilaian jeung Rapor ngan aya di sakola nu modul Nilai jeung rapor-na aktip.',
            steps: [
              'Buka Unit sakola tuluy tingali daptar modul dina unit éta.',
              'Lamun Nilai jeung rapor acan aya, klik Robah paket.',
              'Centang Nilai jeung rapor, parios Ringkesan, tuluy klik Bayar jeung larapkeun.',
            ],
            warning:
              'Nyabut modul ieu ngalakuna dina période hareup. Sanggeus éta ménu nilai jeung rapor teu sayogi deui di sakola.',
            href: '/account/units',
          },
          {
            heading: 'Nyiapkeun data pangrojong',
            body: 'Nilai jeung rapor nuturkeun data induk sakola. Pastikeun data ieu geus kaeusi samemeh guru ngawitan.',
            steps: [
              'Buka sakola, tuluy parios Tahun ajaran jeung Kelas.',
              'Parios Mata pelajaran jeung Guru.',
              'Pastikeun Siswa geus asup ka kelasna.',
            ],
          },
          {
            heading: 'Urutan gawé di sakola',
            body: 'Pagawéan ieu dilakukeun di jero sakola. Garis badagna kieu:',
            steps: [
              'Atur komponén jeung aturan nilai dina Pengaturan penilaian (kelompok Akademik).',
              'Guru ngeusian nilai lewat ménu Penilaian luyu jeung kelas jeung mata pelajaran nu diampu.',
              'Atur tampilan rapor dina Pengaturan rapor.',
              'Buka ménu Rapor pikeun nempo atawa ngaunduh rapor jadi PDF, hiji-hiji atawa sakaligus.',
            ],
            tip: 'Pituduh lengkep aya dina artikel Nilai jeung Rapor dina ménu Dokuméntasi sakola.',
          },
        ],
        faq: [
          {
            q: 'Guru teu ningali ménu Penilaian. Naha?',
            a: 'Aya dua kamungkinan. Modul Nilai jeung rapor acan aktip (parios di Unit sakola, tuluy Robah paket), atawa guru acan diondang kalawan peran nu luyu. Mundut Admin sekolah mariksa dina ménu Anggota.',
          },
          {
            q: 'Saha nu ngeusian nilai?',
            a: 'Guru ngeusian nilai pikeun kelas jeung mata pelajaran nu diampuna. Pangurus lembaga teu kudu ngeusian nilai ti Portal Akun.',
          },
          {
            q: 'Rapor can bisa diunduh. Naon nu kurang?',
            a: 'Biasana nilai can kaeusi atawa data kelas jeung siswa can lengkep. Parios heula Penilaian pikeun kelas éta, tuluy buka deui ménu Rapor.',
          },
        ],
      },
    },
  },
  {
    slug: 'finance',
    icon: 'wallet',
    tone: 'amber',
    group: 'school_ops',
    text: {
      id: {
        title: 'Keuangan sekolah dan tagihan Edusync',
        summary:
          'Gambaran singkat modul Keuangan sekolah untuk bendahara, dan perbedaannya dengan tagihan langganan di Portal Akun. Langkah rinci ada di panduan Dokumentasi di panel sekolah.',
        forWho: 'Pengelola lembaga yang ingin sekolahnya mencatat tagihan dan pembayaran siswa di Edusync.',
        sections: [
          {
            heading: 'Memahami dua jenis tagihan',
            body: 'Ada dua hal yang sama-sama bernama tagihan. Tagihan di Portal Akun adalah tagihan langganan lembaga Anda kepada Edusync. Tagihan di dalam sekolah adalah tagihan siswa kepada sekolah, seperti SPP.',
            warning:
              'Pembayaran siswa dicatat sekolah di menu Kasir. Jangan membayar tagihan langganan dari uang kasir tanpa mencatatnya terpisah.',
          },
          {
            heading: 'Mengaktifkan modul Keuangan sekolah',
            body: 'Menu keuangan hanya ada di sekolah yang modul Keuangan sekolah-nya aktif.',
            steps: [
              'Buka Unit sekolah dan klik Ubah paket pada unit itu.',
              'Centang Keuangan sekolah. Modul yang dibutuhkan ikut ditambahkan otomatis.',
              'Periksa Ringkasan, lalu klik Bayar dan terapkan.',
            ],
            href: '/account/units',
          },
          {
            heading: 'Alur kerja bendahara di sekolah',
            body: 'Pekerjaan ini dilakukan di dalam sekolah. Garis besarnya sebagai berikut.',
            steps: [
              'Di Jenis biaya & tarif, atur biaya sekolah seperti SPP beserta nominalnya.',
              'Di menu Tagihan (kelompok Keuangan), buat tagihan siswa, bisa massal per kelas.',
              'Di menu Kasir, cari siswa, pilih tagihan yang dibayar, lalu terima pembayaran dan unduh kwitansi PDF.',
              'Pantau penerimaan dan tunggakan di Laporan keuangan.',
            ],
            tip: 'Panduan lengkap ada di artikel Keuangan pada menu Dokumentasi sekolah.',
          },
          {
            heading: 'Memberi akses kepada bendahara',
            body: 'Bendahara masuk dengan akunnya sendiri, bukan akun pengelola lembaga.',
            steps: [
              'Buka sekolah, lalu buka menu Anggota.',
              'Isi Email bendahara dan pilih peran Bendahara.',
              'Klik Kirim undangan.',
            ],
          },
        ],
        faq: [
          {
            q: 'Orang tua membayar SPP ke mana?',
            a: 'Pembayaran siswa dicatat oleh sekolah di menu Kasir di dalam sekolah. Portal Akun hanya untuk tagihan langganan lembaga.',
          },
          {
            q: 'Menu Keuangan tidak muncul di sekolah kami. Kenapa?',
            a: 'Modul Keuangan sekolah mungkin belum aktif. Buka Unit sekolah, klik Ubah paket, tambahkan Keuangan sekolah, lalu bayar.',
          },
          {
            q: 'Bendahara kami tidak bisa membuka Kasir. Apa yang harus saya lakukan?',
            a: 'Buka sekolah, lalu buka menu Anggota dan pastikan bendahara memiliki peran Bendahara. Bila belum, minta Admin sekolah mengubahnya.',
          },
          {
            q: 'Saya melihat dua angka tagihan. Mana yang harus saya bayar?',
            a: 'Yang Anda bayar sebagai pengelola lembaga adalah tagihan di Portal Akun, menu Tagihan dan pembayaran. Tagihan di dalam sekolah adalah urusan siswa dan bendahara.',
          },
        ],
      },
      en: {
        title: 'School finance and Edusync invoices',
        summary:
          'A short overview of the School finance module for treasurers, and how it differs from the subscription invoices in the Account portal. Detailed steps are in the Documentation guides in the school panel.',
        forWho:
          'Institution managers who want their school to record student invoices and payments in Edusync.',
        sections: [
          {
            heading: 'Understanding the two kinds of invoices',
            body: 'Two different things are called invoices. Invoices in the Account portal are your institution subscription invoices to Edusync. Invoices inside the school are student invoices to the school, such as tuition.',
            warning:
              'Student payments are recorded by the school in the Cashier menu. Do not pay the subscription invoice from cashier money without recording it separately.',
          },
          {
            heading: 'Turning on the School finance module',
            body: 'The finance menus only exist in a school whose School finance module is active.',
            steps: [
              'Open School units and click Change plan on that unit.',
              'Tick School finance. Required modules are added automatically.',
              'Check the Summary, then click Pay and apply.',
            ],
            href: '/account/units',
          },
          {
            heading: 'The treasurer work order inside the school',
            body: 'This is done inside the school. In outline:',
            steps: [
              'In Fee types & rates, set school fees such as tuition and their amounts.',
              'In the Invoices menu (Finance group), create student invoices, in bulk per class if you like.',
              'In the Cashier menu, find the student, pick the invoices being paid, then receive the payment and download a PDF receipt.',
              'Follow income and outstanding balances in Financial reports.',
            ],
            tip: 'The full guide is the article Finance in the school Documentation menu.',
          },
          {
            heading: 'Giving the treasurer access',
            body: 'The treasurer signs in with their own account, not the institution manager account.',
            steps: [
              'Open the school, then open the Members menu.',
              'Fill in the treasurer Email and pick the Treasurer role.',
              'Click Send invitation.',
            ],
          },
        ],
        faq: [
          {
            q: 'Where do parents pay tuition?',
            a: 'Student payments are recorded by the school in the Cashier menu inside the school. The Account portal is only for the institution subscription invoices.',
          },
          {
            q: 'The Finance menu is missing in our school. Why?',
            a: 'The School finance module may not be active. Open School units, click Change plan, add School finance, and pay.',
          },
          {
            q: 'Our treasurer cannot open the Cashier. What do I do?',
            a: 'Open the school, then open the Members menu and make sure the treasurer has the Treasurer role. If not, ask the School admin to change it.',
          },
          {
            q: 'I see two invoice counts. Which one do I pay?',
            a: 'As the institution manager you pay the invoices in the Account portal, under Billing and payments. Invoices inside the school are for students and the treasurer.',
          },
        ],
      },
      su: {
        title: 'Kauangan sakola jeung tagihan Edusync',
        summary:
          'Gambaran singget modul Kauangan sakola pikeun bendahara, jeung bédana ti tagihan langganan di Portal Akun. Léngkah lengkep aya dina pituduh Dokuméntasi di panel sakola.',
        forWho: 'Pangurus lembaga nu hayang sakolana nyatet tagihan jeung pambayaran siswa di Edusync.',
        sections: [
          {
            heading: 'Ngarti dua rupa tagihan',
            body: 'Aya dua hal nu sarua disebut tagihan. Tagihan di Portal Akun nyaéta tagihan langganan lembaga anjeun ka Edusync. Tagihan di jero sakola nyaéta tagihan siswa ka sakola, saperti SPP.',
            warning:
              'Pambayaran siswa dicatet ku sakola dina ménu Kasir. Ulah mayar tagihan langganan tina duit kasir tanpa nyatetna sacara misah.',
          },
          {
            heading: 'Ngahurungkeun modul Kauangan sakola',
            body: 'Ménu kauangan ngan aya di sakola nu modul Kauangan sakola-na aktip.',
            steps: [
              'Buka Unit sakola tuluy klik Robah paket dina unit éta.',
              'Centang Kauangan sakola. Modul nu diperlukeun ditambahkeun otomatis.',
              'Parios Ringkesan, tuluy klik Bayar jeung larapkeun.',
            ],
            href: '/account/units',
          },
          {
            heading: 'Urutan gawé bendahara di sakola',
            body: 'Pagawéan ieu dilakukeun di jero sakola. Garis badagna kieu:',
            steps: [
              'Dina Jenis biaya & tarif, atur biaya sakola saperti SPP sarta nominalna.',
              'Dina ménu Tagihan (kelompok Keuangan), jieun tagihan siswa, bisa sakaligus per kelas.',
              'Dina ménu Kasir, golédah siswa, pilih tagihan nu dibayar, tuluy tarima pambayaran jeung unduh kwitansi PDF.',
              'Pantau panarimaan jeung tunggakan dina Laporan keuangan.',
            ],
            tip: 'Pituduh lengkep aya dina artikel Kauangan dina ménu Dokuméntasi sakola.',
          },
          {
            heading: 'Méré aksés ka bendahara',
            body: 'Bendahara lebet nganggo akunna sorangan, lain akun pangurus lembaga.',
            steps: [
              'Buka sakola, tuluy buka ménu Anggota.',
              'Eusian Surélék bendahara tuluy pilih peran Bendahara.',
              'Klik Kirim undangan.',
            ],
          },
        ],
        faq: [
          {
            q: 'Kolot mayar SPP ka mana?',
            a: 'Pambayaran siswa dicatet ku sakola dina ménu Kasir di jero sakola. Portal Akun ngan pikeun tagihan langganan lembaga.',
          },
          {
            q: 'Ménu Kauangan teu aya di sakola kami. Naha?',
            a: 'Modul Kauangan sakola meureun acan aktip. Buka Unit sakola, klik Robah paket, tambihan Kauangan sakola, tuluy bayar.',
          },
          {
            q: 'Bendahara kami teu bisa muka Kasir. Kumaha?',
            a: 'Buka sakola, tuluy buka ménu Anggota jeung pastikeun bendahara boga peran Bendahara. Lamun acan, mundut Admin sekolah ngarobahna.',
          },
          {
            q: 'Abdi ningali dua angka tagihan. Nu mana nu kudu dibayar?',
            a: 'Nu anjeun bayar salaku pangurus lembaga nyaéta tagihan di Portal Akun, dina Tagihan jeung pambayaran. Tagihan di jero sakola mah urusan siswa jeung bendahara.',
          },
        ],
      },
    },
  },
  {
    slug: 'admissions',
    icon: 'clipboard',
    tone: 'rose',
    group: 'school_ops',
    text: {
      id: {
        title: 'SPMB (penerimaan siswa baru)',
        summary:
          'Gambaran singkat membuka pendaftaran siswa baru dan menyiapkan paket untuk siswa yang masuk. Langkah rinci ada di panduan Dokumentasi di panel sekolah.',
        forWho: 'Pengelola lembaga yang ingin sekolahnya menerima pendaftar siswa baru secara daring.',
        sections: [
          {
            heading: 'Mengaktifkan modul SPMB',
            body: 'Menu SPMB hanya ada di sekolah yang modul SPMB-nya aktif.',
            steps: [
              'Buka Unit sekolah dan klik Ubah paket pada unit itu.',
              'Centang SPMB dan periksa Ringkasan.',
              'Klik Bayar dan terapkan, lalu selesaikan pembayaran.',
            ],
            href: '/account/units',
          },
          {
            heading: 'Membuka pendaftaran siswa baru',
            body: 'Pekerjaan ini dilakukan di dalam sekolah oleh panitia. Garis besarnya sebagai berikut.',
            steps: [
              'Buka sekolah, lalu buka menu SPMB dan buat Periode SPMB.',
              'Bagikan tautan atau poster pendaftaran supaya calon murid mendaftar di halaman publik sekolah.',
              'Periksa dokumen pendaftar, lalu verifikasi dan putuskan Diterima atau Ditolak (bisa massal dengan Aksi massal).',
              'Daftarkan yang diterima sebagai siswa.',
            ],
            tip: 'Panduan lengkap ada di artikel SPMB pada menu Dokumentasi sekolah.',
          },
          {
            heading: 'Menyiapkan paket untuk siswa yang masuk',
            body: 'Setelah pendaftar diterima, jumlah siswa sekolah bertambah. Periksa apakah tingkat Jumlah siswa pada paket masih cukup.',
            steps: [
              'Buka Unit sekolah dan klik Ubah paket pada unit itu.',
              'Lihat pilihan Jumlah siswa, lalu pilih tingkat yang sesuai.',
              'Klik Bayar dan terapkan bila ada kenaikan.',
            ],
            warning:
              'Kenaikan tingkat berlaku setelah dibayar. Lakukan sebelum tahun ajaran baru dimulai agar tidak terburu-buru.',
            href: '/account/units',
          },
        ],
        faq: [
          {
            q: 'Calon murid tidak bisa mendaftar. Apa yang harus saya periksa?',
            a: 'Pastikan modul SPMB aktif, lalu pastikan Periode SPMB sudah dibuat di dalam sekolah. Bagikan tautan atau poster pendaftaran yang dari menu SPMB.',
          },
          {
            q: 'Menu SPMB tidak muncul. Kenapa?',
            a: 'Modul SPMB mungkin belum aktif. Buka Unit sekolah, klik Ubah paket, tambahkan SPMB, lalu bayar.',
          },
          {
            q: 'Apakah pendaftar yang diterima langsung jadi siswa?',
            a: 'Belum. Panitia perlu mendaftarkan pendaftar yang diterima sebagai siswa di menu SPMB. Setelah itu mereka muncul di menu Siswa.',
          },
        ],
      },
      en: {
        title: 'Admissions (new student intake)',
        summary:
          'A short overview of opening registration for new students and preparing your plan for the incoming students. Detailed steps are in the Documentation guides in the school panel.',
        forWho: 'Institution managers who want their school to receive new student applications online.',
        sections: [
          {
            heading: 'Turning on the Admissions module',
            body: 'The Admissions menu only exists in a school whose Admissions module is active.',
            steps: [
              'Open School units and click Change plan on that unit.',
              'Tick Admissions and check the Summary.',
              'Click Pay and apply, then complete the payment.',
            ],
            href: '/account/units',
          },
          {
            heading: 'Opening registration for new students',
            body: 'This is done inside the school by the admissions committee. In outline:',
            steps: [
              'Open the school, then open the Admissions menu and create an Admissions period.',
              'Share the registration link or poster so prospective students apply on the school public page.',
              'Check applicant documents, then verify and decide Accepted or Rejected (in bulk with Bulk actions).',
              'Enroll the accepted applicants as students.',
            ],
            tip: 'The full guide is the article Admissions in the school Documentation menu.',
          },
          {
            heading: 'Preparing your plan for incoming students',
            body: 'Once applicants are accepted, the school student count grows. Check whether the Student count tier in the plan is still enough.',
            steps: [
              'Open School units and click Change plan on that unit.',
              'Look at the Student count choice and pick the right tier.',
              'Click Pay and apply if there is an increase.',
            ],
            warning:
              'A higher tier takes effect once paid. Do it before the new academic year starts so you are not in a rush.',
            href: '/account/units',
          },
        ],
        faq: [
          {
            q: 'Prospective students cannot register. What should I check?',
            a: 'Make sure the Admissions module is active, then make sure an Admissions period has been created inside the school. Share the registration link or poster from the Admissions menu.',
          },
          {
            q: 'The Admissions menu is missing. Why?',
            a: 'The Admissions module may not be active. Open School units, click Change plan, add Admissions, and pay.',
          },
          {
            q: 'Does an accepted applicant become a student automatically?',
            a: 'Not yet. The committee needs to enroll accepted applicants as students in the Admissions menu. After that they appear in the Students menu.',
          },
        ],
      },
      su: {
        title: 'SPMB (panarimaan siswa anyar)',
        summary:
          'Gambaran singget muka pendaptaran siswa anyar jeung nyiapkeun paket pikeun siswa nu asup. Léngkah lengkep aya dina pituduh Dokuméntasi di panel sakola.',
        forWho: 'Pangurus lembaga nu hayang sakolana narima pendaptar siswa anyar sacara daring.',
        sections: [
          {
            heading: 'Ngahurungkeun modul SPMB',
            body: 'Ménu SPMB ngan aya di sakola nu modul SPMB-na aktip.',
            steps: [
              'Buka Unit sakola tuluy klik Robah paket dina unit éta.',
              'Centang SPMB tuluy parios Ringkesan.',
              'Klik Bayar jeung larapkeun, tuluy réngsékeun pambayaran.',
            ],
            href: '/account/units',
          },
          {
            heading: 'Muka pendaptaran siswa anyar',
            body: 'Pagawéan ieu dilakukeun di jero sakola ku panitia. Garis badagna kieu:',
            steps: [
              'Buka sakola, tuluy buka ménu SPMB jeung jieun Periode SPMB.',
              'Bagikeun tautan atawa poster pendaptaran supaya calon murid ndaptar dina kaca publik sakola.',
              'Parios dokumén pendaptar, tuluy verifikasi jeung putuskeun Ditarima atawa Ditolak (bisa sakaligus nganggo Aksi massal).',
              'Daptarkeun nu ditarima jadi siswa.',
            ],
            tip: 'Pituduh lengkep aya dina artikel SPMB dina ménu Dokuméntasi sakola.',
          },
          {
            heading: 'Nyiapkeun paket pikeun siswa nu asup',
            body: 'Sanggeus pendaptar ditarima, jumlah siswa sakola nambah. Parios naha tingkat Jumlah siswa dina paket masih cukup.',
            steps: [
              'Buka Unit sakola tuluy klik Robah paket dina unit éta.',
              'Tingali pilihan Jumlah siswa, tuluy pilih tingkat nu cocog.',
              'Klik Bayar jeung larapkeun lamun aya kanaékan.',
            ],
            warning:
              'Naékkeun tingkat ngalaku sanggeus dibayar. Lakukeun samemeh taun ajaran anyar dimimitian supaya teu buru-buru.',
            href: '/account/units',
          },
        ],
        faq: [
          {
            q: 'Calon murid teu bisa ndaptar. Naon nu kudu dipariksa?',
            a: 'Pastikeun modul SPMB aktip, tuluy pastikeun Periode SPMB geus dijieun di jero sakola. Bagikeun tautan atawa poster pendaptaran tina ménu SPMB.',
          },
          {
            q: 'Ménu SPMB teu aya. Naha?',
            a: 'Modul SPMB meureun acan aktip. Buka Unit sakola, klik Robah paket, tambihan SPMB, tuluy bayar.',
          },
          {
            q: 'Naha pendaptar nu ditarima langsung jadi siswa?',
            a: 'Can. Panitia kudu ndaptarkeun pendaptar nu ditarima jadi siswa dina ménu SPMB. Sanggeus éta maranéhna némbongan dina ménu Siswa.',
          },
        ],
      },
    },
  },
  {
    slug: 'whatsapp',
    icon: 'message',
    tone: 'emerald',
    group: 'school_ops',
    text: {
      id: {
        title: 'Notifikasi WhatsApp ke wali',
        summary:
          'Fitur ini dikeluarkan bertahap. Anda bisa menambahkan modulnya dan menyiapkan templat pesan dari sekarang; pengiriman ke wali diaktifkan menyusul.',
        forWho: 'Pengelola lembaga yang ingin sekolahnya kelak mengirim kabar ke wali lewat WhatsApp.',
        sections: [
          {
            heading: 'Memahami status fitur',
            body: 'Menu Notifikasi WhatsApp sudah memuat pengaturan penyedia dan templat pesan untuk tiap peristiwa. Pengiriman ke wali diaktifkan bertahap.',
            warning:
              'Selama pengiriman belum diaktifkan, wali belum menerima pesan walaupun templat sudah disiapkan.',
          },
          {
            heading: 'Menambahkan modul Notifikasi WhatsApp',
            body: 'Menunya hanya ada di sekolah yang modul Notifikasi WhatsApp-nya aktif.',
            steps: [
              'Buka Unit sekolah dan klik Ubah paket pada unit itu.',
              'Centang Notifikasi WhatsApp dan periksa Ringkasan.',
              'Klik Bayar dan terapkan, lalu selesaikan pembayaran.',
            ],
            href: '/account/units',
          },
          {
            heading: 'Menyiapkan templat pesan',
            body: 'Isi pesan bisa diubah dan nama pengganti seperti nama siswa dapat disisipkan dengan sekali klik.',
            steps: [
              'Buka sekolah, lalu buka menu Notifikasi WhatsApp di kelompok Komunikasi dan situs.',
              'Pilih peristiwa pada bagian templat pesan.',
              'Ubah isi pesan dan sisipkan pengganti bila perlu.',
              'Simpan. Templat dapat dikembalikan ke bawaan kapan saja.',
            ],
            tip: 'Panduan lengkap ada di artikel Notifikasi WhatsApp pada menu Dokumentasi sekolah.',
          },
        ],
        faq: [
          {
            q: 'Mengapa wali belum menerima pesan WhatsApp?',
            a: 'Pengiriman ke wali diaktifkan bertahap dan belum aktif untuk semua sekolah. Templat yang Anda siapkan sekarang akan siap dipakai begitu pengiriman diaktifkan.',
          },
          {
            q: 'Apakah menambah modul ini menambah tagihan?',
            a: 'Ya. Penambahan modul dihitung prorata untuk sisa periode. Lihat Ringkasan di halaman Ubah paket sebelum membayar.',
          },
          {
            q: 'Menu Notifikasi WhatsApp tidak muncul. Kenapa?',
            a: 'Modulnya mungkin belum aktif. Buka Unit sekolah, klik Ubah paket, tambahkan Notifikasi WhatsApp, lalu bayar.',
          },
        ],
      },
      en: {
        title: 'WhatsApp notifications to guardians',
        summary:
          'This feature rolls out in stages. You can add the module and prepare message templates now; sending to guardians is enabled later.',
        forWho: 'Institution managers who want their school to send updates to guardians on WhatsApp later.',
        sections: [
          {
            heading: 'Understanding the status of this feature',
            body: 'The WhatsApp notifications menu already holds the provider settings and a message template for each event. Sending to guardians is enabled in stages.',
            warning:
              'Until sending is enabled, guardians will not receive messages even if the templates are ready.',
          },
          {
            heading: 'Adding the WhatsApp notifications module',
            body: 'The menu only exists in a school whose WhatsApp notifications module is active.',
            steps: [
              'Open School units and click Change plan on that unit.',
              'Tick WhatsApp notifications and check the Summary.',
              'Click Pay and apply, then complete the payment.',
            ],
            href: '/account/units',
          },
          {
            heading: 'Preparing message templates',
            body: 'Message text can be changed, and placeholders such as the student name can be inserted with one click.',
            steps: [
              'Open the school, then open the WhatsApp notifications menu in the Communication and site group.',
              'Pick an event in the message templates section.',
              'Edit the text and insert placeholders if needed.',
              'Save. A template can be reset to the default at any time.',
            ],
            tip: 'The full guide is the article WhatsApp notifications in the school Documentation menu.',
          },
        ],
        faq: [
          {
            q: 'Why have guardians not received a WhatsApp message?',
            a: 'Sending to guardians is enabled in stages and is not yet active for every school. The templates you prepare now will be ready once sending is switched on.',
          },
          {
            q: 'Does adding this module add to my invoice?',
            a: 'Yes. Added modules are prorated for the rest of the period. Check the Summary on the Change plan page before paying.',
          },
          {
            q: 'The WhatsApp notifications menu is missing. Why?',
            a: 'The module may not be active. Open School units, click Change plan, add WhatsApp notifications, and pay.',
          },
        ],
      },
      su: {
        title: 'Béwara WhatsApp ka wali',
        summary:
          'Fitur ieu kaluarna bertahap. Anjeun tiasa nambihan modulna jeung nyiapkeun templat pesen ti ayeuna; ngirim ka wali diaktipkeun satuluyna.',
        forWho: 'Pangurus lembaga nu hayang sakolana engké ngirim béja ka wali lewat WhatsApp.',
        sections: [
          {
            heading: 'Ngarti status fitur ieu',
            body: 'Ménu Béwara WhatsApp geus ngandung pengaturan panyadia jeung templat pesen pikeun unggal kajadian. Ngirim ka wali diaktipkeun bertahap.',
            warning:
              'Salila ngirim acan diaktipkeun, wali acan narima pesen sanajan templatna geus disiapkeun.',
          },
          {
            heading: 'Nambihan modul Béwara WhatsApp',
            body: 'Ménuna ngan aya di sakola nu modul Béwara WhatsApp-na aktip.',
            steps: [
              'Buka Unit sakola tuluy klik Robah paket dina unit éta.',
              'Centang Béwara WhatsApp tuluy parios Ringkesan.',
              'Klik Bayar jeung larapkeun, tuluy réngsékeun pambayaran.',
            ],
            href: '/account/units',
          },
          {
            heading: 'Nyiapkeun templat pesen',
            body: 'Eusi pesen bisa diganti, sarta pengganti saperti ngaran siswa bisa diselapkeun ku sakali klik.',
            steps: [
              'Buka sakola, tuluy buka ménu Notifikasi WhatsApp dina kelompok Komunikasi dan situs.',
              'Pilih kajadian dina bagian templat pesen.',
              'Robah eusi pesen, selapkeun pengganti lamun perlu.',
              'Simpen. Templat bisa dibalikkeun ka bawaan iraha waé.',
            ],
            tip: 'Pituduh lengkep aya dina artikel Notifikasi WhatsApp dina ménu Dokuméntasi sakola.',
          },
        ],
        faq: [
          {
            q: 'Naha wali acan narima pesen WhatsApp?',
            a: 'Ngirim ka wali diaktipkeun bertahap jeung acan aktip pikeun sakabéh sakola. Templat nu anjeun siapkeun ayeuna bakal siap dipaké sanggeus ngirimna diaktipkeun.',
          },
          {
            q: 'Naha nambihan modul ieu nambahan tagihan?',
            a: 'Muhun. Modul nu ditambahkeun diitung prorata pikeun sésa période. Tingali Ringkesan dina kaca Robah paket samemeh mayar.',
          },
          {
            q: 'Ménu Béwara WhatsApp teu aya. Naha?',
            a: 'Modulna meureun acan aktip. Buka Unit sakola, klik Robah paket, tambihan Béwara WhatsApp, tuluy bayar.',
          },
        ],
      },
    },
  },
  {
    slug: 'roles-permissions',
    icon: 'shield',
    tone: 'slate',
    group: 'school_ops',
    text: {
      id: {
        title: 'Pengelola lembaga, peran, dan akses staf',
        summary:
          'Bedakan pengelola lembaga (Portal Akun) dari peran staf di dalam sekolah, lalu atur undangan dan penonaktifan akses.',
        forWho: 'Pengelola lembaga yang perlu memberi atau mencabut akses guru dan staf sekolah.',
        sections: [
          {
            heading: 'Memahami dua macam akses',
            body: 'Ada dua tingkat. Pengelola lembaga mengurus langganan, unit, dan tagihan di Portal Akun. Staf sekolah bekerja di dalam sekolah dengan peran seperti Admin sekolah, Kepala sekolah, Kurikulum, Bendahara, Operator, dan Guru. Izin seseorang adalah gabungan semua perannya.',
            tip: 'Beri staf peran paling kecil yang cukup untuk tugasnya. Bendahara tidak perlu peran Admin sekolah.',
          },
          {
            heading: 'Mengundang staf sekolah',
            body: 'Staf masuk lewat undangan email dengan akunnya sendiri. Orang yang belum punya akun membuatnya saat menerima undangan.',
            steps: [
              'Buka Unit sekolah, lalu klik Buka sekolah.',
              'Buka menu Anggota di kelompok Pengguna dan akses.',
              'Isi Email dan pilih satu peran atau lebih.',
              'Klik Kirim undangan.',
              'Pantau di bagian Undangan menunggu. Klik Kirim ulang atau Cabut bila perlu.',
            ],
            tip: 'Tautan undangan berlaku 7 hari. Bila kedaluwarsa, klik Kirim ulang.',
          },
          {
            heading: 'Menonaktifkan akses staf yang sudah tidak bertugas',
            body: 'Anggota yang dinonaktifkan tidak bisa masuk, dan bisa diaktifkan kembali kapan saja.',
            steps: [
              'Buka sekolah, lalu buka menu Anggota.',
              'Cari nama orangnya dan buka menu Aksi pada barisnya.',
              'Pilih Nonaktifkan. Pilih Aktifkan untuk membukanya lagi.',
            ],
            warning:
              'Menonaktifkan hanya menutup akses ke sekolah itu. Bila orangnya juga pengelola lembaga, aksesnya ke Portal Akun tidak berubah.',
          },
          {
            heading: 'Melihat pengelola lembaga',
            body: 'Halaman Pengelola lembaga menampilkan siapa saja yang bisa mengurus langganan, unit, dan tagihan, beserta sejak kapan. Penambahan pengelola belum tersedia di portal ini.',
            href: '/account/members',
          },
        ],
        faq: [
          {
            q: 'Guru tidak bisa membuka sekolah dari Portal Akun. Apakah salah?',
            a: 'Tidak salah. Portal Akun hanya untuk pengelola lembaga. Guru dan staf masuk lewat alamat sekolah masing-masing dengan akun dari undangan.',
          },
          {
            q: 'Undangan tidak sampai ke email staf. Bagaimana?',
            a: 'Minta staf memeriksa folder spam. Bila tetap tidak ada, buka menu Anggota di sekolah dan klik Kirim ulang pada undangannya, atau Cabut lalu kirim yang baru dengan email yang benar.',
          },
          {
            q: 'Bisakah menambah pengelola lembaga baru?',
            a: 'Belum bisa dari portal ini. Halaman Pengelola lembaga hanya menampilkan yang sudah ada.',
          },
          {
            q: 'Staf lupa kata sandi. Apa yang harus dilakukan?',
            a: 'Di halaman masuk, klik Lupa kata sandi?, isi email, lalu masukkan kode 6 digit yang dikirim ke email (berlaku 10 menit) dan kata sandi baru.',
          },
        ],
      },
      en: {
        title: 'Institution managers, roles, and staff access',
        summary:
          'Tell institution managers (Account portal) apart from staff roles inside the school, then handle invitations and disabling access.',
        forWho: 'Institution managers who need to give or take away access for teachers and school staff.',
        sections: [
          {
            heading: 'Understanding the two kinds of access',
            body: 'There are two levels. Institution managers handle the subscription, units, and invoices in the Account portal. School staff work inside the school with roles such as School admin, Principal, Curriculum, Treasurer, Operator, and Teacher. A person permissions are the combination of all their roles.',
            tip: 'Give staff the smallest role that is enough for their job. A treasurer does not need the School admin role.',
          },
          {
            heading: 'Inviting school staff',
            body: 'Staff join by email invitation with their own account. People without an account create one when they accept.',
            steps: [
              'Open School units, then click Open school.',
              'Open the Members menu in the Users and access group.',
              'Fill in the Email and pick one or more roles.',
              'Click Send invitation.',
              'Follow up under Pending invitations. Click Resend or Revoke if needed.',
            ],
            tip: 'The invitation link is valid for 7 days. If it expires, click Resend.',
          },
          {
            heading: 'Disabling access for staff who have left',
            body: 'A disabled member cannot sign in, and can be re-enabled at any time.',
            steps: [
              'Open the school, then open the Members menu.',
              'Find the person and open the Actions menu on their row.',
              'Choose Disable. Choose Enable to open it again.',
            ],
            warning:
              'Disabling only closes access to that school. If the person is also an institution manager, their access to the Account portal does not change.',
          },
          {
            heading: 'Viewing institution managers',
            body: 'The Institution managers page shows who can manage the subscription, units, and invoices, and since when. Adding managers is not available in this portal yet.',
            href: '/account/members',
          },
        ],
        faq: [
          {
            q: 'A teacher cannot open the school from the Account portal. Is something wrong?',
            a: 'Nothing is wrong. The Account portal is only for institution managers. Teachers and staff sign in at their own school address with the account from their invitation.',
          },
          {
            q: 'The invitation did not reach the staff email. What now?',
            a: 'Ask them to check the spam folder. If it is still missing, open the Members menu in the school and click Resend on the invitation, or Revoke it and send a new one with the correct email.',
          },
          {
            q: 'Can I add another institution manager?',
            a: 'Not from this portal yet. The Institution managers page only shows the existing ones.',
          },
          {
            q: 'A staff member forgot their password. What should they do?',
            a: 'On the sign-in page, click Forgot password?, enter the email, then enter the 6-digit code sent to the email (valid for 10 minutes) and a new password.',
          },
        ],
      },
      su: {
        title: 'Pangurus lembaga, peran, jeung aksés staf',
        summary:
          'Bédakeun pangurus lembaga (Portal Akun) jeung peran staf di jero sakola, tuluy atur undangan jeung mareuman aksés.',
        forWho: 'Pangurus lembaga nu kudu méré atawa nyabut aksés guru jeung staf sakola.',
        sections: [
          {
            heading: 'Ngarti dua rupa aksés',
            body: 'Aya dua tingkat. Pangurus lembaga ngurus langganan, unit, jeung tagihan di Portal Akun. Staf sakola digawé di jero sakola kalawan peran saperti Admin sekolah, Kepala sekolah, Kurikulum, Bendahara, Operator, jeung Guru. Idin hiji jalma nyaéta gabungan sakabéh peranna.',
            tip: 'Pasihan staf peran pangleutikna nu cukup pikeun tugasna. Bendahara teu kudu peran Admin sekolah.',
          },
          {
            heading: 'Ngondang staf sakola',
            body: 'Staf lebet ngaliwatan undangan surélék nganggo akunna sorangan. Jalma nu acan boga akun nyieun akun waktu narima undangan.',
            steps: [
              'Buka Unit sakola, tuluy klik Buka sakola.',
              'Buka ménu Anggota dina kelompok Pengguna dan akses.',
              'Eusian Surélék tuluy pilih hiji peran atawa leuwih.',
              'Klik Kirim undangan.',
              'Pantau dina bagian Undangan menunggu. Klik Kirim ulang atawa Cabut lamun perlu.',
            ],
            tip: 'Tautan undangan lumaku 7 poé. Lamun geus kadaluwarsa, klik Kirim ulang.',
          },
          {
            heading: 'Mareuman aksés staf nu geus teu tugas',
            body: 'Anggota nu dipareuman teu bisa lebet, sarta bisa diaktipkeun deui iraha waé.',
            steps: [
              'Buka sakola, tuluy buka ménu Anggota.',
              'Golédah ngaran jalmana tuluy buka ménu Aksi dina barisna.',
              'Pilih Nonaktifkan. Pilih Aktifkan pikeun muka deui.',
            ],
            warning:
              'Mareuman ngan nutup aksés ka sakola éta. Lamun jalmana ogé pangurus lembaga, aksésna ka Portal Akun teu robah.',
          },
          {
            heading: 'Nempo pangurus lembaga',
            body: 'Kaca Pangurus lembaga mintonkeun saha waé nu bisa ngurus langganan, unit, jeung tagihan, sarta ti iraha. Nambah pangurus acan sayogi dina portal ieu.',
            href: '/account/members',
          },
        ],
        faq: [
          {
            q: 'Guru teu bisa muka sakola ti Portal Akun. Naha lepat?',
            a: 'Teu lepat. Portal Akun ngan pikeun pangurus lembaga. Guru jeung staf lebet ngaliwatan alamat sakola masing-masing nganggo akun tina undanganna.',
          },
          {
            q: 'Undangan teu nepi ka surélék staf. Kumaha?',
            a: 'Mundut staf mariksa folder spam. Lamun tetep teu aya, buka ménu Anggota di sakola tuluy klik Kirim ulang dina undanganna, atawa Cabut tuluy kirim nu anyar kalawan surélék nu bener.',
          },
          {
            q: 'Naha bisa nambahan pangurus lembaga anyar?',
            a: 'Acan bisa ti portal ieu. Kaca Pangurus lembaga ngan mintonkeun nu geus aya.',
          },
          {
            q: 'Staf poho kecap sandi. Kumaha?',
            a: 'Di kaca lebet, klik Lupa kata sandi?, eusian surélék, tuluy asupkeun kode 6 angka nu dikirim ka surélék (lumaku 10 menit) jeung kecap sandi anyar.',
          },
        ],
      },
    },
  },
  {
    slug: 'subscription-billing',
    icon: 'credit',
    tone: 'amber',
    group: 'billing',
    text: {
      id: {
        title: 'Langganan, tagihan, dan unit sekolah',
        summary:
          'Memeriksa langganan, membayar tagihan, memperpanjang, mengubah paket, dan menambah unit sekolah di Portal Akun.',
        forWho: 'Pengelola lembaga yang mengurus langganan dan pembayaran untuk semua unit sekolah.',
        sections: [
          {
            heading: 'Memeriksa langganan dan modul',
            body: 'Halaman Langganan dan modul menunjukkan status langganan: Aktif, Masa tenggang, Ditangguhkan, Dibatalkan, atau Menunggu bayar. Di sana juga ada periode Bulanan atau Tahunan dan modul tiap unit.',
            steps: [
              'Buka Langganan dan modul pada Menu akun.',
              'Lihat Siklus tagihan, Mulai periode, dan Berakhir.',
              'Lihat Paket tiap unit untuk mengetahui modul yang aktif di setiap sekolah.',
            ],
            href: '/account/subscription',
          },
          {
            heading: 'Membayar tagihan',
            body: 'Tagihan perpanjangan, peningkatan paket, dan unit baru muncul di halaman Tagihan dan pembayaran. Statusnya Belum dibayar, Lunas, Kedaluwarsa, atau Dibatalkan.',
            steps: [
              'Buka Tagihan dan pembayaran pada Menu akun.',
              'Cari tagihan berstatus Belum dibayar. Perhatikan tanggal Jatuh tempo.',
              'Klik Bayar sekarang dan selesaikan pembayaran di halaman yang terbuka.',
              'Kembali ke Tagihan dan pembayaran, lalu pastikan statusnya menjadi Lunas.',
            ],
            tip: 'Kartu Tagihan terbuka di Ringkasan menunjukkan berapa tagihan yang masih menunggu. Bila tertulis Semua lunas, tidak ada yang perlu dibayar.',
            href: '/account/billing',
          },
          {
            heading: 'Memperpanjang langganan',
            body: 'Perpanjangan dilakukan dengan membayar tagihan periode berikutnya.',
            steps: [
              'Buka Ringkasan, lalu klik Perpanjang sekarang pada kartu Langganan.',
              'Selesaikan pembayaran di halaman yang terbuka.',
              'Periksa tanggal Berakhir di Langganan dan modul. Tanggalnya sudah bergeser.',
            ],
            tip: 'Perpanjangan disambung dari akhir periode berjalan, jadi membayar lebih awal tidak menghilangkan waktu yang tersisa.',
            href: '/account',
          },
          {
            heading: 'Mengubah paket: menambah atau melepas modul dan jumlah siswa',
            body: 'Paket diatur per unit sekolah. Penambahan modul atau kenaikan Jumlah siswa dihitung prorata untuk sisa periode dan berlaku setelah dibayar.',
            steps: [
              'Buka Unit sekolah dan klik Ubah paket pada unit yang dimaksud.',
              'Centang modul yang ingin ditambah, atau hilangkan centang untuk melepas. Modul yang menjadi syarat modul lain ikut ditambahkan.',
              'Ubah Jumlah siswa bila perlu.',
              'Periksa Ringkasan: Dibayar sekarang dan Total.',
              'Klik Bayar dan terapkan, atau Simpan perubahan bila tidak ada yang perlu dibayar sekarang.',
              'Selesaikan pembayaran. Perubahan langsung berlaku setelah terkonfirmasi.',
            ],
            warning:
              'Melepas modul atau menurunkan Jumlah siswa baru berlaku di periode berikutnya. Modul yang dilepas tetap aktif sampai akhir periode berjalan.',
            href: '/account/units',
          },
          {
            heading: 'Menambah unit sekolah',
            body: 'Setiap sekolah baru adalah satu unit dengan paketnya sendiri. Unit dibuat otomatis setelah pembayaran terkonfirmasi, dan Anda menjadi admin awalnya.',
            steps: [
              'Klik Tambah unit sekolah (di Ringkasan atau Unit sekolah).',
              'Isi Nama sekolah dan pilih alamat sekolah yang tersedia.',
              'Pilih modul dan Jumlah siswa.',
              'Periksa Ringkasan sampai muncul Total.',
              'Klik Bayar dan buat unit, lalu selesaikan pembayaran.',
              'Setelah terkonfirmasi, klik Buka sekolah pada unit baru.',
            ],
            href: '/account/units/new',
          },
          {
            heading: 'Jika tagihan terlambat: masa tenggang, ditangguhkan, dibuka kembali',
            body: 'Ada tiga tahap. Setiap peralihan tahap dikabari lewat email ke semua pemilik lembaga, satu kali, dengan tautan ke halaman Tagihan dan pembayaran.',
            steps: [
              'Masa tenggang: setelah lewat jatuh tempo, langganan masuk Masa tenggang. Email menyebut tanggal akhir masa tenggang. Sekolah tetap bisa dipakai.',
              'Ditangguhkan: bila masih belum dibayar saat masa tenggang habis, semua sekolah di lembaga ditangguhkan. Guru dan staf melihat layar Sekolah ini sedang ditangguhkan, bukan halaman kerja, dan data sekolah tetap aman.',
              'Dibuka kembali: begitu tagihan dibayar, akses semua sekolah dibuka otomatis dan Anda menerima email Langganan aktif kembali. Pengguna cukup menekan Muat ulang.',
            ],
            tip: 'Pemilik lembaga yang membuka sekolah ditangguhkan melihat tombol Buka portal pemilik lembaga untuk membayar. Penangguhan oleh pengelola platform tidak ikut terbuka oleh pembayaran. Alasan yang ditulis pengelola platform dan tanggal penangguhan tampil di layar sekolah dan di daftar Unit sekolah.',
            warning:
              'Bayar tagihan sebelum masa tenggang habis. Akses dibuka kembali otomatis setelah tagihan dibayar, tetapi sekolah tidak bisa dipakai selama ditangguhkan.',
          },
        ],
        faq: [
          {
            q: 'Saya sudah membayar tetapi tagihan masih Belum dibayar. Bagaimana?',
            a: 'Tunggu beberapa saat, lalu buka ulang Tagihan dan pembayaran. Bila tetap Belum dibayar, buka Bantuan, klik Hubungi dukungan, dan sertakan nama lembaga serta bukti pembayaran Anda.',
          },
          {
            q: 'Kapan modul tambahan mulai bisa dipakai?',
            a: 'Segera setelah pembayaran terkonfirmasi. Biayanya dihitung prorata untuk sisa periode.',
          },
          {
            q: 'Kapan pelepasan modul berlaku?',
            a: 'Di periode berikutnya. Modul yang dilepas tetap aktif sampai akhir periode berjalan dan tidak ditagih lagi sesudahnya.',
          },
          {
            q: 'Sekolah kami tidak bisa dibuka dan tertulis Ditangguhkan. Apa yang harus dilakukan?',
            a: 'Buka Tagihan dan pembayaran, klik Bayar sekarang pada tagihan yang Belum dibayar, lalu selesaikan pembayaran. Akses dibuka kembali otomatis setelah tagihan dibayar.',
          },
          {
            q: 'Apakah membayar lebih awal membuat sisa waktu hilang?',
            a: 'Tidak. Perpanjangan disambung dari akhir periode berjalan, jadi tidak ada waktu yang terbuang.',
          },
        ],
      },
      en: {
        title: 'Subscription, invoices, and school units',
        summary:
          'Check the subscription, pay invoices, renew, change the plan, and add school units in the Account portal.',
        forWho: 'Institution managers who handle the subscription and payments for all school units.',
        sections: [
          {
            heading: 'Checking the subscription and modules',
            body: 'The Subscription and modules page shows the subscription status: Active, Grace period, Suspended, Canceled, or Awaiting payment. It also shows the Monthly or Yearly period and the modules of each unit.',
            steps: [
              'Open Subscription and modules in the Account menu.',
              'Look at Billing cycle, Period start, and Ends.',
              'Look at Plan per unit to see which modules are active in each school.',
            ],
            href: '/account/subscription',
          },
          {
            heading: 'Paying an invoice',
            body: 'Renewal, plan upgrade, and new unit invoices appear on the Billing and payments page. The status is Unpaid, Paid, Expired, or Void.',
            steps: [
              'Open Billing and payments in the Account menu.',
              'Find an invoice with the status Unpaid. Note the Due date.',
              'Click Pay now and complete the payment on the page that opens.',
              'Return to Billing and payments and make sure the status became Paid.',
            ],
            tip: 'The Open invoices card on Overview shows how many invoices are still waiting. When it says All paid, there is nothing to pay.',
            href: '/account/billing',
          },
          {
            heading: 'Renewing the subscription',
            body: 'You renew by paying the invoice for the next period.',
            steps: [
              'Open Overview, then click Renew now on the Subscription card.',
              'Complete the payment on the page that opens.',
              'Check the Ends date in Subscription and modules. It has moved forward.',
            ],
            tip: 'Renewal continues from the end of the current period, so paying early does not lose any remaining time.',
            href: '/account',
          },
          {
            heading: 'Changing the plan: adding or removing modules and student count',
            body: 'Plans are set per school unit. Added modules or a higher Student count are prorated for the rest of the period and take effect once paid.',
            steps: [
              'Open School units and click Change plan on the unit.',
              'Tick the modules to add, or untick to remove. Modules required by others are added too.',
              'Change the Student count if needed.',
              'Check the Summary: Pay now and Total.',
              'Click Pay and apply, or Save change if nothing needs to be paid now.',
              'Complete the payment. The change takes effect as soon as it is confirmed.',
            ],
            warning:
              'Removing a module or lowering the Student count only takes effect next period. A removed module stays active until the end of the current period.',
            href: '/account/units',
          },
          {
            heading: 'Adding a school unit',
            body: 'Each new school is a unit with its own plan. The unit is created automatically once payment is confirmed, and you become its first admin.',
            steps: [
              'Click Add school unit (on Overview or School units).',
              'Fill in the School name and choose an available school address.',
              'Pick the modules and Student count.',
              'Check the Summary until the Total appears.',
              'Click Pay and create unit, then complete the payment.',
              'Once confirmed, click Open school on the new unit.',
            ],
            href: '/account/units/new',
          },
          {
            heading: 'If an invoice is late: grace period, suspended, reopened',
            body: 'There are three stages. Each change of stage is announced once by email to all institution owners, with a link to the Invoices and payments page.',
            steps: [
              'Grace period: after the due date the subscription enters the Grace period. The email states when it ends. The school can still be used.',
              'Suspended: if it is still unpaid when the grace period ends, all schools of the institution are suspended. Teachers and staff see a "This school is currently suspended" screen instead of the work pages, and school data stays safe.',
              'Reopened: as soon as the invoice is paid, access to all schools reopens automatically and you receive a "Subscription active again" email. Users only need to press Reload.',
            ],
            tip: 'Institution owners who open a suspended school see an Open the owner portal to pay button. A suspension by the platform administrator is not lifted by payment. The reason the administrator wrote and the suspension date appear on the school screen and in the School units list.',
            warning:
              'Pay the invoice before the grace period ends. Access reopens automatically once it is paid, but the school cannot be used while suspended.',
          },
        ],
        faq: [
          {
            q: 'I paid, but the invoice still says Unpaid. What now?',
            a: 'Wait a moment, then reopen Billing and payments. If it is still Unpaid, open Help, click Contact support, and include your institution name and proof of payment.',
          },
          {
            q: 'When can I use an added module?',
            a: 'As soon as payment is confirmed. The cost is prorated for the rest of the period.',
          },
          {
            q: 'When does removing a module take effect?',
            a: 'Next period. The removed module stays active until the end of the current period and is not billed afterward.',
          },
          {
            q: 'Our school cannot be opened and says Suspended. What do I do?',
            a: 'Open Billing and payments, click Pay now on the Unpaid invoice, and complete the payment. Access reopens automatically once it is paid.',
          },
          {
            q: 'Does paying early lose the remaining time?',
            a: 'No. Renewal continues from the end of the current period, so no time is wasted.',
          },
        ],
      },
      su: {
        title: 'Langganan, tagihan, jeung unit sakola',
        summary:
          'Mariksa langganan, mayar tagihan, mangjangkeun, ngarobah paket, jeung nambahan unit sakola di Portal Akun.',
        forWho: 'Pangurus lembaga nu ngurus langganan jeung pambayaran pikeun sakabéh unit sakola.',
        sections: [
          {
            heading: 'Mariksa langganan jeung modul',
            body: 'Kaca Langganan jeung modul nunjukkeun status langganan: Aktip, Mangsa kalonggaran, Dieureunkeun, Dibatalkeun, atawa Ngadagoan pamayaran. Aya ogé période Bulanan atawa Taunan jeung modul unggal unit.',
            steps: [
              'Buka Langganan jeung modul dina Ménu akun.',
              'Tingali Siklus tagihan, Mimiti période, jeung Réngsé.',
              'Tingali Paket unggal unit pikeun nyaho modul nu aktip di unggal sakola.',
            ],
            href: '/account/subscription',
          },
          {
            heading: 'Mayar tagihan',
            body: 'Tagihan perpanjangan, naékkeun paket, jeung unit anyar némbongan dina kaca Tagihan jeung pambayaran. Statusna Acan dibayar, Lunas, Kadaluwarsa, atawa Dibatalkeun.',
            steps: [
              'Buka Tagihan jeung pambayaran dina Ménu akun.',
              'Golédah tagihan status Acan dibayar. Catet Tanggal bayar.',
              'Klik Bayar ayeuna tuluy réngsékeun pambayaran dina kaca nu muka.',
              'Balik ka Tagihan jeung pambayaran tuluy pastikeun statusna jadi Lunas.',
            ],
            tip: 'Kartu Tagihan nu muka dina Ringkesan nunjukkeun sabaraha tagihan nu masih ngadagoan. Lamun ditulis Sagalana geus lunas, teu aya nu kudu dibayar.',
            href: '/account/billing',
          },
          {
            heading: 'Mangjangkeun langganan',
            body: 'Mangjangkeun dilakukeun ku mayar tagihan période hareup.',
            steps: [
              'Buka Ringkesan, tuluy klik Perpanjang ayeuna dina kartu Langganan.',
              'Réngsékeun pambayaran dina kaca nu muka.',
              'Parios tanggal Réngsé dina Langganan jeung modul. Tanggalna geus maju.',
            ],
            tip: 'Perpanjangan nyambung ti ahir période nu keur jalan, jadi mayar leuwih awal moal ngabalukarkeun waktu leungit.',
            href: '/account',
          },
          {
            heading: 'Ngarobah paket: nambah atawa nyabut modul jeung jumlah siswa',
            body: 'Paket diatur per unit sakola. Tambahan modul atawa naékna Jumlah siswa diitung prorata pikeun sésa période sarta ngalaku sanggeus dibayar.',
            steps: [
              'Buka Unit sakola tuluy klik Robah paket dina unit nu dimaksud.',
              'Centang modul nu rék ditambahan, atawa leupaskeun centang pikeun nyabut. Modul nu jadi sarat modul séjén ditambahkeun ogé.',
              'Robah Jumlah siswa lamun perlu.',
              'Parios Ringkesan: Dibayar ayeuna jeung Total.',
              'Klik Bayar jeung larapkeun, atawa Simpen parobahan lamun teu aya nu kudu dibayar ayeuna.',
              'Réngsékeun pambayaran. Parobahan langsung ngalaku sanggeus dikonfirmasi.',
            ],
            warning:
              'Nyabut modul atawa nurunkeun Jumlah siswa ngalakuna dina période hareup. Modul nu dicabut tetep aktip nepi ka ahir période nu keur jalan.',
            href: '/account/units',
          },
          {
            heading: 'Nambahan unit sakola',
            body: 'Unggal sakola anyar téh hiji unit kalawan paketna sorangan. Unit dijieun otomatis sanggeus pambayaran dikonfirmasi, sarta anjeun jadi admin awalna.',
            steps: [
              'Klik Tambah unit sakola (dina Ringkesan atawa Unit sakola).',
              'Eusian Ngaran sakola tuluy pilih alamat sakola nu sayogi.',
              'Pilih modul jeung Jumlah siswa.',
              'Parios Ringkesan nepi ka Total némbongan.',
              'Klik Bayar jeung jieun unit, tuluy réngsékeun pambayaran.',
              'Sanggeus dikonfirmasi, klik Buka sakola dina unit anyar.',
            ],
            href: '/account/units/new',
          },
          {
            heading: 'Lamun tagihan telat: mangsa kalonggaran, dieureunkeun, dibuka deui',
            body: 'Aya tilu tahap. Unggal robahan tahap diwartosan sakali ngaliwatan surélék ka sakabéh nu gaduh lembaga, jeung tumbu ka kaca Tagihan jeung pambayaran.',
            steps: [
              'Mangsa kalonggaran: sanggeus kaliwat tanggal bayar, langganan asup Mangsa kalonggaran. Surélékna nyebutkeun tanggal béakna. Sakola tetep bisa dipaké.',
              'Dieureunkeun: lamun tetep acan dibayar nalika mangsa kalonggaran béak, sakabéh sakola di lembaga dieureunkeun. Guru jeung staf ningali layar "Sakola ieu keur ditangguhkeun", lain kaca gawé, sarta data sakola tetep aman.',
              'Dibuka deui: pas tagihan dibayar, aksés sakabéh sakola dibuka otomatis sarta anjeun narima surélék "Langganan aktif deui". Pamaké cukup mencét Muat deui.',
            ],
            tip: 'Nu gaduh lembaga nu muka sakola nu dieureunkeun bakal ningali tombol Buka portal nu gaduh lembaga pikeun mayar. Panangguhan ku pangurus platform henteu muka ku pambayaran. Alesan nu ditulis pangurus platform jeung tanggal panangguhan muncul dina layar sakola jeung dina daptar Unit sakola.',
            warning:
              'Bayar tagihan samemeh mangsa kalonggaran béak. Aksés dibuka deui otomatis sanggeus tagihan dibayar, tapi sakola teu bisa dipaké salila dieureunkeun.',
          },
        ],
        faq: [
          {
            q: 'Abdi geus mayar tapi tagihan tetep Acan dibayar. Kumaha?',
            a: 'Antosan sakedap, tuluy buka deui Tagihan jeung pambayaran. Lamun tetep Acan dibayar, buka Bantuan, klik Hubungi dukungan, tuluy sebutkeun ngaran lembaga jeung bukti pambayaran anjeun.',
          },
          {
            q: 'Iraha modul tambahan bisa dipaké?',
            a: 'Langsung sanggeus pambayaran dikonfirmasi. Biayana diitung prorata pikeun sésa période.',
          },
          {
            q: 'Iraha nyabut modul ngalaku?',
            a: 'Dina période hareup. Modul nu dicabut tetep aktip nepi ka ahir période nu keur jalan sarta teu ditagih deui sanggeusna.',
          },
          {
            q: 'Sakola kami teu bisa dibuka sarta ditulis Dieureunkeun. Kumaha?',
            a: 'Buka Tagihan jeung pambayaran, klik Bayar ayeuna dina tagihan nu Acan dibayar, tuluy réngsékeun pambayaran. Aksés dibuka deui otomatis sanggeus tagihan dibayar.',
          },
          {
            q: 'Naha mayar leuwih awal ngabalukarkeun sésa waktu leungit?',
            a: 'Henteu. Perpanjangan nyambung ti ahir période nu keur jalan, jadi taya waktu nu kabuang.',
          },
        ],
      },
    },
  },
  {
    slug: 'security',
    icon: 'lock',
    tone: 'slate',
    group: 'safety',
    text: {
      id: {
        title: 'Keamanan akun',
        summary:
          'Ganti kata sandi, perbarui nama, pulihkan akun bila lupa kata sandi, dan jaga akses lembaga tetap aman.',
        forWho: 'Semua pengelola lembaga, terutama yang memakai komputer bersama.',
        sections: [
          {
            heading: 'Mengganti kata sandi',
            body: 'Gunakan kata sandi minimal 12 karakter dan jangan pakai ulang kata sandi dari layanan lain.',
            steps: [
              'Buka Profil dan keamanan pada Menu akun.',
              'Pada Ganti kata sandi, isi Kata sandi saat ini.',
              'Isi Kata sandi baru, lalu ulangi pada Ulangi kata sandi baru.',
              'Klik Simpan kata sandi.',
            ],
            warning: 'Setelah kata sandi diganti, sesi di perangkat lain akan keluar dan harus masuk lagi.',
            href: '/account/profile',
          },
          {
            heading: 'Memperbarui nama akun',
            body: 'Nama akun dipakai pada undangan dan catatan aktivitas, jadi pastikan benar.',
            steps: [
              'Buka Profil dan keamanan.',
              'Ubah isian Nama lengkap pada bagian Profil.',
              'Klik Simpan nama.',
            ],
            tip: 'Gunakan nama asli supaya staf sekolah mengenali undangan yang datang dari Anda.',
            href: '/account/profile',
          },
          {
            heading: 'Jika lupa kata sandi',
            body: 'Anda tidak perlu menghubungi siapa pun. Masuk memakai kode 6 digit yang dikirim ke email.',
            steps: [
              'Di halaman masuk, klik Lupa kata sandi?.',
              'Isi Email akun, lalu klik Kirim kode.',
              'Buka email dan salin kode 6 digit. Kode berlaku 10 menit; periksa juga folder spam.',
              'Isi Kode dari email dan Kata sandi baru, lalu klik Atur ulang kata sandi.',
              'Masuk lagi dengan kata sandi baru.',
            ],
            tip: 'Kode belum datang? Tunggu hitungan mundur selesai, lalu klik Kirim ulang kode.',
          },
          {
            heading: 'Menjaga akses lembaga tetap aman',
            body: 'Akun pengelola memegang langganan dan tagihan seluruh lembaga, jadi lindungi dengan baik.',
            steps: [
              'Beri staf akses lewat undangan dan peran di menu Anggota sekolah, bukan dengan berbagi akun.',
              'Klik Keluar setelah memakai komputer bersama.',
              'Nonaktifkan staf yang tidak lagi bertugas.',
            ],
            warning: 'Jangan membagikan kata sandi kepada siapa pun, termasuk sesama staf.',
            href: '/account/members',
          },
        ],
        faq: [
          {
            q: 'Kata sandi saat ini ditolak. Bagaimana?',
            a: 'Periksa huruf besar-kecil dan pastikan tombol Tampilkan kata sandi menunjukkan isian yang benar. Bila tetap salah, keluar lalu pakai Lupa kata sandi? di halaman masuk.',
          },
          {
            q: 'Kode 6 digit tidak sampai. Apa yang harus saya periksa?',
            a: 'Periksa folder spam dan pastikan email yang diisi benar. Setelah hitungan mundur selesai, klik Kirim ulang kode. Kode hanya berlaku 10 menit.',
          },
          {
            q: 'Saya mengganti kata sandi dan tiba-tiba keluar dari perangkat lain. Apakah itu wajar?',
            a: 'Wajar. Saat kata sandi diganti, semua perangkat lain keluar demi keamanan. Masuk lagi dengan kata sandi baru.',
          },
          {
            q: 'Apa yang harus dilakukan bila akun dipakai orang lain?',
            a: 'Segera ganti kata sandi di Profil dan keamanan. Penggantian ini mengeluarkan semua perangkat lain. Bila tagihan atau akses sekolah terlihat berubah, hubungi dukungan lewat Bantuan.',
          },
        ],
      },
      en: {
        title: 'Account security',
        summary:
          'Change your password, update your name, recover the account if you forget the password, and keep institution access safe.',
        forWho: 'All institution managers, especially those who use a shared computer.',
        sections: [
          {
            heading: 'Changing your password',
            body: 'Use a password of at least 12 characters and do not reuse a password from another service.',
            steps: [
              'Open Profile and security in the Account menu.',
              'Under Change password, fill in Current password.',
              'Fill in New password, then repeat it under Repeat new password.',
              'Click Save password.',
            ],
            warning:
              'After the password is changed, sessions on other devices are signed out and must sign in again.',
            href: '/account/profile',
          },
          {
            heading: 'Updating your account name',
            body: 'The account name is used in invitations and activity records, so make sure it is right.',
            steps: [
              'Open Profile and security.',
              'Edit the Full name field under Profile.',
              'Click Save name.',
            ],
            tip: 'Use your real name so school staff recognize invitations that come from you.',
            href: '/account/profile',
          },
          {
            heading: 'If you forget your password',
            body: 'You do not need to contact anyone. You sign in with a 6-digit code sent to your email.',
            steps: [
              'On the sign-in page, click Forgot password?.',
              'Fill in your account Email, then click Send code.',
              'Open the email and copy the 6-digit code. The code is valid for 10 minutes; check the spam folder too.',
              'Fill in Code from email and New password, then click Reset password.',
              'Sign in again with the new password.',
            ],
            tip: 'Code has not arrived? Wait for the countdown to finish, then click Resend code.',
          },
          {
            heading: 'Keeping institution access safe',
            body: 'The manager account holds the subscription and invoices for the whole institution, so protect it well.',
            steps: [
              'Give staff access through invitations and roles in the school Members menu, not by sharing an account.',
              'Click Sign out after using a shared computer.',
              'Disable staff who no longer serve.',
            ],
            warning: 'Never share your password with anyone, including fellow staff.',
            href: '/account/members',
          },
        ],
        faq: [
          {
            q: 'My current password is rejected. What now?',
            a: 'Check upper and lower case, and use the Show password button to see what you typed. If it is still wrong, sign out and use Forgot password? on the sign-in page.',
          },
          {
            q: 'The 6-digit code did not arrive. What should I check?',
            a: 'Check the spam folder and make sure the email you entered is right. After the countdown finishes, click Resend code. The code is only valid for 10 minutes.',
          },
          {
            q: 'I changed my password and was signed out of other devices. Is that normal?',
            a: 'Yes. When the password changes, all other devices are signed out for safety. Sign in again with the new password.',
          },
          {
            q: 'What should I do if someone else is using my account?',
            a: 'Change the password right away in Profile and security. This signs out all other devices. If invoices or school access look changed, contact support through Help.',
          },
        ],
      },
      su: {
        title: 'Kaamanan akun',
        summary:
          'Ganti kecap sandi, anyarkeun ngaran, pulihkeun akun lamun poho kecap sandi, jeung jaga aksés lembaga tetep aman.',
        forWho: 'Sakabéh pangurus lembaga, utamana nu maké komputer babarengan.',
        sections: [
          {
            heading: 'Ngaganti kecap sandi',
            body: 'Anggo kecap sandi sahanteuna 12 karakter sarta ulah maké deui kecap sandi tina layanan séjén.',
            steps: [
              'Buka Profil jeung kaamanan dina Ménu akun.',
              'Dina Ganti kata sandi, eusian Kecap sandi ayeuna.',
              'Eusian Kecap sandi anyar, tuluy baralikan dina Baralikan kecap sandi anyar.',
              'Klik Simpen kecap sandi.',
            ],
            warning:
              'Sanggeus kecap sandi diganti, sési di parabot séjén bakal kaluar jeung kudu lebet deui.',
            href: '/account/profile',
          },
          {
            heading: 'Nganyarkeun ngaran akun',
            body: 'Ngaran akun dipaké dina undangan jeung catetan aktivitas, jadi pastikeun bener.',
            steps: [
              'Buka Profil jeung kaamanan.',
              'Robah eusian Ngaran lengkep dina bagian Profil.',
              'Klik Simpen ngaran.',
            ],
            tip: 'Anggo ngaran nu sabenerna supaya staf sakola ngaenalan undangan ti anjeun.',
            href: '/account/profile',
          },
          {
            heading: 'Lamun poho kecap sandi',
            body: 'Anjeun teu kudu ngahubungi saha-saha. Lebet nganggo kode 6 angka nu dikirim ka surélék.',
            steps: [
              'Di kaca lebet, klik Lupa kata sandi?.',
              'Eusian Surélék akun, tuluy klik Kirim kode.',
              'Buka surélék tuluy salin kode 6 angka. Kode lumaku 10 menit; parios ogé folder spam.',
              'Eusian Kode tina surélék jeung Kecap sandi anyar, tuluy klik Atur ulang kata sandi.',
              'Lebet deui nganggo kecap sandi anyar.',
            ],
            tip: 'Kode acan datang? Antosan itungan mundur réngsé, tuluy klik Kirim ulang kode.',
          },
          {
            heading: 'Ngajaga aksés lembaga tetep aman',
            body: 'Akun pangurus nyepeng langganan jeung tagihan sakabéh lembaga, jadi jaga sing nyaman.',
            steps: [
              'Pasihan staf aksés lewat undangan jeung peran dina ménu Anggota sakola, lain ku babagi akun.',
              'Klik Kaluar sanggeus maké komputer babarengan.',
              'Pareuman staf nu geus teu tugas.',
            ],
            warning: 'Ulah ngabagikeun kecap sandi ka saha waé, kaasup ka sasama staf.',
            href: '/account/members',
          },
        ],
        faq: [
          {
            q: 'Kecap sandi ayeuna ditolak. Kumaha?',
            a: 'Parios hurup gedé-leutik jeung anggo tombol Témbongkeun kecap sandi pikeun ningali nu diketik. Lamun tetep lepat, kaluar tuluy anggo Lupa kata sandi? di kaca lebet.',
          },
          {
            q: 'Kode 6 angka teu nepi. Naon nu kudu dipariksa?',
            a: 'Parios folder spam jeung pastikeun surélék nu diasupkeun bener. Sanggeus itungan mundur réngsé, klik Kirim ulang kode. Kode ngan lumaku 10 menit.',
          },
          {
            q: 'Abdi ngaganti kecap sandi tuluy kaluar tina parabot séjén. Naha wajar?',
            a: 'Wajar. Waktu kecap sandi diganti, sakabéh parabot séjén kaluar pikeun kaamanan. Lebet deui nganggo kecap sandi anyar.',
          },
          {
            q: 'Naon nu kudu dilakukeun lamun akun dipaké ku batur?',
            a: 'Geura ganti kecap sandi dina Profil jeung kaamanan. Ieu ngaluarkeun sakabéh parabot séjén. Lamun tagihan atawa aksés sakola siga robah, hubungi dukungan lewat Bantuan.',
          },
        ],
      },
    },
  },
];
