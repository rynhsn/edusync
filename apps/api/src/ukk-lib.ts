import {
  type GraduationUkkStatus,
  type ReportUkk,
  type UkkBand,
  type UkkPattern,
  type UkkWeights,
  ukkEffectiveBands,
  ukkLatestScored,
  validUkkWeights,
} from '@edusync/contracts';
import {
  and,
  asc,
  classRoom,
  enrollment,
  eq,
  inArray,
  isNull,
  ne,
  programConcentration,
  student,
  type Tx,
  teacher,
  ukkAssessor,
  ukkEvent,
  ukkResult,
  vocationalConcentration,
  vocationalSetting,
} from '@edusync/db';
import { HttpError } from './http-error';
import type { TenantContext } from './identity/guards';

/**
 * UKK (tahap 5.5/5.6): pembantu bersama rute, rapor, kelulusan, dan ekspor. Semua fungsi berjalan di dalam transaksi tenant pemanggilnya.
 * Hasil yang dipakai rapor, kelulusan, dan penomoran = percobaan TERAKHIR yang bernilai akhir per (kegiatan, murid).
 */

export type UkkEventRow = typeof ukkEvent.$inferSelect;
export type UkkResultRow = typeof ukkResult.$inferSelect;

/** Pengaturan UKK sekolah dari `vocational_setting` (tanpa baris = semua bawaan: skala kontrak, tanpa bobot, tidak di rapor). */
export async function loadUkkSetting(tx: Tx) {
  const [s] = await tx.select().from(vocationalSetting);
  const weights: UkkWeights | null =
    s && s.ukkPracticeWeight !== null && s.ukkTheoryWeight !== null
      ? { practice: s.ukkPracticeWeight, theory: s.ukkTheoryWeight }
      : null;
  return {
    bands: (s?.ukkBands ?? null) as Partial<Record<UkkPattern, UkkBand[] | null>> | null,
    weights: weights && validUkkWeights(weights) ? weights : null,
    inReport: s?.ukkInReport ?? false,
    certificatePattern: s?.ukkCertificatePattern ?? null,
  };
}

export const bandsFor = (setting: Awaited<ReturnType<typeof loadUkkSetting>>, pattern: UkkPattern) =>
  ukkEffectiveBands(setting.bands, pattern);

export async function eventOrThrow(tx: Tx, id: string): Promise<UkkEventRow> {
  const [row] = await tx.select().from(ukkEvent).where(eq(ukkEvent.id, id));
  if (!row) throw new HttpError(404, 'not_found', 'Kegiatan UKK tidak ditemukan.');
  return row;
}

/** Penguji internal kegiatan ini: guru yang tercatat di `ukk_assessor` (lewat `teacher.member_id`). */
export async function isInternalAssessor(tx: Tx, ctx: TenantContext, eventId: string): Promise<boolean> {
  const [mine] = await tx.select({ id: teacher.id }).from(teacher).where(eq(teacher.memberId, ctx.memberId));
  if (!mine) return false;
  const [hit] = await tx
    .select({ id: ukkAssessor.id })
    .from(ukkAssessor)
    .where(
      and(
        eq(ukkAssessor.eventId, eventId),
        eq(ukkAssessor.kind, 'internal'),
        eq(ukkAssessor.teacherId, mine.id),
      ),
    )
    .limit(1);
  return !!hit;
}

/** Boleh mengisi hasil: pengelola UKK atau penguji internal kegiatan itu (pola fasilitator kokurikuler). */
export async function canAssessUkk(tx: Tx, ctx: TenantContext, eventId: string): Promise<boolean> {
  if (ctx.permissions.has('ukk:manage')) return true;
  return isInternalAssessor(tx, ctx, eventId);
}

export interface EnrolledStudent {
  studentId: string;
  name: string;
  nis: string | null;
  nisn: string | null;
  classId: string;
  className: string;
}

/**
 * Murid aktif/lulus yang terdaftar pada tahun ajaran kegiatan di rombel yang `program_id`-nya tertaut ke konsentrasi kegiatan
 * (peserta sah UKK). Terurut rombel lalu nama.
 */
export async function enrolledInConcentration(
  tx: Tx,
  event: Pick<UkkEventRow, 'academicYearId' | 'concentrationId'>,
  studentIds?: string[],
): Promise<EnrolledStudent[]> {
  if (studentIds && studentIds.length === 0) return [];
  const rows = await tx
    .select({
      studentId: student.id,
      name: student.name,
      nis: student.nis,
      nisn: student.nisn,
      classId: classRoom.id,
      className: classRoom.name,
    })
    .from(enrollment)
    .innerJoin(student, eq(student.id, enrollment.studentId))
    .innerJoin(classRoom, eq(classRoom.id, enrollment.classId))
    .innerJoin(programConcentration, eq(programConcentration.programId, classRoom.programId))
    .where(
      and(
        eq(enrollment.academicYearId, event.academicYearId),
        eq(programConcentration.concentrationId, event.concentrationId),
        isNull(student.deletedAt),
        inArray(student.status, ['active', 'graduated']),
        studentIds ? inArray(student.id, studentIds) : undefined,
      ),
    )
    .orderBy(asc(classRoom.name), asc(student.name));
  return rows;
}

