# @takeoff/geometry

The single, **pure** home for coordinate, scale, and quantity math. Every quantity in the
product flows through here — the manual measurement tools today, AI quantification later — so
a subtle error corrupts bids silently. It carries **no DB, UI, or environment** dependency and
is exhaustively unit-tested (P1-08 / spec §9).

## What it owns

- **Coordinates** (`types.ts`) — `Point`, `Polyline`, `Polygon` in _normalized sheet
  coordinates_ (DPI-independent). Real-world values come only via the scale.
- **Length** (`length.ts`) — `distance`, `polylineLength`.
- **Area** (`area.ts`) — `ringArea`, `polygonArea` (interior rings subtract), and
  `isSimplePolygon` / `segmentsIntersect` for rejecting self-intersecting area rings.
- **Scale** (`scale.ts`) — two-point calibration → `unit_per_pixel` (canonical **feet/pixel**);
  `toRealLength` (× upp) and `toRealArea` (× upp²). The one conversion the tools and the AI
  pipeline both use.
- **Units** (`units.ts`) — base ↔ display unit conversion (base = ft / sq ft / cu ft / each),
  derived volume & wall surface, waste factor, and display rounding.

## Invariants

- Compute in full precision; round only for display/export (`roundForDisplay`).
- Geometry is normalized; never store screen coordinates here.
- Derivations (area→volume, length→wall surface) are explicit — never assumed.
- A sheet without a confirmed scale must not contribute trusted quantities (enforced upstream;
  this package just does the math it's given).

> Scope note: the **two-point calibration UI** part of P1-08 lands with the viewer (P1-06/07);
> this package provides the calibration math (`unitPerPixelFromTwoPoints`) it will call.
