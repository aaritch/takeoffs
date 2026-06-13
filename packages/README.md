# packages/

Shared libraries consumed by multiple apps. Published under the `@takeoff/*` scope and
imported only via their package root.

| Package     | Purpose                                                                                                                                                                 | Lands in               |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `contracts` | **Single source of truth** for every cross-boundary shape: HTTP request/response, event payloads, job messages, and shared enums. Zero business logic, zero env access. | Phase 0 (P0-02, P0-03) |
| `geometry`  | Pure coordinate / scale / length / area / volume math. Exhaustively unit-tested — wrong numbers hide here.                                                              | Phase 1 (P1-08)        |
| `auth`      | Token handling, the central permission-check helper, role definitions.                                                                                                  | Phase 0 (P0-05, P0-06) |
| `config`    | Environment loading + validation, shared constants.                                                                                                                     | Phase 0                |
| `ui`        | Design system: components, tokens, icons, viewer primitives.                                                                                                            | Phase 1                |
| `testing`   | Shared test utilities, fixtures, factories.                                                                                                                             | Phase 0+               |

The `contracts` package is the formal interface between owners: agree on a contract first,
then build to it in parallel. A change there is a deliberate, reviewed event.

Create a package's folder only when its phase needs it.
