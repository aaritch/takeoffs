import { PDFiumLibrary } from '@hyzyla/pdfium';
import sharp from 'sharp';
import { WORKING_DPI } from '@takeoff/contracts';
import { CorruptFileError } from './page-inventory';

/**
 * Rasterization (P1-03): render each page of a source file to a working-resolution PNG. PDFs are
 * rendered with pdfium (pure wasm — runs on any host); raster images pass through sharp (and are
 * EXIF-auto-oriented). `open()` parses once and renders pages on demand, so a multi-page PDF is
 * loaded a single time.
 *
 * NOTE: pdfium returns a 4-channel bitmap fed straight to sharp (per the library's documented
 * pattern). If real drawings show swapped colors, a BGRA→RGBA channel swap is the fix — to verify
 * once the viewer (P1-06) renders production PDFs.
 */

export interface RasterPage {
  png: Uint8Array;
  width: number;
  height: number;
}

export interface RasterDoc {
  pageCount: number;
  renderPage(index: number): Promise<RasterPage>;
  close(): Promise<void>;
}

export interface Rasterizer {
  open(mimeType: string, bytes: Uint8Array, dpi?: number): Promise<RasterDoc>;
}

const RASTER_MIME = new Set(['image/png', 'image/jpeg', 'image/tiff']);

export const defaultRasterizer: Rasterizer = {
  async open(mimeType: string, bytes: Uint8Array, dpi: number = WORKING_DPI): Promise<RasterDoc> {
    if (mimeType === 'application/pdf') return openPdf(bytes, dpi);
    if (RASTER_MIME.has(mimeType)) return openImage(bytes);
    throw new CorruptFileError(`Cannot rasterize type "${mimeType}"`);
  },
};

async function openPdf(bytes: Uint8Array, dpi: number): Promise<RasterDoc> {
  const library = await PDFiumLibrary.init();
  let pdf;
  try {
    pdf = await library.loadDocument(bytes);
  } catch (err) {
    library.destroy();
    throw new CorruptFileError(
      `Unreadable PDF: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const scale = dpi / 72; // PDF user space is 72 units/inch
  return {
    pageCount: pdf.getPageCount(),
    async renderPage(index: number): Promise<RasterPage> {
      const page = pdf.getPage(index);
      const bitmap = await page.render({ scale, render: 'bitmap' });
      const png = await sharp(Buffer.from(bitmap.data), {
        raw: { width: bitmap.width, height: bitmap.height, channels: 4 },
      })
        .png()
        .toBuffer();
      return { png: new Uint8Array(png), width: bitmap.width, height: bitmap.height };
    },
    async close() {
      pdf.destroy();
      library.destroy();
    },
  };
}

async function openImage(bytes: Uint8Array): Promise<RasterDoc> {
  const png = await sharp(bytes).rotate().png().toBuffer(); // .rotate() honors EXIF orientation
  const meta = await sharp(png).metadata();
  const page: RasterPage = {
    png: new Uint8Array(png),
    width: meta.width ?? 0,
    height: meta.height ?? 0,
  };
  return {
    pageCount: 1,
    async renderPage() {
      return page;
    },
    async close() {},
  };
}
