'use client';

import { Badge, Button, Card, Stack, type BadgeTone } from '@takeoff/ui';
import type { IngestStatus, ProcessingStatusView, SourceFileStatus } from '@takeoff/contracts';

/**
 * Granular processing progress (P1-05). Shows per-file stage + per-sheet readiness so the user
 * sees real progress (never one opaque spinner), can open ready sheets before the whole set
 * finishes, and can retry a failed file. Presentational: it takes the status view + an onRetry
 * callback, so the container owns polling/fetching.
 */

const STAGE_LABEL: Record<IngestStatus, string> = {
  PENDING: 'Queued',
  SCANNING: 'Scanning',
  SPLITTING: 'Splitting pages',
  RASTERIZING: 'Rendering',
  TILING: 'Tiling',
  EXTRACTING: 'Reading metadata',
  PROCESSED: 'Ready',
  FAILED: 'Failed',
};

const fileTone = (status: IngestStatus): BadgeTone =>
  status === 'FAILED' ? 'danger' : status === 'PROCESSED' ? 'primary' : 'neutral';

function FileRow({
  file,
  onRetry,
}: {
  file: SourceFileStatus;
  onRetry?: (sourceFileId: string) => void;
}) {
  const failed = file.ingestStatus === 'FAILED';
  const readyCount = file.sheets.filter((s) => s.ready).length;
  return (
    <Card title={file.originalFilename}>
      <Stack gap="sm">
        <div>
          <Badge tone={fileTone(file.ingestStatus)}>{STAGE_LABEL[file.ingestStatus]}</Badge>
          {file.sheets.length > 0 ? (
            <span className="muted" style={{ marginLeft: 8 }}>
              {readyCount}/{file.sheets.length} sheets ready
            </span>
          ) : null}
        </div>

        {failed && file.errorDetail ? (
          <p role="alert" className="error">
            {file.errorDetail}
          </p>
        ) : null}
        {failed && onRetry ? (
          <div>
            <Button variant="secondary" size="sm" onClick={() => onRetry(file.id)}>
              Retry
            </Button>
          </div>
        ) : null}

        {file.sheets.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {file.sheets.map((s) => (
              <Badge key={s.id} tone={s.ready ? 'primary' : 'neutral'}>
                {s.sheetNumber ?? `Sheet ${s.indexInSet + 1}`}
                {s.ready ? ' ✓' : ' …'}
              </Badge>
            ))}
          </div>
        ) : null}
      </Stack>
    </Card>
  );
}

export function ProcessingProgress({
  status,
  onRetry,
}: {
  status: ProcessingStatusView;
  onRetry?: (sourceFileId: string) => void;
}) {
  const { planSet, sourceFiles } = status;
  const readySheets = sourceFiles.reduce((n, f) => n + f.sheets.filter((s) => s.ready).length, 0);

  return (
    <Stack gap="lg">
      <Card title="Processing">
        <Stack gap="sm">
          <div>
            <Badge tone={planSet.processingStatus === 'PARTIAL' ? 'danger' : 'primary'}>
              {planSet.processingStatus}
            </Badge>
          </div>
          <p className="muted">
            {planSet.sourceFileCount} file{planSet.sourceFileCount === 1 ? '' : 's'} ·{' '}
            {planSet.totalSheetCount} sheet{planSet.totalSheetCount === 1 ? '' : 's'} ·{' '}
            {readySheets} ready to view
          </p>
        </Stack>
      </Card>

      {sourceFiles.map((f) => (
        <FileRow key={f.id} file={f} {...(onRetry ? { onRetry } : {})} />
      ))}
    </Stack>
  );
}
