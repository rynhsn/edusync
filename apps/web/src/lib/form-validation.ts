/**
 * Validasi isian formulir di sisi klien, murni (tanpa React) supaya mudah diuji. Aturannya mengikuti zod di API
 * (apps/api/src/routes/people.ts dan academic-structure.ts); satu-satunya tambahan klien: tanggal lahir tidak boleh
 * di masa depan. Hasilnya berupa kode galat (bukan teks) yang diterjemahkan oleh komponen FieldError.
 */

export type IssueCode =
  | 'required'
  | 'tooLong'
  | 'nik'
  | 'nuptk'
  | 'idFormat'
  | 'codeFormat'
  | 'phone'
  | 'email'
  | 'dateInvalid'
  | 'dateFuture'
  | 'choose'
  | 'intInvalid'
  | 'range'
  | 'urlInvalid'
  | 'timeOrder'
  | 'dateOrder'
  | 'hostInvalid'
  | 'custom';

export interface FieldIssue {
  code: IssueCode;
  /** Batas panjang, untuk kode `tooLong`; batas atas untuk `range`. */
  max?: number;
  /** Batas bawah, untuk kode `range`. */
  min?: number;
  /** Untuk kode `custom`: kunci pesan lengkap (mis. `examForm.pickClasses`) di berkas pesan next-intl. */
  key?: string;
  /** Nilai ICU untuk pesan `custom`. */
  values?: Record<string, string | number>;
}

export type FieldErrors<K extends string> = Partial<Record<K, FieldIssue>>;

/** Sama dengan normalizePhone di API: digit berawalan 62; null bila kosong, undefined bila tidak masuk akal. */
export function normalizePhone(input: string): string | null | undefined {
  const raw = input.trim();
  if (!raw) return null;
  if (!/^[+\d][\d\s().-]*$/.test(raw)) return undefined;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith('8')) digits = `62${digits}`;
  return digits.length >= 9 && digits.length <= 15 ? digits : undefined;
}

// Pola yang sama dengan z.email() bawaan zod 4.
export const EMAIL =
  /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

