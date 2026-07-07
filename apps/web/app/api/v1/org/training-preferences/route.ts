import { NextResponse } from 'next/server';
import type { TrainingPreferencesResponse } from '@takeoff/contracts';
import { UpdateTrainingPreferencesRequest } from '@takeoff/contracts';
import { getDb } from '@/server/data/client';
import { accountsService } from '@/server/modules/accounts';
import { apiHandler, parseBody } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** GET /v1/org/training-preferences — read the org's training-data opt-out (any member). */
export async function GET(request: Request) {
  return apiHandler(request, async ({ orgId }) => {
    const trainingOptOut = await accountsService.getTrainingOptOut(getDb(), orgId);
    const body: TrainingPreferencesResponse = { preferences: { trainingOptOut } };
    return NextResponse.json(body);
  });
}

/**
 * PATCH /v1/org/training-preferences — opt the org in/out of training use of its feedback (P4-05).
 * OWNER-gated (`billing:manage`). Flips the flag only; the offline pipeline honors it at assembly.
 */
export async function PATCH(request: Request) {
  return apiHandler(request, async ({ orgId, userId }) => {
    const { trainingOptOut } = await parseBody(request, UpdateTrainingPreferencesRequest);
    const updated = await accountsService.setTrainingOptOut(getDb(), {
      orgId,
      actorUserId: userId,
      optOut: trainingOptOut,
    });
    const body: TrainingPreferencesResponse = { preferences: { trainingOptOut: updated } };
    return NextResponse.json(body);
  });
}
