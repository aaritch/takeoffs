import { describe, expect, it } from 'vitest';
import type { MeasurementGeometry } from '@takeoff/contracts';
import type { OverlayMeasurement } from './hit-test';
import {
  canRedo,
  canUndo,
  emptyHistory,
  project,
  reconcile,
  record,
  redo,
  undo,
  type EditCommand,
  type Direction,
  type History,
} from './history';

const line = (pts: [number, number][]): MeasurementGeometry => ({
  type: 'POLYLINE',
  points: pts.map(([x, y]) => ({ x, y })),
});
const m = (
  id: string,
  conditionId = 'c1',
  geometry = line([
    [0, 0],
    [10, 0],
  ]),
): OverlayMeasurement => ({
  id,
  conditionId,
  geometry,
});

/** Replay a script of (command, direction) projections from a starting set. */
function replay(
  start: OverlayMeasurement[],
  steps: [EditCommand, Direction][],
): OverlayMeasurement[] {
  return steps.reduce((ms, [cmd, dir]) => project(ms, cmd, dir), start);
}
const ids = (ms: OverlayMeasurement[]) => ms.map((x) => x.id).sort();

describe('history stack', () => {
  it('record pushes to undo and clears the redo branch', () => {
    const a: EditCommand = { kind: 'CREATE', measurement: m('a') };
    const b: EditCommand = { kind: 'CREATE', measurement: m('b') };
    let h: History = record(record(emptyHistory, a), b);
    expect(canUndo(h)).toBe(true);
    expect(canRedo(h)).toBe(false);

    // Undo once, then a new edit must discard the redo branch.
    h = undo(h)!.history;
    expect(canRedo(h)).toBe(true);
    h = record(h, { kind: 'CREATE', measurement: m('c') });
    expect(canRedo(h)).toBe(false);
    expect(h.undo.map((c) => (c.kind === 'CREATE' ? c.measurement.id : '?'))).toEqual(['a', 'c']);
  });

  it('undo/redo are no-ops on empty stacks', () => {
    expect(undo(emptyHistory)).toBeNull();
    expect(redo(emptyHistory)).toBeNull();
  });

  it('undo then redo returns the same command and round-trips the stacks', () => {
    const cmd: EditCommand = { kind: 'DELETE', measurement: m('x') };
    const h0 = record(emptyHistory, cmd);
    const u = undo(h0)!;
    expect(u.command).toBe(cmd);
    expect(canUndo(u.history)).toBe(false);
    const r = redo(u.history)!;
    expect(r.command).toBe(cmd);
    expect(r.history).toEqual(h0);
  });
});

describe('project (optimistic local state)', () => {
  it('CREATE adds on do and removes on undo', () => {
    const cmd: EditCommand = { kind: 'CREATE', measurement: m('a') };
    expect(ids(project([], cmd, 'do'))).toEqual(['a']);
    expect(ids(project([m('a')], cmd, 'undo'))).toEqual([]);
  });

  it('DELETE removes on do and restores the same row on undo', () => {
    const cmd: EditCommand = { kind: 'DELETE', measurement: m('a') };
    expect(ids(project([m('a'), m('b')], cmd, 'do'))).toEqual(['b']);
    expect(ids(project([m('b')], cmd, 'undo'))).toEqual(['a', 'b']);
  });

  it('EDIT_GEOMETRY swaps geometry both ways', () => {
    const before = line([
      [0, 0],
      [10, 0],
    ]);
    const after = line([
      [0, 0],
      [20, 0],
    ]);
    const cmd: EditCommand = { kind: 'EDIT_GEOMETRY', id: 'a', before, after };
    const done = project([m('a', 'c1', before)], cmd, 'do');
    expect(done[0]!.geometry).toEqual(after);
    expect(project(done, cmd, 'undo')[0]!.geometry).toEqual(before);
  });

  it('RECLASSIFY swaps the condition both ways', () => {
    const cmd: EditCommand = { kind: 'RECLASSIFY', id: 'a', before: 'c1', after: 'c2' };
    expect(project([m('a', 'c1')], cmd, 'do')[0]!.conditionId).toBe('c2');
    expect(project([m('a', 'c2')], cmd, 'undo')[0]!.conditionId).toBe('c1');
  });

  it('reconcile keeps the projection on success and reverts to the snapshot on a failed sync', () => {
    const snapshot = [m('a')];
    const cmd: EditCommand = { kind: 'DELETE', measurement: m('a') };
    const projected = project(snapshot, cmd, 'do'); // optimistic removal

    // Server confirmed → keep the optimistic result.
    expect(ids(reconcile(snapshot, projected, true))).toEqual([]);
    // Server failed → revert; no phantom geometry, state stays consistent.
    expect(ids(reconcile(snapshot, projected, false))).toEqual(['a']);
  });

  it('a mixed sequence undoes and redoes in correct order, converging to a consistent set', () => {
    const create = (id: string): EditCommand => ({ kind: 'CREATE', measurement: m(id) });
    const del = (id: string): EditCommand => ({ kind: 'DELETE', measurement: m(id) });

    // do: +a +b +c, then delete b  →  {a, c}
    const forward: [EditCommand, Direction][] = [
      [create('a'), 'do'],
      [create('b'), 'do'],
      [create('c'), 'do'],
      [del('b'), 'do'],
    ];
    const end = replay([], forward);
    expect(ids(end)).toEqual(['a', 'c']);

    // undo the delete (b back), undo +c, undo +b  →  {a}
    const rewound = replay(end, [
      [del('b'), 'undo'],
      [create('c'), 'undo'],
      [create('b'), 'undo'],
    ]);
    expect(ids(rewound)).toEqual(['a']);

    // redo +b, redo +c  →  {a, b, c}
    const redone = replay(rewound, [
      [create('b'), 'do'],
      [create('c'), 'do'],
    ]);
    expect(ids(redone)).toEqual(['a', 'b', 'c']);
  });
});
