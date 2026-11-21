import {
  academicYear,
  and,
  asc,
  classRoom,
  count,
  dailyAttendance,
  enrollment,
  eq,
  inArray,
  lessonAttendance,
  lessonPeriod,
  scheduleEntry,
  subject,
  type Tx,
  teacher,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { closureOn, todayInJakarta } from '../attendance-lib';
import { isOnDuty, jakarta, weekdayOf } from '../gate';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { type LessonCell, lessonRosterOf, lessonTakerCounts } from '../lesson-roster-lib';
import { notifySkippedClass } from '../messaging-lib';
import { assertStudentsReportNotFinalOnDate } from '../report-lock-lib';
import { entryAppliesOn, scheduleAppliesOn } from '../schedule-lib';
import { audit, guarded, schoolHeader } from './helpers';

const STATUSES = ['present', 'excused', 'sick', 'absent'] as const;
const dateField = z.iso.date();
const tag = ['Lesson attendance'];
const gate = [requirePermission('attendance:read'), requireModule('attendance')];

/**
 * Siapa boleh mengisi absensi satu jam pelajaran: pengurus (`attendance:configure`), guru yang tertulis di jadwal itu,
 * atau guru piket hari itu (menggantikan). `substitute` menandai pengisian oleh bukan guru jadwal.
 */
async function authorizeLesson(tx: Tx, ctx: TenantContext, entry: { teacherId: string }, date: string) {
  const [mine] = await tx.select({ id: teacher.id }).from(teacher).where(eq(teacher.memberId, ctx.memberId));
  const isOwner = mine?.id === entry.teacherId;
  if (isOwner) return { allowed: true, substitute: false };
  if (ctx.permissions.has('attendance:configure')) return { allowed: true, substitute: true };
  if (date === jakarta(new Date()).date && (await isOnDuty(tx, ctx, date))) {
    return { allowed: true, substitute: true };
  }
  return { allowed: false, substitute: true };
}

async function entryOrThrow(tx: Tx, id: string) {
  const [entry] = await tx.select().from(scheduleEntry).where(eq(scheduleEntry.id, id));
  if (!entry) throw new HttpError(404, 'not_found', 'Jam pelajaran tidak ditemukan.');
  return entry;
}

type CombinedCell = LessonCell & {
  className: string;
  teacherId: string;
  weekday: number;
  periodId: string;
  subjectName: string;
  teacherName: string;
  periodNumber: number;
  startsAt: string;
  endsAt: string;
};

/**
 * Sel-sel satu pertemuan gabungan pada satu tanggal. 404 bila kuncinya tidak punya sel; 400 `invalid_date` bila tidak ada sel yang
 * hari jadwalnya sama dengan tanggal itu atau berlaku pada tanggal itu. `head` = sel pertama (guru, mapel, jam sama di semua sel).
 */
async function combinedCells(tx: Tx, combinedKey: string, date: string) {
  const rows: CombinedCell[] = await tx
    .select({
      id: scheduleEntry.id,
      classId: scheduleEntry.classId,
      className: classRoom.name,
      subjectId: scheduleEntry.subjectId,
      subjectName: subject.name,
      teacherId: scheduleEntry.teacherId,
      teacherName: teacher.name,
      weekday: scheduleEntry.weekday,
      periodId: scheduleEntry.periodId,
      periodNumber: lessonPeriod.number,
      startsAt: lessonPeriod.startsAt,
      endsAt: lessonPeriod.endsAt,
      semesterId: scheduleEntry.semesterId,
      academicYearId: scheduleEntry.academicYearId,
    })
    .from(scheduleEntry)
    .innerJoin(classRoom, eq(classRoom.id, scheduleEntry.classId))
    .innerJoin(subject, eq(subject.id, scheduleEntry.subjectId))
    .innerJoin(teacher, eq(teacher.id, scheduleEntry.teacherId))
    .innerJoin(lessonPeriod, eq(lessonPeriod.id, scheduleEntry.periodId))
    .where(eq(scheduleEntry.combinedKey, combinedKey))
    .orderBy(asc(classRoom.name));
  if (rows.length === 0) throw new HttpError(404, 'not_found', 'Pertemuan gabungan tidak ditemukan.');
  const day = weekdayOf(date);
  const cells: CombinedCell[] = [];
  for (const r of rows) if (r.weekday === day && (await entryAppliesOn(tx, r, date))) cells.push(r);
  const head = cells[0];
  if (!head)
    throw new HttpError(400, 'invalid_date', 'Tanggal itu bukan hari jadwal pertemuan gabungan ini.');
  return { cells, head };
}

/** Murid tiap sel (hanya pengambil mapelnya) beserta selnya; satu murid hanya masuk satu sel (rombelnya). */
async function combinedRoster(tx: Tx, cells: CombinedCell[], date: string) {
  const students: { id: string; name: string; nis: string | null; cell: CombinedCell }[] = [];
  const seen = new Set<string>();
  const totals = new Map<string, number>();
  for (const cell of cells) {
    const { rows } = await lessonRosterOf(tx, cell, date);
    let n = 0;
    for (const s of rows) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      students.push({ id: s.id, name: s.name, nis: s.nis, cell });
      n++;
    }
    totals.set(cell.id, n);
  }
  students.sort((a, b) => a.cell.className.localeCompare(b.cell.className) || a.name.localeCompare(b.name));
  return { students, totals };
}

