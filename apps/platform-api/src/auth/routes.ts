import type { FastifyInstance, FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import type { platformAuth } from './config.js';

type PlatformAuth = typeof platformAuth;
type PlatformSession = NonNullable<Awaited<ReturnType<PlatformAuth['api']['getSession']>>>;

export async function getPlatformSession(auth: PlatformAuth, request: FastifyRequest): Promise<PlatformSession | null> {
  return auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
}

export async function registerPlatformAuthRoutes(app: FastifyInstance, auth: PlatformAuth): Promise<void> {
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const url = new URL(request.url, `${request.protocol}://${request.headers.host}`);
      const headers = fromNodeHeaders(request.headers);
      const body = request.body === undefined ? undefined : JSON.stringify(request.body);
      const authRequest = new Request(url, {
        method: request.method,
        headers,
        ...(body === undefined ? {} : { body }),
      });
      const response = await auth.handler(authRequest);
      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      return reply.send(response.body ? await response.text() : null);
    },
  });
}
