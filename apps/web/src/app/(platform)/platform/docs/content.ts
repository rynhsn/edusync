import type { DocArticle } from '@/lib/docs-types';
import { PLATFORM_SUPPORT_DOCS } from './content-support';

/** Panduan konsol platform untuk staf operasional EduSync, disusun menurut pekerjaan. Isi: id, en, su. */
export const PLATFORM_DOCS: DocArticle[] = [
  ...PLATFORM_SUPPORT_DOCS,
  {
    slug: 'first-setup',
    icon: 'rocket',
    tone: 'emerald',
    group: 'config',
    text: {
      id: {
        title: 'Pengaturan awal konsol',
        summary:
          'Tiga hal yang perlu diatur staf admin lebih dulu: email keluar, penyedia pembayaran, dan katalog paket.',
        forWho: 'Staf dengan peran Admin platform yang pertama kali memakai konsol.',
        sections: [
          {
            heading: 'Kartu Mulai di sini',
            body: 'Di halaman Lembaga & unit muncul kartu Mulai di sini bagi Admin platform. Centangnya dihitung dari pengaturan yang tersimpan, dan kartu hilang bila semuanya beres.',
            href: '/platform',
          },
          {
            heading: 'Email keluar (SMTP)',
            body: 'Selama belum disimpan di konsol, kode OTP dan undangan memakai Mailpit lokal sehingga tidak sampai ke pengguna.',
            steps: [
              'Buka menu Email.',
              'Isi host, port, pengguna, kata sandi, dan alamat pengirim lalu klik Simpan.',
              'Kirim email uji ke alamat Anda sendiri untuk memastikan.',
            ],
            href: '/platform/email',
          },
          {
            heading: 'Pembayaran dan katalog',
            body: 'Di menu Pembayaran pilih Midtrans dan isi kunci server, lalu tinjau parameter penagihan. Di menu Harga & modul pastikan ada harga dasar, minimal satu tingkat siswa, dan satu paket aktif; tanpa itu pendaftaran tidak bisa dipilih.',
            href: '/platform/payments',
          },
        ],
        faq: [
          {
            q: 'Kartu Mulai di sini tidak muncul. Mengapa?',
            a: 'Kartu hanya tampil untuk Admin platform, dan hilang bila semua langkah selesai atau Anda menutupnya di peramban ini.',
          },
        ],
      },
      en: {
        title: 'First-time console setup',
        summary:
          'Three things platform admins should set first: outgoing email, payment provider, and the plan catalog.',
        forWho: 'Staff with the Platform admin role using the console for the first time.',
        sections: [
          {
            heading: 'The Start here card',
            body: 'On the Institutions & units page, platform admins see a Start here card. Its checks come from the saved settings, and it disappears when everything is done.',
            href: '/platform',
          },
          {
            heading: 'Outgoing email (SMTP)',
            body: 'Until it is saved in the console, OTP codes and invitations use the local Mailpit and never reach users.',
            steps: [
              'Open the Email menu.',
              'Enter host, port, user, password, and sender address, then click Save.',
              'Send a test email to your own address to confirm.',
            ],
            href: '/platform/email',
          },
          {
            heading: 'Payments and catalog',
            body: 'In Payments choose Midtrans and enter the server key, then review the billing parameters. In Prices & modules make sure there is a base price, at least one student tier, and one active plan; without them registration cannot be selected.',
            href: '/platform/payments',
          },
        ],
        faq: [
          {
            q: 'The Start here card is not showing. Why?',
            a: 'The card only shows for Platform admins, and disappears when every step is done or you close it in this browser.',
          },
        ],
      },
      su: {
        title: 'Setélan awal konsol',
        summary:
          'Tilu hal nu kudu diatur staf admin heula: surélék kaluar, panyadia pamayaran, jeung katalog pakét.',
        forWho: 'Staf nu peranna Admin platform nu mimiti maké konsol.',
        sections: [
          {
            heading: 'Kartu Mimitian ti dieu',
            body: 'Di kaca Lembaga & unit aya kartu Mimitian ti dieu pikeun Admin platform. Centangna diitung tina setélan nu disimpen, sarta leungit lamun sagalana geus anggeus.',
            href: '/platform',
          },
          {
            heading: 'Surélék kaluar (SMTP)',
            body: 'Salila can disimpen di konsol, kode OTP jeung uleman maké Mailpit lokal jadi teu nepi ka pamaké.',
            steps: [
              'Buka menu Surélék.',
              'Eusian host, port, pamaké, kecap akses, jeung alamat pangirim terus klik Simpen.',
              'Kirim surélék uji ka alamat Anjeun sorangan pikeun mastikeun.',
            ],
            href: '/platform/email',
          },
          {
            heading: 'Pamayaran jeung katalog',
            body: 'Di menu Pamayaran pilih Midtrans terus eusian konci server, tuluy tinjau parameter penagihan. Di menu Harga & modul pastikeun aya harga dasar, sahenteuna hiji tingkat siswa, jeung hiji pakét aktif; tanpa éta pendaptaran teu bisa dipilih.',
            href: '/platform/payments',
          },
        ],
        faq: [
          {
            q: 'Kartu Mimitian ti dieu teu muncul. Naha?',
            a: 'Kartu ngan muncul pikeun Admin platform, sarta leungit lamun sakabéh léngkah réngsé atawa Anjeun nutupna di pangbaruan ieu.',
          },
        ],
      },
    },
  },
  {
    slug: 'overview',
    icon: 'rocket',
    tone: 'teal',
    group: 'ops',
    text: {
      id: {
        title: 'Mulai bekerja di konsol',
        summary: 'Cara memulai pekerjaan harian, apa yang boleh Anda ubah, dan ke mana mencari menu.',
        forWho: 'Staf operasional EduSync yang baru memakai konsol.',
        sections: [
          {
            heading: 'Memulai pekerjaan harian',
            body: 'Mulailah dari halaman Ringkasan platform. Di sana terlihat hal-hal yang butuh perhatian Anda hari ini.',
            steps: [
              'Buka Lembaga & unit lalu lihat kartu di bagian atas: Unit ditangguhkan, Invoice terbuka, dan Pendaftaran tertunda.',
              'Bila Pendaftaran tertunda lebih dari nol, klik kartunya dan tangani satu per satu.',
              'Saring daftar lembaga dengan status Masa tenggang untuk melihat sekolah yang hampir ditangguhkan.',
              'Di akhir hari, buka Audit untuk memastikan tindakan Anda tercatat.',
            ],
            href: '/platform',
            tip: 'Lakukan pemeriksaan ini di awal jam kerja supaya sekolah yang bermasalah ditangani sebelum mereka menghubungi Anda.',
          },
          {
            heading: 'Mengetahui apa yang boleh Anda ubah',
            body: 'Ada dua peran staf. Staf dengan peran Admin platform bisa melihat sekaligus mengubah: menangguhkan sekolah, mengaktifkan tanpa pembayaran, mengubah harga, dan mengatur pembayaran serta pesan. Staf dengan peran Hanya lihat bisa membuka semua halaman, tetapi tombol untuk mengubah tidak muncul. Peran Anda tertulis di bagian bawah menu.',
            href: '/platform',
          },
          {
            heading: 'Menemukan menu yang tepat',
            body: 'Menu di sisi kiri dibagi tiga. Operasi berisi Lembaga & unit, Pendaftaran tertunda, dan Pembayaran. Katalog berisi Harga & modul serta Bank kurikulum. Sistem berisi WhatsApp dan Audit. Setiap menu punya artikel sendiri di dokumentasi ini.',
          },
          {
            heading: 'Memakai daftar periksa Panduan operator',
            body: 'Menu Panduan operator berisi daftar periksa singkat untuk pekerjaan yang sering dilakukan, seperti aktivasi tanpa pembayaran, penangguhan, perubahan harga, dan pengaturan WhatsApp.',
            href: '/platform/guide',
            tip: 'Centang di daftar periksa hanya tersimpan di peramban yang Anda pakai. Di komputer lain, daftarnya kosong lagi.',
          },
        ],
        faq: [
          {
            q: 'Saya tidak melihat tombol Tangguhkan atau Simpan. Apa yang salah?',
            a: 'Kemungkinan besar akun Anda berperan Hanya lihat. Cek peran Anda di bagian bawah menu. Bila perlu mengubah data, minta admin EduSync mengubah peran akun Anda.',
          },
          {
            q: 'Halaman terasa lama atau datanya tampak ketinggalan. Apa yang dicek?',
            a: 'Muat ulang halaman dengan menekan F5. Bila masih sama, cek koneksi internet Anda lalu coba keluar dan masuk lagi. Bila tetap bermasalah, hubungi tim teknis EduSync.',
          },
          {
            q: 'Dari mana saya tahu sebuah tindakan sudah tersimpan?',
            a: 'Setelah menyimpan, muncul pesan singkat seperti Perubahan disimpan. Untuk memastikan lebih lanjut, buka Audit dan cari tindakan Anda; catatan terbaru ada di bagian atas.',
          },
        ],
      },
      en: {
        title: 'Getting started in the console',
        summary: 'How to start your daily work, what you are allowed to change, and where to find each menu.',
        forWho: 'EduSync operations staff who are new to the console.',
        sections: [
          {
            heading: 'Starting your daily work',
            body: 'Start from the Platform overview page. It shows what needs your attention today.',
            steps: [
              'Open Foundations & units and look at the cards at the top: Suspended units, Open invoices, and Pending registrations.',
              'If Pending registrations is above zero, click the card and handle them one by one.',
              'Filter the foundation list by Grace period to see schools that are close to being suspended.',
              'At the end of the day, open Audit to confirm your actions were recorded.',
            ],
            href: '/platform',
            tip: 'Do this check at the start of the working day so troubled schools are handled before they contact you.',
          },
          {
            heading: 'Knowing what you may change',
            body: 'There are two staff roles. Staff with the Platform admin role can view and change things: suspend schools, activate without payment, change prices, and set up payments and messaging. Staff with the Read only role can open every page, but the buttons to change things do not appear. Your role is shown at the bottom of the menu.',
            href: '/platform',
          },
          {
            heading: 'Finding the right menu',
            body: 'The menu on the left has three parts. Operations holds Foundations & units, Pending registrations, and Payments. Catalog holds Prices & modules and Curriculum bank. System holds WhatsApp and Audit. Each menu has its own article in this documentation.',
          },
          {
            heading: 'Using the Operator guide checklists',
            body: 'The Operator guide menu has short checklists for common jobs such as activating without payment, suspending, changing prices, and setting up WhatsApp.',
            href: '/platform/guide',
            tip: 'Ticks in the checklist are only saved in the browser you use. On another computer the list is empty again.',
          },
        ],
        faq: [
          {
            q: 'I cannot see the Suspend or Save button. What is wrong?',
            a: 'Most likely your account has the Read only role. Check your role at the bottom of the menu. If you need to change data, ask an EduSync admin to change your account role.',
          },
          {
            q: 'The page is slow or the data looks old. What should I check?',
            a: 'Reload the page by pressing F5. If it stays the same, check your internet connection and try signing out and in again. If it still fails, contact the EduSync technical team.',
          },
          {
            q: 'How do I know an action was saved?',
            a: 'After saving, a short message such as Changes saved appears. To be sure, open Audit and look for your action; the newest entries are at the top.',
          },
        ],
      },
      su: {
        title: 'Ngamimitian damel di konsol',
        summary: 'Cara ngamimitian pagawéan sapopoé, naon nu meunang dirobah, jeung ka mana néangan menu.',
        forWho: 'Staf operasional EduSync nu karék maké konsol.',
        sections: [
          {
            heading: 'Ngamimitian pagawéan sapopoé',
            body: 'Mimitian tina kaca Ringkesan platform. Di dinya katingali naon waé nu peryogi perhatian anjeun poé ieu.',
            steps: [
              'Buka Lembaga & unit tuluy tingali kartu di luhur: Unit ditangguhkeun, Invoice muka, jeung Pendaptaran nunggu.',
              'Lamun Pendaptaran nunggu leuwih ti nol, klik kartuna tuluy tangani hiji-hiji.',
              'Saring daptar lembaga ku status Mangsa tenggang pikeun nénjo sakola nu ampir ditangguhkeun.',
              'Dina ahir poé, buka Audit pikeun mastikeun tindakan anjeun kacatet.',
            ],
            href: '/platform',
            tip: 'Pariksa ieu dina awal jam damel sangkan sakola nu bermasalah katangani samemeh maranéhna ngahubungan anjeun.',
          },
          {
            heading: 'Terang naon nu meunang dirobah',
            body: 'Aya dua peran staf. Staf nu perannana Admin platform tiasa ningali sareng ngarobih: nangguhkeun sakola, ngaktipkeun tanpa pamayaran, ngarobih harga, jeung ngatur pamayaran sarta pesen. Staf nu perannana Ngan ningali tiasa muka sadaya kaca, tapi tombol pikeun ngarobih teu aya. Peran anjeun katingali di handapeun menu.',
            href: '/platform',
          },
          {
            heading: 'Mendakan menu nu pas',
            body: 'Menu di sisi kénca dibagi tilu. Operasi eusina Lembaga & unit, Pendaptaran nunggu, jeung Pamayaran. Katalog eusina Harga & modul sareng Bank kurikulum. Sistem eusina WhatsApp jeung Audit. Unggal menu boga artikel sorangan dina dokuméntasi ieu.',
          },
          {
            heading: 'Maké daptar pariksa Pituduh operator',
            body: 'Menu Pituduh operator eusina daptar pariksa singget pikeun pagawéan nu sering dilakukeun, upamana aktivasi tanpa pamayaran, penangguhan, parobahan harga, jeung pangaturan WhatsApp.',
            href: '/platform/guide',
            tip: 'Centang dina daptar pariksa ngan disimpen dina pangotéh nu anjeun pake. Dina komputer séjén, daptarna kosong deui.',
          },
        ],
        faq: [
          {
            q: 'Abdi teu ningali tombol Tangguhkeun atawa Simpen. Naon nu lepat?',
            a: 'Kamungkinan akun anjeun perannana Ngan ningali. Pariksa peran anjeun di handapeun menu. Lamun kudu ngarobih data, mangga pénta admin EduSync ngarobih peran akun anjeun.',
          },
          {
            q: 'Kacana lami atawa datana siga nu ketinggalan. Naon nu kudu dipariksa?',
            a: 'Muat deui kaca ku mencét F5. Lamun tetep sarua, pariksa sambungan internét anjeun tuluy cobi kaluar jeung lebet deui. Lamun masih bermasalah, hubungi tim téknis EduSync.',
          },
          {
            q: 'Kumaha uninga yén hiji tindakan geus kasimpen?',
            a: 'Sanggeus nyimpen, aya pesen singget siga Perubahan disimpen. Pikeun leuwih yakin, buka Audit tuluy pilarian tindakan anjeun; catetan pangénggalna aya di luhur.',
          },
        ],
      },
    },
  },
  {
    slug: 'foundations',
    icon: 'building',
    tone: 'sky',
    group: 'ops',
    text: {
      id: {
        title: 'Lembaga & unit: memantau dan menangguhkan',
        summary:
          'Mencari sekolah, melihat kondisi tagihannya, serta menangguhkan atau mengaktifkannya kembali.',
        forWho: 'Staf dukungan dan admin platform yang menangani sekolah pelanggan.',
        sections: [
          {
            heading: 'Mencari sekolah tertentu',
            body: 'Daftar menampilkan nama dan alamat lembaga, jumlah unit sekolah, status langganan, tanggal periode berakhir, dan jumlah invoice yang belum dibayar.',
            steps: [
              'Buka Lembaga & unit.',
              'Ketik nama atau alamat di kolom Cari lembaga.',
              'Bila perlu, pilih status langganan: Aktif, Masa tenggang, Ditangguhkan, Dibatalkan, atau Tanpa langganan.',
              'Klik menu Aksi di baris lembaga, lalu pilih Lihat detail atau Salin alamat.',
              'Bila hasilnya kosong, klik Hapus saringan lalu coba kata lain.',
            ],
            href: '/platform',
          },
          {
            heading: 'Melihat kondisi langganan dan tagihan',
            body: 'Di halaman Lihat detail Anda bisa melihat jenis langganan (bulanan atau tahunan) dan tanggal berakhirnya, daftar unit sekolah, invoice terbaru, riwayat pembayaran, serta modul yang aktif di tiap unit beserta masa berlakunya. Pembayaran dari aktivasi gratis ditandai Tanpa pembayaran (komplimen). Kartu MRR perkiraan di halaman utama memakai tagihan terbayar terakhir tiap langganan aktif dan tidak menghitung yang komplimen.',
            href: '/platform',
          },
          {
            heading: 'Menangguhkan sekolah yang menunggak atau bermasalah',
            body: 'Hanya staf dengan peran Admin platform yang melihat tombol Tangguhkan. Setelah ditangguhkan, sekolah langsung tidak bisa dipakai. Penangguhan yang dilakukan staf tidak terbuka hanya karena sekolah membayar; Anda harus mengaktifkannya kembali sendiri. Alasan yang Anda tulis (maksimal 300 karakter) ditampilkan kepada pengguna sekolah dan pemilik lembaga bersama tanggal penangguhan, jadi tulis dengan sopan dan tanpa data pribadi. Nama Anda hanya terlihat di konsol ini.',
            steps: [
              'Buka Lihat detail pada lembaga yang dimaksud.',
              'Di bagian Unit, cari unit sekolahnya lalu klik Tangguhkan.',
              'Tulis Alasan yang jelas, misalnya nomor tiket atau siapa yang meminta.',
              'Klik Konfirmasi.',
              'Beri tahu pengelola lembaga bahwa sekolahnya ditangguhkan.',
              'Buka Audit dan pastikan catatan penangguhan muncul.',
            ],
            href: '/platform',
            warning:
              'Sekolah langsung tidak bisa dipakai oleh guru, siswa, dan wali. Pastikan Anda memilih unit yang tepat dan sudah menghubungi pengelolanya.',
          },
          {
            heading: 'Mengaktifkan kembali sekolah',
            body: 'Aktifkan kembali setelah masalahnya selesai. Ada dua jenis penangguhan, dan keterangannya terlihat di samping unit: oleh staf, atau karena tagihan. Penangguhan karena tagihan terbuka sendiri setelah tagihan dibayar. Penangguhan oleh staf hanya terbuka lewat tombol Aktifkan kembali.',
            steps: [
              'Buka Lihat detail pada lembaga yang dimaksud.',
              'Di bagian Unit, klik Aktifkan kembali pada unit yang tepat.',
              'Tulis Alasan, misalnya masalah sudah selesai dan siapa yang memastikannya.',
              'Klik Konfirmasi lalu cek Audit.',
            ],
            href: '/platform',
            tip: 'Setelah mengaktifkan kembali, kabari pengelola lembaga supaya mereka tahu sekolahnya sudah bisa dipakai.',
          },
        ],
        faq: [
          {
            q: 'Sekolah saya tidak bisa login, apa yang dicek?',
            a: 'Cari lembaganya di Lembaga & unit lalu klik Lihat detail. Lihat status unit: bila Ditangguhkan, baca keterangannya, oleh staf atau karena tagihan. Bila karena tagihan, minta sekolah melunasi invoice yang terbuka. Bila oleh staf, lihat alasan di Audit sebelum memutuskan mengaktifkan kembali.',
          },
          {
            q: 'Sekolah sudah membayar tetapi masih ditangguhkan. Kenapa?',
            a: 'Kemungkinan penangguhannya dilakukan oleh staf, dan pembayaran tidak membukanya. Cek keterangan di samping unit lalu buka Audit untuk melihat alasannya. Bila masalahnya sudah selesai, klik Aktifkan kembali.',
          },
          {
            q: 'Lembaga yang baru mendaftar tidak ada di daftar. Di mana?',
            a: 'Lembaga baru baru muncul setelah pendaftarannya dibayar atau diaktifkan tanpa pembayaran. Buka Pendaftaran tertunda dan cari di sana.',
          },
          {
            q: 'Saya salah menangguhkan unit. Bagaimana membatalkannya?',
            a: 'Segera buka Lihat detail lembaganya, klik Aktifkan kembali pada unit tersebut, dan tulis alasan bahwa penangguhan dilakukan karena salah. Kedua tindakan tercatat di Audit.',
          },
        ],
      },
      en: {
        title: 'Foundations & units: monitoring and suspending',
        summary: 'Find a school, check its billing condition, and suspend or reactivate it.',
        forWho: 'Support staff and platform admins who look after customer schools.',
        sections: [
          {
            heading: 'Finding a particular school',
            body: 'The list shows each foundation name and address, the number of school units, the subscription status, the period end date, and the number of unpaid invoices.',
            steps: [
              'Open Foundations & units.',
              'Type a name or address in the Search foundations field.',
              'If needed, pick a subscription status: Active, Grace period, Suspended, Canceled, or No subscription.',
              'Click the Actions menu on the row, then choose View detail or Copy address.',
              'If the result is empty, click Clear filters and try other words.',
            ],
            href: '/platform',
          },
          {
            heading: 'Checking subscription and billing',
            body: 'On the View detail page you can see the subscription type (monthly or yearly) and its end date, the list of school units, recent invoices, the payment history, and the modules active in each unit with their validity date. Payments from a free activation are labelled No payment (complimentary). The Estimated MRR card on the main page uses the last paid invoice of each active subscription and does not count complimentary ones.',
            href: '/platform',
          },
          {
            heading: 'Suspending a school that is behind or has a problem',
            body: 'Only staff with the Platform admin role see the Suspend button. Once suspended, the school cannot be used at once. A suspension made by staff does not lift just because the school pays; you must reactivate it yourself. The reason you write (at most 300 characters) is shown to the users of the school and the institution owner together with the suspension date, so keep it polite and free of personal data. Your name is visible only in this console.',
            steps: [
              'Open View detail on the foundation.',
              'In the Units section, find the school unit and click Suspend.',
              'Write a clear Reason, for example a ticket number or who asked for it.',
              'Click Confirm.',
              'Tell the foundation manager that their school is suspended.',
              'Open Audit and confirm the suspension entry appears.',
            ],
            href: '/platform',
            warning:
              'Teachers, students, and guardians lose access at once. Make sure you chose the right unit and have contacted its manager.',
          },
          {
            heading: 'Reactivating a school',
            body: 'Reactivate once the problem is solved. There are two kinds of suspension, shown next to the unit: by staff, or because of billing. A billing suspension lifts by itself once the invoice is paid. A staff suspension only lifts through the Reactivate button.',
            steps: [
              'Open View detail on the foundation.',
              'In the Units section, click Reactivate on the right unit.',
              'Write a Reason, for example that the problem is solved and who confirmed it.',
              'Click Confirm, then check Audit.',
            ],
            href: '/platform',
            tip: 'After reactivating, tell the foundation manager so they know the school can be used again.',
          },
        ],
        faq: [
          {
            q: 'A school cannot sign in. What should I check?',
            a: 'Find the foundation in Foundations & units and click View detail. Look at the unit status: if it is Suspended, read the note, by staff or because of billing. If because of billing, ask the school to pay the open invoice. If by staff, read the reason in Audit before deciding to reactivate.',
          },
          {
            q: 'The school has paid but is still suspended. Why?',
            a: 'The suspension was probably made by staff, and payment does not lift it. Check the note next to the unit and open Audit to read the reason. If the problem is solved, click Reactivate.',
          },
          {
            q: 'A foundation that just registered is not in the list. Where is it?',
            a: 'A new foundation only appears after its registration is paid or activated without payment. Open Pending registrations and look for it there.',
          },
          {
            q: 'I suspended the wrong unit. How do I undo it?',
            a: 'Right away, open View detail of the foundation, click Reactivate on that unit, and write that the suspension was a mistake. Both actions are recorded in Audit.',
          },
        ],
      },
      su: {
        title: 'Lembaga & unit: mantuan jeung nangguhkeun',
        summary: 'Néangan sakola, ningali kaayaan tagihanana, sarta nangguhkeun atawa ngaktipkeunana deui.',
        forWho: 'Staf pangrojong jeung admin platform nu ngurus sakola palanggan.',
        sections: [
          {
            heading: 'Néangan sakola nu tangtu',
            body: 'Daptar nembongkeun ngaran jeung alamat lembaga, jumlah unit sakola, status langganan, tanggal mangsa réngsé, jeung jumlah invoice nu acan dibayar.',
            steps: [
              'Buka Lembaga & unit.',
              'Ketik ngaran atawa alamat dina kolom Cari lembaga.',
              'Lamun perlu, pilih status langganan: Aktip, Mangsa tenggang, Ditangguhkeun, Dibatalkeun, atawa Tanpa langganan.',
              'Klik menu Aksi dina baris lembaga, tuluy pilih Tingali detail atawa Salin alamat.',
              'Lamun hasilna kosong, klik Busékeun saringan tuluy cobi kecap séjén.',
            ],
            href: '/platform',
          },
          {
            heading: 'Ningali kaayaan langganan jeung tagihan',
            body: 'Dina kaca Tingali detail anjeun tiasa ningali jenis langganan (bulanan atawa taunan) jeung tanggal réngséna, daptar unit sakola, invoice panganyarna, riwayat pamayaran, sarta modul nu aktip di unggal unit jeung mangsa lakuna. Pamayaran tina aktivasi gratis ditandaan Tanpa pamayaran (komplimen). Kartu MRR kira-kira dina kaca utama maké tagihan nu dibayar pangeusina unggal langganan aktip sarta teu ngitung nu komplimen.',
            href: '/platform',
          },
          {
            heading: 'Nangguhkeun sakola nu nunggak atawa bermasalah',
            body: 'Ngan staf nu perannana Admin platform nu ningali tombol Tangguhkeun. Sanggeus ditangguhkeun, sakola langsung teu bisa dipaké. Penangguhan ku staf teu muka ngan ku sabab sakola mayar; anjeun kudu ngaktipkeunana deui sorangan. Alesan nu anjeun tulis (pangpangna 300 aksara) dipintonkeun ka pamaké sakola jeung nu gaduh lembaga babarengan jeung tanggal panangguhan, jadi tulis kalawan santun tur tanpa data pribadi. Ngaran anjeun ukur katingali dina konsol ieu.',
            steps: [
              'Buka Tingali detail dina lembaga nu dimaksud.',
              'Dina bagian Unit, pilarian unit sakolana tuluy klik Tangguhkeun.',
              'Tulis Alesan nu écés, upamana nomer tikét atawa saha nu menta.',
              'Klik Konfirmasi.',
              'Wartosan pangurus lembaga yén sakolana ditangguhkeun.',
              'Buka Audit tuluy pastikeun catetan penangguhan muncul.',
            ],
            href: '/platform',
            warning:
              'Guru, murid, jeung wali langsung leungit aksés. Pastikeun anjeun milih unit nu bener jeung geus ngahubungan pangurusna.',
          },
          {
            heading: 'Ngaktipkeun deui sakola',
            body: 'Aktipkeun deui sanggeus masalahna réngsé. Aya dua jenis penangguhan, keterangannana katingali di gigireun unit: ku staf, atawa alatan tagihan. Penangguhan alatan tagihan muka sorangan sanggeus tagihan dibayar. Penangguhan ku staf ngan muka ngaliwatan tombol Aktipkeun deui.',
            steps: [
              'Buka Tingali detail dina lembaga nu dimaksud.',
              'Dina bagian Unit, klik Aktipkeun deui dina unit nu pas.',
              'Tulis Alesan, upamana masalah geus réngsé jeung saha nu mastikeun.',
              'Klik Konfirmasi tuluy pariksa Audit.',
            ],
            href: '/platform',
            tip: 'Sanggeus ngaktipkeun deui, wartosan pangurus lembaga sangkan maranéhna terang sakolana geus bisa dipaké.',
          },
        ],
        faq: [
          {
            q: 'Sakola abdi teu tiasa lebet, naon nu kudu dipariksa?',
            a: 'Pilarian lembagana dina Lembaga & unit tuluy klik Tingali detail. Tingali status unit: lamun Ditangguhkeun, baca keteranganana, ku staf atawa alatan tagihan. Lamun alatan tagihan, mangga pénta sakola ngalunasan invoice nu muka. Lamun ku staf, baca alesanana dina Audit samemeh mutuskeun ngaktipkeun deui.',
          },
          {
            q: 'Sakola geus mayar tapi tetep ditangguhkeun. Naha?',
            a: 'Kamungkinan penangguhanana dilakukeun ku staf, jeung pamayaran teu muka eta. Pariksa keterangan di gigireun unit tuluy buka Audit pikeun maca alesanana. Lamun masalahna geus réngsé, klik Aktipkeun deui.',
          },
          {
            q: 'Lembaga nu karék daptar teu aya dina daptar. Aya di mana?',
            a: 'Lembaga anyar karék muncul sanggeus pendaptaranna dibayar atawa diaktipkeun tanpa pamayaran. Buka Pendaptaran nunggu tuluy pilarian di dinya.',
          },
          {
            q: 'Abdi lepat nangguhkeun unit. Kumaha mungkirna?',
            a: 'Geura buka Tingali detail lembagana, klik Aktipkeun deui dina unit eta, tuluy tulis yén penangguhanana lepat. Dua tindakan eta kacatet dina Audit.',
          },
        ],
      },
    },
  },
  {
    slug: 'registrations',
    icon: 'clipboard',
    tone: 'violet',
    group: 'ops',
    text: {
      id: {
        title: 'Pendaftaran tertunda dan aktivasi tanpa pembayaran',
        summary:
          'Menangani pendaftaran yang belum dibayar, termasuk mengaktifkan sekolah pilot tanpa pembayaran.',
        forWho: 'Admin platform yang menyetujui sekolah pilot atau mitra.',
        sections: [
          {
            heading: 'Melihat pendaftaran yang belum dibayar',
            body: 'Halaman Pendaftaran tertunda menampilkan satu kartu untuk tiap pendaftaran yang menunggu pembayaran. Kartu memuat nama lembaga, jumlah unit, siklus (Bulanan atau Tahunan), tanggal kedaluwarsa, dan tanggal dibuat. Sekolah baru muncul di Lembaga & unit setelah pendaftarannya dibayar atau diaktifkan tanpa pembayaran.',
            href: '/platform/pending',
          },
          {
            heading: 'Mengaktifkan sekolah tanpa pembayaran',
            body: 'Pakai langkah ini hanya untuk sekolah pilot atau mitra yang memang tidak membayar. Hanya staf dengan peran Admin platform yang melihat tombolnya. Aktivasi dicatat sebagai pembayaran Rp 0 (komplimen) di riwayat pembayaran dan di Audit lengkap dengan alasan Anda.',
            steps: [
              'Pastikan sekolah ini memang pilot atau mitra, dan persetujuannya sudah ada di luar konsol.',
              'Buka Pendaftaran tertunda lalu cari kartu pendaftarannya.',
              'Klik Aktifkan tanpa pembayaran.',
              'Tulis alasan yang jelas, misalnya siapa yang menyetujui dan sampai kapan.',
              'Klik Konfirmasi.',
              'Buka Lembaga & unit, cari sekolahnya, lalu catat tanggal perpanjangannya.',
            ],
            href: '/platform/pending',
            warning:
              'Tidak ada tombol untuk membatalkan aktivasi ini. Pastikan sekolahnya benar sebelum mengonfirmasi. Bila terlanjur, sekolah bisa ditangguhkan lewat Lembaga & unit.',
            tip: 'Tulis di alasan tanggal kapan sekolah ini perlu dihubungi lagi untuk beralih ke langganan berbayar.',
          },
          {
            heading: 'Pendaftar minta disetujui atau ditolak',
            body: 'Konsol tidak punya tombol setujui atau tolak. Satu-satunya tindakan staf adalah Aktifkan tanpa pembayaran. Pendaftaran yang tidak dibayar sampai tanggal kedaluwarsa akan hilang dengan sendirinya dan alamat sekolahnya dilepas, sehingga pendaftar harus mendaftar ulang. Berapa lama pendaftaran ditahan diatur di Pembayaran, pada kartu Parameter penagihan.',
            href: '/platform/payments',
          },
        ],
        faq: [
          {
            q: 'Sekolah sudah membayar tetapi masih ada di Pendaftaran tertunda. Apa yang dicek?',
            a: 'Pembayaran kadang butuh beberapa menit untuk terkonfirmasi. Muat ulang halaman. Bila tetap di sana, cek apakah pendaftarannya sudah kedaluwarsa dan lihat riwayat pembayaran di Lembaga & unit. Bila ragu, hubungi tim teknis dan sertakan nama lembaganya.',
          },
          {
            q: 'Kartu pendaftaran sekolah itu hilang. Ke mana perginya?',
            a: 'Ada dua kemungkinan: sudah dibayar atau diaktifkan (cek di Lembaga & unit), atau sudah kedaluwarsa. Bila kedaluwarsa, minta pendaftar mendaftar ulang. Konsol tidak bisa menghidupkan kembali pendaftaran yang kedaluwarsa.',
          },
          {
            q: 'Tombol Aktifkan tanpa pembayaran tidak muncul. Kenapa?',
            a: 'Tombol itu hanya untuk staf dengan peran Admin platform. Bila akun Anda berperan Hanya lihat, di halaman tertulis bahwa peran Anda hanya dapat melihat. Minta admin EduSync memberi Anda peran yang sesuai.',
          },
          {
            q: 'Pendaftar mengeluh alamat sekolahnya sudah dipakai. Bagaimana?',
            a: 'Alamat dipegang oleh pendaftaran yang belum dibayar sampai tanggal kedaluwarsanya. Cari kartu pendaftaran yang memegangnya. Bila itu milik pendaftar yang sama, bantu selesaikan pembayarannya. Bila bukan, tunggu sampai kedaluwarsa atau sarankan alamat lain.',
          },
        ],
      },
      en: {
        title: 'Pending registrations and activating without payment',
        summary:
          'Handle registrations that are not yet paid, including activating pilot schools without payment.',
        forWho: 'Platform admins who approve pilot schools or partners.',
        sections: [
          {
            heading: 'Seeing which registrations are unpaid',
            body: 'The Pending registrations page shows one card for each registration waiting for payment. A card shows the foundation name, number of units, cycle (Monthly or Yearly), expiry date, and creation date. A school only appears in Foundations & units after its registration is paid or activated without payment.',
            href: '/platform/pending',
          },
          {
            heading: 'Activating a school without payment',
            body: 'Use this only for pilot schools or partners who really do not pay. Only staff with the Platform admin role see the button. The activation is recorded as a Rp 0 (complimentary) payment in the payment history and in Audit, together with your reason.',
            steps: [
              'Make sure the school really is a pilot or partner and the approval exists outside the console.',
              'Open Pending registrations and find the registration card.',
              'Click Activate without payment.',
              'Write a clear reason, for example who approved it and until when.',
              'Click Confirm.',
              'Open Foundations & units, find the school, and note its renewal date.',
            ],
            href: '/platform/pending',
            warning:
              'There is no button to undo this activation. Make sure it is the right school before you confirm. If it happens by mistake, the school can be suspended from Foundations & units.',
            tip: 'Write in the reason when this school should be contacted again to move to a paid subscription.',
          },
          {
            heading: 'A registrant asks to be approved or rejected',
            body: 'The console has no approve or reject button. The only staff action is Activate without payment. A registration that is not paid by its expiry date disappears by itself and its school address is released, so the registrant has to register again. How long a registration is held is set in Payments, on the Billing parameters card.',
            href: '/platform/payments',
          },
        ],
        faq: [
          {
            q: 'The school has paid but is still in Pending registrations. What should I check?',
            a: 'Payments sometimes take a few minutes to be confirmed. Reload the page. If it stays there, check whether the registration has expired and look at the payment history in Foundations & units. If in doubt, contact the technical team with the foundation name.',
          },
          {
            q: 'The registration card of that school has disappeared. Where did it go?',
            a: 'There are two possibilities: it was paid or activated (check Foundations & units), or it expired. If it expired, ask the registrant to register again. The console cannot revive an expired registration.',
          },
          {
            q: 'The Activate without payment button does not show. Why?',
            a: 'That button is only for staff with the Platform admin role. If your account is Read only, the page says your role can only view. Ask an EduSync admin to give you the right role.',
          },
          {
            q: 'A registrant complains that their school address is already taken. What now?',
            a: 'An address is held by an unpaid registration until its expiry date. Find the registration card holding it. If it belongs to the same registrant, help them finish paying. If not, wait until it expires or suggest another address.',
          },
        ],
      },
      su: {
        title: 'Pendaptaran nunggu jeung aktivasi tanpa pamayaran',
        summary: 'Nangani pendaptaran nu acan dibayar, kaasup ngaktipkeun sakola pilot tanpa pamayaran.',
        forWho: 'Admin platform nu nyatujuan sakola pilot atawa mitra.',
        sections: [
          {
            heading: 'Ningali pendaptaran nu acan dibayar',
            body: 'Kaca Pendaptaran nunggu nembongkeun hiji kartu pikeun unggal pendaptaran nu nungguan pamayaran. Kartu eusina ngaran lembaga, jumlah unit, siklus (Bulanan atawa Taunan), tanggal kadaluwarsa, jeung tanggal dijieun. Sakola karék muncul dina Lembaga & unit sanggeus pendaptaranna dibayar atawa diaktipkeun tanpa pamayaran.',
            href: '/platform/pending',
          },
          {
            heading: 'Ngaktipkeun sakola tanpa pamayaran',
            body: 'Pake léngkah ieu ngan pikeun sakola pilot atawa mitra nu memang teu mayar. Ngan staf nu perannana Admin platform nu ningali tombolna. Aktivasi dicatet minangka pamayaran Rp 0 (komplimen) dina riwayat pamayaran jeung dina Audit sareng alesan anjeun.',
            steps: [
              'Pastikeun sakola ieu memang pilot atawa mitra, jeung persetujuanana geus aya di luar konsol.',
              'Buka Pendaptaran nunggu tuluy pilarian kartu pendaptaranana.',
              'Klik Aktipkeun tanpa pamayaran.',
              'Tulis alesan nu écés, upamana saha nu nyatujuan jeung nepi ka iraha.',
              'Klik Konfirmasi.',
              'Buka Lembaga & unit, pilarian sakolana, tuluy catet tanggal perpanjanganana.',
            ],
            href: '/platform/pending',
            warning:
              'Taya tombol pikeun ngabolaykeun aktivasi ieu. Pastikeun sakolana bener samemeh ngonfirmasi. Lamun kalepatan, sakola bisa ditangguhkeun tina Lembaga & unit.',
            tip: 'Tulis dina alesan iraha sakola ieu kudu dihubungan deui pikeun pindah ka langganan mayar.',
          },
          {
            heading: 'Pendaptar menta disatujuan atawa ditolak',
            body: 'Konsol teu boga tombol satuju atawa tolak. Hiji-hijina tindakan staf nyaéta Aktipkeun tanpa pamayaran. Pendaptaran nu teu dibayar nepi ka tanggal kadaluwarsa leungit sorangan jeung alamat sakolana dileupaskeun, ku kituna pendaptar kudu daptar deui. Sabaraha lami pendaptaran ditahan diatur dina Pamayaran, dina kartu Parameter penagihan.',
            href: '/platform/payments',
          },
        ],
        faq: [
          {
            q: 'Sakola geus mayar tapi tetep aya dina Pendaptaran nunggu. Naon nu kudu dipariksa?',
            a: 'Pamayaran kadang peryogi sababaraha menit pikeun dikonfirmasi. Muat deui kaca. Lamun tetep di dinya, pariksa naha pendaptaranna geus kadaluwarsa tuluy tingali riwayat pamayaran dina Lembaga & unit. Lamun bingung, hubungi tim téknis sareng ngaran lembagana.',
          },
          {
            q: 'Kartu pendaptaran sakola eta leungit. Ka mana?',
            a: 'Aya dua kamungkinan: geus dibayar atawa diaktipkeun (pariksa dina Lembaga & unit), atawa geus kadaluwarsa. Lamun kadaluwarsa, pénta pendaptar daptar deui. Konsol teu bisa nghirupkeun deui pendaptaran nu kadaluwarsa.',
          },
          {
            q: 'Tombol Aktipkeun tanpa pamayaran teu muncul. Naha?',
            a: 'Tombol eta ngan pikeun staf nu perannana Admin platform. Lamun akun anjeun Ngan ningali, di kaca aya tulisan yén peran anjeun ngan bisa ningali. Pénta admin EduSync méré anjeun peran nu cocog.',
          },
          {
            q: 'Pendaptar ngawadul alamat sakolana geus dipaké. Kumaha?',
            a: 'Alamat dicekel ku pendaptaran nu acan dibayar nepi ka tanggal kadaluwarsana. Pilarian kartu pendaptaran nu nyekelna. Lamun kagungan pendaptar nu sarua, bantosan ngabéréskeun pamayaranana. Lamun lain, antosan nepi ka kadaluwarsa atawa sarankeun alamat séjén.',
          },
        ],
      },
    },
  },
  {
    slug: 'payments',
    icon: 'credit',
    tone: 'amber',
    group: 'ops',
    text: {
      id: {
        title: 'Pembayaran dan aturan tagihan',
        summary:
          'Memilih cara sekolah membayar langganan, menyambungkan Midtrans, dan mengatur masa tenggang.',
        forWho: 'Admin platform yang mengurus pembayaran dan penagihan.',
        sections: [
          {
            heading: 'Memilih cara pembayaran sekolah',
            body: 'Di halaman Pembayaran, kolom Penyedia punya dua pilihan: Simulasi (tanpa uang, hanya untuk uji coba) dan Midtrans (Snap) untuk pembayaran sungguhan. Lencana Sumber pengaturan menunjukkan apakah nilai yang dipakai berasal dari Konsol ini atau dari pengaturan server yang dibuat tim teknis (bila belum pernah diatur di konsol).',
            href: '/platform/payments',
            warning:
              'Pilihan Simulasi tidak tersedia di server yang dipakai sekolah sungguhan. Jangan menjanjikan sekolah bahwa pembayaran uji coba bisa dipakai sebagai bayaran asli.',
          },
          {
            heading: 'Menyambungkan Midtrans',
            body: 'Midtrans adalah layanan yang menerima pembayaran dari sekolah. Pengaturan berlaku tanpa harus menghidupkan ulang apa pun, untuk pendaftaran dan tagihan berikutnya.',
            steps: [
              'Di Penyedia, pilih Midtrans (Snap).',
              'Di Lingkungan Midtrans, pilih Sandbox (uji) atau Produksi (uang sungguhan).',
              'Isi Kunci server Midtrans. Kunci ini diambil dari situs Midtrans, menu Settings lalu Access Keys. Kunci adalah kata sandi khusus yang membuat EduSync boleh menerima pembayaran atas nama Anda.',
              'Salin alamat di kolom Notification URL dengan tombol Salin, lalu daftarkan di situs Midtrans, menu Settings, Configuration, Payment Notification URL. Dengan alamat ini Midtrans memberi tahu EduSync bila sekolah sudah membayar.',
              'Klik Simpan pengaturan.',
              'Uji dengan satu pendaftaran kecil di lingkungan Sandbox sebelum beralih ke Produksi.',
            ],
            href: '/platform/payments',
            tip: 'Bila kunci sudah tersimpan, kolom dibiarkan kosong untuk mempertahankannya. Yang terlihat hanya empat karakter terakhir.',
          },
          {
            heading: 'Mengubah masa tenggang dan aturan tagihan',
            body: 'Kartu Parameter penagihan memuat empat angka yang berlaku untuk semua sekolah. Masa tenggang (bawaan 7 hari): sekolah tetap berjalan sekian hari setelah periode habis sebelum ditangguhkan. Pengingat perpanjangan (7 hari): invoice perpanjangan dibuat sekian hari sebelum periode habis. Masa pesanan pendaftaran (24 jam): berapa lama pendaftaran dan alamat sekolahnya ditahan. Bayar tahunan (10 bulan): langganan tahunan dihitung sebanyak ini bulan.',
            steps: [
              'Ubah angka yang perlu diganti. Bila angkanya di luar batas, rentang yang boleh muncul di bawah kolom.',
              'Untuk kembali ke nilai awal, klik Isi nilai bawaan. Ini belum menyimpan apa pun.',
              'Klik Simpan parameter.',
            ],
            href: '/platform/payments',
            warning:
              'Perubahan memengaruhi semua sekolah untuk tagihan dan pendaftaran berikutnya. Invoice yang sudah dibuat tidak berubah. Mengubah Bayar tahunan juga mengubah harga tahunan baru dan perpanjangan.',
          },
        ],
        faq: [
          {
            q: 'Sekolah sudah membayar lewat Midtrans tetapi statusnya belum berubah. Apa yang dicek?',
            a: 'Tunggu beberapa menit lalu muat ulang. Bila belum berubah, cek di halaman Pembayaran apakah Notification URL sudah terdaftar di situs Midtrans dan penyedia yang dipilih adalah Midtrans. Bila sudah benar, hubungi tim teknis dengan nama lembaga dan waktu pembayaran.',
          },
          {
            q: 'Saya lupa kunci server yang tersimpan. Bisakah dilihat?',
            a: 'Tidak. Kunci disimpan dengan aman dan hanya empat karakter terakhirnya yang terlihat. Bila perlu, ambil kunci baru dari situs Midtrans lalu isi di kolom Kunci server dan Simpan pengaturan.',
          },
          {
            q: 'Berapa lama sekolah boleh telat bayar sebelum ditangguhkan?',
            a: 'Sebanyak angka Masa tenggang di kartu Parameter penagihan (bawaannya 7 hari setelah periode habis). Selama itu status sekolah Masa tenggang. Setelah lewat, sekolah ditangguhkan karena tagihan dan terbuka sendiri setelah tagihan dibayar.',
          },
          {
            q: 'Saya salah mengisi parameter. Bisa dikembalikan?',
            a: 'Bisa. Klik Isi nilai bawaan lalu Simpan parameter. Atau ketik angka yang benar lalu simpan. Invoice yang telanjur dibuat dengan angka lama tidak ikut berubah.',
          },
        ],
      },
      en: {
        title: 'Payments and billing rules',
        summary: 'Choose how schools pay for their subscription, connect Midtrans, and set the grace period.',
        forWho: 'Platform admins who look after payments and billing.',
        sections: [
          {
            heading: 'Choosing how schools pay',
            body: 'On the Payments page, the Provider field has two choices: Simulation (no money, only for testing) and Midtrans (Snap) for real payments. The Settings source badge shows whether the values in use come from This console or from settings made by the technical team on the server (when never set in the console).',
            href: '/platform/payments',
            warning:
              'Simulation is not available on the server real schools use. Do not promise a school that a test payment counts as a real payment.',
          },
          {
            heading: 'Connecting Midtrans',
            body: 'Midtrans is the service that receives payments from schools. The settings take effect without restarting anything, for the next registrations and invoices.',
            steps: [
              'In Provider, choose Midtrans (Snap).',
              'In Midtrans environment, choose Sandbox (test) or Production (real money).',
              'Fill in the Midtrans server key. Take it from the Midtrans site, menu Settings then Access Keys. The key is a special password that lets EduSync receive payments on your behalf.',
              'Copy the address in the Notification URL field with the Copy button, then register it on the Midtrans site, menu Settings, Configuration, Payment Notification URL. With this address Midtrans tells EduSync when a school has paid.',
              'Click Save settings.',
              'Test with one small registration in Sandbox before switching to Production.',
            ],
            href: '/platform/payments',
            tip: 'If a key is already stored, leave the field empty to keep it. Only the last four characters are visible.',
          },
          {
            heading: 'Changing the grace period and billing rules',
            body: 'The Billing parameters card has four numbers that apply to every school. Grace period (default 7 days): the school keeps running for this many days after the period ends before it is suspended. Renewal reminder (7 days): the renewal invoice is created this many days before the period ends. Registration reservation (24 hours): how long a registration and its school address are held. Yearly payment (10 months): a yearly subscription is counted as this many months.',
            steps: [
              'Change the numbers you need. If a number is out of range, the allowed range shows under the field.',
              'To go back to the starting values, click Fill defaults. This does not save anything yet.',
              'Click Save parameters.',
            ],
            href: '/platform/payments',
            warning:
              'The change affects every school for later invoices and registrations. Invoices already created do not change. Changing Yearly payment also changes new yearly prices and renewals.',
          },
        ],
        faq: [
          {
            q: 'A school paid through Midtrans but its status has not changed. What should I check?',
            a: 'Wait a few minutes and reload. If it has not changed, check on the Payments page that the Notification URL is registered on the Midtrans site and that Midtrans is the selected provider. If both are right, contact the technical team with the foundation name and payment time.',
          },
          {
            q: 'I forgot the stored server key. Can I see it?',
            a: 'No. The key is stored securely and only its last four characters are visible. If needed, take a new key from the Midtrans site, enter it in the Server key field, and click Save settings.',
          },
          {
            q: 'How late can a school pay before it is suspended?',
            a: 'As many days as the Grace period number on the Billing parameters card (default 7 days after the period ends). During that time the school status is Grace period. After that the school is suspended because of billing and opens by itself once the invoice is paid.',
          },
          {
            q: 'I filled in a parameter wrongly. Can I undo it?',
            a: 'Yes. Click Fill defaults then Save parameters, or type the right number and save. Invoices already created with the old number do not change.',
          },
        ],
      },
      su: {
        title: 'Pamayaran jeung aturan tagihan',
        summary: 'Milih cara sakola mayar langganan, nyambungkeun Midtrans, jeung ngatur mangsa tenggang.',
        forWho: 'Admin platform nu ngurus pamayaran jeung penagihan.',
        sections: [
          {
            heading: 'Milih cara sakola mayar',
            body: 'Dina kaca Pamayaran, kolom Panyadia boga dua pilihan: Simulasi (tanpa duit, ngan pikeun uji coba) jeung Midtrans (Snap) pikeun pamayaran sabenerna. Lencana Sumber pangaturan nembongkeun naha nilai nu dipaké asalna ti Konsol ieu atawa ti pangaturan nu dijieun ku tim téknis dina server (lamun can kungsi diatur di konsol).',
            href: '/platform/payments',
            warning:
              'Pilihan Simulasi teu aya dina server nu dipaké ku sakola sabenerna. Ulah jangji ka sakola yén pamayaran uji coba bisa diitung minangka pamayaran asli.',
          },
          {
            heading: 'Nyambungkeun Midtrans',
            body: 'Midtrans nyaéta layanan nu narima pamayaran ti sakola. Pangaturan lumaku tanpa kudu nyaangan deui nanaon, pikeun pendaptaran jeung tagihan satuluyna.',
            steps: [
              'Dina Panyadia, pilih Midtrans (Snap).',
              'Dina Lingkungan Midtrans, pilih Sandbox (uji) atawa Produksi (duit sabenerna).',
              'Eusian Konci server Midtrans. Candak tina situs Midtrans, menu Settings tuluy Access Keys. Konci nyaéta kecap rusiah husus nu ngidinan EduSync narima pamayaran atas ngaran anjeun.',
              'Salin alamat dina kolom Notification URL ku tombol Salin, tuluy daptarkeun dina situs Midtrans, menu Settings, Configuration, Payment Notification URL. Ku alamat ieu Midtrans ngabéjaan EduSync lamun sakola geus mayar.',
              'Klik Simpen pangaturan.',
              'Uji ku hiji pendaptaran leutik dina Sandbox samemeh pindah ka Produksi.',
            ],
            href: '/platform/payments',
            tip: 'Lamun konci geus disimpen, kosongkeun kolomna pikeun nahanana. Nu katingali ngan opat karakter pamungkas.',
          },
          {
            heading: 'Ngarobih mangsa tenggang jeung aturan tagihan',
            body: 'Kartu Parameter penagihan eusina opat angka nu lumaku pikeun sakabéh sakola. Mangsa tenggang (biasana 7 poé): sakola tetep jalan sakitu poéna sanggeus mangsa béak samemeh ditangguhkeun. Pangéling perpanjangan (7 poé): invoice perpanjangan dijieun sakitu poéna samemeh mangsa béak. Mangsa pesenan pendaptaran (24 jam): sabaraha lami pendaptaran jeung alamat sakolana ditahan. Mayar taunan (10 bulan): langganan taunan diitung sakitu bulanna.',
            steps: [
              'Robah angka nu perlu diganti. Lamun angkana kaluar tina wates, rentang nu meunang muncul handapeun kolom.',
              'Pikeun balik ka nilai awal, klik Eusian nilai baku. Ieu can nyimpen nanaon.',
              'Klik Simpen parameter.',
            ],
            href: '/platform/payments',
            warning:
              'Parobahan mangaruhan sakabéh sakola pikeun tagihan jeung pendaptaran satuluyna. Invoice nu geus dijieun teu robah. Ngarobih Mayar taunan ogé ngarobah harga taunan anyar jeung perpanjangan.',
          },
        ],
        faq: [
          {
            q: 'Sakola geus mayar ku Midtrans tapi statusna can robah. Naon nu kudu dipariksa?',
            a: 'Antosan sababaraha menit tuluy muat deui. Lamun can robah, pariksa dina kaca Pamayaran naha Notification URL geus kadaptar dina situs Midtrans jeung panyadia nu dipilih Midtrans. Lamun dua-duana bener, hubungi tim téknis sareng ngaran lembaga jeung waktu pamayaran.',
          },
          {
            q: 'Abdi hilap konci server nu disimpen. Tiasa ditingali?',
            a: 'Henteu. Konci disimpen kalayan aman jeung ngan opat karakter pamungkasna nu katingali. Lamun perlu, candak konci anyar tina situs Midtrans, eusian dina kolom Konci server, tuluy klik Simpen pangaturan.',
          },
          {
            q: 'Sabaraha lami sakola meunang telat mayar samemeh ditangguhkeun?',
            a: 'Sakitu poéna salaku angka Mangsa tenggang dina kartu Parameter penagihan (biasana 7 poé sanggeus mangsa béak). Salila eta status sakola Mangsa tenggang. Sanggeus lewat, sakola ditangguhkeun alatan tagihan jeung muka sorangan sanggeus tagihan dibayar.',
          },
          {
            q: 'Abdi lepat ngeusian parameter. Tiasa dibalikeun?',
            a: 'Tiasa. Klik Eusian nilai baku tuluy Simpen parameter, atawa ketik angka nu bener tuluy simpen. Invoice nu geus dijieun ku angka heubeul teu milu robah.',
          },
        ],
      },
    },
  },
  {
    slug: 'catalog',
    icon: 'package',
    tone: 'rose',
    group: 'config',
    text: {
      id: {
        title: 'Harga & modul: mengatur yang dijual',
        summary:
          'Mengubah harga, menambah modul, mengatur paket siap pakai, dan menghentikan penjualan sebuah item.',
        forWho: 'Admin platform yang menentukan harga dan paket langganan.',
        sections: [
          {
            heading: 'Mengubah harga modul atau tingkat siswa',
            body: 'Katalog berisi item berjenis Inti, Modul, dan Tingkat siswa. Tiap item punya harga per bulan. Paket siap pakai hanyalah pilihan cepat di halaman daftar; harganya tetap dihitung dari item-item ini. Hanya staf dengan peran Admin platform yang melihat tombol Ubah.',
            steps: [
              'Buka Harga & modul.',
              'Di daftar Modul dan tingkat siswa, klik Ubah pada baris item.',
              'Ganti Nama, Harga per bulan (Rp), atau Urutan sesuai kebutuhan.',
              'Klik Simpan.',
            ],
            href: '/platform/catalog',
            warning:
              'Harga baru berlaku untuk pendaftaran dan tagihan perpanjangan berikutnya, dan berlaku untuk semua sekolah yang memakai item itu. Invoice yang sudah dibuat tidak berubah.',
          },
          {
            heading: 'Menambah modul atau tingkat siswa baru',
            body: 'Gunakan kartu Tambah modul atau tingkat. Modul baru baru berfungsi di sekolah bila fiturnya memang sudah ada di aplikasi. Bila belum, di katalog ia hanya menjadi pilihan yang bisa dibeli, jadi tanyakan dulu kepada tim teknis.',
            steps: [
              'Di kartu Tambah modul atau tingkat, pilih Jenis.',
              'Isi Kunci (pengenal singkat tanpa spasi), Nama, dan Harga per bulan (Rp).',
              'Untuk Tingkat siswa, isi Batas siswa aktif, atau kosongkan bila tanpa batas. Untuk Modul, isi Syarat modul bila modul ini butuh modul lain.',
              'Klik Tambah.',
            ],
            href: '/platform/catalog',
            tip: 'Pikirkan Kunci dengan teliti. Kunci tidak bisa diubah setelah item dibuat.',
          },
          {
            heading: 'Membuat atau menyembunyikan paket siap pakai',
            body: 'Paket adalah gabungan satu tingkat siswa dan beberapa modul, supaya pendaftar tidak perlu memilih satu per satu. Nama paket maksimal 40 karakter dan deskripsinya maksimal 200 karakter. Menghapus paket tidak mengubah langganan sekolah mana pun.',
            steps: [
              'Di kartu Buat paket, isi Kunci, Nama, dan Deskripsi.',
              'Pilih Tingkat siswa lalu centang Modul yang ikut.',
              'Klik Tambah, lalu buka halaman daftar untuk memastikan tampilannya benar.',
              'Untuk menyembunyikan paket, ubah paketnya lalu hilangkan centang Aktif.',
            ],
            href: '/platform/catalog',
          },
          {
            heading: 'Menghentikan penjualan sebuah item',
            body: 'Item katalog tidak bisa dihapus, hanya dinonaktifkan. Item yang nonaktif tidak tampil untuk pendaftar baru, tetapi sekolah yang sudah berlangganan tetap ditagih dengan harganya. Item Inti tidak boleh dinonaktifkan. Sebelum menonaktifkan modul, periksa Syarat modul supaya tidak ada modul lain yang bergantung padanya.',
            warning:
              'Setelah dinonaktifkan, pendaftar baru tidak bisa memilih item ini lagi. Beri tahu tim penjualan sebelum menonaktifkan.',
          },
        ],
        faq: [
          {
            q: 'Saya mengubah harga tetapi invoice sekolah masih memakai harga lama. Kenapa?',
            a: 'Memang begitu. Invoice yang sudah dibuat tidak berubah. Harga baru dipakai pada pendaftaran dan invoice perpanjangan yang dibuat sesudahnya.',
          },
          {
            q: 'Modul baru sudah saya tambahkan tetapi sekolah tidak melihat fiturnya. Apa yang dicek?',
            a: 'Menambah modul di katalog hanya membuat modul itu bisa dibeli. Fitur harus sudah disiapkan oleh tim teknis. Tanyakan kepada mereka apakah fitur modul itu sudah tersedia.',
          },
          {
            q: 'Saya ingin menghapus paket lama. Apakah sekolah yang memakainya terdampak?',
            a: 'Tidak. Menghapus paket tidak mengubah langganan sekolah mana pun. Bila hanya ingin menyembunyikan, ubah paketnya dan hilangkan centang Aktif.',
          },
          {
            q: 'Tombol Ubah dan Tambah tidak terlihat. Kenapa?',
            a: 'Hanya staf dengan peran Admin platform yang melihatnya. Bila akun Anda Hanya lihat, halaman menampilkan keterangan bahwa peran Anda hanya dapat melihat.',
          },
        ],
      },
      en: {
        title: 'Prices & modules: managing what is sold',
        summary: 'Change prices, add modules, manage ready-made plans, and stop selling an item.',
        forWho: 'Platform admins who decide prices and subscription plans.',
        sections: [
          {
            heading: 'Changing the price of a module or student tier',
            body: 'The catalog holds items of kind Core, Module, and Student tier. Each item has a monthly price. Ready-made plans are only quick choices on the registration page; their price is still worked out from these items. Only staff with the Platform admin role see the Edit button.',
            steps: [
              'Open Prices & modules.',
              'In the Modules and student tiers list, click Edit on the item row.',
              'Change the Name, Price per month (Rp), or Order as needed.',
              'Click Save.',
            ],
            href: '/platform/catalog',
            warning:
              'The new price applies to later registrations and renewal invoices, for every school that uses the item. Invoices already created do not change.',
          },
          {
            heading: 'Adding a new module or student tier',
            body: 'Use the Add module or tier card. A new module only works in schools if its feature already exists in the application. If not, in the catalog it is just something that can be bought, so ask the technical team first.',
            steps: [
              'In the Add module or tier card, choose the Kind.',
              'Fill in the Key (a short identifier with no spaces), Name, and Price per month (Rp).',
              'For a Student tier, fill in Active student limit, or leave it empty for no limit. For a Module, fill in Module requirements if it needs other modules.',
              'Click Add.',
            ],
            href: '/platform/catalog',
            tip: 'Think carefully about the Key. It cannot be changed once the item is created.',
          },
          {
            heading: 'Creating or hiding a ready-made plan',
            body: 'A plan combines one student tier with several modules, so registrants do not have to pick one by one. A plan name is up to 40 characters and its description up to 200. Deleting a plan does not change any school subscription.',
            steps: [
              'In the Create plan card, fill in the Key, Name, and Description.',
              'Pick the Student tier and tick the Modules that come with it.',
              'Click Add, then open the registration page to check it looks right.',
              'To hide a plan, edit it and untick Active.',
            ],
            href: '/platform/catalog',
          },
          {
            heading: 'Stopping the sale of an item',
            body: 'Catalog items cannot be deleted, only deactivated. A deactivated item does not show for new registrants, but schools already subscribed are still billed at its price. Core items cannot be deactivated. Before deactivating a module, check Module requirements so no other module depends on it.',
            warning:
              'Once deactivated, new registrants can no longer choose this item. Tell the sales team before you deactivate it.',
          },
        ],
        faq: [
          {
            q: 'I changed a price but a school invoice still shows the old one. Why?',
            a: 'That is expected. Invoices already created do not change. The new price is used for registrations and renewal invoices created afterwards.',
          },
          {
            q: 'I added a new module but schools cannot see the feature. What should I check?',
            a: 'Adding a module to the catalog only makes it purchasable. The feature has to be prepared by the technical team. Ask them whether the module feature is available.',
          },
          {
            q: 'I want to delete an old plan. Are schools using it affected?',
            a: 'No. Deleting a plan does not change any school subscription. If you only want to hide it, edit the plan and untick Active.',
          },
          {
            q: 'The Edit and Add buttons are not visible. Why?',
            a: 'Only staff with the Platform admin role see them. If your account is Read only, the page says your role can only view.',
          },
        ],
      },
      su: {
        title: 'Harga & modul: ngatur nu dijual',
        summary:
          'Ngarobih harga, nambihan modul, ngatur paket siap pakéna, jeung ngeureunkeun jualan hiji item.',
        forWho: 'Admin platform nu nangtukeun harga jeung paket langganan.',
        sections: [
          {
            heading: 'Ngarobih harga modul atawa tingkat siswa',
            body: 'Katalog eusina item jenis Inti, Modul, jeung Tingkat siswa. Unggal item boga harga sabulan. Paket siap pakéna ngan pilihan gancang dina kaca daptar; hargana tetep diitung tina item-item ieu. Ngan staf nu perannana Admin platform nu ningali tombol Ubah.',
            steps: [
              'Buka Harga & modul.',
              'Dina daptar Modul jeung tingkat siswa, klik Ubah dina baris item.',
              'Ganti Ngaran, Harga per bulan (Rp), atawa Urutan sakumaha peryogina.',
              'Klik Simpen.',
            ],
            href: '/platform/catalog',
            warning:
              'Harga anyar lumaku pikeun pendaptaran jeung tagihan perpanjangan satuluyna, pikeun sakabéh sakola nu maké item eta. Invoice nu geus dijieun teu robah.',
          },
          {
            heading: 'Nambihan modul atawa tingkat siswa anyar',
            body: 'Pake kartu Tambih modul atawa tingkat. Modul anyar karék jalan di sakola lamun fiturna memang geus aya dina aplikasi. Lamun can, dina katalog ngan jadi pilihan nu bisa dipeuli, ku kituna tanyakeun heula ka tim téknis.',
            steps: [
              'Dina kartu Tambih modul atawa tingkat, pilih Jenis.',
              'Eusian Konci (ciri singget tanpa spasi), Ngaran, jeung Harga per bulan (Rp).',
              'Pikeun Tingkat siswa, eusian Wates siswa aktip, atawa kosongkeun lamun taya wates. Pikeun Modul, eusian Sarat modul lamun peryogi modul séjén.',
              'Klik Tambih.',
            ],
            href: '/platform/catalog',
            tip: 'Pikirkeun Konci kalayan taliti. Konci teu bisa dirobah sanggeus item dijieun.',
          },
          {
            heading: 'Nyieun atawa nyumputkeun paket siap pakéna',
            body: 'Paket nyaéta gabungan hiji tingkat siswa jeung sababaraha modul, sangkan pendaptar teu kudu milih hiji-hiji. Ngaran paket pangmaksimalna 40 karakter jeung pedaranana 200. Mupus paket teu ngarobah langganan sakola mana waé.',
            steps: [
              'Dina kartu Jieun paket, eusian Konci, Ngaran, jeung Pedaran.',
              'Pilih Tingkat siswa tuluy centang Modul nu milu.',
              'Klik Tambih, tuluy buka kaca daptar pikeun mastikeun tampilanana bener.',
              'Pikeun nyumputkeun paket, robah paketna tuluy leungitkeun centang Aktip.',
            ],
            href: '/platform/catalog',
          },
          {
            heading: 'Ngeureunkeun jualan hiji item',
            body: 'Item katalog teu bisa dipupus, ngan bisa dinonaktipkeun. Item nu nonaktip teu muncul pikeun pendaptar anyar, tapi sakola nu geus langganan tetep ditagih nurutkeun hargana. Item Inti teu meunang dinonaktipkeun. Samemeh nonaktipkeun modul, pariksa Sarat modul sangkan taya modul séjén nu gumantung ka dinya.',
            warning:
              'Sanggeus dinonaktipkeun, pendaptar anyar teu bisa milih item ieu deui. Wartosan tim penjualan samemeh nonaktipkeun.',
          },
        ],
        faq: [
          {
            q: 'Abdi ngarobih harga tapi invoice sakola tetep harga heubeul. Naha?',
            a: 'Memang kitu. Invoice nu geus dijieun teu robah. Harga anyar dipaké pikeun pendaptaran jeung invoice perpanjangan nu dijieun sanggeusna.',
          },
          {
            q: 'Modul anyar geus ditambihan tapi sakola teu ningali fiturna. Naon nu kudu dipariksa?',
            a: 'Nambihan modul dina katalog ngan ngajadikeun modulna bisa dipeuli. Fiturna kudu geus disiapkeun ku tim téknis. Tanyakeun ka maranéhna naha fitur modulna geus sayogi.',
          },
          {
            q: 'Abdi hoyong mupus paket heubeul. Naha sakola nu maké kapangaruhan?',
            a: 'Henteu. Mupus paket teu ngarobah langganan sakola mana waé. Lamun ngan hoyong nyumputkeun, robah paketna tuluy leungitkeun centang Aktip.',
          },
          {
            q: 'Tombol Ubah jeung Tambih teu katingali. Naha?',
            a: 'Ngan staf nu perannana Admin platform nu ningali. Lamun akun anjeun Ngan ningali, kaca nembongkeun keterangan yén peran anjeun ngan bisa ningali.',
          },
        ],
      },
    },
  },
  {
    slug: 'curriculum',
    icon: 'book',
    tone: 'emerald',
    group: 'config',
    text: {
      id: {
        title: 'Bank kurikulum: acuan mata pelajaran',
        summary:
          'Menyiapkan jenjang, kurikulum, dan mata pelajaran acuan yang dapat disalin oleh semua sekolah.',
        forWho: 'Admin platform yang menyiapkan data acuan pelajaran untuk sekolah.',
        sections: [
          {
            heading: 'Menambah jenjang atau kurikulum',
            body: 'Bank kurikulum adalah contoh awal yang dipakai bersama oleh semua sekolah. Sekolah menyalin mata pelajaran dari sini lalu bebas mengubahnya, sehingga perubahan di sini tidak menimpa data sekolah. Semua staf bisa melihat; hanya Admin platform yang bisa mengubah.',
            steps: [
              'Buka Bank kurikulum.',
              'Untuk jenjang, klik Tambah jenjang lalu isi Kunci, Nama, dan Urutan.',
              'Untuk kurikulum, klik Tambah kurikulum lalu isi Kunci dan Nama.',
              'Klik Tambah.',
            ],
            href: '/platform/curriculum',
            tip: 'Kunci adalah pengenal singkat huruf kecil tanpa spasi, misalnya sd atau smp. Kunci tidak bisa diubah setelah dibuat.',
          },
          {
            heading: 'Menambah mata pelajaran acuan satu per satu',
            body: 'Mata pelajaran acuan diatur per kurikulum dan per jenjang. Kode mata pelajaran harus unik dalam satu kurikulum dan jenjang. Mata pelajaran baru akan muncul sebagai acuan baru yang bisa diambil di sekolah yang sudah memakai kurikulum dan jenjang itu.',
            steps: [
              'Di kartu Kurikulum dan mapel acuan, pilih kurikulum.',
              'Klik Tambah mapel lalu isi Kode, Nama, dan Jenjang.',
              'Klik Tambah.',
            ],
            href: '/platform/curriculum',
          },
          {
            heading: 'Memasukkan banyak mata pelajaran sekaligus',
            body: 'Bila mata pelajarannya banyak, gunakan Impor. Siapkan satu baris untuk tiap mata pelajaran dengan isi: kode, nama, dan urutan (urutan boleh kosong). Pemisahnya bisa tab, titik koma, atau koma.',
            steps: [
              'Pilih kurikulum lalu klik Impor.',
              'Pilih Berkas CSV, atau tempel isi tabel dari Excel di kolom Atau tempel isi tabel.',
              'Periksa jumlah baris terbaca yang muncul dan pastikan sesuai dengan jumlah data Anda.',
              'Klik Impor untuk memasukkan datanya.',
            ],
            href: '/platform/curriculum',
            tip: 'Kode yang sudah ada tidak membuat baris ganda. Hanya namanya yang diperbarui, sehingga aman bila Anda mengimpor ulang untuk memperbaiki nama.',
          },
          {
            heading: 'Menyembunyikan atau menghapus data acuan',
            body: 'Jenjang yang dinonaktifkan tidak muncul di pilihan sekolah, tetapi pilihan yang sudah diambil sekolah tidak berubah. Data hanya bisa dihapus bila tidak dipakai: jenjang tanpa mata pelajaran acuan dan tanpa sekolah yang mengambilnya, atau kurikulum yang belum diambil sekolah mana pun. Menghapus kurikulum ikut menghapus seluruh mata pelajaran acuannya.',
            warning: 'Penghapusan tidak bisa dibatalkan. Bila ragu, nonaktifkan saja.',
          },
        ],
        faq: [
          {
            q: 'Saya mengubah nama mata pelajaran acuan. Apakah nama di sekolah ikut berubah?',
            a: 'Tidak. Sekolah menyimpan salinannya sendiri, jadi mata pelajaran yang sudah diambil tidak berubah. Perubahan hanya terlihat pada pengambilan berikutnya.',
          },
          {
            q: 'Tombol Hapus tidak bisa dipakai atau ditolak. Kenapa?',
            a: 'Data itu masih dipakai, entah oleh mata pelajaran acuan atau oleh sekolah yang sudah mengambilnya. Nonaktifkan saja bila ingin menyembunyikannya dari pilihan sekolah.',
          },
          {
            q: 'Impor menampilkan 0 baris terbaca. Apa yang salah?',
            a: 'Periksa bahwa setiap baris berisi kode lalu nama, dengan pemisah yang sama di semua baris. Bila menempel dari Excel, salin hanya kolom kode, nama, dan urutan tanpa judul kolom.',
          },
        ],
      },
      en: {
        title: 'Curriculum bank: reference subjects',
        summary: 'Prepare the levels, curricula, and reference subjects that every school can copy.',
        forWho: 'Platform admins who prepare reference subject data for schools.',
        sections: [
          {
            heading: 'Adding a level or a curriculum',
            body: 'The curriculum bank is a starting example shared by all schools. Schools copy subjects from here and can then change them freely, so changes here do not overwrite school data. All staff can view; only Platform admins can change.',
            steps: [
              'Open Curriculum bank.',
              'For a level, click Add level and fill in the Key, Name, and Order.',
              'For a curriculum, click Add curriculum and fill in the Key and Name.',
              'Click Add.',
            ],
            href: '/platform/curriculum',
            tip: 'A Key is a short lowercase identifier with no spaces, for example sd or smp. A key cannot be changed once created.',
          },
          {
            heading: 'Adding reference subjects one by one',
            body: 'Reference subjects are managed per curriculum and per level. A subject code must be unique within one curriculum and level. A new subject shows up as a new reference that can be taken in schools already using that curriculum and level.',
            steps: [
              'In the Curricula and reference subjects card, pick the curriculum.',
              'Click Add subject and fill in the Code, Name, and Level.',
              'Click Add.',
            ],
            href: '/platform/curriculum',
          },
          {
            heading: 'Adding many subjects at once',
            body: 'When there are many subjects, use Import. Prepare one row per subject with: code, name, and order (order may be empty). The separator can be a tab, semicolon, or comma.',
            steps: [
              'Pick the curriculum, then click Import.',
              'Choose a CSV file, or paste the table from Excel into the Or paste the table field.',
              'Check the number of rows read that appears and make sure it matches your data.',
              'Click Import to add the data.',
            ],
            href: '/platform/curriculum',
            tip: 'An existing code does not create a duplicate row. Only its name is updated, so it is safe to import again to fix names.',
          },
          {
            heading: 'Hiding or deleting reference data',
            body: 'A deactivated level does not show in school choices, but what schools already took does not change. Data can only be deleted when unused: a level with no reference subjects and no school that took it, or a curriculum no school has taken. Deleting a curriculum also deletes all its reference subjects.',
            warning: 'Deleting cannot be undone. If in doubt, just deactivate.',
          },
        ],
        faq: [
          {
            q: 'I renamed a reference subject. Does the name change in schools?',
            a: 'No. Schools keep their own copy, so subjects already taken do not change. The change is only seen the next time someone takes it.',
          },
          {
            q: 'The Delete button does not work or is refused. Why?',
            a: 'The data is still in use, either by reference subjects or by schools that already took it. Just deactivate it if you want to hide it from school choices.',
          },
          {
            q: 'Import shows 0 rows read. What is wrong?',
            a: 'Check that every row has a code then a name, with the same separator on all rows. If you paste from Excel, copy only the code, name, and order columns without the column titles.',
          },
        ],
      },
      su: {
        title: 'Bank kurikulum: acuan mata pelajaran',
        summary:
          'Nyiapkeun jenjang, kurikulum, jeung mata pelajaran acuan nu bisa disalin ku sakabéh sakola.',
        forWho: 'Admin platform nu nyiapkeun data acuan pelajaran pikeun sakola.',
        sections: [
          {
            heading: 'Nambihan jenjang atawa kurikulum',
            body: 'Bank kurikulum nyaéta conto awal nu dipaké babarengan ku sakabéh sakola. Sakola nyalin mata pelajaran ti dieu tuluy bébas ngarobihna, ku kituna parobahan di dieu teu nimpa data sakola. Sakabéh staf bisa ningali; ngan Admin platform nu bisa ngarobih.',
            steps: [
              'Buka Bank kurikulum.',
              'Pikeun jenjang, klik Tambih jenjang tuluy eusian Konci, Ngaran, jeung Urutan.',
              'Pikeun kurikulum, klik Tambih kurikulum tuluy eusian Konci jeung Ngaran.',
              'Klik Tambih.',
            ],
            href: '/platform/curriculum',
            tip: 'Konci nyaéta ciri singget hurup leutik tanpa spasi, upamana sd atawa smp. Konci teu bisa dirobah sanggeus dijieun.',
          },
          {
            heading: 'Nambihan mata pelajaran acuan hiji-hiji',
            body: 'Mata pelajaran acuan diatur per kurikulum jeung per jenjang. Kode mata pelajaran kudu unik dina hiji kurikulum jeung jenjang. Mata pelajaran anyar muncul minangka acuan anyar nu bisa dicokot di sakola nu geus maké kurikulum jeung jenjang eta.',
            steps: [
              'Dina kartu Kurikulum jeung mapél acuan, pilih kurikulum.',
              'Klik Tambih mapél tuluy eusian Kode, Ngaran, jeung Jenjang.',
              'Klik Tambih.',
            ],
            href: '/platform/curriculum',
          },
          {
            heading: 'Ngalebetkeun loba mata pelajaran sakaligus',
            body: 'Lamun mata pelajaranana loba, pake Impor. Sadiakeun hiji baris pikeun unggal mata pelajaran eusina: kode, ngaran, jeung urutan (urutan meunang kosong). Pamisahna bisa tab, titik koma, atawa koma.',
            steps: [
              'Pilih kurikulum tuluy klik Impor.',
              'Pilih Bérkas CSV, atawa témpél eusi tabel tina Excel dina kolom Atawa témpél eusi tabel.',
              'Pariksa jumlah baris kabaca nu muncul tuluy pastikeun cocog jeung jumlah data anjeun.',
              'Klik Impor pikeun ngalebetkeun datana.',
            ],
            href: '/platform/curriculum',
            tip: 'Kode nu geus aya teu nyieun baris ganda. Ngan ngaranna nu dirobah, ku kituna aman lamun impor deui pikeun ngabenerkeun ngaran.',
          },
          {
            heading: 'Nyumputkeun atawa mupus data acuan',
            body: 'Jenjang nu dinonaktipkeun teu muncul dina pilihan sakola, tapi nu geus dicokot ku sakola teu robah. Data ngan bisa dipupus lamun teu dipaké: jenjang tanpa mata pelajaran acuan jeung taya sakola nu nyokotna, atawa kurikulum nu can dicokot ku sakola mana waé. Mupus kurikulum milu mupus sakabéh mata pelajaran acuanana.',
            warning: 'Pupusan teu bisa dibolaykeun. Lamun bingung, nonaktipkeun waé.',
          },
        ],
        faq: [
          {
            q: 'Abdi ngarobih ngaran mata pelajaran acuan. Naha ngaran di sakola milu robah?',
            a: 'Henteu. Sakola nyimpen salinanana sorangan, ku kituna mata pelajaran nu geus dicokot teu robah. Parobahan ngan katingali dina pangambilan satuluyna.',
          },
          {
            q: 'Tombol Pupus teu tiasa dipaké atawa ditolak. Naha?',
            a: 'Datana masih dipaké, boh ku mata pelajaran acuan boh ku sakola nu geus nyokotna. Nonaktipkeun waé lamun hoyong nyumputkeunana tina pilihan sakola.',
          },
          {
            q: 'Impor nembongkeun 0 baris kabaca. Naon nu lepat?',
            a: 'Pariksa yén unggal baris eusina kode tuluy ngaran, ku pamisah nu sarua dina sakabéh baris. Lamun témpél tina Excel, salin ngan kolom kode, ngaran, jeung urutan tanpa judul kolom.',
          },
        ],
      },
    },
  },
  {
    slug: 'messaging',
    icon: 'send',
    tone: 'slate',
    group: 'watch',
    text: {
      id: {
        title: 'Pesan WhatsApp: memantau dan mengatur',
        summary:
          'Memastikan pesan ke wali terkirim, mengatur kirim ulang, dan mematikan pengiriman saat darurat.',
        forWho: 'Admin platform dan staf dukungan yang memantau notifikasi sekolah.',
        sections: [
          {
            heading: 'Mengecek apakah pesan berjalan normal',
            body: 'Halaman WhatsApp menyegarkan diri tiap 15 detik. Anda tidak perlu memuat ulang.',
            steps: [
              'Buka WhatsApp di menu Sistem.',
              'Di kartu Pesan 24 jam terakhir, lihat jumlah pesan menurut status: Antre, Terkirim, Gagal, Dilewati. Jumlah Gagal yang terus naik berarti ada masalah.',
              'Di kartu Akun WhatsApp sekolah, lihat jumlah akun menurut status sambungan: Terhubung, Menunggu pemindaian, Menyambung, Gagal, Terputus.',
              'Di kartu Status worker, pastikan tertulis Chrome terdeteksi dan laporannya tidak lama. Worker adalah program di server yang benar-benar mengirim pesan.',
            ],
            href: '/platform/messaging',
            tip: 'Bila laporan di Status worker tertulis lama, program pengirim pesan mungkin berhenti. Hubungi tim teknis.',
          },
          {
            heading: 'Mematikan pengiriman pesan saat darurat',
            body: 'Saklar Aktifkan pengiriman pesan berlaku untuk semua sekolah sekaligus. Pakai hanya bila ada kejadian yang membahayakan, misalnya pesan salah terkirim ke banyak wali.',
            steps: [
              'Buka WhatsApp lalu matikan Aktifkan pengiriman pesan dan klik Simpan.',
              'Bereskan masalahnya.',
              'Hidupkan kembali saklarnya, klik Simpan, lalu beri tahu sekolah bahwa pesan berjalan lagi.',
            ],
            href: '/platform/messaging',
            warning:
              'Selama saklar mati, tidak ada sekolah yang bisa mengirim pesan ke wali. Biasanya tim teknis perlu dikabari bersamaan.',
          },
          {
            heading: 'Mengatur kirim ulang pesan yang gagal',
            body: 'Pesan yang gagal dicoba lagi sesuai aturan di kartu Aturan kirim ulang. Perubahan berlaku untuk pesan berikutnya. Hanya Admin platform yang bisa menyimpan; staf Hanya lihat melihat nilainya saja.',
            steps: [
              'Isi Jeda antar percobaan (menit) dengan 1 sampai 10 angka dipisah koma, misalnya 1, 5, 30, 120, 360. Bila percobaan melewati daftar, jeda terakhir dipakai terus.',
              'Isi Percobaan maksimum (1 sampai 20). Setelah itu pesan ditandai Gagal.',
              'Isi Kedaluwarsa pesan (jam, 1 sampai 168) untuk pesan yang tertahan karena WhatsApp sekolah belum siap. Pesan yang melewati batas ini dibuang.',
              'Isi Batas usia tap (jam, 1 sampai 72). Tap kartu di mesin absensi yang lebih tua dari ini tidak lagi diberitahukan ke wali.',
              'Klik Simpan.',
            ],
            href: '/platform/messaging',
            tip: 'Jeda yang makin panjang (1, 5, 30, dan seterusnya) memberi waktu bagi masalah sementara untuk pulih.',
          },
          {
            heading: 'Sekolah yang WhatsApp-nya belum tersambung',
            body: 'Tiap sekolah menyambungkan nomor WhatsApp-nya sendiri dengan memindai kode QR di panelnya. Akun berstatus Menunggu pemindaian berarti admin sekolah belum memindai kodenya. Anda tidak bisa memindainya untuk mereka; arahkan admin sekolah membuka pengaturan WhatsApp di panelnya. Bila Anda ingin menguji tanpa mengirim, ganti Penyedia ke Log uji (tidak mengirim). Pilihan ini tidak boleh dipakai di server sekolah sungguhan.',
          },
        ],
        faq: [
          {
            q: 'Wali tidak menerima pesan dari sekolah. Apa yang dicek?',
            a: 'Pertama, pastikan Aktifkan pengiriman pesan menyala dan Penyedia adalah WhatsApp. Kedua, lihat di Akun WhatsApp sekolah apakah akun sekolah itu Terhubung. Ketiga, cek jumlah Gagal dan Antre. Bila akun Menunggu pemindaian atau Terputus, minta admin sekolah memindai ulang kode QR.',
          },
          {
            q: 'Status worker menulis Chrome belum terdeteksi. Bagaimana?',
            a: 'Ini perlu dibereskan oleh tim teknis di server karena pengaturannya ada di server, bukan di konsol. Sampaikan tulisan statusnya apa adanya kepada mereka.',
          },
          {
            q: 'Pilihan Penyedia tidak mau berubah setelah saya simpan. Kenapa?',
            a: 'Bila tertera bahwa pilihan dikunci oleh server, tim teknis telah menetapkan penyedia di server dan pilihan di konsol tidak berlaku. Minta tim teknis melepas kuncinya.',
          },
          {
            q: 'Pesan sekolah menumpuk di Antre. Apa artinya?',
            a: 'Pesan belum sempat dikirim, biasanya karena akun WhatsApp sekolah belum Terhubung atau program pengirim berhenti. Cek kartu Status worker dan status akun sekolah. Bila penuh, pesan baru dari sekolah itu ditolak sampai antrean berkurang.',
          },
        ],
      },
      en: {
        title: 'WhatsApp messaging: monitoring and settings',
        summary:
          'Make sure messages to guardians go out, set up retries, and switch sending off in an emergency.',
        forWho: 'Platform admins and support staff who watch school notifications.',
        sections: [
          {
            heading: 'Checking that messages are running normally',
            body: 'The WhatsApp page refreshes itself every 15 seconds. You do not need to reload.',
            steps: [
              'Open WhatsApp in the System menu.',
              'In the Messages in the last 24 hours card, see the message count by status: Queued, Sent, Failed, Skipped. A Failed count that keeps rising means there is a problem.',
              'In the School WhatsApp accounts card, see the account count by connection status: Connected, Waiting for scan, Connecting, Failed, Disconnected.',
              'In the Worker status card, make sure it says Chrome detected and the report is not old. The worker is the program on the server that actually sends the messages.',
            ],
            href: '/platform/messaging',
            tip: 'If the report in Worker status is old, the message-sending program may have stopped. Contact the technical team.',
          },
          {
            heading: 'Switching message sending off in an emergency',
            body: 'The Enable message sending switch applies to every school at once. Use it only when something harmful is happening, for example a wrong message sent to many guardians.',
            steps: [
              'Open WhatsApp, switch off Enable message sending, and click Save.',
              'Sort out the problem.',
              'Switch it back on, click Save, and tell the schools that messages are running again.',
            ],
            href: '/platform/messaging',
            warning:
              'While the switch is off, no school can send messages to guardians. The technical team usually needs to be told at the same time.',
          },
          {
            heading: 'Setting up retries for failed messages',
            body: 'A failed message is tried again following the rules in the Retry rules card. Changes apply to the next messages. Only Platform admins can save; Read only staff can only see the values.',
            steps: [
              'Fill in Delay between attempts (minutes) with 1 to 10 numbers separated by commas, for example 1, 5, 30, 120, 360. When attempts go past the list, the last delay keeps being used.',
              'Fill in Maximum attempts (1 to 20). After that the message is marked Failed.',
              'Fill in Message expiry (hours, 1 to 168) for messages held back because the school WhatsApp is not ready. A message past this limit is dropped.',
              'Fill in Tap age limit (hours, 1 to 72). Card taps on the attendance machine older than this are no longer notified to guardians.',
              'Click Save.',
            ],
            href: '/platform/messaging',
            tip: 'Delays that grow longer (1, 5, 30, and so on) give a temporary problem time to recover.',
          },
          {
            heading: 'A school whose WhatsApp is not connected',
            body: 'Each school connects its own WhatsApp number by scanning a QR code in its panel. An account with the status Waiting for scan means the school admin has not scanned the code. You cannot scan it for them; point the school admin to the WhatsApp settings in their panel. If you want to test without sending, change Provider to Test log (does not send). This choice must not be used on the server real schools use.',
          },
        ],
        faq: [
          {
            q: 'A guardian does not receive messages from the school. What should I check?',
            a: 'First, make sure Enable message sending is on and the Provider is WhatsApp. Second, look in School WhatsApp accounts to see if that school account is Connected. Third, check the Failed and Queued counts. If the account is Waiting for scan or Disconnected, ask the school admin to scan the QR code again.',
          },
          {
            q: 'Worker status says Chrome is not detected. What now?',
            a: 'The technical team has to fix this on the server because the setting lives on the server, not in the console. Pass them the status text as it is.',
          },
          {
            q: 'The Provider choice will not change after I save. Why?',
            a: 'If the page says the choice is locked by the server, the technical team has set the provider on the server and the console choice does not apply. Ask the technical team to release the lock.',
          },
          {
            q: 'A school messages pile up in Queued. What does it mean?',
            a: 'The messages have not been sent yet, usually because the school WhatsApp account is not Connected or the sending program has stopped. Check the Worker status card and the school account status. When the queue is full, new messages from that school are refused until it shrinks.',
          },
        ],
      },
      su: {
        title: 'Pesen WhatsApp: mantuan jeung ngatur',
        summary:
          'Mastikeun pesen ka wali kakirim, ngatur kirim deui, jeung mareuman pangiriman nalika darurat.',
        forWho: 'Admin platform jeung staf pangrojong nu mantuan béwara sakola.',
        sections: [
          {
            heading: 'Mariksa naha pesen jalan normal',
            body: 'Kaca WhatsApp nyegerkeun sorangan unggal 15 detik. Anjeun teu kudu muat deui.',
            steps: [
              'Buka WhatsApp dina menu Sistem.',
              'Dina kartu Pesen 24 jam ka tukang, tingali jumlah pesen nurutkeun status: Antri, Kakirim, Gagal, Dilewatan. Jumlah Gagal nu naék terus hartina aya masalah.',
              'Dina kartu Akun WhatsApp sakola, tingali jumlah akun nurutkeun status sambungan: Nyambung, Nungguan pamindaian, Nyambungkeun, Gagal, Pegat.',
              'Dina kartu Status worker, pastikeun aya tulisan Chrome kadeteksi jeung laporanna teu lami. Worker nyaéta program dina server nu sabenerna ngirim pesen.',
            ],
            href: '/platform/messaging',
            tip: 'Lamun laporan dina Status worker lami, program pangirim pesen kamungkinan eureun. Hubungi tim téknis.',
          },
          {
            heading: 'Mareuman pangiriman pesen nalika darurat',
            body: 'Saklar Aktipkeun pangiriman pesen lumaku pikeun sakabéh sakola sakaligus. Pake ngan lamun aya kajadian nu bahaya, upamana pesen lepat kakirim ka loba wali.',
            steps: [
              'Buka WhatsApp tuluy pareuman Aktipkeun pangiriman pesen jeung klik Simpen.',
              'Bérésan masalahna.',
              'Hurungkeun deui saklarna, klik Simpen, tuluy wartosan sakola yén pesen geus jalan deui.',
            ],
            href: '/platform/messaging',
            warning:
              'Salila saklar pareum, taya sakola nu bisa ngirim pesen ka wali. Biasana tim téknis kudu diwartosan babarengan.',
          },
          {
            heading: 'Ngatur kirim deui pesen nu gagal',
            body: 'Pesen nu gagal dicoba deui nurutkeun aturan dina kartu Aturan kirim deui. Parobahan lumaku pikeun pesen satuluyna. Ngan Admin platform nu bisa nyimpen; staf Ngan ningali ngan bisa ningali nilaina.',
            steps: [
              'Eusian Jeda antara percobaan (menit) ku 1 nepi ka 10 angka dipisah koma, upamana 1, 5, 30, 120, 360. Lamun percobaan ngaliwatan daptar, jeda pamungkas dipaké terus.',
              'Eusian Percobaan maksimum (1 nepi ka 20). Sanggeusna pesen ditandaan Gagal.',
              'Eusian Kadaluwarsa pesen (jam, 1 nepi ka 168) pikeun pesen nu katahan lantaran WhatsApp sakola can siap. Pesen nu ngaleuwihan wates ieu dibuang.',
              'Eusian Wates umur tap (jam, 1 nepi ka 72). Tap kartu dina mesin absén nu leuwih heubeul ti ieu teu diwartoskeun deui ka wali.',
              'Klik Simpen.',
            ],
            href: '/platform/messaging',
            tip: 'Jeda nu beuki lila (1, 5, 30, jeung saterusna) méré waktu pikeun masalah samentara pulih.',
          },
          {
            heading: 'Sakola nu WhatsApp-na can nyambung',
            body: 'Unggal sakola nyambungkeun nomer WhatsApp-na sorangan ku mindai kode QR dina panélna. Akun nu statusna Nungguan pamindaian hartina admin sakola can mindai kodena. Anjeun teu bisa mindaian keur maranéhna; arahkeun admin sakola muka pangaturan WhatsApp dina panélna. Lamun hoyong nguji tanpa ngirim, ganti Panyadia jadi Log uji (teu ngirim). Pilihan ieu teu meunang dipaké dina server sakola sabenerna.',
          },
        ],
        faq: [
          {
            q: 'Wali teu narima pesen ti sakola. Naon nu kudu dipariksa?',
            a: 'Kahiji, pastikeun Aktipkeun pangiriman pesen hurung jeung Panyadia nyaéta WhatsApp. Kadua, tingali dina Akun WhatsApp sakola naha akun sakola eta Nyambung. Katilu, pariksa jumlah Gagal jeung Antri. Lamun akunna Nungguan pamindaian atawa Pegat, pénta admin sakola mindai deui kode QR.',
          },
          {
            q: 'Status worker nulis Chrome can kadeteksi. Kumaha?',
            a: 'Ieu kudu dibérésan ku tim téknis dina server sabab pangaturanana aya di server, lain di konsol. Sampaikeun tulisan statusna sakumaha aslina ka maranéhna.',
          },
          {
            q: 'Pilihan Panyadia teu robah sanggeus abdi simpen. Naha?',
            a: 'Lamun aya tulisan yén pilihanana dikonci ku server, tim téknis geus nangtukeun panyadia dina server jeung pilihan di konsol teu lumaku. Pénta tim téknis muka konciana.',
          },
          {
            q: 'Pesen sakola numpuk dina Antri. Naon hartina?',
            a: 'Pesen can sempet dikirim, biasana lantaran akun WhatsApp sakola can Nyambung atawa program pangirimna eureun. Pariksa kartu Status worker jeung status akun sakola. Lamun pinuh, pesen anyar ti sakola eta ditolak nepi ka antrian ngurangan.',
          },
        ],
      },
    },
  },
  {
    slug: 'email',
    icon: 'send',
    tone: 'sky',
    group: 'config',
    text: {
      id: {
        title: 'Email: server pengirim kode dan undangan',
        summary:
          'Mengatur server email (SMTP) yang mengirim kode OTP, undangan, dan pemberitahuan, termasuk memakai Mailpit untuk uji.',
        forWho:
          'Staf platform dengan peran Admin yang menyiapkan atau mengganti penyedia email. Peran Hanya lihat boleh melihat pengaturannya saja.',
        sections: [
          {
            heading: 'Mengisi server email',
            body: 'Tanpa server email yang benar, kode lupa kata sandi, kode ganti email, dan undangan tidak sampai ke kotak masuk. Pengaturan ini berlaku untuk semua sekolah dan langsung dipakai sekitar 15 detik setelah disimpan, tanpa memulai ulang server.',
            steps: [
              'Buka Email di menu Operasi.',
              'Isi alamat server, port, nama pengguna, kata sandi, dan pengirim dari penyedia email Anda.',
              'Centang sambungan aman langsung bila penyedia meminta SSL/TLS (biasanya port 465).',
              'Tekan Simpan pengaturan.',
              'Isi alamat email Anda di kotak Kirim email uji, lalu tekan Kirim email uji dan periksa kotak masuk.',
            ],
            tip: 'Pengirim sering harus berupa alamat yang sudah diverifikasi di penyedia email. Bila email uji gagal, pesan galat dari server ikut ditampilkan.',
            warning:
              'Kata sandi disimpan terenkripsi dan tidak pernah ditampilkan lagi. Mengosongkan kolomnya saat menyimpan berarti mempertahankan kata sandi yang lama.',
            href: '/platform/email',
          },
          {
            heading: 'Memakai Mailpit untuk uji',
            body: 'Mailpit menangkap email tanpa benar-benar mengirimnya, sehingga aman untuk uji. Tekan tombol isi cepat Mailpit untuk mengisi alamat server lokal dan port 1025 tanpa login. Setelah selesai uji, ganti ke penyedia email sungguhan.',
            href: '/platform/email',
          },
        ],
        faq: [
          {
            q: 'Kenapa kode tidak sampai padahal pengaturan tersimpan?',
            a: 'Kirim email uji dulu. Bila gagal, baca pesan galatnya (salah kata sandi, port tertutup, atau pengirim belum diverifikasi). Bila berhasil, periksa folder spam.',
          },
          {
            q: 'Apakah harus memulai ulang server setelah mengubah?',
            a: 'Tidak. Pengaturan baru dipakai dalam sekitar 15 detik.',
          },
        ],
      },
      en: {
        title: 'Email: the server that sends codes and invitations',
        summary:
          'Set the email (SMTP) server that sends OTP codes, invitations, and notices, including using Mailpit for testing.',
        forWho:
          'Platform staff with the Admin role who set up or change the email provider. The Read only role can only view the settings.',
        sections: [
          {
            heading: 'Filling in the email server',
            body: 'Without a working email server, password reset codes, change-email codes, and invitations never reach the inbox. These settings apply to all schools and take effect about 15 seconds after saving, with no server restart.',
            steps: [
              'Open Email in the Operations menu.',
              'Fill in the server address, port, username, password, and sender from your email provider.',
              'Tick the direct secure connection if the provider asks for SSL/TLS (usually port 465).',
              'Press Save settings.',
              'Type your own email in the Send a test email box, press Send test email, and check your inbox.',
            ],
            tip: 'The sender often has to be an address verified at the email provider. If the test fails, the server’s error message is shown too.',
            warning:
              'The password is stored encrypted and never shown again. Leaving the field empty when saving keeps the old password.',
            href: '/platform/email',
          },
          {
            heading: 'Using Mailpit for testing',
            body: 'Mailpit catches email without really sending it, so it is safe for testing. Press the Mailpit quick-fill button to fill the local server address and port 1025 with no login. When testing is done, switch to a real email provider.',
            href: '/platform/email',
          },
        ],
        faq: [
          {
            q: 'Why does the code not arrive although the settings are saved?',
            a: 'Send a test email first. If it fails, read the error (wrong password, closed port, or unverified sender). If it succeeds, check the spam folder.',
          },
          {
            q: 'Do I have to restart the server after changing it?',
            a: 'No. The new settings are used within about 15 seconds.',
          },
        ],
      },
      su: {
        title: 'Surélék: server nu ngirim kode jeung uleman',
        summary:
          'Ngatur server surélék (SMTP) nu ngirim kode OTP, uleman, jeung béwara, kaasup maké Mailpit pikeun uji.',
        forWho:
          'Staf platform nu perana Admin anu nyiapkeun atawa ngaganti panyadia surélék. Perana Ukur tingali ngan bisa ningali setélanna.',
        sections: [
          {
            heading: 'Ngeusian server surélék',
            body: 'Tanpa server surélék nu bener, kode poho kecap rusiah, kode ganti surélék, jeung uleman teu nepi ka kotak lebet. Setélan ieu lumaku pikeun sakabéh sakola jeung dipaké kira-kira 15 detik sanggeus disimpen, tanpa ngamimitian deui server.',
            steps: [
              'Buka Surélék dina ménu Operasi.',
              'Eusian alamat server, port, ngaran pamaké, kecap rusiah, jeung pangirim ti panyadia surélék anjeun.',
              'Centang sambungan aman langsung lamun panyadia nanyakeun SSL/TLS (biasana port 465).',
              'Pencét Simpen setélan.',
              'Tulis surélék anjeun dina kotak Kirim surélék uji, pencét Kirim surélék uji, tuluy pariksa kotak lebet.',
            ],
            tip: 'Pangirim mindeng kudu alamat nu geus diverifikasi di panyadia surélék. Lamun surélék uji gagal, pesen kasalahan ti server milu kapidangkeun.',
            warning:
              'Kecap rusiah disimpen énkripsi jeung moal témbong deui. Ngosongkeun kolomna waktu nyimpen hartina nyimpen kecap rusiah nu lila.',
            href: '/platform/email',
          },
          {
            heading: 'Maké Mailpit pikeun uji',
            body: 'Mailpit nangkep surélék tanpa bener-bener ngirim, jadi aman pikeun uji. Pencét tombol eusian gancang Mailpit pikeun ngeusian alamat server lokal jeung port 1025 tanpa login. Sanggeus rengse uji, ganti ka panyadia surélék nu sabenerna.',
            href: '/platform/email',
          },
        ],
        faq: [
          {
            q: 'Naha kode teu nepi padahal setélan geus disimpen?',
            a: 'Kirim surélék uji heula. Lamun gagal, baca pesen kasalahanana (kecap rusiah salah, port katutup, atawa pangirim can diverifikasi). Lamun hasil, pariksa map spam.',
          },
          {
            q: 'Naha kudu ngamimitian deui server sanggeus ngarobah?',
            a: 'Henteu. Setélan anyar dipaké dina kira-kira 15 detik.',
          },
        ],
      },
    },
  },
  {
    slug: 'users',
    icon: 'users',
    tone: 'amber',
    group: 'watch',
    text: {
      id: {
        title: 'Pengguna: mengeluarkan semua perangkat seseorang',
        summary:
          'Mencari akun seseorang lalu mengeluarkannya dari semua perangkat bila akunnya diduga bocor atau perangkatnya hilang.',
        forWho:
          'Staf platform yang menerima laporan akun disalahgunakan atau perangkat hilang. Hanya staf dengan peran Admin yang bisa mengeluarkan perangkat; peran Hanya lihat boleh mencari.',
        sections: [
          {
            heading: 'Mengeluarkan semua perangkat seorang pengguna',
            body: 'Satu akun bisa dipakai di banyak sekolah dan banyak perangkat. Bila pemiliknya melapor ponselnya hilang atau akunnya dipakai orang lain, keluarkan semua perangkatnya. Setelah itu ia harus masuk lagi dengan kata sandinya di setiap perangkat. Kata sandi dan data akunnya tidak berubah.',
            steps: [
              'Buka Pengguna di menu Sistem.',
              'Ketik nama atau email pemilik akun (minimal 2 huruf), lalu cari kartunya.',
              'Pastikan nama dan email cocok. Lihat jumlah sekolah dan perangkat aktifnya.',
              'Tekan Keluarkan semua perangkat, tulis alasannya, lalu tekan tombol konfirmasi.',
              'Tunggu pesan berhasil yang menyebut jumlah perangkat yang dikeluarkan.',
            ],
            tip: 'Setelah perangkat dikeluarkan, minta pemilik akun mengganti kata sandinya dari halaman Profil saat masuk kembali.',
            warning:
              'Akun yang sama dipakai di semua sekolah tempat orang itu terdaftar, jadi ia keluar dari semuanya sekaligus. Bila Anda mengeluarkan akun Anda sendiri, Anda juga ikut keluar.',
            href: '/platform/users',
          },
          {
            heading: 'Memeriksa siapa yang sudah dikeluarkan',
            body: 'Setiap pengeluaran perangkat tercatat di Audit beserta alasan dan jumlah perangkatnya. Pada kartu pengguna, lencana Staf Edusync menandai akun yang juga staf platform, supaya Anda berhati-hati sebelum mengeluarkannya.',
            href: '/platform/audit',
          },
        ],
        faq: [
          {
            q: 'Tombol Keluarkan semua perangkat tidak aktif. Kenapa?',
            a: 'Ada dua kemungkinan. Peran Anda Hanya lihat, atau pengguna itu memang tidak punya perangkat yang sedang masuk (tertulis 0 perangkat aktif).',
          },
          {
            q: 'Apakah pengguna langsung terkeluar?',
            a: 'Ya. Begitu berhasil, perangkat mereka tidak bisa dipakai lagi dan mereka diminta masuk ulang pada tindakan berikutnya. Mereka bisa langsung masuk lagi bila punya kata sandi yang benar.',
          },
          {
            q: 'Akunnya bocor. Apakah cukup dengan mengeluarkan perangkat?',
            a: 'Itu langkah pertama. Orang yang tahu kata sandinya bisa masuk lagi, jadi minta pemilik akun segera mengganti kata sandinya.',
          },
        ],
      },
      en: {
        title: 'Users: signing a person out of every device',
        summary:
          'Find someone’s account and sign it out of all devices when the account may be compromised or a device was lost.',
        forWho:
          'Platform staff who receive a report of a misused account or a lost device. Only staff with the Admin role can sign devices out; the Read only role can search.',
        sections: [
          {
            heading: 'Signing a user out of all devices',
            body: 'One account can be used at many schools and on many devices. If the owner reports a lost phone or someone else using the account, sign out all of its devices. The person then has to sign in again with their password on every device. Their password and account data do not change.',
            steps: [
              'Open Users in the System menu.',
              'Type the account owner’s name or email (at least 2 letters), then find their card.',
              'Make sure the name and email match. Check the number of schools and active devices.',
              'Press Sign out all devices, write the reason, then press the confirm button.',
              'Wait for the success message that tells how many devices were signed out.',
            ],
            tip: 'After the devices are signed out, ask the account owner to change their password from the Profile page when they sign back in.',
            warning:
              'The same account is used at every school the person belongs to, so they are signed out of all of them at once. If you sign out your own account, you are signed out too.',
            href: '/platform/users',
          },
          {
            heading: 'Checking who was signed out',
            body: 'Every sign-out is recorded in Audit with the reason and the number of devices. On the user card, the Edusync staff badge marks accounts that are also platform staff, so you can be careful before signing them out.',
            href: '/platform/audit',
          },
        ],
        faq: [
          {
            q: 'The Sign out all devices button is disabled. Why?',
            a: 'There are two possible reasons. Your role is Read only, or the user simply has no signed-in device (it says 0 active devices).',
          },
          {
            q: 'Is the user signed out right away?',
            a: 'Yes. Once it succeeds, their devices stop working and they are asked to sign in again on their next action. They can sign in again straight away if they have the right password.',
          },
          {
            q: 'The account was leaked. Is signing out devices enough?',
            a: 'It is the first step. Anyone who knows the password can sign in again, so ask the account owner to change their password right away.',
          },
        ],
      },
      su: {
        title: 'Pamake: ngaluarkeun sakabéh alat hiji jalma',
        summary:
          'Néangan akun hiji jalma tuluy ngaluarkeunana tina sakabéh alat lamun akunna dicurigaan bocor atawa alatna leungit.',
        forWho:
          'Staf platform nu narima laporan akun disalahgunakeun atawa alat leungit. Ngan staf peran Admin nu bisa ngaluarkeun alat; peran Ngan ningali meunang néangan.',
        sections: [
          {
            heading: 'Ngaluarkeun sakabéh alat hiji pamake',
            body: 'Hiji akun bisa dipaké di loba sakola jeung loba alat. Lamun nu gaduh ngalaporkeun hapéna leungit atawa akunna dipaké batur, kaluarkeun sakabéh alatna. Saterusna manéhna kudu lebet deui maké kecap sandina di unggal alat. Kecap sandi jeung data akunna teu robah.',
            steps: [
              'Buka Pamake dina menu Sistem.',
              'Ketik ngaran atawa surélék nu gaduh akun (min. 2 hurup), tuluy teangan kartuna.',
              'Pastikeun ngaran jeung surélékna cocog. Tingali jumlah sakola jeung alat aktifna.',
              'Pencét Kaluarkeun sakabéh alat, tulis alesanna, tuluy pencét tombol konfirmasi.',
              'Antosan pesen anu hasil nu nyebutkeun sabaraha alat nu dikaluarkeun.',
            ],
            tip: 'Sanggeus alat dikaluarkeun, mintakeun nu gaduh akun ngaganti kecap sandina ti kaca Profil nalika lebet deui.',
            warning:
              'Akun anu sarua dipaké di sakabéh sakola tempat jalma éta kadaptar, jadi manéhna kaluar tina sakabéhna sakaligus. Lamun anjeun ngaluarkeun akun sorangan, anjeun ogé milu kaluar.',
            href: '/platform/users',
          },
          {
            heading: 'Mariksa saha nu geus dikaluarkeun',
            body: 'Unggal pangaluaran alat dicatet dina Audit jeung alesan sarta jumlah alatna. Dina kartu pamake, lencana Staf Edusync nandaan akun nu ogé staf platform, sangkan anjeun ati-ati samemeh ngaluarkeunana.',
            href: '/platform/audit',
          },
        ],
        faq: [
          {
            q: 'Tombol Kaluarkeun sakabéh alat teu aktip. Naha?',
            a: 'Aya dua kamungkinan. Peran anjeun Ngan ningali, atawa pamake éta mémang teu boga alat nu keur lebet (ditulis 0 alat aktif).',
          },
          {
            q: 'Naha pamake langsung kaluar?',
            a: 'Enya. Sanggeus hasil, alatna teu bisa dipaké deui jeung diaku lebet deui dina lampah salajengna. Manéhna bisa langsung lebet deui lamun boga kecap sandi nu bener.',
          },
          {
            q: 'Akunna bocor. Naha cukup ngaluarkeun alat?',
            a: 'Éta léngkah kahiji. Jalma nu apal kecap sandina bisa lebet deui, jadi mintakeun nu gaduh akun geura ngaganti kecap sandina.',
          },
        ],
      },
    },
  },
  {
    slug: 'staff',
    icon: 'users',
    tone: 'violet',
    group: 'watch',
    text: {
      id: {
        title: 'Pengelola platform: mengundang dan mengatur staf',
        summary:
          'Mengundang rekan lewat email agar bisa membuka konsol, mengubah perannya, dan mencabut aksesnya.',
        forWho:
          'Admin platform yang menambah atau mengurangi orang yang boleh memakai konsol. Peran Hanya lihat boleh membuka daftar, tetapi tidak bisa mengubahnya.',
        sections: [
          {
            heading: 'Mengundang pengelola baru',
            body: 'Undangan dikirim ke email orang itu dan berlaku 7 hari. Ia menerimanya dengan akun yang emailnya sama persis; bila belum punya akun, ia membuatnya langsung di halaman undangan. Tanpa undangan, tidak ada yang bisa menjadi staf.',
            steps: [
              'Buka Pengelola platform di menu Sistem.',
              'Tekan Undang pengelola.',
              'Isi email, lalu pilih peran: Admin boleh mengubah pengaturan dan mengelola staf lain, Hanya lihat hanya boleh membuka halaman.',
              'Tekan Kirim undangan. Email berisi tautan akan terkirim ke alamat itu.',
              'Bila email tidak sampai, salin tautan yang tampil sesaat setelah undangan dibuat dan kirimkan sendiri kepada orangnya.',
            ],
            tip: 'Tautan hanya tampil sekali, tepat setelah undangan dibuat atau dikirim ulang. Kalau terlewat, gunakan Kirim ulang untuk mendapat tautan baru.',
            warning:
              'Kirim tautan hanya kepada orang yang diundang. Siapa pun yang memegang tautan dan masuk dengan email yang sama bisa menerimanya.',
            href: '/platform/staff',
          },
          {
            heading: 'Undangan tertunda',
            body: 'Undangan yang belum diterima tampil di bagian Undangan tertunda. Kirim ulang membuat tautan baru dan mematikan yang lama. Cabut membuat tautan tidak berlaku lagi. Undangan yang kedaluwarsa diberi tanda; kirim ulang bila orangnya masih perlu masuk.',
            href: '/platform/staff',
          },
          {
            heading: 'Mengubah peran atau mencabut akses',
            body: 'Admin bisa mengubah peran rekan lewat pilihan di tabel, atau menghapusnya dari daftar. Akun orangnya tetap ada; ia hanya tidak bisa membuka konsol lagi. Anda tidak bisa mengubah atau menghapus diri sendiri, dan platform selalu harus punya sedikitnya satu admin.',
            steps: [
              'Cari nama orang itu di tabel Pengelola aktif.',
              'Ganti pilihan peran, atau tekan Hapus lalu konfirmasi.',
              'Semua perubahan tercatat di menu Audit.',
            ],
            href: '/platform/audit',
          },
        ],
        faq: [
          {
            q: 'Orang yang diundang melihat pesan email berbeda. Mengapa?',
            a: 'Undangan hanya bisa diterima dengan akun yang emailnya sama dengan email yang diundang. Minta ia keluar lalu masuk atau mendaftar dengan alamat itu.',
          },
          {
            q: 'Tombol Undang pengelola tidak ada. Mengapa?',
            a: 'Hanya Admin platform yang bisa mengundang dan mengatur peran. Peran Hanya lihat hanya bisa melihat daftar.',
          },
          {
            q: 'Apakah menghapus pengelola juga menghapus akunnya?',
            a: 'Tidak. Hanya akses ke konsol yang dicabut. Orangnya tetap bisa memakai akunnya di sekolah.',
          },
        ],
      },
      en: {
        title: 'Platform staff: inviting and managing people',
        summary:
          'Invite colleagues by email so they can open the console, change their role, and remove their access.',
        forWho:
          'Platform admins who add or remove people allowed to use the console. The Read only role can open the list but cannot change it.',
        sections: [
          {
            heading: 'Inviting a new staff member',
            body: 'The invitation is emailed to the person and is valid for 7 days. They accept it with an account whose email matches exactly; if they have no account yet, they create one right on the invitation page. Without an invitation, nobody can become staff.',
            steps: [
              'Open Platform staff in the System menu.',
              'Press Invite staff.',
              'Fill in the email and choose a role: Admin can change settings and manage other staff, Read only can only open pages.',
              'Press Send invitation. An email with the link is sent to that address.',
              'If the email does not arrive, copy the link shown right after the invitation is created and send it to the person yourself.',
            ],
            tip: 'The link is shown only once, right after the invitation is created or resent. If you missed it, use Resend to get a new one.',
            warning:
              'Send the link only to the invited person. Anyone holding the link who signs in with the same email can accept it.',
            href: '/platform/staff',
          },
          {
            heading: 'Pending invitations',
            body: 'Invitations that are not accepted yet appear under Pending invitations. Resend creates a new link and switches the old one off. Revoke makes the link invalid. Expired invitations are marked; resend if the person still needs access.',
            href: '/platform/staff',
          },
          {
            heading: 'Changing a role or removing access',
            body: 'Admins can change a colleague’s role from the selector in the table, or remove them from the list. The person’s account stays; they just cannot open the console any more. You cannot change or remove yourself, and the platform must always keep at least one admin.',
            steps: [
              'Find the person in the Active staff table.',
              'Change the role selector, or press Remove and confirm.',
              'Every change is recorded in the Audit menu.',
            ],
            href: '/platform/audit',
          },
        ],
        faq: [
          {
            q: 'The invited person sees a different email message. Why?',
            a: 'An invitation can only be accepted with an account whose email matches the invited email. Ask them to sign out, then sign in or register with that address.',
          },
          {
            q: 'There is no Invite staff button. Why?',
            a: 'Only platform Admins can invite people and set roles. The Read only role can only view the list.',
          },
          {
            q: 'Does removing a staff member also delete their account?',
            a: 'No. Only their console access is removed. They can still use their account at their school.',
          },
        ],
      },
      su: {
        title: 'Pangurus platform: ngaleman jeung ngatur staf',
        summary:
          'Ngaleman réncang ngaliwatan surélék sangkan bisa muka konsol, ngarobah perannana, jeung nyabut aksésna.',
        forWho:
          'Admin platform nu nambahan atawa ngurangan jalma nu meunang maké konsol. Peran Ngan ningali meunang muka daptar, tapi teu bisa ngarobahna.',
        sections: [
          {
            heading: 'Ngaleman pangurus anyar',
            body: 'Uleman dikirim ka surélék jalma éta jeung berlaku 7 poé. Manéhna narimana maké akun nu surélékna sarua pisan; lamun acan boga akun, manéhna nyieun langsung di kaca uleman. Tanpa uleman, euweuh nu bisa jadi staf.',
            steps: [
              'Buka Pangurus platform dina menu Sistem.',
              'Pencét Uleman pangurus.',
              'Eusian surélék, tuluy pilih peran: Admin meunang ngarobah setélan jeung ngurus staf séjén, Ngan ningali ngan meunang muka kaca.',
              'Pencét Kirim uleman. Surélék anu eusina tautan dikirim ka alamat éta.',
              'Lamun surélék teu nepi, salin tautan nu muncul sakedapan sanggeus uleman dijieun tuluy kirimkeun sorangan ka jalmana.',
            ],
            tip: 'Tautan ngan muncul sakali, pas sanggeus uleman dijieun atawa dikirim deui. Lamun kaliwat, paké Kirim deui pikeun nyokot tautan anyar.',
            warning:
              'Kirimkeun tautan ngan ka jalma nu diuleman. Saha waé nu nyekel tautan jeung lebet maké surélék nu sarua bisa narimana.',
            href: '/platform/staff',
          },
          {
            heading: 'Uleman nu ditangtukeun',
            body: 'Uleman nu acan ditarima muncul di bagian Uleman nu ditangtukeun. Kirim deui nyieun tautan anyar jeung mareuman nu heubeul. Cabut ngajadikeun tautan teu berlaku. Uleman nu kadaluwarsa dititénan; kirim deui lamun jalmana masih perlu lebet.',
            href: '/platform/staff',
          },
          {
            heading: 'Ngarobah peran atawa nyabut aksés',
            body: 'Admin bisa ngarobah peran réncang tina pilihan dina tabél, atawa mupus manéhna tina daptar. Akun jalmana tetep aya; manéhna ngan teu bisa muka konsol deui. Anjeun teu bisa ngarobah atawa mupus diri sorangan, jeung platform kudu salawasna boga sahenteuna hiji admin.',
            steps: [
              'Teangan ngaran jalmana dina tabél Pangurus aktif.',
              'Ganti pilihan peran, atawa pencét Pupus tuluy konfirmasi.',
              'Sakabéh parobahan dicatet dina menu Audit.',
            ],
            href: '/platform/audit',
          },
        ],
        faq: [
          {
            q: 'Jalma nu diuleman ningali pesen surélék nu béda. Naha?',
            a: 'Uleman ngan bisa ditarima maké akun nu surélékna sarua jeung surélék nu diuleman. Mintakeun manéhna kaluar tuluy lebet atawa daptar maké alamat éta.',
          },
          {
            q: 'Tombol Uleman pangurus euweuh. Naha?',
            a: 'Ngan Admin platform nu bisa ngaleman jeung nangtukeun peran. Peran Ngan ningali ngan bisa ningali daptar.',
          },
          {
            q: 'Naha mupus pangurus ogé mupus akunna?',
            a: 'Henteu. Ngan aksés ka konsol nu dicabut. Manéhna masih bisa maké akunna di sakolana.',
          },
        ],
      },
    },
  },
  {
    slug: 'audit',
    icon: 'history',
    tone: 'violet',
    group: 'watch',
    text: {
      id: {
        title: 'Audit: melacak siapa melakukan apa',
        summary:
          'Mencari catatan tindakan staf dan perubahan penting untuk menjawab pertanyaan sekolah atau rekan kerja.',
        forWho: 'Semua staf platform, terutama saat menyelidiki keluhan atau memeriksa pekerjaan sendiri.',
        sections: [
          {
            heading: 'Mencari tahu siapa mengubah apa',
            body: 'Halaman Audit menampilkan tindakan staf dan perubahan penting di semua sekolah, yang terbaru di atas. Halaman ini hanya untuk dibaca, tidak ada tombol untuk mengubah atau menghapus catatan. Semua peran staf, termasuk Hanya lihat, boleh membukanya.',
            steps: [
              'Buka Audit di menu Sistem.',
              'Ketik kata kunci di kolom Cari aksi atau rincian, misalnya nama sekolah atau kata dari alasan yang ditulis.',
              'Pilih area di Saring menurut area untuk mempersempit hasil.',
              'Lihat jumlah catatan di kanan atas, lalu cocokkan waktu dan rincian dengan kejadian yang Anda selidiki.',
            ],
            href: '/platform/audit',
          },
          {
            heading: 'Membaca satu catatan',
            body: 'Setiap catatan punya tiga bagian: Waktu, Aksi, dan Rincian. Aksi menunjukkan jenis tindakan, dan awalan sebelum titik pertama adalah areanya: school (sekolah), registration (pendaftaran), catalog (katalog), payment (pembayaran), billing (tagihan), messaging (pesan), dan reference (bank kurikulum). Alasan yang ditulis staf saat menangguhkan atau mengaktifkan tanpa pembayaran ikut terlihat di rincian.',
            tip: 'Untuk mencari semua penangguhan hari ini, ketik kata penangguhan atau ganti area ke school lalu lihat waktunya.',
          },
          {
            heading: 'Batas halaman ini',
            body: 'Halaman hanya memuat 200 catatan terbaru. Kejadian yang lebih lama tidak tampil di sini. Bila Anda perlu melacak kejadian lama, hubungi tim teknis dan sebutkan perkiraan tanggal serta nama lembaganya.',
          },
        ],
        faq: [
          {
            q: 'Sekolah bilang ditangguhkan tanpa pemberitahuan. Bagaimana memeriksanya?',
            a: 'Buka Audit, ketik nama sekolah di kolom pencarian, lalu lihat catatan penangguhan: kapan dan apa alasannya. Bila tidak ada catatan staf, kemungkinan penangguhannya karena tagihan; cek di Lembaga & unit.',
          },
          {
            q: 'Saya mengubah sesuatu tetapi tidak menemukannya di Audit. Kenapa?',
            a: 'Muat ulang halaman lalu coba cari lagi dengan kata yang lebih singkat. Catatan terbaru ada di bagian paling atas. Bila tetap tidak ada, kemungkinan perubahan itu belum tersimpan; ulangi dan perhatikan pesan Perubahan disimpan.',
          },
          {
            q: 'Bisakah saya menghapus catatan Audit yang salah?',
            a: 'Tidak. Catatan Audit tidak bisa diubah atau dihapus supaya riwayat tetap bisa dipercaya. Bila Anda membuat kesalahan, perbaiki tindakannya lalu tulis alasan perbaikannya.',
          },
        ],
      },
      en: {
        title: 'Audit: tracing who did what',
        summary:
          'Look up records of staff actions and important changes to answer questions from schools or colleagues.',
        forWho: 'All platform staff, especially when looking into a complaint or checking their own work.',
        sections: [
          {
            heading: 'Finding out who changed what',
            body: 'The Audit page shows staff actions and important changes across all schools, newest first. The page is for reading only; there is no button to change or delete records. All staff roles, including Read only, may open it.',
            steps: [
              'Open Audit in the System menu.',
              'Type a keyword in the Search action or details field, for example a school name or a word from the reason that was written.',
              'Pick an area in Filter by area to narrow the result.',
              'Look at the record count at the top right, then match the time and details with the event you are looking into.',
            ],
            href: '/platform/audit',
          },
          {
            heading: 'Reading one record',
            body: 'Each record has three parts: Time, Action, and Details. The Action shows the kind of action, and the prefix before the first dot is the area: school, registration, catalog, payment, billing, messaging, and reference (curriculum bank). The reason staff wrote when suspending or activating without payment is visible in the details.',
            tip: 'To find every suspension today, type the word suspend or switch the area to school and look at the times.',
          },
          {
            heading: 'The limit of this page',
            body: 'The page only loads the 200 most recent records. Older events do not show here. If you need to trace an old event, contact the technical team and give the approximate date and the foundation name.',
          },
        ],
        faq: [
          {
            q: 'A school says it was suspended without notice. How do I check?',
            a: 'Open Audit, type the school name in the search field, and look at the suspension record: when and why. If there is no staff record, the suspension was probably because of billing; check Foundations & units.',
          },
          {
            q: 'I changed something but cannot find it in Audit. Why?',
            a: 'Reload the page and search again with a shorter word. The newest records are at the very top. If it is still missing, the change may not have been saved; repeat it and watch for the Changes saved message.',
          },
          {
            q: 'Can I delete a wrong Audit record?',
            a: 'No. Audit records cannot be changed or deleted so the history stays trustworthy. If you made a mistake, correct the action and write the reason for the correction.',
          },
        ],
      },
      su: {
        title: 'Audit: ngalacak saha ngalakukeun naon',
        summary:
          'Néangan catetan tindakan staf jeung parobahan penting pikeun ngajawab patarosan sakola atawa rekan damel.',
        forWho: 'Sakabéh staf platform, utamana nalika nalungtik kaluhan atawa mariksa pagawéan sorangan.',
        sections: [
          {
            heading: 'Néangan saha ngarobah naon',
            body: 'Kaca Audit nembongkeun tindakan staf jeung parobahan penting di sakabéh sakola, nu panganyarna di luhur. Kaca ieu ngan keur dibaca, taya tombol pikeun ngarobih atawa mupus catetan. Sakabéh peran staf, kaasup Ngan ningali, meunang muka.',
            steps: [
              'Buka Audit dina menu Sistem.',
              'Ketik kecap konci dina kolom Cari aksi atawa rincian, upamana ngaran sakola atawa kecap tina alesan nu ditulis.',
              'Pilih area dina Saring nurutkeun area pikeun nyaruakeun hasil.',
              'Tingali jumlah catetan di katuhu luhur, tuluy cocogkeun waktu jeung rincian jeung kajadian nu keur ditalungtik.',
            ],
            href: '/platform/audit',
          },
          {
            heading: 'Maca hiji catetan',
            body: 'Unggal catetan boga tilu bagian: Waktu, Aksi, jeung Rincian. Aksi nuduhkeun jenis tindakan, jeung awalan samemeh titik kahiji nyaéta areana: school (sakola), registration (pendaptaran), catalog (katalog), payment (pamayaran), billing (tagihan), messaging (pesen), jeung reference (bank kurikulum). Alesan nu ditulis staf nalika nangguhkeun atawa ngaktipkeun tanpa pamayaran katingali dina rincian.',
            tip: 'Pikeun néangan sakabéh penangguhan poé ieu, ketik kecap penangguhan atawa ganti area jadi school tuluy tingali waktuna.',
          },
          {
            heading: 'Wates kaca ieu',
            body: 'Kaca ngan ngamuat 200 catetan panganyarna. Kajadian nu leuwih heubeul teu muncul di dieu. Lamun anjeun peryogi ngalacak kajadian heubeul, hubungi tim téknis jeung sebutkeun kira-kira tanggal sarta ngaran lembagana.',
          },
        ],
        faq: [
          {
            q: 'Sakola nyarios ditangguhkeun tanpa béwara. Kumaha mariksana?',
            a: 'Buka Audit, ketik ngaran sakola dina kolom pilarian, tuluy tingali catetan penangguhan: iraha jeung naon alesanana. Lamun taya catetan staf, kamungkinan penangguhanana alatan tagihan; pariksa dina Lembaga & unit.',
          },
          {
            q: 'Abdi ngarobih hiji hal tapi teu mendak dina Audit. Naha?',
            a: 'Muat deui kaca tuluy cobi pilarian deui ku kecap nu leuwih singget. Catetan panganyarna aya di luhur pisan. Lamun tetep taya, kamungkinan parobahanana can kasimpen; baréngan deui tuluy perhatikeun pesen Perubahan disimpen.',
          },
          {
            q: 'Naha abdi tiasa mupus catetan Audit nu lepat?',
            a: 'Henteu. Catetan Audit teu bisa dirobah atawa dipupus sangkan riwayat tetep bisa dipercaya. Lamun anjeun nyieun kalepatan, bener-keun tindakanana tuluy tulis alesan perbaikanana.',
          },
        ],
      },
    },
  },
  {
    slug: 'my-profile',
    icon: 'lock',
    tone: 'slate',
    group: 'ops',
    text: {
      id: {
        title: 'Profil saya: nama, kata sandi, dan perangkat',
        summary:
          'Ubah nama, ganti kata sandi, dan keluarkan perangkat yang tidak Anda kenali dari akun Anda.',
        forWho: 'Semua pengguna yang punya akun, apa pun perannya.',
        sections: [
          {
            heading: 'Membuka profil Anda',
            body: 'Profil ada di menu yang muncul saat Anda mengklik nama Anda di pojok kanan atas.',
            steps: ['Klik nama atau foto inisial Anda di pojok kanan atas.', 'Pilih Profil saya.'],
            href: '/platform/profile',
          },
          {
            heading: 'Mengubah nama',
            body: 'Nama tampil di daftar anggota dan di bagian atas halaman. Email dipakai untuk masuk dan tidak bisa diubah di sini.',
            steps: [
              'Di kartu Profil, ubah isian Nama lengkap.',
              'Klik Simpan nama. Tombol baru aktif setelah nama berubah.',
            ],
            tip: 'Nama minimal 2 huruf.',
          },
          {
            heading: 'Mengganti kata sandi',
            body: 'Anda perlu mengisi kata sandi saat ini sebelum menggantinya. Kata sandi baru minimal 12 karakter.',
            steps: [
              'Di kartu Ganti kata sandi, isi Kata sandi saat ini.',
              'Isi Kata sandi baru, lalu ulangi di Ulangi kata sandi baru.',
              'Klik Simpan kata sandi.',
            ],
            tip: 'Pakai kalimat yang mudah diingat tetapi panjang, misalnya empat kata acak, lebih aman daripada satu kata dengan angka.',
            warning:
              'Setelah kata sandi diganti, semua perangkat lain yang sedang masuk dengan akun Anda otomatis keluar. Perangkat yang sedang Anda pakai tetap masuk.',
          },
          {
            heading: 'Mengeluarkan perangkat yang tidak dikenal',
            body: 'Kartu Perangkat yang sedang masuk menampilkan setiap perangkat yang masih masuk dengan akun Anda, lengkap dengan peramban, sistem, waktu masuk, dan alamat jaringannya.',
            steps: [
              'Lihat daftar perangkat. Perangkat yang sedang Anda pakai ditandai Perangkat ini.',
              'Klik Keluarkan pada perangkat yang tidak Anda kenali.',
              'Untuk mengeluarkan semuanya sekaligus, klik Keluarkan semua perangkat lain.',
            ],
            warning: 'Bila ada perangkat yang tidak Anda kenali, keluarkan lalu segera ganti kata sandi.',
          },
        ],
        faq: [
          {
            q: 'Bagaimana mengganti email saya?',
            a: 'Email tidak bisa diubah sendiri dari halaman profil. Hubungi admin untuk meminta penggantian.',
          },
          {
            q: 'Saya lupa kata sandi saat ini, bagaimana mengganti?',
            a: 'Keluar dulu, lalu di halaman masuk klik Lupa kata sandi. Kode 6 digit dikirim ke email Anda dan berlaku 10 menit; dengan kode itu Anda bisa membuat kata sandi baru.',
          },
          {
            q: 'Kenapa saya tiba-tiba keluar dari perangkat lain?',
            a: 'Itu terjadi setelah kata sandi diganti, atau bila Anda atau admin mengeluarkan perangkat itu dari daftar perangkat. Masuk lagi dengan kata sandi yang baru.',
          },
          {
            q: 'Muncul perangkat tak dikenal di daftar, apakah akun saya diretas?',
            a: 'Belum tentu: perangkat lama atau peramban yang pernah Anda pakai juga tampil. Bila ragu, keluarkan semua perangkat lain lalu ganti kata sandi.',
          },
        ],
      },
      en: {
        title: 'My profile: name, password, and devices',
        summary: 'Change your name, update your password, and sign out devices you do not recognise.',
        forWho: 'Everyone with an account, whatever their role.',
        sections: [
          {
            heading: 'Opening your profile',
            body: 'Your profile is in the menu that opens when you click your name at the top right.',
            steps: ['Click your name or initials at the top right.', 'Choose My profile.'],
            href: '/platform/profile',
          },
          {
            heading: 'Changing your name',
            body: 'Your name appears in the member list and at the top of the page. Your email is used to sign in and cannot be changed here.',
            steps: [
              'In the Profile card, edit the Full name field.',
              'Click Save name. The button only turns on once the name has changed.',
            ],
            tip: 'A name needs at least 2 letters.',
          },
          {
            heading: 'Changing your password',
            body: 'You must enter your current password before changing it. The new password needs at least 12 characters.',
            steps: [
              'In the Change password card, fill in Current password.',
              'Fill in New password, then repeat it in Repeat new password.',
              'Click Save password.',
            ],
            tip: 'A long phrase that is easy to remember, such as four random words, is safer than one word with numbers.',
            warning:
              'Once the password is changed, every other device signed in to your account is signed out automatically. The device you are using stays signed in.',
          },
          {
            heading: 'Signing out a device you do not recognise',
            body: 'The Signed-in devices card lists every device still signed in to your account, with its browser, system, sign-in time, and network address.',
            steps: [
              'Look through the list. The device you are using is marked This device.',
              'Click Sign out on any device you do not recognise.',
              'To sign out all of them at once, click Sign out all other devices.',
            ],
            warning:
              'If you see a device you do not recognise, sign it out and change your password right away.',
          },
        ],
        faq: [
          {
            q: 'How do I change my email?',
            a: 'You cannot change your email yourself from the profile page. Ask an administrator to change it.',
          },
          {
            q: 'I forgot my current password. How do I change it?',
            a: 'Sign out, then click Forgot password on the sign-in page. A 6-digit code is sent to your email and is valid for 10 minutes; with it you can create a new password.',
          },
          {
            q: 'Why was I suddenly signed out on another device?',
            a: 'That happens after the password is changed, or when you or an administrator signed that device out of the list. Sign in again with the new password.',
          },
          {
            q: 'An unknown device is in the list. Has my account been hacked?',
            a: 'Not necessarily: old devices or browsers you used before also appear. If in doubt, sign out all other devices and change your password.',
          },
        ],
      },
      su: {
        title: 'Profil kuring: ngaran, kecap akses, jeung parangkat',
        summary:
          'Robah ngaran, ganti kecap akses, jeung kaluarkeun parangkat nu teu anjeun kenal tina akun anjeun.',
        forWho: 'Sakabéh pamaké nu boga akun, naon waé perananna.',
        sections: [
          {
            heading: 'Muka profil anjeun',
            body: 'Profil aya dina ménu nu muncul waktu anjeun ngaklik ngaran anjeun di juru katuhu luhur.',
            steps: ['Klik ngaran atawa inisial anjeun di juru katuhu luhur.', 'Pilih Profil kuring.'],
            href: '/platform/profile',
          },
          {
            heading: 'Ngarobah ngaran',
            body: 'Ngaran kaciri dina daptar anggota jeung di luhureun kaca. Surélék dipaké pikeun asup jeung teu bisa dirobah di dieu.',
            steps: [
              'Dina kartu Profil, robah eusian Ngaran lengkep.',
              'Klik Simpen ngaran. Tombolna anyar aktip sanggeus ngaran robah.',
            ],
            tip: 'Ngaran sahenteuna 2 hurup.',
          },
          {
            heading: 'Ngaganti kecap akses',
            body: 'Anjeun kudu ngeusian kecap akses ayeuna samemeh ngagantina. Kecap akses anyar sahenteuna 12 karakter.',
            steps: [
              'Dina kartu Ganti kecap akses, eusian Kecap akses ayeuna.',
              'Eusian Kecap akses anyar, tuluy ulang dina Ulang kecap akses anyar.',
              'Klik Simpen kecap akses.',
            ],
            tip: 'Kalimah panjang nu gampang diinget, upamana opat kecap acak, leuwih aman tibatan hiji kecap jeung angka.',
            warning:
              'Sanggeus kecap akses diganti, sakabéh parangkat séjén nu keur asup maké akun anjeun otomatis kaluar. Parangkat nu keur dipaké tetep asup.',
          },
          {
            heading: 'Ngaluarkeun parangkat nu teu dikenal',
            body: 'Kartu Parangkat nu keur asup nuduhkeun unggal parangkat nu masih asup maké akun anjeun, lengkep jeung panyungsi, sistem, waktu asup, jeung alamat jaringanna.',
            steps: [
              'Tenjo daptar parangkat. Parangkat nu keur dipaké dicirian Parangkat ieu.',
              'Klik Kaluarkeun dina parangkat nu teu anjeun kenal.',
              'Pikeun ngaluarkeun kabéhna sakaligus, klik Kaluarkeun sakabéh parangkat séjén.',
            ],
            warning: 'Lamun aya parangkat nu teu anjeun kenal, kaluarkeun tuluy geuwat ganti kecap akses.',
          },
        ],
        faq: [
          {
            q: 'Kumaha ngaganti surélék kuring?',
            a: 'Surélék teu bisa dirobah sorangan tina kaca profil. Hubungi admin pikeun menta diganti.',
          },
          {
            q: 'Poho kecap akses ayeuna, kumaha ngagantina?',
            a: 'Kaluar heula, tuluy dina kaca asup klik Poho kecap sandi. Kode 6 angka dikirim ka surélék anjeun sarta lumaku 10 menit; maké kode éta anjeun bisa nyieun kecap akses anyar.',
          },
          {
            q: 'Naha kuring ujug-ujug kaluar tina parangkat séjén?',
            a: 'Éta kajadian sanggeus kecap akses diganti, atawa lamun anjeun atawa admin ngaluarkeun parangkat éta tina daptar. Asup deui maké kecap akses anyar.',
          },
          {
            q: 'Aya parangkat teu dikenal dina daptar, naha akun kuring dibobol?',
            a: 'Teu salawasna: parangkat atawa panyungsi lawas nu kungsi dipaké ogé kaciri. Lamun ragu, kaluarkeun sakabéh parangkat séjén tuluy ganti kecap akses.',
          },
        ],
      },
    },
  },
  {
    slug: 'site',
    icon: 'globe',
    tone: 'violet',
    group: 'config',
    text: {
      id: {
        title: 'Situs Edusync: ikon, gambar, dan isi halaman utama',
        summary:
          'Ganti favicon, logo, gambar hero, gambar pratinjau tautan, serta teks halaman utama dan profil perusahaan tanpa mengubah kode.',
        forWho: 'Admin platform yang mengelola tampilan situs Edusync. Staf baca saja hanya bisa melihat.',
        sections: [
          {
            heading: 'Ikon dan gambar',
            body: 'Buka menu Situs, tab Ikon & gambar. Ada enam slot: ikon situs (favicon), ikon aplikasi, logo, logo tema gelap, gambar hero, dan gambar pratinjau tautan (OG). Slot yang kosong memakai gambar bawaan aplikasi.',
            steps: [
              'Klik Unggah pada slot yang ingin diganti dan pilih berkas.',
              'Periksa pratinjau di kartu; ukuran dan jenis berkas tampil di bawahnya.',
              'Klik Kembalikan ke bawaan untuk menghapus gambar unggahan.',
            ],
            tip: 'Favicon dan ikon aplikasi maksimal 256 KB, gambar lain 2 MB. Gambar pratinjau tautan paling baik berukuran 1200x630 piksel.',
            warning:
              'SVG yang memuat skrip, atribut peristiwa seperti onload, atau foreignObject ditolak demi keamanan.',
            href: '/platform/site',
          },
          {
            heading: 'Teks halaman utama dan profil perusahaan',
            body: 'Tab Konten berisi nama merek, teks per bahasa (Indonesia, English, Sunda), daftar fitur, profil perusahaan, kontak, tautan media sosial, dan saklar bagian. Sebelum disimpan pertama kali, halaman utama memakai teks bawaan sehingga tampilannya tidak berubah.',
            steps: [
              'Pilih tab bahasa lalu isi judul, subjudul, dan label tombol.',
              'Tambah, hapus, atau urutkan fitur; ikon dipilih dari daftar tertutup. Urutan berlaku untuk semua bahasa.',
              'Isi profil perusahaan dan nyalakan saklar Tentang kami bila ingin menampilkannya.',
              'Klik Simpan. Titik merah pada tab bahasa menandai kolom wajib yang masih kosong.',
            ],
          },
          {
            heading: 'Pratinjau dan waktu tampil',
            body: 'Tombol Pratinjau halaman utama membuka halaman di tab baru dengan isi terbaru. Halaman utama sungguhan menyimpan cache sekitar satu menit, jadi perubahan baru terlihat penuh setelah itu. Bila layanan sedang tidak tersedia, halaman utama otomatis memakai teks bawaan.',
          },
        ],
        faq: [
          {
            q: 'Bagaimana mengembalikan semuanya seperti semula?',
            a: 'Klik Kembalikan teks ke bawaan di tab Konten untuk teks, dan Kembalikan ke bawaan pada tiap slot untuk gambar. Keduanya tercatat di audit.',
          },
          {
            q: 'Mengapa favicon belum berubah di peramban saya?',
            a: 'Peramban menyimpan favicon cukup lama. Muat ulang keras atau tutup tab lalu buka lagi.',
          },
        ],
      },
      en: {
        title: 'Edusync site: icons, images, and home page content',
        summary:
          'Change the favicon, logo, hero image, link preview image, and the home page and company profile text without changing code.',
        forWho: 'Platform admins who manage how the Edusync site looks. View-only staff can only look.',
        sections: [
          {
            heading: 'Icons and images',
            body: 'Open the Site menu, Icons & images tab. There are six slots: site icon (favicon), app icon, logo, dark theme logo, hero image, and link preview image (OG). An empty slot uses the built-in image.',
            steps: [
              'Click Upload on the slot you want to change and pick a file.',
              'Check the preview in the card; the file size and type appear below it.',
              'Click Reset to default to delete the uploaded image.',
            ],
            tip: 'The favicon and app icon are limited to 256 KB, other images to 2 MB. The link preview image works best at 1200x630 pixels.',
            warning:
              'SVGs that contain scripts, event attributes such as onload, or foreignObject are rejected for safety.',
            href: '/platform/site',
          },
          {
            heading: 'Home page text and company profile',
            body: 'The Content tab holds the brand name, text per language (Indonesian, English, Sundanese), the feature list, the company profile, contact details, social links, and section switches. Until it is saved for the first time, the home page uses the built-in text so nothing changes.',
            steps: [
              'Pick a language tab and fill in the heading, subheading, and button labels.',
              'Add, remove, or reorder features; icons are chosen from a fixed list. The order applies to all languages.',
              'Fill in the company profile and turn on the About us switch to show it.',
              'Click Save. A red dot on a language tab marks required fields that are still empty.',
            ],
          },
          {
            heading: 'Preview and when changes appear',
            body: 'The Preview home page button opens the page in a new tab with the latest content. The live home page is cached for about a minute, so changes fully appear after that. If the service is unavailable, the home page falls back to the built-in text automatically.',
          },
        ],
        faq: [
          {
            q: 'How do I restore everything to the original?',
            a: 'Click Reset text to default on the Content tab for text, and Reset to default on each slot for images. Both are recorded in the audit log.',
          },
          {
            q: 'Why has the favicon not changed in my browser?',
            a: 'Browsers cache favicons for a long time. Hard-reload, or close the tab and open it again.',
          },
        ],
      },
      su: {
        title: 'Situs Edusync: ikon, gambar, jeung eusi kaca utama',
        summary:
          'Ganti favicon, logo, gambar hero, gambar pratayang tutumbu, sarta téks kaca utama jeung profil pausahaan tanpa ngarobah kode.',
        forWho: 'Admin platform nu ngokolakeun tampilan situs Edusync. Staf maca wungkul ngan bisa ningali.',
        sections: [
          {
            heading: 'Ikon jeung gambar',
            body: 'Buka ménu Situs, tab Ikon & gambar. Aya genep slot: ikon situs (favicon), ikon aplikasi, logo, logo téma poék, gambar hero, jeung gambar pratayang tutumbu (OG). Slot kosong maké gambar bawaan aplikasi.',
            steps: [
              'Klik Unggah dina slot nu rék diganti tuluy pilih berkas.',
              'Pariksa pratayang dina kartu; ukuran jeung jinis berkas tampil di handapeunana.',
              'Klik Balikeun ka bawaan pikeun mupus gambar unggahan.',
            ],
            tip: 'Favicon jeung ikon aplikasi pangpanjangna 256 KB, gambar séjén 2 MB. Gambar pratayang tutumbu pangalusna ukuran 1200x630 piksel.',
            warning:
              'SVG nu ngandung skrip, atribut kajadian siga onload, atawa foreignObject ditolak demi kaamanan.',
            href: '/platform/site',
          },
          {
            heading: 'Téks kaca utama jeung profil pausahaan',
            body: 'Tab Eusi ngandung ngaran mérek, téks per basa (Indonésia, Inggris, Sunda), daptar fitur, profil pausahaan, kontak, tutumbu média sosial, jeung saklar bagian. Saméméh disimpen kahiji kalina, kaca utama maké téks bawaan jadi tampilanna teu robah.',
            steps: [
              'Pilih tab basa tuluy eusian judul, sub-judul, jeung labél tombol.',
              'Tambahkeun, piceun, atawa urutkeun fitur; ikon dipilih tina daptar nu geus tetep. Urutan lumaku pikeun sakabéh basa.',
              'Eusian profil pausahaan tuluy hurungkeun saklar Ngeunaan kami lamun rék ditampilkeun.',
              'Klik Simpen. Titik beureum dina tab basa nandaan kolom wajib nu masih kosong.',
            ],
          },
          {
            heading: 'Pratayang jeung iraha tampil',
            body: 'Tombol Pratayang kaca utama muka kaca di tab anyar kalawan eusi panganyarna. Kaca utama nyata nyimpen cache kira-kira sa-menit, jadi parobahan pinuh katingali sanggeus éta. Lamun layanan keur teu sayaga, kaca utama otomatis maké téks bawaan.',
          },
        ],
        faq: [
          {
            q: 'Kumaha mulangkeun sakabéhna ka asal?',
            a: 'Klik Balikeun téks ka bawaan di tab Eusi pikeun téks, jeung Balikeun ka bawaan dina unggal slot pikeun gambar. Duanana kacatet dina audit.',
          },
          {
            q: 'Naha favicon can robah di panyungsi kuring?',
            a: 'Panyungsi nyimpen favicon geus lila. Muat deui kuat, atawa tutup tab tuluy buka deui.',
          },
        ],
      },
    },
  },
];
