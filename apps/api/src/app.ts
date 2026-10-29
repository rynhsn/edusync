import { createDb, sql } from '@edusync/db';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import scalar from '@scalar/fastify-api-reference';
import Fastify from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import { type Auth, createAuth } from './auth';
import type { Env } from './env';
import { HttpError } from './http-error';
import { academicYearRoutes } from './routes/academic-years';
import { registerAuthRoutes } from './routes/auth';
import { meRoutes } from './routes/me';

export async function buildApp(env: Env) {
  const app = Fastify({
    logger: env.NODE_ENV === 'test' ? false : { level: 'info' },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Pool aplikasi tunduk pada RLS. Pool platform melewatinya dan hanya dipakai
  // untuk pencarian keanggotaan dan alur platform (lihat identity/guards.ts).
  const tenantDb = createDb(env.DATABASE_URL);
  const platformDb = createDb(env.DATABASE_PLATFORM_URL);
  app.decorate('tenantDb', tenantDb.db);
  app.decorate('platformDb', platformDb.db);
  app.decorate('auth', createAuth(env, tenantDb.db));
  app.addHook('onClose', async () => {
    await Promise.all([tenantDb.pool.end(), platformDb.pool.end()]);
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.status).send({ error: { code: error.code, message: error.message } });
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply
        .code(400)
        .send({ error: { code: 'validation', message: 'Data yang dikirim tidak valid.' } });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status < 500) {
      return reply.code(status).send({ error: { code: 'request_error', message: (error as Error).message } });
    }
    request.log.error(error);
    return reply.code(500).send({ error: { code: 'internal', message: 'Terjadi kesalahan pada server.' } });
  });

  await app.register(helmet);
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'EduSync API',
        version: '0.0.0',
        description:
          'API platform manajemen sekolah EduSync. Endpoint sekolah memakai cookie sesi dan header `x-school-id`.',
      },
      tags: [
        { name: 'System', description: 'Status layanan' },
        { name: 'Identity', description: 'Akun dan keanggotaan' },
        { name: 'Academic', description: 'Data akademik' },
      ],
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

  await registerAuthRoutes(app);
  await app.register(meRoutes);
  await app.register(academicYearRoutes);

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    tenantDb: import('@edusync/db').Db;
    platformDb: import('@edusync/db').Db;
    auth: Auth;
  }
}
