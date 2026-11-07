import { z } from 'zod';

/** Kunci baris `platform_setting` untuk isi situs Edusync (halaman utama, profil perusahaan, metadata). */
export const SITE_CONTENT_KEY = 'site';

export const SITE_LOCALES = ['id', 'en', 'su'] as const;
export type SiteLocale = (typeof SITE_LOCALES)[number];

/** Daftar tertutup ikon lucide untuk kartu fitur (nama persis seperti ekspor `lucide-react`). */
export const SITE_ICONS = [
  'BookOpenCheck',
  'CalendarCheck',
  'ClipboardList',
  'Wallet',
  'Printer',
  'UserPlus',
  'Users',
  'Megaphone',
  'Fingerprint',
  'KeyRound',
  'GraduationCap',
  'School',
  'Landmark',
  'ShieldCheck',
  'Globe',
  'Rocket',
  'Settings2',
  'Building2',
  'ChartBar',
  'MessageSquare',
  'Smartphone',
  'FileText',
  'Award',
  'BookOpen',
  'Heart',
  'Star',
  'Lock',
  'Cloud',
  'Mail',
  'Phone',
] as const;
export type SiteIcon = (typeof SITE_ICONS)[number];

const text = (max: number) => z.string().trim().max(max);
const required = (max: number) => z.string().trim().min(1).max(max);

const optionalUrl = z.union([z.literal(''), z.url({ protocol: /^https?$/ }).max(300)]);

export const siteLocaleSchema = z.object({
  tagline: text(160).describe('Kalimat singkat di footer dan cadangan deskripsi'),
  metaTitle: required(120).describe('Judul tab peramban dan judul saat dibagikan'),
  metaDescription: text(320).describe('Deskripsi untuk mesin pencari dan pratinjau tautan'),
  eyebrow: text(120).describe('Label kecil di atas judul hero'),
  heroTitle: required(160),
  heroSubtitle: text(500),
  ctaPrimary: required(40).describe('Tombol utama (menuju pendaftaran)'),
  ctaSecondary: required(40).describe('Tombol kedua (menuju masuk)'),
  featuresTitle: required(120),
  featuresSubtitle: text(300),
  aboutTitle: text(120),
  aboutBody: text(4000).describe('Profil perusahaan; baris kosong memisahkan paragraf'),
  footerText: text(300).describe('Teks tambahan di footer'),
});
export type SiteLocaleContent = z.infer<typeof siteLocaleSchema>;

const featureText = z.object({ title: required(80), description: text(240) });

export const siteFeatureSchema = z.object({
  icon: z.enum(SITE_ICONS),
  text: z.object({ id: featureText, en: featureText, su: featureText }),
});
export type SiteFeature = z.infer<typeof siteFeatureSchema>;

export const SITE_MAX_FEATURES = 12;

export const siteSectionsSchema = z.object({
  features: z.boolean(),
  how: z.boolean(),
  audience: z.boolean(),
  security: z.boolean(),
  about: z.boolean(),
  contact: z.boolean(),
  cta: z.boolean(),
});
export type SiteSections = z.infer<typeof siteSectionsSchema>;

export const siteContentSchema = z.object({
  brandName: required(60),
  locales: z.object({ id: siteLocaleSchema, en: siteLocaleSchema, su: siteLocaleSchema }),
  features: z.array(siteFeatureSchema).max(SITE_MAX_FEATURES),
  contact: z.object({
    email: z.union([z.literal(''), z.email().max(254)]),
    phone: text(40),
    whatsapp: text(40),
    address: text(300),
  }),
  social: z.object({
    instagram: optionalUrl,
    facebook: optionalUrl,
    youtube: optionalUrl,
    tiktok: optionalUrl,
    x: optionalUrl,
    linkedin: optionalUrl,
  }),
  sections: siteSectionsSchema,
});
export type SiteContent = z.infer<typeof siteContentSchema>;

type FeatureDefault = readonly [
  icon: SiteIcon,
  id: [string, string],
  en: [string, string],
  su: [string, string],
];

