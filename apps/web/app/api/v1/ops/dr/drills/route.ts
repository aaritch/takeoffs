import { NextResponse } from 'next/server';
import type { DrillRunsResponse, RunDrillResponse } from '@takeoff/contracts';
import { getDb } from '@/server/data/client';
import { drService, drillReportToView, drillRunToView } from '@/server/modules/dr';
import { platformHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** GET /v1/ops/dr/drills — DR drill history (last runs), so the schedule is auditable (P5-01). */
export async function GET(request: Request) {
  return platformHandler(
    request,
    async () => {
      const runs = await drService.listRuns(getDb());
      const body: DrillRunsResponse = { runs: runs.map(drillRunToView) };
      return NextResponse.json(body);
    },
    { roles: ['PLATFORM_ADMIN'] },
  );
}

/**
 * POST /v1/ops/dr/drills — run a restore drill now and record it. PLATFORM_ADMIN only. A scheduler
 * (cron) hits this periodically; the drill runs on a safe temp canary and never touches real data.
 */
export async function POST(request: Request) {
  return platformHandler(
    request,
    async () => {
      const { report, run } = await drService.runAndRecord(getDb());
      const body: RunDrillResponse = {
        report: drillReportToView(report),
        run: drillRunToView(run),
      };
      return NextResponse.json(body, { status: report.status === 'PASSED' ? 200 : 500 });
    },
    { roles: ['PLATFORM_ADMIN'] },
  );
}
