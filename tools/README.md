# tools/

Repo tooling and developer experience.

| Subfolder     | Purpose                                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/`    | Repo maintenance, codegen, seed-data loaders.                                                                                                  |
| `local-dev/`  | Compose file and orchestration to run the stack locally — Postgres+PostGIS, Redis, and workers run locally even though they deploy off-Vercel. |
| `generators/` | Scaffolding for new modules and contracts.                                                                                                     |

These are not deployed; they support development. Add subfolders when first needed.
