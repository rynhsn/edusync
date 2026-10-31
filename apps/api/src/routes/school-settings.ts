import { DEFAULT_LEVELS, isValidTimezone, MAX_SEMESTERS } from '@edusync/contracts';
import {
  admissionPeriod,
  asc,
  classRoom,
  eq,
  finFeePlan,
  invalidateSchoolTimezone,
  max,
  school,
  schoolLevel,
  schoolSetting,
  type Tx,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requirePermission, requireTenant, type TenantContext } from '../identity/guards';
import { loadSchoolSettings } from '../school-lib';
import { audit, conflictAs409, guarded, idParams, ok, schoolHeader } from './helpers';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam HH:MM.');

const settingsSchema = z.object({
  timezone: z.string().describe('Zona waktu IANA sekolah, mis. Asia/Jakarta (WIB), Asia/Makassar (WITA)'),
  workingDays: z.array(z.number().int().min(1).max(7)).describe('Hari efektif: 1 = Senin ... 7 = Minggu'),
  semesterNames: z.array(z.string()).describe('Nama semester berurutan (1 sampai 4)'),
  lessonDefaultStart: hhmm.describe('Jam mulai pelajaran pertama bawaan (HH:MM)'),
  lessonDefaultMinutes: z.number().int().describe('Durasi satu jam pelajaran bawaan (menit)'),
});

const settingsBody = z.object({
  timezone: z
    .string()
    .trim()
    .refine((v) => isValidTimezone(v), 'Zona waktu tidak dikenal.'),
  workingDays: z
    .array(z.number().int().min(1).max(7))
    .min(1, 'Pilih minimal satu hari efektif.')
    .refine((a) => new Set(a).size === a.length, 'Hari tidak boleh ganda.'),
  semesterNames: z
    .array(z.string().trim().min(1).max(40))
    .min(1)
    .max(MAX_SEMESTERS)
    .refine(
      (a) => new Set(a.map((n) => n.toLowerCase())).size === a.length,
      'Nama semester tidak boleh sama.',
    ),
  lessonDefaultStart: hhmm,
  lessonDefaultMinutes: z.number().int().min(10).max(180),
});

const levelSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  label: z.string(),
  sort: z.number().int(),
});
const levelCode = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9._-]+$/, 'Hanya huruf, angka, titik, garis bawah, dan tanda hubung.');
const levelCreate = z.object({
  code: levelCode,
  label: z.string().trim().min(1).max(60),
  sort: z
    .number()
    .int()
    .min(0)
    .max(10_000)
    .optional()
    .describe('Urutan; bila dihilangkan, ditaruh paling akhir'),
});
const levelUpdate = z.object({
  label: z.string().trim().min(1).max(60),
  sort: z.number().int().min(0).max(10_000),
});

const tags = ['School'];

