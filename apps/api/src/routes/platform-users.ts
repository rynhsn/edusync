import { auditLog, eq, ilike, or, session, sql, user } from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requireStaff } from '../identity/guards';

const tag = ['Platform'];

const userRow = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  createdAt: z.iso.datetime(),
  activeSessions: z.number().int().describe('Jumlah sesi (perangkat) yang belum kedaluwarsa'),
  schools: z.number().int().describe('Jumlah sekolah tempat pengguna menjadi anggota aktif'),
  isStaff: z.boolean().describe('Pengguna ini juga staf Edusync'),
});

/** Pencarian akun global dan pengeluaran paksa semua perangkat, khusus staf platform. */
export async function platformUserRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/v1/platform/users',
    {
      onRequest: [requireStaff('read_only')],
      schema: {
        tags: tag,
        summary: 'Cari pengguna (lintas sekolah)',
        description:
          'Staf platform (baca). Mencari menurut email atau nama (minimal 2 huruf, maksimal 20 hasil). Akun bersifat ' +
          'global: satu pengguna bisa menjadi anggota banyak sekolah. Hasil tidak memuat token sesi atau data sensitif.',
        querystring: z.object({ q: z.string().trim().min(2).max(100) }),
        response: { 200: z.array(userRow), 400: errorSchema, 401: errorSchema, 403: errorSchema },
      },
    },
    async (request) => {
      const db = app.platformDb;
      const like = `%${request.query.q.replace(/[\\%_]/g, '\\$&')}%`;
      const rows = await db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt,
          activeSessions: sql<number>`(select count(*)::int from session s where s.user_id = "user".id and s.expires_at > now())`,
          schools: sql<number>`(select count(*)::int from member m where m.user_id = "user".id and m.status = 'active')`,
          isStaff: sql<boolean>`exists (select 1 from platform_staff ps where ps.user_id = "user".id)`,
        })
        .from(user)
        .where(or(ilike(user.email, like), ilike(user.name, like)))
        .orderBy(user.name)
        .limit(20);
      return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
    },
  );

  app.post(
    '/v1/platform/users/:id/revoke-sessions',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Keluarkan semua perangkat seorang pengguna',
        description:
          'Staf platform (admin). Menghapus semua sesi pengguna sehingga ia harus masuk lagi di setiap perangkat ' +
          '(mis. akun diduga bocor atau perangkat hilang). Alasan wajib dan dicatat di audit log. Staf boleh ' +
          'mengeluarkan dirinya sendiri, tetapi sesinya sendiri ikut berakhir. 404 bila pengguna tidak ada.',
        params: z.object({ id: z.string().min(1) }),
        body: z.object({ reason: z.string().trim().min(3).max(300) }),
        response: {
          200: z.object({ ok: z.literal(true), revoked: z.number().int() }),
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request) => {
      const { id } = request.params;
      const revoked = await app.platformDb.transaction(async (tx) => {
        const [u] = await tx.select({ id: user.id }).from(user).where(eq(user.id, id));
        if (!u) throw new HttpError(404, 'not_found', 'Pengguna tidak ditemukan.');
        const gone = await tx.delete(session).where(eq(session.userId, id)).returning({ id: session.id });
        await tx.insert(auditLog).values({
          actorId: request.userId as string,
          action: 'user.sessions_revoked',
          entityType: 'user',
          entityId: id,
          details: { reason: request.body.reason, revoked: gone.length },
        });
        return gone.length;
      });
      return { ok: true as const, revoked };
    },
  );
}