/** Absensi per jam pelajaran: daftar jam hari ini, lembar absensi dengan status gerbang, dan penyimpanan. */
export async function lessonAttendanceRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  app.get(
    '/v1/lessons',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Jam pelajaran pada satu tanggal',
        description:
          'Izin: `attendance:read`; modul `attendance`. Sel jadwal pada hari itu di tahun ajaran aktif, dengan jumlah ' +
          'murid yang sudah diabsen. Guru biasa melihat jam miliknya; pengurus dan guru piket (hari ini) melihat semua ' +
          'sehingga bisa menggantikan. `mine` menandai jam milik pengguna. Untuk mapel yang berpenanda pilihan di rombelnya, `total` ' +
          'hanya menghitung murid yang mengambil mapel itu. `lane` (jalur paralel, hanya bila > 0) dan `combinedKey` (pertemuan gabungan) ' +
          'hanya muncul pada sel yang memakainya.',
        headers: schoolHeader,
        querystring: z.object({ date: dateField }),
        response: {
          200: z.object({
            date: z.string(),
            closed: z.object({ type: z.enum(['holiday', 'break']), title: z.string() }).nullable(),
            canCover: z.boolean(),
            lessons: z.array(
              z.object({
                id: z.uuid(),
                classId: z.uuid(),
                className: z.string(),
                subjectName: z.string(),
                teacherName: z.string(),
                periodNumber: z.number().int(),
                startsAt: z.string(),
                endsAt: z.string(),
                mine: z.boolean(),
                total: z.number().int(),
                filled: z.number().int(),
                lane: z.number().int().optional(),
                combinedKey: z.uuid().optional(),
              }),
            ),
          }),
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { date } = request.query;
      return tenant(request, async (tx) => {
        const [mine] = await tx
          .select({ id: teacher.id })
          .from(teacher)
          .where(eq(teacher.memberId, ctx.memberId));
        const canCover =
          ctx.permissions.has('attendance:configure') ||
          (date === jakarta(new Date()).date && (await isOnDuty(tx, ctx, date)));
        const weekday = weekdayOf(date);
        const closed = await closureOn(tx, date);
        const rows =
          weekday > 6
            ? []
            : await tx
                .select({
                  id: scheduleEntry.id,
                  classId: scheduleEntry.classId,
                  className: classRoom.name,
                  subjectId: scheduleEntry.subjectId,
                  subjectName: subject.name,
                  teacherId: scheduleEntry.teacherId,
                  teacherName: teacher.name,
                  periodNumber: lessonPeriod.number,
                  startsAt: lessonPeriod.startsAt,
                  endsAt: lessonPeriod.endsAt,
                  semesterId: scheduleEntry.semesterId,
                  academicYearId: scheduleEntry.academicYearId,
                  lane: scheduleEntry.lane,
                  combinedKey: scheduleEntry.combinedKey,
                })
                .from(scheduleEntry)
                .innerJoin(
                  academicYear,
                  and(eq(academicYear.id, scheduleEntry.academicYearId), eq(academicYear.isActive, true)),
                )
                .innerJoin(classRoom, eq(classRoom.id, scheduleEntry.classId))
                .innerJoin(subject, eq(subject.id, scheduleEntry.subjectId))
                .innerJoin(teacher, eq(teacher.id, scheduleEntry.teacherId))
                .innerJoin(lessonPeriod, eq(lessonPeriod.id, scheduleEntry.periodId))
                .where(and(eq(scheduleEntry.weekday, weekday), scheduleAppliesOn(date)))
                .orderBy(asc(lessonPeriod.number), asc(classRoom.name));
        const visible = canCover ? rows : rows.filter((r) => r.teacherId === mine?.id);
        const ids = visible.map((r) => r.id);
        const filled = ids.length
          ? await tx
              .select({ id: lessonAttendance.scheduleEntryId, n: count() })
              .from(lessonAttendance)
              .where(and(inArray(lessonAttendance.scheduleEntryId, ids), eq(lessonAttendance.date, date)))
              .groupBy(lessonAttendance.scheduleEntryId)
          : [];
        const classIds = [...new Set(visible.map((r) => r.classId))];
        const totals = classIds.length
          ? await tx
              .select({ id: enrollment.classId, n: count() })
              .from(enrollment)
              .where(inArray(enrollment.classId, classIds))
              .groupBy(enrollment.classId)
          : [];
        // Mapel pilihan: total = murid rombel yang mengambil mapel itu (tanpa mapel berpenanda, peta kosong = hitungan lama).
        const takerTotals = await lessonTakerCounts(tx, visible, date);
        return {
          date,
          closed: closed as { type: 'holiday' | 'break'; title: string } | null,
          canCover,
          lessons: visible.map(
            ({ teacherId, subjectId: _s, semesterId: _m, academicYearId: _y, lane, combinedKey, ...r }) => ({
              ...r,
              mine: teacherId === mine?.id,
              total: takerTotals.get(r.id) ?? totals.find((t) => t.id === r.classId)?.n ?? 0,
              filled: filled.find((f) => f.id === r.id)?.n ?? 0,
              ...(lane > 0 ? { lane } : {}),
              ...(combinedKey ? { combinedKey } : {}),
            }),
          ),
        };
      });
    },
  );

  app.get(
    '/v1/lesson-attendance',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Lembar absensi satu jam pelajaran',
        description:
          'Izin: `attendance:read`; modul `attendance`. Murid kelas itu dengan status jam ini dan status gerbang ' +
          '(`gate`, null bila belum tap), sehingga yang hadir di gerbang tetapi tidak di kelas terlihat. Mapel yang berpenanda pilihan di ' +
          'rombelnya hanya memuat murid yang mengambilnya, dan menyimpan untuk non-pengambil ditolak 400 `invalid_reference`. `canRecord` ' +
          'menyatakan apakah pengguna boleh mengisi; `substitute` bila pengisiannya menggantikan guru jadwal.',
        headers: schoolHeader,
        querystring: z.object({ scheduleEntryId: z.uuid(), date: dateField }),
        response: {
          200: z.object({
            date: z.string(),
            canRecord: z.boolean(),
            substitute: z.boolean(),
            students: z.array(
              z.object({
                studentId: z.uuid(),
                name: z.string(),
                nis: z.string().nullable(),
                status: z.enum(STATUSES).nullable(),
                note: z.string().nullable(),
                gate: z.enum(['present', 'late', 'excused', 'sick', 'absent']).nullable(),
              }),
            ),
          }),
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { scheduleEntryId, date } = request.query;
      return tenant(request, async (tx) => {
        const entry = await entryOrThrow(tx, scheduleEntryId);
        const auth = await authorizeLesson(tx, ctx, entry, date);
        const { rows } = await lessonRosterOf(tx, entry, date);
        const marks = await tx
          .select()
          .from(lessonAttendance)
          .where(and(eq(lessonAttendance.scheduleEntryId, scheduleEntryId), eq(lessonAttendance.date, date)));
        const gateRows = await tx
          .select({ studentId: dailyAttendance.studentId, status: dailyAttendance.status })
          .from(dailyAttendance)
          .where(eq(dailyAttendance.date, date));
        return {
          date,
          canRecord: auth.allowed,
          substitute: auth.substitute,
          students: rows.map((s) => ({
            studentId: s.id,
            name: s.name,
            nis: s.nis,
            status: marks.find((m) => m.studentId === s.id)?.status ?? null,
            note: marks.find((m) => m.studentId === s.id)?.note ?? null,
            gate: gateRows.find((g) => g.studentId === s.id)?.status ?? null,
          })),
        };
      });
    },
  );

  app.put(
    '/v1/lesson-attendance',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Simpan absensi satu jam pelajaran',
        description:
          'Izin: `attendance:read` ditambah salah satu: guru yang tertulis di jadwal itu, guru piket hari ini ' +
          '(menggantikan, ditandai `substitute`), atau `attendance:configure`; selain itu 403 `not_your_lesson`. ' +
          'Tanggal harus hari yang sama dengan hari jadwal dan, untuk sel khusus semester, jatuh di dalam semester itu ' +
          '(400 `invalid_date`), tidak boleh belum tiba (409 ' +
          '`future_date`) atau libur/jeda (409 `school_closed`).',
        headers: schoolHeader,
        body: z.object({
          scheduleEntryId: z.uuid(),
          date: dateField,
          records: z
            .array(
              z.object({
                studentId: z.uuid(),
                status: z.enum(STATUSES),
                note: z.string().trim().max(200).nullable().default(null),
              }),
            )
            .min(1)
            .max(200),
        }),
        response: {
          200: z.object({ saved: z.number().int(), substitute: z.boolean() }),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { scheduleEntryId, date, records } = request.body;
      if (date > todayInJakarta()) {
        throw new HttpError(409, 'future_date', 'Absensi tidak bisa diisi untuk tanggal yang belum tiba.');
      }
      return tenant(request, async (tx) => {
        const entry = await entryOrThrow(tx, scheduleEntryId);
        if (weekdayOf(date) !== entry.weekday) {
          throw new HttpError(400, 'invalid_date', 'Tanggal itu bukan hari jadwal pelajaran ini.');
        }
        if (!(await entryAppliesOn(tx, entry, date))) {
          throw new HttpError(400, 'invalid_date', 'Jadwal pelajaran ini tidak berlaku pada tanggal itu.');
        }
        const auth = await authorizeLesson(tx, ctx, entry, date);
        if (!auth.allowed) {
          throw new HttpError(
            403,
            'not_your_lesson',
            'Hanya guru jam ini atau guru piket yang boleh mengisi.',
          );
        }
        const closed = await closureOn(tx, date);
        if (closed) throw new HttpError(409, 'school_closed', `Tanggal itu ${closed.title}.`);
        const { rows } = await lessonRosterOf(tx, entry, date);
        const allowed = new Set(rows.map((r) => r.id));
        if (records.some((r) => !allowed.has(r.studentId))) {
          throw new HttpError(
            400,
            'invalid_reference',
            'Ada murid yang bukan anggota kelas ini atau tidak mengambil mata pelajaran jam ini.',
          );
        }
        for (const r of records) {
          await tx
            .insert(lessonAttendance)
            .values({
              schoolId: ctx.schoolId,
              scheduleEntryId,
              studentId: r.studentId,
              date,
              status: r.status,
              note: r.note,
              recordedBy: ctx.userId,
              substitute: auth.substitute,
            })
            .onConflictDoUpdate({
              target: [lessonAttendance.scheduleEntryId, lessonAttendance.studentId, lessonAttendance.date],
              set: {
                status: r.status,
                note: r.note,
                recordedBy: ctx.userId,
                substitute: auth.substitute,
                updatedAt: new Date(),
              },
            });
        }
        await notifySkippedClass(tx, ctx.schoolId, {
          scheduleEntryId,
          classId: entry.classId,
          subjectId: entry.subjectId,
          periodId: entry.periodId,
          date,
          absent: records
            .filter((r) => r.status === 'absent')
            .map((r) => ({ id: r.studentId, name: rows.find((x) => x.id === r.studentId)?.name ?? '' })),
        });
        await audit(tx, ctx, 'lesson_attendance.save', 'schedule_entry', scheduleEntryId, {
          date,
          count: records.length,
          substitute: auth.substitute,
        });
        return { saved: records.length, substitute: auth.substitute };
      });
    },
  );

  app.get(
    '/v1/lesson-attendance/combined',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Lembar absensi satu pertemuan gabungan',
        description:
          'Izin: `attendance:read`; modul `attendance`. Pertemuan gabungan = sel jadwal berbeda rombel dengan ' +
          '`combinedKey` yang sama (guru, mapel, hari, jam, dan cakupan sama). Mengembalikan gabungan murid semua ' +
          'sel itu (tiap murid dengan `scheduleEntryId` selnya sendiri; mapel pilihan hanya memuat pengambilnya), status jam ' +
          'ini, dan status gerbang. `canRecord` dan `substitute` seperti pada absensi satu jam. Kunci tanpa sel: 404; ' +
          'tanggal bukan hari jadwal atau di luar cakupan semester sel: 400 `invalid_date`.',
        headers: schoolHeader,
        querystring: z.object({ combinedKey: z.uuid(), date: dateField }),
        response: {
          200: z.object({
            date: z.string(),
            canRecord: z.boolean(),
            substitute: z.boolean(),
            subjectName: z.string(),
            teacherName: z.string(),
            periodNumber: z.number().int(),
            startsAt: z.string(),
            endsAt: z.string(),
            cells: z.array(
              z.object({
                scheduleEntryId: z.uuid(),
                classId: z.uuid(),
                className: z.string(),
                total: z.number().int(),
              }),
            ),
            students: z.array(
              z.object({
                studentId: z.uuid(),
                name: z.string(),
                nis: z.string().nullable(),
                scheduleEntryId: z.uuid(),
                classId: z.uuid(),
                className: z.string(),
                status: z.enum(STATUSES).nullable(),
                note: z.string().nullable(),
                gate: z.enum(['present', 'late', 'excused', 'sick', 'absent']).nullable(),
              }),
            ),
          }),
          400: errorSchema,
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { combinedKey, date } = request.query;
      return tenant(request, async (tx) => {
        const { cells, head } = await combinedCells(tx, combinedKey, date);
        const auth = await authorizeLesson(tx, ctx, head, date);
        const roster = await combinedRoster(tx, cells, date);
        const marks = await tx
          .select()
          .from(lessonAttendance)
          .where(
            and(
              inArray(
                lessonAttendance.scheduleEntryId,
                cells.map((c) => c.id),
              ),
              eq(lessonAttendance.date, date),
            ),
          );
        const gateRows = await tx
          .select({ studentId: dailyAttendance.studentId, status: dailyAttendance.status })
          .from(dailyAttendance)
          .where(eq(dailyAttendance.date, date));
        return {
          date,
          canRecord: auth.allowed,
          substitute: auth.substitute,
          subjectName: head.subjectName,
          teacherName: head.teacherName,
          periodNumber: head.periodNumber,
          startsAt: head.startsAt,
          endsAt: head.endsAt,
          cells: cells.map((c) => ({
            scheduleEntryId: c.id,
            classId: c.classId,
            className: c.className,
            total: roster.totals.get(c.id) ?? 0,
          })),
          students: roster.students.map((s) => {
            const mark = marks.find((m) => m.scheduleEntryId === s.cell.id && m.studentId === s.id);
            return {
              studentId: s.id,
              name: s.name,
              nis: s.nis,
              scheduleEntryId: s.cell.id,
              classId: s.cell.classId,
              className: s.cell.className,
              status: mark?.status ?? null,
              note: mark?.note ?? null,
              gate: gateRows.find((g) => g.studentId === s.id)?.status ?? null,
            };
          }),
        };
      });
    },
  );

  app.put(
    '/v1/lesson-attendance/combined',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Simpan absensi satu pertemuan gabungan',
        description:
          'Izin: `attendance:read` ditambah salah satu: guru jadwal itu, guru piket hari ini (menggantikan, ditandai ' +
          '`substitute`), atau `attendance:configure`; selain itu 403 `not_your_lesson`. Tiap catatan ditulis ke sel ' +
          'jadwal rombel murid itu (skema `lesson_attendance` tidak berubah), sehingga laporan per kelas tetap benar. ' +
          'Murid yang bukan anggota sel bergabung atau tidak mengambil mapelnya: 400 `invalid_reference`. Aturan tanggal ' +
          'sama dengan absensi satu jam (409 `future_date`, 400 `invalid_date`, 409 `school_closed`); rapor final salah ' +
          'satu murid pada semester tanggal itu: 409 `report_final`. Semua atau tidak sama sekali (satu transaksi).',
        headers: schoolHeader,
        body: z.object({
          combinedKey: z.uuid(),
          date: dateField,
          records: z
            .array(
              z.object({
                studentId: z.uuid(),
                status: z.enum(STATUSES),
                note: z.string().trim().max(200).nullable().default(null),
              }),
            )
            .min(1)
            .max(400),
        }),
        response: {
          200: z.object({
            saved: z.number().int(),
            substitute: z.boolean(),
            cells: z.number().int().describe('Jumlah sel (rombel) yang menerima catatan'),
          }),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { combinedKey, date, records } = request.body;
      if (date > todayInJakarta()) {
        throw new HttpError(409, 'future_date', 'Absensi tidak bisa diisi untuk tanggal yang belum tiba.');
      }
      return tenant(request, async (tx) => {
        const { cells, head } = await combinedCells(tx, combinedKey, date);
        const auth = await authorizeLesson(tx, ctx, head, date);
        if (!auth.allowed) {
          throw new HttpError(
            403,
            'not_your_lesson',
            'Hanya guru jam ini atau guru piket yang boleh mengisi.',
          );
        }
        const closed = await closureOn(tx, date);
        if (closed) throw new HttpError(409, 'school_closed', `Tanggal itu ${closed.title}.`);
        const roster = await combinedRoster(tx, cells, date);
        const ownerOf = new Map(roster.students.map((s) => [s.id, s]));
        if (records.some((r) => !ownerOf.has(r.studentId))) {
          throw new HttpError(
            400,
            'invalid_reference',
            'Ada murid yang bukan anggota pertemuan gabungan ini atau tidak mengambil mata pelajarannya.',
          );
        }
        await assertStudentsReportNotFinalOnDate(
          tx,
          records.map((r) => r.studentId),
          date,
        );
        const touched = new Map<string, { classId: string; absent: { id: string; name: string }[] }>();
        for (const r of records) {
          const owner = ownerOf.get(r.studentId);
          if (!owner) continue;
          await tx
            .insert(lessonAttendance)
            .values({
              schoolId: ctx.schoolId,
              scheduleEntryId: owner.cell.id,
              studentId: r.studentId,
              date,
              status: r.status,
              note: r.note,
              recordedBy: ctx.userId,
              substitute: auth.substitute,
            })
            .onConflictDoUpdate({
              target: [lessonAttendance.scheduleEntryId, lessonAttendance.studentId, lessonAttendance.date],
              set: {
                status: r.status,
                note: r.note,
                recordedBy: ctx.userId,
                substitute: auth.substitute,
                updatedAt: new Date(),
              },
            });
          const entry = touched.get(owner.cell.id) ?? { classId: owner.cell.classId, absent: [] };
          if (r.status === 'absent') entry.absent.push({ id: r.studentId, name: owner.name });
          touched.set(owner.cell.id, entry);
        }
        for (const [scheduleEntryId, t] of touched) {
          await notifySkippedClass(tx, ctx.schoolId, {
            scheduleEntryId,
            classId: t.classId,
            subjectId: head.subjectId,
            periodId: head.periodId,
            date,
            absent: t.absent,
          });
        }
        await audit(tx, ctx, 'lesson_attendance.save_combined', 'schedule_entry', head.id, {
          date,
          combinedKey,
          count: records.length,
          cells: touched.size,
          substitute: auth.substitute,
        });
        return { saved: records.length, substitute: auth.substitute, cells: touched.size };
      });
    },
  );
}
