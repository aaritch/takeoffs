import { Card, Stack } from '@takeoff/ui';

export default function OrdersPage() {
  return (
    <Stack gap="lg">
      <h1>Orders</h1>
      <Card title="Managed-service orders">
        <p className="muted">
          Order a completed takeoff from the service team, then track it through assignment, QA, and
          delivery. The managed-service marketplace lands in Phase 3.
        </p>
      </Card>
    </Stack>
  );
}
