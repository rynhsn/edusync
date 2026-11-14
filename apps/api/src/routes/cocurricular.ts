import {
  duplicateKeys,
  PROFILE_ITEM_LIMIT,
  profileFrameworkSchema,
  RUBRIC_LEVEL_LIMIT,
  rubricLevelInputSchema,
  rubricLevelSchema,
  schoolProfileItemInputSchema,
  schoolProfileItemSchema,
} from '@edusync/contracts';
import {
  and,
  asc,
  cocurricularProgramTarget,
  cocurricularRubricLevel,
  eq,
  inArray,
  refProfileFramework,
  refProfileFrameworkItem,
  school,
  schoolProfileItem,
  type Tx,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { audit, conflictAs409, guarded, schoolHeader } from './helpers';

/**
 * Kokurikuler, tahap 4.1: kerangka profil (acuan global + adopsi sekolah) dan rubrik tingkat capaian. Kokurikuler BUKAN mapel dan tidak
 * memengaruhi nilai, peringkat, kenaikan, atau kelulusan. Tidak ada baris yang dibuat otomatis: adopsi kerangka selalu aksi eksplisit.
 * Modul `grades` (Nilai dan rapor). Program, penilaian, dan bukti menyusul di tahap 4.2-4.3.
 */

const tag = ['Cocurricular'];
const MODULE = 'grades';
const readGate = [requirePermission('cocurricular:read'), requireModule(MODULE)];
const manageGate = [requirePermission('cocurricular:manage'), requireModule(MODULE)];

const bad = (code: string, message: string) => new HttpError(400, code, message);
const conflict = () =>
  new HttpError(
    409,
    'conflict',
    'Kode butir atau tingkat tidak boleh kembar di dalam satu kerangka/sekolah.',
  );

type ProfileKey = string | null;

async function schoolProfileKey(tx: Tx, schoolId: string): Promise<ProfileKey> {
  const [row] = await tx.select({ key: school.educationProfile }).from(school).where(eq(school.id, schoolId));
  return row?.key ?? null;
}

/** Kerangka aktif yang boleh dipakai profil sekolah ini (`profileKeys` null = semua profil). */
async function frameworksFor(tx: Tx, profile: ProfileKey) {
  const rows = await tx
    .select()
    .from(refProfileFramework)
    .where(eq(refProfileFramework.active, true))
    .orderBy(asc(refProfileFramework.sort), asc(refProfileFramework.key));
  return rows.filter((f) => f.profileKeys === null || (profile !== null && f.profileKeys.includes(profile)));
}

async function listItems(tx: Tx) {
  const rows = await tx
    .select()
    .from(schoolProfileItem)
    .orderBy(asc(schoolProfileItem.frameworkKey), asc(schoolProfileItem.sort), asc(schoolProfileItem.code));
  return rows.map((r) => ({
    id: r.id,
    frameworkKey: r.frameworkKey,
    refCode: r.refCode,
    code: r.code,
    label: r.label,
    description: r.description,
    sort: r.sort,
    active: r.active,
  }));
}

async function listLevels(tx: Tx) {
  const rows = await tx
    .select()
    .from(cocurricularRubricLevel)
    .orderBy(asc(cocurricularRubricLevel.sort), asc(cocurricularRubricLevel.code));
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    label: r.label,
    description: r.description,
    sort: r.sort,
    active: r.active,
  }));
}

/** Kerangka yang boleh dipakai sekolah ini dan aktif; selain itu 400 (`invalid_reference` atau `framework_not_for_profile`). */
async function assertFrameworkUsable(tx: Tx, profile: ProfileKey, key: string) {
  const [fw] = await tx
    .select()
    .from(refProfileFramework)
    .where(and(eq(refProfileFramework.key, key), eq(refProfileFramework.active, true)));
  if (!fw) throw bad('invalid_reference', 'Kerangka profil tidak ditemukan.');
  if (fw.profileKeys !== null && !(profile !== null && fw.profileKeys.includes(profile))) {
    throw bad('framework_not_for_profile', 'Kerangka ini tidak berlaku untuk jenjang unit sekolah Anda.');
  }
  return fw;
}

