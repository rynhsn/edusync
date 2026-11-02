import { eq, school } from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { Env } from '../env';
import type { HostResolver } from '../origins';

/**
 * Pemeriksa untuk server web yang menerbitkan sertifikat HTTPS per host saat pertama diakses (Caddy `on_demand_tls`):
 * sertifikat hanya boleh dibuat untuk alamat utama, subdomain sekolah yang ada, atau domain sendiri yang sudah
 * terverifikasi. Tanpa ini, siapa pun bisa memaksa server meminta sertifikat untuk nama acak.
 * Hanya bisa dipanggil dari mesin yang sama (alamat loopback) dan tidak diteruskan oleh web.
 */
export async function tlsAskRoutes(instance: FastifyInstance, options: { env: Env; hosts: HostResolver }) {
  const base = options.env.APP_DOMAIN.replace(/:\d+$/, '');

  instance.get('/internal/tls-ask', { schema: { hide: true } }, async (request, reply) => {
    const ip = request.ip;
    if (ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') return reply.code(403).send();

    const domain = String((request.query as { domain?: string }).domain ?? '')
      .trim()
      .toLowerCase();
    if (!domain || domain.length > 253) return reply.code(404).send();
    if (domain === base) return reply.code(200).send('ok');

    const suffix = `.${base}`;
    if (domain.endsWith(suffix)) {
      const slug = domain.slice(0, -suffix.length);
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return reply.code(404).send();
      const [row] = await instance.platformDb
        .select({ status: school.status })
        .from(school)
        .where(eq(school.slug, slug));
      return reply.code(row ? 200 : 404).send(row ? 'ok' : undefined);
    }
    // Domain sendiri sekolah yang sudah terverifikasi.
    return reply.code((await options.hosts.resolve(domain)) ? 200 : 404).send();
  });
}
