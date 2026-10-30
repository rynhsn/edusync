import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  DEFAULT_LETTER_TEMPLATES,
  formatAgendaNumber,
  formatLetterNumber,
  formatLongDateId,
  MAX_SIGNATURE_BYTES,
  parseSignatureDataUrl,
  renderLetter,
  schoolCodeFromSlug,
  unknownLetterPlaceholders,
} from '@edusync/contracts';
import {
  academicYear,
  and,
  asc,
  classRoom,
  count,
  desc,
  enrollment,
  eq,
  gte,
  ilike,
  letter,
  letterCounter,
  letterTemplate,
  lte,
  member,
  or,
  school,
  signedDocument,
  signerCredential,
  sql,
  student,
  type Tx,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, forbidden, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { audit, conflictAs409, guarded, idParams, ok, schoolHeader } from './helpers';

const tag = ['Administration'];
const dateField = z.iso.date();

const readGate = [requirePermission('letter:read'), requireModule('administration')];
const manageGate = [requirePermission('letter:manage'), requireModule('administration')];
const signGate = [requirePermission('letter:sign'), requireModule('administration')];

const notFound = (what: string) => new HttpError(404, 'not_found', `${what} tidak ditemukan.`);
const invalidRef = (message: string) => new HttpError(400, 'invalid_reference', message);

/** Perbandingan waktu-konstan untuk dua string. */
function sameString(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Tanggal ISO (YYYY-MM-DD) -> tahun dan bulan. */
function yearMonth(iso: string) {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) };
}

/* ---------- Skema ---------- */

const templateSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(['letter', 'certificate']),
  body: z.string(),
  active: z.boolean(),
  createdAt: z.date(),
});

const templateBody = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(['letter', 'certificate']).default('letter'),
  body: z.string().trim().min(1).max(20_000),
  active: z.boolean().default(true),
});

const signatureField = z
  .string()
  .max(MAX_SIGNATURE_BYTES, 'Gambar tanda tangan terlalu besar (maksimal 150 KB).')
  .nullable();

const signerSchema = z.object({
  id: z.uuid(),
  memberId: z.uuid(),
  name: z.string(),
  nip: z.string().nullable(),
  title: z.string(),
  active: z.boolean(),
  hasSignature: z
    .boolean()
    .describe('Gambar tanda tangan sudah diunggah (gambarnya tidak pernah ada di daftar)'),
});

const signerMeSchema = signerSchema.extend({
  signatureData: z
    .string()
    .nullable()
    .describe('Data URL gambar tanda tangan; hanya untuk pemiliknya sendiri'),
});

const signerCreateBody = z.object({
  memberId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  nip: z.string().trim().min(1).max(40).nullable().default(null),
  title: z.string().trim().min(1).max(120),
  signatureData: signatureField.default(null),
  active: z.boolean().default(true),
});

const signerUpdateBody = z.object({
  name: z.string().trim().min(1).max(120),
  nip: z.string().trim().min(1).max(40).nullable().default(null),
  title: z.string().trim().min(1).max(120),
  signatureData: signatureField.optional().describe('Dihilangkan = tidak diubah; null = hapus gambar'),
  active: z.boolean().default(true),
});

const letterListItem = z.object({
  id: z.uuid(),
  direction: z.enum(['outgoing', 'incoming']),
  number: z.string(),
  subject: z.string(),
  party: z.string(),
  letterDate: z.string(),
  status: z.enum(['draft', 'signed', 'revoked']),
  templateId: z.uuid().nullable(),
  studentId: z.uuid().nullable(),
  createdAt: z.date(),
});

const letterDetail = letterListItem.extend({
  body: z.string().nullable(),
  dispositionNote: z.string().nullable(),
  studentName: z.string().nullable(),
  templateName: z.string().nullable(),
});

const letterCreateBody = z.discriminatedUnion('direction', [
  z.object({
    direction: z.literal('outgoing'),
    subject: z.string().trim().min(1).max(200),
    party: z.string().trim().min(1).max(200).describe('Penerima surat'),
    letterDate: dateField,
    body: z.string().trim().max(20_000).nullable().default(null),
    templateId: z.uuid().nullable().default(null),
    studentId: z.uuid().nullable().default(null),
  }),
  z.object({
    direction: z.literal('incoming'),
    number: z.string().trim().min(1).max(100).nullable().default(null).describe('Nomor surat dari pengirim'),
    subject: z.string().trim().min(1).max(200),
    party: z.string().trim().min(1).max(200).describe('Pengirim surat'),
    letterDate: dateField,
    body: z.string().trim().max(20_000).nullable().default(null),
    dispositionNote: z.string().trim().max(2000).nullable().default(null),
  }),
]);

const letterUpdateBody = z.object({
  subject: z.string().trim().min(1).max(200),
  party: z.string().trim().min(1).max(200),
  letterDate: dateField,
  body: z.string().trim().max(20_000).nullable().optional(),
  templateId: z.uuid().nullable().optional(),
  studentId: z.uuid().nullable().optional(),
  dispositionNote: z.string().trim().max(2000).nullable().optional(),
});

