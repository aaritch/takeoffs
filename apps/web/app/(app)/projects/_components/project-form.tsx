'use client';

import { useState, type FormEvent } from 'react';
import { Badge, Button, Card, Field, Input, Select, Stack } from '@takeoff/ui';
import { CreateProjectRequest, ProjectType } from '@takeoff/contracts';

const EMPTY = {
  name: '',
  client_name: '',
  location_text: '',
  project_type: 'RESIDENTIAL',
  bid_due_at: '',
};

type FieldErrors = Partial<Record<string, string>>;

/**
 * Create-project form. Validates with the shared `CreateProjectRequest` contract — the exact
 * schema the API route will use server-side. There's no backend yet (no auth/org context), so a
 * valid submit shows a labeled preview rather than persisting.
 */
export function ProjectForm() {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [preview, setPreview] = useState<CreateProjectRequest | null>(null);

  const set = (field: keyof typeof EMPTY, value: string) =>
    setValues((prev) => ({ ...prev, [field]: value }));

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = CreateProjectRequest.safeParse({
      name: values.name,
      client_name: values.client_name || undefined,
      location_text: values.location_text || undefined,
      project_type: values.project_type,
      bid_due_at: values.bid_due_at || undefined,
    });

    if (!result.success) {
      const next: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = String(issue.path[0] ?? '');
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      setPreview(null);
      return;
    }
    setErrors({});
    setPreview(result.data);
  }

  return (
    <Stack gap="lg">
      <Card title="New project">
        <form onSubmit={onSubmit} noValidate>
          <Stack gap="md">
            <Field label="Project name" htmlFor="name" required error={errors.name}>
              <Input
                id="name"
                value={values.name}
                onChange={(e) => set('name', e.target.value)}
                invalid={Boolean(errors.name)}
              />
            </Field>
            <Field label="Client" htmlFor="client_name">
              <Input
                id="client_name"
                value={values.client_name}
                onChange={(e) => set('client_name', e.target.value)}
              />
            </Field>
            <Field label="Location" htmlFor="location_text">
              <Input
                id="location_text"
                value={values.location_text}
                onChange={(e) => set('location_text', e.target.value)}
              />
            </Field>
            <Field label="Type" htmlFor="project_type">
              <Select
                id="project_type"
                value={values.project_type}
                onChange={(e) => set('project_type', e.target.value)}
              >
                {ProjectType.options.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Bid due" htmlFor="bid_due_at" hint="Optional" error={errors.bid_due_at}>
              <Input
                id="bid_due_at"
                type="date"
                value={values.bid_due_at}
                onChange={(e) => set('bid_due_at', e.target.value)}
                invalid={Boolean(errors.bid_due_at)}
              />
            </Field>
            <Stack direction="row" gap="sm">
              <Button type="submit">Create project</Button>
            </Stack>
          </Stack>
        </form>
      </Card>

      {preview ? (
        <Card title="Validated">
          <Stack gap="sm">
            <Badge tone="primary">Preview — not saved</Badge>
            <p className="muted">
              The input passed validation. Projects persist once the API route and sign-in (org
              context) are wired.
            </p>
            <pre style={{ margin: 0, overflowX: 'auto' }}>{JSON.stringify(preview, null, 2)}</pre>
          </Stack>
        </Card>
      ) : null}
    </Stack>
  );
}
