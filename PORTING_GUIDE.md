# Porting Guide: `feat/ph-commands-for-registry` → `feat-add-ph-build-command`

> This document describes the features from the `feat/ph-commands-for-registry` branch that need to be ported into the `feat-add-ph-build-command` branch. Each feature is self-contained with all context needed to execute the port.

## Branch Context

- **Source branch:** `feat/ph-commands-for-registry` (HEAD: `89b2abb0773b81f5ac62a1f066656b6b1a4c0917`)
- **Target branch:** `feat-add-ph-build-command` (HEAD at time of writing: `87b35eb0fc6d06110bc535308e46ccbf3e27e4db`)
- **Common ancestor:** Both branches diverge from `main`.
- **Additional context:** See `/Users/gpuente/Projects/powerhouse/ph-monorepo/DYNAMIC_PACKAGE_LOADING.md` for the full architecture of how packages are built, published, and loaded at runtime.

### Source branch commits (oldest first)

| SHA         | Message                                                                     |
| ----------- | --------------------------------------------------------------------------- |
| `1b412a87c` | `feat: registry-based ph install with config-driven package loading`        |
| `bd3e6f28d` | `feat(ph-cli): add ph publish command for registry publishing`              |
| `5fe6b8f1f` | `fix(ph-cli): set registry env vars from config in assignEnvVars`           |
| `d3e25d9f4` | `fix(ph-cli): let PH_REGISTRY_URL and PH_REGISTRY_PACKAGES override config` |
| `431878936` | `feat(switchboard): add DYNAMIC_MODEL_LOADING feature flag`                 |
| `6006beb3c` | `feat(ph-cli): add --registry flag to ph install and derive CDN URLs`       |
| `89b2abb07` | `temp commit` (NOT part of this porting effort — skip)                      |

---

## Tracking Table

