import { createHash } from 'node:crypto';
import { localParts } from '@edusync/contracts';
import { and, currentTimezone, dailyAttendance, eq, type Tx, tapEvent, withTenant } from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { loadPolicy } from '../gate';
import { applyManual, canRecordClass, forbiddenClass, manualScope, parseWhen } from '../gate-manual';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { resolveIdentityPayload } from '../identity-code';
import { audit, guarded, isUniqueViolation, schoolHeader } from './helpers';

const tag = ['Gate attendance'];
const MAX_BACK_MS = 48 * 3600_000;
const statusEnum = z.enum(['present', 'late', 'excused', 'sick', 'absent']);

const RULES =
  'Aturan akses sama dengan `/v1/gate/manual`: pengguna dengan `attendance:configure` boleh untuk semua kelas; guru ' +
  'yang bertugas piket hari ini boleh untuk semua kelas; guru lain hanya untuk kelas yang ia walikan; selain itu 403 ' +
  '`forbidden_class`.';

const scanResponse = z.object({
  result: z.enum(['in', 'out', 'already_in', 'already_out', 'skipped_status', 'invalid_time']),
  replayed: z
    .boolean()
    .describe(
      'true bila `clientId` sudah pernah diproses; hasil sebelumnya dikembalikan tanpa mencatat ulang',
    ),
  student: z.object({
    id: z.uuid(),
    name: z.string(),
    className: z.string().nullable(),
    nis: z.string().nullable(),
  }),
  date: z.string(),
  at: z.string().nullable().describe('Jam yang tercatat (ISO 8601)'),
  status: statusEnum.nullable(),
  late: z.boolean(),
  warning: z.enum(['no_check_in']).nullable(),
});

/**
 * Kunci pembatas laju per sesi (IP + cookie), bukan per IP saja: beberapa guru di sekolah yang sama biasanya berbagi
 * satu IP keluar dan tidak boleh saling menghabiskan jatah.
 */
const scanLimit = {
  rateLimit: {
    max: 240,
    timeWindow: '1 minute',
    keyGenerator: (request: { ip: string; headers: Record<string, unknown> }) =>
      `qr-scan:${createHash('sha256')
        .update(`${request.ip}|${String(request.headers.cookie ?? '')}`)
        .digest('hex')}`,
  },
};

/**
 * Absensi cadangan lewat pindai QR di kartu siswa (saat kiosk RFID tidak bisa dipakai). QR berisi kode identitas
 * siswa `ES1.<kode acak 100 bit>` (tabel `student_identity_code`, lihat `identity-code.ts`) yang hanya menunjuk
 * siswa; di menu ini pemindaian berarti mencatat datang/pulang. Kiosk RFID TIDAK PERNAH menerima kode ini. Modul
 * `attendance`.
 */
