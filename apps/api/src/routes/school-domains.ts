import { randomBytes } from 'node:crypto';
import { checkCustomHostname, DOMAIN_VERIFY_LABEL, MAX_SCHOOL_DOMAINS } from '@edusync/contracts';
import { asc, count, type Db, eq, schoolDomain, sql, type Tx, withTenant } from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { checkDomainDns, type DomainDns } from '../domain-dns';
import type { Env } from '../env';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import type { HostResolver } from '../origins';
import { audit, conflictAs409, guarded, idParams, ok, schoolHeader } from './helpers';

const tags = ['School'];
const gate = [requirePermission('school:manage'), requireModule('website')];

const recordSchema = z.object({
  type: z.enum(['CNAME', 'TXT']),
  name: z.string().describe('Nama catatan DNS yang harus dibuat'),
  value: z.string().describe('Isi catatan'),
});

const domainSchema = z.object({
  id: z.uuid(),
  hostname: z.string(),
  status: z.enum(['pending', 'verified', 'failed']),
  verifiedAt: z.string().nullable(),
  lastCheckedAt: z.string().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.string(),
  records: z.array(recordSchema).describe('Catatan DNS yang diminta dari pemilik domain'),
});

const checkSchema = z.object({
  kind: z.enum(['txt', 'cname']),
  name: z.string(),
  ok: z.boolean(),
  expected: z.string().describe('Isi yang diharapkan'),
  found: z.array(z.string()).describe('Isi yang ditemukan di DNS (kosong bila tidak ada)'),
});

type Row = typeof schoolDomain.$inferSelect;

export interface SchoolDomainOptions {
  env: Env;
  hosts: HostResolver;
  dns: DomainDns;
}

/** Pencarian host ke database lewat fungsi SECURITY DEFINER (hanya hostname terverifikasi, sekolah aktif). */
export async function lookupVerifiedHost(db: Db, host: string) {
  const res = await db.execute<{ slug: string | null }>(sql`select resolve_school_domain(${host}) as slug`);
  return res.rows[0]?.slug ?? null;
}

