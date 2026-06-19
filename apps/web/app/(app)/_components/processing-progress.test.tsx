// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ProcessingStatusView } from '@takeoff/contracts';
import { ProcessingProgress } from './processing-progress';

afterEach(cleanup);

const status: ProcessingStatusView = {
  planSet: { id: 'ps', processingStatus: 'PARTIAL', sourceFileCount: 2, totalSheetCount: 2 },
  sourceFiles: [
    {
      id: 'file-ok',
      originalFilename: 'A-101.pdf',
      ingestStatus: 'PROCESSED',
      errorDetail: null,
      pageCount: 2,
      sheets: [
        { id: 's1', indexInSet: 0, sheetNumber: 'A-101', thumbnailKey: 'k', ready: true },
        { id: 's2', indexInSet: 1, sheetNumber: null, thumbnailKey: null, ready: false },
      ],
    },
    {
      id: 'file-bad',
      originalFilename: 'corrupt.pdf',
      ingestStatus: 'FAILED',
      errorDetail: 'Unreadable PDF',
      pageCount: null,
      sheets: [],
    },
  ],
};

describe('ProcessingProgress', () => {
  it('shows granular per-file stage and per-sheet readiness (not one spinner)', () => {
    render(<ProcessingProgress status={status} />);
    expect(screen.getByText('A-101.pdf')).toBeDefined();
    expect(screen.getByText('Ready')).toBeDefined(); // PROCESSED file's stage label
    expect(screen.getByText('Failed')).toBeDefined(); // FAILED file's stage label
    expect(screen.getByText('1 ready to view', { exact: false })).toBeDefined();
    // a ready sheet is marked viewable, a pending one isn't
    expect(screen.getByText(/A-101 ✓/)).toBeDefined();
  });

  it('surfaces a failed file with its error and a working retry button', () => {
    const onRetry = vi.fn();
    render(<ProcessingProgress status={status} onRetry={onRetry} />);
    expect(screen.getByRole('alert').textContent).toContain('Unreadable PDF');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledWith('file-bad');
  });

  it('does not render a retry button when the file has not failed', () => {
    const okOnly: ProcessingStatusView = { ...status, sourceFiles: [status.sourceFiles[0]!] };
    render(<ProcessingProgress status={okOnly} onRetry={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});
