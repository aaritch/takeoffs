// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { TileViewer } from './tile-viewer';

beforeAll(() => {
  // jsdom lacks these; the viewer must mount without them blowing up (it degrades, never throws).
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

describe('TileViewer', () => {
  it('mounts and renders a canvas surface without crashing (no 2d ctx in jsdom)', () => {
    const { container } = render(
      <TileViewer sheet={{ id: 's1', widthPx: 1275, heightPx: 1650 }} />,
    );
    expect(container.querySelector('canvas')).not.toBeNull();
  });
});
