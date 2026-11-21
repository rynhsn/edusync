import {
  and,
  asc,
  classRoom,
  enrollment,
  eq,
  examRoom,
  examRoomAssignment,
  examType,
  inArray,
  max,
  semester,
  sql,
  student,
  type Tx,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { audit, conflictAs409, guarded, idParams, ok, schoolHeader } from './helpers';

const tag = ['Exams'];
const readGate = [requirePermission('exam:read'), requireModule('exams')];
const manageGate = [requirePermission('exam:manage'), requireModule('exams')];
const MAX_MOVES = 500;

const roomSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  capacity: z.number().int().nullable().describe('Kosong = tanpa batas'),
  sort: z.number().int(),
  active: z.boolean(),
});
const roomBody = z.object({
  name: z.string().trim().min(1).max(40),
  capacity: z.number().int().min(1).max(500).nullish(),
  sort: z.number().int().min(0).max(10_000).optional(),
  active: z.boolean().default(true),
});

const seatStudent = z.object({
  studentId: z.uuid(),
  name: z.string(),
  nis: z.string().describe('Kosong bila murid belum punya NIS'),
  classId: z.uuid(),
  className: z.string(),
});
const layoutSchema = z.object({
  rooms: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      capacity: z.number().int().nullable(),
      students: z.array(seatStudent),
    }),
  ),
  unassigned: z.array(seatStudent),
});
const scopeQuery = z.object({ semesterId: z.uuid(), examTypeId: z.uuid() });

const invalidRef = (what: string) => new HttpError(400, 'invalid_reference', `${what} tidak ditemukan.`);