/** Kelompokkan baris hasil per murid (urut percobaan naik). */
export function groupAttempts<T extends { studentId: string; attemptNo: number }>(rows: readonly T[]) {
  const by = new Map<string, T[]>();
  for (const r of rows) by.set(r.studentId, [...(by.get(r.studentId) ?? []), r]);
  for (const list of by.values()) list.sort((a, b) => a.attemptNo - b.attemptNo);
  return by;
}

/**
 * Hasil UKK untuk kunci dokumen rapor `ukk` (5.6): per murid, percobaan terakhir bernilai pada tiap kegiatan non-draft yang bersemester
 * semester ini. Maksimal tiga kueri tanpa memandang jumlah murid. Hanya dipanggil bila `ukk_in_report` menyala.
 */
export async function loadUkkForReport(
  tx: Tx,
  semesterId: string,
  studentIds: string[],
): Promise<Map<string, ReportUkk>> {
  const out = new Map<string, ReportUkk>();
  if (studentIds.length === 0) return out;
  const events = await tx
    .select({
      id: ukkEvent.id,
      title: ukkEvent.title,
      pattern: ukkEvent.pattern,
      concentration: vocationalConcentration.name,
      startsOn: ukkEvent.startsOn,
    })
    .from(ukkEvent)
    .innerJoin(vocationalConcentration, eq(vocationalConcentration.id, ukkEvent.concentrationId))
    .where(and(eq(ukkEvent.semesterId, semesterId), ne(ukkEvent.status, 'draft')))
    .orderBy(asc(ukkEvent.startsOn), asc(ukkEvent.title), asc(ukkEvent.id));
  if (events.length === 0) return out;
  const results = await tx
    .select()
    .from(ukkResult)
    .where(
      and(
        inArray(
          ukkResult.eventId,
          events.map((e) => e.id),
        ),
        inArray(ukkResult.studentId, studentIds),
      ),
    );
  for (const e of events) {
    const mine = groupAttempts(results.filter((r) => r.eventId === e.id));
    for (const [studentId, attempts] of mine) {
      const best = ukkLatestScored(attempts);
      if (!best || best.finalScore === null) continue;
      const list = out.get(studentId) ?? [];
      list.push({
        title: e.title,
        pattern: e.pattern,
        concentration: e.concentration,
        attempt: best.attemptNo,
        finalScore: best.finalScore,
        band: best.bandCode && best.bandLabel ? { code: best.bandCode, label: best.bandLabel } : null,
        competent: best.competent,
        ...(best.certificateNo ? { certificateNo: best.certificateNo } : {}),
        ...(best.statementNo ? { statementNo: best.statementNo } : {}),
      });
      out.set(studentId, list);
    }
  }
  return out;
}

/**
 * Status UKK per murid untuk saran kelulusan (5.6): `competent` bila hasil terakhir bernilai pada salah satu kegiatan non-draft
 * kompeten; `not_competent` bila ada hasil bernilai tetapi tidak ada yang kompeten; `none` bila belum ada hasil bernilai.
 */
export async function ukkStatusOf(tx: Tx, studentIds: string[]): Promise<Map<string, GraduationUkkStatus>> {
  const out = new Map<string, GraduationUkkStatus>(studentIds.map((id) => [id, 'none']));
  if (studentIds.length === 0) return out;
  const rows = await tx
    .select({ r: ukkResult })
    .from(ukkResult)
    .innerJoin(ukkEvent, eq(ukkEvent.id, ukkResult.eventId))
    .where(and(inArray(ukkResult.studentId, studentIds), ne(ukkEvent.status, 'draft')));
  const byKey = new Map<string, UkkResultRow[]>();
  for (const { r } of rows) {
    const k = `${r.eventId}|${r.studentId}`;
    byKey.set(k, [...(byKey.get(k) ?? []), r]);
  }
  for (const attempts of byKey.values()) {
    const best = ukkLatestScored(attempts);
    if (!best) continue;
    const id = best.studentId;
    if (best.competent === true) out.set(id, 'competent');
    else if (out.get(id) === 'none') out.set(id, 'not_competent');
  }
  return out;
}