/** Domain sendiri sekolah (tahap 1: situs publik, SPMB, dan verifikasi surat; dashboard tetap di APP_DOMAIN). */
export async function schoolDomainRoutes(instance: FastifyInstance, opts: SchoolDomainOptions) {
  const { env, hosts, dns } = opts;
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const target = env.CUSTOM_DOMAIN_TARGET ?? env.APP_DOMAIN.replace(/:\d+$/, '');
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  const view = (r: Row) => ({
    id: r.id,
    hostname: r.hostname,
    status: r.status,
    verifiedAt: r.verifiedAt?.toISOString() ?? null,
    lastCheckedAt: r.lastCheckedAt?.toISOString() ?? null,
    lastError: r.lastError,
    createdAt: r.createdAt.toISOString(),
    records: [
      { type: 'CNAME' as const, name: r.hostname, value: target },
      { type: 'TXT' as const, name: `${DOMAIN_VERIFY_LABEL}.${r.hostname}`, value: r.verificationToken },
    ],
  });

  app.get(
    '/v1/school/domains',
    {
      onRequest: gate,
      schema: {
        tags,
        summary: 'Daftar domain sendiri',
        description:
          'Izin: `school:manage`; modul `website`. Domain milik sekolah beserta status verifikasi dan catatan DNS ' +
          'yang harus dipasang. Tahap 1: hanya situs publik, SPMB, dan verifikasi surat yang tampil di domain ini.',
        headers: schoolHeader,
        response: { 200: z.array(domainSchema), ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) =>
        (await tx.select().from(schoolDomain).orderBy(asc(schoolDomain.createdAt))).map(view),
      ),
  );

  app.post(
    '/v1/school/domains',
    {
      onRequest: gate,
      schema: {
        tags,
        summary: 'Tambah domain sendiri',
        description:
          'Izin: `school:manage`; modul `website`. Hostname dinormalkan ke huruf kecil. 400 `invalid_hostname` ' +
          `bila bukan domain sah (IP, localhost, atau milik APP_DOMAIN); 409 \`domain_limit\` bila sudah ${MAX_SCHOOL_DOMAINS} ` +
          'domain; 409 `conflict` bila hostname sudah ada di sekolah ini (sekolah lain boleh mendaftarkan hostname yang sama; yang pertama `verify` lolos yang memilikinya). Status awal `pending` sampai ' +
          '`POST /v1/school/domains/{id}/verify` lolos.',
        headers: schoolHeader,
        body: z.object({ hostname: z.string().trim().min(1).max(253) }),
        response: { 201: domainSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const checked = checkCustomHostname(request.body.hostname, env.APP_DOMAIN);
      if (!checked.ok) {
        throw new HttpError(400, 'invalid_hostname', `Hostname tidak dapat dipakai (${checked.problem}).`);
      }
      const created = await conflictAs409('Domain itu sudah ada di sekolah ini.', () =>
        tenant(request, async (tx) => {
          const [n] = await tx.select({ n: count() }).from(schoolDomain);
          if ((n?.n ?? 0) >= MAX_SCHOOL_DOMAINS) {
            throw new HttpError(409, 'domain_limit', `Maksimal ${MAX_SCHOOL_DOMAINS} domain per sekolah.`);
          }
          const [r] = await tx
            .insert(schoolDomain)
            .values({
              schoolId: ctx.schoolId,
              hostname: checked.hostname,
              verificationToken: `edusync-${randomBytes(16).toString('hex')}`,
            })
            .returning();
          await audit(tx, ctx, 'school.domain_add', 'school_domain', r!.id, { hostname: checked.hostname });
          return r!;
        }),
      );
      return reply.code(201).send(view(created));
    },
  );

  app.post(
    '/v1/school/domains/:id/verify',
    {
      onRequest: gate,
      schema: {
        tags,
        summary: 'Periksa DNS domain sendiri',
        description:
          'Izin: `school:manage`; modul `website`. Memeriksa TXT `_edusync-verify.<hostname>` berisi token dan ' +
          'CNAME (atau A untuk apex) menuju target. Lolos keduanya = `verified`; selain itu `failed` dengan ' +
          '`checks` yang memuat isi diharapkan versus ditemukan. Boleh diulang kapan saja (mis. setelah DNS menyebar). ' +
          '404 `not_found` bila domain tak ada; 409 `conflict` bila sekolah lain sudah memverifikasi hostname yang sama.',
        headers: schoolHeader,
        params: idParams,
        response: {
          200: z.object({ domain: domainSchema, checks: z.array(checkSchema) }),
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const [found] = await tenant(request, (tx) =>
        tx.select().from(schoolDomain).where(eq(schoolDomain.id, request.params.id)),
      );
      if (!found) throw new HttpError(404, 'not_found', 'Domain tidak ditemukan.');
      // DNS diperiksa di luar transaksi: lookup bisa lambat dan tidak boleh menahan koneksi database.
      const result = await checkDomainDns(dns, found.hostname, found.verificationToken, target);
      const now = new Date();
      const failed = result.checks.filter((c) => !c.ok).map((c) => c.name);
      const updated = await conflictAs409('Domain itu sudah terverifikasi oleh sekolah lain.', () =>
        tenant(request, async (tx) => {
          const [r] = await tx
            .update(schoolDomain)
            .set({
              status: result.verified ? 'verified' : 'failed',
              lastCheckedAt: now,
              lastError: result.verified ? null : `Catatan belum sesuai: ${failed.join(', ')}`,
              verifiedAt: result.verified ? (found.verifiedAt ?? now) : null,
            })
            .where(eq(schoolDomain.id, found.id))
            .returning();
          await audit(tx, ctx, 'school.domain_verify', 'school_domain', found.id, {
            hostname: found.hostname,
            verified: result.verified,
          });
          return r!;
        }),
      );
      hosts.invalidate();
      return { domain: view(updated), checks: result.checks };
    },
  );

  app.delete(
    '/v1/school/domains/:id',
    {
      onRequest: gate,
      schema: {
        tags,
        summary: 'Hapus domain sendiri',
        description:
          'Izin: `school:manage`; modul `website`. Domain berhenti dikenali (cache host paling lama 60 detik di ' +
          'instance lain). 404 `not_found` bila tak ada.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      await tenant(request, async (tx) => {
        const [r] = await tx.delete(schoolDomain).where(eq(schoolDomain.id, request.params.id)).returning();
        if (!r) throw new HttpError(404, 'not_found', 'Domain tidak ditemukan.');
        await audit(tx, ctx, 'school.domain_delete', 'school_domain', r.id, { hostname: r.hostname });
      });
      hosts.invalidate();
      return { ok: true as const };
    },
  );

  app.get(
    '/v1/public/resolve-host',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: {
        tags: ['Situs sekolah (publik)'],
        summary: 'Petakan host domain sendiri ke sekolah (publik)',
        description:
          'Tanpa login. Mengembalikan slug sekolah hanya bila `host` adalah domain sendiri terverifikasi milik sekolah ' +
          'aktif; selain itu 404 `not_found` seragam. Host tidak pernah dipercaya mentah. Hasil di-cache 60 detik.',
        querystring: z.object({ host: z.string().trim().min(1).max(253) }),
        response: { 200: z.object({ schoolSlug: z.string() }), 404: errorSchema, 429: errorSchema },
      },
    },
    async (request, reply) => {
      const slug = await hosts.resolve(request.query.host);
      if (!slug) throw new HttpError(404, 'not_found', 'Host tidak dikenal.');
      reply.header('cache-control', 'public, max-age=60');
      return { schoolSlug: slug };
    },
  );
}
