import { isFinalLevel } from '@edusync/contracts';
import {
  academicYear,
  and,
  asc,
  classRoom,
  enrollment,
  enrollmentChange,
  entitlement,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lte,
  program,
  schoolLevel,
  semester,
  sql,
  student,
  studentTransfer,
  type Tx,
} from '@edusync/db';
import { historicalRosterOf } from './attendance-lib';
import { HttpError } from './http-error';
import type { TenantContext } from './identity/guards';
import { assertClassesReportNotFinal, assertStudentsReportNotFinal } from './report-lock-lib';

/**
 * Mutasi murid dan riwayat rombel (tahap 3C.1; rancangan: docs/rancangan-3b-3c-pilihan-mapel-kelulusan.md, bagian 3.5).
 * Semua fungsi di sini berjalan di dalam transaksi tenant pemanggilnya.
 */

export interface RosterRow {
  id: string;
  name: string;
  nis: string | null;
}

type SemesterWindow = { id: string; academicYearId: string; endsOn: string };

/**
 * Roster semester kelas untuk pembacaan dan finalisasi rapor: `historicalRosterOf` (aktif dan lulusan) DITAMBAH murid pindah
 * (`transferred`) atau keluar (`dropped`) yang punya mutasi keluar efektif SETELAH semester itu berakhir (`effective_on` >
 * `ends_on`): mereka ikut sepanjang semester itu, jadi rapornya tetap tampil, dapat dibuka kembali dan difinalkan ulang.
 * `enrollment_change` meluruskan rombel menurut tanggal akhir semester: murid yang pindah rombel setelah semester berakhir
 * tetap tercatat di rombel lama untuk semester itu (dan tidak di rombel baru). Tanpa baris mutasi dan tanpa perpindahan,
 * hasilnya sama persis dengan `historicalRosterOf` (sekolah lama identik; murid pindah lama tanpa catatan tetap dikecualikan).
 * Jalur tulis operasional (`rosterOf`) tidak berubah: murid pindah tidak dapat dinilai lagi.
 */
