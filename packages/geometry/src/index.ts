// @takeoff/geometry — the single, pure home for coordinate, scale, and quantity math.
// Every quantity in the product flows through here (manual tools today, AI quantification
// later), so it carries no DB/UI/env dependencies and is exhaustively tested. Geometry is in
// normalized sheet coordinates; real-world values come only via the sheet scale (spec §9).
export * from './types';
export * from './length';
export * from './area';
export * from './scale';
export * from './units';
