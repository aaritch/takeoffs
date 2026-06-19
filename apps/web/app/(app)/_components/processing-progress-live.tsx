'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProcessingStatusView } from '@takeoff/contracts';
import { ProcessingProgress } from './processing-progress';

const TERMINAL = new Set(['READY', 'PARTIAL']);

/**
 * Live container for {@link ProcessingProgress} (P1-05). Polls the plan-set status endpoint until
 * processing finishes (READY/PARTIAL), and wires Retry to the retry endpoint. Polling — not the
 * realtime channel — for now; the channel (realtime gateway) lands later and can swap in here
 * without touching the presentational component.
 */
export function ProcessingProgressLive({
  planSetId,
  intervalMs = 2500,
}: {
  planSetId: string;
  intervalMs?: number;
}) {
  const [status, setStatus] = useState<ProcessingStatusView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const doneRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/plan-sets/${planSetId}/status`, {
        headers: { accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as ProcessingStatusView;
      setStatus(data);
      setError(null);
      doneRef.current = TERMINAL.has(data.planSet.processingStatus);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load status');
    }
  }, [planSetId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (!doneRef.current) void load();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [load, intervalMs]);

  const onRetry = useCallback(
    async (sourceFileId: string) => {
      doneRef.current = false; // resume polling: retry re-queues work
      await fetch(`/api/v1/source-files/${sourceFileId}/retry`, { method: 'POST' });
      await load();
    },
    [load],
  );

  if (error && !status) {
    return (
      <p role="alert" className="error">
        Couldn’t load processing status: {error}
      </p>
    );
  }
  if (!status) return <p className="muted">Loading processing status…</p>;
  return <ProcessingProgress status={status} onRetry={onRetry} />;
}
