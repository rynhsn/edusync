import { COUNCIL_ATTENDEE_ROLES, COUNCIL_MEETING_KINDS, COUNCIL_MEETING_STATUSES } from '@edusync/contracts';
import {
  academicYear,
  and,
  asc,
  classRoom,
  councilMeeting,
  councilMeetingAttendee,
  desc,
  eq,
  inArray,
  promotionDecision,
  semester,
  sql,
  type Tx,
  teacher,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  assertMeetingNotFinal,
  buildDigest,
  type DecisionDigest,
  loadDecisionRows,
  meetingFinalError,
} from '../council-meeting-lib';
import { errorSchema, HttpError } from '../http-error';
import { requirePermission, type TenantContext } from '../identity/guards';
import { audit, guarded, idParams, ok, schoolHeader } from './helpers';

/**
 * Berita acara musyawarah dewan pendidik dan laporan ringkas keputusan kenaikan (fase 3C.3). Berita acara menautkan
 * keputusan kenaikan (`promotion_decision.meeting_id`); saat difinalkan, rekap keputusan tertaut dibekukan di `minutes`
 * dan keputusan yang tertaut terkunci (409 `meeting_final`). Tidak ada yang mengubah keputusan itu sendiri.
 */

const tag = ['Academic'];
const writeGate = [requirePermission('promotion:manage')];
const readGate = [requirePermission('report_card:read_all')];

const invalidRef = (message: string) => new HttpError(400, 'invalid_reference', message);
const meetingNotFound = () => new HttpError(404, 'not_found', 'Berita acara tidak ditemukan.');

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

const attendeeInput = z.object({
  teacherId: z
    .uuid()
    .nullable()
    .optional()
    .describe('Guru yang hadir (opsional); nama diisi dari guru bila `name` kosong'),
  name: z.string().trim().max(160).optional(),
  positionTitle: text(120).describe('Jabatan di rapat (teks bebas)'),
  role: z.enum(COUNCIL_ATTENDEE_ROLES).default('member'),
});

const meetingFields = {
  semesterId: z.uuid().nullable().optional(),
  classId: z.uuid().nullable().optional().describe('Kelas yang dibahas; kosong = seluruh tahun ajaran'),
  kind: z.enum(COUNCIL_MEETING_KINDS),
  title: z.string().trim().min(1).max(160),
  heldOn: z.iso.date(),
  location: text(200),
  chairName: text(160),
  secretaryName: text(160),
  agenda: text(4000),
  summary: text(8000),
  attendees: z.array(attendeeInput).max(80).optional(),
};

const attendeeView = z.object({
  teacherId: z.uuid().nullable(),
  name: z.string(),
  positionTitle: z.string().nullable(),
  role: z.enum(COUNCIL_ATTENDEE_ROLES),
});

const digestSchema = z.object({
  totals: z.object({
    total: z.number().int(),
    promote: z.number().int(),
    retain: z.number().int(),
    graduate: z.number().int(),
  }),
  classes: z.array(
    z.object({
      classId: z.uuid(),
      name: z.string(),
      level: z.string(),
      promote: z.number().int(),
      retain: z.number().int(),
      graduate: z.number().int(),
    }),
  ),
  retained: z.array(
    z.object({
      studentId: z.uuid(),
      name: z.string(),
      classId: z.uuid(),
      className: z.string(),
      reason: z.string().nullable(),
      followUp: z.string().nullable(),
      meetingDate: z.iso.date().nullable(),
      applied: z.boolean(),
    }),
  ),
});

const meetingView = z.object({
  id: z.uuid(),
  academicYearId: z.uuid(),
  semesterId: z.uuid().nullable(),
  classId: z.uuid().nullable(),
  className: z.string().nullable(),
  kind: z.enum(COUNCIL_MEETING_KINDS),
  title: z.string(),
  heldOn: z.iso.date(),
  location: z.string().nullable(),
  chairName: z.string().nullable(),
  secretaryName: z.string().nullable(),
  agenda: z.string().nullable(),
  summary: z.string().nullable(),
  status: z.enum(COUNCIL_MEETING_STATUSES),
  finalizedAt: z.string().nullable(),
  linkedCount: z.number().int().describe('Jumlah keputusan kenaikan yang tertaut'),
  attendeeCount: z.number().int(),
});

