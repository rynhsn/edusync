import { ApiError } from './api';

/**
 * Kontrak portal wali/siswa (M11), disalin dari skema Zod di apps/api/src/routes/portal.ts dan portal-public.ts.
 * Tipe ini belum ada di api-types.ts saat berkas ditulis, jadi pemanggilan memakai fetch biasa; setelah
 * `gen:api` memuat endpoint portal, tipe di sini bisa diturunkan dari sana dan `portalRequest` diganti klien openapi.
 */

export type PortalKind = 'guardian' | 'student';

export interface PortalChild {
  id: string;
  name: string;
  nis: string | null;
  nisn: string | null;
  gender: 'L' | 'P';
  status: 'active' | 'graduated' | 'transferred' | 'dropped';
  className: string | null;
  level: string | null;
  academicYear: string | null;
}

export interface PortalSections {
  attendance: boolean;
  grades: boolean;
  finance: boolean;
  tahfidz: boolean;
  announcements: boolean;
}

export interface PortalMe {
  linked: boolean;
  kind: PortalKind | null;
  user: { name: string; email: string };
  school: { id: string; name: string };
  guardian: { id: string; name: string; phone: string | null; email: string | null } | null;
  sections: PortalSections;
  children: (PortalChild & { relation: string | null })[];
}

export type AttendanceStatus = 'present' | 'late' | 'excused' | 'sick' | 'absent';

export interface AttendanceCounts {
  present: number;
  late: number;
  excused: number;
  sick: number;
  absent: number;
}

export interface AttendanceDay {
  date: string;
  status: AttendanceStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
}

export interface PortalAttendance {
  available: boolean;
  from: string;
  to: string;
  counts: AttendanceCounts;
  recorded: number;
  /** (hadir + terlambat) dari hari tercatat; null bila belum ada catatan. */
  percent: number | null;
  days: AttendanceDay[];
}

export type InvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'void';

export interface PortalInvoice {
  id: string;
  title: string;
  feeTypeName: string;
  period: string | null;
  amount: number;
  discount: number;
  discountReason: string | null;
  paid: number;
  outstanding: number;
  dueDate: string;
  status: InvoiceStatus;
  overdue: boolean;
}

export interface PortalReceipt {
  id: string;
  receiptNo: string;
  paidAt: string;
  method: string;
  total: number;
  items: { invoiceId: string; title: string; amount: number }[];
}

export interface PortalInvoices {
  available: boolean;
  openCount: number;
  outstandingTotal: number;
  overdueTotal: number;
  invoices: PortalInvoice[];
  receipts: PortalReceipt[];
  /** Rekening sekolah yang aktif untuk pembayaran transfer. */
  bankAccounts: PortalBankAccount[];
}

export interface PortalBankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  note: string | null;
}

export interface RecentScore {
  subject: string;
  title: string;
  component: string;
  date: string;
  value: number;
  maxScore: number;
  /** Ada (`formative`) bila skor ini umpan balik formatif yang tidak masuk nilai rapor; dihilangkan = sumatif. */
  category?: 'formative';
  /** Ada (false) bila komponen sumatif ini dikeluarkan dari nilai akhir; dihilangkan = ikut nilai akhir. */
  includeInFinal?: false;
}

export type Predicate = 'A' | 'B' | 'C' | 'D';

export interface PortalGrades {
  available: boolean;
  semester: { id: string; name: string } | null;
  semesters: { id: string; name: string; academicYear: string; isActive: boolean }[];
  kkm: number | null;
  average: number | null;
  /**
   * Ada (`descriptive`) bila tingkat kelas anak bermode rapor deskriptif (Fase A): tidak ada angka di respons ini
   * (`kkm` dan `average` null, `subjects` kosong); capaian dibaca dari rapor final.
   */
  reportMode?: 'descriptive';
  /** Hanya ada (`report`) bila angka diambil dari rapor yang sudah final; tak ada pada angka berjalan. */
  source?: 'report';
  subjects: {
    subjectId: string;
    name: string;
    /** Sama seperti di atas, per mapel. */
    source?: 'report';
    /** KKM efektif mapel ini (KKTP, boleh desimal); tidak ada bila server belum menghitungnya per mapel. */
    kkm?: number;
    final: number | null;
    predicate: Predicate | null;
    belowKkm: boolean;
    components: { name: string; weight: number; average: number | null }[];
  }[];
  /**
   * Umpan balik formatif per mapel, TERPISAH dari `subjects` dan tidak memengaruhi nilai akhir, predikat, atau rata-rata.
   * Dihilangkan bila sekolah tidak punya penilaian formatif.
   */
  formative?: PortalFormativeSubject[];
  recentScores: RecentScore[];
}

