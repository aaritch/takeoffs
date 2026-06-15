import { Stack } from '@takeoff/ui';
import { ProjectForm } from './_components/project-form';

export default function ProjectsPage() {
  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <h1>Projects</h1>
        <p className="muted">
          Create a project, then upload plan sets and open the viewer to measure quantities. Upload
          + viewer land in Phase 1 (P1-01, P1-06).
        </p>
      </Stack>
      <ProjectForm />
    </Stack>
  );
}
