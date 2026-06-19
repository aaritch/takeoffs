import { PDFDocument } from 'pdf-lib';

/**
 * Page inventory (P1-02): how many pages a source file has, so the split step can create one
 * Sheet per page. PDFs are parsed with pdf-lib; raster images are a single page. A file that
 * can't be parsed throws `CorruptFileError`, which the pipeline turns into a per-file FAILED
 * (without taking down the rest of the plan set).
 */

export class CorruptFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorruptFileError';
  }
}

const RASTER_MIME = new Set(['image/png', 'image/jpeg', 'image/tiff']);

export interface PageInventory {
  count(mimeType: string, bytes: Uint8Array): Promise<number>;
}

export const defaultPageInventory: PageInventory = {
  async count(mimeType: string, bytes: Uint8Array): Promise<number> {
    if (mimeType === 'application/pdf') {
      let doc: PDFDocument;
      try {
        doc = await PDFDocument.load(bytes, { updateMetadata: false });
      } catch (err) {
        throw new CorruptFileError(
          `Unreadable PDF: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      const pages = doc.getPageCount();
      if (pages < 1) throw new CorruptFileError('PDF has no pages');
      return pages;
    }
    if (RASTER_MIME.has(mimeType)) return 1;
    throw new CorruptFileError(`Cannot inventory pages for type "${mimeType}"`);
  },
};