/** Sepuluh kartu fitur yang selama ini tertulis di pesan `landing` (f1..f10). */
const DEFAULT_FEATURES: readonly FeatureDefault[] = [
  [
    'BookOpenCheck',
    [
      'Akademik dan kurikulum',
      'Kelola tahun ajaran, kelas, mata pelajaran, dan kurikulum tiap unit sekolah.',
    ],
    ['Academics and curriculum', 'Manage academic years, classes, subjects, and curricula for each school.'],
    [
      'Akadémik jeung kurikulum',
      'Kokolakeun taun ajar, kelas, mata pelajaran, jeung kurikulum unggal unit sakola.',
    ],
  ],
  [
    'CalendarCheck',
    ['Absensi', 'Catat kehadiran siswa dengan cepat dan lihat rekapnya.'],
    ['Attendance', 'Record student attendance quickly and review the summaries.'],
    ['Absénsi', 'Catet kahadiran siswa gancang tur tingali rekapna.'],
  ],
  [
    'ClipboardList',
    ['Buku nilai dan rapor', 'Guru mengisi nilai, lalu rapor tersusun dari data yang sama.'],
    ['Gradebook and report cards', 'Teachers enter grades, and report cards are built from the same data.'],
    ['Buku nilai jeung rapor', 'Guru ngeusian nilai, tuluy rapor disusun tina data anu sarua.'],
  ],
  [
    'Wallet',
    [
      'Keuangan dan tagihan SPP',
      'Terbitkan tagihan, pantau pembayaran, dan kelola administrasi keuangan sekolah.',
    ],
    [
      'Finance and tuition billing',
      'Issue invoices, track payments, and manage school finance administration.',
    ],
    [
      'Kauangan jeung tagihan SPP',
      'Kaluarkeun tagihan, pantau pamayaran, jeung kokolakeun administrasi kauangan sakola.',
    ],
  ],
  [
    'Printer',
    [
      'Ujian CBT dan cetak',
      'Bank soal, ujian berbasis komputer atau cetak, serta pemindaian lembar jawaban OMR.',
    ],
    [
      'CBT and printed exams',
      'Question bank, computer-based or printed exams, and OMR answer sheet scanning.',
    ],
    [
      'Ujian CBT jeung citak',
      'Bank soal, ujian basis komputer atawa citak, sarta pamindaian lambar jawaban OMR.',
    ],
  ],
  [
    'UserPlus',
    ['PPDB / penerimaan siswa', 'Terima pendaftar baru secara daring dan proses seleksinya di satu tempat.'],
    ['Admissions', 'Receive new applicants online and handle selection in one place.'],
    ['PPDB / panarimaan siswa', 'Tampa pendaptar anyar sacara daring tur prosés seléksina dina hiji tempat.'],
  ],
  [
    'Users',
    [
      'Portal wali dan siswa',
      'Wali murid dan siswa melihat informasi yang relevan dengan akun masing-masing.',
    ],
    ['Parent and student portal', 'Parents and students see the information relevant to their own accounts.'],
    [
      'Portal wali jeung siswa',
      'Wali murid jeung siswa nempo inpormasi anu patali jeung akun masing-masing.',
    ],
  ],
  [
    'Megaphone',
    [
      'Situs web dan pengumuman',
      'Setiap sekolah memiliki situs web publik dengan pengumuman yang mudah diperbarui.',
    ],
    [
      'Website and announcements',
      'Every school gets a public website with announcements that are easy to update.',
    ],
    [
      'Situs wéb jeung pengumuman',
      'Unggal sakola boga situs wéb umum kalayan pengumuman anu gampang dianyarkeun.',
    ],
  ],
  [
    'Fingerprint',
    ['Identitas sekolah', 'Atur nama, logo, dan data identitas sekolah yang dipakai di seluruh dokumen.'],
    ['School identity', 'Set the name, logo, and identity details used across all documents.'],
    ['Idéntitas sakola', 'Atur ngaran, logo, jeung data idéntitas sakola anu dipaké dina sakabéh dokumén.'],
  ],
  [
    'KeyRound',
    ['Hak akses per peran', 'Setiap pengguna hanya melihat dan mengubah apa yang menjadi tanggung jawabnya.'],
    ['Role-based access', 'Each user sees and changes only what they are responsible for.'],
    ['Hak aksés per peran', 'Unggal pamaké ngan ukur nempo jeung ngarobah naon anu jadi tanggung jawabna.'],
  ],
];

/**
 * Isi bawaan = persis teks halaman utama saat ini (pesan `landing`), sehingga tidak ada yang berubah sampai staf
 * menyuntingnya. Tes di web membandingkan angka ini dengan berkas pesan.
 */
