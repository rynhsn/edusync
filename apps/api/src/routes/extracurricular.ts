import {
  academicYear,
  and,
  asc,
  classRoom,
  count,
  desc,
  enrollment,
  eq,
  extracurricular,
  extracurricularAssessment,
  extracurricularAttendance,
  extracurricularMember,
  extracurricularSession,
  gte,
  inArray,
  isNull,
  lte,
  semester,
  student,
  type Tx,
  teacher,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { todayInJakarta } from '../attendance-lib';
import { errorSchema, forbidden, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { assertCategoryUsable } from './extracurricular-categories';
import { audit, conflictAs409, guarded, idParams, ok, schoolHeader } from './helpers';

const tag = ['Extracurricular'];
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam HH:MM');
const dateField = z.iso.date();
const STATUSES = ['present', 'excused', 'sick', 'absent'] as const;
const PREDICATES = ['A', 'B', 'C', 'D'] as const;
const MAX_RANGE_DAYS = 366;

const readGate = [requirePermission('extracurricular:read'), requireModule('extracurricular')];
const manageGate = [requirePermission('extracurricular:manage'), requireModule('extracurricular')];

const notFound = (what: string) => new HttpError(404, 'not_found', `${what} tidak ditemukan.`);
const invalidRef = (message: string) => new HttpError(400, 'invalid_reference', message);

const extracurricularSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  category: z.string().describe('Kunci kategori (lihat /v1/extracurricular-categories)'),
  description: z.string().nullable(),
  coachTeacherId: z.uuid().nullable(),
  externalCoach: z.string().nullable(),
  coachName: z.string().nullable().describe('Nama guru pembina, atau pelatih luar bila tidak ada guru'),
  weekday: z.number().int().nullable().describe('1 = Senin … 7 = Minggu'),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  location: z.string().nullable(),
  active: z.boolean(),
  memberCount: z.number().int().describe('Jumlah anggota pada tahun ajaran aktif'),
  canManage: z
    .boolean()
    .describe('Pengguna ini boleh mengelola anggota, pertemuan, absensi, dan penilaiannya'),
});

const extracurricularBody = z
  .object({
    name: z.string().trim().min(1).max(100),
    category: z.string().trim().min(1).max(32).describe('Kunci kategori aktif milik sekolah'),
    description: z.string().trim().max(500).nullable().default(null),
    coachTeacherId: z.uuid().nullable().default(null),
    externalCoach: z.string().trim().min(1).max(100).nullable().default(null),
    weekday: z.number().int().min(1).max(7).nullable().default(null),
    startsAt: time.nullable().default(null),
    endsAt: time.nullable().default(null),
    location: z.string().trim().min(1).max(100).nullable().default(null),
    active: z.boolean().default(true),
  })
  .refine((b) => !b.startsAt || !b.endsAt || b.startsAt < b.endsAt, {
    message: 'Jam mulai harus lebih awal dari jam selesai.',
    path: ['endsAt'],
  });

const sessionSchema = z.object({
  id: z.uuid(),
  date: z.string(),
  topic: z.string().nullable(),
  filled: z.number().int().describe('Jumlah anggota yang sudah diabsen'),
  total: z.number().int().describe('Jumlah anggota pada tahun ajaran pertemuan itu'),
});

/** Tahun ajaran aktif, atau null bila belum ada. */
async function activeYearId(tx: Tx) {
  const [y] = await tx
    .select({ id: academicYear.id })
    .from(academicYear)
    .where(eq(academicYear.isActive, true));
  return y?.id ?? null;
}

/** Tahun ajaran yang memuat tanggal itu; bila tak ada, tahun ajaran aktif. */
async function yearForDate(tx: Tx, date: string) {
  const [y] = await tx
    .select({ id: academicYear.id })
    .from(academicYear)
    .where(and(lte(academicYear.startsOn, date), gte(academicYear.endsOn, date)))
    .limit(1);
  return y?.id ?? (await activeYearId(tx));
}

/** Tahun ajaran dari parameter (harus milik sekolah ini) atau tahun ajaran aktif. */
async function resolveYear(tx: Tx, academicYearId: string | undefined) {
  if (academicYearId) {
    const [y] = await tx
      .select({ id: academicYear.id })
      .from(academicYear)
      .where(eq(academicYear.id, academicYearId));
    if (!y) throw invalidRef('Tahun ajaran tidak ditemukan.');
    return y.id;
  }
  const active = await activeYearId(tx);
  if (!active) throw new HttpError(409, 'no_active_year', 'Belum ada tahun ajaran aktif.');
  return active;
}

