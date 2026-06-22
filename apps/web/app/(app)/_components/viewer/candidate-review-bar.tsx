'use client';

import { Badge, Button, Stack } from '@takeoff/ui';

/**
 * Review controls for a selected AI candidate (P2-09/P2-10). Presentational: the SheetViewer owns
 * the selection + the server calls. Shows the candidate's confidence and accept/reject affordances;
 * edit-geometry/reclassify reuse the existing drawing + condition tools.
 */
export function CandidateReviewBar({
  confidence,
  onAccept,
  onReject,
}: {
  confidence: number | null | undefined;
  onAccept: () => void;
  onReject: () => void;
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
    </Stack>
  );
}
