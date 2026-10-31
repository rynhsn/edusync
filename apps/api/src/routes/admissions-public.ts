import { randomInt } from 'node:crypto';
import {
  detectMime,
  MAX_DOC_BYTES,
  MAX_DOCS_PER_APPLICATION,
  normalizeApplicantName,
} from '@edusync/contracts';
import {
  admissionCounter,
  admissionPeriod,
  and,
  application,
  applicationDocument,
  applicationStatusLog,
  asc,
  count,
  entitlement,
  eq,
  gt,
  ne,
  program,
  school,
  sql,
  type Tx,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { hashTrackingCode, newTrackingCode, sameHash, statusEnum } from '../admissions-lib';
import { jakarta } from '../gate';
import { errorSchema, HttpError } from '../http-error';
import { activeDocumentTypes } from './admission-document-types';
import { normalizePhone } from './guardians';

const tags = ['Admissions (publik)'];

/** Batas tubuh route apply: 8 dokumen × 2 MB menjadi ±21,4 MB dalam base64, ditambah data isian. */
const APPLY_BODY_LIMIT = 22 * 1024 * 1024;

const slugParams = z.object({ slug: z.string().trim().min(1).max(80) });
const notFound = () => new HttpError(404, 'not_found', 'Data tidak ditemukan.');

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const phoneField = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .transform((v, ctx) => {
    const phone = normalizePhone(v);
    if (!phone) {
      ctx.addIssue({ code: 'custom', message: 'Nomor telepon tidak valid.' });
      return z.NEVER;
    }
    return phone;
  });

const documentBody = z.object({
  kind: z.string().trim().min(1).max(32).describe('Kunci jenis dokumen aktif sekolah'),
  fileName: z.string().trim().min(1).max(200),
  dataBase64: z.string().min(1).max(APPLY_BODY_LIMIT),
});

const applyBody = z.object({
  periodId: z.uuid(),
  fullName: z.string().transform(normalizeApplicantName).pipe(z.string().min(1).max(120)),
  gender: z.enum(['L', 'P']),
  birthPlace: z.string().trim().min(1).max(80),
  birthDate: z.iso.date(),
  nisn: z
    .string()
    .trim()
    .max(30)
    .regex(/^[A-Za-z0-9./-]*$/, 'NISN hanya huruf, angka, titik, garis miring, dan tanda hubung.')
    .nullish()
    .transform((v) => (v ? v : null)),
  previousSchool: optionalText(160),
  address: optionalText(400),
  programId: z
    .uuid()
    .nullish()
    .transform((v) => v ?? null),
  guardianName: z.string().transform(normalizeApplicantName).pipe(z.string().min(1).max(120)),
  guardianPhone: phoneField,
  guardianEmail: z
    .union([z.literal(''), z.email().max(254)])
    .nullish()
    .transform((v) => (v ? v.toLowerCase() : null)),
  documents: z.array(documentBody).max(MAX_DOCS_PER_APPLICATION).default([]),
  website: z.string().max(500).optional().describe('Kolom jebakan (honeypot): harus kosong'),
});

/** Sekolah aktif yang punya modul `admissions`, dicari lewat slug. Selain itu 404 seragam. */
async function resolveSchool(app: FastifyInstance, slug: string) {
  const [row] = await app.platformDb
    .select({ id: school.id, name: school.name, status: school.status })
    .from(school)
    .where(eq(school.slug, slug.toLowerCase()));
  if (!row || row.status !== 'active') throw notFound();
  const modules = await withTenant(app.tenantDb, [row.id], (tx) =>
    tx
      .select({ key: entitlement.moduleKey })
      .from(entitlement)
      .where(and(eq(entitlement.moduleKey, 'admissions'), gt(entitlement.validUntil, new Date()))),
  );
  if (modules.length === 0) throw notFound();
  return { id: row.id, name: row.name };
}

const isOpenOn = (p: { active: boolean; opensOn: string; closesOn: string }, today: string) =>
  p.active && p.opensOn <= today && today <= p.closesOn;

/** Dekode dan periksa satu dokumen: ukuran asli, lalu jenis dari magic bytes (bukan dari nama atau klaim klien). */
function checkDocument(doc: z.infer<typeof documentBody>) {
  const b64 = doc.dataBase64.replace(/^data:[^;]*;base64,/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.length % 4 !== 0) {
    throw new HttpError(400, 'invalid_file_type', `Dokumen "${doc.fileName}" bukan berkas yang valid.`);
  }
  const bytes = Buffer.from(b64, 'base64');
  if (bytes.length > MAX_DOC_BYTES) {
    throw new HttpError(413, 'file_too_large', `Dokumen "${doc.fileName}" melebihi 2 MB.`);
  }
  const mime = detectMime(bytes);
  if (!mime) {
    throw new HttpError(
      400,
      'invalid_file_type',
      `Dokumen "${doc.fileName}" harus berupa PDF, JPG, atau PNG.`,
    );
  }
  return { kind: doc.kind, fileName: doc.fileName, mime, size: bytes.length, dataBase64: b64 };
}

/** Nomor pendaftaran berikutnya, atomik lewat upsert pada admission_counter: SPMB-{tahun}-{4 digit}. */
async function nextRegNumber(tx: Tx, schoolId: string, year: number) {
  const [row] = await tx
    .insert(admissionCounter)
    .values({ schoolId, year, last: 1 })
    .onConflictDoUpdate({
      target: [admissionCounter.schoolId, admissionCounter.year],
      set: { last: sql`${admissionCounter.last} + 1` },
    })
    .returning({ last: admissionCounter.last });
  return `SPMB-${year}-${String(row!.last).padStart(4, '0')}`;
}

/** Pendaftaran SPMB tanpa login. Seluruh akses lewat slug sekolah; sekolah harus aktif dan punya modul `admissions`. */
export async function admissionPublicRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/v1/public/admission/:slug',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: {
        tags,
        summary: 'Info pendaftaran sekolah (publik)',
        description:
          'Tanpa login. Nama sekolah, periode yang sedang dibuka untuk pendaftaran (aktif dan hari ini menurut zona waktu sekolah dalam ' +
          'rentang buka-tutup), daftar program/jurusan, dan jenis dokumen aktif (urut tampil, dengan penanda wajib). 404 `not_found` untuk sekolah yang tidak ada, ' +
          'ditangguhkan, atau tanpa modul SPMB.',
        params: slugParams,
        response: {
          200: z.object({
            school: z.object({ name: z.string() }),
            periods: z.array(
              z.object({
                id: z.uuid(),
                name: z.string(),
                level: z.string(),
                opensOn: z.iso.date(),
                closesOn: z.iso.date(),
                open: z.boolean(),
              }),
            ),
            programs: z.array(z.object({ id: z.uuid(), name: z.string() })),
            documentTypes: z
              .array(z.object({ key: z.string(), label: z.string(), required: z.boolean() }))
              .describe('Jenis dokumen aktif yang diminta; yang `required` wajib diunggah sebelum mengirim'),
          }),
          404: errorSchema,
        },
      },
    },
    async (request) => {
      const s = await resolveSchool(request.server, request.params.slug);
      return withTenant(request.server.tenantDb, [s.id], async (tx) => {
        const today = jakarta(new Date()).date;
        const periods = await tx
          .select()
          .from(admissionPeriod)
          .where(eq(admissionPeriod.active, true))
          .orderBy(asc(admissionPeriod.opensOn), asc(admissionPeriod.name));
        const programs = await tx
          .select({ id: program.id, name: program.name })
          .from(program)
          .orderBy(asc(program.name));
        const documentTypes = await activeDocumentTypes(tx, s.id);
        return {
          school: { name: s.name },
          periods: periods
            .filter((p) => isOpenOn(p, today))
            .map((p) => ({
              id: p.id,
              name: p.name,
              level: p.level,
              opensOn: p.opensOn,
              closesOn: p.closesOn,
              open: true,
            })),
          programs,
          documentTypes,
        };
      });
    },
  );

  app.post(
    '/v1/public/admission/:slug/apply',
    {
      bodyLimit: APPLY_BODY_LIMIT,
      config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
      schema: {
        tags,
        summary: 'Kirim pendaftaran (publik)',
        description:
          'Tanpa login; dibatasi 5 pendaftaran per jam per IP. `documents` maks. 8 berkas, tiap berkas ≤ 2 MB asli ' +
          '(413 `file_too_large`) dan harus PDF/JPG/PNG menurut isi berkas, bukan nama (400 `invalid_file_type`). ' +
          '`website` adalah kolom jebakan: bila terisi, server membalas sukses palsu tanpa menyimpan apa pun. ' +
          '`kind` tiap berkas harus jenis dokumen aktif sekolah (400 `invalid_reference`) dan semua jenis `required` ' +
          'harus ada (400 `document_required`). `trackingCode` hanya ditampilkan sekali; server hanya menyimpan hash-nya. Periode tutup/di luar tanggal: ' +
          '409 `period_closed`; nama + tanggal lahir yang sama pada periode itu: 409 `duplicate_application`.',
        params: slugParams,
        body: applyBody,
        response: {
          201: z.object({
            regNumber: z.string(),
            trackingCode: z.string().describe('Simpan baik-baik: tidak bisa ditampilkan ulang'),
            status: z.literal('submitted'),
          }),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          413: errorSchema,
          429: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body;
      // Perangkap bot: balas seolah berhasil tanpa menyimpan.
      if (body.website && body.website.trim() !== '') {
        const fakeYear = jakarta(new Date()).date.slice(0, 4);
        return reply.code(201).send({
          regNumber: `SPMB-${fakeYear}-${String(randomInt(1, 10_000)).padStart(4, '0')}`,
          trackingCode: newTrackingCode(),
          status: 'submitted' as const,
        });
      }
      const s = await resolveSchool(request.server, request.params.slug);
      const docs = body.documents.map(checkDocument);
      const trackingCode = newTrackingCode();

      const result = await withTenant(request.server.tenantDb, [s.id], async (tx) => {
        const today = jakarta(new Date()).date;
        const year = Number(today.slice(0, 4));
        const [period] = await tx.select().from(admissionPeriod).where(eq(admissionPeriod.id, body.periodId));
        if (!period) throw notFound();
        if (!isOpenOn(period, today)) {
          throw new HttpError(409, 'period_closed', 'Pendaftaran pada periode ini sedang tutup.');
        }
        if (body.programId) {
          const [p] = await tx.select({ id: program.id }).from(program).where(eq(program.id, body.programId));
          if (!p) throw new HttpError(400, 'invalid_reference', 'Program tidak ditemukan.');
        }
        // Serialkan pendaftaran identik agar pemeriksaan duplikat tidak kalah balapan.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`${body.periodId}|${body.fullName.toLowerCase()}|${body.birthDate}`}, 0))`,
        );
        const [dup] = await tx
          .select({ n: count() })
          .from(application)
          .where(
            and(
              eq(application.periodId, body.periodId),
              eq(application.birthDate, body.birthDate),
              sql`lower(${application.fullName}) = ${body.fullName.toLowerCase()}`,
              ne(application.status, 'withdrawn'),
            ),
          );
        if ((dup?.n ?? 0) > 0) {
          throw new HttpError(
            409,
            'duplicate_application',
            'Pendaftar dengan nama dan tanggal lahir itu sudah terdaftar.',
          );
        }
        const types = await activeDocumentTypes(tx, s.id);
        const known = new Set(types.map((t) => t.key));
        if (docs.some((d) => !known.has(d.kind))) {
          throw new HttpError(400, 'invalid_reference', 'Ada jenis dokumen yang tidak dikenal.');
        }
        const given = new Set(docs.map((d) => d.kind));
        const missing = types.filter((t) => t.required && !given.has(t.key));
        if (missing.length > 0) {
          throw new HttpError(
            400,
            'document_required',
            `Dokumen wajib belum diunggah: ${missing.map((m) => m.label).join(', ')}.`,
          );
        }
        const regNumber = await nextRegNumber(tx, s.id, year);
        const [a] = await tx
          .insert(application)
          .values({
            schoolId: s.id,
            periodId: body.periodId,
            regNumber,
            trackingCodeHash: hashTrackingCode(trackingCode),
            fullName: body.fullName,
            gender: body.gender,
            birthPlace: body.birthPlace,
            birthDate: body.birthDate,
            nisn: body.nisn,
            previousSchool: body.previousSchool,
            address: body.address,
            programId: body.programId,
            guardianName: body.guardianName,
            guardianPhone: body.guardianPhone,
            guardianEmail: body.guardianEmail,
          })
          .returning({ id: application.id });
        if (docs.length > 0) {
          await tx
            .insert(applicationDocument)
            .values(docs.map((d) => ({ schoolId: s.id, applicationId: a!.id, ...d })));
        }
        await tx.insert(applicationStatusLog).values({
          schoolId: s.id,
          applicationId: a!.id,
          fromStatus: null,
          toStatus: 'submitted',
          note: null,
          actor: 'applicant',
        });
        return regNumber;
      });
      return reply.code(201).send({ regNumber: result, trackingCode, status: 'submitted' as const });
    },
  );

  /** Hash tiruan agar waktu jawaban tetap sama baik nomor ada maupun tidak. */
  const dummyHash = hashTrackingCode('AAAAAAAAAA');

  app.post(
    '/v1/public/admission/status',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
      schema: {
        tags,
        summary: 'Cek status pendaftaran (publik)',
        description:
          'Tanpa login; dibatasi 20 pengecekan per jam per IP. Memakai nomor pendaftaran dan kode pelacakan. ' +
          'Sekolah/nomor/kode yang salah dijawab seragam: 404 `not_found`. Perbandingan hash waktu-konstan.',
        body: z.object({
          slug: z.string().trim().min(1).max(80),
          regNumber: z.string().trim().min(1).max(40),
          trackingCode: z.string().trim().min(1).max(40),
        }),
        response: {
          200: z.object({
            regNumber: z.string(),
            fullName: z.string(),
            status: statusEnum,
            decisionNote: z.string().nullable(),
            updatedAt: z.string(),
          }),
          404: errorSchema,
          429: errorSchema,
        },
      },
    },
    async (request) => {
      const { slug, regNumber, trackingCode } = request.body;
      const s = await resolveSchool(request.server, slug);
      const candidate = hashTrackingCode(trackingCode);
      return withTenant(request.server.tenantDb, [s.id], async (tx) => {
        const [a] = await tx
          .select()
          .from(application)
          .where(eq(application.regNumber, regNumber.toUpperCase()));
        const matches = sameHash(a?.trackingCodeHash ?? dummyHash, candidate);
        if (!a || !matches) throw notFound();
        const [last] = await tx
          .select({ at: applicationStatusLog.createdAt })
          .from(applicationStatusLog)
          .where(eq(applicationStatusLog.applicationId, a.id))
          .orderBy(sql`${applicationStatusLog.createdAt} desc`)
          .limit(1);
        return {
          regNumber: a.regNumber,
          fullName: a.fullName,
          status: a.status,
          decisionNote: a.decisionNote,
          updatedAt: (last?.at ?? a.createdAt).toISOString(),
        };
      });
    },
  );
}
