import { createHash, randomBytes } from 'node:crypto';
import {
  addDays,
  DEFAULT_EXAM_PAPER,
  DEFAULT_LETTER_TEMPLATES,
  DEFAULT_PKL_ASPECTS,
  DEFAULT_PREDICATE_DESCRIPTIONS,
  DEFAULT_TEMPLATES,
  defaultExamCardLayout,
  defaultStudentCardLayout,
  descriptionOf,
  EVENT_KEYS,
  type EventKey,
  finalGrade,
  formatAgendaNumber,
  formatLetterNumber,
  formatRupiah,
  IDENTITY_CODE_ALPHABET,
  IDENTITY_CODE_LENGTH,
  LATE_FEE_PERIOD_PREFIX,
  predicateOf,
  renderTemplate,
  SURAHS,
} from '@edusync/contracts';
import {
  academicYear,
  admissionCounter,
  admissionDocumentType,
  admissionPeriod,
  and,
  announcement,
  application,
  applicationDocument,
  applicationStatusLog,
  assessment,
  assignRoles,
  attendanceCard,
  attendanceDevice,
  attendancePolicy,
  calendarEvent,
  cardTemplate,
  classRoom,
  createDb,
  dailyAttendance,
  dutyRoster,
  enrollment,
  eq,
  exam,
  examAnswer,
  examAttempt,
  examPaperSetting,
  examQuestion,
  examType,
  extracurricular,
  extracurricularAssessment,
  extracurricularAttendance,
  extracurricularMember,
  extracurricularSession,
  finCounter,
  finDiscountRule,
  finFeePlan,
  finFeeTarget,
  finFeeType,
  finGatewaySetting,
  finInvoice,
  finLateFeeSetting,
  finPayment,
  finPaymentItem,
  finPaymentMethod,
  finStudentDiscount,
  gradeComponent,
  gradingSetting,
  guardian,
  hafalanEntry,
  hafalanTarget,
  halaqah,
  halaqahMember,
  ibadahItem,
  ibadahLog,
  inArray,
  invitation,
  lessonAttendance,
  lessonPeriod,
  letter,
  letterCounter,
  letterSetting,
  letterTemplate,
  member,
  memberRole,
  msgMessage,
  msgSetting,
  msgTemplate,
  pklAspect,
  pklJournal,
  pklPartner,
  pklPeriod,
  pklPlacement,
  pklScore,
  pklSetting,
  pklVisit,
  portalInvite,
  portalLink,
  program,
  question,
  reportCard,
  reportSetting,
  scheduleEntry,
  school,
  schoolCurriculum,
  schoolDomain,
  schoolIdentity,
  schoolLevel,
  schoolProfile,
  schoolSetting,
  score,
  semester,
  signedDocument,
  signerCredential,
  sql,
  student,
  studentGuardian,
  studentIdentityCode,
  subject,
  type Tx,
  tapEvent,
  teacher,
  teachingAssignment,
  user,
  waAccount,
} from '@edusync/db';
import { buildApp } from '../src/app';
import { loadEnv } from '../src/env';

/**
 * Data contoh (demo) lengkap untuk SATU sekolah di database lokal: SMK Miftahul Huda (`smk-miftahul-huda`).
 *
 * - Idempoten: seluruh isi sekolah itu (siswa, guru, kelas, jadwal, absensi, nilai, keuangan, dst.) dihapus lalu dibuat
 *   ulang dalam SATU transaksi. Hanya baris dengan `school_id` sekolah ini yang disentuh. Yang dipertahankan: baris
 *   `school`, entitlement, peran, anggota non-demo, identitas/logo/berkas sekolah, kurikulum, tingkat, jam pelajaran,
 *   jenis ujian, kategori ekskul, metode bayar, dan templat kartu yang sudah ada (di-upsert, bukan dihapus).
 * - Akun login demo (`*@smk-demo.test`) dibuat lewat mekanisme yang sama dengan seed-dev (DEV_SEED_PASSWORD).
 * - Acak deterministik (PRNG berbenih), tanggal relatif terhadap SEED_TODAY (bawaan 2026-11-07).
 * - Tidak mengirim apa pun: tidak ada baris outbox, dan pesan WhatsApp hanya berupa riwayat berstatus sent/skipped.
 */
const SLUG = 'smk-miftahul-huda';
const TODAY = process.env.SEED_TODAY ?? '2026-11-07';
const DEMO_SUFFIX = '@smk-demo.test';

const env = loadEnv();
if (env.NODE_ENV !== 'development') throw new Error('seed-demo-smk hanya untuk NODE_ENV=development');
const password = process.env.DEV_SEED_PASSWORD;
if (!password || password.length < 12) throw new Error('DEV_SEED_PASSWORD wajib diisi, minimal 12 karakter');
const ownerUrl = process.env.DATABASE_OWNER_URL;
if (!ownerUrl) throw new Error('DATABASE_OWNER_URL wajib diisi (seed menulis lintas tabel tanpa RLS)');

