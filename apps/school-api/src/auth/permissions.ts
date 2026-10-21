import type { SchoolPermission } from '@edusync/contracts';
import type { FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { schoolAuth } from './config.js';
import { schoolDbPool } from '../db/pool.js';
import { getSchoolSession } from './routes.js';

export type SchoolPrincipal = {
  userId: string;
  organizationId: string;
  tenantId: string;
  role: string;
};

export async function getSchoolPrincipal(request: FastifyRequest): Promise<SchoolPrincipal | null> {
  const session = await getSchoolSession(schoolAuth, request);
  if (!session) return null;
  const organizationId = session.session.activeOrganizationId;
  if (!organizationId) return null;

  const result = await schoolAuth.api.getFullOrganization({
    headers: fromNodeHeaders(request.headers),
    query: { organizationId },
  });
  if (!result) return null;

  const member = result.members.find((candidate) => candidate.userId === session.user.id);
  if (!member) return null;
  const tenantId = await lookupTenantId(organizationId);
  if (!tenantId) return null;

  return { userId: session.user.id, organizationId, tenantId, role: member.role };
}

async function lookupTenantId(organizationId: string): Promise<string | null> {
  const result = await schoolDbPool.query<{ id: string }>(
    'SELECT id FROM school_tenants WHERE organization_id = $1 AND status = $2',
    [organizationId, 'active'],
  );
  return result.rows[0]?.id ?? null;
}

export async function principalHasPermission(
  request: FastifyRequest,
  principal: SchoolPrincipal,
  permission: SchoolPermission,
): Promise<boolean> {
  const [resource, action] = permission.split('.');
  const result = await schoolAuth.api.hasPermission({
    headers: fromNodeHeaders(request.headers),
    body: {
      organizationId: principal.organizationId,
      permissions: { [resource]: [action] },
    },
  });
  return result.success;
}

export async function hasSchoolPermission(
  request: FastifyRequest,
  permission: SchoolPermission,
): Promise<boolean> {
  const principal = await getSchoolPrincipal(request);
  if (!principal) return false;
  return principalHasPermission(request, principal, permission);
}
