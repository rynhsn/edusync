import {
  DEFAULT_PKL_CERTIFICATE_PATTERN,
  DEFAULT_UKK_CERTIFICATE_PATTERN,
  UKK_BAND_SOURCES,
  UKK_DEFAULT_BANDS,
  UKK_PATTERNS,
  validateNumberPattern,
  validPklWeights,
  validUkkBands,
  validUkkWeights,
  vocationalConcentrationBodySchema,
  vocationalFieldBodySchema,
  vocationalPklSettingSchema,
  vocationalProgramBodySchema,
  vocationalReportSettingSchema,
  vocationalUkkSettingSchema,
} from '@edusync/contracts';
import {
  asc,
  count,
  eq,
  program,
  programConcentration,
  refEducationProfile,
  school,
  type Tx,
  vocationalConcentration,
  vocationalField,
  vocationalProgram,
  vocationalSetting,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { audit, conflictAs409, guarded, idParams, isForeignKeyViolation, ok, schoolHeader } from './helpers';

const tags = ['Vocational'];

/** Gerbang modul berbayar `internship` (fase 5: tidak ada modul katalog baru). Profil kejuruan diperiksa di `requireVocational`. */
const gate = (
  perm:
    | 'class:read'
    | 'class:manage'
    | 'report_card:read'
    | 'report_card:manage'
    | 'pkl:read'
    | 'pkl:manage'
    | 'ukk:read'
    | 'ukk:manage',
) => [requirePermission(perm), requireModule('internship')];

const notFound = (what: string) => new HttpError(404, 'not_found', `${what} tidak ditemukan.`);
const invalidRef = (message: string) => new HttpError(400, 'invalid_reference', message);
const inUse = (what: string) =>
  new HttpError(409, 'in_use', `${what} masih dipakai; nonaktifkan saja bila tidak dipakai lagi.`);

/**
 * Hanya jenjang kejuruan (`ref_education_profile.vocational`). Sekolah yang jenjangnya belum ditetapkan (null) tetap boleh,
 * sama dengan menu web (`hiddenByProfile`): tidak ada fitur yang hilang diam-diam pada sekolah lama.
 */
export async function requireVocational(tx: Tx, schoolId: string) {
  const [row] = await tx
    .select({ vocational: refEducationProfile.vocational })
    .from(school)
    .leftJoin(refEducationProfile, eq(refEducationProfile.key, school.educationProfile))
    .where(eq(school.id, schoolId));
  if (row?.vocational === false) {
    throw new HttpError(404, 'not_vocational', 'Fitur ini hanya untuk jenjang kejuruan (SMK/MAK).');
  }
}

const fieldOut = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  dapodikCode: z.string().nullable(),
  sourceRef: z.string().nullable(),
  sort: z.number().int(),
  active: z.boolean(),
  programCount: z.number().int().describe('Jumlah program keahlian di bidang ini'),
});
const programOut = z.object({
  id: z.uuid(),
  fieldId: z.uuid(),
  code: z.string(),
  name: z.string(),
  dapodikCode: z.string().nullable(),
  sort: z.number().int(),
  active: z.boolean(),
  concentrationCount: z.number().int().describe('Jumlah konsentrasi keahlian di program ini'),
});
const concentrationOut = z.object({
  id: z.uuid(),
  vocationalProgramId: z.uuid(),
  code: z.string(),
  name: z.string(),
  dapodikCode: z.string().nullable(),
  sort: z.number().int(),
  active: z.boolean(),
  linkedPrograms: z
    .array(
      z.object({
        id: z.uuid(),
        code: z.string(),
        name: z.string(),
        durationYears: z.number().int().nullable(),
      }),
    )
    .describe('Program (unit operasional kelas) yang ditautkan ke konsentrasi ini'),
});
const linkOut = z.object({ programId: z.uuid(), concentrationId: z.uuid().nullable() });
const reportSettingOut = vocationalReportSettingSchema;

