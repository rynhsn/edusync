import type { DocArticle } from '@/lib/docs-types';

/** Dokumentasi panel sekolah per modul: data induk, absensi, jadwal, pengguna. Isi: id, en, su. */
export const CORE_DOCS: DocArticle[] = [
  {
    slug: 'students',
    icon: 'graduation',
    tone: 'sky',
    text: {
      id: {
        title: 'Siswa: data diri, wali, kartu, dan impor Excel',
        summary: 'Kelola data siswa lengkap, wali murid, kartu RFID, serta impor dan ekspor lewat Excel.',
        sections: [
          {
            heading: 'Tambah dan ubah siswa',
            body: 'Buka menu Siswa di Data induk. Isian wajib hanya nama dan jenis kelamin; NIS dan NISN boleh kosong, tetapi bila diisi tidak boleh sama dengan siswa lain. Data diri lain bersifat opsional: tempat lahir, NIK (16 digit angka), agama, alamat, telepon/WA, dan email siswa.',
            steps: [
              'Klik Tambah siswa.',
              'Isi nama, NIS, NISN, jenis kelamin, tanggal lahir, agama, dan status; pilih kelas bila sudah ada kelas pada tahun ajaran aktif.',
              'Isi kontak siswa dan alamat bila ada. Telepon 0812... disimpan sebagai 62812...; email dan nomor ini disiapkan untuk login siswa nanti.',
              'Klik Tambah. Untuk mengubah, klik baris siswa atau pilih Ubah di menu baris.',
            ],
            href: '/students',
          },
          {
            heading: 'Wali murid',
            body: 'Di menu baris siswa pilih Wali. Satu wali bisa menaungi beberapa siswa sekaligus (kakak-adik), dan perubahan data wali berlaku untuk semua anaknya.',
            steps: [
              'Klik menu baris siswa lalu Wali.',
              'Untuk wali baru, isi nama, hubungan (ayah, ibu, wali, atau lainnya), telepon, dan email, lalu klik Tambah wali.',
              'Untuk wali yang sudah ada, ketik minimal 2 huruf nama atau telepon pada Tautkan wali yang sudah ada, lalu klik Tautkan.',
              'Centang Jadikan wali utama, atau klik Jadikan utama pada wali yang sudah tertaut. Klik Lepas untuk melepas wali dari siswa itu.',
            ],
          },
          {
            heading: 'Kartu RFID',
            body: 'Bila modul Absensi aktif dan Anda berhak mengatur absensi, menu baris siswa memuat Kartu RFID yang membuka dialog terpisah. Di sana Anda mendaftarkan kode kartu bila siswa belum punya kartu, atau menghapus kartunya.',
          },
          {
            heading: 'Impor dan ekspor Excel',
            body: 'Templat Excel memuat 20 kolom: data siswa (nama sampai email), Kelas, lalu Wali 1 dan Wali 2 masing-masing dengan nama, hubungan, telepon/WA, dan email. Wali 1 menjadi wali utama, dan wali dengan nomor telepon yang sama dipakai bersama sehingga kakak-adik tidak ganda.',
            steps: [
              'Klik Impor Excel di halaman Siswa lalu unduh templat.',
              'Isi lembar Siswa mulai baris 2 tanpa mengubah judul kolom; hanya Nama dan Jenis Kelamin (L atau P) yang wajib.',
              'Unggah berkas dan periksa pratinjau. Tidak ada yang tersimpan sebelum semua baris valid.',
              'Klik impor; satu berkas maksimal 1000 baris.',
              'Tombol Ekspor Excel memakai kolom yang sama (sesuai pencarian dan saringan yang tampil), jadi hasilnya bisa diedit lalu diimpor ulang.',
            ],
            href: '/students/import',
          },
          {
            heading: 'Yang perlu diperhatikan',
            body: 'Kelas yang tampil adalah kelas pada tahun ajaran aktif, dan kolom Kelas di Excel harus sama dengan nama kelas tahun itu. Status siswa: aktif, lulus, pindah, atau keluar; untuk siswa lulus atau pindah ubah statusnya, jangan dihapus, karena hapus hanya menyembunyikan siswa dari daftar. Tanpa izin kelola siswa, halaman hanya bisa dilihat.',
          },
        ],
      },
      en: {
        title: 'Students: profile, guardians, cards, and Excel import',
        summary: 'Manage full student records, guardians, RFID cards, and import or export through Excel.',
        sections: [
          {
            heading: 'Add and edit a student',
            body: 'Open the Students menu under Master data. Only the name and gender are required; NIS and NISN can stay empty, but when filled they must not match another student. Other profile details are optional: birth place, NIK (16 digits), religion, address, phone/WhatsApp, and email.',
            steps: [
              'Click Add a student.',
              'Fill in the name, NIS, NISN, gender, birth date, religion, and status; pick a class if the active academic year already has classes.',
              'Add the contact details and address if available. A phone number such as 0812... is stored as 62812...; the email and number are prepared for student login later.',
              'Click Add. To edit, click the student row or choose Edit in the row menu.',
            ],
            href: '/students',
          },
          {
            heading: 'Guardians',
            body: 'In the student row menu choose Guardians. One guardian can look after several students (siblings), and a change to the guardian details applies to all of their children.',
            steps: [
              'Click the student row menu, then Guardians.',
              'For a new guardian, fill in the name, relation (father, mother, guardian, or other), phone, and email, then click Add guardian.',
              'For an existing guardian, type at least 2 letters of the name or phone under Link an existing guardian, then click Link.',
              'Tick Make primary guardian, or click Make primary on a linked guardian. Click Remove to detach the guardian from that student.',
            ],
          },
          {
            heading: 'RFID card',
            body: 'When the Attendance module is active and you may configure attendance, the student row menu includes RFID card, which opens a separate dialog. There you register the card code if the student has no card yet, or delete the card.',
          },
          {
            heading: 'Excel import and export',
            body: 'The Excel template has 20 columns: student details (name through email), Class, then Guardian 1 and Guardian 2, each with name, relation, phone/WhatsApp, and email. Guardian 1 becomes the primary guardian, and guardians with the same phone number are shared, so siblings are not duplicated.',
            steps: [
              'Click Import from Excel on the Students page and download the template.',
              'Fill in the Siswa sheet from row 2 without changing the column titles; only Nama (name) and Jenis Kelamin (gender, L or P) are required.',
              'Upload the file and check the preview. Nothing is saved until every row is valid.',
              'Click import; one file holds at most 1000 rows.',
              'The Export Excel button uses the same columns (following the current search and filters), so the result can be edited and imported again.',
            ],
            href: '/students/import',
          },
          {
            heading: 'Good to know',
            body: 'The class shown is the class in the active academic year, and the Class column in Excel must match a class name of that year. A student is active, graduated, transferred, or dropped; for graduated or transferred students change the status instead of deleting, because deleting only hides the student from the list. Without the manage students permission the page is view-only.',
          },
        ],
      },
      su: {
        title: 'Murid: data diri, wali, kartu, jeung impor Excel',
        summary: 'Atur data murid nu lengkep, wali murid, kartu RFID, jeung impor atawa ékspor lewat Excel.',
        sections: [
          {
            heading: 'Nambah jeung ngarobah murid',
            body: 'Buka menu Murid dina Data induk. Nu wajib diwewehan ngan ngaran jeung jenis kelamin; NIS jeung NISN meunang kosong, tapi lamun diwewehan teu meunang sarua jeung murid séjén. Data diri séjénna opsional: tempat lahir, NIK (16 angka), agama, alamat, telepon/WA, jeung surélék murid.',
            steps: [
              'Klik Tambih murid.',
              'Eusian ngaran, NIS, NISN, jenis kelamin, tanggal lahir, agama, jeung status; pilih kelas lamun taun pangajaran aktip geus boga kelas.',
              'Eusian kontak murid jeung alamat lamun aya. Telepon 0812... disimpen jadi 62812...; surélék jeung nomer ieu disiapkeun pikeun lebet murid engké.',
              'Klik Tambih. Pikeun ngarobah, klik baris murid atawa pilih Robah dina menu baris.',
            ],
            href: '/students',
          },
          {
            heading: 'Wali murid',
            body: 'Dina menu baris murid pilih Wali. Hiji wali bisa ngajaga sababaraha murid sakaligus (lanceuk-adi), sarta parobahan data wali lumaku pikeun sakabéh anakna.',
            steps: [
              'Klik menu baris murid, tuluy Wali.',
              'Pikeun wali anyar, eusian ngaran, hubungan (bapa, indung, wali, atawa séjén), telepon, jeung surélék, tuluy klik Tambah wali.',
              'Pikeun wali nu geus aya, ketik sahenteuna 2 hurup ngaran atawa telepon dina Tumbu wali nu geus aya, tuluy klik Tumbu.',
              'Centang Jadikeun wali utama, atawa klik Jadikeun utama dina wali nu geus katumbu. Klik Lepas pikeun ngalepas wali tina murid éta.',
            ],
          },
          {
            heading: 'Kartu RFID',
            body: 'Lamun modul Absénsi aktip jeung Anjeun boga hak ngatur absénsi, menu baris murid ngandung Kartu RFID nu muka dialog nyalira. Didinya Anjeun bisa ngadaptarkeun kode kartu lamun murid acan boga kartu, atawa mupus kartuna.',
          },
          {
            heading: 'Impor jeung ékspor Excel',
            body: 'Templat Excel ngandung 20 kolom: data murid (ngaran nepi ka surélék), Kelas, tuluy Wali 1 jeung Wali 2 masing-masing maké ngaran, hubungan, telepon/WA, jeung surélék. Wali 1 jadi wali utama, sarta wali nu nomer teleponna sarua dipaké babarengan sangkan lanceuk-adi teu ganda.',
            steps: [
              'Klik Impor Excel dina kaca Murid tuluy unduh templat.',
              'Eusian lembar Siswa ti baris 2 tanpa ngarobah judul kolom; ngan Nama jeung Jenis Kelamin (L atawa P) nu wajib.',
              'Unggah berkas tuluy pariksa pratinjau. Teu aya nu disimpen saméméh sakabéh baris valid.',
              'Klik impor; hiji berkas pangpangna 1000 baris.',
              'Tombol Ékspor Excel maké kolom nu sarua (nurutkeun pamaluruhan jeung saringan nu kaciri), jadi hasilna bisa diédit tuluy diimpor deui.',
            ],
            href: '/students/import',
          },
          {
            heading: 'Nu kudu diperhatikeun',
            body: 'Kelas nu kaciri nyaéta kelas dina taun pangajaran aktip, sarta kolom Kelas dina Excel kudu sarua jeung ngaran kelas taun éta. Status murid: aktip, lulus, pindah, atawa kaluar; pikeun murid lulus atawa pindah robah statusna, ulah dipupus, sabab pupus ngan nyumputkeun murid tina daptar. Tanpa idin ngatur murid, kaca ngan bisa dititénan.',
          },
        ],
      },
    },
  },
  {
    slug: 'teachers',
    icon: 'users',
    tone: 'violet',
    text: {
      id: {
        title: 'Guru dan akun login guru',
        summary:
          'Kelola data guru, impor dari Excel, dan tautkan akun login agar sistem mengenali guru yang masuk.',
        sections: [
          {
            heading: 'Data guru',
            body: 'Data guru terdiri dari nama, NIP (opsional, tetapi bila diisi tidak boleh sama dengan guru lain), dan status aktif atau nonaktif. Daftar bisa dicari menurut nama atau NIP, disaring menurut status, dan diekspor ke Excel.',
            steps: [
              'Buka menu Guru di Data induk.',
              'Klik Tambah guru.',
              'Isi nama, NIP, dan status.',
              'Simpan. Klik baris guru untuk mengubahnya.',
            ],
            href: '/teachers',
          },
          {
            heading: 'Impor dari Excel',
            body: 'Templat berisi tiga kolom: Nama, NIP, dan Status (Aktif atau Nonaktif; kosong dianggap Aktif). Hanya Nama yang wajib, dan satu berkas maksimal 1000 baris.',
            steps: [
              'Klik Impor Excel di halaman Guru dan unduh templat.',
              'Isi mulai baris 2 tanpa mengubah judul kolom, lalu unggah berkas.',
              'Periksa pratinjau; guru baru tersimpan hanya bila semua baris valid.',
            ],
            href: '/teachers/import',
          },
          {
            heading: 'Menautkan akun login',
            body: 'Tautan akun membuat sistem tahu guru mana yang sedang masuk, sehingga absensi dan nilai dibatasi ke kelas dan mata pelajaran yang diampu. Menu Akun login di baris guru hanya muncul bila Anda punya izin kelola guru dan kelola anggota.',
            steps: [
              'Klik menu baris guru lalu Akun login.',
              'Bila guru sudah menjadi anggota sekolah, pilih Tautkan akun yang ada, pilih anggotanya, lalu klik Tautkan.',
              'Bila belum, pilih Undang lewat email, isi email guru, lalu klik Kirim undangan. Tautan berlaku 7 hari dengan peran Guru, dan akun otomatis tertaut saat undangan diterima.',
              'Untuk melepas, buka lagi Akun login lalu klik Lepas tautan; data guru tetap ada.',
            ],
          },
          {
            heading: 'Yang perlu diperhatikan',
            body: 'Satu anggota hanya bisa tertaut ke satu guru, dan hanya anggota aktif yang belum tertaut yang muncul di pilihan. Guru yang masih mengampu mata pelajaran tidak bisa dihapus; ubah statusnya menjadi nonaktif. Penugasan guru ke kelas dan mata pelajaran diatur di halaman Kelas.',
          },
        ],
      },
      en: {
        title: 'Teachers and teacher login accounts',
        summary:
          'Manage teacher records, import from Excel, and link a login account so the system recognises the teacher who signs in.',
        sections: [
          {
            heading: 'Teacher records',
            body: 'A teacher record has a name, an NIP (optional, but when filled it must not match another teacher), and an active or inactive status. The list can be searched by name or NIP, filtered by status, and exported to Excel.',
            steps: [
              'Open the Teachers menu under Master data.',
              'Click Add a teacher.',
              'Fill in the name, NIP, and status.',
              'Save. Click a teacher row to edit it.',
            ],
            href: '/teachers',
          },
          {
            heading: 'Import from Excel',
            body: 'The template has three columns: Nama (name), NIP, and Status (Aktif or Nonaktif; empty counts as Aktif). Only the name is required, and one file holds at most 1000 rows.',
            steps: [
              'Click Import from Excel on the Teachers page and download the template.',
              'Fill it in from row 2 without changing the column titles, then upload the file.',
              'Check the preview; new teachers are saved only when every row is valid.',
            ],
            href: '/teachers/import',
          },
          {
            heading: 'Linking a login account',
            body: 'Linking an account lets the system know which teacher is signed in, so attendance and grades are limited to the classes and subjects that teacher teaches. The Login account item in the teacher row menu appears only if you may manage teachers and manage members.',
            steps: [
              'Click the teacher row menu, then Login account.',
              'If the teacher is already a school member, choose Link an existing account, pick the member, and click Link.',
              'If not, choose Invite by email, enter the teacher email, and click Send invitation. The link is valid for 7 days with the Teacher role, and the account is linked automatically when the invitation is accepted.',
              'To unlink, open Login account again and click Unlink; the teacher record stays.',
            ],
          },
          {
            heading: 'Good to know',
            body: 'One member can be linked to only one teacher, and only active members that are not linked yet appear in the picker. A teacher who still teaches a subject cannot be deleted; set the status to inactive instead. Assigning teachers to classes and subjects is done on the Classes page.',
          },
        ],
      },
      su: {
        title: 'Guru jeung akun asup guru',
        summary:
          'Atur data guru, impor ti Excel, jeung tautkeun akun asup sangkan sistem wanoh ka guru nu lebet.',
        sections: [
          {
            heading: 'Data guru',
            body: 'Data guru diwangun ku ngaran, NIP (opsional, tapi lamun diwewehan teu meunang sarua jeung guru séjén), jeung status aktip atawa nonaktip. Daptar bisa diteangan ku ngaran atawa NIP, disaring nurutkeun status, jeung diékspor ka Excel.',
            steps: [
              'Buka menu Guru dina Data induk.',
              'Klik Tambih guru.',
              'Eusian ngaran, NIP, jeung status.',
              'Simpen. Klik baris guru pikeun ngarobahna.',
            ],
            href: '/teachers',
          },
          {
            heading: 'Impor ti Excel',
            body: 'Templat ngandung tilu kolom: Nama, NIP, jeung Status (Aktif atawa Nonaktif; kosong dianggap Aktif). Ngan Nama nu wajib, sarta hiji berkas pangpangna 1000 baris.',
            steps: [
              'Klik Impor Excel dina kaca Guru tuluy unduh templat.',
              'Eusian ti baris 2 tanpa ngarobah judul kolom, tuluy unggah berkas.',
              'Pariksa pratinjau; guru anyar disimpen ngan lamun sakabéh baris valid.',
            ],
            href: '/teachers/import',
          },
          {
            heading: 'Nautkeun akun asup',
            body: 'Tautan akun ngajadikeun sistem apal guru mana nu keur lebet, jadi absénsi jeung nilai dibatesan kana kelas jeung mata pelajaran nu diampuna. Menu Akun asup dina baris guru ngan némbongan lamun Anjeun boga idin ngatur guru jeung ngatur anggota.',
            steps: [
              'Klik menu baris guru, tuluy Akun asup.',
              'Lamun guru geus jadi anggota sakola, pilih Tautkeun akun nu aya, pilih anggotana, tuluy klik Tautkeun.',
              'Lamun acan, pilih Uleman ku surélék, eusian surélék guru, tuluy klik Kirim uleman. Tumbu lumaku 7 poé kalayan peran Guru, sarta akun otomatis katautkeun waktu uleman ditarima.',
              'Pikeun ngalepas, buka deui Akun asup tuluy klik Pupus tautan; data guru tetep aya.',
            ],
          },
          {
            heading: 'Nu kudu diperhatikeun',
            body: 'Hiji anggota ngan bisa katautkeun ka hiji guru, sarta ngan anggota aktip nu acan katautkeun nu némbongan dina pilihan. Guru nu masih ngampu mata pelajaran teu bisa dipupus; robah statusna jadi nonaktip. Panugasan guru kana kelas jeung mata pelajaran diatur dina kaca Kelas.',
          },
        ],
      },
    },
  },
  {
    slug: 'classes-years',
    icon: 'school',
    tone: 'emerald',
    text: {
      id: {
        title: 'Kelas, mata pelajaran, tahun ajaran, dan kalender',
        summary:
          'Susun struktur akademik: tahun ajaran dan semester, kelas, mata pelajaran, serta kalender libur dan ujian.',
        sections: [
          {
            heading: 'Tahun ajaran dan semester',
            body: 'Satu tahun ajaran aktif menentukan daftar kelas dan penempatan siswa. Tahun ajaran pertama otomatis aktif, dan hanya satu yang bisa aktif pada satu waktu.',
            steps: [
              'Buka menu Tahun ajaran dan klik Buat tahun ajaran.',
              'Isi nama yang unik (mis. 2026/2027) serta tanggal mulai dan selesai, lalu simpan.',
              'Buka bagian Semester pada tahun itu, lalu klik Buat Ganjil dan Genap (nama mengikuti Pengaturan sekolah) atau Tambah semester.',
              'Klik Jadikan aktif pada tahun ajaran atau semester yang sedang berjalan.',
            ],
            href: '/academic-years',
          },
          {
            heading: 'Kelas dan jurusan',
            body: 'Kelas dibuat per tahun ajaran dan namanya harus unik pada tahun itu. Jurusan bersifat opsional, untuk sekolah dengan jurusan, peminatan, atau kompetensi keahlian.',
            steps: [
              'Buka menu Kelas dan pilih tahun ajaran.',
              'Klik Tambah kelas, isi nama dan tingkat, lalu pilih jurusan dan wali kelas bila ada.',
              'Pada menu baris kelas pilih Guru pengampu, lalu tetapkan guru untuk tiap mata pelajaran. Satu mata pelajaran di satu kelas punya satu guru.',
              'Tempatkan siswa ke kelas lewat menu Siswa.',
            ],
            href: '/classes',
          },
          {
            heading: 'Mata pelajaran',
            body: 'Tiap mata pelajaran punya kode dan nama; kode harus unik di sekolah. Anda bisa menambah satu per satu atau menyalin dari bank data kurikulum (mata pelajaran dengan kode yang sama dilewati, dan setelah disalin bebas diubah).',
            href: '/subjects',
          },
          {
            heading: 'Kalender akademik',
            body: 'Kalender menyimpan acara per tahun ajaran dengan jenis Libur, Jeda, Ujian, dan Kegiatan. Libur dan jeda mengurangi hari efektif belajar, sedangkan ujian dan kegiatan hanya penanda.',
            steps: [
              'Buka menu Kalender dan pilih tahun ajaran.',
              'Pilih hari belajar per pekan: 5 hari atau 6 hari.',
              'Klik Tambah acara, lalu isi jenis, judul, serta tanggal mulai dan selesai.',
              'Buka Tampilan tahunan dan PDF, lalu klik Unduh PDF untuk mencetak.',
            ],
            href: '/calendar',
          },
          {
            heading: 'Yang perlu diperhatikan',
            body: 'Mengganti tahun ajaran aktif mengubah kelas yang tampil, dan penempatan siswa mengikutinya. Kelas tidak bisa dihapus selama masih ada siswa atau guru pengampu, dan mata pelajaran tidak bisa dihapus bila sudah ditugaskan ke guru. Libur dan jeda berlaku untuk seluruh sekolah, sedangkan ujian dan kegiatan bisa untuk seluruh sekolah atau satu kelas.',
          },
        ],
      },
      en: {
        title: 'Classes, subjects, academic years, and calendar',
        summary:
          'Build the academic structure: academic years and semesters, classes, subjects, and the holiday and exam calendar.',
        sections: [
          {
            heading: 'Academic years and semesters',
            body: 'The one active academic year decides the class list and where students are placed. The first academic year becomes active automatically, and only one can be active at a time.',
            steps: [
              'Open the Academic years menu and click Create academic year.',
              'Enter a unique name (e.g. 2026/2027) plus start and end dates, then save.',
              'Open the Semester section of that year, then click Create Odd and Even (names follow School settings) or Add semester.',
              'Click Make active on the academic year or semester that is currently running.',
            ],
            href: '/academic-years',
          },
          {
            heading: 'Classes and programs',
            body: 'Classes are created per academic year, and the name must be unique within that year. Programs are optional, for schools with majors, specialisations, or skill competencies.',
            steps: [
              'Open the Classes menu and pick the academic year.',
              'Click Add a class, fill in the name and level, then choose a program and homeroom teacher if any.',
              'In the class row menu choose Assigned teachers, then set a teacher for each subject. One subject in one class has one teacher.',
              'Place students into the class through the Students menu.',
            ],
            href: '/classes',
          },
          {
            heading: 'Subjects',
            body: 'Each subject has a code and a name; the code must be unique in the school. You can add them one by one or copy from the curriculum data bank (subjects with a code that already exists are skipped, and once copied they can be edited freely).',
            href: '/subjects',
          },
          {
            heading: 'Academic calendar',
            body: 'The calendar stores events per academic year of the types Holiday, Break, Exam, and Activity. Holidays and breaks reduce the effective school days, while exams and activities are only markers.',
            steps: [
              'Open the Calendar menu and pick the academic year.',
              'Choose the school days per week: 5 days or 6 days.',
              'Click Add an event, then fill in the type, title, and start and end dates.',
              'Open Yearly view and PDF, then click Download PDF to print.',
            ],
            href: '/calendar',
          },
          {
            heading: 'Good to know',
            body: 'Changing the active academic year changes the classes shown, and student placement follows it. A class cannot be deleted while it still has students or assigned teachers, and a subject cannot be deleted once assigned to a teacher. Holidays and breaks apply to the whole school, while exams and activities can be for the whole school or one class.',
          },
        ],
      },
      su: {
        title: 'Kelas, mata pelajaran, taun pangajaran, jeung kalénder',
        summary:
          'Susun struktur akademik: taun pangajaran jeung semester, kelas, mata pelajaran, sarta kalénder libur jeung ujian.',
        sections: [
          {
            heading: 'Taun pangajaran jeung semester',
            body: 'Hiji taun pangajaran aktip nangtukeun daptar kelas jeung panempatan murid. Taun pangajaran kahiji otomatis aktip, sarta ngan hiji nu bisa aktip dina hiji waktu.',
            steps: [
              'Buka menu Taun pangajaran tuluy klik Jieun taun pangajaran.',
              'Eusian ngaran nu unik (upamana 2026/2027) sarta tanggal mimiti jeung réngsé, tuluy simpen.',
              'Buka bagian Semester dina taun éta, tuluy klik Jieun Ganjil jeung Genep (ngaranna nurutkeun Setélan sakola) atawa Tambih semester.',
              'Klik Jadikeun aktip dina taun pangajaran atawa semester nu keur jalan.',
            ],
            href: '/academic-years',
          },
          {
            heading: 'Kelas jeung jurusan',
            body: 'Kelas dijieun per taun pangajaran sarta ngaranna kudu unik dina taun éta. Jurusan sipatna opsional, pikeun sakola nu boga jurusan, peminatan, atawa kompeténsi kaahlian.',
            steps: [
              'Buka menu Kelas tuluy pilih taun pangajaran.',
              'Klik Tambih kelas, eusian ngaran jeung tingkat, tuluy pilih jurusan jeung wali kelas lamun aya.',
              'Dina menu baris kelas pilih Guru pangampu, tuluy tetepkeun guru pikeun unggal mata pelajaran. Hiji mata pelajaran dina hiji kelas boga hiji guru.',
              'Tempatkeun murid kana kelas lewat menu Murid.',
            ],
            href: '/classes',
          },
          {
            heading: 'Mata pelajaran',
            body: 'Unggal mata pelajaran boga kode jeung ngaran; kode kudu unik di sakola. Anjeun bisa nambah hiji-hiji atawa nyalin tina bank data kurikulum (mata pelajaran nu kodena sarua dilangkungan, sarta sanggeus disalin bébas dirobah).',
            href: '/subjects',
          },
          {
            heading: 'Kalénder akadémik',
            body: 'Kalénder nyimpen acara per taun pangajaran kalayan jinis Libur, Jeda, Ujian, jeung Kagiatan. Libur jeung jeda ngurangan poé éféktif diajar, sedengkeun ujian jeung kagiatan ngan jadi tanda.',
            steps: [
              'Buka menu Kalénder tuluy pilih taun pangajaran.',
              'Pilih poé diajar per minggu: 5 poé atawa 6 poé.',
              'Klik Tambih acara, tuluy eusian jinis, judul, sarta tanggal mimiti jeung réngsé.',
              'Buka Témbongan taunan jeung PDF, tuluy klik Unduh PDF pikeun dicitak.',
            ],
            href: '/calendar',
          },
          {
            heading: 'Nu kudu diperhatikeun',
            body: 'Ngaganti taun pangajaran aktip ngarobah kelas nu kaciri, sarta panempatan murid nuturkeunana. Kelas teu bisa dipupus salila masih aya murid atawa guru pangampu, sarta mata pelajaran teu bisa dipupus lamun geus ditugaskeun ka guru. Libur jeung jeda lumaku pikeun sakabéh sakola, sedengkeun ujian jeung kagiatan bisa pikeun sakabéh sakola atawa hiji kelas.',
          },
        ],
      },
    },
  },
  {
    slug: 'school-settings',
    icon: 'settings',
    tone: 'slate',
    text: {
      id: {
        title: 'Pengaturan sekolah',
        summary:
          'Atur zona waktu, hari efektif, nama semester, jam pelajaran bawaan, dan daftar tingkat kelas untuk satu unit sekolah.',
        sections: [
          {
            heading: 'Zona waktu',
            body: 'Zona waktu menjadi dasar tanggal dan jam di seluruh aplikasi, termasuk absensi, tagihan, pesan, dan SPMB. Mengubahnya tidak mengubah data lama, hanya cara hari dan jam dihitung ke depan.',
            steps: [
              'Buka menu Pengaturan sekolah.',
              'Pilih zona waktu; jam saat ini di zona itu ditampilkan sebagai pembanding.',
              'Klik Simpan.',
            ],
            href: '/school-settings',
          },
          {
            heading: 'Hari efektif dan semester',
            body: 'Hari efektif (Senin sampai Minggu, minimal satu hari) dipakai jadwal pelajaran dan kalender akademik. Nama semester (1 sampai 4, tidak boleh kosong atau sama) dipakai saat membuat semester otomatis di Tahun ajaran, dan semester yang sudah dibuat tidak berubah.',
          },
          {
            heading: 'Jam pelajaran bawaan',
            body: 'Isi jam pelajaran pertama dan menit per jam pelajaran (10 sampai 180 menit). Nilai ini hanya menjadi isian awal saat membuat jam pelajaran otomatis di Jadwal; jam yang sudah ada tidak berubah.',
          },
          {
            heading: 'Tingkat kelas',
            body: 'Daftar tingkat (mis. 7, 8, 9 atau X, XI, XII) dipakai pada kelas, tarif SPP, dan periode SPMB agar penulisannya seragam. Selama daftar kosong, tingkat di sana boleh diketik bebas.',
            steps: [
              'Bila daftar masih kosong, pilih jenjang (SD/MI, SMP/MTs, SMA/MA, atau SMK) lalu klik Isi bawaan.',
              'Atau klik Tambah tingkat dan isi kode, nama tampilan, dan urutan.',
              'Gunakan menu Ubah untuk mengganti nama tampilan atau urutan.',
            ],
          },
          {
            heading: 'Yang perlu diperhatikan',
            body: 'Menu ini hanya muncul bagi pemegang izin kelola sekolah (Admin sekolah dan Operator). Kode tingkat tidak bisa diubah setelah dibuat, dan tingkat yang masih dipakai kelas, tarif, atau periode SPMB tidak bisa dihapus. Pengaturan berlaku per unit sekolah.',
          },
        ],
      },
      en: {
        title: 'School settings',
        summary:
          'Set the time zone, school days, semester names, default lesson period, and the list of class levels for one school unit.',
        sections: [
          {
            heading: 'Time zone',
            body: 'The time zone is the basis for dates and times across the app, including attendance, invoices, messages, and admissions. Changing it does not alter old data, only how days and times are counted from then on.',
            steps: [
              'Open the School settings menu.',
              'Pick the time zone; the current time in that zone is shown for comparison.',
              'Click Save.',
            ],
            href: '/school-settings',
          },
          {
            heading: 'School days and semesters',
            body: 'School days (Monday to Sunday, at least one) are used by the timetable and the academic calendar. Semester names (1 to 4, not empty or duplicated) are used when semesters are created automatically under Academic years, and semesters that already exist do not change.',
          },
          {
            heading: 'Default lesson period',
            body: 'Set the first lesson start time and the minutes per lesson (10 to 180 minutes). These only pre-fill the form when lesson periods are generated in the Timetable; existing periods do not change.',
          },
          {
            heading: 'Class levels',
            body: 'The list of levels (e.g. 7, 8, 9 or X, XI, XII) is used for classes, tuition rates, and admission periods so they are written consistently. While the list is empty, levels there can be typed freely.',
            steps: [
              'If the list is still empty, pick a stage (SD/MI, SMP/MTs, SMA/MA, or SMK) and click Fill defaults.',
              'Or click Add a level and fill in the code, display name, and order.',
              'Use Edit to change the display name or order.',
            ],
          },
          {
            heading: 'Good to know',
            body: 'This menu appears only for holders of the manage school permission (School admin and Operator). A level code cannot be changed once created, and a level still used by classes, rates, or admission periods cannot be deleted. Settings apply per school unit.',
          },
        ],
      },
      su: {
        title: 'Setélan sakola',
        summary:
          'Atur zona waktu, poé éféktif, ngaran semester, jam pangajaran dasar, jeung daptar tingkat kelas pikeun hiji unit sakola.',
        sections: [
          {
            heading: 'Zona waktu',
            body: 'Zona waktu jadi dasar tanggal jeung jam di sakabéh aplikasi, kaasup absénsi, tagihan, pesen, jeung SPMB. Ngarobahna teu ngarobah data heubeul, ngan cara poé jeung jam diitung ka hareupna.',
            steps: [
              'Buka menu Setélan sakola.',
              'Pilih zona waktu; jam ayeuna di zona éta dipintonkeun minangka pamadaan.',
              'Klik Simpen.',
            ],
            href: '/school-settings',
          },
          {
            heading: 'Poé éféktif jeung semester',
            body: 'Poé éféktif (Senén nepi ka Minggu, sahenteuna sapoé) dipaké ku jadwal pangajaran jeung kalénder akadémik. Ngaran semester (1 nepi ka 4, teu meunang kosong atawa sarua) dipaké waktu nyieun semester sacara otomatis dina Taun pangajaran, sarta semester nu geus dijieun teu robah.',
          },
          {
            heading: 'Jam pangajaran dasar',
            body: 'Eusian jam pangajaran kahiji jeung menit per jam pangajaran (10 nepi ka 180 menit). Nilai ieu ngan jadi eusian awal waktu nyieun jam pangajaran otomatis dina Jadwal; jam nu geus aya teu robah.',
          },
          {
            heading: 'Tingkat kelas',
            body: 'Daptar tingkat (upamana 7, 8, 9 atawa X, XI, XII) dipaké dina kelas, tarif SPP, jeung périodeu SPMB sangkan panulisanana sarua. Salila daptar kosong, tingkat didinya meunang diketik bébas.',
            steps: [
              'Lamun daptar masih kosong, pilih jenjang (SD/MI, SMP/MTs, SMA/MA, atawa SMK) tuluy klik Eusian dasar.',
              'Atawa klik Tambih tingkat tuluy eusian kode, ngaran tampilan, jeung urutan.',
              'Anggo menu Robah pikeun ngaganti ngaran tampilan atawa urutan.',
            ],
          },
          {
            heading: 'Nu kudu diperhatikeun',
            body: 'Menu ieu ngan némbongan pikeun nu boga idin ngatur sakola (Admin sakola jeung Operator). Kode tingkat teu bisa dirobah sanggeus dijieun, sarta tingkat nu masih dipaké ku kelas, tarif, atawa périodeu SPMB teu bisa dipupus. Setélan lumaku per unit sakola.',
          },
        ],
      },
    },
  },
  {
    slug: 'attendance',
    icon: 'clipboard',
    tone: 'amber',
    module: 'attendance',
    text: {
      id: {
        title: 'Absensi: rekap, per jam, dan pengaturan',
        summary:
          'Pantau rekap kehadiran, isi absensi tiap jam pelajaran, dan atur jam serta kebijakan absensi.',
        sections: [
          {
            heading: 'Rekap absensi',
            body: 'Rekap menggabungkan kehadiran gerbang harian dan per jam pelajaran, termasuk bolos kelas (hadir di gerbang tetapi alpa di jam pelajaran). Rentang tanggal maksimal 366 hari.',
            steps: [
              'Buka menu Rekap absensi di kelompok Kehadiran.',
              'Pilih kelas (atau Semua kelas) serta tanggal Dari dan Sampai.',
              'Cari siswa atau periksa jumlah Hadir, Terlambat, Izin, Sakit, Alpa, dan Bolos kelas.',
              'Klik Ekspor Excel atau Ekspor PDF bila perlu.',
            ],
            href: '/attendance',
          },
          {
            heading: 'Absensi per jam',
            body: 'Guru mengisi kehadiran siswa pada jam pelajaran sesuai jadwal, dengan status Hadir, Izin, Sakit, atau Alpa. Kolom gerbang menunjukkan siswa yang sudah tap kartu, sehingga siswa yang hadir di gerbang tetapi tidak di kelas terlihat.',
            steps: [
              'Buka menu Absensi per jam dan pilih tanggal.',
              'Klik Isi absensi pada jam pelajaran Anda.',
              'Tandai status tiap siswa, atau klik Semua hadir lalu ubah yang berbeda.',
              'Klik Simpan absensi.',
            ],
            href: '/lessons',
          },
          {
            heading: 'Kebijakan dan jadwal piket',
            body: 'Di Pengaturan absensi, tab Kebijakan menentukan jam terlambat, jam mulai pulang, dan jeda tap ganda. Tab Jadwal piket menentukan guru piket per tanggal; guru piket dapat menggantikan guru yang berhalangan mengisi absensi per jam.',
            steps: [
              'Buka Pengaturan absensi, tab Kebijakan.',
              'Isi Terlambat setelah dan Pulang mulai; jam terlambat harus lebih awal dari jam pulang.',
              'Isi Jeda tap ganda (0 sampai 600 detik), lalu klik Simpan.',
              'Di tab Jadwal piket, pilih tanggal, centang guru yang bertugas, lalu klik Simpan.',
            ],
            href: '/attendance-settings',
          },
          {
            heading: 'Notifikasi ke wali',
            body: 'Pemberitahuan ke wali murid saat siswa tap kartu tidak diatur di Pengaturan absensi, tetapi di menu Notifikasi WhatsApp. Menu itu berasal dari modul Notifikasi WhatsApp yang terpisah.',
            href: '/messaging',
          },
          {
            heading: 'Yang perlu diperhatikan',
            body: 'Absensi per jam memakai jadwal pelajaran, jadi jadwal harus sudah terisi. Mengisinya hanya boleh oleh guru yang tertulis di jadwal, guru piket hari itu, atau pemegang izin atur absensi; tanggal yang belum tiba serta hari libur atau jeda ditolak. Guru tanpa izin atur absensi hanya melihat rekap kelas yang ia ajar.',
          },
        ],
      },
      en: {
        title: 'Attendance: report, per lesson, and settings',
        summary:
          'Follow the attendance report, record attendance every lesson, and set attendance times and policy.',
        sections: [
          {
            heading: 'Attendance report',
            body: 'The report combines daily gate attendance and per-lesson attendance, including class skipping (present at the gate but absent in a lesson). The date range is at most 366 days.',
            steps: [
              'Open the Attendance report menu in the Attendance group.',
              'Pick a class (or All classes) and the From and To dates.',
              'Search for a student or review the counts of Present, Late, Excused, Sick, Absent, and Skipped class.',
              'Click Export Excel or Export PDF if needed.',
            ],
            href: '/attendance',
          },
          {
            heading: 'Lesson attendance',
            body: 'Teachers record student attendance for each lesson on the timetable, with the status Present, Excused, Sick, or Absent. The gate column shows who already tapped a card, so students present at the gate but missing from class stand out.',
            steps: [
              'Open the Lesson attendance menu and pick the date.',
              'Click Record attendance on your lesson.',
              'Mark each student, or click Mark all present and then change the exceptions.',
              'Click Save attendance.',
            ],
            href: '/lessons',
          },
          {
            heading: 'Policy and duty roster',
            body: 'In Attendance settings, the Policy tab sets the late time, the departure start time, and the double-tap interval. The Duty roster tab sets the duty teachers per date; a duty teacher can cover a teacher who cannot record lesson attendance.',
            steps: [
              'Open Attendance settings, Policy tab.',
              'Fill in Late after and Departure from; the late time must be earlier than the departure time.',
              'Fill in the Double-tap interval (0 to 600 seconds), then click Save.',
              'In the Duty roster tab, pick a date, tick the teachers on duty, then click Save.',
            ],
            href: '/attendance-settings',
          },
          {
            heading: 'Notifications to guardians',
            body: 'Messages to guardians when a student taps a card are not set in Attendance settings but in the WhatsApp notifications menu. That menu belongs to the separate WhatsApp notifications module.',
            href: '/messaging',
          },
          {
            heading: 'Good to know',
            body: 'Lesson attendance uses the timetable, so the timetable must already be filled in. Only the teacher on the timetable, that day duty teacher, or a holder of the configure attendance permission may record it; future dates and holidays or breaks are rejected. A teacher without the configure attendance permission sees the report only for classes they teach.',
          },
        ],
      },
      su: {
        title: 'Absénsi: rékap, per jam, jeung pangaturan',
        summary:
          'Titénan rékap kahadiran, eusian absénsi unggal jam pangajaran, jeung atur jam sarta kawijakan absénsi.',
        sections: [
          {
            heading: 'Rékap absénsi',
            body: 'Rékap ngahijikeun kahadiran gerbang poéan jeung per jam pangajaran, kaasup bolos kelas (hadir di gerbang tapi alfa dina jam pangajaran). Rentang tanggal pangpangna 366 poé.',
            steps: [
              'Buka menu Rékap absénsi dina kelompok Kahadiran.',
              'Pilih kelas (atawa Sadaya kelas) sarta tanggal Ti jeung Nepi ka.',
              'Teangan murid atawa pariksa jumlah Hadir, Telat, Idin, Gering, Alfa, jeung Bolos kelas.',
              'Klik Ékspor Excel atawa Ékspor PDF lamun perlu.',
            ],
            href: '/attendance',
          },
          {
            heading: 'Absénsi per jam',
            body: 'Guru ngeusian kahadiran murid dina jam pangajaran luyu jeung jadwal, kalayan status Hadir, Idin, Gering, atawa Alfa. Kolom gerbang nuduhkeun murid nu geus tap kartu, jadi murid nu hadir di gerbang tapi teu aya di kelas kaciri.',
            steps: [
              'Buka menu Absénsi per jam tuluy pilih tanggal.',
              'Klik Eusian absénsi dina jam pangajaran Anjeun.',
              'Tandaan status unggal murid, atawa klik Sadayana hadir tuluy robah nu béda.',
              'Klik Simpen absénsi.',
            ],
            href: '/lessons',
          },
          {
            heading: 'Kawijakan jeung jadwal piket',
            body: 'Dina Pangaturan absénsi, tab Kawijakan nangtukeun jam telat, jam mimiti mulih, jeung jeda tap ganda. Tab Jadwal piket nangtukeun guru piket per tanggal; guru piket bisa ngagantikeun guru nu halangan ngeusian absénsi per jam.',
            steps: [
              'Buka Pangaturan absénsi, tab Kawijakan.',
              'Eusian Telat sanggeus jeung Mulih mimiti; jam telat kudu leuwih awal batan jam mulih.',
              'Eusian Jeda tap ganda (0 nepi ka 600 detik), tuluy klik Simpen.',
              'Dina tab Jadwal piket, pilih tanggal, centang guru nu keur tugas, tuluy klik Simpen.',
            ],
            href: '/attendance-settings',
          },
          {
            heading: 'Béwara ka wali',
            body: 'Béwara ka wali murid waktu murid tap kartu teu diatur dina Pangaturan absénsi, tapi dina menu Béwara WhatsApp. Menu éta asalna tina modul Béwara WhatsApp nu misah.',
            href: '/messaging',
          },
          {
            heading: 'Nu kudu diperhatikeun',
            body: 'Absénsi per jam maké jadwal pangajaran, jadi jadwal kudu geus kaeusian. Nu meunang ngeusianana ngan guru nu kacatet dina jadwal, guru piket poé éta, atawa nu boga idin ngatur absénsi; tanggal nu acan datang jeung poé libur atawa jeda ditolak. Guru tanpa idin ngatur absénsi ngan ningali rékap kelas nu diajarna.',
          },
        ],
      },
    },
  },
  {
    slug: 'rfid-gate',
    icon: 'scan',
    tone: 'teal',
    module: 'attendance',
    text: {
      id: {
        title: 'Kartu RFID, kiosk, dan gerbang',
        summary: 'Daftarkan kartu siswa, pasang kiosk di gerbang, dan pantau tap masuk serta pulang.',
        sections: [
          {
            heading: 'Mendaftarkan kartu',
            body: 'Menu Kartu RFID (izin atur absensi) menampilkan kartu terdaftar dan jumlah siswa aktif tanpa kartu. Kode kartu adalah UID dari pembaca, disimpan dalam huruf besar, minimal 4 karakter, dan tidak boleh sama dengan kartu siswa lain.',
            steps: [
              'Satu per satu: klik Tambah kartu, cari dan pilih siswa, tempelkan kartu pada pembaca, lalu klik Buat.',
              'Per kelas: klik Daftar cepat, pilih kelas, lalu tempelkan kartu satu per satu sesuai siswa yang disorot (Lewati atau Batalkan terakhir bila perlu).',
              'Banyak sekaligus: klik Impor Excel, unduh templat berisi NIS dan Kode kartu, isi, lalu unggah (maksimal 1000 baris).',
              'Hasil impor bersifat sebagian: baris yang gagal ditampilkan beserta alasannya, sedangkan baris lain tetap tersimpan.',
            ],
            href: '/attendance/cards',
          },
          {
            heading: 'Perangkat kiosk dan kunci',
            body: 'Setiap tablet atau PC kiosk di gerbang memiliki kunci perangkat sendiri. Kunci lengkap hanya tampil sekali saat dibuat atau diganti.',
            steps: [
              'Buka Pengaturan absensi, tab Perangkat, lalu klik Tambah perangkat.',
              'Beri nama (mis. Gerbang utama) dan klik Buat.',
              'Salin kunci perangkat yang tampil; kunci tidak akan ditampilkan lagi.',
              'Di perangkat gerbang, buka halaman kiosk dan tempel kunci itu.',
              'Gunakan menu kartu perangkat untuk Nonaktifkan, Ganti kunci, atau Hapus. Kunci lama langsung tidak berlaku setelah diganti.',
            ],
            href: '/attendance-settings',
          },
          {
            heading: 'Satu pembaca untuk beberapa unit',
            body: 'Secara bawaan satu perangkat hanya melayani sekolah tempat ia dibuat. Bila lembaga punya beberapa unit sekolah, satu pembaca bisa melayani beberapa jenjang sekaligus.',
            steps: [
              'Buka tab Perangkat lalu pilih Atur jangkauan pada perangkat (atau centang unit saat Tambah perangkat).',
              'Centang unit yang ikut dilayani; hanya unit lembaga yang sama, aktif, bermodul Absensi, dan tempat Anda juga berhak mengatur absensi yang tampil.',
              'Simpan. Nama unit tampil di layar kiosk dan kartu tiap siswa tetap tercatat di unitnya sendiri.',
            ],
          },
          {
            heading: 'Layar kiosk',
            body: 'Pembaca RFID USB bekerja seperti papan ketik, jadi cukup tempelkan kartu pada pembaca. Layar menampilkan Selamat datang, Terlambat, atau Sampai jumpa beserta nama dan kelas siswa, lima tap terbaru, jam, dan tombol layar penuh. Bila jaringan putus, tap disimpan di perangkat dan dikirim ulang dengan waktu aslinya saat jaringan kembali.',
            href: '/kiosk',
          },
          {
            heading: 'Gerbang & piket',
            body: 'Menu Gerbang & piket menampilkan kehadiran masuk dan pulang hari ini dari tap kartu, dan menyegarkan diri tiap 10 detik. Isinya ringkasan per status, tingkat hadir, aktivitas tap terbaru, dan daftar siswa yang bisa disaring per kelas serta dicari.',
            href: '/gate',
          },
          {
            heading: 'Yang perlu diperhatikan',
            body: 'Tap sebelum jam pulang dihitung masuk dan sesudahnya dihitung pulang; tap masuk setelah batas terlambat ditandai terlambat, dan tap berulang dalam jeda diabaikan. Kartu tidak dikenal, hari libur, siswa tidak aktif, serta kartu yang sama terdaftar di dua unit pada perangkat multi-unit ditolak. Perangkat yang sudah pernah mencatat tap tidak bisa dihapus; nonaktifkan saja.',
          },
        ],
      },
      en: {
        title: 'RFID cards, kiosk, and the gate',
        summary:
          'Register student cards, set up the kiosk at the gate, and follow arrival and departure taps.',
        sections: [
          {
            heading: 'Registering cards',
            body: 'The RFID cards menu (configure attendance permission) shows registered cards and the number of active students without a card. The card code is the UID from the reader, stored in capital letters, at least 4 characters, and must not match another student card.',
            steps: [
              'One by one: click Add card, search and pick the student, place the card on the reader, then click Create.',
              'By class: click Quick registration, pick the class, then place cards one at a time for the highlighted student (Skip or Undo last if needed).',
              'Many at once: click Import from Excel, download the template with NIS and Card code, fill it in, then upload (at most 1000 rows).',
              'An import is partial: failed rows are listed with the reason, while the other rows stay saved.',
            ],
            href: '/attendance/cards',
          },
          {
            heading: 'Kiosk devices and keys',
            body: 'Every tablet or kiosk PC at the gate has its own device key. The full key is shown only once, when it is created or replaced.',
            steps: [
              'Open Attendance settings, Devices tab, then click Add device.',
              'Give it a name (e.g. Main gate) and click Create.',
              'Copy the device key shown; it will not be shown again.',
              'On the gate device, open the kiosk page and paste the key.',
              'Use the device card menu to Deactivate, Replace key, or Delete. The old key stops working as soon as it is replaced.',
            ],
            href: '/attendance-settings',
          },
          {
            heading: 'One reader for several units',
            body: 'By default a device serves only the school where it was created. When the institution has several school units, one reader can serve several levels at once.',
            steps: [
              'Open the Devices tab and choose Set scope on the device (or tick units when adding the device).',
              'Tick the units to serve; only units of the same institution that are active, have the Attendance module, and where you may also configure attendance are listed.',
              'Save. The unit name shows on the kiosk screen and each student card stays recorded in its own unit.',
            ],
          },
          {
            heading: 'Kiosk screen',
            body: 'A USB RFID reader works like a keyboard, so just place the card on the reader. The screen shows Welcome, Late, or Goodbye with the student name and class, the five most recent taps, the clock, and a fullscreen button. When the network drops, taps are kept on the device and sent again with their original time once it is back.',
            href: '/kiosk',
          },
          {
            heading: 'Gate & duty',
            body: 'The Gate & duty menu shows today arrivals and departures from card taps and refreshes itself every 10 seconds. It contains a summary per status, the attendance rate, the latest tap activity, and a student list that can be filtered by class and searched.',
            href: '/gate',
          },
          {
            heading: 'Good to know',
            body: 'A tap before the departure time counts as arrival and after it counts as departure; an arrival tap after the late cutoff is marked late, and repeated taps within the interval are ignored. Unknown cards, holidays, inactive students, and a card registered in two units on a multi-unit device are rejected. A device that has recorded taps cannot be deleted; deactivate it instead.',
          },
        ],
      },
      su: {
        title: 'Kartu RFID, kiosk, jeung gerbang',
        summary: 'Daptarkeun kartu murid, pasang kiosk di gerbang, jeung titénan tap asup sarta mulih.',
        sections: [
          {
            heading: 'Ngadaptarkeun kartu',
            body: 'Menu Kartu RFID (idin ngatur absénsi) nuduhkeun kartu nu geus kadaptar jeung jumlah murid aktip nu acan boga kartu. Kode kartu nyaéta UID tina pamaca, disimpen dina hurup gedé, sahenteuna 4 karakter, sarta teu meunang sarua jeung kartu murid séjén.',
            steps: [
              'Hiji-hiji: klik Tambah kartu, teangan jeung pilih murid, tempelkeun kartu kana pamaca, tuluy klik Jieun.',
              'Per kelas: klik Daptar gancang, pilih kelas, tuluy tempelkeun kartu hiji-hiji luyu jeung murid nu disorot (Lewat atawa Batalkeun nu pandeuri lamun perlu).',
              'Réa sakaligus: klik Impor Excel, unduh templat nu ngandung NIS jeung Kode kartu, eusian, tuluy unggah (pangpangna 1000 baris).',
              'Hasil impor sipatna sawaréh: baris nu gagal dipintonkeun jeung alesanana, sedengkeun baris séjén tetep disimpen.',
            ],
            href: '/attendance/cards',
          },
          {
            heading: 'Parangkat kiosk jeung konci',
            body: 'Unggal tablét atawa PC kiosk di gerbang boga konci parangkat sorangan. Konci lengkep ngan némbongan sakali, waktu dijieun atawa diganti.',
            steps: [
              'Buka Pangaturan absénsi, tab Parangkat, tuluy klik Tambah parangkat.',
              'Pasihan ngaran (upamana Gerbang utama) tuluy klik Jieun.',
              'Salin konci parangkat nu kaluar; konci moal dipintonkeun deui.',
              'Dina parangkat gerbang, buka kaca kiosk tuluy tempelkeun konci éta.',
              'Anggo menu kartu parangkat pikeun Nonaktipkeun, Ganti konci, atawa Hapus. Konci heubeul langsung teu lumaku sanggeus diganti.',
            ],
            href: '/attendance-settings',
          },
          {
            heading: 'Hiji pamaca pikeun sababaraha unit',
            body: 'Sacara dasar hiji parangkat ngan ngalayanan sakola tempat dijieunna. Lamun lembaga boga sababaraha unit sakola, hiji pamaca bisa ngalayanan sababaraha jenjang sakaligus.',
            steps: [
              'Buka tab Parangkat tuluy pilih Atur jangkauan dina parangkat (atawa centang unit waktu Tambah parangkat).',
              'Centang unit nu milu dilayanan; ngan unit lembaga nu sarua, aktip, boga modul Absénsi, jeung nu Anjeun ogé boga idin ngatur absénsi nu kaciri.',
              'Simpen. Ngaran unit kaciri dina layar kiosk jeung kartu unggal murid tetep kacatet dina unitna sorangan.',
            ],
          },
          {
            heading: 'Layar kiosk',
            body: 'Pamaca RFID USB gawéna siga papan ketik, jadi cukup tempelkeun kartu kana pamaca. Layar nuduhkeun Wilujeng sumping, Telat, atawa Dugi ka patepang jeung ngaran sarta kelas murid, lima tap panungtung, jam, jeung tombol layar pinuh. Lamun jaringan potong, tap disimpen dina parangkat tuluy dikirim deui jeung waktu aslina saparantos jaringan balik.',
            href: '/kiosk',
          },
          {
            heading: 'Gerbang & piket',
            body: 'Menu Gerbang & piket nuduhkeun kahadiran asup jeung mulih poé ieu tina tap kartu, sarta nyegerkeun diri unggal 10 detik. Eusina rangkuman per status, tingkat kahadiran, kagiatan tap panungtung, jeung daptar murid nu bisa disaring per kelas sarta diteangan.',
            href: '/gate',
          },
          {
            heading: 'Nu kudu diperhatikeun',
            body: 'Tap saméméh jam mulih diitung asup sarta sanggeusna diitung mulih; tap asup sanggeus wates telat dicirian telat, sarta tap bola-bali dina jeda diabaikeun. Kartu teu dikenal, poé libur, murid teu aktip, jeung kartu nu sarua kadaptar di dua unit dina parangkat multi-unit ditolak. Parangkat nu geus kungsi nyatet tap teu bisa dipupus; nonaktipkeun waé.',
          },
        ],
      },
    },
  },
  {
    slug: 'schedule',
    icon: 'calendar',
    tone: 'sky',
    module: 'schedule',
    text: {
      id: {
        title: 'Jadwal pelajaran',
        summary: 'Atur jam pelajaran lalu isi jadwal tiap kelas; lihat per kelas atau per guru.',
        sections: [
          {
            heading: 'Mengatur jam pelajaran',
            body: 'Jam pelajaran adalah nomor dan rentang waktu tiap pelajaran. Bila belum ada, buat otomatis (1 sampai 14 jam, 10 sampai 120 menit per jam, istirahat opsional) dengan isian awal dari Pengaturan sekolah, atau tambah satu per satu.',
            steps: [
              'Buka menu Jadwal pelajaran lalu Jam pelajaran.',
              'Isi Mulai, Jumlah jam, Menit per jam, dan Istirahat setelah jam ke- bila ada.',
              'Klik Buat otomatis.',
              'Untuk menambah satu jam, isi Nomor, Mulai, dan Selesai lalu klik Tambah jam.',
            ],
            href: '/schedule',
          },
          {
            heading: 'Mengisi jadwal kelas',
            body: 'Tiap sel jadwal berisi mata pelajaran dan gurunya. Gurunya otomatis guru pengampu mata pelajaran itu di kelas tersebut, jadi tetapkan dulu di halaman Kelas.',
            steps: [
              'Pilih tampilan Per kelas lalu pilih kelasnya.',
              'Klik sel pada hari dan jam yang dikehendaki (Isi pelajaran).',
              'Pilih mata pelajaran; hanya yang sudah punya guru pengampu di kelas itu yang muncul.',
              'Klik Simpan. Klik Kosongkan untuk menghapus isi sel.',
            ],
          },
          {
            heading: 'Melihat per guru',
            body: 'Tampilan Per guru menunjukkan jadwal mengajar satu guru lintas kelas. Hari yang tampil mengikuti Pengaturan sekolah, dan absensi per jam pelajaran memakai jadwal ini.',
          },
          {
            heading: 'Yang perlu diperhatikan',
            body: 'Seorang guru tidak bisa mengajar di dua kelas pada hari dan jam yang sama; jadwal bentrok ditolak. Jam pelajaran yang sudah dipakai di jadwal tidak bisa dihapus, dan pembuatan otomatis ditolak bila sudah ada jam pelajaran. Mengubah jadwal butuh izin kelola jadwal (Kurikulum, Operator, Admin sekolah); peran lain hanya melihat.',
          },
        ],
      },
      en: {
        title: 'Timetable',
        summary: 'Set up lesson periods, then fill in each class timetable; view it by class or by teacher.',
        sections: [
          {
            heading: 'Setting lesson periods',
            body: 'Lesson periods are the number and time range of each lesson. If none exist yet, generate them (1 to 14 periods, 10 to 120 minutes each, optional break) with defaults from School settings, or add them one by one.',
            steps: [
              'Open the Timetable menu, then Lesson periods.',
              'Fill in Start, Number of periods, Minutes per period, and Break after period if any.',
              'Click Generate.',
              'To add a single period, fill in Number, Start, and End, then click Add period.',
            ],
            href: '/schedule',
          },
          {
            heading: 'Filling in a class timetable',
            body: 'Each timetable cell holds a subject and its teacher. The teacher is automatically the one assigned to that subject in that class, so assign them on the Classes page first.',
            steps: [
              'Choose the By class view and pick the class.',
              'Click the cell for the day and period you want (Add lesson).',
              'Pick the subject; only subjects that already have an assigned teacher in that class appear.',
              'Click Save. Click Clear to empty the cell.',
            ],
          },
          {
            heading: 'Viewing by teacher',
            body: 'The By teacher view shows the teaching timetable of one teacher across classes. The days shown follow School settings, and lesson attendance uses this timetable.',
          },
          {
            heading: 'Good to know',
            body: 'A teacher cannot teach two classes at the same day and period; a clashing entry is rejected. A period already used in the timetable cannot be deleted, and automatic generation is refused when periods already exist. Changing the timetable needs the manage timetable permission (Curriculum, Operator, School admin); other roles can only view.',
          },
        ],
      },
      su: {
        title: 'Jadwal pangajaran',
        summary: 'Atur jam pangajaran tuluy eusian jadwal unggal kelas; tingali per kelas atawa per guru.',
        sections: [
          {
            heading: 'Ngatur jam pangajaran',
            body: 'Jam pangajaran nyaéta nomer jeung rentang waktu unggal pangajaran. Lamun acan aya, jieun otomatis (1 nepi ka 14 jam, 10 nepi ka 120 menit per jam, istirahat opsional) kalayan eusian awal tina Setélan sakola, atawa tambihan hiji-hiji.',
            steps: [
              'Buka menu Jadwal pangajaran tuluy Jam pangajaran.',
              'Eusian Mimiti, Jumlah jam, Menit per jam, jeung Istirahat sanggeus jam ka- lamun aya.',
              'Klik Jieun otomatis.',
              'Pikeun nambah hiji jam, eusian Nomer, Mimiti, jeung Réngsé tuluy klik Tambih jam.',
            ],
            href: '/schedule',
          },
          {
            heading: 'Ngeusian jadwal kelas',
            body: 'Unggal sél jadwal ngandung mata pelajaran jeung gurunya. Gurunya otomatis guru pangampu mata pelajaran éta di kelas éta, jadi tetepkeun heula dina kaca Kelas.',
            steps: [
              'Pilih témbongan Per kelas tuluy pilih kelasna.',
              'Klik sél dina poé jeung jam nu dipikahayang (Eusian pelajaran).',
              'Pilih mata pelajaran; ngan nu geus boga guru pangampu di kelas éta nu kaluar.',
              'Klik Simpen. Klik Kosongkeun pikeun mupus eusi sél.',
            ],
          },
          {
            heading: 'Ningali per guru',
            body: 'Témbongan Per guru nuduhkeun jadwal ngajar hiji guru di sakabéh kelas. Poé nu kaciri nuturkeun Setélan sakola, sarta absénsi per jam pangajaran maké jadwal ieu.',
          },
          {
            heading: 'Nu kudu diperhatikeun',
            body: 'Hiji guru teu bisa ngajar di dua kelas dina poé jeung jam nu sarua; jadwal nu bentrok ditolak. Jam pangajaran nu geus dipaké dina jadwal teu bisa dipupus, sarta pembuatan otomatis ditolak lamun jam pangajaran geus aya. Ngarobah jadwal merlukeun idin ngatur jadwal (Kurikulum, Operator, Admin sakola); peran séjén ngan bisa ningali.',
          },
        ],
      },
    },
  },
  {
    slug: 'members-roles',
    icon: 'shield',
    tone: 'rose',
    text: {
      id: {
        title: 'Anggota, peran, dan kata sandi',
        summary:
          'Undang anggota lewat email, atur peran dan izin, serta pulihkan kata sandi dengan kode OTP.',
        sections: [
          {
            heading: 'Anggota sekolah',
            body: 'Izin seseorang adalah gabungan semua perannya di unit sekolah ini. Daftar bisa dicari menurut nama atau email dan disaring menurut status atau peran.',
            steps: [
              'Buka menu Anggota di kelompok Pengguna dan akses.',
              'Klik Ubah peran pada menu baris anggota untuk mengganti perannya, lalu Simpan.',
              'Pilih Nonaktifkan untuk mencabut seluruh izin anggota sementara; Aktifkan untuk mengembalikannya.',
            ],
            href: '/members',
          },
          {
            heading: 'Mengundang lewat email',
            body: 'Undangan berupa tautan yang dikirim ke email dan berlaku 7 hari. Orang yang belum punya akun membuatnya saat menerima, dan harus memakai email yang sama dengan yang diundang.',
            steps: [
              'Klik Undang anggota.',
              'Isi email dan pilih minimal satu peran.',
              'Klik Kirim undangan.',
              'Pantau di Undangan menunggu; gunakan Kirim ulang atau Cabut bila perlu.',
            ],
          },
          {
            heading: 'Peran dan izin',
            body: 'Peran adalah kumpulan izin, dan perubahan berlaku segera untuk semua pemegangnya. Peran bawaan (Admin sekolah, Kepala sekolah, Kurikulum, Bendahara, Operator, Guru) ada di setiap unit; peran kustom dibuat per unit sekolah dan tidak terbawa ke unit lain.',
            steps: [
              'Buka menu Peran.',
              'Klik Buat peran kustom lalu isi nama peran.',
              'Centang izin per area (Lihat, Kelola, dan seterusnya); minimal satu izin.',
              'Klik Buat peran, lalu beri peran itu ke anggota lewat menu Anggota.',
            ],
            href: '/roles',
          },
          {
            heading: 'Lupa kata sandi',
            body: 'Pemulihan memakai kode OTP 6 digit yang dikirim ke email. Kode berlaku 10 menit, hanya sekali pakai, dan hangus setelah 3 kali salah. Sistem tetap menjawab berhasil untuk email yang tidak terdaftar, jadi keberadaan akun tidak terbongkar.',
            steps: [
              'Di halaman masuk, klik tautan lupa kata sandi, atau buka halaman /forgot-password.',
              'Isi email lalu klik kirim kode.',
              'Isi kode 6 digit dari email, lalu kata sandi baru (minimal 12 karakter) dua kali.',
              'Bila kode belum datang atau hangus, klik kirim ulang (tersedia setelah 60 detik).',
              'Setelah berhasil, semua sesi lama otomatis keluar; masuk lagi dengan kata sandi baru.',
            ],
            href: '/forgot-password',
          },
          {
            heading: 'Yang perlu diperhatikan',
            body: 'Peran yang diberikan atau dibuat tidak boleh memiliki izin yang melebihi izin Anda sendiri. Unit sekolah selalu harus punya minimal satu admin aktif, dan Anda tidak bisa menonaktifkan diri sendiri. Peran bawaan tidak bisa dihapus (Admin sekolah juga tidak bisa diubah), dan peran kustom hanya bisa dihapus bila tidak dipegang siapa pun.',
          },
        ],
      },
      en: {
        title: 'Members, roles, and passwords',
        summary:
          'Invite members by email, manage roles and permissions, and recover a password with an OTP code.',
        sections: [
          {
            heading: 'School members',
            body: 'A person permissions are the combination of all their roles in this school unit. The list can be searched by name or email and filtered by status or role.',
            steps: [
              'Open the Members menu in the Users and access group.',
              'Click Edit roles in the member row menu to change their roles, then Save.',
              'Choose Deactivate to withdraw all permissions of a member for now; Activate to restore them.',
            ],
            href: '/members',
          },
          {
            heading: 'Inviting by email',
            body: 'An invitation is a link sent by email that is valid for 7 days. Someone without an account creates one when accepting, and must use the same email that was invited.',
            steps: [
              'Click Invite a member.',
              'Enter the email and pick at least one role.',
              'Click Send invitation.',
              'Follow it under Pending invitations; use Resend or Revoke if needed.',
            ],
          },
          {
            heading: 'Roles and permissions',
            body: 'A role is a set of permissions, and a change applies at once to everyone holding it. The built-in roles (School admin, Principal, Curriculum, Treasurer, Operator, Teacher) exist in every unit; custom roles are created per school unit and do not carry over to other units.',
            steps: [
              'Open the Roles menu.',
              'Click Create a custom role and enter the role name.',
              'Tick permissions per area (View, Manage, and so on); at least one.',
              'Click Create role, then give the role to members through the Members menu.',
            ],
            href: '/roles',
          },
          {
            heading: 'Forgot password',
            body: 'Recovery uses a 6-digit OTP code sent by email. The code is valid for 10 minutes, can be used once, and expires after 3 wrong attempts. The system still answers success for an unregistered email, so it does not reveal which accounts exist.',
            steps: [
              'On the sign-in page, click the forgot password link, or open the /forgot-password page.',
              'Enter your email and click send code.',
              'Enter the 6-digit code from the email, then the new password (at least 12 characters) twice.',
              'If the code has not arrived or has expired, click resend (available after 60 seconds).',
              'Once it succeeds, all old sessions are signed out; sign in again with the new password.',
            ],
            href: '/forgot-password',
          },
          {
            heading: 'Good to know',
            body: 'A role you give or create cannot hold more permissions than you have yourself. A school unit must always keep at least one active admin, and you cannot deactivate yourself. Built-in roles cannot be deleted (School admin cannot be edited either), and a custom role can only be deleted when nobody holds it.',
          },
        ],
      },
      su: {
        title: 'Anggota, peran, jeung kecap sandi',
        summary:
          'Uleman anggota ku surélék, atur peran jeung idin, sarta pulihkeun kecap sandi maké kode OTP.',
        sections: [
          {
            heading: 'Anggota sakola',
            body: 'Idin hiji jalma nyaéta gabungan sakabéh perana di unit sakola ieu. Daptar bisa diteangan ku ngaran atawa surélék sarta disaring nurutkeun status atawa peran.',
            steps: [
              'Buka menu Anggota dina kelompok Pamaké jeung aksés.',
              'Klik Robah peran dina menu baris anggota pikeun ngaganti perana, tuluy Simpen.',
              'Pilih Nonaktipkeun pikeun nyabut sakabéh idin anggota samentara; Aktifkeun pikeun mulangkeunana.',
            ],
            href: '/members',
          },
          {
            heading: 'Ngulemanan ku surélék',
            body: 'Uleman mangrupa tumbu nu dikirim ka surélék sarta lumaku 7 poé. Jalma nu acan boga akun nyieun akun waktu narima, sarta kudu maké surélék nu sarua jeung nu diulemanan.',
            steps: [
              'Klik Uleman anggota.',
              'Eusian surélék tuluy pilih sahenteuna hiji peran.',
              'Klik Kirim uleman.',
              'Titénan dina Uleman nu ngantosan; anggo Kirim deui atawa Cabut lamun perlu.',
            ],
          },
          {
            heading: 'Peran jeung idin',
            body: 'Peran nyaéta kumpulan idin, sarta parobahan langsung lumaku pikeun sakabéh nu nyepengna. Peran dasar (Admin sakola, Kapala sakola, Kurikulum, Bendahara, Operator, Guru) aya di unggal unit; peran kustom dijieun per unit sakola sarta teu kabawa ka unit séjén.',
            steps: [
              'Buka menu Peran.',
              'Klik Jieun peran kustom tuluy eusian ngaran peran.',
              'Centang idin per bagian (Tingali, Atur, jeung sajabana); sahenteuna hiji idin.',
              'Klik Jieun peran, tuluy pasihkeun peran éta ka anggota lewat menu Anggota.',
            ],
            href: '/roles',
          },
          {
            heading: 'Poho kecap sandi',
            body: 'Pamulihan maké kode OTP 6 angka nu dikirim ka surélék. Kode lumaku 10 menit, ngan bisa dipaké sakali, sarta hangus sanggeus 3 kali lepat. Sistem tetep ngajawab hasil keur surélék nu teu kadaptar, jadi ayana akun teu kabuka.',
            steps: [
              'Dina kaca lebet, klik tumbu poho kecap sandi, atawa buka kaca /forgot-password.',
              'Eusian surélék tuluy klik kirim kode.',
              'Eusian kode 6 angka tina surélék, tuluy kecap sandi anyar (sahenteuna 12 karakter) dua kali.',
              'Lamun kode acan datang atawa geus hangus, klik kirim deui (sayogi sanggeus 60 detik).',
              'Sanggeus hasil, sakabéh sési heubeul otomatis kaluar; lebet deui maké kecap sandi anyar.',
            ],
            href: '/forgot-password',
          },
          {
            heading: 'Nu kudu diperhatikeun',
            body: 'Peran nu dipasihkeun atawa dijieun teu meunang boga idin nu leuwih ti idin Anjeun sorangan. Unit sakola kudu salawasna boga sahenteuna hiji admin aktip, sarta Anjeun teu bisa nonaktipkeun diri sorangan. Peran dasar teu bisa dipupus (Admin sakola ogé teu bisa dirobah), sarta peran kustom ngan bisa dipupus lamun teu aya nu nyepengna.',
          },
        ],
      },
    },
  },
];