export async function semesterRosterOf(tx: Tx, classId: string, sem: SemesterWindow) {
  const base = await historicalRosterOf(tx, classId);
  const { cls } = base;
  const yearId = cls.academicYearId;

  // Murid pindah/keluar yang masih terdaftar di kelas ini dan keluar setelah semester berakhir.
  const departed = await tx
    .selectDistinct({ id: student.id, name: student.name, nis: student.nis })
    .from(enrollment)
    .innerJoin(student, eq(student.id, enrollment.studentId))
    .innerJoin(
      studentTransfer,
      and(
        eq(studentTransfer.studentId, student.id),
        eq(studentTransfer.direction, 'out'),
        gt(studentTransfer.effectiveOn, sem.endsOn),
      ),
    )
    .where(
      and(
        eq(enrollment.classId, classId),
        eq(enrollment.academicYearId, yearId),
        isNull(student.deletedAt),
        inArray(student.status, ['transferred', 'dropped']),
      ),
    );

  // Semua perpindahan tahun itu milik murid yang pernah menyentuh kelas ini.
  const changes = await tx
    .select({
      studentId: enrollmentChange.studentId,
      fromClassId: enrollmentChange.fromClassId,
      toClassId: enrollmentChange.toClassId,
      effectiveOn: enrollmentChange.effectiveOn,
      createdAt: enrollmentChange.createdAt,
    })
    .from(enrollmentChange)
    .where(
      and(
        eq(enrollmentChange.academicYearId, yearId),
        inArray(
          enrollmentChange.studentId,
          tx
            .select({ id: enrollmentChange.studentId })
            .from(enrollmentChange)
            .where(
              and(
                eq(enrollmentChange.academicYearId, yearId),
                sql`(${enrollmentChange.fromClassId} = ${classId} or ${enrollmentChange.toClassId} = ${classId})`,
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(enrollmentChange.effectiveOn), asc(enrollmentChange.createdAt));

  if (departed.length === 0 && changes.length === 0) return base;

  const members = new Map<string, RosterRow>(base.rows.map((r) => [r.id, r]));
  for (const d of departed) members.set(d.id, d);

  const byStudent = new Map<string, typeof changes>();
  for (const c of changes) byStudent.set(c.studentId, [...(byStudent.get(c.studentId) ?? []), c]);

  const needLookup: string[] = [];
  for (const [studentId, list] of byStudent) {
    // Rombel pada akhir semester: tujuan perpindahan terakhir yang berlaku sampai `ends_on`; tanpa itu, rombel asal yang paling awal.
    const applied = list.filter((c) => c.effectiveOn <= sem.endsOn);
    const atEnd = applied.length > 0 ? applied[applied.length - 1]!.toClassId : list[0]!.fromClassId;
    if (atEnd === classId) {
      if (!members.has(studentId)) needLookup.push(studentId);
    } else {
      members.delete(studentId);
    }
  }

  if (needLookup.length > 0) {
    // Murid yang kini di rombel lain (atau dicabut) tetapi pada akhir semester masih di rombel ini: ikut bila statusnya sah.
    const rows = await tx
      .select({ id: student.id, name: student.name, nis: student.nis, status: student.status })
      .from(student)
      .where(and(inArray(student.id, needLookup), isNull(student.deletedAt)));
    const leftAfter = new Set(
      (
        await tx
          .select({ id: studentTransfer.studentId })
          .from(studentTransfer)
          .where(
            and(
              inArray(studentTransfer.studentId, needLookup),
              eq(studentTransfer.direction, 'out'),
              gt(studentTransfer.effectiveOn, sem.endsOn),
            ),
          )
      ).map((r) => r.id),
    );
    for (const r of rows) {
      const eligible = r.status === 'active' || r.status === 'graduated' || leftAfter.has(r.id);
      if (eligible) members.set(r.id, { id: r.id, name: r.name, nis: r.nis });
    }
  }

  const rows = [...members.values()].sort((a, b) => a.name.localeCompare(b.name, 'id'));
  return { cls, rows };
}

/**
 * Penjaga pindah rombel dalam tahun: ditolak 409 `report_final` bila rapor murid itu final pada semester tahun itu yang memuat
 * hari ini atau tanggal efektif, atau bila rapor rombel lama/baru final pada semester itu (rombel final mengunci
 * rosternya). Hanya semester pada tahun ajaran enrollment yang diubah.
 */
export async function assertEnrollmentMoveAllowed(
  tx: Tx,
  input: { studentId: string; academicYearId: string; classIds: string[]; dates: string[] },
) {
  const dates = [...new Set(input.dates)];
  const seen = new Set<string>();
  for (const date of dates) {
    const sems = await tx
      .select({ id: semester.id })
      .from(semester)
      .where(
        and(
          eq(semester.academicYearId, input.academicYearId),
          lte(semester.startsOn, date),
          gte(semester.endsOn, date),
        ),
      );
    for (const s of sems) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      await assertStudentsReportNotFinal(tx, s.id, [input.studentId]);
      await assertClassesReportNotFinal(tx, s.id, input.classIds);
    }
  }
}

/** Catat satu perpindahan rombel (hanya bila rombel benar-benar berubah). */
export async function recordEnrollmentChange(
  tx: Tx,
  ctx: TenantContext,
  input: {
    studentId: string;
    academicYearId: string;
    fromClassId: string | null;
    toClassId: string | null;
    effectiveOn: string;
    reason?: string | null | undefined;
  },
) {
  if (input.fromClassId === input.toClassId) return;
  await tx.insert(enrollmentChange).values({
    schoolId: ctx.schoolId,
    studentId: input.studentId,
    academicYearId: input.academicYearId,
    fromClassId: input.fromClassId,
    toClassId: input.toClassId,
    effectiveOn: input.effectiveOn,
    reason: input.reason ?? null,
    actorId: ctx.userId,
  });
}

/**
 * Larangan mutasi pada semester genap tingkat akhir (S4: mekanisme pindahan tidak berlaku): benar bila `classId` bertingkat akhir
 * (`program.final_level_code`, atau tingkat `sort` terbesar) dan `effectiveOn` jatuh pada semester TERAKHIR tahun ajaran kelas itu
 * (semester dengan `starts_on` terbesar; tahun dengan satu semester tidak punya semester genap, jadi tidak terkena).
 */
export async function isFinalLevelEvenSemester(
  tx: Tx,
  classId: string,
  effectiveOn: string,
): Promise<boolean> {
  const [cls] = await tx
    .select({
      level: classRoom.level,
      programId: classRoom.programId,
      academicYearId: classRoom.academicYearId,
    })
    .from(classRoom)
    .where(eq(classRoom.id, classId));
  if (!cls) return false;
  const [levels, prog, sems] = await Promise.all([
    tx.select({ code: schoolLevel.code, sort: schoolLevel.sort }).from(schoolLevel),
    cls.programId
      ? tx
          .select({ finalLevelCode: program.finalLevelCode })
          .from(program)
          .where(eq(program.id, cls.programId))
      : Promise.resolve([]),
    tx
      .select({ startsOn: semester.startsOn })
      .from(semester)
      .where(eq(semester.academicYearId, cls.academicYearId))
      .orderBy(asc(semester.startsOn)),
  ]);
  if (!isFinalLevel(levels, cls.level, prog[0]?.finalLevelCode ?? null)) return false;
  if (sems.length < 2) return false;
  return effectiveOn >= sems[sems.length - 1]!.startsOn;
}

/** Tahun ajaran yang memuat tanggal itu (utamakan yang punya enrollment murid), lalu tahun aktif. Null bila tidak ada. */
export async function yearForDate(tx: Tx, date: string, studentId: string | null) {
  const containing = await tx
    .select({ id: academicYear.id })
    .from(academicYear)
    .where(and(lte(academicYear.startsOn, date), gte(academicYear.endsOn, date)))
    .orderBy(asc(academicYear.startsOn));
  if (containing.length > 0) {
    if (studentId && containing.length > 1) {
      const [enr] = await tx
        .select({ yearId: enrollment.academicYearId })
        .from(enrollment)
        .where(
          and(
            eq(enrollment.studentId, studentId),
            inArray(
              enrollment.academicYearId,
              containing.map((y) => y.id),
            ),
          ),
        );
      if (enr) return enr.yearId;
    }
    return containing[0]!.id;
  }
  const [active] = await tx
    .select({ id: academicYear.id })
    .from(academicYear)
    .where(eq(academicYear.isActive, true));
  return active?.id ?? null;
}

/** Modul berbayar aktif untuk sekolah (di dalam transaksi tenant). */
export async function moduleActive(tx: Tx, moduleKey: string): Promise<boolean> {
  const rows = await tx
    .select({ key: entitlement.moduleKey })
    .from(entitlement)
    .where(and(eq(entitlement.moduleKey, moduleKey), gt(entitlement.validUntil, new Date())));
  return rows.length > 0;
}

export const transferNotFound = () => new HttpError(404, 'not_found', 'Mutasi tidak ditemukan.');
