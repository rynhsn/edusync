import type { DocArticle } from '@/lib/docs-types';

export const WORKFLOW_DOCS: DocArticle[] = [
  {
    slug: 'school-access-review',
    group: 'ops',
    icon: 'building',
    tone: 'teal',
    text: {
      id: {
        title: 'Menangani laporan sekolah yang tidak bisa mengakses layanan',
        summary:
          'Bedakan gangguan satu akun, satu modul, dan seluruh unit sebelum mengubah pengaturan lembaga.',
        forWho: 'Staf dukungan dan admin platform.',
        sections: [
          {
            heading: 'Tentukan lingkup laporan',
            body: 'Minta nama lembaga, unit, menu, waktu kejadian, dan pesan pada layar. Tanyakan apakah pengguna lain di unit yang sama mengalami hal serupa. Di Lembaga & unit, cocokkan unit dan statusnya.',
            href: '/platform',
          },
          {
            heading: 'Tindak lanjuti sesuai temuan',
            body: 'Jika hanya satu akun terdampak, minta admin sekolah memeriksa keanggotaan dan perannya. Jika satu modul hilang, cocokkan modul unit dengan langganannya. Jika unit ditangguhkan, periksa alasan yang tercatat dan teruskan ke petugas berwenang.',
            href: '/platform/support',
          },
        ],
        faq: [
          {
            q: 'Bagaimana memastikan layanan pulih?',
            a: 'Balas tiket dengan langkah yang harus dicoba. Minta pelapor membuka kembali menu yang sama pada unit yang sama dan mengonfirmasi hasilnya.',
          },
        ],
      },
      en: {
        title: 'Handle a school access report',
        summary:
          'Identify whether one account, a module or a whole unit is affected before changing institution settings.',
        forWho: 'Support staff and platform administrators.',
        sections: [
          {
            heading: 'Establish the scope',
            body: 'Ask for the institution, unit, menu, time and on-screen message. Ask whether other users at that unit see the same issue. Open Institutions and units and match the unit and its status.',
            href: '/platform',
          },
          {
            heading: 'Follow up on the finding',
            body: "For one account, ask the school administrator to check membership and roles. For a missing module, check the unit's subscription. For a suspended unit, review the recorded reason and refer it to the authorized staff member.",
            href: '/platform/support',
          },
        ],
        faq: [
          {
            q: 'How can I confirm recovery?',
            a: 'Reply to the ticket with the next step. Ask the reporter to open the same menu at the same unit and confirm the result.',
          },
        ],
      },
      su: {
        title: 'Nanganan laporan aksés sakola',
        summary: 'Pariksa naha gangguan karandapan ku hiji akun, hiji modul, atawa sakabéh unit.',
        forWho: 'Petugas pangrojong jeung admin platform.',
        sections: [
          {
            heading: 'Pariksa lingkup laporan',
            body: 'Tanyakeun ngaran lembaga, unit, ménu, waktu kajadian, jeung béwara dina layar. Tanyakeun naha pamaké séjén dina unit éta ngalaman hal sarua. Cocogkeun unit jeung statusna dina daptar lembaga.',
            href: '/platform',
          },
          {
            heading: 'Tuturkeun hasil pamariksaan',
            body: 'Lamun ngan hiji akun, ménta admin sakola mariksa kaanggotaan jeung peranna. Lamun hiji modul leungit, pariksa langganan unit. Lamun unit ditunda, baca alesanana jeung teruskeun ka petugas nu boga wewenang.',
            href: '/platform/support',
          },
        ],
        faq: [
          {
            q: 'Kumaha mastikeun aksés geus pulih?',
            a: 'Bales tikét ku léngkah nu kudu dicoba. Ménta nu ngalaporkeun muka deui ménu jeung unit nu sarua sarta mastikeun hasilna.',
          },
        ],
      },
    },
  },
  {
    slug: 'registration-payment-review',
    group: 'billing',
    icon: 'wallet',
    tone: 'teal',
    text: {
      id: {
        title: 'Menelusuri pembayaran pendaftaran lembaga',
        summary: 'Cocokkan laporan pemilik dengan pendaftaran dan status lembaga sebelum memberi jawaban.',
        forWho: 'Staf platform yang menangani pendaftaran dan pembayaran.',
        sections: [
          {
            heading: 'Temukan pendaftaran yang dimaksud',
            body: 'Buka Menunggu. Cocokkan nama lembaga dan rincian pendaftaran dengan informasi dari pemilik. Jika ada beberapa entri serupa, minta waktu pembayaran dan rujukan transaksi agar entri yang diperiksa tepat.',
            href: '/platform/pending',
          },
          {
            heading: 'Pastikan hasil untuk pemilik',
            body: 'Periksa apakah lembaga sudah tercantum di Lembaga & unit dan cocokkan statusnya. Sampaikan status yang terlihat. Jika status masih berbeda dari bukti pemilik, teruskan rincian transaksi untuk pemeriksaan sebelum menyarankan pembayaran ulang.',
            href: '/platform',
          },
        ],
        faq: [
          {
            q: 'Apakah pembayaran siswa dapat diperiksa di sini?',
            a: 'Pembayaran siswa ditangani bendahara di panel sekolah. Mintalah nama unit dan arahkan ke Transaksi online atau Kasir sesuai cara pembayaran.',
          },
        ],
      },
      en: {
        title: 'Trace an institution registration payment',
        summary: "Match the owner's report to a registration and institution status before replying.",
        forWho: 'Platform staff handling registrations and payments.',
        sections: [
          {
            heading: 'Find the registration',
            body: "Open Pending. Match the institution name and registration details with the owner's report. For similar entries, ask for the payment time and transaction reference.",
            href: '/platform/pending',
          },
          {
            heading: 'Confirm the outcome',
            body: "Check Institutions and units for the institution and its status. Report the status shown. If it differs from the owner's receipt, refer the transaction for review before suggesting another payment.",
            href: '/platform',
          },
        ],
        faq: [
          {
            q: "Can I check a student's payment here?",
            a: 'The school finance team handles student payments. Ask for the unit and direct the user to Online transactions or Cashier according to the payment method.',
          },
        ],
      },
      su: {
        title: 'Nyusud pamayaran pendaptaran lembaga',
        summary: 'Cocogkeun laporan nu boga lembaga jeung pendaptaran sarta status lembagana.',
        forWho: 'Petugas platform nu ngurus pendaptaran jeung pamayaran.',
        sections: [
          {
            heading: 'Téangan pendaptaran',
            body: 'Buka daptar nu keur ngantosan. Cocogkeun ngaran lembaga jeung rincian pendaptaran. Lamun aya sababaraha nu sarupa, tanyakeun waktu mayar jeung nomer rujukan transaksi.',
            href: '/platform/pending',
          },
          {
            heading: 'Pastikeun hasilna',
            body: 'Pariksa lembaga jeung statusna dina daptar lembaga jeung unit. Tepikeun status nu katingali. Lamun béda jeung bukti pamayaran, teruskeun rincian transaksi pikeun dipariksa saméméh nyarankeun mayar deui.',
            href: '/platform',
          },
        ],
        faq: [
          {
            q: 'Naha pamayaran murid tiasa dipariksa di dieu?',
            a: 'Pamayaran murid diurus ku bendahara sakola. Tanyakeun unitna sarta arahkeun ka transaksi online atawa kasir luyu jeung cara mayarna.',
          },
        ],
      },
    },
  },
];