| #   | Feature                                                                                                                                                                | Status  | Commit on target branch |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------- |
| 1   | [Config types + `resolveRegistryConfig` helper](#feature-1-config-types--resolveregistryconfig-helper)                                                                 | DONE    | (pending commit)        |
| 2   | [Registry-based `ph install` / `ph uninstall`](#feature-2-registry-based-ph-install--ph-uninstall)                                                                     | DONE    | (pending commit)        |
| 3   | [`ph publish` command](#feature-3-ph-publish-command)                                                                                                                  | DONE    | (pending commit)        |
| 4   | [Config-driven registry loading (switchboard + connect + vite-config + reactor)](#feature-4-config-driven-registry-loading-switchboard--connect--vite-config--reactor) | PENDING | —                       |
| 5   | [`assignEnvVars` registry support](#feature-5-assignenvvars-registry-support)                                                                                          | PENDING | —                       |
| 6   | [`DYNAMIC_MODEL_LOADING` feature flag](#feature-6-dynamic_model_loading-feature-flag)                                                                                  | PENDING | —                       |

---

## Feature 1: Config types + `resolveRegistryConfig` helper

### Summary

Add `"registry"` as a package provider type, define `DEFAULT_REGISTRY_URL`, add `registryUrl` to `PowerhouseConfig`, and create a `resolveRegistryConfig()` helper that merges config file values with env var overrides. This is the **foundation** that all other features depend on.

### Source commits

- `1b412a87c` — the parts touching `packages/config/src/powerhouse.ts`

### Files to modify

#### `packages/config/src/powerhouse.ts`

**What to do:**

1. Add `"registry"` to the `PHPackageProvider` union type.
2. Export a `DEFAULT_REGISTRY_URL` constant set to `"https://registry.prod.vetra.io"`.
3. Add `registryUrl?: string` to the `PowerhouseConfig` type.
4. Add the `resolveRegistryConfig()` function.

**Current state on target branch (verify before porting):**

```
git show HEAD:packages/config/src/powerhouse.ts | grep -n "PHPackageProvider\|registryUrl\|DEFAULT_REGISTRY\|resolveRegistryConfig"
```

Expected: `PHPackageProvider = "npm" | "github" | "local"` — no `"registry"`, no `registryUrl`, no `DEFAULT_REGISTRY_URL`, no `resolveRegistryConfig`.

**Source branch state — get the exact code to port:**

```
git show 1b412a87c:packages/config/src/powerhouse.ts
```

**Specific changes from source diff:**

```
git diff 1b412a87c^..1b412a87c -- packages/config/src/powerhouse.ts
```

**Key code to add:**

```typescript
// 1. Update the type
export type PHPackageProvider = "npm" | "github" | "local" | "registry";

// 2. Add constant
export const DEFAULT_REGISTRY_URL = "https://registry.prod.vetra.io";

// 3. Add to PowerhouseConfig type (alongside existing fields)
registryUrl?: string;

// 4. Add helper function (before the VETRA_PROCESSOR_CONFIG_KEY export)
export function resolveRegistryConfig(
  config: PowerhouseConfig,
  env: Record<string, string | undefined> = {},
): {
  registryUrl: string | undefined;
  packageNames: string[];
} {
  let registryUrl = config.registryUrl;
  let packageNames =
    config.packages
      ?.filter((p) => p.provider === "registry")
      .map((p) => p.packageName) ?? [];

  // Env vars override config
  if (env.PH_REGISTRY_URL) {
    registryUrl = env.PH_REGISTRY_URL;
  }
  if (env.PH_REGISTRY_PACKAGES) {
    packageNames = env.PH_REGISTRY_PACKAGES.split(",").map((p) => p.trim());
  }

  return { registryUrl, packageNames };
}
```

### Tests to port

- `clis/ph-cli/test/resolve-registry-config.test.ts` — skipped: the source branch placed this test in `ph-cli` but `resolveRegistryConfig` lives in `packages/config`. The config package has no vitest setup yet. Tests should be added to `packages/config` when test infrastructure is set up there.

### Adaptation notes

- **`packageRegistryUrl` is the canonical config field name on this branch.** The source branch uses `registryUrl` as the config field, but the target branch already has `packageRegistryUrl?: string` in `PowerhouseConfig` (line 74). All ported code uses `config.packageRegistryUrl` instead of `config.registryUrl`. The return value of `resolveRegistryConfig()` still uses `registryUrl` (it's the resolved value, not the config field name).

### Verification after porting

```bash
# Type check
cd packages/config && npx tsc --noEmit
```

---

## Feature 2: Registry-based `ph install` / `ph uninstall`

### Summary

Change `ph install` and `ph uninstall` to be registry-first: by default they only update `powerhouse.config.json` with provider `"registry"`. The `--local` flag triggers the old behavior (npm install + styles update). A `--registry` flag allows specifying a custom registry URL. The version lookup queries the specified registry instead of the default npm registry.

### Dependencies

- **Requires Feature 1** (config types, `DEFAULT_REGISTRY_URL`).

### Source commits

- `1b412a87c` — install/uninstall changes, utils.ts changes, common/clis args changes
- `6006beb3c` — adds `--registry` flag to install, passes `registryUrl` through to version lookup and config update

### Files to modify

#### `packages/common/clis/args/install.ts`

**What to do:** Add `--local` flag and `--registry` option.

**Current state on target branch (verify):**

```
git show HEAD:packages/common/clis/args/install.ts
```

Expected: only has `dependencies` + `packageManagerArgs` + `debugArgs`.

**Source branch final state:**

```
git show 6006beb3c:packages/common/clis/args/install.ts
```

#### `packages/common/clis/args/uninstall.ts`

**What to do:** Add `--local` flag.

**Current state on target branch (verify):**

```
git show HEAD:packages/common/clis/args/uninstall.ts
```

**Source branch final state:**

```
git show 1b412a87c:packages/common/clis/args/uninstall.ts
```

#### `packages/common/clis/file-system/dependencies.ts`

**What to do:** `fetchPackageVersionFromNpmRegistry` should accept an optional `registryUrl` param and pass `--registry <url>` to `npm view` when provided.

**Current state on target branch (verify):**

```
git show HEAD:packages/common/clis/file-system/dependencies.ts
```

**Source branch final state:**

```
git show 6006beb3c:packages/common/clis/file-system/dependencies.ts
```

#### `packages/common/clis/file-system/projects.ts`

**What to do:** `makeDependenciesWithVersions` should accept an optional `registryUrl` and forward it to `fetchPackageVersionFromNpmRegistry`.

**Current state on target branch (verify):**

```
git show HEAD:packages/common/clis/file-system/projects.ts
```

**Source branch final state:**

```
git show 6006beb3c:packages/common/clis/file-system/projects.ts
```

#### `clis/ph-cli/src/commands/install.ts`

**What to do:**

1. Import `DEFAULT_REGISTRY_URL` from `@powerhousedao/config` and `getConfig` from `@powerhousedao/config/node`.
2. Resolve registry URL with priority: `args.registry > config.registryUrl > process.env.PH_REGISTRY_URL > DEFAULT_REGISTRY_URL`.
3. Pass `registryUrl` to `makeDependenciesWithVersions`.
4. Make npm install + styles update conditional on `args.local`.
5. Pass `registryUrl` to `updateConfigFile`.
6. Update the command description.

**Current state on target branch (verify):**

```
git show HEAD:clis/ph-cli/src/commands/install.ts
```

Expected: old behavior — always does npm install, always updates styles, no `--local` flag, no `--registry` flag.

**Source branch final state:**

```
git show 6006beb3c:clis/ph-cli/src/commands/install.ts
```

#### `clis/ph-cli/src/commands/uninstall.ts`

**What to do:**

1. Make npm uninstall + styles removal conditional on `args.local`.
2. Update the command description.

**Current state on target branch (verify):**

```
git show HEAD:clis/ph-cli/src/commands/uninstall.ts
```

**Source branch final state:**

```
git show 1b412a87c:clis/ph-cli/src/commands/uninstall.ts
```

#### `clis/ph-cli/src/utils.ts`

**What to do:**

1. Import `DEFAULT_REGISTRY_URL` from `@powerhousedao/config`.
2. Change default provider in `updatePackagesArray` from `"npm"` to `"registry"`.
3. Add `registryUrl?: string` parameter to `updateConfigFile`.
4. In `updateConfigFile`, when task is `"install"`, set `updatedConfig.registryUrl` to `registryUrl ?? updatedConfig.registryUrl ?? DEFAULT_REGISTRY_URL`.

**Current state on target branch (verify):**

```
git show HEAD:clis/ph-cli/src/utils.ts | grep -n "provider\|registryUrl\|DEFAULT_REGISTRY"
```

Expected: provider is `"npm"`, no registryUrl logic.

**Source branch final state:**

```
git show 6006beb3c:clis/ph-cli/src/utils.ts
```

### Tests to port

- `clis/ph-cli/test/utils.test.ts` — new comprehensive test file from `1b412a87c`:
  ```
  git show 1b412a87c:clis/ph-cli/test/utils.test.ts
  ```

### Verification after porting

```bash
cd clis/ph-cli && npx vitest run test/utils.test.ts
cd packages/common && npx tsc --noEmit
cd clis/ph-cli && npx tsc --noEmit
```

### Adaptation discoveries (for future features)

- **`registryUrl` → `packageRegistryUrl`:** The source branch's `utils.ts` and `install.ts` use `config.registryUrl` / `updatedConfig.registryUrl`. On this branch, the canonical config field is `packageRegistryUrl`. This affects Features 3, 4, and 5 which also reference `registryUrl` as a config field — all must be adapted to `packageRegistryUrl`.
- **`updateConfigFile` signature change:** Now accepts a 4th parameter `registryUrl?: string`. Feature 5 (`assignEnvVars`) should be aware of this when calling `updateConfigFile`.
- **Provider default changed:** `updatePackagesArray` now uses `"registry"` as the default provider instead of `"npm"`.

---

## Feature 3: `ph publish` command

### Summary

Add a new `ph publish` CLI command that wraps `npm publish` and automatically resolves the registry URL (flag > config > env > default). It checks authentication with `npm whoami` before publishing.

### Dependencies

- **Requires Feature 1** (`DEFAULT_REGISTRY_URL`, `registryUrl` in config).

### Source commits

- `bd3e6f28d` — all files for publish command

### Files to create

#### `packages/common/clis/args/publish.ts` (new file)

**Get contents:**

```
git show bd3e6f28d:packages/common/clis/args/publish.ts
```

#### `clis/ph-cli/src/commands/publish.ts` (new file)

**Get contents:**

```
git show bd3e6f28d:clis/ph-cli/src/commands/publish.ts
```

#### `clis/ph-cli/test/publish.test.ts` (new file)

**Get contents:**

```
git show bd3e6f28d:clis/ph-cli/test/publish.test.ts
```

### Files to modify

#### `packages/common/clis/index.ts`

**What to do:** Add `export * from "./args/publish.js";`

**Source diff:**

```
git diff bd3e6f28d^..bd3e6f28d -- packages/common/clis/index.ts
```

#### `packages/common/clis/args/help.ts`

**What to do:** Import `publishArgs` and add `publish` to `phCliHelpCommands`.

**Source diff:**

```
git diff bd3e6f28d^..bd3e6f28d -- packages/common/clis/args/help.ts
```

#### `clis/ph-cli/src/commands/ph-cli-commands.ts`

**What to do:** Import and register the `publish` command.

**Source diff:**

```
git diff bd3e6f28d^..bd3e6f28d -- clis/ph-cli/src/commands/ph-cli-commands.ts
```

### Verification after porting

```bash
cd clis/ph-cli && npx tsc --noEmit
cd clis/ph-cli && npx vitest run test/publish.test.ts
```

---

## Feature 4: Config-driven registry loading (switchboard + connect + vite-config + reactor)

### Summary

Multiple runtime components need to read registry package configuration from `powerhouse.config.json` (merged with env vars) instead of relying solely on env vars. This feature touches switchboard, connect, vite-config, reactor-browser, reactor-api, and shared env-config.

### Dependencies

- **Requires Feature 1** (`resolveRegistryConfig`, `registryUrl` in config, `"registry"` provider).

### Source commits

- `1b412a87c` — the parts touching: `apps/switchboard/src/server.ts`, `apps/connect/src/store/reactor.ts`, `packages/builder-tools/connect-utils/vite-config.ts`, `packages/reactor-browser/src/package-manager.ts`, `packages/reactor-api/src/packages/package-manager.ts`, `packages/shared/connect/env-config.ts`
- `6006beb3c` — the parts touching: `packages/reactor-api/src/packages/http-loader.ts` (CDN URL derivation)

### Files to modify

#### `packages/shared/connect/env-config.ts`

**What to do:** Add `PH_CONNECT_REGISTRY_PACKAGE_NAMES` to the `appConfigSchema` zod object.

**Current state on target branch (verify):**

```
git show HEAD:packages/shared/connect/env-config.ts | grep -n "REGISTRY_PACKAGE_NAMES"
```

Expected: does not exist.

**Source diff:**

```
git diff 1b412a87c^..1b412a87c -- packages/shared/connect/env-config.ts
```

**Code to add (after `PH_CONNECT_PACKAGES_REGISTRY`):**

```typescript
/**
 * Comma-separated list of registry package names to load at runtime.
 * Populated from powerhouse.config.json packages with provider "registry".
 * @example "@powerhousedao/vetra,@powerhousedao/atlas"
 */
PH_CONNECT_REGISTRY_PACKAGE_NAMES: z.string().optional(),
```

#### `apps/switchboard/src/server.ts`

**What to do:** Replace the env-var-only registry loading with `resolveRegistryConfig()` that merges config + env.

**Current state on target branch (verify):**

```
git show HEAD:apps/switchboard/src/server.ts | grep -n -B2 -A10 "HTTP registry"
```

Expected: reads `registryUrl` from `process.env.PH_REGISTRY_URL` and `registryPackages` from `process.env.PH_REGISTRY_PACKAGES` directly.

**Source branch state:**

```
git show 1b412a87c:apps/switchboard/src/server.ts | grep -n -B2 -A20 "HTTP registry"
```

**What changes:**

1. Add imports: `import { resolveRegistryConfig } from "@powerhousedao/config"` and `import { getConfig } from "@powerhousedao/config/node"`.
2. Replace the direct env var reads with:
   ```typescript
   const configForRegistry = getConfig(
     options.configFile ?? path.join(process.cwd(), "powerhouse.config.json"),
   );
   const { registryUrl, packageNames: registryPackageNames } =
     resolveRegistryConfig(
       configForRegistry,
       process.env as Record<string, string | undefined>,
     );
   ```
3. Update the httpLoader + package loading logic to use `registryPackageNames` instead of parsing `registryPackages`.

**Adaptation note:** Check if `options.configFile` exists on the target branch's `StartServerOptions` type. If not, use `process.cwd()` path directly or add the field.

#### `apps/connect/src/store/reactor.ts`

**What to do:** Before calling `packageManager.init()`, read `PH_CONNECT_REGISTRY_PACKAGE_NAMES` from env (set at build time by vite) and call `packageManager.ensureStoredPackage()` for each package so they're available when `init()` runs.

**Current state on target branch (verify):**

```
git show HEAD:apps/connect/src/store/reactor.ts | grep -n -B2 -A5 "packageManager.init"
```

Expected: calls `packageManager.init()` without seeding registry packages.

**Source diff:**

```
git diff 1b412a87c^..1b412a87c -- apps/connect/src/store/reactor.ts
```

**Code to add (before `await packageManager.init()`):**

```typescript
// Ensure registry packages from config are in storage before init.
// init() will handle the actual loading from the CDN.
const registryPackageNamesStr = import.meta.env
  .PH_CONNECT_REGISTRY_PACKAGE_NAMES;
if (registryCdnUrl && registryPackageNamesStr) {
  const registryPackageNames = registryPackageNamesStr
    .split(",")
    .map((p: string) => p.trim())
    .filter(Boolean);
  for (const pkgName of registryPackageNames) {
    packageManager.ensureStoredPackage(pkgName, registryCdnUrl);
  }
}
```

**Adaptation note:** Verify that `registryCdnUrl` is available in scope at this point on the target branch. Check how the connect reactor.ts is structured:

```
git show HEAD:apps/connect/src/store/reactor.ts | grep -n "registryCdnUrl\|registryUrl"
```

#### `packages/reactor-browser/src/package-manager.ts`

**What to do:** Add `ensureStoredPackage()` public method and extract `#ensureStorageEntry()` private method from `addPackage()`.

**Current state on target branch (verify):**

```
git show HEAD:packages/reactor-browser/src/package-manager.ts | grep -n "addPackage\|ensureStoredPackage\|ensureStorageEntry"
```

Expected: `addPackage` exists, `ensureStoredPackage` does not.

**Source diff:**

```
git diff 1b412a87c^..1b412a87c -- packages/reactor-browser/src/package-manager.ts
```

**What changes:**

1. Extract the storage logic from `addPackage` into a private `#ensureStorageEntry(name, registryUrl)` method.
2. `addPackage` calls `#ensureStorageEntry` and `#notifyPackagesChanged`.
3. New public method `ensureStoredPackage(name, registryUrl)` that only calls `#ensureStorageEntry` (no fetch, no notify).

#### `packages/builder-tools/connect-utils/vite-config.ts`

**What to do:**

1. Populate `PH_CONNECT_PACKAGES_REGISTRY` from config if not already set by env.
2. Populate `PH_CONNECT_REGISTRY_PACKAGE_NAMES` from config packages with provider `"registry"`.
3. Exclude `"registry"` provider packages from the bundled packages list (they're loaded at runtime via CDN).

**Current state on target branch (verify):**

```
git show HEAD:packages/builder-tools/connect-utils/vite-config.ts | grep -n "PH_CONNECT_PACKAGES_REGISTRY\|PH_CONNECT_REGISTRY\|provider\|configPhPackages"
```

**Source diff:**

```
git diff 1b412a87c^..1b412a87c -- packages/builder-tools/connect-utils/vite-config.ts
```

**Adaptation note:** The target branch's vite-config already reads `PH_CONNECT_PACKAGES_REGISTRY` and uses `phConfig.packageRegistryUrl`. The source branch uses `phConfig.registryUrl`. You need to reconcile — likely keep reading from `registryUrl` (the new config field from Feature 1) and fall back to `packageRegistryUrl` if it exists for backwards compat, OR just use the new field name. Check:

```
git show HEAD:packages/builder-tools/connect-utils/vite-config.ts | grep -n "packageRegistryUrl\|registryUrl"
```

#### `packages/reactor-api/src/packages/package-manager.ts`

**What to do:** In `getPackageNamesFromConfigFile`, filter out packages with `provider === "registry"` (they're loaded via HTTP, not from node_modules).

**Current state on target branch (verify):**

```
git show HEAD:packages/reactor-api/src/packages/package-manager.ts | grep -n -A3 "getPackageNamesFromConfigFile"
```

**Source diff:**

```
git diff 1b412a87c^..1b412a87c -- packages/reactor-api/src/packages/package-manager.ts
```

#### `packages/reactor-api/src/packages/http-loader.ts`

**What to do:** Add CDN URL normalization — derive a `cdnUrl` from `registryUrl` that handles the case where the URL already contains `/-/cdn`.

**Current state on target branch (verify):**

```
git show HEAD:packages/reactor-api/src/packages/http-loader.ts | grep -n "cdnUrl\|/-/cdn\|registryUrl"
```

Expected: URL is constructed inline as `${this.registryUrl}-/cdn/...` without normalization.

**Source branch state:**

```
git show 6006beb3c:packages/reactor-api/src/packages/http-loader.ts | head -90
```

**What changes:**

1. Add a `private readonly cdnUrl: string` property.
2. In constructor, derive `cdnUrl`: if `registryUrl` already includes `/-/cdn`, use as-is, otherwise append `-/cdn/`.
3. Use `this.cdnUrl` instead of `this.registryUrl` when constructing import URLs.

**Adaptation note:** The target branch already constructs the URL as `${this.registryUrl}-/cdn/${packageName}/document-models/index.js`. The source branch uses `${this.cdnUrl}${packageName}/document-models.js`. The path difference (`document-models/index.js` vs `document-models.js`) needs to be verified — check which path the registry actually serves. Keep the target branch's path if it works, just add the normalization logic.

### Verification after porting

```bash
cd packages/shared && npx tsc --noEmit
cd apps/switchboard && npx tsc --noEmit
cd apps/connect && npx tsc --noEmit
cd packages/reactor-browser && npx tsc --noEmit
cd packages/reactor-api && npx tsc --noEmit
cd packages/builder-tools && npx tsc --noEmit
```

---

## Feature 5: `assignEnvVars` registry support

### Summary

When running `ph connect build`, `ph connect preview`, or `ph connect studio`, the `assignEnvVars` function should read `powerhouse.config.json` and set `PH_CONNECT_PACKAGES_REGISTRY` and `PH_CONNECT_REGISTRY_PACKAGE_NAMES` env vars so Vite exposes them to the browser. Environment variables `PH_REGISTRY_URL` and `PH_REGISTRY_PACKAGES` take priority over config file values.

### Dependencies

- **Requires Feature 1** (config types, `registryUrl` in config).
- **Requires Feature 4** — `PH_CONNECT_REGISTRY_PACKAGE_NAMES` must be in the env-config schema (added in Feature 4) for the env var to be recognized by Vite.

### Source commits

- `5fe6b8f1f` — initial implementation
- `d3e25d9f4` — adds env var override priority (this is the final state to port)

### Files to modify

#### `clis/ph-cli/src/utils/assign-env-vars.ts`

**What to do:**

1. Add imports for `getConfig` from `@powerhousedao/config/node`, `setConnectEnv` (already imported), and `join` from `path`.
2. After the existing `setConnectEnv` call, add logic to:
   - Read `powerhouse.config.json` via `getConfig`.
   - Resolve `registryUrl` as `process.env.PH_REGISTRY_URL ?? phConfig.registryUrl`.
   - Resolve `packageNames` from `process.env.PH_REGISTRY_PACKAGES` (split by comma) or from `phConfig.packages` filtered by `provider === "registry"`.
   - Call `setConnectEnv` with `PH_CONNECT_PACKAGES_REGISTRY` and `PH_CONNECT_REGISTRY_PACKAGE_NAMES`.

**Current state on target branch (verify):**

```
git show HEAD:clis/ph-cli/src/utils/assign-env-vars.ts
```

Expected: only sets 4 env vars (`PH_CONNECT_BASE_PATH`, `PH_CONNECT_DEFAULT_DRIVES_URL`, `PH_CONNECT_DRIVES_PRESERVE_STRATEGY`, `PH_DISABLE_LOCAL_PACKAGE`), no registry logic.

**Source branch final state (after both commits applied):**

```
git show d3e25d9f4:clis/ph-cli/src/utils/assign-env-vars.ts
```

### Adaptation notes

- The target branch's `vite-config.ts` already reads `PH_CONNECT_PACKAGES_REGISTRY` from env and uses it. So setting it in `assignEnvVars` will make it flow through correctly.
- The target branch's vite-config refers to `phConfig.packageRegistryUrl` — this is a different field name than what the source branch uses (`registryUrl`). The `assignEnvVars` approach sidesteps this by setting the env var directly, so vite-config picks it up from env regardless of config field naming. However, you should verify that `vite-config.ts` on the target branch reads from `env.PH_CONNECT_PACKAGES_REGISTRY` — check with:
  ```
  git show HEAD:packages/builder-tools/connect-utils/vite-config.ts | grep "PH_CONNECT_PACKAGES_REGISTRY"
  ```

### Verification after porting

```bash
cd clis/ph-cli && npx tsc --noEmit
```

---

## Feature 6: `DYNAMIC_MODEL_LOADING` feature flag

### Summary

Gate the `builder.withDocumentModelLoader(httpLoader)` call in switchboard behind a `DYNAMIC_MODEL_LOADING` feature flag (defaults to `false`). This prevents switchboard from dynamically loading unknown document models unless explicitly enabled.

### Dependencies

- None (independent feature), but touches `apps/switchboard/src/server.ts` which is also modified by Feature 4. **Port Feature 4 first** to avoid merge conflicts.

### Source commits

- `431878936`

### Files to modify

#### `apps/switchboard/src/server.ts`

**What to do:**

1. Add feature flag constant: `const DYNAMIC_MODEL_LOADING = "DYNAMIC_MODEL_LOADING"` and `const DYNAMIC_MODEL_LOADING_DEFAULT = false`.
2. In `initServer`, change `if (httpLoader)` to `if (httpLoader && options.dynamicModelLoading)` for the `builder.withDocumentModelLoader(httpLoader)` call.
3. In `startSwitchboard`, read the feature flag via `featureFlags.getBooleanValue(DYNAMIC_MODEL_LOADING, options.dynamicModelLoading ?? DYNAMIC_MODEL_LOADING_DEFAULT)` and set `options.dynamicModelLoading = dynamicModelLoading`.
4. Add it to the feature flags log output.

**Source diff:**

```
git diff 431878936^..431878936 -- apps/switchboard/src/server.ts
```

#### `apps/switchboard/src/types.ts`

**What to do:** Add `dynamicModelLoading?: boolean` to `StartServerOptions`.

**Source diff:**

```
git diff 431878936^..431878936 -- apps/switchboard/src/types.ts
```

### Verification after porting

```bash
cd apps/switchboard && npx tsc --noEmit
```

---

## General Porting Instructions

### Before starting any feature

1. **Ensure the target branch is up to date:**

   ```bash
   git checkout feat-add-ph-build-command
   git status  # check for uncommitted changes
   ```

2. **Read the current state** of every file you're about to modify on the target branch. Do NOT assume the state described in this guide is still current — verify with `git show HEAD:<file>` or by reading the file directly.

3. **Read the source branch state** of every file using the git commands provided in each feature section.

4. **Understand the differences** between the two branches. The target branch may have made different design decisions (e.g., different field names, different file structures). Adapt the source code to fit the target branch's patterns.

### After porting each feature

1. Run the verification commands listed in the feature section.
2. Update the tracking table in this file by changing `PENDING` to `DONE` and adding the commit SHA.
3. Create a commit with a descriptive message for the feature.

### Naming conventions to be aware of

| Concept                   | Source branch                                     | Target branch                                                      | Resolution                                                                                                                |
| ------------------------- | ------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Registry URL config field | `registryUrl`                                     | `packageRegistryUrl` (in `PowerhouseConfig` type and vite-config)  | Use `packageRegistryUrl` as the canonical config field on this branch. All ported code reads `config.packageRegistryUrl`. |
| CDN URL construction      | `${this.cdnUrl}${packageName}/document-models.js` | `${this.registryUrl}-/cdn/${packageName}/document-models/index.js` | Keep target branch's path (`document-models/index.js`) unless confirmed otherwise. Add the `cdnUrl` normalization.        |
