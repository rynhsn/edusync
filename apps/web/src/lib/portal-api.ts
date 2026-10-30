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
  method: 'cash' | 'transfer' | 'other';
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
}

export interface RecentScore {
  subject: string;
  title: string;
  component: string;
  date: string;
  value: number;
  maxScore: number;
}

export type Predicate = 'A' | 'B' | 'C' | 'D';

export interface PortalGrades {
  available: boolean;
  semester: { id: string; name: string } | null;
  semesters: { id: string; name: string; academicYear: string; isActive: boolean }[];
  kkm: number | null;
  average: number | null;
  subjects: {
    subjectId: string;
    name: string;
    final: number | null;
    predicate: Predicate | null;
    belowKkm: boolean;
    components: { name: string; weight: number; average: number | null }[];
  }[];
  recentScores: RecentScore[];
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
  grades: { available: boolean; recentScores: RecentScore[] };
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

/** Dokumen rapor final satu semester (sama dengan rapor staf ditambah jumlah terlambat). */
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
    kkm: number;
    final: number | null;
    predicate: Predicate | null;
    description: string | null;
    belowKkm: boolean;
  }[];
  extracurriculars: { name: string; predicate: Predicate | null; note: string | null }[];
  attendance: { sick: number; excused: number; absent: number; late: number };
  homeroomNote: string | null;
  homeroomTeacher: { name: string; nip: string | null } | null;
  principal: { name: string; nip: string | null } | null;
  rank: { position: number; of: number } | null;
  generatedAt: string;
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
  method: 'GET' | 'POST' | 'DELETE',
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
