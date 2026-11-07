import type { DocArticle } from '@/lib/docs-types';

/** Panduan kerja panel sekolah per modul: data induk, absensi, jadwal, pengguna. Ditulis untuk pengguna sekolah. Isi: id, en, su. */
export const CORE_DOCS: DocArticle[] = [
  {
    slug: 'students',
    icon: 'graduation',
    tone: 'sky',
    group: 'master',
    text: {
      id: {
        title: 'Mengelola data siswa dan wali',
        summary:
          'Tambah siswa, pindahkan ke kelas lain, atur wali murid, dan masukkan banyak siswa sekaligus lewat Excel.',
        forWho:
          'Admin sekolah dan operator TU yang mengurus data siswa; guru dan Kepala sekolah hanya bisa melihat.',
        sections: [
          {
            heading: 'Menambah siswa baru',
            body: 'Yang wajib diisi hanya nama dan jenis kelamin. NIS dan NISN boleh dikosongkan, tetapi kalau diisi tidak boleh sama dengan siswa lain. Data diri lain (tempat lahir, NIK 16 digit angka, agama, alamat, telepon/WA, email) boleh menyusul.',
            steps: [
              'Buka menu Siswa di kelompok Data induk, lalu klik Tambah siswa.',
              'Isi nama, NIS, NISN, jenis kelamin, tanggal lahir, agama, dan status.',
              'Pilih Kelas bila tahun ajaran aktif sudah punya kelas. Siswa baru boleh dibiarkan Tanpa kelas dulu.',
              'Isi kontak dan alamat bila ada, lalu klik Tambah.',
            ],
            tip: 'Belum punya semua data? Simpan dulu nama dan jenis kelamin, lalu lengkapi nanti lewat Ubah di menu baris siswa.',
            href: '/students',
          },
          {
            heading: 'Memindahkan siswa ke kelas lain atau mengubah statusnya',
            body: 'Kelas yang tampil adalah kelas pada tahun ajaran aktif. Status siswa ada empat: Aktif, Lulus, Pindah, dan Keluar.',
            steps: [
              'Cari siswa dengan kotak pencarian (nama, NIS, atau NISN).',
              'Klik menu baris siswa, lalu pilih Ubah.',
              'Ganti Kelas atau Status, lalu simpan.',
            ],
            warning:
              'Siswa yang sudah lulus atau pindah sebaiknya diubah statusnya, bukan dihapus. Hapus hanya menyembunyikan siswa dari daftar.',
          },
          {
            heading: 'Mengatur wali murid',
            body: 'Satu wali bisa dipakai bersama oleh beberapa anak, misalnya kakak dan adik. Bila data wali diubah, perubahan berlaku untuk semua anaknya.',
            steps: [
              'Klik menu baris siswa, lalu pilih Wali.',
              'Untuk wali baru, isi nama, hubungan (ayah, ibu, wali, atau lainnya), telepon, dan email, lalu klik Tambah wali.',
              'Untuk wali yang sudah ada (misalnya orang tua kakaknya), ketik minimal 2 huruf nama atau telepon pada Tautkan wali yang sudah ada, lalu klik Tautkan.',
              'Centang Jadikan wali utama, atau klik Jadikan utama pada wali yang sudah tertaut. Klik Lepas untuk melepas wali dari siswa itu.',
            ],
            tip: 'Untuk kakak-adik, jangan buat wali baru. Tautkan wali yang sudah ada supaya datanya tidak ganda.',
          },
          {
            heading: 'Mendaftarkan kartu untuk satu siswa',
            body: 'Bila modul Absensi aktif dan Anda boleh mengatur absensi, menu baris siswa memuat Kartu RFID. Menu ini membuka jendela khusus untuk mendaftarkan kode kartu siswa yang belum punya kartu, atau menghapus kartunya.',
            tip: 'Untuk mendaftarkan kartu satu kelas sekaligus, lebih cepat memakai menu Kartu RFID (lihat panduan Kartu RFID, kiosk, dan gerbang).',
          },
          {
            heading: 'Memasukkan dan mengunduh data lewat Excel',
            body: 'Berkas Excel memuat 20 kolom: data siswa, Kelas, lalu Wali 1 dan Wali 2 (masing-masing nama, hubungan, telepon/WA, dan email). Wali 1 menjadi wali utama. Wali dengan nomor telepon yang sama dipakai bersama, jadi kakak-adik tidak tercatat dobel.',
            steps: [
              'Klik Impor Excel di halaman Siswa, lalu unduh templat.',
              'Isi lembar Siswa mulai baris 2 tanpa mengubah judul kolom. Hanya Nama dan Jenis Kelamin (L atau P) yang wajib.',
              'Isi kolom Kelas persis seperti nama kelas di tahun ajaran aktif.',
              'Unggah berkas, lalu periksa pratinjau. Tidak ada yang tersimpan sebelum semua baris benar.',
              'Klik impor. Satu berkas paling banyak 1000 baris.',
            ],
            warning:
              'Bila ada satu baris yang salah, tidak ada siswa yang disimpan. Perbaiki baris yang ditandai lalu unggah ulang.',
            href: '/students/import',
          },
        ],
        faq: [
          {
            q: 'Kenapa kelas tidak muncul di daftar pilihan kelas?',
            a: 'Daftar kelas mengikuti tahun ajaran yang sedang aktif. Pastikan tahun ajaran sudah dibuat dan diaktifkan di menu Tahun ajaran, lalu kelasnya dibuat di menu Kelas.',
          },
          {
            q: 'NIS yang saya isi ditolak karena sudah dipakai. Bagaimana?',
            a: 'NIS dan NISN tidak boleh sama dengan siswa lain. Cari NIS itu di kotak pencarian untuk melihat siapa pemakainya. Bila itu data ganda, perbaiki salah satunya. Bila NIS belum ada, kosongkan dulu.',
          },
          {
            q: 'Impor Excel gagal terus. Apa yang harus saya periksa?',
            a: 'Periksa tiga hal: judul kolom tidak diubah, Jenis Kelamin hanya L atau P, dan isi Kelas sama persis dengan nama kelas tahun ajaran aktif. Lihat pratinjau untuk tahu baris mana yang salah.',
          },
          {
            q: 'Saya tidak melihat tombol Tambah siswa atau menu Wali. Kenapa?',
            a: 'Hanya Admin sekolah dan Operator yang bisa mengubah data siswa. Peran lain hanya bisa melihat. Minta Admin sekolah mengubah peran Anda di menu Anggota.',
          },
        ],
      },
      en: {
        title: 'Managing students and guardians',
        summary:
          'Add students, move them to another class, set up guardians, and bring in many students at once with Excel.',
        forWho:
          'School admins and administration staff who look after student records; teachers and the Principal can only view.',
        sections: [
          {
            heading: 'Adding a new student',
            body: 'Only the name and gender are required. NIS and NISN can stay empty, but if filled they must not match another student. The other details (birth place, 16-digit NIK, religion, address, phone/WhatsApp, email) can be added later.',
            steps: [
              'Open the Students menu in the Master data group, then click Add a student.',
              'Fill in the name, NIS, NISN, gender, birth date, religion, and status.',
              'Pick a Class if the active academic year already has classes. A new student can stay without a class for now.',
              'Fill in the contact and address if you have them, then click Add.',
            ],
            tip: 'Do not have all the details yet? Save the name and gender first, then complete the rest later with Edit in the student row menu.',
            href: '/students',
          },
          {
            heading: 'Moving a student to another class or changing the status',
            body: 'The classes shown are those of the active academic year. A student has one of four statuses: Active, Graduated, Transferred, and Dropped.',
            steps: [
              'Find the student with the search box (name, NIS, or NISN).',
              'Click the student row menu, then choose Edit.',
              'Change the Class or Status, then save.',
            ],
            warning:
              'For students who graduated or transferred, change the status instead of deleting. Deleting only hides the student from the list.',
          },
          {
            heading: 'Setting up guardians',
            body: 'One guardian can be shared by several children, for example siblings. When the guardian details change, the change applies to all of their children.',
            steps: [
              'Click the student row menu, then choose Guardians.',
              'For a new guardian, fill in the name, relation (father, mother, guardian, or other), phone, and email, then click Add guardian.',
              'For an existing guardian (for example the parent of an older sibling), type at least 2 letters of the name or phone under Link an existing guardian, then click Link.',
              'Tick Make primary guardian, or click Make primary on a linked guardian. Click Remove to detach a guardian from that student.',
            ],
            tip: 'For siblings, do not create a new guardian. Link the existing one so the details are not duplicated.',
          },
          {
            heading: 'Registering a card for one student',
            body: 'When the Attendance module is active and you may manage attendance, the student row menu includes RFID card. It opens a separate window to register the card code of a student who has no card yet, or to delete the card.',
            tip: 'To register the cards of a whole class, the RFID cards menu is faster (see the guide on RFID cards, kiosk, and the gate).',
          },
          {
            heading: 'Bringing in and downloading data with Excel',
            body: 'The Excel file has 20 columns: student details, Class, then Guardian 1 and Guardian 2 (each with name, relation, phone/WhatsApp, and email). Guardian 1 becomes the primary guardian. Guardians with the same phone number are shared, so siblings are not recorded twice.',
            steps: [
              'Click Import from Excel on the Students page, then download the template.',
              'Fill in the Siswa sheet from row 2 without changing the column titles. Only Nama (name) and Jenis Kelamin (gender, L or P) are required.',
              'Fill the Class column exactly like the class name in the active academic year.',
              'Upload the file and check the preview. Nothing is saved until every row is correct.',
              'Click import. One file holds at most 1000 rows.',
            ],
            warning: 'If even one row is wrong, no student is saved. Fix the marked rows and upload again.',
            href: '/students/import',
          },
        ],
        faq: [
          {
            q: 'Why does the class not appear in the class list?',
            a: 'The class list follows the active academic year. Make sure the academic year has been created and activated in the Academic years menu, and that the class exists in the Classes menu.',
          },
          {
            q: 'The NIS I entered is rejected because it is already used. What now?',
            a: 'NIS and NISN must not match another student. Search for that NIS to see who has it. If it is a duplicate record, fix one of them. If you do not have the NIS yet, leave it empty.',
          },
          {
            q: 'The Excel import keeps failing. What should I check?',
            a: 'Check three things: the column titles are unchanged, Jenis Kelamin is only L or P, and the Kelas value is exactly the class name of the active academic year. The preview shows which row is wrong.',
          },
          {
            q: 'I cannot see the Add a student button or the Guardians menu. Why?',
            a: 'Only School admin and Operator can change student records. Other roles can only view. Ask a School admin to change your role in the Members menu.',
          },
        ],
      },
      su: {
        title: 'Ngatur data murid jeung wali',
        summary:
          'Tambihan murid, pindahkeun ka kelas séjén, atur wali murid, sarta asupkeun loba murid sakaligus lewat Excel.',
        forWho:
          'Admin sakola jeung operator TU nu ngurus data murid; guru jeung Kapala sakola ngan bisa ningali.',
        sections: [
          {
            heading: 'Nambihan murid anyar',
            body: 'Nu wajib dieusian ngan ngaran jeung jenis kelamin. NIS jeung NISN meunang kosong, tapi lamun dieusian teu meunang sarua jeung murid séjén. Data diri séjénna (tempat lahir, NIK 16 angka, agama, alamat, telepon/WA, surélék) meunang nyusul.',
            steps: [
              'Buka menu Murid dina kelompok Data induk, tuluy klik Tambih murid.',
              'Eusian ngaran, NIS, NISN, jenis kelamin, tanggal lahir, agama, jeung status.',
              'Pilih Kelas lamun taun pangajaran aktip geus boga kelas. Murid anyar meunang dibiarkeun Tanpa kelas heula.',
              'Eusian kontak jeung alamat lamun aya, tuluy klik Tambih.',
            ],
            tip: 'Acan boga sakabéh data? Simpen heula ngaran jeung jenis kelamin, engké lengkepan lewat Robah dina menu baris murid.',
            href: '/students',
          },
          {
            heading: 'Mindahkeun murid ka kelas séjén atawa ngarobah statusna',
            body: 'Kelas nu kaciri nyaéta kelas dina taun pangajaran aktip. Status murid aya opat: Aktip, Lulus, Pindah, jeung Kaluar.',
            steps: [
              'Teangan murid ku kotak pamaluruhan (ngaran, NIS, atawa NISN).',
              'Klik menu baris murid, tuluy pilih Robah.',
              'Ganti Kelas atawa Status, tuluy simpen.',
            ],
            warning:
              'Murid nu geus lulus atawa pindah leuwih alus dirobah statusna, ulah dipupus. Pupus ngan nyumputkeun murid tina daptar.',
          },
          {
            heading: 'Ngatur wali murid',
            body: 'Hiji wali bisa dipaké babarengan ku sababaraha anak, upamana lanceuk jeung adi. Lamun data wali dirobah, parobahan lumaku pikeun sakabéh anakna.',
            steps: [
              'Klik menu baris murid, tuluy pilih Wali.',
              'Pikeun wali anyar, eusian ngaran, hubungan (bapa, indung, wali, atawa séjén), telepon, jeung surélék, tuluy klik Tambah wali.',
              'Pikeun wali nu geus aya (upamana kolot lanceukna), ketik sahenteuna 2 hurup ngaran atawa telepon dina Tumbu wali nu geus aya, tuluy klik Tumbu.',
              'Centang Jadikeun wali utama, atawa klik Jadikeun utama dina wali nu geus katumbu. Klik Lepas pikeun ngalepas wali tina murid éta.',
            ],
            tip: 'Pikeun lanceuk-adi, ulah nyieun wali anyar. Tumbu wali nu geus aya sangkan datana teu ganda.',
          },
          {
            heading: 'Ngadaptarkeun kartu pikeun hiji murid',
            body: 'Lamun modul Absénsi aktip jeung Anjeun meunang ngatur absénsi, menu baris murid ngandung Kartu RFID. Menu ieu muka jandela husus pikeun ngadaptarkeun kode kartu murid nu acan boga kartu, atawa mupus kartuna.',
            tip: 'Pikeun ngadaptarkeun kartu sakelas sakaligus, menu Kartu RFID leuwih gancang (tingali pituduh Kartu RFID, kiosk, jeung gerbang).',
          },
          {
            heading: 'Ngasupkeun jeung ngundeur data lewat Excel',
            body: 'Berkas Excel ngandung 20 kolom: data murid, Kelas, tuluy Wali 1 jeung Wali 2 (masing-masing ngaran, hubungan, telepon/WA, jeung surélék). Wali 1 jadi wali utama. Wali nu nomer teleponna sarua dipaké babarengan, jadi lanceuk-adi teu kacatet dua kali.',
            steps: [
              'Klik Impor Excel dina kaca Murid, tuluy unduh templat.',
              'Eusian lembar Siswa ti baris 2 tanpa ngarobah judul kolom. Ngan Nama jeung Jenis Kelamin (L atawa P) nu wajib.',
              'Eusian kolom Kelas persis siga ngaran kelas dina taun pangajaran aktip.',
              'Unggah berkas, tuluy pariksa pratinjau. Teu aya nu disimpen saméméh sakabéh baris bener.',
              'Klik impor. Hiji berkas pangpangna 1000 baris.',
            ],
            warning:
              'Lamun aya hiji baris nu lepat, teu aya murid nu disimpen. Bénerkeun baris nu ditandaan tuluy unggah deui.',
            href: '/students/import',
          },
        ],
        faq: [
          {
            q: 'Naha kelas teu kaciri dina daptar pilihan kelas?',
            a: 'Daptar kelas nuturkeun taun pangajaran nu keur aktip. Pastikeun taun pangajaran geus dijieun jeung diaktipkeun dina menu Taun pangajaran, tuluy kelasna dijieun dina menu Kelas.',
          },
          {
            q: 'NIS nu kuring eusian ditolak sabab geus dipaké. Kumaha?',
            a: 'NIS jeung NISN teu meunang sarua jeung murid séjén. Teangan NIS éta pikeun nyaho saha nu maké. Lamun data ganda, bénerkeun salah sahijina. Lamun NIS acan aya, kosongkeun heula.',
          },
          {
            q: 'Impor Excel gagal waé. Naon nu kudu dipariksa?',
            a: 'Pariksa tilu hal: judul kolom teu dirobah, Jenis Kelamin ngan L atawa P, jeung eusi Kelas persis sarua jeung ngaran kelas taun pangajaran aktip. Pratinjau nuduhkeun baris mana nu lepat.',
          },
          {
            q: 'Kuring teu ningali tombol Tambih murid atawa menu Wali. Naha?',
            a: 'Ngan Admin sakola jeung Operator nu bisa ngarobah data murid. Peran séjén ngan bisa ningali. Menta Admin sakola ngarobah peran Anjeun dina menu Anggota.',
          },
        ],
      },
    },
  },
  {
    slug: 'teachers',
    icon: 'users',
    tone: 'violet',
    group: 'master',
    text: {
      id: {
        title: 'Mengelola data guru dan akun login guru',
        summary:
          'Tambah guru, masukkan banyak guru dari Excel, dan hubungkan akun login supaya guru melihat kelasnya sendiri.',
        forWho:
          'Admin sekolah dan operator TU untuk data guru; menghubungkan akun login hanya bisa dilakukan Admin sekolah.',
        sections: [
          {
            heading: 'Menambah guru baru',
            body: 'Data guru terdiri dari nama, NIP, dan status Aktif atau Nonaktif. NIP boleh kosong, tetapi kalau diisi tidak boleh sama dengan guru lain.',
            steps: [
              'Buka menu Guru di kelompok Data induk.',
              'Klik Tambah guru.',
              'Isi nama, NIP, dan status.',
              'Simpan. Untuk mengubahnya nanti, klik baris guru.',
            ],
            tip: 'Gunakan kotak pencarian (nama atau NIP) dan saringan status untuk menemukan guru dengan cepat. Daftar juga bisa diekspor ke Excel.',
            href: '/teachers',
          },
          {
            heading: 'Memasukkan banyak guru dari Excel',
            body: 'Templat hanya berisi tiga kolom: Nama, NIP, dan Status (Aktif atau Nonaktif; kosong dianggap Aktif). Hanya Nama yang wajib, dan satu berkas paling banyak 1000 baris.',
            steps: [
              'Klik Impor Excel di halaman Guru, lalu unduh templat.',
              'Isi mulai baris 2 tanpa mengubah judul kolom, lalu unggah berkas.',
              'Periksa pratinjau, lalu klik impor.',
            ],
            warning:
              'Guru baru tersimpan hanya bila semua baris benar. Satu baris yang salah menahan semuanya.',
            href: '/teachers/import',
          },
          {
            heading: 'Menghubungkan guru dengan akun login',
            body: 'Setelah terhubung, sistem tahu guru mana yang sedang masuk, sehingga absensi dan nilai dibatasi ke kelas dan mata pelajaran yang ia ajar. Menu Akun login hanya muncul bagi Admin sekolah.',
            steps: [
              'Klik menu baris guru, lalu pilih Akun login.',
              'Kalau guru sudah punya akun di sekolah ini, pilih Tautkan akun yang ada, pilih namanya di Anggota sekolah, lalu klik Tautkan.',
              'Kalau belum, pilih Undang lewat email, isi Email guru, lalu klik Kirim undangan. Guru menerima tautan yang berlaku 7 hari dengan peran Guru, dan akunnya otomatis terhubung setelah undangan diterima.',
              'Untuk memutus hubungan, buka lagi Akun login lalu klik Lepas tautan. Data guru tetap ada.',
            ],
            tip: 'Satu akun hanya bisa dihubungkan ke satu guru. Bila nama tidak muncul di pilihan, akun itu mungkin sudah terhubung atau tidak aktif.',
          },
          {
            heading: 'Bila guru tidak mengajar lagi',
            body: 'Ubah status guru menjadi Nonaktif lewat Ubah. Datanya tetap tersimpan, hanya tidak dianggap mengajar. Penugasan guru ke kelas dan mata pelajaran diatur di halaman Kelas.',
            warning:
              'Guru yang masih ditugaskan mengajar suatu mata pelajaran tidak bisa dihapus. Nonaktifkan saja, atau lepas dulu penugasannya di halaman Kelas.',
          },
        ],
        faq: [
          {
            q: 'Kenapa menu Akun login tidak ada di baris guru?',
            a: 'Menu itu hanya untuk Admin sekolah. Operator bisa mengubah data guru tetapi tidak bisa menghubungkan akun. Minta Admin sekolah melakukannya.',
          },
          {
            q: 'Nama anggota yang ingin saya tautkan tidak muncul di pilihan. Bagaimana?',
            a: 'Pilihan hanya memuat anggota aktif yang belum terhubung ke guru lain. Periksa di menu Anggota apakah akunnya aktif. Bila orang itu belum punya akun, pakai Undang lewat email.',
          },
          {
            q: 'Guru sudah menerima undangan tetapi kelasnya belum muncul. Kenapa?',
            a: 'Pastikan guru sudah ditugaskan di halaman Kelas (Guru pengampu) untuk mata pelajaran yang ia ajar. Akun yang terhubung hanya mengenali guru; kelasnya ditentukan dari penugasan.',
          },
          {
            q: 'Guru tidak bisa dihapus. Apa yang harus saya lakukan?',
            a: 'Berarti guru itu masih ditugaskan mengajar. Buka halaman Kelas, lepas penugasannya pada menu Guru pengampu, lalu hapus. Atau cukup ubah statusnya menjadi Nonaktif.',
          },
        ],
      },
      en: {
        title: 'Managing teachers and teacher login accounts',
        summary:
          'Add teachers, bring in many teachers from Excel, and connect a login account so teachers see their own classes.',
        forWho:
          'School admins and administration staff for teacher records; only a School admin can connect a login account.',
        sections: [
          {
            heading: 'Adding a new teacher',
            body: 'A teacher record has a name, an NIP, and a status of Active or Inactive. The NIP can stay empty, but if filled it must not match another teacher.',
            steps: [
              'Open the Teachers menu in the Master data group.',
              'Click Add a teacher.',
              'Fill in the name, NIP, and status.',
              'Save. To change it later, click the teacher row.',
            ],
            tip: 'Use the search box (name or NIP) and the status filter to find a teacher quickly. The list can also be exported to Excel.',
            href: '/teachers',
          },
          {
            heading: 'Bringing in many teachers from Excel',
            body: 'The template has just three columns: Nama (name), NIP, and Status (Aktif or Nonaktif; empty counts as Aktif). Only the name is required, and one file holds at most 1000 rows.',
            steps: [
              'Click Import from Excel on the Teachers page, then download the template.',
              'Fill it in from row 2 without changing the column titles, then upload the file.',
              'Check the preview, then click import.',
            ],
            warning:
              'New teachers are saved only when every row is correct. One wrong row holds everything back.',
            href: '/teachers/import',
          },
          {
            heading: 'Connecting a teacher to a login account',
            body: 'Once connected, the system knows which teacher is signed in, so attendance and grades are limited to the classes and subjects that teacher teaches. The Login account menu appears only for a School admin.',
            steps: [
              'Click the teacher row menu, then choose Login account.',
              'If the teacher already has an account at this school, choose Link an existing account, pick the name under School member, then click Link.',
              'If not, choose Invite by email, fill in the Teacher email, then click Send invitation. The teacher gets a link valid for 7 days with the Teacher role, and the account connects automatically once the invitation is accepted.',
              'To disconnect, open Login account again and click Unlink. The teacher record stays.',
            ],
            tip: 'One account can be connected to only one teacher. If a name is missing from the choices, that account may already be connected or inactive.',
          },
          {
            heading: 'When a teacher no longer teaches',
            body: 'Change the teacher status to Inactive with Edit. The record is kept, but the teacher is no longer counted as teaching. Assigning teachers to classes and subjects is done on the Classes page.',
            warning:
              'A teacher who is still assigned to teach a subject cannot be deleted. Just deactivate them, or remove the assignment first on the Classes page.',
          },
        ],
        faq: [
          {
            q: 'Why is there no Login account menu on the teacher row?',
            a: 'That menu is only for a School admin. An Operator can edit teacher records but cannot connect accounts. Ask a School admin to do it.',
          },
          {
            q: 'The member I want to link is not in the choices. What now?',
            a: 'The choices only list active members who are not connected to another teacher. Check in the Members menu whether the account is active. If the person has no account yet, use Invite by email.',
          },
          {
            q: 'The teacher accepted the invitation but their classes do not show up. Why?',
            a: 'Make sure the teacher is assigned on the Classes page (Assigned teachers) for the subjects they teach. A connected account only identifies the teacher; the classes come from the assignments.',
          },
          {
            q: 'A teacher cannot be deleted. What should I do?',
            a: 'It means the teacher is still assigned to teach. Open the Classes page, remove the assignment under Assigned teachers, then delete. Or simply change the status to Inactive.',
          },
        ],
      },
      su: {
        title: 'Ngatur data guru jeung akun asup guru',
        summary:
          'Tambihan guru, asupkeun loba guru tina Excel, sarta sambungkeun akun asup sangkan guru ningali kelasna sorangan.',
        forWho:
          'Admin sakola jeung operator TU pikeun data guru; nyambungkeun akun asup ngan bisa dilakukeun ku Admin sakola.',
        sections: [
          {
            heading: 'Nambihan guru anyar',
            body: 'Data guru diwangun ku ngaran, NIP, jeung status Aktip atawa Nonaktip. NIP meunang kosong, tapi lamun dieusian teu meunang sarua jeung guru séjén.',
            steps: [
              'Buka menu Guru dina kelompok Data induk.',
              'Klik Tambih guru.',
              'Eusian ngaran, NIP, jeung status.',
              'Simpen. Pikeun ngarobahna engké, klik baris guru.',
            ],
            tip: 'Anggo kotak pamaluruhan (ngaran atawa NIP) jeung saringan status pikeun manggihan guru gancang. Daptar ogé bisa diékspor ka Excel.',
            href: '/teachers',
          },
          {
            heading: 'Ngasupkeun loba guru tina Excel',
            body: 'Templat ngan ngandung tilu kolom: Nama, NIP, jeung Status (Aktif atawa Nonaktif; kosong dianggap Aktif). Ngan Nama nu wajib, sarta hiji berkas pangpangna 1000 baris.',
            steps: [
              'Klik Impor Excel dina kaca Guru, tuluy unduh templat.',
              'Eusian ti baris 2 tanpa ngarobah judul kolom, tuluy unggah berkas.',
              'Pariksa pratinjau, tuluy klik impor.',
            ],
            warning:
              'Guru anyar disimpen ngan lamun sakabéh baris bener. Hiji baris nu lepat nahan sakabéhna.',
            href: '/teachers/import',
          },
          {
            heading: 'Nyambungkeun guru jeung akun asup',
            body: 'Sanggeus nyambung, sistem apal guru mana nu keur asup, jadi absénsi jeung nilai dibatesan kana kelas jeung mata pelajaran nu diajarna. Menu Akun asup ngan némbongan pikeun Admin sakola.',
            steps: [
              'Klik menu baris guru, tuluy pilih Akun asup.',
              'Lamun guru geus boga akun di sakola ieu, pilih Tautkeun akun nu aya, pilih ngaranna dina Anggota sakola, tuluy klik Tautkeun.',
              'Lamun acan, pilih Uleman ku surélék, eusian Surélék guru, tuluy klik Kirim uleman. Guru narima tumbu nu lumaku 7 poé kalayan peran Guru, sarta akunna otomatis nyambung sanggeus uleman ditarima.',
              'Pikeun megatkeun sambungan, buka deui Akun asup tuluy klik Pupus tautan. Data guru tetep aya.',
            ],
            tip: 'Hiji akun ngan bisa disambungkeun ka hiji guru. Lamun ngaran teu aya dina pilihan, akun éta bisa jadi geus nyambung atawa teu aktip.',
          },
          {
            heading: 'Lamun guru geus teu ngajar deui',
            body: 'Robah status guru jadi Nonaktip lewat Robah. Datana tetep disimpen, ngan teu dianggap ngajar. Panugasan guru kana kelas jeung mata pelajaran diatur dina kaca Kelas.',
            warning:
              'Guru nu masih ditugaskeun ngajar hiji mata pelajaran teu bisa dipupus. Nonaktipkeun waé, atawa lepas heula panugasanana dina kaca Kelas.',
          },
        ],
        faq: [
          {
            q: 'Naha menu Akun asup teu aya dina baris guru?',
            a: 'Menu éta ngan pikeun Admin sakola. Operator bisa ngarobah data guru tapi teu bisa nyambungkeun akun. Menta Admin sakola nyieunna.',
          },
          {
            q: 'Ngaran anggota nu rék ditautkeun teu aya dina pilihan. Kumaha?',
            a: 'Pilihan ngan ngandung anggota aktip nu acan nyambung ka guru séjén. Pariksa dina menu Anggota naha akunna aktip. Lamun jalmana acan boga akun, anggo Uleman ku surélék.',
          },
          {
            q: 'Guru geus narima uleman tapi kelasna acan kaciri. Naha?',
            a: 'Pastikeun guru geus ditugaskeun dina kaca Kelas (Guru pangampu) pikeun mata pelajaran nu diajarna. Akun nu nyambung ngan ngaweruhkeun guru; kelasna ditangtukeun ku panugasan.',
          },
          {
            q: 'Guru teu bisa dipupus. Naon nu kudu dilakukeun?',
            a: 'Hartina guru éta masih ditugaskeun ngajar. Buka kaca Kelas, lepas panugasanana dina Guru pangampu, tuluy pupus. Atawa cekap robah statusna jadi Nonaktip.',
          },
        ],
      },
    },
  },
  {
    slug: 'classes-years',
    icon: 'school',
    tone: 'emerald',
    group: 'master',
    text: {
      id: {
        title: 'Menyusun tahun ajaran, kelas, mata pelajaran, dan kalender',
        summary:
          'Siapkan tahun ajaran dan semester, buat kelas, tetapkan guru pengampu, dan isi kalender libur dan ujian.',
        forWho:
          'Admin sekolah, operator TU, dan staf Kurikulum yang menyiapkan struktur akademik setiap tahun ajaran.',
        sections: [
          {
            heading: 'Membuat tahun ajaran dan semester',
            body: 'Hanya satu tahun ajaran yang aktif pada satu waktu, dan itulah yang menentukan daftar kelas dan tempat siswa berada. Tahun ajaran pertama otomatis aktif.',
            steps: [
              'Buka menu Tahun ajaran, lalu klik Buat tahun ajaran.',
              'Isi nama yang belum pernah dipakai (misalnya 2026/2027) serta tanggal mulai dan selesai, lalu simpan.',
              'Buka bagian Semester pada tahun itu, lalu klik Buat Ganjil dan Genap atau Tambah semester.',
              'Klik Jadikan aktif pada tahun ajaran atau semester yang sedang berjalan.',
            ],
            warning:
              'Mengganti tahun ajaran aktif mengubah kelas yang tampil di seluruh aplikasi, dan penempatan siswa mengikutinya. Lakukan hanya saat tahun ajaran baru benar-benar dimulai.',
            href: '/academic-years',
          },
          {
            heading: 'Membuat kelas baru',
            body: 'Kelas dibuat untuk satu tahun ajaran, dan namanya tidak boleh sama dengan kelas lain di tahun itu. Jurusan boleh dikosongkan; gunakan hanya untuk sekolah yang punya jurusan atau peminatan.',
            steps: [
              'Buka menu Kelas, lalu pilih Tahun ajaran.',
              'Klik Tambah kelas.',
              'Isi nama dan tingkat (misalnya 7, X, atau Kelas 1), lalu pilih Jurusan dan Wali kelas bila ada.',
              'Simpan, lalu tempatkan siswa ke kelas lewat menu Siswa.',
            ],
            warning: 'Kelas tidak bisa dihapus selama masih ada siswa atau guru pengampu di dalamnya.',
            href: '/classes',
          },
          {
            heading: 'Menetapkan guru pengampu per mata pelajaran',
            body: 'Guru pengampu menentukan siapa yang mengajar suatu mata pelajaran di suatu kelas. Satu mata pelajaran di satu kelas hanya punya satu guru. Penetapan ini dibutuhkan sebelum menyusun jadwal.',
            steps: [
              'Di menu Kelas, klik menu baris kelas lalu pilih Guru pengampu.',
              'Pilih Mata pelajaran dan Guru, lalu klik Tetapkan.',
              'Klik Lepas bila ingin mengganti guru, lalu tetapkan guru yang baru.',
            ],
          },
          {
            heading: 'Menambah mata pelajaran',
            body: 'Setiap mata pelajaran punya kode dan nama, dan kode tidak boleh sama dengan yang lain di sekolah. Anda bisa menambahnya satu per satu, atau menyalin dari bank kurikulum. Mata pelajaran yang kodenya sudah ada akan dilewati, dan hasil salinan bebas diubah.',
            tip: 'Mulailah dari bank kurikulum lalu sesuaikan namanya. Cara ini lebih cepat daripada mengetik satu per satu.',
            href: '/subjects',
          },
          {
            heading: 'Mengisi kalender akademik',
            body: 'Kalender menyimpan acara per tahun ajaran dengan empat jenis: Libur, Jeda, Ujian, dan Kegiatan. Libur dan jeda mengurangi hari belajar efektif, sedangkan ujian dan kegiatan hanya penanda.',
            steps: [
              'Buka menu Kalender, lalu pilih tahun ajaran.',
              'Pilih hari belajar per pekan: 5 hari atau 6 hari.',
              'Klik Tambah acara, lalu isi jenis, judul, serta tanggal mulai dan selesai.',
              'Buka Tampilan tahunan dan PDF, lalu klik Unduh PDF bila ingin mencetak.',
            ],
            tip: 'Libur dan jeda berlaku untuk seluruh sekolah. Ujian dan kegiatan bisa untuk seluruh sekolah atau satu kelas saja.',
            href: '/calendar',
          },
        ],
        faq: [
          {
            q: 'Kenapa kelas tidak muncul di daftar?',
            a: 'Periksa Tahun ajaran yang dipilih di bagian atas menu Kelas. Kelas dibuat per tahun ajaran, jadi kelas tahun lalu tidak tampil di tahun yang baru. Buat kelas untuk tahun ajaran yang sedang dipilih.',
          },
          {
            q: 'Saya tidak bisa menghapus kelas. Kenapa?',
            a: 'Kelas yang masih punya siswa atau guru pengampu tidak bisa dihapus. Pindahkan siswanya lewat menu Siswa, lepas guru pengampunya, lalu hapus.',
          },
          {
            q: 'Nama tahun ajaran atau kode mata pelajaran ditolak. Bagaimana?',
            a: 'Nama tahun ajaran dan kode mata pelajaran harus berbeda dari yang sudah ada. Cari dulu di daftar. Kalau sudah ada, pakai yang itu atau beri nama atau kode lain.',
          },
          {
            q: 'Pilihan mata pelajaran di jadwal kosong. Apa yang kurang?',
            a: 'Jadwal hanya menampilkan mata pelajaran yang sudah punya guru pengampu di kelas itu. Buka menu Kelas, pilih Guru pengampu pada kelasnya, dan tetapkan gurunya.',
          },
        ],
      },
      en: {
        title: 'Setting up academic years, classes, subjects, and the calendar',
        summary:
          'Prepare the academic year and semesters, create classes, assign teachers, and fill in the holiday and exam calendar.',
        forWho:
          'School admins, administration staff, and Curriculum staff who prepare the academic structure each year.',
        sections: [
          {
            heading: 'Creating an academic year and semesters',
            body: 'Only one academic year is active at a time, and it decides the class list and where students are placed. The first academic year becomes active automatically.',
            steps: [
              'Open the Academic years menu, then click Create academic year.',
              'Enter a name not used before (for example 2026/2027) plus start and end dates, then save.',
              'Open the Semester section of that year, then click Create Odd and Even or Add semester.',
              'Click Make active on the academic year or semester that is currently running.',
            ],
            warning:
              'Changing the active academic year changes the classes shown across the app, and student placement follows it. Do it only when the new academic year really starts.',
            href: '/academic-years',
          },
          {
            heading: 'Creating a new class',
            body: 'A class belongs to one academic year, and its name must not match another class in that year. The program can stay empty; use it only for schools with majors or specialisations.',
            steps: [
              'Open the Classes menu, then pick the Academic year.',
              'Click Add a class.',
              'Fill in the name and level (for example 7, X, or Class 1), then pick a Program and Homeroom teacher if any.',
              'Save, then place students into the class through the Students menu.',
            ],
            warning: 'A class cannot be deleted while it still has students or assigned teachers.',
            href: '/classes',
          },
          {
            heading: 'Assigning teachers per subject',
            body: 'Assigned teachers decide who teaches a subject in a class. One subject in one class has only one teacher. This is needed before you build the timetable.',
            steps: [
              'In the Classes menu, click the class row menu and choose Assigned teachers.',
              'Pick the Subject and the Teacher, then click Assign.',
              'Click Remove if you want to change the teacher, then assign the new one.',
            ],
          },
          {
            heading: 'Adding subjects',
            body: 'Each subject has a code and a name, and the code must not match another one in the school. You can add them one by one or copy from the curriculum bank. Subjects whose code already exists are skipped, and copied subjects can be freely edited.',
            tip: 'Start from the curriculum bank and then adjust the names. It is faster than typing them one by one.',
            href: '/subjects',
          },
          {
            heading: 'Filling in the academic calendar',
            body: 'The calendar stores events per academic year in four types: Holiday, Break, Exam, and Activity. Holidays and breaks reduce the effective school days, while exams and activities are only markers.',
            steps: [
              'Open the Calendar menu, then pick the academic year.',
              'Choose the school days per week: 5 days or 6 days.',
              'Click Add an event, then fill in the type, title, and start and end dates.',
              'Open Yearly view and PDF, then click Download PDF if you want to print.',
            ],
            tip: 'Holidays and breaks apply to the whole school. Exams and activities can be for the whole school or for one class only.',
            href: '/calendar',
          },
        ],
        faq: [
          {
            q: 'Why does the class not appear in the list?',
            a: 'Check the Academic year selected at the top of the Classes menu. Classes belong to an academic year, so last year classes do not show in the new year. Create the class for the academic year you have selected.',
          },
          {
            q: 'I cannot delete a class. Why?',
            a: 'A class that still has students or assigned teachers cannot be deleted. Move the students through the Students menu, remove the assigned teachers, then delete.',
          },
          {
            q: 'An academic year name or subject code is rejected. What now?',
            a: 'The academic year name and the subject code must differ from existing ones. Look in the list first. If it already exists, use that one or choose another name or code.',
          },
          {
            q: 'The subject choices in the timetable are empty. What is missing?',
            a: 'The timetable only shows subjects that already have an assigned teacher in that class. Open the Classes menu, choose Assigned teachers on the class, and assign the teacher.',
          },
        ],
      },
      su: {
        title: 'Nyusun taun pangajaran, kelas, mata pelajaran, jeung kalénder',
        summary:
          'Siapkeun taun pangajaran jeung semester, jieun kelas, tetepkeun guru pangampu, sarta eusian kalénder libur jeung ujian.',
        forWho:
          'Admin sakola, operator TU, jeung staf Kurikulum nu nyiapkeun struktur akadémik unggal taun pangajaran.',
        sections: [
          {
            heading: 'Nyieun taun pangajaran jeung semester',
            body: 'Ngan hiji taun pangajaran nu aktip dina hiji waktu, sarta éta nu nangtukeun daptar kelas jeung tempat murid. Taun pangajaran kahiji otomatis aktip.',
            steps: [
              'Buka menu Taun pangajaran, tuluy klik Jieun taun pangajaran.',
              'Eusian ngaran nu acan kungsi dipaké (upamana 2026/2027) sarta tanggal mimiti jeung réngsé, tuluy simpen.',
              'Buka bagian Semester dina taun éta, tuluy klik Jieun Ganjil jeung Genep atawa Tambih semester.',
              'Klik Jadikeun aktip dina taun pangajaran atawa semester nu keur jalan.',
            ],
            warning:
              'Ngaganti taun pangajaran aktip ngarobah kelas nu kaciri di sakabéh aplikasi, sarta panempatan murid nuturkeunana. Laksanakeun ngan waktu taun pangajaran anyar enya-enya dimimitian.',
            href: '/academic-years',
          },
          {
            heading: 'Nyieun kelas anyar',
            body: 'Kelas dijieun pikeun hiji taun pangajaran, sarta ngaranna teu meunang sarua jeung kelas séjén dina taun éta. Jurusan meunang kosong; anggo ngan pikeun sakola nu boga jurusan atawa peminatan.',
            steps: [
              'Buka menu Kelas, tuluy pilih Taun pangajaran.',
              'Klik Tambih kelas.',
              'Eusian ngaran jeung tingkat (upamana 7, X, atawa Kelas 1), tuluy pilih Jurusan jeung Wali kelas lamun aya.',
              'Simpen, tuluy tempatkeun murid kana kelas lewat menu Murid.',
            ],
            warning: 'Kelas teu bisa dipupus salila masih aya murid atawa guru pangampu di jerona.',
            href: '/classes',
          },
          {
            heading: 'Netepkeun guru pangampu per mata pelajaran',
            body: 'Guru pangampu nangtukeun saha nu ngajar hiji mata pelajaran dina hiji kelas. Hiji mata pelajaran dina hiji kelas ngan boga hiji guru. Ieu diperlukeun saméméh nyusun jadwal.',
            steps: [
              'Dina menu Kelas, klik menu baris kelas tuluy pilih Guru pangampu.',
              'Pilih Mata pelajaran jeung Guru, tuluy klik Tetepkeun.',
              'Klik Lepas lamun rék ngaganti guru, tuluy tetepkeun guru nu anyar.',
            ],
          },
          {
            heading: 'Nambihan mata pelajaran',
            body: 'Unggal mata pelajaran boga kode jeung ngaran, sarta kode teu meunang sarua jeung nu séjén di sakola. Anjeun bisa nambihanana hiji-hiji, atawa nyalin tina bank kurikulum. Mata pelajaran nu kodena geus aya dilangkungan, sarta hasil salinan bébas dirobah.',
            tip: 'Mimitian tina bank kurikulum tuluy saluyukeun ngaranna. Leuwih gancang tibatan ngetik hiji-hiji.',
            href: '/subjects',
          },
          {
            heading: 'Ngeusian kalénder akadémik',
            body: 'Kalénder nyimpen acara per taun pangajaran dina opat jinis: Libur, Jeda, Ujian, jeung Kagiatan. Libur jeung jeda ngurangan poé diajar éféktif, sedengkeun ujian jeung kagiatan ngan jadi tanda.',
            steps: [
              'Buka menu Kalénder, tuluy pilih taun pangajaran.',
              'Pilih poé diajar per minggu: 5 poé atawa 6 poé.',
              'Klik Tambih acara, tuluy eusian jinis, judul, sarta tanggal mimiti jeung réngsé.',
              'Buka Témbongan taunan jeung PDF, tuluy klik Unduh PDF lamun rék dicitak.',
            ],
            tip: 'Libur jeung jeda lumaku pikeun sakabéh sakola. Ujian jeung kagiatan bisa pikeun sakabéh sakola atawa hiji kelas waé.',
            href: '/calendar',
          },
        ],
        faq: [
          {
            q: 'Naha kelas teu kaciri dina daptar?',
            a: 'Pariksa Taun pangajaran nu dipilih di luhur menu Kelas. Kelas dijieun per taun pangajaran, jadi kelas taun kamari teu kaciri dina taun anyar. Jieun kelas pikeun taun pangajaran nu keur dipilih.',
          },
          {
            q: 'Kuring teu bisa mupus kelas. Naha?',
            a: 'Kelas nu masih boga murid atawa guru pangampu teu bisa dipupus. Pindahkeun muridna lewat menu Murid, lepas guru pangampuna, tuluy pupus.',
          },
          {
            q: 'Ngaran taun pangajaran atawa kode mata pelajaran ditolak. Kumaha?',
            a: 'Ngaran taun pangajaran jeung kode mata pelajaran kudu béda ti nu geus aya. Teangan heula dina daptar. Lamun geus aya, anggo nu éta atawa pilih ngaran atawa kode séjén.',
          },
          {
            q: 'Pilihan mata pelajaran dina jadwal kosong. Naon nu kurang?',
            a: 'Jadwal ngan nuduhkeun mata pelajaran nu geus boga guru pangampu di kelas éta. Buka menu Kelas, pilih Guru pangampu dina kelasna, tuluy tetepkeun gurunya.',
          },
        ],
      },
    },
  },
  {
    slug: 'school-settings',
    icon: 'settings',
    tone: 'slate',
    group: 'master',
    text: {
      id: {
        title: 'Mengatur pengaturan dasar sekolah',
        summary:
          'Atur zona waktu, hari belajar, nama semester, jam pelajaran awal, dan daftar tingkat kelas untuk satu unit sekolah.',
        forWho: 'Admin sekolah dan Operator, biasanya sekali saat sekolah mulai memakai aplikasi.',
        sections: [
          {
            heading: 'Memilih zona waktu',
            body: 'Zona waktu menjadi acuan tanggal dan jam di seluruh aplikasi: absensi, tagihan, pesan, dan pendaftaran siswa baru (SPMB).',
            steps: [
              'Buka menu Pengaturan sekolah.',
              'Pilih zona waktu. Jam saat ini di zona itu ditampilkan sebagai pembanding.',
              'Klik Simpan.',
            ],
            warning:
              'Mengubah zona waktu tidak mengubah data lama, hanya cara hari dan jam dihitung mulai saat itu. Jangan diubah di tengah hari bila absensi sedang berjalan.',
            href: '/school-settings',
          },
          {
            heading: 'Menentukan hari belajar dan nama semester',
            body: 'Hari belajar (Senin sampai Minggu, minimal satu hari) dipakai oleh jadwal pelajaran dan kalender akademik. Nama semester (1 sampai 4) dipakai saat Anda membuat semester otomatis di menu Tahun ajaran. Nama tidak boleh kosong atau kembar.',
            tip: 'Semester yang sudah telanjur dibuat tidak ikut berubah. Atur nama semester sebelum membuat semester.',
          },
          {
            heading: 'Menyiapkan jam pelajaran awal',
            body: 'Isi jam mulai pelajaran pertama dan lama tiap jam pelajaran (10 sampai 180 menit). Isian ini hanya menjadi nilai awal saat Anda membuat jam pelajaran otomatis di menu Jadwal pelajaran. Jam pelajaran yang sudah ada tidak berubah.',
          },
          {
            heading: 'Menyusun daftar tingkat kelas',
            body: 'Daftar tingkat (misalnya 7, 8, 9 atau X, XI, XII) dipakai di kelas, tarif SPP, dan periode pendaftaran supaya penulisannya seragam. Selama daftar masih kosong, tingkat di tempat-tempat itu boleh diketik bebas.',
            steps: [
              'Bila daftar masih kosong, pilih jenjang (SD/MI, SMP/MTs, SMA/MA, atau SMK) lalu klik Isi bawaan.',
              'Atau klik Tambah tingkat, lalu isi kode, nama tampilan, dan urutan.',
              'Gunakan Ubah untuk mengganti nama tampilan atau urutan.',
            ],
            warning:
              'Kode tingkat tidak bisa diubah setelah dibuat, dan tingkat yang masih dipakai kelas, tarif, atau periode pendaftaran tidak bisa dihapus.',
          },
        ],
        faq: [
          {
            q: 'Kenapa menu Pengaturan sekolah tidak ada di menu saya?',
            a: 'Menu ini hanya muncul untuk Admin sekolah dan Operator. Minta Admin sekolah mengubah peran Anda di menu Anggota bila memang perlu.',
          },
          {
            q: 'Apakah pengaturan ini berlaku untuk semua unit sekolah di lembaga kami?',
            a: 'Tidak. Pengaturan berlaku per unit sekolah. Pindah ke unit yang ingin diatur, lalu isi pengaturannya di sana.',
          },
          {
            q: 'Saya sudah mengganti nama semester tetapi semester lama tidak berubah. Kenapa?',
            a: 'Nama baru hanya dipakai saat semester dibuat otomatis berikutnya. Semester yang sudah ada tidak ikut berubah dan perlu diperbaiki di menu Tahun ajaran.',
          },
        ],
      },
      en: {
        title: 'Setting up the basic school settings',
        summary:
          'Set the time zone, school days, semester names, starting lesson period, and the list of class levels for one school unit.',
        forWho: 'School admins and Operators, usually once when the school starts using the app.',
        sections: [
          {
            heading: 'Choosing the time zone',
            body: 'The time zone is the reference for dates and times across the app: attendance, invoices, messages, and new student admissions (SPMB).',
            steps: [
              'Open the School settings menu.',
              'Pick the time zone. The current time in that zone is shown for comparison.',
              'Click Save.',
            ],
            warning:
              'Changing the time zone does not alter old data, only how days and times are counted from then on. Do not change it in the middle of the day while attendance is running.',
            href: '/school-settings',
          },
          {
            heading: 'Setting school days and semester names',
            body: 'School days (Monday to Sunday, at least one) are used by the timetable and the academic calendar. Semester names (1 to 4) are used when you create semesters automatically in the Academic years menu. Names cannot be empty or duplicated.',
            tip: 'Semesters that were already created do not change. Set the semester names before you create semesters.',
          },
          {
            heading: 'Preparing the starting lesson period',
            body: 'Fill in the start time of the first lesson and the length of each lesson (10 to 180 minutes). These only become the starting values when you generate lesson periods in the Timetable menu. Existing lesson periods do not change.',
          },
          {
            heading: 'Building the list of class levels',
            body: 'The list of levels (for example 7, 8, 9 or X, XI, XII) is used for classes, tuition rates, and admission periods so they are written consistently. While the list is empty, levels in those places can be typed freely.',
            steps: [
              'If the list is still empty, pick a stage (SD/MI, SMP/MTs, SMA/MA, or SMK) and click Fill defaults.',
              'Or click Add a level, then fill in the code, display name, and order.',
              'Use Edit to change the display name or order.',
            ],
            warning:
              'A level code cannot be changed once created, and a level still used by classes, rates, or admission periods cannot be deleted.',
          },
        ],
        faq: [
          {
            q: 'Why is the School settings menu missing from my menu?',
            a: 'This menu appears only for School admin and Operator. Ask a School admin to change your role in the Members menu if you really need it.',
          },
          {
            q: 'Do these settings apply to every school unit in our institution?',
            a: 'No. Settings apply per school unit. Switch to the unit you want to set up, then fill in the settings there.',
          },
          {
            q: 'I changed the semester names but the old semesters did not change. Why?',
            a: 'The new names are only used the next time semesters are generated. Existing semesters do not change and must be corrected in the Academic years menu.',
          },
        ],
      },
      su: {
        title: 'Ngatur setélan dasar sakola',
        summary:
          'Atur zona waktu, poé diajar, ngaran semester, jam pangajaran awal, jeung daptar tingkat kelas pikeun hiji unit sakola.',
        forWho: 'Admin sakola jeung Operator, biasana sakali waktu sakola mimiti maké aplikasi.',
        sections: [
          {
            heading: 'Milih zona waktu',
            body: 'Zona waktu jadi patokan tanggal jeung jam di sakabéh aplikasi: absénsi, tagihan, pesen, jeung pendaptaran murid anyar (SPMB).',
            steps: [
              'Buka menu Setélan sakola.',
              'Pilih zona waktu. Jam ayeuna di zona éta dipintonkeun minangka pamadaan.',
              'Klik Simpen.',
            ],
            warning:
              'Ngarobah zona waktu teu ngarobah data heubeul, ngan cara poé jeung jam diitung ti harita. Ulah dirobah satengah poé lamun absénsi keur jalan.',
            href: '/school-settings',
          },
          {
            heading: 'Netepkeun poé diajar jeung ngaran semester',
            body: 'Poé diajar (Senén nepi ka Minggu, sahenteuna sapoé) dipaké ku jadwal pangajaran jeung kalénder akadémik. Ngaran semester (1 nepi ka 4) dipaké waktu Anjeun nyieun semester otomatis dina menu Taun pangajaran. Ngaran teu meunang kosong atawa kembar.',
            tip: 'Semester nu geus kadung dijieun teu milu robah. Atur ngaran semester saméméh nyieun semester.',
          },
          {
            heading: 'Nyiapkeun jam pangajaran awal',
            body: 'Eusian jam mimiti pangajaran kahiji jeung lilana unggal jam pangajaran (10 nepi ka 180 menit). Eusian ieu ngan jadi nilai awal waktu Anjeun nyieun jam pangajaran otomatis dina menu Jadwal pangajaran. Jam pangajaran nu geus aya teu robah.',
          },
          {
            heading: 'Nyusun daptar tingkat kelas',
            body: 'Daptar tingkat (upamana 7, 8, 9 atawa X, XI, XII) dipaké dina kelas, tarif SPP, jeung périodeu pendaptaran sangkan panulisanana sarua. Salila daptar masih kosong, tingkat di éta tempat meunang diketik bébas.',
            steps: [
              'Lamun daptar masih kosong, pilih jenjang (SD/MI, SMP/MTs, SMA/MA, atawa SMK) tuluy klik Eusian dasar.',
              'Atawa klik Tambih tingkat, tuluy eusian kode, ngaran tampilan, jeung urutan.',
              'Anggo Robah pikeun ngaganti ngaran tampilan atawa urutan.',
            ],
            warning:
              'Kode tingkat teu bisa dirobah sanggeus dijieun, sarta tingkat nu masih dipaké ku kelas, tarif, atawa périodeu pendaptaran teu bisa dipupus.',
          },
        ],
        faq: [
          {
            q: 'Naha menu Setélan sakola euweuh dina menu kuring?',
            a: 'Menu ieu ngan némbongan pikeun Admin sakola jeung Operator. Menta Admin sakola ngarobah peran Anjeun dina menu Anggota lamun enya-enya perlu.',
          },
          {
            q: 'Naha setélan ieu lumaku pikeun sakabéh unit sakola di lembaga urang?',
            a: 'Henteu. Setélan lumaku per unit sakola. Pindah ka unit nu rék diatur, tuluy eusian setélanana didinya.',
          },
          {
            q: 'Kuring geus ngaganti ngaran semester tapi semester heubeul teu robah. Naha?',
            a: 'Ngaran anyar ngan dipaké waktu semester dijieun otomatis nu pamungkas. Semester nu geus aya teu milu robah sarta kudu dibenerkeun dina menu Taun pangajaran.',
          },
        ],
      },
    },
  },
  {
    slug: 'attendance',
    icon: 'clipboard',
    tone: 'amber',
    group: 'attendance',
    module: 'attendance',
    text: {
      id: {
        title: 'Absensi: melihat rekap dan mengisi absensi per jam',
        summary:
          'Lihat kehadiran siswa, isi absensi tiap jam pelajaran, dan atur batas jam terlambat serta guru piket.',
        forWho:
          'Guru untuk mengisi absensi; Admin sekolah dan Operator untuk pengaturan; Kepala sekolah dan Kurikulum untuk melihat rekap.',
        sections: [
          {
            heading: 'Melihat rekap kehadiran',
            body: 'Rekap menggabungkan kehadiran di gerbang dan di tiap jam pelajaran. Siswa yang hadir di gerbang tetapi alpa di jam pelajaran dihitung sebagai Bolos kelas. Rentang tanggal paling lama 366 hari.',
            steps: [
              'Buka menu Rekap absensi di kelompok Kehadiran.',
              'Pilih kelas (atau Semua kelas) serta tanggal Dari dan Sampai.',
              'Cari siswa, atau periksa jumlah Hadir, Terlambat, Izin, Sakit, Alpa, dan Bolos kelas.',
              'Klik Ekspor Excel atau Ekspor PDF bila perlu.',
            ],
            tip: 'Guru yang tidak mengatur absensi hanya melihat rekap kelas yang ia ajar.',
            href: '/attendance',
          },
          {
            heading: 'Mengisi absensi per jam pelajaran',
            body: 'Guru mengisi kehadiran siswa pada jam pelajaran sesuai jadwal dengan status Hadir, Izin, Sakit, atau Alpa. Kolom gerbang menunjukkan siswa yang sudah menempelkan kartu, jadi siswa yang ada di gerbang tetapi tidak di kelas mudah terlihat.',
            steps: [
              'Buka menu Absensi per jam, lalu pilih tanggal.',
              'Klik Isi absensi pada jam pelajaran Anda.',
              'Tandai status tiap siswa, atau klik Semua hadir lalu ubah yang berbeda.',
              'Klik Simpan absensi.',
            ],
            tip: 'Klik Semua hadir dulu, lalu ubah hanya siswa yang tidak hadir. Cara ini jauh lebih cepat.',
            warning:
              'Tanggal yang belum tiba serta hari libur atau jeda ditolak. Absensi hanya bisa diisi oleh guru yang tertulis di jadwal, guru piket hari itu, atau Admin sekolah dan Operator.',
            href: '/lessons',
          },
          {
            heading: 'Mengatur batas terlambat dan jam pulang',
            body: 'Di Pengaturan absensi, tab Kebijakan menentukan jam terlambat, jam mulai pulang, dan jeda tempel kartu ganda. Absensi per jam memakai jadwal pelajaran, jadi jadwal harus sudah terisi lebih dulu.',
            steps: [
              'Buka Pengaturan absensi, tab Kebijakan.',
              'Isi Terlambat setelah dan Pulang mulai. Jam terlambat harus lebih awal dari jam pulang.',
              'Isi Jeda tap ganda (0 sampai 600 detik), lalu klik Simpan.',
            ],
            warning: 'Siswa yang menempelkan kartu setelah batas Terlambat setelah ditandai terlambat.',
            href: '/attendance-settings',
          },
          {
            heading: 'Menentukan guru piket',
            body: 'Guru piket bisa mengisi absensi per jam menggantikan guru yang berhalangan. Guru piket ditentukan per tanggal.',
            steps: [
              'Buka Pengaturan absensi, tab Jadwal piket.',
              'Pilih tanggal, lalu centang guru yang bertugas.',
              'Klik Simpan.',
            ],
          },
          {
            heading: 'Memberi tahu wali murid',
            body: 'Pemberitahuan ke wali saat siswa menempelkan kartu tidak diatur di Pengaturan absensi, tetapi di menu Notifikasi WhatsApp. Menu itu berasal dari modul Notifikasi WhatsApp yang terpisah.',
            href: '/messaging',
          },
        ],
        faq: [
          {
            q: 'Kenapa tombol Isi absensi tidak bisa dipakai atau ditolak?',
            a: 'Cek tanggalnya: tanggal yang belum tiba, hari libur, dan jeda tidak bisa diisi. Cek juga apakah Anda guru yang tertulis di jadwal jam itu. Bila bukan, minta guru piket atau Admin sekolah yang mengisi.',
          },
          {
            q: 'Jam pelajaran saya tidak muncul di Absensi per jam. Kenapa?',
            a: 'Daftar jam diambil dari jadwal pelajaran. Pastikan jadwal kelas dan jam itu sudah diisi di menu Jadwal pelajaran dan Anda ditulis sebagai gurunya.',
          },
          {
            q: 'Apa bedanya Alpa dan Bolos kelas di rekap?',
            a: 'Alpa berarti siswa tidak hadir. Bolos kelas berarti siswa tercatat hadir di gerbang hari itu tetapi alpa di jam pelajaran tertentu.',
          },
          {
            q: 'Pengaturan Kebijakan tidak mau disimpan. Apa yang salah?',
            a: 'Pastikan jam Terlambat setelah lebih awal dari jam Pulang mulai, dan Jeda tap ganda berada di antara 0 dan 600 detik. Perbaiki lalu klik Simpan lagi.',
          },
        ],
      },
      en: {
        title: 'Attendance: viewing the report and recording lesson attendance',
        summary:
          'See student attendance, record attendance every lesson, and set the late cutoff and duty teachers.',
        forWho:
          'Teachers to record attendance; School admins and Operators for settings; the Principal and Curriculum to view the report.',
        sections: [
          {
            heading: 'Viewing the attendance report',
            body: 'The report combines attendance at the gate and in each lesson. A student who is present at the gate but absent in a lesson counts as Skipped class. The date range is at most 366 days.',
            steps: [
              'Open the Attendance report menu in the Attendance group.',
              'Pick a class (or All classes) and the From and To dates.',
              'Search for a student, or review the counts of Present, Late, Excused, Sick, Absent, and Skipped class.',
              'Click Export Excel or Export PDF if needed.',
            ],
            tip: 'A teacher who does not manage attendance sees the report only for the classes they teach.',
            href: '/attendance',
          },
          {
            heading: 'Recording attendance per lesson',
            body: 'Teachers record student attendance for each lesson on the timetable with the status Present, Excused, Sick, or Absent. The gate column shows who already tapped a card, so students at the gate but missing from class are easy to spot.',
            steps: [
              'Open the Lesson attendance menu, then pick the date.',
              'Click Record attendance on your lesson.',
              'Mark each student, or click Mark all present and then change the exceptions.',
              'Click Save attendance.',
            ],
            tip: 'Click Mark all present first, then change only the students who are absent. It is much faster.',
            warning:
              'Future dates and holidays or breaks are rejected. Attendance can only be recorded by the teacher on the timetable, that day duty teacher, or a School admin or Operator.',
            href: '/lessons',
          },
          {
            heading: 'Setting the late cutoff and departure time',
            body: 'In Attendance settings, the Policy tab sets the late time, the departure start time, and the double-tap interval. Lesson attendance uses the timetable, so the timetable must be filled in first.',
            steps: [
              'Open Attendance settings, Policy tab.',
              'Fill in Late after and Departure from. The late time must be earlier than the departure time.',
              'Fill in the Double-tap interval (0 to 600 seconds), then click Save.',
            ],
            warning: 'A student who taps a card after the Late after time is marked late.',
            href: '/attendance-settings',
          },
          {
            heading: 'Choosing the duty teacher',
            body: 'A duty teacher can record lesson attendance in place of a teacher who cannot. Duty teachers are set per date.',
            steps: [
              'Open Attendance settings, Duty roster tab.',
              'Pick a date, then tick the teachers on duty.',
              'Click Save.',
            ],
          },
          {
            heading: 'Letting guardians know',
            body: 'Messages to guardians when a student taps a card are not set in Attendance settings but in the WhatsApp notifications menu. That menu belongs to the separate WhatsApp notifications module.',
            href: '/messaging',
          },
        ],
        faq: [
          {
            q: 'Why can I not use Record attendance, or why is it rejected?',
            a: 'Check the date: future dates, holidays, and breaks cannot be recorded. Also check whether you are the teacher on the timetable for that lesson. If not, ask the duty teacher or a School admin to record it.',
          },
          {
            q: 'My lesson does not appear in Lesson attendance. Why?',
            a: 'The list comes from the timetable. Make sure the class and that period are filled in under the Timetable menu and that you are listed as the teacher.',
          },
          {
            q: 'What is the difference between Absent and Skipped class in the report?',
            a: 'Absent means the student was not there. Skipped class means the student was recorded present at the gate that day but absent in a particular lesson.',
          },
          {
            q: 'The Policy settings will not save. What is wrong?',
            a: 'Make sure the Late after time is earlier than the Departure from time, and the Double-tap interval is between 0 and 600 seconds. Fix it and click Save again.',
          },
        ],
      },
      su: {
        title: 'Absénsi: ningali rékap jeung ngeusian absénsi per jam',
        summary:
          'Tingali kahadiran murid, eusian absénsi unggal jam pangajaran, jeung atur wates jam telat sarta guru piket.',
        forWho:
          'Guru pikeun ngeusian absénsi; Admin sakola jeung Operator pikeun pangaturan; Kapala sakola jeung Kurikulum pikeun ningali rékap.',
        sections: [
          {
            heading: 'Ningali rékap kahadiran',
            body: 'Rékap ngahijikeun kahadiran di gerbang jeung di unggal jam pangajaran. Murid nu hadir di gerbang tapi alfa dina jam pangajaran diitung Bolos kelas. Rentang tanggal pangpanjangna 366 poé.',
            steps: [
              'Buka menu Rékap absénsi dina kelompok Kahadiran.',
              'Pilih kelas (atawa Sadaya kelas) sarta tanggal Ti jeung Nepi ka.',
              'Teangan murid, atawa pariksa jumlah Hadir, Telat, Idin, Gering, Alfa, jeung Bolos kelas.',
              'Klik Ékspor Excel atawa Ékspor PDF lamun perlu.',
            ],
            tip: 'Guru nu teu ngatur absénsi ngan ningali rékap kelas nu diajarna.',
            href: '/attendance',
          },
          {
            heading: 'Ngeusian absénsi per jam pangajaran',
            body: 'Guru ngeusian kahadiran murid dina jam pangajaran luyu jeung jadwal kalayan status Hadir, Idin, Gering, atawa Alfa. Kolom gerbang nuduhkeun murid nu geus nempelkeun kartu, jadi murid nu aya di gerbang tapi teu aya di kelas gampang katingali.',
            steps: [
              'Buka menu Absénsi per jam, tuluy pilih tanggal.',
              'Klik Eusian absénsi dina jam pangajaran Anjeun.',
              'Tandaan status unggal murid, atawa klik Sadayana hadir tuluy robah nu béda.',
              'Klik Simpen absénsi.',
            ],
            tip: 'Klik Sadayana hadir heula, tuluy robah ngan murid nu teu hadir. Leuwih gancang pisan.',
            warning:
              'Tanggal nu acan datang jeung poé libur atawa jeda ditolak. Absénsi ngan bisa dieusian ku guru nu kacatet dina jadwal, guru piket poé éta, atawa Admin sakola jeung Operator.',
            href: '/lessons',
          },
          {
            heading: 'Ngatur wates telat jeung jam mulih',
            body: 'Dina Pangaturan absénsi, tab Kawijakan nangtukeun jam telat, jam mimiti mulih, jeung jeda tap ganda. Absénsi per jam maké jadwal pangajaran, jadi jadwal kudu geus kaeusian heula.',
            steps: [
              'Buka Pangaturan absénsi, tab Kawijakan.',
              'Eusian Telat sanggeus jeung Mulih mimiti. Jam telat kudu leuwih awal batan jam mulih.',
              'Eusian Jeda tap ganda (0 nepi ka 600 detik), tuluy klik Simpen.',
            ],
            warning: 'Murid nu nempelkeun kartu sanggeus jam Telat sanggeus dicirian telat.',
            href: '/attendance-settings',
          },
          {
            heading: 'Nangtukeun guru piket',
            body: 'Guru piket bisa ngeusian absénsi per jam ngagantikeun guru nu halangan. Guru piket ditangtukeun per tanggal.',
            steps: [
              'Buka Pangaturan absénsi, tab Jadwal piket.',
              'Pilih tanggal, tuluy centang guru nu keur tugas.',
              'Klik Simpen.',
            ],
          },
          {
            heading: 'Ngawartosan wali murid',
            body: 'Béwara ka wali waktu murid nempelkeun kartu teu diatur dina Pangaturan absénsi, tapi dina menu Béwara WhatsApp. Menu éta asalna tina modul Béwara WhatsApp nu misah.',
            href: '/messaging',
          },
        ],
        faq: [
          {
            q: 'Naha Eusian absénsi teu bisa dipaké atawa ditolak?',
            a: 'Pariksa tanggalna: tanggal nu acan datang, poé libur, jeung jeda teu bisa dieusian. Pariksa ogé naha Anjeun guru nu kacatet dina jadwal jam éta. Lamun lain, menta guru piket atawa Admin sakola nu ngeusian.',
          },
          {
            q: 'Jam pangajaran kuring teu kaciri dina Absénsi per jam. Naha?',
            a: 'Daptar jam dicokot tina jadwal pangajaran. Pastikeun kelas jeung jam éta geus kaeusian dina menu Jadwal pangajaran sarta Anjeun kacatet minangka gurunya.',
          },
          {
            q: 'Naon bédana Alfa jeung Bolos kelas dina rékap?',
            a: 'Alfa hartina murid teu hadir. Bolos kelas hartina murid kacatet hadir di gerbang poé éta tapi alfa dina jam pangajaran nu tangtu.',
          },
          {
            q: 'Setélan Kawijakan teu hayang disimpen. Naon nu lepat?',
            a: 'Pastikeun jam Telat sanggeus leuwih awal batan jam Mulih mimiti, jeung Jeda tap ganda aya di antara 0 jeung 600 detik. Bénerkeun tuluy klik Simpen deui.',
          },
        ],
      },
    },
  },
  {
    slug: 'rfid-gate',
    icon: 'scan',
    tone: 'teal',
    group: 'attendance',
    module: 'attendance',
    text: {
      id: {
        title: 'Kartu siswa, kiosk, dan gerbang',
        summary:
          'Daftarkan kartu siswa, pasang perangkat kiosk di gerbang, dan pantau siswa yang masuk dan pulang.',
        forWho:
          'Admin sekolah dan Operator yang menyiapkan kartu dan perangkat gerbang; guru piket untuk memantau gerbang.',
        sections: [
          {
            heading: 'Mendaftarkan kartu untuk satu siswa',
            body: 'Menu Kartu RFID menampilkan kartu yang sudah terdaftar dan jumlah siswa aktif yang belum punya kartu. Kode kartu dibaca langsung oleh pembaca kartu. Satu kode kartu hanya boleh dipakai satu siswa.',
            steps: [
              'Buka menu Kartu RFID, lalu klik Tambah kartu.',
              'Cari dan pilih siswa.',
              'Tempelkan kartu pada pembaca sampai kodenya terisi.',
              'Klik Buat.',
            ],
            tip: 'Pembaca kartu USB bekerja seperti papan ketik. Klik dulu kolom kode kartu, lalu tempelkan kartu.',
            href: '/attendance/cards',
          },
          {
            heading: 'Mendaftarkan kartu untuk satu kelas sekaligus',
            body: 'Pendaftaran cepat menyorot siswa satu per satu sesuai urutan kelas, jadi Anda cukup menempelkan kartu bergantian.',
            steps: [
              'Di menu Kartu RFID, klik Daftar cepat.',
              'Pilih kelas.',
              'Tempelkan kartu satu per satu sesuai siswa yang sedang disorot.',
              'Klik Lewati bila siswa tidak membawa kartu, atau Batalkan terakhir bila salah tempel.',
            ],
          },
          {
            heading: 'Mendaftarkan banyak kartu dari Excel',
            body: 'Cara ini cocok bila kode kartu sudah tercatat di daftar. Satu berkas paling banyak 1000 baris.',
            steps: [
              'Klik Impor Excel, lalu unduh templat yang berisi NIS dan Kode kartu.',
              'Isi templat tanpa mengubah judul kolom.',
              'Unggah berkas.',
              'Periksa hasilnya. Baris yang gagal ditampilkan beserta alasannya.',
            ],
            tip: 'Baris yang benar tetap tersimpan walau ada baris lain yang gagal. Perbaiki hanya baris yang ditandai, lalu unggah ulang baris itu saja.',
          },
          {
            heading: 'Memasang perangkat kiosk di gerbang',
            body: 'Kiosk adalah tablet atau komputer di gerbang tempat siswa menempelkan kartu. Setiap kiosk punya kunci sendiri, yaitu kode rahasia yang menghubungkannya ke sekolah Anda.',
            steps: [
              'Buka Pengaturan absensi, tab Perangkat, lalu klik Tambah perangkat.',
              'Beri nama (misalnya Gerbang utama), lalu klik Buat.',
              'Salin kunci yang tampil.',
              'Di perangkat gerbang, buka halaman kiosk lalu tempel kunci itu.',
              'Pada kartu perangkat, gunakan menu untuk Nonaktifkan, Ganti kunci, atau Hapus.',
            ],
            warning:
              'Kunci lengkap hanya tampil sekali. Bila hilang, pakai Ganti kunci. Kunci lama langsung tidak berlaku setelah diganti, jadi perangkat harus diisi kunci yang baru. Perangkat yang sudah pernah mencatat tap tidak bisa dihapus; nonaktifkan saja.',
            href: '/attendance-settings',
          },
          {
            heading: 'Memakai satu pembaca untuk beberapa unit sekolah',
            body: 'Secara bawaan satu perangkat hanya melayani sekolah tempat ia dibuat. Bila lembaga punya beberapa unit sekolah, satu pembaca bisa melayani beberapa unit sekaligus.',
            steps: [
              'Buka tab Perangkat, lalu pilih Atur jangkauan pada perangkat (atau centang unitnya saat Tambah perangkat).',
              'Centang unit yang ikut dilayani. Yang tampil hanya unit lembaga yang sama, aktif, punya modul Absensi, dan tempat Anda juga boleh mengatur absensi.',
              'Simpan. Nama unit tampil di layar kiosk, dan kartu tiap siswa tetap tercatat di unitnya sendiri.',
            ],
            warning:
              'Satu kode kartu tidak boleh terdaftar di dua unit pada perangkat yang sama. Tap dengan kartu seperti itu akan ditolak.',
          },
          {
            heading: 'Memantau siswa masuk dan pulang',
            body: 'Layar kiosk menampilkan Selamat datang, Terlambat, atau Sampai jumpa beserta nama dan kelas siswa, lima tap terbaru, jam, dan tombol layar penuh. Di menu Gerbang & piket, Anda melihat kehadiran masuk dan pulang hari ini, yang menyegarkan diri tiap 10 detik, lengkap dengan ringkasan per status dan daftar siswa yang bisa disaring per kelas. Tap sebelum jam pulang dihitung masuk dan sesudahnya dihitung pulang. Tap masuk setelah batas terlambat ditandai terlambat.',
            tip: 'Bila jaringan putus, tap tetap tersimpan di perangkat dan dikirim ulang dengan waktu aslinya saat jaringan kembali.',
            href: '/gate',
          },
        ],
        faq: [
          {
            q: 'Kartu ditolak karena sudah dipakai siswa lain, bagaimana?',
            a: 'Satu kode kartu hanya boleh dipakai satu siswa. Cari kartu itu di menu Kartu RFID untuk tahu siapa pemakainya. Bila kartu berpindah tangan, hapus kartu lama lalu daftarkan ke siswa yang benar.',
          },
          {
            q: 'Saya menempelkan kartu tetapi layar kiosk bilang kartu tidak dikenal. Kenapa?',
            a: 'Kartu itu belum didaftarkan, atau siswanya tidak aktif. Buka menu Kartu RFID dan periksa apakah kartunya ada. Tap juga ditolak pada hari libur.',
          },
          {
            q: 'Kunci perangkat hilang atau perangkat tidak bisa tersambung. Apa yang harus dilakukan?',
            a: 'Buka Pengaturan absensi, tab Perangkat, pilih Ganti kunci pada perangkatnya, salin kunci yang baru, lalu tempel di halaman kiosk. Kunci lama langsung mati.',
          },
          {
            q: 'Internet gerbang sempat mati. Apakah tap siswa hilang?',
            a: 'Tidak. Tap disimpan di perangkat dan dikirim ulang dengan waktu aslinya setelah jaringan kembali. Biarkan halaman kiosk tetap terbuka.',
          },
          {
            q: 'Perangkat lama tidak bisa dihapus. Bagaimana?',
            a: 'Perangkat yang pernah mencatat tap tidak bisa dihapus agar riwayat tetap utuh. Pilih Nonaktifkan, dan perangkat tidak akan dipakai lagi.',
          },
        ],
      },
      en: {
        title: 'Student cards, kiosk, and the gate',
        summary:
          'Register student cards, set up the kiosk device at the gate, and follow students arriving and leaving.',
        forWho:
          'School admins and Operators who prepare the cards and gate devices; duty teachers to watch the gate.',
        sections: [
          {
            heading: 'Registering a card for one student',
            body: 'The RFID cards menu shows registered cards and the number of active students without a card. The card code is read directly by the card reader. One card code can belong to only one student.',
            steps: [
              'Open the RFID cards menu, then click Add card.',
              'Search for and pick the student.',
              'Place the card on the reader until the code is filled in.',
              'Click Create.',
            ],
            tip: 'A USB card reader works like a keyboard. Click the card code field first, then place the card.',
            href: '/attendance/cards',
          },
          {
            heading: 'Registering cards for a whole class at once',
            body: 'Quick registration highlights students one by one in class order, so you only need to tap the cards in turn.',
            steps: [
              'In the RFID cards menu, click Quick registration.',
              'Pick the class.',
              'Place the cards one at a time for the student currently highlighted.',
              'Click Skip if the student has no card with them, or Undo last if you tapped the wrong card.',
            ],
          },
          {
            heading: 'Registering many cards from Excel',
            body: 'This suits you if the card codes are already written down in a list. One file holds at most 1000 rows.',
            steps: [
              'Click Import from Excel, then download the template with NIS and Card code.',
              'Fill in the template without changing the column titles.',
              'Upload the file.',
              'Check the result. Failed rows are listed with the reason.',
            ],
            tip: 'Correct rows stay saved even if other rows fail. Fix only the marked rows and upload just those again.',
          },
          {
            heading: 'Setting up the kiosk device at the gate',
            body: 'The kiosk is a tablet or computer at the gate where students tap their cards. Each kiosk has its own key, a secret code that connects it to your school.',
            steps: [
              'Open Attendance settings, Devices tab, then click Add device.',
              'Give it a name (for example Main gate), then click Create.',
              'Copy the key that appears.',
              'On the gate device, open the kiosk page and paste the key.',
              'On the device card, use the menu to Deactivate, Replace key, or Delete.',
            ],
            warning:
              'The full key is shown only once. If it is lost, use Replace key. The old key stops working as soon as it is replaced, so the device must be given the new key. A device that has recorded taps cannot be deleted; deactivate it instead.',
            href: '/attendance-settings',
          },
          {
            heading: 'Using one reader for several school units',
            body: 'By default a device serves only the school where it was created. When the institution has several school units, one reader can serve several units at once.',
            steps: [
              'Open the Devices tab, then choose Set scope on the device (or tick the units when adding the device).',
              'Tick the units to serve. Only units of the same institution that are active, have the Attendance module, and where you may also manage attendance are listed.',
              'Save. The unit name shows on the kiosk screen, and each student card stays recorded in its own unit.',
            ],
            warning:
              'One card code must not be registered in two units on the same device. A tap with such a card is rejected.',
          },
          {
            heading: 'Following students arriving and leaving',
            body: 'The kiosk screen shows Welcome, Late, or Goodbye with the student name and class, the five latest taps, the clock, and a fullscreen button. In the Gate & duty menu you see today arrivals and departures, which refresh every 10 seconds, with a summary per status and a student list that can be filtered by class. A tap before the departure time counts as arrival and after it counts as departure. An arrival tap after the late cutoff is marked late.',
            tip: 'When the network drops, taps stay on the device and are sent again with their original time once it is back.',
            href: '/gate',
          },
        ],
        faq: [
          {
            q: 'A card is rejected because another student already uses it. What now?',
            a: 'One card code can belong to only one student. Find the card in the RFID cards menu to see who has it. If the card changed hands, delete the old card and register it to the right student.',
          },
          {
            q: 'I tapped a card but the kiosk screen says the card is unknown. Why?',
            a: 'The card has not been registered, or the student is not active. Open the RFID cards menu and check that the card is there. Taps are also rejected on holidays.',
          },
          {
            q: 'The device key is lost or the device cannot connect. What should I do?',
            a: 'Open Attendance settings, Devices tab, choose Replace key on the device, copy the new key, and paste it on the kiosk page. The old key stops working immediately.',
          },
          {
            q: 'The gate internet went down for a while. Are student taps lost?',
            a: 'No. Taps are kept on the device and sent again with their original time once the network is back. Keep the kiosk page open.',
          },
          {
            q: 'An old device cannot be deleted. How?',
            a: 'A device that has recorded taps cannot be deleted so the history stays complete. Choose Deactivate and it will no longer be used.',
          },
        ],
      },
      su: {
        title: 'Kartu murid, kiosk, jeung gerbang',
        summary:
          'Daptarkeun kartu murid, pasang parangkat kiosk di gerbang, jeung titénan murid nu asup sarta mulih.',
        forWho:
          'Admin sakola jeung Operator nu nyiapkeun kartu jeung parangkat gerbang; guru piket pikeun mantuan gerbang.',
        sections: [
          {
            heading: 'Ngadaptarkeun kartu pikeun hiji murid',
            body: 'Menu Kartu RFID nuduhkeun kartu nu geus kadaptar jeung jumlah murid aktip nu acan boga kartu. Kode kartu dibaca langsung ku pamaca kartu. Hiji kode kartu ngan meunang dipaké ku hiji murid.',
            steps: [
              'Buka menu Kartu RFID, tuluy klik Tambah kartu.',
              'Teangan jeung pilih murid.',
              'Tempelkeun kartu kana pamaca nepi ka kodena kaeusian.',
              'Klik Jieun.',
            ],
            tip: 'Pamaca kartu USB gawéna siga papan ketik. Klik heula kolom kode kartu, tuluy tempelkeun kartuna.',
            href: '/attendance/cards',
          },
          {
            heading: 'Ngadaptarkeun kartu sakelas sakaligus',
            body: 'Daptar gancang nyorot murid hiji-hiji luyu jeung urutan kelas, jadi Anjeun cekap nempelkeun kartu gilir-gilir.',
            steps: [
              'Dina menu Kartu RFID, klik Daptar gancang.',
              'Pilih kelas.',
              'Tempelkeun kartu hiji-hiji pikeun murid nu keur disorot.',
              'Klik Lewat lamun murid teu mawa kartu, atawa Batalkeun nu pandeuri lamun lepat nempelkeun.',
            ],
          },
          {
            heading: 'Ngadaptarkeun loba kartu tina Excel',
            body: 'Cara ieu cocok lamun kode kartu geus kacatet dina daptar. Hiji berkas pangpangna 1000 baris.',
            steps: [
              'Klik Impor Excel, tuluy unduh templat nu ngandung NIS jeung Kode kartu.',
              'Eusian templat tanpa ngarobah judul kolom.',
              'Unggah berkas.',
              'Pariksa hasilna. Baris nu gagal dipintonkeun jeung alesanana.',
            ],
            tip: 'Baris nu bener tetep disimpen sanajan baris séjén gagal. Bénerkeun ngan baris nu ditandaan, tuluy unggah baris éta waé.',
          },
          {
            heading: 'Masang parangkat kiosk di gerbang',
            body: 'Kiosk nyaéta tablét atawa komputer di gerbang tempat murid nempelkeun kartu. Unggal kiosk boga konci sorangan, nyaéta kode rusiah nu nyambungkeunana ka sakola Anjeun.',
            steps: [
              'Buka Pangaturan absénsi, tab Parangkat, tuluy klik Tambah parangkat.',
              'Pasihan ngaran (upamana Gerbang utama), tuluy klik Jieun.',
              'Salin konci nu kaluar.',
              'Dina parangkat gerbang, buka kaca kiosk tuluy tempelkeun konci éta.',
              'Dina kartu parangkat, anggo menu pikeun Nonaktipkeun, Ganti konci, atawa Hapus.',
            ],
            warning:
              'Konci lengkep ngan némbongan sakali. Lamun leungit, anggo Ganti konci. Konci heubeul langsung teu lumaku sanggeus diganti, jadi parangkat kudu diisi konci nu anyar. Parangkat nu geus kungsi nyatet tap teu bisa dipupus; nonaktipkeun waé.',
            href: '/attendance-settings',
          },
          {
            heading: 'Maké hiji pamaca pikeun sababaraha unit sakola',
            body: 'Sacara dasar hiji parangkat ngan ngalayanan sakola tempat dijieunna. Lamun lembaga boga sababaraha unit sakola, hiji pamaca bisa ngalayanan sababaraha unit sakaligus.',
            steps: [
              'Buka tab Parangkat, tuluy pilih Atur jangkauan dina parangkat (atawa centang unitna waktu Tambah parangkat).',
              'Centang unit nu milu dilayanan. Nu kaciri ngan unit lembaga nu sarua, aktip, boga modul Absénsi, jeung nu Anjeun ogé meunang ngatur absénsi.',
              'Simpen. Ngaran unit kaciri dina layar kiosk, sarta kartu unggal murid tetep kacatet dina unitna sorangan.',
            ],
            warning:
              'Hiji kode kartu teu meunang kadaptar di dua unit dina parangkat nu sarua. Tap ku kartu siga kitu bakal ditolak.',
          },
          {
            heading: 'Nitenan murid asup jeung mulih',
            body: 'Layar kiosk nuduhkeun Wilujeng sumping, Telat, atawa Dugi ka patepang jeung ngaran sarta kelas murid, lima tap panungtung, jam, jeung tombol layar pinuh. Dina menu Gerbang & piket, Anjeun ningali kahadiran asup jeung mulih poé ieu, nu nyegerkeun diri unggal 10 detik, lengkep jeung rangkuman per status sarta daptar murid nu bisa disaring per kelas. Tap saméméh jam mulih diitung asup sarta sanggeusna diitung mulih. Tap asup sanggeus wates telat dicirian telat.',
            tip: 'Lamun jaringan potong, tap tetep disimpen dina parangkat tuluy dikirim deui jeung waktu aslina sanggeus jaringan balik.',
            href: '/gate',
          },
        ],
        faq: [
          {
            q: 'Kartu ditolak sabab geus dipaké murid séjén, kumaha?',
            a: 'Hiji kode kartu ngan meunang dipaké ku hiji murid. Teangan kartu éta dina menu Kartu RFID pikeun nyaho saha nu maké. Lamun kartu pindah leungeun, pupus kartu heubeul tuluy daptarkeun ka murid nu bener.',
          },
          {
            q: 'Kuring nempelkeun kartu tapi layar kiosk nyebutkeun kartu teu dikenal. Naha?',
            a: 'Kartu éta acan kadaptar, atawa muridna teu aktip. Buka menu Kartu RFID tuluy pariksa naha kartuna aya. Tap ogé ditolak dina poé libur.',
          },
          {
            q: 'Konci parangkat leungit atawa parangkat teu bisa nyambung. Naon nu kudu dilakukeun?',
            a: 'Buka Pangaturan absénsi, tab Parangkat, pilih Ganti konci dina parangkatna, salin konci nu anyar, tuluy tempelkeun dina kaca kiosk. Konci heubeul langsung pareum.',
          },
          {
            q: 'Internét gerbang kungsi pareum. Naha tap murid leungit?',
            a: 'Henteu. Tap disimpen dina parangkat tuluy dikirim deui jeung waktu aslina sanggeus jaringan balik. Anggeus kaca kiosk tetep muka.',
          },
          {
            q: 'Parangkat heubeul teu bisa dipupus. Kumaha?',
            a: 'Parangkat nu kungsi nyatet tap teu bisa dipupus sangkan jejak tetep lengkep. Pilih Nonaktipkeun, sarta parangkat moal dipaké deui.',
          },
        ],
      },
    },
  },
  {
    slug: 'manual-attendance',
    icon: 'clipboard',
    tone: 'sky',
    group: 'attendance',
    module: 'attendance',
    text: {
      id: {
        title: 'Absen datang & pulang manual',
        summary:
          'Catat siswa datang dan pulang lewat satu ketukan saat kiosk RFID tidak bisa dipakai, misalnya listrik padam atau kartu hilang.',
        forWho:
          'Wali kelas, guru piket, dan pengurus absensi (Admin sekolah, Operator). Guru lain tidak melihat kelasnya.',
        sections: [
          {
            heading: 'Kapan memakai absen manual, kapan kartu RFID',
            body: 'Kartu RFID di kiosk tetap cara utama karena cepat dan dicatat siswa sendiri. Pakai absen manual hanya sebagai cadangan: listrik atau jaringan di gerbang padam, kiosk rusak, siswa lupa atau kehilangan kartu, atau Anda perlu melengkapi catatan hari sebelumnya. Catatan manual masuk ke absensi harian yang sama dengan tap kartu, ikut terhitung di laporan, dan memberi tahu wali seperti tap biasa.',
            href: '/attendance/manual',
          },
          {
            heading: 'Siapa yang boleh mencatat',
            body: 'Wali kelas hanya bisa mencatat kelas yang ia walikan pada tahun ajaran aktif. Guru yang bertugas piket hari ini bisa mencatat semua kelas. Pengurus absensi (yang boleh mengatur absensi) bisa mencatat semua kelas kapan saja. Guru lain akan melihat pemberitahuan bahwa belum ada kelas yang bisa dicatat; hubungi pengurus absensi bila Anda perlu akses.',
          },
          {
            heading: 'Mencatat datang atau pulang',
            body: 'Pilih kelas dan tanggal (bawaan hari ini), lalu pilih Datang atau Pulang. Satu ketukan pada tombol siswa langsung mencatatnya pada jam sekarang. Sebuah pesan muncul sebentar dengan tombol Batalkan bila Anda salah mengetuk. Status Terlambat dihitung otomatis oleh sistem dari batas jam terlambat di Pengaturan absensi, dan hasilnya tampil pada lencana siswa.',
            steps: [
              'Buka menu Absen datang & pulang.',
              'Pilih kelas. Angka di samping nama kelas menunjukkan berapa yang sudah datang, sudah pulang, dan belum datang.',
              'Pilih Datang atau Pulang.',
              'Ketuk tombol di baris siswa. Siswa yang sudah tercatat menampilkan jamnya; ketuk untuk mengoreksinya.',
            ],
            tip: 'Siswa yang izin, sakit, atau alpa tidak ikut tercatat saat Anda menandai massal. Ubah statusnya lewat koreksi bila ternyata hadir.',
          },
          {
            heading: 'Mencatat untuk jam yang sudah lewat',
            body: 'Isi kolom Jam dengan format 07:15 untuk mencatat jam tertentu. Dikosongkan berarti sekarang. Untuk tanggal yang sudah lewat jam wajib diisi. Jam tidak boleh di masa depan, dan tanggal yang belum tiba tidak bisa dicatat.',
          },
          {
            heading: 'Menandai banyak siswa sekaligus',
            body: 'Tandai semua hadir (belum datang) mencatat semua siswa kelas yang belum punya catatan datang dan tidak berstatus izin, sakit, atau alpa. Pada mode Pulang, tombolnya menandai semua yang sudah datang tetapi belum pulang. Untuk sebagian siswa saja, pakai Pilih beberapa, centang siswanya, lalu ketuk Catat. Hasil tiap siswa dirangkum: sudah tercatat (tidak ditimpa), dilewati karena izin/sakit/alpa, pulang tanpa catatan datang, atau jam yang tidak masuk akal.',
          },
          {
            heading: 'Koreksi dan pembatalan',
            body: 'Ketuk ikon pensil pada baris siswa untuk menghapus jam datang atau pulang, mengubah jamnya, atau menetapkan status Izin, Sakit, atau Alpa beserta catatannya. Koreksi tidak mengirim pemberitahuan ke wali. Bila kedua jam dikosongkan, catatan hari itu dihapus.',
          },
          {
            heading: 'Hari libur',
            body: 'Pada tanggal libur atau jeda sekolah, halaman memberi tahu dan tombol pencatatan terkunci. Pilih Tetap catat bila memang ada siswa yang masuk.',
          },
          {
            heading: 'Memindai QR di kartu siswa (cadangan kiosk)',
            body: 'Selain daftar kelas, halaman ini punya tab Pindai QR: guru mengarahkan kamera ponsel ke QR di kartu siswa, dan datang atau pulang langsung tercatat. Ini hanya cadangan saat kiosk RFID tidak bisa dipakai (listrik padam, pembaca rusak); kiosk RFID tetap cara utama. QR di kartu adalah QR identitas siswa: satu kode acak unik per siswa (bukan NIS), dicetak otomatis di kartu siswa bawaan dan dipakai semua fitur; kode hanya menunjuk siswa, sedangkan menu ini yang menentukan tindakannya (mencatat datang atau pulang). Pemindai butuh login dan izin absensi, jadi QR saja tidak memberi akses apa pun. Aturan akses, perhitungan terlambat, penjaga hari libur, dan pemberitahuan ke wali sama persis dengan pencatatan manual; catatannya bertanda sumber QR dan nama pencatat.',
            steps: [
              'Buka Absen datang & pulang lalu pilih tab Pindai QR.',
              'Pilih Datang atau Pulang dengan tombol besar. Pilihan diingat di perangkat itu.',
              'Ketuk Nyalakan kamera dan izinkan akses kamera bila diminta.',
              'Arahkan kamera ke QR kartu. Hasilnya tampil besar (nama, kelas, jam, dan Terlambat bila ya) disertai bunyi bip dan getar; kamera tetap menyala untuk kartu berikutnya.',
              'Bila kamera bermasalah, pindai QR dengan aplikasi kamera bawaan ponsel lalu tempel teksnya (diawali ES1.) di kolom Tempel kode.',
            ],
            tip: 'QR yang sama tidak diproses ulang dalam 4 detik, dan QR lain yang bukan kartu siswa (misalnya kode toko) diabaikan. Daftar 20 pindaian terakhir tampil di bawah hasil. Kolom Ketik, tempel, atau pindai kode otomatis aktif: pemindai kode batang USB (yang bekerja seperti papan ketik) cukup diarahkan ke kartu dan kode diproses saat menerima Enter. Kode batang lewat kamera hanya didukung di Chrome atau Edge; QR terbaca di semua peramban.',
            warning:
              'Kamera di peramban hanya bekerja lewat HTTPS. Bila Edusync dibuka lewat alamat http:// biasa, kamera ditolak peramban dan hanya kolom Tempel kode yang bisa dipakai. Bila izin kamera ditolak, izinkan lagi di pengaturan situs pada peramban.',
            href: '/attendance/manual',
          },
          {
            heading: 'Bila jaringan putus',
            body: 'Jika permintaan gagal karena tidak ada jaringan, catatan disimpan di perangkat ini beserta jam aslinya dan muncul spanduk Belum terkirim. Catatan dikirim otomatis saat jaringan kembali; Anda juga bisa menekan Kirim sekarang. Jam yang tercatat tetap jam saat Anda mengetuk, bukan jam saat terkirim.',
            warning:
              'Catatan yang belum terkirim hanya ada di perangkat itu. Jangan menghapus data situs peramban atau berganti perangkat sebelum spanduk hilang. Catatan yang ditolak server saat dikirim ulang akan dibuang dan Anda diberi tahu.',
          },
          {
            heading: 'Pindai QR saat jaringan putus, dan kartu hilang',
            body: 'Pindaian yang gagal terkirim karena jaringan disimpan di perangkat dengan jam pindai aslinya dan muncul pada spanduk Belum terkirim; dikirim otomatis saat jaringan kembali dan tidak pernah tercatat dua kali. Pindaian yang lebih dari 48 jam tidak bisa dikirim dan dibuang. Bila kartu hilang atau QR-nya bocor, admin membuka Siswa lalu kartu siswa itu dan memilih Buat ulang QR identitas: QR lama langsung tidak berlaku di semua fitur sekaligus (bukan hanya absensi) dan kartu baru perlu dicetak ulang.',
          },
        ],
        faq: [
          {
            q: 'Saya wali kelas tetapi kelas saya tidak muncul. Kenapa?',
            a: 'Kelas hanya muncul bila Anda terdaftar sebagai wali kelas pada tahun ajaran aktif. Minta admin menetapkan Anda di halaman Kelas.',
          },
          {
            q: 'Siswa sudah tap kartu tetapi saya mengetuk lagi. Apakah dobel?',
            a: 'Tidak. Catatan datang atau pulang yang sudah ada tidak ditimpa dan Anda diberi tahu bahwa siswa itu sudah tercatat. Untuk mengganti jamnya, pakai koreksi.',
          },
          {
            q: 'Muncul pesan pulang tanpa catatan datang. Apa artinya?',
            a: 'Siswa dicatat pulang padahal belum tercatat datang. Catatannya tetap tersimpan; lengkapi jam datangnya lewat koreksi bila perlu.',
          },
        ],
      },
      en: {
        title: 'Manual arrival & departure',
        summary:
          'Record students arriving and leaving with one tap when the RFID kiosk cannot be used, for example during a power cut or a lost card.',
        forWho:
          'Homeroom teachers, duty teachers, and attendance managers (School admin, Operator). Other teachers do not see the class.',
        sections: [
          {
            heading: 'When to use manual attendance and when the RFID card',
            body: 'The RFID card at the kiosk stays the main way because it is fast and students record themselves. Use manual attendance only as a backup: power or network at the gate is down, the kiosk is broken, a student forgot or lost the card, or you need to complete the record of an earlier day. Manual records go into the same daily attendance as card taps, count in the reports, and notify guardians like a normal tap.',
            href: '/attendance/manual',
          },
          {
            heading: 'Who can record',
            body: 'A homeroom teacher can only record the class they are homeroom teacher of in the active academic year. A teacher on duty today can record every class. Attendance managers (who may configure attendance) can record every class at any time. Other teachers see a notice that there is no class they can record yet; ask an attendance manager if you need access.',
          },
          {
            heading: 'Recording arrival or departure',
            body: 'Pick the class and date (today by default), then choose Arrival or Departure. One tap on the student button records them at the current time. A message appears briefly with an Undo button in case you tapped by mistake. The Late status is computed automatically from the late cutoff in Attendance settings, and the result shows on the student badge.',
            steps: [
              'Open the Manual arrival & departure menu.',
              'Pick the class. The numbers beside the class name show how many arrived, left, and have not arrived.',
              'Choose Arrival or Departure.',
              'Tap the button on the student row. A student already recorded shows the time; tap it to correct it.',
            ],
            tip: 'Students who are excused, sick, or absent are not recorded when you mark in bulk. Change their status with a correction if they turn out to be present.',
          },
          {
            heading: 'Recording a time that has passed',
            body: 'Fill the Time field like 07:15 to record a specific time. Empty means now. For a past date the time is required. A time cannot be in the future, and a date that has not arrived cannot be recorded.',
          },
          {
            heading: 'Marking many students at once',
            body: 'Mark all present (not yet arrived) records every student in the class with no arrival record who is not excused, sick, or absent. In Departure mode the button marks everyone who arrived but has not left. For only some students, use Select several, tick them, then tap Record. The result per student is summarized: already recorded (not overwritten), skipped because excused/sick/absent, left without an arrival record, or a time that makes no sense.',
          },
          {
            heading: 'Corrections and undo',
            body: 'Tap the pencil icon on a student row to clear the arrival or departure time, change a time, or set the status Excused, Sick, or Absent with a note. Corrections do not notify guardians. If both times are cleared, that day record is removed.',
          },
          {
            heading: 'Holidays',
            body: 'On a holiday or school break the page tells you and the record buttons are locked. Choose Record anyway if students really did come.',
          },
          {
            heading: 'Scanning the QR on the student card (kiosk backup)',
            body: 'Besides the class list, this page has a Scan QR tab: the teacher points a phone camera at the QR on the student card and the arrival or departure is recorded right away. This is only a backup for when the RFID kiosk cannot be used (power cut, broken reader); the RFID kiosk remains the main way. The QR on the card is the student identity QR: one random code unique per student (not the NIS), printed automatically on the built-in student card and used by every feature; the code only points to a student, while this menu decides the action (recording an arrival or departure). The scanner needs a login and attendance permission, so the QR alone grants no access. Access rules, late calculation, the holiday guard and guardian notifications are exactly the same as manual recording; the record is marked with the QR source and the recorder name.',
            steps: [
              'Open Manual arrival & departure and choose the Scan QR tab.',
              'Choose Arrival or Departure with the big buttons. The choice is remembered on that device.',
              'Tap Start camera and allow camera access if asked.',
              'Point the camera at the card QR. The result shows large (name, class, time, and Late if so) with a beep and vibration; the camera stays on for the next card.',
              'If the camera does not work, scan the QR with the phone built-in camera app and paste the text (starting with ES1.) into the Paste code field.',
            ],
            tip: 'The same QR is not processed again within 4 seconds, and other QR codes that are not student cards (for example a shop code) are ignored. The last 20 scans are listed under the result. The Type, paste, or scan code field is active automatically: a USB barcode scanner (which acts like a keyboard) only needs to be pointed at the card and the code is processed when it receives Enter. Barcodes through the camera are only supported in Chrome or Edge; QR is read in every browser.',
            warning:
              'The browser camera only works over HTTPS. If Edusync is opened over a plain http:// address the browser refuses the camera and only the Paste code field can be used. If camera permission is denied, allow it again in the site settings of the browser.',
            href: '/attendance/manual',
          },
          {
            heading: 'When the network is down',
            body: 'If a request fails because there is no network, the record is kept on this device with its original time and a Not sent yet banner appears. Records are sent automatically when the network is back; you can also press Send now. The recorded time stays the time you tapped, not the time it was sent.',
            warning:
              'Records that are not sent yet exist only on that device. Do not clear the browser site data or switch devices until the banner is gone. Records the server rejects when they are resent are dropped and you are told.',
          },
          {
            heading: 'Scanning when the network is down, and lost cards',
            body: 'A scan that fails to send because of the network is kept on the device with its original scan time and appears in the Not sent yet banner; it is sent automatically when the network is back and is never recorded twice. A scan older than 48 hours cannot be sent and is dropped. If a card is lost or its QR leaked, an admin opens Students, then that student card, and chooses Regenerate identity QR: the old QR stops working in all features at once (not only attendance) and a new card must be printed.',
          },
        ],
        faq: [
          {
            q: 'I am a homeroom teacher but my class does not appear. Why?',
            a: 'A class appears only if you are registered as its homeroom teacher in the active academic year. Ask an admin to set you on the Classes page.',
          },
          {
            q: 'The student already tapped a card and I tapped again. Is it doubled?',
            a: 'No. An existing arrival or departure record is not overwritten and you are told the student was already recorded. To change the time, use a correction.',
          },
          {
            q: 'A message says left without an arrival record. What does it mean?',
            a: 'The student was recorded as leaving without an arrival record. The record is still saved; complete the arrival time with a correction if needed.',
          },
        ],
      },
      su: {
        title: 'Absén datang & mulih manual',
        summary:
          'Catet murid datang jeung mulih ku hiji ketukan lamun kiosk RFID teu bisa dipaké, upamana listrik pareum atawa kartu leungit.',
        forWho:
          'Wali kelas, guru piket, jeung pangurus absénsi (Admin sakola, Operator). Guru séjén teu ningali kelasna.',
        sections: [
          {
            heading: 'Iraha maké absén manual, iraha maké kartu RFID',
            body: 'Kartu RFID di kiosk tetep jadi cara utama sabab gancang jeung murid nyatet sorangan. Pake absén manual ngan salaku cadangan: listrik atawa jaringan di gerbang pareum, kiosk ruksak, murid poho atawa leungit kartu, atawa Anjeun kudu ngalengkepan catetan poé saméméhna. Catetan manual asup kana absénsi harian nu sarua jeung tap kartu, kaitung dina laporan, sarta mere béwara ka wali siga tap biasa.',
            href: '/attendance/manual',
          },
          {
            heading: 'Saha nu meunang nyatet',
            body: 'Wali kelas ngan bisa nyatet kelas nu diwalikeun dina taun ajaran aktip. Guru nu piket poé ieu bisa nyatet sakabéh kelas. Pangurus absénsi (nu meunang ngatur absénsi) bisa nyatet sakabéh kelas iraha waé. Guru séjén bakal ningali béwara yén acan aya kelas nu bisa dicatet; hubungi pangurus absénsi lamun peryogi aksés.',
          },
          {
            heading: 'Nyatet datang atawa mulih',
            body: 'Pilih kelas jeung tanggal (poé ieu sacara baku), tuluy pilih Datang atawa Mulih. Hiji ketukan dina tombol murid langsung nyatet manéhna dina jam ayeuna. Hiji pesen némbongan sakedap jeung tombol Batalkeun lamun Anjeun lepat ngetuk. Status Telat diitung otomatis ku sistem tina wates jam telat dina Pangaturan absénsi, sarta hasilna némbongan dina lencana murid.',
            steps: [
              'Buka menu Absén datang & mulih.',
              'Pilih kelas. Angka di gigireun ngaran kelas nuduhkeun sabaraha nu geus datang, geus mulih, jeung acan datang.',
              'Pilih Datang atawa Mulih.',
              'Ketuk tombol dina baris murid. Murid nu geus kacatet nuduhkeun jamna; ketuk pikeun ngoréksina.',
            ],
            tip: 'Murid nu izin, gering, atawa alpa teu milu kacatet waktu Anjeun nandaan sakaligus. Robah statusna ngaliwatan koréksi lamun ternyata hadir.',
          },
          {
            heading: 'Nyatet pikeun jam nu geus kaliwat',
            body: 'Eusian kolom Jam siga 07:15 pikeun nyatet jam nu tangtu. Kosong hartina ayeuna. Pikeun tanggal nu geus kaliwat jam wajib dieusian. Jam teu meunang di mangsa nu bakal datang, sarta tanggal nu acan datang teu bisa dicatet.',
          },
          {
            heading: 'Nandaan loba murid sakaligus',
            body: 'Tandaan sadayana hadir (acan datang) nyatet sakabéh murid sakelas nu acan boga catetan datang jeung teu ditandaan izin, gering, atawa alpa. Dina mode Mulih, tombolna nandaan sakabéh nu geus datang tapi acan mulih. Pikeun sawaréh murid wungkul, pake Pilih sababaraha, centang muridna, tuluy ketuk Catet. Hasil unggal murid diringkeskeun: geus kacatet (teu ditimpa), dilewat sabab izin/gering/alpa, mulih tanpa catetan datang, atawa jam nu teu lumrah.',
          },
          {
            heading: 'Koréksi jeung pambatalan',
            body: 'Ketuk ikon pénsil dina baris murid pikeun mupus jam datang atawa mulih, ngarobah jamna, atawa netepkeun status Izin, Gering, atawa Alpa jeung catetanana. Koréksi teu ngirim béwara ka wali. Lamun dua jam dikosongkeun, catetan poé éta dipupus.',
          },
          {
            heading: 'Poé libur',
            body: 'Dina tanggal libur atawa jeda sakola, kaca méré nyaho jeung tombol nyatet dikonci. Pilih Tetep catet lamun memang aya murid nu asup.',
          },
          {
            heading: 'Mindai QR dina kartu murid (cadangan kiosk)',
            body: 'Salian ti daptar kelas, kaca ieu boga tab Pindai QR: guru ngarahkeun kaméra ponsel kana QR dina kartu murid, tuluy datang atawa mulih langsung kacatet. Ieu ngan cadangan lamun kiosk RFID teu bisa dipaké (listrik pareum, pembaca rusak); kiosk RFID tetep cara utama. QR dina kartu nyaéta QR identitas murid: hiji kode acak unik per murid (lain NIS), dicitak otomatis dina kartu murid bawaan jeung dipaké sakabéh fitur; kode ngan nunjuk ka murid, sedengkeun ménu ieu anu nangtukeun tindakanana (nyatet datang atawa mulih). Pamindai peryogi login jeung idin absén, jadi QR waé teu méré aksés naon waé. Aturan aksés, itungan telat, panjaga poé libur, jeung béwara ka wali sarua jeung nyatet manual; catetanana ditandaan sumber QR jeung ngaran nu nyatet.',
            steps: [
              'Buka Absén datang & mulih tuluy pilih tab Pindai QR.',
              'Pilih Datang atawa Mulih nganggo tombol badag. Pilihanana diinget dina parangkat éta.',
              'Teke Hurungkeun kaméra tuluy idinan aksés kaméra lamun dipénta.',
              'Arahkeun kaméra kana QR kartu. Hasilna muncul badag (ngaran, kelas, jam, jeung Telat lamun enya) kalayan bip jeung geter; kaméra tetep hurung pikeun kartu saterusna.',
              'Lamun kaméra bermasalah, pindai QR nganggo aplikasi kaméra bawaan ponsel tuluy témpélkeun téksna (dimimitian ku ES1.) dina kolom Témpélkeun kode.',
            ],
            tip: 'QR nu sarua teu diprosés deui dina 4 detik, jeung QR séjén nu lain kartu murid (contona kode toko) diabaikeun. Daptar 20 pindaian panungtungan aya handapeun hasil. Kolom Ketik, témpélkeun, atawa pindai kode otomatis aktip: pamindai kode batang USB (anu jalanna kawas kibor) cukup diarahkeun ka kartu jeung kode diprosés lamun narima Enter. Kode batang ngaliwatan kaméra ngan dirojong dina Chrome atawa Edge; QR kabaca dina sakabéh panyungsi.',
            warning:
              'Kaméra dina panyungsi ngan jalan ngaliwatan HTTPS. Lamun Edusync dibuka nganggo alamat http:// biasa, kaméra ditolak panyungsi jeung ngan kolom Témpélkeun kode nu bisa dipaké. Lamun idin kaméra ditolak, idinan deui dina setélan situs panyungsi.',
            href: '/attendance/manual',
          },
          {
            heading: 'Lamun jaringan potong',
            body: 'Lamun pamenta gagal sabab euweuh jaringan, catetan disimpen dina parangkat ieu jeung jam aslina sarta spanduk Acan kakirim némbongan. Catetan dikirim otomatis sanggeus jaringan balik; Anjeun ogé bisa mencét Kirim ayeuna. Jam nu kacatet tetep jam waktu Anjeun ngetuk, lain jam waktu dikirim.',
            warning:
              'Catetan nu acan kakirim ngan aya dina parangkat éta. Entong mupus data situs panyungsi atawa ganti parangkat saméméh spanduk leungit. Catetan nu ditolak server waktu dikirim deui bakal dibuang jeung Anjeun dibéré nyaho.',
          },
          {
            heading: 'Mindai nalika jaringan potong, jeung kartu leungit',
            body: 'Pindaian nu gagal dikirim sabab jaringan disimpen dina parangkat jeung jam pindai aslina tuluy muncul dina spanduk Can dikirim; dikirim otomatis lamun jaringan balik jeung teu pernah kacatet dua kali. Pindaian leuwih ti 48 jam teu bisa dikirim tuluy dibuang. Lamun kartu leungit atawa QR-na bocor, admin muka Murid tuluy kartu murid éta jeung milih Jieun deui QR identitas: QR heubeul langsung teu kapaké di sakabéh fitur sakaligus (lain ngan absén) jeung kartu anyar kudu dicitak deui.',
          },
        ],
        faq: [
          {
            q: 'Kuring wali kelas tapi kelas kuring teu némbongan. Naha?',
            a: 'Kelas ngan némbongan lamun Anjeun kadaptar jadi wali kelasna dina taun ajaran aktip. Menta admin netepkeun Anjeun dina kaca Kelas.',
          },
          {
            q: 'Murid geus tap kartu tapi kuring ngetuk deui. Naha dobel?',
            a: 'Henteu. Catetan datang atawa mulih nu geus aya teu ditimpa jeung Anjeun dibéré nyaho yén muridna geus kacatet. Pikeun ngarobah jamna, pake koréksi.',
          },
          {
            q: 'Aya pesen mulih tanpa catetan datang. Naon hartina?',
            a: 'Murid kacatet mulih padahal acan kacatet datang. Catetanana tetep disimpen; lengkepan jam datangna ngaliwatan koréksi lamun peryogi.',
          },
        ],
      },
    },
  },
  {
    slug: 'schedule',
    icon: 'calendar',
    tone: 'sky',
    group: 'attendance',
    module: 'schedule',
    text: {
      id: {
        title: 'Menyusun jadwal pelajaran',
        summary: 'Atur jam pelajaran, isi jadwal tiap kelas, dan lihat jadwal per kelas atau per guru.',
        forWho:
          'Staf Kurikulum, Operator, dan Admin sekolah yang menyusun jadwal; peran lain hanya bisa melihat.',
        sections: [
          {
            heading: 'Mengatur jam pelajaran',
            body: 'Jam pelajaran adalah nomor dan rentang waktu tiap pelajaran. Bila belum ada, buat otomatis (1 sampai 14 jam, 10 sampai 120 menit per jam, istirahat boleh ditambahkan). Isian awalnya diambil dari Pengaturan sekolah.',
            steps: [
              'Buka menu Jadwal pelajaran, lalu Jam pelajaran.',
              'Isi Mulai, Jumlah jam, Menit per jam, dan Istirahat setelah jam ke- bila ada.',
              'Klik Buat otomatis.',
              'Untuk menambah satu jam saja, isi Nomor, Mulai, dan Selesai lalu klik Tambah jam.',
            ],
            warning:
              'Buat otomatis ditolak bila jam pelajaran sudah ada. Jam yang sudah dipakai di jadwal tidak bisa dihapus.',
            href: '/schedule',
          },
          {
            heading: 'Mengisi jadwal sebuah kelas',
            body: 'Setiap kotak jadwal berisi mata pelajaran beserta gurunya. Gurunya otomatis guru pengampu mata pelajaran itu di kelas tersebut, jadi tetapkan dulu guru pengampu di halaman Kelas.',
            steps: [
              'Pilih tampilan Per kelas, lalu pilih kelasnya.',
              'Klik kotak pada hari dan jam yang dikehendaki (Isi pelajaran).',
              'Pilih mata pelajaran. Yang muncul hanya yang sudah punya guru pengampu di kelas itu.',
              'Klik Simpan.',
            ],
            warning:
              'Seorang guru tidak bisa mengajar di dua kelas pada hari dan jam yang sama. Jadwal yang bentrok ditolak.',
          },
          {
            heading: 'Mengganti atau mengosongkan isi jadwal',
            body: 'Isi kotak jadwal bisa diganti kapan saja. Absensi per jam memakai jadwal ini, jadi pastikan sudah benar sebelum dipakai.',
            steps: [
              'Di tampilan Per kelas, klik kotak yang ingin diubah.',
              'Pilih mata pelajaran lain lalu klik Simpan, atau klik Kosongkan untuk menghapus isi kotak.',
              'Periksa kembali kotak itu di tampilan yang diperbarui.',
            ],
            tip: 'Bila guru berganti, cukup ganti guru pengampu di halaman Kelas, lalu cek jadwalnya.',
          },
          {
            heading: 'Melihat jadwal per guru',
            body: 'Tampilan Per guru menunjukkan jadwal mengajar satu guru di semua kelas. Hari yang tampil mengikuti Pengaturan sekolah. Gunakan tampilan ini untuk memeriksa apakah seorang guru terlalu padat atau bentrok.',
          },
        ],
        faq: [
          {
            q: 'Kenapa mata pelajaran tidak muncul saat saya mengisi jadwal?',
            a: 'Mata pelajaran baru muncul bila sudah ada guru pengampu di kelas itu. Buka halaman Kelas, pilih Guru pengampu pada kelasnya, dan tetapkan guru untuk mata pelajaran tersebut.',
          },
          {
            q: 'Jadwal saya ditolak karena bentrok. Apa artinya?',
            a: 'Guru yang sama sudah mengajar di kelas lain pada hari dan jam yang sama. Pilih jam lain, atau cek jadwal Per guru untuk melihat jam yang masih kosong.',
          },
          {
            q: 'Jam pelajaran tidak bisa dihapus. Kenapa?',
            a: 'Jam itu masih dipakai di jadwal sebuah kelas. Kosongkan dulu kotak yang memakainya, lalu hapus jamnya.',
          },
          {
            q: 'Tombol Buat otomatis ditolak. Bagaimana?',
            a: 'Itu terjadi bila jam pelajaran sudah ada. Ubah atau tambah jam secara manual, bukan dengan Buat otomatis.',
          },
        ],
      },
      en: {
        title: 'Building the timetable',
        summary:
          'Set up lesson periods, fill in each class timetable, and view the timetable by class or by teacher.',
        forWho:
          'Curriculum staff, Operators, and School admins who build the timetable; other roles can only view.',
        sections: [
          {
            heading: 'Setting up lesson periods',
            body: 'Lesson periods are the number and time range of each lesson. If none exist yet, generate them (1 to 14 periods, 10 to 120 minutes each, a break can be added). The starting values come from School settings.',
            steps: [
              'Open the Timetable menu, then Lesson periods.',
              'Fill in Start, Number of periods, Minutes per period, and Break after period if any.',
              'Click Generate.',
              'To add just one period, fill in Number, Start, and End, then click Add period.',
            ],
            warning:
              'Generate is refused when lesson periods already exist. A period already used in the timetable cannot be deleted.',
            href: '/schedule',
          },
          {
            heading: 'Filling in a class timetable',
            body: 'Each timetable box holds a subject and its teacher. The teacher is automatically the one assigned to that subject in that class, so assign them on the Classes page first.',
            steps: [
              'Choose the By class view, then pick the class.',
              'Click the box for the day and period you want (Add lesson).',
              'Pick the subject. Only subjects that already have an assigned teacher in that class appear.',
              'Click Save.',
            ],
            warning:
              'A teacher cannot teach two classes at the same day and period. A clashing entry is rejected.',
          },
          {
            heading: 'Changing or clearing a timetable box',
            body: 'The content of a box can be changed at any time. Lesson attendance uses this timetable, so make sure it is correct before it is used.',
            steps: [
              'In the By class view, click the box you want to change.',
              'Pick another subject and click Save, or click Clear to empty the box.',
              'Check the box again in the refreshed view.',
            ],
            tip: 'If a teacher changes, just change the assigned teacher on the Classes page, then check the timetable.',
          },
          {
            heading: 'Viewing the timetable by teacher',
            body: 'The By teacher view shows the teaching timetable of one teacher across all classes. The days shown follow School settings. Use this view to check whether a teacher is overloaded or clashing.',
          },
        ],
        faq: [
          {
            q: 'Why does the subject not appear when I fill in the timetable?',
            a: 'A subject appears only once the class has an assigned teacher for it. Open the Classes page, choose Assigned teachers on the class, and assign a teacher for that subject.',
          },
          {
            q: 'My entry was rejected because of a clash. What does that mean?',
            a: 'The same teacher already teaches another class on the same day and period. Pick another period, or look at the By teacher view to see which periods are free.',
          },
          {
            q: 'A lesson period cannot be deleted. Why?',
            a: 'That period is still used in a class timetable. Clear the boxes that use it first, then delete the period.',
          },
          {
            q: 'The Generate button is refused. What now?',
            a: 'It happens when lesson periods already exist. Edit or add periods by hand instead of using Generate.',
          },
        ],
      },
      su: {
        title: 'Nyusun jadwal pangajaran',
        summary:
          'Atur jam pangajaran, eusian jadwal unggal kelas, jeung tingali jadwal per kelas atawa per guru.',
        forWho:
          'Staf Kurikulum, Operator, jeung Admin sakola nu nyusun jadwal; peran séjén ngan bisa ningali.',
        sections: [
          {
            heading: 'Ngatur jam pangajaran',
            body: 'Jam pangajaran nyaéta nomer jeung rentang waktu unggal pangajaran. Lamun acan aya, jieun otomatis (1 nepi ka 14 jam, 10 nepi ka 120 menit per jam, istirahat meunang ditambahkeun). Eusian awalna dicokot tina Setélan sakola.',
            steps: [
              'Buka menu Jadwal pangajaran, tuluy Jam pangajaran.',
              'Eusian Mimiti, Jumlah jam, Menit per jam, jeung Istirahat sanggeus jam ka- lamun aya.',
              'Klik Jieun otomatis.',
              'Pikeun nambah hiji jam waé, eusian Nomer, Mimiti, jeung Réngsé tuluy klik Tambih jam.',
            ],
            warning:
              'Jieun otomatis ditolak lamun jam pangajaran geus aya. Jam nu geus dipaké dina jadwal teu bisa dipupus.',
            href: '/schedule',
          },
          {
            heading: 'Ngeusian jadwal hiji kelas',
            body: 'Unggal kotak jadwal ngandung mata pelajaran jeung gurunya. Gurunya otomatis guru pangampu mata pelajaran éta di kelas éta, jadi tetepkeun heula guru pangampu dina kaca Kelas.',
            steps: [
              'Pilih témbongan Per kelas, tuluy pilih kelasna.',
              'Klik kotak dina poé jeung jam nu dipikahayang (Eusian pelajaran).',
              'Pilih mata pelajaran. Nu kaluar ngan nu geus boga guru pangampu di kelas éta.',
              'Klik Simpen.',
            ],
            warning:
              'Hiji guru teu bisa ngajar di dua kelas dina poé jeung jam nu sarua. Jadwal nu bentrok ditolak.',
          },
          {
            heading: 'Ngaganti atawa ngosongkeun eusi jadwal',
            body: 'Eusi kotak jadwal bisa diganti iraha waé. Absénsi per jam maké jadwal ieu, jadi pastikeun geus bener saméméh dipaké.',
            steps: [
              'Dina témbongan Per kelas, klik kotak nu rék dirobah.',
              'Pilih mata pelajaran séjén tuluy klik Simpen, atawa klik Kosongkeun pikeun mupus eusi kotak.',
              'Pariksa deui kotak éta dina témbongan nu geus dianyarkeun.',
            ],
            tip: 'Lamun guru ganti, cekap ganti guru pangampu dina kaca Kelas, tuluy pariksa jadwalna.',
          },
          {
            heading: 'Ningali jadwal per guru',
            body: 'Témbongan Per guru nuduhkeun jadwal ngajar hiji guru di sakabéh kelas. Poé nu kaciri nuturkeun Setélan sakola. Anggo témbongan ieu pikeun mariksa naha hiji guru kapadetan atawa bentrok.',
          },
        ],
        faq: [
          {
            q: 'Naha mata pelajaran teu kaluar waktu ngeusian jadwal?',
            a: 'Mata pelajaran kaluar ngan lamun kelasna geus boga guru pangampu pikeun éta. Buka kaca Kelas, pilih Guru pangampu dina kelasna, tuluy tetepkeun guru pikeun mata pelajaran éta.',
          },
          {
            q: 'Eusian kuring ditolak sabab bentrok. Naon hartina?',
            a: 'Guru nu sarua geus ngajar di kelas séjén dina poé jeung jam nu sarua. Pilih jam séjén, atawa tingali témbongan Per guru pikeun nyaho jam nu masih kosong.',
          },
          {
            q: 'Jam pangajaran teu bisa dipupus. Naha?',
            a: 'Jam éta masih dipaké dina jadwal hiji kelas. Kosongkeun heula kotak nu maké, tuluy pupus jamna.',
          },
          {
            q: 'Tombol Jieun otomatis ditolak. Kumaha?',
            a: 'Éta kajadian lamun jam pangajaran geus aya. Robah atawa tambahan jam sacara manual, lain ku Jieun otomatis.',
          },
        ],
      },
    },
  },
  {
    slug: 'members-roles',
    icon: 'shield',
    tone: 'rose',
    group: 'access',
    text: {
      id: {
        title: 'Mengelola anggota, peran, dan kata sandi',
        summary:
          'Undang anggota lewat email, atur peran siapa boleh apa, dan bantu pengguna yang lupa kata sandi.',
        forWho:
          'Admin sekolah, yang mengatur siapa saja yang boleh memakai aplikasi dan apa yang boleh dilakukannya.',
        sections: [
          {
            heading: 'Mengundang orang baru lewat email',
            body: 'Undangan berupa tautan yang dikirim ke email dan berlaku 7 hari. Orang yang belum punya akun membuatnya saat menerima undangan, dan harus memakai email yang sama dengan yang diundang.',
            steps: [
              'Buka menu Anggota di kelompok Pengguna dan akses, lalu klik Undang anggota.',
              'Isi email dan pilih minimal satu peran.',
              'Klik Kirim undangan.',
              'Pantau di Undangan menunggu. Gunakan Kirim ulang bila belum diterima, atau Cabut bila salah kirim.',
            ],
            tip: 'Bila undangan tidak sampai, minta penerima memeriksa folder spam, lalu coba Kirim ulang.',
            href: '/members',
          },
          {
            heading: 'Mengganti peran atau menonaktifkan anggota',
            body: 'Izin seseorang adalah gabungan semua peran yang ia pegang di unit sekolah ini. Daftar anggota bisa dicari menurut nama atau email, dan disaring menurut status atau peran.',
            steps: [
              'Di menu Anggota, klik menu baris anggota lalu pilih Ubah peran.',
              'Pilih peran yang sesuai, lalu klik Simpan.',
              'Untuk mencabut semua izin sementara, pilih Nonaktifkan. Pilih Aktifkan untuk mengembalikannya.',
            ],
            warning:
              'Unit sekolah harus selalu punya minimal satu admin aktif, dan Anda tidak bisa menonaktifkan diri sendiri.',
          },
          {
            heading: 'Membuat peran khusus',
            body: 'Peran adalah kumpulan izin, dan perubahan langsung berlaku untuk semua pemegangnya. Peran bawaan (Admin sekolah, Kepala sekolah, Kurikulum, Bendahara, Operator, Guru) ada di setiap unit sekolah. Peran khusus dibuat per unit sekolah dan tidak terbawa ke unit lain.',
            steps: [
              'Buka menu Peran.',
              'Klik Buat peran kustom, lalu isi nama peran.',
              'Centang izin per bagian (Lihat, Kelola, dan seterusnya). Minimal satu izin.',
              'Klik Buat peran, lalu berikan peran itu ke anggota lewat menu Anggota.',
            ],
            warning:
              'Peran yang Anda berikan atau buat tidak boleh punya izin lebih banyak daripada izin Anda sendiri. Peran bawaan tidak bisa dihapus (peran Admin sekolah juga tidak bisa diubah), dan peran khusus hanya bisa dihapus bila tidak dipegang siapa pun.',
            href: '/roles',
          },
          {
            heading: 'Memulihkan kata sandi yang lupa',
            body: 'Pengguna yang lupa kata sandi bisa memulihkannya sendiri dengan kode 6 digit yang dikirim ke email atau WhatsApp. Kode berlaku 10 menit, hanya sekali pakai, dan hangus setelah 5 kali salah. Pengguna bisa mengisi email, nama pengguna, atau NIK (lihat artikel Masuk dan pemulihan akun).',
            steps: [
              'Di halaman masuk, klik tautan Lupa kata sandi.',
              'Isi email, lalu klik kirim kode.',
              'Isi kode 6 digit dari email, lalu isi kata sandi baru (minimal 12 karakter) dua kali.',
              'Bila kode belum datang atau sudah hangus, klik kirim ulang (bisa dipakai setelah 60 detik).',
              'Setelah berhasil, semua sesi lama otomatis keluar. Masuk lagi dengan kata sandi baru.',
            ],
            tip: 'Demi keamanan, aplikasi selalu menjawab berhasil walau email tidak terdaftar. Bila kode tidak datang, periksa penulisan email dan folder spam.',
            href: '/forgot-password',
          },
          {
            heading: 'Membantu pengguna yang tidak bisa menerima email atau kode WhatsApp',
            body: 'Wali, guru, atau siswa yang tidak bisa menerima email maupun kode WhatsApp bisa melapor lewat halaman Bantuan kata sandi di alamat sekolah (/bantuan-sandi). Laporan masuk ke menu Permintaan reset sandi. Admin sekolah dan operator memeriksa identitas pelapor, lalu membuat tautan reset sekali pakai yang bisa disalin, dikirim ke email akun, atau dikirim lewat WhatsApp.',
            steps: [
              'Buka menu Permintaan reset sandi dan pilih laporan yang berstatus Baru.',
              'Verifikasi pelapor: telepon balik ke nomor kontak yang tertera (bukan nomor lain), lalu tanyakan nama anak, kelas, atau data lain yang hanya diketahui pemilik akun.',
              'Bandingkan isian pelapor dengan akun yang cocok otomatis. Bila tidak ada yang cocok, cari akunnya sendiri di daftar anggota.',
              'Klik Buat tautan reset. Tautan hanya tampil sekali dan berlaku 24 jam.',
              'Salin tautan, atau klik Kirim ke email, atau Buka WhatsApp untuk mengirimnya ke pemilik akun.',
              'Setelah pemilik membuat kata sandi baru, laporan otomatis berstatus Selesai dan semua sesi lamanya keluar.',
            ],
            warning:
              'Jangan membagikan tautan reset di grup atau tempat umum, dan jangan mereset akun tanpa memverifikasi pelapor. Akun admin sekolah dan operator, staf platform, pemilik lembaga, serta akun yang juga terdaftar di sekolah lain tidak dapat direset lewat jalur ini. Pembuatan tautan baru mencabut tautan lama untuk akun yang sama.',
            tip: 'Tautan bisa juga dibuat langsung dari menu aksi baris di halaman Anggota tanpa menunggu laporan.',
            href: '/password-help',
          },
        ],
        faq: [
          {
            q: 'Orang yang saya undang bilang tautannya tidak bisa dipakai. Kenapa?',
            a: 'Tautan berlaku 7 hari dan harus dibuka dengan email yang sama dengan yang diundang. Cabut undangan lama di Undangan menunggu, lalu kirim undangan baru ke email yang benar.',
          },
          {
            q: 'Saya tidak bisa menonaktifkan atau mengubah peran seorang admin. Kenapa?',
            a: 'Unit sekolah harus selalu punya minimal satu admin aktif. Jadikan orang lain admin lebih dulu, baru ubah atau nonaktifkan yang tadi. Anda juga tidak bisa menonaktifkan diri sendiri.',
          },
          {
            q: 'Peran tidak bisa dihapus. Apa yang harus saya lakukan?',
            a: 'Peran bawaan memang tidak bisa dihapus. Peran khusus hanya bisa dihapus bila tidak dipegang siapa pun. Ganti dulu peran anggota yang masih memakainya lewat menu Anggota.',
          },
          {
            q: 'Kode untuk mengganti kata sandi sudah hangus atau salah tiga kali. Bagaimana?',
            a: 'Minta kode baru dengan klik kirim ulang (tersedia setelah 60 detik). Kode lama tidak bisa dipakai lagi. Gunakan kode terbaru yang masuk ke email, paling lambat 10 menit sejak dikirim.',
          },
        ],
      },
      en: {
        title: 'Managing members, roles, and passwords',
        summary:
          'Invite members by email, set who may do what with roles, and help users who forgot their password.',
        forWho: 'School admins, who decide who may use the app and what they may do.',
        sections: [
          {
            heading: 'Inviting a new person by email',
            body: 'An invitation is a link sent by email that is valid for 7 days. Someone without an account creates one when accepting the invitation, and must use the same email that was invited.',
            steps: [
              'Open the Members menu in the Users and access group, then click Invite a member.',
              'Enter the email and pick at least one role.',
              'Click Send invitation.',
              'Follow it under Pending invitations. Use Resend if it has not been accepted, or Revoke if it was sent by mistake.',
            ],
            tip: 'If the invitation does not arrive, ask the recipient to check the spam folder, then try Resend.',
            href: '/members',
          },
          {
            heading: 'Changing a role or deactivating a member',
            body: 'A person permissions are the combination of all the roles they hold in this school unit. The member list can be searched by name or email, and filtered by status or role.',
            steps: [
              'In the Members menu, click the member row menu and choose Edit roles.',
              'Pick the right roles, then click Save.',
              'To withdraw all permissions for now, choose Deactivate. Choose Activate to restore them.',
            ],
            warning:
              'A school unit must always keep at least one active admin, and you cannot deactivate yourself.',
          },
          {
            heading: 'Creating a custom role',
            body: 'A role is a set of permissions, and a change applies at once to everyone holding it. The built-in roles (School admin, Principal, Curriculum, Treasurer, Operator, Teacher) exist in every school unit. Custom roles are created per school unit and do not carry over to other units.',
            steps: [
              'Open the Roles menu.',
              'Click Create a custom role, then enter the role name.',
              'Tick permissions per area (View, Manage, and so on). At least one.',
              'Click Create role, then give the role to members through the Members menu.',
            ],
            warning:
              'A role you give or create cannot hold more permissions than you have yourself. Built-in roles cannot be deleted (the School admin role cannot be edited either), and a custom role can only be deleted when nobody holds it.',
            href: '/roles',
          },
          {
            heading: 'Recovering a forgotten password',
            body: 'Users who forgot their password can recover it themselves with a 6-digit code sent by email or WhatsApp. The code is valid for 10 minutes, can be used once, and expires after 5 wrong attempts. Users can enter an email, username, or NIK (see the article Signing in and account recovery).',
            steps: [
              'On the sign-in page, click the Forgot password link.',
              'Enter the email, then click send code.',
              'Enter the 6-digit code from the email, then the new password (at least 12 characters) twice.',
              'If the code has not arrived or has expired, click resend (available after 60 seconds).',
              'Once it succeeds, all old sessions are signed out. Sign in again with the new password.',
            ],
            tip: 'For safety, the app always answers success even if the email is not registered. If no code arrives, check the email spelling and the spam folder.',
            href: '/forgot-password',
          },
          {
            heading: 'Helping a user who cannot receive email or a WhatsApp code',
            body: 'A guardian, teacher, or student who can receive neither email nor a WhatsApp code can report it on the Password help page at the school address (/bantuan-sandi). The report lands in the Password reset requests menu. School admins and operators verify who the person is, then create a one-time reset link that can be copied, emailed to the account, or sent by WhatsApp.',
            steps: [
              'Open the Password reset requests menu and pick a report with the status New.',
              'Verify the reporter: call back the contact number shown (not any other number) and ask for the childs name, class, or other details only the account owner would know.',
              'Compare what the reporter entered with the automatically matched account. If nothing matches, find the account yourself in the member list.',
              'Click Create reset link. The link is shown only once and is valid for 24 hours.',
              'Copy the link, or click Send to email, or Open WhatsApp to deliver it to the account owner.',
              'Once the owner sets a new password, the report becomes Done automatically and all their old sessions are signed out.',
            ],
            warning:
              'Never share a reset link in a group chat or any public place, and never reset an account without verifying the reporter. School admin and operator accounts, platform staff, foundation owners, and accounts that also belong to another school cannot be reset this way. Creating a new link revokes the old one for the same account.',
            tip: 'A link can also be created straight from the row action menu on the Members page, without waiting for a report.',
            href: '/password-help',
          },
        ],
        faq: [
          {
            q: 'The person I invited says the link does not work. Why?',
            a: 'The link is valid for 7 days and must be opened with the same email that was invited. Revoke the old invitation under Pending invitations, then send a new one to the correct email.',
          },
          {
            q: 'I cannot deactivate or change the role of an admin. Why?',
            a: 'A school unit must always keep at least one active admin. Make someone else an admin first, then change or deactivate the earlier one. You also cannot deactivate yourself.',
          },
          {
            q: 'A role cannot be deleted. What should I do?',
            a: 'Built-in roles cannot be deleted. A custom role can only be deleted when nobody holds it. First change the roles of members who still use it through the Members menu.',
          },
          {
            q: 'The code to change the password has expired or was wrong three times. What now?',
            a: 'Request a new code by clicking resend (available after 60 seconds). The old code cannot be used any more. Use the latest code that reached the email, within 10 minutes of being sent.',
          },
        ],
      },
      su: {
        title: 'Ngatur anggota, peran, jeung kecap sandi',
        summary:
          'Uleman anggota ku surélék, atur saha meunang naon ku peran, sarta bantuan pamaké nu poho kecap sandi.',
        forWho:
          'Admin sakola, nu ngatur saha waé nu meunang maké aplikasi jeung naon nu meunang dilakukeunana.',
        sections: [
          {
            heading: 'Ngulemanan jalma anyar ku surélék',
            body: 'Uleman mangrupa tumbu nu dikirim ka surélék sarta lumaku 7 poé. Jalma nu acan boga akun nyieun akun waktu narima uleman, sarta kudu maké surélék nu sarua jeung nu diulemanan.',
            steps: [
              'Buka menu Anggota dina kelompok Pamaké jeung aksés, tuluy klik Uleman anggota.',
              'Eusian surélék tuluy pilih sahenteuna hiji peran.',
              'Klik Kirim uleman.',
              'Titénan dina Uleman nu ngantosan. Anggo Kirim deui lamun acan ditarima, atawa Cabut lamun lepat ngirim.',
            ],
            tip: 'Lamun uleman teu nepi, menta panarimana mariksa folder spam, tuluy cobaan Kirim deui.',
            href: '/members',
          },
          {
            heading: 'Ngaganti peran atawa nonaktipkeun anggota',
            body: 'Idin hiji jalma nyaéta gabungan sakabéh peran nu dicepeng di unit sakola ieu. Daptar anggota bisa diteangan ku ngaran atawa surélék, sarta disaring nurutkeun status atawa peran.',
            steps: [
              'Dina menu Anggota, klik menu baris anggota tuluy pilih Robah peran.',
              'Pilih peran nu luyu, tuluy klik Simpen.',
              'Pikeun nyabut sakabéh idin samentara, pilih Nonaktipkeun. Pilih Aktifkeun pikeun mulangkeunana.',
            ],
            warning:
              'Unit sakola kudu salawasna boga sahenteuna hiji admin aktip, sarta Anjeun teu bisa nonaktipkeun diri sorangan.',
          },
          {
            heading: 'Nyieun peran husus',
            body: 'Peran nyaéta kumpulan idin, sarta parobahan langsung lumaku pikeun sakabéh nu nyepengna. Peran dasar (Admin sakola, Kapala sakola, Kurikulum, Bendahara, Operator, Guru) aya di unggal unit sakola. Peran husus dijieun per unit sakola sarta teu kabawa ka unit séjén.',
            steps: [
              'Buka menu Peran.',
              'Klik Jieun peran kustom, tuluy eusian ngaran peran.',
              'Centang idin per bagian (Tingali, Atur, jeung sajabana). Sahenteuna hiji.',
              'Klik Jieun peran, tuluy pasihkeun peran éta ka anggota lewat menu Anggota.',
            ],
            warning:
              'Peran nu dipasihkeun atawa dijieun teu meunang boga idin leuwih loba tibatan idin Anjeun sorangan. Peran dasar teu bisa dipupus (peran Admin sakola ogé teu bisa dirobah), sarta peran husus ngan bisa dipupus lamun teu aya nu nyepengna.',
            href: '/roles',
          },
          {
            heading: 'Mulihkeun kecap sandi nu poho',
            body: 'Pamaké nu poho kecap sandi bisa mulihkeunana sorangan ku kode 6 angka nu dikirim ka surélék atawa WhatsApp. Kode lumaku 10 menit, ngan bisa dipaké sakali, sarta hangus sanggeus 5 kali lepat. Pamaké bisa ngeusian surélék, ngaran pamaké, atawa NIK (tingali artikel Asup jeung mulihkeun akun).',
            steps: [
              'Dina kaca lebet, klik tumbu Poho kecap sandi.',
              'Eusian surélék, tuluy klik kirim kode.',
              'Eusian kode 6 angka tina surélék, tuluy kecap sandi anyar (sahenteuna 12 karakter) dua kali.',
              'Lamun kode acan datang atawa geus hangus, klik kirim deui (sayogi sanggeus 60 detik).',
              'Sanggeus hasil, sakabéh sési heubeul otomatis kaluar. Lebet deui maké kecap sandi anyar.',
            ],
            tip: 'Pikeun kaamanan, aplikasi salawasna ngajawab hasil sanajan surélék teu kadaptar. Lamun kode teu datang, pariksa panulisan surélék jeung folder spam.',
            href: '/forgot-password',
          },
          {
            heading: 'Mantuan pamaké nu teu bisa narima surélék atawa kode WhatsApp',
            body: 'Wali, guru, atawa murid nu teu bisa narima surélék boh kode WhatsApp bisa ngalapor lewat kaca Bantuan kecap sandi di alamat sakola (/bantuan-sandi). Laporanana asup kana menu Pamundut reset kecap sandi. Admin sakola jeung operator mariksa saha nu ngalapor, tuluy nyieun tumbu reset sakali-pamakéan nu bisa disalin, dikirim ka surélék akun, atawa dikirim lewat WhatsApp.',
            steps: [
              'Buka menu Pamundut reset kecap sandi tuluy pilih laporan nu statusna Anyar.',
              'Pariksa nu ngalapor: telepon balik ka nomer kontak nu aya (lain nomer sejen), tuluy tanyakeun ngaran anak, kelas, atawa data sejen nu ngan dipikanyaho nu boga akun.',
              'Bandingkeun eusian nu ngalapor jeung akun nu cocok sacara otomatis. Lamun euweuh nu cocok, golétan akunna sorangan dina daptar anggota.',
              'Klik Jieun tumbu reset. Tumbu ngan mucunghul sakali sarta lumaku 24 jam.',
              'Salin tumbu, atawa klik Kirim ka surélék, atawa Buka WhatsApp pikeun ngirimkeunana ka nu boga akun.',
              'Sanggeus nu boga nyieun kecap sandi anyar, laporan otomatis jadi Rengse sarta sakabéh sési heubeulna kaluar.',
            ],
            warning:
              'Ulah ngabagikeun tumbu reset di grup atawa tempat umum, sarta ulah ngareset akun tanpa mariksa nu ngalapor. Akun admin sakola jeung operator, staf platform, nu boga lembaga, sarta akun nu kadaptar ogé di sakola séjén teu bisa direset lewat jalur ieu. Nyieun tumbu anyar bakal nyabut tumbu heubeul pikeun akun nu sarua.',
            tip: 'Tumbu bisa ogé dijieun langsung tina menu aksi baris di kaca Anggota tanpa ngadagoan laporan.',
            href: '/password-help',
          },
        ],
        faq: [
          {
            q: 'Jalma nu kuring uleman nyebutkeun tumbuna teu bisa dipaké. Naha?',
            a: 'Tumbu lumaku 7 poé sarta kudu dibuka ku surélék nu sarua jeung nu diulemanan. Cabut uleman heubeul dina Uleman nu ngantosan, tuluy kirim uleman anyar ka surélék nu bener.',
          },
          {
            q: 'Kuring teu bisa nonaktipkeun atawa ngarobah peran hiji admin. Naha?',
            a: 'Unit sakola kudu salawasna boga sahenteuna hiji admin aktip. Jadikeun jalma séjén admin heula, nembé robah atawa nonaktipkeun nu tadi. Anjeun ogé teu bisa nonaktipkeun diri sorangan.',
          },
          {
            q: 'Peran teu bisa dipupus. Naon nu kudu dilakukeun?',
            a: 'Peran dasar mémang teu bisa dipupus. Peran husus ngan bisa dipupus lamun teu aya nu nyepengna. Robah heula peran anggota nu masih maké éta lewat menu Anggota.',
          },
          {
            q: 'Kode pikeun ngaganti kecap sandi geus hangus atawa lepat tilu kali. Kumaha?',
            a: 'Menta kode anyar ku klik kirim deui (sayogi sanggeus 60 detik). Kode heubeul teu bisa dipaké deui. Anggo kode panungtung nu asup ka surélék, pangpangna 10 menit ti saprak dikirim.',
          },
        ],
      },
    },
  },
  {
    slug: 'my-profile',
    icon: 'lock',
    tone: 'slate',
    group: 'access',
    text: {
      id: {
        title: 'Profil saya: nama, kata sandi, dan perangkat',
        summary:
          'Ubah nama, ganti kata sandi, dan keluarkan perangkat yang tidak Anda kenali dari akun Anda.',
        forWho: 'Semua pengguna yang punya akun, apa pun perannya.',
        sections: [
          {
            heading: 'Membuka profil Anda',
            body: 'Profil ada di menu yang muncul saat Anda mengklik nama Anda di pojok kanan atas.',
            steps: ['Klik nama atau foto inisial Anda di pojok kanan atas.', 'Pilih Profil saya.'],
            href: '/profile',
          },
          {
            heading: 'Mengubah nama',
            body: 'Nama tampil di daftar anggota dan di bagian atas halaman. Email dipakai untuk masuk dan tidak bisa diubah di sini.',
            steps: [
              'Di kartu Profil, ubah isian Nama lengkap.',
              'Klik Simpan nama. Tombol baru aktif setelah nama berubah.',
            ],
            tip: 'Nama minimal 2 huruf.',
          },
          {
            heading: 'Mengganti kata sandi',
            body: 'Anda perlu mengisi kata sandi saat ini sebelum menggantinya. Kata sandi baru minimal 12 karakter.',
            steps: [
              'Di kartu Ganti kata sandi, isi Kata sandi saat ini.',
              'Isi Kata sandi baru, lalu ulangi di Ulangi kata sandi baru.',
              'Klik Simpan kata sandi.',
            ],
            tip: 'Pakai kalimat yang mudah diingat tetapi panjang, misalnya empat kata acak, lebih aman daripada satu kata dengan angka.',
            warning:
              'Setelah kata sandi diganti, semua perangkat lain yang sedang masuk dengan akun Anda otomatis keluar. Perangkat yang sedang Anda pakai tetap masuk.',
          },
          {
            heading: 'Mengeluarkan perangkat yang tidak dikenal',
            body: 'Kartu Perangkat yang sedang masuk menampilkan setiap perangkat yang masih masuk dengan akun Anda, lengkap dengan peramban, sistem, waktu masuk, dan alamat jaringannya.',
            steps: [
              'Lihat daftar perangkat. Perangkat yang sedang Anda pakai ditandai Perangkat ini.',
              'Klik Keluarkan pada perangkat yang tidak Anda kenali.',
              'Untuk mengeluarkan semuanya sekaligus, klik Keluarkan semua perangkat lain.',
            ],
            warning: 'Bila ada perangkat yang tidak Anda kenali, keluarkan lalu segera ganti kata sandi.',
          },
        ],
        faq: [
          {
            q: 'Bagaimana mengganti email saya?',
            a: 'Email tidak bisa diubah sendiri dari halaman profil. Hubungi admin untuk meminta penggantian.',
          },
          {
            q: 'Saya lupa kata sandi saat ini, bagaimana mengganti?',
            a: 'Keluar dulu, lalu di halaman masuk klik Lupa kata sandi. Kode 6 digit dikirim ke email Anda dan berlaku 10 menit; dengan kode itu Anda bisa membuat kata sandi baru.',
          },
          {
            q: 'Kenapa saya tiba-tiba keluar dari perangkat lain?',
            a: 'Itu terjadi setelah kata sandi diganti, atau bila Anda atau admin mengeluarkan perangkat itu dari daftar perangkat. Masuk lagi dengan kata sandi yang baru.',
          },
          {
            q: 'Muncul perangkat tak dikenal di daftar, apakah akun saya diretas?',
            a: 'Belum tentu: perangkat lama atau peramban yang pernah Anda pakai juga tampil. Bila ragu, keluarkan semua perangkat lain lalu ganti kata sandi.',
          },
        ],
      },
      en: {
        title: 'My profile: name, password, and devices',
        summary: 'Change your name, update your password, and sign out devices you do not recognise.',
        forWho: 'Everyone with an account, whatever their role.',
        sections: [
          {
            heading: 'Opening your profile',
            body: 'Your profile is in the menu that opens when you click your name at the top right.',
            steps: ['Click your name or initials at the top right.', 'Choose My profile.'],
            href: '/profile',
          },
          {
            heading: 'Changing your name',
            body: 'Your name appears in the member list and at the top of the page. Your email is used to sign in and cannot be changed here.',
            steps: [
              'In the Profile card, edit the Full name field.',
              'Click Save name. The button only turns on once the name has changed.',
            ],
            tip: 'A name needs at least 2 letters.',
          },
          {
            heading: 'Changing your password',
            body: 'You must enter your current password before changing it. The new password needs at least 12 characters.',
            steps: [
              'In the Change password card, fill in Current password.',
              'Fill in New password, then repeat it in Repeat new password.',
              'Click Save password.',
            ],
            tip: 'A long phrase that is easy to remember, such as four random words, is safer than one word with numbers.',
            warning:
              'Once the password is changed, every other device signed in to your account is signed out automatically. The device you are using stays signed in.',
          },
          {
            heading: 'Signing out a device you do not recognise',
            body: 'The Signed-in devices card lists every device still signed in to your account, with its browser, system, sign-in time, and network address.',
            steps: [
              'Look through the list. The device you are using is marked This device.',
              'Click Sign out on any device you do not recognise.',
              'To sign out all of them at once, click Sign out all other devices.',
            ],
            warning:
              'If you see a device you do not recognise, sign it out and change your password right away.',
          },
        ],
        faq: [
          {
            q: 'How do I change my email?',
            a: 'You cannot change your email yourself from the profile page. Ask an administrator to change it.',
          },
          {
            q: 'I forgot my current password. How do I change it?',
            a: 'Sign out, then click Forgot password on the sign-in page. A 6-digit code is sent to your email and is valid for 10 minutes; with it you can create a new password.',
          },
          {
            q: 'Why was I suddenly signed out on another device?',
            a: 'That happens after the password is changed, or when you or an administrator signed that device out of the list. Sign in again with the new password.',
          },
          {
            q: 'An unknown device is in the list. Has my account been hacked?',
            a: 'Not necessarily: old devices or browsers you used before also appear. If in doubt, sign out all other devices and change your password.',
          },
        ],
      },
      su: {
        title: 'Profil kuring: ngaran, kecap akses, jeung parangkat',
        summary:
          'Robah ngaran, ganti kecap akses, jeung kaluarkeun parangkat nu teu anjeun kenal tina akun anjeun.',
        forWho: 'Sakabéh pamaké nu boga akun, naon waé perananna.',
        sections: [
          {
            heading: 'Muka profil anjeun',
            body: 'Profil aya dina ménu nu muncul waktu anjeun ngaklik ngaran anjeun di juru katuhu luhur.',
            steps: ['Klik ngaran atawa inisial anjeun di juru katuhu luhur.', 'Pilih Profil kuring.'],
            href: '/profile',
          },
          {
            heading: 'Ngarobah ngaran',
            body: 'Ngaran kaciri dina daptar anggota jeung di luhureun kaca. Surélék dipaké pikeun asup jeung teu bisa dirobah di dieu.',
            steps: [
              'Dina kartu Profil, robah eusian Ngaran lengkep.',
              'Klik Simpen ngaran. Tombolna anyar aktip sanggeus ngaran robah.',
            ],
            tip: 'Ngaran sahenteuna 2 hurup.',
          },
          {
            heading: 'Ngaganti kecap akses',
            body: 'Anjeun kudu ngeusian kecap akses ayeuna samemeh ngagantina. Kecap akses anyar sahenteuna 12 karakter.',
            steps: [
              'Dina kartu Ganti kecap akses, eusian Kecap akses ayeuna.',
              'Eusian Kecap akses anyar, tuluy ulang dina Ulang kecap akses anyar.',
              'Klik Simpen kecap akses.',
            ],
            tip: 'Kalimah panjang nu gampang diinget, upamana opat kecap acak, leuwih aman tibatan hiji kecap jeung angka.',
            warning:
              'Sanggeus kecap akses diganti, sakabéh parangkat séjén nu keur asup maké akun anjeun otomatis kaluar. Parangkat nu keur dipaké tetep asup.',
          },
          {
            heading: 'Ngaluarkeun parangkat nu teu dikenal',
            body: 'Kartu Parangkat nu keur asup nuduhkeun unggal parangkat nu masih asup maké akun anjeun, lengkep jeung panyungsi, sistem, waktu asup, jeung alamat jaringanna.',
            steps: [
              'Tenjo daptar parangkat. Parangkat nu keur dipaké dicirian Parangkat ieu.',
              'Klik Kaluarkeun dina parangkat nu teu anjeun kenal.',
              'Pikeun ngaluarkeun kabéhna sakaligus, klik Kaluarkeun sakabéh parangkat séjén.',
            ],
            warning: 'Lamun aya parangkat nu teu anjeun kenal, kaluarkeun tuluy geuwat ganti kecap akses.',
          },
        ],
        faq: [
          {
            q: 'Kumaha ngaganti surélék kuring?',
            a: 'Surélék teu bisa dirobah sorangan tina kaca profil. Hubungi admin pikeun menta diganti.',
          },
          {
            q: 'Poho kecap akses ayeuna, kumaha ngagantina?',
            a: 'Kaluar heula, tuluy dina kaca asup klik Poho kecap sandi. Kode 6 angka dikirim ka surélék anjeun sarta lumaku 10 menit; maké kode éta anjeun bisa nyieun kecap akses anyar.',
          },
          {
            q: 'Naha kuring ujug-ujug kaluar tina parangkat séjén?',
            a: 'Éta kajadian sanggeus kecap akses diganti, atawa lamun anjeun atawa admin ngaluarkeun parangkat éta tina daptar. Asup deui maké kecap akses anyar.',
          },
          {
            q: 'Aya parangkat teu dikenal dina daptar, naha akun kuring dibobol?',
            a: 'Teu salawasna: parangkat atawa panyungsi lawas nu kungsi dipaké ogé kaciri. Lamun ragu, kaluarkeun sakabéh parangkat séjén tuluy ganti kecap akses.',
          },
        ],
      },
    },
  },
  {
    slug: 'sign-in-recovery',
    icon: 'lock',
    tone: 'slate',
    group: 'access',
    text: {
      id: {
        title: 'Masuk dan pemulihan akun',
        summary:
          'Masuk dengan email, nama pengguna, atau NIK, dan pulihkan akun lewat email atau WhatsApp bila lupa kata sandi.',
        forWho: 'Semua pengguna: staf, guru, wali murid, dan siswa.',
        sections: [
          {
            heading: 'Masuk dengan email, nama pengguna, atau NIK',
            body: 'Halaman masuk hanya punya satu isian: Email, nama pengguna, atau NIK. Isi salah satunya, lalu kata sandi. Bila ada yang salah, pesan yang tampil selalu sama (Identitas atau kata sandi salah) supaya orang lain tidak bisa menebak akun.',
            steps: [
              'Buka halaman masuk.',
              'Isi email, nama pengguna, atau NIK (16 digit) pada isian pertama.',
              'Isi kata sandi, lalu klik Masuk.',
            ],
            tip: 'NIK bisa dipakai hanya bila NIK itu terhubung ke tepat satu akun. Bila beberapa akun memakai NIK yang sama, masuklah dengan email atau nama pengguna.',
          },
          {
            heading: 'Membuat atau mengubah nama pengguna',
            body: 'Nama pengguna adalah nama singkat pilihan Anda untuk masuk, misalnya budi.santoso. Isinya 3 sampai 30 karakter: huruf kecil, angka, titik, garis bawah, atau strip. Tidak boleh berupa alamat email atau 16 angka.',
            steps: [
              'Buka Profil saya.',
              'Isi Nama pengguna. Tulisan di bawah isian langsung memberi tahu apakah namanya tersedia.',
              'Klik Simpan profil.',
            ],
            href: '/profile',
          },
          {
            heading: 'Lupa kata sandi: pilih email atau WhatsApp',
            body: 'Anda bisa memulihkan akun sendiri. Setelah mengisi email, nama pengguna, atau NIK, sistem menampilkan pilihan pengiriman kode 6 digit. Email ditampilkan sebagian (misalnya ri***@gmail.com). WhatsApp hanya tampil bila akun punya nomor HP, dengan petunjuk 4 angka pertama dan 3 angka terakhir (misalnya 6281****789).',
            steps: [
              'Di halaman masuk, klik Lupa kata sandi?.',
              'Isi email, nama pengguna, atau NIK, lalu klik Lanjut.',
              'Pilih Email atau WhatsApp. Kode 6 digit dikirim ke sana dan berlaku 10 menit.',
              'Masukkan kode, lalu klik Verifikasi kode.',
              'Isi kata sandi baru dua kali, lalu klik Atur ulang kata sandi.',
            ],
            warning:
              'Kode salah 5 kali akan hangus, dan kode baru baru bisa diminta setelah 60 detik. Setelah kata sandi diganti, semua perangkat yang sedang masuk dikeluarkan.',
          },
          {
            heading: 'Bila pilihan pengiriman tidak muncul',
            body: 'Layar akan berkata bahwa pilihan tampil jika data ditemukan. Penyebabnya bisa isian yang salah ketik, atau NIK yang dipakai beberapa akun. Coba dengan email atau nama pengguna. Bila tetap tidak berhasil, hubungi admin sekolah.',
            tip: 'Admin sekolah perlu mengisi NIK, nomor HP, dan email siswa atau wali dengan benar; data itu dipakai untuk masuk dan pemulihan akun.',
          },
        ],
        faq: [
          {
            q: 'Kode tidak sampai ke email.',
            a: 'Periksa folder spam dan pastikan email benar. Tunggu hitungan mundur selesai, lalu klik Kirim ulang kode. Anda juga bisa memilih WhatsApp bila tersedia.',
          },
          {
            q: 'Mengapa WhatsApp tidak tampil sebagai pilihan?',
            a: 'Pilihan itu hanya tampil bila akun memiliki nomor HP dan layanan WhatsApp sedang aktif. Isi nomor HP di Profil saya, lalu coba lagi.',
          },
          {
            q: 'Apakah NIK saya aman dipakai untuk masuk?',
            a: 'NIK hanya dipakai untuk mengenali akun dan tidak pernah ditampilkan kembali di layar maupun disimpan di catatan sistem. Tetap jaga kata sandi Anda.',
          },
        ],
      },
      en: {
        title: 'Signing in and account recovery',
        summary:
          'Sign in with an email, username, or national ID (NIK), and recover the account by email or WhatsApp if you forget the password.',
        forWho: 'All users: staff, teachers, guardians, and students.',
        sections: [
          {
            heading: 'Sign in with an email, username, or NIK',
            body: 'The sign-in page has a single field: Email, username, or national ID (NIK). Fill in one of them, then the password. If anything is wrong the message is always the same (Incorrect identity or password) so nobody can guess which accounts exist.',
            steps: [
              'Open the sign-in page.',
              'Enter an email, username, or NIK (16 digits) in the first field.',
              'Enter the password, then click Sign in.',
            ],
            tip: 'A NIK works only when it is linked to exactly one account. If several accounts share the same NIK, sign in with the email or username instead.',
          },
          {
            heading: 'Creating or changing a username',
            body: 'A username is a short name of your choice for signing in, for example budi.santoso. It has 3 to 30 characters: lowercase letters, digits, dot, underscore, or hyphen. It cannot be an email address or 16 digits.',
            steps: [
              'Open My profile.',
              'Fill in Username. The note under the field tells you right away whether the name is available.',
              'Click Save profile.',
            ],
            href: '/profile',
          },
          {
            heading: 'Forgot your password: choose email or WhatsApp',
            body: 'You can recover the account yourself. After you enter an email, username, or NIK, the system shows where the 6-digit code can be sent. The email is partly hidden (for example ri***@gmail.com). WhatsApp appears only when the account has a phone number, with a clue of the first 4 and last 3 digits (for example 6281****789).',
            steps: [
              'On the sign-in page, click Forgot password?.',
              'Enter an email, username, or NIK, then click Continue.',
              'Choose Email or WhatsApp. The 6-digit code is sent there and is valid for 10 minutes.',
              'Enter the code, then click Verify code.',
              'Enter the new password twice, then click Reset password.',
            ],
            warning:
              'A code that is entered wrongly 5 times expires, and a new code can be requested only after 60 seconds. After the password changes, every signed-in device is signed out.',
          },
          {
            heading: 'When no delivery options appear',
            body: 'The screen says the options appear if the details match an account. This can happen because of a typo, or a NIK shared by several accounts. Try the email or username. If it still fails, contact the school admin.',
            tip: 'School admins should fill in the NIK, phone number, and email of students or guardians correctly; they are used for signing in and for account recovery.',
          },
        ],
        faq: [
          {
            q: 'The code did not reach my email.',
            a: 'Check the spam folder and make sure the email is right. Wait for the countdown, then click Resend code. You can also pick WhatsApp when it is available.',
          },
          {
            q: 'Why is WhatsApp not offered?',
            a: 'It appears only when the account has a phone number and the WhatsApp service is on. Add your phone number in My profile, then try again.',
          },
          {
            q: 'Is it safe to use my NIK to sign in?',
            a: 'The NIK is only used to recognise the account. It is never shown back on screen or written to the system logs. Still keep your password private.',
          },
        ],
      },
      su: {
        title: 'Asup jeung mulihkeun akun',
        summary:
          'Asup maké surélék, ngaran pamaké, atawa NIK, tuluy mulihkeun akun ngaliwatan surélék atawa WhatsApp lamun poho kecap sandi.',
        forWho: 'Sakabéh pamaké: staf, guru, wali murid, jeung siswa.',
        sections: [
          {
            heading: 'Asup maké surélék, ngaran pamaké, atawa NIK',
            body: 'Kaca asup ngan boga hiji eusian: Surélék, ngaran pamaké, atawa NIK. Eusian salah sahijina, tuluy kecap sandi. Lamun aya nu lepat, pesen nu mucunghul sok sarua (Identitas atawa kecap akses lepat) supaya batur teu bisa nebak akun.',
            steps: [
              'Buka kaca asup.',
              'Eusian surélék, ngaran pamaké, atawa NIK (16 angka) dina eusian kahiji.',
              'Eusian kecap sandi, tuluy klik Lebet.',
            ],
            tip: 'NIK bisa dipaké ngan lamun NIK éta nyambung ka persis hiji akun. Lamun sababaraha akun maké NIK nu sarua, asup maké surélék atawa ngaran pamaké.',
          },
          {
            heading: 'Nyieun atawa ngarobah ngaran pamaké',
            body: 'Ngaran pamaké nyaéta ngaran pondok pilihan anjeun pikeun asup, upamana budi.santoso. Eusina 3 nepi ka 30 karakter: aksara leutik, angka, titik, garis handap, atawa strip. Teu meunang awujud alamat surélék atawa 16 angka.',
            steps: [
              'Buka Profil kuring.',
              'Eusian Ngaran pamaké. Tulisan handapeun eusian langsung ngabéjaan naha ngaranna sayogi.',
              'Klik Simpen profil.',
            ],
            href: '/profile',
          },
          {
            heading: 'Poho kecap sandi: pilih surélék atawa WhatsApp',
            body: 'Anjeun bisa mulihkeun akun sorangan. Sanggeus ngeusian surélék, ngaran pamaké, atawa NIK, sistem mintonkeun kamana kode 6 angka bisa dikirim. Surélék dipintonkeun sabagian (upamana ri***@gmail.com). WhatsApp ngan mucunghul lamun akun boga nomer HP, jeung pituduh 4 angka mimiti jeung 3 angka tungtung (upamana 6281****789).',
            steps: [
              'Dina kaca asup, klik Poho kecap sandi?.',
              'Eusian surélék, ngaran pamaké, atawa NIK, tuluy klik Teraskeun.',
              'Pilih Surélék atawa WhatsApp. Kode 6 angka dikirim ka dinya sarta lumaku 10 menit.',
              'Asupkeun kode, tuluy klik Pariksa kode.',
              'Eusian kecap sandi anyar dua kali, tuluy klik Reset kecap sandi.',
            ],
            warning:
              'Kode nu salah 5 kali bakal hangus, sarta kode anyar ngan bisa dipénta sanggeus 60 detik. Sanggeus kecap sandi diganti, sakabéh parangkat nu keur asup dikaluarkeun.',
          },
          {
            heading: 'Lamun pilihan pangiriman teu mucunghul',
            body: 'Layar bakal nyebutkeun yén pilihan mucunghul lamun data kapanggih. Panyababna bisa salah ngetik, atawa NIK nu dipaké ku sababaraha akun. Cobaan maké surélék atawa ngaran pamaké. Lamun tetep gagal, hubungi admin sakola.',
            tip: 'Admin sakola kudu ngeusian NIK, nomer HP, jeung surélék siswa atawa wali bener-bener; data éta dipaké pikeun asup jeung mulihkeun akun.',
          },
        ],
        faq: [
          {
            q: 'Kode teu nepi ka surélék.',
            a: 'Pariksa polder spam jeung pastikeun surélék bener. Antosan itungan mundur réngsé, tuluy klik Kirim deui kode. Anjeun ogé bisa milih WhatsApp lamun sayogi.',
          },
          {
            q: 'Naha WhatsApp teu mucunghul salaku pilihan?',
            a: 'Éta ngan mucunghul lamun akun boga nomer HP jeung layanan WhatsApp keur aktif. Eusian nomer HP dina Profil kuring, tuluy cobaan deui.',
          },
          {
            q: 'Naha aman maké NIK kuring pikeun asup?',
            a: 'NIK ngan dipaké pikeun ngenalan akun sarta teu pernah ditémbongkeun deui dina layar atawa ditulis dina catetan sistem. Tetep jaga kecap sandi anjeun.',
          },
        ],
      },
    },
  },
];