export async function cocurricularRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  app.get(
    '/v1/reference/profile-frameworks',
    {
      onRequest: readGate,
      schema: {
        tags: ['Reference'],
        summary: 'Daftar kerangka profil (acuan)',
        description:
          'Izin: `cocurricular:read`; modul `grades`. Kerangka acuan platform beserta butirnya, disaring menurut jenjang unit ' +
          '(`profileKeys` null = semua jenjang; Panca Cinta hanya jenjang madrasah). `verification = secondary` berarti sumber ' +
          'sekunder: label belum dicek ke teks resmi dan perlu diperiksa sekolah. Kerangka dipakai lewat adopsi ke butir sekolah.',
        headers: schoolHeader,
        response: { 200: z.object({ frameworks: z.array(profileFrameworkSchema) }), ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const profile = await schoolProfileKey(tx, (request.ctx as TenantContext).schoolId);
        const fws = await frameworksFor(tx, profile);
        const items =
          fws.length === 0
            ? []
            : await tx
                .select()
                .from(refProfileFrameworkItem)
                .where(
                  inArray(
                    refProfileFrameworkItem.frameworkKey,
                    fws.map((f) => f.key),
                  ),
                )
                .orderBy(asc(refProfileFrameworkItem.sort), asc(refProfileFrameworkItem.code));
        return {
          frameworks: fws.map((f) => ({
            key: f.key,
            kind: f.kind,
            labelId: f.labelId,
            labelEn: f.labelEn,
            labelSu: f.labelSu,
            profileKeys: f.profileKeys,
            source: f.source,
            verification: f.verification,
            sort: f.sort,
            items: items
              .filter((i) => i.frameworkKey === f.key)
              .map(({ code, groupCode, labelId, labelEn, labelSu, sort }) => ({
                code,
                groupCode,
                labelId,
                labelEn,
                labelSu,
                sort,
              })),
          })),
        };
      }),
  );

  app.get(
    '/v1/cocurricular/profile-items',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar butir kerangka profil sekolah',
        description:
          'Izin: `cocurricular:read`; modul `grades`. Butir yang sudah diadopsi atau dibuat sekolah (dimensi profil lulusan, topik ' +
          'Panca Cinta), urut kerangka, `sort`, lalu kode. Sekolah yang belum mengadopsi mendapat daftar kosong; tidak ada butir ' +
          'yang dibuat otomatis.',
        headers: schoolHeader,
        response: { 200: z.object({ items: z.array(schoolProfileItemSchema) }), ...guarded },
      },
    },
    async (request) => tenant(request, async (tx) => ({ items: await listItems(tx) })),
  );

  app.post(
    '/v1/cocurricular/profile-items/adopt',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Adopsi kerangka profil',
        description:
          'Izin: `cocurricular:manage`; modul `grades`. Menyalin butir kerangka acuan (label berbahasa Indonesia) ke butir sekolah; ' +
          'sesudahnya sekolah bebas mengganti label, menonaktifkan, atau menambah butir. IDEMPOTEN: butir yang kodenya sudah ada ' +
          'dilewati, tidak ditimpa. `added` = jumlah butir baru. Galat: 400 `invalid_reference` (kerangka tidak ada), 400 ' +
          '`framework_not_for_profile` (mis. Panca Cinta untuk jenjang non-madrasah).',
        headers: schoolHeader,
        body: z.object({ frameworkKey: z.string().min(1).max(60) }),
        response: {
          200: z.object({ added: z.number().int(), items: z.array(schoolProfileItemSchema) }),
          400: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const profile = await schoolProfileKey(tx, ctx.schoolId);
        const fw = await assertFrameworkUsable(tx, profile, request.body.frameworkKey);
        const refItems = await tx
          .select()
          .from(refProfileFrameworkItem)
          .where(eq(refProfileFrameworkItem.frameworkKey, fw.key));
        const inserted = await tx
          .insert(schoolProfileItem)
          .values(
            refItems.map((i) => ({
              schoolId: ctx.schoolId,
              frameworkKey: fw.key,
              refCode: i.code,
              code: i.code,
              label: i.labelId,
              sort: i.sort,
            })),
          )
          .onConflictDoNothing()
          .returning({ id: schoolProfileItem.id });
        await audit(tx, ctx, 'cocurricular.profile_items.adopt', 'school_profile_item', ctx.schoolId, {
          frameworkKey: fw.key,
          added: inserted.length,
        });
        return { added: inserted.length, items: await listItems(tx) };
      });
    },
  );

  app.put(
    '/v1/cocurricular/profile-items',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Simpan butir kerangka profil sekolah',
        description:
          'Izin: `cocurricular:manage`; modul `grades`. Mengganti SELURUH daftar butir: butir dengan `id` diubah (label, deskripsi, ' +
          'kode, urutan, aktif; `frameworkKey` tidak bisa diganti), butir tanpa `id` dibuat sebagai butir buatan sekolah, butir ' +
          `yang tidak disertakan dihapus (maks. ${PROFILE_ITEM_LIMIT} butir). Untuk menyembunyikan butir, kirim \`active: false\`. ` +
          'Galat: 400 `invalid_reference` (id atau kerangka tidak dikenal), 400 `framework_not_for_profile`, 409 `conflict` (kode ' +
          'kembar dalam satu kerangka), 409 `item_in_use` (butir yang dipakai program kokurikuler tidak bisa dihapus; nonaktifkan).',
        headers: schoolHeader,
        body: z.object({ items: z.array(schoolProfileItemInputSchema).max(PROFILE_ITEM_LIMIT) }),
        response: {
          200: z.object({ items: z.array(schoolProfileItemSchema) }),
          400: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const input = request.body.items;
      if (duplicateKeys(input.map((i) => `${i.frameworkKey}\u0000${i.code}`)).length > 0) throw conflict();
      return conflictAs409(conflict().message, () =>
        tenant(request, async (tx) => {
          const profile = await schoolProfileKey(tx, ctx.schoolId);
          const existing = new Map((await tx.select().from(schoolProfileItem)).map((r) => [r.id, r]));
          for (const key of new Set(input.filter((i) => !i.id).map((i) => i.frameworkKey))) {
            await assertFrameworkUsable(tx, profile, key);
          }
          for (const i of input.filter((x) => x.id)) {
            const row = existing.get(i.id as string);
            if (!row || row.frameworkKey !== i.frameworkKey) {
              throw bad('invalid_reference', 'Butir tidak ditemukan atau kerangkanya berbeda.');
            }
          }
          const keepIds = input.flatMap((i) => (i.id ? [i.id] : []));
          const removed = [...existing.keys()].filter((id) => !keepIds.includes(id));
          if (removed.length > 0) {
            const used = await tx
              .select({ id: cocurricularProgramTarget.profileItemId })
              .from(cocurricularProgramTarget)
              .where(inArray(cocurricularProgramTarget.profileItemId, removed))
              .limit(1);
            if (used.length > 0) {
              throw new HttpError(
                409,
                'item_in_use',
                'Butir ini dipakai program kokurikuler; nonaktifkan, jangan dihapus.',
              );
            }
          }
          // Hapus dulu supaya kode yang dibebaskan bisa dipakai ulang di daftar yang sama.
          if (removed.length > 0)
            await tx.delete(schoolProfileItem).where(inArray(schoolProfileItem.id, removed));
          for (const i of input) {
            const { id, frameworkKey, ...fields } = i;
            if (id) {
              await tx
                .update(schoolProfileItem)
                .set({ ...fields, updatedAt: new Date() })
                .where(eq(schoolProfileItem.id, id));
            } else {
              await tx
                .insert(schoolProfileItem)
                .values({ schoolId: ctx.schoolId, frameworkKey, refCode: null, ...fields });
            }
          }
          await audit(tx, ctx, 'cocurricular.profile_items.save', 'school_profile_item', ctx.schoolId, {
            total: input.length,
            removed: removed.length,
          });
          return { items: await listItems(tx) };
        }),
      );
    },
  );

  app.get(
    '/v1/cocurricular/rubric-levels',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar tingkat rubrik kokurikuler',
        description:
          'Izin: `cocurricular:read`; modul `grades`. Tingkat capaian milik sekolah (label, urutan, deskripsi), urut `sort`. Kosong ' +
          'bila sekolah belum mengisinya; isian contoh hanya saran di layar pengaturan, bukan data bawaan.',
        headers: schoolHeader,
        response: { 200: z.object({ levels: z.array(rubricLevelSchema) }), ...guarded },
      },
    },
    async (request) => tenant(request, async (tx) => ({ levels: await listLevels(tx) })),
  );

  app.put(
    '/v1/cocurricular/rubric-levels',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Simpan tingkat rubrik kokurikuler',
        description:
          'Izin: `cocurricular:manage`; modul `grades`. Mengganti SELURUH daftar tingkat: tingkat dengan `id` diubah, tanpa `id` ' +
          `dibuat, yang tidak disertakan dihapus (maks. ${RUBRIC_LEVEL_LIMIT}). Untuk menyembunyikan tingkat kirim ` +
          '`active: false`. Galat: 400 `invalid_reference` (id tidak dikenal), 409 `conflict` (kode kembar). Penolakan 409 ' +
          '`item_in_use` untuk tingkat yang sudah dipakai penilaian berlaku sejak tahap 4.3.',
        headers: schoolHeader,
        body: z.object({ levels: z.array(rubricLevelInputSchema).max(RUBRIC_LEVEL_LIMIT) }),
        response: {
          200: z.object({ levels: z.array(rubricLevelSchema) }),
          400: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const input = request.body.levels;
      if (duplicateKeys(input.map((l) => l.code)).length > 0) throw conflict();
      return conflictAs409(conflict().message, () =>
        tenant(request, async (tx) => {
          const existing = new Set(
            (await tx.select({ id: cocurricularRubricLevel.id }).from(cocurricularRubricLevel)).map(
              (r) => r.id,
            ),
          );
          const keepIds = input.flatMap((l) => (l.id ? [l.id] : []));
          if (keepIds.some((id) => !existing.has(id)))
            throw bad('invalid_reference', 'Tingkat tidak ditemukan.');
          const removed = [...existing].filter((id) => !keepIds.includes(id));
          if (removed.length > 0) {
            await tx.delete(cocurricularRubricLevel).where(inArray(cocurricularRubricLevel.id, removed));
          }
          for (const { id, ...fields } of input) {
            if (id) {
              await tx
                .update(cocurricularRubricLevel)
                .set({ ...fields, updatedAt: new Date() })
                .where(eq(cocurricularRubricLevel.id, id));
            } else {
              await tx.insert(cocurricularRubricLevel).values({ schoolId: ctx.schoolId, ...fields });
            }
          }
          await audit(tx, ctx, 'cocurricular.rubric_levels.save', 'cocurricular_rubric_level', ctx.schoolId, {
            total: input.length,
            removed: removed.length,
          });
          return { levels: await listLevels(tx) };
        }),
      );
    },
  );
}