export const DEFAULT_SITE_CONTENT: Readonly<SiteContent> = {
  brandName: 'Edusync',
  locales: {
    id: {
      tagline: 'Platform manajemen sekolah multi-lembaga.',
      metaTitle: 'Edusync — Platform manajemen sekolah untuk yayasan dan banyak unit',
      metaDescription:
        'Edusync membantu satu lembaga mengelola banyak unit sekolah: akademik, absensi, nilai dan rapor, keuangan, ujian CBT, PPDB, portal wali, dan situs web sekolah.',
      eyebrow: 'Platform manajemen sekolah multi-lembaga',
      heroTitle: 'Satu platform untuk seluruh unit sekolah di lembaga Anda',
      heroSubtitle:
        'Yayasan dapat mengelola SMP, SMK, dan unit lainnya dalam satu tempat. Setiap sekolah punya alamat sendiri, data yang terpisah, dan hak akses sesuai peran.',
      ctaPrimary: 'Daftarkan lembaga',
      ctaSecondary: 'Masuk ke akun',
      featuresTitle: 'Semua kebutuhan sekolah dalam satu sistem',
      featuresSubtitle: 'Dari ruang kelas sampai kantor tata usaha, modul-modul Edusync saling terhubung.',
      aboutTitle: 'Tentang kami',
      aboutBody: '',
      footerText: '',
    },
    en: {
      tagline: 'Multi-organization school management platform.',
      metaTitle: 'Edusync — School management platform for foundations and multiple schools',
      metaDescription:
        'Edusync lets one organization manage many schools: academics, attendance, grades and report cards, finance, CBT exams, admissions, parent portal, and school websites.',
      eyebrow: 'Multi-organization school management platform',
      heroTitle: 'One platform for every school in your organization',
      heroSubtitle:
        'A foundation can manage junior highs, vocational schools, and other units in one place. Each school has its own address, separate data, and role-based access.',
      ctaPrimary: 'Register your organization',
      ctaSecondary: 'Sign in',
      featuresTitle: 'Everything a school needs in one system',
      featuresSubtitle: 'From the classroom to the administration office, Edusync modules work together.',
      aboutTitle: 'About us',
      aboutBody: '',
      footerText: '',
    },
    su: {
      tagline: 'Platform manajemén sakola multi-lembaga.',
      metaTitle: 'Edusync — Platform manajemén sakola pikeun yayasan jeung loba unit',
      metaDescription:
        'Edusync ngabantu hiji lembaga ngokolakeun loba unit sakola: akadémik, absénsi, nilai jeung rapor, kauangan, ujian CBT, PPDB, portal wali, jeung situs wéb sakola.',
      eyebrow: 'Platform manajemén sakola multi-lembaga',
      heroTitle: 'Hiji platform pikeun sakumna unit sakola di lembaga Anjeun',
      heroSubtitle:
        'Yayasan tiasa ngokolakeun SMP, SMK, jeung unit séjénna dina hiji tempat. Unggal sakola boga alamat nyalira, data anu kapisah, jeung hak aksés luyu jeung peran.',
      ctaPrimary: 'Daftarkeun lembaga',
      ctaSecondary: 'Lebet kana akun',
      featuresTitle: 'Sagala kabutuhan sakola dina hiji sistem',
      featuresSubtitle:
        'Ti rohangan kelas nepi ka kantor tata usaha, modul Edusync nyambung hiji jeung lianna.',
      aboutTitle: 'Ngeunaan kami',
      aboutBody: '',
      footerText: '',
    },
  },
  features: DEFAULT_FEATURES.map(([icon, id, en, su]) => ({
    icon,
    text: {
      id: { title: id[0], description: id[1] },
      en: { title: en[0], description: en[1] },
      su: { title: su[0], description: su[1] },
    },
  })),
  contact: { email: '', phone: '', whatsapp: '', address: '' },
  social: { instagram: '', facebook: '', youtube: '', tiktok: '', x: '', linkedin: '' },
  sections: {
    features: true,
    how: true,
    audience: true,
    security: true,
    about: false,
    contact: false,
    cta: true,
  },
};

const clone = (v: SiteContent): SiteContent => JSON.parse(JSON.stringify(v));

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Gabungkan isi tersimpan dengan bawaan: kolom yang belum ada (mis. ditambahkan versi baru) memakai bawaan, dan isi
 * yang rusak seluruhnya dibuang sehingga situs tidak pernah kosong.
 */
export function resolveSiteContent(stored: unknown): SiteContent {
  const d = DEFAULT_SITE_CONTENT;
  if (!isRecord(stored)) return clone(d);
  const locales = isRecord(stored.locales) ? stored.locales : {};
  const part = (v: unknown) => (isRecord(v) ? v : {});
  const candidate = {
    ...d,
    ...stored,
    locales: {
      id: { ...d.locales.id, ...part(locales.id) },
      en: { ...d.locales.en, ...part(locales.en) },
      su: { ...d.locales.su, ...part(locales.su) },
    },
    contact: { ...d.contact, ...part(stored.contact) },
    social: { ...d.social, ...part(stored.social) },
    sections: { ...d.sections, ...part(stored.sections) },
  };
  const parsed = siteContentSchema.safeParse(candidate);
  return parsed.success ? parsed.data : clone(d);
}

/** Teks satu bahasa; bahasa tak dikenal memakai Indonesia. */
export function siteLocaleOf(content: SiteContent, locale: string): SiteLocaleContent {
  return content.locales[
    (SITE_LOCALES as readonly string[]).includes(locale) ? (locale as SiteLocale) : 'id'
  ];
}

/** Paragraf dari teks profil: dipisah baris kosong, paragraf kosong dibuang. */
export function siteParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
