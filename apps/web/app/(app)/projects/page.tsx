import { Card, Stack } from '@takeoff/ui';

export default function ProjectsPage() {
  return (
    <Stack gap="lg">
      <h1>Projects</h1>
      <Card title="Projects & plan sets">
        <p className="muted">
          Create projects, upload plan sets, track processing, and open the plan viewer to measure
          quantities. Upload + viewer land in Phase 1 (P1-01, P1-06).
        </p>
      </Card>
    </Stack>
  );
}
