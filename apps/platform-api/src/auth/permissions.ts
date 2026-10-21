import type { PlatformPermission } from '@edusync/contracts';
import type { FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { platformAuth } from './config.js';
import { getPlatformSession } from './routes.js';

export async function hasPlatformPermission(
  request: FastifyRequest,
  permission: PlatformPermission,
): Promise<boolean> {
  const session = await getPlatformSession(platformAuth, request);
  if (!session) return false;
  const [resource, action] = permission.split('.');
  const result = await platformAuth.api.userHasPermission({
    headers: fromNodeHeaders(request.headers),
    body: {
      userId: session.user.id,
      permissions: { [resource]: [action.replace('_', '-')] },
    },
  });
  return result.success;
}
