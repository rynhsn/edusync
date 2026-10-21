import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { platformAuth } from './auth/config.js';
import { registerPlatformAuthRoutes } from './auth/routes.js';
import { registerTenantRoutes } from './tenants/routes.js';
import { registerOperatorRoutes } from './operators/routes.js';
import { registerPasswordResetRoutes } from './auth/password-reset.js';
import { platformDbPool } from './db/pool.js';
import { registerApiDocs } from '@edusync/api-docs';
import { platformOpenApi } from './docs/openapi.js';

const app = Fastify({ logger: true, trustProxy: process.env.TRUST_PROXY === 'true' });
const port = Number(process.env.PLATFORM_PORT ?? 4001);
const host = process.env.HOST ?? '0.0.0.0';
const trustedOrigins = (process.env.PLATFORM_TRUSTED_ORIGINS ?? 'http://localhost:5174')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

await app.register(cors, {
  origin(origin, callback) {
    if (!origin || trustedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed'), false);
  },
  // @fastify/cors defaults to 'GET,HEAD,POST', which makes a browser refuse every
  // PATCH and DELETE preflight as a CORS failure even though the preflight returns 204.
  methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
});
await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

app.get('/health', async (_request, reply) => {
  await platformDbPool.query('SELECT 1');
  return reply.send({ status: 'ok', service: 'platform-api' });
});

await registerPlatformAuthRoutes(app, platformAuth);
await registerTenantRoutes(app);
await registerOperatorRoutes(app);
await registerPasswordResetRoutes(app);
await registerApiDocs(app, platformOpenApi);

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'Shutting down Platform API');
  await app.close();
  await platformDbPool.end();
  process.exit(0);
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  await app.close();
  await platformDbPool.end();
  process.exitCode = 1;
}
