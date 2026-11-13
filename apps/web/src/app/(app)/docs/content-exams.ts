import type { DocArticle } from '@/lib/docs-types';

/** Panduan identitas sekolah dan modul ujian: bank soal, ujian cetak, nilai, CBT, dan pindai OMR. Isi: id, en, su. */
export const EXAM_DOCS: DocArticle[] = [
  {
    slug: 'school-identity',
    icon: 'building',
    tone: 'teal',
    group: 'master',
    text: {
      id: {
        title: 'Identitas sekolah: logo, alamat, dan kontak resmi',
        summary:
          'Isi logo, alamat lengkap, telepon, fax, email, dan situs web sekolah satu kali, lalu dipakai di kop lembar ujian, surat, dan situs sekolah.',
        forWho: 'Admin sekolah dan Operator, biasanya sekali saat sekolah mulai memakai aplikasi.',
        sections: [
          {
            heading: 'Mengisi identitas sekolah',
            body: 'Kartu Identitas sekolah ada di bagian paling atas halaman Pengaturan sekolah. Isinya nama resmi untuk kop, alamat yang dipecah per bagian (jalan, kelurahan, kecamatan, kota, provinsi, kode pos), telepon, fax, email, dan situs web. Semua kolom boleh dikosongkan; yang kosong tidak tampil di kop. Di atasnya ada isian NPSN (Nomor Pokok Sekolah Nasional, 8 angka): sekolah yang mendaftar sudah punya NPSN, sedangkan sekolah lama bisa mengisinya sendiri. NPSN tidak boleh sama dengan sekolah lain di Edusync, dan penggantiannya tercatat di riwayat aktivitas.',
            steps: [
              'Buka menu Pengaturan sekolah.',
              'Di kartu Identitas sekolah, isi Nama resmi pada kop. Kosongkan bila ingin memakai nama unit apa adanya.',
              'Isi alamat, telepon, fax, email, dan situs web.',
              'Klik Simpan identitas.',
              'Bila ingin membatalkan isian yang belum disimpan, klik Batalkan.',
            ],
            href: '/school-settings',
            tip: 'Tulis alamat per bagian, bukan satu kalimat panjang. Aplikasi menyusunnya sendiri menjadi satu baris rapi di kop.',
          },
          {
            heading: 'Mengunggah dan mengganti logo',
            body: 'Logo tampil di kop lembar ujian dan di bagian atas situs sekolah. Gambar persegi atau mendatar dengan latar bersih paling rapi.',
            steps: [
              'Di kartu Identitas sekolah, klik Unggah logo.',
              'Pilih gambar PNG, JPEG, atau WebP berukuran paling besar 512 KB.',
              'Tunggu sampai pratinjau logo muncul dan muncul pesan bahwa logo tersimpan.',
              'Untuk mengganti, klik Ganti logo. Untuk membuang, klik Hapus logo.',
            ],
            warning:
              'Logo bisa dilihat siapa saja yang membuka situs sekolah, jadi jangan unggah gambar yang tidak boleh dilihat umum. Gambar berformat SVG tidak diterima.',
          },
          {
            heading: 'Memilih sumber kontak situs sekolah',
            body: 'Di halaman Situs sekolah, bagian Kontak dan lokasi punya dua pilihan. Ikuti pengaturan sekolah memakai alamat, telepon, email, fax, situs web, dan logo dari identitas sekolah. Isi sendiri memakai alamat, telepon, dan email khusus untuk situs; logo tetap dari identitas sekolah.',
            steps: [
              'Buka menu Situs sekolah, lalu cari bagian Kontak dan lokasi.',
              'Pilih Ikuti pengaturan sekolah atau Isi sendiri.',
              'Pada pilihan pertama, isian terkunci dan menampilkan data identitas. Klik Ubah di Pengaturan sekolah untuk mengubahnya.',
              'Klik Simpan perubahan.',
            ],
            href: '/site-settings',
            tip: 'Pilih Ikuti pengaturan sekolah supaya kop surat, lembar ujian, dan situs selalu sama. Pilih Isi sendiri hanya bila situs memang memakai nomor yang berbeda.',
          },
          {
            heading: 'Dipakai di mana saja',
            body: 'Identitas sekolah dipakai di kop lembar ujian cetak, di situs sekolah (logo di bagian atas serta alamat, telepon, fax, email, dan situs web di bagian Kontak), dan akan dipakai juga di dokumen lain yang memerlukan kop. Setelah identitas diubah, lembar ujian berikutnya yang dicetak langsung memakai data terbaru.',
          },
        ],
        faq: [
          {
            q: 'Fax dan situs web tidak tampil di situs sekolah. Kenapa?',
            a: 'Keduanya hanya tampil bila sumber kontak situs adalah Ikuti pengaturan sekolah dan kolomnya sudah diisi di identitas sekolah.',
          },
          {
            q: 'Logo tidak muncul di kop lembar ujian.',
            a: 'Periksa bahwa logo sudah diunggah dan di Lembar ujian cetak opsi Tampilkan logo menyala.',
          },
          {
            q: 'Apakah perubahan identitas mengubah lembar ujian yang sudah dicetak?',
            a: 'Tidak. Lembar yang sudah di kertas tidak berubah. Hanya lembar yang dicetak sesudahnya yang memakai data baru.',
          },
        ],
      },
      en: {
        title: 'School identity: logo, address, and official contacts',
        summary:
          'Enter the logo, full address, phone, fax, email, and website once, then use them on exam sheet letterheads, letters, and the school website.',
        forWho: 'School admins and Operators, usually once when the school starts using the app.',
        sections: [
          {
            heading: 'Filling in the school identity',
            body: 'The School identity card is at the very top of the School settings page. It holds the official name for the letterhead, the address split into parts (street, village, district, city, province, postal code), phone, fax, email, and website. Every field may be left empty; empty ones are not shown on the letterhead. Above them is the NPSN field (National School Principal Number, 8 digits): schools that register already have an NPSN, while older schools can fill it in themselves. The NPSN cannot match another school on Edusync, and changing it is recorded in the activity log.',
            steps: [
              'Open School settings.',
              'In the School identity card, fill in the Official name on letterhead. Leave it empty to use the unit name as is.',
              'Fill in the address, phone, fax, email, and website.',
              'Click Save identity.',
              'To drop edits you have not saved, click Discard.',
            ],
            href: '/school-settings',
            tip: 'Write the address in parts, not one long sentence. The app puts it together into one neat line on the letterhead.',
          },
          {
            heading: 'Uploading and replacing the logo',
            body: 'The logo appears on the exam sheet letterhead and at the top of the school website. A square or wide image on a clean background looks best.',
            steps: [
              'In the School identity card, click Upload logo.',
              'Pick a PNG, JPEG, or WebP image of at most 512 KB.',
              'Wait until the logo preview appears and a message says the logo is saved.',
              'To replace it, click Replace logo. To remove it, click Remove logo.',
            ],
            warning:
              'Anyone who opens the school website can see the logo, so do not upload an image that must not be public. SVG images are not accepted.',
          },
          {
            heading: 'Choosing the contact source of the school website',
            body: 'On the School website page, the Contact and location section has two choices. Follow school settings uses the address, phone, email, fax, website, and logo from the school identity. Fill in manually uses an address, phone, and email meant only for the website; the logo still comes from the school identity.',
            steps: [
              'Open School website, then find the Contact and location section.',
              'Choose Follow school settings or Fill in manually.',
              'With the first choice the fields are locked and show the identity data. Click Edit in School settings to change them.',
              'Click Save changes.',
            ],
            href: '/site-settings',
            tip: 'Choose Follow school settings so letterheads, exam sheets, and the website always match. Choose Fill in manually only when the website really uses different numbers.',
          },
          {
            heading: 'Where it is used',
            body: 'The school identity is used on printed exam sheet letterheads, on the school website (the logo at the top, and the address, phone, fax, email, and website in the Contact section), and it will be used on other documents that need a letterhead. After you change the identity, exam sheets printed from then on use the new data right away.',
          },
        ],
        faq: [
          {
            q: 'Fax and website do not show on the school website. Why?',
            a: 'They only show when the website contact source is Follow school settings and the fields are filled in the school identity.',
          },
          {
            q: 'The logo does not appear on the exam sheet letterhead.',
            a: 'Check that the logo is uploaded and that the Show logo option is on in Printed exam sheet.',
          },
          {
            q: 'Does changing the identity change exam sheets already printed?',
            a: 'No. Sheets already on paper stay as they are. Only sheets printed afterwards use the new data.',
          },
        ],
      },
      su: {
        title: 'Idéntitas sakola: logo, alamat, jeung kontak resmi',
        summary:
          'Eusian logo, alamat lengkep, telepon, fax, surélék, jeung situs wéb sakola sakali, tuluy dipaké dina kop lambaran ujian, surat, jeung situs sakola.',
        forWho: 'Admin sakola jeung Operator, biasana sakali waktu sakola mimiti maké aplikasi.',
        sections: [
          {
            heading: 'Ngeusian idéntitas sakola',
            body: 'Kartu Idéntitas sakola aya di luhur pisan kaca Pangaturan sakola. Eusina ngaran resmi pikeun kop, alamat anu dipasing per bagian (jalan, désa, kacamatan, kota, propinsi, kode pos), telepon, fax, surélék, jeung situs wéb. Sakabéh kolom meunang dikosongkeun; nu kosong teu muncul dina kop. Di luhurna aya eusian NPSN (Nomer Pokok Sakola Nasional, 8 angka): sakola nu ngadaptar geus boga NPSN, sedengkeun sakola lawas bisa ngeusian sorangan. NPSN teu meunang sarua jeung sakola séjén di Edusync, sarta ngarobahna dicatet dina riwayat kagiatan.',
            steps: [
              'Buka ménu Pangaturan sakola.',
              'Dina kartu Idéntitas sakola, eusian Ngaran resmi dina kop. Kosongkeun upami hoyong maké ngaran unit sakumaha aranjeunna.',
              'Eusian alamat, telepon, fax, surélék, jeung situs wéb.',
              'Klik Simpen idéntitas.',
              'Upami hoyong ngabatalkeun eusian nu can disimpen, klik Batalkeun.',
            ],
            href: '/school-settings',
            tip: 'Tulis alamat per bagian, lain hiji kalimah panjang. Aplikasi nyusunna sorangan jadi hiji baris rapih dina kop.',
          },
          {
            heading: 'Ngunggah jeung ngaganti logo',
            body: 'Logo muncul dina kop lambaran ujian jeung di luhur situs sakola. Gambar pasagi atawa manjang kalawan latar bersih pang rapina.',
            steps: [
              'Dina kartu Idéntitas sakola, klik Unggah logo.',
              'Pilih gambar PNG, JPEG, atawa WebP pangbadagna 512 KB.',
              'Antosan nepi ka pratayang logo muncul jeung aya béja yén logo disimpen.',
              'Pikeun ngaganti, klik Ganti logo. Pikeun miceun, klik Hapus logo.',
            ],
            warning:
              'Logo bisa katingali ku saha waé anu muka situs sakola, jadi ulah ngunggah gambar anu teu meunang katingali umum. Gambar format SVG teu ditarima.',
          },
          {
            heading: 'Milih sumber kontak situs sakola',
            body: 'Dina kaca Situs sakola, bagian Kontak jeung lokasi boga dua pilihan. Turutan pangaturan sakola maké alamat, telepon, surélék, fax, situs wéb, jeung logo tina idéntitas sakola. Eusian sorangan maké alamat, telepon, jeung surélék husus pikeun situs; logo tetep tina idéntitas sakola.',
            steps: [
              'Buka ménu Situs sakola, tuluy teangan bagian Kontak jeung lokasi.',
              'Pilih Turutan pangaturan sakola atawa Eusian sorangan.',
              'Dina pilihan kahiji, eusian dikonci jeung nuduhkeun data idéntitas. Klik Robah di Pangaturan sakola pikeun ngarobahna.',
              'Klik Simpen parobahan.',
            ],
            href: '/site-settings',
            tip: 'Pilih Turutan pangaturan sakola sangkan kop surat, lambaran ujian, jeung situs salawasna sarua. Pilih Eusian sorangan mung lamun situs bener-bener maké nomer anu béda.',
          },
          {
            heading: 'Dipaké di mana waé',
            body: 'Idéntitas sakola dipaké dina kop lambaran ujian citak, dina situs sakola (logo di luhur, jeung alamat, telepon, fax, surélék, situs wéb dina bagian Kontak), sarta bakal dipaké ogé dina dokumén sejen anu merlukeun kop. Sanggeus idéntitas dirobah, lambaran ujian anu dicitak satuluyna langsung maké data anyar.',
          },
        ],
        faq: [
          {
            q: 'Fax jeung situs wéb teu muncul di situs sakola. Naha?',
            a: 'Duanana ngan muncul lamun sumber kontak situs téh Turutan pangaturan sakola jeung kolomna geus dieusian dina idéntitas sakola.',
          },
          {
            q: 'Logo teu muncul dina kop lambaran ujian.',
            a: 'Pariksa yén logo geus diunggah jeung dina Lambaran ujian citak pilihan Témbongkeun logo hurung.',
          },
          {
            q: 'Naha parobahan idéntitas ngarobah lambaran ujian anu geus dicitak?',
            a: 'Henteu. Lambaran anu geus aya dina kertas teu robah. Ngan lambaran anu dicitak sanggeusna anu maké data anyar.',
          },
        ],
      },
    },
  },
  {
    slug: 'exam-bank',
    icon: 'file',
    tone: 'violet',
    group: 'academic',
    module: 'exams',
    text: {
      id: {
        title: 'Jenis ujian dan bank soal',
        summary:
          'Atur nama ujian seperti ASTS dan ASAS, lalu kumpulkan soal pilihan ganda dan esai per mata pelajaran, lengkap dengan rumus, gambar, dan impor dari Word atau Excel.',
        forWho: 'Guru mata pelajaran, Kurikulum, Operator, dan Admin sekolah.',
        sections: [
          {
            heading: 'Menyiapkan jenis ujian (ASTS, ASAS)',
            body: 'Jenis ujian adalah nama ujian yang dipakai sekolah, misalnya Asesmen Sekolah Tengah Semester (ASTS) dan Asesmen Sekolah Akhir Semester (ASAS). Nama ujian sering berganti mengikuti kebijakan, jadi nama ini bebas diubah kapan saja. Saat ujian dibuat, nama jenisnya disalin ke ujian itu, sehingga ujian lama tetap memakai nama saat dibuat.',
            steps: [
              'Buka Akademik, lalu Jenis ujian.',
              'Bila daftar masih kosong, klik Isi ASTS dan ASAS.',
              'Untuk menambah jenis lain (misalnya Ulangan Harian), klik Tambah jenis ujian, isi Nama lengkap dan Singkatan, lalu Simpan.',
              'Untuk mengganti nama, pilih menu di kartu jenis, klik Ubah, dan simpan.',
              'Jenis yang tidak dipakai lagi bisa dinonaktifkan atau dihapus lewat menu yang sama.',
            ],
            href: '/exams/types',
            tip: 'Bila kebijakan mengganti nama ASAS menjadi Sumatif Akhir Semester, cukup ubah namanya di sini. Ujian yang sudah dibuat tidak ikut berubah.',
          },
          {
            heading: 'Menulis soal pilihan ganda dan esai',
            body: 'Bank soal menyimpan soal per mata pelajaran dan bisa dipakai ulang di banyak ujian. Pilihan ganda punya dua sampai enam pilihan dan satu jawaban benar. Esai punya pedoman jawaban yang hanya dilihat guru saat menilai. Setiap soal punya poin.',
            steps: [
              'Buka Akademik, lalu Bank soal, dan klik Tambah soal.',
              'Pilih Mata pelajaran, Tingkat (boleh Semua tingkat), dan Poin.',
              'Pilih jenis soal: Pilihan ganda atau Esai.',
              'Tulis Teks soal.',
              'Untuk pilihan ganda, isi pilihan jawaban lalu tandai titik bulat pada jawaban yang benar. Klik Tambah pilihan bila perlu pilihan lebih banyak.',
              'Untuk esai, isi Pedoman jawaban. Pembahasan boleh diisi untuk kedua jenis.',
              'Klik Simpan. Gunakan saringan mata pelajaran, jenis soal, dan kolom Cari teks soal untuk menemukan soal di daftar.',
            ],
            href: '/exams/bank',
            tip: 'Bank soal bisa dipakai bersama. Soal yang sudah ada tidak perlu diketik ulang untuk ujian berikutnya; cukup dipilih.',
          },
          {
            heading: 'Menulis rumus dan menyisipkan gambar',
            body: 'Rumus ditulis di antara tanda dolar. Satu tanda dolar di awal dan akhir untuk rumus di dalam kalimat, dua tanda dolar untuk rumus di baris sendiri. Contoh: Hasil dari $2 + 3 \\times 4$ adalah ... akan tampil sebagai rumus. Contoh rumus di baris sendiri: $$\\frac{a}{b} = \\sqrt{x^2 + 1}$$. Contoh pangkat: $x^2$. Pratinjau di bawah kolom soal menunjukkan hasilnya.',
            steps: [
              'Klik tombol Rumus di atas kolom Teks soal untuk menyisipkan contoh rumus, lalu ganti isinya.',
              'Klik tombol Gambar, pilih berkas gambar PNG, JPEG, atau WebP berukuran paling besar 1 MB.',
              'Gambar langsung disisipkan di tempat kursor berada.',
              'Periksa Pratinjau, lalu Simpan soal.',
            ],
            warning:
              'Untuk menampilkan tanda dolar biasa (misalnya harga), tulis garis miring terbalik sebelum tandanya. Gambar soal bisa dibuka oleh siapa saja yang tahu alamatnya, tetapi alamat itu tidak bisa ditebak dan hanya muncul di soal.',
          },
          {
            heading: 'Impor soal dari Word atau Excel',
            body: 'Daripada mengetik satu per satu, soal bisa dimasukkan sekaligus dari berkas Excel atau Word lewat tombol Impor soal di halaman Bank soal. Sebelum disimpan, aplikasi menampilkan pratinjau semua soal yang terbaca, lengkap dengan tanda bila ada yang bermasalah. Soal yang sama persis dengan soal yang sudah ada di mata pelajaran itu dilewati, sehingga mengimpor berkas yang sama dua kali tidak menggandakan soal.',
            steps: [
              'Di halaman Bank soal, klik Impor soal.',
              'Pilih Mata pelajaran dan Tingkat untuk seluruh soal dalam berkas.',
              'Untuk Excel, unduh templatenya lebih dulu. Kolomnya Tipe (PG atau Esai), Soal, A sampai F untuk pilihan, Kunci (huruf jawaban benar untuk PG, atau pedoman untuk esai), Poin, dan Pembahasan. Satu baris satu soal.',
              'Untuk Word, tulis tiap soal dengan nomor, lalu pilihan pada baris sendiri (A. sampai F.), lalu baris Kunci: B untuk pilihan ganda. Soal tanpa pilihan dianggap esai. Pisahkan antar soal dengan baris kosong.',
              'Unggah berkasnya, lalu periksa pratinjau. Baris bertanda merah tidak akan diimpor; perbaiki berkas lalu unggah ulang bila perlu.',
              'Klik Impor untuk menyimpan semua soal yang valid.',
            ],
            href: '/exams/bank',
            tip: 'Mulailah dari template Excel. Isi beberapa baris dulu untuk mencoba sebelum memasukkan seluruh soal.',
            warning:
              'Gambar dan rumus yang ada di dalam berkas Word tidak ikut terimpor. Tambahkan gambar lewat tombol Gambar setelah impor, dan tulis rumus dengan tanda dolar.',
          },
          {
            heading: 'Siapa yang boleh mengelola soal',
            body: 'Guru hanya bisa melihat dan menulis soal untuk mata pelajaran yang ia ampu. Kurikulum, Operator, dan Admin sekolah bisa mengelola semua mata pelajaran. Kepala sekolah hanya bisa melihat. Bank soal dan seluruh fitur ujian adalah satu modul bernama Ujian dan bank soal.',
          },
        ],
        faq: [
          {
            q: 'Mata pelajaran saya tidak muncul di Bank soal.',
            a: 'Guru hanya melihat mata pelajaran yang diampu. Minta Admin sekolah memeriksa pengampu mata pelajaran di jadwal atau pengaturan kelas.',
          },
          {
            q: 'Soal yang saya ubah di bank tidak berubah di ujian yang sudah dibuat. Kenapa?',
            a: 'Soal disalin ke ujian saat dipilih. Itu disengaja supaya ujian yang sudah disusun atau dicetak tidak berubah diam-diam. Hapus soal lama dari ujian lalu tambahkan lagi versi barunya.',
          },
          {
            q: 'Rumus saya tampil sebagai teks biasa.',
            a: 'Pastikan rumus ada di antara tanda dolar, satu di awal dan satu di akhir. Lihat Pratinjau di bawah kolom soal untuk memeriksa.',
          },
          {
            q: 'Berapa banyak soal yang bisa diimpor sekaligus?',
            a: 'Pratinjau menampilkan semua soal sebelum disimpan. Untuk berkas yang sangat besar, bagi menjadi beberapa berkas supaya mudah diperiksa.',
          },
        ],
      },
      en: {
        title: 'Exam types and the question bank',
        summary:
          'Set exam names such as ASTS and ASAS, then gather multiple choice and essay questions per subject, with formulas, images, and import from Word or Excel.',
        forWho: 'Subject teachers, the Curriculum team, Operators, and School admins.',
        sections: [
          {
            heading: 'Setting up exam types (ASTS, ASAS)',
            body: 'An exam type is the name of the exams your school gives, for example Mid-semester School Assessment (ASTS) and End-of-semester School Assessment (ASAS). Exam names often change with policy, so the name can be changed at any time. When an exam is created, the type name is copied into that exam, so older exams keep the name they were created with.',
            steps: [
              'Open Academic, then Exam types.',
              'If the list is empty, click Add ASTS and ASAS.',
              'To add another type (for example Daily test), click Add exam type, fill in the Full name and Short name, then Save.',
              'To rename one, open the menu on its card, click Edit, and save.',
              'A type you no longer use can be switched off or deleted from the same menu.',
            ],
            href: '/exams/types',
            tip: 'If policy renames ASAS to Summative End of Semester, just change the name here. Exams already created do not change.',
          },
          {
            heading: 'Writing multiple choice and essay questions',
            body: 'The question bank keeps questions per subject and they can be reused in many exams. Multiple choice has two to six options and one correct answer. An essay has an answer guide that only teachers see while grading. Every question has points.',
            steps: [
              'Open Academic, then Question bank, and click Add question.',
              'Pick the Subject, the Grade level (All levels is fine), and the Points.',
              'Pick the question type: Multiple choice or Essay.',
              'Write the Question text.',
              'For multiple choice, fill in the answer options and mark the radio button of the correct one. Click Add option if you need more.',
              'For an essay, fill in the Answer guide. An explanation can be added to both types.',
              'Click Save. Use the subject and type filters and the Search question text box to find questions in the list.',
            ],
            href: '/exams/bank',
            tip: 'The bank is shared. You do not need to retype existing questions for the next exam; just pick them.',
          },
          {
            heading: 'Writing formulas and inserting images',
            body: 'Formulas are written between dollar signs. One dollar sign at the start and one at the end for a formula inside a sentence, two for a formula on its own line. Example: The result of $2 + 3 \\times 4$ is ... shows as a formula. Example on its own line: $$\\frac{a}{b} = \\sqrt{x^2 + 1}$$. Example of a power: $x^2$. The preview under the question box shows the result.',
            steps: [
              'Click the Formula button above the Question text box to insert a sample formula, then replace its content.',
              'Click the Image button and pick a PNG, JPEG, or WebP file of at most 1 MB.',
              'The image is inserted right where the cursor is.',
              'Check the Preview, then Save the question.',
            ],
            warning:
              'To show an ordinary dollar sign (for example a price), write a backslash before it. A question image can be opened by anyone who knows its address, but the address cannot be guessed and only appears inside the question.',
          },
          {
            heading: 'Importing questions from Word or Excel',
            body: 'Instead of typing them one by one, questions can be added all at once from an Excel or Word file with the Import questions button on the Question bank page. Before anything is saved, the app shows a preview of every question it read, with a mark on any that has a problem. A question identical to one already in that subject is skipped, so importing the same file twice does not duplicate questions.',
            steps: [
              'On the Question bank page, click Import questions.',
              'Pick the Subject and Grade level for all the questions in the file.',
              'For Excel, download the template first. Its columns are Type (MC or Essay), Question, A to F for the options, Answer (the correct letter for multiple choice, or the guide for an essay), Points, and Explanation. One row is one question.',
              'For Word, write each question with a number, then the options on their own lines (A. to F.), then a line Answer: B for multiple choice. A question without options is treated as an essay. Separate questions with a blank line.',
              'Upload the file, then check the preview. Rows marked red are not imported; fix the file and upload again if needed.',
              'Click Import to save all the valid questions.',
            ],
            href: '/exams/bank',
            tip: 'Start from the Excel template. Fill in a few rows first to try it before entering all your questions.',
            warning:
              'Images and formulas inside a Word file are not imported. Add images with the Image button after the import, and write formulas with dollar signs.',
          },
          {
            heading: 'Who can manage questions',
            body: 'Teachers can only see and write questions for the subjects they teach. The Curriculum team, Operators, and School admins can manage every subject. The Principal can only view. The question bank and all exam features are one module named Exams and question bank.',
          },
        ],
        faq: [
          {
            q: 'My subject does not appear in the Question bank.',
            a: 'Teachers only see the subjects they teach. Ask a School admin to check the subject teacher in the timetable or class settings.',
          },
          {
            q: 'A question I changed in the bank did not change in an exam already created. Why?',
            a: 'Questions are copied into the exam when picked. This is on purpose so an exam that is already set up or printed does not change silently. Remove the old question from the exam and add the new version.',
          },
          {
            q: 'My formula shows as plain text.',
            a: 'Make sure the formula is between dollar signs, one at the start and one at the end. Check the Preview under the question box.',
          },
          {
            q: 'How many questions can be imported at once?',
            a: 'The preview shows every question before saving. For a very large file, split it into several files so it is easier to check.',
          },
        ],
      },
      su: {
        title: 'Jenis ujian jeung bank soal',
        summary:
          'Atur ngaran ujian saperti ASTS jeung ASAS, tuluy kumpulkeun soal pilihan ganda jeung éséy per mata pelajaran, lengkep jeung rumus, gambar, sarta impor tina Word atawa Excel.',
        forWho: 'Guru mata pelajaran, Kurikulum, Operator, jeung Admin sakola.',
        sections: [
          {
            heading: 'Nyiapkeun jenis ujian (ASTS, ASAS)',
            body: 'Jenis ujian téh ngaran ujian anu dipaké sakola, upamana Asesmén Sakola Tengah Semester (ASTS) jeung Asesmén Sakola Ahir Semester (ASAS). Ngaran ujian sering robah nuturkeun kawijakan, jadi ngaran ieu bébas dirobah iraha waé. Waktu ujian dijieun, ngaran jenisna disalin kana ujian éta, jadi ujian heubeul tetep maké ngaran basa dijieun.',
            steps: [
              'Buka Akademik, tuluy Jenis ujian.',
              'Upami daptar masih kosong, klik Eusian ASTS jeung ASAS.',
              'Pikeun nambahan jenis séjén (upamana Ulangan Poéan), klik Tambah jenis ujian, eusian Ngaran lengkep jeung Singgetan, tuluy Simpen.',
              'Pikeun ngaganti ngaran, buka ménu dina kartu jenis, klik Robah, tuluy simpen.',
              'Jenis anu teu dipaké deui bisa dipareuman atawa dihapus tina ménu anu sarua.',
            ],
            href: '/exams/types',
            tip: 'Upami kawijakan ngaganti ngaran ASAS jadi Sumatif Ahir Semester, cukup robah ngaranna di dieu. Ujian anu geus dijieun teu milu robah.',
          },
          {
            heading: 'Nulis soal pilihan ganda jeung éséy',
            body: 'Bank soal nyimpen soal per mata pelajaran jeung bisa dipaké deui dina loba ujian. Pilihan ganda boga dua nepi ka genep pilihan jeung hiji jawaban bener. Éséy boga pedoman jawaban anu ngan katingali ku guru nalika nilai. Unggal soal boga poin.',
            steps: [
              'Buka Akademik, tuluy Bank soal, tuluy klik Tambah soal.',
              'Pilih Mata pelajaran, Tingkat (meunang Sadaya tingkat), jeung Poin.',
              'Pilih jenis soal: Pilihan ganda atawa Éséy.',
              'Tulis Téks soal.',
              'Pikeun pilihan ganda, eusian pilihan jawaban tuluy tandaan titik buleud dina jawaban anu bener. Klik Tambah pilihan upami peryogi leuwih loba pilihan.',
              'Pikeun éséy, eusian Pedoman jawaban. Pedaran meunang dieusian pikeun dua jenis.',
              'Klik Simpen. Paké panyaring mata pelajaran, jenis soal, jeung kolom Teangan téks soal pikeun manggihan soal dina daptar.',
            ],
            href: '/exams/bank',
            tip: 'Bank soal bisa dipaké babarengan. Soal anu geus aya teu kudu diketik deui pikeun ujian satuluyna; cukup dipilih.',
          },
          {
            heading: 'Nulis rumus jeung nyelapkeun gambar',
            body: 'Rumus ditulis di antara tanda dolar. Hiji tanda dolar di awal jeung ahir pikeun rumus dina jero kalimah, dua tanda dolar pikeun rumus dina baris sorangan. Conto: Hasil tina $2 + 3 \\times 4$ nyaéta ... bakal muncul salaku rumus. Conto rumus dina baris sorangan: $$\\frac{a}{b} = \\sqrt{x^2 + 1}$$. Conto pangkat: $x^2$. Pratayang di handap kolom soal nuduhkeun hasilna.',
            steps: [
              'Klik tombol Rumus di luhur kolom Téks soal pikeun nyelapkeun conto rumus, tuluy ganti eusina.',
              'Klik tombol Gambar, pilih berkas gambar PNG, JPEG, atawa WebP pangbadagna 1 MB.',
              'Gambar langsung diselapkeun di tempat kursor.',
              'Pariksa Pratayang, tuluy Simpen soal.',
            ],
            warning:
              'Pikeun nembongkeun tanda dolar biasa (upamana harga), tulis garis miring tibalik saméméh tandana. Gambar soal bisa dibuka ku saha waé anu apal alamatna, tapi alamat éta teu bisa ditebak jeung ngan muncul dina soal.',
          },
          {
            heading: 'Impor soal tina Word atawa Excel',
            body: 'Tinimbang ngetik hiji-hiji, soal bisa diasupkeun sakaligus tina berkas Excel atawa Word maké tombol Impor soal di kaca Bank soal. Saméméh disimpen, aplikasi nembongkeun pratayang sakabéh soal anu kabaca, lengkep jeung tanda upami aya anu bermasalah. Soal anu persis sarua jeung soal anu geus aya dina mata pelajaran éta dilewatan, jadi ngimpor berkas anu sarua dua kali teu ngagandakeun soal.',
            steps: [
              'Di kaca Bank soal, klik Impor soal.',
              'Pilih Mata pelajaran jeung Tingkat pikeun sakabéh soal dina berkas.',
              'Pikeun Excel, unduh témplaténa heula. Kolomna Tipe (PG atawa Éséy), Soal, A nepi ka F pikeun pilihan, Kunci (hurup jawaban bener pikeun PG, atawa pedoman pikeun éséy), Poin, jeung Pedaran. Hiji baris hiji soal.',
              'Pikeun Word, tulis unggal soal kalawan nomer, tuluy pilihan dina baris sorangan (A. nepi ka F.), tuluy baris Kunci: B pikeun pilihan ganda. Soal tanpa pilihan dianggap éséy. Pisahkeun antar soal ku baris kosong.',
              'Unggah berkasna, tuluy pariksa pratayang. Baris tanda beureum teu diimpor; pecakkeun berkas tuluy unggah deui upami peryogi.',
              'Klik Impor pikeun nyimpen sakabéh soal anu valid.',
            ],
            href: '/exams/bank',
            tip: 'Mimitian tina témplat Excel. Eusian sababaraha baris heula pikeun nyobaan saméméh ngasupkeun sakabéh soal.',
            warning:
              'Gambar jeung rumus anu aya dina berkas Word teu milu diimpor. Tambahkeun gambar maké tombol Gambar sanggeus impor, jeung tulis rumus maké tanda dolar.',
          },
          {
            heading: 'Saha anu meunang ngatur soal',
            body: 'Guru ngan bisa ningali jeung nulis soal pikeun mata pelajaran anu diampuna. Kurikulum, Operator, jeung Admin sakola bisa ngatur sakabéh mata pelajaran. Kepala sakola ngan bisa ningali. Bank soal jeung sakabéh fitur ujian téh hiji modul ngaranna Ujian jeung bank soal.',
          },
        ],
        faq: [
          {
            q: 'Mata pelajaran kuring teu muncul di Bank soal.',
            a: 'Guru ngan ningali mata pelajaran anu diampu. Pénta Admin sakola mariksa pangampu mata pelajaran dina jadwal atawa pangaturan kelas.',
          },
          {
            q: 'Soal anu dirobah di bank teu robah dina ujian anu geus dijieun. Naha?',
            a: 'Soal disalin kana ujian waktu dipilih. Éta dihaja sangkan ujian anu geus disusun atawa dicitak teu robah sacara jempé. Hapus soal heubeul tina ujian tuluy tambahkeun versi anyarna.',
          },
          {
            q: 'Rumus kuring muncul salaku téks biasa.',
            a: 'Pastikeun rumus aya di antara tanda dolar, hiji di awal jeung hiji di ahir. Tingali Pratayang di handap kolom soal pikeun mariksa.',
          },
          {
            q: 'Sabaraha soal anu bisa diimpor sakaligus?',
            a: 'Pratayang nembongkeun sakabéh soal saméméh disimpen. Pikeun berkas anu gedé pisan, bagi jadi sababaraha berkas sangkan gampang diparios.',
          },
        ],
      },
    },
  },
  {
    slug: 'exams',
    icon: 'clipboard',
    tone: 'amber',
    group: 'academic',
    module: 'exams',
    text: {
      id: {
        title: 'Ujian: menyusun, mencetak, menilai, dan ujian di layar',
        summary:
          'Panduan membuat ujian dari bank soal, mengatur lembar cetak, mengisi nilai, mengirim nilai ke buku nilai, dan menjalankan ujian di layar siswa (CBT).',
        forWho: 'Guru mata pelajaran, Kurikulum, Operator, dan Admin sekolah. Kepala sekolah bisa melihat.',
        sections: [
          {
            heading: 'Membuat ujian',
            body: 'Satu ujian untuk satu mata pelajaran dan satu atau beberapa kelas. Cara pelaksanaan bisa Cetak (lembar kertas yang dinilai guru), CBT (dikerjakan di layar siswa), atau CBT dan cetak sekaligus.',
            steps: [
              'Buka Akademik, lalu Ujian, dan klik Buat ujian.',
              'Pilih Jenis ujian, Mata pelajaran, dan Semester. Tulis Judul ujian.',
              'Centang Kelas peserta. Kelas yang tampil mengikuti tahun ajaran semester yang dipilih.',
              'Pilih Cara pelaksanaan: Cetak, CBT, atau CBT dan cetak.',
              'Isi Tanggal ujian, Jam mulai, dan Durasi (menit).',
              'Untuk CBT, centang Acak urutan soal dan Acak urutan pilihan jawaban bila diperlukan. Urutan acak berbeda untuk tiap siswa tetapi tetap sama bila siswa membuka ulang halaman.',
              'Pilih Status: Draf atau Siap, lalu klik Simpan.',
            ],
            href: '/exams',
            tip: 'Biarkan status Draf selama soal masih disusun. Ujian CBT baru terlihat oleh siswa setelah statusnya Siap.',
          },
          {
            heading: 'Memilih dan mengatur soal ujian',
            body: 'Klik kartu ujian untuk membuka halaman susun. Soal dipilih dari bank soal mata pelajaran yang sama dan disalin ke ujian, sehingga mengubah soal di bank tidak mengubah ujian yang sudah disusun.',
            steps: [
              'Klik Tambah dari bank soal.',
              'Centang soal yang diinginkan. Soal yang sudah ada di ujian ditandai dan tidak bisa dipilih lagi.',
              'Klik tombol Tambahkan di bawah daftar.',
              'Ubah urutan dengan tombol panah naik dan turun pada tiap soal.',
              'Ubah Poin langsung di kartu soal bila bobotnya berbeda dari bank.',
              'Untuk mengeluarkan soal dari ujian, klik ikon hapus. Soal di bank tidak ikut terhapus.',
            ],
            warning:
              'Mengganti mata pelajaran lewat Ubah ujian membuang semua soal yang sudah dipilih, karena soal milik mata pelajaran lain.',
          },
          {
            heading: 'Mengatur lembar ujian cetak',
            body: 'Lembar cetak punya kop, judul, keterangan di bawah kop, petunjuk umum, dan blok nama siswa. Semuanya diatur sekali untuk sekolah, dan boleh disesuaikan untuk satu ujian saja. Teks judul dan keterangan boleh memuat penampung dalam kurung kurawal yang terisi otomatis dari data ujian: {examName} (nama jenis ujian), {examShort} (singkatan), {semester}, {academicYear} (tahun ajaran), {subject} (mata pelajaran), {class} (kelas), {day} (hari), {date} (tanggal), {dayDate} (hari dan tanggal), {time} (rentang jam), {duration} (durasi), {teacher} (guru), dan {school} (nama sekolah).',
            steps: [
              'Buka Akademik, lalu Lembar ujian cetak (di bagian pengaturan).',
              'Atur ukuran kertas (A4, F4, atau Letter), margin, dan ukuran huruf.',
              'Pada Kop, pilih Identitas sekolah atau Tulis sendiri. Tambahkan baris di atas nama sekolah (misalnya nama yayasan) bila perlu, dan pilih bagian kontak yang ditampilkan.',
              'Atur Judul ujian dan baris Keterangan di bawah kop (mata pelajaran, kelas, hari dan tanggal, waktu, atau baris lain).',
              'Tulis Petunjuk umum dan pilih isian Identitas siswa.',
              'Lihat Pratinjau lembar di sebelahnya, lalu klik Simpan. Klik Kembalikan ke bawaan untuk membuang semua pengaturan.',
            ],
            href: '/exams/paper',
            tip: 'Untuk satu ujian yang butuh kop atau petunjuk berbeda, buka ujian itu lalu klik Lembar ujian, pilih khusus ujian ini, dan simpan. Ujian lain tetap memakai pengaturan sekolah.',
          },
          {
            heading: 'Mencetak lembar soal, jawaban, dan kunci',
            body: 'Halaman cetak punya tiga tampilan: Lembar soal, Lembar jawaban, dan Kunci jawaban. Soal pilihan ganda dikelompokkan di bagian A dan esai di bagian B, dengan nomor berlanjut dan ringkasan jumlah skor di akhir.',
            steps: [
              'Buka ujian, lalu klik Cetak.',
              'Pilih tampilan yang akan dicetak.',
              'Klik Cetak / simpan PDF.',
              'Di jendela cetak peramban, pilih ukuran kertas sama dengan pengaturan lembar, skala 100 persen, dan matikan header serta footer peramban.',
              'Pilih printer, atau pilih Simpan sebagai PDF untuk dikirim atau dicetak di tempat lain.',
            ],
            warning:
              'Bila header dan footer peramban tidak dimatikan, tulisan tambahan itu ikut tercetak dan bisa menggeser isi lembar.',
          },
          {
            heading: 'Mengisi nilai dari lembar kertas',
            body: 'Setelah siswa mengerjakan di kertas, guru mengisi hasilnya di halaman Input nilai. Tabelnya berisi satu baris per siswa dan satu kolom per soal. Pilihan ganda dinilai otomatis dari huruf jawaban; esai diberi skor oleh guru. Siswa yang sudah lulus tetap tampil pada ujian tahun lampau, tetapi hanya untuk dilihat dan tidak dapat diubah.',
            steps: [
              'Buka ujian, lalu klik Input nilai.',
              'Pada soal pilihan ganda, ketik satu huruf jawaban siswa. Kotak hijau berarti benar dan merah berarti salah.',
              'Pada soal esai, ketik skor antara 0 dan poin soal. Setengah poin (misalnya 7,5) boleh.',
              'Centang Tidak hadir untuk siswa yang tidak ikut ujian. Isian siswa itu dikosongkan.',
              'Gunakan Enter dan tombol panah untuk berpindah sel dengan cepat. Jumlah dan persentase tiap siswa dihitung langsung.',
              'Perhatikan ringkasan di atas tabel (sudah diisi, tidak hadir, rata-rata, terendah, tertinggi).',
              'Klik Simpan. Hanya baris yang berubah yang dikirim.',
            ],
            href: '/exams',
            tip: 'Siswa dengan tanda esai belum dinilai masih punya esai tanpa skor. Lengkapi dulu sebelum mengirim ke buku nilai.',
          },
          {
            heading: 'Mengirim nilai ke buku nilai',
            body: 'Nilai ujian dikirim ke menu Penilaian sebagai satu penilaian untuk tiap kelas peserta. Nilainya berskala 100, yaitu jumlah skor dibagi total poin lalu dikali 100, dengan dua angka di belakang koma. Siswa yang tidak hadir diberi nilai kosong. Siswa yang tidak punya data tidak diubah.',
            steps: [
              'Simpan dulu semua perubahan di halaman Input nilai.',
              'Klik Kirim ke buku nilai.',
              'Pilih Komponen nilai (misalnya UTS atau UAS) dan, bila perlu, ganti tanggal penilaian. Bila dikosongkan, tanggal ujian yang dipakai.',
              'Bila masih ada siswa dengan esai belum dinilai, aplikasi memberi peringatan dan menolak mengirim sampai Anda menegaskan bahwa esai yang belum dinilai dihitung 0.',
              'Klik Kirim. Cek hasilnya di menu Penilaian.',
            ],
            tip: 'Bila Anda memilih komponen berkategori Formatif, hasil ujian menjadi umpan balik belajar: tampil di rekap tetapi tidak masuk nilai rapor. Anda juga bisa mencatat teknik penilaiannya.',
            warning:
              'Mengirim ulang memperbarui penilaian yang sama dan menimpa nilai lama dengan nilai terbaru, tidak membuat penilaian ganda. Esai yang belum dinilai dan Anda tegaskan tetap dikirim dihitung 0, jadi nilai itu bisa lebih rendah dari seharusnya sampai Anda mengirim ulang.',
          },
          {
            heading: 'Ujian di layar (CBT)',
            body: 'Pada ujian CBT, siswa mengerjakan di layar lewat akun siswanya. Pilihan ganda dinilai otomatis, dan esai tampil di Input nilai untuk dinilai guru. Siswa tidak pernah menerima kunci jawaban.',
            steps: [
              'Pastikan ujian berstatus Siap, bercara pelaksanaan CBT atau CBT dan cetak, dan sudah punya tanggal, jam mulai, dan durasi.',
              'Siswa masuk dengan akunnya, lalu buka Portal siswa, Ujian, dan klik Mulai ujian saat statusnya Dibuka. Akun wali tidak melihat ujian.',
              'Penghitung waktu dijalankan server, jadi mengubah jam perangkat tidak menambah waktu. Batas akhir adalah yang lebih awal antara jam mulai siswa ditambah durasi dan akhir jendela ujian.',
              'Jawaban tersimpan otomatis. Bila halaman dimuat ulang, siswa melanjutkan dari jawaban terakhir tanpa mengulang waktu.',
              'Siswa menekan Kumpulkan, atau ujian terkumpul otomatis saat waktu habis. Setelah itu jawaban tidak bisa diubah.',
              'Guru memantau di Input nilai: tiap siswa tampil Mengerjakan atau Dikumpulkan, dan Keluar tab bila siswa berpindah tab.',
              'Untuk membaca jawaban esai, klik ikon pada sel esai, baca jawabannya, lalu isi skor dan simpan.',
            ],
            href: '/exams',
            tip: 'Catatan Keluar tab hanya informasi. Gunakan bersama pengawasan di ruang ujian, bukan sebagai bukti tunggal.',
            warning:
              'Bila guru sudah mengisi jawaban dari lembar kertas untuk seorang siswa, jawaban itu dikosongkan saat siswa mulai mengerjakan di layar, supaya hasil CBT yang dihitung.',
          },
          {
            heading: 'Modul dan hak akses',
            body: 'Fitur ini adalah modul Ujian dan bank soal dan membutuhkan modul Nilai dan rapor. Melihat ujian, menulis soal dan menyusun ujian, serta mengatur jenis ujian dan lembar cetak punya hak akses masing-masing. Guru bisa melihat dan menyusun ujian untuk mata pelajaran yang ia ampu. Kurikulum, Operator, dan Admin sekolah mengelola semua ujian, jenis ujian, dan lembar cetak. Kepala sekolah hanya melihat.',
          },
        ],
        faq: [
          {
            q: 'Ujian CBT tidak muncul di layar siswa. Apa yang dicek?',
            a: 'Pastikan statusnya Siap, cara pelaksanaannya CBT atau CBT dan cetak, kelas siswa termasuk kelas peserta, dan tanggal, jam mulai, serta durasi sudah diisi. Siswa harus masuk dengan akun siswa, bukan akun wali.',
          },
          {
            q: 'Siswa terlambat mulai. Apakah waktunya tetap penuh?',
            a: 'Tidak selalu. Waktu siswa berakhir paling lambat pada akhir jendela ujian (jam mulai ditambah durasi). Siswa yang mulai terlambat mendapat waktu lebih pendek.',
          },
          {
            q: 'Siswa tidak hadir saat ujian dan ingin mengerjakan di waktu lain.',
            a: 'Ubah tanggal, jam mulai, atau durasi ujian agar jendelanya terbuka lagi, atau buat ujian susulan untuk siswa itu.',
          },
          {
            q: 'Nilai di buku nilai berbeda dari yang saya lihat di Input nilai.',
            a: 'Nilai di buku nilai berskala 100. Cek juga apakah ada esai yang belum dinilai, atau kirim ulang setelah mengubah skor.',
          },
          {
            q: 'Apakah soal yang dicetak sama dengan yang dikerjakan di layar?',
            a: 'Ya, keduanya berasal dari salinan soal di ujian itu. Perbedaannya hanya urutan, bila Anda mengaktifkan acak untuk CBT.',
          },
        ],
      },
      en: {
        title: 'Exams: setting up, printing, grading, and on-screen exams',
        summary:
          'A guide to creating an exam from the question bank, setting the printed sheet, entering scores, sending scores to the gradebook, and running on-screen exams for students (CBT).',
        forWho:
          'Subject teachers, the Curriculum team, Operators, and School admins. The Principal can view.',
        sections: [
          {
            heading: 'Creating an exam',
            body: 'One exam is for one subject and one or more classes. The way it is given can be Print (a paper sheet graded by the teacher), CBT (taken on the student screen), or CBT and print together.',
            steps: [
              'Open Academic, then Exams, and click Create exam.',
              'Pick the Exam type, Subject, and Semester. Write the Exam title.',
              'Tick the participating Classes. The classes shown follow the academic year of the chosen semester.',
              'Pick the Delivery: Print, CBT, or CBT and print.',
              'Fill in the Exam date, Start time, and Duration (minutes).',
              'For CBT, tick Shuffle question order and Shuffle answer option order if needed. The shuffled order differs per student but stays the same when the student reopens the page.',
              'Pick the Status: Draft or Ready, then click Save.',
            ],
            href: '/exams',
            tip: 'Keep the status Draft while questions are still being prepared. A CBT exam only becomes visible to students once its status is Ready.',
          },
          {
            heading: 'Choosing and arranging exam questions',
            body: 'Click an exam card to open the arrange page. Questions are picked from the question bank of the same subject and copied into the exam, so changing a question in the bank does not change an exam that is already set up.',
            steps: [
              'Click Add from question bank.',
              'Tick the questions you want. Questions already in the exam are marked and cannot be picked again.',
              'Click the Add button under the list.',
              'Change the order with the up and down arrow buttons on each question.',
              'Change the Points right on the question card if the weight differs from the bank.',
              'To take a question out of the exam, click the delete icon. The question stays in the bank.',
            ],
            warning:
              'Changing the subject through Edit exam drops every question already picked, because they belong to another subject.',
          },
          {
            heading: 'Setting the printed exam sheet',
            body: 'The printed sheet has a letterhead, a title, an information block under the letterhead, general instructions, and a student name block. All of it is set once for the school and may be adjusted for one exam only. The title and information texts may contain placeholders in curly braces that are filled automatically from the exam data: {examName} (exam type name), {examShort} (short name), {semester}, {academicYear}, {subject}, {class}, {day}, {date}, {dayDate} (day and date), {time} (time range), {duration}, {teacher}, and {school} (school name).',
            steps: [
              'Open Academic, then Printed exam sheet (in the settings part).',
              'Set the paper size (A4, F4, or Letter), margin, and font size.',
              'Under Letterhead, pick School identity or Write my own. Add lines above the school name (for example the foundation name) if needed, and choose which contact parts to show.',
              'Set the Exam title and the Information rows under the letterhead (subject, class, day and date, time, or other rows).',
              'Write the General instructions and pick the Student identity fields.',
              'Look at the Sheet preview beside it, then click Save. Click Reset to default to drop all settings.',
            ],
            href: '/exams/paper',
            tip: 'For one exam that needs a different letterhead or instructions, open that exam, click Exam sheet, choose specific to this exam, and save. Other exams keep the school settings.',
          },
          {
            heading: 'Printing the question sheet, answer sheet, and key',
            body: 'The print page has three views: Question sheet, Answer sheet, and Answer key. Multiple choice questions are grouped in part A and essays in part B, with continuing numbers and a total score summary at the end.',
            steps: [
              'Open the exam, then click Print.',
              'Pick the view to print.',
              'Click Print / save PDF.',
              'In the browser print window, pick the same paper size as the sheet settings, scale 100 percent, and turn off the browser headers and footers.',
              'Pick a printer, or pick Save as PDF to send it or print it elsewhere.',
            ],
            warning:
              'If the browser headers and footers are not turned off, that extra text is printed too and can shift the content of the sheet.',
          },
          {
            heading: 'Entering scores from paper sheets',
            body: 'After students have taken the exam on paper, the teacher enters the results on the Enter scores page. The table has one row per student and one column per question. Multiple choice is graded automatically from the answer letter; essays are scored by the teacher. Students who have graduated still appear on exams from past years, but only for viewing and cannot be changed.',
            steps: [
              'Open the exam, then click Enter scores.',
              'For a multiple choice question, type the one letter the student answered. A green box means correct and red means wrong.',
              'For an essay question, type a score between 0 and the question points. Half points (for example 7.5) are allowed.',
              'Tick Absent for a student who did not take the exam. That student entries are cleared.',
              'Use Enter and the arrow keys to move between cells quickly. Each student total and percentage are worked out right away.',
              'Look at the summary above the table (entered, absent, average, lowest, highest).',
              'Click Save. Only the rows that changed are sent.',
            ],
            href: '/exams',
            tip: 'A student with the essay not graded mark still has an essay without a score. Complete it before sending to the gradebook.',
          },
          {
            heading: 'Sending scores to the gradebook',
            body: 'Exam scores are sent to the Grades menu as one assessment for each participating class. The score is on a scale of 100, that is the total score divided by the total points and multiplied by 100, with two decimals. Absent students get an empty score. Students without any data are left unchanged.',
            steps: [
              'Save all changes on the Enter scores page first.',
              'Click Send to gradebook.',
              'Pick the Grade component (for example Midterm or Final) and, if needed, change the assessment date. If left empty, the exam date is used.',
              'If some students still have ungraded essays, the app warns you and refuses to send until you confirm that ungraded essays count as 0.',
              'Click Send. Check the result in the Grades menu.',
            ],
            tip: 'If you pick a component in the Formative category, the exam result becomes learning feedback: it shows in the recap but does not count toward the report grade. You can also record the assessment technique.',
            warning:
              'Sending again updates the same assessment and overwrites old scores with the latest ones; it does not create a duplicate. Ungraded essays that you confirmed are still sent as 0, so a score can be lower than it should be until you send again.',
          },
          {
            heading: 'On-screen exams (CBT)',
            body: 'In a CBT exam, students take it on screen through their student account. Multiple choice is graded automatically, and essays show up in Enter scores for the teacher to grade. Students never receive the answer key.',
            steps: [
              'Make sure the exam status is Ready, its delivery is CBT or CBT and print, and it has a date, start time, and duration.',
              'The student signs in with their account, opens Student portal, then Exams, and clicks Start exam when the status is Open. Guardian accounts do not see exams.',
              'The timer is run by the server, so changing the device clock does not add time. The deadline is the earlier of the moment the student started plus the duration, and the end of the exam window.',
              'Answers are saved automatically. If the page is reloaded, the student continues from the last answer without restarting the timer.',
              'The student presses Submit, or the exam is submitted automatically when time runs out. After that, answers cannot be changed.',
              'The teacher monitors in Enter scores: each student shows In progress or Submitted, and Left tab when the student switched tabs.',
              'To read an essay answer, click the icon on the essay cell, read it, then enter the score and save.',
            ],
            href: '/exams',
            tip: 'The Left tab note is only information. Use it together with supervision in the exam room, not as the only evidence.',
            warning:
              'If the teacher has already entered answers from a paper sheet for a student, those answers are cleared when the student starts on screen, so the CBT result is the one that counts.',
          },
          {
            heading: 'Module and access',
            body: 'This feature is the Exams and question bank module and needs the Grades and report cards module. Viewing exams, writing questions and arranging exams, and managing exam types and the printed sheet each have their own access. Teachers can view and arrange exams for the subjects they teach. The Curriculum team, Operators, and School admins manage all exams, exam types, and printed sheets. The Principal can only view.',
          },
        ],
        faq: [
          {
            q: 'A CBT exam does not show on the student screen. What should I check?',
            a: 'Make sure the status is Ready, the delivery is CBT or CBT and print, the student class is one of the participating classes, and the date, start time, and duration are filled in. The student must sign in with a student account, not a guardian account.',
          },
          {
            q: 'A student started late. Do they still get the full time?',
            a: 'Not always. The student time ends at the latest at the end of the exam window (start time plus duration). A student who starts late gets a shorter time.',
          },
          {
            q: 'A student was absent during the exam and wants to take it another time.',
            a: 'Change the date, start time, or duration of the exam so its window opens again, or create a make-up exam for that student.',
          },
          {
            q: 'The score in the gradebook differs from what I see in Enter scores.',
            a: 'The gradebook score is on a scale of 100. Also check whether some essays are not graded yet, or send again after changing a score.',
          },
          {
            q: 'Is the printed question the same as the one taken on screen?',
            a: 'Yes, both come from the copy of the questions in that exam. The only difference is the order, if you turned on shuffling for CBT.',
          },
        ],
      },
      su: {
        title: 'Ujian: nyusun, nyitak, nilai, jeung ujian dina layar',
        summary:
          'Pituduh nyieun ujian tina bank soal, ngatur lambaran citak, ngeusian nilai, ngirim nilai ka buku nilai, jeung ngajalankeun ujian dina layar siswa (CBT).',
        forWho: 'Guru mata pelajaran, Kurikulum, Operator, jeung Admin sakola. Kepala sakola bisa ningali.',
        sections: [
          {
            heading: 'Nyieun ujian',
            body: 'Hiji ujian pikeun hiji mata pelajaran jeung hiji atawa sababaraha kelas. Cara palaksanaanana bisa Citak (lambaran kertas anu dinilai guru), CBT (dikerjakeun dina layar siswa), atawa CBT jeung citak sakaligus.',
            steps: [
              'Buka Akademik, tuluy Ujian, tuluy klik Jieun ujian.',
              'Pilih Jenis ujian, Mata pelajaran, jeung Semester. Tulis Judul ujian.',
              'Centang Kelas pamilon. Kelas anu muncul nuturkeun taun pangajaran semester anu dipilih.',
              'Pilih Cara palaksanaan: Citak, CBT, atawa CBT jeung citak.',
              'Eusian Tanggal ujian, Jam mimiti, jeung Durasi (menit).',
              'Pikeun CBT, centang Acak urutan soal jeung Acak urutan pilihan jawaban upami peryogi. Urutan acak béda pikeun unggal siswa tapi tetep sarua upami siswa muka deui kaca.',
              'Pilih Status: Draf atawa Siap, tuluy klik Simpen.',
            ],
            href: '/exams',
            tip: 'Antep status Draf salila soal masih disusun. Ujian CBT karék katingali ku siswa sanggeus statusna Siap.',
          },
          {
            heading: 'Milih jeung ngatur soal ujian',
            body: 'Klik kartu ujian pikeun muka kaca susun. Soal dipilih tina bank soal mata pelajaran anu sarua jeung disalin kana ujian, jadi ngarobah soal di bank teu ngarobah ujian anu geus disusun.',
            steps: [
              'Klik Tambah tina bank soal.',
              'Centang soal anu dipikahoyong. Soal anu geus aya dina ujian ditandaan jeung teu bisa dipilih deui.',
              'Klik tombol Tambahkeun di handap daptar.',
              'Robah urutan maké tombol panah naék jeung turun dina unggal soal.',
              'Robah Poin langsung dina kartu soal upami bobotna béda tina bank.',
              'Pikeun ngaluarkeun soal tina ujian, klik ikon hapus. Soal di bank teu milu kahapus.',
            ],
            warning:
              'Ngaganti mata pelajaran lewat Robah ujian miceun sakabéh soal anu geus dipilih, sabab soal éta kagungan mata pelajaran séjén.',
          },
          {
            heading: 'Ngatur lambaran ujian citak',
            body: 'Lambaran citak boga kop, judul, katerangan di handap kop, pitunjuk umum, jeung blok ngaran siswa. Sakabéhna diatur sakali pikeun sakola, sarta meunang disaluyukeun pikeun hiji ujian waé. Téks judul jeung katerangan meunang ngandung panampung dina kurung kurawal anu dieusian otomatis tina data ujian: {examName} (ngaran jenis ujian), {examShort} (singgetan), {semester}, {academicYear} (taun pangajaran), {subject} (mata pelajaran), {class} (kelas), {day} (poé), {date} (tanggal), {dayDate} (poé jeung tanggal), {time} (rentang jam), {duration} (durasi), {teacher} (guru), jeung {school} (ngaran sakola).',
            steps: [
              'Buka Akademik, tuluy Lambaran ujian citak (dina bagian pangaturan).',
              'Atur ukuran kertas (A4, F4, atawa Letter), margin, jeung ukuran hurup.',
              'Dina Kop, pilih Idéntitas sakola atawa Tulis sorangan. Tambahkeun baris di luhur ngaran sakola (upamana ngaran yayasan) upami peryogi, jeung pilih bagian kontak anu ditémbongkeun.',
              'Atur Judul ujian jeung baris Katerangan di handap kop (mata pelajaran, kelas, poé jeung tanggal, waktu, atawa baris séjén).',
              'Tulis Pitunjuk umum jeung pilih eusian Idéntitas siswa.',
              'Tingali Pratayang lambaran di sisina, tuluy klik Simpen. Klik Balikeun ka bawaan pikeun miceun sakabéh pangaturan.',
            ],
            href: '/exams/paper',
            tip: 'Pikeun hiji ujian anu peryogi kop atawa pitunjuk anu béda, buka ujian éta tuluy klik Lambaran ujian, pilih husus ujian ieu, tuluy simpen. Ujian séjén tetep maké pangaturan sakola.',
          },
          {
            heading: 'Nyitak lambaran soal, jawaban, jeung kunci',
            body: 'Kaca citak boga tilu témbongan: Lambaran soal, Lambaran jawaban, jeung Kunci jawaban. Soal pilihan ganda dikelompokkeun dina bagian A jeung éséy dina bagian B, kalawan nomer nyambung jeung ringkesan jumlah skor di ahir.',
            steps: [
              'Buka ujian, tuluy klik Citak.',
              'Pilih témbongan anu rék dicitak.',
              'Klik Citak / simpen PDF.',
              'Dina jandela citak pangbukaan, pilih ukuran kertas sarua jeung pangaturan lambaran, skala 100 persén, jeung pareuman header jeung footer pangbukaan.',
              'Pilih printer, atawa pilih Simpen salaku PDF pikeun dikirim atawa dicitak di tempat séjén.',
            ],
            warning:
              'Upami header jeung footer pangbukaan teu dipareuman, tulisan tambahan éta milu kacitak jeung bisa ngageser eusi lambaran.',
          },
          {
            heading: 'Ngeusian nilai tina lambaran kertas',
            body: 'Sanggeus siswa ngerjakeun dina kertas, guru ngeusian hasilna di kaca Input nilai. Tabelna eusina hiji baris per siswa jeung hiji kolom per soal. Pilihan ganda dinilai otomatis tina hurup jawaban; éséy dibéré skor ku guru. Siswa anu parantos lulus tetep muncul dina ujian taun kapengker, tapi ngan pikeun ditingali sareng teu tiasa dirobah.',
            steps: [
              'Buka ujian, tuluy klik Input nilai.',
              'Dina soal pilihan ganda, ketik hiji hurup jawaban siswa. Kotak héjo hartosna bener jeung beureum hartosna lepat.',
              'Dina soal éséy, ketik skor antara 0 jeung poin soal. Satengah poin (upamana 7,5) meunang.',
              'Centang Teu hadir pikeun siswa anu teu milu ujian. Eusian siswa éta dikosongkeun.',
              'Paké Enter jeung tombol panah pikeun pindah sél gancang. Jumlah jeung perséntase unggal siswa diitung langsung.',
              'Tingali ringkesan di luhur tabel (geus dieusian, teu hadir, rata-rata, panghandapna, pangluhurna).',
              'Klik Simpen. Ngan baris anu robah anu dikirim.',
            ],
            href: '/exams',
            tip: 'Siswa anu aya tanda éséy can dinilai masih boga éséy tanpa skor. Lengkepan heula saméméh ngirim ka buku nilai.',
          },
          {
            heading: 'Ngirim nilai ka buku nilai',
            body: 'Nilai ujian dikirim ka ménu Penilaian salaku hiji penilaian pikeun unggal kelas pamilon. Nilaina skala 100, nyaéta jumlah skor dibagi total poin tuluy dikalikeun 100, kalawan dua angka di tukangeun koma. Siswa anu teu hadir dibéré nilai kosong. Siswa anu teu boga data teu dirobah.',
            steps: [
              'Simpen heula sakabéh parobahan di kaca Input nilai.',
              'Klik Kirim ka buku nilai.',
              'Pilih Komponén nilai (upamana UTS atawa UAS) jeung, upami peryogi, ganti tanggal penilaian. Upami dikosongkeun, tanggal ujian anu dipaké.',
              'Upami masih aya siswa anu éséyna can dinilai, aplikasi méré peringatan jeung nolak ngirim nepi ka Anjeun negeskeun yén éséy anu can dinilai diitung 0.',
              'Klik Kirim. Pariksa hasilna di ménu Penilaian.',
            ],
            tip: 'Upami Anjeun milih komponén kategori Formatif, hasil ujian jadi umpan balik diajar: muncul dina rekap tapi teu asup kana nilai rapor. Anjeun oge bisa nyatet téknik panilaianna.',
            warning:
              'Ngirim deui ngapdet penilaian anu sarua jeung nimpa nilai heubeul ku nilai panganyarna, teu nyieun penilaian ganda. Éséy anu can dinilai jeung geus ditegeskeun tetep dikirim diitung 0, jadi nilai éta bisa leuwih handap tina saharusna nepi ka Anjeun ngirim deui.',
          },
          {
            heading: 'Ujian dina layar (CBT)',
            body: 'Dina ujian CBT, siswa ngerjakeun dina layar lewat akun siswana. Pilihan ganda dinilai otomatis, jeung éséy muncul di Input nilai pikeun dinilai guru. Siswa teu pernah narima kunci jawaban.',
            steps: [
              'Pastikeun status ujian Siap, cara palaksanaanana CBT atawa CBT jeung citak, jeung geus boga tanggal, jam mimiti, jeung durasi.',
              'Siswa lebet maké akunna, tuluy buka Portal siswa, Ujian, tuluy klik Mimitian ujian waktu statusna Dibuka. Akun wali teu ningali ujian.',
              'Itungan waktu dijalankeun ku server, jadi ngarobah jam parangkat teu nambahan waktu. Wates ahirna nyaéta anu leuwih awal antara jam mimiti siswa ditambah durasi jeung ahir jandela ujian.',
              'Jawaban kasimpen otomatis. Upami kaca dimuat deui, siswa neruskeun tina jawaban panungtungan tanpa ngulang waktu.',
              'Siswa mencét Kumpulkeun, atawa ujian kakumpul otomatis waktu waktu béak. Sanggeus éta jawaban teu bisa dirobah.',
              'Guru mantuan di Input nilai: unggal siswa muncul Keur ngerjakeun atawa Dikumpulkeun, jeung Kaluar tab upami siswa pindah tab.',
              'Pikeun maca jawaban éséy, klik ikon dina sél éséy, baca jawabanana, tuluy eusian skor jeung simpen.',
            ],
            href: '/exams',
            tip: 'Catetan Kaluar tab ngan informasi. Paké babarengan jeung pangawasan di rohangan ujian, lain salaku bukti tunggal.',
            warning:
              'Upami guru geus ngeusian jawaban tina lambaran kertas pikeun hiji siswa, jawaban éta dikosongkeun waktu siswa mimiti ngerjakeun dina layar, sangkan hasil CBT anu diitung.',
          },
          {
            heading: 'Modul jeung hak aksés',
            body: 'Fitur ieu téh modul Ujian jeung bank soal jeung merlukeun modul Nilai jeung rapor. Ningali ujian, nulis soal jeung nyusun ujian, sarta ngatur jenis ujian jeung lambaran citak boga hak aksés sewang-sewangan. Guru bisa ningali jeung nyusun ujian pikeun mata pelajaran anu diampuna. Kurikulum, Operator, jeung Admin sakola ngatur sakabéh ujian, jenis ujian, jeung lambaran citak. Kepala sakola ngan bisa ningali.',
          },
        ],
        faq: [
          {
            q: 'Ujian CBT teu muncul dina layar siswa. Naon anu kudu diparios?',
            a: 'Pastikeun statusna Siap, cara palaksanaanana CBT atawa CBT jeung citak, kelas siswa kaasup kelas pamilon, jeung tanggal, jam mimiti, sarta durasi geus dieusian. Siswa kudu lebet maké akun siswa, lain akun wali.',
          },
          {
            q: 'Siswa telat mimiti. Naha waktuna tetep pinuh?',
            a: 'Henteu salawasna. Waktu siswa béak pangtelatna dina ahir jandela ujian (jam mimiti ditambah durasi). Siswa anu mimiti telat meunang waktu anu leuwih pondok.',
          },
          {
            q: 'Siswa teu hadir waktu ujian jeung hoyong ngerjakeun di waktu séjén.',
            a: 'Robah tanggal, jam mimiti, atawa durasi ujian sangkan jandelana kabuka deui, atawa jieun ujian susulan pikeun siswa éta.',
          },
          {
            q: 'Nilai di buku nilai béda tina anu katingali di Input nilai.',
            a: 'Nilai di buku nilai skala 100. Pariksa ogé naha aya éséy anu can dinilai, atawa kirim deui sanggeus ngarobah skor.',
          },
          {
            q: 'Naha soal anu dicitak sarua jeung anu dikerjakeun dina layar?',
            a: 'Enya, duanana asalna tina salinan soal dina ujian éta. Bédana ngan urutan, upami Anjeun ngahurungkeun acak pikeun CBT.',
          },
        ],
      },
    },
  },
  {
    slug: 'exam-omr',
    icon: 'scan',
    tone: 'sky',
    group: 'academic',
    module: 'exams',
    text: {
      id: {
        title: 'Lembar OMR: mencetak dan memindai lembar jawaban',
        summary:
          'Cetak lembar jawaban per siswa yang bisa dibaca otomatis, lalu foto atau pindai hasilnya supaya jawaban pilihan ganda terisi sendiri di lembar nilai.',
        forWho: 'Guru mata pelajaran, Kurikulum, Operator, dan Admin sekolah.',
        sections: [
          {
            heading: 'Mencetak lembar OMR',
            body: 'Lembar OMR adalah lembar jawaban khusus untuk soal pilihan ganda. Tiap lembar punya empat kotak hitam di sudut, kode QR yang menandai ujian dan siswanya, nama siswa, dan bulatan jawaban A sampai E untuk setiap soal. Karena ada kode QR, tiap siswa mendapat lembarnya sendiri.',
            steps: [
              'Buka ujian, klik Cetak, lalu pilih tampilan Lembar OMR.',
              'Pilih kelas bila ingin mencetak untuk satu kelas saja.',
              'Centang Sertakan lembar kosong bila perlu cadangan, dan isi jumlahnya. Lembar kosong tidak punya kode QR sehingga harus dipilihkan siswanya saat dipindai.',
              'Klik Cetak / simpan PDF, pilih kertas A4, skala 100 persen, dan matikan header serta footer peramban.',
              'Bagikan satu lembar untuk tiap siswa.',
            ],
            href: '/exams',
            tip: 'Cetak satu lembar dulu dan coba pindai sebelum mencetak untuk seluruh kelas.',
          },
          {
            heading: 'Cara siswa mengisi lembar',
            body: 'Hasil pindai paling akurat bila bulatan dihitamkan penuh dan bersih. Beri tahu siswa sebelum ujian dimulai.',
            steps: [
              'Gunakan pensil 2B atau pulpen hitam.',
              'Hitamkan satu bulatan sepenuhnya untuk tiap nomor.',
              'Bila salah, hapus sampai bersih lalu hitamkan bulatan yang benar.',
              'Jangan menulis atau melipat lembar, dan jangan menutup empat kotak hitam di sudut.',
            ],
            warning:
              'Tanda yang terlalu tipis, dua bulatan dalam satu nomor, atau bekas hapusan yang gelap akan ditandai untuk diperiksa dan bisa terbaca keliru.',
          },
          {
            heading: 'Memfoto atau memindai lembar',
            body: 'Gambar yang dipakai boleh berasal dari pemindai atau dari kamera ponsel. Semakin rata dan terang gambarnya, semakin tepat hasilnya.',
            steps: [
              'Letakkan lembar di permukaan rata dengan latar yang berbeda warna.',
              'Pastikan seluruh lembar terlihat, termasuk keempat kotak hitam di sudut.',
              'Ambil foto tegak lurus dari atas dengan cahaya merata, tanpa bayangan tangan atau ponsel.',
              'Lembar boleh agak miring atau terbalik, tetapi jangan tertekuk atau terlipat.',
              'Simpan sebagai JPG, PNG, atau WebP.',
              'Foto beberapa lembar sekaligus tidak bisa; satu gambar untuk satu lembar.',
            ],
            tip: 'Gunakan aplikasi pemindai di ponsel untuk meluruskan dan menerangi gambar sebelum diunggah.',
          },
          {
            heading: 'Memeriksa hasil pindai',
            body: 'Di halaman Pindai lembar jawaban, tiap gambar tampil sebagai kartu berisi nama siswa yang dikenali dari kode QR dan jawaban yang terbaca untuk tiap nomor. Anda tinggal memeriksa, memperbaiki bila perlu, lalu menerapkannya.',
            steps: [
              'Buka ujian, klik Pindai lembar OMR.',
              'Tarik gambar ke kotak unggah atau klik Pilih foto, boleh banyak berkas sekaligus.',
              'Periksa tiap kartu. Bila kode QR tidak terbaca atau siswanya tidak dikenal, pilih siswanya dari daftar.',
              'Perhatikan tanda warna. Kuning berarti tanda tipis, merah berarti lebih dari satu tanda, dan titik berarti kosong. Klik sebuah soal untuk mengganti jawabannya.',
              'Bila ada dua lembar untuk siswa yang sama, aplikasi memberi peringatan. Pilih lembar yang benar.',
              'Klik Terapkan ke lembar nilai. Jawaban pilihan ganda masuk ke Input nilai dan dinilai otomatis; esai tidak berubah.',
            ],
            href: '/exams',
            warning:
              'Menerapkan hasil pindai menimpa jawaban pilihan ganda yang sudah ada untuk siswa itu. Periksa dulu lembar yang bertanda merah atau kuning.',
          },
          {
            heading: 'Batas yang perlu diketahui',
            body: 'Lembar OMR selalu berukuran A4, apa pun ukuran kertas lembar soalnya. Satu lembar memuat paling banyak 100 soal pilihan ganda, dan tiap soal paling banyak 5 pilihan (A sampai E). Bila ujian melebihi batas itu, tab Lembar OMR menampilkan pesan dan tidak bisa dicetak. Pemindaian hanya untuk soal pilihan ganda; esai tetap dinilai manual di Input nilai. Pemindai membaca di peramban, jadi gambar tidak dikirim ke tempat lain.',
          },
        ],
        faq: [
          {
            q: 'Kode QR tidak terbaca. Apa yang harus dilakukan?',
            a: 'Foto ulang dengan cahaya lebih terang dan lembar rata, atau pilih siswanya sendiri dari daftar pada kartu itu.',
          },
          {
            q: 'Hasil pindai berbeda dari jawaban siswa.',
            a: 'Periksa tanda kuning dan merah, lalu klik soalnya untuk memperbaiki. Tanda yang sangat tipis bisa tidak terbaca; minta siswa menghitamkan lebih penuh pada ujian berikutnya.',
          },
          {
            q: 'Bisakah memindai lembar yang tidak dicetak dari aplikasi?',
            a: 'Tidak. Pemindai bergantung pada letak kotak sudut, kode QR, dan bulatan yang dicetak oleh aplikasi.',
          },
          {
            q: 'Apakah esai ikut terbaca?',
            a: 'Tidak. Esai dinilai guru di Input nilai.',
          },
        ],
      },
      en: {
        title: 'OMR sheets: printing and scanning answer sheets',
        summary:
          'Print an answer sheet per student that can be read automatically, then photograph or scan the results so multiple choice answers fill themselves in on the score sheet.',
        forWho: 'Subject teachers, the Curriculum team, Operators, and School admins.',
        sections: [
          {
            heading: 'Printing OMR sheets',
            body: 'An OMR sheet is an answer sheet made for multiple choice questions. Each sheet has four black boxes in the corners, a QR code that identifies the exam and the student, the student name, and answer bubbles A to E for every question. Because of the QR code, each student gets their own sheet.',
            steps: [
              'Open the exam, click Print, then pick the OMR sheet view.',
              'Pick a class if you only want to print for one class.',
              'Tick Include blank sheets if you need spares, and fill in how many. Blank sheets have no QR code, so the student has to be chosen when scanned.',
              'Click Print / save PDF, pick A4 paper, scale 100 percent, and turn off the browser headers and footers.',
              'Hand out one sheet per student.',
            ],
            href: '/exams',
            tip: 'Print one sheet first and try scanning it before printing for the whole class.',
          },
          {
            heading: 'How students fill in the sheet',
            body: 'The scan is most accurate when bubbles are filled in fully and cleanly. Tell students before the exam starts.',
            steps: [
              'Use a 2B pencil or a black pen.',
              'Fill in one bubble completely for each number.',
              'If wrong, erase until clean, then fill in the right bubble.',
              'Do not write on or fold the sheet, and do not cover the four black boxes in the corners.',
            ],
            warning:
              'A mark that is too light, two bubbles on one number, or a dark erasing smudge is flagged for checking and may be read wrongly.',
          },
          {
            heading: 'Photographing or scanning the sheet',
            body: 'The image can come from a scanner or a phone camera. The flatter and brighter the image, the more accurate the result.',
            steps: [
              'Put the sheet on a flat surface with a background of a different colour.',
              'Make sure the whole sheet is visible, including the four black boxes in the corners.',
              'Take the photo straight down from above with even light and no shadow of a hand or phone.',
              'The sheet may be a little tilted or upside down, but it must not be bent or folded.',
              'Save it as JPG, PNG, or WebP.',
              'Photographing several sheets in one picture does not work; one picture is one sheet.',
            ],
            tip: 'Use a scanner app on the phone to straighten and brighten the image before uploading it.',
          },
          {
            heading: 'Checking the scan results',
            body: 'On the Scan answer sheets page, every image appears as a card with the student name recognised from the QR code and the answer read for each number. You only check, fix if needed, then apply.',
            steps: [
              'Open the exam and click Scan OMR sheets.',
              'Drag images into the upload box or click Choose photos; many files at once are fine.',
              'Check each card. If the QR code is not read or the student is not recognised, pick the student from the list.',
              'Look at the colour marks. Yellow means a faint mark, red means more than one mark, and a dot means empty. Click a question to change its answer.',
              'If two sheets exist for the same student, the app warns you. Pick the right sheet.',
              'Click Apply to score sheet. Multiple choice answers go into Enter scores and are graded automatically; essays are unchanged.',
            ],
            href: '/exams',
            warning:
              'Applying a scan overwrites the multiple choice answers already stored for that student. Check the red or yellow sheets first.',
          },
          {
            heading: 'Limits to know',
            body: 'The OMR sheet is always A4, whatever the paper size of the question sheet. One sheet holds at most 100 multiple choice questions, and each question at most 5 options (A to E). If an exam goes over those limits, the OMR sheet tab shows a message and cannot be printed. Scanning is for multiple choice only; essays are still graded by hand in Enter scores. The scanner reads in the browser, so the images are not sent anywhere else.',
          },
        ],
        faq: [
          {
            q: 'The QR code is not read. What should I do?',
            a: 'Take the photo again with brighter light and a flat sheet, or pick the student yourself from the list on that card.',
          },
          {
            q: 'The scan result differs from the student answers.',
            a: 'Check the yellow and red marks, then click the question to fix it. A very faint mark may not be read; ask students to fill in more fully at the next exam.',
          },
          {
            q: 'Can I scan a sheet that was not printed from the app?',
            a: 'No. The scanner depends on the position of the corner boxes, the QR code, and the bubbles printed by the app.',
          },
          {
            q: 'Are essays read too?',
            a: 'No. Essays are graded by the teacher in Enter scores.',
          },
        ],
      },
      su: {
        title: 'Lambaran OMR: nyitak jeung mindai lambaran jawaban',
        summary:
          'Citak lambaran jawaban per siswa anu bisa dibaca otomatis, tuluy poto atawa pindai hasilna sangkan jawaban pilihan ganda eusi sorangan dina lambaran nilai.',
        forWho: 'Guru mata pelajaran, Kurikulum, Operator, jeung Admin sakola.',
        sections: [
          {
            heading: 'Nyitak lambaran OMR',
            body: 'Lambaran OMR téh lambaran jawaban husus pikeun soal pilihan ganda. Unggal lambaran boga opat kotak hideung di juru, kode QR anu nandaan ujian jeung siswana, ngaran siswa, jeung buleud jawaban A nepi ka E pikeun unggal soal. Kusabab aya kode QR, unggal siswa meunang lambaran sorangan.',
            steps: [
              'Buka ujian, klik Citak, tuluy pilih témbongan Lambaran OMR.',
              'Pilih kelas upami hoyong nyitak pikeun hiji kelas waé.',
              'Centang Sartakeun lambaran kosong upami peryogi cadangan, jeung eusian jumlahna. Lambaran kosong teu boga kode QR jadi siswana kudu dipilih waktu dipindai.',
              'Klik Citak / simpen PDF, pilih kertas A4, skala 100 persén, jeung pareuman header jeung footer pangbukaan.',
              'Bagikeun hiji lambaran pikeun unggal siswa.',
            ],
            href: '/exams',
            tip: 'Citak hiji lambaran heula tuluy cobaan mindai saméméh nyitak pikeun sakabéh kelas.',
          },
          {
            heading: 'Cara siswa ngeusian lambaran',
            body: 'Hasil pindai pang akuratna lamun buleud dihideungan pinuh jeung bersih. Béjakeun siswa saméméh ujian dimimitian.',
            steps: [
              'Paké pinsil 2B atawa pulpén hideung.',
              'Hideungan hiji buleud sapinuhna pikeun unggal nomer.',
              'Upami lepat, hapus nepi ka bersih tuluy hideungan buleud anu bener.',
              'Ulah nulis atawa nglipet lambaran, jeung ulah nutupan opat kotak hideung di juru.',
            ],
            warning:
              'Tanda anu pisan ipis, dua buleud dina hiji nomer, atawa tilas hapusan anu poék bakal ditandaan pikeun dipariksa jeung bisa kabaca lepat.',
          },
          {
            heading: 'Moto atawa mindai lambaran',
            body: 'Gambar anu dipaké meunang asalna tina pamindai atawa tina kaméra ponsel. Beuki datar jeung caang gambarna, beuki merenah hasilna.',
            steps: [
              'Teundeun lambaran dina beungeut datar kalawan latar anu béda warna.',
              'Pastikeun sakabéh lambaran katingali, kaasup opat kotak hideung di juru.',
              'Poto lempeng ti luhur kalawan cahaya rata, tanpa kalangkang leungeun atawa ponsel.',
              'Lambaran meunang rada miring atawa tibalik, tapi ulah dilekukkeun atawa dilipet.',
              'Simpen salaku JPG, PNG, atawa WebP.',
              'Moto sababaraha lambaran dina hiji gambar teu bisa; hiji gambar hiji lambaran.',
            ],
            tip: 'Paké aplikasi pamindai dina ponsel pikeun nguruskeun jeung nyaangan gambar saméméh diunggah.',
          },
          {
            heading: 'Mariksa hasil pindai',
            body: 'Di kaca Pindai lambaran jawaban, unggal gambar muncul salaku kartu eusina ngaran siswa anu dipikanyaho tina kode QR jeung jawaban anu kabaca pikeun unggal nomer. Anjeun tinggal mariksa, ngabenerkeun upami peryogi, tuluy nerapkeun.',
            steps: [
              'Buka ujian, klik Pindai lambaran OMR.',
              'Tarik gambar kana kotak unggah atawa klik Pilih poto, meunang loba berkas sakaligus.',
              'Pariksa unggal kartu. Upami kode QR teu kabaca atawa siswana teu dipikanyaho, pilih siswana tina daptar.',
              'Perhatikeun tanda warna. Konéng hartosna tanda ipis, beureum hartosna leuwih ti hiji tanda, jeung titik hartosna kosong. Klik hiji soal pikeun ngaganti jawabanana.',
              'Upami aya dua lambaran pikeun siswa anu sarua, aplikasi méré peringatan. Pilih lambaran anu bener.',
              'Klik Terapkeun ka lambaran nilai. Jawaban pilihan ganda asup ka Input nilai jeung dinilai otomatis; éséy teu robah.',
            ],
            href: '/exams',
            warning:
              'Nerapkeun hasil pindai nimpa jawaban pilihan ganda anu geus aya pikeun siswa éta. Pariksa heula lambaran anu ditandaan beureum atawa konéng.',
          },
          {
            heading: 'Wates anu perlu dipikanyaho',
            body: 'Lambaran OMR salawasna ukuran A4, naon waé ukuran kertas lambaran soalna. Hiji lambaran ngandung pangpangna 100 soal pilihan ganda, jeung unggal soal pangpangna 5 pilihan (A nepi ka E). Upami ujian ngaleuwihan wates éta, tab Lambaran OMR nembongkeun béja jeung teu bisa dicitak. Pamindaian ngan pikeun soal pilihan ganda; éséy tetep dinilai manual di Input nilai. Pamindai maca dina pangbukaan, jadi gambar teu dikirim ka tempat séjén.',
          },
        ],
        faq: [
          {
            q: 'Kode QR teu kabaca. Naon anu kudu dilakukeun?',
            a: 'Poto deui kalawan cahaya leuwih caang jeung lambaran datar, atawa pilih siswana sorangan tina daptar dina kartu éta.',
          },
          {
            q: 'Hasil pindai béda tina jawaban siswa.',
            a: 'Pariksa tanda konéng jeung beureum, tuluy klik soalna pikeun ngabenerkeun. Tanda anu ipis pisan bisa teu kabaca; pénta siswa ngahideungan leuwih pinuh dina ujian satuluyna.',
          },
          {
            q: 'Naha bisa mindai lambaran anu teu dicitak tina aplikasi?',
            a: 'Henteu. Pamindai gumantung kana tempat kotak juru, kode QR, jeung buleud anu dicitak ku aplikasi.',
          },
          {
            q: 'Naha éséy milu kabaca?',
            a: 'Henteu. Éséy dinilai ku guru di Input nilai.',
          },
        ],
      },
    },
  },
];
