// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CandidateReviewBar } from './candidate-review-bar';

afterEach(cleanup);

describe('CandidateReviewBar', () => {
  it('shows the confidence as a percentage and fires accept/reject', () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    render(<CandidateReviewBar confidence={0.81} onAccept={onAccept} onReject={onReject} />);

    expect(screen.getByText('81% confidence')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('omits the confidence label when unknown', () => {
    render(<CandidateReviewBar confidence={null} onAccept={vi.fn()} onReject={vi.fn()} />);
    expect(screen.queryByText(/confidence/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeTruthy();
  });
});
