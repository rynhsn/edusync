import { localParts } from '@edusync/contracts';
import {
  academicYear,
  and,
  asc,
  classRoom,
  currentTimezone,
  dailyAttendance,
  enrollment,
  eq,
  inArray,
  isNull,
  student,
  type Tx,
  tapEvent,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { closureOn, rosterOf } from '../attendance-lib';
import { jakarta, loadPolicy } from '../gate';
import {
  applyManual,
  canRecordClass,
  classesOf,
  forbiddenClass,
  manualScope,
  parseWhen,
} from '../gate-manual';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { audit, guarded, schoolHeader } from './helpers';

const tag = ['Gate attendance'];
const dateField = z.iso.date();
const gate = [requirePermission('attendance:manage'), requireModule('attendance')];
const statusEnum = z.enum(['present', 'late', 'excused', 'sick', 'absent']);
const whenField = z
  .string()
  .trim()
  .min(4)
  .max(40)
  .describe('Jam `HH:MM` (waktu sekolah) atau ISO 8601 dengan zona; harus pada `date`.');

const resultEnum = z.enum([
  'in',
  'out',
  'already_in',
  'already_out',
  'skipped_status',
  'not_found',
  'invalid_time',
]);
const manualResponse = z.object({
  date: z.string(),
  direction: z.enum(['in', 'out']),
  results: z.array(
    z.object({
      studentId: z.uuid(),
      name: z.string().nullable(),
      className: z.string().nullable(),
      result: resultEnum,
      at: z.string().nullable(),
      status: statusEnum.nullable(),
      late: z.boolean(),
      warning: z.enum(['no_check_in']).nullable(),
    }),
  ),
  summary: z.object({
    in: z.number().int(),
    out: z.number().int(),
    already_in: z.number().int(),
    already_out: z.number().int(),
    skipped_status: z.number().int(),
    not_found: z.number().int(),
    invalid_time: z.number().int(),
    warnings: z.number().int(),
  }),
});

const RULES =
  'Aturan akses: pengguna dengan `attendance:configure` boleh untuk semua kelas; guru yang bertugas piket hari ini ' +
  'boleh untuk semua kelas; guru lain hanya untuk kelas yang ia walikan (wali kelas, tahun ajaran aktif); selain itu ' +
  '403 `forbidden_class`.';

/**
 * Pencatatan datang/pulang manual oleh guru saat kiosk RFID tidak bisa dipakai (listrik padam, kartu hilang):
 * massal per kelas, koreksi satu siswa, dan daftar kelas yang boleh dicatat. Modul `attendance`.
 */
export async function gateManualRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  const today = () => jakarta(new Date()).date;

  app.post(
    '/v1/gate/manual',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Catat datang atau pulang secara manual (massal)',
        description:
          'Izin: `attendance:manage`; modul `attendance`. Cadangan bila kiosk RFID tidak bisa dipakai. ' +
          RULES +
          ' Maksimal 200 siswa per permintaan. `date` bawaan hari ini (zona waktu sekolah); tanggal lampau wajib ' +
          'memberi jam. Jam (`at` di tingkat permintaan atau per entri; entri menang) bawaannya sekarang, tidak boleh ' +
          'di masa depan dan harus pada `date`. Perilaku meniru tap: menulis `tap_event` bersumber `manual` dengan ' +
          '`recordedBy` pencatat, memperbarui absensi harian, dan memberi tahu wali (arrival/departure). Datang: ' +
          'status dihitung dari kebijakan `lateAfter` (terlambat bila jam lebih dari batas) kecuali entri memberi ' +
          '`status` `present`/`late`. Aman diulang: catatan datang/pulang yang sudah ada tidak ditimpa (`already_in`, ' +
          '`already_out`) kecuali `overwrite: true`; siswa berstatus izin/sakit/alpa dilewati (`skipped_status`) ' +
          'kecuali `overwrite`. Pulang tanpa catatan datang tetap dicatat dengan peringatan `no_check_in`. Pulang ' +
          'sebelum jam datang (atau datang setelah jam pulang) menghasilkan `invalid_time`. Tanggal libur/jeda ' +
          'sekolah: 409 `school_closed` kecuali `force: true`. Hasil per entri: `in`, `out`, `already_in`, ' +
          '`already_out`, `skipped_status`, `not_found` (siswa tidak ada atau tidak aktif), `invalid_time`; `summary` ' +
          'merangkum. Satu entri audit ringkas dicatat.',
        headers: schoolHeader,
        body: z.object({
          date: dateField.optional(),
          direction: z.enum(['in', 'out']),
          at: whenField.optional(),
          entries: z
            .array(
              z.object({
                studentId: z.uuid(),
                at: whenField.optional(),
                status: z.enum(['present', 'late']).optional(),
              }),
            )
            .min(1)
            .max(200),
          overwrite: z.boolean().default(false),
          force: z.boolean().default(false),
        }),
        response: { 200: manualResponse, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      return tenant(request, async (tx) => {
        const date = b.date ?? today();
        const now = new Date();
        const entries = b.entries.map((e) => ({
          studentId: e.studentId,
          at: parseWhen(date, e.at ?? b.at, now),
          status: e.status,
        }));
        const scope = await manualScope(tx, ctx, date);
        const out = await applyManual(
          tx,
          ctx,
          { date, direction: b.direction, entries, overwrite: b.overwrite, force: b.force },
          scope,
          await loadPolicy(tx),
        );
        await audit(tx, ctx, 'attendance.manual', 'school', ctx.schoolId, {
          date,
          direction: b.direction,
          overwrite: b.overwrite,
          ...out.summary,
        });
        return out;
      });
    },
  );

  app.post(
    '/v1/gate/manual/mark-all',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Tandai seluruh kelas datang atau pulang',
        description:
          'Izin: `attendance:manage`; modul `attendance`. ' +
          RULES +
          ' Jalan pintas atas `/v1/gate/manual` untuk satu kelas: `direction` `in` mencatat semua siswa kelas yang ' +
          'belum punya catatan datang dan tidak berstatus izin/sakit/alpa; `out` mencatat semua yang sudah datang tetapi ' +
          'belum pulang. Siswa yang tidak memenuhi syarat tidak disentuh. Jam `at` (HH:MM atau ISO) dan `date` sama ' +
          'seperti `/v1/gate/manual`. Respons sama dengan `/v1/gate/manual` (hanya siswa yang diproses), ditambah ' +
          '`candidates` (jumlah siswa yang dipilih). Kelas tidak ada: 404; libur: 409 `school_closed` kecuali `force`.',
        headers: schoolHeader,
        body: z.object({
          classId: z.uuid(),
          direction: z.enum(['in', 'out']),
          date: dateField.optional(),
          at: whenField.optional(),
          force: z.boolean().default(false),
        }),
        response: {
          200: manualResponse.extend({ candidates: z.number().int() }),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      return tenant(request, async (tx) => {
        const date = b.date ?? today();
        const at = parseWhen(date, b.at);
        const scope = await manualScope(tx, ctx, date);
        if (!canRecordClass(scope, b.classId)) {
          // Kelas yang tidak ada tetap 404 agar pesan tidak membocorkan kelas milik sekolah lain.
          await rosterOf(tx, b.classId);
          throw forbiddenClass();
        }
        const { rows } = await rosterOf(tx, b.classId);
        const daily = rows.length
          ? await tx
              .select()
              .from(dailyAttendance)
              .where(
                and(
                  eq(dailyAttendance.date, date),
                  inArray(
                    dailyAttendance.studentId,
                    rows.map((r) => r.id),
                  ),
                ),
              )
          : [];
        const byStudent = new Map(daily.map((d) => [d.studentId, d]));
        const targets = rows.filter((r) => {
          const d = byStudent.get(r.id);
          if (d && ['excused', 'sick', 'absent'].includes(d.status)) return false;
          return b.direction === 'in' ? !d?.checkInAt : !!d?.checkInAt && !d.checkOutAt;
        });
        const out =
          targets.length === 0
            ? await applyManual(
                tx,
                ctx,
                { date, direction: b.direction, entries: [], overwrite: false, force: b.force },
                scope,
                await loadPolicy(tx),
              )
            : await applyManual(
                tx,
                ctx,
                {
                  date,
                  direction: b.direction,
                  entries: targets.map((t) => ({ studentId: t.id, at })),
                  overwrite: false,
                  force: b.force,
                },
                scope,
                await loadPolicy(tx),
              );
        await audit(tx, ctx, 'attendance.manual', 'class', b.classId, {
          date,
          direction: b.direction,
          markAll: true,
          ...out.summary,
        });
        return { ...out, candidates: targets.length };
      });
    },
  );

  app.get(
    '/v1/gate/manual/classes',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Kelas yang boleh saya catat hari ini',
        description:
          'Izin: `attendance:manage`; modul `attendance`. ' +
          RULES +
          ' `scope`: `all` (pengurus), `duty` (piket hari ini: semua kelas), atau `homeroom` (hanya kelas yang ' +
          'diwalikan; bisa kosong). Per kelas (tahun ajaran aktif): `total` siswa aktif, `checkedIn` (sudah ada jam ' +
          'datang), `checkedOut` (sudah ada jam pulang), `away` (izin/sakit/alpa), `notYet` (belum datang dan bukan ' +
          'izin/sakit/alpa), dan `homeroom` (apakah pengguna wali kelasnya). `closed` terisi bila hari ini libur.',
        headers: schoolHeader,
        response: {
          200: z.object({
            date: z.string(),
            scope: z.enum(['all', 'duty', 'homeroom']),
            closed: z.object({ type: z.enum(['holiday', 'break']), title: z.string() }).nullable(),
            classes: z.array(
              z.object({
                id: z.uuid(),
                name: z.string(),
                level: z.string(),
                homeroom: z.boolean(),
                total: z.number().int(),
                checkedIn: z.number().int(),
                checkedOut: z.number().int(),
                away: z.number().int(),
                notYet: z.number().int(),
              }),
            ),
          }),
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const date = today();
        const scope = await manualScope(tx, ctx, date);
        const classes = await tx
          .select({
            id: classRoom.id,
            name: classRoom.name,
            level: classRoom.level,
            homeroomTeacherId: classRoom.homeroomTeacherId,
          })
          .from(classRoom)
          .innerJoin(
            academicYear,
            and(eq(academicYear.id, classRoom.academicYearId), eq(academicYear.isActive, true)),
          )
          .orderBy(asc(classRoom.name));
        const visible = classes.filter((c) => canRecordClass(scope, c.id));
        const people = visible.length
          ? await tx
              .select({
                classId: enrollment.classId,
                status: dailyAttendance.status,
                checkInAt: dailyAttendance.checkInAt,
                checkOutAt: dailyAttendance.checkOutAt,
              })
              .from(enrollment)
              .innerJoin(student, eq(student.id, enrollment.studentId))
              .leftJoin(
                dailyAttendance,
                and(eq(dailyAttendance.studentId, student.id), eq(dailyAttendance.date, date)),
              )
              .where(
                and(
                  inArray(
                    enrollment.classId,
                    visible.map((c) => c.id),
                  ),
                  eq(student.status, 'active'),
                  isNull(student.deletedAt),
                ),
              )
          : [];
        return {
          date,
          scope: scope.kind,
          closed: (await closureOn(tx, date)) as { type: 'holiday' | 'break'; title: string } | null,
          classes: visible.map((c) => {
            const rows = people.filter((p) => p.classId === c.id);
            const away = rows.filter(
              (p) => p.status && ['excused', 'sick', 'absent'].includes(p.status),
            ).length;
            const checkedIn = rows.filter((p) => p.checkInAt).length;
            return {
              id: c.id,
              name: c.name,
              level: c.level,
              homeroom: !!scope.teacherId && c.homeroomTeacherId === scope.teacherId,
              total: rows.length,
              checkedIn,
              checkedOut: rows.filter((p) => p.checkOutAt).length,
              away,
              notYet: rows.filter(
                (p) => !p.checkInAt && !(p.status && ['excused', 'sick', 'absent'].includes(p.status)),
              ).length,
            };
          }),
        };
      });
    },
  );

  app.put(
    '/v1/gate/daily/:studentId',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Koreksi absensi gerbang satu siswa pada satu tanggal',
        description:
          'Izin: `attendance:manage`; modul `attendance`. ' +
          RULES +
          ' Mengoreksi atau membatalkan catatan datang/pulang. Setiap bidang opsional: tidak dikirim = tidak diubah, ' +
          '`null` = dikosongkan, nilai = jam `HH:MM` atau ISO pada `date`. `checkOutAt` tidak boleh sebelum ' +
          '`checkInAt`. `status` bila tidak dikirim: dihitung dari kebijakan saat jam datang diubah, selain itu tetap. ' +
          'Bila kedua jam dikosongkan tanpa `status` dan status lama `present`/`late`, catatan dihapus (kembali ke ' +
          '"belum ada catatan"; `removed: true`). Jam yang baru diset ikut dicatat sebagai `tap_event` `manual`. ' +
          'Tidak ada pemberitahuan ke wali. Siswa tidak ada/tidak aktif: 404. Satu entri audit dicatat.',
        headers: schoolHeader,
        params: z.object({ studentId: z.uuid() }),
        body: z.object({
          date: dateField,
          checkInAt: whenField.nullable().optional(),
          checkOutAt: whenField.nullable().optional(),
          status: statusEnum.optional(),
          note: z.string().trim().max(500).nullable().optional(),
        }),
        response: {
          200: z.object({
            date: z.string(),
            studentId: z.uuid(),
            name: z.string(),
            className: z.string().nullable(),
            removed: z.boolean(),
            status: statusEnum.nullable(),
            checkInAt: z.string().nullable(),
            checkOutAt: z.string().nullable(),
            note: z.string().nullable(),
          }),
          400: errorSchema,
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { studentId } = request.params;
      const b = request.body;
      return tenant(request, async (tx) => {
        const now = new Date();
        const tz = currentTimezone();
        const [stu] = await tx
          .select({ id: student.id, name: student.name })
          .from(student)
          .where(and(eq(student.id, studentId), eq(student.status, 'active'), isNull(student.deletedAt)));
        if (!stu) throw new HttpError(404, 'not_found', 'Siswa tidak ditemukan.');
        const cls = (await classesOf(tx, [studentId])).get(studentId) ?? null;
        const scope = await manualScope(tx, ctx, b.date);
        if (!canRecordClass(scope, cls?.id ?? null)) throw forbiddenClass();

        const [row] = await tx
          .select()
          .from(dailyAttendance)
          .where(and(eq(dailyAttendance.studentId, studentId), eq(dailyAttendance.date, b.date)));
        const pick = (raw: string | null | undefined, current: Date | null | undefined) => {
          if (raw === undefined) return current ?? null;
          if (raw === null) return null;
          return parseWhen(b.date, raw, now);
        };
        const checkInAt = pick(b.checkInAt, row?.checkInAt);
        const checkOutAt = pick(b.checkOutAt, row?.checkOutAt);
        if (checkInAt && checkOutAt && checkOutAt < checkInAt) {
          throw new HttpError(400, 'invalid_time', 'Jam pulang tidak boleh sebelum jam datang.');
        }
        const note = b.note === undefined ? (row?.note ?? null) : b.note;
        const view = (removed: boolean, r: Partial<typeof dailyAttendance.$inferSelect> | null) => ({
          date: b.date,
          studentId,
          name: stu.name,
          className: cls?.name ?? null,
          removed,
          status: (r?.status ?? null) as z.infer<typeof statusEnum> | null,
          checkInAt: r?.checkInAt?.toISOString() ?? null,
          checkOutAt: r?.checkOutAt?.toISOString() ?? null,
          note: r?.note ?? null,
        });

        // Batalkan: kedua jam kosong, status tidak ditentukan, dan status lama hanya turunan dari tap.
        if (!checkInAt && !checkOutAt && b.status === undefined) {
          if (!row) return view(false, null);
          if (row.status === 'present' || row.status === 'late') {
            await tx.delete(dailyAttendance).where(eq(dailyAttendance.id, row.id));
            await audit(tx, ctx, 'attendance.daily.correct', 'student', studentId, {
              date: b.date,
              removed: true,
              before: { status: row.status, checkInAt: row.checkInAt, checkOutAt: row.checkOutAt },
            });
            return view(true, null);
          }
        }

        const inChanged = !!checkInAt && checkInAt.getTime() !== row?.checkInAt?.getTime();
        const outChanged = !!checkOutAt && checkOutAt.getTime() !== row?.checkOutAt?.getTime();
        let status = b.status ?? row?.status ?? 'present';
        if (b.status === undefined && checkInAt && (inChanged || !row)) {
          if (!row || row.status === 'present' || row.status === 'late') {
            const { time } = localParts(checkInAt, tz);
            status = time > (await loadPolicy(tx)).lateAfter ? 'late' : 'present';
          }
        }
        const [saved] = await tx
          .insert(dailyAttendance)
          .values({ schoolId: ctx.schoolId, studentId, date: b.date, checkInAt, checkOutAt, status, note })
          .onConflictDoUpdate({
            target: [dailyAttendance.studentId, dailyAttendance.date],
            set: { checkInAt, checkOutAt, status, note, updatedAt: new Date() },
          })
          .returning();
        for (const [changed, direction, at] of [
          [inChanged, 'in', checkInAt],
          [outChanged, 'out', checkOutAt],
        ] as const) {
          if (changed && at) {
            await tx.insert(tapEvent).values({
              schoolId: ctx.schoolId,
              studentId,
              direction,
              source: 'manual',
              at,
              recordedBy: ctx.userId,
            });
          }
        }
        await audit(tx, ctx, 'attendance.daily.correct', 'student', studentId, {
          date: b.date,
          before: row
            ? { status: row.status, checkInAt: row.checkInAt, checkOutAt: row.checkOutAt, note: row.note }
            : null,
          after: { status, checkInAt, checkOutAt, note },
        });
        return view(false, saved ?? null);
      });
    },
  );
}
