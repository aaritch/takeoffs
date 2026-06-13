import type { MeasurementType, Unit } from '@takeoff/contracts';

export interface SeedCondition {
  name: string;
  measurement_type: MeasurementType;
  unit: Unit;
  color_hex: string;
}

export interface SeedTrade {
  /** CSI MasterFormat division code. */
  division_code: string;
  name: string;
  sort_order: number;
  conditions: SeedCondition[];
}

/**
 * PROVISIONAL launch trade list and starter conditions (P0-10). Deliberately NARROW — breadth
 * is added once the pipeline and tools are proven on a few trades (P0-10 caveat).
 *
 * IMPORTANT: the trades, condition names, and especially the UNITS below are an engineering
 * placeholder and MUST be reviewed and signed off by the domain estimator before launch — wrong
 * units corrupt every downstream quantity (P0-10 caveat / STATE §7 open decision). The unit↔
 * measurement-type pairings are machine-validated (see trades test), but the choice of which
 * unit a trade is measured in is a domain decision, not an engineering one.
 */
export const SEED_TRADES: SeedTrade[] = [
  {
    division_code: '03',
    name: 'Concrete',
    sort_order: 10,
    conditions: [
      { name: 'Slab on Grade', measurement_type: 'AREA', unit: 'SF', color_hex: '#9aa0a6' },
      { name: 'Continuous Footing', measurement_type: 'LINEAR', unit: 'LF', color_hex: '#8d6e63' },
      { name: 'Foundation Wall', measurement_type: 'AREA', unit: 'SF', color_hex: '#a1887f' },
    ],
  },
  {
    division_code: '04',
    name: 'Masonry',
    sort_order: 20,
    conditions: [
      { name: '8" CMU Wall', measurement_type: 'AREA', unit: 'SF', color_hex: '#ef9a9a' },
      { name: 'Brick Veneer', measurement_type: 'AREA', unit: 'SF', color_hex: '#e57373' },
    ],
  },
  {
    division_code: '06',
    name: 'Wood Framing',
    sort_order: 30,
    conditions: [
      { name: 'Exterior Wall Framing', measurement_type: 'AREA', unit: 'SF', color_hex: '#ffcc80' },
      { name: 'Floor Sheathing', measurement_type: 'AREA', unit: 'SF', color_hex: '#ffb74d' },
    ],
  },
  {
    division_code: '08',
    name: 'Openings',
    sort_order: 40,
    conditions: [{ name: 'Doors', measurement_type: 'COUNT', unit: 'EA', color_hex: '#80cbc4' }],
  },
  {
    division_code: '09',
    name: 'Finishes',
    sort_order: 50,
    conditions: [
      { name: 'Gypsum Board', measurement_type: 'AREA', unit: 'SF', color_hex: '#90caf9' },
      { name: 'Batt Insulation', measurement_type: 'AREA', unit: 'SF', color_hex: '#fff59d' },
      { name: 'Acoustic Ceiling', measurement_type: 'AREA', unit: 'SF', color_hex: '#b39ddb' },
    ],
  },
  {
    division_code: '31',
    name: 'Earthwork',
    sort_order: 60,
    conditions: [
      { name: 'Excavation', measurement_type: 'VOLUME', unit: 'CY', color_hex: '#6d4c41' },
      { name: 'Site Grading', measurement_type: 'AREA', unit: 'SY', color_hex: '#a1887f' },
      { name: 'Curb & Gutter', measurement_type: 'LINEAR', unit: 'LF', color_hex: '#607d8b' },
    ],
  },
];

/** Total number of seeded condition templates across all trades. */
export const SEED_CONDITION_COUNT = SEED_TRADES.reduce((n, t) => n + t.conditions.length, 0);
