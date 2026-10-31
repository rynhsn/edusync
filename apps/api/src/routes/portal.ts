import { createHash, randomBytes } from 'node:crypto';
import {
  and,
  asc,
  desc,
  eq,
  guardian,
  inArray,
  isNull,
  member,
  memberRole,
  portalInvite,
  portalLink,
  role,
  school,
  student,
  studentGuardian,
  type Tx,
  user,
  withTenant,
} from '@edusync/db';
import { enqueue, QUEUES } from '@edusync/jobs';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { todayInJakarta } from '../attendance-lib';
import type { Env } from '../env';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { schoolOrigin } from '../origins';
import {
  ATTENDANCE_DAYS,
  addDays,
  allowedStudentIds,
  attendanceFor,
  type ChildProfile,
  childProfiles,
  EMPTY_COUNTS,
  finalReportCards,
  finalReportDocument,
  gradesFor,
  invoicesFor,
  loadLink,
  notFoundChild,
  portalAnnouncements,
  receiptsFor,
  recentScoresFor,
  resolveAttendanceRange,
  resolveSemester,
  type SectionFlags,
  sectionFlags,
  semestersWithYear,
  tahfidzFor,
} from '../portal-lib';
import { audit, guarded, idParams, ok, schoolHeader } from './helpers';

const MODULE = 'parent_portal';
const INVITE_DAYS = 14;
const tagAdmin = ['Portal (admin)'];
const tagPortal = ['Portal'];

/** Admin portal memakai `student:manage` (operator sudah memilikinya); tanpa modul `parent_portal` ditolak. */
const manageGate = [requirePermission('student:manage'), requireModule(MODULE)];
/** Pembaca portal: `portal:read` (peran wali/siswa) dan modul `parent_portal` aktif. */
const readGate = [requirePermission('portal:read'), requireModule(MODULE)];

export const hashPortalToken = (token: string) => createHash('sha256').update(token).digest('hex');

const iso = z.iso.datetime({ offset: true });
const kindEnum = z.enum(['guardian', 'student']);
const dateField = z.iso.date();
const predicateEnum = z.enum(['A', 'B', 'C', 'D']);
const ATTENDANCE_STATUS = z.enum(['present', 'late', 'excused', 'sick', 'absent']);
const INVOICE_STATUS = z.enum(['unpaid', 'partial', 'paid', 'void']);

/* ---------- Skema admin ---------- */

const inviteSchema = z.object({
  id: z.uuid(),
  kind: kindEnum,
  targetId: z.uuid().describe('Id wali (kind guardian) atau siswa (kind student)'),
  targetName: z.string(),
  email: z.string().nullable(),
  expiresAt: iso,
  expired: z.boolean(),
  createdAt: iso,
});

const createdInviteSchema = inviteSchema.extend({
  token: z.string().describe('Token mentah; hanya ditampilkan sekali saat undangan dibuat'),
  link: z.string().describe('Tautan penerimaan undangan di subdomain sekolah'),
});

const accountSchema = z.object({
  id: z.uuid().describe('Id tautan portal'),
  memberId: z.uuid(),
  kind: kindEnum,
  targetId: z.uuid(),
  targetName: z.string(),
  userName: z.string(),
  userEmail: z.string(),
  status: z.enum(['active', 'disabled']),
  createdAt: iso,
});

const createInviteBody = z
  .object({
    kind: kindEnum,
    guardianId: z.uuid().optional(),
    studentId: z.uuid().optional(),
    email: z
      .union([z.literal(''), z.email().max(254)])
      .nullish()
      .transform((v) => (v ? v.toLowerCase() : null)),
  })
  .refine((b) => (b.kind === 'guardian' ? !!b.guardianId && !b.studentId : !!b.studentId && !b.guardianId), {
    message: 'Wali butuh guardianId saja; siswa butuh studentId saja.',
  });

/* ---------- Skema baca ---------- */

const childSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  nis: z.string().nullable(),
  nisn: z.string().nullable(),
  gender: z.enum(['L', 'P']),
  status: z.enum(['active', 'graduated', 'transferred', 'dropped']),
  className: z.string().nullable(),
  level: z.string().nullable(),
  academicYear: z.string().nullable(),
});

const sectionsSchema = z
  .object({
    attendance: z.boolean(),
    grades: z.boolean(),
    finance: z.boolean(),
    tahfidz: z.boolean(),
    announcements: z.boolean(),
  })
  .describe('Modul sekolah yang aktif untuk tiap bagian portal; bagian nonaktif dikembalikan kosong');

const countsSchema = z.object({
  present: z.number().int(),
  late: z.number().int(),
  excused: z.number().int(),
  sick: z.number().int(),
  absent: z.number().int(),
});

