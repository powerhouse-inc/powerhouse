# @powerhousedao/shared

## Connect runtime config
Source of truth for Connect's `powerhouse.config.json`:
- `clis/types.ts` — `PHConnect*` TS types.
- `connect/schema-fragments.ts` — JSON Schema field shapes. `clis/source-config-schema.ts`
  imports these to build `clis/source-config.schema.json`, which is **generated** —
  never hand-edit it.
- `connect/runtime-config.ts` — `DEFAULT_CONNECT_CONFIG` runtime defaults (merged
  into the config at boot; not part of schema generation).

After changing a config field, rebuild and run `pnpm tsx scripts/emit-schemas.ts`
from the repo root. Full workflow: `apps/connect/RUNTIME-CONFIG.md` →
"Adding or changing a config field".
