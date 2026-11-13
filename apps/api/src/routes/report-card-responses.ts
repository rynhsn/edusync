import { reportGuardianResponseSchema } from '@edusync/contracts';
import { eq, semester, type Tx, withTenant } from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import {
  canViewClass,
  canWriteClass,
  reportNotAllowed as notAllowed,
  resolveReportStudent,
} from '../report-card-access-lib';
import { requireSemesterClass } from '../report-card-lib';
import {
  guardiansOf,
  isGuardianOf,
  loadResponses,
  RESPONSE_TEXT_MAX,
  responseWindow,
  saveResponse,
} from '../report-response-lib';
import { audit, guarded, schoolHeader } from './helpers';

const tag = ['Report cards'];
const MODULE = 'grades';
const readGate = [requirePermission('report_card:read'), requireModule(MODULE)];

export const responseWindowSchema = z.object({
  final: z.boolean().describe('Rapor siswa itu berstatus final (syarat tanggapan)'),
  finalizedAt: z.string().nullable(),
  closesAt: z.string().nullable().describe('Akhir jendela tanggapan; null = tanpa batas atau belum final'),
  open: z.boolean().describe('true bila rapor final dan jendela tanggapan belum lewat'),
  windowDays: z.number().int().nullable().describe('Panjang jendela (hari); null = tanpa batas'),
});

/** Tanggapan orang tua/wali atas rapor final: tampilan dan salinan dari rapor kertas oleh staf. Modul `grades`. */
export async function reportCardResponseRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  async function locate(tx: Tx, semesterId: string, studentId: string) {
    const [sem] = await tx.select().from(semester).where(eq(semester.id, semesterId));
    if (!sem) throw new HttpError(400, 'invalid_reference', 'Semester tidak ditemukan.');
    const { classId } = await resolveReportStudent(tx, sem, studentId);
    const { cls } = await requireSemesterClass(tx, sem.id, classId);
    return { sem, cls };
  }

  app.get(
    '/v1/report-cards/responses',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Tanggapan orang tua/wali atas rapor satu siswa',
        description:
          'Izin: `report_card:read`; modul `grades`. Hanya pemegang `report_card:manage`/`report_card:read_all` atau wali ' +
          'kelas siswa itu (selain itu 403). Mengembalikan status jendela tanggapan, wali yang terhubung ke siswa, dan semua ' +
          'tanggapan siswa itu pada semester itu (`outdated` true bila rapor sudah difinalkan ulang sesudah tanggapan ditulis). ' +
          'Wali lain tidak pernah melihat tanggapan wali yang berbeda. 404 `not_found` bila siswa tidak terdaftar di kelas.',
        headers: schoolHeader,
        querystring: z.object({ semesterId: z.uuid(), studentId: z.uuid() }),
        response: {
          200: responseWindowSchema.extend({
            guardians: z.array(z.object({ id: z.uuid(), name: z.string(), relation: z.string() })),
            responses: z.array(reportGuardianResponseSchema),
          }),
          400: errorSchema,
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { semesterId, studentId } = request.query;
      return tenant(request, async (tx) => {
        const { cls } = await locate(tx, semesterId, studentId);
        if (!(await canViewClass(tx, ctx, cls.homeroomTeacherId))) throw notAllowed();
        return {
          ...(await responseWindow(tx, semesterId, studentId)),
          guardians: await guardiansOf(tx, studentId),
          responses: await loadResponses(tx, semesterId, studentId),
        };
      });
    },
  );

  app.put(
    '/v1/report-cards/responses',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Salin tanggapan wali dari rapor kertas',
        description:
          'Izin: `report_card:read`, dan pemegang `report_card:manage` atau wali kelas siswa itu (selain itu 403). Staf ' +
          'menyalin tanggapan yang ditulis wali di rapor kertas atas nama wali itu (`recordedByKind` staff). Teks polos 1-1.000 ' +
          'karakter. Hanya untuk rapor FINAL (409 `report_not_final`) dan selama jendela tanggapan (409 `response_closed`). ' +
          'Wali harus terhubung ke siswa itu (400 `invalid_reference`). 409 `guardian_response_exists` bila wali itu sudah menulis ' +
          'tanggapannya sendiri lewat portal (staf tidak menimpanya). Tidak menyentuh snapshot dan tidak dijaga `report_final`.',
        headers: schoolHeader,
        body: z.object({
          semesterId: z.uuid(),
          studentId: z.uuid(),
          guardianId: z.uuid(),
          text: z.string().trim().min(1).max(RESPONSE_TEXT_MAX),
        }),
        response: {
          200: reportGuardianResponseSchema,
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { semesterId, studentId, guardianId, text } = request.body;
      return tenant(request, async (tx) => {
        const { cls } = await locate(tx, semesterId, studentId);
        if (!(await canWriteClass(tx, ctx, cls.homeroomTeacherId))) throw notAllowed();
        if (!(await isGuardianOf(tx, studentId, guardianId))) {
          throw new HttpError(400, 'invalid_reference', 'Wali itu tidak terhubung dengan siswa ini.');
        }
        const view = await saveResponse(tx, ctx, { semesterId, studentId, guardianId, text, kind: 'staff' });
        await audit(tx, ctx, 'report_card.response', 'report_card', studentId, {
          semesterId,
          guardianId,
          kind: 'staff',
        });
        return view;
      });
    },
  );
}