/** Tanggal hari ini (zona waktu perangkat) dalam bentuk TTTT-BB-HH. */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function isRealDate(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

const needs = (value: string, max: number): FieldIssue | undefined => {
  const v = value.trim();
  if (v === '') return { code: 'required' };
  if (v.length > max) return { code: 'tooLong', max };
  return undefined;
};

const longerThan = (value: string, max: number): FieldIssue | undefined =>
  value.trim().length > max ? { code: 'tooLong', max } : undefined;

/** NIS, NISN, dan NIP: opsional, maksimal 30, hanya huruf, angka, titik, garis miring, tanda hubung. */
const optionalId = (value: string): FieldIssue | undefined => {
  const v = value.trim();
  if (v === '') return undefined;
  if (v.length > 30) return { code: 'tooLong', max: 30 };
  return /^[A-Za-z0-9./-]*$/.test(v) ? undefined : { code: 'idFormat' };
};

/** Buang kunci yang tidak bergalat supaya `Object.keys(errors).length` berarti jumlah isian yang salah. */
function compact<K extends string>(entries: [K, FieldIssue | undefined][]): FieldErrors<K> {
  const out: FieldErrors<K> = {};
  for (const [key, issue] of entries) if (issue) out[key] = issue;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Siswa

export interface StudentValues {
  name: string;
  nis: string;
  nisn: string;
  nik: string;
  birthPlace: string;
  birthDate: string;
  phone: string;
  email: string;
  address: string;
}
export type StudentField = keyof StudentValues;

/** Urutan isian di formulir, dipakai untuk memfokuskan isian salah pertama. */
export const STUDENT_ORDER: StudentField[] = [
  'name',
  'nis',
  'nisn',
  'nik',
  'birthPlace',
  'birthDate',
  'phone',
  'email',
  'address',
];

export function validateStudent(v: StudentValues, today: string = todayIso()): FieldErrors<StudentField> {
  const nik = v.nik.trim();
  const phone = v.phone;
  const email = v.email.trim();
  return compact<StudentField>([
    ['name', needs(v.name, 120)],
    ['nis', optionalId(v.nis)],
    ['nisn', optionalId(v.nisn)],
    ['nik', nik === '' || /^\d{16}$/.test(nik) ? undefined : { code: 'nik' }],
    ['birthPlace', longerThan(v.birthPlace, 80)],
    [
      'birthDate',
      v.birthDate === ''
        ? undefined
        : !isRealDate(v.birthDate)
          ? { code: 'dateInvalid' }
          : v.birthDate > today
            ? { code: 'dateFuture' }
            : undefined,
    ],
    [
      'phone',
      phone.length > 30
        ? { code: 'tooLong', max: 30 }
        : normalizePhone(phone) === undefined
          ? { code: 'phone' }
          : undefined,
    ],
    [
      'email',
      email === ''
        ? undefined
        : email.length > 254
          ? { code: 'tooLong', max: 254 }
          : EMAIL.test(email)
            ? undefined
            : { code: 'email' },
    ],
    ['address', longerThan(v.address, 300)],
  ]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Guru, mata pelajaran, kelas

/** NIK opsional: kosong, atau 16 digit angka. */
export const optionalNik = (value: string): FieldIssue | undefined => {
  const v = value.trim();
  return v === '' || /^\d{16}$/.test(v) ? undefined : { code: 'nik' };
};

/** NUPTK opsional (guru honorer sering belum punya): kosong lolos; bila diisi harus 16 digit angka. */
export const optionalNuptk = (value: string): FieldIssue | undefined => {
  const v = value.trim();
  return v === '' || /^\d{16}$/.test(v) ? undefined : { code: 'nuptk' };
};

/** Tanggal lahir opsional: kosong, tanggal sungguhan, dan tidak di masa depan. */
const optionalBirthDate = (value: string, today: string): FieldIssue | undefined =>
  value === ''
    ? undefined
    : !isRealDate(value)
      ? { code: 'dateInvalid' }
      : value > today
        ? { code: 'dateFuture' }
        : undefined;

const optionalPhoneField = (phone: string): FieldIssue | undefined =>
  phone.length > 30
    ? { code: 'tooLong', max: 30 }
    : normalizePhone(phone) === undefined
      ? { code: 'phone' }
      : undefined;

const optionalEmailField = (raw: string): FieldIssue | undefined => {
  const email = raw.trim();
  if (email === '') return undefined;
  if (email.length > 254) return { code: 'tooLong', max: 254 };
  return EMAIL.test(email) ? undefined : { code: 'email' };
};

export interface TeacherValues {
  name: string;
  nip: string;
  nuptk: string;
  nik: string;
  birthPlace: string;
  birthDate: string;
  education: string;
  phone: string;
  email: string;
  address: string;
}
export type TeacherField = keyof TeacherValues;
/** Urutan isian di formulir guru (Identitas, Kontak, Alamat). */
export const TEACHER_ORDER: TeacherField[] = [
  'name',
  'nip',
  'nuptk',
  'nik',
  'birthPlace',
  'birthDate',
  'education',
  'phone',
  'email',
  'address',
];

export function validateTeacher(v: TeacherValues, today: string = todayIso()): FieldErrors<TeacherField> {
  return compact<TeacherField>([
    ['name', needs(v.name, 120)],
    ['nip', optionalId(v.nip)],
    ['nuptk', optionalNuptk(v.nuptk)],
    ['nik', optionalNik(v.nik)],
    ['birthPlace', longerThan(v.birthPlace, 80)],
    ['birthDate', optionalBirthDate(v.birthDate, today)],
    ['education', longerThan(v.education, 120)],
    ['phone', optionalPhoneField(v.phone)],
    ['email', optionalEmailField(v.email)],
    ['address', longerThan(v.address, 300)],
  ]);
}

export interface SubjectValues {
  code: string;
  name: string;
}
export type SubjectField = keyof SubjectValues;
export const SUBJECT_ORDER: SubjectField[] = ['code', 'name'];

export function validateSubject(v: SubjectValues): FieldErrors<SubjectField> {
  const code = v.code.trim();
  return compact<SubjectField>([
    ['code', needs(v.code, 20) ?? (/^[A-Za-z0-9._-]+$/.test(code) ? undefined : { code: 'codeFormat' })],
    ['name', needs(v.name, 80)],
  ]);
}

export interface ClassValues {
  name: string;
  level: string;
}
export type ClassField = keyof ClassValues;
export const CLASS_ORDER: ClassField[] = ['name', 'level'];

export function validateClass(v: ClassValues): FieldErrors<ClassField> {
  return compact<ClassField>([
    ['name', needs(v.name, 80)],
    ['level', needs(v.level, 20)],
  ]);
}

/** Isian salah pertama menurut urutan tampilan, atau undefined bila semuanya benar. */
export function firstInvalid<K extends string>(errors: FieldErrors<K>, order: readonly K[]): K | undefined {
  return order.find((key) => errors[key] !== undefined);
}
