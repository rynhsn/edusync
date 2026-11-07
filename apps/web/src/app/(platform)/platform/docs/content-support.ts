import type { DocArticle } from '@/lib/docs-types';

/** Panduan menangani Laporan untuk staf platform. Isi: id, en, su. */
export const PLATFORM_SUPPORT_DOCS: DocArticle[] = [
  {
    slug: 'support-tickets',
    icon: 'message',
    tone: 'sky',
    group: 'ops',
    text: {
      id: {
        title: 'Menangani laporan sekolah',
        summary:
          'Alur laporan dari admin sekolah dan pemilik lembaga: membalas, catatan internal, status, petugas, dan pemberitahuan.',
        forWho: 'Staf platform; Admin platform boleh mengubah, peran Hanya lihat boleh membaca.',
        sections: [
          {
            heading: 'Daftar dan saringan',
            body: 'Menu Laporan menampilkan laporan terbaru di atas, dengan hitungan per status. Saring menurut status, kategori, prioritas, petugas, atau cari judul dan nomor laporan. Lencana merah di menu adalah jumlah laporan yang aktivitas pelapornya belum dibuka staf mana pun; membuka laporan menghapus tandanya untuk semua staf.',
            href: '/platform/support',
          },
          {
            heading: 'Membalas dan catatan internal',
            body: 'Balasan publik dikirim ke pembuat laporan dan admin sekolah lain yang berhak (paling banyak lima penerima) lewat lencana menu dan email. Catatan internal hanya terlihat staf dan tidak pernah mengirim email atau lencana ke sekolah. Laporan yang ditutup tidak bisa dibalas publik; ubah statusnya untuk membukanya lagi.',
            tip: 'Email ke penerima yang sama untuk laporan yang sama ditahan dua menit agar tidak membanjiri.',
          },
          {
            heading: 'Status, petugas, dan pencatatan',
            body: 'Admin platform mengubah status, prioritas, kategori, dan petugas di panel samping. Membalas laporan Terbuka otomatis menjadikannya Sedang diproses. Mengubah ke Selesai atau Ditutup memberi tahu pembuat laporan. Balasan sekolah dikirim ke petugas, atau ke semua Admin platform bila belum ada petugas. Setiap balasan, catatan, dan perubahan dicatat di Riwayat audit.',
            warning: 'Lampiran berkas belum didukung; minta pelapor menuliskan rincian di pesan.',
          },
        ],
        faq: [
          {
            q: 'Apakah pelapor bisa membalas lewat email?',
            a: 'Tidak. Email berisi tautan; balasan dilakukan di halaman laporan.',
          },
        ],
      },
      en: {
        title: 'Handling school reports',
        summary:
          'The flow of reports from school admins and institution owners: replying, internal notes, status, assignee, and notifications.',
        forWho: 'Platform staff; Platform admins can change things, the View only role can read.',
        sections: [
          {
            heading: 'List and filters',
            body: 'The Reports menu shows the newest reports first, with a count per status. Filter by status, category, priority, or assignee, or search subject and report number. The red badge on the menu counts reports whose reporter activity no staff member has opened yet; opening a report clears its marker for all staff.',
            href: '/platform/support',
          },
          {
            heading: 'Replying and internal notes',
            body: 'A public reply goes to the report creator and other eligible school admins (at most five recipients) through the menu badge and email. Internal notes are visible to staff only and never send an email or badge to the school. A closed report cannot get public replies; change its status to reopen it.',
            tip: 'Emails to the same recipient for the same report are held back for two minutes to avoid flooding.',
          },
          {
            heading: 'Status, assignee, and records',
            body: 'Platform admins change status, priority, category, and assignee in the side panel. Replying to an Open report makes it In progress automatically. Changing to Resolved or Closed notifies the report creator. School replies go to the assignee, or to all Platform admins when nobody is assigned. Every reply, note, and change is recorded in the Audit history.',
            warning:
              'File attachments are not supported yet; ask the reporter to write the details in the message.',
          },
        ],
        faq: [
          {
            q: 'Can the reporter reply by email?',
            a: 'No. The email holds a link; replies are made on the report page.',
          },
        ],
      },
      su: {
        title: 'Nanganan laporan sakola',
        summary:
          'Alur laporan ti admin sakola jeung nu gaduh lembaga: ngawaler, catetan internal, status, patugas, jeung émbaran.',
        forWho: 'Staf platform; Admin platform tiasa ngarobah, peran Ngan ningali tiasa maca.',
        sections: [
          {
            heading: 'Daptar jeung saringan',
            body: 'Ménu Laporan mintonkeun laporan pang anyarna di luhur, kalawan itungan per status. Saring dumasar status, kategori, prioritas, atanapi patugas, atawa teangan judul jeung nomer laporan. Lencana beureum dina ménu nyaéta jumlah laporan nu aktivitas palaporna can dibuka staf mana waé; muka laporan miceun tandana pikeun sakabéh staf.',
            href: '/platform/support',
          },
          {
            heading: 'Ngawaler jeung catetan internal',
            body: 'Walon umum dikirim ka nu nyieun laporan jeung admin sakola séjén nu pantes (paling loba lima panarima) ngalangkungan lencana ménu jeung email. Catetan internal ngan katingali ku staf tur pernah ngirim email atawa lencana ka sakola. Laporan nu ditutup teu tiasa diwaler umum; robah statusna pikeun muka deui.',
            tip: 'Email ka panarima nu sarua pikeun laporan nu sarua ditahan dua menit pikeun nyegah banjir.',
          },
          {
            heading: 'Status, patugas, jeung catetan',
            body: 'Admin platform ngarobah status, prioritas, kategori, jeung patugas dina panél gigir. Ngawaler laporan Muka otomatis jadi Keur diprosés. Ngarobah ka Réngsé atawa Ditutup mawa émbaran ka nu nyieun laporan. Walon sakola dikirim ka patugas, atawa ka sakabéh Admin platform upami can aya patugas. Unggal walon, catetan, jeung parobahan dicatet dina Riwayat audit.',
            warning: 'Lampiran berkas can didukung; pénta palapor nuliskeun rincian dina pesen.',
          },
        ],
        faq: [
          {
            q: 'Naha palapor tiasa ngawaler ngalangkungan email?',
            a: 'Henteu. Email eusina tautan; walon dilakukeun dina kaca laporan.',
          },
        ],
      },
    },
  },
];
