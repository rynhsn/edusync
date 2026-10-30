import {
  type AyahRange,
  ayahPercent,
  coverageFromMask,
  coverageMask,
  juzProgressFromMask,
  nextAyah,
  rangeAyahCount,
  TOTAL_AYAHS,
  uniqueAyahCount,
  validRange,
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
  hafalanEntry,
  hafalanTarget,
  halaqah,
  halaqahMember,
  ibadahItem,
  ibadahLog,
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
import { audit, conflictAs409, guarded, idParams, ok, schoolHeader } from './helpers';

const tag = ['Tahfidz'];
const dateField = z.iso.date();
const KINDS = ['ziyadah', 'murajaah'] as const;
const QUALITIES = ['fluent', 'fair', 'repeat'] as const;
const IBADAH_KINDS = ['daily', 'weekly'] as const;
const MAX_RANGE_DAYS = 366;
const DAY_MS = 86_400_000;

const readGate = [requirePermission('tahfidz:read'), requireModule('tahfidz')];
const manageGate = [requirePermission('tahfidz:manage'), requireModule('tahfidz')];

const notFound = (what: string) => new HttpError(404, 'not_found', `${what} tidak ditemukan.`);
const invalidRef = (message: string) => new HttpError(400, 'invalid_reference', message);

const addDays = (date: string, n: number) =>
  new Date(Date.parse(date) + n * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/** Rentang tanggal dari query; bawaan: 30 hari terakhir sampai hari ini. Maksimal 366 hari. */
function resolveRange(from: string | undefined, to: string | undefined) {
  const end = to ?? todayInJakarta();
  const start = from ?? addDays(end, -29);
  if (start > end) throw new HttpError(400, 'invalid_range', 'Tanggal awal harus sebelum tanggal akhir.');
  if (daysBetween(start, end) > MAX_RANGE_DAYS) {
    throw new HttpError(400, 'invalid_range', `Rentang tanggal maksimal ${MAX_RANGE_DAYS} hari.`);
  }
  return { from: start, to: end };
}

const rangeQuery = z.object({ from: dateField.optional(), to: dateField.optional() });

/** Setoran yang dihitung sebagai hafalan baru: ziyadah dengan kualitas selain `repeat`. */
const isNewMemorization = (e: { kind: string; quality: string }) =>
  e.kind === 'ziyadah' && e.quality !== 'repeat';

type LedgerRow = AyahRange & {
  date: string;
  kind: 'ziyadah' | 'murajaah';
  quality: 'fluent' | 'fair' | 'repeat';
};

/** Ayat unik ziyadah (bukan `repeat`) dan murajaah pada baris-baris setoran. */
function unique(rows: readonly LedgerRow[]) {
  return {
    ziyadah: uniqueAyahCount(rows.filter(isNewMemorization)),
    murajaah: uniqueAyahCount(rows.filter((r) => r.kind === 'murajaah')),
  };
}

/** Berapa bagian semester yang sudah berlalu sampai `until` (0..1), untuk target yang dibagi rata per hari. */
function elapsedShare(sem: { startsOn: string; endsOn: string }, until: string) {
  const total = daysBetween(sem.startsOn, sem.endsOn) + 1;
  const end = until < sem.endsOn ? until : sem.endsOn;
  const elapsed = Math.min(Math.max(daysBetween(sem.startsOn, end) + 1, 0), total);
  return total > 0 ? elapsed / total : 1;
}

/* ---------- Skema ---------- */

const halaqahSchema = z.object({
  id: z.uuid(),
  academicYearId: z.uuid(),
  name: z.string(),
  mentorTeacherId: z.uuid().nullable(),
  mentorName: z.string().nullable(),
  scheduleNote: z.string().nullable(),
  active: z.boolean(),
  memberCount: z.number().int(),
  canManage: z
    .boolean()
    .describe('Pengguna ini boleh mengelola anggota, setoran, ibadah, dan target halaqah ini'),
});

const halaqahFields = {
  name: z.string().trim().min(1).max(100),
  mentorTeacherId: z.uuid().nullable().default(null),
  scheduleNote: z.string().trim().max(200).nullable().default(null),
  active: z.boolean().default(true),
};

const entrySchema = z.object({
  id: z.uuid(),
  studentId: z.uuid(),
  studentName: z.string(),
  halaqahId: z.uuid().nullable(),
  date: z.string(),
  kind: z.enum(KINDS),
  surahFrom: z.number().int(),
  ayahFrom: z.number().int(),
  surahTo: z.number().int(),
  ayahTo: z.number().int(),
  ayahCount: z.number().int().describe('Jumlah ayat dalam rentang setoran'),
  quality: z.enum(QUALITIES),
  note: z.string().nullable(),
});

const ibadahItemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(IBADAH_KINDS),
  sort: z.number().int(),
  active: z.boolean(),
});

const ibadahItemBody = z.object({
  name: z.string().trim().min(1).max(100),
  kind: z.enum(IBADAH_KINDS).default('daily'),
  sort: z.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
});

