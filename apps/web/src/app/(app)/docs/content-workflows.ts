import type { DocArticle } from '@/lib/docs-types';

export const WORKFLOW_DOCS: DocArticle[] = [
  {
    slug: 'exam-participant-numbers',
    group: 'academic',
    icon: 'clipboard',
    tone: 'teal',
    text: {
      id: {
        title: 'Menyiapkan nomor dan kartu peserta ujian',
        summary:
          'Atur penomoran, periksa peserta baru, lalu cetak kartu untuk semester dan jenis ujian yang tepat.',
        forWho: 'Panitia ujian dan admin sekolah.',
        sections: [
          {
            heading: 'Periksa format sebelum menetapkan nomor',
            body: 'Di Kartu, buka Cetak dan pilih kartu ujian. Pilih semester dan jenis ujian yang sudah terdaftar agar nomor peserta tersimpan. Pada panel Nomor peserta, cocokkan contoh format, angka awal, dan lingkup urutan dengan daftar panitia.',
            href: '/cards',
          },
          {
            heading: 'Periksa sebelum mencetak',
            body: 'Pilih templat kartu ujian. Cocokkan nama, kelas, dan nomor satu peserta dengan daftar panitia sebelum mencetak satu kelas. Siswa baru memperoleh nomor berikutnya dalam lingkup urutan yang dipilih.',
            href: '/cards',
          },
        ],
        faq: [
          {
            q: 'Mengapa format baru belum muncul pada kartu lama?',
            a: 'Nomor yang sudah ditetapkan tetap tersimpan. Atur ulang nomor hanya bila panitia memang ingin mengganti nomor yang sudah dibagikan.',
          },
        ],
      },
      en: {
        title: 'Prepare exam numbers and participant cards',
        summary: 'Choose a numbering format and check participant cards before printing.',
        forWho: 'Exam coordinators and school administrators.',
        sections: [
          {
            heading: 'Check the numbering format',
            body: 'Open Cards, choose Print and select exam cards. Select a semester and a registered exam type to save participant numbers. Check the format preview, starting number and numbering scope.',
            href: '/cards',
          },
          {
            heading: 'Check a card before printing',
            body: "Choose a card template. Compare one student's name, class and number with the exam roster before printing the class set. A new student receives the next number in the selected scope.",
            href: '/cards',
          },
        ],
        faq: [
          {
            q: 'Why do existing cards still show the old format?',
            a: 'Assigned numbers stay with their participants. Reset numbers only if the exam team intends to replace numbers already issued.',
          },
        ],
      },
      su: {
        title: 'Nyiapkeun nomer jeung kartu pamilon ujian',
        summary: 'Atur nomer pamilon sarta pariksa kartu saméméh dicitak.',
        forWho: 'Panitia ujian jeung admin sakola.',
        sections: [
          {
            heading: 'Pariksa wangun nomer',
            body: 'Buka Kartu, pilih Citak sarta kartu ujian. Pilih seméster jeung jenis ujian nu geus kadaptar sangkan nomerna kasimpen. Pariksa conto nomer, angka mimiti, jeung lingkup urutanana.',
            href: '/cards',
          },
          {
            heading: 'Pariksa kartu saméméh nyitak',
            body: 'Pilih témplat kartu. Cocogkeun ngaran, kelas, jeung nomer saurang murid jeung daptar panitia saméméh nyitak sakelas. Murid anyar meunang nomer saterusna dina lingkup nu dipilih.',
            href: '/cards',
          },
        ],
        faq: [
          {
            q: 'Ku naon kartu heubeul masih maké wangun nomer saméméhna?',
            a: 'Nomer nu geus ditetepkeun tetep kasimpen. Atur ulang ngan lamun panitia rék ngaganti nomer nu geus dibagikeun.',
          },
        ],
      },
    },
  },
  {
    slug: 'attendance-reconciliation',
    group: 'attendance',
    icon: 'scan',
    tone: 'teal',
    module: 'attendance',
    text: {
      id: {
        title: 'Memeriksa absensi yang belum masuk rekap',
        summary:
          'Telusuri satu catatan dari perangkat guru sampai rekap sekolah tanpa mencatat siswa dua kali.',
        forWho: 'Guru piket dan pengelola absensi.',
        sections: [
          {
            heading: 'Periksa perangkat pencatat',
            body: 'Buka Absen datang & pulang di perangkat yang dipakai saat mencatat. Periksa sekolah aktif dan sambungan jaringan. Jika ada antrean, biarkan layar terbuka saat perangkat kembali daring.',
            href: '/attendance/manual',
          },
          {
            heading: 'Cocokkan hasil pengiriman',
            body: 'Perhatikan jumlah yang terkirim dan ditolak. Buka Rekap absensi, pilih tanggal kejadian dan kelas siswa, lalu cocokkan waktu serta arah datang atau pulang. Pengiriman ulang memakai waktu kejadian asli.',
          },
        ],
        faq: [
          {
            q: 'Apa yang dilakukan jika catatan ditolak?',
            a: 'Baca pemberitahuannya dan periksa aturan tanggal tersebut, termasuk hari libur. Catat ulang hanya setelah memastikan catatan belum masuk dan penyebabnya sudah ditangani.',
          },
        ],
      },
      en: {
        title: 'Find a missing attendance record',
        summary:
          'Follow an entry from the recording device to the school register without recording it twice.',
        forWho: 'Duty teachers and attendance staff.',
        sections: [
          {
            heading: 'Check the recording device',
            body: 'Open manual arrival and departure on the device used to record the student. Check the active school and connection. If entries are queued, keep the screen open when back online.',
            href: '/attendance/manual',
          },
          {
            heading: 'Match the result',
            body: 'Check how many entries were sent or rejected. In the attendance summary, select the original date and class. Match the time and arrival or departure. Retried entries keep their original time.',
          },
        ],
        faq: [
          {
            q: 'What if an entry was rejected?',
            a: 'Read the notice and check the rules for that date, including holidays. Record it again only after confirming it is missing and resolving the cause.',
          },
        ],
      },
      su: {
        title: 'Mariksa absén anu can asup kana rékap',
        summary: 'Susud catetan tina alat guru nepi ka rékap sakola sangkan murid henteu kacatet dua kali.',
        forWho: 'Guru pikét jeung petugas absén.',
        sections: [
          {
            heading: 'Pariksa alat nu dipaké',
            body: 'Buka absén datang jeung balik dina alat nu dipaké nyatet. Pariksa sakola nu aktip jeung sambungan internét. Lamun aya antrian, buka terus layarna waktu alat nyambung deui.',
            href: '/attendance/manual',
          },
          {
            heading: 'Cocogkeun hasilna',
            body: 'Tingali jumlah nu kakirim jeung nu ditolak. Dina rékap absén, pilih tanggal kajadian jeung kelas murid. Cocogkeun jam datang atawa balik. Catetan nu dikirim deui tetep maké jam aslina.',
          },
        ],
        faq: [
          {
            q: 'Kumaha lamun catetan ditolak?',
            a: 'Baca béwarana sarta pariksa aturan dina tanggal éta, kaasup poé libur. Catet deui sanggeus dipastikeun can asup jeung sababna geus dibereskeun.',
          },
        ],
      },
    },
  },
];
