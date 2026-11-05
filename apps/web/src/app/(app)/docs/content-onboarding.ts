import type { DocArticle } from '@/lib/docs-types';

/** Panduan awal sekolah: urutan mengisi data dasar untuk sekolah yang baru mulai. Isi: id, en, su. */
export const ONBOARDING_DOCS: DocArticle[] = [
  {
    slug: 'school-setup-guide',
    icon: 'rocket',
    tone: 'teal',
    group: 'start',
    text: {
      id: {
        title: 'Panduan awal sekolah',
        summary:
          'Urutan mengisi data dasar sekolah baru: identitas, tingkat, tahun ajaran, mata pelajaran, kelas, guru, siswa, dan jenis ujian.',
        forWho: 'Admin sekolah yang baru pertama kali masuk dan melihat halaman-halaman masih kosong.',
        sections: [
          {
            heading: 'Mengapa halaman terlihat kosong',
            body: 'Sekolah baru dimulai tanpa data apa pun. Banyak halaman bergantung pada data lain, misalnya ujian butuh mata pelajaran dan semester, kelas butuh tahun ajaran. Bila data itu belum ada, halaman menampilkan pemberitahuan apa yang kurang beserta tombol menuju halaman untuk membuatnya.',
            tip: 'Di beranda, kartu Panduan awal sekolah mencentang langkah otomatis begitu datanya ada. Kartu hilang sendiri saat semua langkah selesai, atau bisa ditutup dengan tombol silang.',
            href: '/dashboard',
          },
          {
            heading: 'Urutan yang disarankan',
            body: 'Ikuti urutan ini karena setiap langkah dipakai oleh langkah berikutnya.',
            steps: [
              'Identitas sekolah (menu Pengaturan sekolah): nama resmi, alamat, dan kontak untuk kop ujian dan surat.',
              'Jenjang dan tingkat kelas (Pengaturan sekolah): daftar tingkat yang dipakai kelas dan soal.',
              'Tahun ajaran dan semester (menu Tahun ajaran): kelas, jadwal, nilai, dan ujian menempel pada semester.',
              'Mata pelajaran (menu Mata pelajaran): diperlukan untuk jadwal, nilai, bank soal, dan ujian.',
              'Kelas (menu Kelas): pilih tahun ajaran, lalu buat kelas dan wali kelasnya.',
              'Guru (menu Guru): tambah satu per satu atau impor dari Excel.',
              'Siswa (menu Siswa): tambah atau impor dari Excel, lalu tempatkan ke kelas.',
              'Jenis ujian (menu Ujian, Jenis ujian): hanya bila modul Ujian aktif, misalnya ASTS dan ASAS.',
            ],
            href: '/school-settings',
          },
          {
            heading: 'Tombol Tambah ujian tidak bisa diklik',
            body: 'Tombol itu mati sampai ada minimal satu mata pelajaran dan satu semester, karena setiap ujian dibuat untuk satu mata pelajaran dalam satu semester. Menambah jenis ujian tidak mengubahnya. Di atas daftar ujian tampil pemberitahuan yang menyebut apa yang kurang, lengkap dengan tombol menuju halaman Mata pelajaran atau Tahun ajaran.',
            steps: [
              'Buka menu Mata pelajaran dan tambahkan mata pelajaran, atau pakai bank kurikulum bila tersedia.',
              'Buka menu Tahun ajaran dan pastikan ada tahun ajaran dengan semesternya.',
              'Kembali ke Ujian. Tombol Tambah ujian sekarang aktif.',
            ],
            href: '/subjects',
          },
        ],
        faq: [
          {
            q: 'Kartu panduan tidak muncul di beranda.',
            a: 'Kartu hanya tampil untuk pengguna yang boleh mengelola sekolah, dan hilang bila semua langkah selesai atau sudah ditutup di peramban itu.',
          },
          {
            q: 'Apakah semua langkah wajib?',
            a: 'Tidak. Urutan ini hanya saran. Tetapi beberapa halaman baru bisa dipakai setelah data prasyaratnya ada, dan halaman itu akan memberi tahu apa yang kurang.',
          },
        ],
      },
      en: {
        title: 'School setup guide',
        summary:
          'The order to fill in a new school: identity, grade levels, academic year, subjects, classes, teachers, students, and exam types.',
        forWho: 'School admins who just signed in for the first time and see empty pages.',
        sections: [
          {
            heading: 'Why pages look empty',
            body: 'A new school starts with no data. Many pages depend on other data, for example exams need subjects and a semester, and classes need an academic year. When something is missing, the page shows a notice saying what and a button to the page where it is created.',
            tip: 'On the home page, the School setup guide card ticks steps automatically once their data exists. It disappears when every step is done, or you can close it with the cross button.',
            href: '/dashboard',
          },
          {
            heading: 'Recommended order',
            body: 'Follow this order because each step is used by the next.',
            steps: [
              'School identity (School settings menu): official name, address, and contacts for exam and letter headers.',
              'Grade levels (School settings): the list of levels used by classes and questions.',
              'Academic year and semesters (Academic years menu): classes, schedules, grades, and exams attach to a semester.',
              'Subjects (Subjects menu): needed for schedules, grades, the question bank, and exams.',
              'Classes (Classes menu): pick the academic year, then create classes and homeroom teachers.',
              'Teachers (Teachers menu): add them one by one or import from Excel.',
              'Students (Students menu): add or import from Excel, then place them in classes.',
              'Exam types (Exams, Exam types): only when the Exams module is on, for example mid-term and final.',
            ],
            href: '/school-settings',
          },
          {
            heading: 'The Add exam button cannot be clicked',
            body: 'The button stays off until there is at least one subject and one semester, because every exam is made for one subject in one semester. Adding an exam type does not change that. Above the exam list a notice names what is missing, with a button to the Subjects or Academic years page.',
            steps: [
              'Open the Subjects menu and add subjects, or use the curriculum bank if available.',
              'Open the Academic years menu and make sure an academic year with semesters exists.',
              'Return to Exams. The Add exam button is now active.',
            ],
            href: '/subjects',
          },
        ],
        faq: [
          {
            q: 'The guide card does not show on the home page.',
            a: 'The card only shows to users who can manage the school, and it is hidden when all steps are done or after it was closed in that browser.',
          },
          {
            q: 'Is every step mandatory?',
            a: 'No. The order is only a suggestion. Some pages can only be used once their prerequisite data exists, and they tell you what is missing.',
          },
        ],
      },
      su: {
        title: 'Pituduh awal sakola',
        summary:
          'Urutan ngeusian data dasar sakola anyar: identitas, tingkat, taun pangajaran, mata pelajaran, kelas, guru, siswa, jeung jenis ujian.',
        forWho: 'Admin sakola nu karék kahiji asup tur ningali kaca-kaca masih kosong.',
        sections: [
          {
            heading: 'Naha kaca katingalina kosong',
            body: 'Sakola anyar dimimitian tanpa data. Loba kaca gumantung kana data séjén, contona ujian meryogikeun mata pelajaran jeung semester, kelas meryogikeun taun pangajaran. Mun data éta can aya, kaca nampilkeun béwara naon nu kurang jeung tombol ka kaca pikeun nyieunna.',
            tip: 'Di béranda, kartu Pituduh awal sakola méré centang léngkah sacara otomatis sanggeus datana aya. Kartu leungit sorangan lamun sakabéh léngkah geus rengse, atawa bisa ditutup ku tombol kali.',
            href: '/dashboard',
          },
          {
            heading: 'Urutan nu disarankeun',
            body: 'Turutan urutan ieu sabab unggal léngkah dipaké ku léngkah saterusna.',
            steps: [
              'Identitas sakola (ménu Setélan sakola): ngaran resmi, alamat, jeung kontak pikeun kop ujian jeung surat.',
              'Jenjang jeung tingkat kelas (Setélan sakola): daptar tingkat nu dipaké kelas jeung soal.',
              'Taun pangajaran jeung semester (ménu Taun pangajaran): kelas, jadwal, nilai, jeung ujian nempel kana semester.',
              'Mata pelajaran (ménu Mata pelajaran): diperlukeun pikeun jadwal, nilai, bank soal, jeung ujian.',
              'Kelas (ménu Kelas): pilih taun pangajaran, tuluy jieun kelas jeung wali kelasna.',
              'Guru (ménu Guru): tambahkeun hiji-hiji atawa impor tina Excel.',
              'Siswa (ménu Siswa): tambahkeun atawa impor tina Excel, tuluy panggihan kana kelas.',
              'Jenis ujian (Ujian, Jenis ujian): ukur lamun modul Ujian aktif, contona ASTS jeung ASAS.',
            ],
            href: '/school-settings',
          },
          {
            heading: 'Tombol Tambah ujian teu bisa diklik',
            body: 'Tombol éta pareum nepi ka aya sahanteuna hiji mata pelajaran jeung hiji semester, sabab unggal ujian dijieun pikeun hiji mata pelajaran dina hiji semester. Nambahkeun jenis ujian teu ngarobah éta. Di luhureun daptar ujian aya béwara nu nyebutkeun naon nu kurang, lengkep jeung tombol ka kaca Mata pelajaran atawa Taun pangajaran.',
            steps: [
              'Buka ménu Mata pelajaran tuluy tambahkeun mata pelajaran, atawa paké bank kurikulum lamun aya.',
              'Buka ménu Taun pangajaran tuluy pastikeun aya taun pangajaran jeung semesterna.',
              'Balik deui ka Ujian. Tombol Tambah ujian ayeuna aktif.',
            ],
            href: '/subjects',
          },
        ],
        faq: [
          {
            q: 'Kartu pituduh teu muncul di béranda.',
            a: 'Kartu ukur muncul pikeun pamaké nu meunang ngatur sakola, sarta disumputkeun lamun sakabéh léngkah rengse atawa geus ditutup di panyungsi éta.',
          },
          {
            q: 'Naha sakabéh léngkah wajib?',
            a: 'Henteu. Urutan ieu ukur saran. Tapi sababaraha kaca ukur bisa dipaké sanggeus data prasyaratna aya, sarta kaca éta bakal méré tahu naon nu kurang.',
          },
        ],
      },
    },
  },
];
