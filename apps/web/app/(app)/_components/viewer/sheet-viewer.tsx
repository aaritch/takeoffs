'use client';

import { useEffect, useState } from 'react';
import { Badge, Stack } from '@takeoff/ui';
import type { SheetView } from '@takeoff/contracts';
import { TileViewer } from './tile-viewer';

/**
 * Sheet viewer page body (P1-06): fetches the sheet, then renders the deep-zoom {@link TileViewer}
 * against the authorized tile route. Degrades clearly while the sheet is still processing (no
 * tiles yet) — the viewer must never be an opaque failure.
 */
export function SheetViewer({ sheetId }: { sheetId: string }) {
  const [sheet, setSheet] = useState<SheetView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/v1/sheets/${sheetId}`, { headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`))))
      .then((d: { sheet: SheetView }) => {
        if (active) setSheet(d.sheet);
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load sheet');
      });
    return () => {
      active = false;
    };
  }, [sheetId]);

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

  return (
    <Stack gap="md">
      <Stack direction="row" gap="sm">
        <Badge tone="primary">{sheet.sheetNumber ?? `Sheet ${sheet.indexInSet + 1}`}</Badge>
        {sheet.sheetTitle ? <span>{sheet.sheetTitle}</span> : null}
        <span className="muted">
          {sheet.widthPx}×{sheet.heightPx}px · {sheet.discipline}
        </span>
      </Stack>
      <TileViewer sheet={{ id: sheet.id, widthPx: sheet.widthPx, heightPx: sheet.heightPx }} />
    </Stack>
  );
}
