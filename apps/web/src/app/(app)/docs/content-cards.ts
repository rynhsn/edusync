import type { DocArticle } from '@/lib/docs-types';

/** Panduan kartu cetak: kartu siswa (RFID) dan kartu peserta ujian. Isi: id, en, su. */
export const CARD_DOCS: DocArticle[] = [
  {
    slug: 'print-cards',
    icon: 'credit',
    tone: 'violet',
    group: 'master',
    text: {
      id: {
        title: 'Merancang dan mencetak kartu siswa dan kartu ujian',
        summary:
          'Rancang kartu sendiri di editor visual, lalu cetak kartu siswa (dengan kode kartu RFID) dan kartu peserta ujian satu kelas sekaligus.',
        forWho:
          'Admin sekolah yang merancang templat kartu; operator dan guru yang mencetak kartu satu kelas.',
        sections: [
          {
            heading: 'Membuka halaman Kartu',
            body: 'Menu Kartu cetak berisi dua tab: Kartu siswa dan Kartu ujian (tab ujian muncul bila modul Ujian aktif). Di tiap tab ada daftar templat dengan pratinjau kecil dan bagian Cetak di bawahnya. Sekolah yang belum menyimpan templat tetap bisa mencetak memakai rancangan bawaan sistem.',
            href: '/cards',
          },
          {
            heading: 'Merancang templat di editor',
            body: 'Editor menggambar kartu dalam satuan milimeter. Kartu siswa bawaan berukuran 86 x 54 mm (ukuran kartu ID), kartu ujian bawaan 100 x 60 mm. Anda bisa mengganti ukuran dengan pilihan cepat atau mengetik angkanya sendiri.',
            steps: [
              'Di tab yang diinginkan, klik Tambah dari bawaan untuk mulai dari rancangan siap pakai, atau Templat baru untuk kanvas kosong.',
              'Beri nama templat, lalu pilih atau ketik ukuran kartu.',
              'Klik Unggah latar bila ingin gambar latar (PNG atau JPEG, paling besar 1,5 MB).',
              'Tambahkan elemen dari panel kiri: Teks, Kolom data, Gambar, Foto siswa, Kode QR, Kode batang, Kotak, atau Garis.',
              'Seret elemen untuk menggeser, tarik pegangan di tepinya untuk mengubah ukuran, dan atur detailnya di panel Properti di kanan.',
              'Klik Simpan. Bila ada isian yang salah, daftar perbaikan muncul di atas editor.',
            ],
            tip: 'Tombol panah menggeser elemen 0,5 mm (tahan Shift untuk 5 mm). Ctrl+Z mengurungkan dan Ctrl+D menggandakan. Kotak Data contoh mengisi kartu dengan nama dan nomor palsu agar Anda bisa menilai tampilannya.',
            href: '/cards',
          },
          {
            heading: 'Kolom data, gambar, dan lapisan',
            body: 'Kolom data diisi otomatis dari data siswa saat dicetak, misalnya nama, NIS, kelas, tahun ajaran, atau nama sekolah. Awalan seperti "NIS: " bisa ditulis di panel Properti. Foto siswa mengambil foto dari data siswa. Kode QR dan kode batang bisa berisi NIS, kode kartu RFID, atau nomor peserta. Elemen yang di bawah daftar Lapisan digambar lebih dulu; gunakan tombol urutan untuk membawa elemen ke depan atau belakang.',
            warning:
              'Teks yang terlalu panjang untuk kotaknya dikecilkan otomatis sampai muat, jadi lebarkan kotaknya bila huruf terlihat terlalu kecil.',
          },
          {
            heading: 'Mencetak kartu siswa',
            body: 'Pilih templat dan kelas, lalu unduh PDF. Anda bisa memilih satu kartu per halaman (seukuran kartu, untuk printer kartu ID) atau beberapa kartu per lembar kertas.',
            steps: [
              'Buka tab Kartu siswa dan pilih templat pada bagian Cetak.',
              'Pilih tahun ajaran dan kelas. Jumlah kartu dan pratinjau muncul.',
              'Pilih susunan: satu kartu per halaman, atau beberapa kartu per lembar. Untuk lembar, atur jenis kertas, tepi kertas, jarak antar-kartu, dan tanda potong.',
              'Klik Unduh PDF dan tunggu sampai selesai. Cetak PDF-nya dengan skala 100 persen.',
            ],
            tip: 'Satu PDF memuat paling banyak 300 kartu. Untuk kelas yang lebih besar, cetak per kelas.',
            href: '/cards',
          },
          {
            heading: 'Mencetak kartu peserta ujian',
            body: 'Pilih templat, tahun ajaran, semester, kelas, dan bila perlu jenis ujian. Nomor peserta dibuat otomatis dengan aturan: singkatan jenis ujian, tanda hubung, dua angka tahun mulai tahun ajaran, tanda hubung, lalu nomor urut tiga angka. Contoh: ASTS-26-007 berarti siswa ke-7 di kelasnya pada tahun ajaran 2026/2027 untuk jenis ujian ASTS. Nomor urut menurut urutan nama siswa aktif di kelas itu, jadi tetap sama selama susunan kelas tidak berubah. Jadwal pada kartu diambil dari ujian semester tersebut yang mencakup kelas siswa.',
            steps: [
              'Buka tab Kartu ujian dan pilih templat.',
              'Pilih tahun ajaran, semester, dan kelas. Pilih jenis ujian bila ingin membatasi jadwal.',
              'Periksa pratinjau dan nomor peserta pertama.',
              'Klik Unduh PDF.',
            ],
            warning:
              'Kartu hanya menampilkan jadwal bila ujiannya sudah dibuat dengan tanggal dan jam. Kolom Ruang masih kosong karena belum ada data ruang di aplikasi.',
          },
          {
            heading: 'Foto siswa',
            body: 'Foto dipasang per siswa. Buka menu Siswa, pilih Ubah pada siswa yang diinginkan, lalu klik Unggah foto. Foto otomatis dipotong dengan rasio 3:4 dan dikecilkan. Foto hanya bisa dilihat anggota sekolah yang berhak, bukan publik. Siswa tanpa foto tetap dicetak, dengan kotak foto kosong.',
            href: '/students',
          },
          {
            heading: 'QR identitas siswa di kartu',
            body: 'Kartu siswa bawaan memuat QR identitas siswa: satu kode acak unik per siswa (bukan NIS) yang dibuat otomatis saat data cetak dimuat, jadi tidak ada langkah tambahan. Kode hanya menunjuk siswa; menu tempat QR dipindai yang menentukan tindakannya. Contohnya, di menu Absen datang & pulang (tab Pindai QR) memindai berarti mencatat datang atau pulang sebagai cadangan saat kiosk RFID tidak bisa dipakai, sedangkan kiosk RFID tetap cara utama absensi. Menu lain yang kelak memakai kartu yang sama (misalnya peminjaman) cukup memindai QR yang sama. Di editor, elemen Kode QR atau Kode batang bisa memilih kolom QR identitas siswa; kolom ini hanya ada untuk kartu siswa. Kode batang boleh juga berisi QR identitas, tetapi panjang (perlu lebar minimal 55 mm); bila kartu tidak muat, cukup QR saja. NIS tetap bisa dicetak sebagai teks atau kode batang biasa, namun pemindai hanya menerima isi QR identitas, bukan NIS.',
            tip: 'Templat lama yang dibuat sebelum fitur ini belum punya QR identitas siswa: buka editor, tambahkan elemen Kode QR, lalu pilih kolom QR identitas siswa. Panel Cetak memberi peringatan bila templat yang dipilih belum memilikinya.',
            warning:
              'Keamanan: QR hanya mengidentifikasi siswa dan tidak membuka data apa pun dengan sendirinya; setiap pemindai wajib masuk (login) dan memiliki izin fitur masing-masing. Karena itu orang yang hanya memegang kartu tidak bisa mencatat absensi tanpa akun guru. Kartu yang hilang: buka menu Siswa, pilih kartu siswa itu, lalu Buat ulang QR identitas. QR lama langsung tidak berlaku di SEMUA fitur sekaligus dan kartu baru harus dicetak ulang. Jangan membagikan foto kartu.',
            href: '/cards',
          },
          {
            heading: 'Kode kartu RFID harus didaftarkan lebih dulu',
            body: 'Kartu siswa hanya bisa mencetak kode RFID bila kode kartu fisik siswa sudah didaftarkan di menu Kartu RFID. Kartu cetak ini adalah desainnya; yang dibaca pembaca gerbang tetap kode pada kartu fisik yang terdaftar.',
            warning:
              'Bila kode RFID belum didaftarkan, kolom Kode kartu RFID dan kode QR atau kode batang berisi kode itu akan kosong di kartu.',
            href: '/attendance/cards',
          },
        ],
        faq: [
          {
            q: 'Perubahan di editor hilang saat saya pindah halaman. Mengapa?',
            a: 'Perubahan hanya tersimpan setelah Anda klik Simpan. Bila ada yang belum disimpan, aplikasi menanyakan dulu sebelum Anda meninggalkan editor.',
          },
          {
            q: 'Mengapa gambar latar tidak mau diunggah?',
            a: 'Gambar harus PNG atau JPEG dan paling besar 1,5 MB. Kecilkan gambar dulu bila lebih besar.',
          },
          {
            q: 'Mengapa PDF tidak bisa dibuat untuk kertas lembar?',
            a: 'Kartu mungkin lebih besar dari kertas setelah dikurangi tepi. Kecilkan tepi kertas atau jarak antar-kartu, atau pilih kertas yang lebih besar.',
          },
          {
            q: 'Bolehkah saya membuat beberapa templat?',
            a: 'Boleh. Salah satunya ditandai Bawaan dan dipilih otomatis saat mencetak. Gunakan Gandakan untuk membuat varian dari templat yang ada.',
          },
        ],
      },
      en: {
        title: 'Designing and printing student cards and exam cards',
        summary:
          'Design your own cards in the visual editor, then print student cards (with RFID card code) and exam participant cards for a whole class at once.',
        forWho:
          'School admins who design card templates; operators and teachers who print the cards for a class.',
        sections: [
          {
            heading: 'Opening the Cards page',
            body: 'The Printable cards menu has two tabs: Student cards and Exam cards (the exam tab appears when the Exams module is on). Each tab lists templates with a small preview, and a Print section below it. A school with no saved template can still print using the built-in system design.',
            href: '/cards',
          },
          {
            heading: 'Designing a template in the editor',
            body: 'The editor draws the card in millimeters. The built-in student card is 86 x 54 mm (ID card size) and the built-in exam card is 100 x 60 mm. You can change the size with a quick choice or type your own numbers.',
            steps: [
              'In the tab you want, click Add from default to start from a ready design, or New template for an empty canvas.',
              'Name the template, then choose or type the card size.',
              'Click Upload background if you want a background image (PNG or JPEG, up to 1.5 MB).',
              'Add elements from the left panel: Text, Data field, Image, Student photo, QR code, Barcode, Box, or Line.',
              'Drag an element to move it, pull a handle on its edge to resize it, and set the details in the Properties panel on the right.',
              'Click Save. If anything is wrong, a list of fixes appears above the editor.',
            ],
            tip: 'Arrow keys move an element 0.5 mm (hold Shift for 5 mm). Ctrl+Z undoes and Ctrl+D duplicates. The Sample data box fills the card with fake names and numbers so you can judge how it looks.',
            href: '/cards',
          },
          {
            heading: 'Data fields, images and layers',
            body: 'Data fields are filled automatically from student data when printing, for example name, NIS, class, academic year or school name. You can write a prefix such as "NIS: " in the Properties panel. The student photo element takes the photo from the student record. QR codes and barcodes can hold the NIS, the RFID card code or the participant number. Elements lower in the Layers list are drawn first; use the order buttons to bring an element forward or backward.',
            warning:
              'Text that is too long for its box is shrunk automatically until it fits, so widen the box if the letters look too small.',
          },
          {
            heading: 'Printing student cards',
            body: 'Pick a template and a class, then download the PDF. You can choose one card per page (card-sized, for ID card printers) or several cards per sheet of paper.',
            steps: [
              'Open the Student cards tab and pick a template in the Print section.',
              'Pick the academic year and class. The number of cards and a preview appear.',
              'Pick the layout: one card per page, or several per sheet. For sheets, set the paper type, paper margin, gap between cards and crop marks.',
              'Click Download PDF and wait until it finishes. Print the PDF at 100 percent scale.',
            ],
            tip: 'One PDF holds at most 300 cards. For a bigger class, print by class.',
            href: '/cards',
          },
          {
            heading: 'Printing exam participant cards',
            body: 'Pick a template, academic year, semester, class and, if needed, the exam type. The participant number is generated by this rule: exam type abbreviation, a hyphen, two digits of the academic year start, a hyphen, then a three-digit sequence number. Example: ASTS-26-007 means the 7th student in their class in academic year 2026/2027 for exam type ASTS. The sequence follows the name order of active students in that class, so it stays the same while the class roster does not change. The schedule on the card comes from the exams of that semester that include the student class.',
            steps: [
              'Open the Exam cards tab and pick a template.',
              'Pick the academic year, semester and class. Pick an exam type to narrow the schedule.',
              'Check the preview and the first participant number.',
              'Click Download PDF.',
            ],
            warning:
              'The card shows a schedule only when the exams were created with a date and time. The Room field is still empty because the app has no room data yet.',
          },
          {
            heading: 'Student photos',
            body: 'Photos are set per student. Open the Students menu, choose Edit on the student, then click Upload photo. The photo is cropped to a 3:4 ratio and shrunk automatically. Photos can only be seen by school members who are allowed to, not by the public. Students without a photo are still printed, with an empty photo box.',
            href: '/students',
          },
          {
            heading: 'Student identity QR on the card',
            body: 'The built-in student card carries a student identity QR: one random code unique per student (not the NIS) that is created automatically when the print data loads, so there is no extra step. The code only points to a student; the menu where the QR is scanned decides the action. For example, in the Manual arrival & departure menu (Scan QR tab), scanning records an arrival or departure as a backup when the RFID kiosk cannot be used, while the RFID kiosk remains the main way to take attendance. Any other menu that later uses the same card (for example lending) just scans the same QR. In the editor, a QR code or Barcode element can choose the Student identity QR field; this field exists for student cards only. A Barcode may also hold the identity QR content, but it is long (needs at least 55 mm width); if the card has no room, the QR alone is enough. The NIS can still be printed as text or a normal barcode, but the scanners only accept the identity QR content, not the NIS.',
            tip: 'Older templates created before this feature have no student identity QR: open the editor, add a QR code element, then choose the Student identity QR field. The Print panel warns when the chosen template does not have one.',
            warning:
              'Security: the QR only identifies the student and opens no data by itself; every scanner requires a login and its own feature permission, so someone holding only the card cannot record attendance without a teacher account. Lost card: open the Students menu, choose that student card, then Regenerate identity QR. The old QR stops working in ALL features at once and a new card must be printed. Do not share photos of the card.',
            href: '/cards',
          },
          {
            heading: 'RFID card codes must be registered first',
            body: 'A student card can print the RFID code only if the code of the physical card has been registered in the RFID cards menu. The printed card is the design; what the gate reader reads is still the code on the registered physical card.',
            warning:
              'If the RFID code is not registered yet, the RFID card code field and any QR code or barcode holding it stay empty on the card.',
            href: '/attendance/cards',
          },
        ],
        faq: [
          {
            q: 'My changes in the editor disappeared when I changed page. Why?',
            a: 'Changes are saved only after you click Save. If anything is unsaved, the app asks before you leave the editor.',
          },
          {
            q: 'Why will my background image not upload?',
            a: 'The image must be PNG or JPEG and at most 1.5 MB. Make it smaller first if it is bigger.',
          },
          {
            q: 'Why can the PDF not be made for sheet paper?',
            a: 'The card may be bigger than the paper after the margin is removed. Reduce the paper margin or the gap, or pick bigger paper.',
          },
          {
            q: 'Can I have several templates?',
            a: 'Yes. One of them is marked Default and is chosen automatically when printing. Use Duplicate to make a variant of an existing template.',
          },
        ],
      },
      su: {
        title: 'Ngarancang jeung nyitak kartu siswa jeung kartu ujian',
        summary:
          'Rarancang kartu sorangan dina éditor visual, terus citak kartu siswa (maké kode kartu RFID) jeung kartu pamilon ujian sakelas sakaligus.',
        forWho: 'Admin sakola anu ngarancang templat kartu; operator jeung guru anu nyitak kartu sakelas.',
        sections: [
          {
            heading: 'Muka kaca Kartu',
            body: 'Ménu Kartu citak eusina dua tab: Kartu siswa jeung Kartu ujian (tab ujian muncul upami modul Ujian aktif). Dina unggal tab aya daptar templat kalayan pratayang leutik jeung bagian Citak handapeunana. Sakola anu can nyimpen templat tetep bisa nyitak maké rarancang bawaan sistem.',
            href: '/cards',
          },
          {
            heading: 'Ngarancang templat dina éditor',
            body: 'Éditor ngagambar kartu dina satuan milimeter. Kartu siswa bawaan ukuranana 86 x 54 mm (ukuran kartu ID), kartu ujian bawaan 100 x 60 mm. Anjeun bisa ngarobah ukuran ku pilihan gancang atawa ngetik angkana sorangan.',
            steps: [
              'Dina tab anu dipikahayang, klik Tambah tina bawaan pikeun ngamimitian ti rarancang anu geus siap, atawa Templat anyar pikeun kanvas kosong.',
              'Pasihan ngaran templat, terus pilih atawa ketik ukuran kartu.',
              'Klik Unggah latar upami hayang gambar latar (PNG atawa JPEG, pangbadagna 1,5 MB).',
              'Tambahkeun unsur tina panél kénca: Téks, Kolom data, Gambar, Poto siswa, Kode QR, Kode bar, Kotak, atawa Garis.',
              'Sered unsur pikeun mindahkeun, tarik cekelan di sisina pikeun ngarobah ukuran, jeung atur rinciannana dina panél Properti di katuhu.',
              'Klik Simpen. Upami aya isian anu salah, daptar pangbenerna muncul di luhur éditor.',
            ],
            tip: 'Tombol panah mindahkeun unsur 0,5 mm (tahan Shift pikeun 5 mm). Ctrl+Z ngabatalkeun jeung Ctrl+D ngagandakeun. Kotak Data conto ngeusian kartu ku ngaran jeung nomer palsu supados tampilanana bisa dinilai.',
            href: '/cards',
          },
          {
            heading: 'Kolom data, gambar, jeung lapisan',
            body: 'Kolom data diisi otomatis tina data siswa waktu dicitak, upamana ngaran, NIS, kelas, taun ajaran, atawa ngaran sakola. Awalan saperti "NIS: " bisa ditulis dina panél Properti. Poto siswa nyokot poto tina data siswa. Kode QR jeung kode bar bisa eusina NIS, kode kartu RFID, atawa nomer pamilon. Unsur anu aya handapeun daptar Lapisan digambar heula; paké tombol urutan pikeun mawa unsur ka hareup atawa ka tukang.',
            warning:
              'Téks anu pohara panjang pikeun kotakna dileutikan otomatis nepi ka muat, jadi lébarkeun kotakna upami hurupna katémbong leutik teuing.',
          },
          {
            heading: 'Nyitak kartu siswa',
            body: 'Pilih templat jeung kelas, terus unduh PDF. Anjeun bisa milih hiji kartu per kaca (saukuran kartu, pikeun printer kartu ID) atawa sababaraha kartu per lambar kertas.',
            steps: [
              'Buka tab Kartu siswa tuluy pilih templat dina bagian Citak.',
              'Pilih taun ajaran jeung kelas. Jumlah kartu jeung pratayang muncul.',
              'Pilih susunan: hiji kartu per kaca, atawa sababaraha per lambar. Pikeun lambar, atur jenis kertas, tepi kertas, jarak antar-kartu, jeung tanda potong.',
              'Klik Unduh PDF tuluy antosan nepi ka réngsé. Citak PDF-na kalayan skala 100 persén.',
            ],
            tip: 'Hiji PDF eusina pangbadagna 300 kartu. Pikeun kelas anu leuwih gedé, citak per kelas.',
            href: '/cards',
          },
          {
            heading: 'Nyitak kartu pamilon ujian',
            body: 'Pilih templat, taun ajaran, semester, kelas, jeung upami perlu jenis ujian. Nomer pamilon dijieun otomatis ku aturan: singketan jenis ujian, tanda hubung, dua angka taun mimiti taun ajaran, tanda hubung, tuluy nomer urut tilu angka. Conto: ASTS-26-007 hartina siswa ka-7 di kelasna dina taun ajaran 2026/2027 pikeun jenis ujian ASTS. Nomer urut nurutan urutan ngaran siswa aktif di kelas éta, jadi tetep sarua salami susunan kelas teu robah. Jadwal dina kartu dicokot tina ujian semester éta anu ngawengku kelas siswa.',
            steps: [
              'Buka tab Kartu ujian tuluy pilih templat.',
              'Pilih taun ajaran, semester, jeung kelas. Pilih jenis ujian upami hayang ngawatesan jadwal.',
              'Pariksa pratayang jeung nomer pamilon kahiji.',
              'Klik Unduh PDF.',
            ],
            warning:
              'Kartu ngan mintonkeun jadwal upami ujianana geus dijieun kalayan tanggal jeung jam. Kolom Rohangan masih kosong sabab can aya data rohangan dina aplikasi.',
          },
          {
            heading: 'Poto siswa',
            body: 'Poto dipasang per siswa. Buka ménu Siswa, pilih Robah dina siswa anu dipikahayang, terus klik Unggah poto. Poto otomatis dipotong kalayan rasio 3:4 jeung dileutikan. Poto ngan bisa ditempo ku anggota sakola anu boga hak, lain umum. Siswa tanpa poto tetep dicitak, kalayan kotak poto kosong.',
            href: '/students',
          },
          {
            heading: 'QR identitas murid dina kartu',
            body: 'Kartu murid bawaan ngandung QR identitas murid: hiji kode acak unik per murid (lain NIS) anu dijieun otomatis nalika data citak dimuat, jadi euweuh léngkah tambahan. Kode ngan nunjuk ka murid; ménu tempat QR dipindai anu nangtukeun tindakanana. Contona, dina ménu Absén datang & mulih (tab Pindai QR) mindai hartina nyatet datang atawa mulih salaku cadangan lamun kiosk RFID teu bisa dipaké, sedengkeun kiosk RFID tetep cara utama absén. Ménu séjén anu engké maké kartu anu sarua (upamana injeuman) cukup mindai QR anu sarua. Dina éditor, unsur Kode QR atawa Kode batang bisa milih kolom QR identitas murid; kolom ieu ngan aya pikeun kartu murid. Kode batang oge meunang eusina QR identitas, tapi panjang (peryogi lébar sahanteuna 55 mm); lamun kartu teu muat, QR waé cukup. NIS tetep bisa dicitak salaku téks atawa kode batang biasa, tapi pamindai ngan narima eusi QR identitas, lain NIS.',
            tip: 'Témplat heubeul anu dijieun saacan fitur ieu can boga QR identitas murid: buka éditor, tambahkeun unsur Kode QR, tuluy pilih kolom QR identitas murid. Panel Citak méré peringatan lamun témplat anu dipilih can boga.',
            warning:
              'Kaamanan: QR ngan ngaidentifikasi murid jeung teu muka data naon waé ku sorangan; unggal pamindai wajib lebet (login) tur boga idin fitur masing-masing, jadi jalma anu ngan nyekel kartu teu bisa nyatet absén tanpa akun guru. Kartu leungit: buka ménu Murid, pilih kartu murid éta, tuluy Jieun deui QR identitas. QR heubeul langsung teu kapaké di SAMPEURNA fitur sakaligus jeung kartu anyar kudu dicitak deui. Ulah babagi poto kartu.',
            href: '/cards',
          },
          {
            heading: 'Kode kartu RFID kudu didaptarkeun heula',
            body: 'Kartu siswa ngan bisa nyitak kode RFID upami kode kartu fisik siswa geus didaptarkeun dina ménu Kartu RFID. Kartu citak ieu rarancangna; anu dibaca ku pembaca gerbang tetep kode dina kartu fisik anu geus kadaptar.',
            warning:
              'Upami kode RFID can didaptarkeun, kolom Kode kartu RFID jeung kode QR atawa kode bar anu eusina kode éta bakal kosong dina kartu.',
            href: '/attendance/cards',
          },
        ],
        faq: [
          {
            q: 'Parobahan dina éditor leungit waktu abdi pindah kaca. Naha?',
            a: 'Parobahan ngan kasimpen sanggeus Anjeun klik Simpen. Upami aya anu can disimpen, aplikasi nanya heula saméméh Anjeun ninggalkeun éditor.',
          },
          {
            q: 'Naha gambar latar teu bisa diunggah?',
            a: 'Gambar kudu PNG atawa JPEG jeung pangbadagna 1,5 MB. Leutikan heula upami leuwih gedé.',
          },
          {
            q: 'Naha PDF teu bisa dijieun pikeun kertas lambar?',
            a: 'Kartu meureun leuwih gedé batan kertas sanggeus tepi dikurangan. Leutikan tepi kertas atawa jarak antar-kartu, atawa pilih kertas anu leuwih gedé.',
          },
          {
            q: 'Naha bisa boga sababaraha templat?',
            a: 'Bisa. Salah sahijina ditandaan Bawaan tur dipilih otomatis waktu nyitak. Paké Gandakeun pikeun nyieun varian tina templat anu geus aya.',
          },
        ],
      },
    },
  },
];
