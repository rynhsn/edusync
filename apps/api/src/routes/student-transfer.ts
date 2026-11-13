import {
  reportDocumentV2Schema,
  STUDENT_TRANSFER_DIRECTIONS,
  STUDENT_TRANSFER_KINDS,
  STUDENT_TRANSFER_REASONS,
  TRANSFER_FINAL_LEVEL_CODE,
} from '@edusync/contracts';
import {
  academicYear,
  and,
  asc,
  classRoom,
  count,
  desc,
  enrollment,
  enrollmentChange,
  eq,
  inArray,
  isNull,
  promotionDecision,
  reportCard,
  semester,
  student,
  studentTransfer,
  type Tx,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requirePermission, type TenantContext } from '../identity/guards';
import { nikConflictAs409 } from '../person-fields';
import { buildDocument, loadClassContext, loadReportExtras, loadSectionNotes } from '../report-card-lib';
import {
  isFinalLevelEvenSemester,
  moduleActive,
  transferNotFound,
  yearForDate,
} from '../student-mobility-lib';
import { audit, guarded, idParams, ok, schoolHeader } from './helpers';
import { optionalText, placeStudent, studentBody, studentRow, studentSchema } from './people';

const tag = ['People'];
const gate = [requirePermission('student:manage')];
const readGate = [requirePermission('student:read')];

const invalidRef = (message: string) => new HttpError(400, 'invalid_reference', message);
const studentNotFound = () => new HttpError(404, 'not_found', 'Siswa tidak ditemukan.');

const npsnField = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .default(null)
  .refine((v) => v === null || /^[0-9]{8}$/.test(v), 'NPSN harus 8 angka.');

const transferFields = {
  effectiveOn: z.iso.date().describe('Tanggal efektif mutasi'),
  reason: z.enum(STUDENT_TRANSFER_REASONS),
  reasonNote: optionalText(1000),
  counterpartSchoolName: optionalText(200).describe('Sekolah tujuan (keluar) atau asal (masuk)'),
  counterpartNpsn: npsnField.describe('NPSN sekolah tujuan/asal, 8 angka, opsional'),
  letterNumber: optionalText(100).describe('Nomor surat pindah/persetujuan'),
  letterDate: z.iso.date().nullable().default(null),
  exceptionReason: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .optional()
    .describe(
      'Hanya bila mutasi jatuh pada semester genap tingkat akhir (dilarang bawaan): alasan penimpaan. ' +
        'Hanya pemegang `school:manage`; dicatat di audit dan pada mutasi.',
    ),
};

const editFields = {
  reason: transferFields.reason,
  reasonNote: transferFields.reasonNote,
  counterpartSchoolName: transferFields.counterpartSchoolName,
  counterpartNpsn: transferFields.counterpartNpsn,
  letterNumber: transferFields.letterNumber,
  letterDate: transferFields.letterDate,
};

const transferView = z.object({
  id: z.uuid(),
  studentId: z.uuid(),
  studentName: z.string(),
  direction: z.enum(STUDENT_TRANSFER_DIRECTIONS),
  kind: z.enum(STUDENT_TRANSFER_KINDS),
  effectiveOn: z.iso.date(),
  academicYearId: z.uuid(),
  classId: z.uuid().nullable().describe('Rombel saat keluar, atau rombel penempatan saat masuk'),
  className: z.string().nullable(),
  reason: z.string(),
  reasonNote: z.string().nullable(),
  counterpartSchoolName: z.string().nullable(),
  counterpartNpsn: z.string().nullable(),
  letterNumber: z.string().nullable(),
  letterDate: z.iso.date().nullable(),
  hasDepartureDocument: z
    .boolean()
    .describe('Ada keterangan nilai (dokumen rapor draf) yang dibekukan saat murid keluar'),
  exceptionReason: z
    .string()
    .nullable()
    .describe('Terisi bila larangan semester genap tingkat akhir ditimpa'),
  createdBy: z.string(),
  createdAt: z.string(),
});
const transferDetail = transferView.extend({
  departureDocument: reportDocumentV2Schema
    .nullable()
    .describe(
      'Salinan dokumen rapor DRAF saat keluar (keterangan nilai saat pindah; bukan rapor final). Bentuk sama dengan dokumen rapor.',
    ),
});

