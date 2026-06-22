import { z } from 'zod';
import type { StageName } from '../enums';
import {
  Detection,
  MappedCandidate,
  OcrToken,
  QuantifiedCandidate,
  ScaleCandidate,
  ScoredCandidate,
  SheetClassification,
  SheetRef,
} from './shapes';

/**
 * Per-stage input/output contracts for the AI pipeline (P2-01). This is the fixed seam (spec §7.3):
 * each stage declares exactly what it consumes and produces, so a model can be swapped without the
 * orchestration knowing its internals. The downstream stage validates its input against these, so a
 * stage output missing a required field is rejected before the next stage runs.
 *
 * The stages enrich progressively: detectors emit {@link Detection}s → MAP attaches a condition
 * shape → QUANTIFY adds the real-world value → CONFIDENCE adds the final score.
 */

// 1. Sheet classification — image → discipline + page type.
export const ClassifyInput = z.object({ sheet: SheetRef });
export type ClassifyInput = z.infer<typeof ClassifyInput>;
export const ClassifyOutput = z.object({ classification: SheetClassification });
export type ClassifyOutput = z.infer<typeof ClassifyOutput>;

// 2. Text & symbol OCR — image → positioned text tokens.
export const OcrInput = z.object({ sheet: SheetRef });
export type OcrInput = z.infer<typeof OcrInput>;
export const OcrOutput = z.object({ tokens: z.array(OcrToken) });
export type OcrOutput = z.infer<typeof OcrOutput>;

// 3. Scale detection — OCR text + image → a scale candidate (nullable when none is found).
export const ScaleInput = z.object({ sheet: SheetRef, tokens: z.array(OcrToken) });
export type ScaleInput = z.infer<typeof ScaleInput>;
export const ScaleOutput = z.object({ scale: ScaleCandidate.nullable() });
export type ScaleOutput = z.infer<typeof ScaleOutput>;

// 4. Line / wall segmentation — image → linear detections (polylines).
export const LinesInput = z.object({ sheet: SheetRef });
export type LinesInput = z.infer<typeof LinesInput>;
export const LinesOutput = z.object({ lines: z.array(Detection) });
export type LinesOutput = z.infer<typeof LinesOutput>;

// 5. Region / area detection — image → closed-region detections (polygons with cutouts).
export const RegionsInput = z.object({ sheet: SheetRef });
export type RegionsInput = z.infer<typeof RegionsInput>;
export const RegionsOutput = z.object({ regions: z.array(Detection) });
export type RegionsOutput = z.infer<typeof RegionsOutput>;

// 6. Symbol / object detection — image → point detections for count conditions.
export const SymbolsInput = z.object({ sheet: SheetRef });
export type SymbolsInput = z.infer<typeof SymbolsInput>;
export const SymbolsOutput = z.object({ symbols: z.array(Detection) });
export type SymbolsOutput = z.infer<typeof SymbolsOutput>;

// 7. Vectorization & cleanup — raw detections → cleaned detections (snap/merge/close/dedupe).
export const VectorizeInput = z.object({
  lines: z.array(Detection),
  regions: z.array(Detection),
  symbols: z.array(Detection),
});
export type VectorizeInput = z.infer<typeof VectorizeInput>;
export const VectorizeOutput = z.object({
  lines: z.array(Detection),
  regions: z.array(Detection),
  symbols: z.array(Detection),
});
export type VectorizeOutput = z.infer<typeof VectorizeOutput>;

// 8. Classification → condition mapping — detections → candidates with measurement type + unit.
export const MapInput = z.object({ detections: z.array(Detection) });
export type MapInput = z.infer<typeof MapInput>;
export const MapOutput = z.object({ candidates: z.array(MappedCandidate) });
export type MapOutput = z.infer<typeof MapOutput>;

// 9. Quantification — mapped candidates + scale → candidates with real-world raw_value.
export const QuantifyInput = z.object({
  candidates: z.array(MappedCandidate),
  unitPerPixel: z.number().positive(),
});
export type QuantifyInput = z.infer<typeof QuantifyInput>;
export const QuantifyOutput = z.object({ candidates: z.array(QuantifiedCandidate) });
export type QuantifyOutput = z.infer<typeof QuantifyOutput>;

// 10. Confidence assembly — quantified candidates → final scored candidates.
export const ConfidenceInput = z.object({ candidates: z.array(QuantifiedCandidate) });
export type ConfidenceInput = z.infer<typeof ConfidenceInput>;
export const ConfidenceOutput = z.object({ candidates: z.array(ScoredCandidate) });
export type ConfidenceOutput = z.infer<typeof ConfidenceOutput>;

/**
 * The stage contract registry: maps each {@link StageName} to its input + output schema. The schema
 * generator and the cross-plane parity tests both drive off this, and the orchestrator validates a
 * stage's I/O against it. Adding a stage means adding one entry here — nothing else in the seam.
 */
export const STAGE_CONTRACTS = {
  CLASSIFY: { input: ClassifyInput, output: ClassifyOutput },
  OCR: { input: OcrInput, output: OcrOutput },
  SCALE: { input: ScaleInput, output: ScaleOutput },
  LINES: { input: LinesInput, output: LinesOutput },
  REGIONS: { input: RegionsInput, output: RegionsOutput },
  SYMBOLS: { input: SymbolsInput, output: SymbolsOutput },
  VECTORIZE: { input: VectorizeInput, output: VectorizeOutput },
  MAP: { input: MapInput, output: MapOutput },
  QUANTIFY: { input: QuantifyInput, output: QuantifyOutput },
  CONFIDENCE: { input: ConfidenceInput, output: ConfidenceOutput },
} as const satisfies Record<StageName, { input: z.ZodTypeAny; output: z.ZodTypeAny }>;
