import { formatIdentityPayload } from '@edusync/contracts';
import { eq, student, type Tx, withTenant } from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requirePermission, type TenantContext } from '../identity/guards';
import { ensureIdentityPayload, rotateIdentityCode } from '../identity-code';
import { audit, guarded, schoolHeader } from './helpers';

const tag = ['Students'];
const params = z.object({ studentId: z.uuid() });
const response = z.object({
  studentId: z.uuid(),
  qr: z.string().describe('Isi QR identitas siswa (`ES1.<kode>`)'),
});

/**
 * Pengelolaan kode identitas siswa (QR di kartu). Kode ini satu per siswa, tidak terikat modul, dan hanya
 * mengidentifikasi siswa; fitur yang memindainya (mis. absensi cadangan) punya endpoint, izin, dan modulnya sendiri.
 */
export async function identityCodeRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  const requireStudent = async (tx: Tx, studentId: string) => {
    const [s] = await tx.select({ id: student.id }).from(student).where(eq(student.id, studentId));
    if (!s) throw new HttpError(404, 'not_found', 'Siswa tidak ditemukan.');
  };

  app.get(
    '/v1/students/:studentId/identity-code',
    {
      onRequest: [requirePermission('student:manage')],
      schema: {
        tags: tag,
        summary: 'QR identitas siswa',
        description:
          'Izin: `student:manage`. Mengembalikan isi QR identitas (`ES1.<kode>`) siswa; dibuat bila belum ada ' +
          '(idempoten). Kode ini hanya mengidentifikasi siswa dan tidak memberi akses apa pun dengan sendirinya: ' +
          'pemindai (mis. absensi) wajib login dan punya izin fiturnya. Siswa tidak ada: 404.',
        headers: schoolHeader,
        params,
        response: { 200: response, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { studentId } = request.params;
      return tenant(request, async (tx) => {
        await requireStudent(tx, studentId);
        const qr = await ensureIdentityPayload(tx, ctx.schoolId, studentId);
        if (!qr) throw new HttpError(404, 'not_found', 'Siswa tidak ditemukan.');
        return { studentId, qr };
      });
    },
  );

  app.post(
    '/v1/students/:studentId/identity-code/rotate',
    {
      onRequest: [requirePermission('student:manage')],
      schema: {
        tags: tag,
        summary: 'Buat ulang QR identitas siswa',
        description:
          'Izin: `student:manage`. Untuk kartu yang hilang atau QR yang bocor: isi kode diganti di tempat sehingga QR ' +
          'lama langsung tidak berlaku untuk SEMUA fitur (pindaiannya 404 `unknown_qr`). Mengembalikan `qr` baru ' +
          '(`ES1.<kode>`) untuk dicetak ulang. QR dibuat otomatis saat pertama dibutuhkan (`GET /v1/cards/students`), ' +
          'jadi endpoint ini hanya untuk mengganti. Siswa tidak ada: 404. Satu entri audit dicatat (tanpa kode).',
        headers: schoolHeader,
        params,
        response: { 200: response, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { studentId } = request.params;
      return tenant(request, async (tx) => {
        const code = await rotateIdentityCode(tx, ctx.schoolId, studentId);
        if (!code) throw new HttpError(404, 'not_found', 'Siswa tidak ditemukan.');
        await audit(tx, ctx, 'student.identity_code.rotate', 'student', studentId);
        return { studentId, qr: formatIdentityPayload(code) };
      });
    },
  );
}
