# Integration exports (P4-08)

Structured, **version-pinned** exports that carry a takeoff's quantities into estimating and
accounting tools. The version is part of the format id because target formats drift between
versions — pin to a documented layout and test against the real target tool before relying on it.

Quantities come straight from the authoritative, scale-gated `QuantityRollup` (the same numbers the
reports use), so an integration export equals the takeoff exactly — it never recomputes a quantity.

Endpoint: `GET /v1/takeoffs/{takeoffId}/integration-exports/{format}` → the file inline
(`Content-Disposition: attachment`), with the pinned version echoed in `X-Format-Version`.
Malformed or partial data is rejected with `422 EXPORT_NOT_EXPORTABLE` **before** any file is
produced — never a corrupt file.

## `ESTIMATING_CSV_V1` (version 1.0)

A clean RFC-4180 CSV: one header row, then one line item per condition, grouped/ordered by trade
(sort order → division → name). No preamble, so it imports directly into spreadsheets and
spreadsheet-based estimating tools.

Columns (exact, in order):

```
Division,Trade,Condition,MeasurementType,Unit,Quantity,QuantityWithWaste,UnitCostUSD,ExtendedCostUSD,Currency
```

- `Quantity` / `QuantityWithWaste` — full stored precision (display rounding is the consumer's job).
- `UnitCostUSD` / `ExtendedCostUSD` — decimal dollars (empty when unset); `Currency` is ISO-4217.

## `ACCOUNTING_JSON_V1` (version 1.0)

A self-describing JSON document; `formatVersion` is explicit so a consumer can branch on it.

```json
{
  "formatVersion": "1.0",
  "generator": "takeoff-platform",
  "takeoffId": "<uuid>",
  "currency": "USD",
  "lineItems": [
    {
      "division": "03",
      "trade": "Concrete",
      "condition": "Slab on grade",
      "measurementType": "AREA",
      "unit": "SF",
      "quantity": 2500,
      "quantityWithWaste": 2625,
      "unitCostMinor": 150,
      "extendedCostMinor": 393750
    }
  ],
  "totals": { "extendedCostMinor": 393750, "lineItemCount": 1 }
}
```

Money is integer **minor units** (cents) with the ISO-4217 `currency`; quantities are full precision.
