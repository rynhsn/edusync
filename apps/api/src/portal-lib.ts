import {
  averageOfFinals,
  ayahPercent,
  coverageFromMask,
  coverageMask,
  juzProgressFromMask,
  nextAyah,
  rangeAyahCount,
  uniqueAyahCount,
} from '@edusync/contracts';
import {
  academicYear,
  and,
  announcement,
  asc,
  assessment,
  classRoom,
  dailyAttendance,
  desc,
  enrollment,
  entitlement,
  eq,
  finInvoice,
  finPayment,
  finPaymentItem,
  gradeComponent,
  gt,
  gte,
  hafalanEntry,
  hafalanTarget,
  halaqah,
  halaqahMember,
  inArray,
  isNull,
  lte,
  or,
  portalLink,
  reportCard,
  score,
  semester,
  sql,
  student,
  studentGuardian,
  subject,
  type Tx,
} from '@edusync/db';
import { todayInJakarta } from './attendance-lib';
import { invoiceRows } from './finance-lib';
import { assessedSubjects, computeGrades, loadComponents, loadSettings } from './grading-lib';
import { HttpError } from './http-error';
import type { TenantContext } from './identity/guards';
import { documentSummary, type ReportDocument } from './report-card-lib';

/** Kunci modul tiap bagian portal. Modul inti portal sendiri (`parent_portal`) dicek oleh gerbang route. */
export const PORTAL_SECTIONS = {
  attendance: 'attendance',
  grades: 'grades',
  finance: 'finance',
  tahfidz: 'tahfidz',
  announcements: 'announcements',
} as const;

export type PortalSectionKey = keyof typeof PORTAL_SECTIONS;
export type SectionFlags = Record<PortalSectionKey, boolean>;

