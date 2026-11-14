import type { ReportDocumentV2 } from '@edusync/contracts';
import {
  and,
  count,
  dailyAttendance,
  eq,
  gte,
  inArray,
  lte,
  reportCard,
  schoolLevel,
  type Tx,
} from '@edusync/db';
import { type ClassContext, documentSummary, liveSummary } from './report-card-lib';
import { takes } from './subject-roster-lib';

/**
 * Legger kelas (tahap 3C.2): matriks murid x mapel yang disusun dari bahan yang SAMA dengan daftar dan dokumen rapor
 * (`loadClassContext`, `liveSummary`, `documentSummary`), bukan hitungan baru. Rapor final dibaca dari snapshot; draf dari nilai hidup.
 * Jumlah kueri tidak bergantung pada jumlah murid atau mapel.
 */

type Attendance = { sick: number; excused: number; absent: number; late: number };

/** Ketidakhadiran banyak murid sekaligus (satu kueri); rentang dan penghitungan sama dengan dokumen rapor. */
async function attendanceOf(
  tx: Tx,
  studentIds: string[],
  startsOn: string,
  endsOn: string,
): Promise<Map<string, Attendance>> {
  const out = new Map<string, Attendance>(
    studentIds.map((id) => [id, { sick: 0, excused: 0, absent: 0, late: 0 }]),
  );
  if (studentIds.length === 0) return out;
  const rows = await tx
    .select({ studentId: dailyAttendance.studentId, status: dailyAttendance.status, n: count() })
    .from(dailyAttendance)
    .where(
      and(
        inArray(dailyAttendance.studentId, studentIds),
        gte(dailyAttendance.date, startsOn),
        lte(dailyAttendance.date, endsOn),
      ),
    )
    .groupBy(dailyAttendance.studentId, dailyAttendance.status);
  for (const r of rows) {
    const a = out.get(r.studentId);
    if (
      a &&
      (r.status === 'sick' || r.status === 'excused' || r.status === 'absent' || r.status === 'late')
    ) {
      a[r.status] = r.n;
    }
  }
  return out;
}

export interface LedgerCell {
  subjectId: string;
  final: number | null;
  predicate: 'A' | 'B' | 'C' | 'D' | null;
  belowKkm?: true;
  notTaken?: true;
}

export async function buildLedger(tx: Tx, c: ClassContext) {
  const ids = c.roster.map((s) => s.id);
  const [[level], cards] = await Promise.all([
    tx
      .select({ mode: schoolLevel.reportMode })
      .from(schoolLevel)
      .where(eq(schoolLevel.code, c.cls.level))
      .limit(1),
    ids.length
      ? tx
          .select()
          .from(reportCard)
          .where(and(eq(reportCard.semesterId, c.sem.id), inArray(reportCard.studentId, ids)))
      : [],
  ]);
  const cardOf = new Map(cards.map((r) => [r.studentId, r]));
  const frozenOf = (studentId: string) => {
    const row = cardOf.get(studentId);
    return row?.status === 'final' && row.snapshot ? (row.snapshot as ReportDocumentV2) : null;
  };
  const live = ids.filter((id) => !frozenOf(id));
  const attendance = await attendanceOf(tx, live, c.sem.startsOn, c.sem.endsOn);

  // Kolom: mapel yang dinilai di kelas (urutan sama dengan rapor) ditambah mapel yang hanya ada di snapshot.
  const columns = new Map<string, { id: string; name: string; kkm: number }>(
    c.subjects.map((s) => [s.id, { id: s.id, name: s.name, kkm: c.kkmBySubject.get(s.id) ?? c.kkm }]),
  );
  for (const id of ids) {
    for (const sub of frozenOf(id)?.subjects ?? []) {
      if (!columns.has(sub.subjectId))
        columns.set(sub.subjectId, { id: sub.subjectId, name: sub.name, kkm: sub.kkm });
    }
  }
  const subjects = [...columns.values()];

  const students = c.roster.map((s) => {
    const frozen = frozenOf(s.id);
    const row = cardOf.get(s.id);
    const cells: LedgerCell[] = subjects.map((sub) => {
      if (frozen) {
        const snap = frozen.subjects.find((x) => x.subjectId === sub.id);
        if (snap) {
          return {
            subjectId: sub.id,
            final: snap.final,
            predicate: snap.predicate,
            ...(snap.belowKkm ? { belowKkm: true as const } : {}),
          };
        }
        // Tidak ada di snapshot: tidak diambil bila rombel menandainya demikian; selain itu belum ada nilai saat dibekukan.
        return takes(c.takers, sub.id, s.id)
          ? { subjectId: sub.id, final: null, predicate: null }
          : { subjectId: sub.id, final: null, predicate: null, notTaken: true as const };
      }
      const g = c.grades.get(sub.id)?.get(s.id);
      if (!g) return { subjectId: sub.id, final: null, predicate: null, notTaken: true as const };
      return {
        subjectId: sub.id,
        final: g.final,
        predicate: g.predicate,
        ...(g.final !== null && g.final < sub.kkm ? { belowKkm: true as const } : {}),
      };
    });
    const summary = frozen ? documentSummary(frozen) : liveSummary(c, s.id);
    const rank = frozen ? frozen.rank : c.reportSettings.showRank ? (c.ranks.get(s.id) ?? null) : null;
    return {
      studentId: s.id,
      name: s.name,
      nis: s.nis,
      status: row?.status ?? ('draft' as const),
      source: frozen ? ('snapshot' as const) : ('live' as const),
      cells,
      average: summary.average,
      subjectsGraded: summary.subjectsGraded,
      subjectsTotal: summary.subjectsTotal,
      rank,
      attendance: frozen ? frozen.attendance : (attendance.get(s.id) as Attendance),
    };
  });

  return {
    semester: { id: c.sem.id, name: c.sem.name, academicYear: c.yearName },
    class: { id: c.cls.id, name: c.cls.name, level: c.cls.level },
    ...(level?.mode === 'descriptive' ? { reportMode: 'descriptive' as const } : {}),
    showRank: c.reportSettings.showRank,
    subjects,
    students,
  };
}
