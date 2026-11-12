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
            q: 'Mode persentase tidak bisa disimpan. Mengapa?',
            a: 'Mode persentase mensyaratkan jumlah bobot semua komponen tepat 100%. Saat Anda memilih mode ini, layar menampilkan jumlah bobot saat ini. Bila bukan 100%, muncul peringatan merah dan tombol Simpan tidak aktif. Ubah bobot di kartu Komponen nilai sampai jumlahnya 100%, lalu simpan lagi. Mode lain tidak mensyaratkan jumlah bobot 100%.',
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
              'Enter the school\'s default mastery threshold (KKM) and the A, B, and C thresholds. A must be higher than B, and B higher than C. This threshold applies to subjects without their own Learning Objective Achievement Criteria (KKTP); a threshold per subject (decimals allowed) is set in the KKTP tab of Curriculum. In the same place you choose how the final grade is calculated; changing it affects draft report cards and is refused while the active semester has finalized report cards.',
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
              'A component created after a semester was frozen does not apply to that semester yet. If an assessment is refused because of this, open Grading settings and choose Match today\'s rules for that semester.',
          },
          {
            heading: 'Who can do what',
            body: 'Teachers can only view and fill in scores for the classes and subjects they teach. Operators and School admins can fill in every class. The Principal and Curriculum staff can view all classes and subjects. Grading settings (passing mark, predicates, weights) can only be changed by Curriculum staff, Operators, and School admins. Grades and report cards are one module. Extracurriculars have their own predicate in the Extracurricular module, and it appears on the report card.',
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
            q: 'Why can I not save the percentage mode?',
            a: 'The percentage mode needs the weights of all components to add up to exactly 100%. When you pick this mode, the screen shows the current total weight. If it is not 100%, a red warning appears and the Save button is disabled. Change the weights in the Grade components card until they add up to 100%, then save again. The other modes do not need the weights to add up to 100%.',
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
            q: 'Naha mode persén teu bisa disimpen?',
            a: 'Mode persén merlukeun jumlah bobot sakabéh komponén pas 100%. Nalika milih mode ieu, layar nembongkeun jumlah bobot ayeuna. Lamun lain 100%, aya paringatan beureum jeung tombol Simpen teu aktif. Robah bobot dina kartu Komponén nilai nepi ka jumlahna 100%, tuluy simpen deui. Mode séjén teu merlukeun jumlah bobot 100%.',
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
            body: 'Di tab Penilaian, pilih semester lalu beri tiap anggota predikat A sampai D beserta keterangan. Predikat ini tampil di rapor siswa. Tab Laporan merangkum kehadiran tiap anggota pada rentang tanggal yang dipilih (bawaannya 90 hari terakhir, paling lama 366 hari) dan bisa diunduh sebagai Excel.',
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
            body: 'On the Assessment tab, pick a semester and give each member a predicate from A to D with a note. This predicate appears on the student report card. The Report tab summarizes each member attendance over the chosen date range (default the last 90 days, at most 366 days) and can be downloaded as Excel.',
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
            body: 'Dina tab Penilaian, pilih semester tuluy pasihan unggal anggota predikat A dugi ka D sareng katerangan. Predikat ieu muncul dina rapor siswa. Tab Laporan ngarangkum kahadiran unggal anggota dina rentang tanggal nu dipilih (bawaan 90 poé panungtung, paling lami 366 poé) tur tiasa diunduh jadi Excel.',
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
            body: 'Langkah ini menyiapkan tahun tujuan. Kelas 7A menjadi 8A di tahun tujuan, lengkap dengan wali kelas dan guru mata pelajarannya. Kelas tingkat pertama juga disalin apa adanya untuk siswa baru dan siswa yang tinggal kelas. Kelas tingkat terakhir tidak disalin karena kelulusan ditetapkan sekolah. Kalender akademik hanya disalin bila Anda mencentang pilihannya; pilihan itu mati secara bawaan karena kalender tiap tahun berbeda, dan tanggalnya digeser satu tahun sehingga harus Anda periksa kembali sebelum dipakai. Struktur kurikulum (jam pelajaran dan versi kurikulum tiap tingkat) juga ikut disalin. Hasilnya menampilkan jumlah yang dibuat dan daftar hal yang perlu diperiksa, misalnya wali kelas yang sudah nonaktif. Langkah ini boleh dilewati bila kelas tahun tujuan sudah Anda buat sendiri.',
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
            body: 'This step prepares the target year. Class 7A becomes 8A in the target year, together with its homeroom teacher and subject teachers. First-level classes are also copied as they are for new students and students who repeat. Final-level classes are not copied because graduation is decided by the school. The academic calendar is only copied if you tick that option; it is off by default because calendars differ every year, and its dates are shifted by one year so you must check them again before use. The curriculum structure (lesson periods and the curriculum version of each level) is copied as well. The result shows the numbers created and a list of things to check, for example a homeroom teacher who is no longer active. You can skip this step if you already created the target year classes yourself.',
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
            body: 'Léngkah ieu nyiapkeun taun tujuan. Kelas 7A jadi 8A di taun tujuan, lengkep jeung wali kelas jeung guru mata pelajaranna. Kelas tingkat kahiji ogé disalin sakumaha aya pikeun siswa anyar jeung siswa nu tinggal kelas. Kelas tingkat panungtungan teu disalin lantaran kalulusan ditetepkeun ku sakola. Kalénder akadémik ngan disalin upami pilihanna dicentang; pilihan éta pareum sacara baku sabab kalénder unggal taun béda, jeung tanggalna digeser sataun kudu dipariksa deui samemeh dipaké. Struktur kurikulum (jam pelajaran jeung vérsi kurikulum unggal tingkat) ogé milu disalin. Hasilna nembongkeun jumlah nu dijieun jeung daptar hal nu kudu dipariksa, upamana wali kelas nu geus nonaktip. Léngkah ieu meunang diliwatan upami kelas taun tujuan geus dijieun ku anjeun sorangan.',
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
];
