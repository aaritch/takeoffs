import { PDFiumLibrary } from '@hyzyla/pdfium';
import type { Discipline } from '@takeoff/contracts';

/**
 * Sheet metadata extraction (P1-04): pull candidate `sheet_number`, `sheet_title`, and
 * `discipline` from a page. Vector/text PDFs use pdfium's text layer (deterministic — most
 * construction drawings are text PDFs); raster-only sheets extract nothing for now (OCR is a
 * documented future extension). Extraction is best-effort: anything it can't find stays blank, and
 * everything it produces is a CANDIDATE a user can override (the viewer never blocks on this).
 */

export interface ExtractedMetadata {
  sheetNumber?: string;
  sheetTitle?: string;
  discipline?: Discipline;
}

export interface ExtractDoc {
  extractPage(index: number): Promise<ExtractedMetadata>;
  close(): Promise<void>;
}

export interface MetadataExtractor {
  open(mimeType: string, bytes: Uint8Array): Promise<ExtractDoc>;
}

const DISCIPLINE_BY_LETTER: Record<string, Discipline> = {
  A: 'ARCHITECTURAL',
  S: 'STRUCTURAL',
  M: 'MECHANICAL',
  E: 'ELECTRICAL',
  P: 'PLUMBING',
  C: 'CIVIL',
  L: 'LANDSCAPE',
};

// A drawing number: 1–2 letter discipline prefix + digits (e.g. A-101, A101, S1.2, M-201).
const NUMBER_RE = /\b([A-Za-z]{1,2})-?\s?(\d{1,3}(?:\.\d{1,2})?)\b/g;
const letters = (s: string): number => (s.match(/[A-Za-z]/g) ?? []).length;
const digits = (s: string): number => (s.match(/\d/g) ?? []).length;

/** Pure heuristic parse of a page's text into candidate metadata. Exhaustively unit-tested. */
export function parseSheetMetadata(text: string): ExtractedMetadata {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Sheet number: prefer the LAST match with a recognized discipline prefix (title block is
  // usually last in reading order).
  let chosen: { raw: string; discipline: Discipline } | undefined;
  for (const m of lines.join('\n').matchAll(NUMBER_RE)) {
    const discipline = DISCIPLINE_BY_LETTER[m[1]!.charAt(0).toUpperCase()];
    if (discipline) {
      chosen = { raw: m[0].toUpperCase().replace(/\s+/g, ''), discipline };
    }
  }

  const result: ExtractedMetadata = {};
  if (chosen) {
    result.sheetNumber = chosen.raw;
    result.discipline = chosen.discipline;
  }

  // Title: the longest mostly-alphabetic line that isn't the number itself.
  const titleLine = lines
    .filter((l) => l.toUpperCase().replace(/\s+/g, '') !== chosen?.raw)
    .filter((l) => letters(l) >= 3 && letters(l) >= digits(l))
    .sort((a, b) => b.length - a.length)[0];
  if (titleLine) result.sheetTitle = titleLine.slice(0, 200);

  return result;
}

const emptyDoc = (): ExtractDoc => ({
  async extractPage() {
    return {};
  },
  async close() {},
});

export const defaultExtractor: MetadataExtractor = {
  async open(mimeType: string, bytes: Uint8Array): Promise<ExtractDoc> {
    if (mimeType !== 'application/pdf') return emptyDoc(); // OCR for rasters: future extension
    const library = await PDFiumLibrary.init();
    let pdf;
    try {
      pdf = await library.loadDocument(bytes);
    } catch {
      library.destroy();
      return emptyDoc();
    }
    return {
      async extractPage(index: number): Promise<ExtractedMetadata> {
        const text = await pdf.getPage(index).getText();
        return parseSheetMetadata(text ?? '');
      },
      async close() {
        pdf.destroy();
        library.destroy();
      },
    };
  },
};
