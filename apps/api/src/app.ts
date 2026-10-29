import { createDb, sql } from '@edusync/db';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import scalar from '@scalar/fastify-api-reference';
import Fastify from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Env } from './env';

export async function buildApp(env: Env) {
  const app = Fastify({
    logger: env.NODE_ENV === 'test' ? false : { level: 'info' },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const tenantDb = createDb(env.DATABASE_URL);
  app.decorate('tenantDb', tenantDb.db);
  app.addHook('onClose', async () => {
    await tenantDb.pool.end();
  });

  await app.register(helmet);
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'EduSync API',
        version: '0.0.0',
        description: 'API platform manajemen sekolah EduSync.',
      },
      tags: [{ name: 'System', description: 'Status layanan' }],
    },
    transform: jsonSchemaTransform,
  });
  // Dokumentasi dibuat otomatis dari skema Zod pada setiap route.
  await app.register(scalar, { routePrefix: '/docs' });
  app.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger());

  app.get(
    '/health',
    {
      schema: {
        tags: ['System'],
        summary: 'Cek proses hidup',
        response: { 200: z.object({ status: z.literal('ok') }) },
      },
    },
    async () => ({ status: 'ok' as const }),
  );

  app.get(
    '/ready',
    {
      schema: {
        tags: ['System'],
        summary: 'Cek kesiapan, termasuk koneksi database',
        response: {
          200: z.object({ status: z.literal('ready') }),
          503: z.object({ status: z.literal('unavailable') }),
        },
      },
    },
    async (_req, reply) => {
      try {
        await tenantDb.db.execute(sql`select 1`);
        return { status: 'ready' as const };
      } catch {
        return reply.code(503).send({ status: 'unavailable' as const });
      }
    },
  );

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    tenantDb: import('@edusync/db').Db;
  }
}
