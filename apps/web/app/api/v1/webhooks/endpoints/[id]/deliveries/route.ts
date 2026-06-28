import { NextResponse } from 'next/server';
import type { WebhookDeliveriesResponse } from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { deliveryToView, webhookService } from '@/server/modules/webhooks';
import { apiHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** GET /v1/webhooks/endpoints/{id}/deliveries — delivery attempts (status/retries) for an endpoint. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const deliveries = await withOrgScope(getAppDb(), orgId, (tx) =>
      webhookService.listDeliveries(tx, id),
    );
    const body: WebhookDeliveriesResponse = { deliveries: deliveries.map(deliveryToView) };
    return NextResponse.json(body);
  });
}
