import {
  and,
  asc,
  classRoom,
  desc,
  enrollment,
  entitlement,
  eq,
  gt,
  pklAspect,
  pklJournal,
  pklPartner,
  pklPeriod,
  pklPlacement,
  pklScore,
  school,
  student,
  type Tx,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { todayInJakarta } from '../attendance-lib';
import { errorSchema, HttpError } from '../http-error';
import { assertJournalDate, hashAccessToken, linkCanWrite, saveScores, scoreRecordsBody } from '../pkl-lib';
import { journalBody } from './pkl';

const tags = ['PKL (publik)'];
const tokenParams = z.object({ token: z.string().trim().min(1).max(200) });
const VISIBLE = ['planned', 'active', 'completed'];

/** Semua kegagalan tautan (salah, dicabut, sekolah/modul tidak aktif, penempatan batal) dijawab seragam. */
const notFound = () => new HttpError(404, 'not_found', 'Tautan tidak ditemukan atau sudah tidak berlaku.');
const readOnly = () =>
  new HttpError(403, 'link_read_only', 'Tautan ini sudah tidak bisa dipakai untuk mengisi data.');

/**
 * Cari penempatan dari token lewat hash (pool platform, melewati RLS), lalu pastikan sekolah aktif dan punya modul
 * `internship`. Setelah itu seluruh kerja memakai transaksi tenant dengan school_id yang ditemukan.
 */
async function resolve(app: FastifyInstance, token: string) {
  const [row] = await app.platformDb
    .select({
      id: pklPlacement.id,
      schoolId: pklPlacement.schoolId,
      status: pklPlacement.status,
      schoolName: school.name,
      schoolStatus: school.status,
    })
    .from(pklPlacement)
    .innerJoin(school, eq(school.id, pklPlacement.schoolId))
    .where(eq(pklPlacement.accessTokenHash, hashAccessToken(token)));
  if (!row || row.schoolStatus !== 'active' || !VISIBLE.includes(row.status)) throw notFound();
  const modules = await withTenant(app.tenantDb, [row.schoolId], (tx) =>
    tx
      .select({ key: entitlement.moduleKey })
      .from(entitlement)
      .where(and(eq(entitlement.moduleKey, 'internship'), gt(entitlement.validUntil, new Date()))),
  );
  if (modules.length === 0) throw notFound();
  return row;
}

/** Penempatan beserta periode, untuk aturan tulis. */
async function loadContext(tx: Tx, placementId: string) {
  const [r] = await tx
    .select({ p: pklPlacement, period: pklPeriod })
    .from(pklPlacement)
    .innerJoin(pklPeriod, eq(pklPeriod.id, pklPlacement.periodId))
    .where(eq(pklPlacement.id, placementId));
  if (!r) throw notFound();
  return r;
}

/** Pembimbing industri mengisi jurnal dan nilai lewat tautan terbatas (token di path), tanpa login. Modul `internship`. */
export async function pklPublicRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const server = instance;

  app.get(
    '/v1/public/pkl/:token',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        tags,
        summary: 'Tampilan tautan pembimbing industri (publik)',
        description:
          'Tanpa login; token ada di path. Memuat sekolah, siswa, mitra, periode, 30 jurnal terakhir, aspek beserta ' +
          'nilai dari industri, dan `canWrite` (false bila periode sudah lewat lebih dari 14 hari atau penempatan ' +
          'dibatalkan). Token salah, dicabut, atau penempatan batal dijawab seragam 404 `not_found`. Dibatasi 60 ' +
          'permintaan per menit per IP.',
        params: tokenParams,
        response: {
          200: z.object({
            school: z.object({ name: z.string() }),
            student: z.object({ name: z.string(), className: z.string().nullable() }),
            partner: z.object({ name: z.string() }),
            period: z.object({ name: z.string(), startsOn: z.string(), endsOn: z.string() }),
            status: z.enum(['planned', 'active', 'completed']),
            journals: z.array(z.object({ date: z.string(), activity: z.string(), present: z.boolean() })),
            aspects: z.array(
              z.object({
                id: z.uuid(),
                name: z.string(),
                weight: z.number().int(),
                industry: z.object({ value: z.number().int(), note: z.string().nullable() }).nullable(),
              }),
            ),
            canWrite: z.boolean(),
          }),
          404: errorSchema,
          429: errorSchema,
        },
      },
    },
    async (request) => {
      const r = await resolve(server, request.params.token);
      return withTenant(server.tenantDb, [r.schoolId], async (tx) => {
        const { p, period } = await loadContext(tx, r.id);
        const [info] = await tx
          .select({ studentName: student.name, className: classRoom.name, partnerName: pklPartner.name })
          .from(pklPlacement)
          .innerJoin(student, eq(student.id, pklPlacement.studentId))
          .innerJoin(pklPartner, eq(pklPartner.id, pklPlacement.partnerId))
          .leftJoin(
            enrollment,
            and(eq(enrollment.studentId, student.id), eq(enrollment.academicYearId, period.academicYearId)),
          )
          .leftJoin(classRoom, eq(classRoom.id, enrollment.classId))
          .where(eq(pklPlacement.id, p.id));
        const journals = await tx
          .select({ date: pklJournal.date, activity: pklJournal.activity, present: pklJournal.present })
          .from(pklJournal)
          .where(eq(pklJournal.placementId, p.id))
          .orderBy(desc(pklJournal.date))
          .limit(30);
        const aspects = await tx.select().from(pklAspect).orderBy(asc(pklAspect.sort), asc(pklAspect.name));
        const scores = await tx
          .select()
          .from(pklScore)
          .where(and(eq(pklScore.placementId, p.id), eq(pklScore.assessor, 'industry')));
        return {
          school: { name: r.schoolName },
          student: { name: info?.studentName ?? '', className: info?.className ?? null },
          partner: { name: info?.partnerName ?? '' },
          period: { name: period.name, startsOn: period.startsOn, endsOn: period.endsOn },
          status: p.status as 'planned' | 'active' | 'completed',
          journals,
          aspects: aspects.map((a) => {
            const s = scores.find((x) => x.aspectId === a.id);
            return {
              id: a.id,
              name: a.name,
              weight: a.weight,
              industry: s ? { value: s.value, note: s.note } : null,
            };
          }),
          canWrite: linkCanWrite(period.endsOn, p.status, todayInJakarta()),
        };
      });
    },
  );

  app.post(
    '/v1/public/pkl/:token/journal',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags,
        summary: 'Isi jurnal lewat tautan (publik)',
        description:
          'Tanpa login. Satu entri per hari (tanggal sama menimpa). Tanggal tidak boleh di masa depan ' +
          '(400 `date_in_future`) dan harus dalam periode ± 7 hari (400 `date_out_of_period`). 403 `link_read_only` ' +
          'bila periode sudah lewat lebih dari 14 hari. Token tak dikenal: 404 `not_found`.',
        params: tokenParams,
        body: journalBody,
        response: {
          200: z.object({ ok: z.literal(true) }),
          400: errorSchema,
          403: errorSchema,
          404: errorSchema,
          429: errorSchema,
        },
      },
    },
    async (request) => {
      const b = request.body;
      const r = await resolve(server, request.params.token);
      return withTenant(server.tenantDb, [r.schoolId], async (tx) => {
        const { p, period } = await loadContext(tx, r.id);
        const today = todayInJakarta();
        if (!linkCanWrite(period.endsOn, p.status, today)) throw readOnly();
        assertJournalDate(b.date, period, today);
        await tx
          .insert(pklJournal)
          .values({
            schoolId: r.schoolId,
            placementId: p.id,
            date: b.date,
            activity: b.activity,
            present: b.present,
            source: 'industry',
            recordedBy: p.industrySupervisorName,
          })
          .onConflictDoUpdate({
            target: [pklJournal.placementId, pklJournal.date],
            set: {
              activity: b.activity,
              present: b.present,
              source: 'industry',
              recordedBy: p.industrySupervisorName,
            },
          });
        return { ok: true as const };
      });
    },
  );

  app.put(
    '/v1/public/pkl/:token/scores',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags,
        summary: 'Isi nilai industri lewat tautan (publik)',
        description:
          'Tanpa login. Menyimpan nilai penilai `industry` (upsert per aspek), nilai 0..100 bulat. 403 ' +
          '`link_read_only` bila periode sudah lewat lebih dari 14 hari. Token tak dikenal: 404 `not_found`.',
        params: tokenParams,
        body: scoreRecordsBody,
        response: {
          200: z.object({ ok: z.literal(true) }),
          400: errorSchema,
          403: errorSchema,
          404: errorSchema,
          429: errorSchema,
        },
      },
    },
    async (request) => {
      const r = await resolve(server, request.params.token);
      return withTenant(server.tenantDb, [r.schoolId], async (tx) => {
        const { p, period } = await loadContext(tx, r.id);
        if (!linkCanWrite(period.endsOn, p.status, todayInJakarta())) throw readOnly();
        await saveScores(tx, r.schoolId, p.id, 'industry', request.body.records);
        return { ok: true as const };
      });
    },
  );
}
