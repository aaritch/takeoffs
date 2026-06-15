import {
  Badge,
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  Select,
  Stack,
  Textarea,
  tokens,
} from '@takeoff/ui';

export const metadata = { title: 'UI preview · Takeoff Platform' };

/**
 * A living gallery of every @takeoff/ui primitive — a dev tool for visual checks as the design
 * system grows (not part of the product app shell). Static/server-rendered.
 */
export default function UiPreviewPage() {
  return (
    <main className="shell" style={{ maxWidth: '56rem' }}>
      <Stack gap="xl">
        <Stack gap="sm">
          <h1>Design system preview</h1>
          <p className="muted">Every @takeoff/ui primitive, rendered for visual review.</p>
        </Stack>

        <Card title="Buttons">
          <Stack gap="md">
            {(['primary', 'secondary', 'ghost'] as const).map((variant) => (
              <Stack key={variant} direction="row" gap="sm" align="center">
                <Button variant={variant} size="sm">
                  {variant} sm
                </Button>
                <Button variant={variant} size="md">
                  {variant} md
                </Button>
                <Button variant={variant} disabled>
                  disabled
                </Button>
              </Stack>
            ))}
          </Stack>
        </Card>

        <Card title="Badges">
          <Stack direction="row" gap="sm" align="center">
            <Badge>neutral</Badge>
            <Badge tone="primary">primary</Badge>
            <Badge tone="danger">danger</Badge>
          </Stack>
        </Card>

        <Card title="Forms">
          <Stack gap="md">
            <Field label="Project name" htmlFor="p-name" required hint="Shown on reports">
              <Input id="p-name" defaultValue="Riverside Office Build" />
            </Field>
            <Field label="Trade" htmlFor="p-trade">
              <Select id="p-trade" defaultValue="03">
                <option value="03">Concrete</option>
                <option value="04">Masonry</option>
                <option value="09">Finishes</option>
              </Select>
            </Field>
            <Field label="Scope notes" htmlFor="p-notes">
              <Textarea id="p-notes" placeholder="Anything the estimator should know…" />
            </Field>
            <Field label="Unit" htmlFor="p-unit" error="SF is not valid for a LINEAR condition">
              <Input id="p-unit" defaultValue="SF" invalid />
            </Field>
            <label style={{ display: 'flex', gap: tokens.space.sm, alignItems: 'center' }}>
              <Checkbox defaultChecked /> Include waste factor
            </label>
          </Stack>
        </Card>

        <Card title="Color tokens">
          <Stack direction="row" gap="md">
            {Object.entries(tokens.color).map(([name, value]) => (
              <Stack key={name} gap="xs" align="center">
                <div
                  style={{
                    width: '3rem',
                    height: '3rem',
                    borderRadius: tokens.radius.md,
                    background: value,
                    border: `1px solid ${tokens.color.border}`,
                  }}
                />
                <span className="muted" style={{ fontSize: tokens.fontSize.sm }}>
                  {name}
                </span>
              </Stack>
            ))}
          </Stack>
        </Card>

        <Card title="Spacing scale">
          <Stack gap="sm">
            {Object.entries(tokens.space).map(([name, value]) => (
              <Stack key={name} direction="row" gap="md" align="center">
                <span className="muted" style={{ width: '2rem', fontSize: tokens.fontSize.sm }}>
                  {name}
                </span>
                <div
                  style={{ height: '0.75rem', width: value, background: tokens.color.primary }}
                />
                <span className="muted" style={{ fontSize: tokens.fontSize.sm }}>
                  {value}
                </span>
              </Stack>
            ))}
          </Stack>
        </Card>
      </Stack>
    </main>
  );
}