export async function gateScanRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  app.post(
    '/v1/gate/scan',
    {
      onRequest: [requirePermission('attendance:manage'), requireModule('attendance')],
      config: scanLimit,
      schema: {
        tags: tag,
        summary: 'Catat datang atau pulang dengan memindai QR kartu siswa',
        description:
          'Izin: `attendance:manage`; modul `attendance`. Cadangan bila kiosk RFID tidak bisa dipakai: guru memindai QR ' +
          'di kartu siswa dengan kamera. `payload` adalah teks hasil pindai (`ES1.<20 karakter>`); selain format itu ' +
          '400 `invalid_qr`, kode yang tidak terdaftar atau sudah diganti 404 `unknown_qr`. ' +
          RULES +
          ' Inti pencatatan SAMA dengan `/v1/gate/manual` (status terlambat dari kebijakan `lateAfter`, penjaga hari ' +
          'libur, pemberitahuan wali, aturan status izin/sakit/alpa) tetapi `tap_event` bersumber `qr` dengan ' +
          '`recordedBy` pencatat. `direction` dipilih eksplisit oleh guru (`in` datang, `out` pulang). `at` (ISO 8601 ' +
          'dengan zona) adalah jam pindai asli untuk kiriman ulang dari antrean offline: tidak boleh di masa depan dan ' +
          'maksimal 48 jam ke belakang (400 `invalid_time`); tanpa `at` dipakai jam server. `clientId` (kunci ' +
          'idempoten per pindaian, maks. 64 karakter): kiriman ulang dengan `clientId` yang sama mengembalikan hasil ' +
          'sebelumnya dengan `replayed: true` tanpa mencatat dua kali. Catatan datang/pulang yang sudah ada tidak ' +
          'ditimpa (`already_in`, `already_out`) kecuali `overwrite: true`; siswa berstatus izin/sakit/alpa dilewati ' +
          '(`skipped_status`) kecuali `overwrite`. Pulang tanpa catatan datang tetap dicatat dengan `warning` ' +
          '`no_check_in`. Hari libur/jeda sekolah: 409 `school_closed` kecuali `force: true`. Siswa tidak aktif: 409 ' +
          '`student_inactive`. Dibatasi 240 permintaan per menit per sesi (429). Satu entri audit dicatat per pindaian.',
        headers: schoolHeader,
        body: z.object({
          payload: z.string().trim().min(1).max(200),
          direction: z.enum(['in', 'out']),
          at: z.iso.datetime({ offset: true }).optional(),
          clientId: z.string().trim().min(1).max(64).optional(),
          overwrite: z.boolean().default(false),
          force: z.boolean().default(false),
        }),
        response: {
          200: scanResponse,
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          429: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      const run = () =>
        tenant(request, async (tx) => {
          const now = new Date();
          const tz = currentTimezone();
          const at = b.at ? new Date(b.at) : now;
          if (now.getTime() - at.getTime() > MAX_BACK_MS) {
            throw new HttpError(
              400,
              'invalid_time',
              'Pindaian lebih dari 48 jam yang lalu tidak dapat dikirim.',
            );
          }
          const date = localParts(at, tz).date;
          if (b.at) parseWhen(date, b.at, now); // menolak jam di masa depan

          // Kode identitas hanya menunjuk siswa; tindakan (absensi) dan izinnya ditentukan di sini.
          const resolved = await resolveIdentityPayload(tx, b.payload);
          const found = { id: resolved.studentId };
          if (!resolved.active) throw new HttpError(409, 'student_inactive', 'Siswa ini tidak aktif.');

          const scope = await manualScope(tx, ctx, date);
          if (!canRecordClass(scope, resolved.classId)) throw forbiddenClass();

          const info = {
            id: resolved.studentId,
            name: resolved.name,
            className: resolved.className,
            nis: resolved.nis,
          };

          if (b.clientId) {
            const [seen] = await tx
              .select({ studentId: tapEvent.studentId, direction: tapEvent.direction, at: tapEvent.at })
              .from(tapEvent)
              .where(eq(tapEvent.clientId, b.clientId));
            if (seen) {
              if (seen.studentId !== found.id) {
                throw new HttpError(409, 'conflict', 'clientId ini sudah dipakai untuk pindaian siswa lain.');
              }
              const seenDate = localParts(seen.at, tz).date;
              const [row] = await tx
                .select()
                .from(dailyAttendance)
                .where(and(eq(dailyAttendance.studentId, found.id), eq(dailyAttendance.date, seenDate)));
              return {
                result: seen.direction,
                replayed: true,
                student: info,
                date: seenDate,
                at: seen.at.toISOString(),
                status: row?.status ?? null,
                late: row?.status === 'late',
                warning: null,
              };
            }
          }

          const out = await applyManual(
            tx,
            ctx,
            {
              date,
              direction: b.direction,
              entries: [{ studentId: found.id, at, clientId: b.clientId }],
              overwrite: b.overwrite,
              force: b.force,
              source: 'qr',
            },
            scope,
            await loadPolicy(tx),
          );
          const r = out.results[0];
          if (!r || r.result === 'not_found') {
            throw new HttpError(409, 'student_inactive', 'Siswa ini tidak aktif.');
          }
          await audit(tx, ctx, 'attendance.qr.scan', 'student', found.id, {
            date,
            direction: b.direction,
            result: r.result,
            offline: !!b.at,
          });
          return {
            result: r.result,
            replayed: false,
            student: info,
            date,
            at: r.at,
            status: r.status,
            late: r.late,
            warning: r.warning,
          };
        });

      try {
        return await run();
      } catch (error) {
        // Dua kiriman bersamaan dengan clientId sama: yang kalah melihat hasil yang menang pada percobaan kedua.
        if (b.clientId && isUniqueViolation(error)) return run();
        throw error;
      }
    },
  );
}
