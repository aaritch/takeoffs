import { MeasurementType, Unit, isUnitValidFor } from '@takeoff/contracts';
import { currentOrgId, type OrgScopedTx } from '../../data/org-scope';
import { takeoffsRepo } from '../takeoffs/repository';
import { conditionsRepo, type Condition } from './repository';
import { NotFound, ValidationFailed } from './errors';

export interface CreateConditionInput {
  takeoff_id: string;
  trade_category_id: string;
  name: string;
  measurement_type: string;
  unit: string;
  color_hex?: string;
  depth_or_height?: number | null;
  waste_factor_pct?: number;
  unit_cost_minor?: number | null;
  notes?: string;
  ai_object_class?: string;
}

export type UpdateConditionInput = Partial<Omit<CreateConditionInput, 'takeoff_id'>>;

interface ValidShape {
  measurement_type: MeasurementType;
  unit: Unit;
}

/** Validate the measurement-type/unit/derivation/factor invariants. Throws ValidationFailed. */
function validateShape(shape: {
  name: string;
  measurement_type: string;
  unit: string;
  depth_or_height?: number | null;
  waste_factor_pct?: number;
  unit_cost_minor?: number | null;
}): ValidShape {
  if (!shape.name.trim()) {
    throw ValidationFailed('Condition name is required', 'name');
  }

  const mt = MeasurementType.safeParse(shape.measurement_type);
  if (!mt.success) {
    throw ValidationFailed(
      `Invalid measurement type: ${shape.measurement_type}`,
      'measurement_type',
    );
  }
  const unit = Unit.safeParse(shape.unit);
  if (!unit.success) {
    throw ValidationFailed(`Invalid unit: ${shape.unit}`, 'unit');
  }
  if (!isUnitValidFor(mt.data, unit.data)) {
    throw ValidationFailed(`Unit ${unit.data} is not valid for a ${mt.data} condition`, 'unit');
  }

  if (shape.waste_factor_pct != null && !(shape.waste_factor_pct >= 0)) {
    throw ValidationFailed('Waste factor must be zero or positive', 'waste_factor_pct');
  }

  if (shape.depth_or_height != null) {
    if (!(shape.depth_or_height > 0)) {
      throw ValidationFailed('depth_or_height must be positive', 'depth_or_height');
    }
    // A derivation must be explicit AND meaningful: only AREA→volume and LINEAR→wall-surface.
    if (mt.data !== 'AREA' && mt.data !== 'LINEAR') {
      throw ValidationFailed(
        'depth_or_height only applies to AREA (→ volume) or LINEAR (→ surface) conditions',
        'depth_or_height',
      );
    }
  }

  if (
    shape.unit_cost_minor != null &&
    (!Number.isInteger(shape.unit_cost_minor) || shape.unit_cost_minor < 0)
  ) {
    throw ValidationFailed(
      'unit_cost_minor must be a non-negative integer (minor units)',
      'unit_cost_minor',
    );
  }

  return { measurement_type: mt.data, unit: unit.data };
}

export const conditionsService = {
  async create(tx: OrgScopedTx, input: CreateConditionInput): Promise<Condition> {
    const valid = validateShape(input);

    const takeoff = await takeoffsRepo.getById(tx, input.takeoff_id);
    if (!takeoff) {
      throw NotFound('Takeoff not found');
    }
    if (!(await conditionsRepo.tradeCategoryExists(tx, input.trade_category_id))) {
      throw ValidationFailed('Unknown trade category', 'trade_category_id');
    }

    const org_id = await currentOrgId(tx);
    return conditionsRepo.insert(tx, {
      org_id,
      takeoff_id: input.takeoff_id,
      trade_category_id: input.trade_category_id,
      name: input.name.trim(),
      measurement_type: valid.measurement_type,
      unit: valid.unit,
      color_hex: input.color_hex,
      depth_or_height: input.depth_or_height ?? null,
      waste_factor_pct: input.waste_factor_pct ?? 0,
      unit_cost_minor: input.unit_cost_minor ?? null,
      notes: input.notes,
      ai_object_class: input.ai_object_class,
    });
  },

  async update(tx: OrgScopedTx, id: string, patch: UpdateConditionInput): Promise<Condition> {
    const existing = await conditionsRepo.getById(tx, id);
    if (!existing) {
      throw NotFound();
    }
    // Validate the MERGED shape so a partial edit can't create an invalid combination.
    const merged = {
      name: patch.name ?? existing.name,
      measurement_type: patch.measurement_type ?? existing.measurement_type,
      unit: patch.unit ?? existing.unit,
      depth_or_height:
        patch.depth_or_height !== undefined ? patch.depth_or_height : existing.depth_or_height,
      waste_factor_pct: patch.waste_factor_pct ?? existing.waste_factor_pct,
      unit_cost_minor:
        patch.unit_cost_minor !== undefined ? patch.unit_cost_minor : existing.unit_cost_minor,
    };
    const valid = validateShape(merged);

    const updated = await conditionsRepo.update(tx, id, {
      ...patch,
      name: merged.name.trim(),
      measurement_type: valid.measurement_type,
      unit: valid.unit,
    });
    if (!updated) {
      throw NotFound();
    }
    return updated;
  },

  async list(tx: OrgScopedTx, takeoffId: string): Promise<Condition[]> {
    return conditionsRepo.listByTakeoff(tx, takeoffId);
  },

  async remove(tx: OrgScopedTx, id: string): Promise<void> {
    const deleted = await conditionsRepo.softDelete(tx, id);
    if (deleted === 0) {
      throw NotFound();
    }
  },
};
