import {
  ALLOWED_UPLOAD_TYPES,
  UPLOAD_LIMITS,
  type FieldError,
  type RequestedFile,
} from '@takeoff/contracts';

/**
 * Upload validation (P1-01). Pure and exhaustively tested — this is where "validate type and
 * size before issuing the signed URL, and never trust the client's content-type alone" lives.
 * The same checks run again on completion against the object's real size/checksum.
 */

export type ValidationResult = { ok: true } | { ok: false; errors: FieldError[] };

/** Lowercased file extension including the dot, or '' if none. */
export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

/**
 * A file's type is allowed only when its declared MIME is on the allow-list AND its extension is
 * one this MIME legitimately uses — so a `.exe` relabelled `application/pdf` (or vice versa) is
 * rejected at the boundary. (Magic-byte sniffing happens later, at ingestion.)
 */
export function isAllowedType(filename: string, mimeType: string): boolean {
  const entry = ALLOWED_UPLOAD_TYPES.find((t) => t.mimeType === mimeType);
  if (!entry) return false;
  return (entry.extensions as readonly string[]).includes(extensionOf(filename));
}

/** Validate a batch of requested files against type and size ceilings before issuing URLs. */
export function validateUploadRequest(files: RequestedFile[]): ValidationResult {
  const errors: FieldError[] = [];

  if (files.length === 0) {
    errors.push({ field: 'files', message: 'At least one file is required.' });
  }
  if (files.length > UPLOAD_LIMITS.maxFilesPerSet) {
    errors.push({
      field: 'files',
      message: `A plan set may contain at most ${UPLOAD_LIMITS.maxFilesPerSet} files.`,
    });
  }

  let total = 0;
  files.forEach((file, i) => {
    total += file.byteSize;
    if (!isAllowedType(file.filename, file.mimeType)) {
      errors.push({
        field: `files.${i}.mimeType`,
        message: `Unsupported file type "${file.mimeType}" for "${file.filename}". Allowed: PDF, PNG, JPEG, TIFF.`,
      });
    }
    if (file.byteSize > UPLOAD_LIMITS.maxFileBytes) {
      errors.push({
        field: `files.${i}.byteSize`,
        message: `"${file.filename}" exceeds the ${UPLOAD_LIMITS.maxFileBytes}-byte per-file limit.`,
      });
    }
  });

  if (total > UPLOAD_LIMITS.maxSetBytes) {
    errors.push({
      field: 'files',
      message: `The plan set exceeds the ${UPLOAD_LIMITS.maxSetBytes}-byte total limit.`,
    });
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export type CompletionTruth = { byteSize: number; checksumSha256?: string | null };
export type CompletionResult = { ok: true } | { ok: false; reason: string };

/**
 * Verify a finished upload against the object's real size/checksum from storage (HEAD). Size is
 * always checkable; checksum is compared when storage computed one (S3 SHA-256). A mismatch means
 * the bytes that landed are not what was promised → the file is rejected.
 */
export function verifyCompletion(
  declared: { byteSize: number; checksumSha256: string },
  actual: CompletionTruth,
): CompletionResult {
  if (actual.byteSize !== declared.byteSize) {
    return {
      ok: false,
      reason: `Size mismatch: expected ${declared.byteSize} bytes, stored object is ${actual.byteSize}.`,
    };
  }
  if (actual.checksumSha256 && actual.checksumSha256.toLowerCase() !== declared.checksumSha256) {
    return {
      ok: false,
      reason: 'Checksum mismatch: stored object does not match the declared SHA-256.',
    };
  }
  return { ok: true };
}