async function loadOrThrow(tx: Tx, id: string) {
  const [row] = await tx.select().from(extracurricular).where(eq(extracurricular.id, id));
  if (!row) throw notFound('Ekstrakurikuler');
  return row;
}

/** Guru yang tercatat untuk anggota sekolah ini (bila ada). */
async function myTeacherId(tx: Tx, ctx: TenantContext) {
  const [mine] = await tx.select({ id: teacher.id }).from(teacher).where(eq(teacher.memberId, ctx.memberId));
  return mine?.id ?? null;
}

/**
 * Pengelola (`extracurricular:manage`) atau guru pembina ekskul itu boleh mengelola anggota, pertemuan, absensi, dan
 * penilaiannya. Selain itu 403.
 */
async function isManagerOf(tx: Tx, ctx: TenantContext, ek: { coachTeacherId: string | null }) {
  if (ctx.permissions.has('extracurricular:manage')) return true;
  if (!ek.coachTeacherId) return false;
  return (await myTeacherId(tx, ctx)) === ek.coachTeacherId;
}

async function authorizeWrite(tx: Tx, ctx: TenantContext, ekskulId: string) {
  const ek = await loadOrThrow(tx, ekskulId);
  if (!(await isManagerOf(tx, ctx, ek))) {
    throw forbidden('Hanya pembina ekskul ini atau pengelola ekstrakurikuler yang boleh melakukannya.');
  }
  return ek;
}

async function sessionOrThrow(tx: Tx, sessionId: string) {
  const [s] = await tx.select().from(extracurricularSession).where(eq(extracurricularSession.id, sessionId));
  if (!s) throw notFound('Pertemuan');
  return s;
}

/** Anggota ekskul pada satu tahun ajaran (siswa aktif), urut nama. */
function membersOf(tx: Tx, ekskulId: string, yearId: string) {
  return tx
    .select({
      id: student.id,
      name: student.name,
      nis: student.nis,
      joinedOn: extracurricularMember.joinedOn,
    })
    .from(extracurricularMember)
    .innerJoin(student, eq(student.id, extracurricularMember.studentId))
    .where(
      and(
        eq(extracurricularMember.extracurricularId, ekskulId),
        eq(extracurricularMember.academicYearId, yearId),
        isNull(student.deletedAt),
        eq(student.status, 'active'),
      ),
    )
    .orderBy(asc(student.name));
}

/** Rentang tanggal dari query; bawaan: 90 hari terakhir sampai hari ini. Maksimal 366 hari. */
function resolveRange(from: string | undefined, to: string | undefined) {
  const end = to ?? todayInJakarta();
  const start = from ?? new Date(Date.parse(end) - 90 * 86_400_000).toISOString().slice(0, 10);
  if (start > end) throw new HttpError(400, 'invalid_range', 'Tanggal awal harus sebelum tanggal akhir.');
  if ((Date.parse(end) - Date.parse(start)) / 86_400_000 > MAX_RANGE_DAYS) {
    throw new HttpError(400, 'invalid_range', `Rentang tanggal maksimal ${MAX_RANGE_DAYS} hari.`);
  }
  return { from: start, to: end };
}

const rangeQuery = z.object({ from: dateField.optional(), to: dateField.optional() });

