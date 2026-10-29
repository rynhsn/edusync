import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyRequest } from 'fastify';

export function sessionFrom(request: FastifyRequest) {
  return request.server.auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
}
