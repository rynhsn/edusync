import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyInstance } from 'fastify';
import { Throttle } from '../throttle';

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
      // Masuk dibatasi per IP dan per isian (email/NIK; hanya hash-nya yang dipakai sebagai kunci).
      const signIn = request.method === 'POST' && request.url.split('?')[0] === '/api/auth/sign-in/email';
      let failKey: string | null = null;
      if (signIn) {
        const limits = app.authLimits;
        const given = String((request.body as { email?: unknown } | undefined)?.email ?? '')
          .trim()
          .toLowerCase();
        failKey = Throttle.key('signin-id', given);
        const wait = Math.max(
          app.throttle.hit(Throttle.key('signin-ip', request.ip), limits.signInIpPerMinute, 60_000),
          app.throttle.blockedFor(failKey, limits.signInFailuresPer15Min),
        );
        if (wait > 0) {
          return reply
            .code(429)
            .header('retry-after', String(wait))
            .send({ code: 'RATE_LIMITED', message: 'Terlalu banyak percobaan masuk. Coba lagi nanti.' });
        }
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
      if (failKey) {
        // Hanya kegagalan yang dihitung; masuk berhasil mengosongkan hitungan isian itu.
        if (response.status === 200) app.throttle.reset(failKey);
        else app.throttle.record(failKey, 15 * 60_000);
      }
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
