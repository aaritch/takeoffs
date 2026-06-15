import { Badge, Button, Card, Stack } from '@takeoff/ui';

export default function HomePage() {
  return (
    <main className="shell">
      <Stack gap="lg">
        <Stack gap="sm">
          <h1>Takeoff Platform</h1>
          <p className="muted">AI-assisted construction quantity takeoff.</p>
        </Stack>

        <Card title="Status">
          <Stack gap="sm">
            <Stack direction="row" gap="sm" align="center">
              <Badge tone="primary">App shell</Badge>
              <span className="muted">live</span>
            </Stack>
            <p className="muted">
              Sign-in, the plan viewer, and takeoff tools land in upcoming work. The design system (
              <code>@takeoff/ui</code>) is wired up — this card and button are from it.
            </p>
            <Stack direction="row" gap="sm">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
            </Stack>
          </Stack>
        </Card>

        <p className="muted">
          Health check: <a href="/api/health">/api/health</a>
        </p>
      </Stack>
    </main>
  );
}
