# @powerhousedao/builder-tools

## Connect runtime config schema
`connect-utils/runtime-config-schema.ts` is the source of truth for the
Connect dist `powerhouse.config.json` JSON Schema; it imports field shapes from
`@powerhousedao/shared`. The committed `connect-utils/runtime-config.schema.json`
is **generated** — never hand-edit it. After changing a config field rebuild
this package and run `pnpm tsx scripts/emit-schemas.ts` from the repo root.
Full workflow: `apps/connect/RUNTIME-CONFIG.md` → "Adding or changing a config field".
