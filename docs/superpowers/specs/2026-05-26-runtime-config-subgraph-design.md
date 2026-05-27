# Runtime Config Subgraph — Monorepo Contract Spec

> **Status:** approved 2026-05-26
> **Scope:** powerhouse monorepo only (no source code changes; documents the contract the external subgraph relies on)
> **Companion plan:** `docs/superpowers/plans/2026-05-26-runtime-config-subgraph.md`
> **Master plan (cross-repo):** `RUNTIME-CONFIG-SUBGRAPH-PLAN.md` (repo root)

## 1. Why this spec exists

A new GraphQL subgraph (`vetra-cloud-runtime-config`) is being added to `vetra-cloud-package` so that `vetra.to` can read and write a deployed Connect instance's runtime config. The subgraph lives **outside** this monorepo, but it imports three contracts that live **inside** this monorepo. If any of those contracts change in an incompatible way, the subgraph silently breaks.

This spec captures those contracts so that future contributors touching them know to coordinate.

## 2. The three monorepo contracts

### 2.1 `DEFAULT_CONNECT_CONFIG`

- **Defined at:** `packages/shared/connect/runtime-config.ts`
- **Exported from:** `@powerhousedao/shared/connect`
- **Re-exported by:** `@powerhousedao/shared` index
- **Type:** `PHConnectRuntimeConfig` (from `packages/shared/clis/types.ts`)
- **Purpose for the subgraph:** the read resolver deep-merges stored overrides on top of this object, so the UI always receives a fully populated `effective` config.
- **Contract:** every leaf the subgraph might receive in an override JSON has a default here. Add the default first; only then add the override path to the UI.

### 2.2 `runtimeConfigSchema`

- **Defined at:** `packages/builder-tools/connect-utils/runtime-config-schema.ts`
- **Exported from:** `@powerhousedao/builder-tools` (re-exported via `index.mts` → `connect-utils/index.js`)
- **Sibling exports:** `RUNTIME_CONFIG_SCHEMA_ID`, `RUNTIME_CONFIG_SCHEMA_URL` (GitHub-hosted JSON Schema URL)
- **Purpose for the subgraph:** the write resolver validates the incoming JSON against this schema. Invalid input is rejected with `INVALID_RUNTIME_CONFIG` before persistence.
- **Contract:** the schema is JSON Schema draft-07. Ajv must accept it with `strict: false`. If a field is removed from the schema, the subgraph still has to handle stored values that contain the field (defensive parse).

### 2.3 `PH_CONNECT_CONFIG_JSON` entrypoint contract

- **Defined by:** `docker/connect-entrypoint.sh` (deep-merges this env var into `/dist/powerhouse.config.json` with set-if-absent semantics)
- **Verified by:** `packages/shared/connect/entrypoint-seed.test.ts`
- **Documented at:** `apps/connect/RUNTIME-CONFIG.md`
- **Purpose for the subgraph:** the storage key in the tenant `env_vars` table is exactly `PH_CONNECT_CONFIG_JSON`; the value is the JSON string the entrypoint will consume. The same row is read by `secrets-controller` and projected into the Connect pod's environment.
- **Contract:** the env var name MUST stay `PH_CONNECT_CONFIG_JSON`. The entrypoint MUST accept any valid JSON object that conforms to `runtimeConfigSchema`. Changing either is a breaking change for the subgraph.

## 3. What "no source change" means in this monorepo

For the `2026-05-26-runtime-config-subgraph` work, this monorepo does **not** receive source code changes:

- No new `ENV_SEEDING_RULES` TS table (the original draft of `RUNTIME-CONFIG-SUBGRAPH-PLAN.md` proposed one — that proposal predated PR #2645 which collapsed per-field env vars into a single JSON env var, making the bidirectional translation moot).
- No new shared module for translating overrides ↔ env vars (storage holds JSON as-is).
- No parity test against the entrypoint shell script (no table to keep in sync).
- No new exports from `@powerhousedao/shared` or `@powerhousedao/builder-tools` (everything the subgraph needs is already exported).

## 4. Verification

The companion plan (`docs/superpowers/plans/2026-05-26-runtime-config-subgraph.md`) verifies the three contracts above by:

1. Importing each named export from the published packages.
2. Confirming `runtimeConfigSchema` is a non-empty object with `properties` set.
3. Confirming `DEFAULT_CONNECT_CONFIG` exists and has the expected top-level keys.
4. Confirming `entrypoint-seed.test.ts` still passes on `feat/connect-config-json-2`.

These are existing tests; the plan simply executes them to certify the contract before the subgraph PR lands.

## 5. Future change protocol

Before changing any of:

- `DEFAULT_CONNECT_CONFIG`'s shape (adding fields is safe; renaming or removing requires coordination)
- `runtimeConfigSchema`'s shape (removing required properties is breaking; tightening types may invalidate stored overrides)
- The `PH_CONNECT_CONFIG_JSON` env var name or the entrypoint's set-if-absent semantics

…ping the `vetra-cloud-package` maintainer so the subgraph can land a compatible update in the same release. Out-of-band schema changes will cause `setRuntimeConfig` mutations to start rejecting previously valid payloads, or `runtimeConfig` queries to return stale shapes.

## 6. Out of scope

- The subgraph itself — see `vetra-cloud-package/docs/superpowers/specs/2026-05-26-runtime-config-subgraph-design.md`.
- The UI — separate plan.
- k8s pipeline changes — none required.
