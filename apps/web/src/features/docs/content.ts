/**
 * Documentation content for the in-app reference page.
 *
 * This prose is long-form and list-shaped, so it lives beside the page instead of in the i18n
 * catalog, whose `MessageKey` union is tuned for short UI strings and would grow by hundreds of
 * numbered keys here. Every section still has to spell out all three shipped locales —
 * `Record<Locale, …>` makes a missing translation a compile error, exactly like the catalog does.
 */
import {
  Building2, Clock3, Database, Info, KeyRound, LayoutDashboard, Lock, LogIn, Mail, Palette,
  ScrollText, Settings, ShieldCheck, UserPlus, type LucideIcon,
} from 'lucide-react';
import type { Locale } from '@/i18n';

export interface DocSection {
  id: string;
  icon: LucideIcon;
  /** Endpoint identifiers are code, not prose — one language is enough. */
  endpoints?: readonly string[];
  title: Record<Locale, string>;
  description: Record<Locale, string>;
  items: Record<Locale, readonly string[]>;
}

export const DOC_SCOPE = {
  en: 'This page covers the Platform control plane only. School-side documentation will be added here later.',
  id: 'Halaman ini hanya mencakup pusat kendali Platform. Dokumentasi sisi sekolah akan ditambahkan di sini nanti.',
  su: 'Halaman ieu ngan nutupan panel kendali Platform. Dokumentasi sisi sakola bakal ditambahkeun di dieu engké.',
} as const satisfies Record<Locale, string>;

export const DOC_SCOPE_ICON: LucideIcon = Info;

