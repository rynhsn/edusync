import type { DocArticle } from '@/lib/docs-types';

/** Panduan Laporan (tiket bantuan) untuk admin sekolah. Isi: id, en, su. */
export const SUPPORT_DOCS: DocArticle[] = [
  {
    slug: 'support-reports',
    icon: 'message',
    tone: 'sky',
    group: 'services',
    text: {
      id: {
        title: 'Laporan ke tim Edusync',
        summary:
          'Cara melaporkan masalah, membaca balasan, dan memahami lencana merah serta email pemberitahuan.',
        forWho: 'Admin sekolah yang butuh bantuan dari tim Edusync.',
        sections: [
          {
            heading: 'Membuat laporan',
            body: 'Laporan dikirim ke tim Edusync dan dibalas di halaman yang sama. Informasi sekolah, peran Anda, dan halaman terakhir yang dibuka dikirim otomatis, jadi Anda cukup menjelaskan masalahnya. Lampiran berkas belum tersedia; tulis rincian di penjelasan.',
            steps: [
              'Buka menu Laporan di bagian bawah menu samping.',
              'Klik Buat laporan, pilih kategori dan prioritas, lalu isi judul dan penjelasan.',
              'Klik Kirim laporan. Nomor laporan (TKT-...) muncul di daftar.',
            ],
            href: '/support',
          },
          {
            heading: 'Arti status',
            body: 'Terbuka: baru dikirim. Sedang diproses: tim sedang menangani. Menunggu balasan Anda: tim butuh keterangan tambahan. Selesai: tim menganggap masalah beres. Ditutup: laporan berakhir dan tidak bisa dibalas lagi.',
            tip: 'Membalas laporan yang berstatus Selesai membukanya kembali.',
          },
          {
            heading: 'Pemberitahuan balasan',
            body: 'Setiap balasan tim muncul sebagai lencana merah di menu Laporan dan dikirim ke email pembuat laporan serta admin sekolah lain. Email tidak bisa dibalas; balaslah lewat tautan di dalam email. Email berikutnya untuk laporan yang sama ditahan beberapa menit agar kotak masuk tidak penuh, tetapi lencana tetap menyala.',
            warning:
              'Laporan yang sudah ditutup tidak bisa dibalas. Bila masalah muncul lagi, buat laporan baru.',
          },
        ],
        faq: [
          {
            q: 'Siapa yang bisa membuat dan membaca laporan?',
            a: 'Admin sekolah. Laporan hanya terlihat oleh sekolah Anda dan tim Edusync.',
          },
          {
            q: 'Bisakah saya menutup laporan sendiri?',
            a: 'Bisa. Buka laporan lalu klik Tutup laporan bila masalahnya sudah beres.',
          },
        ],
      },
      en: {
        title: 'Reports to the Edusync team',
        summary:
          'How to report a problem, read replies, and understand the red badge and notification emails.',
        forWho: 'School admins who need help from the Edusync team.',
        sections: [
          {
            heading: 'Creating a report',
            body: 'Reports go to the Edusync team and are answered on the same page. School information, your role, and the last page you opened are sent automatically, so you only describe the problem. File attachments are not available yet; write the details in the description.',
            steps: [
              'Open the Reports menu at the bottom of the side menu.',
              'Click New report, choose a category and priority, then fill in the subject and description.',
              'Click Send report. The report number (TKT-...) appears in the list.',
            ],
            href: '/support',
          },
          {
            heading: 'What the statuses mean',
            body: 'Open: just sent. In progress: the team is working on it. Waiting for your reply: the team needs more information. Resolved: the team considers the problem fixed. Closed: the report is finished and cannot be replied to.',
            tip: 'Replying to a Resolved report reopens it.',
          },
          {
            heading: 'Reply notifications',
            body: 'Each team reply shows as a red badge on the Reports menu and is emailed to the person who created the report and other school admins. Emails cannot be answered; reply through the link inside the email. Further emails for the same report are held back for a few minutes so inboxes do not fill up, but the badge still lights up.',
            warning: 'A closed report cannot be replied to. If the problem returns, create a new report.',
          },
        ],
        faq: [
          {
            q: 'Who can create and read reports?',
            a: 'School admins. Reports are visible only to your school and the Edusync team.',
          },
          {
            q: 'Can I close a report myself?',
            a: 'Yes. Open the report and click Close report once the problem is sorted.',
          },
        ],
      },
      su: {
        title: 'Laporan ka tim Edusync',
        summary: 'Cara ngalaporkeun masalah, maca walon, jeung ngarti lencana beureum sarta email émbaran.',
        forWho: 'Admin sakola nu peryogi bantosan ti tim Edusync.',
        sections: [
          {
            heading: 'Nyieun laporan',
            body: 'Laporan dikirim ka tim Edusync tur diwaler dina kaca nu sarua. Émbaran sakola, peran anjeun, jeung kaca panungtung nu dibuka dikirim otomatis, jadi cekap ngajelaskeun masalahna. Lampiran berkas can aya; tulis rinciannana dina katerangan.',
            steps: [
              'Buka ménu Laporan di handap ménu gigir.',
              'Klik Jieun laporan, pilih kategori jeung prioritas, tuluy eusian judul jeung katerangan.',
              'Klik Kirim laporan. Nomer laporan (TKT-...) mecenghul dina daptar.',
            ],
            href: '/support',
          },
          {
            heading: 'Hartos status',
            body: 'Muka: karek dikirim. Keur diprosés: tim keur nanganan. Ngantosan walon anjeun: tim peryogi katerangan tambahan. Réngsé: tim nganggap masalahna beres. Ditutup: laporan réngsé tur teu tiasa diwaler deui.',
            tip: 'Ngawaler laporan nu statusna Réngsé bakal muka deui.',
          },
          {
            heading: 'Émbaran walon',
            body: 'Unggal walon tim mecenghul jadi lencana beureum dina ménu Laporan tur dikirim ka email nu nyieun laporan sarta admin sakola séjénna. Email teu tiasa diwaler; waler ngalangkungan tautan dina email. Email salajengna pikeun laporan nu sarua ditahan sababaraha menit, tapi lencana tetep hurung.',
            warning:
              'Laporan nu geus ditutup teu tiasa diwaler. Upami masalahna muncul deui, jieun laporan anyar.',
          },
        ],
        faq: [
          {
            q: 'Saha nu tiasa nyieun jeung maca laporan?',
            a: 'Admin sakola. Laporan ngan katingali ku sakola anjeun jeung tim Edusync.',
          },
          {
            q: 'Naha abdi tiasa nutup laporan sorangan?',
            a: 'Tiasa. Buka laporan tuluy klik Tutup laporan upami masalahna geus beres.',
          },
        ],
      },
    },
  },
];