const listQuery = z.object({
  direction: z.enum(['outgoing', 'incoming']).optional(),
  status: z.enum(['draft', 'signed', 'revoked']).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  from: dateField.optional(),
  to: dateField.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const sha256Field = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, 'SHA-256 harus 64 karakter heksadesimal.')
  .transform((s) => s.toLowerCase());

const signatureInfo = z.object({
  signedDocumentId: z.uuid(),
  token: z.string(),
  signedAt: z.date(),
  revoked: z.boolean(),
  revokedAt: z.date().nullable(),
  revokedReason: z.string().nullable(),
  hashRegistered: z.boolean(),
  signerName: z.string(),
  signerTitle: z.string(),
});

const verifyView = z.object({
  valid: z.boolean(),
  status: z.enum(['valid', 'revoked', 'unknown']),
  number: z.string().nullable(),
  subject: z.string().nullable(),
  issuer: z.object({ schoolName: z.string().nullable() }),
  signer: z.object({ name: z.string().nullable(), title: z.string().nullable() }),
  signedAt: z.date().nullable(),
  revokedAt: z.date().nullable(),
  revokedReason: z.string().nullable(),
  hashRegistered: z.boolean(),
});

const publicToken = z.object({ token: z.string().min(1).max(256) });

/* ---------- Pembantu ---------- */

/** Validasi gambar tanda tangan (ukuran, jenis, magic bytes); null lolos. */
function checkSignature(data: string | null | undefined) {
  if (data === null || data === undefined) return;
  if (data.length > MAX_SIGNATURE_BYTES || !parseSignatureDataUrl(data)) {
    throw new HttpError(
      400,
      'invalid_signature',
      'Tanda tangan harus berupa gambar PNG atau JPEG asli (data URL) berukuran maksimal 150 KB.',
    );
  }
}

function checkTemplateBody(body: string) {
  const unknown = unknownLetterPlaceholders(body);
  if (unknown.length > 0) {
    throw new HttpError(
      400,
      'unknown_placeholder',
      `Pengganti tidak dikenal: ${unknown.map((p) => `{{${p}}}`).join(', ')}.`,
    );
  }
}

function signerView(s: {
  id: string;
  memberId: string;
  name: string;
  nip: string | null;
  title: string;
  active: boolean;
  hasSignature: boolean;
}) {
  return {
    id: s.id,
    memberId: s.memberId,
    name: s.name,
    nip: s.nip,
    title: s.title,
    active: s.active,
    hasSignature: s.hasSignature,
  };
}

/** Kolom penandatangan tanpa gambar tanda tangan. */
const signerColumns = {
  id: signerCredential.id,
  memberId: signerCredential.memberId,
  name: signerCredential.name,
  nip: signerCredential.nip,
  title: signerCredential.title,
  active: signerCredential.active,
  hasSignature: sql<boolean>`${signerCredential.signatureData} is not null`,
};

async function signerOrThrow(tx: Tx, id: string) {
  const [row] = await tx.select(signerColumns).from(signerCredential).where(eq(signerCredential.id, id));
  if (!row) throw notFound('Penandatangan');
  return row;
}

async function myCredential(tx: Tx, ctx: TenantContext) {
  const [row] = await tx.select().from(signerCredential).where(eq(signerCredential.memberId, ctx.memberId));
  return row ?? null;
}

async function letterOrThrow(tx: Tx, id: string, lock = false) {
  const q = tx.select().from(letter).where(eq(letter.id, id));
  const [row] = await (lock ? q.for('update') : q);
  if (!row) throw notFound('Surat');
  return row;
}

async function templateOrThrow(tx: Tx, id: string) {
  const [row] = await tx.select().from(letterTemplate).where(eq(letterTemplate.id, id));
  if (!row) throw notFound('Templat');
  return row;
}

async function checkRefs(
  tx: Tx,
  templateId: string | null | undefined,
  studentId: string | null | undefined,
) {
  if (templateId) {
    const [t] = await tx
      .select({ id: letterTemplate.id })
      .from(letterTemplate)
      .where(and(eq(letterTemplate.id, templateId), eq(letterTemplate.active, true)));
    if (!t) throw invalidRef('Templat tidak ditemukan atau tidak aktif.');
  }
  if (studentId) {
    const [s] = await tx.select({ id: student.id }).from(student).where(eq(student.id, studentId));
    if (!s) throw invalidRef('Siswa tidak ditemukan.');
  }
}

/** Nomor berikutnya (atomik, per sekolah per arah per tahun). Baris terkunci sampai transaksi selesai. */
async function nextSeq(tx: Tx, schoolId: string, direction: 'outgoing' | 'incoming', year: number) {
  const [row] = await tx
    .insert(letterCounter)
    .values({ schoolId, direction, year, last: 1 })
    .onConflictDoUpdate({
      target: [letterCounter.schoolId, letterCounter.direction, letterCounter.year],
      set: { last: sql`${letterCounter.last} + 1` },
    })
    .returning({ last: letterCounter.last });
  return row!.last;
}

async function detailOf(tx: Tx, id: string) {
  const [row] = await tx
    .select({
      l: letter,
      studentName: student.name,
      templateName: letterTemplate.name,
    })
    .from(letter)
    .leftJoin(student, eq(student.id, letter.studentId))
    .leftJoin(letterTemplate, eq(letterTemplate.id, letter.templateId))
    .where(eq(letter.id, id));
  if (!row) throw notFound('Surat');
  const { l } = row;
  return {
    id: l.id,
    direction: l.direction,
    number: l.number,
    subject: l.subject,
    party: l.party,
    letterDate: l.letterDate,
    status: l.status,
    templateId: l.templateId,
    studentId: l.studentId,
    createdAt: l.createdAt,
    body: l.body,
    dispositionNote: l.dispositionNote,
    studentName: row.studentName,
    templateName: row.templateName,
  };
}

/** Penandatanganan terbaru sebuah surat, atau null. */
async function latestSigned(tx: Tx, letterId: string) {
  const [row] = await tx
    .select()
    .from(signedDocument)
    .where(eq(signedDocument.letterId, letterId))
    .orderBy(desc(signedDocument.signedAt))
    .limit(1);
  return row ?? null;
}

function signatureView(sd: typeof signedDocument.$inferSelect) {
  return {
    signedDocumentId: sd.id,
    token: sd.token,
    signedAt: sd.signedAt,
    revoked: sd.revokedAt !== null,
    revokedAt: sd.revokedAt,
    revokedReason: sd.revokedReason,
    hashRegistered: sd.pdfSha256 !== null,
    signerName: sd.signerName,
    signerTitle: sd.signerTitle,
  };
}

/** Surat keluar dan masuk, templat, penandatangan, tanda tangan QR, dan verifikasi publik. Modul `administration`. */
export async function letterRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  /* ---------- Templat ---------- */

  app.get(
    '/v1/letters/templates',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar templat surat',
        description:
          'Izin: `letter:read`; modul `administration`. Isi templat memakai pengganti `{{nama}}`, `{{nis}}`, ' +
          '`{{kelas}}`, `{{tanggal}}`, `{{sekolah}}`, `{{nomor}}`, `{{penandatangan}}`, `{{jabatan}}`.',
        headers: schoolHeader,
        response: { 200: z.array(templateSchema), ...guarded },
      },
    },
    async (request) =>
      tenant(request, (tx) => tx.select().from(letterTemplate).orderBy(asc(letterTemplate.name))),
  );

  app.post(
    '/v1/letters/templates',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Tambah templat surat',
        description:
          'Izin: `letter:manage`; modul `administration`. Nama unik (409 `conflict`). Pengganti di luar daftar ' +
          'ditolak (400 `unknown_placeholder`).',
        headers: schoolHeader,
        body: templateBody,
        response: { 201: templateSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      checkTemplateBody(request.body.body);
      const created = await conflictAs409('Nama templat itu sudah ada.', () =>
        tenant(request, async (tx) => {
          const [row] = await tx
            .insert(letterTemplate)
            .values({ schoolId: ctx.schoolId, ...request.body })
            .returning();
          await audit(tx, ctx, 'letter_template.create', 'letter_template', row!.id, {
            name: request.body.name,
          });
          return row!;
        }),
      );
      return reply.code(201).send(created);
    },
  );

  app.post(
    '/v1/letters/templates/defaults',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Buat templat bawaan',
        description:
          'Izin: `letter:manage`; modul `administration`. Membuat tiga templat bawaan (surat keterangan siswa aktif, ' +
          'surat panggilan orang tua, sertifikat sederhana) hanya bila sekolah belum punya templat (409 `not_empty`).',
        headers: schoolHeader,
        response: { 201: z.array(templateSchema), 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const rows = await tenant(request, async (tx) => {
        const [existing] = await tx.select({ n: count() }).from(letterTemplate);
        if ((existing?.n ?? 0) > 0) {
          throw new HttpError(409, 'not_empty', 'Sekolah ini sudah punya templat surat.');
        }
        const created = await tx
          .insert(letterTemplate)
          .values(DEFAULT_LETTER_TEMPLATES.map((t) => ({ schoolId: ctx.schoolId, ...t })))
          .returning();
        await audit(tx, ctx, 'letter_template.defaults', 'letter_template', ctx.schoolId, {
          count: created.length,
        });
        return created;
      });
      return reply.code(201).send(rows);
    },
  );

  app.put(
    '/v1/letters/templates/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Ubah templat surat',
        description:
          'Izin: `letter:manage`; modul `administration`. Mengganti seluruh isi (termasuk `active`). Nama unik ' +
          '(409 `conflict`); pengganti tak dikenal 400 `unknown_placeholder`.',
        headers: schoolHeader,
        params: idParams,
        body: templateBody,
        response: { 200: templateSchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      checkTemplateBody(request.body.body);
      return conflictAs409('Nama templat itu sudah ada.', () =>
        tenant(request, async (tx) => {
          await templateOrThrow(tx, request.params.id);
          const [row] = await tx
            .update(letterTemplate)
            .set(request.body)
            .where(eq(letterTemplate.id, request.params.id))
            .returning();
          await audit(tx, ctx, 'letter_template.update', 'letter_template', request.params.id, {
            name: request.body.name,
          });
          return row!;
        }),
      );
    },
  );

  app.delete(
    '/v1/letters/templates/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Hapus templat surat',
        description:
          'Izin: `letter:manage`; modul `administration`. Ditolak 409 `in_use` bila sudah dipakai surat; nonaktifkan ' +
          'lewat ubah (`active: false`).',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        await templateOrThrow(tx, request.params.id);
        const [used] = await tx
          .select({ n: count() })
          .from(letter)
          .where(eq(letter.templateId, request.params.id));
        if ((used?.n ?? 0) > 0) {
          throw new HttpError(409, 'in_use', 'Templat ini sudah dipakai surat; nonaktifkan saja.');
        }
        await tx.delete(letterTemplate).where(eq(letterTemplate.id, request.params.id));
        await audit(tx, ctx, 'letter_template.delete', 'letter_template', request.params.id);
        return { ok: true as const };
      });
    },
  );

  /* ---------- Penandatangan ---------- */

  app.get(
    '/v1/letters/signers',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar penandatangan',
        description:
          'Izin: `letter:read`; modul `administration`. Gambar tanda tangan TIDAK pernah ada di daftar; hanya ' +
          '`hasSignature`.',
        headers: schoolHeader,
        response: { 200: z.array(signerSchema), ...guarded },
      },
    },
    async (request) =>
      tenant(request, (tx) =>
        tx.select(signerColumns).from(signerCredential).orderBy(asc(signerCredential.name)),
      ),
  );

  app.get(
    '/v1/letters/signers/me',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Kredensial penandatangan saya',
        description:
          'Izin: `letter:read`; modul `administration`. `signer` bernilai null bila anggota ini belum terdaftar ' +
          'sebagai penandatangan. Hanya di sini (dan di respons tanda tangan) gambar tanda tangan dikembalikan, ' +
          'dan hanya untuk pemiliknya.',
        headers: schoolHeader,
        response: { 200: z.object({ signer: signerMeSchema.nullable() }), ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const row = await tenant(request, (tx) => myCredential(tx, ctx));
      if (!row) return { signer: null };
      return {
        signer: {
          ...signerView({ ...row, hasSignature: row.signatureData !== null }),
          signatureData: row.signatureData,
        },
      };
    },
  );

  app.put(
    '/v1/letters/signers/me/signature',
    {
      onRequest: signGate,
      schema: {
        tags: tag,
        summary: 'Unggah tanda tangan saya',
        description:
          'Izin: `letter:sign`; modul `administration`. Penandatangan mengunggah atau menghapus (`null`) gambar tanda ' +
          'tangannya sendiri tanpa izin kelola. Data URL `image/png` atau `image/jpeg`, maksimal 150 KB, magic bytes ' +
          'diperiksa (400 `invalid_signature`). 404 `not_found` bila belum terdaftar sebagai penandatangan.',
        headers: schoolHeader,
        body: z.object({ signatureData: signatureField }),
        response: { 200: signerMeSchema, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      checkSignature(request.body.signatureData);
      return tenant(request, async (tx) => {
        const mine = await myCredential(tx, ctx);
        if (!mine) throw notFound('Kredensial penandatangan Anda');
        const [row] = await tx
          .update(signerCredential)
          .set({ signatureData: request.body.signatureData })
          .where(eq(signerCredential.id, mine.id))
          .returning();
        await audit(tx, ctx, 'signer.signature', 'signer_credential', mine.id, {
          cleared: request.body.signatureData === null,
        });
        return {
          ...signerView({ ...row!, hasSignature: row!.signatureData !== null }),
          signatureData: row!.signatureData,
        };
      });
    },
  );

  app.post(
    '/v1/letters/signers',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Tambah penandatangan',
        description:
          'Izin: `letter:manage`; modul `administration`. `memberId` harus anggota aktif sekolah ini ' +
          '(400 `invalid_reference`); satu anggota satu kredensial (409 `conflict`). Gambar tanda tangan: lihat ' +
          '`PUT /v1/letters/signers/me/signature` (400 `invalid_signature`).',
        headers: schoolHeader,
        body: signerCreateBody,
        response: { 201: signerSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      checkSignature(request.body.signatureData);
      const created = await conflictAs409('Anggota itu sudah menjadi penandatangan.', () =>
        tenant(request, async (tx) => {
          const [m] = await tx
            .select({ id: member.id })
            .from(member)
            .where(and(eq(member.id, request.body.memberId), eq(member.status, 'active')));
          if (!m) throw invalidRef('Anggota tidak ditemukan atau tidak aktif.');
          const [row] = await tx
            .insert(signerCredential)
            .values({ schoolId: ctx.schoolId, ...request.body })
            .returning({ id: signerCredential.id });
          await audit(tx, ctx, 'signer.create', 'signer_credential', row!.id, { name: request.body.name });
          return signerOrThrow(tx, row!.id);
        }),
      );
      return reply.code(201).send(signerView(created));
    },
  );

  app.put(
    '/v1/letters/signers/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Ubah penandatangan',
        description:
          'Izin: `letter:manage`; modul `administration`. `signatureData` dihilangkan = gambar tidak diubah, ' +
          '`null` = hapus. Tautan anggota tidak dapat diubah.',
        headers: schoolHeader,
        params: idParams,
        body: signerUpdateBody,
        response: { 200: signerSchema, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      checkSignature(request.body.signatureData);
      return tenant(request, async (tx) => {
        await signerOrThrow(tx, request.params.id);
        const { signatureData, ...rest } = request.body;
        await tx
          .update(signerCredential)
          .set({ ...rest, ...(signatureData !== undefined ? { signatureData } : {}) })
          .where(eq(signerCredential.id, request.params.id));
        await audit(tx, ctx, 'signer.update', 'signer_credential', request.params.id, {
          name: request.body.name,
          active: request.body.active,
        });
        return signerView(await signerOrThrow(tx, request.params.id));
      });
    },
  );

  app.delete(
    '/v1/letters/signers/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Hapus penandatangan',
        description:
          'Izin: `letter:manage`; modul `administration`. Ditolak 409 `in_use` bila sudah pernah menandatangani ' +
          'surat; nonaktifkan lewat ubah (`active: false`).',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        await signerOrThrow(tx, request.params.id);
        const [used] = await tx
          .select({ n: count() })
          .from(signedDocument)
          .where(eq(signedDocument.signerId, request.params.id));
        if ((used?.n ?? 0) > 0) {
          throw new HttpError(
            409,
            'in_use',
            'Penandatangan ini sudah pernah menandatangani surat; nonaktifkan saja.',
          );
        }
        await tx.delete(signerCredential).where(eq(signerCredential.id, request.params.id));
        await audit(tx, ctx, 'signer.delete', 'signer_credential', request.params.id);
        return { ok: true as const };
      });
    },
  );

  /* ---------- Surat ---------- */

  app.get(
    '/v1/letters',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar surat',
        description:
          'Izin: `letter:read`; modul `administration`. Filter arah, status, rentang tanggal surat, dan `q` (nomor, ' +
          'perihal, pihak). Terbaru lebih dulu. Isi surat ada di detail.',
        headers: schoolHeader,
        querystring: listQuery,
        response: {
          200: z.object({ items: z.array(letterListItem), total: z.number().int() }),
          ...guarded,
        },
      },
    },
    async (request) => {
      const { direction, status, q, from, to, limit, offset } = request.query;
      const like = q ? `%${q.replace(/[\\%_]/g, '\\$&')}%` : null;
      const where = and(
        direction ? eq(letter.direction, direction) : undefined,
        status ? eq(letter.status, status) : undefined,
        from ? gte(letter.letterDate, from) : undefined,
        to ? lte(letter.letterDate, to) : undefined,
        like
          ? or(ilike(letter.number, like), ilike(letter.subject, like), ilike(letter.party, like))
          : undefined,
      );
      return tenant(request, async (tx) => {
        const items = await tx
          .select({
            id: letter.id,
            direction: letter.direction,
            number: letter.number,
            subject: letter.subject,
            party: letter.party,
            letterDate: letter.letterDate,
            status: letter.status,
            templateId: letter.templateId,
            studentId: letter.studentId,
            createdAt: letter.createdAt,
          })
          .from(letter)
          .where(where)
          .orderBy(desc(letter.letterDate), desc(letter.createdAt))
          .limit(limit)
          .offset(offset);
        const [total] = await tx.select({ n: count() }).from(letter).where(where);
        return { items, total: total?.n ?? 0 };
      });
    },
  );

  app.post(
    '/v1/letters',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Catat atau buat surat',
        description:
          'Izin: `letter:manage`; modul `administration`. Surat keluar (`direction: outgoing`) mendapat nomor otomatis ' +
          'berurutan per tahun surat, format `012/KODE/X/2026`, dari penghitung atomik. Surat masuk (`incoming`) ' +
          'mendapat nomor agenda otomatis `AG/012/2026`; `number` (nomor surat pengirim) dicatat pada awal isi. ' +
          '`templateId` harus templat aktif dan `studentId` siswa sekolah ini (400 `invalid_reference`).',
        headers: schoolHeader,
        body: letterCreateBody,
        response: { 201: letterDetail, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const input = request.body;
      const created = await conflictAs409('Nomor surat bentrok, coba lagi.', () =>
        tenant(request, async (tx) => {
          const { year, month } = yearMonth(input.letterDate);
          if (input.direction === 'outgoing') {
            await checkRefs(tx, input.templateId, input.studentId);
            const [s] = await tx
              .select({ slug: school.slug })
              .from(school)
              .where(eq(school.id, ctx.schoolId));
            const seq = await nextSeq(tx, ctx.schoolId, 'outgoing', year);
            const number = formatLetterNumber(seq, schoolCodeFromSlug(s?.slug ?? ''), month, year);
            const [row] = await tx
              .insert(letter)
              .values({
                schoolId: ctx.schoolId,
                direction: 'outgoing',
                number,
                subject: input.subject,
                party: input.party,
                letterDate: input.letterDate,
                body: input.body,
                templateId: input.templateId,
                studentId: input.studentId,
                createdBy: ctx.userId,
              })
              .returning({ id: letter.id });
            await audit(tx, ctx, 'letter.create', 'letter', row!.id, { direction: 'outgoing', number });
            return detailOf(tx, row!.id);
          }
          const seq = await nextSeq(tx, ctx.schoolId, 'incoming', year);
          const number = formatAgendaNumber(seq, year);
          const body = [input.number ? `Nomor surat pengirim: ${input.number}` : null, input.body]
            .filter(Boolean)
            .join('\n\n');
          const [row] = await tx
            .insert(letter)
            .values({
              schoolId: ctx.schoolId,
              direction: 'incoming',
              number,
              subject: input.subject,
              party: input.party,
              letterDate: input.letterDate,
              body: body || null,
              dispositionNote: input.dispositionNote,
              createdBy: ctx.userId,
            })
            .returning({ id: letter.id });
          await audit(tx, ctx, 'letter.create', 'letter', row!.id, { direction: 'incoming', number });
          return detailOf(tx, row!.id);
        }),
      );
      return reply.code(201).send(created);
    },
  );

  app.get(
    '/v1/letters/:id',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Detail surat',
        description: 'Izin: `letter:read`; modul `administration`. Memuat isi surat dan catatan disposisi.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: letterDetail, 404: errorSchema, ...guarded },
      },
    },
    async (request) => tenant(request, (tx) => detailOf(tx, request.params.id)),
  );

  app.put(
    '/v1/letters/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Ubah surat',
        description:
          'Izin: `letter:manage`; modul `administration`. Surat keluar hanya boleh diubah saat draf (409 `not_draft`); ' +
          'nomor tidak berubah. Surat masuk boleh diubah kapan saja (termasuk `dispositionNote`); `templateId` dan ' +
          '`studentId` diabaikan untuk surat masuk. Bidang opsional yang dihilangkan tidak diubah.',
        headers: schoolHeader,
        params: idParams,
        body: letterUpdateBody,
        response: { 200: letterDetail, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      return tenant(request, async (tx) => {
        const cur = await letterOrThrow(tx, request.params.id, true);
        const set: Partial<typeof letter.$inferInsert> = {
          subject: b.subject,
          party: b.party,
          letterDate: b.letterDate,
        };
        if (b.body !== undefined) set.body = b.body;
        if (cur.direction === 'outgoing') {
          if (cur.status !== 'draft') {
            throw new HttpError(409, 'not_draft', 'Surat yang sudah ditandatangani tidak dapat diubah.');
          }
          await checkRefs(tx, b.templateId, b.studentId);
          if (b.templateId !== undefined) set.templateId = b.templateId;
          if (b.studentId !== undefined) set.studentId = b.studentId;
        } else if (b.dispositionNote !== undefined) {
          set.dispositionNote = b.dispositionNote;
        }
        await tx.update(letter).set(set).where(eq(letter.id, cur.id));
        await audit(tx, ctx, 'letter.update', 'letter', cur.id, { number: cur.number });
        return detailOf(tx, cur.id);
      });
    },
  );

  app.delete(
    '/v1/letters/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Hapus surat',
        description:
          'Izin: `letter:manage`; modul `administration`. Hanya surat berstatus draf (409 `not_draft`); surat ' +
          'bertanda tangan dicabut, bukan dihapus. Nomor yang sudah dipakai tidak dipakai ulang.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const cur = await letterOrThrow(tx, request.params.id, true);
        if (cur.status !== 'draft') {
          throw new HttpError(409, 'not_draft', 'Hanya surat berstatus draf yang dapat dihapus.');
        }
        await tx.delete(letter).where(eq(letter.id, cur.id));
        await audit(tx, ctx, 'letter.delete', 'letter', cur.id, { number: cur.number });
        return { ok: true as const };
      });
    },
  );

  app.post(
    '/v1/letters/:id/render',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Isi surat dari templat',
        description:
          'Izin: `letter:manage`; modul `administration`. Mengisi templat surat (atau isi surat bila tanpa templat) ' +
          'dengan data siswa (`studentId` atau siswa pada surat), sekolah, nomor, tanggal, dan penandatangan ' +
          '(`signerId`, bawaan kredensial pengguna). Tidak menyimpan apa pun; simpan lewat ubah surat. ' +
          'Surat masuk tidak dapat dirender (409 `not_outgoing`).',
        headers: schoolHeader,
        params: idParams,
        body: z.object({
          studentId: z.uuid().nullable().optional(),
          signerId: z.uuid().nullable().optional(),
        }),
        response: {
          200: z.object({ text: z.string(), unknown: z.array(z.string()) }),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const cur = await letterOrThrow(tx, request.params.id);
        if (cur.direction !== 'outgoing') {
          throw new HttpError(409, 'not_outgoing', 'Hanya surat keluar yang dapat dirender dari templat.');
        }
        const source = cur.templateId ? (await templateOrThrow(tx, cur.templateId)).body : (cur.body ?? '');
        const studentId = request.body.studentId ?? cur.studentId;
        let nama: string | null = null;
        let nis: string | null = null;
        let kelas: string | null = null;
        if (studentId) {
          const [s] = await tx.select().from(student).where(eq(student.id, studentId));
          if (!s) throw invalidRef('Siswa tidak ditemukan.');
          nama = s.name;
          nis = s.nis;
          const [cls] = await tx
            .select({ name: classRoom.name })
            .from(enrollment)
            .innerJoin(classRoom, eq(classRoom.id, enrollment.classId))
            .innerJoin(academicYear, eq(academicYear.id, enrollment.academicYearId))
            .where(eq(enrollment.studentId, studentId))
            .orderBy(desc(academicYear.isActive), desc(academicYear.startsOn))
            .limit(1);
          kelas = cls?.name ?? null;
        }
        const [sch] = await tx.select({ name: school.name }).from(school).where(eq(school.id, ctx.schoolId));
        const signer = request.body.signerId
          ? await tx.select().from(signerCredential).where(eq(signerCredential.id, request.body.signerId))
          : [await myCredential(tx, ctx)];
        if (request.body.signerId && !signer[0]) throw invalidRef('Penandatangan tidak ditemukan.');
        const text = renderLetter(source, {
          nama,
          nis,
          kelas,
          tanggal: formatLongDateId(cur.letterDate),
          sekolah: sch?.name ?? null,
          nomor: cur.number,
          penandatangan: signer[0]?.name ?? null,
          jabatan: signer[0]?.title ?? null,
        });
        return { text, unknown: unknownLetterPlaceholders(source) };
      });
    },
  );

  /* ---------- Tanda tangan ---------- */

  app.post(
    '/v1/letters/:id/sign',
    {
      onRequest: signGate,
      schema: {
        tags: tag,
        summary: 'Tandatangani surat',
        description:
          'Izin: `letter:sign` dan kredensial penandatangan aktif milik pengguna (403 `not_a_signer`); modul ' +
          '`administration`. Hanya surat keluar berstatus draf (409 `not_signable`). Membuat `signed_document` dengan ' +
          'token acak 32 byte (base64url), mengubah status surat menjadi `signed`, dan mengembalikan token, ' +
          '`verifyPath` untuk QR, serta data penandatangan termasuk gambar tanda tangannya sendiri. Ini tanda tangan ' +
          'sederhana, bukan tanda tangan elektronik tersertifikasi. Klien lalu membuat PDF berQR, menghitung SHA-256, ' +
          'dan mendaftarkannya lewat `PUT /v1/signed-documents/{id}/hash`.',
        headers: schoolHeader,
        params: idParams,
        response: {
          200: z.object({
            signedDocumentId: z.uuid(),
            token: z.string(),
            verifyPath: z.string(),
            signedAt: z.date(),
            number: z.string(),
            subject: z.string(),
            signer: z.object({
              name: z.string(),
              title: z.string(),
              nip: z.string().nullable(),
              signatureData: z.string().nullable(),
            }),
          }),
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const cred = await myCredential(tx, ctx);
        if (!cred?.active) {
          throw forbidden('Anda belum terdaftar sebagai penandatangan aktif.');
        }
        const cur = await letterOrThrow(tx, request.params.id, true);
        if (cur.direction !== 'outgoing' || cur.status !== 'draft') {
          throw new HttpError(
            409,
            'not_signable',
            'Hanya surat keluar berstatus draf yang dapat ditandatangani.',
          );
        }
        const token = randomBytes(32).toString('base64url');
        const [sd] = await tx
          .insert(signedDocument)
          .values({
            schoolId: ctx.schoolId,
            letterId: cur.id,
            signerId: cred.id,
            token,
            signerName: cred.name,
            signerTitle: cred.title,
          })
          .returning();
        await tx.update(letter).set({ status: 'signed' }).where(eq(letter.id, cur.id));
        await audit(tx, ctx, 'letter.sign', 'letter', cur.id, {
          number: cur.number,
          signedDocumentId: sd!.id,
        });
        return {
          signedDocumentId: sd!.id,
          token,
          verifyPath: `/verify/${token}`,
          signedAt: sd!.signedAt,
          number: cur.number,
          subject: cur.subject,
          signer: { name: cred.name, title: cred.title, nip: cred.nip, signatureData: cred.signatureData },
        };
      });
    },
  );

  app.put(
    '/v1/signed-documents/:id/hash',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftarkan hash PDF',
        description:
          'Izin: penandatangan dokumen itu atau `letter:manage` (dasar `letter:read`); modul `administration`. ' +
          'Hanya sekali: hash yang sudah terisi atau dokumen yang dicabut menghasilkan 409 `hash_already_set` / ' +
          '`revoked`. `sha256` 64 karakter heksadesimal.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({ sha256: sha256Field }),
        response: {
          200: z.object({ ok: z.literal(true), sha256: z.string() }),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const [sd] = await tx.select().from(signedDocument).where(eq(signedDocument.id, request.params.id));
        if (!sd) throw notFound('Dokumen bertanda tangan');
        const mine = await myCredential(tx, ctx);
        if (!ctx.permissions.has('letter:manage') && mine?.id !== sd.signerId) {
          throw forbidden(
            'Hanya penandatangan dokumen ini atau pengelola surat yang boleh mendaftarkan hash.',
          );
        }
        if (sd.revokedAt) throw new HttpError(409, 'revoked', 'Dokumen ini sudah dicabut.');
        const [updated] = await tx
          .update(signedDocument)
          .set({ pdfSha256: request.body.sha256 })
          .where(and(eq(signedDocument.id, sd.id), sql`${signedDocument.pdfSha256} is null`))
          .returning({ id: signedDocument.id });
        if (!updated) throw new HttpError(409, 'hash_already_set', 'Hash dokumen ini sudah terdaftar.');
        await audit(tx, ctx, 'letter.hash', 'signed_document', sd.id, { sha256: request.body.sha256 });
        return { ok: true as const, sha256: request.body.sha256 };
      });
    },
  );

  app.get(
    '/v1/letters/:id/signature',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Status tanda tangan surat',
        description:
          'Izin: `letter:read`; modul `administration`. Penandatanganan terbaru surat: token (untuk QR), waktu, ' +
          'status cabut, dan apakah hash PDF sudah terdaftar. 404 bila surat belum ditandatangani.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: signatureInfo, 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        await letterOrThrow(tx, request.params.id);
        const sd = await latestSigned(tx, request.params.id);
        if (!sd) throw notFound('Tanda tangan surat');
        return signatureView(sd);
      }),
  );

  app.post(
    '/v1/letters/:id/revoke',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Cabut surat bertanda tangan',
        description:
          'Izin: `letter:manage` atau penandatangan surat itu (dasar `letter:read`); modul `administration`. ' +
          'Status surat menjadi `revoked`; halaman verifikasi publik menampilkan alasan. Hanya surat berstatus ' +
          '`signed` (409 `not_signed`).',
        headers: schoolHeader,
        params: idParams,
        body: z.object({ reason: z.string().trim().min(3).max(500) }),
        response: { 200: signatureInfo, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const cur = await letterOrThrow(tx, request.params.id, true);
        const sd = await latestSigned(tx, cur.id);
        const mine = await myCredential(tx, ctx);
        if (!ctx.permissions.has('letter:manage') && (!sd || mine?.id !== sd.signerId)) {
          throw forbidden('Hanya penandatangan surat ini atau pengelola surat yang boleh mencabutnya.');
        }
        if (cur.status !== 'signed' || !sd) {
          throw new HttpError(409, 'not_signed', 'Hanya surat yang sudah ditandatangani yang dapat dicabut.');
        }
        const [row] = await tx
          .update(signedDocument)
          .set({ revokedAt: new Date(), revokedReason: request.body.reason })
          .where(eq(signedDocument.id, sd.id))
          .returning();
        await tx.update(letter).set({ status: 'revoked' }).where(eq(letter.id, cur.id));
        await audit(tx, ctx, 'letter.revoke', 'letter', cur.id, {
          number: cur.number,
          reason: request.body.reason,
        });
        return signatureView(row!);
      });
    },
  );

  /* ---------- Publik (tanpa login) ---------- */

  const publicLimit = (max: number) => ({ rateLimit: { max, timeWindow: '1 minute' } });

  /** Cari penandatanganan lewat token. Pool platform (tanpa RLS): hanya baris dengan token itu yang dibaca. */
  async function lookup(server: FastifyInstance, token: string) {
    const [row] = await server.platformDb
      .select({
        token: signedDocument.token,
        pdfSha256: signedDocument.pdfSha256,
        signerName: signedDocument.signerName,
        signerTitle: signedDocument.signerTitle,
        signedAt: signedDocument.signedAt,
        revokedAt: signedDocument.revokedAt,
        revokedReason: signedDocument.revokedReason,
        number: letter.number,
        subject: letter.subject,
        letterStatus: letter.status,
        schoolName: school.name,
      })
      .from(signedDocument)
      .innerJoin(letter, eq(letter.id, signedDocument.letterId))
      .innerJoin(school, eq(school.id, signedDocument.schoolId))
      .where(eq(signedDocument.token, token))
      .limit(1);
    return row && sameString(row.token, token) ? row : null;
  }

  app.get(
    '/v1/public/verify/:token',
    {
      config: publicLimit(30),
      schema: {
        tags: tag,
        summary: 'Verifikasi surat (publik)',
        description:
          'Tanpa login. Memeriksa token pada QR surat. Selalu 200: token tak dikenal menghasilkan `status: unknown` ' +
          '(tanpa membedakan respons). `valid` hanya bila status `valid`. Tidak memuat isi surat. Dibatasi 30 ' +
          'permintaan per menit per alamat.',
        params: publicToken,
        response: { 200: verifyView },
      },
    },
    async (request, reply) => {
      reply.header('cache-control', 'no-store');
      const row = await lookup(request.server, request.params.token);
      if (!row) {
        return {
          valid: false,
          status: 'unknown' as const,
          number: null,
          subject: null,
          issuer: { schoolName: null },
          signer: { name: null, title: null },
          signedAt: null,
          revokedAt: null,
          revokedReason: null,
          hashRegistered: false,
        };
      }
      const revoked = row.revokedAt !== null || row.letterStatus === 'revoked';
      return {
        valid: !revoked,
        status: revoked ? ('revoked' as const) : ('valid' as const),
        number: row.number,
        subject: row.subject,
        issuer: { schoolName: row.schoolName },
        signer: { name: row.signerName, title: row.signerTitle },
        signedAt: row.signedAt,
        revokedAt: row.revokedAt,
        revokedReason: row.revokedReason,
        hashRegistered: row.pdfSha256 !== null,
      };
    },
  );

  app.post(
    '/v1/public/verify/:token/check',
    {
      config: publicLimit(20),
      schema: {
        tags: tag,
        summary: 'Cocokkan hash PDF (publik)',
        description:
          'Tanpa login. Membandingkan SHA-256 berkas PDF yang diunggah pengunjung (dihitung di peramban) dengan hash ' +
          'terdaftar. `match` false untuk token tak dikenal, hash belum terdaftar, atau tidak cocok. Dibatasi 20 ' +
          'permintaan per menit per alamat.',
        params: publicToken,
        body: z.object({ sha256: sha256Field }),
        response: { 200: z.object({ match: z.boolean() }) },
      },
    },
    async (request, reply) => {
      reply.header('cache-control', 'no-store');
      const row = await lookup(request.server, request.params.token);
      return { match: !!row?.pdfSha256 && sameString(row.pdfSha256, request.body.sha256) };
    },
  );
}
