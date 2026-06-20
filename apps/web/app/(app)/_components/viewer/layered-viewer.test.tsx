// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { OverlayMeasurement } from './hit-test';
import { LayeredViewer } from './layered-viewer';

beforeAll(() => {
  class FakeRO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', FakeRO);
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => null,
  ) as typeof HTMLCanvasElement.prototype.getContext;
});

afterEach(cleanup);

const measurements: OverlayMeasurement[] = [
  { id: 'm1', conditionId: 'c1', geometry: { type: 'POINT', point: { x: 100, y: 100 } } },
];

describe('LayeredViewer', () => {
  it('mounts a stacked tile + overlay canvas without crashing (no 2d ctx in jsdom)', () => {
    const { container } = render(
      <LayeredViewer
        sheet={{ id: 's1', widthPx: 1275, heightPx: 1650 }}
        measurements={measurements}
      />,
    );
    expect(container.querySelectorAll('canvas').length).toBe(2); // tile layer + vector overlay
  });
});
