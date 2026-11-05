import type { DocArticle } from '@/lib/docs-types';

/** Panduan awal untuk pengguna non-admin: guru/staf, wali, dan siswa. Isi: id, en, su. */
export const ROLE_DOCS: DocArticle[] = [
  {
    slug: 'first-steps-roles',
    icon: 'rocket',
    tone: 'sky',
    group: 'start',
    text: {
      id: {
        title: 'Panduan awal guru, wali, dan siswa',
        summary:
          'Apa yang terjadi setelah menerima undangan, apa yang bisa dibuka pertama kali, dan mengapa sebagian halaman masih kosong.',
        forWho: 'Guru dan staf, wali murid, dan siswa yang baru pertama kali masuk.',
        sections: [
          {
            heading: 'Menerima undangan dan masuk pertama kali',
            body: 'Sekolah mengirim tautan undangan lewat email. Tautan itu hanya berlaku untuk alamat email yang diundang dan punya batas waktu.',
            steps: [
              'Buka tautan undangan.',
              'Bila belum punya akun, isi nama dan buat kata sandi, lalu klik Buat akun dan terima. Bila sudah punya akun, masukkan kata sandi lalu klik Masuk dan terima.',
              'Setelah diterima, Anda langsung masuk. Guru dan staf mendarat di Ringkasan, wali dan siswa mendarat di Portal.',
            ],
            warning:
              'Bila muncul pesan tautan tidak berlaku, undangan sudah dipakai atau kedaluwarsa. Minta sekolah mengirim undangan baru.',
          },
          {
            heading: 'Guru dan staf',
            body: 'Menu di kiri hanya menampilkan fitur yang diizinkan untuk peran Anda dan yang modulnya aktif di sekolah. Kartu sambutan di Ringkasan mencantumkan pintasan ke fitur tersebut; klik tanda silang untuk menutupnya.',
            steps: [
              'Jadwal pelajaran: lihat jam mengajar dan kelas.',
              'Absensi per jam: catat kehadiran siswa di jam pelajaran Anda.',
              'Penilaian: masukkan nilai siswa untuk mapel Anda.',
              'Ujian dan Bank soal: buat soal, susun ujian, jadwalkan, lalu nilai hasilnya.',
            ],
            href: '/dashboard',
            tip: 'Bila sebuah menu tidak ada, itu berarti peran Anda belum punya izinnya atau sekolah belum mengaktifkan modulnya. Tanyakan ke admin sekolah.',
          },
          {
            heading: 'Wali murid di portal',
            body: 'Portal menampilkan kartu untuk setiap anak yang ditautkan sekolah. Buka kartu untuk melihat kehadiran, nilai, tagihan, rapor, dan tahfidz.',
            steps: [
              'Di beranda portal, klik kartu anak atau Lihat rincian.',
              'Pindah antar bagian lewat tab Absensi, Nilai, Tagihan, Rapor, Tahfidz, dan Kabar.',
              'Di Tagihan, unduh kwitansi dari pembayaran yang sudah tercatat.',
            ],
            href: '/portal',
          },
          {
            heading: 'Siswa di portal',
            body: 'Siswa melihat data dirinya sendiri dan punya kartu Ujian untuk mengerjakan ujian di layar.',
            steps: [
              'Di beranda portal, klik kartu Ujian.',
              'Ujian yang sedang dibuka punya tombol Mulai ujian. Yang sudah dimulai punya tombol Lanjutkan.',
              'Ujian yang belum dibuka menampilkan hitung mundur, dan halaman memperbarui diri otomatis.',
            ],
            href: '/portal/exams',
          },
          {
            heading: 'Mengapa halamannya masih kosong?',
            body: 'Kosong biasanya bukan kesalahan. Isi portal berasal dari catatan sekolah, sehingga baru muncul setelah dicatat.',
            steps: [
              'Belum ada nilai: guru belum memasukkan nilai semester ini.',
              'Belum ada tagihan: sekolah belum menerbitkan tagihan, jadi tidak ada yang harus dibayar.',
              'Belum ada rapor: rapor muncul setelah sekolah menerbitkannya.',
              'Belum ada ujian atau tidak ada ujian yang terbuka: guru belum menjadwalkan ujian di layar, atau jadwalnya belum dimulai.',
              'Akun belum ditautkan atau belum ada anak: minta sekolah menautkan akun Anda ke data siswa.',
            ],
          },
        ],
        faq: [
          {
            q: 'Kartu sambutan hilang, bagaimana memunculkannya lagi?',
            a: 'Kartu hanya disembunyikan di peramban yang Anda pakai. Menghapus data situs peramban atau memakai peramban lain memunculkannya lagi.',
          },
          {
            q: 'Saya lupa kata sandi.',
            a: 'Gunakan Lupa kata sandi di halaman masuk, atau minta admin sekolah.',
          },
        ],
      },
      en: {
        title: 'Getting started for teachers, guardians, and students',
        summary:
          'What happens after you accept an invitation, what you can open first, and why some pages are still empty.',
        forWho: 'Teachers and staff, guardians, and students signing in for the first time.',
        sections: [
          {
            heading: 'Accepting the invitation and first sign-in',
            body: 'The school emails you an invitation link. It only works for the invited email address and expires after a while.',
            steps: [
              'Open the invitation link.',
              'If you have no account, enter your name and create a password, then click Create account and accept. If you already have one, enter your password and click Sign in and accept.',
              'Once accepted you are signed in. Teachers and staff land on Overview; guardians and students land on the Portal.',
            ],
            warning:
              'If the link is reported invalid, the invitation was already used or has expired. Ask the school for a new one.',
          },
          {
            heading: 'Teachers and staff',
            body: 'The left menu only shows features allowed for your role whose module is active at the school. The welcome card on Overview lists shortcuts to them; click the cross to close it.',
            steps: [
              'Class schedule: see your teaching hours and classes.',
              'Per-lesson attendance: record student attendance in your lessons.',
              'Grading: enter student grades for your subjects.',
              'Exams and Question bank: write questions, build exams, schedule them, then grade the results.',
            ],
            href: '/dashboard',
            tip: 'If a menu is missing, your role lacks the permission or the school has not enabled the module. Ask the school admin.',
          },
          {
            heading: 'Guardians in the portal',
            body: 'The portal shows a card for each child the school has linked. Open a card to see attendance, grades, fees, report cards, and tahfidz.',
            steps: [
              'On the portal home, click the child card or View details.',
              'Switch sections with the Attendance, Grades, Fees, Report, Tahfidz, and News tabs.',
              'In Fees, download receipts for payments already recorded.',
            ],
            href: '/portal',
          },
          {
            heading: 'Students in the portal',
            body: 'Students see their own data and have an Exams card to take on-screen exams.',
            steps: [
              'On the portal home, click the Exams card.',
              'An open exam has a Start exam button. One already started has Resume.',
              'An exam that is not open yet shows a countdown, and the page refreshes by itself.',
            ],
            href: '/portal/exams',
          },
          {
            heading: 'Why is a page still empty?',
            body: 'Empty is usually not an error. The portal shows what the school has recorded, so it appears only after it is recorded.',
            steps: [
              'No grades: teachers have not entered grades this semester.',
              'No invoices: the school has not issued any, so nothing is due.',
              'No report card: it appears once the school publishes it.',
              'No exams, or none open: the teacher has not scheduled an on-screen exam, or its schedule has not started.',
              'Account not linked or no child: ask the school to link your account to the student record.',
            ],
          },
        ],
        faq: [
          {
            q: 'The welcome card is gone. How do I bring it back?',
            a: 'It is only hidden in the browser you use. Clearing site data or using another browser shows it again.',
          },
          {
            q: 'I forgot my password.',
            a: 'Use Forgot password on the sign-in page, or ask the school admin.',
          },
        ],
      },
      su: {
        title: 'Pituduh awal guru, wali, jeung siswa',
        summary:
          'Naon anu kajadian sanggeus narima uleman, naon anu tiasa dibuka heula, jeung naha sababaraha kaca masih kosong.',
        forWho: 'Guru jeung staf, wali murid, jeung siswa anu kakara mimiti lebet.',
        sections: [
          {
            heading: 'Narima uleman jeung lebet kahiji',
            body: 'Sakola ngirim tautan uleman ku surélék. Tautan éta ngan berlaku pikeun alamat surélék anu diuleman tur aya wates waktuna.',
            steps: [
              'Buka tautan uleman.',
              'Upami acan gaduh akun, eusian nami tur jieun kecap sandi, teras klik Jieun akun tur tarima. Upami parantos gaduh akun, lebetkeun kecap sandi teras klik Lebet tur tarima.',
              'Sanggeus ditarima, Anjeun langsung lebet. Guru jeung staf ka Ringkesan, wali jeung siswa ka Portal.',
            ],
            warning:
              'Upami aya talatah tautan teu berlaku, uleman parantos dipaké atawa kadaluwarsa. Menta sakola ngirim uleman anyar.',
          },
          {
            heading: 'Guru jeung staf',
            body: 'Ménu di kénca ngan nembongkeun fitur anu diidinan pikeun peran Anjeun jeung modulna aktif di sakola. Kartu wilujeng sumping di Ringkesan ngadaptarkeun jalan pondokna; klik tanda silang pikeun nutupna.',
            steps: [
              'Jadwal pelajaran: tingali jam ngajar jeung kelas.',
              'Absensi per jam: catet kahadiran siswa dina jam pelajaran Anjeun.',
              'Penilaian: lebetkeun nilai siswa pikeun mapel Anjeun.',
              'Ujian jeung Bank soal: jieun soal, susun ujian, jadwalkeun, tuluy nilaian hasilna.',
            ],
            href: '/dashboard',
            tip: 'Upami aya ménu anu euweuh, hartosna peran Anjeun acan gaduh idinna atawa sakola acan ngaktifkeun modulna. Tanyakeun ka admin sakola.',
          },
          {
            heading: 'Wali murid di portal',
            body: 'Portal nembongkeun kartu pikeun unggal murangkalih anu ditautkeun ku sakola. Buka kartu pikeun ningali kahadiran, nilai, tagihan, rapor, jeung tahfidz.',
            steps: [
              'Di tepas portal, klik kartu murangkalih atawa Tingali rincian.',
              'Pindah antar bagian ngaliwatan tab Absensi, Nilai, Tagihan, Rapor, Tahfidz, jeung Kabar.',
              'Di Tagihan, unduh kuitansi tina pamayaran anu parantos kacatet.',
            ],
            href: '/portal',
          },
          {
            heading: 'Siswa di portal',
            body: 'Siswa ningali data dirina sorangan tur gaduh kartu Ujian pikeun ngerjakeun ujian dina layar.',
            steps: [
              'Di tepas portal, klik kartu Ujian.',
              'Ujian anu keur muka aya tombol Mimitian ujian. Anu parantos dimimitian aya tombol Teraskeun.',
              'Ujian anu acan muka nembongkeun itungan mundur, tur kaca dianyaran sorangan.',
            ],
            href: '/portal/exams',
          },
          {
            heading: 'Naha kacana masih kosong?',
            body: 'Kosong biasana lain kasalahan. Eusi portal asalna tina catetan sakola, jadi nembongan sanggeus dicatet.',
            steps: [
              'Acan aya nilai: guru acan ngalebetkeun nilai semester ieu.',
              'Acan aya tagihan: sakola acan nerbitkeun tagihan, jadi euweuh anu kudu dibayar.',
              'Acan aya rapor: rapor muncul sanggeus sakola nerbitkeunana.',
              'Acan aya ujian atawa euweuh anu muka: guru acan ngajadwalkeun ujian dina layar, atawa jadwalna acan mimiti.',
              'Akun acan ditautkeun atawa acan aya murangkalih: menta sakola nautkeun akun Anjeun kana data siswa.',
            ],
          },
        ],
        faq: [
          {
            q: 'Kartu wilujeng sumping leungit, kumaha nembongkeun deui?',
            a: 'Kartu ngan disumputkeun di panyungsi anu dipaké. Mupus data situs panyungsi atawa maké panyungsi séjén nembongkeunana deui.',
          },
          {
            q: 'Abdi hilap kecap sandi.',
            a: 'Paké Hilap kecap sandi di kaca lebet, atawa menta ka admin sakola.',
          },
        ],
      },
    },
  },
];
