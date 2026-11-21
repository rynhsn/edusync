import { MAX_JOURNAL_NOTE, MAX_JOURNAL_OBJECTIVES, MAX_JOURNAL_TOPIC } from '@edusync/contracts';
import {
  and,
  asc,
  eq,
  inArray,
  learningObjective,
  learningOutcome,
  learningPlan,
  learningPlanObjective,
  learningPlanSetting,
  lessonJournal,
  lessonJournalObjective,
  scheduleEntry,
  subject,
  type Tx,
  teacher,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { closureOn, todayInJakarta } from '../attendance-lib';
import { weekdayOf } from '../gate';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { assertObjectivesForSubject } from '../objective-achievement-lib';
import { entryAppliesOn } from '../schedule-lib';
import { audit, guarded, ok, schoolHeader } from './helpers';
import { authorizeLesson, combinedCells } from './lesson-attendance';

/**
 * Jurnal mengajar (tahap 3.6.2) di Absensi per jam, opsional per sekolah lewat `learning_plan_setting.journal_enabled`
 * (mati = 403 `feature_disabled`). Tidak wajib, tanpa pengingat, tidak terlihat portal murid/wali, tidak diblokir `report_final`.
 * Izin sama dengan absensi jam itu (`authorizeLesson`); modul `attendance`.
 */

const tag = ['Lesson attendance'];
const gate = [requirePermission('attendance:read'), requireModule('attendance')];
const dateField = z.iso.date();
const target = {
  scheduleEntryId: z.uuid().optional(),
  combinedKey: z.uuid().optional().describe('Pertemuan gabungan: ditulis ke setiap sel'),
};
const targetNote =
  ' Sasaran: tepat satu dari `scheduleEntryId` (satu jam) atau `combinedKey` (pertemuan gabungan; satu jurnal per sel), ' +
  'selain itu 400 `invalid_target`.';
const featureNote = ' Sakelar jurnal sekolah harus hidup (403 `feature_disabled`); modul `attendance`.';

const journalOut = z.object({
  id: z.uuid(),
  topic: z.string(),
  note: z.string().nullable(),
  planId: z.uuid().nullable(),
  objectiveIds: z.array(z.uuid()),
  actualTeacherName: z.string().nullable().describe('Guru pengganti yang mengisi; kosong bila guru jadwal'),
  updatedAt: z.string(),
});

async function requireJournalEnabled(tx: Tx) {
  const [row] = await tx.select().from(learningPlanSetting);
  if (!row?.journalEnabled) {
    throw new HttpError(403, 'feature_disabled', 'Fitur jurnal mengajar belum dinyalakan untuk sekolah ini.');
  }
  return row;
}

/** Sel sasaran: satu jam, atau semua sel pertemuan gabungan. `validate` memeriksa hari/cakupan jadwal seperti PUT absensi. */
async function resolve(
  tx: Tx,
  q: { scheduleEntryId?: string | undefined; combinedKey?: string | undefined },
  date: string,
  validate: boolean,
) {
  if (!q.scheduleEntryId === !q.combinedKey) {
    throw new HttpError(400, 'invalid_target', 'Isi tepat satu dari scheduleEntryId atau combinedKey.');
  }
  if (q.combinedKey) {
    const { cells, head } = await combinedCells(tx, q.combinedKey, date);
    return { cells, head, combinedKey: q.combinedKey };
  }
  const [entry] = await tx
    .select()
    .from(scheduleEntry)
    .where(eq(scheduleEntry.id, q.scheduleEntryId as string));
  if (!entry) throw new HttpError(404, 'not_found', 'Jam pelajaran tidak ditemukan.');
  if (validate) {
    if (weekdayOf(date) !== entry.weekday) {
      throw new HttpError(400, 'invalid_date', 'Tanggal itu bukan hari jadwal pelajaran ini.');
    }
    if (!(await entryAppliesOn(tx, entry, date))) {
      throw new HttpError(400, 'invalid_date', 'Jadwal pelajaran ini tidak berlaku pada tanggal itu.');
    }
  }
  return { cells: [entry], head: entry, combinedKey: undefined };
}

async function journalOf(tx: Tx, entryId: string, date: string) {
  const [row] = await tx
    .select({
      id: lessonJournal.id,
      topic: lessonJournal.topic,
      note: lessonJournal.note,
      planId: lessonJournal.planId,
      actualTeacherName: teacher.name,
      updatedAt: lessonJournal.updatedAt,
    })
    .from(lessonJournal)
    .leftJoin(teacher, eq(teacher.id, lessonJournal.actualTeacherId))
    .where(and(eq(lessonJournal.scheduleEntryId, entryId), eq(lessonJournal.date, date)));
  if (!row) return null;
  const links = await tx
    .select({ id: lessonJournalObjective.objectiveId })
    .from(lessonJournalObjective)
    .where(eq(lessonJournalObjective.journalId, row.id));
  return { ...row, updatedAt: row.updatedAt.toISOString(), objectiveIds: links.map((l) => l.id) };
}

export async function lessonJournalRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  app.get(
    '/v1/lesson-journals',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Jurnal mengajar satu jam pelajaran',
        description:
          `Izin: \`attendance:read\`.${featureNote}${targetNote} Mengembalikan jurnal tanggal itu (\`null\` bila belum ada; ` +
          'untuk pertemuan gabungan, jurnal sel pertama), pilihan perencanaan mapel itu pada tahun ajaran sel (kosong bila sakelar ' +
          'perencanaan mati) dan TP aktif mapel itu untuk dipilih. `canRecord` dan `substitute` seperti pada absensi satu jam. ' +
          'Tidak terlihat oleh portal murid/wali.',
        headers: schoolHeader,
        querystring: z.object({ ...target, date: dateField }),
        response: {
          200: z.object({
            date: z.string(),
            canRecord: z.boolean(),
            substitute: z.boolean(),
            subjectName: z.string(),
            journal: journalOut.nullable(),
            plans: z.array(z.object({ id: z.uuid(), title: z.string(), objectiveIds: z.array(z.uuid()) })),
            objectives: z.array(
              z.object({ id: z.uuid(), code: z.string().nullable(), description: z.string() }),
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
      const { date } = request.query;
      return tenant(request, async (tx) => {
        const setting = await requireJournalEnabled(tx);
        const { head } = await resolve(tx, request.query, date, false);
        const auth = await authorizeLesson(tx, ctx, head, date);
        const [subj] = await tx
          .select({ name: subject.name })
          .from(subject)
          .where(eq(subject.id, head.subjectId));
        const plans = setting.planEnabled
          ? await tx
              .select({ id: learningPlan.id, title: learningPlan.title })
              .from(learningPlan)
              .where(
                and(
                  eq(learningPlan.subjectId, head.subjectId),
                  eq(learningPlan.academicYearId, head.academicYearId),
                ),
              )
              .orderBy(asc(learningPlan.title), asc(learningPlan.id))
          : [];
        const links = plans.length
          ? await tx
              .select()
              .from(learningPlanObjective)
              .where(
                inArray(
                  learningPlanObjective.planId,
                  plans.map((p) => p.id),
                ),
              )
          : [];
        const objectives = await tx
          .select({
            id: learningObjective.id,
            code: learningObjective.code,
            description: learningObjective.description,
          })
          .from(learningObjective)
          .innerJoin(learningOutcome, eq(learningOutcome.id, learningObjective.outcomeId))
          .where(and(eq(learningOutcome.subjectId, head.subjectId), eq(learningObjective.active, true)))
          .orderBy(asc(learningObjective.sortOrder), asc(learningObjective.code), asc(learningObjective.id));
        return {
          date,
          canRecord: auth.allowed,
          substitute: auth.substitute,
          subjectName: subj?.name ?? '',
          journal: await journalOf(tx, head.id, date),
          plans: plans.map((p) => ({
            ...p,
            objectiveIds: links.filter((l) => l.planId === p.id).map((l) => l.objectiveId),
          })),
          objectives,
        };
      });
    },
  );

  app.put(
    '/v1/lesson-journals',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Simpan jurnal mengajar satu jam pelajaran',
        description:
          `Izin: \`attendance:read\` ditambah salah satu: guru jadwal itu, guru piket hari ini (menggantikan; guru pengganti dicatat ` +
          `sebagai \`actualTeacherName\`), atau \`attendance:configure\`; selain itu 403 \`not_your_lesson\`.${featureNote}${targetNote} ` +
          'Upsert per sel dan tanggal; pertemuan gabungan menulis jurnal yang sama ke setiap sel. Aturan tanggal sama dengan PUT absensi ' +
          '(400 `invalid_date`, 409 `future_date`, 409 `school_closed`). Hanya `topic` wajib; `planId` harus perencanaan mapel dan ' +
          `tahun ajaran sel itu (400 \`invalid_reference\`); \`objectiveIds\` maks ${MAX_JOURNAL_OBJECTIVES} TP aktif milik mapel ` +
          '(400 `objective_subject_mismatch`, `objective_inactive`, `invalid_reference`) dan mengganti seluruh himpunan. ' +
          'Tidak diblokir rapor final dan tidak diwajibkan sebelum absensi. Audit `lesson_journal.save`.',
        headers: schoolHeader,
        body: z.object({
          ...target,
          date: dateField,
          topic: z.string().trim().min(1).max(MAX_JOURNAL_TOPIC),
          note: z.string().trim().max(MAX_JOURNAL_NOTE).nullable().default(null),
          planId: z.uuid().nullable().default(null),
          objectiveIds: z.array(z.uuid()).max(MAX_JOURNAL_OBJECTIVES).default([]),
        }),
        response: {
          200: z.object({ substitute: z.boolean(), cells: z.number().int(), journal: journalOut }),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      if (b.date > todayInJakarta()) {
        throw new HttpError(409, 'future_date', 'Jurnal tidak bisa diisi untuk tanggal yang belum tiba.');
      }
      return tenant(request, async (tx) => {
        await requireJournalEnabled(tx);
        const { cells, head, combinedKey } = await resolve(tx, b, b.date, true);
        const auth = await authorizeLesson(tx, ctx, head, b.date);
        if (!auth.allowed) {
          throw new HttpError(
            403,
            'not_your_lesson',
            'Hanya guru jam ini atau guru piket yang boleh mengisi.',
          );
        }
        const closed = await closureOn(tx, b.date);
        if (closed) throw new HttpError(409, 'school_closed', `Tanggal itu ${closed.title}.`);
        if (b.planId) {
          const [plan] = await tx
            .select({ subjectId: learningPlan.subjectId, yearId: learningPlan.academicYearId })
            .from(learningPlan)
            .where(eq(learningPlan.id, b.planId));
          if (!plan || plan.subjectId !== head.subjectId || plan.yearId !== head.academicYearId) {
            throw new HttpError(
              400,
              'invalid_reference',
              'Perencanaan tidak ditemukan atau bukan milik mata pelajaran dan tahun ajaran jam ini.',
            );
          }
        }
        const objectiveIds = await assertObjectivesForSubject(tx, head.subjectId, b.objectiveIds, {
          maxCount: false,
        });
        // Guru pengganti dicatat bila ia terdaftar sebagai guru; guru jadwal sendiri tidak ditandai.
        const [mine] = auth.substitute
          ? await tx.select({ id: teacher.id }).from(teacher).where(eq(teacher.memberId, ctx.memberId))
          : [];
        for (const cell of cells) {
          const values = {
            topic: b.topic,
            note: b.note,
            planId: b.planId,
            actualTeacherId: mine?.id ?? null,
            recordedBy: ctx.userId,
          };
          const [row] = await tx
            .insert(lessonJournal)
            .values({ schoolId: ctx.schoolId, scheduleEntryId: cell.id, date: b.date, ...values })
            .onConflictDoUpdate({
              target: [lessonJournal.scheduleEntryId, lessonJournal.date],
              set: { ...values, updatedAt: new Date() },
            })
            .returning({ id: lessonJournal.id });
          await tx.delete(lessonJournalObjective).where(eq(lessonJournalObjective.journalId, row!.id));
          if (objectiveIds.length) {
            await tx.insert(lessonJournalObjective).values(
              objectiveIds.map((objectiveId) => ({
                schoolId: ctx.schoolId,
                journalId: row!.id,
                objectiveId,
              })),
            );
          }
        }
        await audit(tx, ctx, 'lesson_journal.save', 'schedule_entry', head.id, {
          date: b.date,
          ...(combinedKey ? { combinedKey } : {}),
          cells: cells.length,
          substitute: auth.substitute,
        });
        return {
          substitute: auth.substitute,
          cells: cells.length,
          journal: (await journalOf(tx, head.id, b.date)) as NonNullable<
            Awaited<ReturnType<typeof journalOf>>
          >,
        };
      });
    },
  );

  app.delete(
    '/v1/lesson-journals',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Hapus jurnal mengajar satu jam pelajaran',
        description:
          `Izin: \`attendance:read\` ditambah aturan pengisi yang sama dengan PUT (403 \`not_your_lesson\`).${featureNote}${targetNote} Untuk pertemuan gabungan ` +
          'jurnal semua sel dihapus. Tidak ada jurnal: 404 `not_found`. Audit `lesson_journal.delete`.',
        headers: schoolHeader,
        querystring: z.object({ ...target, date: dateField }),
        response: { 200: ok, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { date } = request.query;
      return tenant(request, async (tx) => {
        await requireJournalEnabled(tx);
        const { cells, head } = await resolve(tx, request.query, date, false);
        const auth = await authorizeLesson(tx, ctx, head, date);
        if (!auth.allowed) {
          throw new HttpError(
            403,
            'not_your_lesson',
            'Hanya guru jam ini atau guru piket yang boleh mengisi.',
          );
        }
        const gone = await tx
          .delete(lessonJournal)
          .where(
            and(
              inArray(
                lessonJournal.scheduleEntryId,
                cells.map((c) => c.id),
              ),
              eq(lessonJournal.date, date),
            ),
          )
          .returning({ id: lessonJournal.id });
        if (gone.length === 0) throw new HttpError(404, 'not_found', 'Jurnal tidak ditemukan.');
        await audit(tx, ctx, 'lesson_journal.delete', 'schedule_entry', head.id, {
          date,
          cells: gone.length,
          substitute: auth.substitute,
        });
        return { ok: true as const };
      });
    },
  );
}
