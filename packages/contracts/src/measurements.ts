import { z } from 'zod';

/** A vertex in normalized sheet coordinates (spec §9). */
export const Point = z.object({ x: z.number(), y: z.number() });
export type Point = z.infer<typeof Point>;

/**
 * The geometry a client submits when creating/editing a measurement, tagged by kind. The server
 * computes the real-world quantity from this (never trusting a client-supplied total), so this
 * is the only geometric input the API accepts. `type` values mirror the GeometryType enum.
 */
export const MeasurementGeometry = z.discriminatedUnion('type', [
  z.object({ type: z.literal('POLYLINE'), points: z.array(Point).min(2) }),
  z.object({
    type: z.literal('POLYGON'),
    exterior: z.array(Point).min(3),
    holes: z.array(z.array(Point).min(3)).optional(),
  }),
  z.object({ type: z.literal('POINT'), point: Point }),
  z.object({ type: z.literal('POINT_GROUP'), points: z.array(Point).min(1) }),
]);
export type MeasurementGeometry = z.infer<typeof MeasurementGeometry>;
