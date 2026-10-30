import {
  academicYear,
  and,
  asc,
  classRoom,
  count,
  dailyAttendance,
  desc,
  enrollment,
  entitlement,
  eq,
  extracurricularSession,
  finPayment,
  gt,
  gte,
  inArray,
  isNull,
  lessonPeriod,
  lt,
  lte,
  msgMessage,
  scheduleEntry,
  sql,
  student,
  subject,
  type Tx,
  tapEvent,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { closureOn } from '../attendance-lib';
import { jakarta, weekdayOf } from '../gate';
import { requireTenant, type TenantContext } from '../identity/guards';
import { type PeriodSlot, periodState, startOfJakartaDay } from '../live-lib';
import { guarded, schoolHeader } from './helpers';

const tag = ['Live'];
const MAX_RUNNING = 30;
const FIRST_LOAD_MS = 10 * 60_000;

const closedSchema = z.object({ type: z.enum(['holiday', 'break']), title: z.string() }).nullable();

const snapshotSchema = z.object({
  date: z.string().describe('Tanggal hari ini menurut Asia/Jakarta, TTTT-BB-HH'),
  time: z.string().describe('Jam sekarang menurut Asia/Jakarta, HH:MM'),
  closed: closedSchema,
  attendance: z
    .object({
      total: z.number().int(),
      present: z.number().int(),
      late: z.number().int(),
      excused: z.number().int(),
      sick: z.number().int(),
      absent: z.number().int(),
      notYet: z.number().int(),
    })
    .nullable(),
  lessons: z
    .object({
      running: z.array(
        z.object({
          className: z.string(),
          subjectName: z.string(),
          periodNumber: z.number().int(),
          startsAt: z.string(),
          endsAt: z.string(),
        }),
      ),
      currentPeriod: z.number().int().nullable(),
      nextPeriodStartsAt: z.string().nullable(),
      unfilled: z.number().int(),
    })
    .nullable(),
  finance: z
    .object({
      openInvoices: z.number().int(),
      outstanding: z.number().int(),
      overdueOutstanding: z.number().int(),
      paidToday: z.number().int(),
    })
    .nullable(),
  messaging: z.object({ queued: z.number().int(), failed24h: z.number().int() }).nullable(),
  extracurricular: z.object({ sessionsToday: z.number().int() }).nullable(),
});

const eventsSchema = z.object({
  events: z.array(
    z.object({
      id: z.uuid(),
      kind: z.enum(['arrival', 'departure']),
      at: z.string(),
      className: z.string().nullable(),
      studentName: z.string().nullable(),
    }),
  ),
  cursor: z.string(),
});

/** Awal hari ini atau `after`, mana yang lebih akhir. */
const laterOf = (a: Date, b: Date) => (a.getTime() >= b.getTime() ? a : b);

/**
 * Dashboard hidup "Sekolah Hidup": ringkasan hari ini dan aliran tap gerbang. Siapa pun anggota sekolah boleh memanggil;
 * tiap bagian hanya diisi bila modulnya aktif dan pengguna punya izinnya.
 */
export async function liveRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  /** Modul berbayar yang aktif untuk sekolah ini. */
  const activeModules = async (tx: Tx) => {
    const rows = await tx
      .select({ key: entitlement.moduleKey })
      .from(entitlement)
      .where(gt(entitlement.validUntil, new Date()));
    return new Set(rows.map((r) => r.key));
  };

  app.get(
    '/v1/live/snapshot',
    {
      onRequest: [requireTenant],
      schema: {
        tags: tag,
        summary: 'Ringkasan hidup hari ini',
        description:
          'Anggota sekolah mana pun boleh memanggil (tanpa izin khusus). Tiap bagian null bila modulnya tidak aktif ATAU ' +
          'pengguna tidak punya izinnya: `attendance` dan `lessons` (modul `attendance` + `attendance:read`), `finance` ' +
          '(modul `finance` + `finance:read`), `messaging` (modul `messaging` + `message:read`), `extracurricular` ' +
          '(modul `extracurricular` + `extracurricular:read`). `date`/`time` menurut Asia/Jakarta. `closed` = libur ' +
          'atau jeda kalender sekolah hari ini. `attendance` dihitung seperti `summary` pada `/v1/gate/daily` (siswa aktif ' +
          'di tahun ajaran aktif, tanpa daftar siswa). `lessons.running` = jam yang sedang berlangsung menurut jadwal hari ' +
          'ini di tahun ajaran aktif (maksimal 30; kosong pada hari libur/Minggu); `currentPeriod` nomor jam yang ' +
          'berlangsung, `nextPeriodStartsAt` jam mulai jam berikutnya (HH:MM), `unfilled` = jumlah sel jadwal hari ini ' +
          'yang sudah mulai tetapi belum ada satu pun catatan absensi jamnya. `finance` = agregat tagihan tidak batal ' +
          'semua tahun ajaran (`openInvoices` yang masih bersisa, `outstanding` total sisa, `overdueOutstanding` sisa ' +
          'yang jatuh temponya sebelum hari ini) dan `paidToday` = total kwitansi tidak batal hari ini (rupiah). ' +
          '`messaging.queued` = pesan antre/sedang dikirim; `failed24h` = pesan gagal yang dibuat 24 jam terakhir. ' +
          '`extracurricular.sessionsToday` = pertemuan ekstrakurikuler bertanggal hari ini. Ringan dan hanya agregat; ' +
          'aman dipanggil berkala.',
        headers: schoolHeader,
        response: { 200: snapshotSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const now = new Date();
      const { date, time } = jakarta(now);
      return tenant(request, async (tx) => {
        const modules = await activeModules(tx);
        const can = (module: string, permission: string) =>
          modules.has(module) && ctx.permissions.has(permission);
        const closed = (await closureOn(tx, date)) as z.infer<typeof closedSchema>;

        let attendance: z.infer<typeof snapshotSchema>['attendance'] = null;
        let lessons: z.infer<typeof snapshotSchema>['lessons'] = null;
        if (can('attendance', 'attendance:read')) {
          const st = dailyAttendance.status;
          const nStatus = (s: string) => sql<number>`count(*) filter (where ${st} = ${s})::int`;
          const [row] = await tx
            .select({
              total: sql<number>`count(*)::int`,
              present: nStatus('present'),
              late: nStatus('late'),
              excused: nStatus('excused'),
              sick: nStatus('sick'),
              absent: nStatus('absent'),
              notYet: sql<number>`count(*) filter (where ${st} is null)::int`,
            })
            .from(enrollment)
            .innerJoin(
              academicYear,
              and(eq(academicYear.id, enrollment.academicYearId), eq(academicYear.isActive, true)),
            )
            .innerJoin(student, eq(student.id, enrollment.studentId))
            .leftJoin(
              dailyAttendance,
              and(eq(dailyAttendance.studentId, student.id), eq(dailyAttendance.date, date)),
            )
            .where(and(isNull(student.deletedAt), eq(student.status, 'active')));
          attendance = row ?? { total: 0, present: 0, late: 0, excused: 0, sick: 0, absent: 0, notYet: 0 };

          const weekday = weekdayOf(date);
          const teaching = weekday <= 6 && !closed;
          const periods: PeriodSlot[] = teaching
            ? await tx
                .select({
                  number: lessonPeriod.number,
                  startsAt: lessonPeriod.startsAt,
                  endsAt: lessonPeriod.endsAt,
                })
                .from(lessonPeriod)
            : [];
          const state = periodState(periods, time);
          const running = teaching
            ? await tx
                .select({
                  className: classRoom.name,
                  subjectName: subject.name,
                  periodNumber: lessonPeriod.number,
                  startsAt: lessonPeriod.startsAt,
                  endsAt: lessonPeriod.endsAt,
                })
                .from(scheduleEntry)
                .innerJoin(
                  academicYear,
                  and(eq(academicYear.id, scheduleEntry.academicYearId), eq(academicYear.isActive, true)),
                )
                .innerJoin(classRoom, eq(classRoom.id, scheduleEntry.classId))
                .innerJoin(subject, eq(subject.id, scheduleEntry.subjectId))
                .innerJoin(lessonPeriod, eq(lessonPeriod.id, scheduleEntry.periodId))
                .where(
                  and(
                    eq(scheduleEntry.weekday, weekday),
                    lte(lessonPeriod.startsAt, time),
                    gt(lessonPeriod.endsAt, time),
                  ),
                )
                .orderBy(asc(lessonPeriod.number), asc(classRoom.name))
                .limit(MAX_RUNNING)
            : [];
          const [unfilled] = teaching
            ? await tx
                .select({ n: count() })
                .from(scheduleEntry)
                .innerJoin(
                  academicYear,
                  and(eq(academicYear.id, scheduleEntry.academicYearId), eq(academicYear.isActive, true)),
                )
                .innerJoin(lessonPeriod, eq(lessonPeriod.id, scheduleEntry.periodId))
                .where(
                  and(
                    eq(scheduleEntry.weekday, weekday),
                    lte(lessonPeriod.startsAt, time),
                    sql`not exists (select 1 from lesson_attendance la where la.schedule_entry_id = ${scheduleEntry.id} and la.date = ${date}::date)`,
                  ),
                )
            : [{ n: 0 }];
          lessons = {
            running,
            currentPeriod: state.currentPeriod,
            nextPeriodStartsAt: state.nextPeriodStartsAt,
            unfilled: unfilled?.n ?? 0,
          };
        }

        let finance: z.infer<typeof snapshotSchema>['finance'] = null;
        if (can('finance', 'finance:read')) {
          // Sisa per tagihan = netto - kwitansi tidak batal (tidak pernah negatif); tagihan batal tidak dihitung.
          const agg = await tx.execute<{ open_invoices: number; outstanding: string; overdue: string }>(sql`
            select count(*) filter (where o.outstanding > 0)::int as open_invoices,
                   coalesce(sum(o.outstanding), 0)::bigint as outstanding,
                   coalesce(sum(o.outstanding) filter (where o.due_date < ${date}::date), 0)::bigint as overdue
            from (
              select greatest(0, i.amount - i.discount - coalesce((
                       select sum(pi.amount) from fin_payment_item pi join fin_payment p on p.id = pi.payment_id
                       where pi.invoice_id = i.id and p.voided_at is null), 0)) as outstanding,
                     i.due_date
              from fin_invoice i
              where i.status = 'open'
            ) o`);
          const [paid] = await tx
            .select({ v: sql<string>`coalesce(sum(${finPayment.total}), 0)::bigint` })
            .from(finPayment)
            .where(
              and(
                isNull(finPayment.voidedAt),
                gte(finPayment.paidAt, startOfJakartaDay(date)),
                lt(finPayment.paidAt, new Date(startOfJakartaDay(date).getTime() + 86_400_000)),
              ),
            );
          const a = agg.rows[0];
          finance = {
            openInvoices: Number(a?.open_invoices ?? 0),
            outstanding: Number(a?.outstanding ?? 0),
            overdueOutstanding: Number(a?.overdue ?? 0),
            paidToday: Number(paid?.v ?? 0),
          };
        }

        let messaging: z.infer<typeof snapshotSchema>['messaging'] = null;
        if (can('messaging', 'message:read')) {
          const [queued] = await tx
            .select({ n: count() })
            .from(msgMessage)
            .where(inArray(msgMessage.status, ['queued', 'sending']));
          const [failed] = await tx
            .select({ n: count() })
            .from(msgMessage)
            .where(
              and(
                gte(msgMessage.createdAt, new Date(now.getTime() - 86_400_000)),
                eq(msgMessage.status, 'failed'),
              ),
            );
          messaging = { queued: queued?.n ?? 0, failed24h: failed?.n ?? 0 };
        }

        let extracurricular: z.infer<typeof snapshotSchema>['extracurricular'] = null;
        if (can('extracurricular', 'extracurricular:read')) {
          const [row] = await tx
            .select({ n: count() })
            .from(extracurricularSession)
            .where(eq(extracurricularSession.date, date));
          extracurricular = { sessionsToday: row?.n ?? 0 };
        }

        return { date, time, closed, attendance, lessons, finance, messaging, extracurricular };
      });
    },
  );

  app.get(
    '/v1/live/events',
    {
      onRequest: [requireTenant],
      schema: {
        tags: tag,
        summary: 'Aliran tap gerbang terbaru',
        description:
          'Anggota sekolah mana pun boleh memanggil, tetapi peristiwa hanya diisi bila modul `attendance` aktif dan ' +
          'pengguna punya `attendance:read`; selain itu `events` kosong. Sumber: tap gerbang hari ini (Asia/Jakarta); ' +
          '`kind` `arrival` (tap masuk) atau `departure` (tap pulang), urut waktu naik. `after` (ISO) = hanya tap ' +
          'setelahnya (eksklusif); tanpa `after` dikembalikan tap 10 menit terakhir (maksimal `limit`, yang terbaru). ' +
          '`limit` 1-50, bawaan 20. `cursor` = waktu tap terbesar yang dikembalikan, atau `after` (atau sekarang) bila ' +
          'kosong; kirim kembali sebagai `after` pada panggilan berikutnya. `studentName` hanya diisi bila pengguna punya ' +
          '`attendance:read` (selalu terpenuhi di sini); tampilan peta sebaiknya mengabaikan nama dan hanya memakai ' +
          '`className`. Kueri dibatasi ke hari ini sehingga aman dipanggil tiap beberapa detik.',
        headers: schoolHeader,
        querystring: z.object({
          after: z.iso.datetime({ offset: true }).optional(),
          limit: z.coerce.number().int().min(1).max(50).default(20),
        }),
        response: { 200: eventsSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { after, limit } = request.query;
      const now = new Date();
      const afterAt = after ? new Date(after) : null;
      const cursorFallback = (afterAt ?? now).toISOString();
      return tenant(request, async (tx) => {
        if (!(await activeModules(tx)).has('attendance') || !ctx.permissions.has('attendance:read')) {
          return { events: [], cursor: cursorFallback };
        }
        const dayStart = startOfJakartaDay(jakarta(now).date);
        const since = afterAt
          ? laterOf(afterAt, dayStart)
          : laterOf(new Date(now.getTime() - FIRST_LOAD_MS), dayStart);
        // Dengan `after` ambil yang paling awal agar kursor tidak melompati peristiwa; tanpa `after`, yang terbaru.
        const rows = await tx
          .select({
            id: tapEvent.id,
            direction: tapEvent.direction,
            at: tapEvent.at,
            studentId: tapEvent.studentId,
            studentName: student.name,
          })
          .from(tapEvent)
          .innerJoin(student, eq(student.id, tapEvent.studentId))
          .where(
            afterAt && afterAt.getTime() >= dayStart.getTime()
              ? gt(tapEvent.at, since)
              : gte(tapEvent.at, since),
          )
          .orderBy(afterAt ? asc(tapEvent.at) : desc(tapEvent.at), asc(tapEvent.id))
          .limit(limit);
        if (!afterAt) rows.reverse();

        const studentIds = [...new Set(rows.map((r) => r.studentId))];
        const classes = studentIds.length
          ? await tx
              .select({ studentId: enrollment.studentId, className: classRoom.name })
              .from(enrollment)
              .innerJoin(
                academicYear,
                and(eq(academicYear.id, enrollment.academicYearId), eq(academicYear.isActive, true)),
              )
              .innerJoin(classRoom, eq(classRoom.id, enrollment.classId))
              .where(inArray(enrollment.studentId, studentIds))
          : [];
        const classOf = new Map(classes.map((c) => [c.studentId, c.className]));
        const events = rows.map((r) => ({
          id: r.id,
          kind: (r.direction === 'in' ? 'arrival' : 'departure') as 'arrival' | 'departure',
          at: r.at.toISOString(),
          className: classOf.get(r.studentId) ?? null,
          studentName: r.studentName,
        }));
        const last = rows.reduce<Date | null>((m, r) => (!m || r.at > m ? r.at : m), null);
        return { events, cursor: last ? last.toISOString() : cursorFallback };
      });
    },
  );
}
