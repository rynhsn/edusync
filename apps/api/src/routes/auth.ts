import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyInstance } from 'fastify';

/** Teruskan /api/auth/* ke Better Auth (login, logout, sesi). Skemanya didokumentasikan oleh Better Auth. */
export async function registerAuthRoutes(app: FastifyInstance, isTrustedOrigin: (origin: string) => boolean) {
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    schema: { hide: true },
    async handler(request, reply) {
      // Penukaran token tidak membawa cookie, jadi Better Auth tidak memeriksa asalnya. Periksa di sini:
      // browser selalu mengirim Origin, dan asal di luar APP_DOMAIN tidak boleh menukar token.
      const origin = request.headers.origin;
      if (request.url.startsWith('/api/auth/one-time-token/verify') && origin && !isTrustedOrigin(origin)) {
        return reply
          .code(403)
          .send({ error: { code: 'forbidden', message: 'Asal permintaan tidak dipercaya.' } });
      }
      const url = new URL(request.url, `${request.protocol}://${request.headers.host}`);
      const body = request.body === undefined ? undefined : JSON.stringify(request.body);
      const response = await app.auth.handler(
        new Request(url, {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          ...(body === undefined ? {} : { body }),
        }),
      );
      reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'set-cookie') reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.header('set-cookie', cookies);
      return reply.send(response.body ? await response.text() : null);
    },
  });
}
