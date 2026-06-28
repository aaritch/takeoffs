import { NextResponse } from 'next/server';
import {
  CreateSsoConnectionRequest,
  type SsoConnectionResponse,
  type SsoConnectionsResponse,
} from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { ssoConnectionToView, ssoService } from '@/server/modules/sso';
import { ApiError, apiHandler, parseBody } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** GET /v1/sso/connections — the org's SSO connections (no provider secrets) (P5-02). */
export async function GET(request: Request) {
  return apiHandler(request, async ({ orgId }) => {
    const connections = await withOrgScope(getAppDb(), orgId, (tx) =>
      ssoService.listConnections(tx, orgId),
    );
    const body: SsoConnectionsResponse = { connections: connections.map(ssoConnectionToView) };
    return NextResponse.json(body);
  });
}

/**
 * POST /v1/sso/connections — configure the org's identity provider. OWNER/ADMIN only (auth config is
 * sensitive). The JIT `defaultRole` is required + explicit so SSO never over-grants (the caveat).
 */
export async function POST(request: Request) {
  return apiHandler(request, async ({ orgId, role }) => {
    if (role !== 'OWNER' && role !== 'ADMIN') {
      throw new ApiError(403, 'FORBIDDEN', 'Only an owner or admin can configure SSO.');
    }
    const input = await parseBody(request, CreateSsoConnectionRequest);
    const connection = await withOrgScope(getAppDb(), orgId, (tx) =>
      ssoService.createConnection(tx, {
        orgId,
        protocol: input.protocol,
        emailDomain: input.emailDomain,
        issuer: input.issuer,
        defaultRole: input.defaultRole,
        ...(input.requireMfa !== undefined ? { requireMfa: input.requireMfa } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      }),
    );
    const body: SsoConnectionResponse = { connection: ssoConnectionToView(connection) };
    return NextResponse.json(body, { status: 201 });
  });
}