/** Pengaturan sekolah (zona waktu, hari efektif, semester, jam pelajaran) dan daftar tingkat kelas. */
export async function schoolSettingsRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  async function readAll(tx: Tx, schoolId: string) {
    const [sch] = await tx.select({ timezone: school.timezone }).from(school).where(eq(school.id, schoolId));
    return { timezone: sch?.timezone ?? 'Asia/Jakarta', ...(await loadSchoolSettings(tx, schoolId)) };
  }

  app.get(
    '/v1/school/settings',
    {
      onRequest: [requireTenant],
      schema: {
        tags,
        summary: 'Pengaturan sekolah',
        description:
          'Izin: anggota aktif sekolah (tanpa izin khusus, karena zona waktu dan hari efektif dipakai semua layar). ' +
          'Bila sekolah belum pernah menyimpan pengaturan, nilai bawaan dikembalikan (Senin-Sabtu, Ganjil/Genap, ' +
          '07:00 dan 40 menit).',
        headers: schoolHeader,
        response: { 200: settingsSchema, ...guarded },
      },
    },
    async (request) => tenant(request, (tx) => readAll(tx, (request.ctx as TenantContext).schoolId)),
  );

  app.put(
    '/v1/school/settings',
    {
      onRequest: [requirePermission('school:manage')],
      schema: {
        tags,
        summary: 'Simpan pengaturan sekolah',
        description:
          'Izin: `school:manage`. Mengganti zona waktu (zona IANA, 400 bila tidak dikenal), hari efektif (1-7), ' +
          'nama semester (1 sampai 4, unik), serta jam mulai dan durasi pelajaran bawaan. Baris pengaturan dibuat ' +
          'saat pertama kali disimpan. Mengubah nama semester tidak mengubah semester yang sudah dibuat.',
        headers: schoolHeader,
        body: settingsBody,
        response: { 200: settingsSchema, 400: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { timezone, ...rest } = request.body;
      const result = await tenant(request, async (tx) => {
        const values = {
          ...rest,
          workingDays: [...rest.workingDays].sort((a, b) => a - b),
          updatedAt: new Date(),
        };
        await tx
          .insert(schoolSetting)
          .values({ schoolId: ctx.schoolId, ...values })
          .onConflictDoUpdate({ target: schoolSetting.schoolId, set: values });
        await tx.update(school).set({ timezone }).where(eq(school.id, ctx.schoolId));
        await audit(tx, ctx, 'school.settings_update', 'school', ctx.schoolId, request.body);
        return readAll(tx, ctx.schoolId);
      });
      invalidateSchoolTimezone(ctx.schoolId);
      return result;
    },
  );

  /* ---------- Tingkat kelas ---------- */

  const listLevels = (tx: Tx) =>
    tx
      .select({
        id: schoolLevel.id,
        code: schoolLevel.code,
        label: schoolLevel.label,
        sort: schoolLevel.sort,
      })
      .from(schoolLevel)
      .orderBy(asc(schoolLevel.sort), asc(schoolLevel.code));

  app.get(
    '/v1/school/levels',
    {
      onRequest: [requirePermission('class:read')],
      schema: {
        tags,
        summary: 'Daftar tingkat kelas',
        description:
          'Izin: `class:read`. Urut menurut `sort`. Daftar kosong berarti sekolah belum mengaturnya; kelas, tarif, dan ' +
          'periode SPMB lalu menerima tingkat berupa teks bebas.',
        headers: schoolHeader,
        response: { 200: z.array(levelSchema), ...guarded },
      },
    },
    async (request) => tenant(request, (tx) => listLevels(tx)),
  );

  app.post(
    '/v1/school/levels',
    {
      onRequest: [requirePermission('school:manage')],
      schema: {
        tags,
        summary: 'Tambah tingkat kelas',
        description:
          'Izin: `school:manage`. `code` (mis. "7" atau "X") dipakai di kelas, tarif, dan SPMB dan tidak dapat diubah ' +
          'sesudahnya. 409 `conflict` bila kode sudah ada.',
        headers: schoolHeader,
        body: levelCreate,
        response: { 201: levelSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const created = await conflictAs409('Kode tingkat itu sudah ada.', () =>
        tenant(request, async (tx) => {
          let sort = request.body.sort;
          if (sort === undefined) {
            const [m] = await tx.select({ top: max(schoolLevel.sort) }).from(schoolLevel);
            sort = (m?.top ?? 0) + 10;
          }
          const [r] = await tx
            .insert(schoolLevel)
            .values({ schoolId: ctx.schoolId, code: request.body.code, label: request.body.label, sort })
            .returning({
              id: schoolLevel.id,
              code: schoolLevel.code,
              label: schoolLevel.label,
              sort: schoolLevel.sort,
            });
          await audit(tx, ctx, 'school.level_create', 'school_level', r!.id, request.body);
          return r!;
        }),
      );
      return reply.code(201).send(created);
    },
  );

  app.post(
    '/v1/school/levels/defaults',
    {
      onRequest: [requirePermission('school:manage')],
      schema: {
        tags,
        summary: 'Isi tingkat kelas bawaan',
        description:
          'Izin: `school:manage`. Menambahkan tingkat bawaan sesuai jenjang (`sd` kelas 1-6, `smp` kelas 7-9, `sma`/`smk` ' +
          'X-XII). Kode yang sudah ada dilewati; mengembalikan daftar lengkap.',
        headers: schoolHeader,
        body: z.object({ stage: z.enum(['sd', 'smp', 'sma', 'smk']) }),
        response: { 200: z.array(levelSchema), ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const existing = new Set((await listLevels(tx)).map((l) => l.code));
        const [m] = await tx.select({ top: max(schoolLevel.sort) }).from(schoolLevel);
        let sort = m?.top ?? 0;
        const fresh = (DEFAULT_LEVELS[request.body.stage] ?? []).filter((l) => !existing.has(l.code));
        if (fresh.length > 0) {
          await tx
            .insert(schoolLevel)
            .values(
              fresh.map((l, i) => ({
                schoolId: ctx.schoolId,
                code: l.code,
                label: l.label,
                sort: sort + (i + 1) * 10,
              })),
            )
            .onConflictDoNothing();
        }
        await audit(tx, ctx, 'school.level_defaults', 'school', ctx.schoolId, {
          stage: request.body.stage,
          added: fresh.length,
        });
        return listLevels(tx);
      });
    },
  );

  app.put(
    '/v1/school/levels/:id',
    {
      onRequest: [requirePermission('school:manage')],
      schema: {
        tags,
        summary: 'Ubah tingkat kelas',
        description:
          'Izin: `school:manage`. Hanya nama tampilan dan urutan; kode tetap. 404 `not_found` bila tak ada.',
        headers: schoolHeader,
        params: idParams,
        body: levelUpdate,
        response: { 200: levelSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const rows = await tx
          .update(schoolLevel)
          .set(request.body)
          .where(eq(schoolLevel.id, request.params.id))
          .returning({
            id: schoolLevel.id,
            code: schoolLevel.code,
            label: schoolLevel.label,
            sort: schoolLevel.sort,
          });
        const r = rows[0];
        if (!r) throw new HttpError(404, 'not_found', 'Tingkat tidak ditemukan.');
        await audit(tx, ctx, 'school.level_update', 'school_level', r.id, request.body);
        return r;
      });
    },
  );

  app.delete(
    '/v1/school/levels/:id',
    {
      onRequest: [requirePermission('school:manage')],
      schema: {
        tags,
        summary: 'Hapus tingkat kelas',
        description:
          'Izin: `school:manage`. Ditolak (409 `in_use`) bila masih dipakai kelas, tarif, atau periode SPMB. ' +
          '404 `not_found` bila tak ada.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      await tenant(request, async (tx) => {
        const [lv] = await tx.select().from(schoolLevel).where(eq(schoolLevel.id, request.params.id));
        if (!lv) throw new HttpError(404, 'not_found', 'Tingkat tidak ditemukan.');
        const used = async (rows: Promise<unknown[]>) => (await rows).length > 0;
        const inUse =
          (await used(
            tx.select({ id: classRoom.id }).from(classRoom).where(eq(classRoom.level, lv.code)).limit(1),
          )) ||
          (await used(
            tx.select({ id: finFeePlan.id }).from(finFeePlan).where(eq(finFeePlan.level, lv.code)).limit(1),
          )) ||
          (await used(
            tx
              .select({ id: admissionPeriod.id })
              .from(admissionPeriod)
              .where(eq(admissionPeriod.level, lv.code))
              .limit(1),
          ));
        if (inUse) {
          throw new HttpError(409, 'in_use', 'Tingkat ini masih dipakai kelas, tarif, atau periode SPMB.');
        }
        await tx.delete(schoolLevel).where(eq(schoolLevel.id, lv.id));
        await audit(tx, ctx, 'school.level_delete', 'school_level', lv.id, { code: lv.code });
      });
      return { ok: true as const };
    },
  );
}
