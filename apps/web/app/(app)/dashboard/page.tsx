import { Card, Stack } from '@takeoff/ui';

export default function DashboardPage() {
  return (
    <Stack gap="lg">
      <h1>Dashboard</h1>
      <Card title="Welcome">
        <p className="muted">
          Your projects, recent takeoffs, and processing status will appear here. The app shell and
          design system are in place; data-backed views arrive once auth and the hosted database are
          wired.
        </p>
      </Card>
    </Stack>
  );
}
