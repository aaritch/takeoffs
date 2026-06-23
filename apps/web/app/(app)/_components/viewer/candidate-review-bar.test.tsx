// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CandidateReviewBar } from './candidate-review-bar';

afterEach(cleanup);

function renderBar(overrides: Partial<Parameters<typeof CandidateReviewBar>[0]> = {}) {
  const props = {
    confidence: 0.81,
    onAccept: vi.fn(),
    onReject: vi.fn(),
    canRedraw: true,
    redrawing: false,
    onRedraw: vi.fn(),
    reclassifyTargets: [{ id: 'c2', name: 'Topping Slab' }],
    onReclassify: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<CandidateReviewBar {...props} />) };
}

describe('CandidateReviewBar', () => {
  it('shows confidence and fires accept/reject/redraw', () => {
    const { props } = renderBar();
    expect(screen.getByText('81% confidence')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    fireEvent.click(screen.getByRole('button', { name: 'Redraw' }));
    expect(props.onAccept).toHaveBeenCalledTimes(1);
    expect(props.onReject).toHaveBeenCalledTimes(1);
    expect(props.onRedraw).toHaveBeenCalledTimes(1);
  });

  it('reclassifies to the chosen condition', () => {
    const { props } = renderBar();
    fireEvent.change(screen.getByLabelText('Reclassify to condition'), {
      target: { value: 'c2' },
    });
    expect(props.onReclassify).toHaveBeenCalledWith('c2');
  });

  it('omits confidence + redraw + reclassify when not applicable', () => {
    renderBar({ confidence: null, canRedraw: false, reclassifyTargets: [] });
    expect(screen.queryByText(/confidence/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Redraw' })).toBeNull();
    expect(screen.queryByLabelText('Reclassify to condition')).toBeNull();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeTruthy();
  });

  it('reflects an in-progress redraw', () => {
    renderBar({ redrawing: true });
    expect(screen.getByRole('button', { name: 'Redrawing…' })).toBeTruthy();
  });
});