/** Modul tahfidz dan ibadah: halaqah, setoran hafalan, progres, target, dan pemantauan ibadah. Modul `tahfidz`. */
export async function tahfidzRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  /* ---------- Pembantu ---------- */

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

  async function myTeacherId(tx: Tx, ctx: TenantContext) {
    const [mine] = await tx
      .select({ id: teacher.id })
      .from(teacher)
      .where(eq(teacher.memberId, ctx.memberId));
    return mine?.id ?? null;
  }

  async function halaqahOrThrow(tx: Tx, id: string) {
    const [row] = await tx.select().from(halaqah).where(eq(halaqah.id, id));
    if (!row) throw notFound('Halaqah');
    return row;
  }

  /** Pengelola (`tahfidz:manage`) atau guru mentor halaqah itu. */
  async function canWriteHalaqah(tx: Tx, ctx: TenantContext, h: { mentorTeacherId: string | null }) {
    if (ctx.permissions.has('tahfidz:manage')) return true;
    if (!h.mentorTeacherId) return false;
    return (await myTeacherId(tx, ctx)) === h.mentorTeacherId;
  }

  async function authorizeHalaqah(tx: Tx, ctx: TenantContext, halaqahId: string) {
    const h = await halaqahOrThrow(tx, halaqahId);
    if (!(await canWriteHalaqah(tx, ctx, h))) {
      throw forbidden('Hanya mentor halaqah ini atau pengelola tahfidz yang boleh melakukannya.');
    }
    return h;
  }

  /** Halaqah tiap siswa pada satu tahun ajaran. */
  async function membershipsOf(tx: Tx, studentIds: string[], yearId: string | null) {
    const map = new Map<string, { halaqahId: string; name: string; mentorTeacherId: string | null }>();
    if (!yearId || studentIds.length === 0) return map;
    const rows = await tx
      .select({
        studentId: halaqahMember.studentId,
        halaqahId: halaqah.id,
        name: halaqah.name,
        mentorTeacherId: halaqah.mentorTeacherId,
      })
      .from(halaqahMember)
      .innerJoin(halaqah, eq(halaqah.id, halaqahMember.halaqahId))
      .where(and(inArray(halaqahMember.studentId, studentIds), eq(halaqahMember.academicYearId, yearId)));
    for (const r of rows) {
      map.set(r.studentId, { halaqahId: r.halaqahId, name: r.name, mentorTeacherId: r.mentorTeacherId });
    }
    return map;
  }

  /**
   * Otorisasi tulis per siswa: pengelola boleh semuanya; guru lain hanya untuk siswa yang halaqahnya ia bimbing.
   * `managerNeedsScope`: pengelola pun hanya boleh untuk siswa yang anggota halaqah atau terdaftar di kelas tahun itu.
   * Mengembalikan halaqah tiap siswa (bila ada).
   */
  async function authorizeStudents(
    tx: Tx,
    ctx: TenantContext,
    studentIds: string[],
    yearId: string | null,
    managerNeedsScope: boolean,
  ) {
    const ids = [...new Set(studentIds)];
    const found = await tx
      .select({ id: student.id })
      .from(student)
      .where(and(inArray(student.id, ids), isNull(student.deletedAt), eq(student.status, 'active')));
    if (found.length !== ids.length) throw invalidRef('Ada siswa yang tidak ditemukan atau tidak aktif.');
    const members = await membershipsOf(tx, ids, yearId);
    if (ctx.permissions.has('tahfidz:manage')) {
      if (managerNeedsScope) {
        const enrolled = yearId
          ? await tx
              .select({ studentId: enrollment.studentId })
              .from(enrollment)
              .where(and(inArray(enrollment.studentId, ids), eq(enrollment.academicYearId, yearId)))
          : [];
        const inClass = new Set(enrolled.map((e) => e.studentId));
        if (ids.some((id) => !members.has(id) && !inClass.has(id))) {
          throw invalidRef('Ada siswa yang bukan anggota halaqah atau kelas.');
        }
      }
      return members;
    }
    const mine = await myTeacherId(tx, ctx);
    for (const id of ids) {
      const m = members.get(id);
      if (!m) throw invalidRef('Ada siswa yang bukan anggota halaqah mana pun pada tahun ajaran itu.');
      if (!mine || m.mentorTeacherId !== mine) {
        throw forbidden('Hanya mentor halaqah siswa itu atau pengelola tahfidz yang boleh melakukannya.');
      }
    }
    return members;
  }

  /** Nama kelas siswa pada satu tahun ajaran. */
  async function classNames(tx: Tx, studentIds: string[], yearId: string | null) {
    const map = new Map<string, string>();
    if (!yearId || studentIds.length === 0) return map;
    const rows = await tx
      .select({ studentId: enrollment.studentId, className: classRoom.name })
      .from(enrollment)
      .innerJoin(classRoom, eq(classRoom.id, enrollment.classId))
      .where(and(inArray(enrollment.studentId, studentIds), eq(enrollment.academicYearId, yearId)));
    for (const r of rows) map.set(r.studentId, r.className);
    return map;
  }

  /** Anggota halaqah (siswa aktif), urut nama. */
  function halaqahMembers(tx: Tx, halaqahId: string) {
    return tx
      .select({
        id: student.id,
        name: student.name,
        nis: student.nis,
        joinedAt: halaqahMember.createdAt,
      })
      .from(halaqahMember)
      .innerJoin(student, eq(student.id, halaqahMember.studentId))
      .where(
        and(eq(halaqahMember.halaqahId, halaqahId), isNull(student.deletedAt), eq(student.status, 'active')),
      )
      .orderBy(asc(student.name));
  }

  async function checkMentor(tx: Tx, mentorTeacherId: string | null) {
    if (!mentorTeacherId) return;
    const [t] = await tx
      .select({ id: teacher.id })
      .from(teacher)
      .where(and(eq(teacher.id, mentorTeacherId), eq(teacher.status, 'active')));
    if (!t) throw invalidRef('Guru mentor tidak ditemukan atau tidak aktif.');
  }

  /** Semester yang diminta (harus milik sekolah ini) atau semester aktif; null bila tak ada. */
  async function resolveSemester(tx: Tx, semesterId: string | undefined) {
    if (semesterId) {
      const [s] = await tx.select().from(semester).where(eq(semester.id, semesterId));
      if (!s) throw invalidRef('Semester tidak ditemukan.');
      return s;
    }
    const [s] = await tx.select().from(semester).where(eq(semester.isActive, true)).limit(1);
    return s ?? null;
  }

  /** Setoran siswa-siswa itu (urut tanggal) sebagai baris buku besar. */
  async function ledgerOf(tx: Tx, studentIds: string[]) {
    const byStudent = new Map<string, (LedgerRow & { createdAt: Date })[]>();
    if (studentIds.length === 0) return byStudent;
    const rows = await tx
      .select({
        studentId: hafalanEntry.studentId,
        date: hafalanEntry.date,
        kind: hafalanEntry.kind,
        quality: hafalanEntry.quality,
        surahFrom: hafalanEntry.surahFrom,
        ayahFrom: hafalanEntry.ayahFrom,
        surahTo: hafalanEntry.surahTo,
        ayahTo: hafalanEntry.ayahTo,
        createdAt: hafalanEntry.createdAt,
      })
      .from(hafalanEntry)
      .where(inArray(hafalanEntry.studentId, studentIds))
      .orderBy(asc(hafalanEntry.date), asc(hafalanEntry.createdAt));
    for (const r of rows) {
      const list = byStudent.get(r.studentId) ?? [];
      list.push(r);
      byStudent.set(r.studentId, list);
    }
    return byStudent;
  }

  async function halaqahViews(tx: Tx, ctx: TenantContext, where: ReturnType<typeof and> | undefined) {
    const rows = await tx
      .select({ h: halaqah, mentorName: teacher.name })
      .from(halaqah)
      .leftJoin(teacher, eq(teacher.id, halaqah.mentorTeacherId))
      .where(where)
      .orderBy(asc(halaqah.name));
    const counts = rows.length
      ? await tx
          .select({ id: halaqahMember.halaqahId, n: count() })
          .from(halaqahMember)
          .where(
            inArray(
              halaqahMember.halaqahId,
              rows.map((r) => r.h.id),
            ),
          )
          .groupBy(halaqahMember.halaqahId)
      : [];
    const mine = await myTeacherId(tx, ctx);
    const manager = ctx.permissions.has('tahfidz:manage');
    return rows.map(({ h, mentorName }) => ({
      id: h.id,
      academicYearId: h.academicYearId,
      name: h.name,
      mentorTeacherId: h.mentorTeacherId,
      mentorName: mentorName ?? null,
      scheduleNote: h.scheduleNote,
      active: h.active,
      memberCount: counts.find((c) => c.id === h.id)?.n ?? 0,
      canManage: manager || (mine !== null && h.mentorTeacherId === mine),
    }));
  }

  /* ---------- Halaqah ---------- */

  app.get(
    '/v1/tahfidz/halaqah',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar halaqah',
        description:
          'Izin: `tahfidz:read`; modul `tahfidz`. Halaqah pada tahun ajaran `academicYearId` (bawaan: tahun ajaran ' +
          'aktif; daftar kosong bila belum ada tahun aktif). Memuat nama mentor, jumlah anggota, dan `canManage` ' +
          '(pengelola atau guru mentornya).',
        headers: schoolHeader,
        querystring: z.object({ academicYearId: z.uuid().optional() }),
        response: { 200: z.array(halaqahSchema), ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const yearId = request.query.academicYearId ?? (await activeYearId(tx));
        if (!yearId) return [];
        return halaqahViews(tx, ctx, eq(halaqah.academicYearId, yearId));
      });
    },
  );

  app.post(
    '/v1/tahfidz/halaqah',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Tambah halaqah',
        description:
          'Izin: `tahfidz:manage`; modul `tahfidz`. `academicYearId` bawaan tahun ajaran aktif (409 `no_active_year` ' +
          'bila tidak ada; 400 `invalid_reference` bila tidak dikenal). Nama unik per tahun ajaran (409 `conflict`). ' +
          'Mentor harus guru aktif sekolah ini (400 `invalid_reference`).',
        headers: schoolHeader,
        body: z.object({ academicYearId: z.uuid().optional(), ...halaqahFields }),
        response: { 201: halaqahSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const { academicYearId, ...fields } = request.body;
      const created = await conflictAs409('Nama halaqah itu sudah ada pada tahun ajaran ini.', () =>
        tenant(request, async (tx) => {
          let yearId = academicYearId ?? null;
          if (yearId) {
            const [y] = await tx
              .select({ id: academicYear.id })
              .from(academicYear)
              .where(eq(academicYear.id, yearId));
            if (!y) throw invalidRef('Tahun ajaran tidak ditemukan.');
          } else {
            yearId = await activeYearId(tx);
            if (!yearId) throw new HttpError(409, 'no_active_year', 'Belum ada tahun ajaran aktif.');
          }
          await checkMentor(tx, fields.mentorTeacherId);
          const [row] = await tx
            .insert(halaqah)
            .values({ schoolId: ctx.schoolId, academicYearId: yearId, ...fields })
            .returning({ id: halaqah.id });
          await audit(tx, ctx, 'tahfidz.halaqah_create', 'halaqah', row!.id, { name: fields.name });
          return (await halaqahViews(tx, ctx, eq(halaqah.id, row!.id)))[0]!;
        }),
      );
      return reply.code(201).send(created);
    },
  );

  app.put(
    '/v1/tahfidz/halaqah/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Ubah halaqah',
        description:
          'Izin: `tahfidz:manage`; modul `tahfidz`. Mengganti seluruh isi (tahun ajaran tidak berubah; `active: false` ' +
          'untuk menonaktifkan). Nama unik per tahun ajaran (409 `conflict`); mentor harus guru aktif (400 ' +
          '`invalid_reference`).',
        headers: schoolHeader,
        params: idParams,
        body: z.object(halaqahFields),
        response: { 200: halaqahSchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return conflictAs409('Nama halaqah itu sudah ada pada tahun ajaran ini.', () =>
        tenant(request, async (tx) => {
          await halaqahOrThrow(tx, request.params.id);
          await checkMentor(tx, request.body.mentorTeacherId);
          await tx.update(halaqah).set(request.body).where(eq(halaqah.id, request.params.id));
          await audit(tx, ctx, 'tahfidz.halaqah_update', 'halaqah', request.params.id, {
            name: request.body.name,
            active: request.body.active,
          });
          return (await halaqahViews(tx, ctx, eq(halaqah.id, request.params.id)))[0]!;
        }),
      );
    },
  );

  app.delete(
    '/v1/tahfidz/halaqah/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Hapus halaqah',
        description:
          'Izin: `tahfidz:manage`; modul `tahfidz`. Ditolak 409 `in_use` bila sudah punya setoran hafalan; nonaktifkan ' +
          'lewat ubah (`active: false`). Anggota ikut terhapus.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const id = request.params.id;
      return tenant(request, async (tx) => {
        await halaqahOrThrow(tx, id);
        const [entries] = await tx
          .select({ n: count() })
          .from(hafalanEntry)
          .where(eq(hafalanEntry.halaqahId, id));
        if ((entries?.n ?? 0) > 0) {
          throw new HttpError(409, 'in_use', 'Halaqah ini sudah punya setoran hafalan; nonaktifkan saja.');
        }
        await tx.delete(halaqahMember).where(eq(halaqahMember.halaqahId, id));
        await tx.delete(halaqah).where(eq(halaqah.id, id));
        await audit(tx, ctx, 'tahfidz.halaqah_delete', 'halaqah', id);
        return { ok: true as const };
      });
    },
  );

  /* ---------- Anggota halaqah ---------- */

  app.get(
    '/v1/tahfidz/halaqah/:id/members',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Anggota halaqah',
        description:
          'Izin: `tahfidz:read`; modul `tahfidz`. Siswa aktif anggota halaqah, urut nama. `className` adalah kelas ' +
          'siswa pada tahun ajaran halaqah.',
        headers: schoolHeader,
        params: idParams,
        response: {
          200: z.array(
            z.object({
              studentId: z.uuid(),
              name: z.string(),
              nis: z.string().nullable(),
              className: z.string().nullable(),
              joinedAt: z.string(),
            }),
          ),
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const h = await halaqahOrThrow(tx, request.params.id);
        const members = await halaqahMembers(tx, h.id);
        const classes = await classNames(
          tx,
          members.map((m) => m.id),
          h.academicYearId,
        );
        return members.map((m) => ({
          studentId: m.id,
          name: m.name,
          nis: m.nis,
          className: classes.get(m.id) ?? null,
          joinedAt: m.joinedAt.toISOString(),
        }));
      }),
  );

  app.post(
    '/v1/tahfidz/halaqah/:id/members',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Tambah anggota halaqah',
        description:
          'Izin: `tahfidz:read` ditambah pengelola (`tahfidz:manage`) atau guru mentor halaqah ini; selain itu 403 ' +
          '`forbidden`. Hanya siswa aktif sekolah ini (400 `invalid_reference` bila ada yang bukan). Satu siswa satu ' +
          'halaqah per tahun ajaran: siswa yang sudah berada di halaqah mana pun pada tahun ajaran halaqah ini ' +
          'dilewati dan dilaporkan di `skipped` beserta nama halaqahnya. Maksimal 200 siswa per permintaan.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({ studentIds: z.array(z.uuid()).min(1).max(200) }),
        response: {
          200: z.object({
            added: z.number().int(),
            skipped: z.array(z.object({ studentId: z.uuid(), name: z.string(), halaqahName: z.string() })),
          }),
          400: errorSchema,
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const ids = [...new Set(request.body.studentIds)];
      return tenant(request, async (tx) => {
        const h = await authorizeHalaqah(tx, ctx, request.params.id);
        const found = await tx
          .select({ id: student.id, name: student.name })
          .from(student)
          .where(and(inArray(student.id, ids), isNull(student.deletedAt), eq(student.status, 'active')));
        if (found.length !== ids.length) throw invalidRef('Ada siswa yang tidak ditemukan atau tidak aktif.');
        const existing = await membershipsOf(tx, ids, h.academicYearId);
        const skipped = found
          .filter((s) => existing.has(s.id))
          .map((s) => ({ studentId: s.id, name: s.name, halaqahName: existing.get(s.id)!.name }));
        const toAdd = ids.filter((id) => !existing.has(id));
        const inserted = toAdd.length
          ? await tx
              .insert(halaqahMember)
              .values(
                toAdd.map((studentId) => ({
                  schoolId: ctx.schoolId,
                  halaqahId: h.id,
                  studentId,
                  academicYearId: h.academicYearId,
                })),
              )
              .onConflictDoNothing()
              .returning({ id: halaqahMember.id })
          : [];
        await audit(tx, ctx, 'tahfidz.members_add', 'halaqah', h.id, {
          added: inserted.length,
          skipped: skipped.length,
        });
        return { added: inserted.length, skipped };
      });
    },
  );

  app.delete(
    '/v1/tahfidz/halaqah/:id/members/:studentId',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Keluarkan anggota halaqah',
        description:
          'Izin: `tahfidz:read` ditambah pengelola (`tahfidz:manage`) atau guru mentor halaqah ini; selain itu 403 ' +
          '`forbidden`. 404 bila bukan anggota. Setoran lama tetap tersimpan.',
        headers: schoolHeader,
        params: z.object({ id: z.uuid(), studentId: z.uuid() }),
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { id, studentId } = request.params;
      return tenant(request, async (tx) => {
        await authorizeHalaqah(tx, ctx, id);
        const removed = await tx
          .delete(halaqahMember)
          .where(and(eq(halaqahMember.halaqahId, id), eq(halaqahMember.studentId, studentId)))
          .returning({ id: halaqahMember.id });
        if (removed.length === 0) throw notFound('Anggota');
        await audit(tx, ctx, 'tahfidz.members_remove', 'halaqah', id, { studentId });
        return { ok: true as const };
      });
    },
  );

  /* ---------- Setoran ---------- */

  app.get(
    '/v1/tahfidz/entries',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar setoran hafalan',
        description:
          'Izin: `tahfidz:read`; modul `tahfidz`. Saring dengan `studentId` dan/atau `halaqahId` (halaqah saat setoran ' +
          'dicatat) dan rentang tanggal `from`..`to`. Terbaru dahulu; `limit` bawaan 50 (maksimal 200) dan `offset`. ' +
          '`total` adalah jumlah seluruh baris yang cocok.',
        headers: schoolHeader,
        querystring: z.object({
          studentId: z.uuid().optional(),
          halaqahId: z.uuid().optional(),
          from: dateField.optional(),
          to: dateField.optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        }),
        response: { 200: z.object({ total: z.number().int(), items: z.array(entrySchema) }), ...guarded },
      },
    },
    async (request) => {
      const q = request.query;
      const conds = [
        q.studentId ? eq(hafalanEntry.studentId, q.studentId) : undefined,
        q.halaqahId ? eq(hafalanEntry.halaqahId, q.halaqahId) : undefined,
        q.from ? gte(hafalanEntry.date, q.from) : undefined,
        q.to ? lte(hafalanEntry.date, q.to) : undefined,
      ].filter((c) => c !== undefined);
      const where = conds.length ? and(...conds) : undefined;
      return tenant(request, async (tx) => {
        const [total] = await tx.select({ n: count() }).from(hafalanEntry).where(where);
        const rows = await tx
          .select({ e: hafalanEntry, studentName: student.name })
          .from(hafalanEntry)
          .innerJoin(student, eq(student.id, hafalanEntry.studentId))
          .where(where)
          .orderBy(desc(hafalanEntry.date), desc(hafalanEntry.createdAt), desc(hafalanEntry.id))
          .limit(q.limit)
          .offset(q.offset);
        return {
          total: total?.n ?? 0,
          items: rows.map(({ e, studentName }) => ({
            id: e.id,
            studentId: e.studentId,
            studentName,
            halaqahId: e.halaqahId,
            date: e.date,
            kind: e.kind,
            surahFrom: e.surahFrom,
            ayahFrom: e.ayahFrom,
            surahTo: e.surahTo,
            ayahTo: e.ayahTo,
            ayahCount: rangeAyahCount(e.surahFrom, e.ayahFrom, e.surahTo, e.ayahTo),
            quality: e.quality,
            note: e.note,
          })),
        };
      });
    },
  );

  app.post(
    '/v1/tahfidz/entries',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Catat setoran hafalan',
        description:
          'Izin: `tahfidz:read` ditambah pengelola (`tahfidz:manage`) atau guru mentor halaqah siswa itu; guru lain 403 ' +
          '`forbidden`. Tanggal tidak boleh belum tiba (409 `future_date`). Rentang ayat harus ada dan awal tidak ' +
          'melewati akhir (400 `invalid_range`). Selain pengelola, siswa harus anggota halaqah pada tahun ajaran yang ' +
          'mencakup tanggal (400 `invalid_reference`); setoran pengelola untuk siswa tanpa halaqah tersimpan tanpa ' +
          'halaqah. `kind`: `ziyadah` (hafalan baru) atau `murajaah`; `quality`: `fluent`, `fair`, atau `repeat` ' +
          '(harus diulang, tidak dihitung sebagai hafalan baru).',
        headers: schoolHeader,
        body: z.object({
          studentId: z.uuid(),
          date: dateField,
          kind: z.enum(KINDS),
          surahFrom: z.number().int().min(1).max(114),
          ayahFrom: z.number().int().min(1).max(286),
          surahTo: z.number().int().min(1).max(114),
          ayahTo: z.number().int().min(1).max(286),
          quality: z.enum(QUALITIES).default('fluent'),
          note: z.string().trim().max(300).nullable().default(null),
        }),
        response: { 201: entrySchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      if (b.date > todayInJakarta()) {
        throw new HttpError(409, 'future_date', 'Setoran tidak bisa dicatat untuk tanggal yang belum tiba.');
      }
      if (!validRange(b.surahFrom, b.ayahFrom, b.surahTo, b.ayahTo)) {
        throw new HttpError(
          400,
          'invalid_range',
          'Rentang ayat tidak sah: ayat tidak ada atau awal melewati akhir.',
        );
      }
      const view = await tenant(request, async (tx) => {
        const yearId = await yearForDate(tx, b.date);
        const members = await authorizeStudents(tx, ctx, [b.studentId], yearId, false);
        const [row] = await tx
          .insert(hafalanEntry)
          .values({
            schoolId: ctx.schoolId,
            studentId: b.studentId,
            halaqahId: members.get(b.studentId)?.halaqahId ?? null,
            date: b.date,
            kind: b.kind,
            surahFrom: b.surahFrom,
            ayahFrom: b.ayahFrom,
            surahTo: b.surahTo,
            ayahTo: b.ayahTo,
            quality: b.quality,
            note: b.note,
            recordedBy: ctx.userId,
          })
          .returning();
        const [s] = await tx.select({ name: student.name }).from(student).where(eq(student.id, b.studentId));
        await audit(tx, ctx, 'tahfidz.entry_create', 'hafalan_entry', row!.id, {
          studentId: b.studentId,
          date: b.date,
          kind: b.kind,
        });
        return {
          id: row!.id,
          studentId: row!.studentId,
          studentName: s?.name ?? '',
          halaqahId: row!.halaqahId,
          date: row!.date,
          kind: row!.kind,
          surahFrom: row!.surahFrom,
          ayahFrom: row!.ayahFrom,
          surahTo: row!.surahTo,
          ayahTo: row!.ayahTo,
          ayahCount: rangeAyahCount(row!.surahFrom, row!.ayahFrom, row!.surahTo, row!.ayahTo),
          quality: row!.quality,
          note: row!.note,
        };
      });
      return reply.code(201).send(view);
    },
  );

  app.delete(
    '/v1/tahfidz/entries/:id',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Hapus setoran hafalan',
        description:
          'Izin: `tahfidz:read` ditambah pengelola (`tahfidz:manage`) atau guru mentor halaqah tempat setoran dicatat; ' +
          'selain itu 403 `forbidden` (setoran tanpa halaqah hanya oleh pengelola).',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const [e] = await tx.select().from(hafalanEntry).where(eq(hafalanEntry.id, request.params.id));
        if (!e) throw notFound('Setoran');
        if (e.halaqahId) await authorizeHalaqah(tx, ctx, e.halaqahId);
        else if (!ctx.permissions.has('tahfidz:manage')) {
          throw forbidden('Setoran tanpa halaqah hanya boleh dihapus oleh pengelola tahfidz.');
        }
        await tx.delete(hafalanEntry).where(eq(hafalanEntry.id, e.id));
        await audit(tx, ctx, 'tahfidz.entry_delete', 'hafalan_entry', e.id, {
          studentId: e.studentId,
          date: e.date,
        });
        return { ok: true as const };
      });
    },
  );

  /* ---------- Progres siswa ---------- */

  const surahCoverageSchema = z.object({
    surah: z.number().int(),
    ayahs: z.number().int(),
    complete: z.boolean(),
  });
  const targetPair = z.object({ ziyadahAyahs: z.number().int(), murajaahAyahs: z.number().int() });

  app.get(
    '/v1/tahfidz/students/:studentId/progress',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Progres hafalan siswa',
        description:
          'Izin: `tahfidz:read`; modul `tahfidz`. `coverage` menghitung ayat unik dari seluruh setoran ziyadah dengan ' +
          'kualitas selain `repeat` (rentang tumpang tindih tidak menggandakan); `juzComplete` = jumlah juz yang ' +
          'seluruh ayatnya tercakup. `semester` (bawaan: semester aktif; `id` null bila tidak ada) memuat target dan ' +
          'capaian ayat unik dalam rentang semester; `percentOfTarget` = (ziyadah dan murajaah tercapai, masing-masing ' +
          'dibatasi targetnya) / total target, null bila target 0. `last30Days` berisi 30 hari terakhir (nol bila tak ' +
          'ada setoran). `streakDays` = hari beruntun dengan setoran sampai hari ini (atau kemarin bila hari ini belum ' +
          'ada). `next` = ayat lanjutan setoran ziyadah terakhir (awal setoran itu bila kualitasnya `repeat`).',
        headers: schoolHeader,
        params: z.object({ studentId: z.uuid() }),
        querystring: z.object({ semesterId: z.uuid().optional() }),
        response: {
          200: z.object({
            student: z.object({ id: z.uuid(), name: z.string(), className: z.string().nullable() }),
            halaqah: z.object({ id: z.uuid(), name: z.string() }).nullable(),
            coverage: z.object({
              ayahs: z.number().int(),
              percent: z.number(),
              perSurah: z.array(surahCoverageSchema),
              juzComplete: z.number().int(),
              juzCompleteList: z.array(z.number().int()),
            }),
            semester: z.object({
              id: z.uuid().nullable(),
              name: z.string().nullable(),
              target: targetPair,
              done: targetPair,
              percentOfTarget: z.number().nullable(),
            }),
            last30Days: z.array(
              z.object({ date: z.string(), ziyadahAyahs: z.number().int(), murajaahAyahs: z.number().int() }),
            ),
            streakDays: z.number().int(),
            lastEntryDate: z.string().nullable(),
            next: z.object({ surah: z.number().int(), ayah: z.number().int() }).nullable(),
          }),
          400: errorSchema,
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const { studentId } = request.params;
      const today = todayInJakarta();
      return tenant(request, async (tx) => {
        const [st] = await tx
          .select({ id: student.id, name: student.name })
          .from(student)
          .where(and(eq(student.id, studentId), isNull(student.deletedAt)));
        if (!st) throw notFound('Siswa');
        const sem = await resolveSemester(tx, request.query.semesterId);
        const yearId = sem?.academicYearId ?? (await yearForDate(tx, today));
        const members = await membershipsOf(tx, [studentId], yearId);
        const classes = await classNames(tx, [studentId], yearId);
        const rows = (await ledgerOf(tx, [studentId])).get(studentId) ?? [];

        const mask = coverageMask(rows.filter(isNewMemorization));
        const cov = coverageFromMask(mask);
        const juz = juzProgressFromMask(mask);

        let target = { ziyadahAyahs: 0, murajaahAyahs: 0 };
        let done = { ziyadahAyahs: 0, murajaahAyahs: 0 };
        if (sem) {
          const [t] = await tx
            .select()
            .from(hafalanTarget)
            .where(and(eq(hafalanTarget.studentId, studentId), eq(hafalanTarget.semesterId, sem.id)));
          if (t) target = { ziyadahAyahs: t.ziyadahAyahs, murajaahAyahs: t.murajaahAyahs };
          const u = unique(rows.filter((r) => r.date >= sem.startsOn && r.date <= sem.endsOn));
          done = { ziyadahAyahs: u.ziyadah, murajaahAyahs: u.murajaah };
        }
        const totalTarget = target.ziyadahAyahs + target.murajaahAyahs;
        const percentOfTarget =
          totalTarget > 0
            ? ayahPercent(
                Math.min(done.ziyadahAyahs, target.ziyadahAyahs) +
                  Math.min(done.murajaahAyahs, target.murajaahAyahs),
                totalTarget,
              )
            : null;

        const byDate = new Map<string, LedgerRow[]>();
        for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
        const last30Days = Array.from({ length: 30 }, (_, i) => {
          const date = addDays(today, i - 29);
          const u = unique(byDate.get(date) ?? []);
          return { date, ziyadahAyahs: u.ziyadah, murajaahAyahs: u.murajaah };
        });

        let cursor = byDate.has(today) ? today : addDays(today, -1);
        let streakDays = 0;
        while (byDate.has(cursor)) {
          streakDays += 1;
          cursor = addDays(cursor, -1);
        }

        const lastZiyadah = [...rows].reverse().find((r) => r.kind === 'ziyadah');
        const next = lastZiyadah
          ? lastZiyadah.quality === 'repeat'
            ? { surah: lastZiyadah.surahFrom, ayah: lastZiyadah.ayahFrom }
            : nextAyah(lastZiyadah.surahTo, lastZiyadah.ayahTo)
          : null;

        const membership = members.get(studentId);
        return {
          student: { id: st.id, name: st.name, className: classes.get(studentId) ?? null },
          halaqah: membership ? { id: membership.halaqahId, name: membership.name } : null,
          coverage: {
            ayahs: cov.ayahs,
            percent: cov.percent,
            perSurah: cov.perSurah,
            juzComplete: juz.count,
            juzCompleteList: juz.complete,
          },
          semester: {
            id: sem?.id ?? null,
            name: sem?.name ?? null,
            target,
            done,
            percentOfTarget,
          },
          last30Days,
          streakDays,
          lastEntryDate: rows.length ? rows[rows.length - 1]!.date : null,
          next,
        };
      });
    },
  );

  /* ---------- Ringkasan halaqah ---------- */

  app.get(
    '/v1/tahfidz/halaqah/:id/summary',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Ringkasan halaqah',
        description:
          'Izin: `tahfidz:read`; modul `tahfidz`. Per anggota: `ayahsTotal` dan `percent` (ayat unik ziyadah bukan ' +
          '`repeat` seluruh waktu), `ziyadahInRange` dan `murajaahInRange` (ayat unik pada `from`..`to`; bawaan 30 hari ' +
          'terakhir, maksimal 366 hari, selain itu 400 `invalid_range`), `lastEntryDate` dan `daysSinceLast` (hari ' +
          'sejak setoran terakhir sampai hari ini; null bila belum pernah). `onTarget`: membandingkan capaian dalam ' +
          'semester yang memuat tanggal `to` (atau semester aktif tahun halaqah) dengan target yang dibagi rata per ' +
          'hari sampai `to`; null bila siswa belum punya target atau tidak ada semester.',
        headers: schoolHeader,
        params: idParams,
        querystring: rangeQuery,
        response: {
          200: z.object({
            halaqah: z.object({ id: z.uuid(), name: z.string() }),
            from: z.string(),
            to: z.string(),
            semester: z.object({ id: z.uuid(), name: z.string() }).nullable(),
            students: z.array(
              z.object({
                studentId: z.uuid(),
                name: z.string(),
                ayahsTotal: z.number().int(),
                percent: z.number(),
                ziyadahInRange: z.number().int(),
                murajaahInRange: z.number().int(),
                lastEntryDate: z.string().nullable(),
                daysSinceLast: z.number().int().nullable(),
                onTarget: z.boolean().nullable(),
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
      const today = todayInJakarta();
      return tenant(request, async (tx) => {
        const h = await halaqahOrThrow(tx, request.params.id);
        const members = await halaqahMembers(tx, h.id);
        const ids = members.map((m) => m.id);
        const ledger = await ledgerOf(tx, ids);

        const [inRange] = await tx
          .select()
          .from(semester)
          .where(
            and(
              eq(semester.academicYearId, h.academicYearId),
              lte(semester.startsOn, range.to),
              gte(semester.endsOn, range.to),
            ),
          )
          .limit(1);
        const [active] = inRange
          ? [inRange]
          : await tx
              .select()
              .from(semester)
              .where(and(eq(semester.academicYearId, h.academicYearId), eq(semester.isActive, true)))
              .limit(1);
        const sem = active ?? null;
        const targets =
          sem && ids.length
            ? await tx
                .select()
                .from(hafalanTarget)
                .where(and(eq(hafalanTarget.semesterId, sem.id), inArray(hafalanTarget.studentId, ids)))
            : [];

        return {
          halaqah: { id: h.id, name: h.name },
          ...range,
          semester: sem ? { id: sem.id, name: sem.name } : null,
          students: members.map((m) => {
            const rows = ledger.get(m.id) ?? [];
            const all = unique(rows);
            const ayahsTotal = all.ziyadah;
            const inR = unique(rows.filter((r) => r.date >= range.from && r.date <= range.to));
            const last = rows.length ? rows[rows.length - 1]!.date : null;
            let onTarget: boolean | null = null;
            const t = targets.find((x) => x.studentId === m.id);
            if (sem && t && t.ziyadahAyahs + t.murajaahAyahs > 0 && range.to >= sem.startsOn) {
              const share = elapsedShare(sem, range.to);
              const until = range.to < sem.endsOn ? range.to : sem.endsOn;
              const d = unique(rows.filter((r) => r.date >= sem.startsOn && r.date <= until));
              onTarget =
                d.ziyadah >= Math.ceil(t.ziyadahAyahs * share) &&
                d.murajaah >= Math.ceil(t.murajaahAyahs * share);
            }
            return {
              studentId: m.id,
              name: m.name,
              ayahsTotal,
              percent: ayahPercent(ayahsTotal, TOTAL_AYAHS),
              ziyadahInRange: inR.ziyadah,
              murajaahInRange: inR.murajaah,
              lastEntryDate: last,
              daysSinceLast: last ? Math.max(daysBetween(last, today), 0) : null,
              onTarget,
            };
          }),
        };
      });
    },
  );

  /* ---------- Target ---------- */

  const targetRow = z.object({
    studentId: z.uuid(),
    name: z.string(),
    halaqahId: z.uuid().nullable(),
    ziyadahAyahs: z.number().int(),
    murajaahAyahs: z.number().int(),
    set: z.boolean().describe('Sudah ada target tersimpan untuk siswa ini'),
  });

  app.get(
    '/v1/tahfidz/targets',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Target hafalan per semester',
        description:
          'Izin: `tahfidz:read`; modul `tahfidz`. Dengan `halaqahId`: seluruh anggota halaqah (target 0 dan `set: false` ' +
          'bila belum ditetapkan). Tanpa `halaqahId`: semua siswa yang punya target pada semester itu. Semester tak ' +
          'dikenal: 400 `invalid_reference`.',
        headers: schoolHeader,
        querystring: z.object({ semesterId: z.uuid(), halaqahId: z.uuid().optional() }),
        response: { 200: z.array(targetRow), 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const sem = await resolveSemester(tx, request.query.semesterId);
        const semId = sem!.id;
        if (request.query.halaqahId) {
          const h = await halaqahOrThrow(tx, request.query.halaqahId);
          const members = await halaqahMembers(tx, h.id);
          const targets = members.length
            ? await tx
                .select()
                .from(hafalanTarget)
                .where(
                  and(
                    eq(hafalanTarget.semesterId, semId),
                    inArray(
                      hafalanTarget.studentId,
                      members.map((m) => m.id),
                    ),
                  ),
                )
            : [];
          return members.map((m) => {
            const t = targets.find((x) => x.studentId === m.id);
            return {
              studentId: m.id,
              name: m.name,
              halaqahId: h.id,
              ziyadahAyahs: t?.ziyadahAyahs ?? 0,
              murajaahAyahs: t?.murajaahAyahs ?? 0,
              set: t !== undefined,
            };
          });
        }
        const rows = await tx
          .select({ t: hafalanTarget, name: student.name })
          .from(hafalanTarget)
          .innerJoin(student, eq(student.id, hafalanTarget.studentId))
          .where(eq(hafalanTarget.semesterId, semId))
          .orderBy(asc(student.name));
        const members = await membershipsOf(
          tx,
          rows.map((r) => r.t.studentId),
          sem!.academicYearId,
        );
        return rows.map(({ t, name }) => ({
          studentId: t.studentId,
          name,
          halaqahId: members.get(t.studentId)?.halaqahId ?? null,
          ziyadahAyahs: t.ziyadahAyahs,
          murajaahAyahs: t.murajaahAyahs,
          set: true,
        }));
      }),
  );

  app.put(
    '/v1/tahfidz/targets',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Simpan target hafalan',
        description:
          'Izin: `tahfidz:read` ditambah pengelola (`tahfidz:manage`) atau guru mentor halaqah tiap siswa pada tahun ' +
          'ajaran semester itu; guru lain 403 `forbidden`. Semester harus milik sekolah ini dan siswa aktif (400 ' +
          '`invalid_reference`). Selain pengelola, siswa harus anggota halaqah mentor itu. Target berupa jumlah ayat ' +
          'baru (ziyadah) dan ayat murajaah selama semester. Maksimal 200 baris.',
        headers: schoolHeader,
        body: z.object({
          semesterId: z.uuid(),
          records: z
            .array(
              z.object({
                studentId: z.uuid(),
                ziyadahAyahs: z.number().int().min(0).max(TOTAL_AYAHS),
                murajaahAyahs: z
                  .number()
                  .int()
                  .min(0)
                  .max(TOTAL_AYAHS * 5),
              }),
            )
            .min(1)
            .max(200),
        }),
        response: { 200: z.object({ saved: z.number().int() }), 400: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { semesterId, records } = request.body;
      return tenant(request, async (tx) => {
        const sem = (await resolveSemester(tx, semesterId))!;
        await authorizeStudents(
          tx,
          ctx,
          records.map((r) => r.studentId),
          sem.academicYearId,
          false,
        );
        for (const r of records) {
          await tx
            .insert(hafalanTarget)
            .values({
              schoolId: ctx.schoolId,
              studentId: r.studentId,
              semesterId,
              ziyadahAyahs: r.ziyadahAyahs,
              murajaahAyahs: r.murajaahAyahs,
            })
            .onConflictDoUpdate({
              target: [hafalanTarget.studentId, hafalanTarget.semesterId],
              set: { ziyadahAyahs: r.ziyadahAyahs, murajaahAyahs: r.murajaahAyahs, updatedAt: new Date() },
            });
        }
        await audit(tx, ctx, 'tahfidz.targets_save', 'semester', semesterId, { count: records.length });
        return { saved: records.length };
      });
    },
  );

  /* ---------- Butir ibadah ---------- */

  app.get(
    '/v1/tahfidz/ibadah-items',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar butir ibadah',
        description:
          'Izin: `tahfidz:read`; modul `tahfidz`. Semua butir (termasuk yang nonaktif), urut `sort` lalu nama. ' +
          '`kind`: `daily` (harian) atau `weekly` (mingguan).',
        headers: schoolHeader,
        response: { 200: z.array(ibadahItemSchema), ...guarded },
      },
    },
    async (request) =>
      tenant(request, (tx) =>
        tx
          .select({
            id: ibadahItem.id,
            name: ibadahItem.name,
            kind: ibadahItem.kind,
            sort: ibadahItem.sort,
            active: ibadahItem.active,
          })
          .from(ibadahItem)
          .orderBy(asc(ibadahItem.sort), asc(ibadahItem.name)),
      ),
  );

  app.post(
    '/v1/tahfidz/ibadah-items',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Tambah butir ibadah',
        description: 'Izin: `tahfidz:manage`; modul `tahfidz`. Nama unik di sekolah (409 `conflict`).',
        headers: schoolHeader,
        body: ibadahItemBody,
        response: { 201: ibadahItemSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const created = await conflictAs409('Nama butir ibadah itu sudah ada.', () =>
        tenant(request, async (tx) => {
          const [row] = await tx
            .insert(ibadahItem)
            .values({ schoolId: ctx.schoolId, ...request.body })
            .returning({
              id: ibadahItem.id,
              name: ibadahItem.name,
              kind: ibadahItem.kind,
              sort: ibadahItem.sort,
              active: ibadahItem.active,
            });
          await audit(tx, ctx, 'tahfidz.ibadah_item_create', 'ibadah_item', row!.id, {
            name: request.body.name,
          });
          return row!;
        }),
      );
      return reply.code(201).send(created);
    },
  );

  app.put(
    '/v1/tahfidz/ibadah-items/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Ubah butir ibadah',
        description:
          'Izin: `tahfidz:manage`; modul `tahfidz`. Mengganti seluruh isi (`active: false` untuk menonaktifkan). Nama ' +
          'unik (409 `conflict`).',
        headers: schoolHeader,
        params: idParams,
        body: ibadahItemBody,
        response: { 200: ibadahItemSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return conflictAs409('Nama butir ibadah itu sudah ada.', () =>
        tenant(request, async (tx) => {
          const [row] = await tx
            .update(ibadahItem)
            .set(request.body)
            .where(eq(ibadahItem.id, request.params.id))
            .returning({
              id: ibadahItem.id,
              name: ibadahItem.name,
              kind: ibadahItem.kind,
              sort: ibadahItem.sort,
              active: ibadahItem.active,
            });
          if (!row) throw notFound('Butir ibadah');
          await audit(tx, ctx, 'tahfidz.ibadah_item_update', 'ibadah_item', row.id, {
            name: request.body.name,
            active: request.body.active,
          });
          return row;
        }),
      );
    },
  );

  app.delete(
    '/v1/tahfidz/ibadah-items/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Hapus butir ibadah',
        description:
          'Izin: `tahfidz:manage`; modul `tahfidz`. Ditolak 409 `in_use` bila sudah ada catatan ibadahnya; nonaktifkan ' +
          'lewat ubah (`active: false`).',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const id = request.params.id;
      return tenant(request, async (tx) => {
        const [item] = await tx.select({ id: ibadahItem.id }).from(ibadahItem).where(eq(ibadahItem.id, id));
        if (!item) throw notFound('Butir ibadah');
        const [logs] = await tx.select({ n: count() }).from(ibadahLog).where(eq(ibadahLog.itemId, id));
        if ((logs?.n ?? 0) > 0) {
          throw new HttpError(409, 'in_use', 'Butir ibadah ini sudah punya catatan; nonaktifkan saja.');
        }
        await tx.delete(ibadahItem).where(eq(ibadahItem.id, id));
        await audit(tx, ctx, 'tahfidz.ibadah_item_delete', 'ibadah_item', id);
        return { ok: true as const };
      });
    },
  );

  /* ---------- Lembar dan laporan ibadah ---------- */

  /** Siswa aktif menurut lingkup: halaqah, kelas, atau satu siswa. Tepat satu lingkup harus diberikan. */
  async function scopeStudents(
    tx: Tx,
    scope: { halaqahId?: string | undefined; classId?: string | undefined; studentId?: string | undefined },
  ) {
    const given = [scope.halaqahId, scope.classId, scope.studentId].filter((x) => x !== undefined);
    if (given.length !== 1) {
      throw new HttpError(
        400,
        'invalid_scope',
        'Berikan tepat satu dari halaqahId, classId, atau studentId.',
      );
    }
    if (scope.halaqahId) {
      const h = await halaqahOrThrow(tx, scope.halaqahId);
      return {
        halaqah: h,
        students: (await halaqahMembers(tx, h.id)).map((m) => ({ id: m.id, name: m.name })),
      };
    }
    if (scope.classId) {
      const [c] = await tx.select().from(classRoom).where(eq(classRoom.id, scope.classId));
      if (!c) throw notFound('Kelas');
      const rows = await tx
        .select({ id: student.id, name: student.name })
        .from(enrollment)
        .innerJoin(student, eq(student.id, enrollment.studentId))
        .where(
          and(
            eq(enrollment.classId, c.id),
            eq(enrollment.academicYearId, c.academicYearId),
            isNull(student.deletedAt),
            eq(student.status, 'active'),
          ),
        )
        .orderBy(asc(student.name));
      return { halaqah: null, students: rows };
    }
    const [st] = await tx
      .select({ id: student.id, name: student.name })
      .from(student)
      .where(and(eq(student.id, scope.studentId as string), isNull(student.deletedAt)));
    if (!st) throw notFound('Siswa');
    return { halaqah: null, students: [st] };
  }

  app.get(
    '/v1/tahfidz/ibadah-sheet',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Lembar ibadah harian',
        description:
          'Izin: `tahfidz:read`; modul `tahfidz`. Berikan tepat satu dari `halaqahId` atau `classId` (400 ' +
          '`invalid_scope`). `date` bawaan hari ini. `items` adalah butir ibadah aktif; `done[itemId]` bernilai true, ' +
          'false, atau null bila belum dicatat. `canRecord`: pengelola, atau guru mentor halaqah itu (untuk lembar ' +
          'kelas hanya pengelola).',
        headers: schoolHeader,
        querystring: z.object({
          date: dateField.optional(),
          halaqahId: z.uuid().optional(),
          classId: z.uuid().optional(),
        }),
        response: {
          200: z.object({
            date: z.string(),
            items: z.array(ibadahItemSchema),
            canRecord: z.boolean(),
            students: z.array(
              z.object({
                studentId: z.uuid(),
                name: z.string(),
                done: z.record(z.string(), z.boolean().nullable()),
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
      const ctx = request.ctx as TenantContext;
      const date = request.query.date ?? todayInJakarta();
      if (!request.query.halaqahId && !request.query.classId) {
        throw new HttpError(400, 'invalid_scope', 'Berikan halaqahId atau classId.');
      }
      return tenant(request, async (tx) => {
        const scope = await scopeStudents(tx, {
          halaqahId: request.query.halaqahId,
          classId: request.query.classId,
        });
        const items = await tx
          .select({
            id: ibadahItem.id,
            name: ibadahItem.name,
            kind: ibadahItem.kind,
            sort: ibadahItem.sort,
            active: ibadahItem.active,
          })
          .from(ibadahItem)
          .where(eq(ibadahItem.active, true))
          .orderBy(asc(ibadahItem.sort), asc(ibadahItem.name));
        const ids = scope.students.map((s) => s.id);
        const logs =
          ids.length && items.length
            ? await tx
                .select({ studentId: ibadahLog.studentId, itemId: ibadahLog.itemId, done: ibadahLog.done })
                .from(ibadahLog)
                .where(and(eq(ibadahLog.date, date), inArray(ibadahLog.studentId, ids)))
            : [];
        const canRecord = scope.halaqah
          ? await canWriteHalaqah(tx, ctx, scope.halaqah)
          : ctx.permissions.has('tahfidz:manage');
        return {
          date,
          items,
          canRecord,
          students: scope.students.map((s) => ({
            studentId: s.id,
            name: s.name,
            done: Object.fromEntries(
              items.map((i) => [
                i.id,
                logs.find((l) => l.studentId === s.id && l.itemId === i.id)?.done ?? null,
              ]),
            ),
          })),
        };
      });
    },
  );

  app.put(
    '/v1/tahfidz/ibadah-sheet',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Simpan lembar ibadah harian',
        description:
          'Izin: `tahfidz:read` ditambah pengelola (`tahfidz:manage`) atau guru mentor halaqah tiap siswa; guru lain 403 ' +
          '`forbidden`. Tanggal tidak boleh belum tiba (409 `future_date`). Siswa harus aktif dan anggota halaqah atau ' +
          'terdaftar di kelas pada tahun ajaran tanggal itu; butir harus aktif (400 `invalid_reference`). Mengganti ' +
          'catatan yang sudah ada (satu catatan per siswa per butir per tanggal). Maksimal 500 baris.',
        headers: schoolHeader,
        body: z.object({
          date: dateField,
          records: z
            .array(
              z.object({
                studentId: z.uuid(),
                itemId: z.uuid(),
                done: z.boolean(),
                note: z.string().trim().max(200).nullable().default(null),
              }),
            )
            .min(1)
            .max(500),
        }),
        response: {
          200: z.object({ saved: z.number().int() }),
          400: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { date, records } = request.body;
      if (date > todayInJakarta()) {
        throw new HttpError(409, 'future_date', 'Ibadah tidak bisa dicatat untuk tanggal yang belum tiba.');
      }
      return tenant(request, async (tx) => {
        const yearId = await yearForDate(tx, date);
        await authorizeStudents(
          tx,
          ctx,
          records.map((r) => r.studentId),
          yearId,
          true,
        );
        const itemIds = [...new Set(records.map((r) => r.itemId))];
        const items = await tx
          .select({ id: ibadahItem.id })
          .from(ibadahItem)
          .where(and(inArray(ibadahItem.id, itemIds), eq(ibadahItem.active, true)));
        if (items.length !== itemIds.length)
          throw invalidRef('Ada butir ibadah yang tidak ditemukan atau nonaktif.');
        for (const r of records) {
          await tx
            .insert(ibadahLog)
            .values({
              schoolId: ctx.schoolId,
              studentId: r.studentId,
              itemId: r.itemId,
              date,
              done: r.done,
              note: r.note,
              recordedBy: ctx.userId,
            })
            .onConflictDoUpdate({
              target: [ibadahLog.studentId, ibadahLog.itemId, ibadahLog.date],
              set: { done: r.done, note: r.note, recordedBy: ctx.userId, updatedAt: new Date() },
            });
        }
        await audit(tx, ctx, 'tahfidz.ibadah_save', 'ibadah_log', date, { count: records.length });
        return { saved: records.length };
      });
    },
  );

  app.get(
    '/v1/tahfidz/ibadah-report',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Laporan ibadah',
        description:
          'Izin: `tahfidz:read`; modul `tahfidz`. Berikan tepat satu dari `halaqahId`, `classId`, atau `studentId` ' +
          '(400 `invalid_scope`). Rentang `from`..`to` bawaan 30 hari terakhir, maksimal 366 hari (400 ' +
          '`invalid_range`). Per siswa per butir: `total` = jumlah hari yang tercatat, `done` = yang dikerjakan, ' +
          '`percent` = done/total (dua desimal; 0 bila belum ada catatan). Butir mencakup yang aktif dan yang punya ' +
          'catatan pada rentang itu.',
        headers: schoolHeader,
        querystring: z.object({
          halaqahId: z.uuid().optional(),
          classId: z.uuid().optional(),
          studentId: z.uuid().optional(),
          from: dateField.optional(),
          to: dateField.optional(),
        }),
        response: {
          200: z.object({
            from: z.string(),
            to: z.string(),
            items: z.array(z.object({ id: z.uuid(), name: z.string(), kind: z.enum(IBADAH_KINDS) })),
            students: z.array(
              z.object({
                studentId: z.uuid(),
                name: z.string(),
                done: z.number().int(),
                total: z.number().int(),
                percent: z.number(),
                items: z.array(
                  z.object({
                    itemId: z.uuid(),
                    done: z.number().int(),
                    total: z.number().int(),
                    percent: z.number(),
                  }),
                ),
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
        const scope = await scopeStudents(tx, request.query);
        const ids = scope.students.map((s) => s.id);
        const logs = ids.length
          ? await tx
              .select({ studentId: ibadahLog.studentId, itemId: ibadahLog.itemId, done: ibadahLog.done })
              .from(ibadahLog)
              .where(
                and(
                  inArray(ibadahLog.studentId, ids),
                  gte(ibadahLog.date, range.from),
                  lte(ibadahLog.date, range.to),
                ),
              )
          : [];
        const loggedItems = new Set(logs.map((l) => l.itemId));
        const items = (
          await tx
            .select({
              id: ibadahItem.id,
              name: ibadahItem.name,
              kind: ibadahItem.kind,
              active: ibadahItem.active,
            })
            .from(ibadahItem)
            .orderBy(asc(ibadahItem.sort), asc(ibadahItem.name))
        )
          .filter((i) => i.active || loggedItems.has(i.id))
          .map(({ id, name, kind }) => ({ id, name, kind }));
        return {
          ...range,
          items,
          students: scope.students.map((s) => {
            const mine = logs.filter((l) => l.studentId === s.id);
            const perItem = items.map((i) => {
              const rows = mine.filter((l) => l.itemId === i.id);
              const done = rows.filter((l) => l.done).length;
              return { itemId: i.id, done, total: rows.length, percent: ayahPercent(done, rows.length) };
            });
            const done = mine.filter((l) => l.done).length;
            return {
              studentId: s.id,
              name: s.name,
              done,
              total: mine.length,
              percent: ayahPercent(done, mine.length),
              items: perItem,
            };
          }),
        };
      });
    },
  );
}