async function loadTransfers(tx: Tx, where: ReturnType<typeof and> | undefined, limit?: number, offset = 0) {
  const q = tx
    .select({
      t: studentTransfer,
      studentName: student.name,
      className: classRoom.name,
    })
    .from(studentTransfer)
    .innerJoin(student, eq(student.id, studentTransfer.studentId))
    .leftJoin(classRoom, eq(classRoom.id, studentTransfer.classId))
    .where(where)
    .orderBy(desc(studentTransfer.effectiveOn), desc(studentTransfer.createdAt));
  return limit === undefined ? q : q.limit(limit).offset(offset);
}

type TransferJoin = Awaited<ReturnType<typeof loadTransfers>>[number];

const viewOf = ({ t, studentName, className }: TransferJoin) => ({
  id: t.id,
  studentId: t.studentId,
  studentName,
  direction: t.direction,
  kind: t.kind,
  effectiveOn: t.effectiveOn,
  academicYearId: t.academicYearId,
  classId: t.classId,
  className: className ?? null,
  reason: t.reason,
  reasonNote: t.reasonNote,
  counterpartSchoolName: t.counterpartSchoolName,
  counterpartNpsn: t.counterpartNpsn,
  letterNumber: t.letterNumber,
  letterDate: t.letterDate,
  hasDepartureDocument: t.departureDocument !== null,
  exceptionReason: t.exceptionReason,
  createdBy: t.createdBy,
  createdAt: t.createdAt.toISOString(),
});

async function transferById(tx: Tx, id: string) {
  const [row] = await loadTransfers(tx, eq(studentTransfer.id, id));
  if (!row) throw transferNotFound();
  return row;
}

/**
 * Larangan semester genap tingkat akhir (S4). Mengembalikan alasan penimpaan yang berlaku (atau null bila larangan tidak berlaku).
 * Pengecualian: wajib `exceptionReason` dan hak `school:manage` (K1: bawaan diblokir, penimpaan tercatat).
 */
async function finalLevelBan(
  tx: Tx,
  ctx: TenantContext,
  classId: string | null,
  effectiveOn: string,
  exceptionReason: string | undefined,
): Promise<string | null> {
  if (!classId || !(await isFinalLevelEvenSemester(tx, classId, effectiveOn))) return null;
  if (!exceptionReason) {
    throw new HttpError(
      409,
      TRANSFER_FINAL_LEVEL_CODE,
      'Mutasi pada semester genap tingkat akhir tidak diperbolehkan. Admin dengan hak kelola sekolah dapat menimpanya dengan alasan tertulis (`exceptionReason`).',
    );
  }
  if (!ctx.permissions.has('school:manage')) {
    throw new HttpError(
      403,
      'exception_requires_school_manage',
      'Hanya pemegang izin kelola sekolah yang dapat menimpa larangan mutasi semester genap tingkat akhir.',
    );
  }
  return exceptionReason;
}

/** Keterangan nilai saat pindah: dokumen rapor draf semester yang memuat tanggal efektif (atau semester terakhir sebelumnya). */
async function departureDocumentFor(
  tx: Tx,
  yearId: string,
  classId: string,
  stu: { id: string; name: string; nis: string | null; nisn: string | null },
  effectiveOn: string,
) {
  const sems = await tx
    .select()
    .from(semester)
    .where(eq(semester.academicYearId, yearId))
    .orderBy(asc(semester.startsOn));
  const sem =
    sems.find((s) => s.startsOn <= effectiveOn && s.endsOn >= effectiveOn) ??
    [...sems].reverse().find((s) => s.startsOn <= effectiveOn);
  if (!sem) return null;
  const [row] = await tx
    .select()
    .from(reportCard)
    .where(and(eq(reportCard.semesterId, sem.id), eq(reportCard.studentId, stu.id)));
  // Rapor final sudah beku di report_card; tidak perlu salinan lagi.
  if (row?.status === 'final') return null;
  const [cls] = await tx.select().from(classRoom).where(eq(classRoom.id, classId));
  if (!cls || cls.academicYearId !== sem.academicYearId) return null;
  const c = await loadClassContext(tx, sem, cls);
  const extras = await loadReportExtras(tx, c);
  const notes = await loadSectionNotes(tx, sem.id);
  return buildDocument(tx, c, stu, row?.homeroomNote ?? null, {
    reportMode: extras.reportMode,
    narratives: extras.narratives.get(stu.id),
    objectives: extras.objectives.get(stu.id),
    ...notes.get(stu.id),
  });
}