export interface PortalFormativeSubject {
  subjectId: string;
  name: string;
  components: { name: string; category: 'formative' | 'summative'; average: number }[];
}

export interface PortalReportCardItem {
  semesterId: string;
  semesterName: string;
  academicYear: string;
  className: string;
  finalizedAt: string | null;
  average: number | null;
  subjectsGraded: number;
  subjectsTotal: number;
}

export interface PortalReportCards {
  available: boolean;
  items: PortalReportCardItem[];
}

export interface PortalAnnouncement {
  id: string;
  title: string;
  category: 'news' | 'agenda' | 'notice';
  eventDate: string | null;
  pinned: boolean;
  publishedAt: string | null;
  excerpt: string;
}

export interface PortalTahfidz {
  available: boolean;
  halaqah: string | null;
  coverage: { ayahs: number; percent: number; juzComplete: number; juzCompleteList: number[] };
  semester: {
    id: string | null;
    name: string | null;
    target: { ziyadahAyahs: number; murajaahAyahs: number };
    done: { ziyadahAyahs: number; murajaahAyahs: number };
    percentOfTarget: number | null;
  };
  last30Days: { date: string; ziyadahAyahs: number; murajaahAyahs: number }[];
  streakDays: number;
  lastEntryDate: string | null;
  next: { surah: number; ayah: number } | null;
  recentEntries: {
    date: string;
    kind: 'ziyadah' | 'murajaah';
    quality: 'fluent' | 'fair' | 'repeat';
    surahFrom: number;
    ayahFrom: number;
    surahTo: number;
    ayahTo: number;
    ayahCount: number;
  }[];
}

export interface PortalOverview {
  child: PortalChild;
  sections: PortalSections;
  attendance: {
    available: boolean;
    from: string;
    to: string;
    counts: AttendanceCounts;
    recorded: number;
    percent: number | null;
    recentDays: AttendanceDay[];
  };
  invoices: {
    available: boolean;
    openCount: number;
    outstandingTotal: number;
    overdueTotal: number;
    upcoming: PortalInvoice[];
  };
  grades: { available: boolean; reportMode?: 'descriptive'; recentScores: RecentScore[] };
  reportCards: { available: boolean; items: PortalReportCardItem[] };
  tahfidz: {
    available: boolean;
    halaqah: string | null;
    ayahs: number;
    percent: number;
    juzComplete: number;
    streakDays: number;
    lastEntryDate: string | null;
    percentOfTarget: number | null;
  };
  announcements: { available: boolean; items: PortalAnnouncement[] };
}

/** Tanggapan wali yang ditumpangkan ke dokumen rapor; portal hanya memuat tanggapan wali yang sedang masuk. */
export interface PortalGuardianResponse {
  id: string;
  guardianId: string;
  guardianName: string;
  text: string;
  recordedByKind: 'guardian' | 'staff';
  snapshotVersion: number | null;
  /** true bila rapor difinalkan ulang sesudah tanggapan ditulis. */
  outdated: boolean;
  updatedAt: string;
}

/**
 * Dokumen rapor final satu semester (sama dengan rapor staf ditambah jumlah terlambat). Bagian v2 semuanya opsional.
 * Mode deskriptif (Fase A) tidak memuat `final`, `predicate`, `kkm`, `belowKkm` per mapel dan tidak memuat `rank`.
 */
