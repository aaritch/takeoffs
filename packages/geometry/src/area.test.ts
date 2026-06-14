import { describe, it, expect } from 'vitest';
import { isSimplePolygon, polygonArea, ringArea, segmentsIntersect } from './area';

const square = (s: number) => [
  { x: 0, y: 0 },
  { x: 0, y: s },
  { x: s, y: s },
  { x: s, y: 0 },
];

describe('ringArea', () => {
  it('computes a unit square (orientation-independent)', () => {
    expect(ringArea(square(1))).toBe(1);
    expect(ringArea([...square(1)].reverse())).toBe(1); // clockwise → same magnitude
  });
  it('is zero for degenerate rings', () => {
    expect(
      ringArea([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).toBe(0);
  });
});

describe('polygonArea (holes subtract)', () => {
  it('subtracts an interior ring', () => {
    const outer = square(10); // 100
    const hole = [
      { x: 2, y: 2 },
      { x: 2, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 2 },
    ]; // 4
    expect(polygonArea({ exterior: outer, holes: [hole] })).toBe(96);
  });
  it('treats no holes as the outer area', () => {
    expect(polygonArea({ exterior: square(10) })).toBe(100);
  });
  it('never goes negative', () => {
    expect(polygonArea({ exterior: square(2), holes: [square(10)] })).toBe(0);
  });
});

describe('self-intersection', () => {
  it('detects crossing segments', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 2, y: 0 })).toBe(
      true,
    );
  });
  it('accepts a simple square and rejects a bowtie', () => {
    expect(isSimplePolygon(square(5))).toBe(true);
    expect(
      isSimplePolygon([
        { x: 0, y: 0 },
        { x: 2, y: 2 },
        { x: 2, y: 0 },
        { x: 0, y: 2 },
      ]),
    ).toBe(false);
  });
});
