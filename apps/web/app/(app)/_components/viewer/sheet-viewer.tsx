'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Input, Stack } from '@takeoff/ui';
import type {
  ConditionView,
  MeasurementGeometry,
  MeasurementView,
  SheetView,
} from '@takeoff/contracts';
import { CandidateReviewBar } from './candidate-review-bar';
import { LayeredViewer } from './layered-viewer';
import { MeasurementToolbar, type ToolMode } from './measurement-toolbar';
import type { OverlayMeasurement } from './hit-test';
import type { LiveQuantity } from './drawing';
import {
  canRedo,
  canUndo,
  emptyHistory,
  project,
  reconcile,
  record,
  redo,
  undo,
  type Direction,
  type EditCommand,
} from './history';

/**
 * Sheet viewer page body (P1-06/07/09/12): fetches the sheet + its conditions + measurements, then
 * renders the deep-zoom viewer with the measurement toolbar and session-scoped undo/redo wired
 * end-to-end. Edits apply optimistically and reconcile with the server — quantities stay
 * server-authoritative, and a failed sync reverts the local set rather than leaving phantom geometry.
 */

function toOverlay(m: MeasurementView): OverlayMeasurement {
  return {
    id: m.id,
    conditionId: m.conditionId,
    geometry: m.geometry,
    // An UNREVIEWED AI candidate renders dashed/translucent; manual + reviewed rows render solid.
    isCandidate: m.source === 'AI' && m.reviewStatus === 'UNREVIEWED',
    confidence: m.aiConfidence,
  };
}

/** The drawing tool / measurement type a geometry corresponds to. */
function geomToType(t: MeasurementGeometry['type']): 'LINEAR' | 'AREA' | 'COUNT' {
  return t === 'POLYGON' ? 'AREA' : t === 'POLYLINE' ? 'LINEAR' : 'COUNT';
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`status ${r.status}`);
  return (await r.json()) as T;
}

/** The server call that effects a command in a direction (do=redo/forward, undo=inverse). */
function serverCall(cmd: EditCommand, direction: Direction): Promise<Response> {
  const del = (id: string) => fetch(`/api/v1/measurements/${id}`, { method: 'DELETE' });
  const restore = (id: string) => fetch(`/api/v1/measurements/${id}/restore`, { method: 'POST' });
  // CREATE: forward = the row exists (restore after an undo); inverse = soft-delete.
  // DELETE: forward = soft-delete; inverse = restore.
  if (cmd.kind === 'CREATE')
    return direction === 'do' ? restore(cmd.measurement.id) : del(cmd.measurement.id);
  if (cmd.kind === 'DELETE')
    return direction === 'do' ? del(cmd.measurement.id) : restore(cmd.measurement.id);
  return Promise.reject(new Error(`Unsupported command ${cmd.kind}`));
}

