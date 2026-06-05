# Connect Runtime Configuration

How runtime values reach the Connect SPA, where they're defined, who can change them, and how the SPA picks them up.

## TL;DR

Connect's runtime configuration lives in a single JSON file: `powerhouse.config.json`. The file exists in two places — a hand-edited _source_ in the project root, and a built _dist_ that Connect actually serves at runtime. The SPA reads it once at boot via `fetch()` and never looks at environment variables for its own settings. Operators set values by editing the source file, passing CLI flags, running `ph connect config`, or — at deploy time — setting environment variables that a Docker entrypoint translates into the dist file.

```
┌──────────── ways to set a value ────────────┐
                                              │
  ph init  (scaffold defaults)                │
  edit powerhouse.config.json by hand         │
  ph connect config --<field> <value>         │
  ph connect build --<field> <value>          │
  ph install --registry <url>                 │
  PH_CONNECT_CONFIG_JSON env (deploy-time)    │
                                              │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
          powerhouse.config.json (dist)
                       │
                       │  fetch('/powerhouse.config.json')
                       ▼
          Connect SPA — ConfigLoader cached at boot
                       │
            getRuntimeConfig() / getConnectConfig()
                       ▼
          consumed by Package Manager, Renown,
          drive sidebar, router basename, etc.
```

## The file

Schema lives in `packages/builder-tools/connect-utils/runtime-config-schema.ts`. Shape (simplified):

```jsonc
{
  "$schema": "...",
  "schemaVersion": 2,

  // Top-level — project-wide, also read by ph-cli + Switchboard:
  "packages": [
    { "packageName": "@scope/pkg", "version": "1.0.0", "provider": "registry" }
  ],
  "packageRegistryUrl": "https://registry.dev.vetra.io",
  "localPackage": { "name": "...", "version": "..." } | null,

  // Connect-only runtime values:
  "connect": {
    "branding":  { "appName": "...", "homeBackground": "..." | null },
    "app":       { "logLevel": "info", "basePath": "/" },
    "renown":    { "url": "...", "networkId": "eip155", "chainId": 1 },
    "drives":    { "allowAddDrive": true, "defaultDrives": [...], "preserveStrategy": "...", "sections": {...} },
    "packages":  { "externalEnabled": true },
    "sentry":    { "dsn": null, "env": "dev", "tracing": false }
  }
}
```

The defaults for the `connect.*` block are defined once in `packages/shared/connect/runtime-config.ts` as `DEFAULT_CONNECT_CONFIG`. They are the floor of the precedence ladder, the scaffolded template for new projects, and the merge base that guarantees the SPA never sees a partially-populated `connect.*` block.

## Setting values — the precedence ladder

When `ph connect build` runs, the _dist_ `powerhouse.config.json` is produced by deep-merging in this order (lowest → highest):

```
DEFAULT_CONNECT_CONFIG  <  source.connect  <  CLI flag overrides
```

Plus the top-level field:

```
packageRegistryUrl = cliPackageRegistryUrl ?? source.packageRegistryUrl ?? null
```

