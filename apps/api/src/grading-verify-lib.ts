import { classRoom, eq, reportCard, semester, sql, type Tx } from '@edusync/db';
import { kkmResolverForClass, loadGradingConfig } from './grading-config-lib';
import { computeGrades } from './grading-lib';
import type { ReportDocument } from './report-card-lib';

/**
 * Verifikasi BACA-SAJA: untuk setiap kelas yang rapornya final, apakah finalisasi ulang HARI INI (konfigurasi hidup) akan
 * mengubah `final`, `predicate`, atau `kkm` dibanding snapshot yang terbit. Menjawab risiko backfill (konfigurasi saat
 * rapor lama difinalkan tidak tersimpan di mana pun, jadi salinan beku untuk data lama adalah konfigurasi hari ini).
 * Hanya SELECT; pemanggil membungkusnya di transaksi tenant (satu sekolah) dan sebaiknya `set transaction read only`.
 */

export interface VerifyDiff {
  studentId: string;
  subjectId: string;
  field: 'final' | 'predicate' | 'kkm';
  report: number | string | null;
  today: number | string | null;
}

export interface VerifyClassResult {
  semesterId: string;
  semesterName: string;
  classId: string;
  className: string;
  students: number;
  /** Siswa dengan paling sedikit satu selisih. */
  changedStudents: number;
  diffs: VerifyDiff[];
}

export async function verifyFinalReports(tx: Tx): Promise<VerifyClassResult[]> {
  const finals = await tx
    .select({
      semesterId: reportCard.semesterId,
      classId: reportCard.classId,
      studentId: reportCard.studentId,
      subjects: sql<ReportDocument['subjects'] | null>`${reportCard.snapshot} -> 'subjects'`,
    })
    .from(reportCard)
    .where(eq(reportCard.status, 'final'));
  const groups = new Map<string, typeof finals>();
  for (const f of finals) {
    const key = `${f.semesterId}|${f.classId}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  const out: VerifyClassResult[] = [];
  for (const members of groups.values()) {
    const { semesterId, classId } = members[0]!;
    const [sem] = await tx.select().from(semester).where(eq(semester.id, semesterId));
    const [cls] = await tx.select().from(classRoom).where(eq(classRoom.id, classId));
    if (!sem || !cls) continue;
    const withSnapshot = members.filter((m) => Array.isArray(m.subjects));
    const subjectIds = [...new Set(withSnapshot.flatMap((m) => m.subjects!.map((s) => s.subjectId)))];
    const diffs: VerifyDiff[] = [];
    if (subjectIds.length > 0) {
      const cfg = await loadGradingConfig(tx, semesterId, { live: true });
      const grades = await computeGrades(tx, {
        semesterId,
        classId,
        subjectIds,
        studentIds: withSnapshot.map((m) => m.studentId),
        components: cfg.components,
        settings: cfg.settings,
      });
      const kkmOf = await kkmResolverForClass(tx, cfg, { classId, subjectIds });
      for (const m of withSnapshot) {
        for (const row of m.subjects!) {
          const g = grades.get(row.subjectId)?.get(m.studentId);
          const today = {
            final: g?.final ?? null,
            predicate: g?.predicate ?? null,
            kkm: kkmOf(row.subjectId),
          };
          for (const field of ['final', 'predicate', 'kkm'] as const) {
            if (row[field] !== today[field]) {
              diffs.push({
                studentId: m.studentId,
                subjectId: row.subjectId,
                field,
                report: row[field],
                today: today[field],
              });
            }
          }
        }
      }
    }
    out.push({
      semesterId,
      semesterName: sem.name,
      classId,
      className: cls.name,
      students: members.length,
      changedStudents: new Set(diffs.map((d) => d.studentId)).size,
      diffs,
    });
  }
  return out.sort(
    (a, b) => a.semesterName.localeCompare(b.semesterName) || a.className.localeCompare(b.className),
  );
}
