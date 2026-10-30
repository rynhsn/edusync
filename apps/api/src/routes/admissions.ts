import { ADMISSION_STATUSES, type AdmissionStatus } from '@edusync/contracts';
import {
  academicYear,
  admissionPeriod,
  and,
  application,
  applicationDocument,
  applicationStatusLog,
  asc,
  count,
  desc,
  eq,
  gte,
  guardian,
  ilike,
  inArray,
  or,
  program,
  sql,
  student,
  studentGuardian,
  type Tx,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { statusEnum, transitionApplication, usedQuota } from '../admissions-lib';
import { jakarta } from '../gate';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { normalizePhone } from './guardians';
import { audit, conflictAs409, guarded, idParams, isForeignKeyViolation, ok, schoolHeader } from './helpers';
import { placeStudent } from './people';

const tags = ['Admissions'];
const read = [requirePermission('admission:read'), requireModule('admissions')];
const manage = [requirePermission('admission:manage'), requireModule('admissions')];

const notFound = (what: string) => new HttpError(404, 'not_found', `${what} tidak ditemukan.`);

const periodBody = z
  .object({
    academicYearId: z.uuid(),
    name: z.string().trim().min(1).max(120),
    level: z.string().trim().min(1).max(30).describe('Tingkat kelas yang dibuka, mis. "7" atau "X"'),
    opensOn: z.iso.date(),
    closesOn: z.iso.date(),
    quota: z.number().int().min(1).max(100_000).nullable().default(null).describe('Kosong = tanpa batas'),
    active: z.boolean().default(true),
  })
  .refine((v) => v.opensOn <= v.closesOn, {
    message: 'Tanggal buka tidak boleh setelah tanggal tutup.',
    path: ['closesOn'],
  });

const periodSchema = z.object({
  id: z.uuid(),
  academicYearId: z.uuid(),
  academicYearName: z.string(),
  name: z.string(),
  level: z.string(),
  opensOn: z.iso.date(),
  closesOn: z.iso.date(),
  quota: z.number().int().nullable(),
  active: z.boolean(),
  open: z.boolean().describe('Aktif dan hari ini (WIB) berada dalam rentang buka-tutup'),
  applicationCount: z.number().int(),
  quotaUsed: z.number().int().describe('Pendaftar berstatus diterima atau sudah daftar ulang'),
});

const statusCounts = z.object({
  submitted: z.number().int(),
  verified: z.number().int(),
  accepted: z.number().int(),
  rejected: z.number().int(),
  enrolled: z.number().int(),
  withdrawn: z.number().int(),
});

const listItem = z.object({
  id: z.uuid(),
  regNumber: z.string(),
  fullName: z.string(),
  gender: z.enum(['L', 'P']),
  birthDate: z.iso.date(),
  previousSchool: z.string().nullable(),
  guardianName: z.string(),
  guardianPhone: z.string(),
  status: statusEnum,
  createdAt: z.string(),
  documentCount: z.number().int(),
  programName: z.string().nullable(),
});

const docMeta = z.object({
  id: z.uuid(),
  kind: z.enum(['family_card', 'birth_certificate', 'diploma', 'photo', 'other']),
  fileName: z.string(),
  mime: z.string(),
  size: z.number().int(),
  createdAt: z.string(),
});

const detailSchema = listItem.extend({
  periodId: z.uuid(),
  periodName: z.string(),
  birthPlace: z.string().nullable(),
  nisn: z.string().nullable(),
  address: z.string().nullable(),
  programId: z.uuid().nullable(),
  guardianEmail: z.string().nullable(),
  decisionNote: z.string().nullable(),
  studentId: z.uuid().nullable(),
  documents: z.array(docMeta),
  log: z.array(
    z.object({
      id: z.uuid(),
      fromStatus: z.string().nullable(),
      toStatus: z.string(),
      note: z.string().nullable(),
      actor: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
});

const emptyCounts = () =>
  Object.fromEntries(ADMISSION_STATUSES.map((s) => [s, 0])) as Record<AdmissionStatus, number>;

const docCountSql = sql<number>`(select count(*)::int from application_document d where d.application_id = ${application.id})`;

/** Satu pendaftar dengan data lengkap (tanpa data dokumen) atau 404. */
async function applicationDetail(tx: Tx, id: string) {
  const [a] = await tx
    .select({
      a: application,
      periodName: admissionPeriod.name,
      programName: program.name,
      docs: docCountSql,
    })
    .from(application)
    .innerJoin(admissionPeriod, eq(admissionPeriod.id, application.periodId))
    .leftJoin(program, eq(program.id, application.programId))
    .where(eq(application.id, id));
  if (!a) throw notFound('Pendaftar');
  const documents = await tx
    .select({
      id: applicationDocument.id,
      kind: applicationDocument.kind,
      fileName: applicationDocument.fileName,
      mime: applicationDocument.mime,
      size: applicationDocument.size,
      createdAt: applicationDocument.createdAt,
    })
    .from(applicationDocument)
    .where(eq(applicationDocument.applicationId, id))
    .orderBy(asc(applicationDocument.createdAt));
  const log = await tx
    .select()
    .from(applicationStatusLog)
    .where(eq(applicationStatusLog.applicationId, id))
    .orderBy(asc(applicationStatusLog.createdAt));
  const r = a.a;
  return {
    id: r.id,
    regNumber: r.regNumber,
    fullName: r.fullName,
    gender: r.gender,
    birthDate: r.birthDate,
    previousSchool: r.previousSchool,
    guardianName: r.guardianName,
    guardianPhone: r.guardianPhone,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    documentCount: a.docs,
    programName: a.programName,
    periodId: r.periodId,
    periodName: a.periodName,
    birthPlace: r.birthPlace,
    nisn: r.nisn,
    address: r.address,
    programId: r.programId,
    guardianEmail: r.guardianEmail,
    decisionNote: r.decisionNote,
    studentId: r.studentId,
    documents: documents.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
    log: log.map((l) => ({
      id: l.id,
      fromStatus: l.fromStatus,
      toStatus: l.toStatus,
      note: l.note,
      actor: l.actor,
      createdAt: l.createdAt.toISOString(),
    })),
  };
}

const FAILURE_STATUS = {
  not_found: [404, 'Pendaftar tidak ditemukan.'],
  invalid_transition: [409, 'Peralihan status itu tidak diperbolehkan.'],
  use_enroll: [409, 'Daftar ulang dilakukan lewat endpoint enroll.'],
  quota_full: [409, 'Kuota periode ini sudah penuh.'],
} as const;

/** SPMB: periode, pendaftar, verifikasi, keputusan, daftar ulang, dan statistik (modul `admissions`). */
export async function admissionRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(
    request: { ctx?: TenantContext; server: FastifyInstance },
    fn: (tx: Tx) => Promise<T>,
  ) => {
    const ctx = request.ctx as TenantContext;
    return withTenant(request.server.tenantDb, [ctx.schoolId], fn);
  };

  /* ---------- Periode ---------- */

  async function periodRows(tx: Tx, id?: string) {
    const today = jakarta(new Date()).date;
    const rows = await tx
      .select({ p: admissionPeriod, yearName: academicYear.name })
      .from(admissionPeriod)
      .innerJoin(academicYear, eq(academicYear.id, admissionPeriod.academicYearId))
      .where(id ? eq(admissionPeriod.id, id) : undefined)
      .orderBy(desc(admissionPeriod.opensOn), asc(admissionPeriod.name));
    const totals = await tx
      .select({ periodId: application.periodId, n: count() })
      .from(application)
      .groupBy(application.periodId);
    const used = await tx
      .select({ periodId: application.periodId, n: count() })
      .from(application)
      .where(inArray(application.status, ['accepted', 'enrolled']))
      .groupBy(application.periodId);
    return rows.map(({ p, yearName }) => ({
      id: p.id,
      academicYearId: p.academicYearId,
      academicYearName: yearName,
      name: p.name,
      level: p.level,
      opensOn: p.opensOn,
      closesOn: p.closesOn,
      quota: p.quota,
      active: p.active,
      open: p.active && p.opensOn <= today && today <= p.closesOn,
      applicationCount: totals.find((t) => t.periodId === p.id)?.n ?? 0,
      quotaUsed: used.find((t) => t.periodId === p.id)?.n ?? 0,
    }));
  }

  async function requireYear(tx: Tx, academicYearId: string) {
    const [y] = await tx
      .select({ id: academicYear.id })
      .from(academicYear)
      .where(eq(academicYear.id, academicYearId));
    if (!y) throw new HttpError(400, 'invalid_reference', 'Tahun ajaran tidak ditemukan.');
  }

  app.get(
    '/v1/admissions/periods',
    {
      onRequest: read,
      schema: {
        tags,
        summary: 'Daftar periode SPMB',
        description:
          'Izin: `admission:read`; modul `admissions`. Dilengkapi jumlah pendaftar, kuota terpakai (diterima + sudah ' +
          'daftar ulang), dan penanda `open` (aktif dan hari ini WIB dalam rentang buka-tutup).',
        headers: schoolHeader,
        response: { 200: z.array(periodSchema), ...guarded },
      },
    },
    async (request) => tenant(request, (tx) => periodRows(tx)),
  );

  app.post(
    '/v1/admissions/periods',
    {
      onRequest: manage,
      schema: {
        tags,
        summary: 'Buat periode SPMB',
        description:
          'Izin: `admission:manage`; modul `admissions`. `opensOn` harus ≤ `closesOn`; tahun ajaran harus milik ' +
          'sekolah (400 `invalid_reference`); nama unik per sekolah (409 `conflict`).',
        headers: schoolHeader,
        body: periodBody,
        response: { 201: periodSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const row = await conflictAs409('Nama periode itu sudah dipakai.', () =>
        tenant(request, async (tx) => {
          await requireYear(tx, request.body.academicYearId);
          const [p] = await tx
            .insert(admissionPeriod)
            .values({ schoolId: ctx.schoolId, ...request.body })
            .returning({ id: admissionPeriod.id });
          await audit(tx, ctx, 'admission.period.create', 'admission_period', p!.id, {
            name: request.body.name,
          });
          return (await periodRows(tx, p!.id))[0]!;
        }),
      );
      return reply.code(201).send(row);
    },
  );

  app.put(
    '/v1/admissions/periods/:id',
    {
      onRequest: manage,
      schema: {
        tags,
        summary: 'Ubah periode SPMB',
        description: 'Izin: `admission:manage`; modul `admissions`. Aturan validasi sama dengan pembuatan.',
        headers: schoolHeader,
        params: idParams,
        body: periodBody,
        response: { 200: periodSchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return conflictAs409('Nama periode itu sudah dipakai.', () =>
        tenant(request, async (tx) => {
          await requireYear(tx, request.body.academicYearId);
          const rows = await tx
            .update(admissionPeriod)
            .set(request.body)
            .where(eq(admissionPeriod.id, request.params.id))
            .returning({ id: admissionPeriod.id });
          if (rows.length === 0) throw notFound('Periode');
          await audit(tx, ctx, 'admission.period.update', 'admission_period', request.params.id, {
            name: request.body.name,
          });
          return (await periodRows(tx, request.params.id))[0]!;
        }),
      );
    },
  );

  app.delete(
    '/v1/admissions/periods/:id',
    {
      onRequest: manage,
      schema: {
        tags,
        summary: 'Hapus periode SPMB',
        description:
          'Izin: `admission:manage`; modul `admissions`. Ditolak (409 `in_use`) bila sudah ada pendaftar; tutup ' +
          'periode dengan menonaktifkannya.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      try {
        await tenant(request, async (tx) => {
          const [used] = await tx
            .select({ n: count() })
            .from(application)
            .where(eq(application.periodId, request.params.id));
          if ((used?.n ?? 0) > 0) {
            throw new HttpError(409, 'in_use', 'Periode sudah punya pendaftar. Nonaktifkan saja.');
          }
          const rows = await tx
            .delete(admissionPeriod)
            .where(eq(admissionPeriod.id, request.params.id))
            .returning({ id: admissionPeriod.id });
          if (rows.length === 0) throw notFound('Periode');
          await audit(tx, ctx, 'admission.period.delete', 'admission_period', request.params.id);
        });
      } catch (error) {
        if (isForeignKeyViolation(error)) {
          throw new HttpError(409, 'in_use', 'Periode sudah punya pendaftar. Nonaktifkan saja.');
        }
        throw error;
      }
      return { ok: true as const };
    },
  );

  /* ---------- Pendaftar ---------- */

  app.get(
    '/v1/admissions/applications',
    {
      onRequest: read,
      schema: {
        tags,
        summary: 'Daftar pendaftar',
        description:
          'Izin: `admission:read`; modul `admissions`. `q` mencari nama, nomor pendaftaran, atau nama wali. ' +
          '`counts` menghitung per status pada saringan `periodId` dan `q` (tanpa saringan `status`). ' +
          'Data dokumen tidak disertakan; hanya `documentCount`.',
        headers: schoolHeader,
        querystring: z.object({
          periodId: z.uuid().optional(),
          status: statusEnum.optional(),
          q: z.string().trim().max(80).optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        }),
        response: {
          200: z.object({ items: z.array(listItem), total: z.number().int(), counts: statusCounts }),
          ...guarded,
        },
      },
    },
    async (request) => {
      const { periodId, status, q, limit, offset } = request.query;
      return tenant(request, async (tx) => {
        const base = and(
          periodId ? eq(application.periodId, periodId) : undefined,
          q
            ? or(
                ilike(application.fullName, `%${q}%`),
                ilike(application.regNumber, `%${q}%`),
                ilike(application.guardianName, `%${q}%`),
              )
            : undefined,
        );
        const where = and(base, status ? eq(application.status, status) : undefined);
        const [total] = await tx.select({ n: count() }).from(application).where(where);
        const rows = await tx
          .select({ a: application, programName: program.name, docs: docCountSql })
          .from(application)
          .leftJoin(program, eq(program.id, application.programId))
          .where(where)
          .orderBy(desc(application.createdAt), desc(application.regNumber))
          .limit(limit)
          .offset(offset);
        const grouped = await tx
          .select({ status: application.status, n: count() })
          .from(application)
          .where(base)
          .groupBy(application.status);
        const counts = emptyCounts();
        for (const g of grouped) counts[g.status] = g.n;
        return {
          total: total?.n ?? 0,
          counts,
          items: rows.map(({ a, programName, docs }) => ({
            id: a.id,
            regNumber: a.regNumber,
            fullName: a.fullName,
            gender: a.gender,
            birthDate: a.birthDate,
            previousSchool: a.previousSchool,
            guardianName: a.guardianName,
            guardianPhone: a.guardianPhone,
            status: a.status,
            createdAt: a.createdAt.toISOString(),
            documentCount: docs,
            programName,
          })),
        };
      });
    },
  );

  app.get(
    '/v1/admissions/applications/:id',
    {
      onRequest: read,
      schema: {
        tags,
        summary: 'Detail pendaftar',
        description:
          'Izin: `admission:read`; modul `admissions`. Memuat metadata dokumen (tanpa isi berkas; ambil lewat ' +
          '`/documents/{docId}`) dan riwayat status.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: detailSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => tenant(request, (tx) => applicationDetail(tx, request.params.id)),
  );

  app.get(
    '/v1/admissions/applications/:id/documents/:docId',
    {
      onRequest: read,
      schema: {
        tags,
        summary: 'Unduh dokumen pendaftar',
        description:
          'Izin: `admission:read`; modul `admissions`. Isi berkas base64 beserta jenis (mime) yang ditentukan server.',
        headers: schoolHeader,
        params: z.object({ id: z.uuid(), docId: z.uuid() }),
        response: {
          200: z.object({
            fileName: z.string(),
            mime: z.string(),
            size: z.number().int(),
            dataBase64: z.string(),
          }),
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const [d] = await tx
          .select({
            fileName: applicationDocument.fileName,
            mime: applicationDocument.mime,
            size: applicationDocument.size,
            dataBase64: applicationDocument.dataBase64,
          })
          .from(applicationDocument)
          .where(
            and(
              eq(applicationDocument.id, request.params.docId),
              eq(applicationDocument.applicationId, request.params.id),
            ),
          );
        if (!d) throw notFound('Dokumen');
        return d;
      }),
  );

  const statusBody = z.object({
    to: statusEnum,
    note: z
      .string()
      .trim()
      .max(500)
      .nullish()
      .transform((v) => (v ? v : null)),
  });

  app.post(
    '/v1/admissions/applications/:id/status',
    {
      onRequest: manage,
      schema: {
        tags,
        summary: 'Ubah status pendaftar',
        description:
          'Izin: `admission:manage`; modul `admissions`. Hanya peralihan sah (`canTransition`): 409 ' +
          '`invalid_transition` bila tidak sah. `accepted` memeriksa kuota periode (409 `quota_full`). ' +
          '`enrolled` tidak bisa lewat sini (409 `use_enroll`): pakai `/enroll`. `note` pada `accepted`/`rejected` ' +
          'menjadi catatan keputusan yang terlihat pendaftar.',
        headers: schoolHeader,
        params: idParams,
        body: statusBody,
        response: { 200: detailSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const result = await transitionApplication(
          tx,
          ctx,
          request.params.id,
          request.body.to,
          request.body.note,
        );
        if ('failure' in result) {
          const [status, message] = FAILURE_STATUS[result.failure];
          throw new HttpError(status, result.failure, message);
        }
        await audit(tx, ctx, 'admission.application.status', 'application', request.params.id, {
          from: result.from,
          to: request.body.to,
        });
        return applicationDetail(tx, request.params.id);
      });
    },
  );

  app.post(
    '/v1/admissions/applications/bulk-status',
    {
      onRequest: manage,
      schema: {
        tags,
        summary: 'Ubah status banyak pendaftar',
        description:
          'Izin: `admission:manage`; modul `admissions`. Maks. 200 id. Tiap pendaftar diproses sendiri-sendiri: yang ' +
          'gagal (tidak ditemukan, peralihan tidak sah, kuota penuh) dilaporkan di `results` tanpa membatalkan yang ' +
          'lain. Penerimaan (`accepted`) diproses berurutan sehingga kuota tidak terlampaui. `enrolled` ditolak.',
        headers: schoolHeader,
        body: z.object({
          ids: z.array(z.uuid()).min(1).max(200),
          to: statusEnum,
          note: statusBody.shape.note,
        }),
        response: {
          200: z.object({
            updated: z.number().int(),
            failed: z.number().int(),
            results: z.array(
              z.object({
                id: z.uuid(),
                ok: z.boolean(),
                code: z.enum(['not_found', 'invalid_transition', 'use_enroll', 'quota_full']).nullable(),
              }),
            ),
          }),
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { to, note } = request.body;
      const ids = [...new Set(request.body.ids)];
      return tenant(request, async (tx) => {
        const results: {
          id: string;
          ok: boolean;
          code: 'not_found' | 'invalid_transition' | 'use_enroll' | 'quota_full' | null;
        }[] = [];
        for (const id of ids) {
          const r = await transitionApplication(tx, ctx, id, to, note);
          results.push('failure' in r ? { id, ok: false, code: r.failure } : { id, ok: true, code: null });
        }
        const updated = results.filter((r) => r.ok).length;
        await audit(tx, ctx, 'admission.application.bulk_status', 'application', ids[0] as string, {
          to,
          requested: ids.length,
          updated,
        });
        return { updated, failed: results.length - updated, results };
      });
    },
  );

  app.post(
    '/v1/admissions/applications/:id/enroll',
    {
      onRequest: manage,
      schema: {
        tags,
        summary: 'Daftar ulang: jadikan pendaftar siswa',
        description:
          'Izin: `admission:manage`; modul `admissions`. Body wajib (boleh `{}`). Hanya dari status `accepted` (409 `invalid_transition`). ' +
          'Dalam SATU transaksi: membuat siswa (NISN bentrok: 409 `nisn_taken`), wali + tautan wali utama, ' +
          'menempatkan di kelas `classId` bila diberikan (400 `invalid_reference` bila kelas tidak ada), mengubah ' +
          'status menjadi `enrolled`, dan mengisi `studentId`. Gagal di tengah = tidak ada yang tersimpan.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({ classId: z.uuid().nullish() }),
        response: {
          200: z.object({
            applicationId: z.uuid(),
            studentId: z.uuid(),
            guardianId: z.uuid(),
            classId: z.uuid().nullable(),
            status: z.literal('enrolled'),
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
      const classId = request.body.classId ?? null;
      try {
        return await tenant(request, async (tx) => {
          const [a] = await tx
            .select()
            .from(application)
            .where(eq(application.id, request.params.id))
            .for('update');
          if (!a) throw notFound('Pendaftar');
          if (a.status !== 'accepted') {
            throw new HttpError(
              409,
              'invalid_transition',
              'Hanya pendaftar berstatus diterima yang bisa daftar ulang.',
            );
          }
          if (a.nisn) {
            const [taken] = await tx.select({ id: student.id }).from(student).where(eq(student.nisn, a.nisn));
            if (taken) throw new HttpError(409, 'nisn_taken', 'NISN pendaftar sudah dipakai siswa lain.');
          }
          const [s] = await tx
            .insert(student)
            .values({
              schoolId: ctx.schoolId,
              name: a.fullName,
              nisn: a.nisn,
              gender: a.gender,
              birthDate: a.birthDate,
            })
            .returning({ id: student.id });
          const [g] = await tx
            .insert(guardian)
            .values({
              schoolId: ctx.schoolId,
              name: a.guardianName,
              phone: normalizePhone(a.guardianPhone) ?? a.guardianPhone,
              email: a.guardianEmail,
            })
            .returning({ id: guardian.id });
          await tx.insert(studentGuardian).values({
            schoolId: ctx.schoolId,
            studentId: s!.id,
            guardianId: g!.id,
            relation: 'guardian',
            isPrimary: true,
          });
          if (classId) await placeStudent(tx, ctx, s!.id, classId);
          await tx
            .update(application)
            .set({ status: 'enrolled', studentId: s!.id })
            .where(eq(application.id, a.id));
          await tx.insert(applicationStatusLog).values({
            schoolId: ctx.schoolId,
            applicationId: a.id,
            fromStatus: 'accepted',
            toStatus: 'enrolled',
            note: null,
            actor: ctx.userId,
          });
          await audit(tx, ctx, 'admission.application.enroll', 'application', a.id, {
            studentId: s!.id,
            classId,
          });
          return {
            applicationId: a.id,
            studentId: s!.id,
            guardianId: g!.id,
            classId,
            status: 'enrolled' as const,
          };
        });
      } catch (error) {
        // Cadangan bila NISN bentrok lewat jalur balapan (unique constraint).
        const e = error as { code?: string; cause?: { code?: string } };
        if (e?.code === '23505' || e?.cause?.code === '23505') {
          throw new HttpError(409, 'nisn_taken', 'NISN pendaftar sudah dipakai siswa lain.');
        }
        throw error;
      }
    },
  );

  /* ---------- Statistik ---------- */

  app.get(
    '/v1/admissions/stats',
    {
      onRequest: read,
      schema: {
        tags,
        summary: 'Ringkasan statistik SPMB',
        description:
          'Izin: `admission:read`; modul `admissions`. Jumlah per status, pendaftar baru per hari (14 hari terakhir ' +
          'WIB, hari tanpa pendaftar bernilai 0), dan kuota (`total` null bila periode tanpa batas). Tanpa ' +
          '`periodId`, mencakup semua periode.',
        headers: schoolHeader,
        querystring: z.object({ periodId: z.uuid().optional() }),
        response: {
          200: z.object({
            total: z.number().int(),
            counts: statusCounts,
            perDay: z.array(z.object({ date: z.iso.date(), count: z.number().int() })),
            quota: z.object({ total: z.number().int().nullable(), used: z.number().int() }),
          }),
          ...guarded,
        },
      },
    },
    async (request) => {
      const { periodId } = request.query;
      return tenant(request, async (tx) => {
        const scope = periodId ? eq(application.periodId, periodId) : undefined;
        const grouped = await tx
          .select({ status: application.status, n: count() })
          .from(application)
          .where(scope)
          .groupBy(application.status);
        const counts = emptyCounts();
        for (const g of grouped) counts[g.status] = g.n;

        const day = sql<string>`to_char(${application.createdAt} at time zone 'Asia/Jakarta', 'YYYY-MM-DD')`;
        const since = new Date(Date.now() - 16 * 86_400_000);
        const daily = await tx
          .select({ day, n: count() })
          .from(application)
          .where(and(scope, gte(application.createdAt, since)))
          .groupBy(day);
        const [y, m, d] = jakarta(new Date()).date.split('-').map(Number) as [number, number, number];
        const perDay = Array.from({ length: 14 }, (_, i) => {
          const date = new Date(Date.UTC(y, m - 1, d - (13 - i))).toISOString().slice(0, 10);
          return { date, count: daily.find((r) => r.day === date)?.n ?? 0 };
        });

        const periods = await tx
          .select({ id: admissionPeriod.id, quota: admissionPeriod.quota })
          .from(admissionPeriod)
          .where(periodId ? eq(admissionPeriod.id, periodId) : eq(admissionPeriod.active, true));
        const quotas = periods.map((p) => p.quota);
        const quotaTotal =
          quotas.length > 0 && quotas.every((q): q is number => q !== null)
            ? quotas.reduce((a, b) => a + b, 0)
            : null;
        const used = periodId ? await usedQuota(tx, periodId) : counts.accepted + counts.enrolled;
        return {
          total: Object.values(counts).reduce((a, b) => a + b, 0),
          counts,
          perDay,
          quota: { total: quotaTotal, used },
        };
      });
    },
  );
}