/** Ruang ujian opsional beserta penempatan siswa per semester dan jenis ujian (modul `exams`). */
export async function examRoomRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  /** Semester dan jenis ujian harus milik sekolah (RLS menyaring); mengembalikan tahun ajaran semester. */
  async function scopeOrThrow(tx: Tx, semesterId: string, examTypeId: string) {
    const [s] = await tx
      .select({ yearId: semester.academicYearId })
      .from(semester)
      .where(eq(semester.id, semesterId));
    if (!s) throw invalidRef('Semester');
    const [t] = await tx.select({ id: examType.id }).from(examType).where(eq(examType.id, examTypeId));
    if (!t) throw invalidRef('Jenis ujian');
    return s.yearId;
  }

  /** Siswa aktif yang terdaftar di kelas tahun ajaran itu, urut kelas, nama, lalu id. */
  const candidatesOf = (tx: Tx, yearId: string, classIds?: string[]) =>
    tx
      .select({
        studentId: student.id,
        name: student.name,
        nis: student.nis,
        classId: classRoom.id,
        className: classRoom.name,
      })
      .from(enrollment)
      .innerJoin(student, eq(student.id, enrollment.studentId))
      .innerJoin(classRoom, eq(classRoom.id, enrollment.classId))
      .where(
        and(
          eq(enrollment.academicYearId, yearId),
          eq(student.status, 'active'),
          sql`${student.deletedAt} is null`,
          classIds ? inArray(enrollment.classId, classIds) : undefined,
        ),
      )
      .orderBy(asc(classRoom.name), asc(student.name), asc(student.id));

  const assignmentsOf = (tx: Tx, semesterId: string, examTypeId: string) =>
    tx
      .select({ studentId: examRoomAssignment.studentId, roomId: examRoomAssignment.roomId })
      .from(examRoomAssignment)
      .where(
        and(eq(examRoomAssignment.semesterId, semesterId), eq(examRoomAssignment.examTypeId, examTypeId)),
      );

  const listRooms = (tx: Tx) => tx.select().from(examRoom).orderBy(asc(examRoom.sort), asc(examRoom.name));

  /** Susunan ruang: ruang aktif (atau yang sudah berisi) dengan siswanya, plus siswa yang belum punya ruang. */
  async function layout(tx: Tx, semesterId: string, examTypeId: string, yearId: string) {
    const [rooms, cands, assigned] = await Promise.all([
      listRooms(tx),
      candidatesOf(tx, yearId),
      assignmentsOf(tx, semesterId, examTypeId),
    ]);
    const roomOf = new Map(assigned.map((a) => [a.studentId, a.roomId]));
    const seat = (c: (typeof cands)[number]) => ({ ...c, nis: c.nis ?? '' });
    const inRoom = (roomId: string) => cands.filter((c) => roomOf.get(c.studentId) === roomId).map(seat);
    return {
      rooms: rooms
        .map((r) => ({
          id: r.id,
          name: r.name,
          capacity: r.capacity,
          active: r.active,
          students: inRoom(r.id),
        }))
        .filter((r) => r.active || r.students.length > 0)
        .map(({ active: _active, ...r }) => r),
      unassigned: cands.filter((c) => !roomOf.has(c.studentId)).map(seat),
    };
  }

  /* ---------- Ruang ---------- */

  app.get(
    '/v1/exam/rooms',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar ruang ujian',
        description:
          'Izin: `exam:read`; modul `exams`. Urut `sort` lalu nama. Kosong bila sekolah tidak memakai ruang.',
        headers: schoolHeader,
        response: { 200: z.array(roomSchema), ...guarded },
      },
    },
    async (request) => tenant(request, (tx) => listRooms(tx)),
  );

  app.post(
    '/v1/exam/rooms',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Tambah ruang ujian',
        description:
          'Izin: `exam:manage`; modul `exams`. `capacity` kosong = tanpa batas (penempatan otomatis mewajibkannya). ' +
          'Nama unik per sekolah (409 `conflict`).',
        headers: schoolHeader,
        body: roomBody,
        response: { 201: roomSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const created = await conflictAs409('Nama ruang itu sudah ada.', () =>
        tenant(request, async (tx) => {
          let sort = request.body.sort;
          if (sort === undefined) {
            const [m] = await tx.select({ top: max(examRoom.sort) }).from(examRoom);
            sort = (m?.top ?? 0) + 10;
          }
          const [r] = await tx
            .insert(examRoom)
            .values({
              ...request.body,
              capacity: request.body.capacity ?? null,
              sort,
              schoolId: ctx.schoolId,
            })
            .returning();
          await audit(tx, ctx, 'exam.room_create', 'exam_room', r!.id, request.body);
          return r!;
        }),
      );
      return reply.code(201).send(created);
    },
  );

  app.put(
    '/v1/exam/rooms/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Ubah ruang ujian',
        description:
          'Izin: `exam:manage`; modul `exams`. 404 `not_found`; nama bentrok 409 `conflict`. Penempatan yang ada tidak diperiksa ' +
          'ulang bila kapasitas diturunkan.',
        headers: schoolHeader,
        params: idParams,
        body: roomBody,
        response: { 200: roomSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return conflictAs409('Nama ruang itu sudah ada.', () =>
        tenant(request, async (tx) => {
          const { sort, capacity, ...rest } = request.body;
          const [r] = await tx
            .update(examRoom)
            .set({ ...rest, capacity: capacity ?? null, ...(sort === undefined ? {} : { sort }) })
            .where(eq(examRoom.id, request.params.id))
            .returning();
          if (!r) throw new HttpError(404, 'not_found', 'Ruang tidak ditemukan.');
          await audit(tx, ctx, 'exam.room_update', 'exam_room', r.id, request.body);
          return r;
        }),
      );
    },
  );

  app.delete(
    '/v1/exam/rooms/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Hapus ruang ujian',
        description:
          'Izin: `exam:manage`; modul `exams`. 404 `not_found`. Penempatan murid di ruang itu ikut terhapus (murid menjadi belum berruang).',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      await tenant(request, async (tx) => {
        const rows = await tx.delete(examRoom).where(eq(examRoom.id, request.params.id)).returning();
        if (!rows[0]) throw new HttpError(404, 'not_found', 'Ruang tidak ditemukan.');
        await audit(tx, ctx, 'exam.room_delete', 'exam_room', rows[0].id, { name: rows[0].name });
      });
      return { ok: true as const };
    },
  );

  /* ---------- Penempatan ---------- */

  app.get(
    '/v1/exam/room-assignments',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Susunan ruang ujian per semester dan jenis ujian',
        description:
          'Izin: `exam:read`; modul `exams`. Murid kandidat = murid aktif yang terdaftar di kelas tahun ajaran semester itu, urut ' +
          'kelas, nama, id. `rooms` = ruang aktif (atau yang sudah berisi) beserta muridnya; `unassigned` = kandidat tanpa ruang. ' +
          'Semester atau jenis ujian bukan milik sekolah: 400 `invalid_reference`.',
        headers: schoolHeader,
        querystring: scopeQuery,
        response: { 200: layoutSchema, 400: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const { semesterId, examTypeId } = request.query;
      return tenant(request, async (tx) => {
        const yearId = await scopeOrThrow(tx, semesterId, examTypeId);
        return layout(tx, semesterId, examTypeId, yearId);
      });
    },
  );

  app.put(
    '/v1/exam/room-assignments',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Pindahkan murid antar ruang ujian',
        description:
          'Izin: `exam:manage`; modul `exams`. `moves`: `roomId` null = lepas dari ruang. Idempotent (upsert); satu murid ' +
          'disebut dua kali, yang terakhir berlaku. Rujukan tidak dikenal: 400 `invalid_reference`. Ruang yang melebihi kapasitas ' +
          'setelah perpindahan: 409 `room_full` dan tidak ada yang berubah. Maks. 500 perpindahan.',
        headers: schoolHeader,
        body: z.object({
          semesterId: z.uuid(),
          examTypeId: z.uuid(),
          moves: z
            .array(z.object({ studentId: z.uuid(), roomId: z.uuid().nullable() }))
            .min(1)
            .max(MAX_MOVES),
        }),
        response: { 200: layoutSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { semesterId, examTypeId } = request.body;
      const moves = new Map(request.body.moves.map((m) => [m.studentId, m.roomId]));
      return tenant(request, async (tx) => {
        const yearId = await scopeOrThrow(tx, semesterId, examTypeId);
        const studentIds = [...moves.keys()];
        const found = await tx
          .select({ id: student.id })
          .from(student)
          .where(inArray(student.id, studentIds));
        if (found.length !== studentIds.length) throw invalidRef('Murid');
        const rooms = await listRooms(tx);
        const roomById = new Map(rooms.map((r) => [r.id, r]));
        for (const roomId of new Set(moves.values())) {
          if (roomId && !roomById.has(roomId)) throw invalidRef('Ruang');
        }

        // Isi akhir tiap ruang = isi sekarang setelah semua perpindahan diterapkan.
        const seats = new Map(
          (await assignmentsOf(tx, semesterId, examTypeId)).map((a) => [a.studentId, a.roomId]),
        );
        const grew = new Set<string>();
        for (const [studentId, roomId] of moves) {
          if (roomId && seats.get(studentId) !== roomId) grew.add(roomId);
          if (roomId) seats.set(studentId, roomId);
          else seats.delete(studentId);
        }
        const finalCount = new Map<string, number>();
        for (const roomId of seats.values()) finalCount.set(roomId, (finalCount.get(roomId) ?? 0) + 1);
        for (const roomId of grew) {
          const room = roomById.get(roomId)!;
          if (room.capacity !== null && (finalCount.get(roomId) ?? 0) > room.capacity)
            throw new HttpError(409, 'room_full', `Ruang ${room.name} penuh (kapasitas ${room.capacity}).`);
        }

        const toRemove = [...moves].filter(([, r]) => r === null).map(([s]) => s);
        const toSet = [...moves].flatMap(([studentId, roomId]) => (roomId ? [{ studentId, roomId }] : []));
        if (toRemove.length)
          await tx
            .delete(examRoomAssignment)
            .where(
              and(
                eq(examRoomAssignment.semesterId, semesterId),
                eq(examRoomAssignment.examTypeId, examTypeId),
                inArray(examRoomAssignment.studentId, toRemove),
              ),
            );
        if (toSet.length)
          await tx
            .insert(examRoomAssignment)
            .values(toSet.map((m) => ({ ...m, schoolId: ctx.schoolId, semesterId, examTypeId })))
            .onConflictDoUpdate({
              target: [
                examRoomAssignment.semesterId,
                examRoomAssignment.examTypeId,
                examRoomAssignment.studentId,
              ],
              set: { roomId: sql`excluded.room_id` },
            });
        await audit(tx, ctx, 'exam.room_assign', 'semester', semesterId, {
          examTypeId,
          assigned: toSet.length,
          removed: toRemove.length,
        });
        return layout(tx, semesterId, examTypeId, yearId);
      });
    },
  );

  app.post(
    '/v1/exam/room-assignments/auto',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Penempatan ruang ujian otomatis menurut kapasitas',
        description:
          'Izin: `exam:manage`; modul `exams`. Murid kandidat (urut kelas, nama, id) diisikan ke ruang menurut urutan `sort` ' +
          'sampai kapasitasnya penuh. `classIds` bawaan = semua kelas tahun ajaran semester; `roomIds` bawaan = semua ruang aktif. ' +
          '`overwrite=false` menjaga penempatan yang ada dan hanya mengisi murid yang belum berruang; `overwrite=true` mengosongkan ' +
          'penempatan murid dalam cakupan lalu membagi ulang. Ruang terpilih wajib berkapasitas (400 `capacity_required`); tanpa ' +
          'ruang 400 `no_rooms`; kapasitas sisa kurang dari murid yang harus ditempatkan: 409 `rooms_full` (tidak ada yang berubah). ' +
          'Hasil: susunan seperti GET ditambah `placed`.',
        headers: schoolHeader,
        body: z.object({
          semesterId: z.uuid(),
          examTypeId: z.uuid(),
          classIds: z.array(z.uuid()).max(200).optional(),
          roomIds: z.array(z.uuid()).max(200).optional(),
          overwrite: z.boolean().default(false),
        }),
        response: {
          200: layoutSchema.extend({ placed: z.number().int() }),
          400: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { semesterId, examTypeId, overwrite } = request.body;
      return tenant(request, async (tx) => {
        const yearId = await scopeOrThrow(tx, semesterId, examTypeId);

        let classIds = request.body.classIds;
        if (classIds) {
          classIds = [...new Set(classIds)];
          const valid = await tx
            .select({ id: classRoom.id })
            .from(classRoom)
            .where(and(inArray(classRoom.id, classIds), eq(classRoom.academicYearId, yearId)));
          if (valid.length !== classIds.length) throw invalidRef('Kelas');
        }
        const all = await listRooms(tx);
        let rooms = all.filter((r) => r.active);
        if (request.body.roomIds) {
          const wanted = new Set(request.body.roomIds);
          if (all.filter((r) => wanted.has(r.id)).length !== wanted.size) throw invalidRef('Ruang');
          rooms = all.filter((r) => wanted.has(r.id));
        }
        if (rooms.length === 0)
          throw new HttpError(400, 'no_rooms', 'Belum ada ruang aktif yang bisa dipakai.');
        for (const r of rooms)
          if (r.capacity === null)
            throw new HttpError(400, 'capacity_required', `Ruang ${r.name} belum punya kapasitas.`);

        const cands = await candidatesOf(tx, yearId, classIds);
        if (overwrite && cands.length)
          await tx.delete(examRoomAssignment).where(
            and(
              eq(examRoomAssignment.semesterId, semesterId),
              eq(examRoomAssignment.examTypeId, examTypeId),
              inArray(
                examRoomAssignment.studentId,
                cands.map((c) => c.studentId),
              ),
            ),
          );

        const existing = await assignmentsOf(tx, semesterId, examTypeId);
        const seated = new Set(existing.map((a) => a.studentId));
        const used = new Map<string, number>();
        for (const a of existing) used.set(a.roomId, (used.get(a.roomId) ?? 0) + 1);
        const todo = cands.filter((c) => !seated.has(c.studentId));

        const free = rooms.map((r) => ({
          id: r.id,
          left: Math.max(0, (r.capacity as number) - (used.get(r.id) ?? 0)),
        }));
        const totalLeft = free.reduce((n, r) => n + r.left, 0);
        if (todo.length > totalLeft)
          throw new HttpError(
            409,
            'rooms_full',
            `Kapasitas ruang tidak cukup: ${todo.length} murid perlu ruang, sisa kursi ${totalLeft}.`,
          );

        const rows: { studentId: string; roomId: string }[] = [];
        let i = 0;
        for (const r of free) {
          for (; r.left > 0 && i < todo.length; r.left--, i++)
            rows.push({ studentId: todo[i]!.studentId, roomId: r.id });
        }
        for (let at = 0; at < rows.length; at += 1000)
          await tx
            .insert(examRoomAssignment)
            .values(
              rows
                .slice(at, at + 1000)
                .map((m) => ({ ...m, schoolId: ctx.schoolId, semesterId, examTypeId })),
            );
        await audit(tx, ctx, 'exam.room_auto', 'semester', semesterId, {
          examTypeId,
          overwrite,
          placed: rows.length,
        });
        return { ...(await layout(tx, semesterId, examTypeId, yearId)), placed: rows.length };
      });
    },
  );

  app.delete(
    '/v1/exam/room-assignments',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Kosongkan penempatan ruang ujian',
        description:
          'Izin: `exam:manage`; modul `exams`. Menghapus semua penempatan semester dan jenis ujian itu (ruangnya tetap). ' +
          'Rujukan tidak dikenal: 400 `invalid_reference`.',
        headers: schoolHeader,
        querystring: scopeQuery,
        response: { 200: z.object({ removed: z.number().int() }), 400: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { semesterId, examTypeId } = request.query;
      return tenant(request, async (tx) => {
        await scopeOrThrow(tx, semesterId, examTypeId);
        const rows = await tx
          .delete(examRoomAssignment)
          .where(
            and(eq(examRoomAssignment.semesterId, semesterId), eq(examRoomAssignment.examTypeId, examTypeId)),
          )
          .returning({ id: examRoomAssignment.id });
        await audit(tx, ctx, 'exam.room_clear', 'semester', semesterId, { examTypeId, removed: rows.length });
        return { removed: rows.length };
      });
    },
  );
}
