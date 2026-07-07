import { describe, expect, it } from 'vitest';
import { deriveRunStatus } from './service';

describe('deriveRunStatus (pure, P2-03)', () => {
  it('all sheets succeeding is a SUCCEEDED run', () => {
    expect(deriveRunStatus(['SUCCEEDED', 'SUCCEEDED', 'SUCCEEDED'])).toBe('SUCCEEDED');
  });

  it('a stage failing on one sheet leaves the others intact and the run PARTIAL', () => {
    expect(deriveRunStatus(['SUCCEEDED', 'FAILED', 'SUCCEEDED'])).toBe('PARTIAL');
  });

  it('every sheet failing is a FAILED run', () => {
    expect(deriveRunStatus(['FAILED', 'FAILED'])).toBe('FAILED');
  });

  it('a run that produced no sheet results is FAILED', () => {
    expect(deriveRunStatus([])).toBe('FAILED');
  });
});
