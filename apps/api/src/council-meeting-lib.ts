import { MEETING_FINAL_CODE } from '@edusync/contracts';
import {
  and,
  asc,
  classRoom,
  councilMeeting,
  eq,
  isNull,
  promotionDecision,
  student,
  type Tx,
} from '@edusync/db';
import { HttpError } from './http-error';

/**
 * Berita acara musyawarah dewan pendidik (tahap 3C.3): rekap keputusan kenaikan yang dibahas dan penjaga berita acara final.
 * Rekap diturunkan dari keputusan tersimpan; saat berita acara difinalkan, rekap itu dibekukan ke `council_meeting.minutes`.
 */

export interface DecisionRow {
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  level: string;
  decision: 'promote' | 'retain' | 'graduate';
  reason: string | null;
  followUp: string | null;
  meetingDate: string | null;
  applied: boolean;
}

export interface DecisionDigest {
  totals: { total: number; promote: number; retain: number; graduate: number };
  classes: {
    classId: string;
    name: string;
    level: string;
    promote: number;
    retain: number;
    graduate: number;
  }[];
  /** Murid tinggal kelas beserta alasan dan tindak lanjut (bahan utama berita acara). */
  retained: {
    studentId: string;
    name: string;
    classId: string;
    className: string;
    reason: string | null;
    followUp: string | null;
    meetingDate: string | null;
    applied: boolean;
  }[];
}

/** Rekap murni: jumlah per keputusan (total dan per kelas) dan daftar tinggal kelas. Urutan stabil (kelas lalu nama murid). */
export function buildDigest(rows: readonly DecisionRow[]): DecisionDigest {
  const totals = { total: 0, promote: 0, retain: 0, graduate: 0 };
  const byClass = new Map<string, DecisionDigest['classes'][number]>();
  for (const r of rows) {
    totals.total++;
    totals[r.decision]++;
    const c = byClass.get(r.classId) ?? {
      classId: r.classId,
      name: r.className,
      level: r.level,
      promote: 0,
      retain: 0,
      graduate: 0,
    };
    c[r.decision]++;
    byClass.set(r.classId, c);
  }
  const byName = (a: string, b: string) => a.localeCompare(b, 'id');
  return {
    totals,
    classes: [...byClass.values()].sort((a, b) => byName(a.name, b.name)),
    retained: rows
      .filter((r) => r.decision === 'retain')
      .map((r) => ({
        studentId: r.studentId,
        name: r.studentName,
        classId: r.classId,
        className: r.className,
        reason: r.reason,
        followUp: r.followUp,
        meetingDate: r.meetingDate,
        applied: r.applied,
      }))
      .sort((a, b) => byName(a.className, b.className) || byName(a.name, b.name)),
  };
}

/** Keputusan satu tahun ajaran (opsional: hanya yang tertaut ke satu berita acara, atau satu kelas asal), tanpa murid terhapus. */
export async function loadDecisionRows(
  tx: Tx,
  filter: { yearId: string; meetingId?: string | undefined; classId?: string | undefined },
): Promise<DecisionRow[]> {
  const conds = [eq(promotionDecision.academicYearId, filter.yearId), isNull(student.deletedAt)];
  if (filter.meetingId) conds.push(eq(promotionDecision.meetingId, filter.meetingId));
  if (filter.classId) conds.push(eq(promotionDecision.fromClassId, filter.classId));
  const rows = await tx
    .select({
      studentId: promotionDecision.studentId,
      studentName: student.name,
      classId: classRoom.id,
      className: classRoom.name,
      level: classRoom.level,
      decision: promotionDecision.decision,
      reason: promotionDecision.reason,
      followUp: promotionDecision.followUp,
      meetingDate: promotionDecision.meetingDate,
      appliedAt: promotionDecision.appliedAt,
    })
    .from(promotionDecision)
    .innerJoin(student, eq(student.id, promotionDecision.studentId))
    .innerJoin(classRoom, eq(classRoom.id, promotionDecision.fromClassId))
    .where(and(...conds))
    .orderBy(asc(classRoom.name), asc(student.name));
  return rows.map(({ appliedAt, ...r }) => ({ ...r, applied: appliedAt !== null }));
}

export const meetingFinalError = () =>
  new HttpError(
    409,
    MEETING_FINAL_CODE,
    'Berita acara ini sudah final, jadi isinya dan keputusan yang tertaut terkunci. Buka kembali berita acara bila perlu mengubahnya.',
  );

/** Tolak bila berita acara itu final (dipakai penjaga keputusan tertaut). */
export async function assertMeetingNotFinal(tx: Tx, meetingId: string) {
  const [m] = await tx
    .select({ status: councilMeeting.status })
    .from(councilMeeting)
    .where(eq(councilMeeting.id, meetingId));
  if (m?.status === 'final') throw meetingFinalError();
}
