import type { DocArticle } from '@/lib/docs-types';

/** Panduan Laporan untuk pengelola lembaga (portal pemilik). Isi: id, en, su. */
export const ACCOUNT_SUPPORT_DOCS: DocArticle[] = [
  {
    slug: 'support-reports',
    icon: 'message',
    tone: 'sky',
    group: 'start',
    text: {
      id: {
        title: 'Laporan ke tim Edusync',
        summary: 'Cara melaporkan masalah lembaga atau tagihan, dan memantau balasan tim.',
        forWho: 'Pengelola lembaga yang butuh bantuan tim Edusync.',
        sections: [
          {
            heading: 'Membuat laporan',
            body: 'Buka menu Laporan, klik Buat laporan, lalu pilih kategori, prioritas, dan unit yang berkaitan bila ada. Informasi lembaga dan halaman terakhir dikirim otomatis. Lampiran berkas belum tersedia.',
            href: '/account/support',
          },
          {
            heading: 'Membaca balasan',
            body: 'Balasan tim tampil sebagai lencana merah di menu Laporan dan dikirim ke email pembuat laporan serta pengelola lembaga lain. Email tidak bisa dibalas; balaslah lewat tautan di dalam email.',
            tip: 'Membalas laporan berstatus Selesai membukanya kembali.',
            warning: 'Laporan yang sudah ditutup tidak bisa dibalas; buat laporan baru bila perlu.',
          },
        ],
        faq: [
          {
            q: 'Apakah laporan sekolah saya terlihat di sini?',
            a: 'Tidak. Laporan dari admin sekolah hanya terlihat di panel sekolah itu; di sini hanya laporan yang dibuat dari portal pemilik.',
          },
        ],
      },
      en: {
        title: 'Reports to the Edusync team',
        summary: 'How to report an institution or billing problem and follow the team replies.',
        forWho: 'Institution managers who need help from the Edusync team.',
        sections: [
          {
            heading: 'Creating a report',
            body: 'Open the Reports menu, click New report, then choose a category, priority, and the related unit if any. Institution and last-page information is sent automatically. File attachments are not available yet.',
            href: '/account/support',
          },
          {
            heading: 'Reading replies',
            body: 'Team replies show as a red badge on the Reports menu and are emailed to the person who created the report and other institution managers. Emails cannot be answered; reply through the link inside the email.',
            tip: 'Replying to a Resolved report reopens it.',
            warning: 'A closed report cannot be replied to; create a new one if needed.',
          },
        ],
        faq: [
          {
            q: 'Are my school reports visible here?',
            a: 'No. Reports from school admins are only visible in that school panel; here you only see reports created from the owner portal.',
          },
        ],
      },
      su: {
        title: 'Laporan ka tim Edusync',
        summary: 'Cara ngalaporkeun masalah lembaga atanapi tagihan, jeung nuturkeun walon tim.',
        forWho: 'Pangurus lembaga nu peryogi bantosan tim Edusync.',
        sections: [
          {
            heading: 'Nyieun laporan',
            body: 'Buka ménu Laporan, klik Jieun laporan, tuluy pilih kategori, prioritas, jeung unit nu patali upami aya. Émbaran lembaga jeung kaca panungtung dikirim otomatis. Lampiran berkas can aya.',
            href: '/account/support',
          },
          {
            heading: 'Maca walon',
            body: 'Walon tim mecenghul jadi lencana beureum dina ménu Laporan tur dikirim ka email nu nyieun laporan sarta pangurus lembaga séjénna. Email teu tiasa diwaler; waler ngalangkungan tautan dina email.',
            tip: 'Ngawaler laporan nu statusna Réngsé bakal muka deui.',
            warning: 'Laporan nu geus ditutup teu tiasa diwaler; jieun anyar upami perlu.',
          },
        ],
        faq: [
          {
            q: 'Naha laporan sakola kuring katingali di dieu?',
            a: 'Henteu. Laporan ti admin sakola ngan katingali dina panél sakola éta; di dieu ngan laporan nu dijieun ti portal nu gaduh.',
          },
        ],
      },
    },
  },
];
