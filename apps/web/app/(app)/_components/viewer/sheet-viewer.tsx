'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Stack } from '@takeoff/ui';
import type {
  ConditionView,
  MeasurementGeometry,
  MeasurementView,
  SheetView,
} from '@takeoff/contracts';
import { LayeredViewer } from './layered-viewer';
import { MeasurementToolbar, type ToolMode } from './measurement-toolbar';
import type { OverlayMeasurement } from './hit-test';
import type { LiveQuantity } from './drawing';

/**
 * Sheet viewer page body (P1-06/07/09): fetches the sheet + its conditions + measurements, then
 * renders the deep-zoom viewer with the measurement toolbar wired end-to-end — pick a tool, set
 * the scale, choose/create a condition, draw, and the committed measurement lands on the overlay.
 * Quantities stay server-authoritative: the client only ships geometry and re-reads the result.
 */

function toOverlay(m: MeasurementView): OverlayMeasurement {
  return { id: m.id, conditionId: m.conditionId, geometry: m.geometry };
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`status ${r.status}`);
  return (await r.json()) as T;
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
        (d) => setMeasurements(d.measurements.map(toOverlay)),
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

      if (!activeConditionId) {
        setNotice('Pick or create a condition before drawing.');
        return;
      }
      void fetch(`/api/v1/conditions/${activeConditionId}/measurements`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sheetId, geometry }),
      })
        .then((r) => (r.ok ? loadMeasurements() : Promise.reject(new Error(`commit ${r.status}`))))
        .then(() => setNotice(null))
        .catch(() => setNotice('Could not save measurement.'));
    },
    [calibrating, activeConditionId, sheetId, loadSheet, loadMeasurements],
  );

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
    setTool('SELECT');
    setNotice('Draw a line of known length, then double-click to finish.');
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

  // Calibration borrows the LINEAR tool; otherwise SELECT means no active drawing tool.
  const drawTool = calibrating ? 'LINEAR' : tool === 'SELECT' ? null : tool;

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
      />
      {notice ? <span className="muted">{notice}</span> : null}

      <LayeredViewer
        sheet={{ id: sheet.id, widthPx: sheet.widthPx, heightPx: sheet.heightPx }}
        measurements={measurements}
        activeTool={drawTool}
        {...(sheet.unitPerPixel != null ? { unitPerPixel: sheet.unitPerPixel } : {})}
        onCommit={handleCommit}
        onDrawingChange={setReadout}
      />
    </Stack>
  );
}
