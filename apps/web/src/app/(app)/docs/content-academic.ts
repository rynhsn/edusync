import type { DocArticle } from '@/lib/docs-types';

/** Dokumentasi panel sekolah per modul: nilai, rapor, ekskul, tahfidz, PKL. Isi: id, en, su. */
export const ACADEMIC_DOCS: DocArticle[] = [
  {
    slug: 'grades',
    icon: 'book',
    tone: 'violet',
    module: 'grades',
    text: {
      id: {
        title: 'Nilai: penilaian, bobot, dan rekap',
        summary:
          'Guru mencatat nilai per kelas dan mata pelajaran, sistem menghitung nilai akhir berbobot beserta predikatnya.',
        sections: [
          {
            heading: 'Menyiapkan KKM, predikat, dan komponen',
            body: 'Sebelum guru mulai, pengelola nilai mengatur KKM, batas predikat A/B/C, dan komponen nilai berbobot (misalnya Tugas atau UTS) di Pengaturan penilaian. Bila sekolah belum punya komponen, tombol Pasang komponen bawaan membuat Tugas (20), Ulangan Harian (30), UTS (20), dan UAS (30).',
            steps: [
              'Buka Pengaturan penilaian.',
              'Isi KKM dan batas predikat A, B, C (A harus lebih besar dari B, B lebih besar dari C).',
              'Tambah komponen nilai beserta bobotnya (1 sampai 100), atau pasang komponen bawaan.',
              'Simpan. Bila total bobot bukan 100%, muncul peringatan.',
            ],
            href: '/grades/settings',
          },
          {
            heading: 'Membuat penilaian dan mengisi nilai',
            body: 'Guru memilih semester, kelas, dan mata pelajaran, lalu membuat penilaian (misalnya Ulangan Bab 1) dengan komponen, tanggal, dan nilai maksimal. Setelah itu nilai tiap siswa diisi pada lembar nilai.',
            steps: [
              'Buka menu Penilaian dan pilih semester, kelas, serta mata pelajaran.',
              'Pada tab Penilaian, klik Penilaian baru; isi judul, komponen, tanggal, dan nilai maksimal (bawaan 100).',
              'Klik Isi nilai pada penilaian itu.',
              'Ketik nilai tiap siswa antara 0 dan nilai maksimal; kosongkan untuk menghapus nilai.',
              'Klik Simpan.',
            ],
            href: '/grades',
          },
          {
            heading: 'Rekap dan nilai akhir',
            body: 'Tab Rekap menampilkan per siswa rata-rata tiap komponen, nilai akhir, dan predikat, serta ringkasan rata-rata, tertinggi, terendah, dan jumlah siswa di bawah KKM. Nilai akhir adalah rata-rata tertimbang; bobot dinormalisasi atas komponen yang sudah punya nilai. Rekap bisa diekspor ke Excel.',
            href: '/grades',
          },
          {
            heading: 'Yang perlu diperhatikan',
            body: 'Nilai dan rapor adalah satu modul (Nilai dan rapor); modul Penilaian non-akademik bergantung padanya. Di halaman Penilaian sendiri tidak ada fitur khusus non-akademik; predikat ekstrakurikuler dicatat di modul Ekstrakurikuler.',
            steps: [
              'Guru hanya bisa melihat dan mengisi kelas serta mata pelajaran yang ia ampu. Pengelola nilai, kepala sekolah, dan kurikulum bisa melihat semua kelas dan mapel.',
              'Membuat, mengubah, dan menghapus penilaian serta mengisi nilai memerlukan izin mengisi nilai, dan hanya untuk pengelola nilai atau guru pengampu kelas dan mapel itu.',
              'Menghapus penilaian ikut menghapus semua nilainya. Nilai maksimal tidak bisa diturunkan di bawah nilai yang sudah terisi.',
              'Komponen yang sudah dipakai penilaian tidak bisa dihapus; mengubah bobot langsung memengaruhi semua nilai akhir.',
              'Pengaturan penilaian hanya bisa diubah oleh pemegang izin konfigurasi nilai. Bawaan bila belum diatur: KKM 75, A 90, B 80, C 70.',
            ],
          },
        ],
      },
      en: {
        title: 'Grades: assessments, weights, and recap',
        summary:
          'Teachers record scores per class and subject, and the system computes a weighted final score with its predicate.',
        sections: [
          {
            heading: 'Setting up the passing mark, predicates, and components',
            body: 'Before teachers start, the grading manager sets the passing mark (KKM), the A/B/C predicate thresholds, and weighted score components (for example Assignments or Midterm) in Grading settings. If the school has no components yet, the Install default components button creates Assignments (20), Daily Tests (30), Midterm (20), and Final Exam (30).',
            steps: [
              'Open Grading settings.',
              'Enter the passing mark and the A, B, C thresholds (A must be higher than B, B higher than C).',
              'Add score components with their weight (1 to 100), or install the defaults.',
              'Save. If the total weight is not 100%, a warning is shown.',
            ],
            href: '/grades/settings',
          },
          {
            heading: 'Creating assessments and entering scores',
            body: 'The teacher picks a semester, class, and subject, then creates an assessment (for example Chapter 1 Test) with a component, date, and maximum score. Each student score is then entered on the score sheet.',
            steps: [
              'Open the Grading menu and pick the semester, class, and subject.',
              'On the Assessments tab, click New assessment; fill in the title, component, date, and maximum score (default 100).',
              'Click Enter scores on that assessment.',
              'Type each student score between 0 and the maximum; leave it empty to clear a score.',
              'Click Save.',
            ],
            href: '/grades',
          },
          {
            heading: 'Recap and final score',
            body: 'The Recap tab shows, per student, the average of each component, the final score, and the predicate, plus a summary of average, highest, lowest, and the number of students below the passing mark. The final score is a weighted average; weights are normalized over the components that have scores. The recap can be exported to Excel.',
            href: '/grades',
          },
          {
            heading: 'Things to keep in mind',
            body: 'Grades and report cards are one module (Grades and report cards); the Non-academic assessment module depends on it. The Grading page itself has no separate non-academic feature; extracurricular predicates are recorded in the Extracurricular module.',
            steps: [
              'Teachers can only view and fill the classes and subjects they teach. The grading manager, principal, and curriculum staff can see all classes and subjects.',
              'Creating, editing, and deleting assessments and entering scores requires the score-entry permission, and only for the grading manager or the teacher assigned to that class and subject.',
              'Deleting an assessment also deletes all its scores. The maximum score cannot be lowered below a score already entered.',
              'A component already used by an assessment cannot be deleted; changing a weight immediately affects every final score.',
              'Grading settings can only be changed by those with the grading configuration permission. Defaults when not set: passing mark 75, A 90, B 80, C 70.',
            ],
          },
        ],
      },
      su: {
        title: 'Nilai: panilaian, bobot, sareng rekap',
        summary:
          'Guru nyerat nilai per kelas sareng mata pelajaran, sistem ngitung nilai akhir kalayan bobot sareng predikatna.',
        sections: [
          {
            heading: 'Nyiapkeun KKM, predikat, sareng komponén',
            body: 'Sateuacan guru ngawitan, pangurus nilai nyetél KKM, wates predikat A/B/C, sareng komponén nilai kalayan bobot (contona Tugas atanapi UTS) dina Pengaturan penilaian. Upami sakola henteu acan gaduh komponén, tombol Pasang komponen bawaan nyieun Tugas (20), Ulangan Harian (30), UTS (20), sareng UAS (30).',
            steps: [
              'Buka Pengaturan penilaian.',
              'Eusian KKM sareng wates predikat A, B, C (A kedah langkung ageung tibatan B, B langkung ageung tibatan C).',
              'Tambihan komponén nilai sareng bobotna (1 dugi ka 100), atanapi pasang komponén bawaan.',
              'Simpen. Upami jumlah bobot sanés 100%, aya émutan.',
            ],
            href: '/grades/settings',
          },
          {
            heading: 'Nyieun panilaian sareng ngeusian nilai',
            body: 'Guru milih semester, kelas, sareng mata pelajaran, tuluy nyieun panilaian (contona Ulangan Bab 1) kalayan komponén, tanggal, sareng nilai maksimal. Saparantosna nilai unggal siswa diisi dina lembar nilai.',
            steps: [
              'Buka menu Penilaian tuluy pilih semester, kelas, sareng mata pelajaran.',
              'Dina tab Penilaian, klik Penilaian baru; eusian judul, komponén, tanggal, sareng nilai maksimal (bawaan 100).',
              'Klik Isi nilai dina panilaian éta.',
              'Ketik nilai unggal siswa antara 0 sareng nilai maksimal; kosongkeun kanggo mupus nilai.',
              'Klik Simpan.',
            ],
            href: '/grades',
          },
          {
            heading: 'Rekap sareng nilai akhir',
            body: 'Tab Rekap nunjukkeun per siswa rata-rata unggal komponén, nilai akhir, sareng predikat, ogé ringkesan rata-rata, pangluhurna, panghandapna, sareng jumlah siswa di handap KKM. Nilai akhir téh rata-rata kalayan bobot; bobotna disaruakeun kana komponén nu tos aya nilaina. Rekap tiasa diékspor ka Excel.',
            href: '/grades',
          },
          {
            heading: 'Nu kedah diperhatoskeun',
            body: 'Nilai sareng rapor téh hiji modul (Nilai dan rapor); modul Penilaian non-akademik gumantung kana éta. Dina kaca Penilaian sorangan teu aya fitur non-akademik nu misah; predikat ékstrakurikuler dicatet dina modul Ekstrakurikuler.',
            steps: [
              'Guru ngan tiasa ningali sareng ngeusian kelas sareng mata pelajaran nu diampuna. Pangurus nilai, kepala sakola, sareng kurikulum tiasa ningali sadaya kelas sareng mapel.',
              'Nyieun, ngarobih, sareng mupus panilaian ogé ngeusian nilai merlukeun idin ngeusian nilai, sareng ngan kanggo pangurus nilai atanapi guru pangampu kelas sareng mapel éta.',
              'Mupus panilaian ngahapus sadaya nilaina. Nilai maksimal teu tiasa diturunkeun di handap nilai nu tos kaeusi.',
              'Komponén nu tos dipaké panilaian teu tiasa dipupus; ngarobih bobot langsung ngaruhan sadaya nilai akhir.',
              'Pengaturan penilaian ngan tiasa dirobih ku nu gaduh idin konfigurasi nilai. Bawaan upami can diatur: KKM 75, A 90, B 80, C 70.',
            ],
          },
        ],
      },
    },
  },
  {
    slug: 'report-cards',
    icon: 'file',
    tone: 'sky',
    module: 'grades',
    text: {
      id: {
        title: 'Rapor: catatan wali kelas, finalisasi, dan PDF',
        summary: 'Dari catatan wali kelas sampai rapor final per siswa atau per kelas dalam bentuk PDF.',
        sections: [
          {
            heading: 'Alur rapor per kelas',
            body: 'Di menu Rapor pilih semester dan kelas; daftar siswa menampilkan status rapor (Draf atau Final), rata-rata, kelengkapan mata pelajaran, dan ada tidaknya catatan wali kelas.',
            steps: [
              'Buka menu Rapor, pilih semester dan kelas.',
              'Buka pratinjau tiap siswa dan isi catatan wali kelas (maksimal 500 karakter).',
              'Periksa kolom mata pelajaran terisi; lengkapi nilai di menu Penilaian bila perlu.',
              'Klik Finalisasi kelas untuk mengunci rapor satu kelas.',
              'Unduh PDF per siswa, atau Unduh semua (PDF). Leger kelas bisa diunduh sebagai Excel.',
            ],
            href: '/report-cards',
          },
          {
            heading: 'Pengaturan rapor',
            body: 'Pengaturan rapor memuat nama dan NIP kepala sekolah, kota, alamat sekolah, kalimat deskripsi capaian untuk predikat A sampai D, dan pilihan Tampilkan peringkat. Deskripsi capaian wajib terisi; nama, NIP, kota, dan alamat boleh dikosongkan.',
            steps: [
              'Buka Pengaturan rapor.',
              'Isi identitas penandatangan: nama dan NIP kepala sekolah, kota, dan alamat.',
              'Sesuaikan deskripsi untuk predikat A, B, C, dan D.',
              'Aktifkan Tampilkan peringkat bila peringkat kelas ingin dicantumkan.',
              'Simpan.',
            ],
            href: '/report-cards/settings',
          },
          {
            heading: 'Draf, final, dan membuka kembali',
            body: 'Rapor draf dihitung langsung dari nilai terkini. Saat kelas difinalisasi, rapor dibekukan sebagai snapshot dan nilai maupun catatan wali tidak dapat diubah. Bila ada siswa yang nilainya belum lengkap, muncul peringatan dan Anda dapat memilih Finalisasi tetap. Buka kembali mengembalikan rapor kelas menjadi draf (catatan wali tetap tersimpan).',
            href: '/report-cards',
          },
          {
            heading: 'Yang perlu diperhatikan',
            body: 'Rapor memerlukan modul Nilai dan rapor. Isi rapor diambil dari data modul lain yang sudah ada di sekolah.',
            steps: [
              'Melihat daftar, pratinjau, dan mengunduh rapor satu kelas hanya untuk pengelola rapor, kepala sekolah, kurikulum, dan wali kelas kelas itu.',
              'Mengisi catatan dan memfinalisasi kelas: pengelola rapor atau wali kelas kelas itu. Membuka kembali rapor final: hanya pengelola rapor.',
              'Mata pelajaran di rapor adalah yang punya penilaian di kelas itu pada semester tersebut.',
              'Rapor juga memuat ekstrakurikuler yang diikuti siswa dan jumlah ketidakhadiran (sakit, izin, tanpa keterangan) pada rentang semester.',
              'Pengaturan rapor hanya bisa diubah oleh pengelola rapor.',
            ],
          },
        ],
      },
      en: {
        title: 'Report cards: homeroom notes, finalizing, and PDF',
        summary: 'From the homeroom teacher note to a final report card per student or per class as PDF.',
        sections: [
          {
            heading: 'Report card flow per class',
            body: 'In the Report cards menu pick a semester and class; the student list shows report status (Draft or Final), the average, subject completeness, and whether a homeroom note exists.',
            steps: [
              'Open the Report cards menu and pick the semester and class.',
              'Open each student preview and write the homeroom note (max 500 characters).',
              'Check the subjects filled column; complete the scores in the Grading menu if needed.',
              'Click Finalize class to lock the report cards of one class.',
              'Download a PDF per student, or Download all (PDF). The class ledger can be downloaded as Excel.',
            ],
            href: '/report-cards',
          },
          {
            heading: 'Report card settings',
            body: 'Report card settings hold the principal name and NIP, the city, the school address, the achievement description sentences for predicates A to D, and the Show rank option. Achievement descriptions are required; name, NIP, city, and address may be left empty.',
            steps: [
              'Open Report card settings.',
              'Fill in the signer identity: principal name and NIP, city, and address.',
              'Adjust the descriptions for predicates A, B, C, and D.',
              'Turn on Show rank if the class rank should appear.',
              'Save.',
            ],
            href: '/report-cards/settings',
          },
          {
            heading: 'Draft, final, and reopening',
            body: 'A draft report card is computed live from the current scores. When a class is finalized, the report cards are frozen as a snapshot and neither scores nor homeroom notes can change. If some students have incomplete scores, a warning appears and you can choose Finalize anyway. Reopen turns the class report cards back into drafts (homeroom notes are kept).',
            href: '/report-cards',
          },
          {
            heading: 'Things to keep in mind',
            body: 'Report cards require the Grades and report cards module. Their content is taken from data other modules already hold in the school.',
            steps: [
              'Viewing the list, previewing, and downloading the report cards of a class is only for the report card manager, principal, curriculum staff, and that class homeroom teacher.',
              'Writing notes and finalizing a class: the report card manager or that class homeroom teacher. Reopening a final report card: the report card manager only.',
              'The subjects on a report card are those that have assessments in that class in that semester.',
              'The report card also lists the extracurriculars the student joined and the number of absences (sick, excused, unexcused) within the semester range.',
              'Report card settings can only be changed by the report card manager.',
            ],
          },
        ],
      },
      su: {
        title: 'Rapor: catetan wali kelas, finalisasi, sareng PDF',
        summary: 'Ti catetan wali kelas dugi ka rapor final per siswa atanapi per kelas dina wujud PDF.',
        sections: [
          {
            heading: 'Alur rapor per kelas',
            body: 'Dina menu Rapor pilih semester sareng kelas; daptar siswa nunjukkeun status rapor (Draf atanapi Final), rata-rata, kalengkepan mata pelajaran, sareng aya henteuna catetan wali kelas.',
            steps: [
              'Buka menu Rapor, pilih semester sareng kelas.',
              'Buka pratinjau unggal siswa tuluy tulis catetan wali kelas (maksimal 500 karakter).',
              'Pariksa kolom mapel kaeusi; lengkepan nilai dina menu Penilaian upami peryogi.',
              'Klik Finalisasi kelas kanggo ngonci rapor sakelas.',
              'Unduh PDF per siswa, atanapi Unduh semua (PDF). Leger kelas tiasa diunduh jadi Excel.',
            ],
            href: '/report-cards',
          },
          {
            heading: 'Pengaturan rapor',
            body: 'Pengaturan rapor eusina nami sareng NIP kepala sakola, kota, alamat sakola, kalimah déskripsi capaian kanggo predikat A dugi ka D, sareng pilihan Tampilkan peringkat. Déskripsi capaian kedah kaeusi; nami, NIP, kota, sareng alamat tiasa dikosongkeun.',
            steps: [
              'Buka Pengaturan rapor.',
              'Eusian idéntitas nu nandatanganan: nami sareng NIP kepala sakola, kota, sareng alamat.',
              'Saluyukeun déskripsi kanggo predikat A, B, C, sareng D.',
              'Hurungkeun Tampilkan peringkat upami peringkat kelas hoyong dipidangkeun.',
              'Simpen.',
            ],
            href: '/report-cards/settings',
          },
          {
            heading: 'Draf, final, sareng muka deui',
            body: 'Rapor draf diitung langsung tina nilai nu pang anyarna. Nalika kelas difinalisasi, rapor dibeku jadi snapshot sareng nilai ogé catetan wali teu tiasa dirobih. Upami aya siswa nu nilaina can lengkep, aya émutan tuluy tiasa milih Finalisasi tetap. Buka kembali ngabalikeun rapor kelas jadi draf (catetan wali tetep disimpen).',
            href: '/report-cards',
          },
          {
            heading: 'Nu kedah diperhatoskeun',
            body: 'Rapor merlukeun modul Nilai dan rapor. Eusi rapor dicandak tina data modul sanés nu tos aya di sakola.',
            steps: [
              'Ningali daptar, pratinjau, sareng ngunduh rapor sakelas ngan kanggo pangurus rapor, kepala sakola, kurikulum, sareng wali kelas kelas éta.',
              'Ngeusian catetan sareng finalisasi kelas: pangurus rapor atanapi wali kelas kelas éta. Muka deui rapor final: ngan pangurus rapor.',
              'Mata pelajaran dina rapor nyaéta nu gaduh panilaian di kelas éta dina semester éta.',
              'Rapor ogé eusina ékstrakurikuler nu dilongok siswa sareng jumlah teu hadir (gering, idin, tanpa katerangan) dina rentang semester.',
              'Pengaturan rapor ngan tiasa dirobih ku pangurus rapor.',
            ],
          },
        ],
      },
    },
  },
  {
    slug: 'extracurricular',
    icon: 'trophy',
    tone: 'emerald',
    module: 'extracurricular',
    text: {
      id: {
        title: 'Ekstrakurikuler: anggota, pertemuan, dan penilaian',
        summary:
          'Kelola kegiatan di luar jam pelajaran: anggota, absensi tiap pertemuan, predikat semester, dan laporan.',
        sections: [
          {
            heading: 'Membuat ekstrakurikuler',
            body: 'Pengelola menambah ekstrakurikuler dengan nama (unik di sekolah), kategori, deskripsi, pembina (guru sekolah atau pembina luar), hari dan jam, serta lokasi. Jam mulai harus lebih awal dari jam selesai.',
            steps: [
              'Buka menu Ekstrakurikuler dan klik tombol tambah.',
              'Isi nama, kategori, pembina, jadwal, dan lokasi.',
              'Simpan. Untuk menghentikan kegiatan, ubah statusnya menjadi Nonaktif.',
            ],
            href: '/extracurriculars',
          },
          {
            heading: 'Kategori',
            body: 'Tombol Kelola kategori mengatur nama, ikon, dan warna kategori. Sekolah yang belum punya kategori mendapat kategori bawaan (olahraga, seni, keagamaan, sains, pramuka, lainnya) saat pertama dibuka. Kategori nonaktif tidak bisa dipilih untuk ekskul baru.',
            href: '/extracurriculars',
          },
          {
            heading: 'Anggota, pertemuan, dan absensi',
            body: 'Buka satu ekstrakurikuler untuk melihat tab Anggota, Pertemuan dan absensi, Penilaian, dan Laporan.',
            steps: [
              'Pada tab Anggota klik Tambah anggota, pilih kelas, centang siswa, lalu Tambahkan.',
              'Pada tab Pertemuan dan absensi klik Pertemuan baru; isi tanggal dan topik.',
              'Klik Buka absensi, tandai Hadir, Izin, Sakit, atau Alpa tiap anggota, lalu Simpan absensi.',
            ],
            href: '/extracurriculars',
          },
          {
            heading: 'Penilaian dan laporan',
            body: 'Pada tab Penilaian, pilih semester lalu beri tiap anggota predikat A sampai D beserta keterangan; predikat ini tampil di rapor. Tab Laporan merekap kehadiran tiap anggota pada rentang tanggal yang dipilih (bawaan 90 hari terakhir, maksimal 366 hari) dan bisa diekspor ke Excel.',
            href: '/extracurriculars',
          },
          {
            heading: 'Yang perlu diperhatikan',
            body: 'Semua guru dapat melihat ekstrakurikuler, tetapi pengisian dibatasi.',
            steps: [
              'Menambah, mengubah, dan menghapus ekstrakurikuler serta kategori: hanya pengelola ekstrakurikuler.',
              'Menambah atau mengeluarkan anggota, membuat pertemuan, mengisi absensi, dan menilai: pengelola atau guru pembina ekskul itu.',
              'Keanggotaan dicatat per tahun ajaran (bawaan tahun ajaran aktif). Mengeluarkan anggota tidak menghapus catatan absensi lama.',
              'Tanggal pertemuan tidak boleh belum tiba, dan satu ekskul hanya punya satu pertemuan per tanggal. Menghapus pertemuan ikut menghapus absensinya.',
              'Ekskul yang sudah punya pertemuan atau penilaian tidak bisa dihapus; nonaktifkan saja. Kategori yang masih dipakai juga tidak bisa dihapus.',
            ],
          },
        ],
      },
      en: {
        title: 'Extracurriculars: members, sessions, and assessment',
        summary:
          'Manage activities outside class hours: members, attendance per session, semester predicates, and reports.',
        sections: [
          {
            heading: 'Creating an extracurricular',
            body: 'A manager adds an extracurricular with a name (unique in the school), category, description, coach (a school teacher or an outside coach), day and time, and location. The start time must be earlier than the end time.',
            steps: [
              'Open the Extracurricular menu and click the add button.',
              'Fill in the name, category, coach, schedule, and location.',
              'Save. To stop an activity, set its status to Inactive.',
            ],
            href: '/extracurriculars',
          },
          {
            heading: 'Categories',
            body: 'The Manage categories button sets the name, icon, and color of categories. A school without categories gets the defaults (sports, arts, religion, science, scouts, other) when first opened. An inactive category cannot be chosen for a new extracurricular.',
            href: '/extracurriculars',
          },
          {
            heading: 'Members, sessions, and attendance',
            body: 'Open one extracurricular to see the Members, Sessions and attendance, Assessment, and Report tabs.',
            steps: [
              'On the Members tab click Add members, pick a class, tick the students, then Add.',
              'On the Sessions and attendance tab click New session; fill in the date and topic.',
              'Click Open attendance, mark each member Present, Excused, Sick, or Absent, then Save attendance.',
            ],
            href: '/extracurriculars',
          },
          {
            heading: 'Assessment and reports',
            body: 'On the Assessment tab, pick a semester and give each member a predicate from A to D with a note; this predicate appears on the report card. The Report tab summarizes each member attendance over the chosen date range (default last 90 days, maximum 366 days) and can be exported to Excel.',
            href: '/extracurriculars',
          },
          {
            heading: 'Things to keep in mind',
            body: 'All teachers can view extracurriculars, but filling in is restricted.',
            steps: [
              'Adding, editing, and deleting extracurriculars and categories: extracurricular managers only.',
              'Adding or removing members, creating sessions, recording attendance, and assessing: a manager or the coach teacher of that extracurricular.',
              'Membership is recorded per academic year (default the active year). Removing a member does not delete earlier attendance records.',
              'A session date cannot be in the future, and an extracurricular has only one session per date. Deleting a session also deletes its attendance.',
              'An extracurricular that already has sessions or assessments cannot be deleted; deactivate it instead. A category still in use cannot be deleted either.',
            ],
          },
        ],
      },
      su: {
        title: 'Ékstrakurikuler: anggota, patepungan, sareng panilaian',
        summary:
          'Ngatur kagiatan di luar jam pelajaran: anggota, absénsi unggal patepungan, predikat semester, sareng laporan.',
        sections: [
          {
            heading: 'Nyieun ékstrakurikuler',
            body: 'Pangurus nambihan ékstrakurikuler kalayan nami (unik di sakola), kategori, déskripsi, pembina (guru sakola atanapi pembina luar), dinten sareng jam, ogé lokasi. Jam mimiti kedah langkung awal tibatan jam rengse.',
            steps: [
              'Buka menu Ekstrakurikuler tuluy klik tombol tambih.',
              'Eusian nami, kategori, pembina, jadwal, sareng lokasi.',
              'Simpen. Kanggo ngeureunkeun kagiatan, robih statusna jadi Nonaktif.',
            ],
            href: '/extracurriculars',
          },
          {
            heading: 'Kategori',
            body: 'Tombol Kelola kategori nyetél nami, ikon, sareng warna kategori. Sakola nu can gaduh kategori meunang kategori bawaan (olahraga, seni, kaagamaan, sains, pramuka, sanésna) nalika mimiti dibuka. Kategori nonaktif teu tiasa dipilih kanggo ékskul anyar.',
            href: '/extracurriculars',
          },
          {
            heading: 'Anggota, patepungan, sareng absénsi',
            body: 'Buka hiji ékstrakurikuler kanggo ningali tab Anggota, Pertemuan dan absensi, Penilaian, sareng Laporan.',
            steps: [
              'Dina tab Anggota klik Tambah anggota, pilih kelas, centang siswa, tuluy Tambahkan.',
              'Dina tab Pertemuan dan absensi klik Pertemuan baru; eusian tanggal sareng topik.',
              'Klik Buka absensi, tandaan Hadir, Izin, Sakit, atanapi Alpa unggal anggota, tuluy Simpan absensi.',
            ],
            href: '/extracurriculars',
          },
          {
            heading: 'Panilaian sareng laporan',
            body: 'Dina tab Penilaian, pilih semester tuluy pasihan unggal anggota predikat A dugi ka D sareng katerangan; predikat ieu muncul dina rapor. Tab Laporan ngarékap kahadiran unggal anggota dina rentang tanggal nu dipilih (bawaan 90 poé panungtung, maksimal 366 poé) tur tiasa diékspor ka Excel.',
            href: '/extracurriculars',
          },
          {
            heading: 'Nu kedah diperhatoskeun',
            body: 'Sadaya guru tiasa ningali ékstrakurikuler, tapi ngeusianana dibatesan.',
            steps: [
              'Nambihan, ngarobih, sareng mupus ékstrakurikuler ogé kategori: ngan pangurus ékstrakurikuler.',
              'Nambihan atanapi ngaluarkeun anggota, nyieun patepungan, ngeusian absénsi, sareng nilai: pangurus atanapi guru pembina ékskul éta.',
              'Kaanggotaan dicatet per taun ajaran (bawaan taun ajaran aktif). Ngaluarkeun anggota teu mupus catetan absénsi baheula.',
              'Tanggal patepungan teu tiasa acan datang, sareng hiji ékskul ngan gaduh hiji patepungan per tanggal. Mupus patepungan ngahapus absénsina.',
              'Ékskul nu tos gaduh patepungan atanapi panilaian teu tiasa dipupus; nonaktifkeun wae. Kategori nu masih dipaké ogé teu tiasa dipupus.',
            ],
          },
        ],
      },
    },
  },
  {
    slug: 'tahfidz',
    icon: 'book',
    tone: 'teal',
    module: 'tahfidz',
    text: {
      id: {
        title: 'Tahfidz dan ibadah: halaqah, setoran, dan target',
        summary:
          'Catat setoran hafalan per halaqah, pantau progres Al-Quran, dan isi lembar ibadah harian siswa.',
        sections: [
          {
            heading: 'Halaqah dan anggota',
            body: 'Halaqah dibuat per tahun ajaran dengan nama (unik per tahun ajaran), musyrif atau pembina dari guru aktif, dan catatan jadwal. Satu siswa hanya bisa berada di satu halaqah per tahun ajaran.',
            steps: [
              'Buka menu Tahfidz dan klik Halaqah baru.',
              'Isi nama, musyrif, dan jadwal, lalu simpan.',
              'Buka halaqah, tab Anggota, klik Tambah anggota, pilih kelas, dan centang siswa.',
              'Siswa yang sudah ada di halaqah lain pada tahun ajaran itu dilewati dan dilaporkan.',
            ],
            href: '/tahfidz',
          },
          {
            heading: 'Mencatat setoran',
            body: 'Pada tab Setoran pilih siswa, tanggal, jenis, rentang surah dan ayat, kualitas, dan catatan. Jenis Ziyadah adalah hafalan baru, Murajaah adalah mengulang. Kualitas Lancar, Cukup, atau Ulang; setoran Ulang tidak dihitung sebagai hafalan baru.',
            steps: [
              'Buka halaqah dan tab Setoran.',
              'Pilih siswa, tanggal, dan jenis setoran.',
              'Isi surah dan ayat awal sampai akhir.',
              'Pilih kualitas bacaan, tambahkan catatan bila perlu.',
              'Klik Simpan setoran.',
            ],
            href: '/tahfidz',
          },
          {
            heading: 'Progres hafalan',
            body: 'Tab Progres dan halaman tiap siswa menampilkan persen Al-Quran yang dihafal, jumlah juz tuntas, peta 30 juz, lanjutan berikutnya, hari beruntun setor, dan target semester. Siswa yang belum setor 7 hari atau lebih ditandai tertinggal.',
            href: '/tahfidz',
          },
          {
            heading: 'Ibadah harian',
            body: 'Lembar harian mencatat butir ibadah aktif (misalnya Salat Dhuha) siswa dengan sekali ketuk, per halaqah atau per kelas. Tab Laporan merekap persen terlaksana per butir dan per siswa pada rentang tanggal (bawaan 30 hari) dan bisa diekspor ke Excel.',
            href: '/tahfidz/ibadah',
          },
          {
            heading: 'Pengaturan butir ibadah dan target',
            body: 'Halaman pengaturan dipakai untuk menambah butir ibadah (harian atau mingguan), mengatur urutan, mengaktifkan atau menonaktifkan butir, serta mengisi target hafalan semester (ayat ziyadah dan murajaah) per siswa.',
            href: '/tahfidz/settings',
          },
          {
            heading: 'Yang perlu diperhatikan',
            body: 'Semua guru dapat melihat data tahfidz, tetapi pengisian dibatasi.',
            steps: [
              'Membuat, mengubah, dan menghapus halaqah serta butir ibadah: hanya pengelola tahfidz.',
              'Mengisi setoran, anggota, target, dan lembar ibadah halaqah: pengelola atau guru musyrif halaqah itu. Lembar ibadah per kelas hanya untuk pengelola.',
              'Tanggal setoran dan catatan ibadah tidak boleh belum tiba.',
              'Halaqah yang sudah punya setoran tidak bisa dihapus; nonaktifkan saja. Butir ibadah yang sudah punya catatan juga tidak bisa dihapus.',
              'Mengeluarkan anggota tidak menghapus riwayat setorannya.',
            ],
          },
        ],
      },
      en: {
        title: 'Tahfidz and worship: halaqah, submissions, and targets',
        summary:
          'Record memorization submissions per halaqah, track Quran progress, and fill in daily worship sheets for students.',
        sections: [
          {
            heading: 'Halaqah and members',
            body: 'A halaqah is created per academic year with a name (unique per academic year), a mentor chosen from active teachers, and a schedule note. A student can only be in one halaqah per academic year.',
            steps: [
              'Open the Tahfidz menu and click New halaqah.',
              'Fill in the name, mentor, and schedule, then save.',
              'Open the halaqah, the Members tab, click Add members, pick a class, and tick students.',
              'Students already in another halaqah that academic year are skipped and reported.',
            ],
            href: '/tahfidz',
          },
          {
            heading: 'Recording submissions',
            body: 'On the Submissions tab pick the student, date, type, surah and verse range, quality, and a note. Ziyadah is new memorization, Murajaah is revision. Quality is Fluent, Fair, or Repeat; a Repeat submission is not counted as new memorization.',
            steps: [
              'Open the halaqah and the Submissions tab.',
              'Pick the student, date, and submission type.',
              'Fill in the start and end surah and verse.',
              'Pick the recitation quality and add a note if needed.',
              'Click Save submission.',
            ],
            href: '/tahfidz',
          },
          {
            heading: 'Memorization progress',
            body: 'The Progress tab and each student page show the percent of the Quran memorized, completed juz, a 30-juz map, the next verse to continue from, the submission streak in days, and the semester target. Students who have not submitted for 7 days or more are flagged as behind.',
            href: '/tahfidz',
          },
          {
            heading: 'Daily worship',
            body: 'The daily sheet records active worship items (for example Duha prayer) for students with one tap, per halaqah or per class. The Report tab summarizes the percent completed per item and per student over a date range (default 30 days) and can be exported to Excel.',
            href: '/tahfidz/ibadah',
          },
          {
            heading: 'Worship item and target settings',
            body: 'The settings page is used to add worship items (daily or weekly), set their order, activate or deactivate them, and enter the semester memorization targets (ziyadah and murajaah verses) per student.',
            href: '/tahfidz/settings',
          },
          {
            heading: 'Things to keep in mind',
            body: 'All teachers can view tahfidz data, but filling in is restricted.',
            steps: [
              'Creating, editing, and deleting halaqah and worship items: tahfidz managers only.',
              'Recording submissions, members, targets, and a halaqah worship sheet: a manager or that halaqah mentor teacher. The per-class worship sheet is for managers only.',
              'Submission dates and worship records cannot be in the future.',
              'A halaqah that already has submissions cannot be deleted; deactivate it instead. A worship item that already has records cannot be deleted either.',
              'Removing a member does not delete their submission history.',
            ],
          },
        ],
      },
      su: {
        title: 'Tahfidz sareng ibadah: halaqah, setoran, sareng target',
        summary:
          'Nyerat setoran hapalan per halaqah, mantuan progres Al-Quran, sareng ngeusian lembar ibadah poéan siswa.',
        sections: [
          {
            heading: 'Halaqah sareng anggota',
            body: 'Halaqah dijieun per taun ajaran kalayan nami (unik per taun ajaran), musyrif atanapi pembina tina guru aktif, sareng catetan jadwal. Hiji siswa ngan tiasa aya di hiji halaqah per taun ajaran.',
            steps: [
              'Buka menu Tahfidz tuluy klik Halaqah baru.',
              'Eusian nami, musyrif, sareng jadwal, tuluy simpen.',
              'Buka halaqah, tab Anggota, klik Tambah anggota, pilih kelas, sareng centang siswa.',
              'Siswa nu tos aya di halaqah sanés dina taun ajaran éta dilangkungan tur dilaporkeun.',
            ],
            href: '/tahfidz',
          },
          {
            heading: 'Nyerat setoran',
            body: 'Dina tab Setoran pilih siswa, tanggal, jinis, rentang surah sareng ayat, kualitas, sareng catetan. Jinis Ziyadah téh hapalan anyar, Murajaah téh ngulang. Kualitas Lancar, Cukup, atanapi Ulang; setoran Ulang henteu diitung salaku hapalan anyar.',
            steps: [
              'Buka halaqah tuluy tab Setoran.',
              'Pilih siswa, tanggal, sareng jinis setoran.',
              'Eusian surah sareng ayat awal dugi ka tungtung.',
              'Pilih kualitas bacaan, tambihan catetan upami peryogi.',
              'Klik Simpan setoran.',
            ],
            href: '/tahfidz',
          },
          {
            heading: 'Progres hapalan',
            body: 'Tab Progres sareng kaca unggal siswa nunjukkeun persén Al-Quran nu dihapal, jumlah juz tuntas, peta 30 juz, lanjutan saterusna, poé beruntun nyetor, sareng target semester. Siswa nu can nyetor 7 poé atanapi langkung ditandaan tinggaleun.',
            href: '/tahfidz',
          },
          {
            heading: 'Ibadah poéan',
            body: 'Lembar poéan nyerat butir ibadah aktif (contona Salat Dhuha) siswa ku sakali ketuk, per halaqah atanapi per kelas. Tab Laporan ngarékap persén nu dilaksanakeun per butir sareng per siswa dina rentang tanggal (bawaan 30 poé) tur tiasa diékspor ka Excel.',
            href: '/tahfidz/ibadah',
          },
          {
            heading: 'Pengaturan butir ibadah sareng target',
            body: 'Kaca pengaturan dipaké kanggo nambihan butir ibadah (poéan atanapi saminggon), nyetél urutan, ngaktipkeun atanapi nonaktipkeun butir, sareng ngeusian target hapalan semester (ayat ziyadah sareng murajaah) per siswa.',
            href: '/tahfidz/settings',
          },
          {
            heading: 'Nu kedah diperhatoskeun',
            body: 'Sadaya guru tiasa ningali data tahfidz, tapi ngeusianana dibatesan.',
            steps: [
              'Nyieun, ngarobih, sareng mupus halaqah ogé butir ibadah: ngan pangurus tahfidz.',
              'Ngeusian setoran, anggota, target, sareng lembar ibadah halaqah: pangurus atanapi guru musyrif halaqah éta. Lembar ibadah per kelas ngan kanggo pangurus.',
              'Tanggal setoran sareng catetan ibadah teu tiasa acan datang.',
              'Halaqah nu tos gaduh setoran teu tiasa dipupus; nonaktifkeun wae. Butir ibadah nu tos gaduh catetan ogé teu tiasa dipupus.',
              'Ngaluarkeun anggota teu mupus riwayat setoranana.',
            ],
          },
        ],
      },
    },
  },
  {
    slug: 'internship',
    icon: 'briefcase',
    tone: 'amber',
    module: 'internship',
    text: {
      id: {
        title: 'PKL dan prakerin: mitra, penempatan, dan penilaian',
        summary:
          'Tempatkan siswa di mitra industri, pantau jurnal dan kunjungan, lalu nilai hasil PKL dengan aspek berbobot.',
        sections: [
          {
            heading: 'Mitra industri',
            body: 'Daftar perusahaan atau instansi tempat siswa PKL: nama (unik), bidang usaha, narahubung, telepon, surel, alamat, dan status aktif. Hanya mitra aktif yang bisa dipilih saat menempatkan siswa.',
            steps: [
              'Buka Mitra industri.',
              'Klik Tambah mitra dan isi datanya.',
              'Simpan. Mitra yang sudah punya penempatan tidak bisa dihapus.',
            ],
            href: '/pkl/partners',
          },
          {
            heading: 'Periode, aspek penilaian, dan ambang predikat',
            body: 'Di Periode dan aspek, buat periode PKL (nama, tahun ajaran, tanggal mulai dan selesai) serta aspek penilaian berbobot. Tombol Pasang aspek bawaan membuat Disiplin (20), Kompetensi teknis (30), Etika kerja (20), Kerja sama (15), dan Laporan (15) bila belum ada aspek. Ambang predikat A, B, C diatur di halaman yang sama (bawaan 90/80/70; di bawah C adalah D).',
            steps: [
              'Buka Periode dan aspek.',
              'Tambah periode PKL; tanggal mulai tidak boleh setelah tanggal selesai.',
              'Pasang aspek bawaan atau tambah aspek sendiri (bobot 1 sampai 100).',
              'Atur ambang predikat (bilangan bulat 1 sampai 100, A lebih besar dari B, B lebih besar dari C) lalu simpan.',
            ],
            href: '/pkl/settings',
          },
          {
            heading: 'Menempatkan siswa',
            body: 'Halaman PKL menampilkan penempatan dalam tampilan papan atau tabel, dengan filter periode, mitra, status, dan pencarian. Pengelola menempatkan banyak siswa sekaligus.',
            steps: [
              'Buka PKL dan klik Tempatkan siswa.',
              'Pilih periode dan mitra, lalu isi guru pembimbing serta pembimbing industri bila ada.',
              'Centang siswa (bisa disaring per kelas) dan klik Tempatkan.',
              'Siswa yang sudah punya penempatan di periode yang sama dilewati.',
              'Ubah status lewat tombol Mulai PKL, Selesaikan, atau Batalkan.',
            ],
            href: '/pkl',
          },
          {
            heading: 'Jurnal, kunjungan, dan penilaian',
            body: 'Di detail penempatan ada tab Jurnal (satu entri per hari, tanggal sama menimpa), Kunjungan monitoring guru, Penilaian, dan Tautan industri. Nilai per aspek (0 sampai 100, bilangan bulat) diisi sekolah dan industri; nilai aspek adalah rata-rata penilai, nilai akhir adalah rata-rata tertimbang. Rekap periode menampilkan nilai akhir, predikat, hari jurnal, hari hadir, dan kunjungan, serta bisa diekspor. Sertifikat PKL diunduh sebagai PDF dari detail penempatan.',
            href: '/pkl/report',
          },
          {
            heading: 'Yang perlu diperhatikan',
            body: 'PKL memerlukan modul Administrasi. Semua guru dapat melihat data PKL, tetapi pengisian dibatasi.',
            steps: [
              'Mitra, periode, aspek, ambang, dan penempatan hanya dikelola oleh pengelola PKL. Jurnal, kunjungan, nilai sekolah, dan tautan industri juga boleh diisi guru pembimbing penempatan itu.',
              'Alur status: Direncanakan ke Berjalan atau Dibatalkan; Berjalan ke Selesai atau Dibatalkan. Selesai dan Dibatalkan tidak bisa diubah lagi.',
              'Penempatan hanya bisa dihapus bila masih Direncanakan dan belum ada jurnal; selain itu batalkan. Periode yang sudah punya penempatan tidak bisa dihapus.',
              'Tanggal jurnal tidak boleh di masa depan dan harus dalam periode (toleransi 7 hari).',
              'Pembimbing industri mengisi jurnal dan nilai lewat tautan khusus tanpa login. Tautan hanya ditampilkan satu kali, membuat tautan baru mematikan yang lama, membatalkan penempatan mencabutnya, dan tautan menjadi hanya-baca 14 hari setelah periode berakhir.',
              'Mengubah ambang predikat langsung berlaku pada semua nilai PKL, termasuk yang lama.',
            ],
          },
        ],
      },
      en: {
        title: 'Internship: partners, placements, and assessment',
        summary:
          'Place students at industry partners, follow journals and visits, then score the internship with weighted aspects.',
        sections: [
          {
            heading: 'Industry partners',
            body: 'The list of companies or institutions where students do their internship: name (unique), field, contact person, phone, email, address, and active status. Only active partners can be chosen when placing students.',
            steps: [
              'Open Industry partners.',
              'Click Add partner and fill in the details.',
              'Save. A partner that already has placements cannot be deleted.',
            ],
            href: '/pkl/partners',
          },
          {
            heading: 'Periods, assessment aspects, and predicate thresholds',
            body: 'In Periods and aspects, create internship periods (name, academic year, start and end date) and weighted assessment aspects. The Install default aspects button creates Discipline (20), Technical competence (30), Work ethic (20), Teamwork (15), and Report (15) when there are no aspects yet. The A, B, C predicate thresholds are set on the same page (default 90/80/70; below C is D).',
            steps: [
              'Open Periods and aspects.',
              'Add an internship period; the start date cannot be after the end date.',
              'Install the default aspects or add your own (weight 1 to 100).',
              'Set the predicate thresholds (whole numbers 1 to 100, A higher than B, B higher than C) and save.',
            ],
            href: '/pkl/settings',
          },
          {
            heading: 'Placing students',
            body: 'The Internship page shows placements as a board or a table, with filters for period, partner, status, and search. A manager places many students at once.',
            steps: [
              'Open Internship and click Place students.',
              'Pick the period and partner, then fill in the supervising teacher and the industry supervisor if any.',
              'Tick the students (can be filtered by class) and click Place.',
              'Students who already have a placement in the same period are skipped.',
              'Change the status with the Start, Complete, or Cancel buttons.',
            ],
            href: '/pkl',
          },
          {
            heading: 'Journals, visits, and assessment',
            body: 'A placement detail has the Journal tab (one entry per day, the same date overwrites), teacher Monitoring visits, Assessment, and Industry link. Scores per aspect (whole numbers 0 to 100) are given by the school and the industry; an aspect score is the average of the assessors and the final score is a weighted average. The period recap shows the final score, predicate, journal days, present days, and visits, and can be exported. The internship certificate is downloaded as a PDF from the placement detail.',
            href: '/pkl/report',
          },
          {
            heading: 'Things to keep in mind',
            body: 'Internship requires the Administration module. All teachers can view internship data, but filling in is restricted.',
            steps: [
              'Partners, periods, aspects, thresholds, and placements are managed by internship managers only. Journals, visits, school scores, and the industry link can also be filled by the supervising teacher of that placement.',
              'Status flow: Planned to Active or Cancelled; Active to Completed or Cancelled. Completed and Cancelled cannot be changed again.',
              'A placement can only be deleted while Planned and without journals; otherwise cancel it. A period that has placements cannot be deleted.',
              'Journal dates cannot be in the future and must fall within the period (7 days tolerance).',
              'The industry supervisor fills the journal and scores through a special link without logging in. The link is shown only once, creating a new link disables the old one, cancelling the placement revokes it, and the link becomes read-only 14 days after the period ends.',
              'Changing the predicate thresholds immediately applies to all internship scores, including old ones.',
            ],
          },
        ],
      },
      su: {
        title: 'PKL sareng prakerin: mitra, panempatan, sareng panilaian',
        summary:
          'Tempatkeun siswa di mitra industri, pantau jurnal sareng kunjungan, tuluy nilai hasil PKL ku aspék nu aya bobotna.',
        sections: [
          {
            heading: 'Mitra industri',
            body: 'Daptar pausahaan atanapi instansi tempat siswa PKL: nami (unik), widang usaha, nu bisa dihubungi, telepon, surélék, alamat, sareng status aktip. Ngan mitra aktip nu tiasa dipilih nalika nempatkeun siswa.',
            steps: [
              'Buka Mitra industri.',
              'Klik Tambah mitra tuluy eusian datana.',
              'Simpen. Mitra nu tos gaduh panempatan teu tiasa dipupus.',
            ],
            href: '/pkl/partners',
          },
          {
            heading: 'Periode, aspék panilaian, sareng wates predikat',
            body: 'Dina Periode dan aspek, jieun periode PKL (nami, taun ajaran, tanggal mimiti sareng rengse) ogé aspék panilaian nu aya bobotna. Tombol Pasang aspek bawaan nyieun Disiplin (20), Kompetensi teknis (30), Etika kerja (20), Kerja sama (15), sareng Laporan (15) upami can aya aspék. Wates predikat A, B, C disetél dina kaca nu sami (bawaan 90/80/70; di handap C nyaéta D).',
            steps: [
              'Buka Periode dan aspek.',
              'Tambihan periode PKL; tanggal mimiti teu tiasa saatos tanggal rengse.',
              'Pasang aspék bawaan atanapi tambihan aspék sorangan (bobot 1 dugi ka 100).',
              'Setél wates predikat (wilangan bulet 1 dugi ka 100, A langkung ageung tibatan B, B langkung ageung tibatan C) tuluy simpen.',
            ],
            href: '/pkl/settings',
          },
          {
            heading: 'Nempatkeun siswa',
            body: 'Kaca PKL nunjukkeun panempatan dina tampilan papan atanapi tabel, kalayan saringan periode, mitra, status, sareng pamilarian. Pangurus nempatkeun seueur siswa sakaligus.',
            steps: [
              'Buka PKL tuluy klik Tempatkan siswa.',
              'Pilih periode sareng mitra, tuluy eusian guru pembimbing sareng pembimbing industri upami aya.',
              'Centang siswa (tiasa disaring per kelas) tuluy klik Tempatkan.',
              'Siswa nu tos gaduh panempatan dina periode nu sami dilangkungan.',
              'Robih status ku tombol Mulai PKL, Selesaikan, atanapi Batalkan.',
            ],
            href: '/pkl',
          },
          {
            heading: 'Jurnal, kunjungan, sareng panilaian',
            body: 'Dina detil panempatan aya tab Jurnal (hiji éntri per poé, tanggal sami nimpa), Kunjungan monitoring guru, Penilaian, sareng Tautan industri. Nilai per aspék (wilangan bulet 0 dugi ka 100) diisi ku sakola sareng industri; nilai aspék téh rata-rata panilai, nilai akhir téh rata-rata kalayan bobot. Rekap periode nunjukkeun nilai akhir, predikat, poé jurnal, poé hadir, sareng kunjungan, tur tiasa diékspor. Sertifikat PKL diunduh jadi PDF tina detil panempatan.',
            href: '/pkl/report',
          },
          {
            heading: 'Nu kedah diperhatoskeun',
            body: 'PKL merlukeun modul Administrasi. Sadaya guru tiasa ningali data PKL, tapi ngeusianana dibatesan.',
            steps: [
              'Mitra, periode, aspék, wates, sareng panempatan ngan diurus ku pangurus PKL. Jurnal, kunjungan, nilai sakola, sareng tautan industri ogé tiasa diisi ku guru pembimbing panempatan éta.',
              'Alur status: Direncanakan ka Berjalan atanapi Dibatalkan; Berjalan ka Selesai atanapi Dibatalkan. Selesai sareng Dibatalkan teu tiasa dirobih deui.',
              'Panempatan ngan tiasa dipupus upami masih Direncanakan sareng can aya jurnal; upami henteu, batalkeun. Periode nu tos gaduh panempatan teu tiasa dipupus.',
              'Tanggal jurnal teu tiasa acan datang tur kedah aya dina periode (kaleuleuwihan 7 poé).',
              'Pembimbing industri ngeusian jurnal sareng nilai ngalangkungan tautan husus tanpa login. Tautan ngan dipidangkeun sakali, nyieun tautan anyar mareuman nu lami, ngabatalkeun panempatan nyabut tautanana, sareng tautan jadi baca-wungkul 14 poé saatos periode rengse.',
              'Ngarobih wates predikat langsung dipaké kana sadaya nilai PKL, kaasup nu lami.',
            ],
          },
        ],
      },
    },
  },
];
