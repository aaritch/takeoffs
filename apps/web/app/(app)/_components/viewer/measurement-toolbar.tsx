'use client';

import { useState, type FormEvent } from 'react';
import { Badge, Button, Input, Select, Stack } from '@takeoff/ui';
import { MeasurementType, Unit, isUnitValidFor, type ConditionView } from '@takeoff/contracts';
import type { LiveQuantity, ToolKind } from './drawing';

/**
 * Measurement toolbar (P1-09) — pick a tool, the active condition (or make one), calibrate the
 * scale, and watch the live readout. Presentational: the SheetViewer owns the data + commits.
 */

export type ToolMode = ToolKind | 'SELECT';

const TOOL_LABEL: Record<ToolMode, string> = {
  SELECT: 'Select',
  LINEAR: 'Line',
  AREA: 'Area',
  COUNT: 'Count',
};
const DRAW_TOOLS: ToolMode[] = ['SELECT', 'LINEAR', 'AREA', 'COUNT'];
const DEFAULT_UNIT: Record<'LINEAR' | 'AREA' | 'COUNT', (typeof Unit.options)[number]> = {
  LINEAR: 'LF',
  AREA: 'SF',
  COUNT: 'EA',
};

function readoutText(r: LiveQuantity): string {
  if (r.kind === 'count') return `${r.geometric} pt`;
  const unit = r.kind === 'length' ? 'ft' : 'sq ft';
  return r.real !== undefined
    ? `${r.real.toFixed(r.kind === 'length' ? 1 : 0)} ${unit}`
    : `${r.geometric.toFixed(0)} px (set scale for ${unit})`;
}

export function MeasurementToolbar({
  tool,
  onToolChange,
  conditions,
  activeConditionId,
  onActiveConditionChange,
  onNewCondition,
  onCalibrate,
  calibrating,
  scaleConfirmed,
  readout,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  canDelete,
  onDelete,
}: {
  tool: ToolMode;
  onToolChange: (t: ToolMode) => void;
  conditions: ConditionView[];
  activeConditionId: string | null;
  onActiveConditionChange: (id: string) => void;
  onNewCondition: (input: { name: string; measurementType: string; unit: string }) => void;
  onCalibrate: () => void;
  calibrating: boolean;
  scaleConfirmed: boolean;
  readout: LiveQuantity | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<'LINEAR' | 'AREA' | 'COUNT'>('LINEAR');
  const [unit, setUnit] = useState<string>('LF');

  const submitNew = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onNewCondition({ name: name.trim(), measurementType: type, unit });
    setName('');
    setAdding(false);
  };

  return (
    <Stack gap="sm">
      <Stack direction="row" gap="sm">
        {DRAW_TOOLS.map((t) => (
          <Button
            key={t}
            size="sm"
            variant={tool === t && !calibrating ? 'primary' : 'secondary'}
            onClick={() => onToolChange(t)}
          >
            {TOOL_LABEL[t]}
          </Button>
        ))}
        <Button size="sm" variant={calibrating ? 'primary' : 'secondary'} onClick={onCalibrate}>
          {scaleConfirmed ? 'Recalibrate' : 'Set scale'}
        </Button>
        {scaleConfirmed ? (
          <Badge tone="primary">scale set</Badge>
        ) : (
          <Badge tone="danger">no scale</Badge>
        )}
        {readout ? <Badge tone="neutral">{readoutText(readout)}</Badge> : null}
        <span style={{ flex: 1 }} />
        <Button size="sm" variant="secondary" onClick={onUndo} disabled={!canUndo}>
          Undo
        </Button>
        <Button size="sm" variant="secondary" onClick={onRedo} disabled={!canRedo}>
          Redo
        </Button>
        <Button size="sm" variant="secondary" onClick={onDelete} disabled={!canDelete}>
          Delete
        </Button>
      </Stack>

      <Stack direction="row" gap="sm">
        <span className="muted">Condition:</span>
        <Select
          value={activeConditionId ?? ''}
          onChange={(e) => onActiveConditionChange(e.target.value)}
          aria-label="Active condition"
        >
          <option value="" disabled>
            {conditions.length ? 'Choose…' : 'None — add one'}
          </option>
          {conditions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.measurementType.toLowerCase()})
            </option>
          ))}
        </Select>
        <Button size="sm" variant="secondary" onClick={() => setAdding((v) => !v)}>
          + New
        </Button>
      </Stack>

      {adding ? (
        <form onSubmit={submitNew}>
          <Stack direction="row" gap="sm">
            <Input
              placeholder="Condition name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="New condition name"
            />
            <Select
              value={type}
              onChange={(e) => {
                const t = e.target.value as 'LINEAR' | 'AREA' | 'COUNT';
                setType(t);
                setUnit(DEFAULT_UNIT[t]);
              }}
              aria-label="Measurement type"
            >
              {(['LINEAR', 'AREA', 'COUNT'] as const).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <Select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit">
              {Unit.options
                .filter((u) => isUnitValidFor(MeasurementType.parse(type), u))
                .map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
            </Select>
            <Button size="sm" type="submit">
              Add
            </Button>
          </Stack>
        </form>
      ) : null}
    </Stack>
  );
}