/** Ekstrakurikuler: kegiatan, anggota per tahun ajaran, pertemuan, absensi, penilaian, dan laporan. Modul `extracurricular`. */
export async function extracurricularRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  /** Tampilan lengkap satu atau semua ekskul (nama pembina, jumlah anggota tahun aktif, hak kelola). */
  async function views(tx: Tx, ctx: TenantContext, onlyId?: string) {
    const rows = await tx
      .select({ ek: extracurricular, coachName: teacher.name })
      .from(extracurricular)
      .leftJoin(teacher, eq(teacher.id, extracurricular.coachTeacherId))
      .where(onlyId ? eq(extracurricular.id, onlyId) : undefined)
      .orderBy(asc(extracurricular.name));
    const year = await activeYearId(tx);
    const counts = year
      ? await tx
          .select({ id: extracurricularMember.extracurricularId, n: count() })
          .from(extracurricularMember)
          .where(eq(extracurricularMember.academicYearId, year))
          .groupBy(extracurricularMember.extracurricularId)
      : [];
    const mine = await myTeacherId(tx, ctx);
    const manager = ctx.permissions.has('extracurricular:manage');
    return rows.map(({ ek, coachName }) => ({
      id: ek.id,
      name: ek.name,
      category: ek.category,
      description: ek.description,
      coachTeacherId: ek.coachTeacherId,
      externalCoach: ek.externalCoach,
      coachName: coachName ?? ek.externalCoach,
      weekday: ek.weekday,
      startsAt: ek.startsAt,
      endsAt: ek.endsAt,
      location: ek.location,
      active: ek.active,
      memberCount: counts.find((c) => c.id === ek.id)?.n ?? 0,
      canManage: manager || (mine !== null && ek.coachTeacherId === mine),
    }));
  }

  async function checkCoach(tx: Tx, coachTeacherId: string | null) {
    if (!coachTeacherId) return;
    const [t] = await tx
      .select({ id: teacher.id })
      .from(teacher)
      .where(and(eq(teacher.id, coachTeacherId), eq(teacher.status, 'active')));
    if (!t) throw invalidRef('Guru pembina tidak ditemukan atau tidak aktif.');
  }

  /* ---------- Kegiatan ---------- */

  app.get(
    '/v1/extracurriculars',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar ekstrakurikuler',
        description:
          'Izin: `extracurricular:read`; modul `extracurricular`. Nama pembina berasal dari guru pembina atau pelatih ' +
          'luar. `memberCount` dihitung pada tahun ajaran aktif. `canManage` menandai ekskul yang boleh dikelola ' +
          'pengguna (pengelola atau guru pembinanya).',
        headers: schoolHeader,
        response: { 200: z.array(extracurricularSchema), ...guarded },
      },
    },
    async (request) => tenant(request, (tx) => views(tx, request.ctx as TenantContext)),
  );

  app.post(
    '/v1/extracurriculars',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Tambah ekstrakurikuler',
        description:
          'Izin: `extracurricular:manage`; modul `extracurricular`. Nama harus unik di sekolah (409 `conflict`). ' +
          '`coachTeacherId` harus guru aktif sekolah ini (400 `invalid_reference`). Jam mulai harus lebih awal dari jam selesai.',
        headers: schoolHeader,
        body: extracurricularBody,
        response: { 201: extracurricularSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const created = await conflictAs409('Nama ekstrakurikuler itu sudah ada.', () =>
        tenant(request, async (tx) => {
          await checkCoach(tx, request.body.coachTeacherId);
          await assertCategoryUsable(tx, ctx.schoolId, request.body.category);
          const [row] = await tx
            .insert(extracurricular)
            .values({ schoolId: ctx.schoolId, ...request.body })
            .returning({ id: extracurricular.id });
          await audit(tx, ctx, 'extracurricular.create', 'extracurricular', row!.id, {
            name: request.body.name,
          });
          return (await views(tx, ctx, row!.id))[0]!;
        }),
      );
      return reply.code(201).send(created);
    },
  );

  app.put(
    '/v1/extracurriculars/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Ubah ekstrakurikuler',
        description:
          'Izin: `extracurricular:manage`; modul `extracurricular`. Mengganti seluruh isi (termasuk `active` untuk ' +
          'menonaktifkan). Nama unik (409 `conflict`); guru pembina harus guru aktif sekolah ini dan kategori harus ' +
          'kategori aktif sekolah ini (400 `invalid_reference`).',
        headers: schoolHeader,
        params: idParams,
        body: extracurricularBody,
        response: {
          200: extracurricularSchema,
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return conflictAs409('Nama ekstrakurikuler itu sudah ada.', () =>
        tenant(request, async (tx) => {
          const existing = await loadOrThrow(tx, request.params.id);
          await checkCoach(tx, request.body.coachTeacherId);
          if (request.body.category !== existing.category) {
            await assertCategoryUsable(tx, ctx.schoolId, request.body.category);
          }
          await tx.update(extracurricular).set(request.body).where(eq(extracurricular.id, request.params.id));
          await audit(tx, ctx, 'extracurricular.update', 'extracurricular', request.params.id, {
            name: request.body.name,
            active: request.body.active,
          });
          return (await views(tx, ctx, request.params.id))[0]!;
        }),
      );
    },
  );

  app.delete(
    '/v1/extracurriculars/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Hapus ekstrakurikuler',
        description:
          'Izin: `extracurricular:manage`; modul `extracurricular`. Ditolak 409 `in_use` bila sudah punya pertemuan atau ' +
          'penilaian; nonaktifkan lewat ubah (`active: false`). Anggota ikut terhapus.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const id = request.params.id;
      return tenant(request, async (tx) => {
        await loadOrThrow(tx, id);
        const [sessions] = await tx
          .select({ n: count() })
          .from(extracurricularSession)
          .where(eq(extracurricularSession.extracurricularId, id));
        const [assessments] = await tx
          .select({ n: count() })
          .from(extracurricularAssessment)
          .where(eq(extracurricularAssessment.extracurricularId, id));
        if ((sessions?.n ?? 0) > 0 || (assessments?.n ?? 0) > 0) {
          throw new HttpError(
            409,
            'in_use',
            'Ekstrakurikuler ini sudah punya pertemuan atau penilaian; nonaktifkan saja.',
          );
        }
        await tx.delete(extracurricularMember).where(eq(extracurricularMember.extracurricularId, id));
        await tx.delete(extracurricular).where(eq(extracurricular.id, id));
        await audit(tx, ctx, 'extracurricular.delete', 'extracurricular', id);
        return { ok: true as const };
      });
    },
  );

  /* ---------- Anggota ---------- */

  const memberView = z.object({
    studentId: z.uuid(),
    name: z.string(),
    nis: z.string().nullable(),
    className: z.string().nullable(),
    joinedOn: z.string(),
  });

  app.get(
    '/v1/extracurriculars/:id/members',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Anggota ekstrakurikuler',
        description:
          'Izin: `extracurricular:read`; modul `extracurricular`. Anggota pada tahun ajaran `academicYearId` (bawaan: ' +
          'tahun ajaran aktif; 409 `no_active_year` bila tidak ada). `className` adalah kelas siswa pada tahun itu.',
        headers: schoolHeader,
        params: idParams,
        querystring: z.object({ academicYearId: z.uuid().optional() }),
        response: {
          200: z.array(memberView),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        await loadOrThrow(tx, request.params.id);
        const yearId = await resolveYear(tx, request.query.academicYearId);
        const members = await membersOf(tx, request.params.id, yearId);
        const classes = members.length
          ? await tx
              .select({ studentId: enrollment.studentId, className: classRoom.name })
              .from(enrollment)
              .innerJoin(classRoom, eq(classRoom.id, enrollment.classId))
              .where(
                and(
                  eq(enrollment.academicYearId, yearId),
                  inArray(
                    enrollment.studentId,
                    members.map((m) => m.id),
                  ),
                ),
              )
          : [];
        return members.map((m) => ({
          studentId: m.id,
          name: m.name,
          nis: m.nis,
          className: classes.find((c) => c.studentId === m.id)?.className ?? null,
          joinedOn: m.joinedOn,
        }));
      }),
  );

  app.post(
    '/v1/extracurriculars/:id/members',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Tambah anggota ekstrakurikuler',
        description:
          'Izin: `extracurricular:read` ditambah pengelola (`extracurricular:manage`) atau guru pembina ekskul ini; ' +
          'selain itu 403 `forbidden`. Hanya siswa aktif sekolah ini (400 `invalid_reference` bila ada yang bukan). ' +
          'Siswa yang sudah menjadi anggota dilewati (`skipped`). Maksimal 200 siswa per permintaan.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({
          academicYearId: z.uuid().optional().describe('Bawaan: tahun ajaran aktif'),
          studentIds: z.array(z.uuid()).min(1).max(200),
        }),
        response: {
          200: z.object({ added: z.number().int(), skipped: z.number().int() }),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const id = request.params.id;
      const ids = [...new Set(request.body.studentIds)];
      return tenant(request, async (tx) => {
        await authorizeWrite(tx, ctx, id);
        const yearId = await resolveYear(tx, request.body.academicYearId);
        const found = await tx
          .select({ id: student.id })
          .from(student)
          .where(and(inArray(student.id, ids), isNull(student.deletedAt), eq(student.status, 'active')));
        if (found.length !== ids.length) throw invalidRef('Ada siswa yang tidak ditemukan atau tidak aktif.');
        const inserted = await tx
          .insert(extracurricularMember)
          .values(
            ids.map((studentId) => ({
              schoolId: ctx.schoolId,
              extracurricularId: id,
              studentId,
              academicYearId: yearId,
              joinedOn: todayInJakarta(),
            })),
          )
          .onConflictDoNothing()
          .returning({ id: extracurricularMember.id });
        await audit(tx, ctx, 'extracurricular.members_add', 'extracurricular', id, {
          added: inserted.length,
          skipped: ids.length - inserted.length,
        });
        return { added: inserted.length, skipped: ids.length - inserted.length };
      });
    },
  );

  app.delete(
    '/v1/extracurriculars/:id/members/:studentId',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Keluarkan anggota ekstrakurikuler',
        description:
          'Izin: `extracurricular:read` ditambah pengelola (`extracurricular:manage`) atau guru pembina ekskul ini; ' +
          'selain itu 403 `forbidden`. Anggota pada tahun ajaran `academicYearId` (bawaan: aktif). 404 bila bukan ' +
          'anggota. Catatan absensi lama tetap tersimpan.',
        headers: schoolHeader,
        params: z.object({ id: z.uuid(), studentId: z.uuid() }),
        querystring: z.object({ academicYearId: z.uuid().optional() }),
        response: { 200: ok, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { id, studentId } = request.params;
      return tenant(request, async (tx) => {
        await authorizeWrite(tx, ctx, id);
        const yearId = await resolveYear(tx, request.query.academicYearId);
        const removed = await tx
          .delete(extracurricularMember)
          .where(
            and(
              eq(extracurricularMember.extracurricularId, id),
              eq(extracurricularMember.studentId, studentId),
              eq(extracurricularMember.academicYearId, yearId),
            ),
          )
          .returning({ id: extracurricularMember.id });
        if (removed.length === 0) throw notFound('Anggota');
        await audit(tx, ctx, 'extracurricular.members_remove', 'extracurricular', id, { studentId });
        return { ok: true as const };
      });
    },
  );

  /* ---------- Pertemuan ---------- */

  /** Daftar pertemuan dengan jumlah terisi dan total anggota (menurut tahun ajaran tiap pertemuan). */
  async function sessionViews(tx: Tx, ekskulId: string, where: ReturnType<typeof and>) {
    const sessions = await tx
      .select()
      .from(extracurricularSession)
      .where(where)
      .orderBy(desc(extracurricularSession.date));
    const ids = sessions.map((s) => s.id);
    const filled = ids.length
      ? await tx
          .select({ id: extracurricularAttendance.sessionId, n: count() })
          .from(extracurricularAttendance)
          .where(inArray(extracurricularAttendance.sessionId, ids))
          .groupBy(extracurricularAttendance.sessionId)
      : [];
    const totals = await tx
      .select({ yearId: extracurricularMember.academicYearId, n: count() })
      .from(extracurricularMember)
      .where(eq(extracurricularMember.extracurricularId, ekskulId))
      .groupBy(extracurricularMember.academicYearId);
    const years = await tx.select().from(academicYear);
    const active = years.find((y) => y.isActive)?.id ?? null;
    return sessions.map((s) => {
      const yearId = years.find((y) => y.startsOn <= s.date && s.date <= y.endsOn)?.id ?? active;
      return {
        id: s.id,
        date: s.date,
        topic: s.topic,
        filled: filled.find((f) => f.id === s.id)?.n ?? 0,
        total: totals.find((t) => t.yearId === yearId)?.n ?? 0,
      };
    });
  }

  app.get(
    '/v1/extracurriculars/:id/sessions',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Pertemuan ekstrakurikuler',
        description:
          'Izin: `extracurricular:read`; modul `extracurricular`. Pertemuan pada rentang `from`..`to` (bawaan: 90 hari ' +
          'terakhir; maksimal 366 hari, selain itu 400 `invalid_range`), terbaru dahulu. `filled` = anggota yang ' +
          'sudah diabsen, `total` = anggota pada tahun ajaran pertemuan itu.',
        headers: schoolHeader,
        params: idParams,
        querystring: rangeQuery,
        response: { 200: z.array(sessionSchema), 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const range = resolveRange(request.query.from, request.query.to);
      return tenant(request, async (tx) => {
        await loadOrThrow(tx, request.params.id);
        return sessionViews(
          tx,
          request.params.id,
          and(
            eq(extracurricularSession.extracurricularId, request.params.id),
            gte(extracurricularSession.date, range.from),
            lte(extracurricularSession.date, range.to),
          ),
        );
      });
    },
  );

  app.post(
    '/v1/extracurriculars/:id/sessions',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Buat pertemuan ekstrakurikuler',
        description:
          'Izin: `extracurricular:read` ditambah pengelola (`extracurricular:manage`) atau guru pembina ekskul ini; ' +
          'selain itu 403 `forbidden`. Tanggal tidak boleh belum tiba (409 `future_date`) dan satu ekskul hanya satu ' +
          'pertemuan per tanggal (409 `conflict`).',
        headers: schoolHeader,
        params: idParams,
        body: z.object({ date: dateField, topic: z.string().trim().max(200).nullable().default(null) }),
        response: { 201: sessionSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const { date, topic } = request.body;
      if (date > todayInJakarta()) {
        throw new HttpError(409, 'future_date', 'Pertemuan tidak bisa dibuat untuk tanggal yang belum tiba.');
      }
      const view = await conflictAs409('Pertemuan pada tanggal itu sudah ada.', () =>
        tenant(request, async (tx) => {
          await authorizeWrite(tx, ctx, request.params.id);
          const [row] = await tx
            .insert(extracurricularSession)
            .values({
              schoolId: ctx.schoolId,
              extracurricularId: request.params.id,
              date,
              topic,
              recordedBy: ctx.userId,
            })
            .returning({ id: extracurricularSession.id });
          await audit(tx, ctx, 'extracurricular.session_create', 'extracurricular', request.params.id, {
            date,
          });
          const [v] = await sessionViews(tx, request.params.id, eq(extracurricularSession.id, row!.id));
          return v!;
        }),
      );
      return reply.code(201).send(view);
    },
  );

  app.delete(
    '/v1/extracurricular-sessions/:sessionId',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Hapus pertemuan ekstrakurikuler',
        description:
          'Izin: `extracurricular:read` ditambah pengelola (`extracurricular:manage`) atau guru pembina ekskul ini; ' +
          'selain itu 403 `forbidden`. Absensi pertemuan itu ikut terhapus.',
        headers: schoolHeader,
        params: z.object({ sessionId: z.uuid() }),
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { sessionId } = request.params;
      return tenant(request, async (tx) => {
        const s = await sessionOrThrow(tx, sessionId);
        await authorizeWrite(tx, ctx, s.extracurricularId);
        await tx.delete(extracurricularAttendance).where(eq(extracurricularAttendance.sessionId, sessionId));
        await tx.delete(extracurricularSession).where(eq(extracurricularSession.id, sessionId));
        await audit(tx, ctx, 'extracurricular.session_delete', 'extracurricular', s.extracurricularId, {
          date: s.date,
        });
        return { ok: true as const };
      });
    },
  );

  /* ---------- Absensi pertemuan ---------- */

  app.get(
    '/v1/extracurricular-sessions/:sessionId/attendance',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Lembar absensi pertemuan ekstrakurikuler',
        description:
          'Izin: `extracurricular:read`; modul `extracurricular`. Anggota ekskul pada tahun ajaran pertemuan itu dengan ' +
          'status (null bila belum diisi). `canRecord` menyatakan apakah pengguna boleh mengisi (pengelola atau guru ' +
          'pembina).',
        headers: schoolHeader,
        params: z.object({ sessionId: z.uuid() }),
        response: {
          200: z.object({
            session: z.object({
              id: z.uuid(),
              extracurricularId: z.uuid(),
              date: z.string(),
              topic: z.string().nullable(),
            }),
            canRecord: z.boolean(),
            students: z.array(
              z.object({
                studentId: z.uuid(),
                name: z.string(),
                nis: z.string().nullable(),
                status: z.enum(STATUSES).nullable(),
                note: z.string().nullable(),
              }),
            ),
          }),
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const s = await sessionOrThrow(tx, request.params.sessionId);
        const ek = await loadOrThrow(tx, s.extracurricularId);
        const yearId = await yearForDate(tx, s.date);
        const members = yearId ? await membersOf(tx, ek.id, yearId) : [];
        const marks = await tx
          .select()
          .from(extracurricularAttendance)
          .where(eq(extracurricularAttendance.sessionId, s.id));
        return {
          session: { id: s.id, extracurricularId: s.extracurricularId, date: s.date, topic: s.topic },
          canRecord: await isManagerOf(tx, ctx, ek),
          students: members.map((m) => {
            const mark = marks.find((x) => x.studentId === m.id);
            return {
              studentId: m.id,
              name: m.name,
              nis: m.nis,
              status: mark?.status ?? null,
              note: mark?.note ?? null,
            };
          }),
        };
      });
    },
  );

  app.put(
    '/v1/extracurricular-sessions/:sessionId/attendance',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Simpan absensi pertemuan ekstrakurikuler',
        description:
          'Izin: `extracurricular:read` ditambah pengelola (`extracurricular:manage`) atau guru pembina ekskul ini; ' +
          'selain itu 403 `forbidden`. Semua siswa harus anggota ekskul pada tahun ajaran pertemuan itu ' +
          '(400 `invalid_reference`). Maksimal 200 baris.',
        headers: schoolHeader,
        params: z.object({ sessionId: z.uuid() }),
        body: z.object({
          records: z
            .array(
              z.object({
                studentId: z.uuid(),
                status: z.enum(STATUSES),
                note: z.string().trim().max(200).nullable().default(null),
              }),
            )
            .min(1)
            .max(200),
        }),
        response: {
          200: z.object({ saved: z.number().int() }),
          400: errorSchema,
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { records } = request.body;
      return tenant(request, async (tx) => {
        const s = await sessionOrThrow(tx, request.params.sessionId);
        const ek = await authorizeWrite(tx, ctx, s.extracurricularId);
        const yearId = await yearForDate(tx, s.date);
        const members = yearId ? await membersOf(tx, ek.id, yearId) : [];
        const allowed = new Set(members.map((m) => m.id));
        if (records.some((r) => !allowed.has(r.studentId))) {
          throw invalidRef('Ada siswa yang bukan anggota ekstrakurikuler ini.');
        }
        for (const r of records) {
          await tx
            .insert(extracurricularAttendance)
            .values({
              schoolId: ctx.schoolId,
              sessionId: s.id,
              studentId: r.studentId,
              status: r.status,
              note: r.note,
              recordedBy: ctx.userId,
            })
            .onConflictDoUpdate({
              target: [extracurricularAttendance.sessionId, extracurricularAttendance.studentId],
              set: { status: r.status, note: r.note, recordedBy: ctx.userId, updatedAt: new Date() },
            });
        }
        await audit(tx, ctx, 'extracurricular.attendance_save', 'extracurricular_session', s.id, {
          count: records.length,
        });
        return { saved: records.length };
      });
    },
  );

  /* ---------- Penilaian ---------- */

  /** Semester milik sekolah ini beserta tahun ajarannya. */
  async function semesterOrThrow(tx: Tx, semesterId: string) {
    const [sem] = await tx
      .select({ id: semester.id, academicYearId: semester.academicYearId })
      .from(semester)
      .where(eq(semester.id, semesterId));
    if (!sem) throw invalidRef('Semester tidak ditemukan.');
    return sem;
  }

  app.get(
    '/v1/extracurriculars/:id/assessments',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Penilaian ekstrakurikuler per semester',
        description:
          'Izin: `extracurricular:read`; modul `extracurricular`. Anggota pada tahun ajaran semester itu dengan ' +
          'predikat A-D (null bila belum dinilai). Semester tak dikenal: 400 `invalid_reference`.',
        headers: schoolHeader,
        params: idParams,
        querystring: z.object({ semesterId: z.uuid() }),
        response: {
          200: z.array(
            z.object({
              studentId: z.uuid(),
              name: z.string(),
              predicate: z.enum(PREDICATES).nullable(),
              note: z.string().nullable(),
            }),
          ),
          400: errorSchema,
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        await loadOrThrow(tx, request.params.id);
        const sem = await semesterOrThrow(tx, request.query.semesterId);
        const members = await membersOf(tx, request.params.id, sem.academicYearId);
        const marks = await tx
          .select()
          .from(extracurricularAssessment)
          .where(
            and(
              eq(extracurricularAssessment.extracurricularId, request.params.id),
              eq(extracurricularAssessment.semesterId, sem.id),
            ),
          );
        return members.map((m) => {
          const mark = marks.find((x) => x.studentId === m.id);
          return {
            studentId: m.id,
            name: m.name,
            predicate: mark?.predicate ?? null,
            note: mark?.note ?? null,
          };
        });
      }),
  );

  app.put(
    '/v1/extracurriculars/:id/assessments',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Simpan penilaian ekstrakurikuler',
        description:
          'Izin: `extracurricular:read` ditambah pengelola (`extracurricular:manage`) atau guru pembina ekskul ini; ' +
          'selain itu 403 `forbidden`. Siswa harus anggota pada tahun ajaran semester itu dan semester harus milik ' +
          'sekolah ini (400 `invalid_reference`). Predikat A-D; dipakai nanti oleh rapor.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({
          semesterId: z.uuid(),
          records: z
            .array(
              z.object({
                studentId: z.uuid(),
                predicate: z.enum(PREDICATES),
                note: z.string().trim().max(200).nullable().default(null),
              }),
            )
            .min(1)
            .max(200),
        }),
        response: {
          200: z.object({ saved: z.number().int() }),
          400: errorSchema,
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { semesterId, records } = request.body;
      return tenant(request, async (tx) => {
        await authorizeWrite(tx, ctx, request.params.id);
        const sem = await semesterOrThrow(tx, semesterId);
        const members = await membersOf(tx, request.params.id, sem.academicYearId);
        const allowed = new Set(members.map((m) => m.id));
        if (records.some((r) => !allowed.has(r.studentId))) {
          throw invalidRef('Ada siswa yang bukan anggota ekstrakurikuler ini.');
        }
        for (const r of records) {
          await tx
            .insert(extracurricularAssessment)
            .values({
              schoolId: ctx.schoolId,
              extracurricularId: request.params.id,
              studentId: r.studentId,
              semesterId,
              predicate: r.predicate,
              note: r.note,
              updatedBy: ctx.userId,
            })
            .onConflictDoUpdate({
              target: [
                extracurricularAssessment.extracurricularId,
                extracurricularAssessment.studentId,
                extracurricularAssessment.semesterId,
              ],
              set: { predicate: r.predicate, note: r.note, updatedBy: ctx.userId, updatedAt: new Date() },
            });
        }
        await audit(tx, ctx, 'extracurricular.assessment_save', 'extracurricular', request.params.id, {
          semesterId,
          count: records.length,
        });
        return { saved: records.length };
      });
    },
  );

  /* ---------- Laporan ---------- */

  app.get(
    '/v1/extracurriculars/:id/report',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Rekap kehadiran ekstrakurikuler',
        description:
          'Izin: `extracurricular:read`; modul `extracurricular`. Rekap per anggota (tahun ajaran dari tanggal `to`) ' +
          'untuk pertemuan pada rentang `from`..`to` (bawaan 90 hari terakhir; maksimal 366 hari, selain itu 400 ' +
          '`invalid_range`). `sessions` = jumlah pertemuan yang tercatat untuk anggota itu; `totalSessions` = jumlah ' +
          'pertemuan ekskul pada rentang.',
        headers: schoolHeader,
        params: idParams,
        querystring: rangeQuery,
        response: {
          200: z.object({
            from: z.string(),
            to: z.string(),
            totalSessions: z.number().int(),
            students: z.array(
              z.object({
                studentId: z.uuid(),
                name: z.string(),
                nis: z.string().nullable(),
                present: z.number().int(),
                excused: z.number().int(),
                sick: z.number().int(),
                absent: z.number().int(),
                sessions: z.number().int(),
              }),
            ),
          }),
          400: errorSchema,
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const range = resolveRange(request.query.from, request.query.to);
      return tenant(request, async (tx) => {
        await loadOrThrow(tx, request.params.id);
        const sessions = await tx
          .select({ id: extracurricularSession.id })
          .from(extracurricularSession)
          .where(
            and(
              eq(extracurricularSession.extracurricularId, request.params.id),
              gte(extracurricularSession.date, range.from),
              lte(extracurricularSession.date, range.to),
            ),
          );
        const ids = sessions.map((s) => s.id);
        const marks = ids.length
          ? await tx
              .select({
                studentId: extracurricularAttendance.studentId,
                status: extracurricularAttendance.status,
              })
              .from(extracurricularAttendance)
              .where(inArray(extracurricularAttendance.sessionId, ids))
          : [];
        const yearId = await yearForDate(tx, range.to);
        const members = yearId ? await membersOf(tx, request.params.id, yearId) : [];
        return {
          ...range,
          totalSessions: ids.length,
          students: members.map((m) => {
            const mine = marks.filter((x) => x.studentId === m.id);
            const n = (status: (typeof STATUSES)[number]) => mine.filter((x) => x.status === status).length;
            return {
              studentId: m.id,
              name: m.name,
              nis: m.nis,
              present: n('present'),
              excused: n('excused'),
              sick: n('sick'),
              absent: n('absent'),
              sessions: mine.length,
            };
          }),
        };
      });
    },
  );
}