/* ---------------------------------------------------------------- utilitas ---------------------------------------------------------------- */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261107);
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]!;
const chance = (p: number) => rnd() < p;
const gauss = () => (rnd() + rnd() + rnd() - 1.5) * 2;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
const pad = (n: number, w: number) => String(n).padStart(w, '0');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const weekdayOf = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay() || 7;
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+07:00`);
const hhmm = (mins: number) => `${pad(Math.floor(mins / 60), 2)}:${pad(mins % 60, 2)}`;
const MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

type Tbl = { $inferInsert: unknown; $inferSelect: unknown };
interface Inserter {
  values(v: unknown[]): PromiseLike<unknown> & { returning(): Promise<unknown[]> };
}
/** Sisipkan baris per potongan dan kembalikan baris hasil (urutan sama dengan masukan). */
async function ins<T extends Tbl>(
  tx: Tx,
  table: T,
  rows: T['$inferInsert'][],
  size = 800,
): Promise<T['$inferSelect'][]> {
  const out: T['$inferSelect'][] = [];
  for (let i = 0; i < rows.length; i += size) {
    const part = rows.slice(i, i + size);
    const res = await (tx.insert(table as never) as unknown as Inserter).values(part).returning();
    out.push(...(res as T['$inferSelect'][]));
  }
  return out;
}
/** Sama seperti `ins` tetapi tanpa mengembalikan baris (lebih ringan untuk tabel besar). */
async function put<T extends Tbl>(tx: Tx, table: T, rows: T['$inferInsert'][], size = 1000) {
  for (let i = 0; i < rows.length; i += size) {
    const part = rows.slice(i, i + size);
    if (part.length > 0) await (tx.insert(table as never) as unknown as Inserter).values(part);
  }
  return rows.length;
}

const stats: [string, number][] = [];
const note = (label: string, n: number) => stats.push([label, n]);

/* ---------------------------------------------------------------- data statis ---------------------------------------------------------------- */

const MALE_FIRST = [
  'Muhammad',
  'Ahmad',
  'Rizky',
  'Fauzan',
  'Aditya',
  'Dimas',
  'Fikri',
  'Rafi',
  'Naufal',
  'Arif',
  'Bagas',
  'Dwi',
  'Eko',
  'Farhan',
  'Galih',
  'Hafidz',
  'Iqbal',
  'Jaelani',
  'Khoirul',
  'Lutfi',
  'Maulana',
  'Nanda',
  'Pandu',
  'Rangga',
  'Syahrul',
  'Taufik',
  'Wahyu',
  'Yusuf',
  'Zaki',
  'Ilham',
  'Reza',
  'Hilman',
  'Ridwan',
  'Asep',
  'Ujang',
  'Dede',
  'Cecep',
  'Ade',
  'Yayan',
  'Agus',
  'Imam',
  'Rifki',
  'Alif',
  'Raka',
  'Gilang',
  'Daffa',
  'Yoga',
  'Bayu',
];
const MALE_LAST = [
  'Pratama',
  'Saputra',
  'Ramadhan',
  'Hidayat',
  'Nugraha',
  'Firmansyah',
  'Maulana',
  'Kurniawan',
  'Setiawan',
  'Permana',
  'Wijaya',
  'Hakim',
  'Fadilah',
  'Suryana',
  'Hermawan',
  'Gunawan',
  'Rahman',
  'Abdullah',
  'Alfarizi',
  'Septian',
  'Syahputra',
  'Nurzaman',
  'Sulaeman',
  'Supriatna',
  'Kusuma',
  'Santoso',
  'Lesmana',
  'Mulyana',
  'Ardiansyah',
  'Fauzi',
  'Anwar',
  'Rohman',
  'Jaya',
  'Ismail',
  'Hasan',
];
const FEMALE_FIRST = [
  'Siti',
  'Nur',
  'Aisyah',
  'Nabila',
  'Dinda',
  'Salsa',
  'Putri',
  'Intan',
  'Rani',
  'Tiara',
  'Wulan',
  'Annisa',
  'Aulia',
  'Bunga',
  'Citra',
  'Desi',
  'Eka',
  'Fitri',
  'Gina',
  'Hana',
  'Indah',
  'Jihan',
  'Kirana',
  'Lina',
  'Mawar',
  'Nova',
  'Rahma',
  'Sinta',
  'Tika',
  'Yuni',
  'Zahra',
  'Alya',
  'Cantika',
  'Dewi',
  'Elis',
  'Fauziah',
  'Nia',
  'Neneng',
  'Euis',
  'Imas',
  'Ratna',
  'Shafira',
  'Nadia',
  'Khalisa',
];
const FEMALE_LAST = [
  'Aulia',
  'Rahmawati',
  'Lestari',
  'Anjani',
  'Permatasari',
  'Salsabila',
  'Fitriani',
  'Handayani',
  'Maharani',
  'Kamila',
  'Zahra',
  'Putri',
  'Nurhaliza',
  'Oktaviani',
  'Apriliani',
  'Wulandari',
  'Safitri',
  'Khairunnisa',
  'Amelia',
  'Rosdiana',
  'Sari',
  'Yulianti',
  'Nuraeni',
  'Marlina',
  'Komariah',
  'Hasanah',
  'Ramadhani',
  'Pertiwi',
];
const BIRTH_PLACES = ['Lebak', 'Rangkasbitung', 'Serang', 'Pandeglang', 'Tangerang', 'Bogor', 'Sukabumi'];
const KAMPUNG = [
  'Kp. Cibogo',
  'Kp. Ciseureuh',
  'Kp. Pasir Kaler',
  'Kp. Cileles',
  'Kp. Warung Gunung',
  'Kp. Sukarendah',
  'Kp. Cikadu',
  'Kp. Citeras',
  'Kp. Babakan',
  'Kp. Cijoro',
];
const DESA = ['Sukarendah', 'Cileles', 'Warunggunung', 'Cimarga', 'Rangkasbitung Timur', 'Mekarsari'];
const PHONE_PREFIX = ['812', '813', '821', '822', '852', '857', '858', '878', '895', '896'];
const phone = () => `62${pick(PHONE_PREFIX)}${pad(int(0, 99_999_999), 8)}`;
const address = () =>
  `${pick(KAMPUNG)} RT ${pad(int(1, 9), 2)}/RW ${pad(int(1, 5), 2)}, Desa ${pick(DESA)}, Kec. Warunggunung, Kab. Lebak, Banten`;

const PROGRAMS: [string, string][] = [
  ['TKJ', 'Teknik Komputer dan Jaringan'],
  ['RPL', 'Rekayasa Perangkat Lunak'],
  ['AKL', 'Akuntansi dan Keuangan Lembaga'],
  ['OTKP', 'Otomatisasi dan Tata Kelola Perkantoran'],
];
const PROGS = ['TKJ', 'RPL', 'AKL'] as const;
type Prog = (typeof PROGS)[number];
const LEVELS = ['X', 'XI', 'XII'] as const;
type Level = (typeof LEVELS)[number];

/** Mapel tambahan di atas 11 mapel yang sudah ada di sekolah. */
const EXTRA_SUBJECTS: [string, string][] = [
  ['ARB', 'Bahasa Arab'],
  ['TFZ', 'Tahfidz Al-Qur’an'],
  ['ASJ', 'Administrasi Sistem Jaringan'],
  ['TLJ', 'Teknologi Layanan Jaringan'],
  ['AIJ', 'Administrasi Infrastruktur Jaringan'],
  ['PBO', 'Pemrograman Berorientasi Objek'],
  ['PWPB', 'Pemrograman Web dan Perangkat Bergerak'],
  ['BD', 'Basis Data'],
  ['AKU', 'Akuntansi Keuangan Lembaga'],
  ['KOA', 'Komputer Akuntansi'],
  ['AKP', 'Akuntansi Perpajakan'],
];
const BASE_SUBJECTS: [string, string][] = [
  ['PAI', 'Pendidikan Agama dan Budi Pekerti'],
  ['PP', 'Pendidikan Pancasila'],
  ['BIN', 'Bahasa Indonesia'],
  ['MTK', 'Matematika'],
  ['BIG', 'Bahasa Inggris'],
  ['PJOK', 'Pendidikan Jasmani, Olahraga, dan Kesehatan'],
  ['SEJ', 'Sejarah'],
  ['SBD', 'Seni dan Budaya'],
  ['INF', 'Informatika'],
  ['DPK', 'Dasar-dasar Program Keahlian'],
  ['PKK', 'Projek Kreatif dan Kewirausahaan'],
];
const PRODUCTIVE: Record<Prog, string[]> = {
  TKJ: ['ASJ', 'TLJ', 'AIJ'],
  RPL: ['PBO', 'PWPB', 'BD'],
  AKL: ['AKU', 'KOA', 'AKP'],
};
/** Selisih tingkat kesulitan mapel terhadap nilai rata-rata (dipakai membangkitkan nilai). */
const SUBJECT_OFFSET: Record<string, number> = {
  MTK: -6,
  INF: 2,
  BIG: -3,
  PAI: 4,
  TFZ: 5,
  PJOK: 6,
  DPK: 0,
  ARB: -2,
  PP: 3,
};

interface TeacherDef {
  key: string;
  name: string;
  gender: 1 | 2;
  honorer?: boolean;
}
const TEACHERS: TeacherDef[] = [
  { key: 'kepsek', name: 'Hj. Siti Rahmawati, S.Pd., M.M.', gender: 2 },
  { key: 'wakur', name: 'Drs. Asep Saepudin, M.Pd.', gender: 1 },
  { key: 'pai1', name: 'Ust. H. Ahmad Syarifudin, S.Pd.I.', gender: 1 },
  { key: 'pai2', name: 'Ustadzah Hj. Nurlaela, S.Pd.I.', gender: 2 },
  { key: 'arab', name: 'Ust. Muhamad Zaenal Abidin, Lc.', gender: 1, honorer: true },
  { key: 'tfz1', name: 'Ust. Hafidz Maulana, S.Q.', gender: 1, honorer: true },
  { key: 'tfz2', name: 'Ustadzah Siti Aminah, S.Q.', gender: 2, honorer: true },
  { key: 'pp', name: 'Dra. Lilis Suryani, M.Pd.', gender: 2 },
  { key: 'bin1', name: 'Rina Marlina, S.Pd.', gender: 2 },
  { key: 'bin2', name: 'Neneng Hasanah, S.Pd.', gender: 2 },
  { key: 'mtk1', name: 'Dedi Kurniawan, S.Pd.', gender: 1 },
  { key: 'big1', name: 'Nurul Hidayah, S.Pd.', gender: 2 },
  { key: 'big2', name: 'Anisa Fitriani, S.Pd.', gender: 2, honorer: true },
  { key: 'pjok', name: 'Budi Santoso, S.Pd.', gender: 1 },
  { key: 'sejsbd', name: 'Lina Herlina, S.Pd.', gender: 2 },
  { key: 'inf', name: 'Yoga Pratama, S.Kom.', gender: 1 },
  { key: 'tkj1', name: 'Ahmad Fadli, S.T.', gender: 1 },
  { key: 'tkj2', name: 'Rudi Hartono, S.Kom.', gender: 1 },
  { key: 'rpl1', name: 'Maya Anggraeni, S.Kom.', gender: 2 },
  { key: 'rpl2', name: 'Fajar Nugraha, S.Kom.', gender: 1, honorer: true },
  { key: 'akl1', name: 'Siti Marwah, S.E.', gender: 2 },
  { key: 'akl2', name: 'Retno Wulandari, S.E., M.Ak.', gender: 2 },
  { key: 'pkk', name: 'Hendra Gunawan, S.Pd.', gender: 1 },
  { key: 'bk', name: 'Euis Komariah, S.Psi.', gender: 2 },
  { key: 'pembina', name: 'Irfan Hakim, S.Pd.', gender: 1, honorer: true },
];

function teacherKeyFor(level: Level, prog: Prog, code: string): string {
  switch (code) {
    case 'PAI':
      return level === 'X' ? 'pai1' : 'pai2';
    case 'ARB':
      return 'arab';
    case 'TFZ':
      return level === 'XII' ? 'tfz2' : 'tfz1';
    case 'PP':
      return 'pp';
    case 'BIN':
      return level === 'XII' ? 'bin2' : 'bin1';
    case 'MTK':
      return level === 'XII' ? 'wakur' : 'mtk1';
    case 'BIG':
      return level === 'XII' ? 'big2' : 'big1';
    case 'PJOK':
      return 'pjok';
    case 'SEJ':
    case 'SBD':
      return 'sejsbd';
    case 'INF':
      return 'inf';
    case 'PKK':
      return 'pkk';
    default: {
      // DPK (kelas X) dan mapel produktif (XI/XII).
      const t = { TKJ: ['tkj1', 'tkj2'], RPL: ['rpl1', 'rpl2'], AKL: ['akl1', 'akl2'] }[prog];
      return level === 'XII' ? t[1]! : t[0]!;
    }
  }
}

/** [kode mapel, jam per minggu] untuk satu kelas. */
function subjectHours(level: Level, prog: Prog): [string, number][] {
  if (level === 'X') {
    return [
      ['PAI', 3],
      ['PP', 2],
      ['BIN', 4],
      ['MTK', 4],
      ['BIG', 3],
      ['PJOK', 2],
      ['SEJ', 2],
      ['SBD', 2],
      ['INF', 2],
      ['ARB', 2],
      ['TFZ', 2],
      ['DPK', 6],
    ];
  }
  return [
    ['PAI', 3],
    ['PP', 2],
    ['BIN', 3],
    ['MTK', 3],
    ['BIG', 3],
    ['PJOK', 2],
    ['ARB', 2],
    ['TFZ', 2],
    ...PRODUCTIVE[prog].map((c) => [c, 4] as [string, number]),
    ['PKK', 2],
  ];
}

const HOMEROOM: Record<string, string> = {
  'X TKJ 1': 'tkj1',
  'X RPL 1': 'rpl1',
  'X AKL 1': 'akl1',
  'XI TKJ 1': 'bin1',
  'XI RPL 1': 'big1',
  'XI AKL 1': 'akl2',
  'XII TKJ 1': 'tkj2',
  'XII RPL 1': 'rpl2',
  'XII AKL 1': 'sejsbd',
};

/* ---- fase A: pembangkitan orang (murni, tanpa database) ---- */

interface PGuardian {
  name: string;
  phone: string;
  email: string | null;
}
interface PStudent {
  name: string;
  gender: 'L' | 'P';
  nis: string;
  nisn: string;
  nik: string;
  birthDate: string;
  birthPlace: string;
  address: string;
  phone: string | null;
  status: 'active' | 'graduated' | 'transferred' | 'dropped';
  level: Level;
  prog: Prog;
  className: string;
  /** Tingkat saat ini; lulusan dicatat sebagai XII pada tahun lalu. */
  graduated: boolean;
  guardians: { g: number; relation: 'father' | 'mother' | 'guardian'; primary: boolean }[];
  ability: number;
}

const usedNames = new Set<string>();
function genName(gender: 'L' | 'P', lastOverride?: string): string {
  for (let i = 0; i < 200; i++) {
    const first = pick(gender === 'L' ? MALE_FIRST : FEMALE_FIRST);
    const last = lastOverride ?? pick(gender === 'L' ? MALE_LAST : FEMALE_LAST);
    const name =
      chance(0.45) && !lastOverride
        ? `${first} ${pick(gender === 'L' ? MALE_LAST : FEMALE_LAST)} ${last}`
        : `${first} ${last}`;
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }
  const fallback = `${pick(gender === 'L' ? MALE_FIRST : FEMALE_FIRST)} ${usedNames.size}`;
  usedNames.add(fallback);
  return fallback;
}

const guardianList: PGuardian[] = [];
const students: PStudent[] = [];
const usedNisn = new Set<string>();
const usedNik = new Set<string>();
const nisSeq = new Map<number, number>();

function newStudent(opts: {
  level: Level;
  prog: Prog;
  className: string;
  status: PStudent['status'];
  graduated?: boolean;
  entryYear: number;
  birthYear: number;
}): PStudent {
  const maleShare = { TKJ: 0.78, RPL: 0.62, AKL: 0.2 }[opts.prog];
  const gender: 'L' | 'P' = chance(maleShare) ? 'L' : 'P';
  const name = genName(gender);
  const lastToken = name.split(' ').slice(-1)[0]!;
  const seq = (nisSeq.get(opts.entryYear) ?? 0) + 1;
  nisSeq.set(opts.entryYear, seq);
  const yy = pad(opts.entryYear % 100, 2);
  const birthDate = `${opts.birthYear}-${pad(int(1, 12), 2)}-${pad(int(1, 28), 2)}`;
  let nisn = '';
  do nisn = `00${pad(opts.birthYear % 100, 2)}${pad(int(0, 999_999), 6)}`;
  while (usedNisn.has(nisn));
  usedNisn.add(nisn);
  let nik = '';
  do {
    const dd = Number(birthDate.slice(8, 10)) + (gender === 'P' ? 40 : 0);
    nik = `360203${pad(dd, 2)}${birthDate.slice(5, 7)}${birthDate.slice(2, 4)}${pad(int(1, 9999), 4)}`;
  } while (usedNik.has(nik));
  usedNik.add(nik);

  // Wali: ayah (utama) dan ibu; sebagian hanya satu wali.
  const gs: PStudent['guardians'] = [];
  const father: PGuardian = {
    name: `${chance(0.2) ? 'H. ' : ''}${pick(MALE_FIRST)} ${lastToken}`,
    phone: phone(),
    email: null,
  };
  guardianList.push(father);
  const roll = rnd();
  if (roll < 0.06) {
    father.name = `${pick(MALE_FIRST)} ${pick(MALE_LAST)}`;
    gs.push({ g: guardianList.length - 1, relation: 'guardian', primary: true });
  } else {
    gs.push({ g: guardianList.length - 1, relation: 'father', primary: true });
    if (roll < 0.7) {
      guardianList.push({
        name: `${chance(0.2) ? 'Hj. ' : ''}${pick(FEMALE_FIRST)} ${pick(FEMALE_LAST)}`,
        phone: phone(),
        email: null,
      });
      gs.push({ g: guardianList.length - 1, relation: 'mother', primary: false });
    }
  }
  const s: PStudent = {
    name,
    gender,
    nis: `${yy}${pad(seq, 4)}`,
    nisn,
    nik,
    birthDate,
    birthPlace: pick(BIRTH_PLACES),
    address: address(),
    phone: chance(0.55) ? phone() : null,
    status: opts.status,
    level: opts.level,
    prog: opts.prog,
    className: opts.className,
    graduated: opts.graduated ?? false,
    guardians: gs,
    ability: gauss(),
  };
  students.push(s);
  return s;
}

for (const level of LEVELS) {
  const entryYear = { X: 2026, XI: 2025, XII: 2024 }[level];
  const birthYear = { X: 2010, XI: 2009, XII: 2008 }[level];
  for (const prog of PROGS) {
    const className = `${level} ${prog} 1`;
    for (let i = 0; i < 16; i++) {
      newStudent({
        level,
        prog,
        className,
        status: 'active',
        entryYear,
        birthYear: birthYear + (chance(0.25) ? 1 : 0),
      });
    }
  }
}
// Lulusan (angkatan 2023, kelas XII tahun lalu), pindah, dan keluar.
for (const [prog, n] of [
  ['TKJ', 2],
  ['RPL', 2],
] as const) {
  for (let i = 0; i < n; i++) {
    newStudent({
      level: 'XII',
      prog,
      className: `XII ${prog} 1`,
      status: 'graduated',
      graduated: true,
      entryYear: 2023,
      birthYear: 2007,
    });
  }
}
newStudent({
  level: 'XI',
  prog: 'RPL',
  className: 'XI RPL 1',
  status: 'transferred',
  entryYear: 2025,
  birthYear: 2009,
});
newStudent({
  level: 'X',
  prog: 'AKL',
  className: 'X AKL 1',
  status: 'transferred',
  entryYear: 2026,
  birthYear: 2010,
});
newStudent({
  level: 'X',
  prog: 'TKJ',
  className: 'X TKJ 1',
  status: 'dropped',
  entryYear: 2026,
  birthYear: 2010,
});
newStudent({
  level: 'XI',
  prog: 'AKL',
  className: 'XI AKL 1',
  status: 'dropped',
  entryYear: 2025,
  birthYear: 2009,
});

// Kakak-adik: 6 siswa kelas X memakai wali dan nama belakang yang sama dengan siswa kelas XII.
{
  const xii = students.filter((s) => s.level === 'XII' && s.status === 'active');
  const x = students.filter((s) => s.level === 'X' && s.status === 'active');
  for (let i = 0; i < 6; i++) {
    const a = xii[i * 2]!;
    const b = x[i * 2 + 1]!;
    const last = a.name.split(' ').slice(-1)[0]!;
    b.name = `${b.name.split(' ').slice(0, -1).join(' ')} ${last}`;
    b.guardians = a.guardians.map((g) => ({ ...g }));
    b.address = a.address;
  }
}

const activeStudents = students.filter((s) => s.status === 'active');
// Akun portal demo: siswa pertama kelas X TKJ 1 (siswa + wali utamanya).
const portalStudent = activeStudents.find((s) => s.className === 'X TKJ 1')!;
const portalStudent2 = activeStudents.filter((s) => s.className === 'X TKJ 1')[1]!;
const portalGuardian = guardianList[portalStudent.guardians[0]!.g]!;
portalGuardian.email = `ortu1${DEMO_SUFFIX}`;

/* ---- akun login demo ---- */

interface AccountDef {
  email: string;
  name: string;
  roles: string[];
  teacherKey?: string;
}
const ACCOUNTS: AccountDef[] = [
  { email: `admin${DEMO_SUFFIX}`, name: 'Deden Hermawan (Admin Sekolah)', roles: ['school_admin'] },
  {
    email: `kepsek${DEMO_SUFFIX}`,
    name: 'Hj. Siti Rahmawati, S.Pd., M.M.',
    roles: ['principal'],
    teacherKey: 'kepsek',
  },
  {
    email: `kurikulum${DEMO_SUFFIX}`,
    name: 'Drs. Asep Saepudin, M.Pd.',
    roles: ['curriculum', 'teacher'],
    teacherKey: 'wakur',
  },
  { email: `bendahara${DEMO_SUFFIX}`, name: 'Nurhayati, S.E. (Bendahara)', roles: ['treasurer'] },
  { email: `operator${DEMO_SUFFIX}`, name: 'Cecep Sutisna (Operator)', roles: ['operator'] },
  { email: `guru1${DEMO_SUFFIX}`, name: 'Dedi Kurniawan, S.Pd.', roles: ['teacher'], teacherKey: 'mtk1' },
  { email: `guru2${DEMO_SUFFIX}`, name: 'Nurul Hidayah, S.Pd.', roles: ['teacher'], teacherKey: 'big1' },
  { email: `wali1${DEMO_SUFFIX}`, name: 'Ahmad Fadli, S.T.', roles: ['teacher'], teacherKey: 'tkj1' },
  { email: `ortu1${DEMO_SUFFIX}`, name: portalGuardian.name, roles: ['guardian'] },
  { email: `siswa1${DEMO_SUFFIX}`, name: portalStudent2.name, roles: ['student'] },
];

/* ---------------------------------------------------------------- koneksi dan akun ---------------------------------------------------------------- */

const app = await buildApp(env);
await app.ready();
const { db, pool } = createDb(ownerUrl);

async function ensureUser(email: string, name: string) {
  const [existing] = await db.select().from(user).where(eq(user.email, email));
  if (existing) return existing.id;
  const res = await app.auth.api.signUpEmail({ body: { name, email, password: password as string } });
  return res.user.id;
}

const [sch] = await db.select().from(school).where(eq(school.slug, SLUG));
if (!sch) throw new Error(`Sekolah ${SLUG} tidak ditemukan`);
const schoolId = sch.id;

const userIds = new Map<string, string>();
for (const a of ACCOUNTS) userIds.set(a.email, await ensureUser(a.email, a.name));
const uid = (local: string) => userIds.get(`${local}${DEMO_SUFFIX}`)!;
const adminUid = uid('admin');
const treasurerUid = uid('bendahara');

/* ---------------------------------------------------------------- penyusun jadwal ---------------------------------------------------------------- */

interface SchedClass {
  items: { subj: string; teacher: string; hours: number }[];
}
function blocksOf(h: number): number[] {
  if (h <= 1) return [1];
  if (h === 2) return [2];
  if (h === 3) return [2, 1];
  if (h === 4) return [2, 2];
  if (h === 6) return [2, 2, 2];
  return Array.from({ length: h }, () => 1);
}
const slotsOn = (day: number) => (day === 5 ? 6 : 8);
function buildSchedule(classes: SchedClass[]) {
  for (let attempt = 0; attempt < 4000; attempt++) {
    const classBusy = classes.map(() => new Set<string>());
    const teacherBusy = new Map<string, Set<string>>();
    const dayUse = new Set<string>();
    const out: { ci: number; subj: string; teacher: string; day: number; period: number }[] = [];
    const units: { ci: number; subj: string; teacher: string; size: number }[] = [];
    classes.forEach((c, ci) => {
      for (const it of c.items)
        for (const size of blocksOf(it.hours)) units.push({ ci, subj: it.subj, teacher: it.teacher, size });
    });
    const sorted = shuffle(units).sort((a, b) => b.size - a.size);
    let ok = true;
    for (const u of sorted) {
      const cands: [number, number][] = [];
      for (let day = 1; day <= 5; day++) {
        if (dayUse.has(`${u.ci}|${u.subj}|${day}`)) continue;
        for (let p = 1; p + u.size - 1 <= slotsOn(day); p++) {
          let free = true;
          const tb = teacherBusy.get(u.teacher) ?? new Set<string>();
          for (let k = 0; k < u.size; k++) {
            if (classBusy[u.ci]!.has(`${day}|${p + k}`) || tb.has(`${day}|${p + k}`)) free = false;
          }
          if (free) cands.push([day, p]);
        }
      }
      if (cands.length === 0) {
        ok = false;
        break;
      }
      const [day, p] = pick(cands);
      const tb = teacherBusy.get(u.teacher) ?? new Set<string>();
      for (let k = 0; k < u.size; k++) {
        classBusy[u.ci]!.add(`${day}|${p + k}`);
        tb.add(`${day}|${p + k}`);
        out.push({ ci: u.ci, subj: u.subj, teacher: u.teacher, day, period: p + k });
      }
      teacherBusy.set(u.teacher, tb);
      dayUse.add(`${u.ci}|${u.subj}|${day}`);
    }
    if (ok) return out;
  }
  throw new Error('Jadwal pelajaran gagal disusun tanpa bentrok');
}

/* ---------------------------------------------------------------- bank soal ---------------------------------------------------------------- */

interface Q {
  type: 'mcq' | 'essay';
  body: string;
  options?: string[];
  answer: string;
  explanation?: string;
}
const KEYS = ['A', 'B', 'C', 'D', 'E'];
const BANK: Record<string, { level: string | null; qs: Q[] }> = {
  MTK: {
    level: 'X',
    qs: [
      {
        type: 'mcq',
        body: 'Hasil dari $3^2 + 4^2$ adalah ...',
        options: ['7', '12', '25', '49', '144'],
        answer: 'C',
        explanation: '9 + 16 = 25.',
      },
      {
        type: 'mcq',
        body: 'Penyelesaian persamaan $2x + 5 = 17$ adalah $x = ...$',
        options: ['4', '5', '6', '11', '12'],
        answer: 'C',
        explanation: '2x = 12 sehingga x = 6.',
      },
      {
        type: 'mcq',
        body: 'Jika $f(x) = 3x - 2$, maka nilai $f(5)$ adalah ...',
        options: ['11', '13', '15', '17', '19'],
        answer: 'B',
        explanation: 'f(5) = 15 - 2 = 13.',
      },
      {
        type: 'mcq',
        body: 'Gradien garis yang melalui titik $(1, 2)$ dan $(3, 8)$ adalah ...',
        options: ['2', '3', '4', '5', '6'],
        answer: 'B',
        explanation: 'm = (8 - 2) / (3 - 1) = 3.',
      },
      {
        type: 'mcq',
        body: 'Himpunan penyelesaian dari $x^2 - 5x + 6 = 0$ adalah ...',
        options: ['{1, 6}', '{2, 3}', '{-2, -3}', '{-1, -6}', '{2, -3}'],
        answer: 'B',
        explanation: '(x - 2)(x - 3) = 0.',
      },
      {
        type: 'essay',
        body: 'Sebuah toko memberi diskon 20% untuk sepasang sepatu seharga Rp250.000. Hitung harga yang harus dibayar dan jelaskan langkahnya.',
        answer: 'Diskon = 20% x 250.000 = 50.000. Harga bayar = 250.000 - 50.000 = Rp200.000.',
      },
      {
        type: 'essay',
        body: 'Tentukan akar-akar persamaan $x^2 - 7x + 12 = 0$ dengan cara pemfaktoran.',
        answer: '(x - 3)(x - 4) = 0 sehingga x = 3 atau x = 4.',
      },
    ],
  },
  BIN: {
    level: null,
    qs: [
      {
        type: 'mcq',
        body: 'Gagasan pokok sebuah paragraf biasanya terdapat pada ...',
        options: ['kalimat penjelas', 'kalimat utama', 'kalimat penutup saja', 'judul teks', 'kalimat tanya'],
        answer: 'B',
      },
      {
        type: 'mcq',
        body: 'Kalimat berikut yang merupakan kalimat efektif adalah ...',
        options: [
          'Para siswa-siswa sedang belajar.',
          'Siswa sedang belajar di kelas.',
          'Adalah siswa sedang belajar.',
          'Siswa-siswa itu para sedang belajar.',
          'Di kelas, siswa belajar sedang.',
        ],
        answer: 'B',
      },
      {
        type: 'mcq',
        body: 'Makna kata "kolaborasi" dalam kalimat "Kolaborasi antarsiswa meningkatkan hasil proyek" adalah ...',
        options: ['persaingan', 'kerja sama', 'pembagian tugas', 'penilaian', 'perselisihan'],
        answer: 'B',
      },
      {
        type: 'mcq',
        body: 'Imbuhan me- pada kata "menulis" berubah bentuk karena kata dasarnya diawali huruf ...',
        options: ['t', 'k', 'p', 's', 'b'],
        answer: 'A',
        explanation: 'Huruf t luluh: me- + tulis = menulis.',
      },
      {
        type: 'essay',
        body: 'Tulislah satu paragraf deduktif tentang pentingnya disiplin waktu bagi siswa SMK (minimal 4 kalimat).',
        answer:
          'Paragraf dimulai dengan kalimat utama, diikuti kalimat penjelas berupa alasan dan contoh yang relevan.',
      },
    ],
  },
  BIG: {
    level: null,
    qs: [
      {
        type: 'mcq',
        body: 'Yesterday, my brother ___ to the school library.',
        options: ['go', 'goes', 'went', 'going', 'gone'],
        answer: 'C',
      },
      {
        type: 'mcq',
        body: 'The sentence "The teacher explains the lesson" in passive voice is ...',
        options: [
          'The lesson explained by the teacher.',
          'The lesson is explained by the teacher.',
          'The lesson was explain by the teacher.',
          'The lesson explains the teacher.',
          'The teacher is explained the lesson.',
        ],
        answer: 'B',
      },
      {
        type: 'mcq',
        body: 'The synonym of "difficult" is ...',
        options: ['easy', 'hard', 'simple', 'light', 'cheap'],
        answer: 'B',
      },
      {
        type: 'mcq',
        body: 'She ___ been working at the bank since 2020.',
        options: ['is', 'was', 'has', 'have', 'had to'],
        answer: 'C',
      },
      {
        type: 'essay',
        body: 'Write a short paragraph (4-5 sentences) about your daily activities at school.',
        answer:
          'Students should use simple present tense and time markers such as every day, usually, and at 7 a.m.',
      },
    ],
  },
  PAI: {
    level: null,
    qs: [
      {
        type: 'mcq',
        body: 'Jumlah rukun iman dalam Islam adalah ...',
        options: ['4', '5', '6', '7', '8'],
        answer: 'C',
      },
      {
        type: 'mcq',
        body: 'Salah satu hal yang membatalkan wudhu adalah ...',
        options: ['makan', 'tidur nyenyak', 'berbicara', 'berjalan', 'membaca'],
        answer: 'B',
      },
      {
        type: 'mcq',
        body: 'Puasa Ramadhan hukumnya wajib bagi muslim yang ...',
        options: ['kaya', 'baligh dan berakal', 'sudah menikah', 'berusia 40 tahun', 'bermukim di kota'],
        answer: 'B',
      },
      {
        type: 'mcq',
        body: 'Sifat jujur dalam Islam disebut ...',
        options: ['amanah', 'tabligh', 'shiddiq', 'fathanah', 'istiqamah'],
        answer: 'C',
      },
      {
        type: 'essay',
        body: 'Jelaskan dua hikmah shalat berjamaah bagi kehidupan sosial siswa.',
        answer: 'Mempererat persaudaraan dan melatih kedisiplinan serta kebersamaan.',
      },
    ],
  },
  INF: {
    level: 'X',
    qs: [
      {
        type: 'mcq',
        body: 'Perangkat yang berfungsi sebagai otak komputer adalah ...',
        options: ['RAM', 'CPU', 'Hard disk', 'Monitor', 'Mouse'],
        answer: 'B',
      },
      {
        type: 'mcq',
        body: 'Bilangan biner $1010_2$ jika diubah ke desimal bernilai ...',
        options: ['8', '9', '10', '11', '12'],
        answer: 'C',
      },
      {
        type: 'mcq',
        body: 'Urutan langkah-langkah logis untuk menyelesaikan masalah disebut ...',
        options: ['algoritma', 'variabel', 'kompiler', 'protokol', 'basis data'],
        answer: 'A',
      },
      {
        type: 'mcq',
        body: 'Aplikasi pengolah angka yang paling lazim digunakan adalah ...',
        options: ['Microsoft Word', 'Microsoft Excel', 'Paint', 'Notepad', 'Media Player'],
        answer: 'B',
      },
      {
        type: 'mcq',
        body: 'Hak cipta atas karya digital termasuk bagian dari ...',
        options: ['HAKI', 'RAM', 'BIOS', 'LAN', 'URL'],
        answer: 'A',
      },
      {
        type: 'essay',
        body: 'Sebutkan tiga cara menjaga keamanan akun media sosial.',
        answer:
          'Kata sandi kuat, verifikasi dua langkah, tidak membagikan kode OTP, dan waspada terhadap tautan phishing.',
      },
      {
        type: 'essay',
        body: 'Buatlah algoritma sederhana (dalam bentuk langkah-langkah) untuk menghitung luas persegi panjang.',
        answer: 'Mulai; baca panjang dan lebar; luas = panjang x lebar; tampilkan luas; selesai.',
      },
    ],
  },
  DPK: {
    level: 'X',
    qs: [
      {
        type: 'mcq',
        body: 'Model referensi OSI memiliki ... lapisan.',
        options: ['4', '5', '6', '7', '8'],
        answer: 'D',
      },
      {
        type: 'mcq',
        body: 'Topologi jaringan yang semua perangkatnya terhubung ke satu titik pusat (switch) disebut topologi ...',
        options: ['bus', 'ring', 'star', 'mesh', 'tree'],
        answer: 'C',
      },
      {
        type: 'mcq',
        body: 'Alamat IP kelas C memiliki rentang oktet pertama ...',
        options: ['1-126', '128-191', '192-223', '224-239', '240-255'],
        answer: 'C',
      },
      {
        type: 'mcq',
        body: 'Susunan warna kabel UTP standar T568B pada ujung pertama dimulai dari ...',
        options: ['putih-oranye', 'oranye', 'putih-hijau', 'biru', 'coklat'],
        answer: 'A',
      },
      {
        type: 'essay',
        body: 'Jelaskan perbedaan fungsi hub dan switch dalam jaringan komputer.',
        answer:
          'Hub meneruskan data ke semua port (broadcast), sedangkan switch meneruskan hanya ke port tujuan berdasarkan alamat MAC.',
      },
    ],
  },
};

/* ---------------------------------------------------------------- transaksi utama ---------------------------------------------------------------- */

// Urutan hapus: anak lebih dulu. Hanya baris `school_id` sekolah ini.
const WIPE = [
  'exam_answer',
  'exam_attempt',
  'exam_question',
  'score',
  'assessment',
  'exam',
  'question',
  'exam_paper_setting',
  'report_card',
  'extracurricular_assessment',
  'extracurricular_attendance',
  'extracurricular_session',
  'extracurricular_member',
  'extracurricular',
  'lesson_attendance',
  'schedule_entry',
  'duty_roster',
  'daily_attendance',
  'tap_event',
  'attendance_card',
  'student_identity_code',
  'attendance_device_school',
  'attendance_device',
  'attendance_policy',
  'teaching_assignment',
  'fin_payment_item',
  'fin_online_charge',
  'fin_payment',
  'fin_invoice',
  'fin_student_discount',
  'fin_late_fee_setting',
  'fin_discount_rule',
  'fin_fee_target',
  'fin_fee_plan',
  'fin_fee_type',
  'fin_counter',
  'fin_gateway_setting',
  'msg_message',
  'msg_template',
  'msg_setting',
  'wa_account',
  'hafalan_entry',
  'hafalan_target',
  'halaqah_member',
  'halaqah',
  'ibadah_log',
  'ibadah_item',
  'signed_document',
  'letter',
  'letter_counter',
  'letter_template',
  'letter_setting',
  'signer_credential',
  'pkl_score',
  'pkl_journal',
  'pkl_visit',
  'pkl_placement',
  'pkl_period',
  'pkl_partner',
  'pkl_aspect',
  'pkl_setting',
  'application_status_log',
  'application_document',
  'application',
  'admission_counter',
  'admission_period',
  'admission_document_type',
  'portal_invite',
  'portal_link',
  'student_guardian',
  'guardian',
  'invitation',
  'enrollment',
  'student',
  'grade_component',
  'grading_setting',
  'report_setting',
  'calendar_event',
  'class_room',
  'teacher',
  'announcement',
  'school_domain',
  'school_setting',
];

const result = await db.transaction(async (tx) => {
  /* ---- 0. hapus data demo lama ---- */
  for (const t of WIPE) {
    if (t === 'tap_event') {
      // tap_event dijaga trigger anti-ubah; mode replica melewatinya hanya untuk perintah ini.
      await tx.execute(sql`set local session_replication_role = replica`);
      await tx.execute(sql`delete from tap_event where school_id = ${schoolId}`);
      await tx.execute(sql`set local session_replication_role = origin`);
      continue;
    }
    await tx.execute(sql`delete from ${sql.identifier(t)} where school_id = ${schoolId}`);
  }
  // Anggota demo (akun *@smk-demo.test) dibuat ulang; anggota lain tidak disentuh.
  const demoUserRows = await tx
    .select({ id: user.id })
    .from(user)
    .where(sql`${user.email} like ${`%${DEMO_SUFFIX}`}`);
  const demoUserIds = demoUserRows.map((u) => u.id);
  if (demoUserIds.length > 0) {
    const old = await tx
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.schoolId, schoolId), inArray(member.userId, demoUserIds)));
    if (old.length > 0) {
      await tx.delete(memberRole).where(
        inArray(
          memberRole.memberId,
          old.map((m) => m.id),
        ),
      );
      await tx.delete(member).where(
        inArray(
          member.id,
          old.map((m) => m.id),
        ),
      );
    }
  }

  /* ---- 1. struktur akademik ---- */
  const ensureYear = async (name: string, startsOn: string, endsOn: string, isActive: boolean) => {
    const [ex] = await tx
      .select()
      .from(academicYear)
      .where(and(eq(academicYear.schoolId, schoolId), eq(academicYear.name, name)));
    if (ex) return ex;
    const [row] = await ins(tx, academicYear, [{ schoolId, name, startsOn, endsOn, isActive }]);
    return row!;
  };
  const prevYear = await ensureYear('2025/2026', '2025-07-14', '2026-07-04', false);
  await tx.update(academicYear).set({ isActive: false }).where(eq(academicYear.id, prevYear.id));
  const year = await ensureYear('2026/2027', '2026-07-20', '2027-07-02', true);
  await tx.update(academicYear).set({ isActive: true }).where(eq(academicYear.id, year.id));

  const ensureSemester = async (
    yearId: string,
    name: string,
    startsOn: string,
    endsOn: string,
    isActive: boolean,
  ) => {
    const [ex] = await tx
      .select()
      .from(semester)
      .where(and(eq(semester.academicYearId, yearId), eq(semester.name, name)));
    if (ex) return ex;
    const [row] = await ins(tx, semester, [
      { schoolId, academicYearId: yearId, name, startsOn, endsOn, isActive },
    ]);
    return row!;
  };
  const prevGanjil = await ensureSemester(prevYear.id, 'Ganjil', '2025-07-14', '2026-01-03', false);
  const prevGenap = await ensureSemester(prevYear.id, 'Genap', '2026-01-12', '2026-07-04', false);
  const ganjil = await ensureSemester(year.id, 'Ganjil', '2026-07-20', '2027-01-09', true);
  const genap = await ensureSemester(year.id, 'Genap', '2027-01-10', '2027-07-02', false);
  void prevGanjil;
  void genap;

  await tx
    .insert(schoolCurriculum)
    .values({ schoolId, curriculumKey: 'merdeka', levelGroup: 'smk' })
    .onConflictDoNothing();
  await tx
    .insert(schoolLevel)
    .values(LEVELS.map((c, i) => ({ schoolId, code: c, label: `Kelas ${c}`, sort: (i + 1) * 10 })))
    .onConflictDoNothing();
  await tx
    .insert(schoolSetting)
    .values({
      schoolId,
      workingDays: [1, 2, 3, 4, 5],
      semesterNames: ['Ganjil', 'Genap'],
      lessonDefaultStart: '07:00',
      lessonDefaultMinutes: 40,
    })
    .onConflictDoNothing();
  note('school_setting', 1);

  await tx
    .insert(program)
    .values(PROGRAMS.map(([code, name]) => ({ schoolId, code, name })))
    .onConflictDoNothing();
  const programRows = await tx.select().from(program).where(eq(program.schoolId, schoolId));
  const programId = new Map(programRows.map((p) => [p.code, p.id]));

  await tx
    .insert(subject)
    .values([...BASE_SUBJECTS, ...EXTRA_SUBJECTS].map(([code, name]) => ({ schoolId, code, name })))
    .onConflictDoNothing();
  const subjectRows = await tx.select().from(subject).where(eq(subject.schoolId, schoolId));
  const subjectId = new Map(subjectRows.map((s) => [s.code, s.id]));
  const subjectName = new Map(subjectRows.map((s) => [s.code, s.name]));

  const LP: [number, string, string][] = [
    [1, '07:00', '07:40'],
    [2, '07:40', '08:20'],
    [3, '08:20', '09:00'],
    [4, '09:15', '09:55'],
    [5, '09:55', '10:35'],
    [6, '10:35', '11:15'],
    [7, '11:15', '11:55'],
    [8, '11:55', '12:35'],
  ];
  await tx
    .insert(lessonPeriod)
    .values(LP.map(([number, startsAt, endsAt]) => ({ schoolId, number, startsAt, endsAt })))
    .onConflictDoNothing();
  const periodRows = await tx.select().from(lessonPeriod).where(eq(lessonPeriod.schoolId, schoolId));
  const periodId = new Map(periodRows.map((p) => [p.number, p.id]));
  const _periodTimes = new Map(periodRows.map((p) => [p.number, { s: p.startsAt, e: p.endsAt }]));

  /* ---- 2. akun/anggota dan guru ---- */
  const memberIdOf = new Map<string, string>();
  for (const a of ACCOUNTS) {
    const [m] = await ins(tx, member, [{ userId: userIds.get(a.email)!, schoolId }]);
    await assignRoles(tx, m!.id, schoolId, a.roles);
    memberIdOf.set(a.email, m!.id);
  }
  const accountOfTeacher = new Map(ACCOUNTS.filter((a) => a.teacherKey).map((a) => [a.teacherKey!, a.email]));

  const teacherRows = await ins(
    tx,
    teacher,
    TEACHERS.map((t, i) => {
      const by = 1972 + ((i * 7) % 25);
      const tmt = 2000 + ((i * 3) % 24);
      const nip = t.honorer
        ? null
        : `${by}${pad(1 + (i % 12), 2)}${pad(1 + ((i * 5) % 28), 2)}${tmt}${pad(1 + (i % 12), 2)}${t.gender}${pad(i + 1, 3)}`;
      const email = accountOfTeacher.get(t.key);
      return {
        schoolId,
        name: t.name,
        nip,
        memberId: email ? memberIdOf.get(email)! : null,
        status: 'active' as const,
      };
    }),
  );
  const teacherId = new Map(TEACHERS.map((t, i) => [t.key, teacherRows[i]!.id]));
  note('teacher', teacherRows.length);

  /* ---- 3. kelas, siswa, wali ---- */
  const classDefs: { name: string; level: Level; prog: Prog; yearKey: 'now' | 'prev' }[] = [];
  for (const yk of ['now', 'prev'] as const)
    for (const level of LEVELS)
      for (const prog of PROGS) classDefs.push({ name: `${level} ${prog} 1`, level, prog, yearKey: yk });
  const classRows = await ins(
    tx,
    classRoom,
    classDefs.map((c, i) => ({
      schoolId,
      academicYearId: c.yearKey === 'now' ? year.id : prevYear.id,
      programId: programId.get(c.prog) ?? null,
      name: c.name,
      level: c.level,
      homeroomTeacherId:
        c.yearKey === 'now' ? teacherId.get(HOMEROOM[c.name]!)! : teacherId.get(TEACHERS[2 + (i % 20)]!.key)!,
    })),
  );
  const classId = new Map<string, string>(); // `now|X TKJ 1`
  classDefs.forEach((c, i) => {
    classId.set(`${c.yearKey}|${c.name}`, classRows[i]!.id);
  });
  note('class_room', classRows.length);

  const guardianRows = await ins(
    tx,
    guardian,
    guardianList.map((g) => ({ schoolId, name: g.name, phone: g.phone, email: g.email })),
  );
  const studentRows = await ins(
    tx,
    student,
    students.map((s) => ({
      schoolId,
      name: s.name,
      nis: s.nis,
      nisn: s.nisn,
      nik: s.nik,
      gender: s.gender,
      birthDate: s.birthDate,
      birthPlace: s.birthPlace,
      religion: 'islam' as const,
      address: s.address,
      phone: s.phone,
      status: s.status,
    })),
  );
  const sid = (i: number) => studentRows[i]!.id;
  const sgRows: (typeof studentGuardian.$inferInsert)[] = [];
  students.forEach((s, i) => {
    for (const g of s.guardians)
      sgRows.push({
        schoolId,
        studentId: sid(i),
        guardianId: guardianRows[g.g]!.id,
        relation: g.relation,
        isPrimary: g.primary,
      });
  });
  await put(tx, studentGuardian, sgRows);
  note('student', studentRows.length);
  note('guardian', guardianRows.length);

  // Enrollment: tahun ini (siswa non-lulusan) dan tahun lalu (kelas sebelumnya).
  const prevLevel: Record<Level, Level> = { X: 'X', XI: 'X', XII: 'XI' };
  const enrollRows: (typeof enrollment.$inferInsert)[] = [];
  students.forEach((s, i) => {
    if (!s.graduated)
      enrollRows.push({
        schoolId,
        studentId: sid(i),
        classId: classId.get(`now|${s.className}`)!,
        academicYearId: year.id,
      });
    if (s.graduated) {
      enrollRows.push({
        schoolId,
        studentId: sid(i),
        classId: classId.get(`prev|${s.className}`)!,
        academicYearId: prevYear.id,
      });
    } else if (s.level !== 'X') {
      enrollRows.push({
        schoolId,
        studentId: sid(i),
        classId: classId.get(`prev|${prevLevel[s.level]} ${s.prog} 1`)!,
        academicYearId: prevYear.id,
      });
    }
  });
  await put(tx, enrollment, enrollRows);
  note('enrollment', enrollRows.length);

  const classOf = (s: PStudent) => classId.get(`now|${s.className}`)!;
  const activeIdx = students.map((_s, i) => i).filter((i) => students[i]!.status === 'active');

  // Akun portal
  {
    const gId = guardianRows[portalStudent.guardians[0]!.g]!.id;
    await put(tx, portalLink, [
      {
        schoolId,
        memberId: memberIdOf.get(`ortu1${DEMO_SUFFIX}`)!,
        kind: 'guardian' as const,
        guardianId: gId,
      },
      {
        schoolId,
        memberId: memberIdOf.get(`siswa1${DEMO_SUFFIX}`)!,
        kind: 'student' as const,
        studentId: sid(students.indexOf(portalStudent2)),
      },
    ]);
    const sample = shuffle(activeIdx).slice(0, 4);
    await put(
      tx,
      portalInvite,
      sample.map((i, k) => ({
        schoolId,
        kind: 'guardian' as const,
        guardianId: guardianRows[students[i]!.guardians[0]!.g]!.id,
        tokenHash: sha(`demo-portal-invite-${k}-${randomBytes(8).toString('hex')}`),
        email: `wali.${pad(k + 1, 2)}${DEMO_SUFFIX}`,
        expiresAt: new Date(at(TODAY, '12:00').getTime() + (k === 3 ? -2 : 12) * 86_400_000),
        usedAt: null,
        createdBy: adminUid,
      })),
    );
    note('portal_link', 2);
    note('portal_invite', sample.length);
    await put(tx, invitation, [
      {
        schoolId,
        email: `guru.baru${DEMO_SUFFIX}`,
        roles: ['teacher'],
        tokenHash: sha(`demo-staff-invite-${randomBytes(8).toString('hex')}`),
        invitedBy: adminUid,
        expiresAt: new Date(at(TODAY, '12:00').getTime() + 7 * 86_400_000),
        teacherId: teacherId.get('pembina') ?? null,
      },
    ]);
    note('invitation', 1);
  }

  /* ---- 4. penugasan mengajar dan jadwal pelajaran ---- */
  const curClasses = classDefs.filter((c) => c.yearKey === 'now');
  const classItems = curClasses.map((c) => ({
    ...c,
    items: subjectHours(c.level, c.prog).map(([subj, hours]) => ({
      subj,
      hours,
      teacher: teacherKeyFor(c.level, c.prog, subj),
    })),
  }));
  await put(
    tx,
    teachingAssignment,
    classItems.flatMap((c) =>
      c.items.map((it) => ({
        schoolId,
        classId: classId.get(`now|${c.name}`)!,
        subjectId: subjectId.get(it.subj)!,
        teacherId: teacherId.get(it.teacher)!,
      })),
    ),
  );
  note(
    'teaching_assignment',
    classItems.reduce((n, c) => n + c.items.length, 0),
  );

  const sched = buildSchedule(classItems);
  const schedRows = await ins(
    tx,
    scheduleEntry,
    sched.map((e) => ({
      schoolId,
      academicYearId: year.id,
      classId: classId.get(`now|${classItems[e.ci]!.name}`)!,
      subjectId: subjectId.get(e.subj)!,
      teacherId: teacherId.get(e.teacher)!,
      weekday: e.day,
      periodId: periodId.get(e.period)!,
    })),
  );
  note('schedule_entry', schedRows.length);

  /* ---- 5. kalender ---- */
  const ev = (
    type: 'holiday' | 'break' | 'exam' | 'activity',
    title: string,
    startsOn: string,
    endsOn: string,
    extra: { scope?: 'class' | 'program'; classId?: string; programId?: string } = {},
  ) => ({
    schoolId,
    academicYearId: year.id,
    type,
    scope: extra.scope ?? ('school' as const),
    classId: extra.classId ?? null,
    programId: extra.programId ?? null,
    title,
    startsOn,
    endsOn,
  });
  const events = [
    ev('activity', 'Masa Pengenalan Lingkungan Sekolah (MPLS)', '2026-07-20', '2026-07-22'),
    ev('holiday', 'Hari Kemerdekaan Republik Indonesia', '2026-08-17', '2026-08-17'),
    ev('holiday', 'Maulid Nabi Muhammad SAW', '2026-08-25', '2026-08-25'),
    ev('exam', 'Asesmen Sumatif Tengah Semester Ganjil', '2026-09-14', '2026-09-18'),
    ev('break', 'Libur Pekan Muhasabah Pesantren', '2026-10-19', '2026-10-20'),
    ev('activity', 'Peringatan Hari Santri Nasional', '2026-10-22', '2026-10-22'),
    ev('activity', 'Pekan Olahraga dan Seni (Porseni)', '2026-11-16', '2026-11-20'),
    ev('exam', 'Asesmen Sumatif Akhir Semester Ganjil', '2026-12-07', '2026-12-12'),
    ev('break', 'Libur Akhir Semester Ganjil', '2026-12-21', '2027-01-02'),
    ev('holiday', 'Hari Raya Natal', '2026-12-25', '2026-12-25'),
    ev('holiday', 'Tahun Baru Masehi 2027', '2027-01-01', '2027-01-01'),
    ev('activity', 'Pembagian Rapor Semester Ganjil', '2027-01-09', '2027-01-09'),
    ev('holiday', 'Tahun Baru Imlek 2578', '2027-02-06', '2027-02-06'),
    ev('break', 'Pesantren Kilat Ramadan', '2027-02-08', '2027-02-12'),
    ev('holiday', 'Hari Raya Idulfitri 1448 H (perkiraan)', '2027-03-09', '2027-03-10'),
    ev('exam', 'Asesmen Sumatif Tengah Semester Genap', '2027-03-15', '2027-03-19'),
    ev('holiday', 'Wafat Isa Almasih', '2027-03-26', '2027-03-26'),
    ev('exam', 'Ujian Kompetensi Keahlian (UKK) TKJ', '2027-04-12', '2027-04-16', {
      scope: 'program',
      programId: programId.get('TKJ')!,
    }),
    ev('exam', 'Ujian Kompetensi Keahlian (UKK) RPL', '2027-04-12', '2027-04-16', {
      scope: 'program',
      programId: programId.get('RPL')!,
    }),
    ev('exam', 'Ujian Kompetensi Keahlian (UKK) AKL', '2027-04-19', '2027-04-23', {
      scope: 'program',
      programId: programId.get('AKL')!,
    }),
    ev('holiday', 'Kenaikan Isa Almasih', '2027-05-06', '2027-05-06'),
    ev('holiday', 'Hari Raya Idul Adha 1448 H (perkiraan)', '2027-05-17', '2027-05-17'),
    ev('holiday', 'Hari Raya Waisak', '2027-05-20', '2027-05-20'),
    ev('exam', 'Asesmen Sumatif Akhir Tahun', '2027-05-24', '2027-05-29'),
    ev('holiday', 'Hari Lahir Pancasila', '2027-06-01', '2027-06-01'),
    ev('activity', 'Pelepasan Siswa Kelas XII', '2027-06-12', '2027-06-12'),
    ev('break', 'Libur Akhir Tahun Pelajaran', '2027-06-28', '2027-07-02'),
    ev('activity', 'PKL Kelas XI TKJ (Gelombang 1)', '2026-10-05', '2026-12-18', {
      scope: 'class',
      classId: classId.get('now|XI TKJ 1')!,
    }),
    ev('activity', 'Studi Industri XI RPL', '2026-11-24', '2026-11-24', {
      scope: 'class',
      classId: classId.get('now|XI RPL 1')!,
    }),
  ];
  await put(tx, calendarEvent, events);
  note('calendar_event', events.length);
  const closures = events.filter((e) => (e.type === 'holiday' || e.type === 'break') && e.scope === 'school');
  const isClosed = (d: string) => closures.some((c) => d >= c.startsOn && d <= c.endsOn);
  const isSchoolDay = (d: string) => weekdayOf(d) <= 5 && !isClosed(d);
  const schoolDaysBack = (n: number, from = addDays(TODAY, -1)) => {
    const out: string[] = [];
    for (let d = from; out.length < n; d = addDays(d, -1)) if (isSchoolDay(d)) out.push(d);
    return out.reverse();
  };
  const schoolDaysBetween = (a: string, b: string) => {
    const out: string[] = [];
    for (let d = a; d <= b; d = addDays(d, 1)) if (isSchoolDay(d)) out.push(d);
    return out;
  };

  /* ---- 6. PKL (struktur dulu; dipakai penyaringan absensi) ---- */
  await put(tx, pklSetting, [{ schoolId, thresholdA: 90, thresholdB: 80, thresholdC: 70 }]);
  const aspectRows = await ins(
    tx,
    pklAspect,
    DEFAULT_PKL_ASPECTS.map((a, sort) => ({ schoolId, name: a.name, weight: a.weight, sort })),
  );
  const partnerDefs: [string, string, string, string, string][] = [
    [
      'PT Nusantara Digital Teknik',
      'Teknologi informasi',
      'Jl. Multatuli No. 45, Rangkasbitung',
      'Bapak Andri Setiawan',
      '6281318990011',
    ],
    [
      'CV Lebak Komputindo',
      'Penjualan dan servis komputer',
      'Jl. Sunan Kalijaga No. 12, Rangkasbitung',
      'Ibu Dewi Anggraeni',
      '6281218990022',
    ],
    [
      'PT Banten Net Solusi',
      'Penyedia layanan internet',
      'Jl. Raya Serang KM 3, Lebak',
      'Bapak Rendy Pramana',
      '6285718990033',
    ],
    [
      'Kantor Akuntan Publik Hartono dan Rekan',
      'Akuntansi dan audit',
      'Jl. Iman Bonjol No. 8, Rangkasbitung',
      'Ibu Linda Hartono',
      '6281218990044',
    ],
    [
      'KSP Sejahtera Mandiri',
      'Koperasi simpan pinjam',
      'Jl. Alun-alun Timur No. 3, Rangkasbitung',
      'Bapak H. Mulyadi',
      '6281318990055',
    ],
    [
      'CV Karya Tani Digital',
      'Pengembangan aplikasi pertanian',
      'Jl. Cibadak No. 77, Lebak',
      'Bapak Yusuf Hendrawan',
      '6285218990066',
    ],
    [
      'Toko Elektronik Sinar Jaya',
      'Perdagangan elektronik',
      'Jl. Pasar Rangkasbitung No. 21',
      'Ibu Hj. Aminah',
      '6281218990077',
    ],
    [
      'BUMDes Sukarendah Mandiri',
      'Layanan desa dan usaha mikro',
      'Desa Sukarendah, Kec. Warunggunung',
      'Bapak Kades Sarifudin',
      '6281318990088',
    ],
  ];
  const partnerRows = await ins(
    tx,
    pklPartner,
    partnerDefs.map(([name, field, addr, contactName, ph], i) => ({
      schoolId,
      name,
      field,
      address: addr,
      contactName,
      phone: ph,
      email: `hrd${i + 1}@mitra-pkl.example`,
      active: i !== 7,
    })),
  );
  const periodDefs = [
    { yearId: prevYear.id, name: 'PKL Kelas XI Semester Genap 2025/2026', s: '2026-01-12', e: '2026-03-27' },
    { yearId: year.id, name: 'PKL Kelas XI TKJ Semester Ganjil 2026/2027', s: '2026-10-05', e: '2026-12-18' },
    {
      yearId: year.id,
      name: 'PKL Kelas XI RPL dan AKL Semester Genap 2026/2027',
      s: '2027-01-18',
      e: '2027-04-02',
    },
  ];
  const pklPeriods = await ins(
    tx,
    pklPeriod,
    periodDefs.map((p) => ({
      schoolId,
      academicYearId: p.yearId,
      name: p.name,
      startsOn: p.s,
      endsOn: p.e,
    })),
  );
  const prodTeachers = ['tkj1', 'tkj2', 'rpl1', 'rpl2', 'akl1', 'akl2', 'pkk', 'inf'];
  const placements: (typeof pklPlacement.$inferInsert)[] = [];
  const placementMeta: {
    periodIdx: number;
    studentIdx: number;
    status: 'completed' | 'active' | 'planned';
  }[] = [];
  const addPlacements = (periodIdx: number, idxs: number[], status: 'completed' | 'active' | 'planned') => {
    for (const i of idxs) {
      const prog = students[i]!.prog;
      const partnerPool = prog === 'AKL' ? [3, 4, 6, 7] : prog === 'RPL' ? [0, 1, 5, 2] : [0, 2, 1, 6];
      const partner = partnerRows[pick(partnerPool)]!;
      placementMeta.push({ periodIdx, studentIdx: i, status });
      placements.push({
        schoolId,
        periodId: pklPeriods[periodIdx]!.id,
        studentId: sid(i),
        partnerId: partner.id,
        supervisorTeacherId: teacherId.get(pick(prodTeachers))!,
        industrySupervisorName: `${pick(['Bapak', 'Ibu'])} ${pick(MALE_FIRST)} ${pick(MALE_LAST)}`,
        industrySupervisorPhone: phone(),
        status,
        accessTokenHash: chance(0.5) ? sha(randomBytes(16).toString('hex')) : null,
      });
    }
  };
  addPlacements(
    0,
    activeIdx.filter((i) => students[i]!.level === 'XII'),
    'completed',
  );
  addPlacements(
    1,
    activeIdx.filter((i) => students[i]!.className === 'XI TKJ 1'),
    'active',
  );
  addPlacements(
    2,
    activeIdx.filter((i) => students[i]!.level === 'XI' && students[i]!.prog !== 'TKJ'),
    'planned',
  );
  // Satu penempatan yang direncanakan dibatalkan (mitra menolak).
  const cancelledIdx = placementMeta.findIndex((m) => m.status === 'planned');
  if (cancelledIdx >= 0) placements[cancelledIdx]!.status = 'cancelled';
  const placementRows = await ins(tx, pklPlacement, placements);
  note('pkl_partner', partnerRows.length);
  note('pkl_period', pklPeriods.length);
  note('pkl_placement', placementRows.length);

  // Siswa XI TKJ sedang PKL sejak 2026-10-05: tidak hadir di gerbang/kelas setelah tanggal itu.
  const onPkl = (i: number, d: string) => students[i]!.className === 'XI TKJ 1' && d >= '2026-10-05';

  /* ---- 7. absensi ---- */
  await put(tx, attendancePolicy, [
    { schoolId, lateAfter: '07:15', departureFrom: '12:00', debounceSeconds: 30 },
  ]);
  const fakeKey = `esk_demo_${randomBytes(12).toString('hex')}`;
  const deviceRows = await ins(tx, attendanceDevice, [
    {
      schoolId,
      name: 'Kiosk Gerbang Utama',
      keyHash: sha(fakeKey),
      keyPrefix: fakeKey.slice(0, 12),
      active: true,
      lastSeenAt: at(addDays(TODAY, -1), '12:55'),
    },
    {
      schoolId,
      name: 'Kiosk Gerbang Belakang (cadangan)',
      keyHash: sha(`${fakeKey}-b`),
      keyPrefix: `${fakeKey.slice(0, 9)}bck`,
      active: false,
      lastSeenAt: at('2026-09-02', '07:30'),
    },
  ]);
  const deviceId = deviceRows[0]!.id;
  note('attendance_device', 2);

  // Kartu RFID dan kode identitas QR.
  const usedUid = new Set<string>();
  const uidHex = () => {
    let u = '';
    do u = int(0, 0xffffffff).toString(16).toUpperCase().padStart(8, '0');
    while (usedUid.has(u));
    usedUid.add(u);
    return u;
  };
  const cards: (typeof attendanceCard.$inferInsert)[] = [];
  for (const i of activeIdx) {
    cards.push({ schoolId, studentId: sid(i), kind: 'rfid', code: uidHex(), active: true });
    if (chance(0.06))
      cards.push({ schoolId, studentId: sid(i), kind: 'rfid', code: uidHex(), active: false }); // kartu lama hilang
  }
  await put(tx, attendanceCard, cards);
  note('attendance_card', cards.length);
  const usedCode = new Set<string>();
  const idCodes: (typeof studentIdentityCode.$inferInsert)[] = [];
  students.forEach((s, i) => {
    if (s.status !== 'active' && s.status !== 'transferred') return;
    let code = '';
    do {
      code = '';
      for (let k = 0; k < IDENTITY_CODE_LENGTH; k++)
        code += IDENTITY_CODE_ALPHABET.charAt(int(0, IDENTITY_CODE_ALPHABET.length - 1));
    } while (usedCode.has(code));
    usedCode.add(code);
    idCodes.push({
      schoolId,
      studentId: sid(i),
      code,
      rotatedAt: chance(0.04) ? at(addDays(TODAY, -int(5, 40)), '10:00') : null,
    });
  });
  await put(tx, studentIdentityCode, idCodes);
  note('student_identity_code', idCodes.length);

  // Tap gerbang dan absensi harian 30 hari sekolah terakhir.
  const days30 = schoolDaysBack(30);
  const taps: (typeof tapEvent.$inferInsert)[] = [];
  const daily: (typeof dailyAttendance.$inferInsert)[] = [];
  const dailyStatus = new Map<string, 'present' | 'late' | 'excused' | 'sick' | 'absent'>(); // `${idx}|${date}`
  const chronic = new Set(shuffle(activeIdx).slice(0, 10));
  for (const d of days30) {
    for (const i of activeIdx) {
      if (onPkl(i, d)) continue;
      const bad = chronic.has(i);
      const r = rnd();
      const absentP = bad ? 0.12 : 0.012;
      let status: 'present' | 'late' | 'excused' | 'sick' | 'absent';
      if (r < absentP) status = 'absent';
      else if (r < absentP + 0.025) status = 'sick';
      else if (r < absentP + 0.04) status = 'excused';
      else if (r < absentP + 0.04 + (bad ? 0.2 : 0.06)) status = 'late';
      else status = 'present';
      dailyStatus.set(`${i}|${d}`, status);
      if (status === 'sick' || status === 'excused' || status === 'absent') {
        daily.push({
          schoolId,
          studentId: sid(i),
          date: d,
          status,
          note:
            status === 'sick'
              ? pick([
                  'Demam (surat dokter menyusul)',
                  'Sakit perut',
                  'Flu dan batuk',
                  'Pusing, istirahat di rumah',
                ])
              : status === 'excused'
                ? pick([
                    'Keperluan keluarga',
                    'Menghadiri acara pernikahan saudara',
                    'Mengurus administrasi KTP',
                    'Lomba tingkat kabupaten',
                  ])
                : 'Tanpa keterangan',
        });
        continue;
      }
      const inMin = status === 'late' ? int(7 * 60 + 16, 7 * 60 + 50) : int(6 * 60 + 40, 7 * 60 + 14);
      const outMin = weekdayOf(d) === 5 ? int(12 * 60, 12 * 60 + 25) : int(12 * 60 + 40, 13 * 60 + 15);
      const noOut = chance(0.03);
      const source = chance(0.08) ? ('qr' as const) : ('rfid' as const);
      taps.push({
        schoolId,
        studentId: sid(i),
        direction: 'in',
        source,
        at: at(d, hhmm(inMin)),
        deviceId,
        clientId: `demo-${d}-${i}-in`,
      });
      if (!noOut)
        taps.push({
          schoolId,
          studentId: sid(i),
          direction: 'out',
          source,
          at: at(d, hhmm(outMin)),
          deviceId,
          clientId: `demo-${d}-${i}-out`,
        });
      daily.push({
        schoolId,
        studentId: sid(i),
        date: d,
        status,
        checkInAt: at(d, hhmm(inMin)),
        checkOutAt: noOut ? null : at(d, hhmm(outMin)),
        note: status === 'late' ? pick([null, 'Kendaraan mogok', 'Hujan deras', 'Bangun kesiangan']) : null,
      });
    }
  }
  await put(tx, tapEvent, taps);
  await put(tx, dailyAttendance, daily);
  note('tap_event', taps.length);
  note('daily_attendance', daily.length);

  // Guru piket: satu guru per hari sekolah (30 hari lalu sampai 2 minggu ke depan).
  const piketPool = [
    'pai1',
    'pjok',
    'bin1',
    'mtk1',
    'tkj1',
    'rpl1',
    'akl1',
    'sejsbd',
    'bk',
    'pembina',
    'pp',
    'inf',
  ];
  const duty = schoolDaysBetween(days30[0]!, addDays(TODAY, 14)).map((d, k) => ({
    schoolId,
    date: d,
    teacherId: teacherId.get(piketPool[k % piketPool.length]!)!,
  }));
  await put(tx, dutyRoster, duty);
  note('duty_roster', duty.length);

  // Absensi per jam pelajaran: 3 hari sekolah terakhir.
  const lessonDays = schoolDaysBack(3);
  const entriesByClassDay = new Map<string, typeof schedRows>();
  for (const e of schedRows) {
    const k = `${e.classId}|${e.weekday}`;
    entriesByClassDay.set(k, [...(entriesByClassDay.get(k) ?? []), e]);
  }
  const lessons: (typeof lessonAttendance.$inferInsert)[] = [];
  for (const d of lessonDays) {
    for (const i of activeIdx) {
      const dayStatus = dailyStatus.get(`${i}|${d}`);
      if (!dayStatus) continue;
      const entries = entriesByClassDay.get(`${classOf(students[i]!)}|${weekdayOf(d)}`) ?? [];
      for (const e of entries) {
        let status: 'present' | 'excused' | 'sick' | 'absent' = 'present';
        let noteText: string | null = null;
        if (dayStatus === 'absent' || dayStatus === 'sick' || dayStatus === 'excused') status = dayStatus;
        else if (chance(0.012)) {
          status = 'absent';
          noteText = 'Hadir di gerbang tetapi tidak mengikuti pelajaran';
        }
        lessons.push({
          schoolId,
          scheduleEntryId: e.id,
          studentId: sid(i),
          date: d,
          status,
          note: noteText,
          recordedBy: adminUid,
          substitute: chance(0.03),
        });
      }
    }
  }
  await put(tx, lessonAttendance, lessons);
  note('lesson_attendance', lessons.length);

  /* ---- 8. penilaian ---- */
  await put(tx, gradingSetting, [{ schoolId, kkm: 75, predicateA: 90, predicateB: 80, predicateC: 70 }]);
  const comps = await ins(tx, gradeComponent, [
    { schoolId, name: 'Tugas', weight: 20, sort: 0 },
    { schoolId, name: 'Ulangan Harian', weight: 30, sort: 1 },
    { schoolId, name: 'ASTS', weight: 20, sort: 2 },
    { schoolId, name: 'ASAS', weight: 30, sort: 3 },
  ]);
  const comp = new Map(comps.map((c) => [c.name, c]));
  await put(tx, reportSetting, [
    {
      schoolId,
      principalName: 'Hj. Siti Rahmawati, S.Pd., M.M.',
      principalNip: '197504122000122001',
      city: 'Lebak',
      address: 'Jl. Raya Cileles KM. 01, Sukarendah, Warunggunung, Lebak, Banten 42352',
      showRank: true,
    },
  ]);
  note('grade_component', comps.length);

  // Penilaian semester Ganjil kelas aktif. UTS-ASTS untuk MTK/INF kelas X dan BIN kelas XI datang dari modul ujian.
  const ganjilDays = schoolDaysBetween('2026-07-27', '2026-10-30').filter(
    (d) => d < '2026-09-14' || d > '2026-09-18',
  );
  const dayNear = (from: string, to: string) => {
    const pool = ganjilDays.filter((d) => d >= from && d <= to);
    return pick(pool);
  };
  const fromExam = (level: Level, subj: string) =>
    (level === 'X' && (subj === 'MTK' || subj === 'INF')) || (level === 'XI' && subj === 'BIN');
  interface AssessDef {
    ci: number;
    subj: string;
    title: string;
    comp: string;
    date: string;
    teacher: string;
  }
  const assessDefs: AssessDef[] = [];
  classItems.forEach((c, ci) => {
    // Kelas XI TKJ berangkat PKL 5 Oktober: penilaian semester dipadatkan sebelum tanggal itu.
    const pklClass = c.name === 'XI TKJ 1';
    for (const it of c.items) {
      const t = it.teacher;
      assessDefs.push({
        ci,
        subj: it.subj,
        title: 'Tugas 1',
        comp: 'Tugas',
        date: dayNear('2026-08-03', '2026-08-28'),
        teacher: t,
      });
      assessDefs.push({
        ci,
        subj: it.subj,
        title: 'Tugas 2',
        comp: 'Tugas',
        date: pklClass ? dayNear('2026-09-21', '2026-10-02') : dayNear('2026-10-05', '2026-10-30'),
        teacher: t,
      });
      assessDefs.push({
        ci,
        subj: it.subj,
        title: 'Ulangan Harian 1',
        comp: 'Ulangan Harian',
        date: dayNear('2026-08-31', '2026-09-11'),
        teacher: t,
      });
      assessDefs.push({
        ci,
        subj: it.subj,
        title: 'Ulangan Harian 2',
        comp: 'Ulangan Harian',
        date: pklClass ? dayNear('2026-09-21', '2026-10-02') : dayNear('2026-10-12', '2026-10-30'),
        teacher: t,
      });
      if (!fromExam(c.level, it.subj))
        assessDefs.push({
          ci,
          subj: it.subj,
          title: 'Asesmen Sumatif Tengah Semester',
          comp: 'ASTS',
          date: addDays('2026-09-14', int(0, 4)),
          teacher: t,
        });
    }
  });
  const assessRows = await ins(
    tx,
    assessment,
    assessDefs.map((a) => ({
      schoolId,
      semesterId: ganjil.id,
      classId: classId.get(`now|${classItems[a.ci]!.name}`)!,
      subjectId: subjectId.get(a.subj)!,
      componentId: comp.get(a.comp)!.id,
      teacherId: teacherId.get(a.teacher)!,
      title: a.title,
      date: a.date,
      maxScore: 100,
    })),
  );
  const studentsOfClass = (name: string) => activeIdx.filter((i) => students[i]!.className === name);
  const scoreRows: (typeof score.$inferInsert)[] = [];
  assessDefs.forEach((a, k) => {
    const cls = classItems[a.ci]!;
    const offset = (SUBJECT_OFFSET[a.subj] ?? 0) + (a.comp === 'Tugas' ? 6 : 0);
    for (const i of studentsOfClass(cls.name)) {
      const blank = chance(a.comp === 'Tugas' ? 0.04 : 0.015);
      const base = 76 + 8 * students[i]!.ability + offset + (rnd() - 0.5) * 14;
      scoreRows.push({
        schoolId,
        assessmentId: assessRows[k]!.id,
        studentId: sid(i),
        value: blank ? null : r1(clamp(base, 35, 100)),
        note: !blank && base < 65 && chance(0.4) ? 'Perlu remedial' : null,
        updatedBy: adminUid,
      });
    }
  });
  await put(tx, score, scoreRows);
  note('assessment (reguler)', assessRows.length);
  note('score (reguler)', scoreRows.length);

  /* ---- 9. ujian ---- */
  await tx
    .insert(examType)
    .values([
      { schoolId, name: 'Asesmen Sumatif Tengah Semester', shortName: 'ASTS', sort: 5 },
      { schoolId, name: 'Asesmen Sumatif Akhir Semester', shortName: 'ASAS', sort: 10 },
      { schoolId, name: 'Ujian Praktik', shortName: 'UP', sort: 20 },
    ])
    .onConflictDoNothing();
  const etRows = await tx.select().from(examType).where(eq(examType.schoolId, schoolId));
  const examTypeBy = (short: string) => etRows.find((t) => t.shortName === short)!;

  await put(tx, examPaperSetting, [
    {
      schoolId,
      config: {
        ...DEFAULT_EXAM_PAPER,
        kop: { ...DEFAULT_EXAM_PAPER.kop, preLines: ['YAYASAN PONDOK PESANTREN MIFTAHUL HUDA'] },
        footer: 'Semoga Allah memudahkan. Kerjakan dengan jujur.',
      },
    },
  ]);

  const bankRows = await ins(
    tx,
    question,
    Object.entries(BANK).flatMap(([code, b]) =>
      b.qs.map((q) => ({
        schoolId,
        subjectId: subjectId.get(code)!,
        level: b.level,
        type: q.type,
        body: q.body,
        options: q.type === 'mcq' ? q.options!.map((text, k) => ({ key: KEYS[k]!, text })) : [],
        answer: q.answer,
        explanation: q.explanation ?? null,
        points: q.type === 'mcq' ? 2 : 5,
        createdBy: uid('kurikulum'),
      })),
    ),
  );
  const bankBySubject = new Map<string, typeof bankRows>();
  Object.entries(BANK).reduce((offsetIdx, [code, b]) => {
    bankBySubject.set(code, bankRows.slice(offsetIdx, offsetIdx + b.qs.length));
    return offsetIdx + b.qs.length;
  }, 0);
  note('question', bankRows.length);

  const clsIds = (level: Level) => PROGS.map((p) => classId.get(`now|${level} ${p} 1`)!);
  const examDefs = [
    {
      key: 'mtk-asts',
      type: 'ASTS',
      code: 'MTK',
      level: 'X' as Level,
      mode: 'cbt' as const,
      date: '2026-09-15',
      start: '07:30',
      dur: 90,
      status: 'ready' as const,
      take: 7,
      attempts: 'cbt',
    },
    {
      key: 'bin-asts',
      type: 'ASTS',
      code: 'BIN',
      level: 'XI' as Level,
      mode: 'paper' as const,
      date: '2026-09-16',
      start: '07:30',
      dur: 90,
      status: 'ready' as const,
      take: 5,
      attempts: 'paper',
    },
    {
      key: 'inf-asts',
      type: 'ASTS',
      code: 'INF',
      level: 'X' as Level,
      mode: 'cbt' as const,
      date: '2026-09-17',
      start: '09:15',
      dur: 60,
      status: 'ready' as const,
      take: 7,
      attempts: 'cbt',
    },
    {
      key: 'mtk-asas',
      type: 'ASAS',
      code: 'MTK',
      level: 'X' as Level,
      mode: 'cbt' as const,
      date: '2026-12-08',
      start: '07:30',
      dur: 90,
      status: 'ready' as const,
      take: 7,
      attempts: 'none',
    },
    {
      key: 'pai-asas',
      type: 'ASAS',
      code: 'PAI',
      level: 'X' as Level,
      mode: 'paper' as const,
      date: '2026-12-09',
      start: '07:30',
      dur: 90,
      status: 'ready' as const,
      take: 5,
      attempts: 'none',
    },
    {
      key: 'big-asas',
      type: 'ASAS',
      code: 'BIG',
      level: 'XI' as Level,
      mode: 'both' as const,
      date: '2026-12-10',
      start: '09:15',
      dur: 90,
      status: 'draft' as const,
      take: 3,
      attempts: 'none',
    },
    {
      key: 'dpk-up',
      type: 'UP',
      code: 'DPK',
      level: 'X' as Level,
      mode: 'paper' as const,
      date: '2026-11-20',
      start: '08:00',
      dur: 120,
      status: 'draft' as const,
      take: 5,
      attempts: 'none',
    },
  ];
  const examRows = await ins(
    tx,
    exam,
    examDefs.map((e) => {
      const et = examTypeBy(e.type);
      return {
        schoolId,
        examTypeId: et.id,
        typeName: et.name,
        typeShort: et.shortName,
        title: `${et.shortName} ${subjectName.get(e.code)} Kelas ${e.level} Semester Ganjil 2026/2027`,
        semesterId: ganjil.id,
        subjectId: subjectId.get(e.code)!,
        classIds: e.code === 'DPK' ? [classId.get('now|X TKJ 1')!] : clsIds(e.level),
        mode: e.mode,
        examDate: e.date,
        startTime: e.start,
        durationMinutes: e.dur,
        status: e.status,
        shuffleQuestions: e.mode !== 'paper',
        shuffleOptions: e.mode === 'cbt',
        createdBy: uid('kurikulum'),
      };
    }),
  );
  note('exam', examRows.length);

  const eqRows: (typeof examQuestion.$inferInsert)[] = [];
  const eqMeta: { examIdx: number }[] = [];
  examDefs.forEach((e, ei) => {
    const src = bankBySubject.get(e.code)!.slice(0, e.take);
    src.forEach((q, sort) => {
      eqMeta.push({ examIdx: ei });
      eqRows.push({
        schoolId,
        examId: examRows[ei]!.id,
        sourceQuestionId: q.id,
        sort,
        type: q.type,
        body: q.body,
        options: q.options,
        answer: q.answer,
        points: q.points,
      });
    });
  });
  const eqInserted = await ins(tx, examQuestion, eqRows);
  note('exam_question', eqInserted.length);

  const ESSAY_ANSWERS = [
    'Jawaban sudah sesuai langkah penyelesaian, namun perhitungan akhir kurang teliti.',
    'Menjelaskan konsep dengan benar disertai satu contoh.',
    'Jawaban singkat dan belum lengkap.',
    'Uraian runtut dan sesuai pedoman jawaban.',
  ];
  const attemptRows: (typeof examAttempt.$inferInsert)[] = [];
  const attemptMeta: { examIdx: number; studentIdx: number; absent: boolean }[] = [];
  examDefs.forEach((e, ei) => {
    if (e.attempts === 'none') return;
    const clsNames = PROGS.map((p) => `${e.level} ${p} 1`);
    for (const cn of clsNames)
      for (const i of studentsOfClass(cn)) {
        const absent = chance(0.04);
        const start =
          e.attempts === 'cbt' && !absent
            ? new Date(at(e.date, e.start).getTime() + int(0, 6) * 60_000)
            : null;
        attemptMeta.push({ examIdx: ei, studentIdx: i, absent });
        attemptRows.push({
          schoolId,
          examId: examRows[ei]!.id,
          studentId: sid(i),
          absent,
          startedAt: start,
          deadlineAt: start ? new Date(start.getTime() + e.dur * 60_000) : null,
          submittedAt: start
            ? new Date(start.getTime() + int(Math.floor(e.dur * 0.55), e.dur - 2) * 60_000)
            : null,
          blurCount: start ? (chance(0.6) ? 0 : int(1, 5)) : 0,
          updatedBy: e.attempts === 'cbt' ? sid(i) : uid('kurikulum'),
        });
      }
  });
  const attemptInserted = await ins(tx, examAttempt, attemptRows);
  const answers: (typeof examAnswer.$inferInsert)[] = [];
  const totals = new Map<string, number>(); // `${examIdx}|${studentIdx}` -> total poin
  attemptInserted.forEach((a, k) => {
    const m = attemptMeta[k]!;
    if (m.absent) return;
    let total = 0;
    eqInserted.forEach((q, qi) => {
      if (eqMeta[qi]!.examIdx !== m.examIdx) return;
      const ability = students[m.studentIdx]!.ability;
      if (q.type === 'mcq') {
        const correct = chance(clamp(0.72 + 0.12 * ability, 0.2, 0.97));
        const keys = ['A', 'B', 'C', 'D', 'E'];
        const chosen = correct ? q.answer! : pick(keys.filter((x) => x !== q.answer));
        const got = correct ? q.points : 0;
        total += got;
        answers.push({ schoolId, attemptId: a.id, examQuestionId: q.id, answer: chosen, score: got });
      } else {
        const got = clamp(
          Math.round((0.7 + 0.1 * ability + (rnd() - 0.5) * 0.4) * q.points * 2) / 2,
          0,
          q.points,
        );
        total += got;
        answers.push({
          schoolId,
          attemptId: a.id,
          examQuestionId: q.id,
          answer: pick(ESSAY_ANSWERS),
          score: got,
        });
      }
    });
    totals.set(`${m.examIdx}|${m.studentIdx}`, total);
  });
  await put(tx, examAnswer, answers);
  note('exam_attempt', attemptInserted.length);
  note('exam_answer', answers.length);

  // Penilaian yang dikirim dari modul ujian (ASTS), satu per kelas peserta.
  const examAssess: (typeof assessment.$inferInsert)[] = [];
  const examAssessKey: { ei: number; cn: string }[] = [];
  examDefs.forEach((e, ei) => {
    if (e.attempts === 'none') return;
    for (const p of PROGS) {
      const cn = `${e.level} ${p} 1`;
      examAssessKey.push({ ei, cn });
      examAssess.push({
        schoolId,
        semesterId: ganjil.id,
        classId: classId.get(`now|${cn}`)!,
        subjectId: subjectId.get(e.code)!,
        componentId: comp.get('ASTS')!.id,
        teacherId: teacherId.get(teacherKeyFor(e.level, p, e.code))!,
        title: examRows[ei]!.title,
        date: e.date,
        maxScore: 100,
        examId: examRows[ei]!.id,
      });
    }
  });
  const examAssessRows = await ins(tx, assessment, examAssess);
  const examScoreRows: (typeof score.$inferInsert)[] = [];
  examAssessRows.forEach((a, k) => {
    const { ei, cn } = examAssessKey[k]!;
    const maxPts = eqInserted.filter((_, qi) => eqMeta[qi]!.examIdx === ei).reduce((n, q) => n + q.points, 0);
    for (const i of studentsOfClass(cn)) {
      const t = totals.get(`${ei}|${i}`);
      examScoreRows.push({
        schoolId,
        assessmentId: a.id,
        studentId: sid(i),
        value: t === undefined ? null : r1((t / maxPts) * 100),
        note: t === undefined ? 'Tidak hadir' : null,
        updatedBy: adminUid,
      });
    }
  });
  await put(tx, score, examScoreRows);
  note('assessment (dari ujian)', examAssessRows.length);
  note('score (dari ujian)', examScoreRows.length);

  /* ---- 10. rapor ---- */
  const kkm = 75;
  const settingsP = { predicateA: 90, predicateB: 80, predicateC: 70 };
  // Semester Genap tahun lalu: nilai lulusan (4 siswa) dan rapor final dengan snapshot.
  const grads = students.map((s, i) => ({ s, i })).filter((x) => x.s.graduated);
  const gradSubjects = (prog: Prog) => ['PAI', 'PP', 'BIN', 'MTK', 'BIG', 'PJOK', ...PRODUCTIVE[prog]];
  const prevAssess: (typeof assessment.$inferInsert)[] = [];
  const prevAssessKey: { prog: Prog; code: string; comp: string }[] = [];
  for (const prog of ['TKJ', 'RPL'] as const)
    for (const code of gradSubjects(prog))
      for (const [cn, title, date] of [
        ['Tugas', 'Tugas Semester', '2026-02-20'],
        ['Ulangan Harian', 'Ulangan Harian', '2026-03-12'],
        ['ASTS', 'Asesmen Sumatif Tengah Semester', '2026-03-17'],
        ['ASAS', 'Asesmen Sumatif Akhir Semester', '2026-06-02'],
      ] as const) {
        prevAssessKey.push({ prog, code, comp: cn });
        prevAssess.push({
          schoolId,
          semesterId: prevGenap.id,
          classId: classId.get(`prev|XII ${prog} 1`)!,
          subjectId: subjectId.get(code)!,
          componentId: comp.get(cn)!.id,
          title,
          date,
          maxScore: 100,
        });
      }
  const prevAssessRows = await ins(tx, assessment, prevAssess);
  const gradMem = new Map<string, { value: number; weight: number }[]>(); // `${i}|${code}` -> [{value, weight}] per komponen
  const prevScoreRows: (typeof score.$inferInsert)[] = [];
  prevAssessRows.forEach((a, k) => {
    const key = prevAssessKey[k]!;
    for (const g of grads.filter((x) => x.s.prog === key.prog)) {
      const v = r1(
        clamp(78 + 8 * g.s.ability + (SUBJECT_OFFSET[key.code] ?? 0) + (rnd() - 0.5) * 10, 50, 100),
      );
      prevScoreRows.push({
        schoolId,
        assessmentId: a.id,
        studentId: sid(g.i),
        value: v,
        updatedBy: adminUid,
      });
      const mk = `${g.i}|${key.code}`;
      gradMem.set(mk, [
        ...(gradMem.get(mk) ?? []),
        { value: v, weight: { Tugas: 20, 'Ulangan Harian': 30, ASTS: 20, ASAS: 30 }[key.comp] ?? 0 },
      ]);
    }
  });
  await put(tx, score, prevScoreRows);
  const reports: (typeof reportCard.$inferInsert)[] = [];
  const genapFinal = new Date(at('2026-07-01', '09:00'));
  for (const g of grads) {
    const subjectsDoc = gradSubjects(g.s.prog).map((code) => {
      const parts = gradMem.get(`${g.i}|${code}`) ?? [];
      const final = finalGrade(
        parts.map((p) => ({ weight: p.weight, scores: [{ value: p.value, max: 100 }] })),
      );
      const pred = final === null ? null : predicateOf(final, settingsP);
      return {
        subjectId: subjectId.get(code)!,
        name: subjectName.get(code)!,
        kkm,
        final,
        predicate: pred,
        description: pred ? descriptionOf(pred, DEFAULT_PREDICATE_DESCRIPTIONS) : null,
        belowKkm: final !== null && final < kkm,
      };
    });
    reports.push({
      schoolId,
      semesterId: prevGenap.id,
      studentId: sid(g.i),
      classId: classId.get(`prev|${g.s.className}`)!,
      homeroomNote: 'Terus tingkatkan prestasi dan akhlak. Selamat menempuh jenjang berikutnya.',
      status: 'final',
      finalizedAt: genapFinal,
      finalizedBy: uid('kurikulum'),
      snapshot: {
        status: 'final',
        school: { name: sch.name, address: 'Jl. Raya Cileles KM. 01, Sukarendah', city: 'Lebak' },
        semester: { id: prevGenap.id, name: 'Genap', academicYear: '2025/2026' },
        student: {
          id: sid(g.i),
          name: g.s.name,
          nis: g.s.nis,
          nisn: g.s.nisn,
          className: g.s.className,
          level: 'XII',
        },
        subjects: subjectsDoc,
        extracurriculars: [{ name: 'Pramuka', predicate: 'A', note: 'Aktif dan disiplin' }],
        attendance: { sick: int(0, 4), excused: int(0, 2), absent: int(0, 1), late: int(0, 5) },
        homeroomNote: 'Terus tingkatkan prestasi dan akhlak. Selamat menempuh jenjang berikutnya.',
        homeroomTeacher: { name: TEACHERS[4]!.name, nip: null },
        principal: { name: 'Hj. Siti Rahmawati, S.Pd., M.M.', nip: null },
        rank: null,
        generatedAt: genapFinal.toISOString(),
      },
    });
  }
  // Rapor draf semester berjalan untuk dua kelas (wali kelas sedang menyusun catatan).
  for (const cn of ['X TKJ 1', 'XI RPL 1']) {
    for (const i of studentsOfClass(cn)) {
      reports.push({
        schoolId,
        semesterId: ganjil.id,
        studentId: sid(i),
        classId: classId.get(`now|${cn}`)!,
        homeroomNote: chance(0.7)
          ? pick([
              'Pertahankan semangat belajar dan tingkatkan kedisiplinan.',
              'Aktif di kelas; perlu lebih rajin mengumpulkan tugas.',
              'Prestasi baik, teruslah mengembangkan kemampuan praktik.',
            ])
          : null,
        status: 'draft',
      });
    }
  }
  await put(tx, reportCard, reports);
  note('report_card', reports.length);

  /* ---- 11. ekstrakurikuler ---- */
  const ekskulDefs: [string, string, string, string | null, string | null, number, string, string, string][] =
    [
      [
        'Pramuka',
        'scout',
        'Gugus depan pembinaan kepramukaan wajib kelas X.',
        'pembina',
        null,
        5,
        '14:00',
        '16:00',
        'Lapangan upacara',
      ],
      [
        'Futsal',
        'sport',
        'Latihan futsal dan persiapan turnamen antar-SMK.',
        null,
        'Coach Dedi Irawan (pelatih eksternal)',
        3,
        '15:30',
        '17:00',
        'Lapangan futsal',
      ],
      [
        'Bola Voli',
        'sport',
        'Latihan bola voli putra dan putri.',
        'pjok',
        null,
        2,
        '15:30',
        '17:00',
        'Lapangan voli',
      ],
      [
        'Paskibra',
        'other',
        'Pasukan pengibar bendera sekolah.',
        'pembina',
        null,
        4,
        '15:30',
        '17:00',
        'Lapangan upacara',
      ],
      [
        'Rohis',
        'religion',
        'Kajian keislaman dan pembinaan akhlak.',
        'pai1',
        null,
        4,
        '15:30',
        '16:30',
        'Masjid sekolah',
      ],
      [
        'Marawis dan Hadrah',
        'art',
        'Seni musik islami dan pertunjukan acara pesantren.',
        null,
        'Ust. Rohmat Hidayat',
        1,
        '15:30',
        '17:00',
        'Aula pesantren',
      ],
      [
        'Kaligrafi',
        'art',
        'Seni kaligrafi Arab (khat naskhi dan tsulus).',
        'sejsbd',
        null,
        3,
        '15:30',
        '16:30',
        'Ruang seni',
      ],
      [
        'Robotik dan IoT',
        'science',
        'Perakitan robot dan proyek Internet of Things.',
        'tkj1',
        null,
        1,
        '15:30',
        '17:00',
        'Lab komputer 1',
      ],
      [
        'Web Developer Club',
        'science',
        'Belajar pengembangan web dan proyek aplikasi.',
        'rpl1',
        null,
        2,
        '15:30',
        '17:00',
        'Lab komputer 2',
      ],
      [
        'English Club',
        'other',
        'Latihan percakapan dan debat bahasa Inggris.',
        'big1',
        null,
        3,
        '15:30',
        '16:30',
        'Ruang 12',
      ],
      [
        'Palang Merah Remaja',
        'other',
        'Pertolongan pertama dan kegiatan kemanusiaan.',
        'bk',
        null,
        5,
        '14:00',
        '15:30',
        'Ruang UKS',
      ],
    ];
  const ekskulRows = await ins(
    tx,
    extracurricular,
    ekskulDefs.map(([name, category, description, coach, ext, weekday, startsAt, endsAt, location]) => ({
      schoolId,
      name,
      category,
      description,
      coachTeacherId: coach ? teacherId.get(coach)! : null,
      externalCoach: ext,
      weekday,
      startsAt,
      endsAt,
      location,
      active: true,
    })),
  );
  const memberSets = ekskulRows.map(() => new Set<number>());
  for (const i of activeIdx) {
    if (students[i]!.level === 'X') memberSets[0]!.add(i); // Pramuka wajib kelas X
    const n = chance(0.15) ? 0 : chance(0.3) ? 2 : 1;
    const gender = students[i]!.gender;
    const options = ekskulRows
      .map((_, k) => k)
      .filter((k) => k !== 0 && (k !== 1 || gender === 'L' || chance(0.1)) && (k !== 6 || chance(0.5)));
    for (const k of shuffle(options).slice(0, n)) memberSets[k]!.add(i);
  }
  const memberRowsInput: (typeof extracurricularMember.$inferInsert)[] = [];
  const memberIdx: [number, number][] = [];
  ekskulRows.forEach((ek, k) => {
    for (const i of memberSets[k]!) {
      memberIdx.push([k, i]);
      memberRowsInput.push({
        schoolId,
        extracurricularId: ek.id,
        studentId: sid(i),
        academicYearId: year.id,
        joinedOn: students[i]!.level === 'X' ? '2026-07-27' : '2026-07-20',
      });
    }
  });
  await put(tx, extracurricularMember, memberRowsInput);
  note('extracurricular_member', memberRowsInput.length);
  // Pertemuan mingguan selama 6 pekan terakhir.
  const sessInput: (typeof extracurricularSession.$inferInsert)[] = [];
  const sessKey: { k: number; date: string }[] = [];
  const topics = [
    'Latihan dasar',
    'Evaluasi kegiatan',
    'Persiapan lomba',
    'Praktik lapangan',
    'Pembahasan materi',
    'Latihan gabungan',
  ];
  ekskulRows.forEach((ek, k) => {
    const wd = ekskulDefs[k]![5];
    for (let w = 0; w < 6; w++) {
      let d = addDays(TODAY, -7 * w);
      while (weekdayOf(d) !== wd || d >= TODAY) d = addDays(d, -1);
      if (isClosed(d)) continue;
      sessKey.push({ k, date: d });
      sessInput.push({
        schoolId,
        extracurricularId: ek.id,
        date: d,
        topic: topics[(k + w) % topics.length]!,
        recordedBy: adminUid,
      });
    }
  });
  const sessRows = await ins(tx, extracurricularSession, sessInput);
  const attInput: (typeof extracurricularAttendance.$inferInsert)[] = [];
  sessRows.forEach((sRow, si) => {
    const { k, date } = sessKey[si]!;
    memberSets[k]!.forEach((i) => {
      if (onPkl(i, date)) return;
      const r = rnd();
      attInput.push({
        schoolId,
        sessionId: sRow.id,
        studentId: sid(i),
        status: r < 0.84 ? 'present' : r < 0.9 ? 'excused' : r < 0.95 ? 'sick' : 'absent',
        recordedBy: adminUid,
      });
    });
  });
  await put(tx, extracurricularAttendance, attInput);
  const assessInput: (typeof extracurricularAssessment.$inferInsert)[] = memberIdx.map(([k, i]) => {
    const r = rnd();
    return {
      schoolId,
      extracurricularId: ekskulRows[k]!.id,
      studentId: sid(i),
      semesterId: ganjil.id,
      predicate:
        r < 0.35 ? ('A' as const) : r < 0.85 ? ('B' as const) : r < 0.97 ? ('C' as const) : ('D' as const),
      note: chance(0.2) ? 'Aktif mengikuti latihan' : null,
      updatedBy: adminUid,
    };
  });
  await put(tx, extracurricularAssessment, assessInput);
  note('extracurricular', ekskulRows.length);
  note('extracurricular_session', sessRows.length);
  note('extracurricular_attendance', attInput.length);
  note('extracurricular_assessment', assessInput.length);

  /* ---- 12. tahfidz dan ibadah ---- */
  const ibadahRows = await ins(
    tx,
    ibadahItem,
    [
      ['Shalat Subuh Berjamaah', 'daily'],
      ['Shalat Dhuha', 'daily'],
      ['Tilawah Al-Qur’an', 'daily'],
      ['Shalat Tahajud', 'daily'],
      ['Puasa Senin-Kamis', 'weekly'],
    ].map(([name, kind], sort) => ({ schoolId, name: name!, kind: kind as 'daily' | 'weekly', sort })),
  );
  const halaqahNames = ['Al-Fatih', 'Al-Furqan', 'An-Nur', 'Al-Hikmah', 'Ar-Rahman', 'Al-Kautsar'];
  const mentors = ['tfz1', 'tfz2', 'pai1', 'pai2', 'arab', 'pembina'];
  const halaqahRows = await ins(
    tx,
    halaqah,
    halaqahNames.map((n, k) => ({
      schoolId,
      academicYearId: year.id,
      name: `Halaqah ${n}`,
      mentorTeacherId: teacherId.get(mentors[k]!)!,
      scheduleNote: k % 2 === 0 ? 'Senin-Kamis, ba’da Subuh' : 'Senin-Kamis, ba’da Isya',
    })),
  );
  const halaqahOf = new Map<number, number>();
  shuffle(activeIdx).forEach((i, k) => {
    halaqahOf.set(i, k % halaqahRows.length);
  });
  await put(
    tx,
    halaqahMember,
    activeIdx.map((i) => ({
      schoolId,
      halaqahId: halaqahRows[halaqahOf.get(i)!]!.id,
      studentId: sid(i),
      academicYearId: year.id,
    })),
  );
  await put(
    tx,
    hafalanTarget,
    activeIdx.map((i) => ({
      schoolId,
      studentId: sid(i),
      semesterId: ganjil.id,
      ziyadahAyahs: students[i]!.level === 'X' ? 120 : 160,
      murajaahAyahs: 400,
    })),
  );
  const entries: (typeof hafalanEntry.$inferInsert)[] = [];
  const tahfidzDays = schoolDaysBack(15);
  for (const i of activeIdx) {
    let surah = clamp(114 - int(0, 14), 78, 114);
    let ayah = 1;
    const mentorUid = adminUid;
    for (const d of tahfidzDays) {
      if (onPkl(i, d) || !chance(0.5)) continue;
      const sr = SURAHS[surah - 1]!;
      const to = Math.min(sr.ayahCount, ayah + int(2, 8));
      const quality = ((): 'fluent' | 'fair' | 'repeat' => {
        const r = rnd();
        return r < 0.7 ? 'fluent' : r < 0.92 ? 'fair' : 'repeat';
      })();
      entries.push({
        schoolId,
        studentId: sid(i),
        halaqahId: halaqahRows[halaqahOf.get(i)!]!.id,
        date: d,
        kind: 'ziyadah',
        surahFrom: surah,
        ayahFrom: ayah,
        surahTo: surah,
        ayahTo: to,
        quality,
        note: quality === 'repeat' ? 'Ulangi, perbaiki tajwid dan makhraj.' : null,
        recordedBy: mentorUid,
      });
      if (to >= sr.ayahCount) {
        surah = Math.max(78, surah - 1);
        ayah = 1;
      } else ayah = to + 1;
      if (chance(0.6)) {
        const mr = Math.min(114, surah + int(1, 6));
        entries.push({
          schoolId,
          studentId: sid(i),
          halaqahId: halaqahRows[halaqahOf.get(i)!]!.id,
          date: d,
          kind: 'murajaah',
          surahFrom: mr,
          ayahFrom: 1,
          surahTo: mr,
          ayahTo: Math.min(SURAHS[mr - 1]!.ayahCount, 12),
          quality: chance(0.8) ? 'fluent' : 'fair',
          recordedBy: mentorUid,
        });
      }
    }
  }
  await put(tx, hafalanEntry, entries);
  const ibadahLogs: (typeof ibadahLog.$inferInsert)[] = [];
  for (const d of schoolDaysBack(7)) {
    for (const i of activeIdx) {
      if (onPkl(i, d)) continue;
      for (const item of ibadahRows) {
        if (item.kind === 'weekly' && ![1, 4].includes(weekdayOf(d))) continue;
        const p = item.name.includes('Tahajud') ? 0.25 : item.name.includes('Puasa') ? 0.4 : 0.85;
        ibadahLogs.push({
          schoolId,
          studentId: sid(i),
          itemId: item.id,
          date: d,
          done: chance(p),
          recordedBy: adminUid,
        });
      }
    }
  }
  await put(tx, ibadahLog, ibadahLogs);
  note('ibadah_item', ibadahRows.length);
  note('halaqah', halaqahRows.length);
  note('halaqah_member', activeIdx.length);
  note('hafalan_target', activeIdx.length);
  note('hafalan_entry', entries.length);
  note('ibadah_log', ibadahLogs.length);

  /* ---- 13. PKL: jurnal, kunjungan, nilai ---- */
  const journalRows: (typeof pklJournal.$inferInsert)[] = [];
  const visitRows: (typeof pklVisit.$inferInsert)[] = [];
  const pklScores: (typeof pklScore.$inferInsert)[] = [];
  const activities = [
    'Instalasi dan konfigurasi perangkat jaringan kantor',
    'Membantu pengecekan dan perawatan komputer pelanggan',
    'Membuat dokumentasi topologi jaringan',
    'Mengikuti briefing harian dan belajar prosedur kerja',
    'Merapikan kabel UTP pada rak server',
    'Membantu input data transaksi harian',
    'Mengembangkan fitur kecil pada aplikasi internal',
    'Rekonsiliasi dan pengarsipan dokumen',
    'Melayani pelanggan dan mencatat keluhan layanan',
  ];
  placementRows.forEach((pl, k) => {
    const meta = placementMeta[k]!;
    const si = meta.studentIdx;
    if (pl.status === 'cancelled') return;
    if (meta.status === 'completed') {
      for (const d of shuffle(schoolDaysBetween('2026-01-12', '2026-03-27')).slice(0, 6).sort())
        journalRows.push({
          schoolId,
          placementId: pl.id,
          date: d,
          activity: pick(activities),
          present: chance(0.95),
          source: chance(0.3) ? 'industry' : 'staff',
          recordedBy: adminUid,
        });
      if (chance(0.3))
        visitRows.push({
          schoolId,
          placementId: pl.id,
          date: '2026-02-18',
          teacherId: pl.supervisorTeacherId,
          notes: 'Kunjungan monitoring: siswa berperilaku baik dan mengikuti arahan pembimbing industri.',
        });
      for (const a of aspectRows) {
        const base = 80 + 6 * students[si]!.ability;
        pklScores.push({
          schoolId,
          placementId: pl.id,
          aspectId: a.id,
          assessor: 'school',
          value: Math.round(clamp(base + (rnd() - 0.5) * 8, 60, 100)),
          note: null,
        });
        if (chance(0.85))
          pklScores.push({
            schoolId,
            placementId: pl.id,
            aspectId: a.id,
            assessor: 'industry',
            value: Math.round(clamp(base + (rnd() - 0.5) * 10, 60, 100)),
            note: chance(0.15) ? 'Cekatan dan mau belajar' : null,
          });
      }
    } else if (meta.status === 'active') {
      for (const d of schoolDaysBetween('2026-10-05', addDays(TODAY, -1)))
        if (chance(0.92))
          journalRows.push({
            schoolId,
            placementId: pl.id,
            date: d,
            activity: pick(activities),
            present: chance(0.97),
            source: chance(0.25) ? 'industry' : 'staff',
            recordedBy: adminUid,
          });
      if (chance(0.6))
        visitRows.push({
          schoolId,
          placementId: pl.id,
          date: '2026-10-28',
          teacherId: pl.supervisorTeacherId,
          notes: 'Monitoring pekan ke-4: kegiatan sesuai rencana, perlu melengkapi jurnal harian.',
        });
      if (chance(0.4))
        for (const a of aspectRows)
          pklScores.push({
            schoolId,
            placementId: pl.id,
            aspectId: a.id,
            assessor: 'school',
            value: Math.round(clamp(80 + 6 * students[si]!.ability + (rnd() - 0.5) * 8, 60, 100)),
            note: null,
          });
    }
  });
  await put(tx, pklJournal, journalRows);
  await put(tx, pklVisit, visitRows);
  await put(tx, pklScore, pklScores);
  note('pkl_aspect', aspectRows.length);
  note('pkl_journal', journalRows.length);
  note('pkl_visit', visitRows.length);
  note('pkl_score', pklScores.length);

  /* ---- 14. keuangan ---- */
  await tx
    .insert(finPaymentMethod)
    .values([
      { schoolId, key: 'cash', label: 'Tunai', sort: 0 },
      { schoolId, key: 'transfer', label: 'Transfer', sort: 1 },
      { schoolId, key: 'qris', label: 'QRIS', sort: 2 },
      { schoolId, key: 'other', label: 'Lainnya', sort: 3 },
    ])
    .onConflictDoNothing();
  await put(tx, finGatewaySetting, [{ schoolId, enabled: false, mode: 'sandbox' }]);

  const feeTypeDefs = [
    { name: 'SPP', kind: 'monthly' as const, scope: 'all' as const },
    { name: 'Uang Gedung', kind: 'one_time' as const, scope: 'all' as const },
    { name: 'Seragam', kind: 'one_time' as const, scope: 'all' as const },
    { name: 'Daftar Ulang Tahunan', kind: 'yearly' as const, scope: 'all' as const },
    { name: 'Praktik Laboratorium Komputer', kind: 'yearly' as const, scope: 'class' as const },
    { name: 'Kegiatan Renang (Outing Class)', kind: 'one_time' as const, scope: 'class' as const },
    { name: 'Ujian Kompetensi Keahlian (UKK)', kind: 'one_time' as const, scope: 'class' as const },
    { name: 'Studi Industri', kind: 'one_time' as const, scope: 'student' as const },
    { name: 'Denda Keterlambatan SPP', kind: 'one_time' as const, scope: 'student' as const },
  ];
  const feeRows = await ins(
    tx,
    finFeeType,
    feeTypeDefs.map((f) => ({ schoolId, ...f })),
  );
  const fee = new Map(feeRows.map((f) => [f.name, f]));
  const planDefs: [string, string | null, number][] = [
    ['SPP', 'X', 325_000],
    ['SPP', 'XI', 300_000],
    ['SPP', 'XII', 300_000],
    ['Uang Gedung', 'X', 3_500_000],
    ['Seragam', 'X', 850_000],
    ['Daftar Ulang Tahunan', null, 450_000],
    ['Praktik Laboratorium Komputer', null, 400_000],
    ['Kegiatan Renang (Outing Class)', 'X', 175_000],
    ['Ujian Kompetensi Keahlian (UKK)', 'XII', 350_000],
    ['Studi Industri', null, 200_000],
  ];
  await put(
    tx,
    finFeePlan,
    planDefs.map(([n, level, amount]) => ({
      schoolId,
      academicYearId: year.id,
      feeTypeId: fee.get(n)!.id,
      level,
      amount,
    })),
  );
  const labClasses = (['TKJ', 'RPL'] as const).flatMap((p) => LEVELS.map((l) => `${l} ${p} 1`));
  const studiIdx = shuffle(activeIdx.filter((i) => students[i]!.className === 'XI RPL 1')).slice(0, 10);
  await put(tx, finFeeTarget, [
    ...labClasses.map((cn) => ({
      schoolId,
      feeTypeId: fee.get('Praktik Laboratorium Komputer')!.id,
      classId: classId.get(`now|${cn}`)!,
    })),
    ...PROGS.map((p) => ({
      schoolId,
      feeTypeId: fee.get('Kegiatan Renang (Outing Class)')!.id,
      classId: classId.get(`now|X ${p} 1`)!,
    })),
    ...PROGS.map((p) => ({
      schoolId,
      feeTypeId: fee.get('Ujian Kompetensi Keahlian (UKK)')!.id,
      classId: classId.get(`now|XII ${p} 1`)!,
    })),
    ...studiIdx.map((i) => ({ schoolId, feeTypeId: fee.get('Studi Industri')!.id, studentId: sid(i) })),
  ]);
  await put(tx, finLateFeeSetting, [
    {
      schoolId,
      mode: 'flat',
      value: 10_000,
      graceDays: 10,
      capAmount: 50_000,
      dueDays: 7,
      feeTypeId: fee.get('Denda Keterlambatan SPP')!.id,
    },
  ]);
  const ruleRows = await ins(tx, finDiscountRule, [
    { schoolId, name: 'Beasiswa Yatim 50%', kind: 'percent', value: 50, feeTypeId: fee.get('SPP')!.id },
    { schoolId, name: 'Beasiswa Prestasi 25%', kind: 'percent', value: 25, feeTypeId: fee.get('SPP')!.id },
    {
      schoolId,
      name: 'Potongan Saudara Kandung',
      kind: 'amount',
      value: 50_000,
      feeTypeId: fee.get('SPP')!.id,
    },
    { schoolId, name: 'Keringanan Dhuafa', kind: 'amount', value: 100_000, feeTypeId: fee.get('SPP')!.id },
  ]);
  const discountOf = new Map<number, (typeof ruleRows)[number]>();
  shuffle(activeIdx.filter((i) => students[i]!.className !== 'XII AKL 1'))
    .slice(0, 22)
    .forEach((i, k) => {
      discountOf.set(i, ruleRows[k < 5 ? 0 : k < 11 ? 1 : k < 17 ? 2 : 3]!);
    });
  await put(
    tx,
    finStudentDiscount,
    [...discountOf].map(([i, r]) => ({
      schoolId,
      studentId: sid(i),
      ruleId: r.id,
      academicYearId: year.id,
      reason: r.name.includes('Yatim')
        ? 'Siswa yatim (surat keterangan desa)'
        : r.name.includes('Prestasi')
          ? 'Juara kelas semester lalu'
          : r.name.includes('Saudara')
            ? 'Kakak-adik terdaftar di sekolah ini'
            : 'Surat keterangan tidak mampu',
    })),
  );
  note('fin_fee_type', feeRows.length);
  note('fin_discount_rule', ruleRows.length);
  note('fin_student_discount', discountOf.size);

  // Tagihan
  interface InvDef {
    studentIdx: number;
    fee: string;
    period: string | null;
    title: string;
    amount: number;
    discount: number;
    reason: string | null;
    due: string;
    status: 'open' | 'void';
    voidReason: string | null;
    key: string;
  }
  const invDefs: InvDef[] = [];
  const planAmount = (feeName: string, level: Level) =>
    (planDefs.find((p) => p[0] === feeName && p[1] === level) ??
      planDefs.find((p) => p[0] === feeName && p[1] === null))?.[2] ?? 0;
  const spMonths = [7, 8, 9, 10, 11];
  const feeMembers = (feeName: string, i: number): boolean => {
    const s = students[i]!;
    switch (feeName) {
      case 'Uang Gedung':
      case 'Seragam':
        return s.level === 'X';
      case 'Praktik Laboratorium Komputer':
        return labClasses.includes(s.className);
      case 'Kegiatan Renang (Outing Class)':
        return s.level === 'X';
      case 'Ujian Kompetensi Keahlian (UKK)':
        return s.level === 'XII';
      case 'Studi Industri':
        return studiIdx.includes(i);
      default:
        return true;
    }
  };
  const dueOf: Record<string, string> = {
    'Uang Gedung': '2026-08-31',
    Seragam: '2026-07-31',
    'Daftar Ulang Tahunan': '2026-07-31',
    'Praktik Laboratorium Komputer': '2026-08-31',
    'Kegiatan Renang (Outing Class)': '2026-10-31',
    'Ujian Kompetensi Keahlian (UKK)': '2026-12-15',
    'Studi Industri': '2026-10-15',
  };
  const invStudents = students.map((_, i) => i).filter((i) => students[i]!.status !== 'graduated');
  for (const i of invStudents) {
    const s = students[i]!;
    const inactive = s.status !== 'active';
    const rule = discountOf.get(i);
    for (const m of spMonths) {
      const amount = planAmount('SPP', s.level);
      const disc = rule
        ? rule.kind === 'percent'
          ? Math.floor((amount * rule.value) / 100)
          : Math.min(rule.value, amount)
        : 0;
      const period = `2026-${pad(m, 2)}`;
      const void_ = inactive && m >= 10;
      invDefs.push({
        studentIdx: i,
        fee: 'SPP',
        period,
        title: `SPP ${MONTHS[m - 1]} 2026`,
        amount,
        discount: disc,
        reason: disc > 0 ? rule!.name : null,
        due: `${period}-10`,
        status: void_ ? 'void' : 'open',
        voidReason: void_ ? 'Siswa tidak lagi aktif' : null,
        key: `SPP|${period}`,
      });
    }
    if (inactive) continue;
    for (const f of [
      'Uang Gedung',
      'Seragam',
      'Daftar Ulang Tahunan',
      'Praktik Laboratorium Komputer',
      'Kegiatan Renang (Outing Class)',
      'Ujian Kompetensi Keahlian (UKK)',
      'Studi Industri',
    ]) {
      if (!feeMembers(f, i)) continue;
      invDefs.push({
        studentIdx: i,
        fee: f,
        period: null,
        title: `${f} ${year.name}`,
        amount: planAmount(f, s.level),
        discount: 0,
        reason: null,
        due: dueOf[f]!,
        status: 'open',
        voidReason: null,
        key: f,
      });
    }
  }
  const invRows = await ins(
    tx,
    finInvoice,
    invDefs.map((d) => ({
      schoolId,
      studentId: sid(d.studentIdx),
      academicYearId: year.id,
      feeTypeId: fee.get(d.fee)!.id,
      period: d.period,
      title: d.title,
      amount: d.amount,
      discount: d.discount,
      discountReason: d.reason,
      dueDate: d.due,
      status: d.status,
      voidReason: d.voidReason,
      createdBy: treasurerUid,
    })),
  );
  type InvRef = { def: InvDef; id: string; net: number; paid: number };
  const invByStudent = new Map<number, InvRef[]>();
  invDefs.forEach((d, k) => {
    const list = invByStudent.get(d.studentIdx) ?? [];
    list.push({ def: d, id: invRows[k]!.id, net: d.amount - d.discount, paid: 0 });
    invByStudent.set(d.studentIdx, list);
  });

  // Rencana pembayaran per siswa.
  interface PayLine {
    inv: InvRef;
    amount: number;
  }
  interface PayPlan {
    studentIdx: number;
    date: string;
    method: 'cash' | 'transfer' | 'qris';
    lines: PayLine[];
    note: string | null;
    voided?: boolean;
  }
  const plans: PayPlan[] = [];
  const bizDay = (d: string) => {
    let x = d;
    while (weekdayOf(x) > 5 || isClosed(x)) x = addDays(x, 1);
    // biome-ignore lint/complexity/useMathMinMax: membandingkan teks tanggal, bukan angka
    return x < TODAY ? x : TODAY;
  };
  const methodPick = (): PayPlan['method'] => {
    const r = rnd();
    return r < 0.52 ? 'cash' : r < 0.9 ? 'transfer' : 'qris';
  };
  const NOTES = [
    null,
    null,
    null,
    'Dibayar oleh ayah',
    'Dibayar oleh ibu',
    'Transfer BRI a.n. wali',
    'Dititipkan lewat wali kelas',
  ];
  const pay = (i: number, date: string, wanted: { inv: InvRef; amount?: number | undefined }[]): void => {
    const lines: PayLine[] = [];
    for (const w of wanted) {
      const remain = w.inv.net - w.inv.paid;
      const amount = Math.min(remain, w.amount ?? remain);
      if (amount <= 0) continue;
      w.inv.paid += amount;
      lines.push({ inv: w.inv, amount });
    }
    if (lines.length > 0)
      plans.push({ studentIdx: i, date: bizDay(date), method: methodPick(), lines, note: pick(NOTES) });
  };
  for (const i of invStudents) {
    const list = invByStudent.get(i)!;
    const s = students[i]!;
    const inv = (key: string) => list.find((x) => x.def.key === key && x.def.status === 'open');
    const spp = (m: number) => inv(`SPP|2026-${pad(m, 2)}`);
    const profile = rnd();
    // Sampai bulan berapa SPP lunas.
    const paidThrough =
      s.status !== 'active'
        ? 9
        : profile < 0.3
          ? 11
          : profile < 0.68
            ? 10
            : profile < 0.8
              ? 9
              : profile < 0.9
                ? 8
                : profile < 0.96
                  ? 7
                  : 6;
    const partialMonth = s.status === 'active' && chance(0.1) ? paidThrough + 1 : 0;
    // Daftar ulang + seragam + SPP Juli dibayar bersamaan di awal tahun.
    const daftar = inv('Daftar Ulang Tahunan');
    const seragam = inv('Seragam');
    const first: { inv: InvRef; amount?: number | undefined }[] = [];
    if (daftar && chance(0.88)) first.push({ inv: daftar });
    if (seragam && chance(0.92)) first.push({ inv: seragam });
    if (spp(7) && paidThrough >= 7) first.push({ inv: spp(7)! });
    if (first.length > 0) pay(i, `2026-07-${pad(int(20, 31), 2)}`, first);
    // Uang gedung dicicil 2-3 kali.
    const gedung = inv('Uang Gedung');
    if (gedung && chance(0.9)) {
      const parts = chance(0.5) ? 2 : 3;
      const per = Math.floor(gedung.net / parts / 50_000) * 50_000;
      const stopAfter = chance(0.65) ? parts : int(1, parts - 1);
      for (let p = 0; p < stopAfter; p++)
        pay(i, `2026-${pad(7 + p * 2, 2)}-${pad(int(3, 25), 2)}`, [
          { inv: gedung, amount: p === parts - 1 ? undefined : per },
        ]);
    }
    // SPP bulanan
    for (let m = 8; m <= 11; m++) {
      const v = spp(m);
      if (!v) continue;
      if (m <= paidThrough) {
        // kadang dua bulan dibayar sekaligus
        if (m < 11 && m + 1 <= paidThrough && chance(0.12)) {
          pay(i, `2026-${pad(m, 2)}-${pad(int(2, 12), 2)}`, [{ inv: v }, { inv: spp(m + 1)! }]);
          m++;
        } else pay(i, `2026-${pad(m, 2)}-${pad(int(2, m === 11 ? 5 : 14), 2)}`, [{ inv: v }]);
      } else if (m === partialMonth)
        pay(i, `2026-${pad(m, 2)}-${pad(int(8, 18), 2)}`, [
          { inv: v, amount: Math.floor(v.net / 2 / 5000) * 5000 },
        ]);
    }
    // Biaya lain
    const lab = inv('Praktik Laboratorium Komputer');
    if (lab && chance(0.7)) pay(i, `2026-08-${pad(int(3, 28), 2)}`, [{ inv: lab }]);
    const renang = inv('Kegiatan Renang (Outing Class)');
    if (renang && chance(0.55)) pay(i, `2026-10-${pad(int(1, 20), 2)}`, [{ inv: renang }]);
    const studi = inv('Studi Industri');
    if (studi && chance(0.6)) pay(i, `2026-10-${pad(int(1, 14), 2)}`, [{ inv: studi }]);
    const ukk = inv('Ujian Kompetensi Keahlian (UKK)');
    if (ukk && chance(0.12)) pay(i, `2026-11-${pad(int(2, 6), 2)}`, [{ inv: ukk, amount: 150_000 }]);
  }
  // Denda keterlambatan untuk sebagian tagihan SPP Agustus yang belum lunas.
  const lateFeeInvs: { studentIdx: number; parent: string; amount: number }[] = [];
  for (const i of invStudents) {
    const v = invByStudent.get(i)!.find((x) => x.def.key === 'SPP|2026-08' && x.def.status === 'open');
    if (v && v.paid < v.net && lateFeeInvs.length < 8)
      lateFeeInvs.push({ studentIdx: i, parent: v.id, amount: 10_000 });
  }
  const lateRows = await ins(
    tx,
    finInvoice,
    lateFeeInvs.map((l) => ({
      schoolId,
      studentId: sid(l.studentIdx),
      academicYearId: year.id,
      feeTypeId: fee.get('Denda Keterlambatan SPP')!.id,
      period: `${LATE_FEE_PERIOD_PREFIX}${l.parent}`,
      title: 'Denda keterlambatan SPP Agustus 2026',
      amount: l.amount,
      discount: 0,
      dueDate: '2026-10-31',
      createdBy: treasurerUid,
    })),
  );
  lateFeeInvs.forEach((l, k) => {
    if (chance(0.3)) {
      const item = { def: { key: 'late' } as InvDef, id: lateRows[k]!.id, net: l.amount, paid: 0 };
      pay(l.studentIdx, '2026-11-03', [{ inv: item }]);
    }
  });
  // Dua kwitansi yang salah input lalu dibatalkan.
  const voidTargets = plans.filter((p) => p.lines.length === 1).slice(10, 13);
  for (const p of voidTargets) {
    plans.push({
      studentIdx: p.studentIdx,
      date: p.date,
      method: p.method,
      lines: p.lines.map((l) => ({ ...l })),
      note: 'Kwitansi ganda karena salah input',
      voided: true,
    });
  }
  plans.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
  const payInput: (typeof finPayment.$inferInsert)[] = plans.map((p, k) => ({
    schoolId,
    receiptNo: `KWT-2026-${pad(k + 1, 6)}`,
    studentId: sid(p.studentIdx),
    paidAt: at(p.date, hhmm(int(7 * 60 + 30, 15 * 60))),
    method: p.method,
    total: p.lines.reduce((n, l) => n + l.amount, 0),
    note: p.note,
    recordedBy: treasurerUid,
    ...(p.voided
      ? {
          voidedAt: at(p.date, '16:30'),
          voidedBy: treasurerUid,
          voidReason: 'Salah input, kwitansi ganda',
        }
      : {}),
  }));
  const payRows = await ins(tx, finPayment, payInput);
  await put(
    tx,
    finPaymentItem,
    plans.flatMap((p, k) =>
      p.lines.map((l) => ({ schoolId, paymentId: payRows[k]!.id, invoiceId: l.inv.id, amount: l.amount })),
    ),
  );
  await put(tx, finCounter, [{ schoolId, year: 2026, last: plans.length }]);
  note('fin_invoice', invRows.length + lateRows.length);
  note('fin_payment', payRows.length);
  note(
    'fin_payment_item',
    plans.reduce((n, p) => n + p.lines.length, 0),
  );

  /* ---- 15. SPMB ---- */
  await put(
    tx,
    admissionDocumentType,
    [
      ['photo', 'Pas foto 3x4', true],
      ['kk', 'Kartu Keluarga', true],
      ['akta', 'Akta kelahiran', true],
      ['rapor', 'Fotokopi rapor semester terakhir', false],
      ['ijazah', 'Ijazah/SKL SMP/MTs', false],
    ].map(([key, label, required], sort) => ({
      schoolId,
      key: key as string,
      label: label as string,
      required: required as boolean,
      sort,
    })),
  );
  const periodA = (
    await ins(tx, admissionPeriod, [
      {
        schoolId,
        academicYearId: year.id,
        name: 'SPMB Gelombang 1 TA 2026/2027',
        level: 'X',
        opensOn: '2026-02-01',
        closesOn: '2026-05-31',
        quota: 160,
        active: false,
      },
    ])
  )[0]!;
  const periodB = (
    await ins(tx, admissionPeriod, [
      {
        schoolId,
        academicYearId: year.id,
        name: 'SPMB Gelombang 1 TA 2027/2028',
        level: 'X',
        opensOn: '2026-10-15',
        closesOn: '2027-02-27',
        quota: 160,
        active: true,
      },
    ])
  )[0]!;
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const SMP = [
    'SMP Negeri 1 Rangkasbitung',
    'SMP Negeri 2 Warunggunung',
    'MTs Miftahul Huda',
    'SMP IT Al-Fatah Lebak',
    'SMP Negeri 3 Cileles',
    'MTs Negeri 1 Lebak',
  ];
  interface AppDef {
    periodId: string;
    status: 'submitted' | 'verified' | 'accepted' | 'rejected' | 'enrolled' | 'withdrawn';
    created: Date;
    studentIdx?: number;
    prog: Prog;
  }
  const appDefs: AppDef[] = [];
  const enrolledIdx = activeIdx.filter((i) => students[i]!.level === 'X').slice(0, 14);
  enrolledIdx.forEach((i, k) => {
    appDefs.push({
      periodId: periodA.id,
      status: 'enrolled',
      created: at(addDays('2026-02-03', k * 4), '10:00'),
      studentIdx: i,
      prog: students[i]!.prog,
    });
  });
  (['rejected', 'rejected', 'withdrawn', 'withdrawn'] as const).forEach((st, k) => {
    appDefs.push({
      periodId: periodA.id,
      status: st,
      created: at(addDays('2026-03-01', k * 6), '09:30'),
      prog: PROGS[k % 3]!,
    });
  });
  const bStatuses: AppDef['status'][] = [
    ...Array<AppDef['status']>(8).fill('submitted'),
    ...Array<AppDef['status']>(6).fill('verified'),
    ...Array<AppDef['status']>(4).fill('accepted'),
    'rejected',
    'rejected',
    'withdrawn',
    'withdrawn',
  ];
  bStatuses.forEach((st, k) => {
    appDefs.push({
      periodId: periodB.id,
      status: st,
      created: at(addDays('2026-10-16', k), `${pad(8 + (k % 8), 2)}:15`),
      prog: PROGS[k % 3]!,
    });
  });
  const flow: Record<AppDef['status'], string[]> = {
    submitted: ['submitted'],
    verified: ['submitted', 'verified'],
    accepted: ['submitted', 'verified', 'accepted'],
    rejected: ['submitted', 'verified', 'rejected'],
    enrolled: ['submitted', 'verified', 'accepted', 'enrolled'],
    withdrawn: ['submitted', 'withdrawn'],
  };
  const appInput = appDefs.map((a, k) => {
    const st = a.studentIdx !== undefined ? students[a.studentIdx]! : null;
    const gender: 'L' | 'P' = st ? st.gender : chance(0.5) ? 'L' : 'P';
    const g = st ? guardianList[st.guardians[0]!.g]! : null;
    return {
      schoolId,
      periodId: a.periodId,
      regNumber: `SPMB-2026-${pad(k + 1, 4)}`,
      trackingCodeHash: sha(`DEMOSMK-SPMB-${k + 1}`),
      fullName: st ? st.name : genName(gender),
      gender,
      birthPlace: st ? st.birthPlace : pick(BIRTH_PLACES),
      birthDate: st
        ? st.birthDate
        : `${a.periodId === periodA.id ? 2010 : 2011}-${pad(int(1, 12), 2)}-${pad(int(1, 28), 2)}`,
      nisn: st ? st.nisn : chance(0.8) ? `00${pad(int(10, 12), 2)}${pad(int(100_000, 999_999), 6)}` : null,
      previousSchool: pick(SMP),
      address: st ? st.address : address(),
      programId: programId.get(a.prog) ?? null,
      guardianName: g ? g.name : `${pick(MALE_FIRST)} ${pick(MALE_LAST)}`,
      guardianPhone: g ? g.phone : phone(),
      guardianEmail: chance(0.3) ? `wali.spmb${k + 1}@mail.example` : null,
      status: a.status,
      decisionNote:
        a.status === 'accepted' || a.status === 'enrolled'
          ? 'Selamat, ananda diterima di SMK Miftahul Huda.'
          : a.status === 'rejected'
            ? 'Berkas persyaratan belum lengkap hingga batas waktu verifikasi.'
            : null,
      studentId: a.status === 'enrolled' && a.studentIdx !== undefined ? sid(a.studentIdx) : null,
      createdAt: a.created,
    };
  });
  const appRows = await ins(tx, application, appInput);
  const logRows: (typeof applicationStatusLog.$inferInsert)[] = [];
  const docRows: (typeof applicationDocument.$inferInsert)[] = [];
  appRows.forEach((a, k) => {
    const def = appDefs[k]!;
    const steps = flow[def.status];
    steps.forEach((to, s) => {
      logRows.push({
        schoolId,
        applicationId: a.id,
        fromStatus: s === 0 ? null : steps[s - 1]!,
        toStatus: to,
        note: to === 'rejected' ? 'Berkas belum lengkap' : to === 'withdrawn' ? 'Mengundurkan diri' : null,
        actor: s === 0 ? 'applicant' : uid('operator'),
        createdAt: new Date(def.created.getTime() + s * 6 * 3_600_000),
      });
    });
    const kinds = ['photo', 'kk', 'akta', 'rapor'].slice(
      0,
      def.status === 'submitted' && chance(0.5) ? 2 : int(3, 4),
    );
    for (const kind of kinds)
      docRows.push({
        schoolId,
        applicationId: a.id,
        kind,
        fileName: `${kind}-${a.regNumber}.png`,
        mime: 'image/png',
        size: PNG.length,
        dataBase64: PNG.toString('base64'),
        createdAt: def.created,
      });
  });
  await put(tx, applicationStatusLog, logRows);
  await put(tx, applicationDocument, docRows);
  await put(tx, admissionCounter, [{ schoolId, year: 2026, last: appRows.length }]);
  note('admission_period', 2);
  note('application', appRows.length);
  note('application_document', docRows.length);
  note('application_status_log', logRows.length);

  /* ---- 16. administrasi: surat dan tanda tangan ---- */
  await put(tx, letterSetting, [
    {
      schoolId,
      schoolCode: 'SMKMH',
      numberPattern: '{seq}/{code}/{roman}/{year}',
      agendaPattern: 'AG/{seq}/{year}',
    },
  ]);
  const tplRows = await ins(tx, letterTemplate, [
    ...DEFAULT_LETTER_TEMPLATES.map((t) => ({ schoolId, name: t.name, kind: t.kind, body: t.body })),
    {
      schoolId,
      name: 'Surat pengantar PKL',
      kind: 'letter' as const,
      body: 'Nomor: {{nomor}}\nPerihal: Permohonan Penempatan Praktik Kerja Lapangan\n\nYth. Pimpinan Mitra Industri,\n\nDengan hormat, kami mengajukan {{nama}} (NIS {{nis}}, kelas {{kelas}}) untuk melaksanakan Praktik Kerja Lapangan di perusahaan Bapak/Ibu.\n\n{{tanggal}}\n{{jabatan}}\n\n{{penandatangan}}',
    },
  ]);
  const signerRows = await ins(tx, signerCredential, [
    {
      schoolId,
      memberId: memberIdOf.get(`kepsek${DEMO_SUFFIX}`)!,
      name: 'Hj. Siti Rahmawati, S.Pd., M.M.',
      nip: '197504122000122001',
      title: 'Kepala SMK Miftahul Huda',
    },
  ]);
  const signer = signerRows[0]!;
  const letterDefs: {
    direction: 'outgoing' | 'incoming';
    date: string;
    subject: string;
    party: string;
    status: 'draft' | 'signed' | 'revoked';
    tpl?: number;
    studentIdx?: number;
    disposition?: string;
  }[] = [
    {
      direction: 'outgoing',
      date: '2026-07-22',
      subject: 'Undangan rapat wali murid kelas X',
      party: 'Seluruh orang tua/wali murid kelas X',
      status: 'signed',
    },
    {
      direction: 'outgoing',
      date: '2026-08-10',
      subject: 'Surat keterangan siswa aktif',
      party: 'Kepada yang berkepentingan',
      status: 'signed',
      tpl: 0,
      studentIdx: activeIdx[3]!,
    },
    {
      direction: 'outgoing',
      date: '2026-08-24',
      subject: 'Permohonan penempatan PKL',
      party: 'PT Nusantara Digital Teknik',
      status: 'signed',
      tpl: 3,
      studentIdx: activeIdx[60]!,
    },
    {
      direction: 'outgoing',
      date: '2026-09-07',
      subject: 'Surat panggilan orang tua',
      party: 'Orang tua/wali siswa',
      status: 'signed',
      tpl: 1,
      studentIdx: activeIdx[20]!,
    },
    {
      direction: 'outgoing',
      date: '2026-09-29',
      subject: 'Pemberitahuan libur pekan muhasabah pesantren',
      party: 'Seluruh orang tua/wali murid',
      status: 'signed',
    },
    {
      direction: 'outgoing',
      date: '2026-10-12',
      subject: 'Surat keterangan siswa aktif',
      party: 'Kepada yang berkepentingan',
      status: 'revoked',
      tpl: 0,
      studentIdx: activeIdx[44]!,
    },
    {
      direction: 'outgoing',
      date: '2026-10-30',
      subject: 'Permohonan studi industri kelas XI RPL',
      party: 'PT Banten Net Solusi',
      status: 'signed',
    },
    {
      direction: 'outgoing',
      date: '2026-11-04',
      subject: 'Undangan pembagian rapor tengah semester',
      party: 'Orang tua/wali murid',
      status: 'draft',
    },
    {
      direction: 'outgoing',
      date: '2026-11-06',
      subject: 'Permohonan rekomendasi pelatih futsal',
      party: 'Dinas Pendidikan dan Kebudayaan Kabupaten Lebak',
      status: 'draft',
    },
    {
      direction: 'incoming',
      date: '2026-07-28',
      subject: 'Undangan sosialisasi kurikulum Merdeka SMK',
      party: 'Dinas Pendidikan Provinsi Banten',
      status: 'signed',
      disposition: 'Wakil kepala sekolah bidang kurikulum menghadiri.',
    },
    {
      direction: 'incoming',
      date: '2026-09-02',
      subject: 'Permohonan kunjungan industri',
      party: 'SMK Negeri 2 Rangkasbitung',
      status: 'signed',
      disposition: 'Diteruskan kepada humas untuk dijadwalkan.',
    },
    {
      direction: 'incoming',
      date: '2026-10-08',
      subject: 'Surat edaran peringatan Hari Santri Nasional',
      party: 'Kementerian Agama Kabupaten Lebak',
      status: 'signed',
      disposition: 'Koordinasi dengan OSIS dan Rohis.',
    },
    {
      direction: 'incoming',
      date: '2026-10-21',
      subject: 'Penawaran kerja sama pelatihan jaringan',
      party: 'PT Banten Net Solusi',
      status: 'signed',
      disposition: 'Dipelajari oleh ketua program TKJ.',
    },
    {
      direction: 'incoming',
      date: '2026-11-02',
      subject: 'Undangan lomba kompetensi siswa (LKS) tingkat kabupaten',
      party: 'MKKS SMK Kabupaten Lebak',
      status: 'signed',
      disposition: 'Daftarkan peserta TKJ dan RPL.',
    },
  ];
  const seqOut = { n: 0 };
  const seqIn = { n: 0 };
  const letterInput = letterDefs.map((l) => {
    const n = l.direction === 'outgoing' ? ++seqOut.n : ++seqIn.n;
    const month = Number(l.date.slice(5, 7));
    const number =
      l.direction === 'outgoing' ? formatLetterNumber(n, 'SMKMH', month, 2026) : formatAgendaNumber(n, 2026);
    const stu = l.studentIdx !== undefined ? students[l.studentIdx] : undefined;
    return {
      schoolId,
      direction: l.direction,
      number,
      subject: l.subject,
      party: l.party,
      letterDate: l.date,
      body:
        l.direction === 'incoming'
          ? 'Surat diterima dan dicatat pada buku agenda.'
          : stu
            ? `Menerangkan bahwa ${stu.name} (NIS ${stu.nis}, kelas ${stu.className}) adalah siswa aktif SMK Miftahul Huda.`
            : `Dengan hormat, sehubungan dengan ${l.subject.toLowerCase()}, kami sampaikan informasi sebagaimana mestinya.`,
      templateId: l.tpl !== undefined ? tplRows[l.tpl]!.id : null,
      studentId: l.studentIdx !== undefined ? sid(l.studentIdx) : null,
      dispositionNote: l.disposition ?? null,
      status: l.status,
      createdBy: uid('operator'),
    };
  });
  const letterRows = await ins(tx, letter, letterInput);
  await put(
    tx,
    signedDocument,
    letterRows.flatMap((l, k) =>
      letterDefs[k]!.direction === 'outgoing' && letterDefs[k]!.status !== 'draft'
        ? [
            {
              schoolId,
              letterId: l.id,
              signerId: signer.id,
              token: randomBytes(32).toString('base64url'),
              pdfSha256: sha(`${l.number}|${l.subject}`),
              signerName: signer.name,
              signerTitle: signer.title,
              signedAt: at(letterDefs[k]!.date, '10:30'),
              ...(letterDefs[k]!.status === 'revoked'
                ? {
                    revokedAt: at(addDays(letterDefs[k]!.date, 3), '09:00'),
                    revokedReason: 'Data siswa salah, diterbitkan ulang',
                  }
                : {}),
            },
          ]
        : [],
    ),
  );
  await put(tx, letterCounter, [
    { schoolId, direction: 'outgoing', year: 2026, last: seqOut.n },
    { schoolId, direction: 'incoming', year: 2026, last: seqIn.n },
  ]);
  note('letter_template', tplRows.length);
  note('letter', letterRows.length);
  note(
    'signed_document',
    letterDefs.filter((l) => l.direction === 'outgoing' && l.status !== 'draft').length,
  );

  /* ---- 17. pesan WhatsApp (hanya riwayat; tidak ada yang dikirim) ---- */
  await put(tx, msgSetting, [
    {
      schoolId,
      enabled: false,
      delayMinSeconds: 5,
      delayMaxSeconds: 15,
      windowStart: '06:00',
      windowEnd: '20:00',
      absentNoticeAt: '09:00',
    },
  ]);
  await put(
    tx,
    msgTemplate,
    EVENT_KEYS.map((k) => ({ schoolId, eventKey: k, body: DEFAULT_TEMPLATES[k], enabled: true })),
  );
  await put(tx, waAccount, [{ schoolId, desiredState: 'off', status: 'disconnected' }]);
  const msgRows: (typeof msgMessage.$inferInsert)[] = [];
  const lastDays = schoolDaysBack(3);
  const msgSample = shuffle(activeIdx).slice(0, 36);
  const seen = new Set<string>();
  const addMsg = (
    event: EventKey,
    i: number,
    vars: Record<string, string>,
    date: string,
    time: string,
    status: 'sent' | 'skipped',
  ) => {
    const s = students[i]!;
    const gi = s.guardians[0]!.g;
    const dedupe = `${event}:${sid(i)}:${date}:${guardianRows[gi]!.id}:${vars.title ?? ''}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    const body = renderTemplate(DEFAULT_TEMPLATES[event], {
      student: s.name,
      class: s.className,
      school: sch.name,
      ...vars,
    });
    msgRows.push({
      schoolId,
      eventKey: event,
      studentId: sid(i),
      guardianId: guardianRows[gi]!.id,
      toPhone: guardianList[gi]!.phone,
      body,
      status,
      detail:
        status === 'skipped' ? 'Pengiriman WhatsApp dinonaktifkan untuk sekolah ini (data contoh)' : null,
      attempts: status === 'sent' ? 1 : 0,
      dedupeKey: dedupe,
      notBefore: at(date, time),
      sentAt: status === 'sent' ? at(date, time) : null,
      createdAt: at(date, time),
    });
  };
  msgSample.slice(0, 12).forEach((i, k) => {
    const d = lastDays[k % lastDays.length]!;
    const st = dailyStatus.get(`${i}|${d}`);
    if (st === 'present' || st === 'late') {
      addMsg('arrival', i, { time: '06:58', date: d }, d, '06:59', 'sent');
      addMsg('departure', i, { time: '12:52', date: d }, d, '12:53', 'sent');
    }
  });
  for (const [k, i] of msgSample.slice(12, 20).entries()) {
    const d = lastDays[k % lastDays.length]!;
    addMsg('absent', i, { date: d }, d, '09:00', k % 4 === 3 ? 'skipped' : 'sent');
  }
  plans
    .filter((p) => !p.voided)
    .slice(-14)
    .forEach((p) => {
      addMsg(
        'payment',
        p.studentIdx,
        {
          amount: formatRupiah(p.lines.reduce((n, l) => n + l.amount, 0)),
          receipt: `KWT-2026-${pad(plans.indexOf(p) + 1, 6)}`,
          title: p.lines[0]!.inv.def.title ?? 'SPP',
          date: p.date,
        },
        p.date,
        '14:10',
        'sent',
      );
    });
  for (const i of msgSample.slice(20, 28))
    addMsg(
      'overdue',
      i,
      { amount: formatRupiah(325_000), title: 'SPP Oktober 2026', due: '10 Oktober 2026' },
      '2026-10-12',
      '08:00',
      'sent',
    );
  for (const i of msgSample.slice(28, 32))
    addMsg(
      'skipped_class',
      i,
      { subject: 'Matematika', date: lastDays[0]!, time: '09:15-10:35' },
      lastDays[0]!,
      '10:45',
      'skipped',
    );
  await put(tx, msgMessage, msgRows);
  note('msg_message', msgRows.length);
  note('msg_template', EVENT_KEYS.length);
  note('msg_setting', 1);
  note('wa_account', 1);

  /* ---- 18. pengumuman, situs, kartu ---- */
  const nowTs = at(TODAY, '08:00');
  const ann = (
    title: string,
    body: string,
    category: 'news' | 'agenda' | 'notice',
    audience: 'public' | 'portal' | 'staff' | 'all',
    daysAgo: number,
    extra: { pinned?: boolean; eventDate?: string; draft?: boolean; expiresAt?: Date } = {},
  ) => ({
    schoolId,
    title,
    body,
    category,
    audience,
    eventDate: extra.eventDate ?? null,
    pinned: extra.pinned ?? false,
    status: extra.draft ? ('draft' as const) : ('published' as const),
    publishedAt: extra.draft ? null : new Date(nowTs.getTime() - daysAgo * 86_400_000),
    expiresAt: extra.expiresAt ?? null,
    createdBy: uid('operator'),
  });
  const announcements = [
    ann(
      'Pendaftaran SPMB Gelombang 1 TA 2027/2028 dibuka',
      'Pendaftaran peserta didik baru dibuka mulai 15 Oktober 2026 untuk jurusan TKJ, RPL, dan AKL. Daftar melalui tombol SPMB di situs ini.',
      'news',
      'public',
      23,
      { pinned: true },
    ),
    ann(
      'Jadwal Asesmen Sumatif Akhir Semester Ganjil',
      'ASAS Ganjil dilaksanakan 7-12 Desember 2026. Kartu peserta ujian dapat dicetak melalui wali kelas.',
      'agenda',
      'all',
      9,
      { eventDate: '2026-12-07' },
    ),
    ann(
      'Pekan Olahraga dan Seni (Porseni) 2026',
      'Porseni antar-kelas diselenggarakan 16-20 November 2026. Pendaftaran cabang lomba melalui pembina OSIS.',
      'agenda',
      'public',
      6,
      { eventDate: '2026-11-16' },
    ),
    ann(
      'Pengumuman pembayaran SPP November 2026',
      'Mohon orang tua/wali melunasi SPP November paling lambat tanggal 10. Pembayaran dapat dilakukan tunai, transfer, atau QRIS di bendahara sekolah.',
      'notice',
      'portal',
      5,
    ),
    ann(
      'Rapat evaluasi guru dan staf',
      'Rapat evaluasi bulanan guru dan staf dilaksanakan Sabtu, 14 November 2026 pukul 09.00 di ruang guru.',
      'notice',
      'staff',
      3,
      { eventDate: '2026-11-14' },
    ),
    ann(
      'Libur Pekan Muhasabah Pesantren',
      'Kegiatan belajar mengajar diliburkan pada 19-20 Oktober 2026. Pembelajaran kembali normal pada 21 Oktober.',
      'notice',
      'all',
      25,
    ),
    ann(
      'Prestasi: Juara 2 LKS Jaringan Komputer tingkat Kabupaten Lebak',
      'Selamat kepada Tim TKJ SMK Miftahul Huda atas prestasi Juara 2 Lomba Kompetensi Siswa bidang IT Network Systems Administration.',
      'news',
      'public',
      14,
    ),
    ann(
      'Kegiatan PKL kelas XI TKJ Gelombang 1',
      'Siswa kelas XI TKJ melaksanakan PKL 5 Oktober - 18 Desember 2026. Orang tua dapat memantau jurnal harian melalui portal.',
      'news',
      'portal',
      33,
    ),
    ann(
      'Pembagian rapor semester Ganjil',
      'Rapor Ganjil dibagikan 9 Januari 2027 oleh wali kelas. Orang tua diharapkan hadir.',
      'agenda',
      'portal',
      2,
      { eventDate: '2027-01-09' },
    ),
    ann(
      'Pengumuman beasiswa prestasi dan yatim',
      'Pengajuan beasiswa semester Genap dibuka sampai 30 November 2026. Formulir tersedia di bendahara.',
      'notice',
      'portal',
      8,
      { expiresAt: new Date(at('2026-11-30', '23:59')) },
    ),
    ann(
      'Tata tertib penggunaan kartu siswa',
      'Kartu siswa wajib dibawa dan ditap di gerbang setiap hari. Kartu hilang segera dilaporkan ke piket.',
      'notice',
      'all',
      40,
    ),
    ann(
      'Draf: Jadwal pengambilan seragam baru',
      'Pengambilan seragam siswa baru gelombang 2 (draf, belum diumumkan).',
      'notice',
      'staff',
      0,
      { draft: true },
    ),
  ];
  await put(tx, announcement, announcements);
  note('announcement', announcements.length);

  await tx
    .insert(schoolProfile)
    .values({
      schoolId,
      tagline: 'Terampil, berakhlak mulia, dan siap kerja',
      about:
        'SMK Miftahul Huda adalah sekolah menengah kejuruan di bawah Yayasan Pondok Pesantren Miftahul Huda yang memadukan kompetensi keahlian (TKJ, RPL, dan AKL) dengan pembinaan akhlak dan tahfidz Al-Qur’an.',
      vision: 'Menjadi SMK unggul yang mencetak lulusan kompeten, berakhlak karimah, dan mandiri.',
      mission:
        'Menyelenggarakan pembelajaran berbasis kompetensi industri; membiasakan ibadah dan hafalan Al-Qur’an; menjalin kemitraan dengan dunia usaha dan dunia industri.',
      address: 'Jl. Raya Cileles KM. 01, Sukarendah, Warunggunung, Lebak, Banten 42352',
      phone: '0221 220912',
      email: 'info@mh.sch.id',
      whatsapp: '6281318990100',
      mapUrl: 'https://maps.google.com/?q=Warunggunung+Lebak',
      accentColor: '#0f766e',
      published: true,
      identitySource: 'school',
    })
    .onConflictDoUpdate({
      target: schoolProfile.schoolId,
      set: {
        tagline: 'Terampil, berakhlak mulia, dan siap kerja',
        about:
          'SMK Miftahul Huda adalah sekolah menengah kejuruan di bawah Yayasan Pondok Pesantren Miftahul Huda yang memadukan kompetensi keahlian (TKJ, RPL, dan AKL) dengan pembinaan akhlak dan tahfidz Al-Qur’an.',
        vision: 'Menjadi SMK unggul yang mencetak lulusan kompeten, berakhlak karimah, dan mandiri.',
        mission:
          'Menyelenggarakan pembelajaran berbasis kompetensi industri; membiasakan ibadah dan hafalan Al-Qur’an; menjalin kemitraan dengan dunia usaha dan dunia industri.',
        address: 'Jl. Raya Cileles KM. 01, Sukarendah, Warunggunung, Lebak, Banten 42352',
        phone: '0221 220912',
        email: 'info@mh.sch.id',
        whatsapp: '6281318990100',
        mapUrl: 'https://maps.google.com/?q=Warunggunung+Lebak',
        accentColor: '#0f766e',
        published: true,
        identitySource: 'school',
        updatedAt: new Date(),
      },
    });
  await tx
    .insert(schoolIdentity)
    .values({
      schoolId,
      street: 'Jl. Raya Cileles KM. 01',
      village: 'Sukarendah',
      district: 'Warunggunung',
      city: 'Lebak',
      province: 'Banten',
      postalCode: '42352',
      phone: '0221 220912',
      email: 'info@mh.sch.id',
    })
    .onConflictDoNothing();
  await put(tx, schoolDomain, [
    {
      schoolId,
      hostname: 'ppdb.smk-demo.test',
      status: 'failed',
      verificationToken: `edusync-verify-${randomBytes(12).toString('hex')}`,
      lastCheckedAt: at(addDays(TODAY, -1), '03:00'),
      lastError: 'Catatan TXT verifikasi tidak ditemukan',
    },
  ]);
  note('school_domain', 1);

  // Templat kartu: pertahankan yang sudah ada, tambah bila belum (siswa) dan kartu ujian.
  const tplCards = await tx.select().from(cardTemplate).where(eq(cardTemplate.schoolId, schoolId));
  const addCard = async (
    kind: 'student' | 'exam',
    name: string,
    layout: { widthMm: number; heightMm: number; elements: unknown[] },
    isDefault: boolean,
  ) => {
    if (tplCards.some((c) => c.kind === kind && c.name === name)) return;
    await tx.insert(cardTemplate).values({
      schoolId,
      kind,
      name,
      widthMm: layout.widthMm,
      heightMm: layout.heightMm,
      elements: layout.elements as Record<string, unknown>[],
      isDefault,
    });
  };
  if (!tplCards.some((c) => c.kind === 'student'))
    await addCard('student', 'Kartu siswa bawaan', defaultStudentCardLayout(), true);
  if (!tplCards.some((c) => c.kind === 'exam'))
    await addCard('exam', 'Kartu peserta ujian bawaan', defaultExamCardLayout(), true);

  return { kelasAktif: curClasses.length };
});
void result;

/* ---------------------------------------------------------------- ringkasan ---------------------------------------------------------------- */

console.log('Seed demo SMK selesai. Ringkasan baris yang dibuat:');
for (const [k, n] of stats) console.log(`  ${k}: ${n}`);
console.log(`Akun demo (kata sandi dari DEV_SEED_PASSWORD): ${ACCOUNTS.map((a) => a.email).join(', ')}`);
await pool.end();
await app.close();
