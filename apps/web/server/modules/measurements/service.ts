import {
  MeasurementGeometry,
  type GeometryType,
  type MeasurementSource,
  type MeasurementType,
  type MeasurementView,
} from '@takeoff/contracts';
import type { OrgScopedTx } from '../../data/org-scope';
import { conditionsRepo } from '../conditions/repository';
import { computeRawValue } from './geometry';
import { measurementsRepo, type Measurement } from './repository';
import { getRollup, recomputeRollup, type QuantityRollup } from './rollup';
import { NotFound, ValidationFailed } from './errors';

export interface CreateMeasurementInput {
  condition_id: string;
  sheet_id?: string | null;
  /** Geometry in normalized sheet coordinates. The ONLY quantity input — no total is accepted. */
  geometry: MeasurementGeometry;
  /** The sheet scale (feet per normalized pixel) used to compute the real-world value. */
  unit_per_pixel: number;
  source?: MeasurementSource;
}

export interface MeasurementResult {
  measurement: Measurement;
  rollup: QuantityRollup;
}

export function measurementToView(m: Measurement): MeasurementView {
  return {
    id: m.id,
    conditionId: m.condition_id,
    sheetId: m.sheet_id,
    geomType: m.geom_type,
    geometry: m.geometry,
    rawValue: m.raw_value,
    source: m.source,
    reviewStatus: m.review_status,
    createdAt: m.created_at.toISOString(),
  };
}

/** Which geometry kinds a condition of each measurement type accepts. */
const ALLOWED_GEOM: Readonly<Record<MeasurementType, GeometryType[]>> = {
  LINEAR: ['POLYLINE'],
  AREA: ['POLYGON'],
  COUNT: ['POINT', 'POINT_GROUP'],
  VOLUME: [], // model as an AREA condition + depth (spec §6.5)
  SURFACE_AREA: [], // model as a LINEAR condition + height
};

export const measurementsService = {
  async create(tx: OrgScopedTx, input: CreateMeasurementInput): Promise<MeasurementResult> {
    const geometry = MeasurementGeometry.parse(input.geometry);

    const condition = await conditionsRepo.getById(tx, input.condition_id);
    if (!condition) {
      throw NotFound('Condition not found');
    }

    const allowed = ALLOWED_GEOM[condition.measurement_type];
    if (allowed.length === 0) {
      throw ValidationFailed(
        `Direct measurement of a ${condition.measurement_type} condition is not supported; use an AREA/LINEAR condition with a depth_or_height`,
        'condition_id',
      );
    }
    if (!allowed.includes(geometry.type)) {
      throw ValidationFailed(
        `Geometry ${geometry.type} is not valid for a ${condition.measurement_type} condition`,
        'geometry',
      );
    }

    const needsScale = geometry.type === 'POLYLINE' || geometry.type === 'POLYGON';
    if (needsScale && !(input.unit_per_pixel > 0)) {
      throw ValidationFailed('A positive sheet scale is required', 'unit_per_pixel');
    }

    const rawValue = computeRawValue(geometry, input.unit_per_pixel);
    const source: MeasurementSource = input.source ?? 'MANUAL';

    const measurement = await measurementsRepo.insert(tx, {
      org_id: condition.org_id,
      condition_id: condition.id,
      sheet_id: input.sheet_id ?? null,
      geom_type: geometry.type,
      geometry,
      raw_value: rawValue,
      source,
      // Manual measurements are authoritative immediately; AI candidates await review.
      review_status: source === 'AI' ? 'UNREVIEWED' : 'ACCEPTED',
    });

    const rollup = await recomputeRollup(tx, condition.id);
    return { measurement, rollup };
  },

  /** Replace a measurement's geometry (recomputing its value) and refresh the rollup. */
  async updateGeometry(
    tx: OrgScopedTx,
    id: string,
    geometry: MeasurementGeometry,
    unitPerPixel: number,
  ): Promise<MeasurementResult> {
    const existing = await measurementsRepo.getById(tx, id);
    if (!existing) {
      throw NotFound();
    }
    const geom = MeasurementGeometry.parse(geometry);
    const rawValue = computeRawValue(geom, unitPerPixel);
    const measurement = await measurementsRepo.update(tx, id, {
      geom_type: geom.type,
      geometry: geom,
      raw_value: rawValue,
    });
    if (!measurement) {
      throw NotFound();
    }
    const rollup = await recomputeRollup(tx, existing.condition_id);
    return { measurement, rollup };
  },

  /**
   * Reverse a soft-delete (undo-delete / redo-create, P1-12). Idempotent: restoring a live row is a
   * no-op. The row keeps its id, so a whole undo/redo history stays stable and rollups recover exactly.
   */
  async restore(tx: OrgScopedTx, id: string): Promise<MeasurementResult> {
    const existing = await measurementsRepo.getByIdWithDeleted(tx, id);
    if (!existing) {
      throw NotFound();
    }
    const measurement = existing.deleted_at
      ? ((await measurementsRepo.restore(tx, id)) ?? existing)
      : existing;
    const rollup = await recomputeRollup(tx, measurement.condition_id);
    return { measurement, rollup };
  },

  async remove(tx: OrgScopedTx, id: string): Promise<QuantityRollup> {
    const existing = await measurementsRepo.getById(tx, id);
    if (!existing) {
      throw NotFound();
    }
    await measurementsRepo.softDelete(tx, id);
    return recomputeRollup(tx, existing.condition_id);
  },

  rollupFor(tx: OrgScopedTx, conditionId: string): Promise<QuantityRollup | undefined> {
    return getRollup(tx, conditionId);
  },
};