const attendanceDaySchema = z.object({
  date: dateField,
  status: ATTENDANCE_STATUS,
  checkInAt: iso.nullable(),
  checkOutAt: iso.nullable(),
});

const invoiceSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  feeTypeName: z.string(),
  period: z.string().nullable(),
  amount: z.number().int(),
  discount: z.number().int(),
  discountReason: z.string().nullable(),
  paid: z.number().int(),
  outstanding: z.number().int(),
  dueDate: dateField,
  status: INVOICE_STATUS,
  overdue: z.boolean(),
});

const receiptSchema = z.object({
  id: z.uuid(),
  receiptNo: z.string(),
  paidAt: iso,
  method: z.string().describe('Kunci metode pembayaran (dinamis per sekolah)'),
  total: z.number().int(),
  items: z.array(z.object({ invoiceId: z.uuid(), title: z.string(), amount: z.number().int() })),
});

const recentScoreSchema = z.object({
  subject: z.string(),
  title: z.string(),
  component: z.string(),
  date: dateField,
  value: z.number(),
  maxScore: z.number().int(),
});

const reportCardItemSchema = z.object({
  semesterId: z.uuid(),
  semesterName: z.string(),
  academicYear: z.string(),
  className: z.string(),
  finalizedAt: iso.nullable(),
  average: z.number().nullable(),
  subjectsGraded: z.number().int(),
  subjectsTotal: z.number().int(),
});

const reportDocumentSchema = z.object({
  status: z.enum(['draft', 'final']),
  school: z.object({ name: z.string(), address: z.string().nullable(), city: z.string().nullable() }),
  semester: z.object({ id: z.uuid(), name: z.string(), academicYear: z.string() }),
  student: z.object({
    id: z.uuid(),
    name: z.string(),
    nis: z.string().nullable(),
    nisn: z.string().nullable(),
    className: z.string(),
    level: z.string(),
  }),
  subjects: z.array(
    z.object({
      subjectId: z.uuid(),
      name: z.string(),
      kkm: z.number().int(),
      final: z.number().nullable(),
      predicate: predicateEnum.nullable(),
      description: z.string().nullable(),
      belowKkm: z.boolean(),
    }),
  ),
  extracurriculars: z.array(
    z.object({ name: z.string(), predicate: predicateEnum.nullable(), note: z.string().nullable() }),
  ),
  attendance: z.object({
    sick: z.number().int(),
    excused: z.number().int(),
    absent: z.number().int(),
    late: z.number().int(),
  }),
  homeroomNote: z.string().nullable(),
  homeroomTeacher: z.object({ name: z.string(), nip: z.string().nullable() }).nullable(),
  principal: z.object({ name: z.string(), nip: z.string().nullable() }).nullable(),
  rank: z.object({ position: z.number().int(), of: z.number().int() }).nullable(),
  generatedAt: z.string(),
});

const announcementSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  category: z.enum(['news', 'agenda', 'notice']),
  eventDate: dateField.nullable(),
  pinned: z.boolean(),
  publishedAt: iso.nullable(),
  excerpt: z.string(),
});

const targetPair = z.object({ ziyadahAyahs: z.number().int(), murajaahAyahs: z.number().int() });

const studentParams = z.object({ studentId: z.uuid() });
const unavailable = z.boolean().describe('false bila modul sekolah untuk bagian ini tidak aktif');

const notFound = (what: string) => new HttpError(404, 'not_found', `${what} tidak ditemukan.`);
const invalidRef = (message: string) => new HttpError(400, 'invalid_reference', message);

