# @powerhousedao/shared

## Connect runtime config
Source of truth for Connect's `powerhouse.config.json`:
- `connect/connect-config-schema.ts` — the zod schemas (`connectConfigSchema`,
  `connectRuntimeConfigSchema` and the `connect*Schema` sections). **The single
  source**: declare fields here (description and `default` via `.meta()`, never
  `.default()`).
- `clis/types.ts` — `PHConnect*` TS types, all `z.infer` of the zod schemas.
- `connect/schema-fragments.ts` — JSON Schema fragments **emitted** from the zod
  schemas (`phConnectRuntimeConfigSchema` & co); never hand-written.
  `clis/source-config-schema.ts` imports them to build
  `clis/source-config.schema.json`, which is **generated** — never hand-edit it.
  The drift test `connect/connect-config-schema.test.ts` pins the emitted fragment.
- `connectConfigSchemaWith(field)` (same file) is the connect host's declared
  `config`: fields that name another host's outputs (`drives.defaultDrives[].url`,
  `renown.switchboardUrl`) are wrapped with `field` so they take output tokens
  (`host-tokens/`). Wrap a new such field there too; the plain schema takes none.
- `connect/runtime-config.ts` — `DEFAULT_CONNECT_CONFIG` runtime defaults (merged
  into the config at boot; not part of schema generation).

After changing a config field, rebuild and run `pnpm tsx scripts/emit-schemas.ts`
from the repo root. Full workflow: `apps/connect/CUSTOMIZING.md` →
"Adding or changing a field".