export async function vocationalRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], async (tx) => {
      await requireVocational(tx, (request.ctx as TenantContext).schoolId);
      return fn(tx);
    });

  /* ---------- Bidang keahlian ---------- */

  app.get(
    '/v1/vocational/fields',
    {
      onRequest: gate('class:read'),
      schema: {
        tags,
        summary: 'Daftar bidang keahlian',
        description:
          'Izin: `class:read`; modul `internship`; hanya jenjang kejuruan (404 `not_vocational`). Diisi sekolah, tanpa seed.',
        headers: schoolHeader,
        response: { 200: z.array(fieldOut), 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const rows = await tx
          .select({ f: vocationalField, n: count(vocationalProgram.id) })
          .from(vocationalField)
          .leftJoin(vocationalProgram, eq(vocationalProgram.fieldId, vocationalField.id))
          .groupBy(vocationalField.id)
          .orderBy(asc(vocationalField.sort), asc(vocationalField.name));
        return rows.map(({ f, n }) => ({
          id: f.id,
          code: f.code,
          name: f.name,
          dapodikCode: f.dapodikCode,
          sourceRef: f.sourceRef,
          sort: f.sort,
          active: f.active,
          programCount: n,
        }));
      }),
  );

  app.post(
    '/v1/vocational/fields',
    {
      onRequest: gate('class:manage'),
      schema: {
        tags,
        summary: 'Buat bidang keahlian',
        description:
          'Izin: `class:manage`; modul `internship`; hanya jenjang kejuruan. Kode unik per sekolah (409 `conflict`). ' +
          '`dapodikCode` dan `sourceRef` opsional dan informatif.',
        headers: schoolHeader,
        body: vocationalFieldBodySchema,
        response: { 201: fieldOut, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const row = await conflictAs409('Kode bidang itu sudah dipakai.', () =>
        tenant(request, async (tx) => {
          const [r] = await tx
            .insert(vocationalField)
            .values({ schoolId: ctx.schoolId, ...request.body })
            .returning();
          await audit(tx, ctx, 'vocational_field.create', 'vocational_field', r!.id, request.body);
          return r!;
        }),
      );
      return reply.code(201).send({ ...row, programCount: 0 });
    },
  );

  app.put(
    '/v1/vocational/fields/:id',
    {
      onRequest: gate('class:manage'),
      schema: {
        tags,
        summary: 'Ubah bidang keahlian',
        description:
          'Izin: `class:manage`; modul `internship`. Mengganti seluruh isian (kirim lengkap). Kode unik (409 `conflict`).',
        headers: schoolHeader,
        params: idParams,
        body: vocationalFieldBodySchema,
        response: { 200: fieldOut, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return conflictAs409('Kode bidang itu sudah dipakai.', () =>
        tenant(request, async (tx) => {
          const [r] = await tx
            .update(vocationalField)
            .set({ ...request.body, updatedAt: new Date() })
            .where(eq(vocationalField.id, request.params.id))
            .returning();
          if (!r) throw notFound('Bidang keahlian');
          const [c] = await tx
            .select({ n: count() })
            .from(vocationalProgram)
            .where(eq(vocationalProgram.fieldId, r.id));
          await audit(tx, ctx, 'vocational_field.update', 'vocational_field', r.id, request.body);
          return { ...r, programCount: c?.n ?? 0 };
        }),
      );
    },
  );

  app.delete(
    '/v1/vocational/fields/:id',
    {
      onRequest: gate('class:manage'),
      schema: {
        tags,
        summary: 'Hapus bidang keahlian',
        description:
          'Izin: `class:manage`; modul `internship`. 409 `in_use` bila masih punya program keahlian (nonaktifkan saja).',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      try {
        await tenant(request, async (tx) => {
          const rows = await tx
            .delete(vocationalField)
            .where(eq(vocationalField.id, request.params.id))
            .returning({ id: vocationalField.id });
          if (rows.length === 0) throw notFound('Bidang keahlian');
          await audit(tx, ctx, 'vocational_field.delete', 'vocational_field', request.params.id);
        });
      } catch (error) {
        if (isForeignKeyViolation(error)) throw inUse('Bidang keahlian');
        throw error;
      }
      return { ok: true as const };
    },
  );

  /* ---------- Program keahlian ---------- */

  const requireField = async (tx: Tx, id: string) => {
    const [f] = await tx
      .select({ id: vocationalField.id })
      .from(vocationalField)
      .where(eq(vocationalField.id, id));
    if (!f) throw invalidRef('Bidang keahlian tidak ditemukan.');
  };

  app.get(
    '/v1/vocational/programs-of-expertise',
    {
      onRequest: gate('class:read'),
      schema: {
        tags,
        summary: 'Daftar program keahlian',
        description:
          'Izin: `class:read`; modul `internship`; hanya jenjang kejuruan. Program keahlian (di bawah bidang) BUKAN `program` ' +
          'unit operasional kelas; keduanya dihubungkan lewat konsentrasi.',
        headers: schoolHeader,
        response: { 200: z.array(programOut), 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const rows = await tx
          .select({ p: vocationalProgram, n: count(vocationalConcentration.id) })
          .from(vocationalProgram)
          .leftJoin(
            vocationalConcentration,
            eq(vocationalConcentration.vocationalProgramId, vocationalProgram.id),
          )
          .groupBy(vocationalProgram.id)
          .orderBy(asc(vocationalProgram.sort), asc(vocationalProgram.name));
        return rows.map(({ p, n }) => ({
          id: p.id,
          fieldId: p.fieldId,
          code: p.code,
          name: p.name,
          dapodikCode: p.dapodikCode,
          sort: p.sort,
          active: p.active,
          concentrationCount: n,
        }));
      }),
  );

  app.post(
    '/v1/vocational/programs-of-expertise',
    {
      onRequest: gate('class:manage'),
      schema: {
        tags,
        summary: 'Buat program keahlian',
        description:
          'Izin: `class:manage`; modul `internship`. 400 `invalid_reference` bila bidang tidak ada; kode unik (409 `conflict`).',
        headers: schoolHeader,
        body: vocationalProgramBodySchema,
        response: { 201: programOut, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const row = await conflictAs409('Kode program keahlian itu sudah dipakai.', () =>
        tenant(request, async (tx) => {
          await requireField(tx, request.body.fieldId);
          const [r] = await tx
            .insert(vocationalProgram)
            .values({ schoolId: ctx.schoolId, ...request.body })
            .returning();
          await audit(tx, ctx, 'vocational_program.create', 'vocational_program', r!.id, request.body);
          return r!;
        }),
      );
      return reply.code(201).send({ ...row, concentrationCount: 0 });
    },
  );

  app.put(
    '/v1/vocational/programs-of-expertise/:id',
    {
      onRequest: gate('class:manage'),
      schema: {
        tags,
        summary: 'Ubah program keahlian',
        description:
          'Izin: `class:manage`; modul `internship`. Mengganti seluruh isian (kirim lengkap); `fieldId` boleh dipindah. ' +
          '400 `invalid_reference`, 409 `conflict`.',
        headers: schoolHeader,
        params: idParams,
        body: vocationalProgramBodySchema,
        response: { 200: programOut, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return conflictAs409('Kode program keahlian itu sudah dipakai.', () =>
        tenant(request, async (tx) => {
          await requireField(tx, request.body.fieldId);
          const [r] = await tx
            .update(vocationalProgram)
            .set({ ...request.body, updatedAt: new Date() })
            .where(eq(vocationalProgram.id, request.params.id))
            .returning();
          if (!r) throw notFound('Program keahlian');
          const [c] = await tx
            .select({ n: count() })
            .from(vocationalConcentration)
            .where(eq(vocationalConcentration.vocationalProgramId, r.id));
          await audit(tx, ctx, 'vocational_program.update', 'vocational_program', r.id, request.body);
          return { ...r, concentrationCount: c?.n ?? 0 };
        }),
      );
    },
  );

  app.delete(
    '/v1/vocational/programs-of-expertise/:id',
    {
      onRequest: gate('class:manage'),
      schema: {
        tags,
        summary: 'Hapus program keahlian',
        description:
          'Izin: `class:manage`; modul `internship`. 409 `in_use` bila masih punya konsentrasi keahlian (nonaktifkan saja).',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      try {
        await tenant(request, async (tx) => {
          const rows = await tx
            .delete(vocationalProgram)
            .where(eq(vocationalProgram.id, request.params.id))
            .returning({ id: vocationalProgram.id });
          if (rows.length === 0) throw notFound('Program keahlian');
          await audit(tx, ctx, 'vocational_program.delete', 'vocational_program', request.params.id);
        });
      } catch (error) {
        if (isForeignKeyViolation(error)) throw inUse('Program keahlian');
        throw error;
      }
      return { ok: true as const };
    },
  );

  /* ---------- Konsentrasi keahlian ---------- */

  const requireVocationalProgram = async (tx: Tx, id: string) => {
    const [p] = await tx
      .select({ id: vocationalProgram.id })
      .from(vocationalProgram)
      .where(eq(vocationalProgram.id, id));
    if (!p) throw invalidRef('Program keahlian tidak ditemukan.');
  };

  const concentrationsWithLinks = async (tx: Tx, only?: string) => {
    const rows = await tx
      .select()
      .from(vocationalConcentration)
      .where(only ? eq(vocationalConcentration.id, only) : undefined)
      .orderBy(asc(vocationalConcentration.sort), asc(vocationalConcentration.name));
    const links = await tx
      .select({
        concentrationId: programConcentration.concentrationId,
        id: program.id,
        code: program.code,
        name: program.name,
        durationYears: program.durationYears,
      })
      .from(programConcentration)
      .innerJoin(program, eq(program.id, programConcentration.programId))
      .orderBy(asc(program.name));
    return rows.map((c) => ({
      id: c.id,
      vocationalProgramId: c.vocationalProgramId,
      code: c.code,
      name: c.name,
      dapodikCode: c.dapodikCode,
      sort: c.sort,
      active: c.active,
      linkedPrograms: links
        .filter((l) => l.concentrationId === c.id)
        .map(({ id, code, name, durationYears }) => ({ id, code, name, durationYears })),
    }));
  };

  app.get(
    '/v1/vocational/concentrations',
    {
      onRequest: gate('class:read'),
      schema: {
        tags,
        summary: 'Daftar konsentrasi keahlian',
        description:
          'Izin: `class:read`; modul `internship`; hanya jenjang kejuruan. Tiap konsentrasi memuat `linkedPrograms` ' +
          '(program unit operasional yang ditautkan, beserta lama 3/4 tahun).',
        headers: schoolHeader,
        response: { 200: z.array(concentrationOut), 404: errorSchema, ...guarded },
      },
    },
    async (request) => tenant(request, (tx) => concentrationsWithLinks(tx)),
  );

  app.post(
    '/v1/vocational/concentrations',
    {
      onRequest: gate('class:manage'),
      schema: {
        tags,
        summary: 'Buat konsentrasi keahlian',
        description:
          'Izin: `class:manage`; modul `internship`. 400 `invalid_reference` bila program keahlian tidak ada; kode unik (409 `conflict`).',
        headers: schoolHeader,
        body: vocationalConcentrationBodySchema,
        response: { 201: concentrationOut, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const row = await conflictAs409('Kode konsentrasi itu sudah dipakai.', () =>
        tenant(request, async (tx) => {
          await requireVocationalProgram(tx, request.body.vocationalProgramId);
          const [r] = await tx
            .insert(vocationalConcentration)
            .values({ schoolId: ctx.schoolId, ...request.body })
            .returning();
          await audit(
            tx,
            ctx,
            'vocational_concentration.create',
            'vocational_concentration',
            r!.id,
            request.body,
          );
          return (await concentrationsWithLinks(tx, r!.id))[0]!;
        }),
      );
      return reply.code(201).send(row);
    },
  );

  app.put(
    '/v1/vocational/concentrations/:id',
    {
      onRequest: gate('class:manage'),
      schema: {
        tags,
        summary: 'Ubah konsentrasi keahlian',
        description:
          'Izin: `class:manage`; modul `internship`. Mengganti seluruh isian (kirim lengkap); `vocationalProgramId` boleh dipindah. ' +
          '400 `invalid_reference`, 409 `conflict`.',
        headers: schoolHeader,
        params: idParams,
        body: vocationalConcentrationBodySchema,
        response: { 200: concentrationOut, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return conflictAs409('Kode konsentrasi itu sudah dipakai.', () =>
        tenant(request, async (tx) => {
          await requireVocationalProgram(tx, request.body.vocationalProgramId);
          const [r] = await tx
            .update(vocationalConcentration)
            .set({ ...request.body, updatedAt: new Date() })
            .where(eq(vocationalConcentration.id, request.params.id))
            .returning();
          if (!r) throw notFound('Konsentrasi keahlian');
          await audit(
            tx,
            ctx,
            'vocational_concentration.update',
            'vocational_concentration',
            r.id,
            request.body,
          );
          return (await concentrationsWithLinks(tx, r.id))[0]!;
        }),
      );
    },
  );

  app.delete(
    '/v1/vocational/concentrations/:id',
    {
      onRequest: gate('class:manage'),
      schema: {
        tags,
        summary: 'Hapus konsentrasi keahlian',
        description:
          'Izin: `class:manage`; modul `internship`. 409 `in_use` bila masih ditautkan ke program unit operasional (nonaktifkan saja).',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      try {
        await tenant(request, async (tx) => {
          const rows = await tx
            .delete(vocationalConcentration)
            .where(eq(vocationalConcentration.id, request.params.id))
            .returning({ id: vocationalConcentration.id });
          if (rows.length === 0) throw notFound('Konsentrasi keahlian');
          await audit(
            tx,
            ctx,
            'vocational_concentration.delete',
            'vocational_concentration',
            request.params.id,
          );
        });
      } catch (error) {
        if (isForeignKeyViolation(error)) throw inUse('Konsentrasi keahlian');
        throw error;
      }
      return { ok: true as const };
    },
  );

  /* ---------- Tautan program (unit operasional) -> konsentrasi ---------- */

  app.put(
    '/v1/programs/:id/concentration',
    {
      onRequest: gate('class:manage'),
      schema: {
        tags,
        summary: 'Tautkan jurusan ke konsentrasi keahlian',
        description:
          'Izin: `class:manage`; modul `internship`; hanya jenjang kejuruan. `concentrationId` null melepas tautan. ' +
          'Satu konsentrasi boleh punya beberapa program (mis. 3 dan 4 tahun). 404 bila jurusan tidak ada; ' +
          '400 `invalid_reference` bila konsentrasi tidak ada. Tautan tidak mengubah kelas, JP, KKTP, atau nilai; ' +
          'identitas keahlian baru tampil di rapor bila sakelar `reportGrouped` menyala.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({ concentrationId: z.uuid().nullable() }),
        response: { 200: linkOut, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { concentrationId } = request.body;
      return tenant(request, async (tx) => {
        const [p] = await tx
          .select({ id: program.id })
          .from(program)
          .where(eq(program.id, request.params.id));
        if (!p) throw notFound('Jurusan');
        if (concentrationId === null) {
          await tx.delete(programConcentration).where(eq(programConcentration.programId, p.id));
        } else {
          const [c] = await tx
            .select({ id: vocationalConcentration.id })
            .from(vocationalConcentration)
            .where(eq(vocationalConcentration.id, concentrationId));
          if (!c) throw invalidRef('Konsentrasi keahlian tidak ditemukan.');
          await tx
            .insert(programConcentration)
            .values({ schoolId: ctx.schoolId, programId: p.id, concentrationId })
            .onConflictDoUpdate({ target: programConcentration.programId, set: { concentrationId } });
        }
        await audit(tx, ctx, 'program.concentration_link', 'program', p.id, { concentrationId });
        return { programId: p.id, concentrationId };
      });
    },
  );

  /* ---------- Pengaturan rapor kejuruan (5.2) ---------- */

  const readReportSetting = async (tx: Tx) => {
    const [s] = await tx.select().from(vocationalSetting);
    return { reportGrouped: s?.reportGrouped ?? false };
  };

  app.get(
    '/v1/vocational/settings/report',
    {
      onRequest: gate('report_card:read'),
      schema: {
        tags,
        summary: 'Pengaturan rapor kejuruan',
        description:
          'Izin: `report_card:read`; modul `internship`; hanya jenjang kejuruan. `reportGrouped` false bila belum pernah disimpan ' +
          '(tidak ada baris otomatis): rapor tidak dikelompokkan dan kop tanpa identitas keahlian, persis perilaku lama.',
        headers: schoolHeader,
        response: { 200: reportSettingOut, 404: errorSchema, ...guarded },
      },
    },
    async (request) => tenant(request, readReportSetting),
  );

  app.put(
    '/v1/vocational/settings/report',
    {
      onRequest: gate('report_card:manage'),
      schema: {
        tags,
        summary: 'Simpan pengaturan rapor kejuruan',
        description:
          'Izin: `report_card:manage`; modul `internship`; hanya jenjang kejuruan. `reportGrouped` true: dokumen rapor memuat ' +
          '`subjects[].group` (kelompok mapel beku dari `ref_subject_group`, mapel diurut per kelompok) dan `expertise` ' +
          '(bidang/program/konsentrasi, bila jurusan rombel ditautkan ke konsentrasi). Berlaku untuk rapor yang disusun sesudahnya; ' +
          'rapor final tidak berubah (snapshot beku).',
        headers: schoolHeader,
        body: vocationalReportSettingSchema,
        response: { 200: reportSettingOut, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const values = {
          reportGrouped: request.body.reportGrouped,
          updatedBy: ctx.userId,
          updatedAt: new Date(),
        };
        await tx
          .insert(vocationalSetting)
          .values({ schoolId: ctx.schoolId, ...values })
          .onConflictDoUpdate({ target: vocationalSetting.schoolId, set: values });
        await audit(
          tx,
          ctx,
          'vocational_setting.report_update',
          'vocational_setting',
          ctx.schoolId,
          request.body,
        );
        return readReportSetting(tx);
      });
    },
  );
  /* ---------- Pengaturan PKL kejuruan (5.3): bobot penilai dan pola nomor sertifikat ---------- */

  const pklSettingOut = z.object({
    schoolWeight: z.number().int().nullable(),
    industryWeight: z.number().int().nullable(),
    certificatePattern: z.string().nullable(),
    defaultCertificatePattern: z.string().describe('Pola yang dipakai bila `certificatePattern` null'),
  });
  const readPklSetting = async (tx: Tx) => {
    const [s] = await tx.select().from(vocationalSetting);
    return {
      schoolWeight: s?.pklSchoolWeight ?? null,
      industryWeight: s?.pklIndustryWeight ?? null,
      certificatePattern: s?.pklCertificatePattern ?? null,
      defaultCertificatePattern: DEFAULT_PKL_CERTIFICATE_PATTERN,
    };
  };

  app.get(
    '/v1/vocational/settings/pkl',
    {
      onRequest: gate('pkl:read'),
      schema: {
        tags,
        summary: 'Pengaturan PKL kejuruan',
        description:
          'Izin: `pkl:read`; modul `internship`; hanya jenjang kejuruan. Bobot penilai sekolah:industri (null = rumus lama: ' +
          'rata-rata penilai yang ada) dan pola nomor sertifikat (null = bawaan `PKL/{seq}/{code}/{year}`). Belum pernah disimpan: ' +
          'semua null, tanpa baris otomatis.',
        headers: schoolHeader,
        response: { 200: pklSettingOut, 404: errorSchema, ...guarded },
      },
    },
    async (request) => tenant(request, readPklSetting),
  );

  app.put(
    '/v1/vocational/settings/pkl',
    {
      onRequest: gate('pkl:manage'),
      schema: {
        tags,
        summary: 'Simpan pengaturan PKL kejuruan',
        description:
          'Izin: `pkl:manage`; modul `internship`; hanya jenjang kejuruan. `schoolWeight` dan `industryWeight` keduanya null ' +
          '(rata-rata penilai yang ada) atau keduanya bilangan bulat >= 0 berjumlah 100 (400 `invalid_weights`). Dengan bobot, nilai ' +
          'tiap aspek = rata-rata tertimbang penilai yang mengisi (bobot dinormalisasi atas penilai yang ada); berlaku pada semua ' +
          'layar PKL dan rapor yang disusun sesudahnya, rapor final tidak berubah (snapshot beku). `certificatePattern` memakai ' +
          'placeholder `{seq}`, `{code}`, `{roman}`, `{month}`, `{year}` (400 `invalid_pattern`); kosong = bawaan. Pola tidak diatur ' +
          'negara; ini usulan sekolah.',
        headers: schoolHeader,
        body: vocationalPklSettingSchema,
        response: { 200: pklSettingOut, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      if (
        (b.schoolWeight === null) !== (b.industryWeight === null) ||
        (b.schoolWeight !== null &&
          b.industryWeight !== null &&
          !validPklWeights({ school: b.schoolWeight, industry: b.industryWeight }))
      ) {
        throw new HttpError(
          400,
          'invalid_weights',
          'Bobot sekolah dan industri harus keduanya kosong atau keduanya bilangan bulat berjumlah 100.',
        );
      }
      if (b.certificatePattern !== null && !validateNumberPattern(b.certificatePattern).ok) {
        throw new HttpError(
          400,
          'invalid_pattern',
          'Pola nomor wajib memuat {seq} dan hanya memakai {seq}, {code}, {roman}, {month}, {year}.',
        );
      }
      return tenant(request, async (tx) => {
        const values = {
          pklSchoolWeight: b.schoolWeight,
          pklIndustryWeight: b.industryWeight,
          pklCertificatePattern: b.certificatePattern,
          updatedBy: ctx.userId,
          updatedAt: new Date(),
        };
        await tx
          .insert(vocationalSetting)
          .values({ schoolId: ctx.schoolId, ...values })
          .onConflictDoUpdate({ target: vocationalSetting.schoolId, set: values });
        await audit(tx, ctx, 'vocational_setting.pkl_update', 'vocational_setting', ctx.schoolId, { ...b });
        return readPklSetting(tx);
      });
    },
  );

  /* ---------- Pengaturan UKK kejuruan (5.5): skala, bobot, tampil di rapor, pola nomor ---------- */

  const bandOut = z.object({
    code: z.string(),
    label: z.string(),
    min: z.number(),
    competent: z.boolean(),
  });
  const ukkSettingOut = z.object({
    bands: z
      .object({
        lsp: z.array(bandOut).nullable(),
        industry: z.array(bandOut).nullable(),
        independent: z.array(bandOut).nullable(),
      })
      .describe('Skala timpaan sekolah per pola; null = bawaan kontrak'),
    defaultBands: z
      .object({ lsp: z.array(bandOut), industry: z.array(bandOut), independent: z.array(bandOut) })
      .describe('Skala bawaan kontrak (Pedoman UKK SMK TA 2025/2026), hanya usulan yang dapat ditimpa'),
    bandSources: z.object({
      lsp: z.object({ source: z.string(), verified: z.boolean() }),
      industry: z.object({ source: z.string(), verified: z.boolean() }),
      independent: z.object({ source: z.string(), verified: z.boolean() }),
    }),
    practiceWeight: z.number().int().nullable(),
    theoryWeight: z.number().int().nullable(),
    inReport: z.boolean(),
    certificatePattern: z.string().nullable(),
    defaultCertificatePattern: z.string(),
  });
  const readUkkSetting = async (tx: Tx) => {
    const [s] = await tx.select().from(vocationalSetting);
    const stored = s?.ukkBands ?? null;
    return {
      bands: {
        lsp: stored?.lsp ?? null,
        industry: stored?.industry ?? null,
        independent: stored?.independent ?? null,
      },
      defaultBands: {
        lsp: UKK_DEFAULT_BANDS.lsp.map((b) => ({ ...b })),
        industry: UKK_DEFAULT_BANDS.industry.map((b) => ({ ...b })),
        independent: UKK_DEFAULT_BANDS.independent.map((b) => ({ ...b })),
      },
      bandSources: UKK_BAND_SOURCES,
      practiceWeight: s?.ukkPracticeWeight ?? null,
      theoryWeight: s?.ukkTheoryWeight ?? null,
      inReport: s?.ukkInReport ?? false,
      certificatePattern: s?.ukkCertificatePattern ?? null,
      defaultCertificatePattern: DEFAULT_UKK_CERTIFICATE_PATTERN,
    };
  };

  app.get(
    '/v1/vocational/settings/ukk',
    {
      onRequest: gate('ukk:read'),
      schema: {
        tags,
        summary: 'Pengaturan UKK kejuruan',
        description:
          'Izin: `ukk:read`; modul `internship`; hanya jenjang kejuruan. Skala kategori per pola (`lsp`, `industry`, `independent`): ' +
          '`bands` = timpaan sekolah (null = bawaan), `defaultBands` = bawaan kontrak dari Pedoman UKK SMK TA 2025/2026 dengan ' +
          '`bandSources` (pola `industry` tidak disebut eksplisit di Pedoman: `verified` false, tampilkan "periksa"). Bobot praktik:teori ' +
          '(null = nilai akhir diisi langsung), `inReport` (blok UKK di rapor, bawaan mati), dan pola nomor sertifikat. Belum pernah ' +
          'disimpan: semua bawaan, tanpa baris otomatis.',
        headers: schoolHeader,
        response: { 200: ukkSettingOut, 404: errorSchema, ...guarded },
      },
    },
    async (request) => tenant(request, readUkkSetting),
  );

  app.put(
    '/v1/vocational/settings/ukk',
    {
      onRequest: gate('ukk:manage'),
      schema: {
        tags,
        summary: 'Simpan pengaturan UKK kejuruan',
        description:
          'Izin: `ukk:manage`; modul `internship`; hanya jenjang kejuruan. `bands` per pola: null/dihilangkan = bawaan; skala sah = 1-8 ' +
          'kategori, batas bawah kategori pertama 0, naik tegas tanpa celah/tumpang tindih, kode unik, minimal satu kompeten (400 ' +
          '`invalid_bands`). `practiceWeight` dan `theoryWeight` keduanya null (nilai akhir diisi langsung) atau bilangan bulat >= 0 ' +
          'berjumlah 100 (400 `invalid_weights`). `certificatePattern` memakai `{seq}`, `{code}`, `{roman}`, `{month}`, `{year}` (400 ' +
          '`invalid_pattern`); kosong = bawaan. Perubahan hanya berlaku untuk hasil yang disimpan sesudahnya dan rapor yang disusun ' +
          'sesudahnya; rapor final tidak berubah (snapshot beku).',
        headers: schoolHeader,
        body: vocationalUkkSettingSchema,
        response: { 200: ukkSettingOut, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      for (const p of UKK_PATTERNS) {
        const bands = b.bands[p];
        if (bands && !validUkkBands(bands)) {
          throw new HttpError(
            400,
            'invalid_bands',
            `Skala pola ${p} tidak sah: kategori pertama mulai 0, batas bawah naik tegas, kode unik, minimal satu kategori kompeten.`,
          );
        }
      }
      if (
        (b.practiceWeight === null) !== (b.theoryWeight === null) ||
        (b.practiceWeight !== null &&
          b.theoryWeight !== null &&
          !validUkkWeights({ practice: b.practiceWeight, theory: b.theoryWeight }))
      ) {
        throw new HttpError(
          400,
          'invalid_weights',
          'Bobot praktik dan teori harus keduanya kosong atau keduanya bilangan bulat berjumlah 100.',
        );
      }
      if (b.certificatePattern !== null && !validateNumberPattern(b.certificatePattern).ok) {
        throw new HttpError(
          400,
          'invalid_pattern',
          'Pola nomor wajib memuat {seq} dan hanya memakai {seq}, {code}, {roman}, {month}, {year}.',
        );
      }
      const custom = Object.fromEntries(
        UKK_PATTERNS.flatMap((p) => {
          const bands = b.bands[p];
          return bands ? [[p, bands]] : [];
        }),
      );
      return tenant(request, async (tx) => {
        const values = {
          ukkBands: Object.keys(custom).length > 0 ? custom : null,
          ukkPracticeWeight: b.practiceWeight,
          ukkTheoryWeight: b.theoryWeight,
          ukkInReport: b.inReport,
          ukkCertificatePattern: b.certificatePattern,
          updatedBy: ctx.userId,
          updatedAt: new Date(),
        };
        await tx
          .insert(vocationalSetting)
          .values({ schoolId: ctx.schoolId, ...values })
          .onConflictDoUpdate({ target: vocationalSetting.schoolId, set: values });
        await audit(tx, ctx, 'vocational_setting.ukk_update', 'vocational_setting', ctx.schoolId, {
          customBands: Object.keys(custom),
          weights: [b.practiceWeight, b.theoryWeight],
          inReport: b.inReport,
        });
        return readUkkSetting(tx);
      });
    },
  );
}