const DAY_MS = 86_400_000;
export const addDays = (date: string, n: number) =>
  new Date(Date.parse(date) + n * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

export const notFoundChild = () => new HttpError(404, 'not_found', 'Data tidak ditemukan.');

/** Modul yang sedang aktif untuk sekolah (konteks tenant), dipetakan ke bagian portal. */
export async function sectionFlags(tx: Tx): Promise<SectionFlags> {
  const rows = await tx
    .select({ key: entitlement.moduleKey })
    .from(entitlement)
    .where(gt(entitlement.validUntil, new Date()));
  const active = new Set(rows.map((r) => r.key));
  return {
    attendance: active.has(PORTAL_SECTIONS.attendance),
    grades: active.has(PORTAL_SECTIONS.grades),
    finance: active.has(PORTAL_SECTIONS.finance),
    tahfidz: active.has(PORTAL_SECTIONS.tahfidz),
    announcements: active.has(PORTAL_SECTIONS.announcements),
  };
}

export type PortalLinkRow = typeof portalLink.$inferSelect;

/** Tautan portal milik anggota pemanggil; null bila akun ini bukan akun portal (mis. admin atau staf). */
export async function loadLink(tx: Tx, ctx: TenantContext): Promise<PortalLinkRow | null> {
  const [link] = await tx.select().from(portalLink).where(eq(portalLink.memberId, ctx.memberId));
  return link ?? null;
}

/**
 * Id siswa yang boleh dilihat tautan ini: wali hanya anak yang terhubung lewat `student_guardian`, siswa hanya dirinya.
 * Siswa yang sudah dihapus tidak ikut.
 */
export async function allowedStudentIds(tx: Tx, link: PortalLinkRow): Promise<string[]> {
  if (link.kind === 'student') {
    if (!link.studentId) return [];
    const rows = await tx
      .select({ id: student.id })
      .from(student)
      .where(and(eq(student.id, link.studentId), isNull(student.deletedAt)));
    return rows.map((r) => r.id);
  }
  if (!link.guardianId) return [];
  const rows = await tx
    .select({ id: student.id })
    .from(studentGuardian)
    .innerJoin(student, eq(student.id, studentGuardian.studentId))
    .where(and(eq(studentGuardian.guardianId, link.guardianId), isNull(student.deletedAt)))
    .orderBy(asc(student.name));
  return rows.map((r) => r.id);
}

export interface ChildProfile {
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

/** Profil ringkas siswa beserta kelas terkini (tahun ajaran aktif lebih dulu, lalu yang terbaru). */
export async function childProfiles(tx: Tx, studentIds: string[]): Promise<ChildProfile[]> {
  if (studentIds.length === 0) return [];
  const students = await tx
    .select({
      id: student.id,
      name: student.name,
      nis: student.nis,
      nisn: student.nisn,
      gender: student.gender,
      status: student.status,
    })
    .from(student)
    .where(and(inArray(student.id, studentIds), isNull(student.deletedAt)))
    .orderBy(asc(student.name));
  const enrollments = await tx
    .select({
      studentId: enrollment.studentId,
      className: classRoom.name,
      level: classRoom.level,
      year: academicYear.name,
    })
    .from(enrollment)
    .innerJoin(classRoom, eq(classRoom.id, enrollment.classId))
    .innerJoin(academicYear, eq(academicYear.id, enrollment.academicYearId))
    .where(inArray(enrollment.studentId, studentIds))
    .orderBy(desc(academicYear.isActive), desc(academicYear.startsOn));
  const latest = new Map<string, (typeof enrollments)[number]>();
  for (const e of enrollments) if (!latest.has(e.studentId)) latest.set(e.studentId, e);
  return students.map((s) => {
    const e = latest.get(s.id);
    return { ...s, className: e?.className ?? null, level: e?.level ?? null, academicYear: e?.year ?? null };
  });
}

/* ---------- Absensi gerbang ---------- */

export const ATTENDANCE_DAYS = 30;
const MAX_ATTENDANCE_RANGE_DAYS = 366;

export function resolveAttendanceRange(from: string | undefined, to: string | undefined) {
  const end = to ?? todayInJakarta();
  const start = from ?? addDays(end, -(ATTENDANCE_DAYS - 1));
  if (start > end) throw new HttpError(400, 'invalid_range', 'Tanggal awal harus sebelum tanggal akhir.');
  if (daysBetween(start, end) > MAX_ATTENDANCE_RANGE_DAYS) {
    throw new HttpError(400, 'invalid_range', `Rentang tanggal maksimal ${MAX_ATTENDANCE_RANGE_DAYS} hari.`);
  }
  return { from: start, to: end };
}

export const EMPTY_COUNTS = { present: 0, late: 0, excused: 0, sick: 0, absent: 0 };

/**
 * Absensi gerbang satu siswa pada rentang tanggal. `percent` = (hadir + terlambat) dari hari yang tercatat,
 * dibulatkan; null bila belum ada hari tercatat. Catatan internal piket tidak diteruskan ke portal.
 */
export async function attendanceFor(tx: Tx, studentId: string, from: string, to: string) {
  const rows = await tx
    .select({
      date: dailyAttendance.date,
      status: dailyAttendance.status,
      checkInAt: dailyAttendance.checkInAt,
      checkOutAt: dailyAttendance.checkOutAt,
    })
    .from(dailyAttendance)
    .where(
      and(
        eq(dailyAttendance.studentId, studentId),
        gte(dailyAttendance.date, from),
        lte(dailyAttendance.date, to),
      ),
    )
    .orderBy(desc(dailyAttendance.date));
  const counts = { ...EMPTY_COUNTS };
  for (const r of rows) counts[r.status] += 1;
  const recorded = rows.length;
  const percent = recorded > 0 ? Math.round(((counts.present + counts.late) / recorded) * 100) : null;
  return {
    from,
    to,
    counts,
    recorded,
    percent,
    days: rows.map((r) => ({
      date: r.date,
      status: r.status,
      checkInAt: r.checkInAt ? r.checkInAt.toISOString() : null,
      checkOutAt: r.checkOutAt ? r.checkOutAt.toISOString() : null,
    })),
  };
}

/* ---------- Tagihan dan kwitansi ---------- */

/** Tagihan siswa (tanpa yang batal) beserta total sisa dan tunggakan. Memakai ulang `invoiceRows` keuangan. */
export async function invoicesFor(tx: Tx, studentId: string) {
  const { items } = await invoiceRows(tx, { studentId });
  const invoices = items.filter((i) => i.status !== 'void');
  const open = invoices.filter((i) => i.outstanding > 0);
  return {
    invoices,
    openCount: open.length,
    outstandingTotal: open.reduce((sum, i) => sum + i.outstanding, 0),
    overdueTotal: open.filter((i) => i.overdue).reduce((sum, i) => sum + i.outstanding, 0),
  };
}

/** Kwitansi siswa yang tidak batal (terbaru dulu) beserta rincian tagihan yang dibayar. */
export async function receiptsFor(tx: Tx, studentId: string, limit = 50) {
  const payments = await tx
    .select({
      id: finPayment.id,
      receiptNo: finPayment.receiptNo,
      paidAt: finPayment.paidAt,
      method: finPayment.method,
      total: finPayment.total,
    })
    .from(finPayment)
    .where(and(eq(finPayment.studentId, studentId), isNull(finPayment.voidedAt)))
    .orderBy(desc(finPayment.paidAt), desc(finPayment.receiptNo))
    .limit(limit);
  if (payments.length === 0) return [];
  const items = await tx
    .select({
      paymentId: finPaymentItem.paymentId,
      invoiceId: finPaymentItem.invoiceId,
      title: finInvoice.title,
      amount: finPaymentItem.amount,
    })
    .from(finPaymentItem)
    .innerJoin(finInvoice, eq(finInvoice.id, finPaymentItem.invoiceId))
    .where(
      inArray(
        finPaymentItem.paymentId,
        payments.map((p) => p.id),
      ),
    )
    .orderBy(asc(finInvoice.dueDate), asc(finInvoice.title));
  return payments.map((p) => ({
    id: p.id,
    receiptNo: p.receiptNo,
    paidAt: p.paidAt.toISOString(),
    method: p.method,
    total: p.total,
    items: items
      .filter((i) => i.paymentId === p.id)
      .map((i) => ({ invoiceId: i.invoiceId, title: i.title, amount: i.amount })),
  }));
}

/* ---------- Nilai dan rapor ---------- */

/** Semester yang diminta (404 bila bukan milik sekolah ini), atau semester aktif, atau yang paling baru. */
export async function resolveSemester(tx: Tx, semesterId: string | undefined) {
  if (semesterId) {
    const [s] = await tx.select().from(semester).where(eq(semester.id, semesterId));
    if (!s) throw notFoundChild();
    return s;
  }
  const [active] = await tx.select().from(semester).where(eq(semester.isActive, true)).limit(1);
  if (active) return active;
  const [latest] = await tx.select().from(semester).orderBy(desc(semester.startsOn)).limit(1);
  return latest ?? null;
}

export async function semestersWithYear(tx: Tx) {
  return tx
    .select({
      id: semester.id,
      name: semester.name,
      academicYear: academicYear.name,
      isActive: semester.isActive,
    })
    .from(semester)
    .innerJoin(academicYear, eq(academicYear.id, semester.academicYearId))
    .orderBy(desc(semester.startsOn));
}

/** Skor terbaru siswa yang sudah diisi (terbaru dulu). */
export async function recentScoresFor(tx: Tx, studentId: string, limit: number) {
  const rows = await tx
    .select({
      subject: subject.name,
      title: assessment.title,
      component: gradeComponent.name,
      date: assessment.date,
      value: score.value,
      maxScore: assessment.maxScore,
    })
    .from(score)
    .innerJoin(assessment, eq(assessment.id, score.assessmentId))
    .innerJoin(subject, eq(subject.id, assessment.subjectId))
    .innerJoin(gradeComponent, eq(gradeComponent.id, assessment.componentId))
    .where(and(eq(score.studentId, studentId), sql`${score.value} is not null`))
    .orderBy(desc(assessment.date), desc(score.updatedAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, value: r.value as number }));
}

/** Nilai akhir per mapel satu siswa pada satu semester, dengan rumus yang sama dengan rekap penilaian dan rapor. */
export async function gradesFor(tx: Tx, studentId: string, sem: typeof semester.$inferSelect) {
  const [enr] = await tx
    .select({ classId: enrollment.classId })
    .from(enrollment)
    .where(and(eq(enrollment.studentId, studentId), eq(enrollment.academicYearId, sem.academicYearId)));
  const settings = await loadSettings(tx);
  const components = await loadComponents(tx);
  if (!enr) return { kkm: settings.kkm, average: null as number | null, subjects: [] };
  const subjects = await assessedSubjects(tx, sem.id, enr.classId);
  const grades = await computeGrades(tx, {
    semesterId: sem.id,
    classId: enr.classId,
    subjectIds: subjects.map((s) => s.id),
    studentIds: [studentId],
    components,
    settings,
  });
  const rows = subjects.map((sub) => {
    const g = grades.get(sub.id)?.get(studentId);
    const final = g?.final ?? null;
    return {
      subjectId: sub.id,
      name: sub.name,
      final,
      predicate: g?.predicate ?? null,
      belowKkm: final !== null && final < settings.kkm,
      components: components.map((c) => ({
        name: c.name,
        weight: c.weight,
        average: g?.perComponent.find((p) => p.componentId === c.id)?.average ?? null,
      })),
    };
  });
  return { kkm: settings.kkm, average: averageOfFinals(rows.map((r) => r.final)), subjects: rows };
}

/** Rapor yang sudah final (draft tidak pernah tampil di portal), terbaru dulu. */
export async function finalReportCards(tx: Tx, studentId: string) {
  const rows = await tx
    .select({
      semesterId: reportCard.semesterId,
      semesterName: semester.name,
      academicYear: academicYear.name,
      finalizedAt: reportCard.finalizedAt,
      snapshot: reportCard.snapshot,
    })
    .from(reportCard)
    .innerJoin(semester, eq(semester.id, reportCard.semesterId))
    .innerJoin(academicYear, eq(academicYear.id, semester.academicYearId))
    .where(and(eq(reportCard.studentId, studentId), eq(reportCard.status, 'final')))
    .orderBy(desc(semester.startsOn));
  return rows
    .filter((r) => r.snapshot)
    .map((r) => {
      const doc = r.snapshot as ReportDocument;
      const summary = documentSummary(doc);
      return {
        semesterId: r.semesterId,
        semesterName: r.semesterName,
        academicYear: r.academicYear,
        className: doc.student.className,
        finalizedAt: r.finalizedAt ? r.finalizedAt.toISOString() : null,
        average: summary.average,
        subjectsGraded: summary.subjectsGraded,
        subjectsTotal: summary.subjectsTotal,
      };
    });
}

/** Dokumen rapor beku satu semester; null bila belum final. */
export async function finalReportDocument(tx: Tx, studentId: string, semesterId: string) {
  const [row] = await tx
    .select({ snapshot: reportCard.snapshot })
    .from(reportCard)
    .where(
      and(
        eq(reportCard.studentId, studentId),
        eq(reportCard.semesterId, semesterId),
        eq(reportCard.status, 'final'),
      ),
    );
  if (!row?.snapshot) return null;
  return { ...(row.snapshot as ReportDocument), status: 'final' as const };
}

/* ---------- Tahfidz ---------- */

type LedgerRow = {
  date: string;
  kind: 'ziyadah' | 'murajaah';
  quality: 'fluent' | 'fair' | 'repeat';
  surahFrom: number;
  ayahFrom: number;
  surahTo: number;
  ayahTo: number;
};

/** Setoran ziyadah yang dihitung hafalan baru: kualitas selain `repeat`. */
const isNewMemorization = (e: { kind: string; quality: string }) =>
  e.kind === 'ziyadah' && e.quality !== 'repeat';

function uniqueCounts(rows: readonly LedgerRow[]) {
  return {
    ziyadahAyahs: uniqueAyahCount(rows.filter(isNewMemorization)),
    murajaahAyahs: uniqueAyahCount(rows.filter((r) => r.kind === 'murajaah')),
  };
}

/** Progres hafalan satu siswa (rumus sama dengan `/v1/tahfidz/students/:id/progress`). */
export async function tahfidzFor(tx: Tx, studentId: string, today: string) {
  const rows: LedgerRow[] = await tx
    .select({
      date: hafalanEntry.date,
      kind: hafalanEntry.kind,
      quality: hafalanEntry.quality,
      surahFrom: hafalanEntry.surahFrom,
      ayahFrom: hafalanEntry.ayahFrom,
      surahTo: hafalanEntry.surahTo,
      ayahTo: hafalanEntry.ayahTo,
    })
    .from(hafalanEntry)
    .where(eq(hafalanEntry.studentId, studentId))
    .orderBy(asc(hafalanEntry.date), asc(hafalanEntry.createdAt));

  const mask = coverageMask(rows.filter(isNewMemorization));
  const cov = coverageFromMask(mask);
  const juz = juzProgressFromMask(mask);

  const [sem] = await tx.select().from(semester).where(eq(semester.isActive, true)).limit(1);
  let target = { ziyadahAyahs: 0, murajaahAyahs: 0 };
  let done = { ziyadahAyahs: 0, murajaahAyahs: 0 };
  if (sem) {
    const [t] = await tx
      .select()
      .from(hafalanTarget)
      .where(and(eq(hafalanTarget.studentId, studentId), eq(hafalanTarget.semesterId, sem.id)));
    if (t) target = { ziyadahAyahs: t.ziyadahAyahs, murajaahAyahs: t.murajaahAyahs };
    done = uniqueCounts(rows.filter((r) => r.date >= sem.startsOn && r.date <= sem.endsOn));
  }
  const totalTarget = target.ziyadahAyahs + target.murajaahAyahs;
  const percentOfTarget =
    totalTarget > 0
      ? ayahPercent(
          Math.min(done.ziyadahAyahs, target.ziyadahAyahs) +
            Math.min(done.murajaahAyahs, target.murajaahAyahs),
          totalTarget,
        )
      : null;

  const byDate = new Map<string, LedgerRow[]>();
  for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
  const last30Days = Array.from({ length: 30 }, (_, i) => {
    const date = addDays(today, i - 29);
    return { date, ...uniqueCounts(byDate.get(date) ?? []) };
  });
  let cursor = byDate.has(today) ? today : addDays(today, -1);
  let streakDays = 0;
  while (byDate.has(cursor)) {
    streakDays += 1;
    cursor = addDays(cursor, -1);
  }

  const lastZiyadah = [...rows].reverse().find((r) => r.kind === 'ziyadah');
  const next = lastZiyadah
    ? lastZiyadah.quality === 'repeat'
      ? { surah: lastZiyadah.surahFrom, ayah: lastZiyadah.ayahFrom }
      : nextAyah(lastZiyadah.surahTo, lastZiyadah.ayahTo)
    : null;

  const [member] = await tx
    .select({ name: halaqah.name })
    .from(halaqahMember)
    .innerJoin(halaqah, eq(halaqah.id, halaqahMember.halaqahId))
    .innerJoin(academicYear, eq(academicYear.id, halaqahMember.academicYearId))
    .where(eq(halaqahMember.studentId, studentId))
    .orderBy(desc(academicYear.isActive), desc(academicYear.startsOn))
    .limit(1);

  return {
    halaqah: member?.name ?? null,
    coverage: {
      ayahs: cov.ayahs,
      percent: cov.percent,
      juzComplete: juz.count,
      juzCompleteList: juz.complete,
    },
    semester: {
      id: sem?.id ?? null,
      name: sem?.name ?? null,
      target,
      done,
      percentOfTarget,
    },
    last30Days,
    streakDays,
    lastEntryDate: rows.length ? (rows[rows.length - 1] as LedgerRow).date : null,
    next,
    recentEntries: rows
      .slice(-15)
      .reverse()
      .map((r) => ({
        date: r.date,
        kind: r.kind,
        quality: r.quality,
        surahFrom: r.surahFrom,
        ayahFrom: r.ayahFrom,
        surahTo: r.surahTo,
        ayahTo: r.ayahTo,
        ayahCount: rangeAyahCount(r.surahFrom, r.ayahFrom, r.surahTo, r.ayahTo),
      })),
  };
}

/* ---------- Pengumuman ---------- */

/** Pengumuman terbit untuk portal (audiens `portal` atau `all`), belum kedaluwarsa; yang disematkan dulu. */
export async function portalAnnouncements(tx: Tx, limit: number) {
  const now = new Date();
  const rows = await tx
    .select()
    .from(announcement)
    .where(
      and(
        eq(announcement.status, 'published'),
        inArray(announcement.audience, ['portal', 'all']),
        or(isNull(announcement.publishedAt), lte(announcement.publishedAt, now)),
        or(isNull(announcement.expiresAt), gt(announcement.expiresAt, now)),
      ),
    )
    .orderBy(desc(announcement.pinned), desc(announcement.publishedAt), desc(announcement.createdAt))
    .limit(limit);
  return rows.map((a) => ({
    id: a.id,
    title: a.title,
    category: a.category,
    eventDate: a.eventDate,
    pinned: a.pinned,
    publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
    excerpt: a.body.length > 280 ? `${a.body.slice(0, 277)}...` : a.body,
  }));
}
