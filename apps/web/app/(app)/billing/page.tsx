import { Card, Stack } from '@takeoff/ui';

export default function BillingPage() {
  return (
    <Stack gap="lg">
      <h1>Billing</h1>
      <Card title="Plan & usage">
        <p className="muted">
          Manage your subscription and seats, view usage and quotas, and handle retainers. Billing
          lands in Phase 4.
        </p>
      </Card>
    </Stack>
  );
}
