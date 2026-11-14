import type { DocArticle } from '@/lib/docs-types';

/** Panduan kerja panel sekolah untuk modul akademik: nilai, rapor, ekskul, tahfidz, PKL. Isi: id, en, su. */
export const ACADEMIC_DOCS: DocArticle[] = [
  {
    slug: 'grades',
    icon: 'book',
    tone: 'violet',
    group: 'academic',
    module: 'grades',
    text: {
      id: {
        title: 'Nilai: membuat penilaian dan mengisi nilai siswa',
        summary:
          'Panduan guru mengisi nilai per kelas dan mata pelajaran, serta cara sekolah mengatur KKM, predikat, dan bobot nilai.',
        forWho: 'Guru mata pelajaran, Kurikulum, Operator, Kepala sekolah, dan Admin sekolah.',
        sections: [
          {
            heading: 'Menyiapkan KKM, predikat, dan komponen nilai',
            body: 'Sebelum guru mulai mengisi, tentukan dulu KKM, batas predikat A/B/C, dan komponen nilai beserta bobotnya (misalnya Tugas atau UTS). Bila sekolah belum punya komponen, tombol Pasang komponen bawaan membuat Tugas (20), Ulangan Harian (30), UTS (20), dan UAS (30). Bila belum diatur, KKM-nya 75 dengan batas A 90, B 80, dan C 70.',
            steps: [
              'Buka Pengaturan penilaian.',
              'Isi batas ketuntasan bawaan sekolah (KKM) dan batas predikat A, B, dan C. A harus lebih besar dari B, dan B lebih besar dari C. Batas ini berlaku untuk mapel yang belum punya Kriteria Ketercapaian Tujuan Pembelajaran (KKTP) sendiri; batas per mapel (boleh desimal) diatur di tab KKTP pada Kurikulum. Di bagian yang sama Anda memilih cara menghitung nilai akhir; mengubahnya memengaruhi rapor draf dan ditolak bila semester aktif sudah punya rapor final.',
              'Tambah komponen nilai beserta bobotnya (1 sampai 100), atau klik Pasang komponen bawaan.',
              'Simpan. Bila jumlah bobot bukan 100%, muncul peringatan.',
            ],
            href: '/grades/settings',
            tip: 'Usahakan jumlah bobot tepat 100% supaya nilai akhir mudah dijelaskan kepada wali murid.',
            warning:
              'Mengubah bobot langsung memengaruhi nilai akhir semua siswa, termasuk nilai yang sudah lama diisi. Komponen yang sudah dipakai penilaian tidak bisa dihapus.',
          },
          {
            heading: 'Membuat penilaian dan mengisi nilai',
            body: 'Pilih semester, kelas, dan mata pelajaran, lalu buat penilaian (misalnya Ulangan Bab 1). Setelah itu isi nilai tiap siswa pada lembar nilai.',
            steps: [
              'Buka menu Penilaian, lalu pilih semester, kelas, dan mata pelajaran.',
              'Di tab Penilaian, klik Penilaian baru. Isi judul, komponen, tanggal, dan nilai maksimal (bawaannya 100).',
              'Klik Isi nilai pada penilaian itu.',
              'Ketik nilai tiap siswa, antara 0 dan nilai maksimal. Kosongkan kolom bila ingin menghapus nilai.',
              'Klik Simpan.',
            ],
            href: '/grades',
            tip: 'Nilai bisa disimpan bertahap. Anda boleh mengisi sebagian siswa dulu dan melengkapinya di lain waktu.',
            warning:
              'Menghapus sebuah penilaian ikut menghapus semua nilai di dalamnya. Nilai maksimal juga tidak bisa diturunkan sampai di bawah nilai yang sudah terisi.',
          },
          {
            heading: 'Formatif dan sumatif: mana yang masuk nilai rapor',
            body: 'Setiap komponen nilai punya kategori. Sumatif adalah penilaian yang masuk nilai akhir, rapor, kenaikan kelas, dan kelulusan sesuai bobotnya (misalnya UTS atau UAS). Formatif adalah umpan balik belajar, misalnya kuis singkat atau latihan: nilainya tampil di rekap tetapi tidak masuk nilai akhir, rapor, kenaikan, atau kelulusan, dan tidak punya bobot. Komponen yang sudah ada tetap sumatif sampai Anda mengubahnya. Pada komponen formatif, sebuah penilaian boleh ditandai Asesmen awal (diagnostik) untuk melihat kemampuan awal siswa. Pada komponen sumatif, penilaian boleh ditandai lingkupnya: Lingkup materi atau Akhir semester. Anda juga bisa mencatat teknik penilaiannya, misalnya tes, observasi, atau proyek.',
            steps: [
              'Buka Pengaturan penilaian, lalu tambah atau ubah komponen.',
              'Pada Kategori, pilih Sumatif atau Formatif (umpan balik, tidak masuk nilai rapor). Bobot hanya diisi untuk sumatif.',
              'Saat membuat penilaian, pilih komponennya. Layar menampilkan kategorinya dan pilihan tambahan yang sesuai.',
              'Di tab Rekap, nilai formatif tampil di kolom Umpan balik yang terpisah dari nilai akhir.',
            ],
            href: '/grades/settings',
            tip: 'Jumlah bobot 100% hanya dihitung dari komponen sumatif. Komponen formatif tidak ikut dijumlahkan.',
            warning:
              'Kategori komponen tidak bisa diubah selama semester aktif punya rapor final. Buka kembali rapornya lebih dulu. Wali murid melihat nilai formatif di bagian Umpan balik belajar, bukan di nilai rapor.',
          },
          {
            heading: 'Membaca rekap dan nilai akhir',
            body: 'Tab Rekap menampilkan, per siswa, rata-rata tiap komponen, nilai akhir, dan predikat. Di bagian atas ada ringkasan rata-rata kelas, nilai tertinggi, nilai terendah, dan jumlah siswa di bawah KKM. Nilai akhir dihitung menurut cara yang dipilih di Pengaturan penilaian. Rata-rata tertimbang (bawaan): komponen yang belum punya nilai tidak ikut dihitung, sehingga nilai akhir tidak turun hanya karena ada komponen yang belum diujikan. Persentase: bobot dianggap persen dan komponen yang belum dinilai dihitung 0. Rata-rata biasa: rata-rata komponen yang sudah ada nilainya tanpa bobot. Rekap bisa diunduh sebagai Excel.',
            href: '/grades',
            tip: 'Gunakan jumlah siswa di bawah KKM untuk merencanakan remedial lebih awal.',
          },
          {
            heading: 'Aturan nilai tersimpan per semester',
            body: 'Aturan nilai (KKM, batas predikat, cara menghitung, komponen, dan KKTP) disimpan per semester. Saat rapor pertama sebuah semester difinalisasi, atau saat semester itu ditinggalkan karena semester lain diaktifkan, aturannya otomatis disimpan atau "dibekukan". Akibatnya rapor yang sudah terbit tidak berubah walau aturan sekolah diubah kemudian. Di Pengaturan penilaian ada kartu Status konfigurasi semester yang menunjukkan apakah sebuah semester Beku atau Hidup, sejak kapan, dan apakah aturannya masih sama dengan aturan hari ini. Bila berbeda, tombol Samakan dengan aturan hari ini mengganti aturan semester itu dengan aturan terbaru; tombol ini ditolak selama semester itu masih punya rapor final. Di rekap, siswa yang rapornya sudah final diberi tanda Sesuai rapor terbit, artinya nilai akhir, predikat, dan KKM-nya sama dengan yang tertulis di rapor dan tidak ikut berubah.',
            href: '/grades/settings',
            tip: 'Mengubah aturan di semester aktif yang sudah beku otomatis ikut diterapkan ke aturan tersimpan semester itu, selama belum ada rapor final.',
            warning:
              'Komponen yang dibuat setelah sebuah semester dibekukan belum berlaku di semester itu. Bila penilaian ditolak karena hal ini, buka Pengaturan penilaian lalu pilih Samakan dengan aturan hari ini pada semester tersebut.',
          },
          {
            heading: 'Siapa yang bisa melakukan apa',
            body: 'Guru hanya bisa melihat dan mengisi nilai untuk kelas dan mata pelajaran yang diampunya. Operator dan Admin sekolah bisa mengisi semua kelas. Kepala sekolah dan Kurikulum bisa melihat semua kelas dan mata pelajaran. Pengaturan penilaian (KKM, predikat, bobot) hanya bisa diubah oleh Kurikulum, Operator, dan Admin sekolah. Nilai dan rapor adalah satu modul. Ekstrakurikuler punya predikat sendiri di modul Ekstrakurikuler, dan predikat itu tampil di rapor.',
          },
          {
            heading: 'Mengaitkan penilaian ke tujuan pembelajaran (TP) dan melihat ketercapaiannya',
            body: 'Sebuah penilaian dapat dikaitkan ke satu atau beberapa tujuan pembelajaran (TP) mata pelajaran itu, paling banyak 20 TP. Satu skor berlaku untuk semua TP yang dipilih; bila ingin ketercapaian tiap TP dinilai terpisah, buat penilaian sendiri untuk tiap TP. Tab Ketercapaian TP lalu menunjukkan, untuk setiap siswa dan TP, persen hasilnya, status Tercapai atau Belum tercapai, ambang yang dipakai beserta asalnya (kriteria TP, KKM mapel, atau KKM sekolah), dan jumlah skor. Hanya penilaian sumatif yang menentukan status. Penilaian formatif tampil terpisah sebagai kemajuan (umpan balik) dan tidak menentukan ketercapaian untuk rapor. Angka di tab ini belum memengaruhi rapor.',
            steps: [
              'Buka menu Penilaian, lalu pilih semester, kelas, dan mata pelajaran.',
              'Di tab Penilaian, klik Penilaian baru, atau pilih Ubah pada penilaian yang sudah ada.',
              'Pada bagian Tujuan Pembelajaran (TP), klik Pilih TP, cari bila perlu, lalu centang TP yang diukur. Simpan.',
              'Isi nilai seperti biasa, lalu buka tab Ketercapaian TP untuk melihat hasilnya.',
              'Bila perlu, klik Ubah keputusan guru pada sebuah kotak, pilih Tercapai, Belum tercapai, atau Ikuti hitungan, dan tulis catatan. Keputusan guru menggantikan hasil hitungan untuk siswa dan TP itu.',
            ],
            href: '/grades',
            tip: 'Bila satu TP diukur beberapa kali, pilih cara menggabungkan skornya (rata-rata, terbaru, atau tertinggi) di Pengaturan penilaian.',
            warning:
              'TP versi lama (sudah diganti atau dinonaktifkan) tetap tampil pada penilaian yang sudah memakainya, tetapi tidak bisa ditambahkan ke penilaian lain. Keputusan guru tidak bisa diubah untuk siswa yang rapornya sudah final.',
          },
          {
            heading: 'Remedial dan pengayaan',
            body: 'Tab Remedial dan pengayaan membantu guru menangani murid yang belum tuntas dan yang sudah tuntas. Bagian Murid yang perlu remedial menampilkan murid yang nilai aslinya di bawah KKM pada penilaian sumatif yang dihitung ke nilai akhir, lengkap dengan nilai asli, batas KKM, dan nilai yang sedang dipakai. Guru mencatat hasil remedial (penilaian ulang) dengan tombol Catat hasil remedial. Nilai asli murid tidak pernah diubah: hasil remedial disimpan terpisah sebagai percobaan, paling banyak 20 percobaan per murid untuk satu penilaian. Pengaruhnya pada nilai akhir mengikuti Kebijakan nilai remedial di Pengaturan penilaian. Bawaannya hanya dicatat, jadi nilai akhir tetap dari nilai asli. Bagian Sesi pendampingan dipakai untuk mencatat sesi remedial (pendampingan bagi yang belum tuntas) dan sesi pengayaan (pendalaman bagi yang sudah tuntas), beserta pesertanya dan tujuan pembelajaran yang disasar. Pengayaan tidak mengubah nilai. Di tab Rekap, murid yang punya remedial diberi penanda, dan wali murid melihat keterangan yang lembut pada mata pelajaran terkait.',
            steps: [
              'Buka menu Penilaian, pilih semester, kelas, dan mata pelajaran, lalu buka tab Remedial dan pengayaan.',
              'Pada Murid yang perlu remedial, klik Catat hasil remedial di penilaian yang dimaksud. Isi nilai (antara 0 dan nilai maksimal), tanggal, dan catatan bila perlu, lalu simpan.',
              'Untuk membatalkan sebuah percobaan, buka lagi Catat hasil remedial untuk murid itu dan klik Hapus pada percobaan tersebut.',
              'Pada Sesi pendampingan, klik Sesi baru, pilih Remedial atau Pengayaan, isi judul dan tanggal, lalu pilih tujuan pembelajaran bila perlu.',
              'Setelah sesi dibuat, pilih peserta. Tombol usulan membantu memilih murid yang perlu remedial atau yang sudah tuntas, dan Anda bebas mengubah pilihannya.',
              'Untuk mengubah cara hasil remedial dipakai, buka Pengaturan penilaian dan pilih Kebijakan nilai remedial.',
            ],
            href: '/grades',
            tip: 'Mulailah dengan kebijakan bawaan (hanya dicatat). Pilih kebijakan lain setelah sekolah sepakat bagaimana hasil remedial boleh memengaruhi nilai akhir.',
            warning:
              'Mengubah kebijakan nilai remedial memengaruhi rapor draf, bukan rapor yang sudah final. Selama rapor kelas sudah final, remedial dan sesi pendampingan tidak bisa diubah; buka kembali rapornya lebih dulu.',
          },
        ],
        faq: [
          {
            q: 'Apa arti Beku pada status semester?',
            a: 'Beku berarti aturan nilai semester itu tersimpan tersendiri. Rapor yang sudah terbit tidak berubah bila aturan sekolah diubah kemudian. Semester yang masih Hidup mengikuti aturan sekolah hari ini dan akan otomatis dibekukan saat rapor pertamanya difinalisasi.',
          },
          {
            q: 'Kenapa mata pelajaran saya tidak muncul saat mengisi nilai?',
            a: 'Daftar hanya menampilkan kelas dan mata pelajaran yang Anda ampu. Pastikan semester yang dipilih benar. Bila tetap tidak ada, minta admin sekolah memeriksa jadwal pelajaran dan pengampu mata pelajaran di kelas itu.',
          },
          {
            q: 'Nilai yang saya ketik ditolak. Apa sebabnya?',
            a: 'Nilai harus berupa angka antara 0 dan nilai maksimal penilaian itu. Periksa apakah nilai maksimalnya sudah sesuai. Bila perlu, ubah nilai maksimal terlebih dahulu.',
          },
          {
            q: 'Bagaimana memperbaiki nilai yang sudah tersimpan?',
            a: 'Buka lagi Isi nilai pada penilaian itu, ubah angkanya, lalu klik Simpan. Jika rapor kelas itu sudah difinalisasi, minta Kurikulum atau Admin sekolah membuka kembali rapornya lebih dulu.',
          },
          {
            q: 'Nilai akhir siswa berubah sendiri. Kenapa?',
            a: 'Nilai akhir dihitung ulang setiap ada nilai baru atau bobot yang diubah. Periksa Pengaturan penilaian untuk melihat apakah bobot komponen baru saja diubah.',
          },
          {
            q: 'Kenapa nilai kuis tidak masuk nilai akhir?',
            a: 'Kemungkinan komponennya berkategori Formatif. Nilai formatif adalah umpan balik belajar, jadi tidak masuk nilai akhir, rapor, kenaikan, atau kelulusan. Bila nilainya memang harus dihitung, buka Pengaturan penilaian, ubah kategori komponennya menjadi Sumatif, dan isi bobotnya.',
          },
          {
            q: 'Mode persentase tidak bisa disimpan. Mengapa?',
            a: 'Mode persentase mensyaratkan jumlah bobot semua komponen tepat 100%. Saat Anda memilih mode ini, layar menampilkan jumlah bobot saat ini. Bila bukan 100%, muncul peringatan merah dan tombol Simpan tidak aktif. Ubah bobot di kartu Komponen nilai sampai jumlahnya 100%, lalu simpan lagi. Mode lain tidak mensyaratkan jumlah bobot 100%.',
          },
          {
            q: 'Mengapa status TP seorang siswa masih kosong?',
            a: 'Status baru muncul bila siswa punya skor pada penilaian sumatif yang dikaitkan ke TP itu, atau bila guru sudah membuat keputusan. Penilaian formatif hanya tampil sebagai kemajuan dan tidak menentukan status.',
          },
          {
            q: 'Apakah remedial mengubah nilai asli murid?',
            a: 'Tidak. Nilai asli tidak pernah diubah. Hasil remedial disimpan terpisah, dan sekolah memilih di Pengaturan penilaian apakah hasil itu hanya dicatat atau ikut dipakai untuk nilai akhir.',
          },
          {
            q: 'Mengapa tombol remedial tidak aktif dan muncul keterangan rapor sudah final?',
            a: 'Rapor kelas itu pada semester ini sudah final, sehingga remedial dan sesi pendampingan dikunci. Minta Kurikulum atau Admin sekolah membuka kembali rapornya, lalu coba lagi.',
          },
        ],
      },
      en: {
        title: 'Grades: creating assessments and entering student scores',
        summary:
          'A guide for teachers to enter scores per class and subject, and for the school to set the passing mark, predicates, and score weights.',
        forWho: 'Subject teachers, Curriculum staff, Operators, the Principal, and School admins.',
        sections: [
          {
            heading: 'Setting the passing mark, predicates, and score components',
            body: 'Before teachers start, decide the passing mark (KKM), the A/B/C predicate thresholds, and the score components with their weights (for example Assignments or Midterm). If the school has no components yet, the Install default components button creates Assignments (20), Daily Tests (30), Midterm (20), and Final Exam (30). If nothing is set, the passing mark is 75 with A 90, B 80, and C 70.',
            steps: [
              'Open Grading settings.',
              "Enter the school's default mastery threshold (KKM) and the A, B, and C thresholds. A must be higher than B, and B higher than C. This threshold applies to subjects without their own Learning Objective Achievement Criteria (KKTP); a threshold per subject (decimals allowed) is set in the KKTP tab of Curriculum. In the same place you choose how the final grade is calculated; changing it affects draft report cards and is refused while the active semester has finalized report cards.",
              'Add score components with their weight (1 to 100), or click Install default components.',
              'Save. If the total weight is not 100%, a warning appears.',
            ],
            href: '/grades/settings',
            tip: 'Aim for a total weight of exactly 100% so the final score is easy to explain to parents.',
            warning:
              'Changing a weight immediately affects the final score of every student, including scores entered long ago. A component already used by an assessment cannot be deleted.',
          },
          {
            heading: 'Creating an assessment and entering scores',
            body: 'Pick the semester, class, and subject, then create an assessment (for example Chapter 1 Test). Then enter each student score on the score sheet.',
            steps: [
              'Open the Grading menu, then pick the semester, class, and subject.',
              'On the Assessments tab, click New assessment. Fill in the title, component, date, and maximum score (default 100).',
              'Click Enter scores on that assessment.',
              'Type each student score, between 0 and the maximum. Leave a field empty to clear a score.',
              'Click Save.',
            ],
            href: '/grades',
            tip: 'You can save in stages. Fill in some students first and complete the rest later.',
            warning:
              'Deleting an assessment also deletes all the scores inside it. The maximum score also cannot be lowered below a score already entered.',
          },
          {
            heading: 'Formative and summative: which count toward the report grade',
            body: 'Every score component has a category. Summative means the score counts toward the final grade, the report card, promotion, and graduation according to its weight (for example Midterm or Final Exam). Formative means learning feedback, such as a short quiz or practice: the score shows in the recap but does not count toward the final grade, report card, promotion, or graduation, and it has no weight. Existing components stay summative until you change them. On a formative component, an assessment can be marked Initial assessment (diagnostic) to see where students start. On a summative component, an assessment can be marked with its scope: Material scope or End of semester. You can also record the assessment technique, such as a test, observation, or project.',
            steps: [
              'Open Grading settings, then add or edit a component.',
              'Under Category, pick Summative or Formative (feedback, not in report grade). A weight is only entered for summative.',
              'When you create an assessment, pick its component. The screen shows the category and the matching extra options.',
              'On the Recap tab, formative scores appear in the Feedback columns, separate from the final grade.',
            ],
            href: '/grades/settings',
            tip: 'The 100% total weight is counted from summative components only. Formative components are not added up.',
            warning:
              'The category of a component cannot be changed while the active semester has finalized report cards. Reopen the report cards first. Parents see formative scores under Learning feedback, not in the report grade.',
          },
          {
            heading: 'Reading the recap and final score',
            body: 'The Recap tab shows, per student, the average of each component, the final score, and the predicate. At the top is a summary of the class average, the highest and lowest scores, and the number of students below the passing mark. The final score is a weighted average. Components with no scores yet are left out, so the final score does not drop just because a component has not been tested. The recap can be downloaded as Excel.',
            href: '/grades',
            tip: 'Use the number of students below the passing mark to plan remedial classes early.',
          },
          {
            heading: 'Grading rules are saved per semester',
            body: 'The grading rules (passing mark, predicate thresholds, calculation method, components, and KKTP) are saved per semester. When the first report card of a semester is finalized, or when that semester is left behind because another one is activated, its rules are saved automatically, which is called "frozen". As a result, report cards that were already issued do not change when the school rules are changed later. In Grading settings, the Semester configuration status card shows whether a semester is Frozen or Live, since when, and whether its rules still match today\'s rules. When they differ, the Match today\'s rules button replaces the rules of that semester with the latest ones; it is refused while that semester still has final report cards. In the recap, students whose report card is already final are marked Matches issued report card, meaning the final score, predicate, and KKM are the same as written on the report card and do not change.',
            href: '/grades/settings',
            tip: 'Changing the rules in an active semester that is already frozen is applied automatically to the saved rules of that semester, as long as there is no final report card.',
            warning:
              "A component created after a semester was frozen does not apply to that semester yet. If an assessment is refused because of this, open Grading settings and choose Match today's rules for that semester.",
          },
          {
            heading: 'Who can do what',
            body: 'Teachers can only view and fill in scores for the classes and subjects they teach. Operators and School admins can fill in every class. The Principal and Curriculum staff can view all classes and subjects. Grading settings (passing mark, predicates, weights) can only be changed by Curriculum staff, Operators, and School admins. Grades and report cards are one module. Extracurriculars have their own predicate in the Extracurricular module, and it appears on the report card.',
          },
          {
            heading: 'Linking assessments to learning objectives (TP) and viewing achievement',
            body: 'An assessment can be linked to one or more learning objectives (TP) of its subject, at most 20. One score applies to all the selected TP; if you want each TP judged separately, create a separate assessment for each one. The Objective achievement tab then shows, for every student and TP, the percentage, the status Achieved or Not yet achieved, the threshold used and where it comes from (TP criteria, subject KKM, or school KKM), and the number of scores. Only summative assessments decide the status. Formative assessments are shown separately as progress (feedback) and do not decide achievement for the report card. The figures in this tab do not affect the report card yet.',
            steps: [
              'Open the Grades menu, then choose the semester, class, and subject.',
              'In the Assessments tab, click New assessment, or choose Edit on an existing one.',
              'In the Learning objectives (TP) part, click Choose TP, search if needed, then tick the TP being measured. Save.',
              'Enter the scores as usual, then open the Objective achievement tab to see the result.',
              'If needed, click Change decision on a box, choose Achieved, Not yet achieved, or Follow the calculation, and write a note. A teacher decision replaces the calculated result for that student and TP.',
            ],
            href: '/grades',
            tip: 'When one TP is measured several times, choose how the scores are combined (average, latest, or highest) in Grading settings.',
            warning:
              'An old-version TP (replaced or deactivated) still shows on the assessments that already use it, but it cannot be added to other assessments. A teacher decision cannot be changed for a student whose report card is already final.',
          },
          {
            heading: 'Remedial and enrichment',
            body: 'The Remedial and enrichment tab helps teachers look after students who have not reached the passing mark and those who have. The Students who need remedial part lists students whose original score is below the passing mark (KKM) on summative assessments that count toward the final grade, together with the original score, the passing mark, and the score currently in use. Teachers record a remedial result (a retest) with the Record remedial result button. The original score of a student is never changed: the remedial result is stored separately as an attempt, up to 20 attempts per student for one assessment. Its effect on the final grade follows the Remedial score policy in Grading settings. By default results are only recorded, so the final grade still comes from the original score. The Support sessions part records remedial sessions (extra help for those who have not reached the passing mark) and enrichment sessions (going deeper for those who have), with the participants and the learning objectives aimed at. Enrichment does not change any score. In the Recap tab, students who have remedial are marked, and parents see a gentle note on the related subject.',
            steps: [
              'Open the Grades menu, pick the semester, class, and subject, then open the Remedial and enrichment tab.',
              'Under Students who need remedial, click Record remedial result on the assessment concerned. Enter the score (between 0 and the maximum), the date, and a note if needed, then save.',
              'To cancel an attempt, open Record remedial result for that student again and click Delete on that attempt.',
              'Under Support sessions, click New session, choose Remedial or Enrichment, fill in the title and dates, and pick learning objectives if needed.',
              'After the session is created, choose the participants. The suggestion button helps pick students who need remedial or who have reached the passing mark, and you are free to change the selection.',
              'To change how remedial results are used, open Grading settings and choose the Remedial score policy.',
            ],
            href: '/grades',
            tip: 'Start with the default policy (only recorded). Choose another policy once the school agrees on how remedial results may affect the final grade.',
            warning:
              'Changing the remedial score policy affects draft report cards, not report cards that are already final. While the report cards of a class are final, remedial and support sessions cannot be changed; reopen the report cards first.',
          },
        ],
        faq: [
          {
            q: 'What does Frozen mean in the semester status?',
            a: 'Frozen means the grading rules of that semester are saved on their own. Report cards that were already issued do not change when the school rules are changed later. A semester that is still Live follows the school rules of today and is frozen automatically when its first report card is finalized.',
          },
          {
            q: 'Why does my subject not appear when I enter scores?',
            a: 'The list only shows the classes and subjects you teach. Make sure the right semester is selected. If it still does not appear, ask the school admin to check the lesson schedule and the subject teacher for that class.',
          },
          {
            q: 'The score I typed is rejected. Why?',
            a: 'A score must be a number between 0 and the maximum score of that assessment. Check that the maximum score is correct and change it first if needed.',
          },
          {
            q: 'How do I correct a score that is already saved?',
            a: 'Open Enter scores on that assessment again, change the number, and click Save. If the report cards of that class are already finalized, ask Curriculum staff or the School admin to reopen them first.',
          },
          {
            q: 'A student final score changed by itself. Why?',
            a: 'The final score is recalculated whenever a new score is added or a weight is changed. Check Grading settings to see whether a component weight was changed recently.',
          },
          {
            q: 'Why does a quiz score not count toward the final grade?',
            a: 'The component is probably in the Formative category. Formative scores are learning feedback, so they do not count toward the final grade, report card, promotion, or graduation. If the score should count, open Grading settings, change the component category to Summative, and enter its weight.',
          },
          {
            q: 'Why can I not save the percentage mode?',
            a: 'The percentage mode needs the weights of all components to add up to exactly 100%. When you pick this mode, the screen shows the current total weight. If it is not 100%, a red warning appears and the Save button is disabled. Change the weights in the Grade components card until they add up to 100%, then save again. The other modes do not need the weights to add up to 100%.',
          },
          {
            q: 'Why is a student status for a TP still empty?',
            a: 'A status appears once the student has a score on a summative assessment linked to that TP, or once a teacher has made a decision. Formative assessments only show as progress and do not decide the status.',
          },
          {
            q: 'Does remedial change the original score of a student?',
            a: 'No. The original score is never changed. Remedial results are stored separately, and the school chooses in Grading settings whether they are only recorded or also used for the final grade.',
          },
          {
            q: 'Why are the remedial buttons disabled with a note that the report card is final?',
            a: 'The report card of that class is already final for this semester, so remedial and support sessions are locked. Ask Curriculum staff or the School admin to reopen the report card, then try again.',
          },
        ],
      },
      su: {
        title: 'Nilai: nyieun panilaian sareng ngeusian nilai siswa',
        summary:
          'Pituduh guru ngeusian nilai per kelas sareng mata pelajaran, ogé cara sakola nyetél KKM, predikat, sareng bobot nilai.',
        forWho: 'Guru mata pelajaran, Kurikulum, Operator, Kepala sekolah, sareng Admin sekolah.',
        sections: [
          {
            heading: 'Nyiapkeun KKM, predikat, sareng komponén nilai',
            body: 'Sateuacan guru ngeusian, tangtoskeun heula KKM, wates predikat A/B/C, sareng komponén nilai sareng bobotna (contona Tugas atanapi UTS). Upami sakola can gaduh komponén, tombol Pasang komponen bawaan nyieun Tugas (20), Ulangan Harian (30), UTS (20), sareng UAS (30). Upami can disetél, KKM-na 75 kalayan wates A 90, B 80, sareng C 70.',
            steps: [
              'Buka Pengaturan penilaian.',
              'Eusian wates katuntasan baku sakola (KKM) sareng wates predikat A, B, sareng C. A kedah langkung ageung tibatan B, B langkung ageung tibatan C. Wates ieu berlaku pikeun mapel nu acan gaduh Kriteria Ketercapaian Tujuan Pembelajaran (KKTP) nyalira; wates per mapel (tiasa désimal) diatur dina tab KKTP di Kurikulum. Di tempat nu sami anjeun milih cara ngitung nilai ahir; ngarobihna mangaruhan rapor rarancang sareng ditolak upami semester aktif gaduh rapor final.',
              'Tambihan komponén nilai sareng bobotna (1 dugi ka 100), atanapi klik Pasang komponen bawaan.',
              'Simpen. Upami jumlah bobot sanés 100%, aya émutan.',
            ],
            href: '/grades/settings',
            tip: 'Usahakeun jumlah bobot pas 100% supados nilai akhir gampang dijelaskeun ka kolot siswa.',
            warning:
              'Ngarobih bobot langsung ngaruhan nilai akhir sadaya siswa, kaasup nilai nu tos lami diisi. Komponén nu tos dipaké panilaian teu tiasa dipupus.',
          },
          {
            heading: 'Nyieun panilaian sareng ngeusian nilai',
            body: 'Pilih semester, kelas, sareng mata pelajaran, tuluy jieun panilaian (contona Ulangan Bab 1). Saparantosna eusian nilai unggal siswa dina lembar nilai.',
            steps: [
              'Buka menu Penilaian, tuluy pilih semester, kelas, sareng mata pelajaran.',
              'Dina tab Penilaian, klik Penilaian baru. Eusian judul, komponén, tanggal, sareng nilai maksimal (bawaan 100).',
              'Klik Isi nilai dina panilaian éta.',
              'Ketik nilai unggal siswa, antara 0 sareng nilai maksimal. Kosongkeun kolom upami hoyong mupus nilai.',
              'Klik Simpan.',
            ],
            href: '/grades',
            tip: 'Nilai tiasa disimpen sakedik-sakedik. Anjeun tiasa ngeusian sawaréh siswa heula, sésana engké.',
            warning:
              'Mupus panilaian ogé mupus sadaya nilai di jerona. Nilai maksimal oge teu tiasa diturunkeun ka handap nilai nu tos kaeusi.',
          },
          {
            heading: 'Formatif jeung sumatif: nu mana anu asup kana nilai rapor',
            body: 'Unggal komponén nilai boga kategori. Sumatif nyaéta panilaian anu asup kana nilai akhir, rapor, kenaikan kelas, jeung kalulusan numutkeun bobotna (upamana UTS atawa UAS). Formatif nyaéta umpan balik diajar, upamana kuis pondok atawa latihan: nilaina muncul dina rekap tapi teu asup kana nilai akhir, rapor, kenaikan, atawa kalulusan, sarta teu boga bobot. Komponén anu geus aya tetep sumatif nepi ka Anjeun ngarobahna. Dina komponén formatif, hiji panilaian bisa ditandaan Asesmen awal (diagnostik) pikeun ningali kamampuh awal siswa. Dina komponén sumatif, panilaian bisa ditandaan lingkupna: Lingkup materi atawa Ahir semester. Anjeun oge bisa nyatet téknik panilaianna, upamana tés, observasi, atawa proyék.',
            steps: [
              'Buka Pengaturan penilaian, tuluy tambihan atawa robah komponén.',
              'Dina Kategori, pilih Sumatif atawa Formatif (umpan balik, teu asup kana nilai rapor). Bobot ukur diisi pikeun sumatif.',
              'Nalika nyieun panilaian, pilih komponénna. Layar nembongkeun kategorina jeung pilihan tambahan anu cocog.',
              'Dina tab Rekap, nilai formatif muncul dina kolom Umpan balik anu dipisah tina nilai akhir.',
            ],
            href: '/grades/settings',
            tip: 'Jumlah bobot 100% ukur diitung tina komponén sumatif. Komponén formatif teu diitung.',
            warning:
              'Kategori komponén teu bisa dirobah salila semester aktip boga rapor final. Buka deui rapor heula. Kolot siswa ningali nilai formatif dina bagian Umpan balik diajar, lain dina nilai rapor.',
          },
          {
            heading: 'Maca rekap sareng nilai akhir',
            body: 'Tab Rekap nunjukkeun, per siswa, rata-rata unggal komponén, nilai akhir, sareng predikat. Di luhur aya ringkesan rata-rata kelas, nilai pangluhurna, panghandapna, sareng jumlah siswa di handap KKM. Nilai akhir téh rata-rata kalayan bobot. Komponén nu can aya nilaina teu diitung, janten nilai akhir teu turun ngan ukur sabab aya komponén nu can diujian. Rekap tiasa diunduh jadi Excel.',
            href: '/grades',
            tip: 'Pake jumlah siswa di handap KKM kanggo ngarencanakeun remedial langkung awal.',
          },
          {
            heading: 'Aturan nilai disimpen per semester',
            body: 'Aturan nilai (KKM, wates predikat, cara ngitung, komponén, sareng KKTP) disimpen per semester. Nalika rapor kahiji sawatara semester difinalisasi, atanapi nalika semester éta ditinggalkeun margi semester sanés diaktipkeun, aturanna otomatis disimpen atanapi "dibekukeun". Hasilna rapor nu tos kaluar teu robih sanaos aturan sakola dirobih engké. Dina Pengaturan penilaian aya kartu Status konfigurasi semester nu nunjukkeun semester éta Beku atanapi Hirup, ti iraha, sareng aturanna masih sami sareng aturan ayeuna atanapi henteu. Upami béda, tombol Saruakeun jeung aturan ayeuna ngagentos aturan semester éta ku aturan pang anyarna; tombol ieu ditolak salami semester éta masih gaduh rapor final. Dina rekap, siswa nu raporna tos final diwenangan tanda Saluyu jeung rapor nu kaluar, hartosna nilai akhir, predikat, sareng KKM-na sami sareng nu aya dina rapor sarta teu robih.',
            href: '/grades/settings',
            tip: 'Ngarobih aturan dina semester aktip nu tos beku otomatis ogé diterapkeun ka aturan nu disimpen semester éta, salami can aya rapor final.',
            warning:
              'Komponén nu dijieun saatos semester dibekukeun can lumaku dina semester éta. Upami panilaian ditolak margi hal ieu, buka Pengaturan penilaian tuluy pilih Saruakeun jeung aturan ayeuna pikeun semester éta.',
          },
          {
            heading: 'Saha nu tiasa naon',
            body: 'Guru ngan tiasa ningali sareng ngeusian nilai kanggo kelas sareng mata pelajaran nu diampuna. Operator sareng Admin sekolah tiasa ngeusian sadaya kelas. Kepala sekolah sareng Kurikulum tiasa ningali sadaya kelas sareng mata pelajaran. Pengaturan penilaian (KKM, predikat, bobot) ngan tiasa dirobih ku Kurikulum, Operator, sareng Admin sekolah. Nilai sareng rapor téh hiji modul. Ékstrakurikuler gaduh predikat sorangan dina modul Ekstrakurikuler, tur predikatna muncul dina rapor.',
          },
          {
            heading: 'Ngaitkeun panilaian ka tujuan pangajaran (TP) jeung ningali kahontalna',
            body: 'Hiji panilaian tiasa dikaitkeun ka hiji atawa langkung tujuan pangajaran (TP) mapelna, paling loba 20 TP. Hiji skor lumaku pikeun sakabéh TP nu dipilih; upami hayang kahontal unggal TP dinilai sacara misah, jieun panilaian séwang-séwangan pikeun tiap TP. Tab Kahontal TP tuluy nembongkeun, pikeun unggal siswa jeung TP, perséna, status Kahontal atawa Can kahontal, ambang nu dipaké sarta asalna (kritéria TP, KKM mapel, atawa KKM sakola), jeung jumlah skor. Ngan panilaian sumatif nu nangtukeun status. Panilaian formatif ditémbongkeun sacara misah minangka kamajuan (umpan balik) jeung teu nangtukeun kahontal pikeun rapor. Angka dina tab ieu can mangaruhan rapor.',
            steps: [
              'Buka ménu Panilaian, tuluy pilih semester, kelas, jeung mapel.',
              'Dina tab Panilaian, klik Panilaian anyar, atawa pilih Robah dina panilaian nu geus aya.',
              'Dina bagian Tujuan Pangajaran (TP), klik Pilih TP, pilari upami perlu, tuluy centang TP nu diukur. Simpen.',
              'Eusian nilai saperti biasa, tuluy buka tab Kahontal TP pikeun ningali hasilna.',
              'Upami perlu, klik Robah kaputusan guru dina hiji kotak, pilih Kahontal, Can kahontal, atawa Turutan itungan, sarta tulis catetan. Kaputusan guru ngagentos hasil itungan pikeun siswa jeung TP éta.',
            ],
            href: '/grades',
            tip: 'Upami hiji TP diukur sababaraha kali, pilih cara ngagabungkeun skorna (rata-rata, pangahirna, atawa pangluhurna) dina Pangaturan panilaian.',
            warning:
              'TP vérsi heubeul (geus diganti atawa dipareuman) tetep muncul dina panilaian nu geus migunakeunana, tapi teu tiasa ditambahkeun kana panilaian séjén. Kaputusan guru teu tiasa dirobah pikeun siswa nu raporna geus final.',
          },
          {
            heading: 'Remedial jeung pengayaan',
            body: 'Tab Remedial jeung pengayaan ngabantu guru ngurus murid nu acan tuntas jeung nu geus tuntas. Bagian Murid nu peryogi remedial nembongkeun murid nu nilai aslina handapeun KKM dina panilaian sumatif nu diitung kana nilai ahir, lengkep jeung nilai asli, wates KKM, jeung nilai nu keur dipaké. Guru nyatet hasil remedial (panilaian deui) ku tombol Catet hasil remedial. Nilai asli murid teu pernah dirobah: hasil remedial disimpen misah minangka percobaan, paling loba 20 percobaan per murid pikeun hiji panilaian. Pangaruhna kana nilai ahir nuturkeun Kawijakan nilai remedial dina Pengaturan penilaian. Bawaanna ngan dicatet, jadi nilai ahir tetep tina nilai asli. Bagian Sési pendampingan dipaké pikeun nyatet sési remedial (pendampingan pikeun nu acan tuntas) jeung sési pengayaan (pendalaman pikeun nu geus tuntas), sareng pamilonna jeung tujuan pangajaran nu diudag. Pengayaan teu ngarobah nilai. Dina tab Rekap, murid nu boga remedial dipasihan tanda, jeung kolot murid ningali katerangan nu lemah lembut dina mata pelajaran nu patali.',
            steps: [
              'Buka ménu Panilaian, pilih semester, kelas, jeung mata pelajaran, tuluy buka tab Remedial jeung pengayaan.',
              'Dina Murid nu peryogi remedial, klik Catet hasil remedial dina panilaian nu dimaksud. Eusian nilai (antara 0 jeung nilai maksimal), tanggal, jeung catetan upami perlu, tuluy simpen.',
              'Pikeun ngabatalkeun hiji percobaan, buka deui Catet hasil remedial pikeun murid éta tuluy klik Pupus dina percobaan éta.',
              'Dina Sési pendampingan, klik Sési anyar, pilih Remedial atawa Pengayaan, eusian judul jeung tanggal, tuluy pilih tujuan pangajaran upami perlu.',
              'Sanggeus sési dijieun, pilih pamilon. Tombol usulan ngabantu milih murid nu peryogi remedial atawa nu geus tuntas, jeung Anjeun bébas ngarobah pilihanana.',
              'Pikeun ngarobah cara hasil remedial dipaké, buka Pengaturan penilaian tuluy pilih Kawijakan nilai remedial.',
            ],
            href: '/grades',
            tip: 'Mimitian ku kawijakan bawaan (ngan dicatet). Pilih kawijakan séjén sanggeus sakola sapuk kumaha hasil remedial meunang mangaruhan nilai ahir.',
            warning:
              'Ngarobah kawijakan nilai remedial mangaruhan rapor rarancang, lain rapor nu geus final. Salila rapor kelas geus final, remedial jeung sési pendampingan teu bisa dirobah; buka deui rapor heula.',
          },
        ],
        faq: [
          {
            q: 'Naon hartosna Beku dina status semester?',
            a: 'Beku hartosna aturan nilai semester éta disimpen sorangan. Rapor nu tos kaluar teu robih upami aturan sakola dirobih engké. Semester nu masih Hirup nuturkeun aturan sakola ayeuna sarta otomatis dibekukeun nalika rapor kahijina difinalisasi.',
          },
          {
            q: 'Naha mata pelajaran kuring teu muncul nalika ngeusian nilai?',
            a: 'Daptarna ngan nunjukkeun kelas sareng mata pelajaran nu anjeun ampu. Pastikeun semesterna bener. Upami tetep teu aya, hubungi admin sakola pikeun mariksa jadwal pelajaran sareng pangampu mata pelajaran di kelas éta.',
          },
          {
            q: 'Nilai nu diketik ditolak. Naon sababna?',
            a: 'Nilai kedah angka antara 0 sareng nilai maksimal panilaian éta. Pariksa nilai maksimalna tos pas, upami peryogi robih heula.',
          },
          {
            q: 'Kumaha ngabenerkeun nilai nu tos disimpen?',
            a: 'Buka deui Isi nilai dina panilaian éta, robih angkana, tuluy klik Simpan. Upami rapor kelas éta tos difinalisasi, bantun Kurikulum atanapi Admin sekolah muka deui rapor heula.',
          },
          {
            q: 'Nilai akhir siswa robih nyalira. Naha?',
            a: 'Nilai akhir diitung deui unggal aya nilai anyar atanapi bobot dirobih. Pariksa Pengaturan penilaian pikeun ningali bobot komponén nembé dirobih atanapi henteu.',
          },
          {
            q: 'Naha nilai kuis teu asup kana nilai akhir?',
            a: 'Kamungkinan komponénna kategori Formatif. Nilai formatif téh umpan balik diajar, jadi teu asup kana nilai akhir, rapor, kenaikan, atawa kalulusan. Upami nilaina kedah diitung, buka Pengaturan penilaian, robah kategori komponénna jadi Sumatif, tuluy eusian bobotna.',
          },
          {
            q: 'Naha mode persén teu bisa disimpen?',
            a: 'Mode persén merlukeun jumlah bobot sakabéh komponén pas 100%. Nalika milih mode ieu, layar nembongkeun jumlah bobot ayeuna. Lamun lain 100%, aya paringatan beureum jeung tombol Simpen teu aktif. Robah bobot dina kartu Komponén nilai nepi ka jumlahna 100%, tuluy simpen deui. Mode séjén teu merlukeun jumlah bobot 100%.',
          },
          {
            q: 'Naha status TP hiji siswa masih kosong?',
            a: 'Status karék muncul upami siswa boga skor dina panilaian sumatif nu dikaitkeun ka TP éta, atawa upami guru geus nyieun kaputusan. Panilaian formatif ngan muncul minangka kamajuan jeung teu nangtukeun status.',
          },
          {
            q: 'Naha remedial ngarobah nilai asli murid?',
            a: 'Henteu. Nilai asli teu pernah dirobah. Hasil remedial disimpen misah, jeung sakola milih dina Pengaturan penilaian naha hasilna ngan dicatet atawa milu dipaké pikeun nilai ahir.',
          },
          {
            q: 'Naha tombol remedial teu aktip jeung aya katerangan rapor geus final?',
            a: 'Rapor kelas éta dina semester ieu geus final, jadi remedial jeung sési pendampingan dikonci. Bantun Kurikulum atawa Admin sakola muka deui rapor, tuluy cobaan deui.',
          },
        ],
      },
    },
  },
  {
    slug: 'report-cards',
    icon: 'file',
    tone: 'sky',
    group: 'academic',
    module: 'grades',
    text: {
      id: {
        title: 'Rapor: menyusun, memfinalisasi, dan mengunduh rapor',
        summary:
          'Panduan wali kelas dan pengelola rapor dari mengisi catatan wali kelas sampai rapor final dalam bentuk PDF.',
        forWho: 'Wali kelas, Kurikulum, Operator, Kepala sekolah, dan Admin sekolah.',
        sections: [
          {
            heading: 'Mengisi catatan wali kelas dan memeriksa kelengkapan',
            body: 'Di menu Rapor, pilih semester dan kelas. Daftar siswa menampilkan status rapor (Draf atau Final), rata-rata, kelengkapan mata pelajaran, dan apakah catatan wali kelas sudah ada. Rapor yang masih Draf selalu mengikuti nilai terbaru.',
            steps: [
              'Buka menu Rapor, lalu pilih semester dan kelas.',
              'Buka pratinjau tiap siswa dan tulis catatan wali kelas (maksimal 500 karakter).',
              'Periksa kolom kelengkapan mata pelajaran. Bila ada yang kurang, minta guru mengisinya lewat menu Penilaian.',
              'Ulangi sampai semua siswa selesai diperiksa.',
            ],
            href: '/report-cards',
            tip: 'Mata pelajaran di rapor adalah yang punya penilaian di kelas itu pada semester tersebut. Bila ada mapel yang hilang, periksa apakah gurunya sudah membuat penilaian.',
          },
          {
            heading: 'Memfinalisasi rapor satu kelas',
            body: 'Finalisasi mengunci rapor satu kelas. Setelah final, nilai dan catatan wali kelas tidak bisa berubah, sehingga rapor yang dibagikan selalu sama. Bila ada siswa yang nilainya belum lengkap, muncul peringatan dan Anda bisa memilih Finalisasi tetap.',
            steps: [
              'Pastikan nilai dan catatan wali kelas sudah lengkap.',
              'Klik Finalisasi kelas.',
              'Bila muncul peringatan nilai belum lengkap, putuskan: kembali melengkapi, atau klik Finalisasi tetap.',
              'Pastikan status semua siswa berubah menjadi Final.',
            ],
            href: '/report-cards',
            warning:
              'Rapor final terkunci: nilai, penilaian, nilai ujian yang dikirim, penilaian ekskul, pengaturan nilai (KKM dan bobot), dan koreksi absensi pada semester itu ditolak dengan pesan "Rapor sudah difinalisasi" sampai rapor dibuka kembali. Untuk mengubahnya, Kurikulum, Operator, atau Admin sekolah harus memakai Buka kembali, yang mengembalikan rapor satu kelas menjadi draf. Catatan wali kelas tetap tersimpan, dan setiap rapor yang pernah difinalkan tetap tersimpan di riwayat sehingga tidak hilang saat dibuka kembali.',
          },
          {
            heading: 'Rapor terbit tidak berubah oleh pengaturan nilai',
            body: 'Saat rapor pertama sebuah semester difinalisasi, aturan nilai semester itu (KKM, predikat, cara menghitung, komponen, dan KKTP) ikut tersimpan. Karena itu angka pada rapor final tetap sama walau KKM, bobot, atau cara menghitung diubah kemudian. Di menu Penilaian, rekap kelas yang sudah final menampilkan tanda Sesuai rapor terbit, dan wali murid melihat tanda Sesuai rapor di portal. Bila Anda perlu menerapkan aturan baru pada semester yang sudah punya rapor final, buka kembali rapor semua kelasnya, samakan aturan semester itu di Pengaturan penilaian, lalu finalisasi lagi.',
            href: '/grades/settings',
            warning:
              'Semester yang masih punya rapor final tidak bisa disamakan dengan aturan baru. Semester atau kelas yang sudah punya rapor terbit juga tidak bisa dihapus, karena data rapor yang sudah terbit tidak boleh hilang.',
          },
          {
            heading: 'Mengunduh rapor',
            body: 'Rapor bisa diunduh sebagai PDF per siswa atau sekaligus satu kelas. Leger kelas, yaitu tabel nilai seluruh siswa, diunduh sebagai Excel. Rapor juga memuat ekstrakurikuler yang diikuti siswa beserta predikatnya, dan jumlah ketidakhadiran (sakit, izin, tanpa keterangan) dalam rentang semester.',
            steps: [
              'Buka menu Rapor, lalu pilih semester dan kelas.',
              'Klik unduh pada baris siswa untuk satu rapor, atau klik Unduh semua (PDF) untuk satu kelas.',
              'Untuk leger kelas, pilih unduhan Excel.',
            ],
            href: '/report-cards',
          },
          {
            heading: 'Mengatur nama penandatangan dan kalimat deskripsi rapor',
            body: 'Di Pengaturan rapor Anda mengisi nama dan NIP kepala sekolah, kota, dan alamat sekolah yang tercetak di rapor, serta kalimat deskripsi capaian untuk predikat A sampai D. Deskripsi capaian wajib diisi, sedangkan nama, NIP, kota, dan alamat boleh dikosongkan.',
            steps: [
              'Buka Pengaturan rapor.',
              'Isi nama dan NIP kepala sekolah, kota, dan alamat.',
              'Sesuaikan kalimat deskripsi untuk predikat A, B, C, dan D.',
              'Aktifkan Tampilkan peringkat bila peringkat kelas ingin dicantumkan di rapor.',
              'Simpan.',
            ],
            href: '/report-cards/settings',
            tip: 'Isi pengaturan ini sebelum mencetak rapor pertama supaya tidak perlu mencetak ulang.',
          },
          {
            heading: 'Mengisi catatan kokurikuler, perkembangan, dan deskripsi per mata pelajaran',
            body: 'Selain catatan wali kelas, tiap murid dapat diberi catatan kokurikuler (kegiatan di luar pelajaran) dan, untuk kelas yang memakai rapor deskriptif, catatan perkembangan. Keduanya diisi dari menu aksi pada kartu murid, lewat Catatan rapor, maksimal 1.000 karakter. Guru juga bisa menulis deskripsi capaian sendiri untuk satu mata pelajaran sekaligus untuk seluruh murid lewat panel Deskripsi per mata pelajaran. Deskripsi yang dikosongkan memakai deskripsi otomatis menurut predikat.',
            steps: [
              'Buka menu Rapor, lalu pilih semester dan kelas.',
              'Untuk catatan satu murid, buka menu aksi pada kartu murid dan pilih Catatan rapor.',
              'Untuk deskripsi, buka panel Deskripsi per mata pelajaran, pilih mata pelajaran, tulis deskripsi tiap murid, lalu klik Simpan deskripsi.',
            ],
            href: '/report-cards',
            tip: 'Gunakan kotak Hanya yang belum diisi untuk cepat menemukan murid yang masih kosong.',
            warning:
              'Setelah rapor final, semua catatan dan deskripsi terkunci. Buka kembali rapor kelas bila perlu mengubahnya.',
          },
          {
            heading: 'Deskripsi otomatis dari tujuan pembelajaran',
            body: 'Bila murid sudah punya ketercapaian tujuan pembelajaran (TP) pada sebuah mata pelajaran, rapor menyusun deskripsinya sendiri: satu kalimat untuk TP yang paling unggul dan satu kalimat untuk TP yang perlu bimbingan. Murid yang belum punya data TP tetap memakai kalimat menurut predikat. Di panel Deskripsi per mata pelajaran, tiap murid menampilkan teks otomatis beserta asalnya (dari ketercapaian TP atau dari predikat nilai) dan daftar TP unggul serta TP perlu bimbingan. Tulisan guru selalu menang atas teks otomatis. Tombol Pakai teks otomatis menghapus tulisan guru sehingga rapor kembali memakai teks otomatis. Di Pengaturan rapor, bagian Deskripsi dari tujuan pembelajaran mengatur jumlah TP yang disebut (1 sampai 5, bawaannya 2) dan kedua kalimat. Tulis {tp} di tempat daftar TP akan muncul, maksimal 300 karakter; kosongkan untuk memakai kalimat bawaan.',
            steps: [
              'Buka Pengaturan rapor, lalu bagian Deskripsi dari tujuan pembelajaran.',
              'Pilih jumlah TP yang disebut, dan ubah kalimat bila perlu. Contoh hasilnya langsung tampil.',
              'Simpan, lalu buka panel Deskripsi per mata pelajaran di menu Rapor untuk melihat hasilnya pada tiap murid.',
            ],
            href: '/report-cards/settings',
            tip: 'Bila semua TP murid sudah tercapai, kalimat perlu bimbingan tidak ditulis. Pakai tombol Pakai templat bawaan untuk mengembalikan kalimat awal.',
            warning:
              'Bila skor atau TP berubah setelah guru menyunting sebuah deskripsi, muncul tanda bahwa teks otomatis berubah sejak disunting. Rapor tetap memakai tulisan guru, jadi periksa dan pilih Pakai teks otomatis bila perlu. Saat finalisasi, jumlah deskripsi yang mungkin sudah tidak sesuai ditampilkan sebagai peringatan dan tidak menghalangi finalisasi.',
          },
          {
            heading: 'Rapor deskriptif untuk Fase A',
            body: 'Tingkat tertentu, misalnya kelas 1 dan 2 (Fase A), dapat memakai rapor deskriptif. Pada mode ini rapor hanya memuat deskripsi capaian dan catatan perkembangan, tanpa angka, predikat, KKM, dan peringkat, baik di pratinjau maupun di PDF. Angka tetap tersimpan di sekolah tetapi tidak ditampilkan, dan portal orang tua tidak memuatnya. Sebelum finalisasi, setiap murid wajib punya deskripsi untuk tiap mata pelajaran; kartu murid menampilkan Kurang berapa deskripsi.',
            steps: [
              'Buka Pengaturan sekolah, lalu bagian Tingkat kelas.',
              'Ubah tingkat yang dimaksud dan pilih Mode rapor: Deskriptif.',
              'Isi deskripsi tiap mata pelajaran, lalu finalisasi kelas seperti biasa.',
            ],
            href: '/school-settings',
            warning:
              'Mengganti mode tidak mengubah rapor yang sudah final. Rapor yang difinalisasi sesudahnya memakai mode yang berlaku saat itu.',
          },
          {
            heading: 'Tanggapan orang tua',
            body: 'Setelah rapor final, orang tua atau wali dapat menulis tanggapan lewat portal selama waktu menanggapi masih terbuka (bawaannya 30 hari sejak finalisasi). Bila tanggapan ditulis di rapor kertas, petugas dapat menyalinnya: buka menu aksi pada kartu murid, pilih Tanggapan orang tua, pilih wali, lalu Salin dari rapor kertas. Tanggapan yang ditulis wali sendiri tidak bisa diganti oleh petugas. Tanda Atas versi rapor sebelumnya muncul bila rapor difinalisasi ulang setelah tanggapan ditulis.',
            href: '/report-cards',
          },
          {
            heading: 'Bagian tambahan di PDF rapor',
            body: 'Di Pengaturan rapor ada tiga pilihan baru. Tampilkan bagian kokurikuler di PDF mencetak bagian kokurikuler, Tampilkan kotak tanggapan orang tua di PDF mencetak kotak tanggapan (kosong bila belum ada, supaya bisa ditulis tangan), dan Lama orang tua dapat menanggapi mengatur batas hari sejak finalisasi (kosongkan bila tanpa batas). Kedua pilihan cetak bawaannya mati agar PDF sekolah lama tidak berubah; menyalakannya membantu memenuhi komponen minimal rapor.',
            href: '/report-cards/settings',
          },
          {
            heading: 'Siapa yang bisa melakukan apa',
            body: 'Melihat daftar, pratinjau, dan mengunduh rapor satu kelas bisa dilakukan wali kelas kelas itu, Kurikulum, Operator, Kepala sekolah, dan Admin sekolah. Mengisi catatan dan memfinalisasi kelas bisa dilakukan wali kelas kelas itu, Kurikulum, Operator, dan Admin sekolah. Membuka kembali rapor final dan mengubah Pengaturan rapor hanya bisa dilakukan Kurikulum, Operator, dan Admin sekolah. Rapor memerlukan modul Nilai dan rapor aktif di sekolah Anda.',
          },
        ],
        faq: [
          {
            q: 'Saya mengubah KKM atau bobot, tetapi nilai di rapor final tidak berubah. Apakah ada yang salah?',
            a: 'Tidak. Rapor final memang tidak berubah oleh pengaturan nilai, supaya rapor yang sudah dibagikan selalu sama. Nilai di rekap kelas final juga mengikuti rapor dan diberi tanda Sesuai rapor terbit. Bila memang perlu dikoreksi, buka kembali rapor kelasnya, samakan aturan semester itu di Pengaturan penilaian, lalu finalisasi ulang.',
          },
          {
            q: 'Bagaimana mengubah rapor yang sudah final?',
            a: 'Minta Kurikulum, Operator, atau Admin sekolah membuka halaman Rapor, memilih kelas itu, lalu klik Buka kembali. Setelah rapor menjadi draf, perbaiki nilai atau catatan, lalu finalisasi lagi.',
          },
          {
            q: 'Kenapa kelas saya tidak muncul di daftar rapor?',
            a: 'Wali kelas hanya melihat kelas yang ia pegang. Pastikan semester yang dipilih benar. Bila masih tidak ada, minta admin sekolah memeriksa apakah Anda sudah ditetapkan sebagai wali kelas.',
          },
          {
            q: 'Ada mata pelajaran yang kosong di rapor. Apa yang harus dilakukan?',
            a: 'Mata pelajaran baru muncul bila gurunya sudah membuat penilaian di kelas itu. Minta guru yang bersangkutan membuat penilaian dan mengisi nilainya di menu Penilaian, lalu muat ulang halaman Rapor.',
          },
          {
            q: 'Peringkat tidak tampil di rapor. Kenapa?',
            a: 'Peringkat hanya tampil bila Tampilkan peringkat diaktifkan di Pengaturan rapor. Minta pengelola rapor mengaktifkannya, lalu unduh ulang rapor yang masih draf.',
          },
        ],
      },
      en: {
        title: 'Report cards: preparing, finalizing, and downloading',
        summary:
          'A guide for homeroom teachers and report card managers, from writing the homeroom note to a final report card as PDF.',
        forWho: 'Homeroom teachers, Curriculum staff, Operators, the Principal, and School admins.',
        sections: [
          {
            heading: 'Writing the homeroom note and checking completeness',
            body: 'In the Report cards menu, pick the semester and class. The student list shows the report status (Draft or Final), the average, subject completeness, and whether a homeroom note exists. A report card that is still a Draft always follows the latest scores.',
            steps: [
              'Open the Report cards menu, then pick the semester and class.',
              'Open each student preview and write the homeroom note (max 500 characters).',
              'Check the subject completeness column. If something is missing, ask the teacher to fill it in through the Grading menu.',
              'Repeat until every student is checked.',
            ],
            href: '/report-cards',
            tip: 'The subjects on a report card are those that have assessments in that class in that semester. If a subject is missing, check whether its teacher has created an assessment.',
          },
          {
            heading: 'Finalizing the report cards of one class',
            body: 'Finalizing locks the report cards of one class. After that, scores and homeroom notes cannot change, so the report cards you hand out always stay the same. If some students have incomplete scores, a warning appears and you can choose Finalize anyway.',
            steps: [
              'Make sure the scores and homeroom notes are complete.',
              'Click Finalize class.',
              'If a warning about incomplete scores appears, decide: go back and complete them, or click Finalize anyway.',
              'Check that every student status has changed to Final.',
            ],
            href: '/report-cards',
            warning:
              'A final report card is locked: scores, assessments, exam results already sent to the gradebook, extracurricular grades, grading settings (passing grade and weights), and attendance corrections for that semester are rejected with "The report card is finalized" until it is reopened. To change it, Curriculum staff, an Operator, or a School admin must use Reopen, which turns the whole class back into drafts. Homeroom notes are kept, and every report card that was ever finalized stays in the history, so nothing is lost when it is reopened.',
          },
          {
            heading: 'Issued report cards do not change with grading settings',
            body: 'When the first report card of a semester is finalized, the grading rules of that semester (passing mark, predicates, calculation method, components, and KKTP) are saved with it. That is why the figures on a final report card stay the same even if the passing mark, weights, or calculation method are changed later. In the Grading menu, the recap of a class that is already final shows the mark Matches issued report card, and parents see the mark As in report card in the portal. If you need to apply new rules to a semester that already has final report cards, reopen the report cards of all its classes, match the rules of that semester in Grading settings, then finalize again.',
            href: '/grades/settings',
            warning:
              'A semester that still has final report cards cannot be matched to the new rules. A semester or class that has issued report cards also cannot be deleted, because the data of issued report cards must never be lost.',
          },
          {
            heading: 'Downloading report cards',
            body: 'Report cards can be downloaded as PDF per student or for the whole class at once. The class ledger, a table of all student scores, is downloaded as Excel. A report card also lists the extracurriculars the student joined with their predicates, and the number of absences (sick, excused, unexcused) within the semester range.',
            steps: [
              'Open the Report cards menu, then pick the semester and class.',
              'Click download on a student row for one report card, or click Download all (PDF) for the whole class.',
              'For the class ledger, choose the Excel download.',
            ],
            href: '/report-cards',
          },
          {
            heading: 'Setting the signer name and the report card descriptions',
            body: 'In Report card settings you enter the principal name and NIP, the city, and the school address printed on the report card, plus the achievement description sentences for predicates A to D. Achievement descriptions are required, while name, NIP, city, and address may be left empty.',
            steps: [
              'Open Report card settings.',
              'Fill in the principal name and NIP, the city, and the address.',
              'Adjust the description sentences for predicates A, B, C, and D.',
              'Turn on Show rank if the class rank should appear on the report card.',
              'Save.',
            ],
            href: '/report-cards/settings',
            tip: 'Fill in these settings before printing the first report card so you do not have to reprint.',
          },
          {
            heading: 'Writing co-curricular notes, development notes, and descriptions per subject',
            body: 'Besides the homeroom note, each student can get a co-curricular note (activities outside lessons) and, for classes that use a descriptive report card, a development note. Both are written from the action menu on the student card, under Report card notes, up to 1,000 characters. Teachers can also write their own achievement description for one subject for the whole class from the Description per subject panel. A description left empty uses the automatic description for the grade.',
            steps: [
              'Open the Report cards menu, then pick the semester and class.',
              'For one student note, open the action menu on the student card and choose Report card notes.',
              'For descriptions, open the Description per subject panel, pick a subject, write each student description, then click Save descriptions.',
            ],
            href: '/report-cards',
            tip: 'Use the Only those not filled in box to quickly find students that are still empty.',
            warning:
              'Once the report cards are final, all notes and descriptions are locked. Reopen the class report cards if you need to change them.',
          },
          {
            heading: 'Automatic descriptions from learning objectives',
            body: "When a student already has learning objective (TP) results in a subject, the report card builds its own description: one sentence for the strongest objectives and one for the objectives that need guidance. Students without objective data still use the sentence for their grade. In the Descriptions per subject panel, every student shows the automatic text with where it comes from (from objective results or from the grade) and the lists of strong objectives and objectives needing guidance. A teacher's own text always wins over the automatic text. The Use automatic text button removes the teacher's text so the report card goes back to the automatic one. In Report card settings, the Descriptions from learning objectives section sets how many objectives are mentioned (1 to 5, default 2) and the two sentences. Write {tp} where the list of objectives should appear, up to 300 characters; leave it empty to use the default sentence.",
            steps: [
              'Open Report card settings, then the Descriptions from learning objectives section.',
              'Choose how many objectives to mention, and change the sentences if needed. The example result appears right away.',
              'Save, then open the Descriptions per subject panel in the Report cards menu to see the result for each student.',
            ],
            href: '/report-cards/settings',
            tip: 'When every objective of a student is achieved, the needs-guidance sentence is left out. Use the Use the default sentence button to go back to the original sentence.',
            warning:
              "If scores or objectives change after a teacher edited a description, a mark shows that the automatic text changed since the edit. The report card keeps the teacher's text, so check it and choose Use automatic text if needed. When finalizing, the number of descriptions that may be out of date is shown as a warning and does not stop finalizing.",
          },
          {
            heading: 'Descriptive report cards for Phase A',
            body: 'Some levels, for example grades 1 and 2 (Phase A), can use a descriptive report card. In this mode the report card only holds achievement descriptions and the development note, with no scores, grades, passing marks, or rankings, in both the preview and the PDF. Scores are still kept by the school but not shown, and the parent portal does not load them. Before finalizing, every student needs a description for each subject; the student card shows how many descriptions are missing.',
            steps: [
              'Open School settings, then the Class levels section.',
              'Edit the level in question and set Report card mode to Descriptive.',
              'Fill in the description for each subject, then finalize the class as usual.',
            ],
            href: '/school-settings',
            warning:
              'Changing the mode does not change report cards that are already final. Report cards finalized afterwards use the mode in effect at that time.',
          },
          {
            heading: 'Parent and guardian responses',
            body: 'Once a report card is final, a parent or guardian can write a response in the portal while the response period is open (30 days after finalizing by default). If a response was written on the paper report card, staff can copy it in: open the action menu on the student card, choose Guardian responses, pick the guardian, then Copy from paper report card. A response the guardian wrote themselves cannot be replaced by staff. The mark About an earlier version of the report card appears if the report card was finalized again after the response was written.',
            href: '/report-cards',
          },
          {
            heading: 'Extra sections on the report card PDF',
            body: 'Report card settings has three new options. Show the co-curricular section on the PDF prints the co-curricular section, Show the guardian response box on the PDF prints the response box (empty when there is no response yet, so it can be filled in by hand), and How long guardians can respond sets the number of days after finalizing (leave empty for no limit). Both print options are off by default so existing school PDFs do not change; turning them on helps meet the minimum report card components.',
            href: '/report-cards/settings',
          },
          {
            heading: 'Who can do what',
            body: 'Viewing the list, previewing, and downloading the report cards of a class can be done by that class homeroom teacher, Curriculum staff, Operators, the Principal, and School admins. Writing notes and finalizing a class can be done by that class homeroom teacher, Curriculum staff, Operators, and School admins. Reopening a final report card and changing Report card settings can only be done by Curriculum staff, Operators, and School admins. Report cards need the Grades and report cards module to be active at your school.',
          },
        ],
        faq: [
          {
            q: 'I changed the passing mark or weights, but the scores on the final report card did not change. Is something wrong?',
            a: 'No. A final report card is not changed by grading settings on purpose, so a report card that was already handed out always stays the same. The scores in the recap of a final class also follow the report card and are marked Matches issued report card. If a correction is really needed, reopen the report cards of the class, match the rules of that semester in Grading settings, then finalize again.',
          },
          {
            q: 'How do I change a report card that is already final?',
            a: 'Ask Curriculum staff, an Operator, or a School admin to open the Report cards page, pick that class, and click Reopen. Once the report cards are drafts, correct the scores or notes and finalize again.',
          },
          {
            q: 'Why does my class not appear in the report card list?',
            a: 'A homeroom teacher only sees the class they are in charge of. Make sure the right semester is selected. If it still does not appear, ask the school admin to check whether you are assigned as the homeroom teacher.',
          },
          {
            q: 'A subject is empty on the report card. What should I do?',
            a: 'A subject only appears once its teacher has created an assessment in that class. Ask that teacher to create an assessment and enter scores in the Grading menu, then reload the Report cards page.',
          },
          {
            q: 'The rank does not show on the report card. Why?',
            a: 'The rank only appears when Show rank is turned on in Report card settings. Ask the report card manager to turn it on, then download the draft report cards again.',
          },
        ],
      },
      su: {
        title: 'Rapor: nyusun, finalisasi, sareng ngaunduh rapor',
        summary:
          'Pituduh wali kelas sareng pangurus rapor ti ngeusian catetan wali kelas dugi ka rapor final dina wujud PDF.',
        forWho: 'Wali kelas, Kurikulum, Operator, Kepala sekolah, sareng Admin sekolah.',
        sections: [
          {
            heading: 'Ngeusian catetan wali kelas sareng mariksa kalengkepan',
            body: 'Dina menu Rapor, pilih semester sareng kelas. Daptar siswa nunjukkeun status rapor (Draf atanapi Final), rata-rata, kalengkepan mata pelajaran, sareng catetan wali kelas tos aya atanapi can. Rapor nu masih Draf salawasna nuturkeun nilai pang anyarna.',
            steps: [
              'Buka menu Rapor, tuluy pilih semester sareng kelas.',
              'Buka pratinjau unggal siswa tuluy tulis catetan wali kelas (maksimal 500 karakter).',
              'Pariksa kolom kalengkepan mata pelajaran. Upami aya nu kurang, bantun guru ngeusian ngalangkungan menu Penilaian.',
              'Candak deui dugi ka sadaya siswa kapariksa.',
            ],
            href: '/report-cards',
            tip: 'Mata pelajaran dina rapor nyaéta nu gaduh panilaian di kelas éta dina semester éta. Upami aya mapel nu leungit, pariksa gurunya tos nyieun panilaian atanapi can.',
          },
          {
            heading: 'Finalisasi rapor sakelas',
            body: 'Finalisasi ngonci rapor sakelas. Saparantos final, nilai sareng catetan wali kelas teu tiasa robih, janten rapor nu dibagikeun salawasna sami. Upami aya siswa nu nilaina can lengkep, aya émutan tuluy anjeun tiasa milih Finalisasi tetap.',
            steps: [
              'Pastikeun nilai sareng catetan wali kelas tos lengkep.',
              'Klik Finalisasi kelas.',
              'Upami aya émutan nilai can lengkep, putuskeun: balik ngalengkepan, atanapi klik Finalisasi tetap.',
              'Pastikeun status sadaya siswa robih jadi Final.',
            ],
            href: '/report-cards',
            warning:
              'Rapor final dikonci: nilai, panilaian, hasil ujian nu geus dikirim, panilaian ekskul, setélan nilai (KKM jeung bobot), jeung koréksi absénsi dina semester éta ditolak ku pesen "Rapor geus difinalisasi" nepi ka rapor dibuka deui. Kanggo ngarobihna, Kurikulum, Operator, atanapi Admin sekolah kedah ngagunakeun Buka kembali, nu ngabalikeun rapor sakelas jadi draf. Catetan wali kelas tetep disimpen, sarta unggal rapor nu kungsi difinalkeun tetep aya dina riwayat sangkan teu leungit basa dibuka deui.',
          },
          {
            heading: 'Rapor nu kaluar teu robih ku pangaturan nilai',
            body: 'Nalika rapor kahiji sawatara semester difinalisasi, aturan nilai semester éta (KKM, predikat, cara ngitung, komponén, sareng KKTP) ogé disimpen. Ku kituna angka dina rapor final tetep sami sanaos KKM, bobot, atanapi cara ngitung dirobih engké. Dina menu Penilaian, rekap kelas nu tos final nunjukkeun tanda Saluyu jeung rapor nu kaluar, sareng wali murid ningali tanda Saluyu jeung rapor di portal. Upami anjeun kedah nerapkeun aturan anyar dina semester nu tos gaduh rapor final, buka deui rapor sadaya kelasna, saruakeun aturan semester éta dina Pengaturan penilaian, tuluy finalisasi deui.',
            href: '/grades/settings',
            warning:
              'Semester nu masih gaduh rapor final teu tiasa disaruakeun jeung aturan anyar. Semester atanapi kelas nu tos gaduh rapor kaluar ogé teu tiasa dihapus, margi data rapor nu tos kaluar teu meunang leungit.',
          },
          {
            heading: 'Ngaunduh rapor',
            body: 'Rapor tiasa diunduh jadi PDF per siswa atanapi sakelas sakaligus. Leger kelas, nyaéta tabel nilai sadaya siswa, diunduh jadi Excel. Rapor ogé eusina ékstrakurikuler nu dilongok siswa sareng predikatna, ogé jumlah teu hadir (gering, idin, tanpa katerangan) dina rentang semester.',
            steps: [
              'Buka menu Rapor, tuluy pilih semester sareng kelas.',
              'Klik unduh dina baris siswa kanggo hiji rapor, atanapi klik Unduh semua (PDF) kanggo sakelas.',
              'Kanggo leger kelas, pilih unduhan Excel.',
            ],
            href: '/report-cards',
          },
          {
            heading: 'Nyetél nami nu nandatanganan sareng kalimah déskripsi rapor',
            body: 'Dina Pengaturan rapor anjeun ngeusian nami sareng NIP kepala sakola, kota, sareng alamat sakola nu dicitak dina rapor, ogé kalimah déskripsi capaian kanggo predikat A dugi ka D. Déskripsi capaian kedah kaeusi, sedengkeun nami, NIP, kota, sareng alamat tiasa dikosongkeun.',
            steps: [
              'Buka Pengaturan rapor.',
              'Eusian nami sareng NIP kepala sakola, kota, sareng alamat.',
              'Saluyukeun kalimah déskripsi kanggo predikat A, B, C, sareng D.',
              'Hurungkeun Tampilkan peringkat upami peringkat kelas hoyong dipidangkeun dina rapor.',
              'Simpen.',
            ],
            href: '/report-cards/settings',
            tip: 'Eusian pengaturan ieu sateuacan nyitak rapor kahiji supados teu kedah nyitak deui.',
          },
          {
            heading: 'Ngeusian catetan kokurikuler, kamekaran, jeung déskripsi per mata pelajaran',
            body: 'Salian ti catetan wali kelas, unggal murid bisa dibéré catetan kokurikuler (kagiatan di luar pelajaran) jeung, keur kelas nu maké rapor déskriptif, catetan kamekaran. Duanana diéusian tina ménu aksi dina kartu murid, lewat Catetan rapor, pangpangna 1.000 karakter. Guru ogé bisa nulis déskripsi capaian sorangan keur hiji mata pelajaran pikeun sakabéh murid lewat panel Déskripsi per mata pelajaran. Déskripsi nu dikosongkeun maké déskripsi otomatis numutkeun prédikat.',
            steps: [
              'Buka ménu Rapor, tuluy pilih semester jeung kelas.',
              'Keur catetan hiji murid, buka ménu aksi dina kartu murid tuluy pilih Catetan rapor.',
              'Keur déskripsi, buka panel Déskripsi per mata pelajaran, pilih mata pelajaran, tulis déskripsi unggal murid, tuluy klik Simpen déskripsi.',
            ],
            href: '/report-cards',
            tip: 'Anggo kotak Nu acan kaeusi wungkul pikeun gancang manggihan murid nu kénéh kosong.',
            warning:
              'Sanggeus rapor final, kabéh catetan jeung déskripsi dikonci. Buka deui rapor kelas lamun kudu dirobah.',
          },
          {
            heading: 'Déskripsi otomatis tina tujuan pangajaran',
            body: 'Lamun murid geus boga capaian tujuan pangajaran (TP) dina hiji mata pelajaran, rapor nyusun déskripsina sorangan: hiji kalimah keur TP nu pang unggulna jeung hiji kalimah keur TP nu perlu bimbingan. Murid nu can boga data TP tetep maké kalimah numutkeun prédikat. Dina panél Déskripsi per mata pelajaran, unggal murid nembongkeun téks otomatis jeung asalna (tina capaian TP atawa tina prédikat) sarta daptar TP unggul jeung TP perlu bimbingan. Tulisan guru salawasna meunang tina téks otomatis. Tombol Paké téks otomatis ngahapus tulisan guru nepi ka rapor balik maké téks otomatis. Dina Pangaturan rapor, bagian Déskripsi tina tujuan pangajaran ngatur sabaraha TP nu disebut (1 nepi ka 5, biasana 2) jeung dua kalimahna. Tulis {tp} di tempat daptar TP baris muncul, pangbadagna 300 karakter; kosongkeun pikeun maké kalimah biasa.',
            steps: [
              'Buka Pangaturan rapor, terus bagian Déskripsi tina tujuan pangajaran.',
              'Pilih sabaraha TP nu disebut, jeung robah kalimahna lamun perlu. Conto hasilna langsung muncul.',
              'Simpen, terus buka panél Déskripsi per mata pelajaran dina ménu Rapor pikeun nempo hasilna dina unggal murid.',
            ],
            href: '/report-cards/settings',
            tip: 'Lamun sakabéh TP murid geus kahontal, kalimah perlu bimbingan teu ditulis. Paké tombol Paké templat biasa pikeun mulangkeun kalimah awal.',
            warning:
              'Lamun skor atawa TP robah sanggeus guru nyunting hiji déskripsi, aya tanda yén téks otomatis robah saprak disunting. Rapor tetep maké tulisan guru, jadi pariksa terus pilih Paké téks otomatis lamun perlu. Waktu finalisasi, jumlah déskripsi nu meureun geus teu cocog ditémbongkeun salaku peringatan jeung teu nahan finalisasi.',
          },
          {
            heading: 'Rapor déskriptif keur Fase A',
            body: 'Tingkat tangtu, upamana kelas 1 jeung 2 (Fase A), bisa maké rapor déskriptif. Dina mode ieu rapor ngan ngandung déskripsi capaian jeung catetan kamekaran, tanpa angka, prédikat, KKM, jeung pangkat, boh di pratinjau boh di PDF. Angka tetep disimpen ku sakola tapi teu ditémbongkeun, jeung portal kolot teu ngamuat. Samemeh finalisasi, unggal murid kudu boga déskripsi keur tiap mata pelajaran; kartu murid nembongkeun kurang sabaraha déskripsi.',
            steps: [
              'Buka Pangaturan sakola, tuluy bagian Tingkat kelas.',
              'Robah tingkat nu dimaksud tuluy pilih Mode rapor: Déskriptif.',
              'Eusian déskripsi unggal mata pelajaran, tuluy finalisasi kelas saperti biasa.',
            ],
            href: '/school-settings',
            warning:
              'Ngarobah mode teu ngarobah rapor nu geus final. Rapor nu difinalisasi sanggeusna maké mode nu berlaku harita.',
          },
          {
            heading: 'Tanggapan kolot',
            body: 'Sanggeus rapor final, kolot atawa wali bisa nulis tanggapan lewat portal salila waktu méré tanggapan kénéh muka (biasana 30 poé ti saprak finalisasi). Lamun tanggapan ditulis dina rapor kertas, petugas bisa nyalinna: buka ménu aksi dina kartu murid, pilih Tanggapan kolot, pilih wali, tuluy Salin tina rapor kertas. Tanggapan nu ditulis ku wali sorangan teu bisa diganti ku petugas. Tanda Kana vérsi rapor saméméhna muncul lamun rapor difinalisasi deui sanggeus tanggapan ditulis.',
            href: '/report-cards',
          },
          {
            heading: 'Bagian tambahan dina PDF rapor',
            body: 'Dina Pangaturan rapor aya tilu pilihan anyar. Témbongkeun bagian kokurikuler dina PDF nyitak bagian kokurikuler, Témbongkeun kotak tanggapan kolot dina PDF nyitak kotak tanggapan (kosong lamun acan aya, sangkan bisa ditulis leungeun), jeung Sabaraha lila kolot bisa méré tanggapan nangtukeun wates poé ti saprak finalisasi (kosongkeun lamun taya wates). Dua pilihan citak biasana pareum sangkan PDF sakola lila teu robah; ngahurungkeunana mantuan minuhan komponén minimal rapor.',
            href: '/report-cards/settings',
          },
          {
            heading: 'Saha nu tiasa naon',
            body: 'Ningali daptar, pratinjau, sareng ngaunduh rapor sakelas tiasa dilakukeun ku wali kelas kelas éta, Kurikulum, Operator, Kepala sekolah, sareng Admin sekolah. Ngeusian catetan sareng finalisasi kelas tiasa dilakukeun ku wali kelas kelas éta, Kurikulum, Operator, sareng Admin sekolah. Muka deui rapor final sareng ngarobih Pengaturan rapor ngan tiasa dilakukeun ku Kurikulum, Operator, sareng Admin sekolah. Rapor merlukeun modul Nilai dan rapor aktip di sakola anjeun.',
          },
        ],
        faq: [
          {
            q: 'Kuring ngarobih KKM atanapi bobot, tapi nilai dina rapor final teu robih. Naha aya nu lepat?',
            a: 'Henteu. Rapor final sengaja teu robih ku pangaturan nilai, supados rapor nu tos dibagikeun salawasna sami. Nilai dina rekap kelas final ogé nuturkeun rapor sarta ditandaan Saluyu jeung rapor nu kaluar. Upami leres-leres kedah dikoréksi, buka deui rapor kelasna, saruakeun aturan semester éta dina Pengaturan penilaian, tuluy finalisasi deui.',
          },
          {
            q: 'Kumaha ngarobih rapor nu tos final?',
            a: 'Bantun Kurikulum, Operator, atanapi Admin sekolah muka kaca Rapor, pilih kelas éta, tuluy klik Buka kembali. Saatos rapor jadi draf, bénerkeun nilai atanapi catetan, tuluy finalisasi deui.',
          },
          {
            q: 'Naha kelas kuring teu muncul dina daptar rapor?',
            a: 'Wali kelas ngan ningali kelas nu dicekelna. Pastikeun semesterna bener. Upami tetep teu aya, bantun admin sakola mariksa anjeun tos ditetepkeun jadi wali kelas atanapi can.',
          },
          {
            q: 'Aya mata pelajaran nu kosong dina rapor. Kedah kumaha?',
            a: 'Mata pelajaran muncul upami gurunya tos nyieun panilaian di kelas éta. Bantun guru éta nyieun panilaian sareng ngeusian nilai dina menu Penilaian, tuluy muat deui kaca Rapor.',
          },
          {
            q: 'Peringkat teu muncul dina rapor. Naha?',
            a: 'Peringkat ngan muncul upami Tampilkan peringkat dihurungkeun dina Pengaturan rapor. Bantun pangurus rapor ngahurungkeunana, tuluy unduh deui rapor nu masih draf.',
          },
        ],
      },
    },
  },
  {
    slug: 'extracurricular',
    icon: 'trophy',
    tone: 'emerald',
    group: 'academic',
    module: 'extracurricular',
    text: {
      id: {
        title: 'Ekstrakurikuler: anggota, kehadiran, dan predikat',
        summary:
          'Panduan pembina mengelola kegiatan di luar jam pelajaran: membuat ekskul, mencatat kehadiran tiap pertemuan, dan memberi predikat semester.',
        forWho: 'Guru pembina ekskul, Kurikulum, Operator, dan Admin sekolah.',
        sections: [
          {
            heading: 'Membuat ekstrakurikuler baru',
            body: 'Tambahkan kegiatan dengan nama (tidak boleh sama dengan ekskul lain di sekolah), kategori, deskripsi, pembina (guru sekolah atau pembina dari luar), hari dan jam, serta lokasi. Jam mulai harus lebih awal dari jam selesai.',
            steps: [
              'Buka menu Ekstrakurikuler dan klik tombol tambah.',
              'Isi nama, kategori, pembina, jadwal, dan lokasi.',
              'Simpan. Ekskul baru langsung muncul di daftar.',
            ],
            href: '/extracurriculars',
            tip: 'Isi pembina dengan guru sekolah supaya guru itu langsung bisa mengelola anggota dan kehadiran tanpa bantuan admin.',
          },
          {
            heading: 'Mengatur kategori',
            body: 'Tombol Kelola kategori dipakai untuk mengubah nama, ikon, dan warna kategori. Saat pertama dibuka, sekolah mendapat kategori bawaan: olahraga, seni, keagamaan, sains, pramuka, dan lainnya. Kategori yang dinonaktifkan tidak bisa dipilih untuk ekskul baru. Kategori yang masih dipakai ekskul tidak bisa dihapus.',
            href: '/extracurriculars',
          },
          {
            heading: 'Menambah anggota dan mencatat kehadiran pertemuan',
            body: 'Buka satu ekstrakurikuler. Di sana ada tab Anggota, Pertemuan dan absensi, Penilaian, dan Laporan. Keanggotaan dicatat per tahun ajaran, bawaannya tahun ajaran yang sedang aktif.',
            steps: [
              'Di tab Anggota, klik Tambah anggota, pilih kelas, centang siswa, lalu klik Tambahkan.',
              'Di tab Pertemuan dan absensi, klik Pertemuan baru, lalu isi tanggal dan topik.',
              'Klik Buka absensi pada pertemuan itu.',
              'Tandai Hadir, Izin, Sakit, atau Alpa untuk tiap anggota.',
              'Klik Simpan absensi.',
            ],
            href: '/extracurriculars',
            tip: 'Catat kehadiran di hari yang sama dengan pertemuan. Tanggal pertemuan tidak boleh belum tiba, dan satu ekskul hanya punya satu pertemuan per tanggal.',
          },
          {
            heading: 'Memberi predikat semester dan melihat laporan kehadiran',
            body: 'Di tab Penilaian, pilih semester lalu beri tiap anggota predikat A sampai D beserta keterangan. Predikat ini tampil di rapor siswa. Tab Laporan merangkum kehadiran tiap anggota pada rentang tanggal yang dipilih (bawaannya 90 hari terakhir, paling lama 366 hari) dan bisa diunduh sebagai Excel. Siswa yang sudah lulus tetap tampil pada tahun lampau, tetapi hanya untuk dilihat dan tidak dapat diubah.',
            steps: [
              'Buka tab Penilaian dan pilih semester.',
              'Pilih predikat A, B, C, atau D untuk tiap anggota dan isi keterangannya.',
              'Simpan penilaian.',
              'Buka tab Laporan bila ingin melihat rekap kehadiran, lalu atur rentang tanggalnya.',
            ],
            href: '/extracurriculars',
            tip: 'Beri predikat sebelum wali kelas memfinalisasi rapor, supaya predikat ekskul ikut tercetak.',
          },
          {
            heading: 'Menghentikan atau menghapus ekstrakurikuler',
            body: 'Untuk menghentikan sebuah kegiatan, ubah statusnya menjadi Nonaktif. Cara ini aman karena semua catatan lama tetap ada. Ekskul hanya bisa dihapus bila belum pernah punya pertemuan atau penilaian.',
            warning:
              'Ekskul yang sudah punya pertemuan atau penilaian tidak bisa dihapus, jadi nonaktifkan saja. Bila ekskul yang masih kosong dihapus, anggotanya ikut terhapus.',
          },
          {
            heading: 'Siapa yang bisa melakukan apa',
            body: 'Semua guru bisa melihat ekstrakurikuler, tetapi pengisian dibatasi. Menambah, mengubah, dan menghapus ekskul serta kategori bisa dilakukan Kurikulum, Operator, dan Admin sekolah. Menambah atau mengeluarkan anggota, membuat pertemuan, mengisi absensi, dan memberi predikat bisa dilakukan oleh guru pembina ekskul itu, Kurikulum, Operator, dan Admin sekolah. Mengeluarkan anggota tidak menghapus catatan kehadirannya yang lama.',
          },
        ],
        faq: [
          {
            q: 'Kenapa saya tidak bisa menambah anggota ke ekskul?',
            a: 'Hanya guru yang menjadi pembina ekskul itu, Kurikulum, Operator, dan Admin sekolah yang bisa mengelola anggota. Minta admin sekolah memastikan nama Anda terisi sebagai pembina di ekskul tersebut.',
          },
          {
            q: 'Kenapa ekskul tidak bisa dihapus?',
            a: 'Ekskul yang sudah punya pertemuan atau penilaian tidak bisa dihapus agar riwayatnya tidak hilang. Buka ekskul itu, ubah statusnya menjadi Nonaktif, dan kegiatan tidak akan muncul lagi untuk pendaftaran baru.',
          },
          {
            q: 'Pertemuan tidak bisa dibuat. Apa sebabnya?',
            a: 'Periksa tanggalnya. Tanggal tidak boleh belum tiba, dan ekskul itu belum boleh punya pertemuan lain di tanggal yang sama. Bila pertemuan di tanggal itu sudah ada, buka saja dan edit absensinya.',
          },
          {
            q: 'Predikat ekskul siswa tidak muncul di rapor. Kenapa?',
            a: 'Pastikan predikat sudah disimpan di tab Penilaian untuk semester yang sama dengan rapor. Bila rapor sudah final, minta pengelola rapor membuka kembali kelasnya dan finalisasi lagi.',
          },
        ],
      },
      en: {
        title: 'Extracurriculars: members, attendance, and predicates',
        summary:
          'A guide for coaches to manage activities outside class hours: creating an extracurricular, recording attendance at each session, and giving semester predicates.',
        forWho: 'Coach teachers, Curriculum staff, Operators, and School admins.',
        sections: [
          {
            heading: 'Creating a new extracurricular',
            body: 'Add an activity with a name (it cannot match another extracurricular in the school), category, description, coach (a school teacher or an outside coach), day and time, and location. The start time must be earlier than the end time.',
            steps: [
              'Open the Extracurricular menu and click the add button.',
              'Fill in the name, category, coach, schedule, and location.',
              'Save. The new extracurricular appears in the list right away.',
            ],
            href: '/extracurriculars',
            tip: 'Set a school teacher as the coach so that teacher can manage members and attendance without help from an admin.',
          },
          {
            heading: 'Managing categories',
            body: 'The Manage categories button is used to change the name, icon, and color of categories. When first opened, the school gets default categories: sports, arts, religion, science, scouts, and other. A deactivated category cannot be chosen for a new extracurricular. A category still used by an extracurricular cannot be deleted.',
            href: '/extracurriculars',
          },
          {
            heading: 'Adding members and recording session attendance',
            body: 'Open one extracurricular. It has the Members, Sessions and attendance, Assessment, and Report tabs. Membership is recorded per academic year, by default the active academic year.',
            steps: [
              'On the Members tab, click Add members, pick a class, tick the students, then click Add.',
              'On the Sessions and attendance tab, click New session, then fill in the date and topic.',
              'Click Open attendance on that session.',
              'Mark Present, Excused, Sick, or Absent for each member.',
              'Click Save attendance.',
            ],
            href: '/extracurriculars',
            tip: 'Record attendance on the same day as the session. A session date cannot be in the future, and an extracurricular has only one session per date.',
          },
          {
            heading: 'Giving semester predicates and viewing the attendance report',
            body: 'On the Assessment tab, pick a semester and give each member a predicate from A to D with a note. This predicate appears on the student report card. The Report tab summarizes each member attendance over the chosen date range (default the last 90 days, at most 366 days) and can be downloaded as Excel. Students who have graduated still appear for past years, but only for viewing and cannot be changed.',
            steps: [
              'Open the Assessment tab and pick the semester.',
              'Choose predicate A, B, C, or D for each member and fill in the note.',
              'Save the assessment.',
              'Open the Report tab to see the attendance recap, then set the date range.',
            ],
            href: '/extracurriculars',
            tip: 'Give the predicates before the homeroom teacher finalizes the report cards, so the extracurricular predicate is printed on them.',
          },
          {
            heading: 'Stopping or deleting an extracurricular',
            body: 'To stop an activity, set its status to Inactive. This is safe because all earlier records stay. An extracurricular can only be deleted if it never had a session or an assessment.',
            warning:
              'An extracurricular that already has sessions or assessments cannot be deleted, so deactivate it instead. If an empty extracurricular is deleted, its members are removed along with it.',
          },
          {
            heading: 'Who can do what',
            body: 'All teachers can view extracurriculars, but filling in is restricted. Adding, editing, and deleting extracurriculars and categories can be done by Curriculum staff, Operators, and School admins. Adding or removing members, creating sessions, recording attendance, and giving predicates can be done by the coach teacher of that extracurricular, Curriculum staff, Operators, and School admins. Removing a member does not delete their earlier attendance records.',
          },
        ],
        faq: [
          {
            q: 'Why can I not add members to an extracurricular?',
            a: 'Only the coach teacher of that extracurricular, Curriculum staff, Operators, and School admins can manage members. Ask the school admin to make sure your name is set as the coach for it.',
          },
          {
            q: 'Why can an extracurricular not be deleted?',
            a: 'An extracurricular that already has sessions or assessments cannot be deleted so that its history is not lost. Open it and set the status to Inactive, and it will no longer appear for new sign-ups.',
          },
          {
            q: 'A session cannot be created. What is the cause?',
            a: 'Check the date. It cannot be in the future, and that extracurricular cannot already have another session on the same date. If a session on that date already exists, simply open it and edit the attendance.',
          },
          {
            q: 'A student extracurricular predicate does not show on the report card. Why?',
            a: 'Make sure the predicate is saved on the Assessment tab for the same semester as the report card. If the report card is already final, ask the report card manager to reopen the class and finalize again.',
          },
        ],
      },
      su: {
        title: 'Ékstrakurikuler: anggota, kahadiran, sareng predikat',
        summary:
          'Pituduh pembina ngatur kagiatan di luar jam pelajaran: nyieun ékskul, nyerat kahadiran unggal patepungan, sareng méré predikat semester.',
        forWho: 'Guru pembina ékskul, Kurikulum, Operator, sareng Admin sekolah.',
        sections: [
          {
            heading: 'Nyieun ékstrakurikuler anyar',
            body: 'Tambihan kagiatan kalayan nami (teu meunang sami sareng ékskul sanés di sakola), kategori, déskripsi, pembina (guru sakola atanapi pembina ti luar), dinten sareng jam, ogé lokasi. Jam mimiti kedah langkung awal tibatan jam rengse.',
            steps: [
              'Buka menu Ekstrakurikuler tuluy klik tombol tambih.',
              'Eusian nami, kategori, pembina, jadwal, sareng lokasi.',
              'Simpen. Ékskul anyar langsung muncul dina daptar.',
            ],
            href: '/extracurriculars',
            tip: 'Eusian pembina ku guru sakola supados guru éta langsung tiasa ngurus anggota sareng kahadiran tanpa dibantuan admin.',
          },
          {
            heading: 'Ngatur kategori',
            body: 'Tombol Kelola kategori dipaké pikeun ngarobih nami, ikon, sareng warna kategori. Nalika mimiti dibuka, sakola meunang kategori bawaan: olahraga, seni, kaagamaan, sains, pramuka, sareng sanésna. Kategori nu dinonaktipkeun teu tiasa dipilih kanggo ékskul anyar. Kategori nu masih dipaké ékskul teu tiasa dipupus.',
            href: '/extracurriculars',
          },
          {
            heading: 'Nambihan anggota sareng nyerat kahadiran patepungan',
            body: 'Buka hiji ékstrakurikuler. Di dinya aya tab Anggota, Pertemuan dan absensi, Penilaian, sareng Laporan. Kaanggotaan dicatet per taun ajaran, bawaanna taun ajaran nu keur aktip.',
            steps: [
              'Dina tab Anggota, klik Tambah anggota, pilih kelas, centang siswa, tuluy klik Tambahkan.',
              'Dina tab Pertemuan dan absensi, klik Pertemuan baru, tuluy eusian tanggal sareng topik.',
              'Klik Buka absensi dina patepungan éta.',
              'Tandaan Hadir, Izin, Sakit, atanapi Alpa kanggo unggal anggota.',
              'Klik Simpan absensi.',
            ],
            href: '/extracurriculars',
            tip: 'Catet kahadiran dina dinten nu sami sareng patepungan. Tanggal patepungan teu tiasa acan datang, sareng hiji ékskul ngan gaduh hiji patepungan per tanggal.',
          },
          {
            heading: 'Méré predikat semester sareng ningali laporan kahadiran',
            body: 'Dina tab Penilaian, pilih semester tuluy pasihan unggal anggota predikat A dugi ka D sareng katerangan. Predikat ieu muncul dina rapor siswa. Tab Laporan ngarangkum kahadiran unggal anggota dina rentang tanggal nu dipilih (bawaan 90 poé panungtung, paling lami 366 poé) tur tiasa diunduh jadi Excel. Siswa anu parantos lulus tetep muncul pikeun taun kapengker, tapi ngan pikeun ditingali sareng teu tiasa dirobah.',
            steps: [
              'Buka tab Penilaian tuluy pilih semester.',
              'Pilih predikat A, B, C, atanapi D kanggo unggal anggota tuluy eusian katerangan.',
              'Simpen panilaian.',
              'Buka tab Laporan upami hoyong ningali rekap kahadiran, tuluy setél rentang tanggalna.',
            ],
            href: '/extracurriculars',
            tip: 'Pasihan predikat sateuacan wali kelas finalisasi rapor, supados predikat ékskul milu kacitak.',
          },
          {
            heading: 'Ngeureunkeun atanapi mupus ékstrakurikuler',
            body: 'Kanggo ngeureunkeun kagiatan, robih statusna jadi Nonaktif. Cara ieu aman sabab sadaya catetan baheula tetep aya. Ékskul ngan tiasa dipupus upami can kantos gaduh patepungan atanapi panilaian.',
            warning:
              'Ékskul nu tos gaduh patepungan atanapi panilaian teu tiasa dipupus, janten nonaktifkeun wae. Upami ékskul nu masih kosong dipupus, anggotana milu kahapus.',
          },
          {
            heading: 'Saha nu tiasa naon',
            body: 'Sadaya guru tiasa ningali ékstrakurikuler, tapi ngeusianana dibatesan. Nambihan, ngarobih, sareng mupus ékskul ogé kategori tiasa dilakukeun ku Kurikulum, Operator, sareng Admin sekolah. Nambihan atanapi ngaluarkeun anggota, nyieun patepungan, ngeusian absénsi, sareng méré predikat tiasa dilakukeun ku guru pembina ékskul éta, Kurikulum, Operator, sareng Admin sekolah. Ngaluarkeun anggota teu mupus catetan kahadiran baheulana.',
          },
        ],
        faq: [
          {
            q: 'Naha kuring teu tiasa nambihan anggota ka ékskul?',
            a: 'Ngan guru pembina ékskul éta, Kurikulum, Operator, sareng Admin sekolah nu tiasa ngurus anggota. Bantun admin sakola mastikeun nami anjeun diisi salaku pembina di ékskul éta.',
          },
          {
            q: 'Naha ékskul teu tiasa dipupus?',
            a: 'Ékskul nu tos gaduh patepungan atanapi panilaian teu tiasa dipupus supados riwayatna teu leungit. Buka ékskul éta, robih statusna jadi Nonaktif, tuluy kagiatan moal muncul deui kanggo pendaptaran anyar.',
          },
          {
            q: 'Patepungan teu tiasa dijieun. Naon sababna?',
            a: 'Pariksa tanggalna. Tanggal teu tiasa acan datang, sareng ékskul éta teu tiasa gaduh patepungan sanés dina tanggal nu sami. Upami patepungan dina tanggal éta tos aya, buka wae tuluy robih absénsina.',
          },
          {
            q: 'Predikat ékskul siswa teu muncul dina rapor. Naha?',
            a: 'Pastikeun predikat tos disimpen dina tab Penilaian kanggo semester nu sami sareng rapor. Upami rapor tos final, bantun pangurus rapor muka deui kelasna tuluy finalisasi deui.',
          },
        ],
      },
    },
  },
  {
    slug: 'tahfidz',
    icon: 'book',
    tone: 'teal',
    group: 'academic',
    module: 'tahfidz',
    text: {
      id: {
        title: 'Tahfidz dan ibadah: halaqah, setoran, dan target',
        summary:
          'Panduan musyrif mencatat setoran hafalan per halaqah, memantau progres Al-Quran, dan mengisi lembar ibadah harian siswa.',
        forWho: 'Guru musyrif atau pembina halaqah, Operator, dan Admin sekolah.',
        sections: [
          {
            heading: 'Membuat halaqah dan menambah anggota',
            body: 'Halaqah dibuat per tahun ajaran dengan nama (tidak boleh sama dalam satu tahun ajaran), musyrif yang dipilih dari guru aktif, dan catatan jadwal. Satu siswa hanya bisa masuk satu halaqah dalam satu tahun ajaran.',
            steps: [
              'Buka menu Tahfidz dan klik Halaqah baru.',
              'Isi nama, musyrif, dan jadwal, lalu simpan.',
              'Buka halaqah itu, masuk ke tab Anggota, dan klik Tambah anggota.',
              'Pilih kelas, centang siswa yang akan masuk, lalu tambahkan.',
            ],
            href: '/tahfidz',
            tip: 'Siswa yang sudah ada di halaqah lain pada tahun ajaran yang sama akan dilewati dan disebutkan di hasil penambahan, jadi Anda tidak perlu menyaringnya satu per satu.',
          },
          {
            heading: 'Mencatat setoran hafalan',
            body: 'Di tab Setoran, pilih siswa, tanggal, jenis, rentang surah dan ayat, kualitas, dan catatan. Ziyadah adalah hafalan baru, sedangkan Murajaah adalah mengulang hafalan lama. Kualitas bacaan dipilih antara Lancar, Cukup, atau Ulang. Setoran yang bernilai Ulang tidak dihitung sebagai hafalan baru.',
            steps: [
              'Buka halaqah dan tab Setoran.',
              'Pilih siswa, tanggal, dan jenis setoran.',
              'Isi surah dan ayat awal sampai akhir.',
              'Pilih kualitas bacaan, dan tambahkan catatan bila perlu.',
              'Klik Simpan setoran.',
            ],
            href: '/tahfidz',
            tip: 'Catat setoran pada hari yang sama. Tanggal setoran tidak boleh belum tiba.',
          },
          {
            heading: 'Memantau progres hafalan',
            body: 'Tab Progres dan halaman tiap siswa menampilkan persen Al-Quran yang sudah dihafal, jumlah juz yang tuntas, peta 30 juz, ayat lanjutan berikutnya, berapa hari berturut-turut siswa setor, dan target semester. Siswa yang belum setor 7 hari atau lebih ditandai tertinggal agar mudah ditemui.',
            href: '/tahfidz',
          },
          {
            heading: 'Mengisi ibadah harian',
            body: 'Lembar harian mencatat butir ibadah yang aktif (misalnya Salat Dhuha) dengan sekali ketuk, per halaqah atau per kelas. Tab Laporan merangkum persen terlaksana per butir dan per siswa pada rentang tanggal yang dipilih (bawaannya 30 hari), dan bisa diunduh sebagai Excel.',
            href: '/tahfidz/ibadah',
            tip: 'Lembar per halaqah bisa diisi musyrif. Lembar per kelas hanya untuk Operator dan Admin sekolah.',
          },
          {
            heading: 'Mengatur butir ibadah dan target semester',
            body: 'Halaman pengaturan dipakai untuk menambah butir ibadah (harian atau mingguan), mengatur urutan, serta mengaktifkan atau menonaktifkan sebuah butir. Di sini juga Anda mengisi target hafalan semester per siswa, yaitu jumlah ayat ziyadah dan murajaah.',
            steps: [
              'Buka pengaturan Tahfidz.',
              'Klik Tambah butir untuk menambah butir ibadah baru, atau nonaktifkan butir yang tidak dipakai lagi.',
              'Isi target ayat ziyadah dan murajaah untuk tiap siswa, lalu simpan.',
            ],
            href: '/tahfidz/settings',
          },
          {
            heading: 'Siapa yang bisa melakukan apa',
            body: 'Semua guru bisa melihat data tahfidz, tetapi pengisian dibatasi. Membuat, mengubah, dan menghapus halaqah serta butir ibadah hanya bisa dilakukan Operator dan Admin sekolah. Mengisi setoran, anggota, target, dan lembar ibadah halaqah bisa dilakukan musyrif halaqah itu, Operator, dan Admin sekolah. Mengeluarkan anggota tidak menghapus riwayat setorannya.',
            warning:
              'Halaqah yang sudah punya setoran tidak bisa dihapus, nonaktifkan saja. Butir ibadah yang sudah punya catatan juga tidak bisa dihapus.',
          },
        ],
        faq: [
          {
            q: 'Kenapa siswa tidak bisa saya masukkan ke halaqah?',
            a: 'Kemungkinan siswa itu sudah menjadi anggota halaqah lain pada tahun ajaran yang sama. Satu siswa hanya boleh di satu halaqah. Keluarkan dulu dari halaqah lama, lalu tambahkan lagi.',
          },
          {
            q: 'Kenapa setoran saya tidak menambah persen hafalan?',
            a: 'Setoran dengan kualitas Ulang atau berjenis Murajaah tidak dihitung sebagai hafalan baru. Hanya setoran Ziyadah yang lancar atau cukup yang menambah progres.',
          },
          {
            q: 'Bagaimana memperbaiki setoran yang salah isi?',
            a: 'Buka tab Setoran di halaqah itu, temukan setoran yang salah pada tanggalnya, lalu hapus dan catat ulang dengan data yang benar.',
          },
          {
            q: 'Halaqah tidak bisa dihapus. Apa yang harus dilakukan?',
            a: 'Halaqah yang sudah punya setoran tidak bisa dihapus agar riwayat hafalan siswa aman. Nonaktifkan halaqah itu, lalu buat halaqah baru bila perlu.',
          },
        ],
      },
      en: {
        title: 'Tahfidz and worship: halaqah, submissions, and targets',
        summary:
          'A guide for mentors to record memorization submissions per halaqah, track Quran progress, and fill in students daily worship sheets.',
        forWho: 'Mentor teachers of a halaqah, Operators, and School admins.',
        sections: [
          {
            heading: 'Creating a halaqah and adding members',
            body: 'A halaqah is created per academic year with a name (it cannot repeat within one academic year), a mentor chosen from active teachers, and a schedule note. A student can only join one halaqah in an academic year.',
            steps: [
              'Open the Tahfidz menu and click New halaqah.',
              'Fill in the name, mentor, and schedule, then save.',
              'Open that halaqah, go to the Members tab, and click Add members.',
              'Pick a class, tick the students to join, then add them.',
            ],
            href: '/tahfidz',
            tip: 'Students already in another halaqah that academic year are skipped and listed in the result, so you do not need to filter them one by one.',
          },
          {
            heading: 'Recording a memorization submission',
            body: 'On the Submissions tab, pick the student, date, type, surah and verse range, quality, and a note. Ziyadah is new memorization, while Murajaah is revising old memorization. Recitation quality is Fluent, Fair, or Repeat. A submission marked Repeat is not counted as new memorization.',
            steps: [
              'Open the halaqah and the Submissions tab.',
              'Pick the student, date, and submission type.',
              'Fill in the start and end surah and verse.',
              'Pick the recitation quality, and add a note if needed.',
              'Click Save submission.',
            ],
            href: '/tahfidz',
            tip: 'Record submissions on the same day. A submission date cannot be in the future.',
          },
          {
            heading: 'Tracking memorization progress',
            body: 'The Progress tab and each student page show the percent of the Quran memorized, completed juz, a 30-juz map, the next verse to continue from, how many days in a row the student has submitted, and the semester target. Students who have not submitted for 7 days or more are flagged as behind so they are easy to follow up.',
            href: '/tahfidz',
          },
          {
            heading: 'Filling in daily worship',
            body: 'The daily sheet records active worship items (for example Duha prayer) with one tap, per halaqah or per class. The Report tab summarizes the percent completed per item and per student over the chosen date range (default 30 days), and can be downloaded as Excel.',
            href: '/tahfidz/ibadah',
            tip: 'A mentor can fill in the per-halaqah sheet. The per-class sheet is for Operators and School admins only.',
          },
          {
            heading: 'Setting worship items and semester targets',
            body: 'The settings page is used to add worship items (daily or weekly), set their order, and activate or deactivate an item. Here you also enter each student semester memorization target, which is a number of ziyadah and murajaah verses.',
            steps: [
              'Open Tahfidz settings.',
              'Add a new worship item, or deactivate one that is no longer used.',
              'Enter the ziyadah and murajaah verse targets for each student, then save.',
            ],
            href: '/tahfidz/settings',
          },
          {
            heading: 'Who can do what',
            body: 'All teachers can view tahfidz data, but filling in is restricted. Creating, editing, and deleting halaqah and worship items can only be done by Operators and School admins. Recording submissions, members, targets, and the halaqah worship sheet can be done by that halaqah mentor, Operators, and School admins. Removing a member does not delete their submission history.',
            warning:
              'A halaqah that already has submissions cannot be deleted, so deactivate it instead. A worship item that already has records cannot be deleted either.',
          },
        ],
        faq: [
          {
            q: 'Why can I not add a student to the halaqah?',
            a: 'The student is probably already in another halaqah in the same academic year. A student can only be in one halaqah. Remove them from the old halaqah first, then add them again.',
          },
          {
            q: 'Why did my submission not increase the memorization percent?',
            a: 'A submission with Repeat quality, or of the Murajaah type, is not counted as new memorization. Only Ziyadah submissions that are fluent or fair add to the progress.',
          },
          {
            q: 'How do I correct a submission that was entered wrongly?',
            a: 'Open the Submissions tab of that halaqah, find the wrong submission by its date, then delete it and record it again with the right data.',
          },
          {
            q: 'A halaqah cannot be deleted. What should I do?',
            a: 'A halaqah that already has submissions cannot be deleted so student memorization history stays safe. Deactivate that halaqah, then create a new one if needed.',
          },
        ],
      },
      su: {
        title: 'Tahfidz sareng ibadah: halaqah, setoran, sareng target',
        summary:
          'Pituduh musyrif nyerat setoran hapalan per halaqah, mantuan progres Al-Quran, sareng ngeusian lembar ibadah poéan siswa.',
        forWho: 'Guru musyrif atanapi pembina halaqah, Operator, sareng Admin sekolah.',
        sections: [
          {
            heading: 'Nyieun halaqah sareng nambihan anggota',
            body: 'Halaqah dijieun per taun ajaran kalayan nami (teu meunang sami dina hiji taun ajaran), musyrif nu dipilih tina guru aktip, sareng catetan jadwal. Hiji siswa ngan tiasa lebet kana hiji halaqah dina hiji taun ajaran.',
            steps: [
              'Buka menu Tahfidz tuluy klik Halaqah baru.',
              'Eusian nami, musyrif, sareng jadwal, tuluy simpen.',
              'Buka halaqah éta, lebet kana tab Anggota, tuluy klik Tambah anggota.',
              'Pilih kelas, centang siswa nu bade lebet, tuluy tambihan.',
            ],
            href: '/tahfidz',
            tip: 'Siswa nu tos aya di halaqah sanés dina taun ajaran nu sami dilangkungan tur disebatkeun dina hasil panambihan, janten anjeun teu kedah nyaring hiji-hiji.',
          },
          {
            heading: 'Nyerat setoran hapalan',
            body: 'Dina tab Setoran, pilih siswa, tanggal, jinis, rentang surah sareng ayat, kualitas, sareng catetan. Ziyadah téh hapalan anyar, sedengkeun Murajaah téh ngulang hapalan lami. Kualitas bacaan Lancar, Cukup, atanapi Ulang. Setoran nu nilaina Ulang henteu diitung salaku hapalan anyar.',
            steps: [
              'Buka halaqah tuluy tab Setoran.',
              'Pilih siswa, tanggal, sareng jinis setoran.',
              'Eusian surah sareng ayat awal dugi ka tungtung.',
              'Pilih kualitas bacaan, tambihan catetan upami peryogi.',
              'Klik Simpan setoran.',
            ],
            href: '/tahfidz',
            tip: 'Catet setoran dina dinten nu sami. Tanggal setoran teu tiasa acan datang.',
          },
          {
            heading: 'Mantuan progres hapalan',
            body: 'Tab Progres sareng kaca unggal siswa nunjukkeun persén Al-Quran nu tos dihapal, jumlah juz tuntas, peta 30 juz, ayat lanjutan saterusna, sabaraha poé beruntun siswa nyetor, sareng target semester. Siswa nu can nyetor 7 poé atanapi langkung ditandaan tinggaleun supados gampang disampeurkeun.',
            href: '/tahfidz',
          },
          {
            heading: 'Ngeusian ibadah poéan',
            body: 'Lembar poéan nyerat butir ibadah nu aktip (contona Salat Dhuha) ku sakali ketuk, per halaqah atanapi per kelas. Tab Laporan ngarangkum persén nu dilaksanakeun per butir sareng per siswa dina rentang tanggal nu dipilih (bawaan 30 poé), tur tiasa diunduh jadi Excel.',
            href: '/tahfidz/ibadah',
            tip: 'Lembar per halaqah tiasa diisi ku musyrif. Lembar per kelas ngan kanggo Operator sareng Admin sekolah.',
          },
          {
            heading: 'Nyetél butir ibadah sareng target semester',
            body: 'Kaca pengaturan dipaké pikeun nambihan butir ibadah (poéan atanapi saminggon), nyetél urutan, sareng ngaktipkeun atanapi nonaktipkeun hiji butir. Di dieu ogé anjeun ngeusian target hapalan semester unggal siswa, nyaéta jumlah ayat ziyadah sareng murajaah.',
            steps: [
              'Buka pengaturan Tahfidz.',
              'Tambihan butir ibadah anyar, atanapi nonaktipkeun butir nu teu dipaké deui.',
              'Eusian target ayat ziyadah sareng murajaah kanggo unggal siswa, tuluy simpen.',
            ],
            href: '/tahfidz/settings',
          },
          {
            heading: 'Saha nu tiasa naon',
            body: 'Sadaya guru tiasa ningali data tahfidz, tapi ngeusianana dibatesan. Nyieun, ngarobih, sareng mupus halaqah ogé butir ibadah ngan tiasa dilakukeun ku Operator sareng Admin sekolah. Ngeusian setoran, anggota, target, sareng lembar ibadah halaqah tiasa dilakukeun ku musyrif halaqah éta, Operator, sareng Admin sekolah. Ngaluarkeun anggota teu mupus riwayat setoranana.',
            warning:
              'Halaqah nu tos gaduh setoran teu tiasa dipupus, nonaktifkeun wae. Butir ibadah nu tos gaduh catetan ogé teu tiasa dipupus.',
          },
        ],
        faq: [
          {
            q: 'Naha siswa teu tiasa dilebetkeun kana halaqah?',
            a: 'Meureun siswa éta tos jadi anggota halaqah sanés dina taun ajaran nu sami. Hiji siswa ngan tiasa di hiji halaqah. Kaluarkeun heula tina halaqah lami, tuluy tambihan deui.',
          },
          {
            q: 'Naha setoran kuring teu nambahan persén hapalan?',
            a: 'Setoran kalayan kualitas Ulang atanapi jinis Murajaah henteu diitung salaku hapalan anyar. Ngan setoran Ziyadah nu lancar atanapi cukup nu nambahan progres.',
          },
          {
            q: 'Kumaha ngabenerkeun setoran nu salah eusi?',
            a: 'Buka tab Setoran dina halaqah éta, panggihan setoran nu salah dumasar tanggalna, tuluy pupus, terus catet deui kalayan data nu bener.',
          },
          {
            q: 'Halaqah teu tiasa dipupus. Kedah kumaha?',
            a: 'Halaqah nu tos gaduh setoran teu tiasa dipupus supados riwayat hapalan siswa aman. Nonaktipkeun halaqah éta, tuluy jieun halaqah anyar upami peryogi.',
          },
        ],
      },
    },
  },
  {
    slug: 'internship',
    icon: 'briefcase',
    tone: 'amber',
    group: 'academic',
    module: 'internship',
    text: {
      id: {
        title: 'PKL: mitra, penempatan siswa, dan penilaian',
        summary:
          'Panduan pembimbing dan pengelola PKL menempatkan siswa di mitra industri, memantau jurnal dan kunjungan, lalu menilai hasilnya.',
        forWho: 'Guru pembimbing PKL, Operator, dan Admin sekolah.',
        sections: [
          {
            heading: 'Menambah mitra industri',
            body: 'Mitra adalah perusahaan atau instansi tempat siswa PKL. Isi nama (tidak boleh sama dengan mitra lain), bidang usaha, narahubung, telepon, surel, alamat, dan status aktif. Hanya mitra yang aktif yang bisa dipilih saat menempatkan siswa.',
            steps: ['Buka Mitra industri.', 'Klik Tambah mitra dan isi datanya.', 'Simpan.'],
            href: '/pkl/partners',
            tip: 'Nonaktifkan mitra yang sudah tidak menerima siswa supaya tidak terpilih tanpa sengaja.',
          },
          {
            heading: 'Menyiapkan periode, aspek penilaian, dan ambang predikat',
            body: 'Di Periode dan aspek, buat periode PKL (nama, tahun ajaran, tanggal mulai dan selesai) serta aspek penilaian berbobot. Tombol Pasang aspek bawaan membuat Disiplin (20), Kompetensi teknis (30), Etika kerja (20), Kerja sama (15), dan Laporan (15) bila belum ada aspek. Ambang predikat A, B, dan C diatur di halaman yang sama. Bawaannya 90, 80, dan 70, dan nilai di bawah C berpredikat D.',
            steps: [
              'Buka Periode dan aspek.',
              'Tambah periode PKL. Tanggal mulai tidak boleh setelah tanggal selesai.',
              'Klik Pasang aspek bawaan atau tambah aspek sendiri (bobot 1 sampai 100).',
              'Atur ambang predikat dengan bilangan bulat 1 sampai 100 (A lebih besar dari B, B lebih besar dari C), lalu simpan.',
            ],
            href: '/pkl/settings',
            warning:
              'Mengubah ambang predikat langsung berlaku pada semua nilai PKL, termasuk nilai periode lama. Periode yang sudah punya penempatan tidak bisa dihapus.',
          },
          {
            heading: 'Menempatkan siswa di mitra',
            body: 'Halaman PKL menampilkan penempatan dalam bentuk papan atau tabel, dengan pilihan penyaring periode, mitra, status, dan pencarian. Banyak siswa bisa ditempatkan sekaligus.',
            steps: [
              'Buka PKL dan klik Tempatkan siswa.',
              'Pilih periode dan mitra, lalu isi guru pembimbing dan pembimbing industri bila ada.',
              'Centang siswa (bisa disaring per kelas), lalu klik Tempatkan.',
              'Saat PKL dimulai, klik Mulai PKL. Setelah selesai, klik Selesaikan. Bila tidak jadi, klik Batalkan.',
            ],
            href: '/pkl',
            tip: 'Siswa yang sudah punya penempatan di periode yang sama akan dilewati, jadi aman bila Anda tidak sengaja mencentang siswa yang sama.',
          },
          {
            heading: 'Mengisi jurnal, kunjungan, dan penilaian',
            body: 'Di detail sebuah penempatan ada tab Jurnal (satu catatan per hari; menyimpan di tanggal yang sama menimpa catatan sebelumnya), Kunjungan monitoring guru, Penilaian, dan Tautan industri. Nilai tiap aspek berupa bilangan bulat 0 sampai 100 yang diisi sekolah dan industri. Nilai aspek adalah rata-rata para penilai, dan nilai akhir adalah rata-rata berbobot. Rekap periode menampilkan nilai akhir, predikat, hari jurnal, hari hadir, dan kunjungan, dan bisa diunduh. Sertifikat PKL diunduh sebagai PDF dari detail penempatan.',
            href: '/pkl/report',
            tip: 'Tanggal jurnal tidak boleh di masa depan dan harus berada dalam periode, dengan kelonggaran 7 hari.',
          },
          {
            heading: 'Memberi akses pengisian kepada pembimbing industri',
            body: 'Pembimbing di perusahaan tidak perlu punya akun. Ia mengisi jurnal dan nilai lewat tautan khusus yang Anda buat dari tab Tautan industri pada detail penempatan.',
            steps: [
              'Buka detail penempatan siswa, lalu masuk ke tab Tautan industri.',
              'Buat tautan baru.',
              'Salin tautan itu dan kirimkan sendiri kepada pembimbing industri.',
            ],
            href: '/pkl',
            warning:
              'Tautan hanya ditampilkan satu kali, jadi salin sebelum menutup. Membuat tautan baru mematikan tautan yang lama, dan membatalkan penempatan mencabut tautannya. Tautan menjadi hanya bisa dibaca 14 hari setelah periode berakhir.',
          },
          {
            heading: 'Siapa yang bisa melakukan apa dan alur status penempatan',
            body: 'PKL memerlukan modul Administrasi aktif di sekolah Anda. Semua guru bisa melihat data PKL, tetapi pengisian dibatasi. Mitra, periode, aspek, ambang predikat, dan penempatan dikelola Operator dan Admin sekolah. Jurnal, kunjungan, nilai sekolah, dan tautan industri juga boleh diisi guru pembimbing penempatan itu. Status penempatan berjalan dari Direncanakan ke Berjalan atau Dibatalkan, dan dari Berjalan ke Selesai atau Dibatalkan. Penempatan yang Selesai atau Dibatalkan tidak bisa diubah lagi. Penempatan hanya bisa dihapus bila masih Direncanakan dan belum ada jurnal. Selain itu, batalkan saja.',
          },
        ],
        faq: [
          {
            q: 'Kenapa mitra tidak muncul saat saya menempatkan siswa?',
            a: 'Hanya mitra yang berstatus aktif yang bisa dipilih. Minta pengelola PKL membuka Mitra industri dan mengaktifkan mitra itu.',
          },
          {
            q: 'Siswa tidak bisa ditempatkan. Apa sebabnya?',
            a: 'Kemungkinan siswa itu sudah punya penempatan di periode yang sama, jadi dilewati. Periksa di halaman PKL, filter berdasarkan periode, dan ubah penempatan lama bila ingin memindahkannya.',
          },
          {
            q: 'Penempatan tidak bisa dihapus. Bagaimana?',
            a: 'Penempatan hanya bisa dihapus selama masih Direncanakan dan belum ada jurnal. Bila sudah berjalan, klik Batalkan untuk menghentikannya.',
          },
          {
            q: 'Pembimbing industri kehilangan tautan pengisian. Apa yang harus dilakukan?',
            a: 'Tautan hanya tampil sekali dan tidak bisa dilihat ulang. Buat tautan baru dari tab Tautan industri, lalu kirimkan. Tautan lama otomatis berhenti berlaku.',
          },
        ],
      },
      en: {
        title: 'Internship: partners, student placements, and assessment',
        summary:
          'A guide for supervisors and internship managers to place students at industry partners, follow journals and visits, then score the results.',
        forWho: 'Supervising teachers, Operators, and School admins.',
        sections: [
          {
            heading: 'Adding an industry partner',
            body: 'A partner is a company or institution where students do their internship. Fill in the name (it cannot match another partner), field, contact person, phone, email, address, and active status. Only active partners can be chosen when placing students.',
            steps: ['Open Industry partners.', 'Click Add partner and fill in the details.', 'Save.'],
            href: '/pkl/partners',
            tip: 'Deactivate partners that no longer take students so they are not picked by accident.',
          },
          {
            heading: 'Setting up periods, assessment aspects, and predicate thresholds',
            body: 'In Periods and aspects, create internship periods (name, academic year, start and end date) and weighted assessment aspects. The Install default aspects button creates Discipline (20), Technical competence (30), Work ethic (20), Teamwork (15), and Report (15) when there are no aspects yet. The A, B, and C predicate thresholds are set on the same page. The defaults are 90, 80, and 70, and scores below C get predicate D.',
            steps: [
              'Open Periods and aspects.',
              'Add an internship period. The start date cannot be after the end date.',
              'Click Install default aspects or add your own (weight 1 to 100).',
              'Set the predicate thresholds as whole numbers from 1 to 100 (A higher than B, B higher than C), then save.',
            ],
            href: '/pkl/settings',
            warning:
              'Changing the predicate thresholds immediately applies to all internship scores, including those from older periods. A period that already has placements cannot be deleted.',
          },
          {
            heading: 'Placing students at a partner',
            body: 'The Internship page shows placements as a board or a table, with filters for period, partner, status, and search. Many students can be placed at once.',
            steps: [
              'Open Internship and click Place students.',
              'Pick the period and partner, then fill in the supervising teacher and the industry supervisor if any.',
              'Tick the students (can be filtered by class), then click Place.',
              'When the internship begins, click Start. When it is done, click Complete. If it will not happen, click Cancel.',
            ],
            href: '/pkl',
            tip: 'Students who already have a placement in the same period are skipped, so it is safe if you tick the same student by mistake.',
          },
          {
            heading: 'Filling in journals, visits, and assessment',
            body: 'A placement detail has the Journal tab (one entry per day; saving on the same date overwrites the earlier entry), teacher Monitoring visits, Assessment, and Industry link. Each aspect score is a whole number from 0 to 100 given by the school and the industry. An aspect score is the average of the assessors, and the final score is a weighted average. The period recap shows the final score, predicate, journal days, present days, and visits, and can be downloaded. The internship certificate is downloaded as a PDF from the placement detail.',
            href: '/pkl/report',
            tip: 'A journal date cannot be in the future and must fall within the period, with 7 days of leeway.',
          },
          {
            heading: 'Giving the industry supervisor a way to fill in',
            body: 'The supervisor at the company does not need an account. They fill in journals and scores through a special link that you create from the Industry link tab in the placement detail.',
            steps: [
              'Open the student placement detail, then go to the Industry link tab.',
              'Create a new link.',
              'Copy the link and send it to the industry supervisor yourself.',
            ],
            href: '/pkl',
            warning:
              'The link is shown only once, so copy it before closing. Creating a new link disables the old one, and cancelling the placement revokes the link. The link becomes read-only 14 days after the period ends.',
          },
          {
            heading: 'Who can do what, and the placement status flow',
            body: 'Internship needs the Administration module to be active at your school. All teachers can view internship data, but filling in is restricted. Partners, periods, aspects, predicate thresholds, and placements are managed by Operators and School admins. Journals, visits, school scores, and the industry link can also be filled in by the supervising teacher of that placement. A placement status goes from Planned to Active or Cancelled, and from Active to Completed or Cancelled. A Completed or Cancelled placement cannot be changed again. A placement can only be deleted while it is still Planned and has no journals. Otherwise, just cancel it.',
          },
        ],
        faq: [
          {
            q: 'Why does a partner not appear when I place students?',
            a: 'Only partners with an active status can be chosen. Ask the internship manager to open Industry partners and activate that partner.',
          },
          {
            q: 'A student cannot be placed. What is the cause?',
            a: 'The student probably already has a placement in the same period, so they are skipped. Check the Internship page, filter by period, and change the old placement if you want to move them.',
          },
          {
            q: 'A placement cannot be deleted. What now?',
            a: 'A placement can only be deleted while it is Planned and has no journals. If it is already running, click Cancel to stop it.',
          },
          {
            q: 'The industry supervisor lost the fill-in link. What should I do?',
            a: 'The link is shown only once and cannot be viewed again. Create a new link from the Industry link tab and send it. The old link stops working automatically.',
          },
        ],
      },
      su: {
        title: 'PKL: mitra, panempatan siswa, sareng panilaian',
        summary:
          'Pituduh pembimbing sareng pangurus PKL nempatkeun siswa di mitra industri, mantuan jurnal sareng kunjungan, tuluy nilai hasilna.',
        forWho: 'Guru pembimbing PKL, Operator, sareng Admin sekolah.',
        sections: [
          {
            heading: 'Nambihan mitra industri',
            body: 'Mitra téh pausahaan atanapi instansi tempat siswa PKL. Eusian nami (teu meunang sami sareng mitra sanés), widang usaha, nu bisa dihubungi, telepon, surélék, alamat, sareng status aktip. Ngan mitra nu aktip nu tiasa dipilih nalika nempatkeun siswa.',
            steps: ['Buka Mitra industri.', 'Klik Tambah mitra tuluy eusian datana.', 'Simpen.'],
            href: '/pkl/partners',
            tip: 'Nonaktipkeun mitra nu tos teu nampi siswa supados teu kapilih ku teu kahaja.',
          },
          {
            heading: 'Nyiapkeun periode, aspék panilaian, sareng wates predikat',
            body: 'Dina Periode dan aspek, jieun periode PKL (nami, taun ajaran, tanggal mimiti sareng rengse) ogé aspék panilaian nu aya bobotna. Tombol Pasang aspek bawaan nyieun Disiplin (20), Kompetensi teknis (30), Etika kerja (20), Kerja sama (15), sareng Laporan (15) upami can aya aspék. Wates predikat A, B, sareng C disetél dina kaca nu sami. Bawaanna 90, 80, sareng 70, tuluy nilai di handap C nampi predikat D.',
            steps: [
              'Buka Periode dan aspek.',
              'Tambihan periode PKL. Tanggal mimiti teu tiasa saatos tanggal rengse.',
              'Klik Pasang aspek bawaan atanapi tambihan aspék sorangan (bobot 1 dugi ka 100).',
              'Setél wates predikat ku wilangan bulet 1 dugi ka 100 (A langkung ageung tibatan B, B langkung ageung tibatan C), tuluy simpen.',
            ],
            href: '/pkl/settings',
            warning:
              'Ngarobih wates predikat langsung dipaké kana sadaya nilai PKL, kaasup nilai periode lami. Periode nu tos gaduh panempatan teu tiasa dipupus.',
          },
          {
            heading: 'Nempatkeun siswa di mitra',
            body: 'Kaca PKL nunjukkeun panempatan dina wujud papan atanapi tabel, kalayan saringan periode, mitra, status, sareng pamilarian. Seueur siswa tiasa ditempatkeun sakaligus.',
            steps: [
              'Buka PKL tuluy klik Tempatkan siswa.',
              'Pilih periode sareng mitra, tuluy eusian guru pembimbing sareng pembimbing industri upami aya.',
              'Centang siswa (tiasa disaring per kelas), tuluy klik Tempatkan.',
              'Nalika PKL dimimitian, klik Mulai PKL. Saatos rengse, klik Selesaikan. Upami teu jadi, klik Batalkan.',
            ],
            href: '/pkl',
            tip: 'Siswa nu tos gaduh panempatan dina periode nu sami dilangkungan, janten aman upami anjeun teu kahaja nyentang siswa nu sami.',
          },
          {
            heading: 'Ngeusian jurnal, kunjungan, sareng panilaian',
            body: 'Dina detil panempatan aya tab Jurnal (hiji catetan per poé; nyimpen dina tanggal nu sami nimpa catetan saméméhna), Kunjungan monitoring guru, Penilaian, sareng Tautan industri. Nilai unggal aspék téh wilangan bulet 0 dugi ka 100 nu diisi ku sakola sareng industri. Nilai aspék téh rata-rata para panilai, nilai akhir téh rata-rata kalayan bobot. Rekap periode nunjukkeun nilai akhir, predikat, poé jurnal, poé hadir, sareng kunjungan, tur tiasa diunduh. Sertifikat PKL diunduh jadi PDF tina detil panempatan.',
            href: '/pkl/report',
            tip: 'Tanggal jurnal teu tiasa acan datang tur kedah aya dina periode, kalayan kaleuleuwihan 7 poé.',
          },
          {
            heading: 'Méré jalan ngeusian ka pembimbing industri',
            body: 'Pembimbing di pausahaan teu kedah gaduh akun. Anjeunna ngeusian jurnal sareng nilai ngalangkungan tautan husus nu anjeun jieun tina tab Tautan industri dina detil panempatan.',
            steps: [
              'Buka detil panempatan siswa, tuluy lebet kana tab Tautan industri.',
              'Jieun tautan anyar.',
              'Salin tautanna tuluy kirimkeun sorangan ka pembimbing industri.',
            ],
            href: '/pkl',
            warning:
              'Tautan ngan dipidangkeun sakali, janten salin heula sateuacan ditutup. Nyieun tautan anyar mareuman tautan nu lami, sareng ngabatalkeun panempatan nyabut tautanana. Tautan jadi baca-wungkul 14 poé saatos periode rengse.',
          },
          {
            heading: 'Saha nu tiasa naon, sareng alur status panempatan',
            body: 'PKL merlukeun modul Administrasi aktip di sakola anjeun. Sadaya guru tiasa ningali data PKL, tapi ngeusianana dibatesan. Mitra, periode, aspék, wates predikat, sareng panempatan diurus ku Operator sareng Admin sekolah. Jurnal, kunjungan, nilai sakola, sareng tautan industri ogé tiasa diisi ku guru pembimbing panempatan éta. Status panempatan ti Direncanakan ka Berjalan atanapi Dibatalkan, sareng ti Berjalan ka Selesai atanapi Dibatalkan. Panempatan nu Selesai atanapi Dibatalkan teu tiasa dirobih deui. Panempatan ngan tiasa dipupus upami masih Direncanakan sareng can aya jurnal. Upami henteu, batalkeun wae.',
          },
        ],
        faq: [
          {
            q: 'Naha mitra teu muncul nalika nempatkeun siswa?',
            a: 'Ngan mitra nu statusna aktip nu tiasa dipilih. Bantun pangurus PKL muka Mitra industri tuluy ngaktipkeun mitra éta.',
          },
          {
            q: 'Siswa teu tiasa ditempatkeun. Naon sababna?',
            a: 'Meureun siswa éta tos gaduh panempatan dina periode nu sami, janten dilangkungan. Pariksa dina kaca PKL, saring dumasar periode, tuluy robih panempatan lami upami hoyong mindahkeun.',
          },
          {
            q: 'Panempatan teu tiasa dipupus. Kumaha?',
            a: 'Panempatan ngan tiasa dipupus salami masih Direncanakan sareng can aya jurnal. Upami tos jalan, klik Batalkan pikeun ngeureunkeunana.',
          },
          {
            q: 'Pembimbing industri leungit tautan ngeusian. Kedah kumaha?',
            a: 'Tautan ngan muncul sakali tur teu tiasa ditingali deui. Jieun tautan anyar tina tab Tautan industri, tuluy kirimkeun. Tautan lami otomatis eureun dipaké.',
          },
        ],
      },
    },
  },
  {
    slug: 'promotion',
    icon: 'school',
    tone: 'violet',
    group: 'academic',
    text: {
      id: {
        title: 'Kenaikan kelas dan tahun ajaran baru',
        summary:
          'Cara menyiapkan tahun ajaran berikutnya, memutuskan siswa naik, tinggal, atau ditetapkan lulus, lalu menerapkannya tanpa mengubah data tahun lalu.',
        forWho: 'Kurikulum, Operator, dan Admin sekolah yang mengelola pergantian tahun ajaran.',
        sections: [
          {
            heading: 'Sebelum mulai',
            body: 'Pastikan tahun ajaran berikutnya sudah dibuat dan dimulai setelah tahun yang sedang berjalan. Pastikan juga daftar tingkat sekolah sudah diisi (misalnya 7, 8, dan 9), karena urutan tingkat itulah yang menentukan siapa naik ke mana dan tingkat mana yang terakhir. Untuk SMK, lama studi (3 atau 4 tahun) dan tingkat akhir tiap jurusan bisa diatur di menu Kelas pada tombol Jurusan. Data tahun lama tidak pernah diubah oleh proses ini, jadi kelas, penugasan guru, nilai, dan rapor tahun lalu tetap utuh.',
            href: '/academic-years',
            tip: 'Setiap langkah punya tombol Pratinjau yang hanya menampilkan perkiraan tanpa menyimpan apa pun. Pakai dulu sebelum menjalankan.',
          },
          {
            heading: 'Langkah 1: memilih tahun sumber dan tahun tujuan',
            body: 'Tahun sumber adalah tahun yang siswanya akan dinaikkan, bawaannya tahun ajaran aktif. Tahun tujuan adalah tahun ajaran berikutnya. Hanya tahun yang dimulai setelah tahun sumber yang bisa dipilih. Bila belum ada, buat dulu di menu Tahun ajaran.',
            steps: [
              'Buka menu Kenaikan kelas.',
              'Pilih Tahun ajaran sumber.',
              'Pilih Tahun ajaran tujuan, lalu klik Berikutnya.',
            ],
            href: '/promotion',
          },
          {
            heading: 'Langkah 2: menyalin kelas, penugasan, dan kalender',
            body: 'Langkah ini menyiapkan tahun tujuan. Kelas 7A menjadi 8A di tahun tujuan, lengkap dengan wali kelas dan guru mata pelajarannya. Kelas tingkat pertama juga disalin apa adanya untuk siswa baru dan siswa yang tinggal kelas. Kelas tingkat terakhir tidak disalin karena kelulusan ditetapkan sekolah, kecuali bila sudah ada siswa yang diputuskan tinggal kelas di dalamnya: kelas itu ikut disalin agar siswa tersebut punya kelas tujuan. Kalender akademik hanya disalin bila Anda mencentang pilihannya; pilihan itu mati secara bawaan karena kalender tiap tahun berbeda, dan tanggalnya digeser satu tahun sehingga harus Anda periksa kembali sebelum dipakai. Struktur kurikulum (jam pelajaran dan versi kurikulum tiap tingkat) juga ikut disalin. Hasilnya menampilkan jumlah yang dibuat dan daftar hal yang perlu diperiksa, misalnya wali kelas yang sudah nonaktif. Tiap bagian butuh izin sendiri: kelas dan penugasan butuh izin mengelola kelas, kalender butuh izin mengelola tahun ajaran, struktur kurikulum butuh izin mengelola kurikulum, dan perangkat ajar butuh izin menyusun perangkat ajar. Bagian yang izinnya belum Anda punya tampil redup dengan tulisan Butuh izin dan tidak ikut disalin; minta admin sekolah menambahkan izinnya bila diperlukan. Langkah ini boleh dilewati bila kelas tahun tujuan sudah Anda buat sendiri.',
            steps: [
              'Centang apa saja yang ingin disalin.',
              'Klik Pratinjau untuk melihat jumlahnya dan peringatan.',
              'Klik Jalankan penyalinan, lalu konfirmasi.',
            ],
            tip: 'Aman dijalankan ulang. Kelas, penugasan, dan acara yang sudah ada dilewati, bukan digandakan.',
            warning:
              'Bila muncul pesan bahwa daftar tingkat masih kosong, isi dulu tingkat di Pengaturan sekolah, lalu ulangi.',
          },
          {
            heading: 'Langkah 3: memutuskan nasib tiap siswa',
            body: 'Semua siswa aktif di tahun sumber tampil per kelas. Bawaannya naik kelas. Untuk kelas tingkat terakhir tidak ada pilihan bawaan: kelulusan ditetapkan sekolah setelah ujian satuan pendidikan, jadi Anda wajib memilih Ditetapkan lulus atau Tinggal untuk setiap siswa, dan tombol Simpan serta Berikutnya baru terbuka setelah semuanya dipilih. Ubah per siswa menjadi Tinggal bila perlu, atau pakai tombol di atas kelas seperti Semua naik untuk mengubah satu kelas sekaligus. Tiap siswa punya Catatan keputusan yang boleh diisi: alasan, tindak lanjut (misalnya pendampingan), dan tanggal musyawarah, yang juga bisa diterapkan sekaligus ke satu kelas. Daftar kelas yang besar bisa dilipat dan dicari menurut nama atau NIS. Keputusan baru berlaku setelah Anda klik Simpan keputusan. Keputusan yang sudah diterapkan terkunci dan tidak bisa diubah lagi.',
            steps: [
              'Periksa tiap kelas, ubah siswa yang tinggal kelas.',
              'Klik Simpan keputusan.',
              'Pastikan tulisan Semua keputusan sudah tersimpan muncul.',
            ],
            tip: 'Siswa tingkat akhir yang belum dipilih ditandai kuning supaya mudah ditemukan.',
          },
          {
            heading: 'Langkah 4: menerapkan ke tahun tujuan',
            body: 'Siswa yang naik atau tinggal didaftarkan ke kelas di tahun tujuan, dan siswa yang ditetapkan lulus berubah statusnya menjadi lulus. Klik Pratinjau dulu untuk melihat berapa yang naik, tinggal, dan ditetapkan lulus. Siswa yang belum bisa ditempatkan tampil beserta alasannya, misalnya tahun tujuan belum punya kelas untuk tingkatnya. Perbaiki penyebabnya lalu terapkan lagi. Siswa yang sudah terdaftar di tahun tujuan dilewati. Siswa tingkat akhir yang belum punya keputusan dihitung terpisah dan tetap aktif; mereka tidak naik dan tidak diluluskan otomatis.',
            steps: [
              'Klik Pratinjau dan periksa angkanya.',
              'Klik Terapkan sekarang, lalu konfirmasi.',
              'Buka menu Siswa dan Kelas untuk memastikan hasilnya.',
            ],
            href: '/students',
            warning:
              'Hanya keputusan yang sudah disimpan yang diterapkan. Tahun ajaran aktif tidak berganti otomatis; ganti sendiri di menu Tahun ajaran setelah semuanya siap.',
          },
        ],
        faq: [
          {
            q: 'Apakah data dan rapor tahun lalu ikut berubah?',
            a: 'Tidak. Proses ini hanya menambah kelas dan pendaftaran di tahun tujuan serta mengubah status siswa yang ditetapkan lulus. Kelas, penugasan, nilai, dan rapor tahun sumber tidak disentuh.',
          },
          {
            q: 'Bolehkah saya menjalankan langkahnya lebih dari sekali?',
            a: 'Boleh. Yang sudah ada atau sudah diproses dilewati, sehingga tidak ada yang digandakan. Ini berguna bila Anda baru melengkapi kelas tahun tujuan dan ingin menerapkan ulang siswa yang tadi belum bisa ditempatkan.',
          },
          {
            q: 'Ada siswa yang belum bisa ditempatkan. Apa yang harus dilakukan?',
            a: 'Baca alasannya di daftar. Yang paling sering, tahun tujuan belum punya kelas untuk tingkat itu. Buat kelasnya (atau jalankan penyalinan di langkah 2), lalu terapkan lagi.',
          },
          {
            q: 'Salah memilih keputusan setelah diterapkan. Bagaimana?',
            a: 'Keputusan yang sudah diterapkan terkunci. Pindahkan kelas siswa itu lewat menu Siswa, dan hubungi admin bila statusnya perlu dikembalikan dari lulus.',
          },
          {
            q: 'Menu Kenaikan kelas tidak muncul di tempat saya.',
            a: 'Menu ini hanya untuk peran yang diberi akses kenaikan kelas, seperti Kurikulum dan Admin sekolah. Minta admin sekolah memeriksa peran Anda.',
          },
          {
            q: 'Mengapa muncul peringatan siswa lulus padahal rapor belum final?',
            a: 'Saat langkah Terapkan dibuka, sistem memeriksa lebih dulu, tanpa mengubah data, apakah rapor semester terakhir kelas yang siswanya akan lulus sudah final. Siswa berstatus lulus tidak muncul lagi di daftar rapor, jadi rapor yang belum final tidak bisa dituntaskan lagi. Bila ada yang belum final, peringatan merah tampil di atas tombol Terapkan beserta tautan ke halaman Rapor, dan Anda diminta konfirmasi sekali lagi. Sebaiknya finalkan rapornya dulu, lalu kembali ke sini.',
          },
          {
            q: 'Apa arti Tingkat kelas belum dikenal?',
            a: 'Tingkat kelas itu tidak ada di daftar tingkat sekolah, sehingga tingkat berikutnya tidak diketahui dan tidak ada keputusan bawaan. Untuk sementara hanya pilihan Tinggal yang tersedia. Perbaiki daftar tingkat di Pengaturan sekolah, lalu muat ulang halaman Kenaikan kelas.',
          },
        ],
      },
      en: {
        title: 'Promotion and the new school year',
        summary:
          'How to prepare the next school year, decide which students move up, repeat, or are confirmed as graduating, and apply it without changing last year data.',
        forWho: 'Curriculum staff, Operators, and School admins who manage the change of school year.',
        sections: [
          {
            heading: 'Before you start',
            body: 'Make sure the next academic year has been created and starts after the current one. Also make sure the school level list is filled in (for example 7, 8, and 9), because the order of the levels decides who moves where and which level is the last. For vocational schools (SMK), the length of study (3 or 4 years) and the final level of each program can be set in the Classes menu under the Programs button. This process never changes old-year data, so last year classes, teacher assignments, scores, and report cards stay intact.',
            href: '/academic-years',
            tip: 'Every step has a Preview button that only shows an estimate without saving anything. Use it before you run.',
          },
          {
            heading: 'Step 1: picking the source and target year',
            body: 'The source year is the one whose students will be moved up, by default the active academic year. The target year is the next academic year. Only years that start after the source year can be chosen. If there is none, create it first in the Academic years menu.',
            steps: [
              'Open the Promotion menu.',
              'Pick the Source academic year.',
              'Pick the Target academic year, then click Next.',
            ],
            href: '/promotion',
          },
          {
            heading: 'Step 2: copying classes, assignments, and calendar',
            body: 'This step prepares the target year. Class 7A becomes 8A in the target year, together with its homeroom teacher and subject teachers. First-level classes are also copied as they are for new students and students who repeat. Final-level classes are not copied because graduation is decided by the school, unless a student in them has already been decided to repeat the year: that class is then copied so the student has a class to go to. The academic calendar is only copied if you tick that option; it is off by default because calendars differ every year, and its dates are shifted by one year so you must check them again before use. The curriculum structure (lesson periods and the curriculum version of each level) is copied as well. The result shows the numbers created and a list of things to check, for example a homeroom teacher who is no longer active. Each part needs its own permission: classes and assignments need the permission to manage classes, the calendar needs the permission to manage academic years, the curriculum structure needs the permission to manage the curriculum, and teaching materials need the permission to write teaching materials. A part you lack permission for is shown dimmed with the text Needs permission and is not copied; ask a school admin to add the permission if needed. You can skip this step if you already created the target year classes yourself.',
            steps: [
              'Tick what you want to copy.',
              'Click Preview to see the numbers and warnings.',
              'Click Run the copy, then confirm.',
            ],
            tip: 'It is safe to run again. Classes, assignments, and events that already exist are skipped, not duplicated.',
            warning:
              'If a message says the level list is empty, fill in the levels in School settings first, then try again.',
          },
          {
            heading: 'Step 3: deciding for each student',
            body: 'All active students of the source year appear per class. The default is to move up. Final-level classes have no default: graduation is decided by the school after the school examination, so you must choose Confirmed graduating or Repeat for every student, and the Save and Next buttons only unlock once all of them are chosen. Change a student to Repeat when needed, or use the buttons above a class such as Everyone moves up to change a whole class at once. Each student has Decision notes you may fill in: a reason, a follow-up (for example coaching), and a meeting date, which can also be applied to a whole class at once. Large class lists can be folded and searched by name or student number. A new decision takes effect after you click Save decisions. Decisions that were applied are locked and cannot be changed anymore.',
            steps: [
              'Check each class and change the students who repeat.',
              'Click Save decisions.',
              'Make sure the text All decisions are saved appears.',
            ],
            tip: 'Final-level students who are not chosen yet are marked yellow so they are easy to find.',
          },
          {
            heading: 'Step 4: applying to the target year',
            body: 'Students who move up or repeat are enrolled in classes of the target year, and students confirmed as graduating get the graduated status. Click Preview first to see how many move up, repeat, and are confirmed as graduating. Students who could not be placed are listed with the reason, for example the target year has no class for their level yet. Fix the cause and apply again. Students already enrolled in the target year are skipped. Final-level students without a decision are counted separately and stay active; they do not move up and are not graduated automatically.',
            steps: [
              'Click Preview and check the numbers.',
              'Click Apply now, then confirm.',
              'Open the Students and Classes menus to check the result.',
            ],
            href: '/students',
            warning:
              'Only saved decisions are applied. The active school year does not switch automatically; switch it yourself in the Academic years menu when everything is ready.',
          },
        ],
        faq: [
          {
            q: 'Does last year data and the report cards change?',
            a: 'No. This process only adds classes and enrollments in the target year and changes the status of students confirmed as graduating. Classes, assignments, scores, and report cards of the source year are not touched.',
          },
          {
            q: 'May I run a step more than once?',
            a: 'Yes. What already exists or was already processed is skipped, so nothing is duplicated. This helps when you have just completed the target year classes and want to apply again for students who could not be placed earlier.',
          },
          {
            q: 'Some students could not be placed. What should I do?',
            a: 'Read the reason in the list. Most often the target year has no class for that level yet. Create the class (or run the copy in step 2), then apply again.',
          },
          {
            q: 'I chose the wrong decision after applying. What now?',
            a: 'Applied decisions are locked. Move that student class from the Students menu, and contact an admin if the status needs to be changed back from graduated.',
          },
          {
            q: 'The Promotion menu does not show up for me.',
            a: 'This menu is only for roles that were given promotion access, such as Curriculum staff and School admins. Ask a school admin to check your role.',
          },
          {
            q: 'Why does a warning say graduating students have report cards that are not final?',
            a: 'When the Apply step opens, the system first checks, without changing any data, whether the last-semester report cards of the classes whose students will graduate are final. Graduated students no longer appear in the report card list, so an unfinished report card can no longer be completed. If some are not final, a red warning appears above the Apply button with a link to the Report cards page, and you are asked to confirm once more. It is best to finalize the report cards first, then come back here.',
          },
          {
            q: 'What does Class grade not recognized mean?',
            a: 'The grade of that class is not in the school grade list, so the next grade is unknown and there is no default decision. For now only Retain is available. Fix the grade list in School settings, then reload the Promotion page.',
          },
        ],
      },
      su: {
        title: 'Naékna kelas jeung taun pangajaran anyar',
        summary:
          'Cara nyiapkeun taun pangajaran saterusna, mutuskeun siswa naék, tinggal, atawa ditetepkeun lulus, tuluy ngalarapkeunana tanpa ngarobah data taun kamari.',
        forWho: 'Kurikulum, Operator, jeung Admin sakola nu ngurus gantina taun pangajaran.',
        sections: [
          {
            heading: 'Saméméh mimiti',
            body: 'Pastikeun taun pangajaran saterusna geus dijieun jeung dimimitian sanggeus taun nu keur jalan. Pastikeun ogé daptar tingkat sakola geus dieusian (upamana 7, 8, jeung 9), sabab urutan tingkat éta nu nangtukeun saha naék ka mana jeung tingkat mana nu panungtungan. Data taun heubeul teu pernah dirobah ku prosés ieu, jadi kelas, tugas guru, nilai, jeung rapor taun kamari tetep utuh.',
            href: '/academic-years',
            tip: 'Unggal léngkah boga tombol Pratinjau nu ukur nembongkeun kira-kira tanpa nyimpen nanaon. Paké heula saméméh ngajalankeun.',
          },
          {
            heading: 'Léngkah 1: milih taun sumber jeung taun tujuan',
            body: 'Taun sumber nyaéta taun nu siswana rék dinaékkeun, dasarna taun pangajaran aktip. Taun tujuan nyaéta taun pangajaran saterusna. Ngan taun nu dimimitian sanggeus taun sumber nu bisa dipilih. Upami can aya, jieun heula dina ménu Taun pangajaran.',
            steps: [
              'Buka ménu Naékna kelas.',
              'Pilih Taun pangajaran sumber.',
              'Pilih Taun pangajaran tujuan, tuluy klik Saterusna.',
            ],
            href: '/promotion',
          },
          {
            heading: 'Léngkah 2: nyalin kelas, tugas, jeung kalénder',
            body: 'Léngkah ieu nyiapkeun taun tujuan. Kelas 7A jadi 8A di taun tujuan, lengkep jeung wali kelas jeung guru mata pelajaranna. Kelas tingkat kahiji ogé disalin sakumaha aya pikeun siswa anyar jeung siswa nu tinggal kelas. Kelas tingkat panungtungan teu disalin lantaran kalulusan ditetepkeun ku sakola, iwal lamun geus aya siswa nu diputuskeun tinggal kelas di jerona: kelas éta milu disalin supaya siswana boga kelas tujuan. Kalénder akadémik ngan disalin upami pilihanna dicentang; pilihan éta pareum sacara baku sabab kalénder unggal taun béda, jeung tanggalna digeser sataun kudu dipariksa deui samemeh dipaké. Struktur kurikulum (jam pelajaran jeung vérsi kurikulum unggal tingkat) ogé milu disalin. Hasilna nembongkeun jumlah nu dijieun jeung daptar hal nu kudu dipariksa, upamana wali kelas nu geus nonaktip. Unggal bagian peryogi idin sorangan: kelas jeung tugas peryogi idin ngatur kelas, kalénder peryogi idin ngatur taun pangajaran, struktur kurikulum peryogi idin ngatur kurikulum, jeung parabot ngajar peryogi idin nyusun parabot ngajar. Bagian nu idinna can aya katémbong rada hérang jeung aya tulisan Peryogi idin, tur teu disalin; pénta admin sakola nambahkeun idinna upami peryogi. Léngkah ieu meunang diliwatan upami kelas taun tujuan geus dijieun ku anjeun sorangan.',
            steps: [
              'Centang naon waé nu rék disalin.',
              'Klik Pratinjau pikeun ningali jumlahna jeung pépéling.',
              'Klik Jalankeun panyalinan, tuluy konfirmasi.',
            ],
            tip: 'Aman dijalankeun deui. Kelas, tugas, jeung acara nu geus aya diliwatan, teu digandakeun.',
            warning:
              'Upami aya pesen yén daptar tingkat masih kosong, eusian heula tingkat dina Setélan sakola, tuluy ulang deui.',
          },
          {
            heading: 'Léngkah 3: mutuskeun nasib unggal siswa',
            body: 'Sakabéh siswa aktip di taun sumber nembongan per kelas. Dasarna naék kelas. Pikeun kelas tingkat panungtungan euweuh pilihan dasar: kalulusan ditetepkeun ku sakola sanggeus ujian satuan atikan, jadi anjeun kudu milih Ditetepkeun lulus atawa Tinggal pikeun unggal siswa, jeung tombol Simpen sarta Saterusna kakara muka sanggeus sakabéhna dipilih. Robah per siswa jadi Tinggal upami perlu, atawa paké tombol di luhur kelas saperti Kabéh naék pikeun ngarobah hiji kelas sakaligus. Unggal siswa boga Catetan kaputusan nu meunang dieusian: alesan, tindak lanjut (upamana pamentaan), jeung tanggal musyawarah, nu bisa ogé dilarapkeun ka hiji kelas sakaligus. Daptar kelas nu badag bisa dilipet jeung dipilarian nurutkeun ngaran atawa NIS. Kaputusan anyar kalaku sanggeus anjeun klik Simpen kaputusan. Kaputusan nu geus dilarapkeun dikonci jeung teu bisa dirobah deui.',
            steps: [
              'Pariksa unggal kelas, robah siswa nu tinggal kelas.',
              'Klik Simpen kaputusan.',
              'Pastikeun tulisan Sakabéh kaputusan geus disimpen muncul.',
            ],
            tip: 'Siswa tingkat panungtungan nu can dipilih dibéré tanda konéng supaya gampang kapanggih.',
          },
          {
            heading: 'Léngkah 4: ngalarapkeun ka taun tujuan',
            body: 'Siswa nu naék atawa tinggal didaftarkeun ka kelas di taun tujuan, jeung siswa nu ditetepkeun lulus robah statusna jadi lulus. Klik Pratinjau heula pikeun ningali sabaraha nu naék, tinggal, jeung ditetepkeun lulus. Siswa nu can bisa ditempatkeun nembongan jeung alesanana, upamana taun tujuan can boga kelas pikeun tingkatna. Bérésan sababna tuluy larapkeun deui. Siswa nu geus kadaftar di taun tujuan diliwatan. Siswa tingkat panungtungan nu can boga kaputusan diitung sorangan jeung tetep aktip; maranéhna teu naék jeung teu diluluskeun otomatis.',
            steps: [
              'Klik Pratinjau jeung pariksa angkana.',
              'Klik Larapkeun ayeuna, tuluy konfirmasi.',
              'Buka ménu Siswa jeung Kelas pikeun mastikeun hasilna.',
            ],
            href: '/students',
            warning:
              'Ngan kaputusan nu geus disimpen nu dilarapkeun. Taun pangajaran aktip teu ganti otomatis; gantian sorangan dina ménu Taun pangajaran sanggeus sagalana siap.',
          },
        ],
        faq: [
          {
            q: 'Naha data jeung rapor taun kamari milu robah?',
            a: 'Henteu. Prosés ieu ngan nambahan kelas jeung pendaptaran di taun tujuan sarta ngarobah status siswa nu ditetepkeun lulus. Kelas, tugas, nilai, jeung rapor taun sumber teu disabit.',
          },
          {
            q: 'Naha kuring meunang ngajalankeun léngkahna leuwih ti sakali?',
            a: 'Meunang. Nu geus aya atawa geus diprosés diliwatan, jadi teu aya nu digandakeun. Ieu mangpaat upami anjeun karék ngalengkepan kelas taun tujuan jeung hayang ngalarapkeun deui siswa nu tadi can bisa ditempatkeun.',
          },
          {
            q: 'Aya siswa nu can bisa ditempatkeun. Kedah kumaha?',
            a: 'Baca alesanana dina daptar. Pangmindingna, taun tujuan can boga kelas pikeun tingkat éta. Jieun kelasna (atawa jalankeun panyalinan di léngkah 2), tuluy larapkeun deui.',
          },
          {
            q: 'Salah milih kaputusan sanggeus dilarapkeun. Kumaha?',
            a: 'Kaputusan nu geus dilarapkeun dikonci. Pindahkeun kelas siswa éta tina ménu Siswa, jeung hubungan admin upami statusna kudu dibalikkeun tina lulus.',
          },
          {
            q: 'Ménu Naékna kelas teu muncul di kuring.',
            a: 'Ménu ieu ngan pikeun peran nu dibéré aksés naékna kelas, saperti Kurikulum jeung Admin sakola. Tuhu admin sakola pikeun mariksa peran anjeun.',
          },
          {
            q: 'Naha aya paringatan siswa lulus padahal rapot acan final?',
            a: 'Nalika léngkah Terapkeun dibuka, sistem mariksa heula, tanpa ngarobah data, naha rapot semester pamungkas kelas nu siswana bakal lulus geus final. Siswa nu status lulus teu muncul deui dina daptar rapot, jadi rapot nu acan final teu bisa dibérés deui. Lamun aya nu acan final, paringatan beureum muncul di luhur tombol Terapkeun jeung tautan ka kaca Rapot, tuluy anjeun dipénta konfirmasi sakali deui. Sakuduna finalkeun heula rapotna, tuluy balik ka dieu.',
          },
          {
            q: 'Naon hartina Tingkat kelas can kanyahoan?',
            a: 'Tingkat kelas éta teu aya dina daptar tingkat sakola, jadi tingkat saterusna teu kanyahoan jeung euweuh kaputusan bawaan. Samentara ngan pilihan Tinggal nu aya. Bérés daptar tingkat di Pangaturan sakola, tuluy muat deui kaca Naékna kelas.',
          },
        ],
      },
    },
  },
  {
    slug: 'teaching-plan',
    icon: 'book',
    tone: 'sky',
    group: 'academic',
    text: {
      id: {
        title: 'Perangkat ajar: CP, TP, dan ATP',
        summary:
          'Cara guru dan kurikulum menyusun capaian pembelajaran (CP), tujuan pembelajaran (TP), dan alur tujuan pembelajaran (ATP) per mata pelajaran, lalu menerbitkannya.',
        forWho:
          'Guru yang menyusun perangkat ajar mata pelajaran yang diampunya, serta Kurikulum dan Admin sekolah yang mengelola semua mata pelajaran.',
        sections: [
          {
            heading: 'Gambaran singkat',
            body: 'Perangkat ajar terdiri dari tiga bagian. Capaian pembelajaran (CP) adalah sasaran per fase. Tujuan pembelajaran (TP) adalah langkah-langkah kecil di bawah CP. Alur tujuan pembelajaran (ATP) adalah urutan TP dalam satu tahun ajaran, lengkap dengan perkiraan minggu, jam pelajaran, dan semester. Seluruhnya opsional: sekolah yang belum memakainya tetap bisa menjalankan fitur lain.',
            tip: 'Guru hanya melihat dan mengubah mata pelajaran yang ia ampu. Kurikulum dan Admin sekolah dapat mengelola semua mata pelajaran.',
          },
          {
            heading: 'Menyusun CP dan TP',
            body: 'Pilih mata pelajaran, lalu buka bagian Capaian dan tujuan. CP dikelompokkan per fase (A sampai F). Di bawah tiap CP Anda menambahkan TP, mengubah urutannya dengan tombol naik dan turun, menonaktifkan, atau menghapusnya.',
            steps: [
              'Buka menu Perangkat ajar saya dan pilih mata pelajaran.',
              'Klik Tambah CP, pilih fase, lalu tulis capaian pembelajarannya.',
              'Di bawah CP itu, klik Tambah TP dan tulis tujuannya. Ulangi untuk TP berikutnya.',
              'Gunakan tombol naik dan turun untuk mengatur urutan TP.',
            ],
            href: '/teaching-plan',
          },
          {
            heading: 'Mengubah teks yang sudah dipakai',
            body: 'Selama CP atau TP belum dipakai ATP yang terbit, mengubah teksnya langsung menimpa teks lama. Bila sudah dipakai ATP yang terbit, teks lama tidak ditimpa: sistem membuat versi baru dan menandai yang lama sebagai versi lama. ATP yang sudah terbit tetap menunjuk teks lama, jadi arsipnya tidak berubah. Untuk memakai teks baru, buat versi baru ATP-nya.',
            warning:
              'TP yang masih dipakai sebuah ATP tidak bisa dihapus. Keluarkan dulu dari ATP-nya, atau nonaktifkan saja TP itu.',
          },
          {
            heading: 'Menyusun ATP',
            body: 'Buka bagian Alur tujuan, pilih tahun ajaran, lalu buat ATP baru dengan nama dan tingkat; fase terisi otomatis dari tingkat. ATP baru berstatus draf. Tambahkan TP dari CP mata pelajaran itu, isi perkiraan minggu, jam pelajaran, dan semester, lalu atur urutannya. Satu TP hanya boleh muncul sekali dalam satu ATP, dan satu ATP maksimal berisi 300 item.',
            steps: [
              'Pilih tahun ajaran, lalu klik ATP baru dan isi namanya.',
              'Klik Tambah TP, centang TP yang diperlukan, lalu klik tombol tambah.',
              'Isi minggu, JP, dan semester pada tiap baris, dan atur urutannya.',
              'Klik Simpan draf. Perubahan yang belum disimpan ditandai di bawah tabel.',
            ],
            href: '/teaching-plan',
          },
          {
            heading: 'Menerbitkan dan membuat versi baru',
            body: 'Bila ATP sudah siap, klik Terbitkan lalu konfirmasi. ATP yang terbit terkunci dan hanya bisa dilihat. Untuk merevisinya, klik Buat versi baru: isinya disalin menjadi draf versi berikutnya, sedangkan versi yang terbit tetap utuh. Draf yang belum terbit bisa dihapus.',
            tip: 'Saat pergantian tahun ajaran, pilih Salin perangkat ajar di langkah menyalin data pada menu Kenaikan kelas. ATP yang terbit disalin sebagai draf ke tahun baru untuk Anda periksa dan terbitkan lagi.',
            warning:
              'ATP yang sudah terbit tidak bisa diubah atau dihapus. Pastikan isinya benar sebelum menerbitkan.',
          },
          {
            heading: 'Mengubah TP yang sudah dipakai penilaian',
            body: 'Bila sebuah TP sudah dikaitkan ke penilaian, mengubah teksnya tidak menimpa teks lama. Sistem membuat versi baru TP itu dan menandai yang lama sebagai versi lama. Penilaian yang sudah ada tetap memakai teks lama beserta skornya, jadi ketercapaian yang sudah dihitung tidak berubah diam-diam. Bila ingin penilaian memakai teks baru, ganti TP pada penilaian tersebut di menu Penilaian.',
            steps: [
              'Ubah teks TP seperti biasa dan simpan. Bila TP sudah dipakai penilaian, muncul pemberitahuan bahwa versi baru dibuat.',
              'Buka menu Penilaian, pilih Ubah pada penilaian yang ingin memakai teks baru, lalu ganti TP-nya dengan versi yang aktif.',
            ],
            href: '/grades',
            warning:
              'TP yang sudah dikaitkan ke penilaian atau sudah punya keputusan ketercapaian dari guru tidak bisa dihapus. Nonaktifkan saja.',
          },
        ],
        faq: [
          {
            q: 'Apakah perangkat ajar wajib diisi?',
            a: 'Tidak. Perangkat ajar bersifat opsional. Sekolah yang belum memakainya tetap dapat menjalankan fitur lain seperti jadwal, nilai, dan rapor.',
          },
          {
            q: 'Mengapa saya tidak melihat mata pelajaran tertentu?',
            a: 'Guru hanya melihat mata pelajaran yang ia ampu. Bila mata pelajaran Anda tidak muncul, minta Kurikulum atau Admin sekolah mengatur penugasan mengajar Anda.',
          },
          {
            q: 'Saya mengubah teks TP, tetapi muncul versi baru. Apakah itu wajar?',
            a: 'Wajar. TP itu sudah dipakai ATP yang terbit, jadi teks lama dipertahankan sebagai arsip dan teks baru disimpan sebagai versi baru. Buat versi baru ATP bila ingin memakai teks yang baru.',
          },
          {
            q: 'Mengapa tombol Terbitkan tidak bisa diklik?',
            a: 'ATP harus berisi minimal satu TP dan tidak boleh punya perubahan yang belum disimpan. Simpan draf dulu, lalu coba lagi.',
          },
          {
            q: 'Siapa yang bisa melihat perangkat ajar?',
            a: 'Pengguna yang boleh melihat mata pelajaran dapat melihatnya. Hanya guru pengampu, Kurikulum, dan Admin sekolah yang dapat menyusun atau mengubahnya.',
          },
          {
            q: 'Apa arti lencana tujuan nonaktif pada alur?',
            a: 'Lencana itu menandakan ada item yang menunjuk tujuan pembelajaran versi lama, yaitu yang sudah diganti versi baru atau dinonaktifkan. Alur seperti itu tidak bisa diterbitkan. Buka alurnya, hapus item bertanda versi lama, tambahkan tujuan versi baru, lalu simpan draf. Saat tahun ajaran disalin, alur hasil salinan yang memuat tujuan nonaktif juga diberi peringatan.',
          },
          {
            q: 'Mengapa TP tidak bisa dihapus?',
            a: 'TP yang dipakai penilaian, ATP, atau keputusan ketercapaian guru tidak bisa dihapus agar riwayat nilai tetap utuh. Nonaktifkan TP itu supaya tidak muncul lagi untuk penilaian baru.',
          },
        ],
      },
      en: {
        title: 'Teaching materials: CP, TP, and ATP',
        summary:
          'How teachers and the curriculum team prepare learning outcomes (CP), learning objectives (TP), and learning objective flows (ATP) for each subject, and then publish them.',
        forWho:
          'Teachers who prepare the teaching materials of the subjects they teach, and the Curriculum team and School admins who manage all subjects.',
        sections: [
          {
            heading: 'Overview',
            body: 'Teaching materials have three parts. Learning outcomes (CP) are the goals for each phase. Learning objectives (TP) are the small steps under a CP. The learning objective flow (ATP) is the order of TP across a school year, with estimated weeks, lesson periods, and semester. All of it is optional: a school that does not use it can still run every other feature.',
            tip: 'Teachers only see and change the subjects they teach. The Curriculum team and School admins can manage all subjects.',
          },
          {
            heading: 'Preparing CP and TP',
            body: 'Pick a subject and open the Outcomes and objectives section. CP are grouped by phase (A to F). Under each CP you add TP, reorder them with the up and down buttons, deactivate them, or delete them.',
            steps: [
              'Open My teaching materials and pick a subject.',
              'Click Add CP, pick the phase, and write the learning outcome.',
              'Under that CP, click Add TP and write the objective. Repeat for the next TP.',
              'Use the up and down buttons to set the order of the TP.',
            ],
            href: '/teaching-plan',
          },
          {
            heading: 'Changing text that is already in use',
            body: 'As long as a CP or TP is not used by a published ATP, changing its text simply replaces the old text. Once a published ATP uses it, the old text is not overwritten: the system creates a new version and marks the old one as an old version. A published ATP keeps pointing to the old text, so its record does not change. To use the new text, create a new version of the ATP.',
            warning:
              'A TP that an ATP still uses cannot be deleted. Remove it from that ATP first, or simply deactivate the TP.',
          },
          {
            heading: 'Preparing an ATP',
            body: 'Open the Objective flows section, pick the school year, and create a new ATP with a name and level; the phase is filled in automatically from the level. A new ATP is a draft. Add TP from the CP of that subject, fill in the estimated weeks, lesson periods, and semester, and set the order. A TP can appear only once in an ATP, and one ATP can hold at most 300 items.',
            steps: [
              'Pick the school year, click New ATP, and enter its name.',
              'Click Add TP, tick the TP you need, and click the add button.',
              'Fill in weeks, periods, and semester on each row, and set the order.',
              'Click Save draft. Unsaved changes are flagged under the table.',
            ],
            href: '/teaching-plan',
          },
          {
            heading: 'Publishing and creating a new version',
            body: 'When the ATP is ready, click Publish and confirm. A published ATP is locked and read-only. To revise it, click Create new version: its contents are copied into a draft of the next version while the published version stays intact. A draft that has not been published can be deleted.',
            tip: 'At the change of school year, tick Copy teaching materials in the copy step of the Promotion menu. Published ATP are copied to the new year as drafts for you to review and publish again.',
            warning:
              'A published ATP cannot be changed or deleted. Make sure its contents are right before publishing.',
          },
          {
            heading: 'Changing a TP that assessments already use',
            body: 'When a TP is already linked to an assessment, changing its text does not overwrite the old text. The system creates a new version of the TP and marks the old one as an old version. Existing assessments keep the old text together with their scores, so achievement that was already calculated does not change silently. To make an assessment use the new text, replace the TP on that assessment in the Grades menu.',
            steps: [
              'Change the TP text as usual and save. If assessments already use the TP, a notice says that a new version was created.',
              'Open the Grades menu, choose Edit on the assessment that should use the new text, and replace its TP with the active version.',
            ],
            href: '/grades',
            warning:
              'A TP that is linked to an assessment or already has a teacher achievement decision cannot be deleted. Deactivate it instead.',
          },
        ],
        faq: [
          {
            q: 'Do I have to fill in the teaching materials?',
            a: 'No. Teaching materials are optional. A school that does not use them can still run other features such as the schedule, grades, and report cards.',
          },
          {
            q: 'Why do I not see a certain subject?',
            a: 'Teachers only see the subjects they teach. If your subject does not appear, ask the Curriculum team or a School admin to set up your teaching assignments.',
          },
          {
            q: 'I changed the text of a TP but a new version appeared. Is that normal?',
            a: 'Yes. The TP was already used by a published ATP, so the old text is kept as a record and the new text is saved as a new version. Create a new version of the ATP if you want to use the new text.',
          },
          {
            q: 'Why can I not click Publish?',
            a: 'An ATP must contain at least one TP and must have no unsaved changes. Save the draft first, then try again.',
          },
          {
            q: 'Who can see the teaching materials?',
            a: 'Users who can view subjects can see them. Only the teacher of the subject, the Curriculum team, and School admins can prepare or change them.',
          },
          {
            q: 'What does the inactive objectives badge on a flow mean?',
            a: 'The badge means some items point to an old version of a learning objective, one that was replaced by a new version or deactivated. Such a flow cannot be published. Open the flow, remove the items marked as an old version, add the new version of the objective, then save the draft. When an academic year is copied, copied flows that contain inactive objectives also get a warning.',
          },
          {
            q: 'Why can a TP not be deleted?',
            a: 'A TP used by an assessment, an ATP, or a teacher achievement decision cannot be deleted so that the grade history stays complete. Deactivate the TP so it no longer appears for new assessments.',
          },
        ],
      },
      su: {
        title: 'Parabot ngajar: CP, TP, jeung ATP',
        summary:
          'Cara guru jeung kurikulum nyusun capaian pangajaran (CP), tujuan pangajaran (TP), jeung alur tujuan pangajaran (ATP) pikeun unggal mata pelajaran, tuluy nerbitkeunana.',
        forWho:
          'Guru nu nyusun parabot ngajar mata pelajaran nu diampuna, sarta Kurikulum jeung Admin sakola nu ngatur kabéh mata pelajaran.',
        sections: [
          {
            heading: 'Gambaran singget',
            body: 'Parabot ngajar diwangun ku tilu bagian. Capaian pangajaran (CP) nyaéta sasaran per fase. Tujuan pangajaran (TP) nyaéta léngkah-léngkah leutik handapeun CP. Alur tujuan pangajaran (ATP) nyaéta urutan TP dina sataun pangajaran, lengkep jeung kira-kira minggu, jam pelajaran, jeung semester. Kabéhanana opsional: sakola nu acan makéna tetep bisa ngajalankeun fitur séjén.',
            tip: 'Guru ngan ningali jeung ngarobah mata pelajaran nu diampuna. Kurikulum jeung Admin sakola bisa ngatur kabéh mata pelajaran.',
          },
          {
            heading: 'Nyusun CP jeung TP',
            body: 'Pilih mata pelajaran, tuluy buka bagian Capaian jeung tujuan. CP dikelompokkeun per fase (A nepi ka F). Handapeun unggal CP anjeun nambahan TP, ngarobah urutanana ku tombol naék jeung turun, mareuman, atawa micecun.',
            steps: [
              'Buka ménu Parabot ngajar kuring tuluy pilih mata pelajaran.',
              'Klik Tambah CP, pilih fase, tuluy tulis capaian pangajaranna.',
              'Handapeun CP éta, klik Tambah TP tuluy tulis tujuanana. Ulang pikeun TP saterusna.',
              'Paké tombol naék jeung turun pikeun ngatur urutan TP.',
            ],
            href: '/teaching-plan',
          },
          {
            heading: 'Ngarobah téks nu geus dipaké',
            body: 'Salami CP atawa TP acan dipaké ATP nu geus terbit, ngarobah téksna langsung nimpa téks heubeul. Upami geus dipaké ATP nu geus terbit, téks heubeul teu ditimpa: sistem nyieun vérsi anyar jeung nandaan nu heubeul minangka vérsi heubeul. ATP nu geus terbit tetep nuduhkeun téks heubeul, jadi arsipna teu robah. Pikeun makéna téks anyar, jieun vérsi anyar ATP-na.',
            warning:
              'TP nu masih dipaké hiji ATP teu bisa dipiceun. Kaluarkeun heula tina ATP-na, atawa pareuman waé TP éta.',
          },
          {
            heading: 'Nyusun ATP',
            body: 'Buka bagian Alur tujuan, pilih taun pangajaran, tuluy jieun ATP anyar jeung ngaran sarta tingkat; fase kaeusi otomatis tina tingkat. ATP anyar statusna konsép. Tambihan TP tina CP mata pelajaran éta, eusian kira-kira minggu, jam pelajaran, jeung semester, tuluy atur urutanana. Hiji TP ngan meunang muncul sakali dina hiji ATP, jeung hiji ATP maksimal eusina 300 butir.',
            steps: [
              'Pilih taun pangajaran, klik ATP anyar tuluy eusian ngaranna.',
              'Klik Tambah TP, centang TP nu diperlukeun, tuluy klik tombol tambah.',
              'Eusian minggu, JP, jeung semester dina unggal baris, tuluy atur urutanana.',
              'Klik Simpen konsép. Parobahan nu acan disimpen ditandaan handapeun tabel.',
            ],
            href: '/teaching-plan',
          },
          {
            heading: 'Nerbitkeun jeung nyieun vérsi anyar',
            body: 'Upami ATP geus siap, klik Terbitkeun tuluy konfirmasi. ATP nu geus terbit dikonci jeung ngan bisa dilieuk. Pikeun ngarévisi, klik Jieun vérsi anyar: eusina disalin jadi konsép vérsi saterusna, sedengkeun vérsi nu terbit tetep utuh. Konsép nu acan terbit bisa dipiceun.',
            tip: 'Waktu ganti taun pangajaran, pilih Salin parabot ngajar dina léngkah nyalin data di ménu Naékna kelas. ATP nu terbit disalin jadi konsép ka taun anyar pikeun dipariksa jeung diterbitkeun deui.',
            warning:
              'ATP nu geus terbit teu bisa dirobah atawa dipiceun. Pastikeun eusina bener saacan nerbitkeun.',
          },
          {
            heading: 'Ngarobah TP nu geus dipaké panilaian',
            body: 'Upami hiji TP geus dikaitkeun ka panilaian, ngarobah téksna teu nimpa téks heubeul. Sistem nyieun vérsi anyar TP éta jeung nandaan nu heubeul minangka vérsi heubeul. Panilaian nu geus aya tetep migunakeun téks heubeul sarta skorna, jadi kahontal nu geus dihitung teu robah jempé. Upami hayang panilaian migunakeun téks anyar, ganti TP dina panilaian éta dina ménu Panilaian.',
            steps: [
              'Robah téks TP saperti biasa tuluy simpen. Upami TP geus dipaké panilaian, aya béwara yén vérsi anyar dijieun.',
              'Buka ménu Panilaian, pilih Robah dina panilaian nu hayang migunakeun téks anyar, tuluy ganti TP-na ku vérsi nu aktif.',
            ],
            href: '/grades',
            warning:
              'TP nu geus dikaitkeun ka panilaian atawa geus boga kaputusan kahontal ti guru teu tiasa dihapus. Pareuman wungkul.',
          },
        ],
        faq: [
          {
            q: 'Naha parabot ngajar kudu dieusi?',
            a: 'Henteu. Parabot ngajar sipatna opsional. Sakola nu acan makéna tetep bisa ngajalankeun fitur séjén saperti jadwal, nilai, jeung rapor.',
          },
          {
            q: 'Naha kuring teu ningali mata pelajaran tangtu?',
            a: 'Guru ngan ningali mata pelajaran nu diampuna. Upami mata pelajaran anjeun teu muncul, pénta Kurikulum atawa Admin sakola pikeun ngatur tugas ngajar anjeun.',
          },
          {
            q: 'Kuring ngarobah téks TP, tapi muncul vérsi anyar. Naha éta wajar?',
            a: 'Wajar. TP éta geus dipaké ATP nu geus terbit, jadi téks heubeul dijaga minangka arsip jeung téks anyar disimpen minangka vérsi anyar. Jieun vérsi anyar ATP upami hayang makéna téks anyar.',
          },
          {
            q: 'Naha tombol Terbitkeun teu bisa diklik?',
            a: 'ATP kudu eusina sahanteuna hiji TP jeung teu meunang aya parobahan nu acan disimpen. Simpen heula konsépna, tuluy cobaan deui.',
          },
          {
            q: 'Saha nu bisa ningali parabot ngajar?',
            a: 'Pamaké nu meunang ningali mata pelajaran bisa ningalina. Ngan guru pangampu, Kurikulum, jeung Admin sakola nu bisa nyusun atawa ngarobahna.',
          },
          {
            q: 'Naon hartina lencana tujuan nonaktif dina alur?',
            a: 'Lencana éta nandakeun aya item nu nuduhkeun tujuan pembelajaran vérsi heubeul, nyaéta nu geus diganti vérsi anyar atawa dinonaktifkeun. Alur kitu teu bisa diterbitkeun. Buka alurna, hapus item nu ditandaan vérsi heubeul, tambahkeun tujuan vérsi anyar, tuluy simpen rarancang. Nalika taun ajaran disalin, alur hasil salinan nu ngandung tujuan nonaktif ogé dibéré paringatan.',
          },
          {
            q: 'Naha TP teu tiasa dihapus?',
            a: 'TP nu dipaké panilaian, ATP, atawa kaputusan kahontal guru teu tiasa dihapus sangkan riwayat nilai tetep lengkep. Pareuman TP éta sangkan teu muncul deui pikeun panilaian anyar.',
          },
        ],
      },
    },
  },
  {
    slug: 'kktp',
    icon: 'book',
    tone: 'teal',
    group: 'academic',
    module: 'grades',
    text: {
      id: {
        title: 'Kriteria Ketercapaian Tujuan Pembelajaran (KKTP)',
        summary:
          'Cara menentukan Kriteria Ketercapaian Tujuan Pembelajaran (KKTP) tiap mata pelajaran, termasuk batas ketuntasan desimal dan kriteria berlevel, serta bagaimana nilai itu dipakai di rekap nilai, portal, dan rapor.',
        forWho:
          'Kurikulum, Operator, dan Admin sekolah yang mengatur batas ketuntasan. Guru dan peran lain bisa melihat kriteria, tetapi tidak mengubahnya.',
        sections: [
          {
            heading: 'Apa itu Kriteria Ketercapaian Tujuan Pembelajaran (KKTP) dan kapan dipakai',
            body: 'Kriteria Ketercapaian Tujuan Pembelajaran (KKTP) menentukan kapan siswa dianggap mencapai tujuan pembelajaran sebuah mapel. Secara bawaan semua mata pelajaran memakai satu batas ketuntasan bawaan sekolah (KKM) yang diatur di Pengaturan penilaian. Bila sebuah mapel perlu batas sendiri, buat kriteria untuknya di tab KKTP pada halaman Kurikulum. Kriteria bisa berlaku untuk semua tingkat dan jurusan, atau dikhususkan pada satu tingkat dan satu jurusan. Mapel tanpa kriteria tetap memakai KKM sekolah.',
            href: '/curriculum?tab=kktp',
            tip: 'Mulai dari yang sederhana: biarkan KKM sekolah berlaku, dan buat kriteria hanya untuk mapel yang memang berbeda.',
          },
          {
            heading: 'Membuat kriteria berupa satu angka',
            body: 'Mode Angka adalah yang paling sederhana: siswa tuntas bila nilainya sama dengan atau di atas satu angka. Angka boleh desimal, misalnya 72,5.',
            steps: [
              'Buka Kurikulum, lalu tab KKTP.',
              'Klik Tambah kriteria.',
              'Pilih mata pelajaran. Pilih tingkat dan jurusan bila kriteria hanya untuk itu, atau biarkan Semua.',
              'Pilih mode Angka, isi KKM antara 0 dan 100 (paling banyak dua desimal), lalu Simpan.',
            ],
            href: '/curriculum?tab=kktp',
            warning:
              'Satu kombinasi mapel, tingkat, dan jurusan hanya boleh punya satu kriteria. Bila sudah ada, ubah yang lama.',
          },
          {
            heading: 'Kriteria berlevel: rentang nilai, deskriptor, dan rubrik',
            body: 'Untuk penilaian bertingkat, pilih mode Rentang nilai, Deskriptor, atau Rubrik. Tiap level punya label, deskripsi, nilai terendah dan tertinggi, dan centang Tuntas. KKM efektifnya adalah nilai terendah dari level yang dicentang Tuntas. Pada mode Deskriptor angka boleh dikosongkan.',
            steps: [
              'Di dialog kriteria, pilih mode Rentang nilai, Deskriptor, atau Rubrik.',
              'Klik Tambah level, lalu isi label, nilai terendah, dan nilai tertinggi.',
              'Centang Tuntas pada level yang dianggap tercapai. Urutkan level dengan tombol panah.',
              'Pastikan rentang antarlevel tidak bertumpuk, lalu Simpan.',
            ],
            warning:
              'Rentang dua level tidak boleh tumpang tindih, dan batasnya ikut dihitung. Misalnya 60 sampai 75 dan 75 sampai 90 bertumpuk di angka 75. Gunakan 60 sampai 74,99 dan 75 sampai 90.',
          },
          {
            heading: 'Melihat KKM yang berlaku lewat Pratinjau KKM',
            body: 'Di bagian bawah tab KKTP, pilih mapel, tingkat, dan jurusan untuk melihat KKM yang akan dipakai dan asalnya. Urutan pencarian: kriteria mapel untuk tingkat dan jurusan itu, lalu mapel untuk tingkat itu, lalu mapel untuk jurusan itu, lalu kriteria umum mapel, dan terakhir KKM sekolah.',
            href: '/curriculum?tab=kktp',
            tip: 'Pakai pratinjau sebelum rapor dibagikan untuk memastikan setiap mapel memakai KKM yang Anda maksud.',
          },
          {
            heading: 'Di mana KKM mapel muncul, dan kapan perubahan ditolak',
            body: 'KKM mapel dipakai di rekap nilai (penanda di bawah KKM), di portal orang tua dan siswa, dan di rapor. Nilai desimal ditampilkan apa adanya, misalnya 72,5. Karena mengubah KKM bisa mengubah penanda dan isi rapor, menambah, mengubah, atau menghapus kriteria ditolak selama semester aktif punya rapor yang sudah final.',
            warning:
              'Bila muncul pesan bahwa rapor sudah final, buka kembali rapor yang sudah final di menu Rapor, ubah kriterianya, lalu finalkan lagi.',
          },
        ],
        faq: [
          {
            q: 'Apakah KKM sekolah bisa desimal?',
            a: 'Tidak. KKM sekolah di Pengaturan penilaian berupa bilangan bulat 1 sampai 100. KKM desimal diatur per mapel lewat kriteria KKTP.',
          },
          {
            q: 'Mapel saya tidak punya kriteria. KKM mana yang dipakai?',
            a: 'KKM sekolah dari Pengaturan penilaian. Anda bisa memastikannya lewat Pratinjau KKM.',
          },
          {
            q: 'Kriteria saya ditolak karena rapor sudah final. Apa yang harus dilakukan?',
            a: 'Buka kembali rapor yang sudah final pada semester aktif, lakukan perubahan kriteria, lalu finalkan ulang rapornya.',
          },
          {
            q: 'Kenapa kriteria berlevel saya ditolak?',
            a: 'Biasanya karena rentang dua level bertumpuk, ada level tanpa label, atau nilai terendah lebih besar dari nilai tertinggi. Dialog menunjukkan level yang bermasalah.',
          },
          {
            q: 'Bolehkah satu mapel punya KKM berbeda untuk tiap tingkat?',
            a: 'Boleh. Buat satu kriteria per tingkat, atau satu kriteria umum ditambah kriteria khusus untuk tingkat yang berbeda. Kriteria yang paling khusus yang dipakai.',
          },
        ],
      },
      en: {
        title: 'Learning Objective Achievement Criteria (KKTP)',
        summary:
          'How to set the Learning Objective Achievement Criteria (KKTP) of each subject, including decimal marks and levelled criteria, and how it is used in grade recaps, the parent portal, and report cards.',
        forWho:
          'Curriculum staff, Operators, and School admins who set passing marks. Teachers and other roles can view the criteria but not change them.',
        sections: [
          {
            heading: 'What the Learning Objective Achievement Criteria (KKTP) are and when to use them',
            body: 'The Learning Objective Achievement Criteria (KKTP) decide when a student counts as having reached the learning objectives of a subject. By default every subject uses one school-wide default mastery threshold (KKM), set in Grading settings. When a subject needs its own passing mark, create a criterion for it in the KKTP tab of the Curriculum page. A criterion can apply to all levels and programs, or be limited to one level and one program. Subjects without a criterion keep using the school KKM.',
            href: '/curriculum?tab=kktp',
            tip: 'Start simple: let the school KKM apply, and create criteria only for subjects that really differ.',
          },
          {
            heading: 'Creating a criterion with a single number',
            body: 'The Number mode is the simplest: a student passes with a score equal to or above one number. The number may have decimals, for example 72.5.',
            steps: [
              'Open Curriculum, then the KKTP tab.',
              'Click Add criterion.',
              'Choose the subject. Choose a level and program if the criterion is only for those, or leave All.',
              'Choose the Number mode, enter the KKM between 0 and 100 (at most two decimals), then Save.',
            ],
            href: '/curriculum?tab=kktp',
            warning:
              'One combination of subject, level, and program may have only one criterion. If one already exists, edit the old one.',
          },
          {
            heading: 'Levelled criteria: score ranges, descriptors, and rubrics',
            body: 'For graded levels, choose the Score ranges, Descriptor, or Rubric mode. Each level has a label, a description, a lowest and highest score, and a Mastered tick. The effective KKM is the lowest score among the levels ticked Mastered. In the Descriptor mode the numbers may be left empty.',
            steps: [
              'In the criterion dialog, choose the Score ranges, Descriptor, or Rubric mode.',
              'Click Add level, then fill in the label, lowest score, and highest score.',
              'Tick Mastered on the levels that count as achieved. Reorder levels with the arrow buttons.',
              'Make sure the ranges of different levels do not overlap, then Save.',
            ],
            warning:
              'The ranges of two levels must not overlap, and their limits count. For example 60 to 75 and 75 to 90 overlap at 75. Use 60 to 74.99 and 75 to 90.',
          },
          {
            heading: 'Checking the KKM in effect with the KKM preview',
            body: 'At the bottom of the KKTP tab, choose a subject, level, and program to see which KKM will be used and where it comes from. The search order is: the subject criterion for that level and program, then the subject for that level, then the subject for that program, then the general subject criterion, and finally the school KKM.',
            href: '/curriculum?tab=kktp',
            tip: 'Use the preview before report cards are handed out to confirm every subject uses the KKM you intend.',
          },
          {
            heading: 'Where the subject KKM appears, and when changes are refused',
            body: 'The subject KKM is used in the grade recap (the below-KKM marker), in the parent and student portal, and on report cards. Decimal marks are shown as they are, for example 72.5. Because changing a KKM can change markers and report card content, adding, changing, or deleting a criterion is refused while the active semester has finalized report cards.',
            warning:
              'If a message says the report card is finalized, reopen the finalized report cards in the Report cards menu, change the criterion, then finalize again.',
          },
        ],
        faq: [
          {
            q: 'Can the school KKM have decimals?',
            a: 'No. The school KKM in Grading settings is a whole number from 1 to 100. Decimal marks are set per subject through KKTP criteria.',
          },
          {
            q: 'My subject has no criterion. Which KKM is used?',
            a: 'The school KKM from Grading settings. You can confirm it with the KKM preview.',
          },
          {
            q: 'My criterion was refused because report cards are finalized. What now?',
            a: 'Reopen the finalized report cards of the active semester, make the criterion change, then finalize the report cards again.',
          },
          {
            q: 'Why was my levelled criterion refused?',
            a: 'Usually because two level ranges overlap, a level has no label, or the lowest score is above the highest score. The dialog points to the level with the problem.',
          },
          {
            q: 'Can one subject have a different KKM for each level?',
            a: 'Yes. Create one criterion per level, or one general criterion plus specific criteria for the levels that differ. The most specific criterion is the one used.',
          },
        ],
      },
      su: {
        title: 'Kriteria Ketercapaian Tujuan Pembelajaran (KKTP)',
        summary:
          'Cara nangtukeun Kriteria Ketercapaian Tujuan Pembelajaran (KKTP) unggal mata pelajaran, kaasup wates katuntasan désimal jeung kriteria bertingkat, sarta kumaha nilai éta dipaké dina rekap nilai, portal, jeung rapor.',
        forWho:
          'Kurikulum, Operator, jeung Admin sakola nu nga-atur wates katuntasan. Guru jeung peran séjén bisa nempo kriteria, tapi teu bisa ngarobahna.',
        sections: [
          {
            heading: 'Naon éta Kriteria Ketercapaian Tujuan Pembelajaran (KKTP) jeung iraha dipaké',
            body: 'Kriteria Ketercapaian Tujuan Pembelajaran (KKTP) nangtukeun iraha siswa dianggap geus ngahontal tujuan pembelajaran hiji mapel. Sacara baku sadaya mata pelajaran maké hiji wates katuntasan baku sakola (KKM) nu diatur dina Pangaturan penilaian. Upami hiji mapel butuh wates sorangan, jieun kriteria pikeun mapel éta dina tab KKTP di kaca Kurikulum. Kriteria bisa berlaku pikeun sadaya tingkat jeung jurusan, atawa dihususkeun kana hiji tingkat jeung hiji jurusan. Mapel tanpa kriteria tetep maké KKM sakola.',
            href: '/curriculum?tab=kktp',
            tip: 'Mimitian ti nu basajan: sing KKM sakola nu berlaku, jeung jieun kriteria ngan pikeun mapel nu memang béda.',
          },
          {
            heading: 'Nyieun kriteria mangrupa hiji angka',
            body: 'Mode Angka mangrupa nu pangbasajanna: murid tuntas upami nilaina sarua atawa leuwih luhur ti hiji angka. Angka bisa désimal, contona 72,5.',
            steps: [
              'Buka Kurikulum, tuluy tab KKTP.',
              'Klik Tambah kriteria.',
              'Pilih mata pelajaran. Pilih tingkat jeung jurusan upami kriteria ngan pikeun éta, atawa sing Sadaya.',
              'Pilih mode Angka, eusian KKM antara 0 jeung 100 (paling loba dua désimal), tuluy Simpen.',
            ],
            href: '/curriculum?tab=kktp',
            warning:
              'Hiji kombinasi mapel, tingkat, jeung jurusan ngan meunang boga hiji kriteria. Upami geus aya, robah nu heubeul.',
          },
          {
            heading: 'Kriteria bertingkat: rentang nilai, déskriptor, jeung rubrik',
            body: 'Pikeun penilaian bertingkat, pilih mode Rentang nilai, Déskriptor, atawa Rubrik. Unggal tingkatan boga labél, pedaran, nilai panghandapna jeung pangluhurna, sarta centang Tuntas. KKM éfektifna nyaéta nilai panghandapna tina tingkatan nu dicentang Tuntas. Dina mode Déskriptor angka bisa dikosongkeun.',
            steps: [
              'Dina dialog kriteria, pilih mode Rentang nilai, Déskriptor, atawa Rubrik.',
              'Klik Tambah tingkatan, tuluy eusian labél, nilai panghandapna, jeung nilai pangluhurna.',
              'Centang Tuntas dina tingkatan nu dianggap kahontal. Urutkeun tingkatan maké tombol panah.',
              'Pastikeun rentang antartingkatan teu tumpang tindih, tuluy Simpen.',
            ],
            warning:
              'Rentang dua tingkatan teu meunang tumpang tindih, jeung watesna diitung. Upamana 60 nepi ka 75 jeung 75 nepi ka 90 tumpang tindih dina angka 75. Pake 60 nepi ka 74,99 jeung 75 nepi ka 90.',
          },
          {
            heading: 'Nempo KKM nu berlaku lewat Pratayang KKM',
            body: 'Di handap tab KKTP, pilih mapel, tingkat, jeung jurusan pikeun nempo KKM nu bakal dipaké jeung asalna. Urutan pamilarianana: kriteria mapel pikeun tingkat jeung jurusan éta, tuluy mapel pikeun tingkat éta, tuluy mapel pikeun jurusan éta, tuluy kriteria umum mapel, jeung pamungkas KKM sakola.',
            href: '/curriculum?tab=kktp',
            tip: 'Pake pratayang saacan rapor dibagikeun pikeun mastikeun unggal mapel maké KKM nu dimaksud.',
          },
          {
            heading: 'Di mana KKM mapel muncul, jeung iraha parobahan ditolak',
            body: 'KKM mapel dipaké dina rekap nilai (tanda di handap KKM), dina portal kolot jeung murid, jeung dina rapor. Nilai désimal dipidangkeun sakumaha aya, contona 72,5. Sabab ngarobah KKM bisa ngarobah tanda jeung eusi rapor, nambah, ngarobah, atawa miceun kriteria ditolak salami semester aktif boga rapor nu geus final.',
            warning:
              'Upami aya pesen yén rapor geus final, buka deui rapor nu geus final dina ménu Rapor, robah kriteriana, tuluy finalkeun deui.',
          },
        ],
        faq: [
          {
            q: 'Naha KKM sakola bisa désimal?',
            a: 'Henteu. KKM sakola dina Pangaturan penilaian mangrupa wilangan bulat 1 nepi ka 100. KKM désimal diatur per mapel lewat kriteria KKTP.',
          },
          {
            q: 'Mapel kuring teu boga kriteria. KKM mana nu dipaké?',
            a: 'KKM sakola tina Pangaturan penilaian. Anjeun bisa mastikeunana lewat Pratayang KKM.',
          },
          {
            q: 'Kriteria kuring ditolak sabab rapor geus final. Kumaha?',
            a: 'Buka deui rapor nu geus final dina semester aktif, robah kriteriana, tuluy finalkeun deui raporna.',
          },
          {
            q: 'Naha kriteria bertingkat kuring ditolak?',
            a: 'Biasana sabab rentang dua tingkatan tumpang tindih, aya tingkatan tanpa labél, atawa nilai panghandapna leuwih gede tibatan nilai pangluhurna. Dialog nunjukkeun tingkatan nu bermasalah.',
          },
          {
            q: 'Naha hiji mapel bisa boga KKM béda pikeun unggal tingkat?',
            a: 'Bisa. Jieun hiji kriteria per tingkat, atawa hiji kriteria umum tambah kriteria husus pikeun tingkat nu béda. Kriteria nu pangkhususna nu dipaké.',
          },
        ],
      },
    },
  },
  {
    slug: 'subject-choices',
    icon: 'layers',
    tone: 'violet',
    group: 'academic',
    text: {
      id: {
        title: 'Pilihan mata pelajaran',
        summary:
          'Cara menandai mapel yang hanya diambil murid yang memilihnya, mencatat pilihan tiap murid, membaca peringatan, dan mengatur aturan sekolah.',
        forWho:
          'Wali kelas dan pengelola pilihan mata pelajaran yang mencatat pilihan murid, serta admin sekolah yang mengatur aturan pilihan.',
        sections: [
          {
            heading: 'Gambaran singkat',
            body: 'Di sebagian sekolah, murid tidak mengambil semua mata pelajaran: ada mapel pilihan yang hanya diambil murid yang memilihnya. Halaman Pilihan mapel dipakai untuk mencatat mapel apa saja yang diambil tiap murid, lalu memeriksa apakah pilihannya sesuai aturan sekolah, misalnya jumlah mapel yang boleh dipilih. Halaman ini mencatat pilihan dan memeriksa aturan.',
            tip: 'Semua pengguna yang boleh melihat data kelas dapat membuka halaman ini. Yang boleh mengubah pilihan adalah wali kelas rombel itu dan pengelola pilihan mata pelajaran.',
          },
          {
            heading: 'Menandai mapel yang dipilih murid',
            body: 'Langkah pertama per kelas: tandai mapel mana yang hanya diikuti murid yang memilihnya. Mapel yang tidak ditandai tetap diikuti semua murid di kelas itu. Bila sebuah mapel sudah punya nilai murid, Anda akan melihat jumlah murid yang sudah bernilai dan diminta mengonfirmasi dulu.',
            steps: [
              'Buka menu Pilihan mapel, lalu pilih tahun ajaran dan kelas.',
              'Buka bagian Mapel yang dipilih murid.',
              'Centang mapel yang hanya diambil murid yang memilihnya.',
              'Klik Simpan pengaturan mapel. Bila ada nilai yang sudah ada, baca keterangannya lalu konfirmasi.',
            ],
            href: '/subject-choices',
            warning:
              'Nilai yang sudah ada tidak dihapus saat sebuah mapel ditandai sebagai pilihan. Melepas centang juga tidak menghapus pilihan murid yang sudah dicatat.',
          },
          {
            heading: 'Mencatat pilihan tiap murid',
            body: 'Setelah mapel ditandai, buka bagian Pilihan murid. Di layar lebar, pilihan tampil sebagai tabel murid dan mapel; di ponsel, sebagai kartu per murid. Centang mapel yang diambil murid, lalu simpan. Di bawah tiap centang tertulis asal pilihannya, misalnya dipilih langsung atau diisi dari agama.',
            steps: [
              'Buka bagian Pilihan murid.',
              'Centang mapel yang diambil tiap murid. Jumlah perubahan tampil di tombol simpan.',
              'Klik Simpan pilihan.',
              'Baca ringkasan aturan sekolah di bagian bawah untuk melihat apakah ada murid yang belum sesuai.',
            ],
            href: '/subject-choices',
            tip: 'Pilihan yang hanya berlaku pada satu semester ditampilkan sebagai keterangan dan tidak bisa diubah dari tabel ini.',
          },
          {
            heading: 'Mengisi pilihan agama dari data murid',
            body: 'Tombol Isi pilihan agama dari data murid mengisi mapel agama sesuai agama yang tercatat pada data tiap murid. Sistem tidak menebak: murid hanya diisi bila ada tepat satu mapel agama yang cocok di kelas itu. Murid yang tidak bisa diisi otomatis ditampilkan beserta alasannya, misalnya agama belum diisi, tidak ada mapel yang cocok, atau sudah memilih mapel agama lain.',
            tip: 'Lengkapi data agama murid di halaman Siswa lebih dulu agar lebih banyak murid terisi otomatis.',
          },
          {
            heading: 'Membaca ringkasan peringatan',
            body: 'Ringkasan di bawah matriks menunjukkan murid yang pilihannya kurang atau lebih dari yang ditentukan aturan, murid yang belum memilih seni atau agama, dan aturan yang jumlah mapel ditawarkannya masih kurang. Semester dapat diganti untuk melihat keadaan semester lain. Peringatan hanya untuk diketahui: pilihan tetap bisa disimpan.',
          },
          {
            heading: 'Mengatur aturan sekolah',
            body: 'Aturan sekolah, hanya terlihat oleh pengelola pilihan mata pelajaran, menentukan berapa mapel yang ditawarkan dan berapa yang boleh dipilih murid, per tingkat dan program. Contoh: sekolah menawarkan minimal 7 mapel pilihan, murid memilih 4 sampai 5. Pilih jenis aturan lalu sesuaikan nama, batas, dan mapel yang termasuk di dalamnya.',
            steps: [
              'Buka bagian Aturan sekolah pada tahun ajaran yang dipilih.',
              'Klik Tambah aturan dan pilih jenisnya: mapel pilihan, satu mapel seni, atau satu mapel agama.',
              'Isi tingkat, batas jumlah, dan centang mapel yang termasuk aturan ini.',
              'Klik Simpan. Aturan dapat diubah atau dihapus kapan saja.',
            ],
            href: '/subject-choices',
            tip: 'Bawaannya aturan hanya memberi peringatan. Centang Tolak penyimpanan hanya bila sekolah benar-benar ingin pilihan yang melanggar tidak bisa disimpan.',
          },
          {
            heading: 'Pilihan yang sudah terkunci',
            body: 'Aturan dapat menetapkan semester tertentu sebagai batas: setelah semester itu dimulai, pilihan tidak bisa diubah lagi. Hanya pemegang izin kelola kurikulum yang masih boleh mengubahnya, setelah mengonfirmasi, dan perubahan itu dicatat. Pilihan juga tidak bisa diubah bila rapor semester terkait sudah difinalisasi; buka kembali rapornya lebih dulu.',
            warning:
              'Menimpa pilihan yang terkunci sebaiknya hanya untuk koreksi yang memang perlu, karena tercatat atas nama Anda.',
          },
          {
            heading: 'Absensi per jam untuk mapel pilihan dan kelas gabungan',
            body: 'Di Absensi per jam, lembar sebuah jam untuk mapel pilihan hanya memuat murid yang mengambil mapel itu, dan jumlah "terisi" di kartu jam dihitung dari murid-murid itu saja. Jam yang tidak punya satu pun murid pengambil tidak pernah dianggap belum diisi di dasbor maupun di laporan jam belum diisi. Untuk pertemuan gabungan (beberapa kelas belajar bersama satu guru), kartu jamnya berlabel Gabungan dan tombolnya menjadi Isi bersama: lembarnya menampilkan murid semua kelas yang bergabung, dikelompokkan per kelas, dan satu kali simpan menuliskan absensi ke jam kelas masing-masing sehingga laporan per kelas tetap benar.',
            steps: [
              'Buka Absensi per jam dan pilih tanggalnya.',
              'Untuk pertemuan gabungan, klik Isi bersama pada salah satu kartu berlabel Gabungan.',
              'Tandai status tiap murid lalu klik Simpan.',
            ],
            href: '/lessons',
            tip: 'Sekolah yang tidak memakai mapel pilihan atau kelas gabungan tidak melihat perubahan: satu jam tetap berisi seluruh murid kelasnya.',
            warning:
              'Absensi gabungan ditolak bila rapor salah satu murid pada semester itu sudah final. Buka kembali rapor kelasnya lebih dulu.',
          },
          {
            heading: 'Pilihan mapel saat tahun ajaran baru',
            body: 'Saat Salin tahun ajaran, tanda mapel pilihan tiap kelas ikut disalin ke kelas hasil salinan (kelas tujuan yang sudah punya tanda tidak diubah). Saat Terapkan keputusan kenaikan, pilihan mapel setahun murid yang naik atau tinggal kelas dibawa ke tahun tujuan bila kelas tujuannya juga menandai mapel itu sebagai pilihan; hasilnya menampilkan jumlah pilihan yang dibawa dan yang tidak dibawa. Pilihan per semester tidak dibawa, dan penempatan murid ke kelas tujuan tidak memperhitungkan pilihan: pilih kelas tujuan sendiri bila kelas dibentuk per paket pilihan.',
            href: '/promotion',
            tip: 'Murid kelas X belum punya pilihan untuk dibawa; pilihan mereka diisi baru di kelas XI.',
            warning: 'Pilihan yang tidak dibawa harus diisi ulang di tab Mapel dan peserta kelas tujuan.',
          },
          {
            heading: 'Jadwal paralel dan kelas gabungan',
            body: 'Mapel pilihan sering berjalan bersamaan: murid yang memilih Fisika belajar di satu ruang sementara yang memilih Kimia di ruang lain pada jam yang sama. Di halaman Jadwal pelajaran, buka sel kelas lalu klik Tambah jalur paralel untuk menaruh mapel pilihan lain di jam yang sama; tiap jalur punya guru pengampunya sendiri. Jalur paralel hanya bisa diisi mapel yang sudah ditandai sebagai pilihan di kelas itu, dan seorang guru tetap tidak bisa mengajar dua jalur pada jam yang sama. Bila satu guru mengajar mapel pilihan yang sama untuk beberapa kelas sekaligus (kelas gabungan), centang Pertemuan gabungan dengan kelas lain di sel itu lalu pilih kelas lain yang jamnya sama; guru tidak dianggap bentrok untuk pertemuan gabungan itu.',
            steps: [
              'Tandai dulu mapelnya sebagai pilihan di kelas (bagian Mapel yang dipilih murid).',
              'Buka Jadwal pelajaran, pilih kelas, lalu klik sel jam yang diinginkan.',
              'Untuk jalur lain di jam yang sama, klik Tambah jalur paralel pada sel itu dan pilih mapel pilihan berikutnya.',
              'Untuk kelas gabungan, centang Pertemuan gabungan dengan kelas lain, pilih kelas yang sudah mengisi mapel itu (atau mulai pertemuan baru), lalu simpan.',
            ],
            href: '/schedule',
            tip: 'Sekolah yang tidak memakai jalur paralel atau kelas gabungan tidak melihat perubahan apa pun: satu jam tetap satu mapel per kelas.',
            warning:
              'Mengosongkan sel hanya menghapus jalurnya. Absensi per jam untuk pertemuan gabungan masih dicatat per sel kelas masing-masing.',
          },
          {
            heading: 'Melihat pilihan satu murid',
            body: 'Di halaman Siswa, buka menu tindakan pada baris murid lalu pilih Mapel pilihan. Anda melihat mapel pilihan di kelasnya, mana yang diambil, dan apakah murid itu sudah sesuai aturan sekolah.',
            href: '/students',
          },
        ],
        faq: [
          {
            q: 'Mengapa tabel pilihan kosong?',
            a: 'Belum ada mapel yang ditandai sebagai pilihan di kelas itu. Buka bagian Mapel yang dipilih murid dan tandai mapelnya lebih dulu.',
          },
          {
            q: 'Apakah murid yang belum dicentang dianggap tidak mengambil mapel itu?',
            a: 'Ya, untuk mapel yang ditandai sebagai pilihan. Murid hanya dianggap mengambil mapel yang dicentang.',
          },
          {
            q: 'Pilihan ditolak dan muncul keterangan bahwa pilihan terkunci. Apa yang harus dilakukan?',
            a: 'Batas waktu mengganti pilihan sudah lewat. Hubungi pengelola kurikulum sekolah; hanya mereka yang boleh mengubahnya.',
          },
          {
            q: 'Pilihan ditolak karena rapor sudah final. Bagaimana?',
            a: 'Buka kembali rapor kelas itu di menu Rapor, ubah pilihannya, lalu finalkan rapor lagi.',
          },
          {
            q: 'Apakah menghapus aturan juga menghapus pilihan murid?',
            a: 'Tidak. Aturan hanya dipakai untuk memeriksa dan memberi peringatan; pilihan murid yang sudah dicatat tetap tersimpan.',
          },
        ],
      },
      en: {
        title: 'Subject choices',
        summary:
          "How to mark the subjects that only the students who choose them take, record each student's choices, read the warnings, and set school rules.",
        forWho:
          'Homeroom teachers and subject choice managers who record student choices, and school admins who set the choice rules.',
        sections: [
          {
            heading: 'Overview',
            body: 'In some schools students do not take every subject: there are elective subjects that only the students who choose them take. The Subject choices page records which subjects each student takes and checks the choices against school rules, such as how many electives a student may choose. This page records choices and checks rules.',
            tip: "Everyone who can view class data can open this page. Choices can be changed by the class's homeroom teacher and by subject choice managers.",
          },
          {
            heading: 'Marking the subjects students choose',
            body: 'The first step for each class is to mark which subjects only the students who choose them take. Subjects you do not mark are still taken by every student in that class. If a subject already has student scores, you will see how many students have scores and be asked to confirm first.',
            steps: [
              'Open Subject choices, then pick the academic year and class.',
              'Open the Subjects chosen by students section.',
              'Tick the subjects that only the students who choose them take.',
              'Click Save subject settings. If scores already exist, read the notice and confirm.',
            ],
            href: '/subject-choices',
            warning:
              'Existing scores are not deleted when a subject is marked as elective. Unticking a subject also does not delete choices already recorded for students.',
          },
          {
            heading: "Recording each student's choices",
            body: 'Once subjects are marked, open the Student choices section. On a wide screen the choices appear as a table of students and subjects; on a phone they appear as one card per student. Tick the subjects each student takes, then save. Under each tick you see where the choice came from, for example chosen directly or filled in from religion.',
            steps: [
              'Open the Student choices section.',
              'Tick the subjects each student takes. The number of changes shows on the save button.',
              'Click Save choices.',
              'Read the school rules summary at the bottom to see whether any student does not yet comply.',
            ],
            href: '/subject-choices',
            tip: 'Choices that apply to only one semester are shown as a note and cannot be changed from this table.',
          },
          {
            heading: 'Filling religion choices from student data',
            body: 'The Fill religion choices from student data button fills in the religion subject that matches the religion recorded for each student. The system does not guess: a student is only filled in when exactly one matching religion subject exists in the class. Students that cannot be filled in automatically are listed with a reason, for example religion not recorded, no matching subject, or already chose a different religion subject.',
            tip: "Complete the students' religion data on the Students page first so more students are filled in automatically.",
          },
          {
            heading: 'Reading the warnings summary',
            body: 'The summary below the table shows students whose choices are below or above what a rule allows, students who have not chosen an arts or religion subject, and rules where too few subjects are offered. You can switch the semester to see another one. Warnings are for your information only: choices can still be saved.',
          },
          {
            heading: 'Setting school rules',
            body: 'School rules, visible only to subject choice managers, set how many subjects are offered and how many a student may choose, per level and program. For example: the school offers at least 7 elective subjects and students choose 4 to 5. Pick a rule type, then adjust the name, limits, and the subjects it covers.',
            steps: [
              'Open the School rules section for the selected academic year.',
              'Click Add rule and pick a type: elective subjects, one arts subject, or one religion subject.',
              'Fill in the level and limits, and tick the subjects this rule covers.',
              'Click Save. A rule can be edited or deleted at any time.',
            ],
            href: '/subject-choices',
            tip: 'By default a rule only gives warnings. Tick Refuse saving only if the school really wants choices that break the rule to be impossible to save.',
          },
          {
            heading: 'Locked choices',
            body: 'A rule can set a semester as a deadline: once that semester starts, choices can no longer be changed. Only people with the curriculum management permission can still change them, after confirming, and the change is recorded. Choices also cannot be changed when the report cards of the related semester are finalized; reopen those report cards first.',
            warning:
              'Overriding locked choices should be kept for corrections that are really needed, because it is recorded under your name.',
          },
          {
            heading: 'Per-period attendance for electives and combined classes',
            body: 'In Lesson attendance, the sheet of a period for an elective subject only lists the students who take that subject, and the "filled" count on the period card is counted from those students only. A period with no student taking the subject is never counted as unfilled on the dashboard or in the unfilled-periods report. For a combined meeting (several classes learning together with one teacher), the period card is labelled Combined and its button becomes Fill together: the sheet shows the students of all joined classes grouped by class, and one save writes the attendance into each class\'s own period so per-class reports stay correct.',
            steps: [
              'Open Lesson attendance and pick the date.',
              'For a combined meeting, click Fill together on one of the cards labelled Combined.',
              "Mark each student's status, then click Save.",
            ],
            href: '/lessons',
            tip: 'Schools that do not use electives or combined classes see no change: a period still holds the whole class.',
            warning:
              "Combined attendance is refused when any student's report card for that semester is final. Reopen the class report card first.",
          },
          {
            heading: 'Elective choices in a new school year',
            body: "When you Copy the school year, each class's elective-subject marks go with the copied classes (target classes that already have marks are left unchanged). When you Apply promotion decisions, a student's year-long elective choices are carried to the target year for students who move up or repeat, if the target class also marks that subject as an elective; the result shows how many choices were carried and how many were not. Per-semester choices are not carried, and placing students in target classes does not take choices into account: choose the target class yourself when classes are formed per choice package.",
            href: '/promotion',
            tip: 'Grade X students have no choices to carry yet; their choices are filled in fresh in grade XI.',
            warning:
              'Choices that were not carried must be entered again in the target class Subjects and participants tab.',
          },
          {
            heading: 'Parallel schedule and combined classes',
            body: 'Elective subjects often run at the same time: students who chose Physics study in one room while those who chose Chemistry study in another during the same period. On the Lesson schedule page, open a class cell and click Add parallel lane to put another elective subject in the same period; each lane has its own teacher. A parallel lane can only hold subjects already marked as electives in that class, and one teacher still cannot teach two lanes in the same period. When one teacher teaches the same elective for several classes at once (a combined class), tick Combined meeting with other classes in that cell and pick the other class with the same period; the teacher is not treated as double-booked for that combined meeting.',
            steps: [
              'First mark the subject as an elective in the class (Subjects chosen by students section).',
              'Open Lesson schedule, choose the class, then click the period cell you want.',
              'For another lane in the same period, click Add parallel lane on that cell and pick the next elective subject.',
              'For a combined class, tick Combined meeting with other classes, choose the class that already has the subject (or start a new meeting), then save.',
            ],
            href: '/schedule',
            tip: 'Schools that do not use parallel lanes or combined classes see no change: one period still holds one subject per class.',
            warning:
              'Clearing a cell only removes that lane. Per-period attendance for a combined meeting is still recorded per class cell.',
          },
          {
            heading: "Viewing one student's choices",
            body: "On the Students page, open the actions menu on a student's row and pick Elective subjects. You see the elective subjects in the student's class, which ones the student takes, and whether the student meets the school rules.",
            href: '/students',
          },
        ],
        faq: [
          {
            q: 'Why is the choices table empty?',
            a: 'No subject in that class is marked as elective yet. Open Subjects chosen by students and mark the subjects first.',
          },
          {
            q: 'Is a student with no tick treated as not taking that subject?',
            a: 'Yes, for subjects marked as elective. A student is only treated as taking the subjects that are ticked.',
          },
          {
            q: 'My change was refused with a notice that choices are locked. What now?',
            a: "The deadline for changing choices has passed. Contact the school's curriculum manager; only they can change them.",
          },
          {
            q: 'My change was refused because the report card is final. What now?',
            a: "Reopen the class's report cards under Report cards, change the choices, then finalize the report cards again.",
          },
          {
            q: 'Does deleting a rule also delete student choices?',
            a: 'No. Rules are only used to check and warn; choices already recorded for students are kept.',
          },
        ],
      },
      su: {
        title: 'Pilihan mata pelajaran',
        summary:
          'Cara nandaan mapel anu ngan dicandak ku murid anu milihna, nyatet pilihan unggal murid, maca pépéling, jeung nyieun aturan sakola.',
        forWho:
          'Wali kelas jeung pangurus pilihan mata pelajaran anu nyatet pilihan murid, sarta admin sakola anu nyieun aturan pilihan.',
        sections: [
          {
            heading: 'Gambaran singget',
            body: 'Di sawaréh sakola, murid teu nyandak sakabéh mata pelajaran: aya mapel pilihan anu ngan dicandak ku murid anu milihna. Kaca Pilihan mapel dipaké pikeun nyatet mapel naon waé anu dicandak unggal murid, terus mariksa naha pilihanana luyu jeung aturan sakola, upamana jumlah mapel anu meunang dipilih. Kaca ieu nyatet pilihan jeung mariksa aturan.',
            tip: 'Sakabéh pamaké anu tiasa ningali data kelas bisa muka kaca ieu. Anu tiasa ngarobah pilihan nyaéta wali kelas rombel éta jeung pangurus pilihan mata pelajaran.',
          },
          {
            heading: 'Nandaan mapel anu dipilih murid',
            body: 'Léngkah kahiji pikeun unggal kelas: tandaan mapel mana anu ngan dicandak ku murid anu milihna. Mapel anu teu ditandaan tetep dicandak ku sakabéh murid di kelas éta. Upami hiji mapel geus boga nilai murid, Anjeun bakal ningali jumlah murid anu geus boga nilai jeung dipenta ngonfirmasi heula.',
            steps: [
              'Buka ménu Pilihan mapel, terus pilih taun ajaran jeung kelas.',
              'Buka bagian Mapel anu dipilih murid.',
              'Centang mapel anu ngan dicandak ku murid anu milihna.',
              'Klik Simpen setélan mapel. Upami aya nilai anu geus aya, baca katerangana terus konfirmasi.',
            ],
            href: '/subject-choices',
            warning:
              'Nilai anu geus aya henteu dipiceun nalika mapel ditandaan salaku pilihan. Nyabut centang ogé henteu mupus pilihan murid anu geus dicatet.',
          },
          {
            heading: 'Nyatet pilihan unggal murid',
            body: 'Sanggeus mapel ditandaan, buka bagian Pilihan murid. Di layar lega, pilihan mucunghul salaku tabel murid jeung mapel; di ponsel, salaku kartu per murid. Centang mapel anu dicandak murid, terus simpen. Handapeun unggal centang aya katerangan asal pilihanana, upamana dipilih langsung atawa diusian tina agama.',
            steps: [
              'Buka bagian Pilihan murid.',
              'Centang mapel anu dicandak unggal murid. Jumlah parobahan muncul dina tombol simpen.',
              'Klik Simpen pilihan.',
              'Baca ringkesan aturan sakola di handap pikeun nempo naha aya murid anu can luyu.',
            ],
            href: '/subject-choices',
            tip: 'Pilihan anu ngan lumaku dina hiji semester ditembongkeun salaku katerangan jeung teu bisa dirobah tina tabel ieu.',
          },
          {
            heading: 'Ngeusian pilihan agama tina data murid',
            body: 'Tombol Eusian pilihan agama tina data murid ngeusian mapel agama luyu jeung agama anu dicatet dina data unggal murid. Sistem teu nebak: murid ngan diusian upami aya pas hiji mapel agama anu cocog di kelas éta. Murid anu teu bisa diusian sacara otomatis ditembongkeun jeung alesanana, upamana agama can dieusian, taya mapel anu cocog, atawa geus milih mapel agama séjén.',
            tip: 'Lengkepan heula data agama murid di kaca Murid supaya leuwih loba murid anu kaeusian sacara otomatis.',
          },
          {
            heading: 'Maca ringkesan pépéling',
            body: 'Ringkesan handapeun tabel nembongkeun murid anu pilihanana kurang atawa leuwih ti anu ditangtukeun ku aturan, murid anu can milih seni atawa agama, jeung aturan anu jumlah mapel ditawarkeunana masih kurang. Semester bisa diganti pikeun nempo kaayaan semester séjén. Pépéling ngan pikeun dipikanyaho: pilihan tetep tiasa disimpen.',
          },
          {
            heading: 'Nyieun aturan sakola',
            body: 'Aturan sakola, ngan katingali ku pangurus pilihan mata pelajaran, nangtukeun sabaraha mapel anu ditawarkeun jeung sabaraha anu meunang dipilih ku murid, per tingkat jeung program. Conto: sakola nawarkeun minimal 7 mapel pilihan, murid milih 4 nepi ka 5. Pilih jenis aturan terus saluyukeun ngaran, wates, jeung mapel anu kaasup.',
            steps: [
              'Buka bagian Aturan sakola dina taun ajaran anu dipilih.',
              'Klik Tambih aturan terus pilih jenisna: mapel pilihan, hiji mapel seni, atawa hiji mapel agama.',
              'Eusian tingkat, wates jumlah, jeung centang mapel anu kaasup aturan ieu.',
              'Klik Simpen. Aturan bisa dirobah atawa dipiceun iraha waé.',
            ],
            href: '/subject-choices',
            tip: 'Sacara baku aturan ngan méré pépéling. Centang Tolak nyimpen ngan upami sakola bener-bener hayang pilihan anu ngalanggar teu bisa disimpen.',
          },
          {
            heading: 'Pilihan anu geus dikonci',
            body: 'Aturan bisa nangtukeun hiji semester salaku wates: sanggeus semester éta dimimitian, pilihan teu bisa dirobah deui. Ngan anu boga idin ngurus kurikulum anu tetep tiasa ngarobahna, sanggeus ngonfirmasi, jeung parobahanana dicatet. Pilihan ogé teu bisa dirobah upami rapor semester anu patali geus difinalkeun; buka deui heula raporna.',
            warning:
              'Nimpa pilihan anu dikonci sakuduna ngan pikeun koréksi anu bener-bener perlu, sabab dicatet atas ngaran Anjeun.',
          },
          {
            heading: 'Absensi per jam pikeun mapel pilihan jeung kelas gabungan',
            body: 'Di Absensi per jam, lembar hiji jam pikeun mapel pilihan ngan ngandung murid anu nyokot mapel éta, sarta itungan "kaeusi" dina kartu jam diitung ti murid-murid éta wungkul. Jam anu euweuh murid nyokotna teu kungsi dianggap can kaeusi di dasbor atawa dina laporan jam can kaeusi. Pikeun patepungan gabungan (sababaraha kelas diajar babarengan jeung hiji guru), kartu jamna dilabélan Gabungan sarta tombolna jadi Eusian babarengan: lembarna mintonkeun murid sakabéh kelas anu gabung, dikelompokkeun per kelas, sarta sakali simpen nuliskeun absensi kana jam kelas masing-masing supados laporan per kelas tetep bener.',
            steps: [
              'Buka Absensi per jam terus pilih tanggalna.',
              'Pikeun patepungan gabungan, klik Eusian babarengan dina salah sahiji kartu anu dilabélan Gabungan.',
              'Tandaan status unggal murid terus klik Simpen.',
            ],
            href: '/lessons',
            tip: 'Sakola anu teu makéna mapel pilihan atawa kelas gabungan teu nempo parobahan: hiji jam tetep eusina sakabéh murid kelasna.',
            warning:
              'Absensi gabungan ditolak upami rapor salah saurang murid dina semester éta geus final. Buka deui rapor kelasna heula.',
          },
          {
            heading: 'Pilihan mapel dina taun ajaran anyar',
            body: 'Nalika Nyalin taun ajaran, tanda mapel pilihan unggal kelas milu disalin ka kelas hasil salinan (kelas tujuan anu geus boga tanda henteu dirobah). Nalika Nerapkeun kaputusan kanaékan, pilihan mapel sataun murid anu naék atawa lungguh kelas dibawa ka taun tujuan upami kelas tujuanna ogé nandaan mapel éta salaku pilihan; hasilna nunjukkeun sabaraha pilihan anu dibawa jeung anu henteu dibawa. Pilihan per semester henteu dibawa, sarta panempatan murid ka kelas tujuan teu merhatikeun pilihan: pilih kelas tujuan sorangan upami kelas dibentuk per pakét pilihan.',
            href: '/promotion',
            tip: 'Murid kelas X can boga pilihan pikeun dibawa; pilihanana diaranan anyar di kelas XI.',
            warning: 'Pilihan anu henteu dibawa kudu diisi deui dina tab Mapel jeung pamilon kelas tujuan.',
          },
          {
            heading: 'Jadwal paralel jeung kelas gabungan',
            body: 'Mapel pilihan mindeng jalan babarengan: murid anu milih Fisika diajar di hiji rohangan sedengkeun anu milih Kimia di rohangan sejen dina jam anu sarua. Di kaca Jadwal pelajaran, buka sél kelas terus klik Tambih jalur paralel pikeun nempatkeun mapel pilihan sejen dina jam anu sarua; unggal jalur boga guru pangampuna sorangan. Jalur paralel ngan bisa dieusi mapel anu geus ditandaan salaku pilihan di kelas éta, sarta hiji guru tetep teu bisa ngajar dua jalur dina jam anu sarua. Upami hiji guru ngajar mapel pilihan anu sarua pikeun sababaraha kelas sakaligus (kelas gabungan), centang Patepungan gabungan jeung kelas sejen dina sél éta terus pilih kelas sejen anu jamna sarua; guru teu dianggap bentrok pikeun patepungan gabungan éta.',
            steps: [
              'Tandaan heula mapelna salaku pilihan di kelas (bagian Mapel anu dipilih murid).',
              'Buka Jadwal pelajaran, pilih kelas, terus klik sél jam anu dipikahoyong.',
              'Pikeun jalur sejen dina jam anu sarua, klik Tambih jalur paralel dina sél éta terus pilih mapel pilihan saterusna.',
              'Pikeun kelas gabungan, centang Patepungan gabungan jeung kelas sejen, pilih kelas anu geus ngeusi mapel éta (atawa mimitian patepungan anyar), terus simpen.',
            ],
            href: '/schedule',
            tip: 'Sakola anu teu makéna jalur paralel atawa kelas gabungan teu nempo parobahan naon waé: hiji jam tetep hiji mapel per kelas.',
            warning:
              'Ngosongkeun sél ngan ngahapus jalurna. Absensi per jam pikeun patepungan gabungan tetep dicatet per sél kelas masing-masing.',
          },
          {
            heading: 'Nempo pilihan hiji murid',
            body: 'Di kaca Murid, buka ménu tindakan dina baris murid terus pilih Mapel pilihan. Anjeun nempo mapel pilihan di kelasna, mana anu dicandak, jeung naha murid éta geus luyu jeung aturan sakola.',
            href: '/students',
          },
        ],
        faq: [
          {
            q: 'Naha tabel pilihan kosong?',
            a: 'Can aya mapel anu ditandaan salaku pilihan di kelas éta. Buka Mapel anu dipilih murid terus tandaan mapelna heula.',
          },
          {
            q: 'Naha murid anu can dicentang dianggap teu nyandak mapel éta?',
            a: 'Enya, pikeun mapel anu ditandaan salaku pilihan. Murid ngan dianggap nyandak mapel anu dicentang.',
          },
          {
            q: 'Parobahan ditolak jeung aya katerangan yén pilihan dikonci. Kumaha?',
            a: 'Wates waktu ngarobah pilihan geus kaliwat. Hubungi pangurus kurikulum sakola; ngan maranéhna anu tiasa ngarobahna.',
          },
          {
            q: 'Parobahan ditolak sabab rapor geus final. Kumaha?',
            a: 'Buka deui rapor kelas éta dina ménu Rapor, robah pilihanana, terus finalkeun deui raporna.',
          },
          {
            q: 'Naha mupus aturan ogé mupus pilihan murid?',
            a: 'Henteu. Aturan ngan dipaké pikeun mariksa jeung méré pépéling; pilihan murid anu geus dicatet tetep disimpen.',
          },
        ],
      },
    },
  },
  {
    slug: 'ledger',
    icon: 'file',
    tone: 'teal',
    group: 'academic',
    module: 'grades',
    text: {
      id: {
        title: 'Legger kelas',
        summary:
          'Cara membuka legger satu kelas, membaca nilai dan statusnya, serta mengunduhnya ke Excel atau mencetaknya.',
        forWho:
          'Wali kelas, kepala sekolah, dan pengelola kurikulum atau rapor yang perlu melihat nilai seluruh siswa satu kelas dalam satu lembar.',
        sections: [
          {
            heading: 'Gambaran singkat',
            body: 'Legger adalah daftar nilai akhir seluruh siswa satu kelas dalam satu semester: satu baris per siswa, satu kolom per mata pelajaran, lengkap dengan rata-rata, peringkat (bila sekolah menampilkannya), jumlah sakit, izin, dan alpa, serta status rapornya. Angkanya diambil dari data rapor yang sama, jadi selalu cocok dengan rapor siswa.',
            href: '/report-cards/ledger',
            tip: 'Buka dari tombol Legger di halaman Rapor, atau langsung dari alamat halamannya.',
          },
          {
            heading: 'Membuka legger',
            body: 'Pilih semester dan kelas. Di layar lebar, legger tampil sebagai tabel dengan nama siswa yang tetap terlihat saat tabel digeser ke samping. Di ponsel dan tablet kecil, setiap siswa tampil sebagai kartu sehingga halaman tidak perlu digeser.',
            steps: [
              'Buka menu Rapor, lalu klik Legger. Anda juga bisa membuka halaman Legger langsung.',
              'Pilih semester dan kelas.',
              'Baca nilai tiap mata pelajaran, rata-rata, dan status rapor siswa.',
            ],
            href: '/report-cards/ledger',
          },
          {
            heading: 'Status final dan draf',
            body: 'Siswa berstatus Final memakai angka yang sudah dibekukan saat rapor difinalkan, sehingga tidak berubah walau nilai di buku nilai diubah kemudian. Siswa berstatus Draf dihitung dari nilai terkini dan masih bisa berubah sampai rapornya difinalkan.',
            warning: 'Sebelum mencetak untuk keperluan resmi, pastikan semua siswa sudah berstatus Final.',
          },
          {
            heading: 'Mata pelajaran yang tidak diambil',
            body: 'Pada sekolah yang memakai mata pelajaran pilihan, siswa tidak mengambil semua mapel. Sel mapel yang tidak diambil siswa ditandai garis panjang dengan keterangan Tidak mengambil mapel ini, dan tidak ikut dihitung dalam rata-rata. Tanda strip pendek berarti nilainya belum ada. Angka berwarna merah berarti di bawah KKM.',
          },
          {
            heading: 'Siswa pindah dan lulusan',
            body: 'Daftar siswa mengikuti daftar pada halaman Rapor: siswa aktif, lulusan tahun itu, serta siswa yang pindah atau keluar sesudah semester itu berakhir tetap tampil, sehingga legger semester lama tetap lengkap.',
          },
          {
            heading: 'Mengunduh ke Excel',
            body: 'Klik Unduh Excel untuk menyimpan legger sebagai berkas Excel yang bisa diolah lebih lanjut. Nilai tersimpan sebagai angka, dan NIS tersimpan sebagai teks agar angka nol di depannya tidak hilang.',
            steps: [
              'Pilih semester dan kelas.',
              'Klik Unduh Excel.',
              'Buka berkas yang terunduh di Excel atau aplikasi lembar kerja lain.',
            ],
            href: '/report-cards/ledger',
          },
          {
            heading: 'Mencetak atau menyimpan sebagai PDF',
            body: 'Klik Cetak / PDF untuk membuka jendela cetak dengan kertas melintang. Untuk mendapatkan berkas PDF, pilih Simpan sebagai PDF pada pilihan printer.',
            tip: 'Pada pengaturan cetak, matikan Header dan footer bila ingin hasil yang lebih bersih.',
          },
          {
            heading: 'Kelas dengan rapor deskriptif',
            body: 'Bila kelas memakai rapor deskriptif, legger tetap menampilkan angka, tetapi hanya untuk staf sekolah. Sebuah catatan muncul di halaman dan di hasil cetak sebagai pengingat agar angka ini tidak dibagikan kepada orang tua atau wali.',
          },
          {
            heading: 'Siapa yang dapat melihat',
            body: 'Pemegang izin kelola rapor, kepala sekolah, dan kurikulum dapat melihat legger semua kelas. Wali kelas hanya dapat melihat legger kelas yang diampunya.',
          },
        ],
        faq: [
          {
            q: 'Mengapa sebagian siswa berstatus Draf?',
            a: 'Rapor siswa itu belum difinalkan. Finalkan rapor kelas di halaman Rapor agar angkanya dibekukan.',
          },
          {
            q: 'Mengapa angka di legger berbeda dengan buku nilai?',
            a: 'Siswa berstatus Final memakai angka saat rapor difinalkan. Bila nilai diubah sesudahnya, buka kembali rapor kelas lalu finalkan lagi agar angka baru ikut.',
          },
          {
            q: 'Mengapa ada siswa yang sel mapelnya bertanda garis?',
            a: 'Siswa itu tidak mengambil mata pelajaran tersebut. Pilihan siswa diatur di halaman Pilihan mapel.',
          },
          {
            q: 'Mengapa kolom peringkat tidak ada?',
            a: 'Peringkat hanya tampil bila pengaturan rapor sekolah menampilkan peringkat.',
          },
        ],
      },
      en: {
        title: 'Class ledger',
        summary:
          'How to open the ledger of a class, read its grades and status, and download it to Excel or print it.',
        forWho:
          'Homeroom teachers, principals, and curriculum or report card managers who need the grades of a whole class on one sheet.',
        sections: [
          {
            heading: 'Overview',
            body: "The ledger lists the final grades of every student in a class for one semester: one row per student, one column per subject, with the average, the rank (when the school shows it), the number of sick, excused, and absent days, and the report card status. The figures come from the same data as the report cards, so they always match a student's report card.",
            href: '/report-cards/ledger',
            tip: 'Open it with the Ledger button on the Report cards page, or go to the page directly.',
          },
          {
            heading: 'Opening the ledger',
            body: 'Choose a semester and a class. On wide screens the ledger is a table where the student name stays visible while you scroll sideways. On phones and small tablets each student appears as a card, so the page never needs to scroll sideways.',
            steps: [
              'Open Report cards, then click Ledger. You can also open the Ledger page directly.',
              'Choose a semester and a class.',
              'Read each subject grade, the average, and the report card status of each student.',
            ],
            href: '/report-cards/ledger',
          },
          {
            heading: 'Final and draft status',
            body: 'A student marked Final uses the figures frozen when the report card was finalized, so they do not change even if grades are edited later. A student marked Draft is calculated from the latest grades and can still change until the report card is finalized.',
            warning: 'Before printing for official use, make sure every student is marked Final.',
          },
          {
            heading: 'Subjects a student does not take',
            body: 'In schools with elective subjects, students do not take every subject. A subject cell the student does not take shows a long dash labelled Does not take this subject, and it is left out of the average. A short dash means there is no grade yet. A red number is below the pass mark.',
          },
          {
            heading: 'Students who moved and graduates',
            body: "The list of students follows the list on the Report cards page: active students, that year's graduates, and students who moved or left after that semester ended are still shown, so the ledger of an old semester stays complete.",
          },
          {
            heading: 'Downloading to Excel',
            body: 'Click Download Excel to save the ledger as an Excel file you can work with further. Grades are saved as numbers, and the student ID is saved as text so leading zeros are kept.',
            steps: [
              'Choose a semester and a class.',
              'Click Download Excel.',
              'Open the downloaded file in Excel or another spreadsheet app.',
            ],
            href: '/report-cards/ledger',
          },
          {
            heading: 'Printing or saving as PDF',
            body: 'Click Print / PDF to open the print window with the paper in landscape. To get a PDF file, choose Save as PDF as the printer.',
            tip: 'In the print settings, turn off Headers and footers for a cleaner result.',
          },
          {
            heading: 'Classes with descriptive report cards',
            body: 'If the class uses descriptive report cards, the ledger still shows the numbers, but only for school staff. A note appears on the page and on the printout as a reminder not to share these numbers with parents or guardians.',
          },
          {
            heading: 'Who can see it',
            body: 'Holders of the report card management permission, the principal, and the curriculum team can see the ledger of every class. A homeroom teacher can only see the ledger of the class they lead.',
          },
        ],
        faq: [
          {
            q: 'Why are some students marked Draft?',
            a: 'Their report card has not been finalized yet. Finalize the class on the Report cards page to freeze the figures.',
          },
          {
            q: 'Why do the ledger figures differ from the grade book?',
            a: 'Students marked Final use the figures from when the report card was finalized. If grades were edited afterwards, reopen the class report cards and finalize them again so the new figures are included.',
          },
          {
            q: 'Why does a subject cell show a dash for some students?',
            a: 'That student does not take that subject. Student choices are managed on the Subject choices page.',
          },
          {
            q: 'Why is there no rank column?',
            a: "The rank only appears when the school's report card settings show the rank.",
          },
        ],
      },
      su: {
        title: 'Legger kelas',
        summary:
          'Cara muka legger sakelas, maca nilai jeung statusna, sarta ngundeur ka Excel atawa nyitakna.',
        forWho:
          'Wali kelas, kepala sakola, jeung pangurus kurikulum atawa rapor anu perlu ningali nilai sakabéh murid sakelas dina hiji lambar.',
        sections: [
          {
            heading: 'Gambaran singget',
            body: 'Legger téh daptar nilai ahir sakabéh murid sakelas dina sasemester: hiji baris per murid, hiji kolom per mata pelajaran, lengkep jeung rata-rata, peringkat (lamun sakola nampilkeunana), jumlah gering, idin, jeung alpa, sarta status raporna. Angkana dicokot tina data rapor anu sarua, jadi salawasna cocog jeung rapor murid.',
            href: '/report-cards/ledger',
            tip: 'Buka tina tombol Legger di kaca Rapor, atawa langsung tina alamat kacana.',
          },
          {
            heading: 'Muka legger',
            body: 'Pilih semester jeung kelas. Dina layar lega, legger tampil salaku tabel jeung ngaran murid tetep katingali basa tabelna digeser ka gigir. Dina HP jeung tablét leutik, tiap murid tampil salaku kartu supaya kacana teu kudu digeser.',
            steps: [
              'Buka ménu Rapor, terus klik Legger. Anjeun ogé bisa muka kaca Legger langsung.',
              'Pilih semester jeung kelas.',
              'Baca nilai unggal mata pelajaran, rata-rata, jeung status rapor murid.',
            ],
            href: '/report-cards/ledger',
          },
          {
            heading: 'Status final jeung rarancang',
            body: 'Murid anu statusna Final maké angka anu geus dibekukeun basa raporna difinalkeun, jadi teu robah sanajan nilai di buku nilai dirobah satuluyna. Murid anu statusna Rarancang diitung tina nilai panganyarna sarta masih bisa robah nepi ka raporna difinalkeun.',
            warning: 'Samemeh nyitak pikeun kaperluan resmi, pastikeun sakabéh murid geus statusna Final.',
          },
          {
            heading: 'Mata pelajaran anu teu dicandak',
            body: 'Di sakola anu maké mata pelajaran pilihan, murid teu nyandak sakabéh mapel. Sél mapel anu teu dicandak murid dibéré tanda garis panjang jeung kalimah Teu nyandak mapel ieu, sarta teu diitung dina rata-rata. Garis pondok hartina nilaina can aya. Angka beureum hartina handapeun KKM.',
          },
          {
            heading: 'Murid pindah jeung lulusan',
            body: 'Daptar murid nuturkeun daptar di kaca Rapor: murid aktif, lulusan taun éta, jeung murid anu pindah atawa kaluar sanggeus semesterna réngsé tetep tampil, jadi legger semester heubeul tetep lengkep.',
          },
          {
            heading: 'Ngundeur ka Excel',
            body: 'Klik Undeur Excel pikeun nyimpen legger salaku berkas Excel anu bisa diolah deui. Nilai disimpen salaku angka, jeung NIS disimpen salaku téks supaya nol di hareupna teu leungit.',
            steps: [
              'Pilih semester jeung kelas.',
              'Klik Undeur Excel.',
              'Buka berkas anu diundeur dina Excel atawa aplikasi lambar kerja séjén.',
            ],
            href: '/report-cards/ledger',
          },
          {
            heading: 'Nyitak atawa nyimpen salaku PDF',
            body: 'Klik Citak / PDF pikeun muka jandéla citak jeung kartas ngalegana. Pikeun meunangkeun berkas PDF, pilih Simpen salaku PDF dina pilihan printer.',
            tip: 'Dina setélan citak, pareuman Header jeung footer lamun hayang hasil anu leuwih bersih.',
          },
          {
            heading: 'Kelas jeung rapor déskriptif',
            body: 'Lamun kelas maké rapor déskriptif, legger tetep nembongkeun angka, tapi ngan keur staf sakola. Aya catetan di kaca jeung dina hasil citak salaku pépéling supaya angka ieu ulah dibagikeun ka kolot atawa wali.',
          },
          {
            heading: 'Saha anu bisa ningali',
            body: 'Nu boga idin ngokolakeun rapor, kepala sakola, jeung kurikulum bisa ningali legger sakabéh kelas. Wali kelas ngan bisa ningali legger kelas anu diwalikeunana.',
          },
        ],
        faq: [
          {
            q: 'Naha sawaréh murid statusna Rarancang?',
            a: 'Raporna can difinalkeun. Finalkeun rapor kelas di kaca Rapor supaya angkana dibekukeun.',
          },
          {
            q: 'Naha angka di legger béda jeung buku nilai?',
            a: 'Murid anu statusna Final maké angka basa raporna difinalkeun. Lamun nilai dirobah sanggeusna, buka deui rapor kelas terus finalkeun deui supaya angka anyar milu.',
          },
          {
            q: 'Naha sél mapel sawaréh murid dibéré garis?',
            a: 'Murid éta teu nyandak mata pelajaran éta. Pilihan murid diatur di kaca Pilihan mapel.',
          },
          {
            q: 'Naha euweuh kolom peringkat?',
            a: 'Peringkat ngan tampil lamun setélan rapor sakola nampilkeun peringkat.',
          },
        ],
      },
    },
  },
  {
    slug: 'council-minutes',
    icon: 'file',
    tone: 'teal',
    group: 'academic',
    text: {
      id: {
        title: 'Berita acara musyawarah dan tinggal kelas di tingkat akhir',
        summary:
          'Cara mencatat hasil musyawarah dewan pendidik, menautkan keputusan siswa, mencetaknya, dan menempatkan siswa tingkat akhir yang tinggal kelas.',
        forWho:
          'Wakil kepala sekolah bidang kurikulum, admin sekolah, kepala sekolah, dan wali kelas yang menyusun atau membaca berita acara kenaikan kelas.',
        sections: [
          {
            heading: 'Gambaran singkat',
            body: 'Berita acara mencatat hasil rapat dewan pendidik: tanggal, tempat, agenda, peserta, ringkasan keputusan, serta daftar siswa yang tinggal kelas beserta alasan dan tindak lanjutnya. Daftar dan jumlah naik, tinggal, dan lulus diambil otomatis dari keputusan siswa yang Anda tautkan, jadi tidak perlu mengetik ulang.',
            href: '/promotion/minutes',
            tip: 'Buka dari tombol Berita acara di halaman Kenaikan kelas.',
          },
          {
            heading: 'Membuat berita acara',
            body: 'Berita acara dibuat per tahun ajaran. Pilih jenis rapat, tanggal, kelas bila rapatnya khusus satu kelas, lalu tambahkan peserta: pilih guru dari daftar atau tulis nama sendiri, dan isi jabatannya.',
            steps: [
              'Buka Kenaikan kelas, lalu klik Berita acara.',
              'Pilih tahun ajaran, lalu klik Buat berita acara.',
              'Isi tanggal, tempat, agenda, dan peserta, lalu simpan.',
            ],
            href: '/promotion/minutes',
          },
          {
            heading: 'Menautkan keputusan siswa',
            body: 'Tautan menunjukkan keputusan siswa mana yang dibahas dalam rapat. Ada dua cara: di langkah Keputusan siswa pada halaman Kenaikan kelas, pilih berita acara pada catatan keputusan siswa (atau untuk satu kelas sekaligus); atau buka berita acara dan centang siswanya. Menautkan tidak mengubah keputusan siswa, dan tanggal musyawarah siswa mengikuti tanggal berita acara.',
            href: '/promotion',
            tip: 'Tombol Pilih semua yang tinggal kelas mencentang siswa yang tinggal kelas dengan sekali klik.',
          },
          {
            heading: 'Memfinalkan dan membuka kembali',
            body: 'Setelah rapat selesai dan datanya benar, finalkan berita acara. Rekap keputusan dibekukan, dan berita acara serta keputusan siswa yang tertaut tidak bisa diubah. Bila ada koreksi, buka kembali berita acaranya, ubah, lalu finalkan lagi.',
            warning:
              'Keputusan siswa yang tertaut ke berita acara final tampil terkunci di langkah Keputusan siswa sampai berita acaranya dibuka kembali.',
          },
          {
            heading: 'Mencetak atau menyimpan sebagai PDF',
            body: 'Buka berita acara lalu klik Cetak / PDF. Hasil cetak memuat identitas rapat, daftar peserta dengan kolom tanda tangan, rekap keputusan per kelas, daftar siswa tinggal kelas beserta alasan dan tindak lanjutnya, ringkasan, dan tempat tanda tangan ketua serta sekretaris. Untuk berkas PDF, pilih Simpan sebagai PDF pada pilihan printer.',
            tip: 'Berita acara yang masih draf tetap bisa dicetak, dan hasil cetaknya diberi catatan bahwa belum final.',
          },
          {
            heading: 'Siswa tingkat akhir yang tinggal kelas',
            body: 'Siswa kelas tingkat akhir yang diputuskan tinggal kelas ditempatkan di kelas tingkat akhir tahun ajaran berikutnya. Ada dua cara menyiapkannya. Pertama, putuskan tinggal kelas lebih dulu lalu jalankan Salin tahun ajaran: kelas tingkat akhir ikut disalin bila ada siswa yang tinggal di dalamnya. Kedua, di langkah Keputusan siswa pilih sendiri kelas tujuannya dari daftar kelas tahun tujuan. Bila dibiarkan otomatis dan kelasnya belum ada, siswa itu dilaporkan belum tertempatkan pada pratinjau penerapan, tanpa menggagalkan siswa lain.',
            href: '/promotion',
            warning:
              'Pendaftaran siswa di tahun lama tidak dihapus, jadi riwayat kelas dan nilai tahun lama tetap utuh.',
          },
          {
            heading: 'Siapa yang dapat melihat dan mengubah',
            body: 'Pemegang izin kelola kenaikan kelas dapat membuat, mengubah, menautkan, memfinalkan, membuka kembali, dan menghapus berita acara. Kepala sekolah dan pemegang izin melihat semua rapor dapat membaca dan mencetaknya.',
          },
        ],
        faq: [
          {
            q: 'Mengapa tombol Ubah atau Hapus tidak ada?',
            a: 'Berita acara sudah final, atau akun Anda hanya boleh membaca. Buka kembali berita acara final lebih dulu bila perlu mengubahnya.',
          },
          {
            q: 'Mengapa keputusan siswa tidak bisa diubah?',
            a: 'Keputusan itu tertaut ke berita acara final. Buka kembali berita acaranya di halaman Berita acara.',
          },
          {
            q: 'Apakah menghapus berita acara menghapus keputusan siswa?',
            a: 'Tidak. Hanya berita acara dan daftar pesertanya yang dihapus; keputusan siswa tetap ada tanpa tautan.',
          },
          {
            q: 'Siswa yang tinggal kelas belum punya kelas tujuan. Bagaimana?',
            a: 'Pilih kelas tujuannya di langkah Keputusan siswa, atau jalankan Salin tahun ajaran lagi setelah keputusan tinggal kelas tersimpan, atau buat kelasnya di menu Kelas.',
          },
        ],
      },
      en: {
        title: 'Meeting minutes and repeating the final year',
        summary:
          'How to record the outcome of the teachers council meeting, link student decisions, print the minutes, and place final-year students who repeat the year.',
        forWho:
          'Vice principals for curriculum, school admins, principals, and homeroom teachers who prepare or read the promotion meeting minutes.',
        sections: [
          {
            heading: 'Overview',
            body: 'The minutes record the outcome of the teachers council meeting: date, place, agenda, attendees, a summary of decisions, and the list of students who repeat the year with their reasons and follow-up. The numbers of students promoted, repeating, and graduating, and the list of repeaters, are taken automatically from the student decisions you link, so nothing needs to be typed again.',
            href: '/promotion/minutes',
            tip: 'Open it with the Meeting minutes button on the Promotion page.',
          },
          {
            heading: 'Creating minutes',
            body: 'Minutes are made per school year. Choose the meeting type, the date, and a class if the meeting was only about one class, then add the attendees: pick a teacher from the list or type a name, and fill in the position.',
            steps: [
              'Open Promotion, then click Meeting minutes.',
              'Choose the school year, then click Create minutes.',
              'Fill in the date, place, agenda, and attendees, then save.',
            ],
            href: '/promotion/minutes',
          },
          {
            heading: 'Linking student decisions',
            body: "A link shows which student decisions were discussed at the meeting. There are two ways: in the Student decisions step of the Promotion page, choose the minutes in the student's decision notes (or for a whole class at once); or open the minutes and tick the students. Linking does not change the student decision, and the student's meeting date follows the date of the minutes.",
            href: '/promotion',
            tip: 'The Select everyone repeating the year button ticks all repeating students in one click.',
          },
          {
            heading: 'Finalizing and reopening',
            body: 'When the meeting is over and the data is right, finalize the minutes. The summary of decisions is frozen, and the minutes and the linked student decisions can no longer be changed. If something needs correcting, reopen the minutes, edit them, and finalize again.',
            warning:
              'Student decisions linked to final minutes appear locked in the Student decisions step until the minutes are reopened.',
          },
          {
            heading: 'Printing or saving as PDF',
            body: 'Open the minutes and click Print / PDF. The printout has the meeting details, the attendee list with a signature column, the summary of decisions per class, the list of repeating students with reasons and follow-up, the summary, and places for the chair and the secretary to sign. For a PDF file, choose Save as PDF in the printer options.',
            tip: 'Draft minutes can be printed too, and the printout carries a note that they are not final yet.',
          },
          {
            heading: 'Final-year students who repeat',
            body: 'Final-year students who are decided to repeat the year are placed in a final-year class of the next school year. There are two ways to prepare it. First, decide the repeat first and then run Copy school year: final-year classes are copied when a student in them repeats. Second, in the Student decisions step, choose the target class yourself from the classes of the target year. If it is left automatic and the class does not exist yet, the student is reported as not yet placed in the apply preview, without failing the other students.',
            href: '/promotion',
            warning:
              "The student's enrolment in the old year is not deleted, so the class and grade history of the old year stays intact.",
          },
          {
            heading: 'Who can view and edit',
            body: 'People who manage promotion can create, edit, link, finalize, reopen, and delete minutes. Principals and people who can view all report cards can read and print them.',
          },
        ],
        faq: [
          {
            q: 'Why are the Edit or Delete buttons missing?',
            a: 'The minutes are final, or your account can only read. Reopen final minutes first if you need to change them.',
          },
          {
            q: 'Why can a student decision not be changed?',
            a: 'The decision is linked to final minutes. Reopen the minutes on the Meeting minutes page.',
          },
          {
            q: 'Does deleting the minutes delete the student decisions?',
            a: 'No. Only the minutes and their attendee list are deleted; the student decisions stay, without the link.',
          },
          {
            q: 'A student who repeats has no target class yet. What now?',
            a: 'Choose the target class in the Student decisions step, or run Copy school year again after the repeat decisions are saved, or create the class in the Classes menu.',
          },
        ],
      },
      su: {
        title: 'Berita acara musyawarah jeung tinggal kelas di tingkat ahir',
        summary:
          'Cara nyatet hasil musyawarah déwan guru, numbu kaputusan siswa, nyitak berita acara, jeung nempatkeun siswa tingkat ahir anu tinggal kelas.',
        forWho:
          'Wakil kepala sakola bidang kurikulum, admin sakola, kepala sakola, jeung wali kelas anu nyusun atawa maca berita acara naékna kelas.',
        sections: [
          {
            heading: 'Gambaran singgetna',
            body: 'Berita acara nyatet hasil rapat déwan guru: tanggal, tempat, agenda, pamilon, ringkesan kaputusan, jeung daptar siswa anu tinggal kelas sarta alesan jeung tindak lanjutna. Jumlah naék, tinggal, jeung lulus sarta daptar anu tinggal kelas dicokot otomatis tina kaputusan siswa anu Anjeun tumbu, jadi teu kudu ngetik deui.',
            href: '/promotion/minutes',
            tip: 'Buka tina tombol Berita acara di kaca Naékna kelas.',
          },
          {
            heading: 'Nyieun berita acara',
            body: 'Berita acara dijieun per taun pangajaran. Pilih jenis rapat, tanggal, jeung kelas lamun rapatna husus hiji kelas, tuluy tambahkeun pamilon: pilih guru tina daptar atawa tulis ngaran sorangan, jeung eusian jabatanna.',
            steps: [
              'Buka Naékna kelas, tuluy klik Berita acara.',
              'Pilih taun pangajaran, tuluy klik Jieun berita acara.',
              'Eusian tanggal, tempat, agenda, jeung pamilon, tuluy simpen.',
            ],
            href: '/promotion/minutes',
          },
          {
            heading: 'Numbu kaputusan siswa',
            body: 'Tumbu nunjukkeun kaputusan siswa mana anu dibahas dina rapat. Aya dua cara: dina léngkah Kaputusan siswa di kaca Naékna kelas, pilih berita acara dina catetan kaputusan siswa (atawa pikeun sakelas sakaligus); atawa buka berita acara tuluy centang siswana. Numbu teu ngarobah kaputusan siswa, jeung tanggal musyawarah siswa nurutan tanggal berita acara.',
            href: '/promotion',
            tip: 'Tombol Pilih sakabéh anu tinggal kelas nyentang siswa anu tinggal kelas ku sakali klik.',
          },
          {
            heading: 'Nyieun final jeung muka deui',
            body: 'Sanggeus rapat réngsé jeung datana bener, finalkeun berita acara. Rékap kaputusan dibekukeun, jeung berita acara sarta kaputusan siswa anu numbu teu bisa dirobah. Lamun aya koréksi, buka deui berita acarana, robah, tuluy finalkeun deui.',
            warning:
              'Kaputusan siswa anu numbu ka berita acara final katémbong dikonci dina léngkah Kaputusan siswa nepi ka berita acarana dibuka deui.',
          },
          {
            heading: 'Nyitak atawa nyimpen salaku PDF',
            body: 'Buka berita acara tuluy klik Citak / PDF. Hasil citakna eusina idéntitas rapat, daptar pamilon jeung kolom tanda tangan, rékap kaputusan per kelas, daptar siswa tinggal kelas sarta alesan jeung tindak lanjutna, ringkesan, jeung tempat tanda tangan ketua sarta sekretaris. Pikeun berkas PDF, pilih Simpen salaku PDF dina pilihan printer.',
            tip: 'Berita acara anu masih rarancang oge bisa dicitak, jeung hasil citakna dibéré catetan yén can final.',
          },
          {
            heading: 'Siswa tingkat ahir anu tinggal kelas',
            body: 'Siswa kelas tingkat ahir anu diputuskeun tinggal kelas dititipkeun dina kelas tingkat ahir taun pangajaran satuluyna. Aya dua cara nyiapkeunana. Kahiji, putuskeun tinggal kelas heula tuluy jalankeun Salin taun pangajaran: kelas tingkat ahir milu disalin lamun aya siswa anu tinggal di jerona. Kadua, dina léngkah Kaputusan siswa pilih sorangan kelas tujuanana tina daptar kelas taun tujuan. Lamun diantep otomatis jeung kelasna can aya, éta siswa dilaporkeun can ditempatkeun dina pratayang panerapan, tanpa ngagagalkeun siswa séjén.',
            href: '/promotion',
            warning:
              'Pendaptaran siswa di taun heubeul teu dihapus, jadi jujutan kelas jeung nilai taun heubeul tetep utuh.',
          },
          {
            heading: 'Saha anu bisa nempo jeung ngarobah',
            body: 'Anu boga idin ngatur naékna kelas bisa nyieun, ngarobah, numbu, nyieun final, muka deui, jeung ngahapus berita acara. Kepala sakola jeung anu boga idin nempo sakabéh rapor bisa maca jeung nyitakna.',
          },
        ],
        faq: [
          {
            q: 'Naha tombol Robah atawa Hapus teu aya?',
            a: 'Berita acarana geus final, atawa akun Anjeun ngan bisa maca. Buka deui berita acara final heula lamun kudu ngarobahna.',
          },
          {
            q: 'Naha kaputusan siswa teu bisa dirobah?',
            a: 'Kaputusan éta numbu ka berita acara final. Buka deui berita acarana di kaca Berita acara.',
          },
          {
            q: 'Naha ngahapus berita acara ogé ngahapus kaputusan siswa?',
            a: 'Henteu. Ngan berita acara jeung daptar pamilonna anu dihapus; kaputusan siswa tetep aya tanpa tumbu.',
          },
          {
            q: 'Siswa anu tinggal kelas can boga kelas tujuan. Kumaha?',
            a: 'Pilih kelas tujuanana dina léngkah Kaputusan siswa, atawa jalankeun Salin taun pangajaran deui sanggeus kaputusan tinggal kelas disimpen, atawa jieun kelasna dina ménu Kelas.',
          },
        ],
      },
    },
  },
  {
    slug: 'graduation',
    icon: 'graduation',
    tone: 'violet',
    group: 'academic',
    module: 'grades',
    text: {
      id: {
        title: 'Kelulusan: kriteria, ujian sekolah, penetapan, dan surat keterangan lulus',
        summary:
          'Cara mengatur kriteria kelulusan, mencatat nilai ujian sekolah, menetapkan kelulusan murid kelas akhir, memberi nomor, dan mencetak surat keterangan lulus.',
        forWho:
          'Wakil kepala sekolah bidang kurikulum, admin sekolah, dan operator yang mengurus kelulusan; kepala sekolah dapat melihat hasilnya.',
        sections: [
          {
            heading: 'Gambaran singkat',
            body: 'Kelulusan ditetapkan oleh sekolah setelah ujian sekolah dan pertimbangan nilai rapor. Edusync hanya memberi saran angka dari kriteria yang Anda atur, lalu mencatat keputusan sekolah dengan nilai yang dibekukan. Bila tahun ajaran belum punya kriteria kelulusan, kenaikan kelas berjalan seperti biasa dan halaman ini tidak dipakai.',
            href: '/promotion/graduation',
            tip: 'Buka dari tombol Kelulusan di halaman Kenaikan kelas, atau dari menu samping.',
          },
          {
            heading: 'Mengatur kriteria',
            body: 'Di tab Kriteria, tentukan bobot nilai rapor dan bobot tiap ujian sekolah. Jumlah bobot tidak harus 100; yang dipakai adalah porsinya. Pilih rapor yang dipakai (tahun terakhir saja, semua rapor yang sudah final, atau tingkat tertentu), pembulatan, rata-rata minimal, nilai minimal mapel wajib, dan daftar mapel wajib. Ambang hanya menjadi saran: murid di bawah ambang ditandai, tetapi sekolah tetap yang menetapkan. Isi juga templat nomor surat keterangan lulus bila ingin dibuat otomatis.',
            steps: [
              'Tambahkan dulu ujian sekolah di tab Ujian sekolah bila ingin memberinya bobot.',
              'Buka tab Kriteria dan isi bobot, ambang, serta teks kriteria.',
              'Tulis templat nomor, misalnya nomor urut tiga angka diikuti tahun kelulusan; contoh hasilnya tampil di bawah kolom.',
              'Klik Simpan kriteria.',
            ],
            href: '/promotion/graduation',
            warning:
              'Kriteria dan nilai ujian terkunci setelah ada murid yang ditetapkan final. Buka kembali penetapan murid itu bila perlu mengubahnya.',
          },
          {
            heading: 'Mencatat nilai ujian sekolah',
            body: 'Di tab Ujian sekolah, tambahkan ujian (nama dan bentuknya bebas), lalu isi nilainya per mata pelajaran untuk tiap murid kelas akhir. Anda bisa mengetik satu per satu, atau menempel dari spreadsheet: satu murid per baris berisi NIS atau nama persis, lalu nilai 0 sampai 100. Hasil tempel ditampilkan lebih dulu di daftar dan baru tersimpan saat Anda menekan Simpan nilai.',
            href: '/promotion/graduation',
            tip: 'Baris yang NIS atau namanya tidak ditemukan dilaporkan di bawah kotak tempel supaya mudah diperbaiki.',
          },
          {
            heading: 'Melihat saran dan menetapkan',
            body: 'Tab Penetapan menampilkan murid kelas akhir dengan rata-rata nilai kelulusan, penanda rapor belum final atau nilai belum lengkap, dan keputusannya. Nilai rapor hanya diambil dari rapor yang sudah final. Buka seorang murid untuk melihat nilai tiap mata pelajaran, memilih hasil (lulus, tidak lulus, atau ditunda), mengisi tanggal kelulusan, memilih berita acara, lalu menetapkannya. Tombol Isi dari saran mengisi draf untuk semua murid yang datanya lengkap, dan Tetapkan yang siap menetapkan banyak murid sekaligus.',
            steps: [
              'Buka tab Penetapan dan periksa murid yang diberi penanda.',
              'Buka murid, pilih hasil, isi tanggal kelulusan, lalu simpan draf.',
              'Klik Tetapkan. Nilai yang dipakai dibekukan sebagai transkrip.',
            ],
            href: '/promotion/graduation',
            warning:
              'Bila rapor murid belum final atau nilainya belum lengkap, penetapan hanya bisa dilanjutkan dengan alasan tertulis yang ikut tercatat di transkrip.',
          },
          {
            heading: 'Hubungannya dengan kenaikan kelas',
            body: 'Penetapan mengisi keputusan kenaikan kelas: murid yang lulus menjadi keputusan lulus, yang tidak lulus menjadi tinggal kelas, dan yang ditunda tidak diisi. Status murid baru berubah menjadi lulus saat Anda menerapkan kenaikan kelas, bukan saat menetapkan. Bila tahun ajaran punya kriteria kelulusan, keputusan lulus di langkah Keputusan siswa tidak bisa dipilih langsung; ia datang dari penetapan di halaman ini.',
            href: '/promotion',
            warning: 'Penetapan yang keputusan kenaikannya sudah diterapkan tidak bisa dibuka kembali.',
          },
          {
            heading: 'Nomor, surat keterangan lulus, dan transkrip',
            body: 'Nomor surat keterangan lulus dibuat otomatis saat penetapan dari templat yang Anda tulis, atau bisa diketik sendiri; nomornya tidak boleh sama dengan murid lain. Nomor ijazah diketik sendiri pada tiap murid yang lulus dan juga tidak boleh sama. Edusync tidak membuat format nomor ijazah dan tidak mencetak ijazah. Buka murid yang sudah ditetapkan lalu klik Cetak SKL atau Cetak transkrip; untuk berkas PDF pilih Simpan sebagai PDF pada pilihan printer.',
            tip: 'Nomor ijazah masih boleh diubah setelah penetapan final karena bukan bagian transkrip yang dibekukan.',
          },
          {
            heading: 'Siapa yang dapat melihat dan mengubah',
            body: 'Admin sekolah dan Kurikulum dapat mengatur kriteria, mencatat nilai, menetapkan, membuka kembali, dan mencetak. Kepala sekolah dan Operator dapat melihat dan mencetak. Fitur ini memerlukan modul Nilai aktif.',
          },
        ],
        faq: [
          {
            q: 'Mengapa murid saya tidak punya saran?',
            a: 'Saran baru muncul bila rapor tahun terakhir sudah final dan nilai ujian yang berbobot sudah diisi. Murid yang datanya belum lengkap diberi penanda dan perlu diputuskan sendiri.',
          },
          {
            q: 'Apakah murid otomatis lulus bila memenuhi kriteria?',
            a: 'Tidak. Kelulusan ditetapkan sekolah; kriteria hanya memberi saran, dan status lulus murid baru berubah saat kenaikan kelas diterapkan.',
          },
          {
            q: 'Bagaimana bila perlu mengubah nilai setelah penetapan?',
            a: 'Buka kembali penetapan murid itu, ubah nilainya, lalu tetapkan lagi. Nomor surat keterangan lulus yang sudah dibuat tetap sama.',
          },
          {
            q: 'Mengapa keputusan lulus di langkah Keputusan siswa tidak bisa dipilih?',
            a: 'Tahun ajaran itu punya kriteria kelulusan, jadi keputusan lulus berasal dari penetapan di halaman Kelulusan. Tetapkan di sana, lalu keputusannya muncul di langkah Keputusan siswa.',
          },
        ],
      },
      en: {
        title: 'Graduation: criteria, school exams, decisions, and certificates of graduation',
        summary:
          'How to set the graduation criteria, record school exam scores, confirm graduation for final-year students, give them numbers, and print the certificate of graduation.',
        forWho:
          'Vice principals for curriculum, school admins, and operators who handle graduation; principals can view the results.',
        sections: [
          {
            heading: 'Overview',
            body: 'Graduation is decided by the school after the school exams and a review of the report scores. Edusync only suggests numbers from the criteria you set, then records the school’s decision with the scores frozen. If an academic year has no graduation criteria, promotion works as usual and this page is not used.',
            href: '/promotion/graduation',
            tip: 'Open it with the Graduation button on the Promotion page, or from the side menu.',
          },
          {
            heading: 'Setting the criteria',
            body: 'On the Criteria tab, set the weight of the report score and of each school exam. The weights do not have to add up to 100; their shares are used. Choose which reports are used (last year only, all reports that are final, or specific grades), the rounding, the minimum average, the minimum score for required subjects, and the list of required subjects. Thresholds are only suggestions: students below them are flagged, but the school still decides. Also fill in a certificate number template if you want numbers created automatically.',
            steps: [
              'First add the school exams on the School exams tab if you want to give them a weight.',
              'Open the Criteria tab and fill in the weights, thresholds, and criteria text.',
              'Write the number template, for example a three-digit running number followed by the graduation year; an example result appears under the field.',
              'Click Save criteria.',
            ],
            href: '/promotion/graduation',
            warning:
              'The criteria and exam scores are locked once a student is confirmed as final. Reopen that student’s decision if you need to change them.',
          },
          {
            heading: 'Recording school exam scores',
            body: 'On the School exams tab, add an exam (its name and form are up to you), then fill in the scores per subject for each final-year student. You can type them one by one, or paste from a spreadsheet: one student per line with the student number or exact name, then a score from 0 to 100. Pasted scores are shown in the list first and are only saved when you press Save scores.',
            href: '/promotion/graduation',
            tip: 'Lines whose number or name is not found are reported under the paste box so they are easy to fix.',
          },
          {
            heading: 'Viewing suggestions and confirming',
            body: 'The Decisions tab shows final-year students with their graduation average, flags for a report that is not final or scores that are incomplete, and their decision. Report scores are only taken from reports that are final. Open a student to see the score of each subject, choose the result (graduated, not graduated, or deferred), fill in the graduation date, pick the meeting minutes, and confirm. The Fill from suggestions button fills drafts for every student whose data is complete, and Confirm ready confirms many students at once.',
            steps: [
              'Open the Decisions tab and check the students that are flagged.',
              'Open a student, choose the result, fill in the graduation date, then save the draft.',
              'Click Confirm. The scores used are frozen as a transcript.',
            ],
            href: '/promotion/graduation',
            warning:
              'If a student’s report is not final or the scores are incomplete, confirming can only continue with a written reason, which is recorded on the transcript.',
          },
          {
            heading: 'How it relates to promotion',
            body: 'Confirming fills in the promotion decision: students who graduate become a graduate decision, those who do not become repeating the year, and deferred students are left empty. A student’s status only changes to graduated when you apply the promotion, not when you confirm. When an academic year has graduation criteria, the graduate decision in the Student decisions step cannot be chosen directly; it comes from the confirmation on this page.',
            href: '/promotion',
            warning: 'A decision whose promotion has already been applied cannot be reopened.',
          },
          {
            heading: 'Numbers, certificates, and transcripts',
            body: 'The certificate number is created automatically when confirming, from the template you wrote, or you can type it yourself; it may not be the same as another student’s. The diploma number is typed in for each graduating student and also may not repeat. Edusync does not generate diploma number formats and does not print diplomas. Open a confirmed student and click Print certificate or Print transcript; for a PDF file choose Save as PDF in the printer options.',
            tip: 'The diploma number can still be changed after the decision is final because it is not part of the frozen transcript.',
          },
          {
            heading: 'Who can view and change',
            body: 'School admins and Curriculum can set the criteria, record scores, confirm, reopen, and print. Principals and Operators can view and print. This feature needs the Grades module to be active.',
          },
        ],
        faq: [
          {
            q: 'Why does my student have no suggestion?',
            a: 'A suggestion only appears when the last year’s reports are final and the weighted exam scores are filled in. Students with incomplete data are flagged and need to be decided by hand.',
          },
          {
            q: 'Does a student graduate automatically when meeting the criteria?',
            a: 'No. Graduation is decided by the school; the criteria only suggest, and the student’s graduated status only changes when the promotion is applied.',
          },
          {
            q: 'What if I need to change a score after confirming?',
            a: 'Reopen that student’s decision, change the score, then confirm again. A certificate number that was already created stays the same.',
          },
          {
            q: 'Why can I not choose the graduate decision in the Student decisions step?',
            a: 'That academic year has graduation criteria, so the graduate decision comes from the confirmation on the Graduation page. Confirm it there and the decision then appears in the Student decisions step.',
          },
        ],
      },
      su: {
        title: 'Kalulusan: kriteria, ujian sakola, panetepan, jeung surat katerangan lulus',
        summary:
          'Cara ngatur kriteria kalulusan, nyatet nilai ujian sakola, netepkeun kalulusan murid kelas ahir, méré nomer, jeung nyitak surat katerangan lulus.',
        forWho:
          'Wakil kepala sakola bidang kurikulum, admin sakola, jeung operator nu ngurus kalulusan; kepala sakola bisa nempo hasilna.',
        sections: [
          {
            heading: 'Gambaran ringkes',
            body: 'Kalulusan ditetepkeun ku sakola sanggeus ujian sakola jeung pertimbangan nilai rapor. Edusync ngan méré saran angka tina kriteria nu diatur ku Anjeun, terus nyatet kaputusan sakola maké nilai nu dibekukeun. Lamun taun ajaran can boga kriteria kalulusan, naek kelas jalan biasa jeung kaca ieu teu dipaké.',
            href: '/promotion/graduation',
            tip: 'Buka tina tombol Kalulusan di kaca Naek kelas, atawa tina ménu gigir.',
          },
          {
            heading: 'Ngatur kriteria',
            body: 'Dina tab Kriteria, tangtukeun bobot nilai rapor jeung bobot unggal ujian sakola. Jumlah bobot teu kudu 100; nu dipaké nyaéta porsina. Pilih rapor nu dipaké (taun panungtungan wungkul, sakabéh rapor nu geus final, atawa tingkat tangtu), pangbulatan, rata-rata minimal, nilai minimal mapel wajib, jeung daptar mapel wajib. Ambang ngan saran: murid di handapeun ambang ditandaan, tapi sakola tetep nu netepkeun. Eusian ogé citakan nomer surat katerangan lulus lamun hayang dijieun otomatis.',
            steps: [
              'Tambahkeun heula ujian sakola dina tab Ujian sakola lamun hayang méré bobot.',
              'Buka tab Kriteria jeung eusian bobot, ambang, jeung téks kriteria.',
              'Tulis citakan nomer, upamana nomer urut tilu angka dituturkeun ku taun kalulusan; conto hasilna kaciri di handapeun kolom.',
              'Klik Simpen kriteria.',
            ],
            href: '/promotion/graduation',
            warning:
              'Kriteria jeung nilai ujian dikonci sanggeus aya murid nu ditetepkeun final. Buka deui panetepan murid éta lamun perlu dirobah.',
          },
          {
            heading: 'Nyatet nilai ujian sakola',
            body: 'Dina tab Ujian sakola, tambahkeun ujian (ngaran jeung wangunna bébas), terus eusian nilaina per mata pelajaran keur unggal murid kelas ahir. Bisa diketik hiji-hiji, atawa témpél tina spreadsheet: hiji murid sabaris eusina NIS atawa ngaran pasti, terus nilai 0 nepi ka 100. Hasil témpél ditémbongkeun heula dina daptar jeung kakara kasimpen nalika Anjeun mencét Simpen nilai.',
            href: '/promotion/graduation',
            tip: 'Baris nu NIS atawa ngaranna teu kapanggih dilaporkeun di handapeun kotak témpél supaya gampang dibenerkeun.',
          },
          {
            heading: 'Nempo saran jeung netepkeun',
            body: 'Tab Panetepan mintonkeun murid kelas ahir jeung rata-rata nilai kalulusan, tanda rapor can final atawa nilai can lengkep, jeung kaputusanana. Nilai rapor ngan dicokot tina rapor nu geus final. Buka hiji murid pikeun nempo nilai unggal mata pelajaran, milih hasil (lulus, teu lulus, atawa ditunda), ngeusian tanggal kalulusan, milih berita acara, terus netepkeun. Tombol Eusian tina saran ngeusian draf keur sakabéh murid nu datana lengkep, jeung Tetepkeun nu siap netepkeun loba murid sakaligus.',
            steps: [
              'Buka tab Panetepan jeung pariksa murid nu dibéré tanda.',
              'Buka murid, pilih hasil, eusian tanggal kalulusan, terus simpen draf.',
              'Klik Tetepkeun. Nilai nu dipaké dibekukeun jadi transkrip.',
            ],
            href: '/promotion/graduation',
            warning:
              'Lamun rapor murid can final atawa nilaina can lengkep, panetepan ngan bisa diteruskeun maké alesan tinulis nu milu kacatet dina transkrip.',
          },
          {
            heading: 'Kaitanana jeung naek kelas',
            body: 'Panetepan ngeusian kaputusan naek kelas: murid nu lulus jadi kaputusan lulus, nu teu lulus jadi tinggal kelas, jeung nu ditunda teu dieusian. Status murid kakara robah jadi lulus nalika Anjeun nerapkeun naek kelas, lain nalika netepkeun. Lamun taun ajaran boga kriteria kalulusan, kaputusan lulus dina léngkah Kaputusan siswa teu bisa dipilih langsung; asalna tina panetepan di kaca ieu.',
            href: '/promotion',
            warning: 'Panetepan nu kaputusan naek kelasna geus diterapkeun teu bisa dibuka deui.',
          },
          {
            heading: 'Nomer, surat katerangan lulus, jeung transkrip',
            body: 'Nomer surat katerangan lulus dijieun otomatis nalika panetepan tina citakan nu ditulis ku Anjeun, atawa bisa diketik sorangan; nomerna teu meunang sarua jeung murid sejen. Nomer ijazah diketik sorangan keur unggal murid nu lulus jeung ogé teu meunang sarua. Edusync henteu nyieun format nomer ijazah jeung henteu nyitak ijazah. Buka murid nu geus ditetepkeun terus klik Citak SKL atawa Citak transkrip; keur berkas PDF pilih Simpen salaku PDF dina pilihan printer.',
            tip: 'Nomer ijazah masih bisa dirobah sanggeus panetepan final sabab lain bagian transkrip nu dibekukeun.',
          },
          {
            heading: 'Saha nu bisa nempo jeung ngarobah',
            body: 'Admin sakola jeung Kurikulum bisa ngatur kriteria, nyatet nilai, netepkeun, muka deui, jeung nyitak. Kepala sakola jeung Operator bisa nempo jeung nyitak. Fitur ieu peryogi modul Nilai aktip.',
          },
        ],
        faq: [
          {
            q: 'Naha murid kuring teu boga saran?',
            a: 'Saran kakara muncul lamun rapor taun panungtungan geus final jeung nilai ujian nu aya bobotna geus dieusian. Murid nu datana can lengkep dibéré tanda jeung perlu diputuskeun sorangan.',
          },
          {
            q: 'Naha murid otomatis lulus lamun minuhan kriteria?',
            a: 'Henteu. Kalulusan ditetepkeun ku sakola; kriteria ngan méré saran, jeung status lulus murid kakara robah nalika naek kelas diterapkeun.',
          },
          {
            q: 'Kumaha lamun perlu ngarobah nilai sanggeus panetepan?',
            a: 'Buka deui panetepan murid éta, robah nilaina, terus tetepkeun deui. Nomer surat katerangan lulus nu geus dijieun tetep sarua.',
          },
          {
            q: 'Naha kaputusan lulus dina léngkah Kaputusan siswa teu bisa dipilih?',
            a: 'Taun ajaran éta boga kriteria kalulusan, jadi kaputusan lulus asalna tina panetepan di kaca Kalulusan. Tetepkeun di dinya, terus kaputusanana muncul dina léngkah Kaputusan siswa.',
          },
        ],
      },
    },
  },
  {
    slug: 'data-export',
    icon: 'file',
    tone: 'teal',
    group: 'academic',
    text: {
      id: {
        title: 'Ekspor data akademik (CSV)',
        summary:
          'Cara mengunduh data rombel, mapel, pilihan mapel, nilai akhir, dan deskripsi capaian sebagai berkas generik Edusync untuk diolah sendiri atau dipetakan manual.',
        forWho:
          'Admin sekolah, kurikulum, dan operator yang perlu menyalin data akademik ke aplikasi lain atau ke lembar kerja sendiri.',
        sections: [
          {
            heading: 'Penting: ini ekspor generik Edusync',
            body: 'Berkas ini memakai format generik Edusync bernama edusync-academic-v1. Ini bukan format impor resmi Dapodik, e-Rapor, maupun EMIS, dan Edusync tidak mengklaim kompatibel dengan aplikasi mana pun. Format yang benar-benar diterima aplikasi tujuan belum diverifikasi, jadi periksa dulu kebutuhan aplikasi itu. Berkas ini membantu pemetaan manual karena memuat kode identitas: NPSN sekolah, NISN, NIS, kode mapel sekolah, dan kode mapel acuan bila ada.',
            href: '/exports',
            warning:
              'Jangan mengunggah berkas ini langsung ke aplikasi pelaporan resmi dengan harapan otomatis diterima. Cocokkan dulu kolomnya secara manual.',
          },
          {
            heading: 'Mengunduh berkas',
            body: 'Buka menu Ekspor data, pilih pilihan yang sesuai, lalu klik Unduh. Di bawah tombol tampil pratinjau sepuluh baris pertama dan kamus kolom, sehingga Anda bisa memeriksa isinya sebelum mengunduh.',
            steps: [
              'Pilih tahun ajaran.',
              'Pilih dataset. Untuk pilihan mapel, nilai akhir, dan deskripsi, pilih juga semester.',
              'Pilih format berkas: CSV untuk Excel, atau berkas data terstruktur untuk diolah program.',
              'Periksa pratinjau, lalu klik Unduh.',
            ],
            href: '/exports',
            tip: 'Berkas CSV memakai tanda titik koma sebagai pemisah dan dapat langsung dibuka di Excel dengan huruf yang benar.',
          },
          {
            heading: 'Dataset yang tersedia',
            body: 'Ada lima dataset. Rombel dan anggota: satu baris per murid di tiap rombel beserta wali kelas, NISN, NIS, jenis kelamin, dan tanggal lahir. Mapel per rombel: satu baris per mapel di tiap rombel beserta guru, jam pelajaran per minggu, dan mode peserta. Pilihan mapel murid: mapel pilihan yang diambil tiap murid pada semester terpilih. Nilai akhir: nilai akhir, predikat, dan KKM per murid dan mapel. Deskripsi capaian: deskripsi per murid dan mapel. Nilai akhir dan deskripsi capaian memerlukan modul Nilai dan rapor aktif di sekolah Anda.',
            href: '/exports',
          },
          {
            heading: 'Kamus kolom',
            body: 'Setiap kolom punya kunci tetap berbahasa Inggris dengan huruf kecil, misalnya school_npsn, student_nisn, student_nis, subject_code, dan class_name. Kolom yang kosong berarti datanya memang belum ada, misalnya NPSN yang belum diisi. Daftar lengkap kolom dataset yang dipilih tampil di halaman Ekspor data pada bagian Kamus kolom, berurutan seperti di berkas. Bila kolom diubah di masa depan, itu menjadi versi format baru dan bukan perubahan diam-diam.',
            href: '/exports',
          },
          {
            heading: 'Data yang tidak ikut',
            body: 'NIK murid tidak pernah disertakan. Nilai akhir dan deskripsi capaian hanya diambil dari rapor yang sudah final, sebagai salinan yang dibekukan saat finalisasi; rapor yang masih draf tidak ikut. Karena itu, finalkan rapor kelas lebih dulu bila nilainya belum muncul.',
            href: '/report-cards',
          },
          {
            heading: 'Siapa yang bisa mengekspor',
            body: 'Admin sekolah, Kurikulum, dan Operator dapat mengekspor data. Peran lain tidak melihat menu Ekspor data. Dataset nilai akhir dan deskripsi capaian hanya dapat diunduh bila modul Nilai dan rapor aktif; bila tidak, tampil pesan yang menjelaskannya.',
          },
        ],
        faq: [
          {
            q: 'Apakah berkas ini bisa langsung diimpor ke Dapodik, e-Rapor, atau EMIS?',
            a: 'Tidak ada jaminan. Ini format generik Edusync dan Edusync tidak mengklaim kompatibel dengan aplikasi tersebut. Gunakan berkas ini sebagai bahan untuk memetakan data secara manual.',
          },
          {
            q: 'Mengapa nilai akhir atau deskripsi kosong untuk sebuah kelas?',
            a: 'Hanya rapor yang sudah final yang disertakan. Finalkan rapor kelas itu pada semester yang sama, lalu muat ulang pratinjau.',
          },
          {
            q: 'Apakah NIK ikut diekspor?',
            a: 'Tidak. NIK tidak pernah menjadi kolom pada ekspor ini.',
          },
        ],
      },
      en: {
        title: 'Academic data export (CSV)',
        summary:
          'How to download classes, subjects, subject choices, final grades, and achievement descriptions as a generic Edusync file to process yourself or map manually.',
        forWho:
          'School admins, Curriculum staff, and Operators who need to copy academic data into another application or their own spreadsheet.',
        sections: [
          {
            heading: 'Important: this is a generic Edusync export',
            body: 'The file uses a generic Edusync format named edusync-academic-v1. It is not the official import format of Dapodik, e-Rapor, or EMIS, and Edusync does not claim compatibility with any application. The format the destination application actually accepts has not been verified, so check that application’s requirements first. The file helps manual mapping because it carries identity codes: the school NPSN, NISN, NIS, the school subject code, and the reference subject code when there is one.',
            href: '/exports',
            warning:
              'Do not upload this file straight into an official reporting application expecting it to be accepted automatically. Match the columns manually first.',
          },
          {
            heading: 'Downloading a file',
            body: 'Open the Data export menu, choose your options, and click Download. Below the button you see a preview of the first ten rows and the column dictionary, so you can check the content before downloading.',
            steps: [
              'Choose the academic year.',
              'Choose the dataset. For subject choices, final grades, and descriptions, also choose the semester.',
              'Choose the file format: CSV for Excel, or a structured data file for programs.',
              'Check the preview, then click Download.',
            ],
            href: '/exports',
            tip: 'The CSV file uses a semicolon as separator and opens directly in Excel with the correct characters.',
          },
          {
            heading: 'Available datasets',
            body: 'There are five datasets. Classes and members: one row per student in each class with the homeroom teacher, NISN, NIS, gender, and date of birth. Subjects per class: one row per subject in each class with the teacher, periods per week, and participation mode. Student subject choices: the elective subjects each student takes in the chosen semester. Final grades: the final grade, predicate, and KKM per student and subject. Achievement descriptions: the description per student and subject. Final grades and achievement descriptions need the Grades and report cards module to be active at your school.',
            href: '/exports',
          },
          {
            heading: 'Column dictionary',
            body: 'Every column has a fixed lowercase English key, for example school_npsn, student_nisn, student_nis, subject_code, and class_name. An empty column means the data does not exist yet, for example an NPSN that has not been filled in. The full list of columns for the chosen dataset appears on the Data export page under Column dictionary, in the same order as the file. If a column changes in the future, it becomes a new format version rather than a silent change.',
            href: '/exports',
          },
          {
            heading: 'Data that is left out',
            body: 'The student NIK is never included. Final grades and achievement descriptions come only from finalized report cards, as the copy frozen at finalization; draft report cards are not included. So finalize the class report cards first if the grades do not show up.',
            href: '/report-cards',
          },
          {
            heading: 'Who can export',
            body: 'School admins, Curriculum staff, and Operators can export data. Other roles do not see the Data export menu. The final grades and achievement descriptions datasets can only be downloaded when the Grades and report cards module is active; otherwise a message explains it.',
          },
        ],
        faq: [
          {
            q: 'Can this file be imported directly into Dapodik, e-Rapor, or EMIS?',
            a: 'There is no guarantee. This is a generic Edusync format and Edusync does not claim compatibility with those applications. Use the file as material for mapping the data manually.',
          },
          {
            q: 'Why are final grades or descriptions empty for a class?',
            a: 'Only finalized report cards are included. Finalize that class’s report cards in the same semester, then reload the preview.',
          },
          {
            q: 'Is the NIK exported?',
            a: 'No. The NIK is never a column in this export.',
          },
        ],
      },
      su: {
        title: 'Ékspor data akademik (CSV)',
        summary:
          'Cara ngaunduh data rombongan, mapel, pilihan mapel, nilai ahir, jeung déskripsi capaian minangka berkas umum Edusync pikeun diolah sorangan atawa dipetakeun sacara manual.',
        forWho:
          'Admin sakola, Kurikulum, jeung Operator anu perlu nyalin data akademik ka aplikasi séjén atawa ka lembar kerja sorangan.',
        sections: [
          {
            heading: 'Penting: ieu ékspor umum Edusync',
            body: 'Berkas ieu maké format umum Edusync anu ngaranna edusync-academic-v1. Ieu lain format impor resmi Dapodik, e-Rapor, atawa EMIS, jeung Edusync henteu ngaku cocog jeung aplikasi mana waé. Format anu sabenerna ditarima ku aplikasi tujuan can diverifikasi, jadi pariksa heula pangabutuh aplikasi éta. Berkas ieu mantuan pamétaan manual sabab ngandung kode idéntitas: NPSN sakola, NISN, NIS, kode mapel sakola, jeung kode mapel acuan lamun aya.',
            href: '/exports',
            warning:
              'Ulah ngunggah berkas ieu langsung ka aplikasi laporan resmi bari ngarepkeun otomatis ditarima. Cocogkeun heula kolomna sacara manual.',
          },
          {
            heading: 'Ngaunduh berkas',
            body: 'Buka ménu Ékspor data, pilih pilihan anu cocog, terus klik Unduh. Di handapeun tombol kaciri pratinjau sapuluh baris kahiji jeung kamus kolom, jadi Anjeun bisa mariksa eusina saméméh ngaunduh.',
            steps: [
              'Pilih taun ajaran.',
              'Pilih dataset. Pikeun pilihan mapel, nilai ahir, jeung déskripsi, pilih ogé semester.',
              'Pilih format berkas: CSV pikeun Excel, atawa berkas data terstruktur pikeun program.',
              'Pariksa pratinjau, terus klik Unduh.',
            ],
            href: '/exports',
            tip: 'Berkas CSV maké titik koma minangka pamisah jeung bisa langsung dibuka di Excel kalayan aksara anu bener.',
          },
          {
            heading: 'Dataset anu aya',
            body: 'Aya lima dataset. Rombongan jeung anggotana: sabaris pikeun unggal murid di tiap rombongan jeung wali kelas, NISN, NIS, jenis kelamin, jeung tanggal lahir. Mapel per rombongan: sabaris pikeun unggal mapel di tiap rombongan jeung guru, jam pelajaran per minggu, jeung mode pamilon. Pilihan mapel murid: mapel pilihan anu dicandak ku tiap murid dina semester anu dipilih. Nilai ahir: nilai ahir, predikat, jeung KKM per murid jeung mapel. Déskripsi capaian: déskripsi per murid jeung mapel. Nilai ahir jeung déskripsi capaian peryogi modul Nilai jeung rapor aktip di sakola Anjeun.',
            href: '/exports',
          },
          {
            heading: 'Kamus kolom',
            body: 'Unggal kolom boga konci tetep maké basa Inggris huruf leutik, upamana school_npsn, student_nisn, student_nis, subject_code, jeung class_name. Kolom kosong hartina datana memang can aya, upamana NPSN anu can dieusian. Daptar lengkep kolom dataset anu dipilih kaciri di kaca Ékspor data dina bagian Kamus kolom, diurutkeun sakumaha dina berkas. Lamun kolom robah di mangsa nu bakal datang, éta jadi versi format anyar, lain robahan anu cicingeun.',
            href: '/exports',
          },
          {
            heading: 'Data anu teu milu',
            body: 'NIK murid henteu pernah diasupkeun. Nilai ahir jeung déskripsi capaian ngan dicokot tina rapor anu geus final, minangka salinan anu dibekukeun waktu finalisasi; rapor anu masih rarancang teu milu. Ku kituna, finalkeun heula rapor rombongan lamun nilaina can muncul.',
            href: '/report-cards',
          },
          {
            heading: 'Saha anu bisa ngékspor',
            body: 'Admin sakola, Kurikulum, jeung Operator bisa ngékspor data. Peran séjén teu nempo ménu Ékspor data. Dataset nilai ahir jeung déskripsi capaian ngan bisa diunduh lamun modul Nilai jeung rapor aktip; lamun henteu, kaciri pesen anu ngajelaskeun.',
          },
        ],
        faq: [
          {
            q: 'Naha berkas ieu bisa langsung diimpor ka Dapodik, e-Rapor, atawa EMIS?',
            a: 'Euweuh jaminan. Ieu format umum Edusync jeung Edusync henteu ngaku cocog jeung aplikasi éta. Paké berkas ieu minangka bahan pikeun mamétakeun data sacara manual.',
          },
          {
            q: 'Naha nilai ahir atawa déskripsi kosong pikeun hiji rombongan?',
            a: 'Ngan rapor anu geus final anu diasupkeun. Finalkeun rapor rombongan éta dina semester anu sarua, terus muat deui pratinjau.',
          },
          {
            q: 'Naha NIK milu diékspor?',
            a: 'Henteu. NIK henteu pernah jadi kolom dina ékspor ieu.',
          },
        ],
      },
    },
  },
  {
    slug: 'cocurricular-settings',
    icon: 'layers',
    tone: 'violet',
    group: 'academic',
    module: 'grades',
    text: {
      id: {
        title: 'Pengaturan kokurikuler: kerangka profil dan rubrik',
        summary:
          'Cara menyiapkan delapan dimensi profil lulusan (dan topik Panca Cinta untuk madrasah) serta tingkat capaian rubrik sebelum sekolah membuat kegiatan kokurikuler.',
        forWho:
          'Admin sekolah dan Kurikulum yang mengatur kokurikuler; guru dan kepala sekolah dapat melihatnya.',
        sections: [
          {
            heading: 'Apa yang diatur di sini',
            body: 'Kokurikuler adalah kegiatan penguatan profil lulusan di luar jam mata pelajaran. Halaman ini menyiapkan dua hal: butir kerangka profil (dimensi yang dituju kegiatan) dan rubrik tingkat capaian (skala penilaian kegiatan). Kokurikuler bukan mata pelajaran, jadi tidak memengaruhi nilai, peringkat, kenaikan kelas, maupun kelulusan. Sekolah yang tidak memakainya tidak mengalami perubahan apa pun, dan tidak ada data yang dibuat otomatis.',
            href: '/cocurricular/settings',
          },
          {
            heading: 'Mengadopsi kerangka profil',
            body: 'Kerangka acuan disediakan platform. Klik Adopsi kerangka untuk menyalin butirnya ke sekolah Anda, lalu ubah label, nonaktifkan butir yang tidak dipakai, atau tambah butir buatan sendiri. Mengadopsi lagi hanya menambah butir acuan yang belum ada dan tidak menimpa label yang sudah Anda ubah. Butir hasil adopsi tidak dihapus, cukup dinonaktifkan; butir buatan sendiri boleh dihapus.',
            steps: [
              'Buka Pengaturan kokurikuler.',
              'Pada kerangka yang diinginkan, klik Adopsi kerangka.',
              'Periksa label tiap butir dan sesuaikan bila perlu.',
              'Hilangkan centang Aktif pada butir yang tidak dipakai, atau klik Tambah butir sendiri.',
              'Klik Simpan.',
            ],
            href: '/cocurricular/settings',
            tip: 'Ubah label sesuai dokumen resmi yang dipegang sekolah; label yang tersimpan menjadi label di rapor.',
            warning:
              'Ejaan delapan dimensi belum dicocokkan dengan lampiran resmi, dan Panca Cinta berasal dari sumber sekunder (bukan teks resmi). Periksa keduanya sebelum dipakai di rapor.',
          },
          {
            heading: 'Panca Cinta untuk madrasah',
            body: 'Kerangka Panca Cinta (lima topik nilai cinta) hanya muncul untuk unit madrasah (MI, MTs, MA, MAK). Sekolah umum tidak melihatnya, dan mencoba mengadopsinya ditolak. Kerangka ini berlabel sumber sekunder karena nama dan urutannya diambil dari sumber sekunder.',
            href: '/cocurricular/settings',
          },
          {
            heading: 'Mengisi rubrik tingkat capaian',
            body: 'Rubrik adalah daftar tingkat capaian milik sekolah, misalnya Sangat Baik, Baik, Cukup, dan Kurang. Urutan dari atas ke bawah adalah dari tertinggi ke terendah. Tombol Isi contoh menawarkan empat tingkat tersebut sebagai awal (sumber sekunder) dan dapat diubah sepenuhnya. Maksimal ada 12 tingkat dengan kode unik.',
            steps: [
              'Di bagian Rubrik tingkat capaian, klik Isi contoh atau Tambah tingkat.',
              'Isi kode singkat dan nama tiap tingkat.',
              'Atur urutan dengan tombol panah.',
              'Klik Simpan.',
            ],
            href: '/cocurricular/settings',
          },
          {
            heading: 'Siapa yang dapat mengubah',
            body: 'Admin sekolah dan Kurikulum dapat mengubah pengaturan ini. Guru, kepala sekolah, dan operator dapat melihatnya tetapi tidak mengubahnya. Fitur ini memerlukan modul Nilai dan rapor.',
          },
        ],
        faq: [
          {
            q: 'Mengapa daftar butir kosong?',
            a: 'Sekolah belum mengadopsi kerangka. Tidak ada butir yang dibuat otomatis; klik Adopsi kerangka pada kerangka yang diinginkan.',
          },
          {
            q: 'Apakah kokurikuler memengaruhi nilai rapor?',
            a: 'Tidak. Kokurikuler bukan mata pelajaran dan tidak dihitung dalam nilai akhir, peringkat, kenaikan kelas, atau kelulusan.',
          },
          {
            q: 'Bisakah saya mengganti nama dimensi?',
            a: 'Bisa. Setelah diadopsi, label menjadi milik sekolah dan dapat diganti kapan saja. Perubahan hanya berlaku untuk penggunaan berikutnya.',
          },
        ],
      },
      en: {
        title: 'Cocurricular settings: profile framework and rubric',
        summary:
          'How to set up the eight graduate profile dimensions (plus the Panca Cinta topics for madrasahs) and the rubric achievement levels before the school creates cocurricular activities.',
        forWho:
          'School admins and Curriculum staff who manage cocurricular work; teachers and principals can view it.',
        sections: [
          {
            heading: 'What is set up here',
            body: 'Cocurricular work is activity that strengthens the graduate profile outside subject lessons. This page prepares two things: the profile framework items (the dimensions an activity aims at) and the achievement rubric (the scale used to assess activities). Cocurricular work is not a subject, so it does not affect grades, rankings, promotion, or graduation. A school that does not use it sees no change, and nothing is created automatically.',
            href: '/cocurricular/settings',
          },
          {
            heading: 'Adopting a profile framework',
            body: 'Reference frameworks are provided by the platform. Click Adopt framework to copy its items to your school, then rename them, deactivate the ones you do not use, or add your own. Adopting again only adds reference items that are missing and never overwrites labels you changed. Adopted items are not deleted, only deactivated; items you created yourself can be deleted.',
            steps: [
              'Open Cocurricular settings.',
              'On the framework you want, click Adopt framework.',
              'Check each item label and adjust it if needed.',
              'Untick Active on items you do not use, or click Add your own item.',
              'Click Save.',
            ],
            href: '/cocurricular/settings',
            tip: 'Set labels to match the official document your school holds; the saved label is the one shown on report cards.',
            warning:
              'The spelling of the eight dimensions has not been matched to the official annex, and Panca Cinta comes from a secondary source (not the official text). Check both before using them on report cards.',
          },
          {
            heading: 'Panca Cinta for madrasahs',
            body: 'The Panca Cinta framework (five love-based value topics) appears only for madrasah units (MI, MTs, MA, MAK). General schools do not see it, and trying to adopt it is refused. It is marked as a secondary source because its names and order were taken from a secondary source.',
            href: '/cocurricular/settings',
          },
          {
            heading: 'Filling in the achievement rubric',
            body: 'The rubric is the school’s own list of achievement levels, for example Very good, Good, Fair, and Needs improvement. Top to bottom runs from highest to lowest. Fill in example offers those four levels as a starting point (secondary source) and you can change them entirely. There can be up to 12 levels with unique codes.',
            steps: [
              'In the Achievement rubric section, click Fill in example or Add level.',
              'Enter a short code and a name for each level.',
              'Set the order with the arrow buttons.',
              'Click Save.',
            ],
            href: '/cocurricular/settings',
          },
          {
            heading: 'Who can change it',
            body: 'School admins and Curriculum staff can change these settings. Teachers, principals, and operators can view them but not change them. This feature needs the Grades and report cards module.',
          },
        ],
        faq: [
          {
            q: 'Why is the item list empty?',
            a: 'The school has not adopted a framework yet. Nothing is created automatically; click Adopt framework on the one you want.',
          },
          {
            q: 'Does cocurricular work affect report card grades?',
            a: 'No. It is not a subject and is not counted in final grades, rankings, promotion, or graduation.',
          },
          {
            q: 'Can I rename a dimension?',
            a: 'Yes. Once adopted, the label belongs to your school and can be changed at any time. A change only applies to later use.',
          },
        ],
      },
      su: {
        title: 'Pangaturan kokurikuler: kerangka profil jeung rubrik',
        summary:
          'Cara nyiapkeun dalapan dimensi profil lulusan (jeung topik Panca Cinta pikeun madrasah) sarta tingkat capaian rubrik saméméh sakola nyieun kagiatan kokurikuler.',
        forWho:
          'Admin sakola jeung Kurikulum anu ngatur kokurikuler; guru jeung kepala sakola bisa ningalina.',
        sections: [
          {
            heading: 'Naon anu diatur di dieu',
            body: 'Kokurikuler nyaéta kagiatan anu nguatkeun profil lulusan di luar jam mata pelajaran. Kaca ieu nyiapkeun dua hal: butir kerangka profil (dimensi anu dituju ku kagiatan) jeung rubrik tingkat capaian (skala pangajén kagiatan). Kokurikuler lain mata pelajaran, jadi henteu mangaruhan nilai, pangkat, kanaékan kelas, atawa kalulusan. Sakola anu henteu maké teu aya parobahan, jeung teu aya data anu dijieun otomatis.',
            href: '/cocurricular/settings',
          },
          {
            heading: 'Ngadopsi kerangka profil',
            body: 'Kerangka acuan disayogikeun ku platform. Klik Adopsi kerangka pikeun nyalin butirna ka sakola Anjeun, terus robah labelna, nonaktipkeun butir anu teu dipaké, atawa tambah butir sorangan. Ngadopsi deui ngan nambahan butir acuan anu can aya jeung henteu nimpa label anu geus dirobah. Butir hasil adopsi henteu dipupus, cukup dinonaktipkeun; butir damelan sorangan bisa dipupus.',
            steps: [
              'Buka Pangaturan kokurikuler.',
              'Dina kerangka anu dipikahayang, klik Adopsi kerangka.',
              'Pariksa label unggal butir jeung saluyukeun lamun perlu.',
              'Cabut centang Aktip dina butir anu teu dipaké, atawa klik Tambah butir sorangan.',
              'Klik Simpen.',
            ],
            href: '/cocurricular/settings',
            tip: 'Saluyukeun label jeung dokumén resmi anu aya di sakola; label anu disimpen nya éta anu kaciri dina rapor.',
            warning:
              'Éjahan dalapan dimensi can dicocogkeun jeung lampiran resmi, jeung Panca Cinta asalna tina sumber sékundér (lain téks resmi). Pariksa duanana saméméh dipaké dina rapor.',
          },
          {
            heading: 'Panca Cinta pikeun madrasah',
            body: 'Kerangka Panca Cinta (lima topik nilai cinta) ngan kaciri pikeun unit madrasah (MI, MTs, MA, MAK). Sakola umum henteu ningali, jeung nyobaan ngadopsina ditolak. Kerangka ieu diciri sumber sékundér sabab ngaran jeung urutanna dicokot tina sumber sékundér.',
            href: '/cocurricular/settings',
          },
          {
            heading: 'Ngeusian rubrik tingkat capaian',
            body: 'Rubrik nyaéta daptar tingkat capaian milik sakola, upamana Pohara Alus, Alus, Cukup, jeung Kurang. Urutan ti luhur ka handap nyaéta ti pangluhurna ka panghandapna. Tombol Eusian conto nawarkeun éta opat tingkat minangka awal (sumber sékundér) jeung bisa dirobah sakabéhna. Maksimal aya 12 tingkat kalayan kode anu unik.',
            steps: [
              'Dina bagian Rubrik tingkat capaian, klik Eusian conto atawa Tambah tingkat.',
              'Eusian kode pondok jeung ngaran unggal tingkat.',
              'Atur urutan maké tombol panah.',
              'Klik Simpen.',
            ],
            href: '/cocurricular/settings',
          },
          {
            heading: 'Saha anu bisa ngarobah',
            body: 'Admin sakola jeung Kurikulum bisa ngarobah pangaturan ieu. Guru, kepala sakola, jeung operator bisa ningali tapi teu bisa ngarobah. Fitur ieu peryogi modul Nilai jeung rapor.',
          },
        ],
        faq: [
          {
            q: 'Naha daptar butir kosong?',
            a: 'Sakola can ngadopsi kerangka. Teu aya butir anu dijieun otomatis; klik Adopsi kerangka dina anu dipikahayang.',
          },
          {
            q: 'Naha kokurikuler mangaruhan nilai rapor?',
            a: 'Henteu. Lain mata pelajaran jeung henteu diitung dina nilai ahir, pangkat, kanaékan kelas, atawa kalulusan.',
          },
          {
            q: 'Naha abdi tiasa ngarobah ngaran dimensi?',
            a: 'Tiasa. Sanggeus diadopsi, labelna jadi milik sakola jeung bisa dirobah iraha waé. Parobahan ngan lumaku pikeun pamakéan satuluyna.',
          },
        ],
      },
    },
  },
  {
    slug: 'cocurricular-programs',
    icon: 'layers',
    tone: 'violet',
    group: 'academic',
    module: 'grades',
    text: {
      id: {
        title: 'Program kokurikuler: bentuk, rombel, sasaran, dan fasilitator',
        summary:
          'Cara membuat program kokurikuler per tahun ajaran, memilih rombel dan butir sasaran profil, menunjuk koordinator dan fasilitator, serta membaca peringatan rencana JP.',
        forWho:
          'Admin sekolah dan Kurikulum yang membuat dan mengatur program; guru dan kepala sekolah dapat melihatnya (baca saja).',
        sections: [
          {
            heading: 'Apa itu program kokurikuler',
            body: 'Program adalah satu kegiatan penguatan profil lulusan pada satu tahun ajaran, misalnya proyek kolaboratif atau gerakan 7 Kebiasaan Anak Indonesia Hebat. Program mencatat bentuk, tema, uraian, rencana JP, semester (atau sepanjang tahun), status, dan apakah tampil di rapor. Program bukan mata pelajaran, jadi tidak memengaruhi nilai, peringkat, kenaikan kelas, maupun kelulusan. Penilaian murid dan bukti karya ada di tab Penilaian dan Bukti (lihat panduan Penilaian kokurikuler).',
            href: '/cocurricular',
          },
          {
            heading: 'Membuat program',
            body: 'Program dibuat pada tahun ajaran yang sedang dipilih di bagian atas halaman. Status awal adalah Draf; ubah menjadi Berjalan saat kegiatan dimulai dan Selesai untuk mengarsipkannya. Program Selesai tidak dihapus sehingga riwayatnya tetap ada.',
            steps: [
              'Buka Program kokurikuler dan pilih tahun ajaran.',
              'Klik Program baru.',
              'Isi judul (wajib), bentuk, semester, tema, uraian, dan rencana JP bila ada.',
              'Klik Buat program; Anda dibawa ke halaman program untuk melengkapinya.',
            ],
            href: '/cocurricular',
          },
          {
            heading: 'Rombel, koordinator, dan fasilitator',
            body: 'Di tab Rombel dan fasilitator, centang rombel pada tahun ajaran program lalu simpan. Setelah itu tambahkan guru: koordinator mencakup seluruh rombel program dan tidak memilih rombel; fasilitator wajib memilih satu rombel program. Guru yang sama tidak boleh dicatat dua kali untuk rombel yang sama. Rombel yang masih punya fasilitator tidak bisa dilepas; ubah fasilitatornya dulu.',
            steps: [
              'Buka program, tab Rombel dan fasilitator.',
              'Centang rombel peserta, lalu Simpan.',
              'Klik Tambah guru, pilih guru, peran, dan (untuk fasilitator) rombelnya.',
              'Klik Simpan.',
            ],
            href: '/cocurricular',
          },
          {
            heading: 'Butir sasaran',
            body: 'Tab Butir sasaran menampilkan butir kerangka profil milik sekolah (dari Pengaturan kokurikuler). Centang butir yang dituju program. Hanya butir aktif yang bisa dipilih baru; butir yang sudah menjadi sasaran tetap tersimpan walau kemudian dinonaktifkan. Bila daftar kosong, adopsi kerangka dulu di Pengaturan kokurikuler.',
            href: '/cocurricular',
          },
          {
            heading: 'Peringatan rencana JP',
            body: 'Jumlah rencana JP program dibandingkan dengan JP kokurikuler tahunan pada Kurikulum, per tingkat. Bila rencana melebihi alokasi, halaman daftar menampilkan pita peringatan kuning. Ini hanya peringatan: program tetap dapat disimpan, dan tanpa alokasi tidak ada peringatan.',
            href: '/cocurricular',
            tip: 'Isi JP kokurikuler tahunan di Kurikulum agar perbandingan ini muncul.',
          },
          {
            heading: 'Siapa yang dapat melakukan apa',
            body: 'Izin Melihat kokurikuler (admin sekolah, kepala sekolah, Kurikulum, operator, dan guru) membuka daftar dan detail dalam tampilan baca saja. Izin Mengelola kokurikuler (admin sekolah dan Kurikulum) diperlukan untuk membuat, mengubah, dan menghapus program, rombel, sasaran, dan fasilitator. Fitur ini memerlukan modul Nilai dan rapor.',
          },
        ],
        faq: [
          {
            q: 'Mengapa saya tidak melihat tombol Program baru?',
            a: 'Akun Anda hanya punya izin melihat. Hubungi admin sekolah bila perlu mengelola program.',
          },
          {
            q: 'Muncul pesan data yang dirujuk tidak ditemukan. Apa artinya?',
            a: 'Rombel, semester, butir, atau guru yang dipilih tidak termasuk tahun ajaran atau sekolah program, atau butirnya nonaktif. Muat ulang halaman lalu pilih lagi.',
          },
          {
            q: 'Muncul pesan data sudah ada saat menyimpan rombel atau fasilitator. Mengapa?',
            a: 'Ada guru yang dicatat dua kali untuk rombel yang sama, atau Anda melepas rombel yang masih punya fasilitator. Perbaiki daftar fasilitator lalu simpan lagi.',
          },
          {
            q: 'Bolehkah menghapus program?',
            a: 'Boleh, beserta rombel, sasaran, fasilitator, dan buktinya, selama belum ada penilaian murid. Program yang sudah dinilai ditolak; untuk menyimpan riwayat, ubah statusnya menjadi Selesai.',
          },
        ],
      },
      en: {
        title: 'Cocurricular programs: form, classes, targets, and facilitators',
        summary:
          'How to create cocurricular programs per academic year, choose classes and profile target items, assign coordinators and facilitators, and read the planned-periods warning.',
        forWho:
          'School admins and Curriculum staff who create and manage programs; teachers and principals can view them (read only).',
        sections: [
          {
            heading: 'What a cocurricular program is',
            body: 'A program is one activity that strengthens the graduate profile in one academic year, for example a collaborative project or the 7 Habits of Great Indonesian Children movement. It records the form, theme, description, planned periods, semester (or the whole year), status, and whether it appears on the report card. A program is not a subject, so it does not affect grades, rankings, promotion, or graduation. Student assessment and work evidence are on the Assessment and Evidence tabs (see the Cocurricular assessment guide).',
            href: '/cocurricular',
          },
          {
            heading: 'Creating a program',
            body: 'A program is created in the academic year chosen at the top of the page. It starts as Draft; set it to Running when the activity begins and to Closed to archive it. A Closed program is not deleted, so its history stays.',
            steps: [
              'Open Cocurricular programs and choose the academic year.',
              'Click New program.',
              'Fill in the title (required), form, semester, theme, description, and planned periods if any.',
              'Click Create program; you are taken to the program page to complete it.',
            ],
            href: '/cocurricular',
          },
          {
            heading: 'Classes, coordinators, and facilitators',
            body: 'On the Classes and facilitators tab, tick the classes of the program’s academic year and save. Then add teachers: a coordinator covers all program classes and picks no class; a facilitator must pick one program class. The same teacher cannot be listed twice for the same class. A class that still has a facilitator cannot be removed; change the facilitator first.',
            steps: [
              'Open the program, Classes and facilitators tab.',
              'Tick the participating classes, then Save.',
              'Click Add teacher, then choose the teacher, the role, and (for a facilitator) the class.',
              'Click Save.',
            ],
            href: '/cocurricular',
          },
          {
            heading: 'Target items',
            body: 'The Target items tab shows the school’s profile framework items (from Cocurricular settings). Tick the items the program aims at. Only active items can be newly chosen; an item that is already a target stays even if it is deactivated later. If the list is empty, adopt a framework first in Cocurricular settings.',
            href: '/cocurricular',
          },
          {
            heading: 'Planned-periods warning',
            body: 'A program’s planned periods are compared per level with the yearly cocurricular periods set in Curriculum. When the plan exceeds the allocation, the list page shows a yellow warning. It is only a warning: the program can still be saved, and with no allocation there is no warning.',
            href: '/cocurricular',
            tip: 'Fill in the yearly cocurricular periods in Curriculum so this comparison appears.',
          },
          {
            heading: 'Who can do what',
            body: 'The View cocurricular permission (school admin, principal, Curriculum, operator, and teacher) opens the list and details read only. The Manage cocurricular permission (school admin and Curriculum) is needed to create, change, and delete programs, classes, targets, and facilitators. This feature needs the Grades and report cards module.',
          },
        ],
        faq: [
          {
            q: 'Why do I not see the New program button?',
            a: 'Your account can only view. Ask the school admin if you need to manage programs.',
          },
          {
            q: 'I got a message that the referenced data was not found. What does it mean?',
            a: 'A chosen class, semester, item, or teacher does not belong to the program’s academic year or school, or the item is inactive. Reload the page and choose again.',
          },
          {
            q: 'I got a message that the data already exists when saving classes or facilitators. Why?',
            a: 'A teacher is listed twice for the same class, or you removed a class that still has a facilitator. Fix the facilitator list and save again.',
          },
          {
            q: 'Can I delete a program?',
            a: 'Yes, together with its classes, targets, facilitators, and evidence, as long as no student has been assessed. A program that has assessments is refused; to keep the history, set its status to Closed instead.',
          },
        ],
      },
      su: {
        title: 'Program kokurikuler: wangun, rombel, tujuan, jeung fasilitator',
        summary:
          'Cara nyieun program kokurikuler per taun pelajaran, milih rombel jeung butir tujuan profil, nunjuk koordinator jeung fasilitator, sarta maca pépéling rencana JP.',
        forWho:
          'Admin sakola jeung Kurikulum anu nyieun jeung ngatur program; guru jeung kepala sakola bisa ningalina (maca wungkul).',
        sections: [
          {
            heading: 'Naon éta program kokurikuler',
            body: 'Program nyaéta hiji kagiatan nu nguatkeun profil lulusan dina hiji taun pelajaran, upamana proyék kolaboratif atawa gerakan 7 Kabiasaan Anak Indonesia Hébat. Program nyatet wangun, téma, uraian, rencana JP, semester (atawa sapanjang taun), status, jeung naha kaciri dina rapor. Program lain mata pelajaran, jadi henteu mangaruhan nilai, pangkat, kanaékan kelas, atawa kalulusan. Pangajén murid jeung bukti karya aya dina tab Pangajén jeung Bukti (tingal pituduh Pangajén kokurikuler).',
            href: '/cocurricular',
          },
          {
            heading: 'Nyieun program',
            body: 'Program dijieun dina taun pelajaran nu keur dipilih di luhur kaca. Status awal nyaéta Rancangan; robah jadi Jalan nalika kagiatan dimimitian jeung Réngsé pikeun ngarsipkeunana. Program Réngsé henteu dipupus sangkan riwayatna tetep aya.',
            steps: [
              'Buka Program kokurikuler jeung pilih taun pelajaran.',
              'Klik Program anyar.',
              'Eusian judul (wajib), wangun, semester, téma, uraian, jeung rencana JP lamun aya.',
              'Klik Jieun program; Anjeun dibawa ka kaca program pikeun ngalengkepan.',
            ],
            href: '/cocurricular',
          },
          {
            heading: 'Rombel, koordinator, jeung fasilitator',
            body: 'Dina tab Rombel jeung fasilitator, centang rombel dina taun pelajaran program tuluy simpen. Sanggeus éta tambahkeun guru: koordinator nyakup sakabéh rombel program jeung henteu milih rombel; fasilitator kudu milih hiji rombel program. Guru nu sarua teu meunang dicatet dua kali pikeun rombel nu sarua. Rombel nu masih boga fasilitator teu bisa dicabut; robah heula fasilitatorna.',
            steps: [
              'Buka program, tab Rombel jeung fasilitator.',
              'Centang rombel pamilon, tuluy Simpen.',
              'Klik Tambah guru, tuluy pilih guru, peran, jeung (pikeun fasilitator) rombelna.',
              'Klik Simpen.',
            ],
            href: '/cocurricular',
          },
          {
            heading: 'Butir tujuan',
            body: 'Tab Butir tujuan nembongkeun butir kerangka profil milik sakola (tina Pangaturan kokurikuler). Centang butir nu dituju ku program. Ngan butir aktip nu bisa dipilih anyar; butir nu geus jadi tujuan tetep disimpen sanajan engkéna dinonaktipkeun. Lamun daptarna kosong, adopsi kerangka heula dina Pangaturan kokurikuler.',
            href: '/cocurricular',
          },
          {
            heading: 'Pépéling rencana JP',
            body: 'Rencana JP program dibandingkeun per tingkat jeung JP kokurikuler taunan dina Kurikulum. Lamun rencana ngaleuwihan alokasi, kaca daptar nembongkeun pita pépéling koneng. Ieu ngan pépéling: program tetep bisa disimpen, jeung tanpa alokasi euweuh pépéling.',
            href: '/cocurricular',
            tip: 'Eusian JP kokurikuler taunan dina Kurikulum sangkan babandingan ieu muncul.',
          },
          {
            heading: 'Saha nu bisa naon',
            body: 'Idin Ningali kokurikuler (admin sakola, kepala sakola, Kurikulum, operator, jeung guru) muka daptar jeung rincian dina tampilan maca wungkul. Idin Ngatur kokurikuler (admin sakola jeung Kurikulum) diperyogikeun pikeun nyieun, ngarobah, jeung mupus program, rombel, tujuan, jeung fasilitator. Fitur ieu peryogi modul Nilai jeung rapor.',
          },
        ],
        faq: [
          {
            q: 'Naha abdi henteu ningali tombol Program anyar?',
            a: 'Akun Anjeun ngan boga idin ningali. Hubungi admin sakola lamun kudu ngatur program.',
          },
          {
            q: 'Muncul pesen data nu dirujuk teu kapanggih. Naon hartosna?',
            a: 'Rombel, semester, butir, atawa guru nu dipilih lain bagian tina taun pelajaran atawa sakola program, atawa butirna nonaktip. Muat deui kaca tuluy pilih deui.',
          },
          {
            q: 'Muncul pesen data geus aya waktu nyimpen rombel atawa fasilitator. Naha?',
            a: 'Aya guru nu dicatet dua kali pikeun rombel nu sarua, atawa Anjeun nyabut rombel nu masih boga fasilitator. Pérbaiki daptar fasilitator tuluy simpen deui.',
          },
          {
            q: 'Naha program bisa dipupus?',
            a: 'Bisa, jeung rombel, tujuan, fasilitator, jeung buktina, salami acan aya murid nu dipariksa. Program nu geus dipariksa ditolak; pikeun nyimpen riwayat, robah statusna jadi Réngsé.',
          },
        ],
      },
    },
  },
  {
    slug: 'cocurricular-assessment',
    icon: 'layers',
    tone: 'violet',
    group: 'academic',
    module: 'grades',
    text: {
      id: {
        title: 'Penilaian kokurikuler: tingkat capaian, catatan, dan bukti',
        summary:
          'Cara menilai murid pada butir sasaran program kokurikuler per semester dan rombel, mengisi massal, melampirkan bukti berupa tautan, serta memahami hak menilai dan penguncian saat rapor final.',
        forWho:
          'Admin sekolah dan Kurikulum (semua rombel), koordinator program (semua rombel program), dan guru fasilitator (rombelnya saja); kepala sekolah dan operator dapat melihat.',
        sections: [
          {
            heading: 'Apa yang dinilai',
            body: 'Setiap murid dinilai pada tiap butir sasaran program (misalnya dimensi profil lulusan) dengan satu tingkat rubrik dari Pengaturan kokurikuler dan, bila perlu, catatan singkat. Hanya penilaian sumatif per semester yang disimpan. Kokurikuler bukan mata pelajaran: penilaian ini tidak masuk nilai akhir, rata-rata, peringkat, kenaikan kelas, maupun kelulusan.',
            href: '/cocurricular',
          },
          {
            heading: 'Mengisi penilaian',
            body: 'Di tab Penilaian, pilih semester dan rombel. Di ponsel setiap murid tampil sebagai kartu; di layar lebar tampil sebagai matriks murid dan butir. Pilih tingkat pada tiap butir, buka tombol catatan bila perlu menulis, lalu simpan. Mengosongkan tingkat dan catatan menghapus penilaian sel itu. Satu kali simpan menampung sampai 500 sel; halaman membaginya otomatis.',
            steps: [
              'Buka program, tab Penilaian.',
              'Pilih semester dan rombel.',
              'Pilih tingkat tiap murid pada tiap butir; ikon pesan membuka catatan.',
              'Untuk memberi semua murid tingkat yang sama pada satu butir, pakai Isi massal lalu Terapkan ke semua.',
              'Klik Simpan pada bilah bawah; penanda Ada perubahan yang belum disimpan hilang setelah tersimpan.',
            ],
            href: '/cocurricular',
            tip: 'Isi rubrik tingkat lebih dulu di Pengaturan kokurikuler; tanpa rubrik hanya catatan yang dapat diisi.',
          },
          {
            heading: 'Siapa yang boleh menilai',
            body: 'Admin sekolah dan Kurikulum boleh menilai semua rombel. Koordinator program boleh menilai semua rombel program itu, dan fasilitator hanya rombel yang ditugaskan padanya di tab Rombel dan fasilitator. Guru lain tidak melihat penilaian program itu dan ditolak bila mencoba menilai. Kepala sekolah dan operator dapat melihat semua rombel tanpa dapat mengubah.',
          },
          {
            heading: 'Rapor final mengunci penilaian',
            body: 'Bila rapor murid pada semester itu sudah difinalkan, penilaian murid itu tidak dapat diubah sampai rapornya dibuka kembali di menu Rapor. Murid lain yang rapornya belum final tetap dapat dinilai. Program, rombel, atau butir yang sudah punya penilaian tidak dapat dihapus atau dilepas, dan tingkat rubrik yang sudah dipakai tidak dapat dihapus (nonaktifkan saja). Program berstatus Selesai hanya dapat dibaca.',
          },
          {
            heading: 'Bukti karya',
            body: 'Tab Bukti menyimpan tautan https ke karya atau dokumentasi kegiatan (judul dan tautan, paling banyak 500 karakter) per rombel atau untuk seluruh program. Hanya tautan https yang diterima; unggah berkas belum tersedia. Tautan dibuka di tab baru.',
            steps: [
              'Buka program, tab Bukti.',
              'Pilih rombel (atau Seluruh program bila Anda pengelola atau koordinator).',
              'Isi judul dan tautan yang diawali https://, lalu klik Tambah bukti.',
            ],
            href: '/cocurricular',
          },
        ],
        faq: [
          {
            q: 'Mengapa saya tidak bisa menyimpan dan muncul pesan rapor sudah difinalisasi?',
            a: 'Rapor murid itu pada semester tersebut sudah final. Minta wali kelas atau pengelola rapor membukanya kembali di menu Rapor, lalu simpan lagi.',
          },
          {
            q: 'Mengapa saya tidak melihat rombel tertentu?',
            a: 'Fasilitator hanya melihat rombel yang ditugaskan kepadanya. Minta admin sekolah atau Kurikulum menambahkan Anda di tab Rombel dan fasilitator.',
          },
          {
            q: 'Mengapa tautan bukti ditolak?',
            a: 'Bukti harus berupa tautan yang diawali https://, tanpa spasi, paling banyak 500 karakter. Tautan http biasa tidak diterima.',
          },
          {
            q: 'Mengapa saya tidak bisa menghapus program atau tingkat rubrik?',
            a: 'Program, rombel, atau butir yang sudah dinilai dan tingkat rubrik yang sudah dipakai tidak dapat dihapus. Ubah status program menjadi Selesai atau nonaktifkan tingkatnya.',
          },
        ],
      },
      en: {
        title: 'Cocurricular assessment: achievement level, notes, and evidence',
        summary:
          'How to assess students on a cocurricular program’s target items per semester and class, fill in bulk, attach evidence links, and understand who may assess and the lock when a report card is final.',
        forWho:
          'School admins and Curriculum (all classes), program coordinators (all program classes), and facilitator teachers (their own class only); principals and operators can view.',
        sections: [
          {
            heading: 'What is assessed',
            body: 'Each student is rated on every program target item (for example a graduate profile dimension) with one rubric level from Cocurricular settings and, if needed, a short note. Only summative assessment per semester is saved. Cocurricular work is not a subject: this assessment does not enter the final grade, average, ranking, promotion, or graduation.',
            href: '/cocurricular',
          },
          {
            heading: 'Filling in the assessment',
            body: 'On the Assessment tab, choose the semester and class. On a phone each student appears as a card; on a wide screen as a student by item matrix. Choose a level on each item, open the note button to write, then save. Clearing the level and note removes that cell’s assessment. One save carries up to 500 cells; the page splits it automatically.',
            steps: [
              'Open the program, Assessment tab.',
              'Choose the semester and class.',
              'Choose each student’s level on each item; the message icon opens the note.',
              'To give all students the same level on one item, use Fill in bulk then Apply to all.',
              'Click Save on the bottom bar; the unsaved-changes notice disappears once saved.',
            ],
            href: '/cocurricular',
            tip: 'Fill in the rubric levels in Cocurricular settings first; without a rubric only notes can be entered.',
          },
          {
            heading: 'Who may assess',
            body: 'School admins and Curriculum may assess every class. A program coordinator may assess all of that program’s classes, and a facilitator only the class assigned on the Classes and facilitators tab. Other teachers do not see that program’s assessment and are refused if they try to assess. Principals and operators can view every class but not change it.',
          },
          {
            heading: 'A final report card locks the assessment',
            body: 'Once a student’s report card for the semester is finalized, that student’s assessment cannot be changed until the report card is reopened in the Report cards menu. Other students whose report cards are not final can still be assessed. A program, class, or item that has assessments cannot be deleted or removed, and a rubric level already used cannot be deleted (deactivate it instead). A Closed program is read only.',
          },
          {
            heading: 'Work evidence',
            body: 'The Evidence tab stores https links to work or documentation of the activity (a title and a link of at most 500 characters) per class or for the whole program. Only https links are accepted; file upload is not available yet. Links open in a new tab.',
            steps: [
              'Open the program, Evidence tab.',
              'Choose the class (or Whole program if you are a manager or coordinator).',
              'Enter a title and a link starting with https://, then click Add evidence.',
            ],
            href: '/cocurricular',
          },
        ],
        faq: [
          {
            q: 'Why can I not save, and I see a message that the report card is finalized?',
            a: 'That student’s report card for that semester is final. Ask the homeroom teacher or report manager to reopen it in the Report cards menu, then save again.',
          },
          {
            q: 'Why do I not see a certain class?',
            a: 'A facilitator only sees the class assigned to them. Ask the school admin or Curriculum to add you on the Classes and facilitators tab.',
          },
          {
            q: 'Why was an evidence link rejected?',
            a: 'Evidence must be a link starting with https://, with no spaces, at most 500 characters. A plain http link is not accepted.',
          },
          {
            q: 'Why can I not delete a program or a rubric level?',
            a: 'A program, class, or item that has been assessed, and a rubric level already used, cannot be deleted. Set the program to Closed or deactivate the level.',
          },
        ],
      },
      su: {
        title: 'Pangajén kokurikuler: tingkat capaian, catetan, jeung bukti',
        summary:
          'Cara mariksa murid dina butir tujuan program kokurikuler per semester jeung rombel, ngeusian sakaligus, ngalampirkeun bukti mangrupa tumbu, sarta ngarti saha nu meunang mariksa jeung konci nalika rapor final.',
        forWho:
          'Admin sakola jeung Kurikulum (sakabéh rombel), koordinator program (sakabéh rombel program), jeung guru fasilitator (rombelna wungkul); kepala sakola jeung operator bisa ningali.',
        sections: [
          {
            heading: 'Naon nu dipariksa',
            body: 'Unggal murid dipariksa dina unggal butir tujuan program (upamana dimensi profil lulusan) ku hiji tingkat rubrik tina Pangaturan kokurikuler jeung, lamun perlu, catetan pondok. Ngan pangajén sumatif per semester nu disimpen. Kokurikuler lain mata pelajaran: pangajén ieu henteu asup kana nilai ahir, rata-rata, pangkat, kanaékan kelas, atawa kalulusan.',
            href: '/cocurricular',
          },
          {
            heading: 'Ngeusian pangajén',
            body: 'Dina tab Pangajén, pilih semester jeung rombel. Di ponsel unggal murid kaciri minangka kartu; di layar lega minangka matriks murid jeung butir. Pilih tingkat dina unggal butir, buka tombol catetan lamun perlu nulis, tuluy simpen. Ngosongkeun tingkat jeung catetan miceun pangajén sél éta. Sakali simpen nampung nepi ka 500 sél; kaca ngabagina sacara otomatis.',
            steps: [
              'Buka program, tab Pangajén.',
              'Pilih semester jeung rombel.',
              'Pilih tingkat unggal murid dina unggal butir; ikon pesen muka catetan.',
              'Pikeun méré sakabéh murid tingkat nu sarua dina hiji butir, pake Eusian sakaligus tuluy Larapkeun ka sakabéh.',
              'Klik Simpen dina bar handap; tanda Aya parobahan nu acan kasimpen leungit sanggeus kasimpen.',
            ],
            href: '/cocurricular',
            tip: 'Eusian heula tingkat rubrik dina Pangaturan kokurikuler; tanpa rubrik ngan catetan nu bisa dieusian.',
          },
          {
            heading: 'Saha nu meunang mariksa',
            body: 'Admin sakola jeung Kurikulum meunang mariksa sakabéh rombel. Koordinator program meunang mariksa sakabéh rombel program éta, jeung fasilitator ngan rombel nu ditugaskeun ka manéhna dina tab Rombel jeung fasilitator. Guru séjén teu nempo pangajén program éta jeung ditolak lamun nyoba mariksa. Kepala sakola jeung operator bisa ningali sakabéh rombel tanpa bisa ngarobah.',
          },
          {
            heading: 'Rapor final ngonci pangajén',
            body: 'Lamun rapor murid dina semester éta geus difinalkeun, pangajén murid éta teu bisa dirobah nepi ka raporna dibuka deui dina ménu Rapor. Murid séjén nu raporna acan final tetep bisa dipariksa. Program, rombel, atawa butir nu geus boga pangajén teu bisa dipupus atawa dicabut, jeung tingkat rubrik nu geus dipaké teu bisa dipupus (nonaktipkeun waé). Program nu statusna Réngsé ngan bisa dibaca.',
          },
          {
            heading: 'Bukti karya',
            body: 'Tab Bukti nyimpen tumbu https ka karya atawa dokuméntasi kagiatan (judul jeung tumbu, paling réa 500 karakter) per rombel atawa pikeun sakabéh program. Ngan tumbu https nu ditampa; unggah koropak acan sayogi. Tumbu dibuka dina tab anyar.',
            steps: [
              'Buka program, tab Bukti.',
              'Pilih rombel (atawa Sakabéh program lamun Anjeun pangurus atawa koordinator).',
              'Eusian judul jeung tumbu nu dimimitian ku https://, tuluy klik Tambah bukti.',
            ],
            href: '/cocurricular',
          },
        ],
        faq: [
          {
            q: 'Naha abdi teu bisa nyimpen jeung muncul pesen rapor geus difinalkeun?',
            a: 'Rapor murid éta dina semester éta geus final. Pénta wali kelas atawa pangurus rapor muka deui dina ménu Rapor, tuluy simpen deui.',
          },
          {
            q: 'Naha abdi teu ningali rombel nu tangtu?',
            a: 'Fasilitator ngan ningali rombel nu ditugaskeun ka manéhna. Pénta admin sakola atawa Kurikulum nambahan Anjeun dina tab Rombel jeung fasilitator.',
          },
          {
            q: 'Naha tumbu bukti ditolak?',
            a: 'Bukti kudu mangrupa tumbu nu dimimitian ku https://, tanpa spasi, paling réa 500 karakter. Tumbu http biasa teu ditampa.',
          },
          {
            q: 'Naha abdi teu bisa mupus program atawa tingkat rubrik?',
            a: 'Program, rombel, atawa butir nu geus dipariksa jeung tingkat rubrik nu geus dipaké teu bisa dipupus. Robah status program jadi Réngsé atawa nonaktipkeun tingkatna.',
          },
        ],
      },
    },
  },
  {
    slug: 'cocurricular-report',
    icon: 'layers',
    tone: 'violet',
    group: 'academic',
    module: 'grades',
    text: {
      id: {
        title: 'Kokurikuler di rapor: bagian terstruktur dan deskripsi',
        summary:
          'Bagaimana penilaian kokurikuler muncul di rapor (pratinjau, PDF, portal orang tua), cara menyusun draf deskripsi dari penilaian, dan mengapa kokurikuler kosong tidak menghalangi finalisasi.',
        forWho: 'Wali kelas dan pengelola rapor yang menyiapkan rapor; orang tua melihat hasilnya di portal.',
        sections: [
          {
            heading: 'Bagian kokurikuler pada rapor',
            body: 'Bila seorang murid punya penilaian pada program kokurikuler yang diatur tampil di rapor, rapornya memuat bagian Penilaian kokurikuler: per program, daftar butir (misalnya dimensi profil lulusan), tingkat capaian, dan catatan. Murid tanpa penilaian tidak mendapat bagian ini dan rapornya sama seperti sebelumnya. Bagian ini muncul di pratinjau, PDF, dan portal orang tua. Pengaturan Tampilkan bagian kokurikuler di PDF hanya mengatur kotak deskripsi teks; bagian terstruktur ditentukan oleh pengaturan Tampil di rapor pada program.',
            href: '/report-cards',
          },
          {
            heading: 'Menyusun draf deskripsi dari penilaian',
            body: 'Di Catatan rapor murid, tombol Susun dari penilaian kokurikuler menyusun draf kalimat dari penilaian murid dan memasukkannya ke kolom Catatan kokurikuler. Draf menggantikan isi kolom itu di layar saja. Sunting sesuai kebutuhan lalu klik Simpan; server tidak pernah mengisi catatan ini otomatis, jadi tidak ada perubahan rapor tanpa sepengetahuan guru.',
            steps: [
              'Buka menu Rapor, pilih kelas, lalu pilih Catatan rapor pada murid.',
              'Klik Susun dari penilaian kokurikuler.',
              'Periksa dan sunting teksnya (maksimal 1.000 karakter).',
              'Klik Simpan.',
            ],
            href: '/report-cards',
            tip: 'Tombol hanya muncul bila murid punya penilaian kokurikuler.',
          },
          {
            heading: 'Finalisasi dan lencana info',
            body: 'Kokurikuler yang belum dinilai tidak menghalangi finalisasi rapor. Pada daftar rapor, murid yang rombelnya ikut program kokurikuler aktif tetapi belum dinilai diberi lencana Kokurikuler belum dinilai sebagai pengingat. Saat rapor difinalkan, bagian kokurikuler dibekukan bersama nama butir dan tingkatnya, sehingga perubahan label sesudahnya tidak mengubah rapor final. Buka kembali rapor untuk memperbarui.',
            href: '/report-cards',
          },
        ],
        faq: [
          {
            q: 'Mengapa bagian kokurikuler tidak muncul di rapor murid?',
            a: 'Murid itu belum punya penilaian kokurikuler pada semester tersebut, atau programnya diatur tidak tampil di rapor.',
          },
          {
            q: 'Apakah rapor final berubah bila saya mengganti label butir?',
            a: 'Tidak. Rapor final memakai label saat difinalkan. Buka kembali rapornya lalu finalkan ulang untuk memakai label baru.',
          },
        ],
      },
      en: {
        title: 'Cocurricular on the report card: structured section and description',
        summary:
          'How cocurricular assessment appears on the report card (preview, PDF, parent portal), how to compose a description draft from it, and why an empty cocurricular does not block finalization.',
        forWho:
          'Homeroom teachers and report managers preparing report cards; parents see the result in the portal.',
        sections: [
          {
            heading: 'The cocurricular section on the report card',
            body: 'When a student has assessments on a cocurricular program set to appear on report cards, the report includes a Cocurricular assessment section: per program, the items (for example graduate profile dimensions), the achievement level, and notes. A student without assessments gets no such section and the report stays as before. It shows in the preview, the PDF, and the parent portal. The Show the cocurricular section in the PDF setting only controls the text description box; the structured section follows the program Show in report setting.',
            href: '/report-cards',
          },
          {
            heading: 'Composing a description draft from the assessment',
            body: 'In a student Report notes, the Compose from cocurricular assessment button builds a draft sentence from the assessment and places it in the Cocurricular note field. The draft replaces that field on screen only. Edit it as needed and click Save; the server never fills this note automatically, so the report never changes without the teacher knowing.',
            steps: [
              'Open Report cards, choose a class, then choose Report notes on a student.',
              'Click Compose from cocurricular assessment.',
              'Review and edit the text (up to 1,000 characters).',
              'Click Save.',
            ],
            href: '/report-cards',
            tip: 'The button appears only when the student has cocurricular assessments.',
          },
          {
            heading: 'Finalization and the info badge',
            body: 'An unassessed cocurricular does not block report finalization. In the report list, a student whose class takes part in an active cocurricular program but has no assessment gets a Cocurricular not assessed badge as a reminder. When a report is finalized, the cocurricular section is frozen together with the item and level names, so later label changes do not alter the final report. Reopen the report to refresh it.',
            href: '/report-cards',
          },
        ],
        faq: [
          {
            q: 'Why does the cocurricular section not appear on a student report?',
            a: 'The student has no cocurricular assessment for that semester, or the program is set not to appear on report cards.',
          },
          {
            q: 'Does a final report change if I rename an item label?',
            a: 'No. A final report uses the labels from when it was finalized. Reopen it and finalize again to use the new labels.',
          },
        ],
      },
      su: {
        title: 'Kokurikuler dina rapor: bagian terstruktur jeung déskripsi',
        summary:
          'Kumaha pangajén kokurikuler muncul dina rapor (pramuninggal, PDF, portal kolot), cara nyusun dramana déskripsi tina pangajén, sarta naha kokurikuler kosong teu ngahalangan finalisasi.',
        forWho: 'Wali kelas jeung pangurus rapor nu nyiapkeun rapor; kolot ningali hasilna dina portal.',
        sections: [
          {
            heading: 'Bagian kokurikuler dina rapor',
            body: 'Lamun murid boga pangajén dina program kokurikuler nu diatur muncul dina rapor, raporna ngandung bagian Penilaian kokurikuler: per program, daptar butir (upamana dimensi profil lulusan), tingkat capaian, jeung catetan. Murid tanpa pangajén teu meunang bagian ieu jeung raporna sarua jiga samemehna. Bagian ieu muncul dina pramuninggal, PDF, jeung portal kolot. Pangaturan Témbongkeun bagian kokurikuler dina PDF ngan ngatur kotak déskripsi téks; bagian terstruktur ditangtukeun ku pangaturan Muncul dina rapor dina program.',
            href: '/report-cards',
          },
          {
            heading: 'Nyusun dramana déskripsi tina pangajén',
            body: 'Dina Catetan rapor murid, tombol Susun tina penilaian kokurikuler nyusun dramana kalimah tina pangajén murid tuluy nempatkeunana dina kolom Catetan kokurikuler. Dramana ngagantikeun eusi kolom éta dina layar wungkul. Édit saperlu tuluy klik Simpen; server henteu kungsi ngeusian catetan ieu sacara otomatis, jadi rapor teu robah tanpa sepengetahuan guru.',
            steps: [
              'Buka ménu Rapor, pilih kelas, tuluy pilih Catetan rapor dina murid.',
              'Klik Susun tina penilaian kokurikuler.',
              'Pariksa jeung édit téksna (pangpangna 1.000 karakter).',
              'Klik Simpen.',
            ],
            href: '/report-cards',
            tip: 'Tombolna ngan muncul lamun murid boga pangajén kokurikuler.',
          },
          {
            heading: 'Finalisasi jeung lencana info',
            body: 'Kokurikuler nu can dipariksa teu ngahalangan finalisasi rapor. Dina daptar rapor, murid nu rombelna milu program kokurikuler aktip tapi can dipariksa dibéré lencana Kokurikuler can dinilai minangka pangéling-ngéling. Waktu rapor difinalkeun, bagian kokurikuler dibekukeun jeung ngaran butir jeung tingkatna, jadi parobahan labél satuluyna teu ngarobah rapor final. Buka deui rapor pikeun nganyarian.',
            href: '/report-cards',
          },
        ],
        faq: [
          {
            q: 'Naha bagian kokurikuler teu muncul dina rapor murid?',
            a: 'Murid éta can boga pangajén kokurikuler dina semester éta, atawa programna diatur teu muncul dina rapor.',
          },
          {
            q: 'Naha rapor final robah lamun kuring ngarobah labél butir?',
            a: 'Henteu. Rapor final maké labél waktu difinalkeun. Buka deui tuluy finalkeun deui pikeun maké labél anyar.',
          },
        ],
      },
    },
  },
  {
    slug: 'madrasah-identity',
    icon: 'school',
    tone: 'teal',
    group: 'academic',
    text: {
      id: {
        title: 'Madrasah: NSM di kop rapor dan rumpun PAI/Bahasa Arab',
        summary:
          'Cara mengisi NSM madrasah agar tampil di kop rapor, cara mengadopsi rumpun PAI/Bahasa Arab untuk MI dan MA bersama mapel umum, dan bahasa judul PDF rapor.',
        forWho: 'Admin madrasah (MI, MTs, MA, MAK) dan kurikulum yang menyiapkan mapel serta rapor.',
        sections: [
          {
            heading: 'Mengisi NSM',
            body: 'Di Pengaturan sekolah, tab Identitas, madrasah punya kolom NSM (Nomor Statistik Madrasah). Isi 8 sampai 16 angka; rentang ini sengaja longgar karena format resmi belum diverifikasi, dan akan diperketat kemudian. Satu NSM hanya bisa dipakai satu sekolah. Kolom hanya tampil untuk jenjang MI, MTs, MA, dan MAK, dan hanya admin sekolah yang dapat menyimpannya. Mengosongkan kolom menghapus NSM dari kop.',
            steps: [
              'Buka Pengaturan sekolah, lalu tab Identitas.',
              'Isi kolom NSM dengan angka saja (spasi dan strip dibuang otomatis).',
              'Klik Simpan NSM.',
            ],
            href: '/school-settings',
            tip: 'Sekolah yang tidak mengisi NSM tidak berubah sama sekali: rapornya persis seperti sebelumnya.',
          },
          {
            heading: 'NSM di kop rapor',
            body: 'Bila NSM terisi, kop rapor memuat baris NSM di pratinjau, PDF, dan portal orang tua. Saat rapor difinalkan, NSM ikut dibekukan; mengganti NSM sesudahnya tidak mengubah rapor final. Buka kembali rapor lalu finalkan ulang untuk memakai NSM baru.',
            href: '/report-cards',
          },
          {
            heading: 'Rumpun PAI dan Bahasa Arab untuk MI dan MA',
            body: 'Bank kurikulum KMA kini memuat lima nama mapel rumpun PAI dan Bahasa Arab (Al-Qur’an Hadis, Akidah Akhlak, Fikih, Sejarah Kebudayaan Islam, Bahasa Arab) untuk MI dan MA, selain MTs. Madrasah mengadopsi kurikulum umum (Merdeka) dan KMA sekaligus; salinan mapel KMA otomatis masuk kelompok Rumpun PAI dan Bahasa Arab. Hanya nama yang disediakan: jam pelajaran, mapel khusus MA (misalnya program keagamaan), dan aturan per tingkat belum disediakan karena teks KMA 1503/2025 belum diverifikasi, jadi isi sendiri lewat mapel dan alokasi jam.',
            steps: [
              'Buka Kurikulum, lalu bagian Bank data kurikulum.',
              'Pilih kurikulum umum untuk jenjang Anda dan adopsi mapelnya.',
              'Pilih Kurikulum madrasah (KMA) dengan jenjang yang sama, lalu adopsi.',
              'Atur jam pelajaran dan mapel tambahan di struktur kurikulum.',
            ],
            href: '/curriculum',
            warning:
              'Acuan umum (Merdeka) belum tersedia untuk jenjang SD/MI: di MI, mapel umum diisi manual atau lewat impor.',
          },
          {
            heading: 'Bahasa judul PDF rapor',
            body: 'Judul PDF rapor, label NSM, dan bagian Penilaian kokurikuler mengikuti bahasa yang Anda pilih (Indonesia, Inggris, atau Sunda). Teks lain di PDF masih berbahasa Indonesia.',
          },
        ],
        faq: [
          {
            q: 'Mengapa kolom NSM tidak muncul?',
            a: 'Kolom hanya tampil untuk jenjang madrasah (MI, MTs, MA, MAK). Jenjang unit ditetapkan admin platform.',
          },
          {
            q: 'NSM saya ditolak karena sudah dipakai.',
            a: 'Satu NSM hanya boleh terdaftar di satu sekolah. Periksa kembali nomornya; bila benar milik Anda, hubungi dukungan.',
          },
        ],
      },
      en: {
        title: 'Madrasah: NSM on the report card header and the Islamic Studies / Arabic group',
        summary:
          'How to enter the madrasah NSM so it prints in the report card header, how to adopt the Islamic Studies and Arabic group for MI and MA together with general subjects, and the language of the report PDF title.',
        forWho:
          'Madrasah admins (MI, MTs, MA, MAK) and curriculum staff preparing subjects and report cards.',
        sections: [
          {
            heading: 'Entering the NSM',
            body: 'In School settings, the Identity tab, a madrasah has an NSM (Madrasah Statistics Number) field. Enter 8 to 16 digits; the range is deliberately loose because the official format is not yet verified, and will be tightened later. One NSM can belong to one school only. The field shows only for MI, MTs, MA, and MAK, and only a school admin can save it. Clearing the field removes the NSM from the header.',
            steps: [
              'Open School settings, then the Identity tab.',
              'Enter the NSM using digits only (spaces and dashes are removed automatically).',
              'Click Save NSM.',
            ],
            href: '/school-settings',
            tip: 'A school that leaves the NSM empty is not affected at all: its report cards stay exactly as before.',
          },
          {
            heading: 'NSM in the report card header',
            body: 'When the NSM is filled in, the report card header carries an NSM line in the preview, the PDF, and the parent portal. When a report is finalized the NSM is frozen with it; changing the NSM later does not alter a final report. Reopen the report and finalize again to use the new NSM.',
            href: '/report-cards',
          },
          {
            heading: 'Islamic Studies and Arabic group for MI and MA',
            body: 'The KMA curriculum bank now holds five Islamic Studies and Arabic subject names (Qur’an Hadith, Creed and Morals, Fiqh, Islamic Cultural History, Arabic) for MI and MA, in addition to MTs. A madrasah adopts the general curriculum (Merdeka) and KMA together; the KMA subject copies automatically join the Islamic Studies and Arabic group. Only names are provided: lesson periods, MA-specific subjects (for example the religious program), and per-grade rules are not provided because the text of KMA 1503/2025 is not yet verified, so enter them yourself through subjects and period allocation.',
            steps: [
              'Open Curriculum, then the Curriculum bank section.',
              'Choose the general curriculum for your level and adopt its subjects.',
              'Choose Madrasah curriculum (KMA) for the same level, then adopt.',
              'Set lesson periods and extra subjects in the curriculum structure.',
            ],
            href: '/curriculum',
            warning:
              'The general reference (Merdeka) is not yet available for primary/MI: in an MI, enter general subjects manually or by import.',
          },
          {
            heading: 'Language of the report PDF title',
            body: 'The report PDF title, the NSM label, and the Cocurricular assessment section follow the language you chose (Indonesian, English, or Sundanese). Other text in the PDF is still Indonesian.',
          },
        ],
        faq: [
          {
            q: 'Why does the NSM field not appear?',
            a: 'The field appears only for madrasah levels (MI, MTs, MA, MAK). The unit level is set by a platform admin.',
          },
          {
            q: 'My NSM was rejected because it is already in use.',
            a: 'One NSM can be registered to one school only. Check the number again; if it is yours, contact support.',
          },
        ],
      },
      su: {
        title: 'Madrasah: NSM dina kop rapor jeung rumpun PAI/Basa Arab',
        summary:
          'Cara ngeusian NSM madrasah sangkan muncul dina kop rapor, cara ngadopsi rumpun PAI/Basa Arab keur MI jeung MA babarengan jeung mapel umum, sarta basa judul PDF rapor.',
        forWho: 'Admin madrasah (MI, MTs, MA, MAK) jeung kurikulum nu nyiapkeun mapel sarta rapor.',
        sections: [
          {
            heading: 'Ngeusian NSM',
            body: 'Dina Pangaturan sakola, tab Idéntitas, madrasah boga kolom NSM (Nomer Statistik Madrasah). Eusian 8 nepi ka 16 angka; rentang ieu sengaja lega sabab format resmina can diverifikasi, bakal diketatkeun engké. Hiji NSM ngan bisa dipaké ku hiji sakola. Kolomna ngan muncul keur jenjang MI, MTs, MA, jeung MAK, sarta ngan admin sakola nu bisa nyimpenna. Ngosongkeun kolom ngahapus NSM tina kop.',
            steps: [
              'Buka Pangaturan sakola, tuluy tab Idéntitas.',
              'Eusian kolom NSM ku angka wungkul (spasi jeung strip dibuang otomatis).',
              'Klik Simpen NSM.',
            ],
            href: '/school-settings',
            tip: 'Sakola nu henteu ngeusian NSM teu robah sama sakali: raporna persis jiga samemehna.',
          },
          {
            heading: 'NSM dina kop rapor',
            body: 'Lamun NSM dieusian, kop rapor ngandung baris NSM dina pramuninggal, PDF, jeung portal kolot. Waktu rapor difinalkeun, NSM ikut dibekukeun; ngarobah NSM satuluyna teu ngarobah rapor final. Buka deui rapor tuluy finalkeun deui pikeun maké NSM anyar.',
            href: '/report-cards',
          },
          {
            heading: 'Rumpun PAI jeung Basa Arab keur MI jeung MA',
            body: 'Bank kurikulum KMA ayeuna ngandung lima ngaran mapel rumpun PAI jeung Basa Arab (Al-Qur’an Hadis, Akidah Akhlak, Fikih, Sajarah Kabudayaan Islam, Basa Arab) keur MI jeung MA, salian ti MTs. Madrasah ngadopsi kurikulum umum (Merdeka) jeung KMA sakaligus; salinan mapel KMA otomatis asup kana kelompok Rumpun PAI jeung Basa Arab. Nu disayogikeun ngan ngaranna: jam pelajaran, mapel husus MA (upamana program kaagamaan), jeung aturan per tingkat can disayogikeun sabab téks KMA 1503/2025 can diverifikasi, jadi eusian sorangan ngaliwatan mapel jeung alokasi jam.',
            steps: [
              'Buka Kurikulum, tuluy bagian Bank data kurikulum.',
              'Pilih kurikulum umum keur jenjang Anjeun tuluy adopsi mapelna.',
              'Pilih Kurikulum madrasah (KMA) jeung jenjang nu sarua, tuluy adopsi.',
              'Atur jam pelajaran jeung mapel tambahan dina struktur kurikulum.',
            ],
            href: '/curriculum',
            warning:
              'Acuan umum (Merdeka) can aya keur SD/MI: di MI, mapel umum diasupkeun sacara manual atawa ngaliwatan impor.',
          },
          {
            heading: 'Basa judul PDF rapor',
            body: 'Judul PDF rapor, labél NSM, jeung bagian Penilaian kokurikuler nuturkeun basa nu Anjeun pilih (Indonésia, Inggris, atawa Sunda). Téks séjén dina PDF masih basa Indonésia.',
          },
        ],
        faq: [
          {
            q: 'Naha kolom NSM teu muncul?',
            a: 'Kolomna ngan muncul keur jenjang madrasah (MI, MTs, MA, MAK). Jenjang unit ditetepkeun ku admin platform.',
          },
          {
            q: 'NSM kuring ditolak sabab geus dipaké.',
            a: 'Hiji NSM ngan meunang kadaptar di hiji sakola. Pariksa deui nomorna; upami éta milik Anjeun, hubungi rojongan.',
          },
        ],
      },
    },
  },
  {
    slug: 'vocational-structure',
    icon: 'briefcase',
    tone: 'sky',
    group: 'academic',
    module: 'internship',
    text: {
      id: {
        title: 'SMK: bidang, program, konsentrasi keahlian dan rapor berkelompok',
        summary:
          'Cara menyusun hierarki Bidang, Program, dan Konsentrasi Keahlian sekolah, menautkan jurusan (unit kelas) ke konsentrasi, serta menyalakan rapor yang mengelompokkan mapel Umum/Kejuruan dengan identitas keahlian di kop.',
        forWho: 'Admin dan kurikulum SMK/MAK yang menyiapkan struktur keahlian dan rapor.',
        sections: [
          {
            heading: 'Menyusun bidang, program, dan konsentrasi keahlian',
            body: 'Di halaman Kelas, tombol Keahlian (hanya jenjang kejuruan dengan modul PKL aktif) membuka hierarki keahlian. Daftarnya tidak diisi otomatis: spektrum keahlian resmi berbeda antarsumber dan lampiran 244/M/2024 belum diverifikasi, jadi sekolah mengisi bidang, program, dan konsentrasi yang ia layani sesuai SK Dinas atau Dapodik. Kode Dapodik dan rujukan sumber bersifat opsional. Kode harus unik per sekolah; bidang, program, atau konsentrasi yang masih punya isi di bawahnya tidak bisa dihapus, nonaktifkan saja.',
            steps: [
              'Buka Kelas, lalu klik Keahlian.',
              'Tambah bidang keahlian, lalu tambah program keahlian di bawahnya.',
              'Tambah konsentrasi keahlian di bawah program.',
              'Isi kode Dapodik bila ada (opsional).',
            ],
            href: '/classes/expertise',
          },
          {
            heading: 'Menautkan jurusan ke konsentrasi',
            body: 'Jurusan di Kelas (misalnya RPL 3 tahun dan RPL 4 tahun) tetap menjadi unit operasional kelas, jam pelajaran, dan KKTP. Tautan ke konsentrasi hanya menambahkan identitas keahlian: satu konsentrasi boleh dipakai dua jurusan (3 dan 4 tahun). Tautkan dari kartu konsentrasi atau dari dialog Jurusan di halaman Kelas. Menautkan tidak mengubah kelas, nilai, atau rapor yang sudah ada.',
            href: '/classes',
          },
          {
            heading: 'Rapor berkelompok dan identitas keahlian',
            body: 'Di Pengaturan rapor ada sakelar Kelompokkan mapel (Umum/Kejuruan) dan tampilkan identitas keahlian. Bila menyala, rapor memuat subjudul menurut kelompok mapel (dari kelompok yang diatur di tiap mapel, misalnya Kelompok Mata Pelajaran Umum atau Kelompok Kejuruan), mapel diurutkan per kelompok, dan kop memuat Bidang, Program, dan Konsentrasi Keahlian bila jurusan rombel sudah ditautkan. Mapel yang belum diberi kelompok ditampilkan di akhir. Sakelar mati bawaan: sekolah yang tidak menyalakannya, dan semua sekolah non-SMK, mendapat rapor persis seperti sebelumnya.',
            steps: [
              'Pastikan mapel SMK sudah diberi kelompok di Mata pelajaran.',
              'Buka Pengaturan rapor, bagian Rapor SMK.',
              'Centang Kelompokkan mapel dan tampilkan identitas keahlian.',
              'Buka rapor siswa untuk memeriksa pratinjau dan PDF.',
            ],
            href: '/report-cards/settings',
            warning:
              'Rapor yang sudah final tidak berubah. Buka kembali rapor lalu finalkan ulang agar memakai pengaturan baru.',
          },
        ],
        faq: [
          {
            q: 'Tombol Keahlian tidak muncul.',
            a: 'Tombol hanya tampil untuk jenjang kejuruan (SMK/MAK) dengan modul Praktik Kerja Lapangan aktif, dan perlu izin mengelola kelas untuk mengubah.',
          },
          {
            q: 'Mengapa kop rapor tidak memuat bidang keahlian?',
            a: 'Kop hanya memuat identitas keahlian bila sakelar rapor kejuruan menyala dan jurusan rombel ditautkan ke konsentrasi.',
          },
        ],
      },
      en: {
        title: 'Vocational: fields, programs, skill concentrations and the grouped report card',
        summary:
          'How to build the school’s Field, Program, and Skill Concentration hierarchy, link programs (class units) to a concentration, and turn on a report card that groups General/Vocational subjects with the skills identity in the header.',
        forWho: 'SMK/MAK admins and curriculum staff preparing the skills structure and report cards.',
        sections: [
          {
            heading: 'Building fields, programs, and skill concentrations',
            body: 'On the Classes page, the Skills button (vocational levels with the internship module active only) opens the skills hierarchy. The list is not filled automatically: the official skills spectrum differs between sources and annex 244/M/2024 is not yet verified, so the school enters the fields, programs, and concentrations it offers according to its Dinas decree or Dapodik. The Dapodik code and source reference are optional. Codes must be unique per school; a field, program, or concentration that still has items under it cannot be deleted, deactivate it instead.',
            steps: [
              'Open Classes, then click Skills.',
              'Add a field of expertise, then add a program of expertise under it.',
              'Add a skill concentration under the program.',
              'Enter the Dapodik code if you have one (optional).',
            ],
            href: '/classes/expertise',
          },
          {
            heading: 'Linking programs to a concentration',
            body: 'The programs under Classes (for example RPL 3 years and RPL 4 years) remain the operational unit for classes, lesson periods, and KKTP. Linking to a concentration only adds the skills identity: one concentration can be used by two programs (3 and 4 years). Link from the concentration card or from the Programs dialog on the Classes page. Linking does not change existing classes, grades, or report cards.',
            href: '/classes',
          },
          {
            heading: 'Grouped report card and skills identity',
            body: 'Report card settings has a switch, Group subjects (General/Vocational) and show the skills identity. When on, the report card shows headings per subject group (from the group set on each subject, for example General Subjects Group or Vocational Group), orders subjects by group, and the header shows the Field, Program, and Skill Concentration when the class program is linked. Subjects without a group appear at the end. The switch is off by default: a school that does not turn it on, and every non-SMK school, gets report cards exactly as before.',
            steps: [
              'Make sure the SMK subjects have a group under Subjects.',
              'Open Report card settings, the Vocational report card section.',
              'Tick Group subjects and show the skills identity.',
              'Open a student’s report card to check the preview and PDF.',
            ],
            href: '/report-cards/settings',
            warning:
              'A final report card does not change. Reopen the report and finalize again to use the new setting.',
          },
        ],
        faq: [
          {
            q: 'The Skills button does not appear.',
            a: 'The button appears only for vocational levels (SMK/MAK) with the Internship module active, and changing it needs the permission to manage classes.',
          },
          {
            q: 'Why does the report header not show the field of expertise?',
            a: 'The header shows the skills identity only when the vocational report switch is on and the class program is linked to a concentration.',
          },
        ],
      },
      su: {
        title: 'SMK: bidang, program, konsentrasi kaahlian jeung rapor kelompok',
        summary:
          'Cara nyusun hirarki Bidang, Program, jeung Konsentrasi Kaahlian sakola, nautkeun jurusan (unit kelas) ka konsentrasi, sarta nyaangkeun rapor nu ngelompokkeun mapel Umum/Kejuruan jeung identitas kaahlian dina kop.',
        forWho: 'Admin jeung kurikulum SMK/MAK nu nyiapkeun struktur kaahlian jeung rapor.',
        sections: [
          {
            heading: 'Nyusun bidang, program, jeung konsentrasi kaahlian',
            body: 'Dina kaca Kelas, tombol Kaahlian (ngan jenjang kejuruan nu modul PKL-na aktip) muka hirarki kaahlian. Daptarna henteu diisi otomatis: spéktrum kaahlian resmi béda antarsumber jeung lampiran 244/M/2024 can diverifikasi, jadi sakola ngeusian bidang, program, jeung konsentrasi nu dilayanan luyu jeung SK Dinas atawa Dapodik. Kode Dapodik jeung rujukan sumber sipatna opsional. Kode kudu unik per sakola; bidang, program, atawa konsentrasi nu masih aya eusina teu bisa dihapus, nonaktipkeun waé.',
            steps: [
              'Buka Kelas, tuluy klik Kaahlian.',
              'Tambah bidang kaahlian, tuluy tambah program kaahlian di handapeunana.',
              'Tambah konsentrasi kaahlian di handapeun program.',
              'Eusian kode Dapodik lamun aya (opsional).',
            ],
            href: '/classes/expertise',
          },
          {
            heading: 'Nautkeun jurusan ka konsentrasi',
            body: 'Jurusan di Kelas (upamana RPL 3 taun jeung RPL 4 taun) tetep jadi unit operasional kelas, jam pelajaran, jeung KKTP. Tautan ka konsentrasi ngan nambahan identitas kaahlian: hiji konsentrasi meunang dipaké ku dua jurusan (3 jeung 4 taun). Tautkeun tina kartu konsentrasi atawa tina dialog Jurusan di kaca Kelas. Nautkeun teu ngarobah kelas, nilai, atawa rapor nu geus aya.',
            href: '/classes',
          },
          {
            heading: 'Rapor kelompok jeung identitas kaahlian',
            body: 'Dina Setélan rapor aya sakelar Kelompokkeun mapel (Umum/Kejuruan) jeung témbongkeun identitas kaahlian. Lamun hurung, rapor ngandung sub-judul nurutkeun kelompok mapel (tina kelompok nu diatur dina unggal mapel, upamana Kelompok Mata Pelajaran Umum atawa Kelompok Kejuruan), mapel diurutkeun per kelompok, jeung kop ngandung Bidang, Program, jeung Konsentrasi Kaahlian lamun jurusan rombél geus ditautkeun. Mapel nu can boga kelompok némbongan di tungtung. Sakelarna pareum sacara baku: sakola nu henteu nyaangkeunana, jeung sakabéh sakola non-SMK, meunang rapor persis siga saméméhna.',
            steps: [
              'Pastikeun mapel SMK geus dibéré kelompok di Mata pelajaran.',
              'Buka Setélan rapor, bagian Rapor SMK.',
              'Centang Kelompokkeun mapel jeung témbongkeun identitas kaahlian.',
              'Buka rapor siswa pikeun mariksa pratayang jeung PDF.',
            ],
            href: '/report-cards/settings',
            warning:
              'Rapor nu geus final teu robah. Buka deui rapor tuluy finalkeun deui sangkan maké setélan anyar.',
          },
        ],
        faq: [
          {
            q: 'Tombol Kaahlian teu muncul.',
            a: 'Tombolna ngan muncul pikeun jenjang kejuruan (SMK/MAK) nu modul Praktik Kerja Lapangan-na aktip, sarta ngarobah merlukeun idin ngokolakeun kelas.',
          },
          {
            q: 'Naha kop rapor teu ngandung bidang kaahlian?',
            a: 'Kop ngan ngandung identitas kaahlian lamun sakelar rapor kejuruan hurung jeung jurusan rombél ditautkeun ka konsentrasi.',
          },
        ],
      },
    },
  },
];
