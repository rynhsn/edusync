import { DomainError, PaymentProviderResolver } from '@edusync/billing';
import { createDb, sql } from '@edusync/db';
import cors from '@fastify/cors';
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
import { type Auth, createAuth, originMatcherFor } from './auth';
import type { Env } from './env';
import { paymentConfig } from './payment-config';
import { academicStructureRoutes } from './routes/academic-structure';
import { academicYearRoutes } from './routes/academic-years';
import { accountRoutes } from './routes/account';
import { attendanceReportRoutes } from './routes/attendance-report';
import { registerAuthRoutes } from './routes/auth';
import { billingRoutes } from './routes/billing';
import { calendarRoutes } from './routes/calendar';
import { curriculumRoutes } from './routes/curriculum';
import { gateRoutes } from './routes/gate';
import { guardianRoutes } from './routes/guardians';
import { invitationRoutes } from './routes/invitations';
import { lessonAttendanceRoutes } from './routes/lesson-attendance';
import { meRoutes } from './routes/me';
import { memberRoutes } from './routes/members';
import { peopleRoutes } from './routes/people';
import { platformRoutes } from './routes/platform';
import { platformCatalogRoutes } from './routes/platform-catalog';
import { platformPaymentRoutes } from './routes/platform-payments';
import { roleRoutes } from './routes/roles';
import { scheduleRoutes } from './routes/schedule';
import { semesterRoutes } from './routes/semesters';
import { studentImportRoutes } from './routes/student-import';
import { teacherImportRoutes } from './routes/teacher-import';

export { paymentConfig };

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
  app.decorate('payments', new PaymentProviderResolver(platformDb.db, env.AUTH_SECRET, paymentConfig(env)));
  app.addHook('onClose', async () => {
    await Promise.all([tenantDb.pool.end(), platformDb.pool.end()]);
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof DomainError) {
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
  await app.register(cors, {
    // Permintaan tanpa Origin (alat server) lolos; yang membawa Origin harus asal yang dipercaya.
    origin: (origin, done) => done(null, !origin || originMatcherFor(env)(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['content-type', 'x-school-id'],
  });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Edusync API',
        version: '0.0.0',
        description:
          'API platform manajemen sekolah Edusync. Endpoint sekolah memakai cookie sesi dan header `x-school-id`.',
      },
      tags: [
        { name: 'System', description: 'Status layanan' },
        { name: 'Identity', description: 'Akun dan keanggotaan' },
        { name: 'Academic', description: 'Data akademik' },
        { name: 'Billing', description: 'Katalog, pendaftaran, dan pembayaran' },
        { name: 'Platform', description: 'Konsol staf Edusync' },
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

  app.get(
    '/v1/config',
    {
      schema: {
        tags: ['System'],
        summary: 'Pengaturan publik untuk web',
        description:
          'Domain dasar tempat sekolah diakses. Alamat sekolah adalah <alamat>.<baseDomain>, mis. smpit.localhost:3000.',
        response: { 200: z.object({ baseDomain: z.string() }) },
      },
    },
    async () => ({ baseDomain: env.APP_DOMAIN }),
  );

  await registerAuthRoutes(app, originMatcherFor(env));
  await app.register(meRoutes);
  await app.register(academicYearRoutes);
  await app.register(billingRoutes, { env });
  await app.register(platformRoutes);
  await app.register(platformCatalogRoutes);
  await app.register(platformPaymentRoutes, { env });
  await app.register(accountRoutes);
  await app.register(memberRoutes);
  await app.register(roleRoutes);
  await app.register(academicStructureRoutes);
  await app.register(peopleRoutes);
  await app.register(scheduleRoutes);
  await app.register(attendanceReportRoutes);
  await app.register(gateRoutes);
  await app.register(lessonAttendanceRoutes);
  await app.register(semesterRoutes);
  await app.register(calendarRoutes);
  await app.register(curriculumRoutes);
  await app.register(guardianRoutes);
  await app.register(studentImportRoutes);
  await app.register(teacherImportRoutes);
  await app.register(invitationRoutes, { env });

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    tenantDb: import('@edusync/db').Db;
    platformDb: import('@edusync/db').Db;
    auth: Auth;
    /** Penyedia pembayaran yang berlaku (pengaturan di database menimpa variabel lingkungan). */
    payments: PaymentProviderResolver;
  }
}
