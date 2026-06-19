import { getLogger } from '../../platform/observability';

/**
 * Uploader notifications (P1-02). Pluggable so the real channel (email/in-app, via a
 * notifications module) drops in later. For now the default just emits a structured log carrying
 * the correlation id — enough to satisfy "a malware-flagged file notifies the uploader" and to be
 * observable, without a notifications table that doesn't exist yet.
 */

export interface IngestFailureNotice {
  orgId: string;
  planSetId: string;
  sourceFileId: string;
  filename: string;
  reason: string;
}

export interface Notifier {
  ingestFailed(notice: IngestFailureNotice): Promise<void>;
}

export const loggingNotifier: Notifier = {
  async ingestFailed(notice: IngestFailureNotice): Promise<void> {
    getLogger().warn('ingest failed — notifying uploader', { event: 'ingest_failed', ...notice });
  },
};