const detailView = meetingView.extend({
  attendees: z.array(attendeeView),
  digest: digestSchema.describe(
    'Rekap keputusan tertaut: dibekukan dari `minutes` bila berita acara final, selain itu dihitung dari keputusan tersimpan',
  ),
  frozen: z.boolean().describe('true bila `digest` dibaca dari rekap beku saat finalisasi'),
  linked: z.array(
    z.object({
      studentId: z.uuid(),
      name: z.string(),
      className: z.string(),
      decision: z.enum(['promote', 'retain', 'graduate']),
      applied: z.boolean(),
    }),
  ),
});

type MeetingRow = typeof councilMeeting.$inferSelect;

async function loadMeeting(tx: Tx, id: string): Promise<MeetingRow> {
  const [row] = await tx.select().from(councilMeeting).where(eq(councilMeeting.id, id));
  if (!row) throw meetingNotFound();
  return row;
}

/** Tahun, semester, kelas, dan guru yang dirujuk harus ada di sekolah ini dan konsisten satu sama lain. */
async function validateRefs(
  tx: Tx,
  yearId: string,
  b: {
    semesterId?: string | null | undefined;
    classId?: string | null | undefined;
    attendees?: z.infer<typeof attendeeInput>[] | undefined;
  },
) {
  const [year] = await tx
    .select({ id: academicYear.id })
    .from(academicYear)
    .where(eq(academicYear.id, yearId));
  if (!year) throw invalidRef('Tahun ajaran tidak ditemukan.');
  if (b.semesterId) {
    const [s] = await tx
      .select({ yearId: semester.academicYearId })
      .from(semester)
      .where(eq(semester.id, b.semesterId));
    if (!s || s.yearId !== yearId) throw invalidRef('Semester tidak ditemukan pada tahun ajaran ini.');
  }
  if (b.classId) {
    const [c] = await tx
      .select({ yearId: classRoom.academicYearId })
      .from(classRoom)
      .where(eq(classRoom.id, b.classId));
    if (!c || c.yearId !== yearId) throw invalidRef('Kelas tidak ditemukan pada tahun ajaran ini.');
  }
  const teacherIds = [...new Set((b.attendees ?? []).flatMap((a) => (a.teacherId ? [a.teacherId] : [])))];
  const names = new Map<string, string>();
  if (teacherIds.length > 0) {
    const rows = await tx
      .select({ id: teacher.id, name: teacher.name })
      .from(teacher)
      .where(inArray(teacher.id, teacherIds));
    for (const r of rows) names.set(r.id, r.name);
    if (names.size !== teacherIds.length) throw invalidRef('Ada guru peserta yang tidak ditemukan.');
  }
  return names;
}

/** Peserta siap simpan: nama bebas atau dari guru; urutan mengikuti masukan. */
function attendeeRows(
  schoolId: string,
  meetingId: string,
  list: z.infer<typeof attendeeInput>[],
  teacherNames: Map<string, string>,
) {
  return list.map((a, i) => {
    const name = a.name || (a.teacherId ? teacherNames.get(a.teacherId) : undefined) || '';
    if (!name) throw new HttpError(400, 'invalid_reference', 'Setiap peserta perlu nama atau guru.');
    return {
      schoolId,
      meetingId,
      teacherId: a.teacherId ?? null,
      name,
      positionTitle: a.positionTitle ?? null,
      role: a.role,
      sort: i,
    };
  });
}

async function toViews(tx: Tx, rows: MeetingRow[]) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const classIds = [...new Set(rows.flatMap((r) => (r.classId ? [r.classId] : [])))];
  const classNames = new Map(
    (classIds.length
      ? await tx
          .select({ id: classRoom.id, name: classRoom.name })
          .from(classRoom)
          .where(inArray(classRoom.id, classIds))
      : []
    ).map((c) => [c.id, c.name]),
  );
  const linked = new Map(
    (
      await tx
        .select({ id: promotionDecision.meetingId, n: sql<number>`count(*)::int` })
        .from(promotionDecision)
        .where(inArray(promotionDecision.meetingId, ids))
        .groupBy(promotionDecision.meetingId)
    ).map((r) => [r.id, r.n]),
  );
  const attendees = new Map(
    (
      await tx
        .select({ id: councilMeetingAttendee.meetingId, n: sql<number>`count(*)::int` })
        .from(councilMeetingAttendee)
        .where(inArray(councilMeetingAttendee.meetingId, ids))
        .groupBy(councilMeetingAttendee.meetingId)
    ).map((r) => [r.id, r.n]),
  );
  return rows.map((r) => ({
    id: r.id,
    academicYearId: r.academicYearId,
    semesterId: r.semesterId,
    classId: r.classId,
    className: r.classId ? (classNames.get(r.classId) ?? null) : null,
    kind: r.kind,
    title: r.title,
    heldOn: r.heldOn,
    location: r.location,
    chairName: r.chairName,
    secretaryName: r.secretaryName,
    agenda: r.agenda,
    summary: r.summary,
    status: r.status,
    finalizedAt: r.finalizedAt ? r.finalizedAt.toISOString() : null,
    linkedCount: linked.get(r.id) ?? 0,
    attendeeCount: attendees.get(r.id) ?? 0,
  }));
}

