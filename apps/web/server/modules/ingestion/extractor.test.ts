import { describe, expect, it } from 'vitest';
import { parseSheetMetadata } from './extractor';

describe('parseSheetMetadata', () => {
  it('extracts number, title, and discipline from title-block text', () => {
    expect(parseSheetMetadata('A-101\r\nFLOOR PLAN')).toEqual({
      sheetNumber: 'A-101',
      sheetTitle: 'FLOOR PLAN',
      discipline: 'ARCHITECTURAL',
    });
  });

  it('maps the discipline from the number prefix', () => {
    expect(parseSheetMetadata('S-201\nFOUNDATION DETAILS').discipline).toBe('STRUCTURAL');
    expect(parseSheetMetadata('M-301\nHVAC LAYOUT').discipline).toBe('MECHANICAL');
    expect(parseSheetMetadata('E-401\nLIGHTING PLAN').discipline).toBe('ELECTRICAL');
    expect(parseSheetMetadata('P-501\nWASTE RISER').discipline).toBe('PLUMBING');
  });

  it('prefers the last recognized drawing number (title block reads last)', () => {
    const text = 'PROJECT A-001 GENERAL\nSHEET A-104\nENLARGED PLANS';
    expect(parseSheetMetadata(text).sheetNumber).toBe('A-104');
  });

  it('degrades gracefully: no recognizable number leaves number/discipline unset', () => {
    const r = parseSheetMetadata('SOME NOTES HERE');
    expect(r.sheetNumber).toBeUndefined();
    expect(r.discipline).toBeUndefined();
  });

  it('returns nothing for empty text', () => {
    expect(parseSheetMetadata('')).toEqual({});
    expect(parseSheetMetadata('   \n  ')).toEqual({});
  });

  it('does not treat the number line as the title', () => {
    expect(parseSheetMetadata('A-101').sheetTitle).toBeUndefined();
  });
});
