import {
  type CardElement,
  type CardKind,
  cardLayoutSchema,
  DEFAULT_CARD_TEMPLATE_NAME,
  defaultExamCardLayout,
  defaultStudentCardLayout,
  examDateParts,
  examTimeRange,
  formatIdentityPayload,
  formatLongDateId,
  formatParticipantNo,
  invalidFieldsForKind,
} from '@edusync/contracts';
import {
  academicYear,
  and,
  asc,
  attendanceCard,
  cardTemplate,
  classRoom,
  desc,
  enrollment,
  eq,
  exam,
  examType,
  inArray,
  ne,
  or,
  school,
  schoolFile,
  semester,
  sql,
  student,
  subject,
  type Tx,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { ensureIdentityCodes } from '../identity-code';
import { audit, conflictAs409, guarded, idParams, ok, schoolHeader } from './helpers';
import { readIdentity } from './school-identity';

const tag = ['Cards'];
const MAX_BACKGROUND_BYTES = 1_500_000;
const MAX_PHOTO_BYTES = 500 * 1024;
export const MAX_CARD_ROWS = 300;
const IMAGE_MAGIC = {
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/jpeg': [0xff, 0xd8, 0xff],
} as const;

const readGate = [requirePermission('student:read')];
const designGate = [requirePermission('school:manage')];
const examDataGate = [requirePermission('exam:read'), requireModule('exams')];

const ZONE_LABEL: Record<string, string> = {
  'Asia/Jakarta': 'WIB',
  'Asia/Pontianak': 'WIB',
  'Asia/Makassar': 'WITA',
  'Asia/Jayapura': 'WIT',
};

const notFound = (what: string) => new HttpError(404, 'not_found', `${what} tidak ditemukan.`);
const invalid = (message: string) => new HttpError(400, 'validation', message);

const kindEnum = z.enum(['student', 'exam']);
const layoutSchema = cardLayoutSchema;

const templateSchema = z.object({
  id: z.uuid(),
  kind: kindEnum,
  name: z.string(),
  layout: layoutSchema,
  backgroundFileId: z.uuid().nullable(),
  backgroundUrl: z.string().nullable().describe('Jalur gambar latar (publik, tidak bisa ditebak)'),
  isDefault: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const templateFields = z.object({
  name: z.string().trim().min(1).max(100),
  layout: layoutSchema,
  backgroundFileId: z
    .uuid()
    .nullish()
    .describe('Berkas dari POST /v1/cards/backgrounds; kosong = tanpa latar'),
  isDefault: z.boolean().optional().describe('Jadikan templat bawaan untuk jenisnya'),
});
const createBody = templateFields.extend({ kind: kindEnum });

type TemplateRow = typeof cardTemplate.$inferSelect;

const filePath = (id: string | null) => (id ? `/v1/public/school-files/${id}` : null);

const view = (r: TemplateRow) => ({
  id: r.id,
  kind: r.kind,
  name: r.name,
  layout: { widthMm: r.widthMm, heightMm: r.heightMm, elements: r.elements as unknown as CardElement[] },
  backgroundFileId: r.backgroundFileId,
  backgroundUrl: filePath(r.backgroundFileId),
  isDefault: r.isDefault,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

const imageIds = (elements: readonly CardElement[]) =>
  elements.flatMap((e) => (e.type === 'image' ? [e.fileId] : []));

function checkImage(bytes: Buffer, mime: keyof typeof IMAGE_MAGIC, max: number, message: string) {
  const magic = IMAGE_MAGIC[mime];
  if (bytes.length === 0 || bytes.length > max || !magic.every((b, i) => bytes[i] === b))
    throw invalid(message);
}

/** Tata letak harus cocok dengan jenis kartu dan semua berkas rujukannya milik sekolah ini. */
async function checkTemplate(
  tx: Tx,
  kind: CardKind,
  layout: z.infer<typeof layoutSchema>,
  backgroundFileId: string | null | undefined,
) {
  const bad = invalidFieldsForKind(kind, layout.elements);
  if (bad.length > 0) throw invalid(`Kolom tidak berlaku untuk kartu ${kind}: ${bad.join(', ')}.`);
  const ids = [...new Set([...imageIds(layout.elements), ...(backgroundFileId ? [backgroundFileId] : [])])];
  if (ids.length === 0) return;
  const found = await tx
    .select({ id: schoolFile.id })
    .from(schoolFile)
    .where(and(inArray(schoolFile.id, ids), inArray(schoolFile.kind, ['card_background', 'logo'])));
  if (found.length !== ids.length) {
    throw new HttpError(
      400,
      'invalid_reference',
      'Gambar latar atau gambar elemen tidak ditemukan di sekolah ini.',
    );
  }
}

/** Hapus berkas latar bila tak ada templat lain yang merujuknya (sebagai latar maupun elemen gambar). */
async function dropFilesIfUnused(tx: Tx, fileIds: readonly string[]) {
  for (const id of new Set(fileIds)) {
    const used = await tx
      .select({ id: cardTemplate.id })
      .from(cardTemplate)
      .where(or(eq(cardTemplate.backgroundFileId, id), sql`${cardTemplate.elements}::text like ${`%${id}%`}`))
      .limit(1);
    if (used.length === 0) {
      await tx.delete(schoolFile).where(and(eq(schoolFile.id, id), eq(schoolFile.kind, 'card_background')));
    }
  }
}

const filesOf = (r: Pick<TemplateRow, 'backgroundFileId' | 'elements'>) => [
  ...(r.backgroundFileId ? [r.backgroundFileId] : []),
  ...imageIds(r.elements as unknown as CardElement[]),
];

async function makeDefault(tx: Tx, kind: CardKind, id: string) {
  await tx
    .update(cardTemplate)
    .set({ isDefault: false })
    .where(and(eq(cardTemplate.kind, kind), ne(cardTemplate.id, id), eq(cardTemplate.isDefault, true)));
  await tx.update(cardTemplate).set({ isDefault: true }).where(eq(cardTemplate.id, id));
}

const dataItemBase = {
  schoolName: z.string(),
  academicYear: z.string(),
};

const studentCardItem = z.object({
  studentId: z.uuid(),
  name: z.string(),
  nis: z.string(),
  nisn: z.string(),
  gender: z.string().describe('L atau P'),
  className: z.string(),
  birthPlaceDate: z.string().describe('"Bandung, 5 Oktober 2010"'),
  address: z.string(),
  rfidCode: z.string().describe('Kode kartu RFID aktif pertama; kosong bila belum ada'),
  qrCode: z
    .string()
    .describe('Isi QR identitas siswa yang dicetak (`ES1.<kode acak>`); dibuat otomatis bila belum ada'),
  photoUrl: z.string().nullable().describe('Jalur foto (butuh login & x-school-id), null bila belum ada'),
  ...dataItemBase,
});

const scheduleLine = z.object({
  subject: z.string(),
  date: z.string().nullable(),
  time: z.string().describe('"07.30 - 09.00 WIB" atau kosong'),
});

const examCardItem = z.object({
  studentId: z.uuid(),
  classId: z.uuid(),
  name: z.string(),
  nis: z.string(),
  className: z.string(),
  participantNo: z.string(),
  examTitle: z.string(),
  typeName: z.string(),
  room: z.string().describe('Belum ada data ruang di sistem; selalu kosong'),
  date: z.string(),
  time: z.string(),
  subjectList: z.array(z.string()),
  schedule: z.array(scheduleLine),
  photoUrl: z.string().nullable(),
  ...dataItemBase,
});

const photoPath = (studentId: string, fileId: string | null) =>
  fileId ? `/v1/students/${studentId}/photo` : null;

/** Kartu siswa dan kartu peserta ujian cetak: templat yang bisa diatur, foto siswa, dan data cetak. */
export async function cardRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  /* ---------- Templat ---------- */

  app.get(
    '/v1/cards/templates/defaults',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Templat bawaan sistem (tidak disimpan)',
        description:
          'Izin: `student:read`. Tata letak kartu siswa (CR80 86x54 mm) dan kartu peserta ujian (100x60 mm) bawaan. ' +
          'Tidak menyimpan apa pun: UI menampilkannya sebagai pilihan "tambah dari bawaan" lalu menyimpannya lewat ' +
          '`POST /v1/cards/templates`. Sekolah tanpa templat tersimpan memakai bawaan ini saat mencetak.',
        headers: schoolHeader,
        response: {
          200: z.object({
            student: z.object({ name: z.string(), layout: layoutSchema }),
            exam: z.object({ name: z.string(), layout: layoutSchema }),
          }),
          ...guarded,
        },
      },
    },
    async () => ({
      student: { name: DEFAULT_CARD_TEMPLATE_NAME.student, layout: defaultStudentCardLayout() },
      exam: { name: DEFAULT_CARD_TEMPLATE_NAME.exam, layout: defaultExamCardLayout() },
    }),
  );

  app.get(
    '/v1/cards/templates',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar templat kartu',
        description:
          'Izin: `student:read`. Filter `kind` (student atau exam). Templat bawaan sekolah (`isDefault`) paling atas. ' +
          'Sekolah baru belum punya templat tersimpan; lihat `GET /v1/cards/templates/defaults`.',
        headers: schoolHeader,
        querystring: z.object({ kind: kindEnum.optional() }),
        response: { 200: z.array(templateSchema), ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const rows = await tx
          .select()
          .from(cardTemplate)
          .where(request.query.kind ? eq(cardTemplate.kind, request.query.kind) : undefined)
          .orderBy(asc(cardTemplate.kind), desc(cardTemplate.isDefault), asc(cardTemplate.name));
        return rows.map(view);
      }),
  );

  app.get(
    '/v1/cards/templates/:id',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Detail templat kartu',
        description: 'Izin: `student:read`. 404 `not_found` bila tidak ada.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: templateSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const [row] = await tx.select().from(cardTemplate).where(eq(cardTemplate.id, request.params.id));
        if (!row) throw notFound('Templat');
        return view(row);
      }),
  );

  app.post(
    '/v1/cards/templates',
    {
      onRequest: designGate,
      schema: {
        tags: tag,
        summary: 'Buat templat kartu',
        description:
          'Izin: `school:manage`. `layout` divalidasi (koordinat dalam mm di dalam kanvas, maksimal 60 elemen, kolom ' +
          'terikat sesuai `kind`): 400 `validation` bila salah, 400 `invalid_reference` bila gambar tidak ada. ' +
          'Templat pertama untuk suatu jenis otomatis menjadi bawaan; `isDefault: true` mengambil alih. ' +
          'Nama kembar dalam satu jenis ditolak (409 `conflict`).',
        headers: schoolHeader,
        body: createBody,
        response: { 201: templateSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      const row = await conflictAs409('Nama templat sudah dipakai.', () =>
        tenant(request, async (tx) => {
          await checkTemplate(tx, b.kind, b.layout, b.backgroundFileId);
          const [first] = await tx
            .select({ id: cardTemplate.id })
            .from(cardTemplate)
            .where(eq(cardTemplate.kind, b.kind))
            .limit(1);
          const [created] = await tx
            .insert(cardTemplate)
            .values({
              schoolId: ctx.schoolId,
              kind: b.kind,
              name: b.name,
              widthMm: b.layout.widthMm,
              heightMm: b.layout.heightMm,
              backgroundFileId: b.backgroundFileId ?? null,
              elements: b.layout.elements as unknown as Record<string, unknown>[],
              isDefault: !first,
            })
            .returning();
          if (b.isDefault) await makeDefault(tx, b.kind, created!.id);
          await audit(tx, ctx, 'card.template_create', 'card_template', created!.id, {
            kind: b.kind,
            name: b.name,
          });
          const [fresh] = await tx.select().from(cardTemplate).where(eq(cardTemplate.id, created!.id));
          return fresh!;
        }),
      );
      return reply.code(201).send(view(row));
    },
  );

  app.put(
    '/v1/cards/templates/:id',
    {
      onRequest: designGate,
      schema: {
        tags: tag,
        summary: 'Ubah templat kartu',
        description:
          'Izin: `school:manage`. Mengganti seluruh isi (nama, tata letak, latar); `kind` tidak bisa diubah. ' +
          '`isDefault: true` menjadikannya bawaan (false tidak melepas bawaan; pilih templat lain). ' +
          'Latar/gambar yang tidak lagi dipakai templat mana pun dihapus.',
        headers: schoolHeader,
        params: idParams,
        body: templateFields,
        response: { 200: templateSchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      return conflictAs409('Nama templat sudah dipakai.', () =>
        tenant(request, async (tx) => {
          const [old] = await tx.select().from(cardTemplate).where(eq(cardTemplate.id, request.params.id));
          if (!old) throw notFound('Templat');
          await checkTemplate(tx, old.kind, b.layout, b.backgroundFileId);
          await tx
            .update(cardTemplate)
            .set({
              name: b.name,
              widthMm: b.layout.widthMm,
              heightMm: b.layout.heightMm,
              backgroundFileId: b.backgroundFileId ?? null,
              elements: b.layout.elements as unknown as Record<string, unknown>[],
              updatedAt: new Date(),
            })
            .where(eq(cardTemplate.id, old.id));
          if (b.isDefault) await makeDefault(tx, old.kind, old.id);
          await dropFilesIfUnused(tx, filesOf(old));
          await audit(tx, ctx, 'card.template_update', 'card_template', old.id, { name: b.name });
          const [fresh] = await tx.select().from(cardTemplate).where(eq(cardTemplate.id, old.id));
          return view(fresh!);
        }),
      );
    },
  );

  app.delete(
    '/v1/cards/templates/:id',
    {
      onRequest: designGate,
      schema: {
        tags: tag,
        summary: 'Hapus templat kartu',
        description:
          'Izin: `school:manage`. Bila yang dihapus adalah bawaan, templat tertua yang tersisa untuk jenis yang sama ' +
          'menjadi bawaan; bila tidak ada lagi, pencetakan memakai bawaan sistem. 404 `not_found` bila tidak ada.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      await tenant(request, async (tx) => {
        const [old] = await tx.select().from(cardTemplate).where(eq(cardTemplate.id, request.params.id));
        if (!old) throw notFound('Templat');
        await tx.delete(cardTemplate).where(eq(cardTemplate.id, old.id));
        if (old.isDefault) {
          const [next] = await tx
            .select({ id: cardTemplate.id })
            .from(cardTemplate)
            .where(eq(cardTemplate.kind, old.kind))
            .orderBy(asc(cardTemplate.createdAt), asc(cardTemplate.id))
            .limit(1);
          if (next)
            await tx.update(cardTemplate).set({ isDefault: true }).where(eq(cardTemplate.id, next.id));
        }
        await dropFilesIfUnused(tx, filesOf(old));
        await audit(tx, ctx, 'card.template_delete', 'card_template', old.id, {
          kind: old.kind,
          name: old.name,
        });
      });
      return { ok: true as const };
    },
  );

  app.post(
    '/v1/cards/templates/:id/duplicate',
    {
      onRequest: designGate,
      schema: {
        tags: tag,
        summary: 'Gandakan templat kartu',
        description:
          'Izin: `school:manage`. Salinan bernama "<nama> (salinan)" (diberi nomor bila sudah ada), bukan bawaan. ' +
          'Latar dipakai bersama; berkas tidak dihapus selama masih ada templat yang merujuknya.',
        headers: schoolHeader,
        params: idParams,
        response: { 201: templateSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const row = await conflictAs409('Nama templat sudah dipakai.', () =>
        tenant(request, async (tx) => {
          const [src] = await tx.select().from(cardTemplate).where(eq(cardTemplate.id, request.params.id));
          if (!src) throw notFound('Templat');
          const names = new Set(
            (
              await tx
                .select({ name: cardTemplate.name })
                .from(cardTemplate)
                .where(eq(cardTemplate.kind, src.kind))
            ).map((r) => r.name),
          );
          const base = src.name.slice(0, 80);
          let name = `${base} (salinan)`;
          for (let n = 2; names.has(name); n++) name = `${base} (salinan ${n})`;
          const [created] = await tx
            .insert(cardTemplate)
            .values({
              schoolId: ctx.schoolId,
              kind: src.kind,
              name,
              widthMm: src.widthMm,
              heightMm: src.heightMm,
              backgroundFileId: src.backgroundFileId,
              elements: src.elements,
              isDefault: false,
            })
            .returning();
          await audit(tx, ctx, 'card.template_duplicate', 'card_template', created!.id, { from: src.id });
          return created!;
        }),
      );
      return reply.code(201).send(view(row));
    },
  );

  app.put(
    '/v1/cards/templates/:id/default',
    {
      onRequest: designGate,
      schema: {
        tags: tag,
        summary: 'Jadikan templat bawaan',
        description:
          'Izin: `school:manage`. Tepat satu templat bawaan per jenis; yang sebelumnya otomatis dilepas.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: templateSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const [row] = await tx.select().from(cardTemplate).where(eq(cardTemplate.id, request.params.id));
        if (!row) throw notFound('Templat');
        await makeDefault(tx, row.kind, row.id);
        await audit(tx, ctx, 'card.template_default', 'card_template', row.id, { kind: row.kind });
        const [fresh] = await tx.select().from(cardTemplate).where(eq(cardTemplate.id, row.id));
        return view(fresh!);
      });
    },
  );

  /* ---------- Berkas ---------- */

  app.post(
    '/v1/cards/backgrounds',
    {
      onRequest: designGate,
      bodyLimit: 3 * 1024 * 1024,
      schema: {
        tags: tag,
        summary: 'Unggah gambar latar/elemen kartu',
        description:
          'Izin: `school:manage`. PNG atau JPEG sampai 1,5 MB, dikirim sebagai base64 di `data` (tanpa awalan ' +
          '`data:`); isi berkas diperiksa terhadap `mime` (400 `validation`). `id` dipakai sebagai ' +
          '`backgroundFileId` templat atau `fileId` elemen gambar; `url` publik dan tidak bisa ditebak. ' +
          'Berkas yang tak dirujuk templat apa pun dihapus saat templat diubah/dihapus.',
        headers: schoolHeader,
        body: z.object({
          mime: z.enum(['image/png', 'image/jpeg']),
          data: z.string().min(1).max(2_100_000),
        }),
        response: { 201: z.object({ id: z.uuid(), url: z.string() }), 400: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const bytes = Buffer.from(request.body.data, 'base64');
      checkImage(
        bytes,
        request.body.mime,
        MAX_BACKGROUND_BYTES,
        'Gambar harus PNG atau JPEG berukuran maksimal 1,5 MB.',
      );
      const file = await tenant(request, async (tx) => {
        const [f] = await tx
          .insert(schoolFile)
          .values({
            schoolId: ctx.schoolId,
            kind: 'card_background',
            mime: request.body.mime,
            size: bytes.length,
            data: bytes,
          })
          .returning({ id: schoolFile.id });
        await audit(tx, ctx, 'card.background_upload', 'school_file', f!.id, { size: bytes.length });
        return f!;
      });
      return reply.code(201).send({ id: file.id, url: filePath(file.id) as string });
    },
  );

  /* ---------- Foto siswa ---------- */

  app.post(
    '/v1/students/:id/photo',
    {
      onRequest: [requirePermission('student:manage')],
      bodyLimit: 1024 * 1024,
      schema: {
        tags: tag,
        summary: 'Unggah foto siswa',
        description:
          'Izin: `student:manage`. JPEG atau PNG sampai 500 KB, base64 di `data` (tanpa awalan `data:`); isi berkas ' +
          'diperiksa terhadap `mime` (400 `validation`). Foto lama diganti. Foto tidak publik: diambil lewat ' +
          '`GET /v1/students/:id/photo`.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({
          mime: z.enum(['image/png', 'image/jpeg']),
          data: z.string().min(1).max(700_000),
        }),
        response: { 200: z.object({ photoUrl: z.string() }), 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const bytes = Buffer.from(request.body.data, 'base64');
      checkImage(
        bytes,
        request.body.mime,
        MAX_PHOTO_BYTES,
        'Foto harus JPEG atau PNG berukuran maksimal 500 KB.',
      );
      return tenant(request, async (tx) => {
        const [s] = await tx
          .select({ id: student.id, photo: student.photoFileId })
          .from(student)
          .where(eq(student.id, request.params.id));
        if (!s) throw notFound('Siswa');
        const [f] = await tx
          .insert(schoolFile)
          .values({
            schoolId: ctx.schoolId,
            kind: 'student_photo',
            mime: request.body.mime,
            size: bytes.length,
            data: bytes,
          })
          .returning({ id: schoolFile.id });
        await tx.update(student).set({ photoFileId: f!.id }).where(eq(student.id, s.id));
        if (s.photo) await tx.delete(schoolFile).where(eq(schoolFile.id, s.photo));
        await audit(tx, ctx, 'student.photo_upload', 'student', s.id, { size: bytes.length });
        return { photoUrl: `/v1/students/${s.id}/photo` };
      });
    },
  );

  app.delete(
    '/v1/students/:id/photo',
    {
      onRequest: [requirePermission('student:manage')],
      schema: {
        tags: tag,
        summary: 'Hapus foto siswa',
        description:
          'Izin: `student:manage`. Tidak error bila foto memang belum ada; 404 bila siswa tidak ada.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      await tenant(request, async (tx) => {
        const [s] = await tx
          .select({ id: student.id, photo: student.photoFileId })
          .from(student)
          .where(eq(student.id, request.params.id));
        if (!s) throw notFound('Siswa');
        if (!s.photo) return;
        await tx.delete(schoolFile).where(eq(schoolFile.id, s.photo)); // FK set null mengosongkan kolom foto
        await audit(tx, ctx, 'student.photo_delete', 'student', s.id);
      });
      return { ok: true as const };
    },
  );

  app.get(
    '/v1/students/:id/photo',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Foto siswa',
        description:
          'Izin: `student:read`. Isi gambar (JPEG atau PNG), hanya untuk anggota sekolah yang berhak (bukan publik; ' +
          'klien menyertakan `x-school-id` dan cookie). 404 `not_found` bila siswa atau fotonya tidak ada.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: z.any().describe('Isi gambar (JPEG atau PNG)'), 404: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const file = await tenant(request, async (tx) => {
        const [row] = await tx
          .select({ mime: schoolFile.mime, data: schoolFile.data })
          .from(student)
          .innerJoin(schoolFile, eq(schoolFile.id, student.photoFileId))
          .where(eq(student.id, request.params.id));
        return row;
      });
      if (!file) throw notFound('Foto');
      return reply
        .header('content-type', file.mime)
        .header('cache-control', 'private, max-age=300')
        .header('x-content-type-options', 'nosniff')
        .send(file.data);
    },
  );

  /* ---------- Data cetak ---------- */

  app.get(
    '/v1/cards/students',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Data cetak kartu siswa',
        description:
          `Izin: \`student:read\`. Wajib \`classId\` (siswa aktif kelas itu) dan/atau \`studentIds\` (uuid dipisah koma, ` +
          `maks. ${MAX_CARD_ROWS}). Tanpa \`classId\`, kelas diambil dari tahun ajaran aktif. Setiap baris memuat nilai ` +
          'kolom terikat (nama, NIS, kelas, kode RFID aktif pertama, tahun ajaran, nama sekolah) dan jalur foto. ' +
          `Dibatasi ${MAX_CARD_ROWS} baris (\`truncated: true\` bila lebih). \`qrCode\` = isi QR identitas siswa ` +
          '(`ES1.<kode acak>`, satu per siswa, dipakai semua fitur); kode yang belum ada dibuat otomatis secara ' +
          'idempoten (satu-satunya efek tulis endpoint ini, dicatat di audit `student.identity_code.create`). PDF ' +
          'dirender di klien.',
        headers: schoolHeader,
        querystring: z.object({
          classId: z.uuid().optional(),
          studentIds: z.string().max(20_000).optional(),
        }),
        response: {
          200: z.object({
            schoolName: z.string(),
            truncated: z.boolean(),
            items: z.array(studentCardItem),
          }),
          400: errorSchema,
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const { classId } = request.query;
      const ids = (request.query.studentIds ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (!classId && ids.length === 0) throw invalid('Isi classId atau studentIds.');
      if (ids.length > MAX_CARD_ROWS || !ids.every((i) => z.uuid().safeParse(i).success)) {
        throw invalid(`studentIds harus uuid dipisah koma, maksimal ${MAX_CARD_ROWS}.`);
      }
      return tenant(request, async (tx) => {
        const identity = await readIdentity(tx, (request.ctx as TenantContext).schoolId);
        const schoolName = identity.officialName ?? identity.name;
        let yearId: string | null = null;
        if (classId) {
          const [c] = await tx
            .select({ yearId: classRoom.academicYearId })
            .from(classRoom)
            .where(eq(classRoom.id, classId));
          if (!c) throw notFound('Kelas');
          yearId = c.yearId;
        } else {
          const [y] = await tx
            .select({ id: academicYear.id })
            .from(academicYear)
            .orderBy(desc(academicYear.isActive), desc(academicYear.startsOn))
            .limit(1);
          yearId = y?.id ?? null;
        }
        const [year] = yearId
          ? await tx.select({ name: academicYear.name }).from(academicYear).where(eq(academicYear.id, yearId))
          : [];
        const rows = await tx
          .select({
            id: student.id,
            name: student.name,
            nis: student.nis,
            nisn: student.nisn,
            gender: student.gender,
            birthDate: student.birthDate,
            birthPlace: student.birthPlace,
            address: student.address,
            photo: student.photoFileId,
            className: classRoom.name,
          })
          .from(student)
          .leftJoin(
            enrollment,
            and(
              eq(enrollment.studentId, student.id),
              yearId ? eq(enrollment.academicYearId, yearId) : sql`false`,
            ),
          )
          .leftJoin(classRoom, eq(classRoom.id, enrollment.classId))
          .where(
            and(
              sql`${student.deletedAt} is null`,
              classId ? eq(enrollment.classId, classId) : undefined,
              classId ? eq(student.status, 'active') : undefined,
              ids.length > 0 ? inArray(student.id, ids) : undefined,
            ),
          )
          .orderBy(asc(student.name), asc(student.id))
          .limit(MAX_CARD_ROWS + 1);
        const truncated = rows.length > MAX_CARD_ROWS;
        const page = rows.slice(0, MAX_CARD_ROWS);
        const codes = page.length
          ? await tx
              .select({ studentId: attendanceCard.studentId, code: attendanceCard.code })
              .from(attendanceCard)
              .where(
                and(
                  inArray(
                    attendanceCard.studentId,
                    page.map((r) => r.id),
                  ),
                  eq(attendanceCard.kind, 'rfid'),
                  eq(attendanceCard.active, true),
                ),
              )
              .orderBy(asc(attendanceCard.createdAt), asc(attendanceCard.id))
          : [];
        const firstCode = new Map<string, string>();
        for (const c of codes) if (!firstCode.has(c.studentId)) firstCode.set(c.studentId, c.code);
        // QR identitas: dibuat secara malas dan idempoten (satu per siswa) agar kartu siap cetak tanpa langkah tambahan.
        const qr = await ensureIdentityCodes(
          tx,
          (request.ctx as TenantContext).schoolId,
          page.map((r) => r.id),
        );
        if (qr.created > 0) {
          await audit(
            tx,
            request.ctx as TenantContext,
            'student.identity_code.create',
            'school',
            (request.ctx as TenantContext).schoolId,
            {
              created: qr.created,
            },
          );
        }
        return {
          schoolName,
          truncated,
          items: page.map((r) => ({
            studentId: r.id,
            name: r.name,
            nis: r.nis ?? '',
            nisn: r.nisn ?? '',
            gender: r.gender,
            className: r.className ?? '',
            birthPlaceDate: [r.birthPlace, r.birthDate ? formatLongDateId(r.birthDate) : null]
              .filter(Boolean)
              .join(', '),
            address: r.address ?? '',
            rfidCode: firstCode.get(r.id) ?? '',
            qrCode: qr.codes.has(r.id) ? formatIdentityPayload(qr.codes.get(r.id) as string) : '',
            photoUrl: photoPath(r.id, r.photo),
            schoolName,
            academicYear: year?.name ?? '',
          })),
        };
      });
    },
  );

  app.get(
    '/v1/cards/exam-participants',
    {
      onRequest: examDataGate,
      schema: {
        tags: tag,
        summary: 'Data cetak kartu peserta ujian',
        description:
          'Izin: `exam:read`; modul `exams`. Dua cara: `examId` (semua kelas ujian itu; jenis dan semester ikut ujian) ' +
          'atau `semesterId` + `classId` (opsional `examTypeId` untuk membatasi jenis ujian). ' +
          '**Nomor peserta** = `<singkatan jenis ujian>-<yy>-<urutan 3 digit>`, mis. `ASTS-26-007`: `yy` dua digit ' +
          'tahun mulai tahun ajaran kelas, urutan = posisi siswa aktif di kelasnya diurut nama lalu id. Tanpa jenis ' +
          'ujian singkatannya `UJN`. Stabil selama susunan kelas tidak berubah. **Jadwal** = ujian pada semester itu ' +
          '(dan jenis yang sama bila ada) yang mencakup kelas siswa, urut tanggal lalu jam (semua status, termasuk ' +
          'draf). `date`/`time` ringkasan untuk kartu; `room` belum punya sumber data sehingga kosong. ' +
          `Dibatasi ${MAX_CARD_ROWS} baris (\`truncated\`). Hanya baca.`,
        headers: schoolHeader,
        querystring: z.object({
          examId: z.uuid().optional(),
          semesterId: z.uuid().optional(),
          classId: z.uuid().optional(),
          examTypeId: z.uuid().optional(),
        }),
        response: {
          200: z.object({
            schoolName: z.string(),
            truncated: z.boolean(),
            items: z.array(examCardItem),
          }),
          400: errorSchema,
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const q = request.query;
      if (!q.examId && !(q.semesterId && q.classId))
        throw invalid('Isi examId, atau semesterId dan classId.');
      return tenant(request, async (tx) => {
        const ctx = request.ctx as TenantContext;
        const identity = await readIdentity(tx, ctx.schoolId);
        const schoolName = identity.officialName ?? identity.name;
        const [sch] = await tx
          .select({ tz: school.timezone })
          .from(school)
          .where(eq(school.id, ctx.schoolId));
        const zone = ZONE_LABEL[sch?.tz ?? ''] ?? 'WIB';

        let semesterId: string;
        let classIds: string[];
        let typeFilter: ReturnType<typeof eq> | undefined;
        let typeName = 'Ujian';
        let typeShort = 'UJN';
        if (q.examId) {
          const [e] = await tx.select().from(exam).where(eq(exam.id, q.examId));
          if (!e) throw notFound('Ujian');
          semesterId = e.semesterId;
          classIds = e.classIds;
          typeName = e.typeName;
          typeShort = e.typeShort;
          typeFilter = e.examTypeId ? eq(exam.examTypeId, e.examTypeId) : eq(exam.typeShort, e.typeShort);
        } else {
          semesterId = q.semesterId as string;
          classIds = [q.classId as string];
          if (q.examTypeId) {
            const [t] = await tx.select().from(examType).where(eq(examType.id, q.examTypeId));
            if (!t) throw notFound('Jenis ujian');
            typeName = t.name;
            typeShort = t.shortName;
            typeFilter = eq(exam.examTypeId, t.id);
          }
        }
        const [sem] = await tx
          .select({ name: semester.name })
          .from(semester)
          .where(eq(semester.id, semesterId));
        if (!sem) throw notFound('Semester');

        const classes = classIds.length
          ? await tx
              .select({
                id: classRoom.id,
                name: classRoom.name,
                yearName: academicYear.name,
                yearStart: academicYear.startsOn,
              })
              .from(classRoom)
              .innerJoin(academicYear, eq(academicYear.id, classRoom.academicYearId))
              .where(inArray(classRoom.id, classIds))
              .orderBy(asc(classRoom.name))
          : [];
        if (q.classId && classes.length === 0) throw notFound('Kelas');

        const exams = await tx
          .select({
            classIds: exam.classIds,
            subject: subject.name,
            date: exam.examDate,
            start: exam.startTime,
            minutes: exam.durationMinutes,
          })
          .from(exam)
          .innerJoin(subject, eq(subject.id, exam.subjectId))
          .where(and(eq(exam.semesterId, semesterId), typeFilter))
          .orderBy(asc(exam.examDate), asc(exam.startTime), asc(subject.name));

        const items: z.infer<typeof examCardItem>[] = [];
        let truncated = false;
        for (const cls of classes) {
          const sched = exams
            .filter((e) => e.classIds.includes(cls.id))
            .map((e) => ({
              subject: e.subject,
              date: e.date,
              time: examTimeRange(e.start, e.minutes, zone),
            }));
          const dates = [...new Set(sched.flatMap((s) => (s.date ? [s.date] : [])))].sort();
          const times = new Set(sched.map((s) => s.time));
          const date =
            dates.length === 0
              ? ''
              : dates.length === 1
                ? formatLongDateId(dates[0] as string)
                : `${formatLongDateId(dates[0] as string)} s.d. ${formatLongDateId(dates[dates.length - 1] as string)}`;
          const time = times.size === 1 ? ([...times][0] as string) : '';
          const subjectList = sched.map((s) => {
            const p = s.date ? examDateParts(s.date) : null;
            const when = [p ? `${p.day}, ${p.date}` : '', s.time].filter(Boolean).join(', ');
            return when ? `${s.subject}: ${when}` : s.subject;
          });
          const roster = await tx
            .select({ id: student.id, name: student.name, nis: student.nis, photo: student.photoFileId })
            .from(enrollment)
            .innerJoin(student, eq(student.id, enrollment.studentId))
            .where(
              and(
                eq(enrollment.classId, cls.id),
                eq(student.status, 'active'),
                sql`${student.deletedAt} is null`,
              ),
            )
            .orderBy(asc(student.name), asc(student.id));
          const examTitle = `${typeName} ${sem.name} ${cls.yearName}`;
          for (const [i, st] of roster.entries()) {
            if (items.length >= MAX_CARD_ROWS) {
              truncated = true;
              break;
            }
            items.push({
              studentId: st.id,
              classId: cls.id,
              name: st.name,
              nis: st.nis ?? '',
              className: cls.name,
              participantNo: formatParticipantNo(typeShort, cls.yearStart, i + 1),
              examTitle,
              typeName,
              room: '',
              date,
              time,
              subjectList,
              schedule: sched,
              photoUrl: photoPath(st.id, st.photo),
              schoolName,
              academicYear: cls.yearName,
            });
          }
          if (truncated) break;
        }
        return { schoolName, truncated, items };
      });
    },
  );
}
