import { NextResponse } from 'next/server';
import {
  CreateWebhookEndpointRequest,
  type CreateWebhookEndpointResponse,
  type WebhookEndpointsResponse,
} from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { endpointToView, webhookService } from '@/server/modules/webhooks';
import { ApiError, apiHandler, parseBody } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** GET /v1/webhooks/endpoints — the org's webhook subscriptions (no secrets) (P5-03). */
export async function GET(request: Request) {
  return apiHandler(request, async ({ orgId }) => {
    const endpoints = await withOrgScope(getAppDb(), orgId, (tx) =>
      webhookService.listEndpoints(tx, orgId),
    );
    const body: WebhookEndpointsResponse = { endpoints: endpoints.map(endpointToView) };
    return NextResponse.json(body);
  });
}

/**
 * POST /v1/webhooks/endpoints — subscribe an endpoint to events. OWNER/ADMIN only (webhooks leave the
 * trust boundary). The signing `secret` is returned ONCE here and never again.
 */
export async function POST(request: Request) {
  return apiHandler(request, async ({ orgId, role }) => {
    if (role !== 'OWNER' && role !== 'ADMIN') {
      throw new ApiError(403, 'FORBIDDEN', 'Only an owner or admin can manage webhooks.');
    }
    const input = await parseBody(request, CreateWebhookEndpointRequest);
    const { endpoint, secret } = await withOrgScope(getAppDb(), orgId, (tx) =>
      webhookService.createEndpoint(tx, {
        orgId,
        url: input.url,
        eventTypes: input.eventTypes,
        ...(input.description !== undefined ? { description: input.description } : {}),
      }),
    );
    const body: CreateWebhookEndpointResponse = { endpoint: endpointToView(endpoint), secret };
    return NextResponse.json(body, { status: 201 });
  });
}
