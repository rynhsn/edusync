import { hasClassToken, participantFormatError, renderParticipantNo } from '@edusync/contracts';
import {
  and,
  asc,
  classRoom,
  count,
  enrollment,
  eq,
  examParticipantNumber,
  examType,
  inArray,
  or,
  semester,
  type Tx,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { ensureParticipantNumbers, numberingOf } from '../participant-number';
import { audit, guarded, schoolHeader } from './helpers';

const tag = ['Exams'];
const readGate = [requirePermission('exam:read'), requireModule('exams')];
const manageGate = [requirePermission('exam:manage'), requireModule('exams')];

const scopeQuery = z.object({ semesterId: z.uuid(), examTypeId: z.uuid() });
const invalidRef = (what: string) => new HttpError(400, 'invalid_reference', `${what} tidak ditemukan.`);

const formatView = z.object({
  examTypeId: z.uuid(),
  format: z.string().nullable().describe('Kosong = bawaan `{jenis}-{yy}-{urut:3}`'),
  seqScope: z.enum(['class', 'school']),
  seqStart: z.number().int(),
  effectiveFormat: z.string(),
  effectiveScope: z.enum(['class', 'school']),
  example: z.string().describe('Contoh nomor dari format efektif'),
});

type TypeRow = typeof examType.$inferSelect;
const viewOf = (t: TypeRow) => {
  const n = numberingOf(t);
  return {
    examTypeId: t.id,
    format: t.participantNoFormat,
    seqScope: t.participantNoSeqScope,
    seqStart: t.participantNoSeqStart,
    effectiveFormat: n.format,
    effectiveScope: n.scope,
    example: renderParticipantNo(n.format, {
      typeShort: t.shortName,
      academicYearStart: `${new Date().getFullYear()}-07-01`,
      className: '7A',
      seq: n.start,
    }),
  };
};

/** Nomor peserta ujian permanen: format per jenis ujian, ringkasan, dan pengaturan ulang (modul `exams`). */
export async function examParticipantNumberRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  async function scopeOrThrow(tx: Tx, semesterId: string, examTypeId: string) {
    const [s] = await tx
      .select({ yearId: semester.academicYearId })
      .from(semester)
      .where(eq(semester.id, semesterId));
    if (!s) throw invalidRef('Semester');
    const [t] = await tx.select().from(examType).where(eq(examType.id, examTypeId));
    if (!t) throw invalidRef('Jenis ujian');
    return { yearId: s.yearId, type: t };
  }

  app.get(
    '/v1/exams/participant-numbers/summary',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Jumlah nomor peserta yang sudah ditetapkan',
        description:
          'Izin: `exam:read`; modul `exams`. Jumlah nomor peserta permanen pada semester dan jenis ujian itu ' +
          '(dasar peringatan saat format diubah). Semester atau jenis ujian bukan milik sekolah: 400 `invalid_reference`.',
        headers: schoolHeader,
        querystring: scopeQuery,
        response: { 200: z.object({ count: z.number().int() }), 400: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const { semesterId, examTypeId } = request.query;
        await scopeOrThrow(tx, semesterId, examTypeId);
        const [r] = await tx
          .select({ n: count() })
          .from(examParticipantNumber)
          .where(
            and(
              eq(examParticipantNumber.semesterId, semesterId),
              eq(examParticipantNumber.examTypeId, examTypeId),
            ),
          );
        return { count: r?.n ?? 0 };
      }),
  );

  app.put(
    '/v1/exams/participant-numbers/format',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Atur format nomor peserta satu jenis ujian',
        description:
          'Izin: `exam:manage`; modul `exams`. Token: `{jenis}` singkatan jenis ujian, `{yy}` / `{yyyy}` tahun mulai tahun ajaran, ' +
          '`{kelas}` nama kelas, `{urut}` / `{urut:N}` nomor urut (N 1 sampai 9 = lebar digit dengan nol di depan). Wajib memuat `{urut}`, ' +
          'maks. 40 karakter, tanpa karakter kontrol; token lain: 400 `invalid_format`. `format` null = bawaan `{jenis}-{yy}-{urut:3}` ' +
          '(urutan se-sekolah). `seqScope` `class` (urutan per kelas) mewajibkan `{kelas}` pada format supaya nomor tetap unik. ' +
          '**Hanya untuk penetapan baru**: nomor yang sudah ada tidak berubah (gunakan `POST /v1/exams/participant-numbers/reset`). ' +
          'Jenis ujian tidak ditemukan: 404 `not_found`.',
        headers: schoolHeader,
        body: z.object({
          examTypeId: z.uuid(),
          format: z.string().nullable(),
          seqScope: z.enum(['class', 'school']).default('class'),
          seqStart: z.number().int().min(1).max(999_999).default(1),
        }),
        response: { 200: formatView, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { examTypeId, seqScope, seqStart } = request.body;
      const format = request.body.format?.length ? request.body.format : null;
      if (format) {
        const bad = participantFormatError(format);
        if (bad) throw new HttpError(400, 'invalid_format', bad);
        if (seqScope === 'class' && !hasClassToken(format))
          throw new HttpError(
            400,
            'invalid_format',
            'Urutan per kelas mewajibkan token {kelas} pada format, atau pilih urutan se-sekolah.',
          );
      }
      return tenant(request, async (tx) => {
        const [t] = await tx
          .update(examType)
          .set({
            participantNoFormat: format,
            participantNoSeqScope: seqScope,
            participantNoSeqStart: seqStart,
          })
          .where(eq(examType.id, examTypeId))
          .returning();
        if (!t) throw new HttpError(404, 'not_found', 'Jenis ujian tidak ditemukan.');
        await audit(tx, ctx, 'exam.participant_no_format', 'exam_type', t.id, { format, seqScope, seqStart });
        return viewOf(t);
      });
    },
  );

  app.post(
    '/v1/exams/participant-numbers/reset',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Atur ulang nomor peserta',
        description:
          'Izin: `exam:manage`; modul `exams`. Menghapus nomor peserta semester dan jenis ujian itu (opsional hanya satu ' +
          '`classId`: murid yang kini terdaftar di kelas itu atau bernomor atas kelas itu), lalu menetapkan ulang menurut format dan ' +
          'angka mulai sekarang. Dalam satu transaksi dan tercatat di audit. Hasil: `removed` dan `assigned` (jumlah murid bernomor ' +
          'setelahnya dalam cakupan). Rujukan tidak dikenal: 400 `invalid_reference`.',
        headers: schoolHeader,
        body: z.object({ semesterId: z.uuid(), examTypeId: z.uuid(), classId: z.uuid().optional() }),
        response: {
          200: z.object({ removed: z.number().int(), assigned: z.number().int() }),
          400: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { semesterId, examTypeId, classId } = request.body;
      return tenant(request, async (tx) => {
        const { yearId, type } = await scopeOrThrow(tx, semesterId, examTypeId);
        const inScope = and(
          eq(examParticipantNumber.semesterId, semesterId),
          eq(examParticipantNumber.examTypeId, examTypeId),
        );
        let classIds: string[];
        let where = inScope;
        if (classId) {
          const [c] = await tx
            .select({ id: classRoom.id })
            .from(classRoom)
            .where(and(eq(classRoom.id, classId), eq(classRoom.academicYearId, yearId)));
          if (!c) throw invalidRef('Kelas');
          classIds = [classId];
          where = and(
            inScope,
            or(
              eq(examParticipantNumber.classId, classId),
              inArray(
                examParticipantNumber.studentId,
                tx
                  .select({ id: enrollment.studentId })
                  .from(enrollment)
                  .where(and(eq(enrollment.classId, classId), eq(enrollment.academicYearId, yearId))),
              ),
            ),
          );
        } else {
          classIds = (
            await tx
              .select({ id: classRoom.id })
              .from(classRoom)
              .where(eq(classRoom.academicYearId, yearId))
              .orderBy(asc(classRoom.name))
          ).map((c) => c.id);
        }
        const gone = await tx
          .delete(examParticipantNumber)
          .where(where)
          .returning({ id: examParticipantNumber.id });
        const numbers = await ensureParticipantNumbers(tx, {
          schoolId: ctx.schoolId,
          semesterId,
          type,
          classIds,
        });
        await audit(tx, ctx, 'exam.participant_no_reset', 'exam_type', examTypeId, {
          semesterId,
          classId: classId ?? null,
          removed: gone.length,
          assigned: numbers.size,
        });
        return { removed: gone.length, assigned: numbers.size };
      });
    },
  );
}
