import {
  invalidReviewRating,
  LEARNING_REVIEW_ITEMS,
  MAX_REVIEW_NOTE,
  MAX_REVIEW_RESPONDENTS,
  REVIEWER_KINDS,
  type ReviewerKind,
} from '@edusync/contracts';
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  learningPlanSetting,
  learningProcessReview,
  or,
  semester,
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
import { audit, guarded, idParams, ok, schoolHeader } from './helpers';

/**
 * Penilaian proses pembelajaran (tahap 3.6.3, C12), opsional per sekolah lewat `learning_plan_setting.review_enabled`
 * (mati = 403 `feature_disabled`). Rubrik tetap dari kontrak (skala 1-4). Hanya melaporkan: tidak memengaruhi nilai, rapor, atau
 * alur lain, tanpa skor gabungan atau peringkat guru. Modul `grades`. Pemegang `teaching_review:manage` mengelola semua jenis;
 * guru hanya tinjauan `self` miliknya dan tinjauan lain tentang dirinya yang dibagikan (`sharedWithTeacher`).
 */

const tag = ['Curriculum'];
const gate = [requirePermission('subject:read'), requireModule('grades')];
const manageGate = [requirePermission('teaching_review:manage'), requireModule('grades')];
const notFound = () => new HttpError(404, 'not_found', 'Tinjauan tidak ditemukan.');
const bad = (code: string, message: string) => new HttpError(400, code, message);

const ratings = z.record(z.string(), z.number()).describe('Kunci butir rubrik tetap -> nilai 1..4');
const reviewOut = z.object({
  id: z.uuid(),
  semesterId: z.uuid(),
  semesterName: z.string(),
  teacherId: z.uuid(),
  teacherName: z.string(),
  reviewerKind: z.enum(REVIEWER_KINDS),
  reviewerTeacherId: z.uuid().nullable(),
  reviewerTeacherName: z.string().nullable(),
  reviewedOn: z.string(),
  ratings: ratings.nullable(),
  respondentCount: z.number().int().nullable(),
  note: z.string().nullable(),
  sharedWithTeacher: z.boolean(),
  createdAt: z.string(),
});
const note = z.string().trim().max(MAX_REVIEW_NOTE).nullable().optional();

interface Settings {
  reviewMinPerSemester: number;
}

async function requireReviewEnabled(tx: Tx): Promise<Settings> {
  const [row] = await tx.select().from(learningPlanSetting);
  if (!row?.reviewEnabled) {
    throw new HttpError(
      403,
      'feature_disabled',
      'Fitur penilaian proses pembelajaran belum dinyalakan untuk sekolah ini.',
    );
  }
  return row;
}

/** Pengelola (`teaching_review:manage`) atau guru aktif ber-`teaching_plan:write`; selain itu 403. */
async function actorOf(tx: Tx, ctx: TenantContext) {
  const manager = ctx.permissions.has('teaching_review:manage');
  const [me] = await tx
    .select({ id: teacher.id })
    .from(teacher)
    .where(and(eq(teacher.memberId, ctx.memberId), eq(teacher.status, 'active')));
  if (!manager && !(ctx.permissions.has('teaching_plan:write') && me)) throw forbidden();
  return { manager, teacherId: me?.id ?? null };
}

const reviewQuery = (tx: Tx) => {
  const reviewer = tx.$with('reviewer').as(tx.select({ id: teacher.id, name: teacher.name }).from(teacher));
  return tx
    .with(reviewer)
    .select({
      id: learningProcessReview.id,
      semesterId: learningProcessReview.semesterId,
      semesterName: semester.name,
      teacherId: learningProcessReview.teacherId,
      teacherName: teacher.name,
      reviewerKind: learningProcessReview.reviewerKind,
      reviewerTeacherId: learningProcessReview.reviewerTeacherId,
      reviewerTeacherName: reviewer.name,
      reviewedOn: learningProcessReview.reviewedOn,
      ratings: learningProcessReview.ratings,
      respondentCount: learningProcessReview.respondentCount,
      note: learningProcessReview.note,
      sharedWithTeacher: learningProcessReview.sharedWithTeacher,
      createdAt: learningProcessReview.createdAt,
    })
    .from(learningProcessReview)
    .innerJoin(semester, eq(semester.id, learningProcessReview.semesterId))
    .innerJoin(teacher, eq(teacher.id, learningProcessReview.teacherId))
    .leftJoin(reviewer, eq(reviewer.id, learningProcessReview.reviewerTeacherId));
};