async function detail(tx: Tx, id: string) {
  const row = await loadMeeting(tx, id);
  const [view] = await toViews(tx, [row]);
  const attendees = await tx
    .select()
    .from(councilMeetingAttendee)
    .where(eq(councilMeetingAttendee.meetingId, id))
    .orderBy(asc(councilMeetingAttendee.sort));
  const rows = await loadDecisionRows(tx, { yearId: row.academicYearId, meetingId: id });
  const frozenDigest =
    row.status === 'final' && row.minutes ? (row.minutes as { digest?: DecisionDigest }).digest : undefined;
  return {
    ...(view as NonNullable<typeof view>),
    attendees: attendees.map((a) => ({
      teacherId: a.teacherId,
      name: a.name,
      positionTitle: a.positionTitle,
      role: a.role,
    })),
    digest: frozenDigest ?? buildDigest(rows),
    frozen: !!frozenDigest,
    linked: rows.map((r) => ({
      studentId: r.studentId,
      name: r.studentName,
      className: r.className,
      decision: r.decision,
      applied: r.applied,
    })),
  };
}

export async function councilMeetingRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(
    request: { ctx?: TenantContext; server: FastifyInstance },
    fn: Parameters<typeof withTenant<T>>[2],
  ) => {
    const ctx = request.ctx as TenantContext;
    return withTenant(request.server.tenantDb, [ctx.schoolId], fn);
  };

  app.get(
    '/v1/council-meetings',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar berita acara musyawarah dewan pendidik',
        description:
          'Izin: `report_card:read_all`. Filter opsional `academicYearId`, `kind` (`promotion`, `graduation`, `other`), `status` ' +
          '(`draft`, `final`). Terbaru lebih dulu menurut tanggal rapat.',
        headers: schoolHeader,
        querystring: z.object({
          academicYearId: z.uuid().optional(),
          kind: z.enum(COUNCIL_MEETING_KINDS).optional(),
          status: z.enum(COUNCIL_MEETING_STATUSES).optional(),
        }),
        response: { 200: z.object({ items: z.array(meetingView) }), ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const q = request.query;
        const conds = [
          q.academicYearId ? eq(councilMeeting.academicYearId, q.academicYearId) : undefined,
          q.kind ? eq(councilMeeting.kind, q.kind) : undefined,
          q.status ? eq(councilMeeting.status, q.status) : undefined,
        ].filter((c) => c !== undefined);
        const rows = await tx
          .select()
          .from(councilMeeting)
          .where(conds.length ? and(...conds) : undefined)
          .orderBy(desc(councilMeeting.heldOn), desc(councilMeeting.createdAt));
        return { items: await toViews(tx, rows) };
      }),
  );

  app.get(
    '/v1/council-meetings/:id',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Detail berita acara beserta peserta dan rekap keputusan',
        description:
          'Izin: `report_card:read_all`. Peserta, rekap keputusan tertaut (`digest`: jumlah naik/tinggal/lulus total dan per kelas, daftar ' +
          'tinggal kelas dengan alasan dan tindak lanjut) dan daftar murid tertaut. Berita acara final membaca rekap beku dari saat ' +
          'finalisasi (`frozen` true); selain itu rekap dihitung dari keputusan tersimpan.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: detailView, 404: errorSchema, ...guarded },
      },
    },
    async (request) => tenant(request, (tx) => detail(tx, request.params.id)),
  );

  app.post(
    '/v1/council-meetings',
    {
      onRequest: writeGate,
      schema: {
        tags: tag,
        summary: 'Buat berita acara musyawarah dewan pendidik',
        description:
          'Izin: `promotion:manage`. Membuat berita acara berstatus draf untuk satu tahun ajaran (`academicYearId`), dengan peserta ' +
          '(guru atau nama bebas, peran `chair`/`secretary`/`member`, jabatan). Keputusan kenaikan ditautkan lewat ' +
          '`PUT /v1/academic-years/{id}/promotions` (`meetingId`) atau `PUT /v1/council-meetings/{id}/decisions`. ' +
          '400 `invalid_reference`: tahun, semester, kelas, atau guru tidak ditemukan atau tidak sesuai tahun itu.',
        headers: schoolHeader,
        body: z.object({ academicYearId: z.uuid(), ...meetingFields }),
        response: { 201: detailView, 400: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      const view = await tenant(request, async (tx) => {
        const names = await validateRefs(tx, b.academicYearId, b);
        const [row] = await tx
          .insert(councilMeeting)
          .values({
            schoolId: ctx.schoolId,
            academicYearId: b.academicYearId,
            semesterId: b.semesterId ?? null,
            classId: b.classId ?? null,
            kind: b.kind,
            title: b.title,
            heldOn: b.heldOn,
            location: b.location ?? null,
            chairName: b.chairName ?? null,
            secretaryName: b.secretaryName ?? null,
            agenda: b.agenda ?? null,
            summary: b.summary ?? null,
            createdBy: ctx.userId,
          })
          .returning();
        const created = row as MeetingRow;
        if (b.attendees?.length) {
          await tx
            .insert(councilMeetingAttendee)
            .values(attendeeRows(ctx.schoolId, created.id, b.attendees, names));
        }
        await audit(tx, ctx, 'council_meeting.create', 'council_meeting', created.id, {
          kind: b.kind,
          academicYearId: b.academicYearId,
        });
        return detail(tx, created.id);
      });
      return reply.code(201).send(view);
    },
  );

  app.put(
    '/v1/council-meetings/:id',
    {
      onRequest: writeGate,
      schema: {
        tags: tag,
        summary: 'Ubah berita acara (hanya draf)',
        description:
          'Izin: `promotion:manage`. Mengubah isi berita acara draf; `attendees` (bila dikirim) menggantikan seluruh daftar peserta, ' +
          'dihilangkan = peserta tetap. Tahun ajaran tidak bisa dipindah. 409 `meeting_final`: berita acara sudah final, buka ' +
          'kembali lebih dulu. 400 `invalid_reference` seperti pembuatan.',
        headers: schoolHeader,
        params: idParams,
        body: z.object(meetingFields),
        response: { 200: detailView, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      return tenant(request, async (tx) => {
        const row = await loadMeeting(tx, request.params.id);
        if (row.status === 'final') throw meetingFinalError();
        const names = await validateRefs(tx, row.academicYearId, b);
        await tx
          .update(councilMeeting)
          .set({
            semesterId: b.semesterId ?? null,
            classId: b.classId ?? null,
            kind: b.kind,
            title: b.title,
            heldOn: b.heldOn,
            location: b.location ?? null,
            chairName: b.chairName ?? null,
            secretaryName: b.secretaryName ?? null,
            agenda: b.agenda ?? null,
            summary: b.summary ?? null,
            updatedAt: new Date(),
          })
          .where(eq(councilMeeting.id, row.id));
        if (b.attendees) {
          await tx.delete(councilMeetingAttendee).where(eq(councilMeetingAttendee.meetingId, row.id));
          if (b.attendees.length > 0) {
            await tx
              .insert(councilMeetingAttendee)
              .values(attendeeRows(ctx.schoolId, row.id, b.attendees, names));
          }
        }
        // Tanggal rapat per murid mengikuti tanggal berita acara (konsistensi): keputusan tertaut ikut diperbarui.
        if (b.heldOn !== row.heldOn) {
          await tx
            .update(promotionDecision)
            .set({ meetingDate: b.heldOn })
            .where(eq(promotionDecision.meetingId, row.id));
        }
        await audit(tx, ctx, 'council_meeting.update', 'council_meeting', row.id, {});
        return detail(tx, row.id);
      });
    },
  );

  app.delete(
    '/v1/council-meetings/:id',
    {
      onRequest: writeGate,
      schema: {
        tags: tag,
        summary: 'Hapus berita acara (hanya draf)',
        description:
          'Izin: `promotion:manage`. Menghapus berita acara draf beserta pesertanya; keputusan kenaikan yang tertaut dilepas ' +
          '(keputusannya sendiri tidak berubah). 409 `meeting_final`: berita acara final tidak bisa dihapus; buka kembali lebih dulu.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      await tenant(request, async (tx) => {
        const row = await loadMeeting(tx, request.params.id);
        if (row.status === 'final') throw meetingFinalError();
        await tx
          .update(promotionDecision)
          .set({ meetingId: null })
          .where(eq(promotionDecision.meetingId, row.id));
        await tx.delete(councilMeeting).where(eq(councilMeeting.id, row.id));
        await audit(tx, ctx, 'council_meeting.delete', 'council_meeting', row.id, { title: row.title });
      });
      return { ok: true as const };
    },
  );

  app.post(
    '/v1/council-meetings/:id/finalize',
    {
      onRequest: writeGate,
      schema: {
        tags: tag,
        summary: 'Finalkan berita acara',
        description:
          'Izin: `promotion:manage`. Membekukan rekap keputusan yang tertaut (`minutes`) dan mengunci berita acara; keputusan kenaikan ' +
          'yang tertaut tidak bisa diubah sampai dibuka kembali (409 `meeting_final`). 409 `meeting_final` bila sudah final.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: detailView, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const row = await loadMeeting(tx, request.params.id);
        if (row.status === 'final') throw meetingFinalError();
        // Kunci baris berita acara supaya penautan bersamaan tidak lolos di antara pembacaan rekap dan penyimpanan.
        await tx.execute(sql`select 1 from council_meeting where id = ${row.id} for update`);
        const rows = await loadDecisionRows(tx, { yearId: row.academicYearId, meetingId: row.id });
        const digest = buildDigest(rows);
        await tx
          .update(councilMeeting)
          .set({
            status: 'final',
            minutes: { version: 1, capturedAt: new Date().toISOString(), digest },
            finalizedAt: new Date(),
            finalizedBy: ctx.userId,
            updatedAt: new Date(),
          })
          .where(eq(councilMeeting.id, row.id));
        await audit(tx, ctx, 'council_meeting.finalize', 'council_meeting', row.id, {
          linked: digest.totals.total,
          retain: digest.totals.retain,
        });
        return detail(tx, row.id);
      });
    },
  );

  app.post(
    '/v1/council-meetings/:id/reopen',
    {
      onRequest: writeGate,
      schema: {
        tags: tag,
        summary: 'Buka kembali berita acara final',
        description:
          'Izin: `promotion:manage`. Mengembalikan berita acara final menjadi draf dan membuang rekap beku (rekap dihitung ulang dari ' +
          'keputusan tersimpan); keputusan tertaut dapat diubah lagi. 409 `meeting_not_final` bila masih draf.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: detailView, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const row = await loadMeeting(tx, request.params.id);
        if (row.status !== 'final') {
          throw new HttpError(409, 'meeting_not_final', 'Berita acara ini belum final.');
        }
        await tx
          .update(councilMeeting)
          .set({
            status: 'draft',
            minutes: null,
            finalizedAt: null,
            finalizedBy: null,
            updatedAt: new Date(),
          })
          .where(eq(councilMeeting.id, row.id));
        await audit(tx, ctx, 'council_meeting.reopen', 'council_meeting', row.id, {});
        return detail(tx, row.id);
      });
    },
  );

  app.put(
    '/v1/council-meetings/:id/decisions',
    {
      onRequest: writeGate,
      schema: {
        tags: tag,
        summary: 'Tautkan keputusan kenaikan murid ke berita acara',
        description:
          'Izin: `promotion:manage`. Menetapkan daftar murid yang keputusan kenaikannya (tahun ajaran berita acara) dibahas di berita ' +
          'acara ini: yang disebut ditautkan (tanggal rapat murid mengikuti tanggal berita acara), yang sebelumnya tertaut tetapi tidak ' +
          'disebut dilepas. Keputusan sendiri tidak berubah, jadi keputusan yang sudah diterapkan pun boleh ditautkan. ' +
          '409 `meeting_final`: berita acara ini final, atau ada keputusan yang masih tertaut ke berita acara final lain. ' +
          '400 `invalid_reference`: murid tanpa keputusan di tahun itu.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({ studentIds: z.array(z.uuid()).max(2000) }),
        response: {
          200: z.object({ linked: z.number().int(), unlinked: z.number().int() }),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const wanted = [...new Set(request.body.studentIds)];
      return tenant(request, async (tx) => {
        const row = await loadMeeting(tx, request.params.id);
        if (row.status === 'final') throw meetingFinalError();
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`promotion:${row.academicYearId}`}))`);
        const decisions = await tx
          .select({
            id: promotionDecision.id,
            studentId: promotionDecision.studentId,
            meetingId: promotionDecision.meetingId,
          })
          .from(promotionDecision)
          .where(
            and(
              eq(promotionDecision.academicYearId, row.academicYearId),
              wanted.length > 0 ? inArray(promotionDecision.studentId, wanted) : sql`false`,
            ),
          );
        if (decisions.length !== wanted.length) {
          throw invalidRef(
            'Ada murid yang belum punya keputusan kenaikan pada tahun ajaran berita acara ini.',
          );
        }
        const otherMeetings = [
          ...new Set(decisions.flatMap((d) => (d.meetingId && d.meetingId !== row.id ? [d.meetingId] : []))),
        ];
        for (const other of otherMeetings) await assertMeetingNotFinal(tx, other);
        const stale = await tx
          .update(promotionDecision)
          .set({ meetingId: null })
          .where(
            and(
              eq(promotionDecision.meetingId, row.id),
              wanted.length > 0
                ? sql`${promotionDecision.studentId} not in (${sql.join(
                    wanted.map((w) => sql`${w}`),
                    sql`, `,
                  )})`
                : undefined,
            ),
          )
          .returning({ id: promotionDecision.id });
        if (decisions.length > 0) {
          await tx
            .update(promotionDecision)
            .set({ meetingId: row.id, meetingDate: row.heldOn })
            .where(
              inArray(
                promotionDecision.id,
                decisions.map((d) => d.id),
              ),
            );
        }
        await audit(tx, ctx, 'council_meeting.link_decisions', 'council_meeting', row.id, {
          linked: decisions.length,
          unlinked: stale.length,
        });
        return { linked: decisions.length, unlinked: stale.length };
      });
    },
  );

  app.get(
    '/v1/academic-years/:id/promotions/summary',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Laporan ringkas keputusan kenaikan satu tahun ajaran',
        description:
          'Izin: `report_card:read_all`. Rekap keputusan kenaikan tersimpan: jumlah naik, tinggal, dan lulus (total dan per kelas asal) ' +
          'serta daftar murid tinggal kelas dengan alasan dan tindak lanjut, untuk berita acara. Filter opsional `classId` (kelas asal) ' +
          'dan `meetingId` (hanya keputusan yang tertaut ke berita acara itu). Murid terhapus tidak dihitung.',
        headers: schoolHeader,
        params: idParams,
        querystring: z.object({ classId: z.uuid().optional(), meetingId: z.uuid().optional() }),
        response: {
          200: z.object({
            academicYear: z.object({ id: z.uuid(), name: z.string() }),
            digest: digestSchema,
            undecided: z.number().int().describe('Murid aktif tahun itu yang belum punya keputusan'),
          }),
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const [year] = await tx
          .select({ id: academicYear.id, name: academicYear.name })
          .from(academicYear)
          .where(eq(academicYear.id, request.params.id));
        if (!year) throw new HttpError(404, 'not_found', 'Tahun ajaran tidak ditemukan.');
        const rows = await loadDecisionRows(tx, {
          yearId: year.id,
          classId: request.query.classId,
          meetingId: request.query.meetingId,
        });
        const undecidedRows = await tx.execute<{ n: number }>(sql`
          select count(*)::int as n
          from enrollment e
          join student s on s.id = e.student_id and s.deleted_at is null and s.status = 'active'
          where e.academic_year_id = ${year.id}
            ${request.query.classId ? sql`and e.class_id = ${request.query.classId}` : sql``}
            and not exists (
              select 1 from promotion_decision d where d.academic_year_id = e.academic_year_id and d.student_id = e.student_id
            )`);
        const first = undecidedRows.rows[0];
        return { academicYear: year, digest: buildDigest(rows), undecided: first?.n ?? 0 };
      }),
  );
}