/** Mutasi murid dan riwayat rombel (tahap 3C.1). */
export async function studentTransferRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(
    request: { ctx?: TenantContext; server: FastifyInstance },
    fn: (tx: Tx) => Promise<T>,
  ) => {
    const ctx = request.ctx as TenantContext;
    return withTenant(request.server.tenantDb, [ctx.schoolId], fn);
  };

  /* ---------- Mutasi keluar ---------- */

  app.post(
    '/v1/students/:id/transfer-out',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Catat mutasi keluar (pindah atau putus sekolah)',
        description:
          'Izin: `student:manage`. Dalam satu transaksi: mencatat mutasi, mengubah status siswa menjadi `transferred` (`kind: transfer`) ' +
          'atau `dropped` (`kind: dropped`), dan membekukan dokumen rapor draf semester berjalan sebagai keterangan nilai saat pindah ' +
          '(`departureDocument`, hanya bila modul `grades` aktif dan rapornya belum final). Enrollment tidak dihapus: rapor final siswa tetap ' +
          'tampil di daftar rapor kelas semester yang berakhir sebelum tanggal efektif. Siswa harus aktif (409 `student_not_active`); ' +
          'siswa berstatus pindah/keluar tanpa catatan mutasi boleh dilengkapi (tanpa dokumen keberangkatan dan tanpa larangan). ' +
          'Pindah sekolah pada semester genap tingkat akhir ditolak 409 `transfer_final_level_even_semester`; pemegang `school:manage` ' +
          'dapat menimpanya dengan `exceptionReason` (tanpa izin itu 403 `exception_requires_school_manage`); putus sekolah tidak terkena larangan.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({
          ...transferFields,
          kind: z.enum(STUDENT_TRANSFER_KINDS).default('transfer'),
        }),
        response: {
          201: transferView,
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      const view = await tenant(request, async (tx) => {
        const [stu] = await tx
          .select()
          .from(student)
          .where(and(eq(student.id, request.params.id), isNull(student.deletedAt)));
        if (!stu) throw studentNotFound();
        let completing = false;
        if (stu.status !== 'active') {
          const [prior] = await tx
            .select({ id: studentTransfer.id })
            .from(studentTransfer)
            .where(and(eq(studentTransfer.studentId, stu.id), eq(studentTransfer.direction, 'out')))
            .limit(1);
          if ((stu.status === 'transferred' || stu.status === 'dropped') && !prior) completing = true;
          else {
            throw new HttpError(
              409,
              'student_not_active',
              'Siswa ini tidak berstatus aktif, jadi tidak dapat dimutasi.',
            );
          }
        }
        const yearId = await yearForDate(tx, b.effectiveOn, stu.id);
        if (!yearId) throw invalidRef('Tidak ada tahun ajaran untuk tanggal efektif itu.');
        const [enr] = await tx
          .select({ classId: enrollment.classId })
          .from(enrollment)
          .where(and(eq(enrollment.studentId, stu.id), eq(enrollment.academicYearId, yearId)));
        const classId = enr?.classId ?? null;
        const exception =
          completing || b.kind === 'dropped'
            ? null
            : await finalLevelBan(tx, ctx, classId, b.effectiveOn, b.exceptionReason);
        const departureDocument =
          !completing && classId && (await moduleActive(tx, 'grades'))
            ? await departureDocumentFor(tx, yearId, classId, stu, b.effectiveOn)
            : null;
        const [row] = await tx
          .insert(studentTransfer)
          .values({
            schoolId: ctx.schoolId,
            studentId: stu.id,
            direction: 'out',
            kind: b.kind,
            effectiveOn: b.effectiveOn,
            academicYearId: yearId,
            classId,
            reason: b.reason,
            reasonNote: b.reasonNote,
            counterpartSchoolName: b.counterpartSchoolName,
            counterpartNpsn: b.counterpartNpsn,
            letterNumber: b.letterNumber,
            letterDate: b.letterDate,
            departureDocument,
            exceptionReason: exception,
            createdBy: ctx.userId,
          })
          .returning({ id: studentTransfer.id });
        await tx
          .update(student)
          .set({ status: b.kind === 'dropped' ? 'dropped' : 'transferred' })
          .where(eq(student.id, stu.id));
        await audit(tx, ctx, 'student.transfer_out', 'student', stu.id, {
          transferId: row!.id,
          kind: b.kind,
          effectiveOn: b.effectiveOn,
          reason: b.reason,
          classId,
          completing,
          hasDepartureDocument: departureDocument !== null,
          ...(exception ? { exceptionReason: exception, override: true } : {}),
        });
        return viewOf(await transferById(tx, row!.id));
      });
      return reply.code(201).send(view);
    },
  );

  /* ---------- Mutasi masuk ---------- */

  app.post(
    '/v1/students/transfer-in',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Catat mutasi masuk (siswa pindahan)',
        description:
          'Izin: `student:manage`. Membuat siswa baru (status aktif) beserta penempatan di `classId` (pada tahun ajaran kelas itu) dan ' +
          'catatan mutasi masuk dengan sekolah asal. Nilai sekolah asal tidak diimpor. Aturan NIS/NISN/NIK sama dengan `POST /v1/students` ' +
          '(409 `nik_taken`/`conflict`). Penempatan di kelas tingkat akhir pada semester genap ditolak 409 ' +
          '`transfer_final_level_even_semester`; pemegang `school:manage` dapat menimpanya dengan `exceptionReason` (tanpa izin itu 403 ' +
          '`exception_requires_school_manage`). Respons memuat mutasi dan siswa.',
        headers: schoolHeader,
        body: studentBody.omit({ status: true }).extend({
          ...transferFields,
          classId: z.uuid().describe('Rombel penempatan'),
        }),
        response: {
          201: z.object({ transfer: transferView, student: studentSchema }),
          400: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const {
        classId,
        effectiveOn,
        reason,
        reasonNote,
        counterpartSchoolName,
        counterpartNpsn,
        letterNumber,
        letterDate,
        exceptionReason,
        ...person
      } = request.body;
      const result = await nikConflictAs409('NIS atau NISN itu sudah dipakai siswa lain.', () =>
        tenant(request, async (tx) => {
          const [cls] = await tx
            .select({ academicYearId: classRoom.academicYearId })
            .from(classRoom)
            .where(eq(classRoom.id, classId));
          if (!cls) throw invalidRef('Kelas tidak ditemukan.');
          const exception = await finalLevelBan(tx, ctx, classId, effectiveOn, exceptionReason);
          const [stu] = await tx
            .insert(student)
            .values({ schoolId: ctx.schoolId, ...person, status: 'active' })
            .returning({ id: student.id });
          await placeStudent(tx, ctx, stu!.id, classId, { effectiveOn });
          const [row] = await tx
            .insert(studentTransfer)
            .values({
              schoolId: ctx.schoolId,
              studentId: stu!.id,
              direction: 'in',
              kind: 'transfer',
              effectiveOn,
              academicYearId: cls.academicYearId,
              classId,
              reason,
              reasonNote,
              counterpartSchoolName,
              counterpartNpsn,
              letterNumber,
              letterDate,
              exceptionReason: exception,
              createdBy: ctx.userId,
            })
            .returning({ id: studentTransfer.id });
          await audit(tx, ctx, 'student.transfer_in', 'student', stu!.id, {
            transferId: row!.id,
            effectiveOn,
            reason,
            classId,
            counterpartSchoolName,
            ...(exception ? { exceptionReason: exception, override: true } : {}),
          });
          return {
            transfer: viewOf(await transferById(tx, row!.id)),
            student: await studentRow(tx, stu!.id, true),
          };
        }),
      );
      return reply.code(201).send(result);
    },
  );

  /* ---------- Baca ---------- */

  app.get(
    '/v1/student-transfers',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar mutasi siswa',
        description:
          'Izin: `student:read`. Terbaru dulu (tanggal efektif). Filter opsional `academicYearId`, `direction` (`in`/`out`), `studentId`. ' +
          '`departureDocument` hanya ada di detail (`GET /v1/student-transfers/{id}`).',
        headers: schoolHeader,
        querystring: z.object({
          academicYearId: z.uuid().optional(),
          direction: z.enum(STUDENT_TRANSFER_DIRECTIONS).optional(),
          studentId: z.uuid().optional(),
          limit: z.coerce.number().int().min(1).max(500).default(100),
          offset: z.coerce.number().int().min(0).default(0),
        }),
        response: { 200: z.object({ total: z.number().int(), items: z.array(transferView) }), ...guarded },
      },
    },
    async (request) => {
      const q = request.query;
      return tenant(request, async (tx) => {
        const where = and(
          q.academicYearId ? eq(studentTransfer.academicYearId, q.academicYearId) : undefined,
          q.direction ? eq(studentTransfer.direction, q.direction) : undefined,
          q.studentId ? eq(studentTransfer.studentId, q.studentId) : undefined,
        );
        const [[total], rows] = await Promise.all([
          tx.select({ n: count() }).from(studentTransfer).where(where),
          loadTransfers(tx, where, q.limit, q.offset),
        ]);
        return { total: total?.n ?? 0, items: rows.map(viewOf) };
      });
    },
  );

  app.get(
    '/v1/student-transfers/:id',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Detail mutasi (dengan keterangan nilai saat pindah)',
        description: 'Izin: `student:read`.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: transferDetail, 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const row = await transferById(tx, request.params.id);
        return {
          ...viewOf(row),
          departureDocument:
            (row.t.departureDocument as z.infer<typeof reportDocumentV2Schema> | null) ?? null,
        };
      }),
  );

  app.get(
    '/v1/students/:id/transfers',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Mutasi satu siswa',
        description: 'Izin: `student:read`. Terbaru dulu. 404 `not_found` bila siswa tidak ada.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: z.array(transferView), 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const [stu] = await tx
          .select({ id: student.id })
          .from(student)
          .where(and(eq(student.id, request.params.id), isNull(student.deletedAt)));
        if (!stu) throw studentNotFound();
        return (await loadTransfers(tx, eq(studentTransfer.studentId, stu.id))).map(viewOf);
      }),
  );

  /* ---------- Ubah dan batalkan ---------- */

  app.put(
    '/v1/student-transfers/:id',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Ubah keterangan mutasi',
        description:
          'Izin: `student:manage`. Mengganti alasan, catatan, sekolah tujuan/asal, NPSN, dan nomor/tanggal surat. Arah, jenis, tanggal ' +
          'efektif, rombel, dan keterangan nilai saat pindah tidak berubah (batalkan lalu catat ulang bila keliru).',
        headers: schoolHeader,
        params: idParams,
        body: z.object(editFields),
        response: { 200: transferView, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const rows = await tx
          .update(studentTransfer)
          .set({ ...request.body, updatedAt: new Date() })
          .where(eq(studentTransfer.id, request.params.id))
          .returning({ id: studentTransfer.id, studentId: studentTransfer.studentId });
        if (rows.length === 0) throw transferNotFound();
        await audit(tx, ctx, 'student.transfer_update', 'student', rows[0]!.studentId, {
          transferId: request.params.id,
          reason: request.body.reason,
        });
        return viewOf(await transferById(tx, request.params.id));
      });
    },
  );

  app.delete(
    '/v1/student-transfers/:id',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Batalkan mutasi keluar',
        description:
          'Izin: `student:manage`. Menghapus catatan mutasi keluar dan mengembalikan status siswa menjadi aktif. Hanya mutasi keluar ' +
          'terbaru milik siswa yang statusnya masih sesuai: 409 `student_status_changed` bila status siswa sudah diubah, 409 ' +
          '`transfer_superseded` bila ada mutasi yang lebih baru. Mutasi masuk tidak dapat dibatalkan (409 `transfer_not_cancellable`); ' +
          'ubah status siswa bila perlu.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      await tenant(request, async (tx) => {
        const { t } = await transferById(tx, request.params.id);
        if (t.direction !== 'out') {
          throw new HttpError(
            409,
            'transfer_not_cancellable',
            'Mutasi masuk tidak dapat dibatalkan. Ubah status siswa bila perlu.',
          );
        }
        const [stu] = await tx.select().from(student).where(eq(student.id, t.studentId));
        const expected = t.kind === 'dropped' ? 'dropped' : 'transferred';
        if (!stu || stu.status !== expected) {
          throw new HttpError(
            409,
            'student_status_changed',
            'Status siswa sudah berubah sejak mutasi ini dicatat, jadi mutasi tidak dapat dibatalkan.',
          );
        }
        const later = await tx
          .select({ id: studentTransfer.id, createdAt: studentTransfer.createdAt })
          .from(studentTransfer)
          .where(eq(studentTransfer.studentId, t.studentId));
        if (later.some((r) => r.id !== t.id && r.createdAt >= t.createdAt)) {
          throw new HttpError(409, 'transfer_superseded', 'Ada mutasi yang lebih baru untuk siswa ini.');
        }
        await tx.delete(studentTransfer).where(eq(studentTransfer.id, t.id));
        await tx.update(student).set({ status: 'active' }).where(eq(student.id, t.studentId));
        await audit(tx, ctx, 'student.transfer_cancel', 'student', t.studentId, {
          transferId: t.id,
          kind: t.kind,
          effectiveOn: t.effectiveOn,
        });
      });
      return { ok: true as const };
    },
  );

  /* ---------- Riwayat akademik ---------- */

  const historyClass = z.object({ id: z.uuid(), name: z.string(), level: z.string() });
  app.get(
    '/v1/students/:id/academic-history',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Riwayat akademik siswa (rombel, keputusan, rapor, mutasi)',
        description:
          'Izin: `student:read`. Per tahun ajaran (terlama dulu) yang menyentuh siswa ini: rombel kini (`class`), perpindahan rombel ' +
          '(`classChanges`, dari `enrollment_change`), keputusan kenaikan/kelulusan (`decision`), status rapor per semester (`reports`), ' +
          'dan mutasi (`transfers`). Hanya tahun yang punya salah satunya.',
        headers: schoolHeader,
        params: idParams,
        response: {
          200: z.object({
            studentId: z.uuid(),
            name: z.string(),
            status: z.enum(['active', 'graduated', 'transferred', 'dropped']),
            years: z.array(
              z.object({
                academicYearId: z.uuid(),
                academicYearName: z.string(),
                startsOn: z.iso.date(),
                endsOn: z.iso.date(),
                class: historyClass.nullable(),
                classChanges: z.array(
                  z.object({
                    effectiveOn: z.iso.date(),
                    fromClassId: z.uuid().nullable(),
                    fromClassName: z.string().nullable(),
                    toClassId: z.uuid().nullable(),
                    toClassName: z.string().nullable(),
                    reason: z.string().nullable(),
                  }),
                ),
                decision: z
                  .object({
                    decision: z.enum(['promote', 'retain', 'graduate']),
                    fromClassId: z.uuid(),
                    fromClassName: z.string().nullable(),
                    toClassId: z.uuid().nullable(),
                    toClassName: z.string().nullable(),
                    reason: z.string().nullable(),
                    followUp: z.string().nullable(),
                    meetingDate: z.iso.date().nullable(),
                    applied: z.boolean(),
                  })
                  .nullable(),
                reports: z.array(
                  z.object({
                    semesterId: z.uuid(),
                    semesterName: z.string(),
                    classId: z.uuid(),
                    className: z.string().nullable(),
                    status: z.enum(['draft', 'final']),
                  }),
                ),
                transfers: z.array(
                  z.object({
                    id: z.uuid(),
                    direction: z.enum(STUDENT_TRANSFER_DIRECTIONS),
                    kind: z.enum(STUDENT_TRANSFER_KINDS),
                    effectiveOn: z.iso.date(),
                    reason: z.string(),
                    counterpartSchoolName: z.string().nullable(),
                  }),
                ),
              }),
            ),
          }),
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const [stu] = await tx
          .select({ id: student.id, name: student.name, status: student.status })
          .from(student)
          .where(and(eq(student.id, request.params.id), isNull(student.deletedAt)));
        if (!stu) throw studentNotFound();
        const [enrs, changes, decisions, reports, transfers] = await Promise.all([
          tx.select().from(enrollment).where(eq(enrollment.studentId, stu.id)),
          tx
            .select()
            .from(enrollmentChange)
            .where(eq(enrollmentChange.studentId, stu.id))
            .orderBy(asc(enrollmentChange.effectiveOn), asc(enrollmentChange.createdAt)),
          tx.select().from(promotionDecision).where(eq(promotionDecision.studentId, stu.id)),
          tx
            .select({
              semesterId: reportCard.semesterId,
              semesterName: semester.name,
              yearId: semester.academicYearId,
              startsOn: semester.startsOn,
              classId: reportCard.classId,
              status: reportCard.status,
            })
            .from(reportCard)
            .innerJoin(semester, eq(semester.id, reportCard.semesterId))
            .where(eq(reportCard.studentId, stu.id))
            .orderBy(asc(semester.startsOn)),
          tx
            .select()
            .from(studentTransfer)
            .where(eq(studentTransfer.studentId, stu.id))
            .orderBy(asc(studentTransfer.effectiveOn), asc(studentTransfer.createdAt)),
        ]);
        const yearIds = new Set<string>([
          ...enrs.map((e) => e.academicYearId),
          ...changes.map((c) => c.academicYearId),
          ...decisions.map((d) => d.academicYearId),
          ...reports.map((r) => r.yearId),
          ...transfers.map((t) => t.academicYearId),
        ]);
        const classIds = new Set<string>([
          ...enrs.map((e) => e.classId),
          ...changes.flatMap((c) => [c.fromClassId, c.toClassId]).filter((x): x is string => x !== null),
          ...decisions.flatMap((d) => [d.fromClassId, d.toClassId]).filter((x): x is string => x !== null),
          ...reports.map((r) => r.classId),
        ]);
        const [years, classes] = await Promise.all([
          yearIds.size
            ? tx
                .select()
                .from(academicYear)
                .where(inArray(academicYear.id, [...yearIds]))
                .orderBy(asc(academicYear.startsOn))
            : [],
          classIds.size
            ? tx
                .select({ id: classRoom.id, name: classRoom.name, level: classRoom.level })
                .from(classRoom)
                .where(inArray(classRoom.id, [...classIds]))
            : [],
        ]);
        const classOf = new Map(classes.map((c) => [c.id, c]));
        const nameOf = (id: string | null) => (id ? (classOf.get(id)?.name ?? null) : null);
        return {
          studentId: stu.id,
          name: stu.name,
          status: stu.status,
          years: years.map((y) => {
            const enr = enrs.find((e) => e.academicYearId === y.id);
            const decision = decisions.find((d) => d.academicYearId === y.id);
            const cls = enr ? classOf.get(enr.classId) : undefined;
            return {
              academicYearId: y.id,
              academicYearName: y.name,
              startsOn: y.startsOn,
              endsOn: y.endsOn,
              class: cls ? { id: cls.id, name: cls.name, level: cls.level } : null,
              classChanges: changes
                .filter((c) => c.academicYearId === y.id)
                .map((c) => ({
                  effectiveOn: c.effectiveOn,
                  fromClassId: c.fromClassId,
                  fromClassName: nameOf(c.fromClassId),
                  toClassId: c.toClassId,
                  toClassName: nameOf(c.toClassId),
                  reason: c.reason,
                })),
              decision: decision
                ? {
                    decision: decision.decision,
                    fromClassId: decision.fromClassId,
                    fromClassName: nameOf(decision.fromClassId),
                    toClassId: decision.toClassId,
                    toClassName: nameOf(decision.toClassId),
                    reason: decision.reason,
                    followUp: decision.followUp,
                    meetingDate: decision.meetingDate,
                    applied: decision.appliedAt !== null,
                  }
                : null,
              reports: reports
                .filter((r) => r.yearId === y.id)
                .map((r) => ({
                  semesterId: r.semesterId,
                  semesterName: r.semesterName,
                  classId: r.classId,
                  className: nameOf(r.classId),
                  status: r.status,
                })),
              transfers: transfers
                .filter((t) => t.academicYearId === y.id)
                .map((t) => ({
                  id: t.id,
                  direction: t.direction,
                  kind: t.kind,
                  effectiveOn: t.effectiveOn,
                  reason: t.reason,
                  counterpartSchoolName: t.counterpartSchoolName,
                })),
            };
          }),
        };
      }),
  );
}
