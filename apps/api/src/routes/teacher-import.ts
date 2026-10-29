import { inArray, type Tx, teacher, withTenant } from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema } from '../http-error';
import { requirePermission, type TenantContext } from '../identity/guards';
import { audit, guarded, schoolHeader } from './helpers';

const MAX_ROWS = 1000;
const idPattern = /^[A-Za-z0-9./-]+$/;

const rowSchema = z.object({
  row: z.number().int().min(1),
  name: z.string().max(200).default(''),
  nip: z.string().max(60).default(''),
  status: z.string().max(30).default(''),
});
const errorRow = z.object({ row: z.number().int(), field: z.string().nullable(), message: z.string() });

const STATUS: Record<string, 'active' | 'inactive'> = {
  '': 'active',
  aktif: 'active',
  active: 'active',
  nonaktif: 'inactive',
  'non-aktif': 'inactive',
  'tidak aktif': 'inactive',
  inactive: 'inactive',
};

/** Impor guru dari data yang sudah dibaca di browser: pratinjau lalu simpan semua-atau-tidak sama sekali. */
export async function teacherImportRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.post(
    '/v1/teachers/import',
    {
      onRequest: [requirePermission('teacher:manage')],
      bodyLimit: 2 * 1024 * 1024,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        tags: ['People'],
        summary: 'Impor guru (pratinjau atau simpan)',
        description:
          `Izin: \`teacher:manage\`. Maksimal ${MAX_ROWS} baris. \`dryRun: true\` hanya memeriksa. Tanpa \`dryRun\`, ` +
          'guru disimpan hanya bila semua baris valid. NIP harus unik di file dan di sekolah; status kosong berarti aktif.',
        headers: schoolHeader,
        body: z.object({ dryRun: z.boolean(), rows: z.array(rowSchema).min(1).max(MAX_ROWS) }),
        response: {
          200: z.object({
            total: z.number().int(),
            valid: z.number().int(),
            imported: z.number().int(),
            errors: z.array(errorRow),
          }),
          ...guarded,
          400: errorSchema,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { dryRun, rows } = request.body;
      return withTenant(request.server.tenantDb, [ctx.schoolId], async (tx: Tx) => {
        const nips = rows.map((r) => r.nip.trim()).filter(Boolean);
        const taken = new Set(
          nips.length
            ? (await tx.select({ nip: teacher.nip }).from(teacher).where(inArray(teacher.nip, nips))).map(
                (t) => t.nip,
              )
            : [],
        );
        const errors: z.infer<typeof errorRow>[] = [];
        const seen = new Map<string, number>();
        const prepared: { name: string; nip: string | null; status: 'active' | 'inactive' }[] = [];

        for (const r of rows) {
          const before = errors.length;
          const fail = (field: string, message: string) => errors.push({ row: r.row, field, message });
          const name = r.name.trim().replace(/\s+/g, ' ');
          const nip = r.nip.trim();
          const status = STATUS[r.status.trim().toLowerCase()];
          if (!name) fail('name', 'Nama wajib diisi.');
          else if (name.length > 120) fail('name', 'Nama maksimal 120 karakter.');
          if (nip && !idPattern.test(nip)) {
            fail('nip', 'NIP hanya boleh huruf, angka, titik, garis miring, dan tanda hubung.');
          } else if (nip) {
            if (taken.has(nip)) fail('nip', `NIP ${nip} sudah dipakai guru lain.`);
            else if (seen.has(nip)) fail('nip', `NIP ${nip} ganda dengan baris ${seen.get(nip)}.`);
            else seen.set(nip, r.row);
          }
          if (!status) fail('status', 'Status harus Aktif atau Nonaktif.');
          if (errors.length === before && status) prepared.push({ name, nip: nip || null, status });
        }

        const result = { total: rows.length, valid: prepared.length, imported: 0, errors };
        if (dryRun || errors.length > 0) return result;

        const inserted = await tx
          .insert(teacher)
          .values(prepared.map((p) => ({ schoolId: ctx.schoolId, ...p })))
          .returning({ id: teacher.id });
        await audit(tx, ctx, 'teacher.import', 'teacher', ctx.schoolId, { count: inserted.length });
        return { ...result, imported: inserted.length };
      });
    },
  );
}
