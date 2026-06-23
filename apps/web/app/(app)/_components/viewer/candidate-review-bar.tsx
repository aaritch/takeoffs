'use client';

import { Badge, Button, Select, Stack } from '@takeoff/ui';

/**
 * Review controls for a selected AI candidate (P2-09/P2-10). Presentational: the SheetViewer owns
 * the selection + the server calls. Accept/reject promote or discard the candidate; "Redraw" edits
 * its geometry by re-tracing it (reusing the drawing tools); the dropdown reclassifies it into
 * another compatible condition.
 */
export function CandidateReviewBar({
  confidence,
  onAccept,
  onReject,
  canRedraw,
  redrawing,
  onRedraw,
  reclassifyTargets,
  onReclassify,
}: {
  confidence: number | null | undefined;
  onAccept: () => void;
  onReject: () => void;
  canRedraw: boolean;
  redrawing: boolean;
  onRedraw: () => void;
  reclassifyTargets: { id: string; name: string }[];
  onReclassify: (conditionId: string) => void;
}) {
  return (
    <Stack direction="row" gap="sm">
      <Badge tone="primary">AI candidate</Badge>
      {confidence != null ? (
        <span className="muted">{Math.round(confidence * 100)}% confidence</span>
      ) : null}
      <Button size="sm" onClick={onAccept}>
        Accept
      </Button>
      <Button size="sm" variant="secondary" onClick={onReject}>
        Reject
      </Button>
      {canRedraw ? (
        <Button size="sm" variant={redrawing ? 'primary' : 'secondary'} onClick={onRedraw}>
          {redrawing ? 'Redrawing…' : 'Redraw'}
        </Button>
      ) : null}
      {reclassifyTargets.length > 0 ? (
        <Select
          aria-label="Reclassify to condition"
          value=""
          onChange={(e) => {
            if (e.target.value) onReclassify(e.target.value);
          }}
        >
          <option value="" disabled>
            Reclassify…
          </option>
          {reclassifyTargets.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      ) : null}
    </Stack>
  );
}