export function SheetViewer({ sheetId }: { sheetId: string }) {
  const [sheet, setSheet] = useState<SheetView | null>(null);
  const [conditions, setConditions] = useState<ConditionView[]>([]);
  const [measurements, setMeasurements] = useState<OverlayMeasurement[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [tool, setTool] = useState<ToolMode>('SELECT');
  const [activeConditionId, setActiveConditionId] = useState<string | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const [readout, setReadout] = useState<LiveQuantity | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [history, setHistory] = useState(emptyHistory);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bulkPercent, setBulkPercent] = useState(80);

  // Mirror the live set into a ref so optimistic reverts can snapshot it synchronously.
  const measurementsRef = useRef(measurements);
  measurementsRef.current = measurements;

  const loadSheet = useCallback(
    () => getJson<{ sheet: SheetView }>(`/api/v1/sheets/${sheetId}`).then((d) => setSheet(d.sheet)),
    [sheetId],
  );
  const loadConditions = useCallback(
    () =>
      getJson<{ conditions: ConditionView[] }>(`/api/v1/sheets/${sheetId}/conditions`).then((d) =>
        setConditions(d.conditions),
      ),
    [sheetId],
  );
  const loadMeasurements = useCallback(
    () =>
      getJson<{ measurements: MeasurementView[] }>(`/api/v1/sheets/${sheetId}/measurements`).then(
        // Rejected candidates are kept server-side (with feedback) but not drawn.
        (d) =>
          setMeasurements(
            d.measurements.filter((m) => m.reviewStatus !== 'REJECTED').map(toOverlay),
          ),
      ),
    [sheetId],
  );

  useEffect(() => {
    let active = true;
    Promise.all([loadSheet(), loadConditions(), loadMeasurements()]).catch((e: unknown) => {
      if (active) setError(e instanceof Error ? e.message : 'Failed to load sheet');
    });
    return () => {
      active = false;
    };
  }, [loadSheet, loadConditions, loadMeasurements]);

  // Default the active condition to the first one once conditions load.
  useEffect(() => {
    setActiveConditionId((prev) => prev ?? conditions[0]?.id ?? null);
  }, [conditions]);

  const scaleConfirmed = sheet?.scaleStatus === 'CONFIRMED';

  /** Apply a command optimistically and reconcile with the server; revert + notify on failure. */
  const applyEdit = useCallback(
    async (cmd: EditCommand, direction: Direction): Promise<boolean> => {
      const snapshot = measurementsRef.current;
      const projected = project(snapshot, cmd, direction);
      setMeasurements(projected); // optimistic
      let confirmed = false;
      try {
        const r = await serverCall(cmd, direction);
        confirmed = r.ok;
      } catch {
        confirmed = false;
      }
      setMeasurements(reconcile(snapshot, projected, confirmed));
      if (!confirmed) setNotice('Could not sync that change — reverted.');
      return confirmed;
    },
    [],
  );

  const handleCommit = useCallback(
    (geometry: MeasurementGeometry) => {
      // Calibration reuses the line tool: two points + a real length define the sheet scale.
      if (calibrating) {
        if (geometry.type !== 'POLYLINE' || geometry.points.length < 2) return;
        const answer = window.prompt('Real length between the two points, in feet:');
        const realLength = answer ? Number(answer) : NaN;
        if (!Number.isFinite(realLength) || realLength <= 0) {
          setNotice('Calibration cancelled — enter a positive length.');
          setCalibrating(false);
          setTool('SELECT');
          return;
        }
        void fetch(`/api/v1/sheets/${sheetId}/scale`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            p1: geometry.points[0],
            p2: geometry.points[1],
            realLength,
            lengthUnit: 'FEET',
            units: 'IMPERIAL',
          }),
        })
          .then((r) => (r.ok ? loadSheet() : Promise.reject(new Error(`scale ${r.status}`))))
          .then(() => setNotice('Scale set.'))
          .catch(() => setNotice('Could not set scale.'))
          .finally(() => {
            setCalibrating(false);
            setTool('SELECT');
          });
        return;
      }

      // Redraw mode (edit-geometry): the new outline replaces the selected candidate's geometry via
      // PATCH, so the server recomputes its quantity and writes EDIT_GEOMETRY feedback (P2-10).
      if (editingId) {
        void fetch(`/api/v1/measurements/${editingId}/geometry`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ geometry }),
        })
          .then((r) => (r.ok ? loadMeasurements() : Promise.reject(new Error(`edit ${r.status}`))))
          .then(() => {
            setEditingId(null);
            setSelectedIds([]);
            setNotice('Geometry updated.');
          })
          .catch(() => setNotice('Could not update geometry.'));
        return;
      }

      if (!activeConditionId) {
        setNotice('Pick or create a condition before drawing.');
        return;
      }
      // Create is server-first so we never record a phantom: the row's id comes back, then we
      // append it locally and push a CREATE onto the undo stack.
      void fetch(`/api/v1/conditions/${activeConditionId}/measurements`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sheetId, geometry }),
      })
        .then((r) =>
          r.ok
            ? (r.json() as Promise<{ measurement: MeasurementView }>)
            : Promise.reject(new Error(`commit ${r.status}`)),
        )
        .then(({ measurement }) => {
          const ov = toOverlay(measurement);
          setMeasurements((ms) => [...ms, ov]);
          setHistory((h) => record(h, { kind: 'CREATE', measurement: ov }));
          setNotice(null);
        })
        .catch(() => setNotice('Could not save measurement.'));
    },
    [calibrating, editingId, activeConditionId, sheetId, loadSheet, loadMeasurements],
  );

  const handleDelete = useCallback(async () => {
    const targets = measurementsRef.current.filter((m) => selectedIds.includes(m.id));
    for (const measurement of targets) {
      const cmd: EditCommand = { kind: 'DELETE', measurement };
      // Sequential awaits keep each optimistic snapshot clean (one in-flight edit at a time).
      if (await applyEdit(cmd, 'do')) setHistory((h) => record(h, cmd));
    }
    setSelectedIds([]);
  }, [selectedIds, applyEdit]);

  const handleUndo = useCallback(async () => {
    const step = undo(history);
    if (!step) return;
    if (await applyEdit(step.command, 'undo')) setHistory(step.history);
  }, [history, applyEdit]);

  const handleRedo = useCallback(async () => {
    const step = redo(history);
    if (!step) return;
    if (await applyEdit(step.command, 'do')) setHistory(step.history);
  }, [history, applyEdit]);

  // Keyboard: Ctrl/Cmd+Z undo, Ctrl+Y or Ctrl/Cmd+Shift+Z redo — but never while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        void handleUndo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        void handleRedo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleUndo, handleRedo]);

  const handleNewCondition = useCallback(
    (input: { name: string; measurementType: string; unit: string }) => {
      void fetch(`/api/v1/sheets/${sheetId}/conditions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      })
        .then((r) =>
          r.ok
            ? (r.json() as Promise<{ condition: ConditionView }>)
            : Promise.reject(new Error(`condition ${r.status}`)),
        )
        .then((d) => loadConditions().then(() => setActiveConditionId(d.condition.id)))
        .catch(() => setNotice('Could not create condition.'));
    },
    [sheetId, loadConditions],
  );

  const handleCalibrate = useCallback(() => {
    setCalibrating(true);
    setEditingId(null);
    setTool('SELECT');
    setNotice('Draw a line of known length, then double-click to finish.');
  }, []);

  // The single selected AI candidate, if exactly one candidate is selected (drives the review bar).
  const selectedCandidate = useMemo(() => {
    if (selectedIds.length !== 1) return null;
    const m = measurements.find((x) => x.id === selectedIds[0]);
    return m?.isCandidate ? m : null;
  }, [selectedIds, measurements]);

  const handleReview = useCallback(
    (id: string, action: 'accept' | 'reject') => {
      void fetch(`/api/v1/measurements/${id}/${action}`, { method: 'POST' })
        .then((r) =>
          r.ok ? loadMeasurements() : Promise.reject(new Error(`${action} ${r.status}`)),
        )
        .then(() => {
          setSelectedIds([]);
          setNotice(action === 'accept' ? 'Candidate accepted.' : 'Candidate rejected.');
        })
        .catch(() => setNotice(`Could not ${action} the candidate.`));
    },
    [loadMeasurements],
  );

  const handleReclassify = useCallback(
    (measurementId: string, conditionId: string) => {
      void fetch(`/api/v1/measurements/${measurementId}/reclassify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conditionId }),
      })
        .then((r) =>
          r.ok ? loadMeasurements() : Promise.reject(new Error(`reclassify ${r.status}`)),
        )
        .then(() => {
          setSelectedIds([]);
          setNotice('Candidate reclassified.');
        })
        .catch(() => setNotice('Could not reclassify the candidate.'));
    },
    [loadMeasurements],
  );

  const handleBulkAccept = useCallback(
    (conditionId: string, minConfidence: number) => {
      void fetch(`/api/v1/conditions/${conditionId}/candidates/accept`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ minConfidence }),
      })
        .then((r) =>
          r.ok
            ? (r.json() as Promise<{ accepted: number }>)
            : Promise.reject(new Error(`bulk ${r.status}`)),
        )
        .then((d) => loadMeasurements().then(() => d))
        .then((d) => setNotice(`Accepted ${d.accepted} candidate${d.accepted === 1 ? '' : 's'}.`))
        .catch(() => setNotice('Could not bulk-accept candidates.'));
    },
    [loadMeasurements],
  );

  /** Enter redraw mode: the next drawing replaces the selected candidate's geometry. */
  const handleRedraw = useCallback((measurementId: string) => {
    setCalibrating(false);
    setTool('SELECT');
    setEditingId(measurementId);
    setNotice('Re-trace the outline, then double-click to finish.');
  }, []);

  if (error)
    return (
      <p role="alert" className="error">
        Couldn’t load sheet: {error}
      </p>
    );
  if (!sheet) return <p className="muted">Loading sheet…</p>;
  if (!sheet.tilePyramidKey || !sheet.widthPx || !sheet.heightPx) {
    return <p className="muted">This sheet has no tiles yet — it may still be processing.</p>;
  }

  // Calibration borrows the LINEAR tool; redraw borrows the selected candidate's tool; otherwise
  // SELECT means no active drawing tool.
  const editingCandidate = editingId ? measurements.find((m) => m.id === editingId) : undefined;
  const editTool = editingCandidate ? geomToType(editingCandidate.geometry.type) : null;
  const drawTool = calibrating ? 'LINEAR' : editingId ? editTool : tool === 'SELECT' ? null : tool;

  // Reclassify targets: compatible conditions (same measurement type), excluding the current one.
  const candidateType = selectedCandidate ? geomToType(selectedCandidate.geometry.type) : null;
  const reclassifyTargets = selectedCandidate
    ? conditions
        .filter(
          (c) => c.measurementType === candidateType && c.id !== selectedCandidate.conditionId,
        )
        .map((c) => ({ id: c.id, name: c.name }))
    : [];

  const activeCandidateCount = activeConditionId
    ? measurements.filter((m) => m.isCandidate && m.conditionId === activeConditionId).length
    : 0;

  return (
    <Stack gap="md">
      <Stack direction="row" gap="sm">
        <Badge tone="primary">{sheet.sheetNumber ?? `Sheet ${sheet.indexInSet + 1}`}</Badge>
        {sheet.sheetTitle ? <span>{sheet.sheetTitle}</span> : null}
        <span className="muted">
          {sheet.widthPx}×{sheet.heightPx}px · {sheet.discipline}
        </span>
      </Stack>

      <MeasurementToolbar
        tool={tool}
        onToolChange={(t) => {
          setCalibrating(false);
          setEditingId(null);
          setTool(t);
        }}
        conditions={conditions}
        activeConditionId={activeConditionId}
        onActiveConditionChange={setActiveConditionId}
        onNewCondition={handleNewCondition}
        onCalibrate={handleCalibrate}
        calibrating={calibrating}
        scaleConfirmed={scaleConfirmed}
        readout={readout}
        canUndo={canUndo(history)}
        canRedo={canRedo(history)}
        onUndo={() => void handleUndo()}
        onRedo={() => void handleRedo()}
        canDelete={selectedIds.length > 0}
        onDelete={() => void handleDelete()}
      />
      {selectedCandidate ? (
        <CandidateReviewBar
          confidence={selectedCandidate.confidence}
          onAccept={() => handleReview(selectedCandidate.id, 'accept')}
          onReject={() => handleReview(selectedCandidate.id, 'reject')}
          canRedraw={candidateType === 'LINEAR' || candidateType === 'AREA'}
          redrawing={editingId === selectedCandidate.id}
          onRedraw={() => handleRedraw(selectedCandidate.id)}
          reclassifyTargets={reclassifyTargets}
          onReclassify={(conditionId) => handleReclassify(selectedCandidate.id, conditionId)}
        />
      ) : null}
      {activeConditionId && activeCandidateCount > 0 ? (
        <Stack direction="row" gap="sm">
          <span className="muted">{activeCandidateCount} AI candidate(s) in this condition</span>
          <span className="muted">· accept all ≥</span>
          <Input
            type="number"
            min={0}
            max={100}
            value={bulkPercent}
            onChange={(e) => setBulkPercent(Number(e.target.value))}
            aria-label="Bulk-accept confidence threshold"
            style={{ width: '4.5rem' }}
          />
          <span className="muted">%</span>
          <Button size="sm" onClick={() => handleBulkAccept(activeConditionId, bulkPercent / 100)}>
            Accept all
          </Button>
        </Stack>
      ) : null}
      {notice ? <span className="muted">{notice}</span> : null}

      <LayeredViewer
        sheet={{ id: sheet.id, widthPx: sheet.widthPx, heightPx: sheet.heightPx }}
        measurements={measurements}
        activeTool={drawTool}
        {...(sheet.unitPerPixel != null ? { unitPerPixel: sheet.unitPerPixel } : {})}
        onCommit={handleCommit}
        onDrawingChange={setReadout}
        onSelectionChange={setSelectedIds}
      />
    </Stack>
  );
}
