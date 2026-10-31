import { createHash, randomBytes } from 'node:crypto';
import {
  academicYear,
  and,
  asc,
  attendanceCard,
  attendanceDevice,
  attendancePolicy,
  classRoom,
  dailyAttendance,
  dutyRoster,
  enrollment,
  entitlement,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lte,
  school,
  student,
  type Tx,
  teacher,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { closureOn } from '../attendance-lib';
import { isOnDuty, jakarta, loadPolicy, recordTap } from '../gate';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { notifyTap } from '../messaging-lib';
import { audit, conflictAs409, guarded, idParams, isUniqueViolation, ok, schoolHeader } from './helpers';

const tag = ['Gate attendance'];
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam HH:MM');
const dateField = z.iso.date();
const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');
const gate = (permission: 'attendance:read' | 'attendance:configure') => [
  requirePermission(permission),
  requireModule('attendance'),
];

const policySchema = z.object({
  lateAfter: time,
  departureFrom: time,
  debounceSeconds: z.number().int().min(0).max(600),
});

const tapResponse = z.object({
  result: z.enum(['in', 'out', 'already_in', 'duplicate', 'replayed']),
  direction: z.enum(['in', 'out']),
  late: z.boolean(),
  at: z.string(),
  student: z.object({ id: z.uuid(), name: z.string(), className: z.string().nullable() }),
});

const statusEnum = z.enum(['present', 'late', 'excused', 'sick', 'absent']);

declare module 'fastify' {
  interface FastifyRequest {
    device?: { id: string; schoolId: string; name: string };
  }
}

/**
 * Perangkat kiosk masuk dengan kunci di header `x-device-key`, bukan sesi pengguna. Pencarian kunci memakai pool
 * platform (sekolah belum diketahui), lalu seluruh pekerjaan berikutnya berjalan di transaksi tenant sekolahnya.
 */
async function requireDevice(request: FastifyRequest) {
  const key = request.headers['x-device-key'];
  if (typeof key !== 'string' || key.length < 16) {
    throw new HttpError(401, 'invalid_device', 'Kunci perangkat tidak valid.');
  }
  const db = request.server.platformDb;
  const [row] = await db
    .select({
      id: attendanceDevice.id,
      schoolId: attendanceDevice.schoolId,
      name: attendanceDevice.name,
      active: attendanceDevice.active,
      schoolStatus: school.status,
    })
    .from(attendanceDevice)
    .innerJoin(school, eq(school.id, attendanceDevice.schoolId))
    .where(eq(attendanceDevice.keyHash, hashKey(key)));
  if (!row || !row.active) throw new HttpError(401, 'invalid_device', 'Kunci perangkat tidak valid.');
  if (row.schoolStatus !== 'active')
    throw new HttpError(403, 'school_suspended', 'Sekolah ini ditangguhkan.');
  const modules = await withTenant(request.server.tenantDb, [row.schoolId], (tx) =>
    tx
      .select({ key: entitlement.moduleKey })
      .from(entitlement)
      .where(and(eq(entitlement.moduleKey, 'attendance'), gt(entitlement.validUntil, new Date()))),
  );
  if (modules.length === 0) throw new HttpError(403, 'module_disabled', 'Modul absensi belum aktif.');
  request.device = { id: row.id, schoolId: row.schoolId, name: row.name };
}

/** Waktu tap dari perangkat: boleh masa lalu (kirim ulang offline, maksimal 48 jam), tidak boleh di masa depan. */
function tapTime(at: string | undefined) {
  if (!at) return new Date();
  const d = new Date(at);
  const now = Date.now();
  if (d.getTime() > now + 60_000 || d.getTime() < now - 48 * 3_600_000) {
    throw new HttpError(400, 'invalid_time', 'Waktu tap di luar rentang yang diterima.');
  }
  return d;
}

/**
 * Absensi gerbang: kebijakan jam, perangkat kiosk, kartu RFID, tap kartu di kiosk, jadwal piket, dan absensi
 * harian. Modul `attendance`.
 */
export async function gateRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);
  const asDevice = <T>(request: FastifyRequest, fn: (tx: Tx, schoolId: string) => Promise<T>) => {
    const d = request.device as NonNullable<FastifyRequest['device']>;
    return withTenant(request.server.tenantDb, [d.schoolId], (tx) => fn(tx, d.schoolId));
  };

  /* ---------- Kebijakan ---------- */

  app.get(
    '/v1/attendance/policy',
    {
      onRequest: gate('attendance:read'),
      schema: {
        tags: tag,
        summary: 'Kebijakan absensi gerbang',
        description:
          'Izin: `attendance:read`. Jam terlambat, jam mulai pulang, dan jeda tap ganda. ' +
          'Bila sekolah belum menyimpannya, nilai bawaan dikembalikan.',
        headers: schoolHeader,
        response: { 200: policySchema, ...guarded },
      },
    },
    async (request) => tenant(request, (tx) => loadPolicy(tx) as Promise<z.infer<typeof policySchema>>),
  );

  app.put(
    '/v1/attendance/policy',
    {
      onRequest: gate('attendance:configure'),
      schema: {
        tags: tag,
        summary: 'Ubah kebijakan absensi gerbang',
        description: 'Izin: `attendance:configure`. `lateAfter` harus lebih awal dari `departureFrom`.',
        headers: schoolHeader,
        body: policySchema,
        response: { 200: policySchema, 400: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const body = request.body;
      if (body.lateAfter >= body.departureFrom) {
        throw new HttpError(400, 'invalid_policy', 'Jam terlambat harus lebih awal dari jam pulang.');
      }
      return tenant(request, async (tx) => {
        await tx
          .insert(attendancePolicy)
          .values({ schoolId: ctx.schoolId, ...body })
          .onConflictDoUpdate({
            target: attendancePolicy.schoolId,
            set: { ...body, updatedAt: new Date() },
          });
        await audit(tx, ctx, 'attendance.policy', 'school', ctx.schoolId, body);
        return body;
      });
    },
  );

  /* ---------- Perangkat ---------- */

  const deviceView = z.object({
    id: z.uuid(),
    name: z.string(),
    keyPrefix: z.string(),
    active: z.boolean(),
    lastSeenAt: z.string().nullable(),
  });
  const newKey = () => `esk_${randomBytes(24).toString('base64url')}`;

  app.get(
    '/v1/attendance/devices',
    {
      onRequest: gate('attendance:configure'),
      schema: {
        tags: tag,
        summary: 'Daftar perangkat kiosk',
        description: 'Izin: `attendance:configure`. Kunci lengkap tidak pernah ditampilkan ulang.',
        headers: schoolHeader,
        response: { 200: z.array(deviceView), ...guarded },
      },
    },
    async (request) => {
      const rows = await tenant(request, (tx) =>
        tx
          .select({
            id: attendanceDevice.id,
            name: attendanceDevice.name,
            keyPrefix: attendanceDevice.keyPrefix,
            active: attendanceDevice.active,
            lastSeenAt: attendanceDevice.lastSeenAt,
          })
          .from(attendanceDevice)
          .orderBy(asc(attendanceDevice.name)),
      );
      return rows.map((r) => ({ ...r, lastSeenAt: r.lastSeenAt?.toISOString() ?? null }));
    },
  );

  app.post(
    '/v1/attendance/devices',
    {
      onRequest: gate('attendance:configure'),
      schema: {
        tags: tag,
        summary: 'Daftarkan perangkat kiosk',
        description:
          'Izin: `attendance:configure`. Kunci API (`key`) hanya muncul pada respons ini; simpan di perangkat kiosk. ' +
          'Kiosk memakainya lewat header `x-device-key`.',
        headers: schoolHeader,
        body: z.object({ name: z.string().trim().min(2).max(80) }),
        response: {
          201: z.object({ id: z.uuid(), name: z.string(), key: z.string() }),
          ...guarded,
        },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const key = newKey();
      const row = await tenant(request, async (tx) => {
        const [d] = await tx
          .insert(attendanceDevice)
          .values({
            schoolId: ctx.schoolId,
            name: request.body.name,
            keyHash: hashKey(key),
            keyPrefix: key.slice(0, 8),
          })
          .returning({ id: attendanceDevice.id, name: attendanceDevice.name });
        await audit(tx, ctx, 'attendance.device.create', 'device', d?.id ?? '', { name: request.body.name });
        return d as { id: string; name: string };
      });
      return reply.code(201).send({ ...row, key });
    },
  );

  app.patch(
    '/v1/attendance/devices/:id',
    {
      onRequest: gate('attendance:configure'),
      schema: {
        tags: tag,
        summary: 'Ubah nama atau status perangkat',
        description: 'Izin: `attendance:configure`. Perangkat nonaktif ditolak saat tap.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({ name: z.string().trim().min(2).max(80).optional(), active: z.boolean().optional() }),
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      await tenant(request, async (tx) => {
        const rows = await tx
          .update(attendanceDevice)
          .set(request.body)
          .where(eq(attendanceDevice.id, request.params.id))
          .returning({ id: attendanceDevice.id });
        if (rows.length === 0) throw new HttpError(404, 'not_found', 'Perangkat tidak ditemukan.');
        await audit(tx, ctx, 'attendance.device.update', 'device', request.params.id, request.body);
      });
      return { ok: true as const };
    },
  );

  app.post(
    '/v1/attendance/devices/:id/rotate-key',
    {
      onRequest: gate('attendance:configure'),
      schema: {
        tags: tag,
        summary: 'Ganti kunci perangkat',
        description:
          'Izin: `attendance:configure`. Kunci lama langsung tidak berlaku; kunci baru hanya muncul sekali.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: z.object({ key: z.string() }), 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const key = newKey();
      await tenant(request, async (tx) => {
        const rows = await tx
          .update(attendanceDevice)
          .set({ keyHash: hashKey(key), keyPrefix: key.slice(0, 8) })
          .where(eq(attendanceDevice.id, request.params.id))
          .returning({ id: attendanceDevice.id });
        if (rows.length === 0) throw new HttpError(404, 'not_found', 'Perangkat tidak ditemukan.');
        await audit(tx, ctx, 'attendance.device.rotate', 'device', request.params.id);
      });
      return { key };
    },
  );

  app.delete(
    '/v1/attendance/devices/:id',
    {
      onRequest: gate('attendance:configure'),
      schema: {
        tags: tag,
        summary: 'Hapus perangkat',
        description:
          'Izin: `attendance:configure`. Perangkat yang sudah pernah mencatat tap tidak bisa dihapus (409 `in_use`); ' +
          'nonaktifkan saja.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      try {
        await tenant(request, async (tx) => {
          const rows = await tx
            .delete(attendanceDevice)
            .where(eq(attendanceDevice.id, request.params.id))
            .returning({ id: attendanceDevice.id });
          if (rows.length === 0) throw new HttpError(404, 'not_found', 'Perangkat tidak ditemukan.');
          await audit(tx, ctx, 'attendance.device.delete', 'device', request.params.id);
        });
      } catch (error) {
        const e = error as { code?: string; cause?: { code?: string } };
        if (e?.code === '23503' || e?.cause?.code === '23503') {
          throw new HttpError(409, 'in_use', 'Perangkat sudah punya riwayat tap; nonaktifkan saja.');
        }
        throw error;
      }
      return { ok: true as const };
    },
  );

  /* ---------- Kartu ---------- */

  const cardView = z.object({
    id: z.uuid(),
    studentId: z.uuid(),
    studentName: z.string(),
    kind: z.literal('rfid'),
    code: z.string(),
    active: z.boolean(),
  });

  app.get(
    '/v1/attendance/cards',
    {
      onRequest: gate('attendance:configure'),
      schema: {
        tags: tag,
        summary: 'Daftar kartu RFID',
        description: 'Izin: `attendance:configure`. Bisa disaring per siswa.',
        headers: schoolHeader,
        querystring: z.object({ studentId: z.uuid().optional() }),
        response: { 200: z.array(cardView), ...guarded },
      },
    },
    async (request) =>
      tenant(request, (tx) =>
        tx
          .select({
            id: attendanceCard.id,
            studentId: attendanceCard.studentId,
            studentName: student.name,
            kind: attendanceCard.kind,
            code: attendanceCard.code,
            active: attendanceCard.active,
          })
          .from(attendanceCard)
          .innerJoin(student, eq(student.id, attendanceCard.studentId))
          .where(request.query.studentId ? eq(attendanceCard.studentId, request.query.studentId) : undefined)
          .orderBy(asc(student.name))
          .limit(500),
      ),
  );

  app.post(
    '/v1/attendance/cards',
    {
      onRequest: gate('attendance:configure'),
      schema: {
        tags: tag,
        summary: 'Daftarkan kartu siswa',
        description:
          'Izin: `attendance:configure`. Mendaftarkan kartu RFID; `code` adalah UID kartu dari pembaca (disimpan huruf ' +
          'besar). Kode yang sama tidak boleh dipakai dua siswa (409 `conflict`). Untuk banyak kartu sekaligus ' +
          'gunakan `/v1/attendance/cards/bulk`.',
        headers: schoolHeader,
        body: z
          .object({
            studentId: z.uuid(),
            code: z.string().trim().min(4).max(64),
          })
          .strict(),
        response: {
          201: z.object({ id: z.uuid(), code: z.string() }),
          400: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const { studentId } = request.body;
      const code = request.body.code.toUpperCase();
      const row = await conflictAs409('Kode kartu ini sudah dipakai.', () =>
        tenant(request, async (tx) => {
          const [s] = await tx.select({ id: student.id }).from(student).where(eq(student.id, studentId));
          if (!s) throw new HttpError(400, 'invalid_reference', 'Siswa tidak ditemukan.');
          const [c] = await tx
            .insert(attendanceCard)
            .values({ schoolId: ctx.schoolId, studentId, kind: 'rfid', code })
            .returning({ id: attendanceCard.id });
          await audit(tx, ctx, 'attendance.card.create', 'student', studentId, { kind: 'rfid' });
          return c as { id: string };
        }),
      );
      return reply.code(201).send({ id: row.id, code });
    },
  );

  const bulkReason = z.enum(['student_not_found', 'code_taken', 'student_has_card', 'invalid_code']);

  app.post(
    '/v1/attendance/cards/bulk',
    {
      onRequest: gate('attendance:configure'),
      schema: {
        tags: tag,
        summary: 'Daftarkan kartu RFID siswa secara massal',
        description:
          'Izin: `attendance:configure`. Maksimal 500 baris `{nis, code}`; siswa dicari lewat NIS di sekolah ini ' +
          'dan harus aktif. Hasilnya sebagian: tiap baris diproses sendiri, baris yang gagal tidak membatalkan ' +
          'baris lain. `created` adalah jumlah kartu yang terdaftar; `failed` memuat `row` (indeks 1-based pada ' +
          '`items`), `nis`, `code` (sudah huruf besar), dan `reason`: `student_not_found` (NIS tidak ada atau siswa ' +
          'tidak aktif), `code_taken` (kode sudah dipakai kartu lain atau muncul lebih dulu dalam batch yang sama), ' +
          '`student_has_card` (siswa sudah punya kartu RFID aktif), `invalid_code` (kode kurang dari 4 karakter ' +
          'atau mengandung spasi). Satu entri audit ringkas dicatat. Kode disimpan huruf besar.',
        headers: schoolHeader,
        body: z.object({
          items: z
            .array(
              z.object({
                nis: z.string().trim().min(1).max(40),
                code: z.string().trim().min(1).max(64),
              }),
            )
            .min(1)
            .max(500),
        }),
        response: {
          200: z.object({
            created: z.number().int(),
            failed: z.array(
              z.object({ row: z.number().int(), nis: z.string(), code: z.string(), reason: bulkReason }),
            ),
          }),
          400: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { items } = request.body;
      return tenant(request, async (tx) => {
        const failed: { row: number; nis: string; code: string; reason: z.infer<typeof bulkReason> }[] = [];
        let created = 0;
        for (const [i, item] of items.entries()) {
          const row = i + 1;
          const code = item.code.toUpperCase();
          const fail = (reason: z.infer<typeof bulkReason>) =>
            failed.push({ row, nis: item.nis, code, reason });
          if (code.length < 4 || /\s/.test(code)) {
            fail('invalid_code');
            continue;
          }
          const [stu] = await tx
            .select({ id: student.id })
            .from(student)
            .where(and(eq(student.nis, item.nis), eq(student.status, 'active'), isNull(student.deletedAt)))
            .limit(1);
          if (!stu) {
            fail('student_not_found');
            continue;
          }
          // Kode yang sudah masuk dari baris sebelumnya dalam batch ini ikut terbaca di sini (transaksi sama).
          const [taken] = await tx
            .select({ id: attendanceCard.id })
            .from(attendanceCard)
            .where(eq(attendanceCard.code, code))
            .limit(1);
          if (taken) {
            fail('code_taken');
            continue;
          }
          const [has] = await tx
            .select({ id: attendanceCard.id })
            .from(attendanceCard)
            .where(
              and(
                eq(attendanceCard.studentId, stu.id),
                eq(attendanceCard.kind, 'rfid'),
                eq(attendanceCard.active, true),
              ),
            )
            .limit(1);
          if (has) {
            fail('student_has_card');
            continue;
          }
          try {
            // Savepoint: pelanggaran unique (balapan dengan pendaftaran lain) hanya membatalkan baris ini.
            await tx.transaction((sp) =>
              sp
                .insert(attendanceCard)
                .values({ schoolId: ctx.schoolId, studentId: stu.id, kind: 'rfid', code }),
            );
          } catch (error) {
            if (!isUniqueViolation(error)) throw error;
            fail('code_taken');
            continue;
          }
          created++;
        }
        await audit(tx, ctx, 'attendance.card.bulk', 'school', ctx.schoolId, {
          created,
          failed: failed.length,
        });
        return { created, failed };
      });
    },
  );

  app.delete(
    '/v1/attendance/cards/:id',
    {
      onRequest: gate('attendance:configure'),
      schema: {
        tags: tag,
        summary: 'Hapus kartu',
        description: 'Izin: `attendance:configure`. Kartu hilang: hapus lalu daftarkan kartu baru.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      await tenant(request, async (tx) => {
        const rows = await tx
          .delete(attendanceCard)
          .where(eq(attendanceCard.id, request.params.id))
          .returning({ studentId: attendanceCard.studentId });
        if (rows.length === 0) throw new HttpError(404, 'not_found', 'Kartu tidak ditemukan.');
        await audit(tx, ctx, 'attendance.card.delete', 'student', rows[0]?.studentId ?? '');
      });
      return { ok: true as const };
    },
  );

  /* ---------- Kiosk (autentikasi perangkat) ---------- */

  const deviceHeader = z.object({ 'x-device-key': z.string().describe('Kunci API perangkat kiosk') });

  app.get(
    '/v1/kiosk/info',
    {
      onRequest: requireDevice,
      schema: {
        tags: ['Kiosk'],
        summary: 'Info untuk layar kiosk',
        description:
          'Autentikasi: header `x-device-key`. Nama sekolah dan perangkat, dan jam server ' +
          '(untuk mendeteksi jam perangkat yang melenceng).',
        headers: deviceHeader,
        response: {
          200: z.object({
            school: z.string(),
            device: z.string(),
            serverTime: z.string(),
          }),
          401: errorSchema,
          403: errorSchema,
        },
      },
    },
    async (request) => {
      const d = request.device as NonNullable<FastifyRequest['device']>;
      return asDevice(request, async (tx, schoolId) => {
        const [s] = await tx.select({ name: school.name }).from(school).where(eq(school.id, schoolId));
        await tx
          .update(attendanceDevice)
          .set({ lastSeenAt: new Date() })
          .where(eq(attendanceDevice.id, d.id));
        return {
          school: s?.name ?? '',
          device: d.name,
          serverTime: new Date().toISOString(),
        };
      });
    },
  );

  app.post(
    '/v1/kiosk/tap',
    {
      onRequest: requireDevice,
      schema: {
        tags: ['Kiosk'],
        summary: 'Catat tap kartu',
        description:
          'Autentikasi: header `x-device-key`. `code` adalah UID kartu RFID (huruf besar/kecil sama). Arah masuk/pulang ditentukan ' +
          'dari jam tap terhadap kebijakan. `result`: `in`, `out`, `already_in` (sudah tap masuk), `duplicate` (tap ' +
          'berulang dalam jeda), `replayed` (clientId sudah pernah diterima). Tap offline dikirim ulang dengan `at` ' +
          'asli dan `clientId` tetap (maksimal 48 jam ke belakang). Kartu tak dikenal: 404 `unknown_card`.',
        headers: deviceHeader,
        body: z.object({
          code: z.string().trim().min(1).max(128),
          at: z.iso.datetime({ offset: true }).optional(),
          clientId: z.string().trim().min(1).max(64).optional(),
        }),
        response: {
          200: tapResponse,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request) => {
      const d = request.device as NonNullable<FastifyRequest['device']>;
      const at = tapTime(request.body.at);
      return asDevice(request, async (tx, schoolId) => {
        const [card] = await tx
          .select()
          .from(attendanceCard)
          .where(
            and(eq(attendanceCard.code, request.body.code.toUpperCase()), eq(attendanceCard.active, true)),
          );
        const found = card;
        if (!found) throw new HttpError(404, 'unknown_card', 'Kartu tidak dikenal.');
        await tx
          .update(attendanceDevice)
          .set({ lastSeenAt: new Date() })
          .where(eq(attendanceDevice.id, d.id));
        const tapped = await recordTap(
          tx,
          { schoolId },
          {
            studentId: found.studentId,
            at,
            deviceId: d.id,
            ...(request.body.clientId ? { clientId: request.body.clientId } : {}),
          },
          await loadPolicy(tx),
        );
        // Pemberitahuan ke wali (gagal pun tidak menggagalkan tap).
        await notifyTap(tx, schoolId, tapped);
        return tapped;
      });
    },
  );

  /* ---------- Absensi harian ---------- */

  app.get(
    '/v1/gate/daily',
    {
      onRequest: gate('attendance:read'),
      schema: {
        tags: tag,
        summary: 'Absensi gerbang harian',
        description:
          'Izin: `attendance:read`. Semua siswa aktif di tahun ajaran aktif (bisa disaring per kelas) dengan status, ' +
          'jam masuk, dan jam pulang; `status` null berarti belum ada catatan. `summary` menghitung per status.',
        headers: schoolHeader,
        querystring: z.object({ date: dateField, classId: z.uuid().optional() }),
        response: {
          200: z.object({
            date: z.string(),
            closed: z.object({ type: z.enum(['holiday', 'break']), title: z.string() }).nullable(),
            summary: z.object({
              total: z.number().int(),
              present: z.number().int(),
              late: z.number().int(),
              excused: z.number().int(),
              sick: z.number().int(),
              absent: z.number().int(),
              notYet: z.number().int(),
            }),
            students: z.array(
              z.object({
                studentId: z.uuid(),
                name: z.string(),
                nis: z.string().nullable(),
                className: z.string(),
                status: statusEnum.nullable(),
                checkInAt: z.string().nullable(),
                checkOutAt: z.string().nullable(),
                note: z.string().nullable(),
              }),
            ),
          }),
          ...guarded,
        },
      },
    },
    async (request) => {
      const { date, classId } = request.query;
      return tenant(request, async (tx) => {
        const rows = await tx
          .select({
            studentId: student.id,
            name: student.name,
            nis: student.nis,
            className: classRoom.name,
            status: dailyAttendance.status,
            checkInAt: dailyAttendance.checkInAt,
            checkOutAt: dailyAttendance.checkOutAt,
            note: dailyAttendance.note,
          })
          .from(enrollment)
          .innerJoin(
            academicYear,
            and(eq(academicYear.id, enrollment.academicYearId), eq(academicYear.isActive, true)),
          )
          .innerJoin(student, eq(student.id, enrollment.studentId))
          .innerJoin(classRoom, eq(classRoom.id, enrollment.classId))
          .leftJoin(
            dailyAttendance,
            and(eq(dailyAttendance.studentId, student.id), eq(dailyAttendance.date, date)),
          )
          .where(
            and(
              isNull(student.deletedAt),
              eq(student.status, 'active'),
              classId ? eq(enrollment.classId, classId) : undefined,
            ),
          )
          .orderBy(asc(classRoom.name), asc(student.name))
          .limit(3000);
        const count = (s: string) => rows.filter((r) => r.status === s).length;
        const closed = await closureOn(tx, date);
        return {
          date,
          closed: closed as { type: 'holiday' | 'break'; title: string } | null,
          summary: {
            total: rows.length,
            present: count('present'),
            late: count('late'),
            excused: count('excused'),
            sick: count('sick'),
            absent: count('absent'),
            notYet: rows.filter((r) => r.status === null).length,
          },
          students: rows.map((r) => ({
            ...r,
            checkInAt: r.checkInAt?.toISOString() ?? null,
            checkOutAt: r.checkOutAt?.toISOString() ?? null,
          })),
        };
      });
    },
  );

  /* ---------- Jadwal piket ---------- */

  app.get(
    '/v1/duty-roster',
    {
      onRequest: gate('attendance:read'),
      schema: {
        tags: tag,
        summary: 'Jadwal guru piket',
        description:
          'Izin: `attendance:read`. Guru yang bertugas per tanggal dalam rentang (maksimal 93 hari).',
        headers: schoolHeader,
        querystring: z.object({ from: dateField, to: dateField }),
        response: {
          200: z.array(z.object({ date: z.string(), teacherId: z.uuid(), teacherName: z.string() })),
          400: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const { from, to } = request.query;
      if (from > to || Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 93 * 86_400_000) {
        throw new HttpError(400, 'invalid_period', 'Rentang tanggal tidak valid (maksimal 93 hari).');
      }
      return tenant(request, (tx) =>
        tx
          .select({ date: dutyRoster.date, teacherId: dutyRoster.teacherId, teacherName: teacher.name })
          .from(dutyRoster)
          .innerJoin(teacher, eq(teacher.id, dutyRoster.teacherId))
          .where(and(gte(dutyRoster.date, from), lte(dutyRoster.date, to)))
          .orderBy(asc(dutyRoster.date), asc(teacher.name)),
      );
    },
  );

  app.put(
    '/v1/duty-roster',
    {
      onRequest: gate('attendance:configure'),
      schema: {
        tags: tag,
        summary: 'Tetapkan guru piket satu tanggal',
        description:
          'Izin: `attendance:configure`. Mengganti seluruh petugas pada tanggal itu; daftar kosong mengosongkannya.',
        headers: schoolHeader,
        body: z.object({ date: dateField, teacherIds: z.array(z.uuid()).max(20) }),
        response: { 200: ok, 400: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { date, teacherIds } = request.body;
      const unique = [...new Set(teacherIds)];
      await tenant(request, async (tx) => {
        if (unique.length > 0) {
          const found = await tx
            .select({ id: teacher.id })
            .from(teacher)
            .where(and(inArray(teacher.id, unique), eq(teacher.status, 'active')));
          if (found.length !== unique.length) {
            throw new HttpError(400, 'invalid_reference', 'Ada guru yang tidak ditemukan atau tidak aktif.');
          }
        }
        await tx.delete(dutyRoster).where(eq(dutyRoster.date, date));
        if (unique.length > 0) {
          await tx
            .insert(dutyRoster)
            .values(unique.map((teacherId) => ({ schoolId: ctx.schoolId, date, teacherId })));
        }
        await audit(tx, ctx, 'attendance.duty', 'school', ctx.schoolId, { date, count: unique.length });
      });
      return { ok: true as const };
    },
  );

  app.get(
    '/v1/duty-roster/me',
    {
      onRequest: gate('attendance:read'),
      schema: {
        tags: tag,
        summary: 'Apakah saya piket hari ini',
        description:
          'Izin: `attendance:read`. `canCover` benar bila pengguna piket hari ini atau punya `attendance:configure`; ' +
          'itulah yang membuka penggantian absensi per jam pelajaran.',
        headers: schoolHeader,
        response: {
          200: z.object({ date: z.string(), onDuty: z.boolean(), canCover: z.boolean() }),
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const { date } = jakarta(new Date());
        const onDuty = await isOnDuty(tx, ctx, date);
        return { date, onDuty, canCover: onDuty || ctx.permissions.has('attendance:configure') };
      });
    },
  );
}