async function reviewsOf(tx: Tx, where?: ReturnType<typeof and>) {
  const rows = await reviewQuery(tx)
    .where(where)
    .orderBy(desc(learningProcessReview.reviewedOn), asc(teacher.name), asc(learningProcessReview.id));
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/** Tinjauan yang boleh dilihat aktor: pengelola semua; guru hanya `self` miliknya atau yang dibagikan kepadanya. */
const visibleTo = (actor: { manager: boolean; teacherId: string | null }) =>
  actor.manager
    ? undefined
    : and(
        eq(learningProcessReview.teacherId, actor.teacherId as string),
        or(eq(learningProcessReview.reviewerKind, 'self'), eq(learningProcessReview.sharedWithTeacher, true)),
      );

async function reviewOf(tx: Tx, id: string, actor: { manager: boolean; teacherId: string | null }) {
  const [row] = await reviewsOf(tx, and(eq(learningProcessReview.id, id), visibleTo(actor)));
  if (!row) throw notFound();
  return row;
}

/** Guru (bukan pengelola) hanya boleh mengubah/menghapus tinjauan `self` miliknya. */
function assertCanModify(
  actor: { manager: boolean; teacherId: string | null },
  row: { reviewerKind: ReviewerKind; teacherId: string },
) {
  if (actor.manager) return;
  if (row.reviewerKind !== 'self' || row.teacherId !== actor.teacherId) {
    throw forbidden('Guru hanya dapat mengelola tinjauan refleksi dirinya sendiri.');
  }
}

/** Rating dan jumlah responden sesuai jenis penilai; hasilnya siap disimpan. */
function checkContent(
  kind: ReviewerKind,
  b: { ratings?: Record<string, number> | null | undefined; respondentCount?: number | null | undefined },
  noteText: string | null | undefined,
) {
  const rated = b.ratings && Object.keys(b.ratings).length > 0 ? b.ratings : null;
  if (rated) {
    const wrong = invalidReviewRating(rated, kind);
    if (wrong) {
      throw bad('invalid_rating', `Butir "${wrong}" tidak dikenal atau nilainya di luar 1-4.`);
    }
  }
  if (!rated && !noteText) throw bad('empty_review', 'Isi minimal satu penilaian butir atau catatan.');
  if (kind === 'student' && !b.respondentCount) {
    throw bad('invalid_respondents', 'Penilaian murid wajib memuat jumlah responden (agregat anonim).');
  }
  if (kind !== 'student' && b.respondentCount != null) {
    throw bad('invalid_respondents', 'Jumlah responden hanya untuk penilaian murid.');
  }
  return rated;
}

export async function learningReviewRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(
    request: { ctx?: TenantContext; server: FastifyInstance },
    fn: Parameters<typeof withTenant<T>>[2],
  ) => withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);
  const featureNote =
    ' Sakelar penilaian proses sekolah harus hidup (403 `feature_disabled`); modul `grades`. Hanya melaporkan: tidak memengaruhi nilai, rapor, atau alur lain.';
  const actorNote =
    ' Pemegang `teaching_review:manage` (admin sekolah, kepala sekolah, kurikulum) mengelola semua jenis tinjauan; guru ' +
    '(`teaching_plan:write`) hanya tinjauan `self` miliknya. Peran lain 403 `forbidden`.';

  app.get(
    '/v1/learning-reviews',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Daftar tinjauan proses pembelajaran',
        description:
          `Izin: \`subject:read\`.${featureNote}${actorNote} Pengelola melihat semua tinjauan; guru hanya tinjauan tentang ` +
          'dirinya yang `self` atau yang dibagikan (`sharedWithTeacher`). Filter opsional `semesterId`, `teacherId`. ' +
          'Tidak ada skor gabungan atau peringkat.',
        headers: schoolHeader,
        querystring: z.object({ semesterId: z.uuid().optional(), teacherId: z.uuid().optional() }),
        response: { 200: z.object({ reviews: z.array(reviewOut) }), ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        await requireReviewEnabled(tx);
        const actor = await actorOf(tx, request.ctx as TenantContext);
        const q = request.query;
        return {
          reviews: await reviewsOf(
            tx,
            and(
              visibleTo(actor),
              q.semesterId ? eq(learningProcessReview.semesterId, q.semesterId) : undefined,
              q.teacherId ? eq(learningProcessReview.teacherId, q.teacherId) : undefined,
            ),
          ),
        };
      }),
  );

  app.get(
    '/v1/learning-reviews/coverage',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Kecakupan penilaian proses per guru',
        description:
          `Izin: \`teaching_review:manage\`.${featureNote} Per guru aktif: hitungan tinjauan per jenis penilai dan \`met\` bila ` +
          'total >= `minPerSemester` (bawaan 1, atur lewat sakelar; bukan per sudut pandang). Hanya melaporkan, tidak ' +
          'memblokir apa pun dan tidak ada notifikasi.',
        headers: schoolHeader,
        querystring: z.object({ semesterId: z.uuid() }),
        response: {
          200: z.object({
            semesterId: z.uuid(),
            minPerSemester: z.number().int(),
            teachers: z.array(
              z.object({
                teacherId: z.uuid(),
                teacherName: z.string(),
                counts: z.object({
                  self: z.number().int(),
                  peer: z.number().int(),
                  principal: z.number().int(),
                  student: z.number().int(),
                }),
                total: z.number().int(),
                met: z.boolean(),
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
        const settings = await requireReviewEnabled(tx);
        const semesterId = request.query.semesterId;
        const [sem] = await tx.select({ id: semester.id }).from(semester).where(eq(semester.id, semesterId));
        if (!sem) throw new HttpError(404, 'not_found', 'Semester tidak ditemukan.');
        const teachers = await tx
          .select({ id: teacher.id, name: teacher.name })
          .from(teacher)
          .where(eq(teacher.status, 'active'))
          .orderBy(asc(teacher.name), asc(teacher.id));
        const rows = await tx
          .select({ teacherId: learningProcessReview.teacherId, kind: learningProcessReview.reviewerKind })
          .from(learningProcessReview)
          .where(eq(learningProcessReview.semesterId, semesterId));
        const min = settings.reviewMinPerSemester;
        return {
          semesterId,
          minPerSemester: min,
          teachers: teachers.map((t) => {
            const counts = { self: 0, peer: 0, principal: 0, student: 0 };
            for (const r of rows) if (r.teacherId === t.id) counts[r.kind] += 1;
            const total = counts.self + counts.peer + counts.principal + counts.student;
            return { teacherId: t.id, teacherName: t.name, counts, total, met: total >= min };
          }),
        };
      }),
  );

  const content = {
    reviewedOn: z.iso.date().optional(),
    ratings: ratings.nullable().optional(),
    respondentCount: z.number().int().min(1).max(MAX_REVIEW_RESPONDENTS).nullable().optional(),
    note,
    sharedWithTeacher: z.boolean().optional(),
  };
  const contentNote =
    ` \`ratings\`: kunci hanya ${LEARNING_REVIEW_ITEMS.join(', ')}; nilai bulat 1..4 (murid: rata-rata agregat, maks 2 desimal) ` +
    '(400 `invalid_rating`). Minimal satu butir atau catatan (400 `empty_review`). `respondentCount` wajib untuk `student` ' +
    'dan terlarang untuk jenis lain (400 `invalid_respondents`); murid hanya agregat anonim yang diinput staf.';

  app.post(
    '/v1/learning-reviews',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Catat tinjauan proses pembelajaran',
        description:
          `Izin: \`subject:read\`.${featureNote}${actorNote} Jenis \`self\`, \`peer\`, \`principal\`, \`student\`. Guru: hanya ` +
          '`self` untuk dirinya (`teacherId` dihilangkan = dirinya; selain itu 403 `forbidden`). Pengelola wajib mengisi ' +
          '`teacherId`. `peer` wajib `reviewerTeacherId` (guru lain, bukan yang ditinjau; 400 `invalid_reviewer`), jenis lain ' +
          'terlarang mengisinya. `reviewedOn` bawaan hari ini. `sharedWithTeacher` bawaan `false` dan hanya berlaku untuk ' +
          'jenis selain `self` yang dicatat pengelola. Semester/guru tidak ditemukan: 400 `invalid_reference`.' +
          contentNote,
        headers: schoolHeader,
        body: z.object({
          semesterId: z.uuid(),
          teacherId: z.uuid().optional(),
          reviewerKind: z.enum(REVIEWER_KINDS),
          reviewerTeacherId: z.uuid().nullable().optional(),
          ...content,
        }),
        response: { 201: reviewOut, 400: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      const out = await tenant(request, async (tx) => {
        await requireReviewEnabled(tx);
        const actor = await actorOf(tx, ctx);
        if (
          !actor.manager &&
          (b.reviewerKind !== 'self' || (b.teacherId && b.teacherId !== actor.teacherId))
        ) {
          throw forbidden('Guru hanya dapat mencatat tinjauan refleksi dirinya sendiri.');
        }
        const teacherId = actor.manager ? b.teacherId : (actor.teacherId as string);
        if (!teacherId) throw bad('invalid_reference', 'Guru yang ditinjau wajib diisi.');
        const [sem] = await tx
          .select({ id: semester.id })
          .from(semester)
          .where(eq(semester.id, b.semesterId));
        const people = await tx
          .select({ id: teacher.id })
          .from(teacher)
          .where(inArray(teacher.id, [teacherId, ...(b.reviewerTeacherId ? [b.reviewerTeacherId] : [])]));
        if (!sem || !people.some((p) => p.id === teacherId)) {
          throw bad('invalid_reference', 'Semester atau guru tidak ditemukan.');
        }
        if (b.reviewerKind === 'peer') {
          if (!b.reviewerTeacherId || b.reviewerTeacherId === teacherId || people.length !== 2) {
            throw bad(
              'invalid_reviewer',
              'Sejawat wajib guru lain yang terdaftar, bukan guru yang ditinjau.',
            );
          }
        } else if (b.reviewerTeacherId) {
          throw bad('invalid_reviewer', 'Guru penilai hanya untuk penilaian sejawat.');
        }
        const rated = checkContent(b.reviewerKind, b, b.note);
        const [row] = await tx
          .insert(learningProcessReview)
          .values({
            schoolId: ctx.schoolId,
            semesterId: b.semesterId,
            teacherId,
            reviewerKind: b.reviewerKind,
            reviewerTeacherId: b.reviewerKind === 'peer' ? (b.reviewerTeacherId as string) : null,
            reviewedOn: b.reviewedOn ?? todayInJakarta(),
            ratings: rated,
            respondentCount: b.respondentCount ?? null,
            note: b.note || null,
            sharedWithTeacher:
              actor.manager && b.reviewerKind !== 'self' ? (b.sharedWithTeacher ?? false) : false,
            recordedBy: ctx.userId,
          })
          .returning({ id: learningProcessReview.id });
        await audit(tx, ctx, 'learning_review.create', 'learning_process_review', row!.id, {
          reviewerKind: b.reviewerKind,
          teacherId,
          semesterId: b.semesterId,
        });
        return reviewOf(tx, row!.id, actor);
      });
      return reply.code(201).send(out);
    },
  );

  app.put(
    '/v1/learning-reviews/:id',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Ubah tinjauan proses pembelajaran',
        description:
          `Izin: \`subject:read\`.${featureNote}${actorNote} Semester, guru yang ditinjau, dan jenis penilai tidak dapat diubah ` +
          '(hapus lalu catat ulang). Field yang dihilangkan tidak berubah; `ratings` mengganti seluruh isian. Guru hanya ' +
          'untuk `self` miliknya (selain itu 403 `forbidden`); `sharedWithTeacher` hanya diubah pengelola.' +
          contentNote,
        headers: schoolHeader,
        params: idParams,
        body: z.object({ ...content, reviewerTeacherId: z.uuid().nullable().optional() }),
        response: { 200: reviewOut, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      return tenant(request, async (tx) => {
        await requireReviewEnabled(tx);
        const actor = await actorOf(tx, ctx);
        const cur = await reviewOf(tx, request.params.id, actor);
        assertCanModify(actor, cur);
        if (cur.reviewerKind === 'peer' && b.reviewerTeacherId !== undefined) {
          const [rev] = b.reviewerTeacherId
            ? await tx.select({ id: teacher.id }).from(teacher).where(eq(teacher.id, b.reviewerTeacherId))
            : [];
          if (!rev || rev.id === cur.teacherId) {
            throw bad(
              'invalid_reviewer',
              'Sejawat wajib guru lain yang terdaftar, bukan guru yang ditinjau.',
            );
          }
        } else if (cur.reviewerKind !== 'peer' && b.reviewerTeacherId) {
          throw bad('invalid_reviewer', 'Guru penilai hanya untuk penilaian sejawat.');
        }
        const nextNote = b.note === undefined ? cur.note : b.note || null;
        const rated = checkContent(
          cur.reviewerKind,
          {
            ratings: b.ratings === undefined ? cur.ratings : b.ratings,
            respondentCount: b.respondentCount === undefined ? cur.respondentCount : b.respondentCount,
          },
          nextNote,
        );
        await tx
          .update(learningProcessReview)
          .set({
            reviewedOn: b.reviewedOn ?? cur.reviewedOn,
            ratings: rated,
            respondentCount: b.respondentCount === undefined ? cur.respondentCount : b.respondentCount,
            note: nextNote,
            reviewerTeacherId:
              cur.reviewerKind === 'peer' && b.reviewerTeacherId
                ? b.reviewerTeacherId
                : cur.reviewerTeacherId,
            sharedWithTeacher:
              actor.manager && cur.reviewerKind !== 'self' && b.sharedWithTeacher !== undefined
                ? b.sharedWithTeacher
                : cur.sharedWithTeacher,
          })
          .where(eq(learningProcessReview.id, cur.id));
        await audit(tx, ctx, 'learning_review.update', 'learning_process_review', cur.id, {
          reviewerKind: cur.reviewerKind,
        });
        return reviewOf(tx, cur.id, actor);
      });
    },
  );

  app.delete(
    '/v1/learning-reviews/:id',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Hapus tinjauan proses pembelajaran',
        description: `Izin: \`subject:read\`.${featureNote}${actorNote} Guru hanya untuk \`self\` miliknya (selain itu 403 \`forbidden\`).`,
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        await requireReviewEnabled(tx);
        const actor = await actorOf(tx, ctx);
        const cur = await reviewOf(tx, request.params.id, actor);
        assertCanModify(actor, cur);
        await tx.delete(learningProcessReview).where(eq(learningProcessReview.id, cur.id));
        await audit(tx, ctx, 'learning_review.delete', 'learning_process_review', cur.id, {
          reviewerKind: cur.reviewerKind,
        });
        return { ok: true as const };
      });
    },
  );
}
