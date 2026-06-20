import type { MeasurementGeometry } from '@takeoff/contracts';
import type { OverlayMeasurement } from './hit-test';

/**
 * Session-scoped undo/redo (P1-12) — a pure command stack over the reversible editing actions.
 *
 * Each action is recorded as a {@link EditCommand} that knows how to project FORWARD (`do`) and
 * BACKWARD (`undo`) over the local measurement set. The transitions and the projection are pure so
 * a mixed sequence of edits is exhaustively testable headlessly; the SheetViewer maps each command
 * to the matching server op (and reconciles optimistic failures — quantities stay server-authoritative).
 *
 * Deletes are soft on the server, so undo-delete / redo-create restore the SAME row id — the whole
 * history keeps stable ids and never accumulates phantom geometry.
 */

export type EditCommand =
  | { kind: 'CREATE'; measurement: OverlayMeasurement }
  | { kind: 'DELETE'; measurement: OverlayMeasurement }
  | { kind: 'EDIT_GEOMETRY'; id: string; before: MeasurementGeometry; after: MeasurementGeometry }
  | { kind: 'RECLASSIFY'; id: string; before: string; after: string };

export type Direction = 'do' | 'undo';

export interface History {
  readonly undo: readonly EditCommand[];
  readonly redo: readonly EditCommand[];
}

export const emptyHistory: History = { undo: [], redo: [] };

export const canUndo = (h: History): boolean => h.undo.length > 0;
export const canRedo = (h: History): boolean => h.redo.length > 0;

/** Record a freshly-applied command: it becomes the next undo, and the redo branch is discarded. */
export function record(h: History, cmd: EditCommand): History {
  return { undo: [...h.undo, cmd], redo: [] };
}

/** Pop the last command for undo (moving it to the redo stack), or null when there's nothing to undo. */
export function undo(h: History): { history: History; command: EditCommand } | null {
  if (h.undo.length === 0) return null;
  const command = h.undo[h.undo.length - 1]!;
  return { history: { undo: h.undo.slice(0, -1), redo: [...h.redo, command] }, command };
}

/** Pop the last command for redo (moving it back to the undo stack), or null when there's nothing to redo. */
export function redo(h: History): { history: History; command: EditCommand } | null {
  if (h.redo.length === 0) return null;
  const command = h.redo[h.redo.length - 1]!;
  return { history: { undo: [...h.undo, command], redo: h.redo.slice(0, -1) }, command };
}

const without = (ms: readonly OverlayMeasurement[], id: string): OverlayMeasurement[] =>
  ms.filter((m) => m.id !== id);

const patch = (
  ms: readonly OverlayMeasurement[],
  id: string,
  fn: (m: OverlayMeasurement) => OverlayMeasurement,
): OverlayMeasurement[] => ms.map((m) => (m.id === id ? fn(m) : m));

/**
 * Optimistic local projection of a command. `do` applies the action; `undo` applies its inverse.
 * This mirrors what the server will confirm — the SheetViewer reverts to the prior snapshot if the
 * matching server op fails, so a failed sync never leaves phantom geometry.
 */
/**
 * Decide the set to keep after an optimistic projection: the projected set when the server
 * confirmed the edit, otherwise the pre-edit `snapshot`. This is the reconciliation that guarantees
 * a failed sync never leaves phantom geometry (the P1-12 caveat).
 */
export function reconcile(
  snapshot: OverlayMeasurement[],
  projected: OverlayMeasurement[],
  confirmed: boolean,
): OverlayMeasurement[] {
  return confirmed ? projected : snapshot;
}

export function project(
  measurements: readonly OverlayMeasurement[],
  cmd: EditCommand,
  direction: Direction,
): OverlayMeasurement[] {
  switch (cmd.kind) {
    case 'CREATE':
      return direction === 'do'
        ? [...without(measurements, cmd.measurement.id), cmd.measurement]
        : without(measurements, cmd.measurement.id);
    case 'DELETE':
      return direction === 'do'
        ? without(measurements, cmd.measurement.id)
        : [...without(measurements, cmd.measurement.id), cmd.measurement];
    case 'EDIT_GEOMETRY': {
      const geometry = direction === 'do' ? cmd.after : cmd.before;
      return patch(measurements, cmd.id, (m) => ({ ...m, geometry }));
    }
    case 'RECLASSIFY': {
      const conditionId = direction === 'do' ? cmd.after : cmd.before;
      return patch(measurements, cmd.id, (m) => ({ ...m, conditionId }));
    }
  }
}