export interface PortalReportDocument {
  status: 'draft' | 'final';
  school: { name: string; address: string | null; city: string | null };
  semester: { id: string; name: string; academicYear: string };
  student: {
    id: string;
    name: string;
    nis: string | null;
    nisn: string | null;
    className: string;
    level: string;
  };
  subjects: {
    subjectId: string;
    name: string;
    kkm?: number;
    final?: number | null;
    predicate?: Predicate | null;
    description: string | null;
    belowKkm?: boolean;
    descriptionSource?: 'manual' | 'objectives';
  }[];
  extracurriculars: { name: string; predicate: Predicate | null; note: string | null }[];
  attendance: { sick: number; excused: number; absent: number; late: number };
  homeroomNote: string | null;
  homeroomTeacher: { name: string; nip: string | null } | null;
  principal: { name: string; nip: string | null } | null;
  rank?: { position: number; of: number } | null;
  generatedAt: string;
  schemaVersion?: 2;
  reportMode?: 'descriptive';
  cocurricularNote?: string | null;
  developmentNote?: string | null;
  guardianResponses?: PortalGuardianResponse[];
}

/** Status jendela tanggapan wali atas rapor final seorang anak, beserta tanggapan milik sendiri. */
export interface PortalResponseState {
  final: boolean;
  finalizedAt: string | null;
  closesAt: string | null;
  open: boolean;
  windowDays: number | null;
  response: PortalGuardianResponse | null;
}

export interface PortalInviteRow {
  id: string;
  kind: PortalKind;
  targetId: string;
  targetName: string;
  email: string | null;
  expiresAt: string;
  expired: boolean;
  createdAt: string;
}

/** Jawaban pembuatan undangan: `token` dan `link` hanya tampil sekali ini. */
export interface PortalInviteCreated extends PortalInviteRow {
  token: string;
  link: string;
}

export interface PortalAccount {
  id: string;
  memberId: string;
  kind: PortalKind;
  targetId: string;
  targetName: string;
  userName: string;
  userEmail: string;
  status: 'active' | 'disabled';
  createdAt: string;
}

export interface PublicPortalInvite {
  schoolName: string;
  schoolSlug: string;
  kind: PortalKind;
  targetName: string;
  email: string | null;
  accountExists: boolean;
  expiresAt: string;
}

export interface AcceptedPortalInvite {
  schoolSlug: string;
  kind: PortalKind;
  email: string;
}

export const PORTAL_PATHS = {
  me: '/v1/portal/me',
  overview: (id: string) => `/v1/portal/children/${id}/overview`,
  attendance: (id: string, from: string, to: string) =>
    `/v1/portal/children/${id}/attendance?from=${from}&to=${to}`,
  grades: (id: string, semesterId?: string) =>
    `/v1/portal/children/${id}/grades${semesterId ? `?semesterId=${semesterId}` : ''}`,
  invoices: (id: string) => `/v1/portal/children/${id}/invoices`,
  reportCards: (id: string) => `/v1/portal/children/${id}/report-cards`,
  reportCard: (id: string, semesterId: string) => `/v1/portal/children/${id}/report-cards/${semesterId}`,
  reportResponse: (id: string, semesterId: string) =>
    `/v1/portal/children/${id}/report-cards/${semesterId}/response`,
  tahfidz: (id: string) => `/v1/portal/children/${id}/tahfidz`,
  invites: '/v1/portal/invites',
  invite: (id: string) => `/v1/portal/invites/${id}`,
  accounts: '/v1/portal/accounts',
  account: (id: string) => `/v1/portal/accounts/${id}`,
  publicInvite: (token: string) => `/v1/public/portal-invites/${encodeURIComponent(token)}`,
  acceptInvite: (token: string) => `/v1/public/portal-invites/${encodeURIComponent(token)}/accept`,
} as const;

/** Permintaan ke API dengan bentuk galat yang sama seperti `unwrap`. `schoolId` mengisi x-school-id. */
export async function portalRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  options: { schoolId?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.schoolId) headers['x-school-id'] = options.schoolId;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  if (res.ok) {
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
  let err: { code?: string; message?: string } | undefined;
  try {
    err = ((await res.json()) as { error?: { code?: string; message?: string } }).error;
  } catch {
    err = undefined;
  }
  throw new ApiError(err?.message ?? 'Permintaan tidak dapat diproses.', res.status, err?.code);
}
