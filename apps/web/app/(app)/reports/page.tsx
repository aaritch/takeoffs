import { Card, Stack } from '@takeoff/ui';

export default function ReportsPage() {
  return (
    <Stack gap="lg">
      <h1>Reports</h1>
      <Card title="Reports & exports">
        <p className="muted">
          Generate summary, detailed, by-trade, and marked-plan exports whose numbers match the
          on-screen rollups exactly. Export generation lands in Phase 1 (P1-13).
        </p>
      </Card>
    </Stack>
  );
}