/** Portal wali dan siswa: undangan dan akun (admin), serta data anak untuk akun portal. Modul `parent_portal`. */
export async function portalRoutes(instance: FastifyInstance, options: { env: Env }) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const scheme = new URL(options.env.AUTH_URL).protocol as 'http:' | 'https:';
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  /* ---------- Admin: undangan ---------- */

  /** Nama wali/siswa tujuan untuk sekumpulan undangan atau tautan. */
  async function targetNames(tx: Tx, rows: { guardianId: string | null; studentId: string | null }[]) {
    const gIds = [...new Set(rows.flatMap((r) => (r.guardianId ? [r.guardianId] : [])))];
    const sIds = [...new Set(rows.flatMap((r) => (r.studentId ? [r.studentId] : [])))];
    const g = gIds.length
      ? await tx
          .select({ id: guardian.id, name: guardian.name })
          .from(guardian)
          .where(inArray(guardian.id, gIds))
      : [];
    const s = sIds.length
      ? await tx.select({ id: student.id, name: student.name }).from(student).where(inArray(student.id, sIds))
      : [];
    return new Map([...g, ...s].map((x) => [x.id, x.name]));
  }

  app.get(
    '/v1/portal/invites',
    {
      onRequest: manageGate,
      schema: {
        tags: tagAdmin,
        summary: 'Undangan portal yang belum dipakai',
        description:
          'Izin: `student:manage`; modul `parent_portal`. Undangan yang sudah dipakai atau dicabut tidak tampil; ' +
          'yang kedaluwarsa tetap tampil dengan `expired` true agar bisa dibuat ulang. Token tidak pernah ditampilkan lagi.',
        headers: schoolHeader,
        response: { 200: z.array(inviteSchema), ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const rows = await tx
          .select()
          .from(portalInvite)
          .where(isNull(portalInvite.usedAt))
          .orderBy(desc(portalInvite.createdAt));
        const names = await targetNames(tx, rows);
        const now = new Date();
        return rows.map((r) => {
          const targetId = (r.kind === 'guardian' ? r.guardianId : r.studentId) as string;
          return {
            id: r.id,
            kind: r.kind,
            targetId,
            targetName: names.get(targetId) ?? '',
            email: r.email,
            expiresAt: r.expiresAt.toISOString(),
            expired: r.expiresAt <= now,
            createdAt: r.createdAt.toISOString(),
          };
        });
      }),
  );

  app.post(
    '/v1/portal/invites',
    {
      onRequest: manageGate,
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        tags: tagAdmin,
        summary: 'Buat undangan portal untuk wali atau siswa',
        description:
          `Izin: \`student:manage\`; modul \`parent_portal\`. Membuat undangan sekali pakai yang berlaku ${INVITE_DAYS} hari ` +
          'untuk satu wali (`kind` guardian + `guardianId`, wali harus punya minimal satu siswa) atau satu siswa ' +
          '(`kind` student + `studentId`). Token acak dikembalikan sekali di `token` dan `link` (hanya hash yang ' +
          'disimpan); bila `email` diisi, tautan juga dikirim ke email itu dan akun yang dibuat wajib memakai email itu. ' +
          'Undangan lama yang belum dipakai untuk target yang sama dicabut otomatis. 400 `invalid_reference` bila ' +
          'wali/siswa tidak ada; 409 `already_linked` bila target sudah punya akun portal.',
        headers: schoolHeader,
        body: createInviteBody,
        response: { 201: createdInviteSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const body = request.body;
      const targetId = (body.kind === 'guardian' ? body.guardianId : body.studentId) as string;
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
      const [sch] = await request.server.platformDb
        .select({ slug: school.slug, name: school.name })
        .from(school)
        .where(eq(school.id, ctx.schoolId));
      const link = `${schoolOrigin(scheme, options.env.APP_DOMAIN, sch?.slug ?? '')}/portal/invite/${token}`;

      const created = await tenant(request, async (tx) => {
        let targetName: string;
        if (body.kind === 'guardian') {
          const [g] = await tx
            .select({ id: guardian.id, name: guardian.name })
            .from(guardian)
            .where(eq(guardian.id, targetId));
          if (!g) throw invalidRef('Wali tidak ditemukan.');
          const kids = await tx
            .select({ id: student.id })
            .from(studentGuardian)
            .innerJoin(student, eq(student.id, studentGuardian.studentId))
            .where(and(eq(studentGuardian.guardianId, targetId), isNull(student.deletedAt)))
            .limit(1);
          if (kids.length === 0) throw invalidRef('Wali ini belum terhubung dengan siswa mana pun.');
          targetName = g.name;
        } else {
          const [s] = await tx
            .select({ id: student.id, name: student.name })
            .from(student)
            .where(and(eq(student.id, targetId), isNull(student.deletedAt)));
          if (!s) throw invalidRef('Siswa tidak ditemukan.');
          targetName = s.name;
        }
        const [linked] = await tx
          .select({ id: portalLink.id })
          .from(portalLink)
          .where(
            body.kind === 'guardian'
              ? eq(portalLink.guardianId, targetId)
              : eq(portalLink.studentId, targetId),
          )
          .limit(1);
        if (linked) {
          throw new HttpError(
            409,
            'already_linked',
            'Target ini sudah punya akun portal. Cabut akunnya dulu.',
          );
        }
        await tx
          .delete(portalInvite)
          .where(
            and(
              eq(portalInvite.kind, body.kind),
              body.kind === 'guardian'
                ? eq(portalInvite.guardianId, targetId)
                : eq(portalInvite.studentId, targetId),
              isNull(portalInvite.usedAt),
            ),
          );
        const [row] = await tx
          .insert(portalInvite)
          .values({
            schoolId: ctx.schoolId,
            kind: body.kind,
            guardianId: body.kind === 'guardian' ? targetId : null,
            studentId: body.kind === 'student' ? targetId : null,
            tokenHash: hashPortalToken(token),
            email: body.email,
            expiresAt,
            createdBy: ctx.userId,
          })
          .returning();
        await audit(tx, ctx, 'portal.invite.create', 'portal_invite', row!.id, {
          kind: body.kind,
          targetId,
          email: body.email,
        });
        if (body.email) {
          await enqueue(
            tx,
            QUEUES.emailSend,
            {
              to: body.email,
              subject: `Undangan portal ${sch?.name ?? 'sekolah'}`,
              text:
                `Halo,\n\n${sch?.name ?? 'Sekolah'} mengundang Anda membuat akun portal untuk ${targetName}.\n\n` +
                `Buat akun (berlaku ${INVITE_DAYS} hari):\n${link}\n\n` +
                'Bila Anda tidak merasa diundang, abaikan email ini.',
            },
            { schoolId: ctx.schoolId },
          );
        }
        return { row: row!, targetName };
      });
      return reply.code(201).send({
        id: created.row.id,
        kind: created.row.kind,
        targetId,
        targetName: created.targetName,
        email: created.row.email,
        expiresAt: created.row.expiresAt.toISOString(),
        expired: false,
        createdAt: created.row.createdAt.toISOString(),
        token,
        link,
      });
    },
  );

  app.delete(
    '/v1/portal/invites/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tagAdmin,
        summary: 'Cabut undangan portal',
        description:
          'Izin: `student:manage`; modul `parent_portal`. Hanya undangan yang belum dipakai; tautan langsung tidak ' +
          'berlaku. Akun yang sudah dibuat dicabut lewat `DELETE /v1/portal/accounts/{id}`. 404 bila tidak ada atau sudah dipakai.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      await tenant(request, async (tx) => {
        const rows = await tx
          .delete(portalInvite)
          .where(and(eq(portalInvite.id, request.params.id), isNull(portalInvite.usedAt)))
          .returning({ id: portalInvite.id, kind: portalInvite.kind });
        if (rows.length === 0) throw notFound('Undangan');
        await audit(tx, ctx, 'portal.invite.revoke', 'portal_invite', request.params.id, {
          kind: rows[0]!.kind,
        });
      });
      return { ok: true as const };
    },
  );

  /* ---------- Admin: akun ---------- */

  app.get(
    '/v1/portal/accounts',
    {
      onRequest: manageGate,
      schema: {
        tags: tagAdmin,
        summary: 'Akun portal wali dan siswa',
        description:
          'Izin: `student:manage`; modul `parent_portal`. Akun yang sudah menerima undangan, beserta wali/siswa yang ' +
          'ditautkan dan status keanggotaannya (`disabled` bila dinonaktifkan).',
        headers: schoolHeader,
        response: { 200: z.array(accountSchema), ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const rows = await tx
          .select({
            id: portalLink.id,
            memberId: portalLink.memberId,
            kind: portalLink.kind,
            guardianId: portalLink.guardianId,
            studentId: portalLink.studentId,
            userName: user.name,
            userEmail: user.email,
            status: member.status,
            createdAt: portalLink.createdAt,
          })
          .from(portalLink)
          .innerJoin(member, eq(member.id, portalLink.memberId))
          .innerJoin(user, eq(user.id, member.userId))
          .orderBy(asc(user.name), asc(portalLink.createdAt));
        const names = await targetNames(tx, rows);
        return rows.map((r) => {
          const targetId = (r.kind === 'guardian' ? r.guardianId : r.studentId) as string;
          return {
            id: r.id,
            memberId: r.memberId,
            kind: r.kind,
            targetId,
            targetName: names.get(targetId) ?? '',
            userName: r.userName,
            userEmail: r.userEmail,
            status: r.status,
            createdAt: r.createdAt.toISOString(),
          };
        });
      }),
  );

  app.delete(
    '/v1/portal/accounts/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tagAdmin,
        summary: 'Cabut akun portal',
        description:
          'Izin: `student:manage`; modul `parent_portal`. Menghapus tautan portal dan peran wali/siswa dari anggota itu; ' +
          'bila tidak ada peran lain, keanggotaannya dinonaktifkan sehingga tidak bisa masuk lagi. Akun masuk (user) ' +
          'tidak dihapus. Wali/siswa bisa diundang ulang setelahnya. 404 bila tautan tidak ada.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      await tenant(request, async (tx) => {
        const [link] = await tx.select().from(portalLink).where(eq(portalLink.id, request.params.id));
        if (!link) throw notFound('Akun portal');
        await tx.delete(portalLink).where(eq(portalLink.id, link.id));
        const portalRoles = await tx
          .select({ id: role.id })
          .from(role)
          .where(inArray(role.key, ['guardian', 'student']));
        if (portalRoles.length > 0) {
          await tx.delete(memberRole).where(
            and(
              eq(memberRole.memberId, link.memberId),
              inArray(
                memberRole.roleId,
                portalRoles.map((r) => r.id),
              ),
            ),
          );
        }
        const remaining = await tx
          .select({ roleId: memberRole.roleId })
          .from(memberRole)
          .where(eq(memberRole.memberId, link.memberId))
          .limit(1);
        if (remaining.length === 0) {
          await tx.update(member).set({ status: 'disabled' }).where(eq(member.id, link.memberId));
        }
        await audit(tx, ctx, 'portal.account.revoke', 'portal_link', link.id, {
          kind: link.kind,
          memberId: link.memberId,
          disabled: remaining.length === 0,
        });
      });
      return { ok: true as const };
    },
  );

  /* ---------- Portal: pembantu ---------- */

  /**
   * Jalankan `fn` untuk satu anak yang boleh dilihat akun pemanggil. Akun tanpa tautan portal dan anak yang bukan
   * miliknya (atau tidak ada, atau lintas sekolah) dijawab 404 yang sama agar keberadaan data tidak bocor.
   */
  async function forChild<T>(
    request: { ctx?: TenantContext; server: FastifyInstance },
    studentId: string,
    fn: (tx: Tx, child: ChildProfile, flags: SectionFlags) => Promise<T>,
  ) {
    const ctx = request.ctx as TenantContext;
    return tenant(request, async (tx) => {
      const link = await loadLink(tx, ctx);
      if (!link) throw notFoundChild();
      const allowed = await allowedStudentIds(tx, link);
      if (!allowed.includes(studentId)) throw notFoundChild();
      const [child] = await childProfiles(tx, [studentId]);
      if (!child) throw notFoundChild();
      return fn(tx, child, await sectionFlags(tx));
    });
  }

  /* ---------- Portal: profil ---------- */

  app.get(
    '/v1/portal/me',
    {
      onRequest: readGate,
      schema: {
        tags: tagPortal,
        summary: 'Profil akun portal dan daftar anak',
        description:
          'Izin: `portal:read`; modul `parent_portal`. Untuk wali: anak yang terhubung lewat data wali. Untuk siswa: ' +
          'dirinya saja. Akun tanpa tautan portal (mis. admin) mendapat `linked` false dan daftar kosong. `sections` ' +
          'menandai bagian portal yang modulnya aktif.',
        headers: schoolHeader,
        response: {
          200: z.object({
            linked: z.boolean(),
            kind: kindEnum.nullable(),
            user: z.object({ name: z.string(), email: z.string() }),
            school: z.object({ id: z.uuid(), name: z.string() }),
            guardian: z
              .object({
                id: z.uuid(),
                name: z.string(),
                phone: z.string().nullable(),
                email: z.string().nullable(),
              })
              .nullable(),
            sections: sectionsSchema,
            children: z.array(childSchema.extend({ relation: z.string().nullable() })),
          }),
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const authUser = request.authUser as { name: string; email: string };
      return tenant(request, async (tx) => {
        const [sch] = await tx.select({ id: school.id, name: school.name }).from(school);
        const flags = await sectionFlags(tx);
        const link = await loadLink(tx, ctx);
        const base = {
          user: { name: authUser.name, email: authUser.email },
          school: { id: ctx.schoolId, name: sch?.name ?? '' },
          sections: flags,
        };
        if (!link) return { linked: false, kind: null, guardian: null, children: [], ...base };
        const ids = await allowedStudentIds(tx, link);
        const profiles = await childProfiles(tx, ids);
        let guardianInfo: { id: string; name: string; phone: string | null; email: string | null } | null =
          null;
        const relations = new Map<string, string>();
        if (link.kind === 'guardian' && link.guardianId) {
          const [g] = await tx.select().from(guardian).where(eq(guardian.id, link.guardianId));
          if (g) guardianInfo = { id: g.id, name: g.name, phone: g.phone, email: g.email };
          const rel = await tx
            .select({ studentId: studentGuardian.studentId, relation: studentGuardian.relation })
            .from(studentGuardian)
            .where(eq(studentGuardian.guardianId, link.guardianId));
          for (const r of rel) relations.set(r.studentId, r.relation);
        }
        return {
          linked: true,
          kind: link.kind,
          guardian: guardianInfo,
          children: profiles.map((p) => ({ ...p, relation: relations.get(p.id) ?? null })),
          ...base,
        };
      });
    },
  );

  /* ---------- Portal: ikhtisar ---------- */

  app.get(
    '/v1/portal/children/:studentId/overview',
    {
      onRequest: readGate,
      schema: {
        tags: tagPortal,
        summary: 'Ikhtisar satu anak',
        description:
          'Izin: `portal:read`; modul `parent_portal`. Satu panggilan untuk beranda portal: kelas, absensi gerbang 30 ' +
          'hari terakhir (jumlah per status dan persentase hadir = (hadir + terlambat) dari hari tercatat), tagihan ' +
          'terbuka dan total tunggakan (lewat jatuh tempo), skor terbaru, rapor yang sudah final, ringkasan tahfidz, ' +
          'dan pengumuman terbaru. Tiap bagian punya `available`; bila modul sekolahnya tidak aktif bagian itu kosong ' +
          '(bukan galat). 404 `not_found` bila anak bukan milik akun ini, tidak ada, atau akun bukan akun portal.',
        headers: schoolHeader,
        params: studentParams,
        response: {
          200: z.object({
            child: childSchema,
            sections: sectionsSchema,
            attendance: z.object({
              available: unavailable,
              from: dateField,
              to: dateField,
              counts: countsSchema,
              recorded: z.number().int(),
              percent: z.number().int().nullable(),
              recentDays: z.array(attendanceDaySchema),
            }),
            invoices: z.object({
              available: unavailable,
              openCount: z.number().int(),
              outstandingTotal: z.number().int(),
              overdueTotal: z.number().int(),
              upcoming: z.array(invoiceSchema),
            }),
            grades: z.object({
              available: unavailable,
              recentScores: z.array(recentScoreSchema),
            }),
            reportCards: z.object({ available: unavailable, items: z.array(reportCardItemSchema) }),
            tahfidz: z.object({
              available: unavailable,
              halaqah: z.string().nullable(),
              ayahs: z.number().int(),
              percent: z.number(),
              juzComplete: z.number().int(),
              streakDays: z.number().int(),
              lastEntryDate: dateField.nullable(),
              percentOfTarget: z.number().nullable(),
            }),
            announcements: z.object({ available: unavailable, items: z.array(announcementSchema) }),
          }),
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const { studentId } = request.params;
      const today = todayInJakarta();
      return forChild(request, studentId, async (tx, child, flags) => {
        const range = { from: addDays(today, -(ATTENDANCE_DAYS - 1)), to: today };
        const att = flags.attendance ? await attendanceFor(tx, studentId, range.from, range.to) : null;
        const inv = flags.finance ? await invoicesFor(tx, studentId) : null;
        const scores = flags.grades ? await recentScoresFor(tx, studentId, 5) : [];
        const cards = flags.grades ? await finalReportCards(tx, studentId) : [];
        const tah = flags.tahfidz ? await tahfidzFor(tx, studentId, today) : null;
        const news = flags.announcements ? await portalAnnouncements(tx, 5) : [];
        return {
          child,
          sections: flags,
          attendance: {
            available: flags.attendance,
            ...range,
            counts: att?.counts ?? { ...EMPTY_COUNTS },
            recorded: att?.recorded ?? 0,
            percent: att?.percent ?? null,
            recentDays: att ? att.days.slice(0, 7) : [],
          },
          invoices: {
            available: flags.finance,
            openCount: inv?.openCount ?? 0,
            outstandingTotal: inv?.outstandingTotal ?? 0,
            overdueTotal: inv?.overdueTotal ?? 0,
            upcoming: inv ? inv.invoices.filter((i) => i.outstanding > 0).slice(0, 5) : [],
          },
          grades: { available: flags.grades, recentScores: scores },
          reportCards: { available: flags.grades, items: cards },
          tahfidz: {
            available: flags.tahfidz,
            halaqah: tah?.halaqah ?? null,
            ayahs: tah?.coverage.ayahs ?? 0,
            percent: tah?.coverage.percent ?? 0,
            juzComplete: tah?.coverage.juzComplete ?? 0,
            streakDays: tah?.streakDays ?? 0,
            lastEntryDate: tah?.lastEntryDate ?? null,
            percentOfTarget: tah?.semester.percentOfTarget ?? null,
          },
          announcements: { available: flags.announcements, items: news },
        };
      });
    },
  );

  /* ---------- Portal: rincian ---------- */

  app.get(
    '/v1/portal/children/:studentId/attendance',
    {
      onRequest: readGate,
      schema: {
        tags: tagPortal,
        summary: 'Absensi gerbang seorang anak',
        description:
          'Izin: `portal:read`; modul `parent_portal`; bagian ini butuh modul `attendance` (bila tidak aktif ' +
          '`available` false dan data kosong). Rentang bawaan: 30 hari terakhir sampai hari ini (maksimal 366 hari, ' +
          '400 `invalid_range`). `percent` = (hadir + terlambat) dari hari tercatat. Hari tanpa catatan tidak tampil.',
        headers: schoolHeader,
        params: studentParams,
        querystring: z.object({ from: dateField.optional(), to: dateField.optional() }),
        response: {
          200: z.object({
            available: unavailable,
            from: dateField,
            to: dateField,
            counts: countsSchema,
            recorded: z.number().int(),
            percent: z.number().int().nullable(),
            days: z.array(attendanceDaySchema),
          }),
          400: errorSchema,
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const range = resolveAttendanceRange(request.query.from, request.query.to);
      return forChild(request, request.params.studentId, async (tx, _child, flags) => {
        if (!flags.attendance) {
          return {
            available: false,
            ...range,
            counts: { ...EMPTY_COUNTS },
            recorded: 0,
            percent: null,
            days: [],
          };
        }
        const att = await attendanceFor(tx, request.params.studentId, range.from, range.to);
        return { available: true, ...att };
      });
    },
  );

  app.get(
    '/v1/portal/children/:studentId/grades',
    {
      onRequest: readGate,
      schema: {
        tags: tagPortal,
        summary: 'Nilai seorang anak',
        description:
          'Izin: `portal:read`; modul `parent_portal`; bagian ini butuh modul `grades` (bila tidak aktif `available` ' +
          'false dan data kosong). Nilai akhir per mapel dihitung dengan rumus yang sama dengan rekap penilaian dan ' +
          'rapor, untuk semester `semesterId` (bawaan: semester aktif, atau yang terbaru). `semesters` memuat pilihan ' +
          'semester; `recentScores` adalah skor terbaru terlepas dari semester. 404 bila `semesterId` bukan milik sekolah ini.',
        headers: schoolHeader,
        params: studentParams,
        querystring: z.object({ semesterId: z.uuid().optional() }),
        response: {
          200: z.object({
            available: unavailable,
            semester: z.object({ id: z.uuid(), name: z.string() }).nullable(),
            semesters: z.array(
              z.object({ id: z.uuid(), name: z.string(), academicYear: z.string(), isActive: z.boolean() }),
            ),
            kkm: z.number().int().nullable(),
            average: z.number().nullable(),
            subjects: z.array(
              z.object({
                subjectId: z.uuid(),
                name: z.string(),
                final: z.number().nullable(),
                predicate: predicateEnum.nullable(),
                belowKkm: z.boolean(),
                components: z.array(
                  z.object({ name: z.string(), weight: z.number().int(), average: z.number().nullable() }),
                ),
              }),
            ),
            recentScores: z.array(recentScoreSchema),
          }),
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) =>
      forChild(request, request.params.studentId, async (tx, _child, flags) => {
        if (!flags.grades) {
          return {
            available: false,
            semester: null,
            semesters: [],
            kkm: null,
            average: null,
            subjects: [],
            recentScores: [],
          };
        }
        const sem = await resolveSemester(tx, request.query.semesterId);
        const grades = sem ? await gradesFor(tx, request.params.studentId, sem) : null;
        return {
          available: true,
          semester: sem ? { id: sem.id, name: sem.name } : null,
          semesters: await semestersWithYear(tx),
          kkm: grades?.kkm ?? null,
          average: grades?.average ?? null,
          subjects: grades?.subjects ?? [],
          recentScores: await recentScoresFor(tx, request.params.studentId, 20),
        };
      }),
  );

  app.get(
    '/v1/portal/children/:studentId/invoices',
    {
      onRequest: readGate,
      schema: {
        tags: tagPortal,
        summary: 'Tagihan dan kwitansi seorang anak',
        description:
          'Izin: `portal:read`; modul `parent_portal`; bagian ini butuh modul `finance` (bila tidak aktif `available` ' +
          'false dan data kosong). Tagihan tanpa yang dibatalkan (terlama jatuh tempo dulu) beserta jumlah terbayar, ' +
          'sisa, dan tunggakan, memakai perhitungan keuangan sekolah; `receipts` adalah kwitansi yang tidak batal ' +
          '(terbaru dulu, maksimal 50) dengan rincian tagihan yang dibayar.',
        headers: schoolHeader,
        params: studentParams,
        response: {
          200: z.object({
            available: unavailable,
            openCount: z.number().int(),
            outstandingTotal: z.number().int(),
            overdueTotal: z.number().int(),
            invoices: z.array(invoiceSchema),
            receipts: z.array(receiptSchema),
          }),
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) =>
      forChild(request, request.params.studentId, async (tx, _child, flags) => {
        if (!flags.finance) {
          return {
            available: false,
            openCount: 0,
            outstandingTotal: 0,
            overdueTotal: 0,
            invoices: [],
            receipts: [],
          };
        }
        const inv = await invoicesFor(tx, request.params.studentId);
        return {
          available: true,
          openCount: inv.openCount,
          outstandingTotal: inv.outstandingTotal,
          overdueTotal: inv.overdueTotal,
          invoices: inv.invoices,
          receipts: await receiptsFor(tx, request.params.studentId),
        };
      }),
  );

  app.get(
    '/v1/portal/children/:studentId/report-cards',
    {
      onRequest: readGate,
      schema: {
        tags: tagPortal,
        summary: 'Rapor final seorang anak',
        description:
          'Izin: `portal:read`; modul `parent_portal`; bagian ini butuh modul `grades` (bila tidak aktif `available` ' +
          'false dan daftar kosong). Hanya rapor berstatus final; draft tidak pernah tampil. Dokumen lengkap per ' +
          'semester lewat `/report-cards/{semesterId}`.',
        headers: schoolHeader,
        params: studentParams,
        response: {
          200: z.object({ available: unavailable, items: z.array(reportCardItemSchema) }),
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) =>
      forChild(request, request.params.studentId, async (tx, _child, flags) =>
        flags.grades
          ? { available: true, items: await finalReportCards(tx, request.params.studentId) }
          : { available: false, items: [] },
      ),
  );

  app.get(
    '/v1/portal/children/:studentId/report-cards/:semesterId',
    {
      onRequest: readGate,
      schema: {
        tags: tagPortal,
        summary: 'Dokumen rapor final satu semester',
        description:
          'Izin: `portal:read`; modul `parent_portal` dan `grades`. Snapshot beku saat rapor difinalisasi. 404 ' +
          '`not_found` bila belum final, tidak ada, atau anak bukan milik akun ini; 403 `module_disabled` bila modul ' +
          '`grades` tidak aktif.',
        headers: schoolHeader,
        params: z.object({ studentId: z.uuid(), semesterId: z.uuid() }),
        response: { 200: reportDocumentSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      forChild(request, request.params.studentId, async (tx, _child, flags) => {
        if (!flags.grades) {
          throw new HttpError(403, 'module_disabled', 'Modul ini belum aktif untuk sekolah Anda.');
        }
        const doc = await finalReportDocument(tx, request.params.studentId, request.params.semesterId);
        if (!doc) throw notFound('Rapor');
        return doc;
      }),
  );

  app.get(
    '/v1/portal/children/:studentId/tahfidz',
    {
      onRequest: readGate,
      schema: {
        tags: tagPortal,
        summary: 'Progres tahfidz seorang anak',
        description:
          'Izin: `portal:read`; modul `parent_portal`; bagian ini butuh modul `tahfidz` (bila tidak aktif `available` ' +
          'false dan data kosong). Rumus sama dengan progres tahfidz sekolah: ayat unik dari setoran ziyadah (selain ' +
          '`repeat`), juz lengkap, target dan capaian semester aktif, 30 hari terakhir, hari beruntun, ayat lanjutan, ' +
          'dan 15 setoran terakhir.',
        headers: schoolHeader,
        params: studentParams,
        response: {
          200: z.object({
            available: unavailable,
            halaqah: z.string().nullable(),
            coverage: z.object({
              ayahs: z.number().int(),
              percent: z.number(),
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
              z.object({ date: dateField, ziyadahAyahs: z.number().int(), murajaahAyahs: z.number().int() }),
            ),
            streakDays: z.number().int(),
            lastEntryDate: dateField.nullable(),
            next: z.object({ surah: z.number().int(), ayah: z.number().int() }).nullable(),
            recentEntries: z.array(
              z.object({
                date: dateField,
                kind: z.enum(['ziyadah', 'murajaah']),
                quality: z.enum(['fluent', 'fair', 'repeat']),
                surahFrom: z.number().int(),
                ayahFrom: z.number().int(),
                surahTo: z.number().int(),
                ayahTo: z.number().int(),
                ayahCount: z.number().int(),
              }),
            ),
          }),
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) =>
      forChild(request, request.params.studentId, async (tx, _child, flags) => {
        if (!flags.tahfidz) {
          const zero = { ziyadahAyahs: 0, murajaahAyahs: 0 };
          return {
            available: false,
            halaqah: null,
            coverage: { ayahs: 0, percent: 0, juzComplete: 0, juzCompleteList: [] },
            semester: { id: null, name: null, target: zero, done: zero, percentOfTarget: null },
            last30Days: [],
            streakDays: 0,
            lastEntryDate: null,
            next: null,
            recentEntries: [],
          };
        }
        return { available: true, ...(await tahfidzFor(tx, request.params.studentId, todayInJakarta())) };
      }),
  );
}