Each layer can supply a partial value; missing leaves fall back to the layer below. Arrays replace (they don't append), and `undefined` in a patch means "leave alone".

### The five ways to feed a value into a layer

| Way                                                         | Lands in                                        | When to use                                                          |
| ----------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| `ph init` template                                          | source file                                     | Initial scaffold; gives every project a working default              |
| Manual edit of `<project>/powerhouse.config.json`           | source file                                     | Local dev tweaks; checked into git                                   |
| `ph connect config --<field> <value>` (or `--json '{...}'`) | source **and** dist (dual-write)                | Quick CLI edit that takes effect on next refresh, without rebuilding |
| `ph connect build --<field> <value>` (or `--json '{...}'`)  | dist (CLI override layer)                       | One-off override at build time, e.g. CI baking a different `--base`  |
| Docker entrypoint env var `PH_CONNECT_CONFIG_JSON`          | dist file at container start, **set-if-absent** | Per-deployment knobs without rebuilding the image                    |

Two special-case writers also exist:

- `ph install --registry <url>` writes the top-level `packageRegistryUrl` (overwrites when `--registry` is explicit, otherwise preserves existing).
- `ph vetra` passes a programmatic `callerOverride` to `ph connect studio` so default drives don't have to be tipped on every invocation.

### Notes on each method

**Manual edit.** The source `powerhouse.config.json` lives in the project root next to `package.json`. It carries top-level keys for other tooling too (`studio.port`, `reactor.*`, `auth.*`, `documentModelsDir`, etc.); those keys pass through Connect's loader untouched.

**`ph connect config`.** Four modes (mutually exclusive — positional, `--get`, `--json`, and field flags cannot be combined):

- No args → list mode: prints the effective `connect.*` block (defaults + source).
- `<key>` (positional) or `--get <dotted.path>` → prints a single value at the dotted path (also works for top-level `packageRegistryUrl`).
- `<key> <value>` (positional) or `--<field> <value>` → set mode: Ajv-validates the value against the schema at that path and dual-writes to source and dist (dist is skipped silently if no build has happened yet). Coercion is JSON-aware — `true`/`false`/numbers parse correctly; arrays and objects should go through `--json` instead.
- `--json '{...}'` → bulk-set mode: validates the full patch and dual-writes.

**`ph connect build` overrides.** Three combinable forms (last wins on collision): `<key> <value>` positional, `--<field> <value>` per-field flag, or `--json '{...}'` bulk. The same shared spec drives both `build` and `config`, so the positional grammar matches. **`--base` IS available here** (build-time field). The 4 flags inherited from `commonArgs` (`--base`, `--log-level`, `--default-drives-url`, `--drive-preserve-strategy`) carry cmd-ts defaults, so they're gated through `wasFlagExplicitlyPassed` — if the user didn't type the flag, the source value wins. CLI overrides beat source. Build has no read mode; passing only `<key>` without `<value>` errors with a pointer to `ph connect config <key>`.

**`--base` is build-time only.** `ph connect build --base /foo` writes `connect.app.basePath` AND bakes the value into the Vite bundle's asset URLs AND templates the nginx config. `ph connect config --base /foo` would only write the first one, leaving the SPA's router and the deployed assets disagreeing — so `ph connect config` rejects `--base` up front with an actionable error pointing at `ph connect build --base`.

**Docker entrypoint.** `docker/connect-entrypoint.sh` runs at container start and accepts a single env var, `PH_CONNECT_CONFIG_JSON`, carrying a full `powerhouse.config.json` payload (same shape as `ph connect config --json '{...}'`). It deep-merges that JSON into the dist file with **set-if-absent semantics**: any path already populated (by the build, by CLI flags, or by a mounted ConfigMap) wins; env-supplied values only fill gaps. This is the only env-var path still active — the SPA itself does not read env vars. Operators get the deployment-time knob without env vars leaking into runtime behaviour.

```bash
docker run \
  -e PH_CONNECT_CONFIG_JSON='{"connect":{"renown":{"url":"https://renown.staging"},"app":{"logLevel":"debug"}}}' \
  connect:latest
```

Invalid JSON (parse error or non-object payload) aborts startup with a clear stderr message rather than silently dropping the operator payload. The shell layer keeps `PH_CONNECT_BASE_PATH` separate because nginx needs it for URL templating before any JSON is touched.

## How Connect reads the file at boot

`apps/connect/main.tsx`:

```tsx
import { createRoot } from "react-dom/client";
import { loadRuntimeConfig } from "./src/runtime-config.js";

if (!window.ph) window.ph = {};

// Bootstrap the runtime config BEFORE AppLoader's transitive imports
await loadRuntimeConfig();
const { AppLoader } = await import("./src/components/app-loader.js");

createRoot(document.getElementById("root")!).render(<AppLoader />);
```

Two ordering tricks:

1. **Top-level await** on `loadRuntimeConfig()` blocks module evaluation until the fetch resolves.
2. **Dynamic import** of `AppLoader` so any module that calls `getRuntimeConfig()` at import time (synchronous read from the cache) only runs _after_ step 1.

Together these prevent a cache-empty race where the SPA would have to fall back to defaults or throw.

`loadRuntimeConfig` (in `apps/connect/src/runtime-config.ts`) is a 4-line wrapper around the shared loader:

```ts
const loader = new ConfigLoader(
  new JsonConfigAdapter({
    path: `${import.meta.env.BASE_URL}powerhouse.config.json`,
  }),
);
```

- `ConfigLoader` (in `packages/shared/connect/config-loader.ts`) wraps any `ConfigAdapter` with deep-merge-against-defaults and in-process caching.
- `JsonConfigAdapter` reads via `fetch()` when `window` is defined, via `fs` in Node.
- After `loadRuntimeConfig()` resolves once, any synchronous `getRuntimeConfig()` call returns the cached payload immediately.

Downstream consumers inside the SPA:

| File                                            | Reads                                                                                                                                   |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/connect/src/connect.config.ts`            | Re-exports the cached config behind getters (`getConnectConfig()`) so the rest of the SPA reads typed accessors instead of dotted paths |
| `apps/connect/src/hooks/useRegistryPackages.ts` | `getRuntimeConfig().packageRegistryUrl`                                                                                                 |
| `apps/connect/src/store/reactor.ts`             | Passes `packageRegistryUrl` to `BrowserPackageManager`                                                                                  |
| Renown auth flow                                | Reads `connect.renown.*`                                                                                                                |
| Drives sidebar                                  | Reads `connect.drives.*`                                                                                                                |
| Router                                          | Reads `connect.app.basePath`                                                                                                            |

A hard refresh in the browser tears down the module graph; the next module evaluation runs `loadRuntimeConfig()` again and the SPA picks up whatever the dist file holds now. This is the path operators use after `ph connect config --renown-url X`: write the new value, refresh the tab.

## Other consumers of the same file

The dist `powerhouse.config.json` is not a Connect-private artefact:

- **Switchboard** (Node) reads `packages[]` and `packageRegistryUrl` at startup via the same `ConfigLoader` + `JsonConfigAdapter` (Node branch).
- **`ph install` / `ph publish`** use `resolveRegistryUrl` to pick a registry with priority `--flag > PH_REGISTRY_URL env > config.packageRegistryUrl > DEFAULT_REGISTRY_URL`.

This is why `packageRegistryUrl` lives at the top level rather than nested under `connect.*` — it's a project-wide setting, not Connect-only.

## Common operator workflows

**"I just want to point Connect at a different registry."**
Edit the project's `powerhouse.config.json`, set `"packageRegistryUrl": "https://my.registry"`, refresh Connect. Or `ph connect config --packages-registry https://my.registry`.

**"I want a subpath deploy (`/connect` instead of `/`)."**
`ph connect build --base /connect`. The CLI override lands in the dist `connect.app.basePath` and the bundled assets pick it up.

**"I want default drives to load automatically."**
`ph connect config --default-drives-url https://drive-a, https://drive-b`. The CSV is parsed into `connect.drives.defaultDrives[]` objects.

**"I'm deploying the docker image to a new environment and need to override renown."**
Set `PH_CONNECT_CONFIG_JSON='{"connect":{"renown":{"url":"https://renown.staging.example"}}}'` on the container. The entrypoint script deep-merges the JSON into the dist file before nginx starts (set-if-absent); the SPA serves the new value on the very first request.

**"I need a different Sentry DSN per environment."**
Sentry config lives in `connect.sentry.*` of `powerhouse.config.json`. The DSN, environment label, and tracing flag are all runtime — one Docker image serves staging + prod by switching the env-supplied JSON:

```bash
docker run -e PH_CONNECT_CONFIG_JSON='{
  "connect": {
    "sentry": { "dsn": "https://prod-key@sentry.io/1", "env": "prod", "tracing": true }
  }
}' connect:latest
```

`dsn: null` (the default) disables Sentry — the SPA never loads the Sentry SDK chunk. The Sentry **release** tag, in contrast, stays build-time (stamped via Vite's `define` from `WORKSPACE_VERSION`) so it always matches the sourcemap upload tag CI used.

**"I want to verify what Connect will actually use without booting it."**
`ph connect config` (no args) prints the effective `connect.*` block (defaults merged with source). `ph connect config connect.renown.url` (or the equivalent `--get connect.renown.url`) prints a single value.

## Adding or changing a config field (developers)

A `connect.*` field has five artefacts that must stay in lockstep. The TS
constants are the source of truth; the two committed `*.schema.json` files are
generated from them. Miss a step and the schemas silently drift from the types.

1. **Type** — `packages/shared/clis/types.ts`. Add the field to the relevant
   `PHConnect*` type (e.g. `PHConnectPackages`).
2. **Default** — `packages/shared/connect/runtime-config.ts`. Add the field's
   default to `DEFAULT_CONNECT_CONFIG` so the SPA never sees it undefined.
3. **Schema fragment** — `packages/shared/connect/schema-fragments.ts`. Declare
   the field (type, description, `default`) in `phConnectRuntimeConfigSchema`.
   Both committed schemas import this fragment, so declaring it once keeps the
   source-config and runtime-config schemas in sync by construction.
4. **Rebuild** the source-of-truth packages so the emit script sees the change:
   ```bash
   pnpm --filter=@powerhousedao/shared --filter=@powerhousedao/builder-tools build
   ```
5. **Regenerate** the committed JSON schemas:
   ```bash
   pnpm tsx scripts/emit-schemas.ts
   ```
   This rewrites `packages/builder-tools/connect-utils/runtime-config.schema.json`
   and `packages/shared/clis/source-config.schema.json`. Commit both.

Then consume it in the SPA via `getRuntimeConfig().connect?.<block>?.<field>`
(or add a typed accessor in `apps/connect/src/connect.config.ts`).

Optional, depending on the field:

- **CLI flag** — to expose `ph connect config/build --<field>`, wire it through
  `packages/shared/clis/args/connect.ts` and `clis/ph-cli/src/utils/cli-connect-override.ts`
  (see `externalEnabled` → `--external-packages` for the pattern).
- **Scaffold default** — if new projects should ship the field, add it to the
  `ph init` template at `packages/codegen/src/templates/boilerplate/powerhouse.config.json.ts`.

The `runtime-config-schema.test.ts` coverage test asserts every key emitted from
`DEFAULT_CONNECT_CONFIG` has a matching schema declaration — it fails loudly if
you add a default (step 2) but skip the schema fragment (step 3).

## Reference: key files

```
packages/shared/connect/
  ├ runtime-config.ts             DEFAULT_CONNECT_CONFIG, types, buildRuntimeConfig
  ├ config-loader.ts              ConfigLoader, ConfigAdapter, deepMerge
  └ json-adapter.ts               JsonConfigAdapter (browser fetch | Node fs)

packages/builder-tools/connect-utils/
  ├ runtime-config-schema.ts      JSON Schema (Ajv)
  └ vite-plugins/ph-config.ts     Emits dist file & serves /powerhouse.config.json in dev

clis/ph-cli/src/
  ├ utils/cli-connect-override.ts  buildConnectFlagPatch, wasFlagExplicitlyPassed, buildCliConnectOverride
  ├ utils/connect-config-validation.ts  validateConnectPatch (Ajv)
  ├ services/connect-config.ts    `ph connect config` handler
  ├ services/connect-studio.ts    `ph connect studio` (accepts callerOverride)
  ├ services/vetra.ts             `ph vetra` (constructs callerOverride)
  ├ commands/install.ts           `ph install` (writes packageRegistryUrl)
  └ utils.ts                      updateConfigFile

apps/connect/
  ├ main.tsx                      top-level await + dynamic import (boot race fix)
  └ src/runtime-config.ts         loadRuntimeConfig, getRuntimeConfig

packages/codegen/src/templates/boilerplate/powerhouse.config.json.ts
  └ `ph init` boilerplate template

docker/connect-entrypoint.sh
  └ PH_CONNECT_CONFIG_JSON → dist seeding (jq deep-merge, set-if-absent)
```

## Design principle, in one line

The SPA never reads `process.env`; it reads one JSON file. Everything an operator or developer wants to configure — by CLI, env, manual edit, scaffolding, or programmatic API — ends up in that file, with a single, clear precedence: `defaults < source < CLI override`, plus `set-if-absent` env vars at deploy time.