export const DOC_SECTIONS: readonly DocSection[] = [
  {
    id: 'auth',
    icon: LogIn,
    endpoints: ['/api/auth/sign-in/email', 'GET /api/auth/get-session', 'POST /api/auth/sign-out'],
    title: { en: 'Sign-in and session', id: 'Masuk dan sesi', su: 'Lebet sareng sési' },
    description: {
      en: 'How operators and account managers enter the Platform and how their access is decided.',
      id: 'Bagaimana operator dan pengelola akun masuk ke Platform dan bagaimana hak akses mereka ditentukan.',
      su: 'Kumaha operator sareng nu ngurus akun lebet ka Platform sareng kumaha hak aksesna ditangtukeun.',
    },
    items: {
      en: [
        'Sign-in accepts both invited platform operators and self-registered account managers. It never creates an account on its own.',
        'Sign-in uses email and password. The session stays active until you sign out from the user card in the sidebar.',
        'The protected-access card shows the role your session carries, which decides which actions are available.',
        'A new account manager registers on the sign-up page and then signs in with the same password.',
      ],
      id: [
        'Masuk menerima baik platform operator yang diundang maupun pengelola akun yang mendaftar sendiri. Halaman masuk tidak pernah membuat akun.',
        'Masuk menggunakan email dan kata sandi. Sesi tetap aktif sampai Anda keluar dari kartu pengguna di sidebar.',
        'Kartu akses terlindungi menunjukkan peran sesi Anda, yang menentukan tindakan apa yang tersedia.',
        'Pengelola akun baru mendaftar di halaman daftar akun, lalu masuk dengan kata sandi yang sama.',
      ],
      su: [
        'Lebet nampa operator platform nu diundang sareng nu ngurus akun nu worsening dina diri sorangan. Halaman lebet teu pernah nyieun akun.',
        'Lebet nganggo email sareng keunsi sandi. Sési tetep aktif nepi ka Anjeun kaluar tina kartu pamaké di sidebar.',
        'Kartu akses dilindungi nunjukkeun peran sési Anjeun, anu nangtukeun aksi nu tiasa dianggo.',
        'Nu ngurus akun anyar ngajualna dina halaman daftar akun, tuluy lebet ku keunsi sandi nu sarua.',
      ],
    },
  },
  {
    id: 'registration',
    icon: UserPlus,
    endpoints: ['POST /api/auth/register (5/hour)'],
    title: { en: 'Customer account registration', id: 'Pendaftaran akun pelanggan', su: 'Pendaftaran akun palanggan' },
    description: {
      en: 'How an account manager signs up for the Platform on their own.',
      id: 'Bagaimana pengelola akun mendaftar ke Platform secara mandiri.',
      su: 'Kumaha nu ngurus akun registering ka Platform sorangan.',
    },
    items: {
      en: [
        'The sign-up page creates a platform_user account: an account manager who owns and manages only the school workspaces they create.',
        'Name, email, and a password of 12–128 characters are required. The email is stored normalized and lowercased.',
        'The endpoint is rate limited to five registrations per hour.',
        'The response never discloses whether the address already had an account: an existing address answers with the same body as a fresh registration.',
        'If an operator invitation is already pending for that email, the request is rejected so the invitation keeps its precedence.',
        'Registration does not sign you in. Sign in afterwards on the sign-in page.',
      ],
      id: [
        'Halaman daftar akun membuat akun platform_user: pengelola akun yang hanya memiliki dan mengelola ruang kerja sekolah yang dibuatnya sendiri.',
        'Nama, email, dan kata sandi 12–128 karakter wajib diisi. Email disimpan dalam bentuk normal dan huruf kecil.',
        'Endpoint ini dibatasi lima pendaftaran per jam.',
        'Respons tidak pernah mengungkapkan apakah alamat sudah punya akun: alamat yang sudah terdaftar menjawab dengan isi yang sama seperti pendaftaran baru.',
        'Jika masih ada undangan operator yang tertunda untuk email tersebut, permintaan ditolak agar undangan tetap diprioritaskan.',
        'Pendaftaran tidak langsung masuk ke sesi. Setelah itu masuklah di halaman masuk.',
      ],
      su: [
        'Halaman daftar akun nyieun akun platform_user: nu ngurus akun nu boga tur mun nuruskeun ngan ruang gawé sakola nu dilakukeunana sorangan.',
        'Ngaran, email, sareng keunsi sandi 12–128 karakter kudu. Email disimpen dina bentuk normal jeung hurup leutik.',
        'Endpoint ieu dibates lima pendaftaran per jam.',
        'Jawabana teu kantos ngungkulan naha alamat geus aya akun: alamat nu geus kadaptar jawabna sarua jeung pendaftaran anyar.',
        'Upami masih aya undangan operator anu ngantosan pikeun email éta, paménta ditolak sangkan undangan tetep didahulukeun.',
        'Pendaftaran teu langsung lebet. Tuluy lebet deui di halaman lebet.',
      ],
    },
  },
  {
    id: 'reset',
    icon: KeyRound,
    endpoints: [
      'POST /api/auth/forgot-password (5/hour)',
      'POST /api/auth/verify-reset-otp (10/hour)',
      'POST /api/auth/reset-password (10/hour)',
    ],
    title: { en: 'Password recovery', id: 'Pemulihan kata sandi', su: 'Pulihkeun keunsi sandi' },
    description: {
      en: 'A three-step reset that never reveals whether an account exists.',
      id: 'Pemulihan tiga langkah yang tidak pernah mengungkapkan apakah akun ada.',
      su: 'Pulihkeun tilu léngkah anu teu kantos ngungkulan naha akun aya.',
    },
    items: {
      en: [
        'Request a reset code. The response is identical whether or not the email is registered.',
        'Codes are six digits, expire after 10 minutes, and allow up to five failed attempts.',
        'New passwords must be 12–128 characters and be entered twice; a mismatch is rejected before any attempt is spent.',
        'Rate limits: five code requests, ten verifications, and ten resets per hour.',
      ],
      id: [
        'Minta kode pemulihan. Responsnya sama apakah email terdaftar atau tidak.',
        'Kode terdiri dari enam digit, kedaluwarsa setelah 10 menit, dan mengizinkan hingga lima percobaan gagal.',
        'Kata sandi baru harus 12–128 karakter dan diketik dua kali; ketidakcocokan ditolak sebelum percobaan terpakai.',
        'Batas laju: lima permintaan kode, sepuluh verifikasi, dan sepuluh pemulihan per jam.',
      ],
      su: [
        'Mintakeun kode pamulihan. Jawabana sami naha kadaptar atawa teu.',
        'Kode genep digit, kadaluwarsa saatos 10 menit, sareng ngamungkinkeun nepi ka lima percobaan gagal.',
        'Keunsi sandi énggal kedah 12–128 karakter sareng diketik dua kali; teu cocog ditolak saméméh percobaan dipaké.',
        'Batas laju: lima minta kode, sapuluh verifikasi, sareng sapuluh pamulihan per jam.',
      ],
    },
  },
  {
    id: 'invitations',
    icon: Mail,
    endpoints: [
      'POST /api/operators/invitations',
      'POST /api/operators/invitations/:id/resend',
      'POST /api/operators/invitations/:id/revoke',
      'POST /api/operator-invitations/lookup (10/hour)',
      'POST /api/operator-invitations/accept (10/hour)',
    ],
    title: { en: 'Operator invitations', id: 'Undangan operator', su: 'Undangan operator' },
    description: {
      en: 'How new Platform operators are created — invitation only.',
      id: 'Bagaimana operator Platform baru dibuat — hanya melalui undangan.',
      su: 'Kumaha operator Platform énggal didamel — ngan liwat undangan.',
    },
    items: {
      en: [
        'An admin sends an invitation from the Operators page. It carries a one-time link that expires after 48 hours.',
        'The invitee creates a password on the invitation page to activate their account.',
        'Resending issues a new token and invalidates the previous link.',
        'Revoking stops the link immediately. A delivery failure leaves the invitation created but unusable until it is resent.',
        'The API keeps invitations from the last 90 days.',
      ],
      id: [
        'Admin mengirim undangan dari halaman Operator. Undangan berisi tautan sekali pakai yang kedaluwarsa setelah 48 jam.',
        'Pihak yang diundang membuat kata sandi di halaman undangan untuk mengaktifkan akunnya.',
        'Pengiriman ulang membuat token baru dan menonaktifkan tautan sebelumnya.',
        'Pencabutan langsung menghentikan tautan. Kegagalan pengiriman membuat undangan tetap terbuat tetapi tidak dapat dipakai sampai dikirim ulang.',
        'API menyimpan undangan dari 90 hari terakhir.',
      ],
      su: [
        'Admin ngirim undangan tina halaman Operator. Undangan eusina tautan sakali pakai anu kadaluwarsa saatos 48 jam.',
        'Nu diundang damel keunsi sandi dina halaman undangan pikeun ngaktipkeun akunna.',
        'Ngirim deui nyieun token énggal sareng ngahilangkeun tautan sateuacana.',
        'Ngabatalkeun langsung ngahentinkeun tautan. Gagal pengiriman nyieun undangan tetep didamel tapi teu tiasa dianggo nepi ka dikirim deui.',
        'API nyimpen undangan ti 90 dinten ka pengker.',
      ],
    },
  },
  {
    id: 'roles',
    icon: ShieldCheck,
    endpoints: ['GET /api/operators', 'POST /api/operators/:id/role', 'POST /api/operators/:id/status'],
    title: { en: 'Roles and safeguards', id: 'Peran dan pengaman', su: 'Peran sareng pengaman' },
    description: {
      en: 'What each Platform role can do, and the guards the server enforces.',
      id: 'Apa yang dapat dilakukan setiap peran Platform, dan pengaman yang ditegakkan server.',
      su: 'Naon anu tiasa dilakukeun ku unggul peran Platform, sareng pengaman anu ditepikeun server.',
    },
    items: {
      en: [
        'Platform admin: create school workspaces, manage operators, and see every workspace on the platform.',
        'Platform read only: view workspace and operator records; changes are hidden.',
        'Account manager (platform_user): create school workspaces and manage only the workspaces they own. The Operators page and every operator record stay hidden for them.',
        'Operators and account managers are separate roles: an operator invitation can never be answered by a customer account, and a customer account never appears in the operator roster.',
        'You cannot change your own status.',
        'The server prevents disabling the final active administrator.',
      ],
      id: [
        'Platform admin: membuat ruang kerja sekolah, mengelola operator, dan melihat seluruh ruang kerja di platform.',
        'Platform hanya baca: melihat catatan ruang kerja dan operator; perubahan disembunyikan.',
        'Pengelola akun (platform_user): membuat ruang kerja sekolah dan hanya mengelola ruang kerja miliknya sendiri. Halaman Operator dan seluruh catatan operator tetap tersembunyi untuk mereka.',
        'Operator dan pengelola akun adalah peran yang terpisah: undangan operator tidak pernah dapat dijawab oleh akun pelanggan, dan akun pelanggan tidak pernah muncul di daftar operator.',
        'Anda tidak dapat mengubah status Anda sendiri.',
        'Server mencegah menonaktifkan administrator aktif terakhir.',
      ],
      su: [
        'Platform admin: nyieun ruang gawé sakola, ngurus operator, sareng ningali kabeh ruang gawé di platform.',
        'Platform ngan maca: ningali catetan ruang gawé sareng operator; parobihan disembunyikeun.',
        'Nu ngurus akun (platform_user): nyieun ruang gawé sakola sareng ngurus ngan ruang gawé nu bogaana. Halaman Operator sareng kabeh catetan operator tetep disumputkeun keur maranéhna.',
        'Operator sareng nu ngurus akun téh peran nu misah: undangan operator teu kungsi dijawab ku akun palanggan, sareng akun palanggan teu kungsi mucunghul dina daptar operator.',
        'Anjeun teu tiasa ngarobih status anjeun sorangan.',
        'Server nyegah pareumkeun administrator aktif terakhir.',
      ],
    },
  },
  {
    id: 'provisioning',
    icon: Building2,
    endpoints: [
      'POST /api/tenants',
      'GET /api/tenants (max 100)',
      'PATCH /api/tenants/:id/status',
      'POST /api/tenants/:id/retry-provisioning',
      'POST /internal/provisioning/tenants',
    ],
    title: {
      en: 'School workspace provisioning',
      id: 'Penyiapan ruang kerja sekolah',
      su: 'Penyiapan ruang gawé sakola',
    },
    description: {
      en: 'What happens between the create dialog and an active workspace.',
      id: 'Yang terjadi antara dialog pembuatan dan ruang kerja aktif.',
      su: 'Naon anu kajadian antara dialog damel sareng ruang gawé aktif.',
    },
    items: {
      en: [
        'Creating a workspace records the tenant with status provisioning on the Platform API.',
        'The creating account is stored as the workspace owner, so an account manager only ever sees the workspaces they created.',
        'The Platform API then calls the School API server-to-server using a shared provisioning secret, with a 10-second timeout.',
        'On success the tenant becomes active and stores its school tenant ID; on failure it becomes provisioning_failed with a provisioning note and can be retried from the workspace list.',
        'Platform admins can suspend an active workspace or reactivate a suspended workspace from the workspace table.',
        'The School API is idempotent: the same payload returns the same tenant, and changed details are rejected as a conflict.',
        'Lists and overview show at most 100 records, newest first.',
      ],
      id: [
        'Membuat ruang kerja mencatat tenant dengan status sedang disiapkan di Platform API.',
        'Akun pembuat disimpan sebagai pemilik ruang kerja, sehingga pengelola akun hanya melihat ruang kerja yang dibuatnya sendiri.',
        'Platform API kemudian memanggil School API server-ke-server dengan rahasia penyiapan bersama, batas waktu 10 detik.',
        'Jika berhasil, tenant menjadi aktif dan menyimpan ID tenant sekolah; jika gagal, menjadi gagal disiapkan dengan catatan penyiapan dan dapat dicoba ulang dari daftar ruang kerja.',
        'Platform admin dapat menangguhkan ruang kerja aktif atau mengaktifkan kembali ruang kerja yang ditangguhkan dari tabel ruang kerja.',
        'School API bersifat idempoten: payload yang sama mengembalikan tenant yang sama, dan detail yang diubah ditolak sebagai konflik.',
        'Daftar dan ikhtisar menampilkan maksimum 100 catatan, terbaru lebih dulu.',
      ],
      su: [
        'Damel ruang gawé ngajagi tenant kalayan status nuju disiapkeun dina Platform API.',
        'Akun nu ngadamelkeun disimpan salaku nu boga ruang gawé, sangkan nu ngurus akun ngan ukur nempo ruang gawé nu dilakukeunana.',
        'Platform API teras nelepon School API server-ka-server nganggo rahasia penyiapan bareng, wates 10 detik.',
        'Upami berhasil, tenant jadi aktif sareng nyimpen ID tenant sakola; upami gagal, jadi gagal disiapkeun kalayan catetan penyiapan sareng tiasa dicobian deui tina daptar ruang gawé.',
        'Platform admin tiasa ngagantungkeun ruang gawé aktif atawa ngaktipkeun deui ruang gawé anu digantungkeun tina tabél ruang gawé.',
        'School API bersifat idempoten: payload nu sami nganteukkeun tenant nu sami, sareng rincian nu dirobih ditolak salaku konflik.',
        'Daptar sareng ringkesan nembongkeun maksimum 100 catetan, nu panganyar heula.',
      ],
    },
  },
  {
    id: 'activation',
    icon: Clock3,
    endpoints: [
      'POST /api/admin-activations/lookup (10/hour)',
      'POST /api/admin-activations/accept (10/hour)',
    ],
    title: {
      en: 'School admin activation',
      id: 'Aktivasi admin sekolah',
      su: 'Aktivasi admin sakola',
    },
    description: {
      en: 'How the designated school administrator activates their account after provisioning.',
      id: 'Bagaimana administrator sekolah yang ditunjuk mengaktifkan akunnya setelah penyiapan.',
      su: 'Kumaha administrator sakola anu ditunjuk ngaktipkeun akunna saatos penyiapan.',
    },
    items: {
      en: [
        'Provisioning generates a 48-hour, single-use activation link and emails it directly to the school admin contact.',
        'The school admin opens the link on school-web (/activate/:token) and chooses a password (12–128 characters) to create their school_admin membership.',
        'Never send a School password or any reusable activation credential through the provisioning API response.',
        'For local development only, the School bootstrap seed creates a demo school with admin and staff accounts.',
      ],
      id: [
        'Penyiapan membuat tautan aktivasi sekali pakai selama 48 jam dan mengirimkannya melalui email ke kontak admin sekolah.',
        'Admin sekolah membuka tautan di school-web (/activate/:token) dan memilih kata sandi (12–128 karakter) untuk mengaktifkan keanggotaan school_admin.',
        'Jangan pernah mengirim kata sandi Sekolah atau kredensial aktivasi apa pun melalui respons API penyiapan.',
        'Hanya untuk pengembangan lokal, seed bootstrap Sekolah membuat sekolah demo beserta akun admin dan staf.',
      ],
      su: [
        'Penyiapan nyieun tautan aktivasi sakali pakai salama 48 jam sareng ngirimkeunana liwat email ka kontak admin sakola.',
        'Admin sakola muka tautan di school-web (/activate/:token) sareng milih keunsi sandi (12–128 karakter) pikeun ngaktipkeun keanggotaan school_admin.',
        'Ulah kantos ngirim keunsi sandi Sakola atawa kredensial aktivasi naon waé liwat respons API penyiapan.',
        'Ngan pikeun pangembangan lokal, seed bootstrap Sakola nyieun sakola demo sareng akun admin sareng staf.',
      ],
    },
  },
  {
    id: 'overview',
    icon: LayoutDashboard,
    endpoints: ['GET /api/tenants', 'GET /api/operators'],
    title: { en: 'Overview and lists', id: 'Ikhtisar dan daftar', su: 'Ringkesan sareng daptar' },
    description: {
      en: 'What the main pages show and where their numbers come from.',
      id: 'Yang ditampilkan halaman utama dan dari mana angka-angkanya berasal.',
      su: 'Naon anu ditembongkeun halaman utama sareng ti mana angka-angkana.',
    },
    items: {
      en: [
        'Overview metrics: total school workspaces, active workspaces, items needing attention, and operator count.',
        'The operator count and the whole Operators page are hidden for account managers, and the overview only counts the workspaces they own.',
        'Needs attention counts workspaces that are provisioning or provisioning_failed.',
        'Each page reloads its data when you open it, and Refresh reloads the current page.',
      ],
      id: [
        'Metrik ikhtisar: total ruang kerja sekolah, ruang kerja aktif, hal yang perlu perhatian, dan jumlah operator.',
        'Jumlah operator dan seluruh halaman Operator disembunyikan untuk pengelola akun, dan ikhtisar hanya menghitung ruang kerja yang mereka miliki.',
        'Perlu perhatian menghitung ruang kerja yang sedang disiapkan atau gagal disiapkan.',
        'Setiap halaman memuat ulang datanya saat Anda membukanya, dan tombol Muat ulang memuat halaman saat ini kembali.',
      ],
      su: [
        'Métrik ringkesan: total ruang gawé sakola, ruang gawé aktif, anu perlu perhatian, sareng jumlah operator.',
        'Jumlah operator sareng kabeh halaman Operator disumputkeun keur nu ngurus akun, sareng ringkasan ngan ngitung ruang gawé nu boga maranéhna.',
        'Perlu perhatian ngitung ruang gawé anu nuju disiapkeun atawa gagal disiapkeun.',
        'Unggal halaman muat deui datana nalika Anjeun mbuka, sareng tombol Segarkeun muat deui halaman ayeuna.',
      ],
    },
  },
  {
    id: 'audit',
    icon: ScrollText,
    endpoints: ['GET /api/audit-logs (max 100)'],
    title: { en: 'Audit logs', id: 'Log audit', su: 'Log audit' },
    description: {
      en: 'Security and lifecycle events recorded across the Platform control plane.',
      id: 'Peristiwa keamanan dan siklus hidup yang tercatat di pusat kendali Platform.',
      su: 'Kajadian kaamanan sareng siklus hirup anu kacatet dina panel kendali Platform.',
    },
    items: {
      en: [
        'Operators (platform_admin and platform_read_only) can inspect the 100 most recent platform audit events on the Audit logs page.',
        'Recorded events include workspace creation, provisioning retries, workspace suspension/reactivation, operator invitations, role changes, and account profile/password updates.',
        'Sensitive credentials, tokens, and password hashes are never stored in audit details.',
      ],
      id: [
        'Operator (platform_admin dan platform_read_only) dapat memeriksa 100 peristiwa audit platform terbaru di halaman Log audit.',
        'Peristiwa yang dicatat meliputi pembuatan ruang kerja, percobaan ulang penyiapan, penangguhan/pengaktifan kembali ruang kerja, undangan operator, perubahan peran, serta pembaruan profil dan kata sandi.',
        'Kredensial sensitif, token, dan hash kata sandi tidak pernah disimpan dalam detail audit.',
      ],
      su: [
        'Operator (platform_admin sareng platform_read_only) tiasa mariksa 100 kajadian audit platform panganyarna dina halaman Log audit.',
        'Kajadian anu dicatet kalebet nyieun ruang gawé, nyobian deui penyiapan, ngagantungkeun/ngaktipkeun deui ruang gawé, undangan operator, parobihan peran, sareng apdét profil atanapi keunsi sandi.',
        'Kredensial sensitif, token, sareng hash keunsi sandi teu kantos disimpen dina rincian audit.',
      ],
    },
  },
  {
    id: 'settings',
    icon: Settings,
    endpoints: ['PATCH /api/account/profile', 'POST /api/account/password'],
    title: { en: 'Account settings', id: 'Pengaturan akun', su: 'Pangaturan akun' },
    description: {
      en: 'How signed-in users update their display name and change their password.',
      id: 'Bagaimana pengguna yang masuk memperbarui nama tampilan dan mengganti kata sandi.',
      su: 'Kumaha pamaké anu parantos lebet ngapdét ngaran tampilan sareng ngaganti keunsi sandi.',
    },
    items: {
      en: [
        'Any signed-in Platform user can update their display name on the Account settings page.',
        'Changing a password requires verifying the current password and entering a new 12–128 character password twice.',
        'Both profile updates and password changes are recorded in the platform audit log.',
      ],
      id: [
        'Setiap pengguna Platform yang masuk dapat memperbarui nama tampilan di halaman Pengaturan akun.',
        'Mengganti kata sandi memerlukan verifikasi kata sandi saat ini dan memasukkan kata sandi baru 12–128 karakter dua kali.',
        'Pembaruan profil maupun perubahan kata sandi dicatat di log audit platform.',
      ],
      su: [
        'Unggal pamaké Platform anu lebet tiasa ngapdét ngaran tampilan dina halaman Pangaturan akun.',
        'Ngaganti keunsi sandi merlukeun verifikasi keunsi sandi ayeuna sareng ngalebetkeun keunsi sandi énggal 12–128 karakter dua kali.',
        'Apdét profil sareng parobihan keunsi sandi dicatet dina log audit platform.',
      ],
    },
  },
  {
    id: 'appearance',
    icon: Palette,
    title: { en: 'Appearance controls', id: 'Kontrol tampilan', su: 'Kontrol tampilan' },
    description: {
      en: 'Theme and language settings for this console.',
      id: 'Pengaturan tema dan bahasa untuk konsol ini.',
      su: 'Pangaturan téma sareng basa pikeun konsol ieu.',
    },
    items: {
      en: [
        'Choose a light, dark, or system theme, and English, Bahasa Indonesia, or Basa Sunda.',
        'The controls sit at the top of the sidebar footer, above the protected-access card.',
        'Choices are stored in the browser and apply immediately, without a reload.',
      ],
      id: [
        'Pilih tema terang, gelap, atau sistem, dan Bahasa Inggris, Bahasa Indonesia, atau Basa Sunda.',
        'Kontrol berada di bagian atas footer sidebar, di atas kartu akses terlindungi.',
        'Pilihan disimpan di browser dan langsung berlaku, tanpa memuat ulang.',
      ],
      su: [
        'Pilih téma terang, gulita, atawa sistem, sareng Basa Inggris, Basa Indonesia, atawa Basa Sunda.',
        'Kontrol aya di luhur footer sidebar, di luhur kartu akses dilindungi.',
        'Pilihan disimpen dina browsér sareng laku langsung, tanpa muat deui.',
      ],
    },
  },
  {
    id: 'bootstrap',
    icon: Database,
    title: { en: 'Development bootstrap', id: 'Bootstrap pengembangan', su: 'Bootstrap pangembangan' },
    description: {
      en: 'How a fresh local database gets its first accounts.',
      id: 'Bagaimana basis data lokal yang segar mendapatkan akun pertamanya.',
      su: 'Kumaha database lokal anu énggal nampi akun munggaranna.',
    },
    items: {
      en: [
        'The Platform seed creates the first Platform Admin only when PLATFORM_BOOTSTRAP_ENABLED is set.',
        'The School seed requires NODE_ENV=development and SCHOOL_BOOTSTRAP_ENABLED=true, and refuses to modify existing accounts.',
        'Bootstrap accounts are for development only; in production, operator access comes from invitations and account managers register themselves.',
      ],
      id: [
        'Seed Platform membuat Platform Admin pertama hanya jika PLATFORM_BOOTSTRAP_ENABLED diatur.',
        'Seed Sekolah mensyaratkan NODE_ENV=development dan SCHOOL_BOOTSTRAP_ENABLED=true, dan menolak mengubah akun yang sudah ada.',
        'Akun bootstrap hanya untuk pengembangan; di produksi, akses operator berasal dari undangan dan pengelola akun mendaftar sendiri.',
      ],
      su: [
        'Seed Platform nyieun Platform Admin munggaran ngan upami PLATFORM_BOOTSTRAP_ENABLED disetel.',
        'Seed Sakola merlukeun NODE_ENV=development sareng SCHOOL_BOOTSTRAP_ENABLED=true, sareng nolak ngarobih anu geus aya.',
        'Akun bootstrap kanggo pangembangan waé; di produksi, akses operator datangna tina undangan sareng nu ngurus akun registering sorangan.',
      ],
    },
  },
  {
    id: 'security',
    icon: Lock,
    title: { en: 'Security rules', id: 'Aturan keamanan', su: 'Aturan kaamanan' },
    description: {
      en: 'Configuration rules that must not be bent, in any environment.',
      id: 'Aturan konfigurasi yang tidak boleh dilanggar, di lingkungan apa pun.',
      su: 'Aturan konfigurasi nu teu boleh dilanggar, di lingkungan naon waé.',
    },
    items: {
      en: [
        'Use distinct random PLATFORM_AUTH_SECRET, SCHOOL_AUTH_SECRET, and SCHOOL_PROVISIONING_SECRET values of at least 32 characters.',
        'Only VITE_* variables reach the browser bundle; .env is not a frontend config file.',
        'The SMTP sender is restricted to hi.edusync@gmail.com, and PLATFORM_PUBLIC_URL must be HTTPS outside local development.',
        'Never send live email during development verification unless private credentials are configured and explicitly intended.',
      ],
      id: [
        'Gunakan nilai PLATFORM_AUTH_SECRET, SCHOOL_AUTH_SECRET, dan SCHOOL_PROVISIONING_SECRET yang berbeda dan acak, minimal 32 karakter.',
        'Hanya variabel VITE_* yang masuk ke bundel browser; .env bukan berkas konfigurasi frontend.',
        'Pengirim SMTP dibatasi ke hi.edusync@gmail.com, dan PLATFORM_PUBLIC_URL harus HTTPS di luar pengembangan lokal.',
        'Jangan pernah mengirim email sungguhan selama verifikasi pengembangan kecuali kredensial privat sudah dikonfigurasi dan memang dimaksudkan.',
      ],
      su: [
        'Anggo nilai PLATFORM_AUTH_SECRET, SCHOOL_AUTH_SECRET, sareng SCHOOL_PROVISIONING_SECRET anu béda sareng acak, minimal 32 karakter.',
        'Ngan variabel VITE_* anu asup ka bundel browsér; .env teu berkas konfigurasi frontend.',
        'Pengirim SMTP dibatesan ka hi.edusync@gmail.com, sareng PLATFORM_PUBLIC_URL kedah HTTPS di luar pangembangan lokal.',
        'Ulah kantos ngirim email beneran salama verifikasi pangembangan, sabab ngan boleh upami kredensial privat parantos dikonfigurasi sareng dituju sacara tegas.',
      ],
    },
  },
] as const satisfies readonly DocSection[];
