import { descriptionOf } from '@edusync/contracts';
import {
  and,
  eq,
  inArray,
  reportCard,
  reportSubjectNarrative,
  sql,
  subject,
  type Tx,
  teacher,
  teachingAssignment,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { historicalRosterOf } from '../attendance-lib';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { canViewClass, reportNotAllowed } from '../report-card-access-lib';
import { loadClassContext, loadReportExtras, requireSemesterClass } from '../report-card-lib';
import { assertStudentsReportNotFinal } from '../report-lock-lib';
import { audit, guarded, schoolHeader } from './helpers';

const tag = ['Report cards'];
const MODULE = 'grades';
const readGate = [requirePermission('report_card:read'), requireModule(MODULE)];

const scopeQuery = z.object({ semesterId: z.uuid(), classId: z.uuid(), subjectId: z.uuid() });

const narrativeItem = z.object({
  studentId: z.uuid(),
  text: z
    .string()
    .trim()
    .max(1000)
    .nullable()
    .transform((v) => (v === '' ? null : v))
    .describe('Teks deskripsi capaian; null atau kosong menghapus suntingan manual'),
});

const narrativeRow = z.object({
  studentId: z.uuid(),
  name: z.string(),
  nis: z.string().nullable(),
  reportStatus: z
    .enum(['draft', 'final'])
    .describe('final = deskripsi tidak dapat diubah sampai rapor dibuka kembali'),
  final: z.number().nullable(),
  predicate: z.enum(['A', 'B', 'C', 'D']).nullable(),
  generated: z
    .string()
    .nullable()
    .describe(
      'Deskripsi otomatis menurut predikat (tahap 3.2); null di mode deskriptif atau bila belum ada predikat',
    ),
  manual: z.string().nullable(),
  effective: z.string().nullable().describe('Teks yang dipakai rapor: manual bila ada, selain itu otomatis'),
  source: z.enum(['manual', 'predicate']).nullable(),
});

/** Deskripsi capaian manual per mata pelajaran (bagian v2). Modul `grades`. */
export async function reportCardNarrativeRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  async function teaches(tx: Tx, ctx: TenantContext, classId: string, subjectId: string) {
    const rows = await tx
      .select({ classId: teachingAssignment.classId })
      .from(teachingAssignment)
      .innerJoin(teacher, eq(teacher.id, teachingAssignment.teacherId))
      .where(
        and(
          eq(teacher.memberId, ctx.memberId),
          eq(teachingAssignment.classId, classId),
          eq(teachingAssignment.subjectId, subjectId),
        ),
      );
    return rows.length > 0;
  }

  /** Menulis: `canInputPair` (grade:configure, atau grade:input + pengampu) atau pemegang report_card:manage (K7). */
  async function canEdit(tx: Tx, ctx: TenantContext, classId: string, subjectId: string) {
    if (ctx.permissions.has('report_card:manage') || ctx.permissions.has('grade:configure')) return true;
    if (!ctx.permissions.has('grade:input')) return false;
    return teaches(tx, ctx, classId, subjectId);
  }

  async function requireSubject(tx: Tx, subjectId: string) {
    const [sub] = await tx
      .select({ id: subject.id, name: subject.name })
      .from(subject)
      .where(eq(subject.id, subjectId));
    if (!sub) throw new HttpError(400, 'invalid_reference', 'Mata pelajaran tidak ditemukan.');
    return sub;
  }

  app.get(
    '/v1/report-cards/narratives',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Deskripsi capaian per mata pelajaran satu kelas',
        description:
          'Izin: `report_card:read`; modul `grades`. Daftar siswa kelas itu untuk satu mapel dengan deskripsi otomatis ' +
          '(menurut predikat), deskripsi manual, dan teks efektif yang dipakai rapor. Boleh dibaca pemegang ' +
          '`report_card:manage`/`report_card:read_all`, wali kelas, `grade:configure`, atau guru pengampu mapel itu di ' +
          'kelas itu (selain itu 403). Di mode deskriptif (Fase A) deskripsi otomatis kosong: hanya deskripsi manual yang ' +
          'memenuhi kelengkapan. Semester/kelas/mapel harus milik sekolah ini (400 `invalid_reference`).',
        headers: schoolHeader,
        querystring: scopeQuery,
        response: {
          200: z.object({
            reportMode: z.enum(['numeric', 'descriptive']),
            subject: z.object({ id: z.uuid(), name: z.string() }),
            students: z.array(narrativeRow),
          }),
          400: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { semesterId, classId, subjectId } = request.query;
      return tenant(request, async (tx) => {
        const { sem, cls } = await requireSemesterClass(tx, semesterId, classId);
        const sub = await requireSubject(tx, subjectId);
        const allowed =
          (await canViewClass(tx, ctx, cls.homeroomTeacherId)) ||
          (await canEdit(tx, ctx, classId, subjectId)) ||
          (ctx.permissions.has('grade:input') && (await teaches(tx, ctx, classId, subjectId)));
        if (!allowed) throw reportNotAllowed();
        const c = await loadClassContext(tx, sem, cls);
        const extras = await loadReportExtras(tx, c);
        const rows = c.roster.length
          ? await tx
              .select({ studentId: reportCard.studentId, status: reportCard.status })
              .from(reportCard)
              .where(
                and(
                  eq(reportCard.semesterId, semesterId),
                  inArray(
                    reportCard.studentId,
                    c.roster.map((s) => s.id),
                  ),
                ),
              )
          : [];
        const descriptive = extras.reportMode === 'descriptive';
        return {
          reportMode: descriptive ? ('descriptive' as const) : ('numeric' as const),
          subject: sub,
          students: c.roster.map((s) => {
            const g = c.grades.get(subjectId)?.get(s.id);
            const predicate = g?.predicate ?? null;
            const generated = predicate && !descriptive ? descriptionOf(predicate, c.reportSettings) : null;
            const manual = extras.narratives.get(s.id)?.get(subjectId) ?? null;
            return {
              studentId: s.id,
              name: s.name,
              nis: s.nis,
              reportStatus: rows.find((r) => r.studentId === s.id)?.status ?? ('draft' as const),
              final: g?.final ?? null,
              predicate,
              generated,
              manual,
              effective: manual ?? generated,
              source: manual ? ('manual' as const) : generated ? ('predicate' as const) : null,
            };
          }),
        };
      });
    },
  );

  app.put(
    '/v1/report-cards/narratives',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Simpan deskripsi capaian manual satu mapel (batch)',
        description:
          'Izin: `report_card:read`, dan guru pengampu mapel itu di kelas itu (`grade:input` + penugasan), pemegang ' +
          '`grade:configure`, atau pemegang `report_card:manage` (selain itu 403; wali kelas yang bukan pengampu hanya ' +
          'membaca). Menulis deskripsi manual per siswa untuk satu kelas-mapel-semester (1-200 siswa, teks maksimal 1.000 ' +
          'karakter; null atau kosong menghapus suntingan). Deskripsi manual menang atas deskripsi otomatis dan membuat ' +
          'rapor siswa itu berversi snapshot 2 saat difinalkan. Ditolak seluruhnya 409 `report_final` bila rapor salah ' +
          'satu siswa pada semester itu sudah final (buka kembali dulu). 400 `invalid_reference` bila semester/kelas/mapel ' +
          'tidak milik sekolah ini atau siswa bukan anggota kelas itu pada tahun ajarannya. Bertahan lewat buka kembali.',
        headers: schoolHeader,
        body: z.object({
          semesterId: z.uuid(),
          classId: z.uuid(),
          subjectId: z.uuid(),
          items: z.array(narrativeItem).min(1).max(200),
        }),
        response: {
          200: z.object({ ok: z.literal(true), saved: z.number().int(), removed: z.number().int() }),
          400: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { semesterId, classId, subjectId, items } = request.body;
      return tenant(request, async (tx) => {
        await requireSemesterClass(tx, semesterId, classId);
        await requireSubject(tx, subjectId);
        if (!(await canEdit(tx, ctx, classId, subjectId))) throw reportNotAllowed();
        const ids = [...new Set(items.map((i) => i.studentId))];
        if (ids.length !== items.length) {
          throw new HttpError(400, 'invalid_reference', 'Siswa tidak boleh muncul dua kali.');
        }
        const { rows: roster } = await historicalRosterOf(tx, classId);
        const inClass = new Set(roster.map((r) => r.id));
        if (ids.some((id) => !inClass.has(id))) {
          throw new HttpError(400, 'invalid_reference', 'Ada siswa yang bukan anggota kelas itu.');
        }
        await assertStudentsReportNotFinal(tx, semesterId, ids);
        const toSave = items.flatMap((i) => (i.text ? [{ studentId: i.studentId, text: i.text }] : []));
        const toRemove = items.filter((i) => !i.text).map((i) => i.studentId);
        if (toSave.length > 0) {
          await tx
            .insert(reportSubjectNarrative)
            .values(
              toSave.map((i) => ({
                schoolId: ctx.schoolId,
                semesterId,
                classId,
                subjectId,
                studentId: i.studentId,
                text: i.text,
                updatedBy: ctx.userId,
              })),
            )
            .onConflictDoUpdate({
              target: [
                reportSubjectNarrative.semesterId,
                reportSubjectNarrative.studentId,
                reportSubjectNarrative.subjectId,
              ],
              set: {
                text: sql`excluded.text`,
                classId: sql`excluded.class_id`,
                updatedBy: sql`excluded.updated_by`,
                updatedAt: new Date(),
              },
            });
        }
        let removed = 0;
        if (toRemove.length > 0) {
          const gone = await tx
            .delete(reportSubjectNarrative)
            .where(
              and(
                eq(reportSubjectNarrative.semesterId, semesterId),
                eq(reportSubjectNarrative.subjectId, subjectId),
                inArray(reportSubjectNarrative.studentId, toRemove),
              ),
            )
            .returning({ id: reportSubjectNarrative.id });
          removed = gone.length;
        }
        await audit(tx, ctx, 'report_card.narrative', 'class', classId, {
          semesterId,
          subjectId,
          saved: toSave.length,
          removed,
        });
        return { ok: true as const, saved: toSave.length, removed };
      });
    },
  );
}
