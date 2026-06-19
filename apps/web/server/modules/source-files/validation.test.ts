import { describe, expect, it } from 'vitest';
import { UPLOAD_LIMITS, type RequestedFile } from '@takeoff/contracts';
import { extensionOf, isAllowedType, validateUploadRequest, verifyCompletion } from './validation';

const SHA = 'a'.repeat(64);
function file(over: Partial<RequestedFile> = {}): RequestedFile {
  return {
    filename: 'A-101.pdf',
    mimeType: 'application/pdf',
    byteSize: 1024,
    checksumSha256: SHA,
    ...over,
  };
}

describe('extensionOf', () => {
  it('returns the lowercased extension or empty', () => {
    expect(extensionOf('Plan.PDF')).toBe('.pdf');
    expect(extensionOf('a.b.tiff')).toBe('.tiff');
    expect(extensionOf('noext')).toBe('');
  });
});

describe('isAllowedType', () => {
  it('accepts allow-listed mime + matching extension', () => {
    expect(isAllowedType('s.pdf', 'application/pdf')).toBe(true);
    expect(isAllowedType('s.jpeg', 'image/jpeg')).toBe(true);
    expect(isAllowedType('s.JPG', 'image/jpeg')).toBe(true);
  });
  it('rejects disallowed mime types', () => {
    expect(isAllowedType('s.dwg', 'application/acad')).toBe(false);
    expect(isAllowedType('s.exe', 'application/octet-stream')).toBe(false);
  });
  it('rejects a mismatch between extension and mime (no trusting content-type alone)', () => {
    expect(isAllowedType('malware.exe', 'application/pdf')).toBe(false);
    expect(isAllowedType('drawing.pdf', 'image/png')).toBe(false);
  });
});

describe('validateUploadRequest', () => {
  it('accepts a valid batch', () => {
    expect(
      validateUploadRequest([file(), file({ filename: 'S-1.png', mimeType: 'image/png' })]),
    ).toEqual({
      ok: true,
    });
  });

  it('rejects an unsupported type with a field-specific message', () => {
    const res = validateUploadRequest([
      file({ filename: 'cad.dwg', mimeType: 'application/acad' }),
    ]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors[0]?.field).toBe('files.0.mimeType');
  });

  it('rejects a file over the per-file size ceiling', () => {
    const res = validateUploadRequest([file({ byteSize: UPLOAD_LIMITS.maxFileBytes + 1 })]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.field === 'files.0.byteSize')).toBe(true);
  });

  it('rejects when the aggregate set size exceeds the total ceiling', () => {
    const big = Math.ceil(UPLOAD_LIMITS.maxSetBytes / 2) + 1;
    const res = validateUploadRequest([file({ byteSize: big }), file({ byteSize: big })]);
    // Each file is under the per-file cap but together they bust the set cap.
    expect(res.ok).toBe(false);
    if (!res.ok)
      expect(res.errors.some((e) => e.field === 'files' && /total/.test(e.message))).toBe(true);
  });

  it('rejects an empty batch', () => {
    expect(validateUploadRequest([]).ok).toBe(false);
  });
});

describe('verifyCompletion', () => {
  const declared = { byteSize: 1024, checksumSha256: SHA };

  it('passes when size matches and checksum matches (or storage has none)', () => {
    expect(verifyCompletion(declared, { byteSize: 1024, checksumSha256: SHA })).toEqual({
      ok: true,
    });
    expect(verifyCompletion(declared, { byteSize: 1024 })).toEqual({ ok: true });
    expect(verifyCompletion(declared, { byteSize: 1024, checksumSha256: 'A'.repeat(64) })).toEqual({
      ok: true,
    });
  });

  it('rejects a size mismatch', () => {
    const res = verifyCompletion(declared, { byteSize: 2048, checksumSha256: SHA });
    expect(res.ok).toBe(false);
  });

  it('rejects a checksum mismatch', () => {
    const res = verifyCompletion(declared, { byteSize: 1024, checksumSha256: 'b'.repeat(64) });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/checksum/i);
  });
});
