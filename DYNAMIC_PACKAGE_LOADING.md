# Dynamic Package Loading in Connect

> Comprehensive reference for how Powerhouse packages are built, published to the registry, and dynamically loaded at runtime in Connect.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Building a Package (`ph build`)](#building-a-package-ph-build)
3. [The Registry](#the-registry)
4. [Publishing to the Registry](#publishing-to-the-registry)
5. [Connect Runtime Package Loading](#connect-runtime-package-loading)
6. [Build-Time Configuration](#build-time-configuration)
7. [Environment Variables Reference](#environment-variables-reference)
8. [powerhouse.config.json](#powerhouseconfigjson)
9. [`ph connect build` and `ph connect preview`](#ph-connect-build-and-ph-connect-preview)
10. [Package Manifest (`powerhouse.manifest.json`)](#package-manifest-powerhousemanifestjson)
11. [Package Types and Data Structures](#package-types-and-data-structures)
12. [End-to-End Workflow](#end-to-end-workflow)
13. [Key Files Reference](#key-files-reference)
14. [Known Issues and Fixes](#known-issues-and-fixes)
15. [Manual Testing: Registry-Based Package Loading in Connect](#manual-testing-registry-based-package-loading-in-connect)

---

## Architecture Overview

```
┌─────────────────┐     ┌────────────────┐     ┌───────────────────────────┐
│   ph build      │────▶│  npm publish   │────▶│        Registry           │
│   (tsdown)      │     │  --registry    │     │   (Verdaccio + CDN)       │
│                 │     │  localhost:8080 │     │                           │
│ Output:         │     └────────────────┘     │  Storage: npm tarballs    │
│  dist/          │                            │  CDN Cache: extracted     │
│   index.js      │                            │    ESM bundles            │
│   style.css     │                            │                           │
│   manifest.json │                            │  Endpoints:               │
└─────────────────┘                            │   /packages (metadata)    │
                                               │   /-/cdn/<pkg>/<file>     │
                                               └────────────┬──────────────┘
                                                            │
                                               HTTP: /-/cdn/<pkg>/index.js
                                                            │
                              ┌──────────────────────────────▼─────────────────────────────┐
                              │                    Connect (Browser)                        │
                              │                                                            │
                              │  BrowserPackageManager                                     │
                              │    1. Try node_modules/{pkg}         (local-install)        │
                              │    2. Try registryUrl/{pkg}/index.js (registry-install)     │
                              │    3. ES6 dynamic import()                                  │
                              │    4. Mount <link> for style.css                            │
                              │                                                            │
                              │  Reactor                                                   │
                              │    - Registers document models from loaded packages         │
                              │    - Registers editors from loaded packages                 │
                              │    - Registers processors, subgraphs, import scripts        │
                              └────────────────────────────────────────────────────────────┘
```

**Key design decisions:**

- Connect does **NOT** use webpack module federation. It uses **native ES6 dynamic `import()`**.
- Packages are self-contained ESM bundles with all dependencies bundled in (except `react` and `react-dom`).
- The registry is a Verdaccio-based npm registry extended with a CDN layer that extracts and serves pre-built bundles.

---

## Building a Package (`ph build`)

### Command

```bash
ph build
```

### Implementation

- **CLI command definition**: `clis/ph-cli/src/commands/build.ts`
- **Build service**: `clis/ph-cli/src/services/build.ts`
- **CLI argument definitions**: `packages/common/clis/args/common.ts`

### How it works

The build uses **tsdown** (a modern TypeScript bundler) to produce ESM bundles.

**Entry points** (discovered automatically from the package directory):

- `index.ts` (main export)
- `document-models/index.ts` and `document-models/*/index.ts`
- `editors/index.ts` and `editors/*/index.ts`
- `processors/index.ts` and `processors/*/index.ts`
- `subgraphs/index.ts` and `subgraphs/*/index.ts`
- `powerhouse.manifest.json` (copied as a static JSON file)

**Build configuration:**

- **Platform**: `"neutral"` (universal — works in both Node.js and browser)
- **`alwaysBundle: ["*"]`** — bundles ALL dependencies into the output (added in commit `0cd1977b8`)
- **`neverBundle`** — exclusion list for packages that should NOT be bundled:
  - `react`, `react-dom` (provided by the host app)
  - Testing libraries (`@testing-library/*`)
  - Type definitions (`@types/*`)
  - Build tools (`@vitejs/plugin-react`, `tailwindcss`, `vitest`, `tsdown`)
  - `@tailwindcss/cli`

**Post-bundling step**: Runs Tailwind CSS compilation:

```bash
tailwindcss -i ./style.css -o ./dist/style.css
```

### CLI arguments

```
--out-dir <dir>     Output directory (default: "dist")
--clean             Clean output directory before building (default: true)
--dts               Generate TypeScript definitions (default: true)
--sourcemap         Generate sourcemaps (default: true)
--debug             Log arguments for debugging
```

### Output structure

```
dist/
  index.js                      # Main ESM bundle (all deps included)
  index.d.ts                    # TypeScript definitions
  powerhouse.manifest.json      # Package metadata (document models, editors, apps)
  style.css                     # Compiled Tailwind CSS
  document-models/
    index.js / index.d.ts
    <model-name>/
      index.js / index.d.ts
  editors/
    index.js / index.d.ts
    <editor-name>/
      index.js / index.d.ts
  processors/
    index.js / index.d.ts
  subgraphs/
    index.js / index.d.ts
```

---

## The Registry

### What it is

The registry is a **hybrid npm registry + CDN** built on Verdaccio 6.1.1 with custom Powerhouse middleware. It serves two purposes:

1. **NPM Registry**: Standard npm-compatible registry for publishing/installing packages
2. **CDN**: Serves pre-built ESM bundles for dynamic `import()` in the browser

### Implementation

- **Package**: `packages/registry`
- **Binary**: `ph-registry`
- **Main entry**: `packages/registry/src/run.ts`
- **Middleware (routes + publish hook)**: `packages/registry/src/middleware.ts`
- **CDN cache logic**: `packages/registry/src/cdn.ts`
- **Package scanning/discovery**: `packages/registry/src/packages.ts`
- **Verdaccio configuration builder**: `packages/registry/src/verdaccio-config.ts`
- **CLI argument parsing**: `packages/registry/src/cli.ts`
- **Shared types**: `packages/shared/registry/types.ts`
- **Dockerfile**: `packages/registry/Dockerfile`

### Running locally

```bash
ph-registry --port 8080 --storage-dir ./storage --cdn-cache-dir ./cdn-cache
```

### CLI options (with env variable overrides)

| Option                   | Env Variable           | Default                       | Description                 |
| ------------------------ | ---------------------- | ----------------------------- | --------------------------- |
| `--port`                 | `PORT`                 | `8080`                        | Listen port                 |
| `--storage-dir`          | `REGISTRY_STORAGE`     | `./storage`                   | Verdaccio storage directory |
| `--cdn-cache-dir`        | `REGISTRY_CDN_CACHE`   | `./cdn-cache`                 | CDN extracted bundles cache |
| `--uplink`               | `REGISTRY_UPLINK`      | `https://registry.npmjs.org/` | Upstream npm registry       |
| `--web-enabled`          | `REGISTRY_WEB`         | `true`                        | Enable Verdaccio web UI     |
| `--s3-bucket`            | `S3_BUCKET`            | —                             | S3 bucket for storage       |
| `--s3-endpoint`          | `S3_ENDPOINT`          | —                             | S3 endpoint URL             |
| `--s3-region`            | `S3_REGION`            | —                             | AWS region                  |
| `--s3-access-key-id`     | `S3_ACCESS_KEY_ID`     | —                             | AWS access key              |
| `--s3-secret-access-key` | `S3_SECRET_ACCESS_KEY` | —                             | AWS secret key              |
| `--s3-key-prefix`        | `S3_KEY_PREFIX`        | —                             | S3 key prefix               |
| `--s3-force-path-style`  | `S3_FORCE_PATH_STYLE`  | `true`                        | Force path-style S3 URLs    |

### API endpoints

| Endpoint                                 | Method  | Description                                                                        |
| ---------------------------------------- | ------- | ---------------------------------------------------------------------------------- |
| `/packages`                              | GET     | List all discovered packages with manifest info. Optional query: `?documentType=X` |
| `/packages/<packageName>`                | GET     | Get info for a single package                                                      |
| `/packages/by-document-type?type=<type>` | GET     | Find packages containing a specific document type                                  |
| `/-/cdn/<packageName>/<filePath>`        | GET     | Serve a file from a package's extracted bundle                                     |
| Standard npm protocol                    | Various | Handled by Verdaccio (publish, install, etc.)                                      |

### CDN cache behavior (`CdnCache` class in `src/cdn.ts`)

1. **First request** for a package file: fetches the npm tarball from Verdaccio, extracts it to `cdn-cache/<packageName>/<version>/`, then serves the file
2. **Subsequent requests**: served directly from the cache
3. **On publish**: the publish hook (`createPublishHook`) invalidates the cache for that package, so the next request fetches the new version
4. **File lookup order** within extracted package: root → `cdn/` → `dist/cdn/` → `dist/`
5. **Supported MIME types**: `.js`, `.css`, `.json`, `.wasm`, `.svg`, and more

### Storage structure

```
storage/                          # Verdaccio npm storage
  .verdaccio-db.json
  htpasswd                        # Authentication file
  @scope/
    package-name/
      package-name-1.0.0.tgz     # npm tarball

cdn-cache/                        # Extracted bundles for CDN serving
  @scope/
    package-name/
      1.0.0/
        package/                  # Extracted tarball contents
          index.js
          style.css
          powerhouse.manifest.json
          document-models/
          editors/
```

### Package discovery (`src/packages.ts`)

The `scanPackages()` function walks the `cdn-cache/` directory and:

1. Finds the latest version directory for each package
2. Looks for `powerhouse.manifest.json` in these locations (in order): root, `cdn/`, `dist/cdn/`, `dist/`
3. Returns `PackageInfo[]` with name, CDN path, and parsed manifest

---

## Publishing to the Registry

### Standard npm publish

```bash
npm publish --registry http://localhost:8080/
```

### What happens internally

1. **Verdaccio** handles the standard npm publish protocol, stores the tarball in `storage/`
2. **Publish hook** (`createPublishHook` in `src/middleware.ts`) intercepts the successful PUT response (status 200-299)
3. **CDN cache invalidation**: The hook calls `cdnCache.invalidate(packageName)`, clearing any cached extraction
4. On the next CDN request (`/-/cdn/<pkg>/<file>`), the `CdnCache` re-fetches and extracts the latest tarball

### Authentication

Uses Verdaccio's htpasswd file-based authentication (stored in the storage directory). To create a user:

```bash
npm adduser --registry http://localhost:8080/
```

---

## Connect Runtime Package Loading

### Overview

Connect uses a `BrowserPackageManager` to dynamically load packages at runtime using native ES6 `import()`. There is **no module federation** involved.

### Key files

| File                                              | Purpose                                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------- |
| `apps/connect/src/package-manager.ts`             | Core `BrowserPackageManager` class — handles all dynamic loading        |
| `apps/connect/src/store/reactor.ts`               | `createReactor()` — initializes the package manager and loads packages  |
| `apps/connect/src/components/app-loader.tsx`      | `AppLoader` component — bootstraps the app                              |
| `apps/connect/src/components/load.tsx`            | `Load` component — calls `createReactor()` before mounting App          |
| `apps/connect/src/globals.ts`                     | TypeScript declarations for `PH_PACKAGES` and `PH_PACKAGE_REGISTRY_URL` |
| `apps/connect/src/hooks/useRegistryPackages.ts`   | React hook for UI-driven package browsing/installation                  |
| `apps/connect/src/start-connect.tsx`              | `startConnect()` for local development with a local package             |
| `packages/reactor-browser/src/package-manager.ts` | `IPackageManager` interface definition                                  |
| `packages/reactor-browser/src/types/vetra.ts`     | `VetraPackage` type                                                     |

### Vetra as a hardcoded common package

As of commit `4b366d892` (`feat: make vetra a common package in connect`), **Vetra is statically imported and always loaded** — it is NOT loaded from the registry or node_modules dynamically. It behaves like a built-in "common" package.

**How it works** (in `apps/connect/src/package-manager.ts`):

- **Line 13**: `import * as vetraVetraPackage from "@powerhousedao/vetra";` — static import at module level
- **Lines 62-63** (in `init()`): Calls `#loadVetraPackage()` and registers it as a `"common"` source package alongside the base common package
- **Line 83** (in `addPackages()`): Skips loading if the requested package name matches vetra's manifest name — prevents double-loading if vetra is also listed in `PH_PACKAGES`
- **Lines 190-194** (`#loadVetraPackage()`): Wraps the static vetra import as a `PackageWithMeta` with source `"common"`

**Dependencies in `apps/connect/package.json`**:

```json
"@powerhousedao/powerhouse-vetra-packages": "workspace:*",
"@powerhousedao/vetra": "workspace:*",
```

Both are `workspace:*` dependencies, so vetra is bundled directly into the Connect build at compile time.

**There is no env var or config flag to disable vetra.** To temporarily disable it, you would need to:

1. Comment out lines 62-63 in `apps/connect/src/package-manager.ts` (the `#loadVetraPackage()` + `#registerPackage()` calls in `init()`)
2. Optionally comment out line 83 (the skip guard in `addPackages()`)

### Boot sequence

```
1. AppLoader (src/components/app-loader.tsx)
   └── Lazy loads Load component

2. Load (src/components/load.tsx)
   └── Calls createReactor(localPackage)

3. createReactor (src/store/reactor.ts)
   ├── Creates BrowserPackageManager(namespace, PH_PACKAGE_REGISTRY_URL)
   ├── packageManager.init(localPackage)
   │     ├── Loads "common" package (always)
   │     ├── Loads vetra package (always, hardcoded static import)
   │     └── Loads optional local dev package (if provided)
   ├── packageManager.addPackages(PH_PACKAGES ?? [])  // loads configured packages (skips vetra if listed)
   ├── Extracts documentModels from all loaded packages
   ├── Extracts upgradeManifests from all loaded packages
   └── Creates Reactor with all loaded modules
```

### Package resolution order (`#loadPackage` method)

For each package name in `PH_PACKAGES`, the `BrowserPackageManager` tries:

1. **node_modules** — `import("/node_modules/{packageName}")` (source type: `"local-install"`)
2. **Registry CDN** (only if `registryUrl` is not null) — `import("{registryUrl}/{packageName}/index.js")` (source type: `"registry-install"`)

Both use ES6 dynamic `import()`:

```typescript
// package-manager.ts ~line 220
const importedPackage = (await import(importUrl)) as DocumentModelLib;
```

### Stylesheet loading

After successfully importing the JS module, the package manager also mounts a stylesheet:

```typescript
// package-manager.ts ~line 263-287
#mountStylesheet(name: string, href: string) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;  // e.g. "http://localhost:8080/-/cdn/@powerhousedao/vetra/style.css"
  document.head.appendChild(link);
}
```

The stylesheet URL is constructed as `${importUrl}/style.css` — so for a registry package, it would be `${registryUrl}/${packageName}/style.css`.

### Package source types

| Source               | Meaning                                               |
| -------------------- | ----------------------------------------------------- |
| `"common"`           | Built-in Common package (always loaded)               |
| `"project"`          | Local development package passed via `startConnect()` |
| `"local-install"`    | Loaded from `/node_modules/`                          |
| `"registry-install"` | Loaded from registry CDN URL                          |
| `"available"`        | Discovered on registry but not yet installed          |

### What a loaded package provides

Each loaded package exposes (via the `DocumentModelLib` / `VetraPackage` interface):

- **`documentModelModules`** — document model definitions (schemas, reducers, etc.)
- **`editorModules`** — UI editor components for specific document types
- **`subgraphModules`** — GraphQL subgraph definitions
- **`importScriptModules`** — import/export scripts
- **`upgradeManifests`** — version upgrade manifests
- **`processorFactory`** — optional processor factory builder

### Local storage caching

The `BrowserPackageManager` caches package metadata in browser `localStorage` keyed by namespace. This allows the app to remember which packages were loaded across page reloads.

### Registry package browsing (UI)

The `useRegistryPackages` hook (`src/hooks/useRegistryPackages.ts`) fetches the list of available packages from the registry's `/packages` endpoint and presents them in the Connect UI for user-driven installation.

---

## Build-Time Configuration

### How `PH_PACKAGES` and `PH_PACKAGE_REGISTRY_URL` get injected

The Vite configuration in `packages/builder-tools/connect-utils/vite-config.ts` handles this:

```typescript
// vite-config.ts ~line 211-214
define: {
  PH_PACKAGES: phPackages,                           // e.g. ["@powerhousedao/vetra"]
  PH_PACKAGE_REGISTRY_URL: `"${phPackageRegistryUrl}"`,  // e.g. "http://localhost:8080/-/cdn/"
}
```

These become **compile-time global constants** — replaced by their literal values in the built JavaScript.

### Resolution priority for package list

1. **`PH_PACKAGES` env var** (comma-separated string) — highest priority
2. **`packages` array in `powerhouse.config.json`** — fallback

### Resolution priority for registry URL

1. **`PH_CONNECT_PACKAGES_REGISTRY` env var** — highest priority
2. **`packageRegistryUrl` in `powerhouse.config.json`** — fallback
3. Defaults to `null` if neither is set (registry loading disabled)

### Global declarations (`src/globals.ts`)

```typescript
declare global {
  const PH_PACKAGES: string[] | undefined;
  const PH_PACKAGE_REGISTRY_URL: string | null;
}
```

---

## Environment Variables Reference

### Build-time variables (PH\_\*)

These are resolved at Vite build time and baked into the output.

| Variable                   | Type                     | Default                    | Description                           |
| -------------------------- | ------------------------ | -------------------------- | ------------------------------------- |
| `PH_PACKAGES`              | string (comma-separated) | `[]`                       | Package names to load at startup      |
| `PH_CONFIG_PATH`           | string                   | `"powerhouse.config.json"` | Path to config file                   |
| `PH_LOCAL_PACKAGE`         | string                   | —                          | Path to local package for development |
| `PH_DISABLE_LOCAL_PACKAGE` | boolean                  | `false`                    | Skip local package loading            |
| `PH_WATCH_TIMEOUT`         | number (ms)              | `300`                      | File watch debounce timeout           |
| `PH_SENTRY_AUTH_TOKEN`     | string                   | —                          | Sentry auth token for source maps     |
| `PH_SENTRY_ORG`            | string                   | —                          | Sentry organization slug              |
| `PH_SENTRY_PROJECT`        | string                   | —                          | Sentry project slug                   |

### Runtime application variables (PH*CONNECT*\*)

These configure Connect's runtime behavior. Defined via Zod schema in `packages/shared/connect/env-config.ts`.

#### Core app config

| Variable                 | Type    | Default     | Description                                 |
| ------------------------ | ------- | ----------- | ------------------------------------------- |
| `PH_CONNECT_VERSION`     | string  | `"unknown"` | App version                                 |
| `PH_CONNECT_LOG_LEVEL`   | enum    | `"info"`    | `"debug"` / `"info"` / `"warn"` / `"error"` |
| `PH_CONNECT_BASE_PATH`   | string  | —           | Base router path (overrides Vite BASE_URL)  |
| `PH_CONNECT_STUDIO_MODE` | boolean | `false`     | Enable studio mode                          |
| `PH_CONNECT_CLI_VERSION` | string  | —           | CLI version string                          |

#### Packages & registry

| Variable                                | Type                                 | Default | Description                          |
| --------------------------------------- | ------------------------------------ | ------- | ------------------------------------ |
| `PH_CONNECT_PACKAGES`                   | string (comma-separated)             | —       | Runtime package names                |
| `PH_CONNECT_PACKAGES_REGISTRY`          | string (URL or comma-separated URLs) | —       | Registry CDN endpoint(s)             |
| `PH_CONNECT_EXTERNAL_PACKAGES_DISABLED` | boolean                              | `false` | Disable all registry package loading |

#### Feature flags

| Variable                                            | Type    | Default                       | Description                                 |
| --------------------------------------------------- | ------- | ----------------------------- | ------------------------------------------- |
| `PH_CONNECT_DISABLE_ADD_DRIVE`                      | boolean | `false`                       | Disable "add drive" UI                      |
| `PH_CONNECT_SEARCH_BAR_ENABLED`                     | boolean | `false`                       | Enable search bar                           |
| `PH_CONNECT_INSPECTOR_ENABLED`                      | boolean | `false`                       | Enable inspector                            |
| `PH_CONNECT_HIDE_DOCUMENT_MODEL_SELECTION_SETTINGS` | boolean | `true`                        | Hide doc model selection in settings        |
| `PH_CONNECT_ENABLED_EDITORS`                        | string  | —                             | Comma-separated editor IDs or `"*"` for all |
| `PH_CONNECT_DISABLED_EDITORS`                       | string  | `"powerhouse/document-drive"` | Comma-separated editor IDs to disable       |

#### Drives

| Variable                                  | Type                          | Default | Description                      |
| ----------------------------------------- | ----------------------------- | ------- | -------------------------------- |
| `PH_CONNECT_DEFAULT_DRIVES_URL`           | string (comma-separated URLs) | —       | Default drive REST endpoint URLs |
| `PH_CONNECT_DRIVES_PRESERVE_STRATEGY`     | string                        | —       | Drive preservation strategy      |
| `PH_CONNECT_PUBLIC_DRIVES_ENABLED`        | boolean                       | `true`  | Enable public drives             |
| `PH_CONNECT_CLOUD_DRIVES_ENABLED`         | boolean                       | `true`  | Enable cloud drives              |
| `PH_CONNECT_LOCAL_DRIVES_ENABLED`         | boolean                       | `true`  | Enable local drives              |
| `PH_CONNECT_DISABLE_ADD_PUBLIC_DRIVES`    | boolean                       | `false` | Disable adding public drives     |
| `PH_CONNECT_DISABLE_ADD_CLOUD_DRIVES`     | boolean                       | `false` | Disable adding cloud drives      |
| `PH_CONNECT_DISABLE_ADD_LOCAL_DRIVES`     | boolean                       | `false` | Disable adding local drives      |
| `PH_CONNECT_DISABLE_DELETE_PUBLIC_DRIVES` | boolean                       | `false` | Disable deleting public drives   |
| `PH_CONNECT_DISABLE_DELETE_CLOUD_DRIVES`  | boolean                       | `false` | Disable deleting cloud drives    |
| `PH_CONNECT_DISABLE_DELETE_LOCAL_DRIVES`  | boolean                       | `false` | Disable deleting local drives    |

#### Processors

| Variable                                   | Type    | Default | Description                  |
| ------------------------------------------ | ------- | ------- | ---------------------------- |
| `PH_CONNECT_PROCESSORS_ENABLED`            | boolean | `true`  | Enable processors            |
| `PH_CONNECT_EXTERNAL_PROCESSORS_ENABLED`   | boolean | `true`  | Enable external processors   |
| `PH_CONNECT_ANALYTICS_ENABLED`             | boolean | `true`  | Enable analytics processor   |
| `PH_CONNECT_RELATIONAL_PROCESSORS_ENABLED` | boolean | `true`  | Enable relational processors |

#### Sentry

| Variable                            | Type    | Default | Description                              |
| ----------------------------------- | ------- | ------- | ---------------------------------------- |
| `PH_CONNECT_SENTRY_DSN`             | string  | —       | Sentry DSN                               |
| `PH_CONNECT_SENTRY_ENV`             | string  | `"dev"` | Sentry environment                       |
| `PH_CONNECT_SENTRY_RELEASE`         | string  | —       | Sentry release (defaults to app version) |
| `PH_CONNECT_SENTRY_TRACING_ENABLED` | boolean | `false` | Enable Sentry tracing                    |

#### Renown (authentication)

| Variable                       | Type   | Default                   | Description        |
| ------------------------------ | ------ | ------------------------- | ------------------ |
| `PH_CONNECT_RENOWN_URL`        | string | `"https://www.renown.id"` | Renown service URL |
| `PH_CONNECT_RENOWN_NETWORK_ID` | string | `"eip155"`                | Network ID         |
| `PH_CONNECT_RENOWN_CHAIN_ID`   | number | `1`                       | Chain ID           |

### Environment loading priority

Defined in `packages/shared/connect/env-config.ts`:

1. `process.env` — highest priority
2. `.env` file contents
3. Zod schema defaults — lowest priority

Functions: `loadConnectEnv()`, `loadRuntimeEnv()`, `loadBuildEnv()`, `setConnectEnv()`

---

## powerhouse.config.json

### Schema

Defined in `packages/config/src/powerhouse.ts`. Loaded by `getConfig()` in `packages/config/src/node.ts`.

```jsonc
{
  // Directory structure
  "documentModelsDir": "./document-models",
  "editorsDir": "./editors",
  "processorsDir": "./processors",
  "subgraphsDir": "./subgraphs",
  "importScriptsDir": "./scripts",

  // Build options
  "logLevel": "info", // "verbose" | "debug" | "info" | "warn" | "error" | "silent"
  "skipFormat": false,

  // Packages to load (used by Connect)
  "packages": [
    {
      "packageName": "@powerhousedao/vetra",
      "version": "1.0.0", // optional
      "provider": "npm", // optional: "npm" | "github" | "local"
      "url": "", // optional: custom URL
    },
  ],

  // Registry URL for CDN loading
  "packageRegistryUrl": "http://localhost:8080/-/cdn/",

  // Studio config
  "studio": {
    "port": 3000,
    "host": "localhost",
    "https": false,
    "openBrowser": true,
  },

  // Reactor config
  "reactor": {
    "port": 4001,
    "https": false,
    "storage": {
      "type": "filesystem", // "filesystem" | "memory" | "postgres" | "browser"
      "filesystemPath": "./data",
      "postgresUrl": "",
    },
  },

  // Auth config
  "auth": {
    "enabled": false,
    "admins": [],
    "defaultProtection": false,
  },

  // Switchboard config
  "switchboard": {
    "port": 4001,
    "database": {
      "url": "",
    },
  },

  // Vetra config
  "vetra": {
    "driveId": "",
    "driveUrl": "",
  },
}
```

### Example configs in the repo

- `packages/vetra/powerhouse.config.json` — Vetra package config
- `test/connect-e2e/powerhouse.config.json` — Connect E2E test config
- `test/vetra-e2e/powerhouse.config.json` — Vetra E2E test config (includes `packages` and `packageRegistryUrl`)
- `test/versioned-documents/powerhouse.config.json` — Versioned documents test config

---

## `ph connect build` and `ph connect preview`

### `ph connect build`

**Implementation**: `clis/ph-cli/src/services/connect-build.ts`
**Command definition**: `clis/ph-cli/src/commands/connect.ts`

**Two-phase build:**

1. **Phase 1 — Library build** (`runBuild()`):
   - Uses tsdown to bundle the local package (document models, editors, etc.)
   - Output: `dist/` with ESM bundles

2. **Phase 2 — Vite app build**:
   - Gets base Vite config from `@powerhousedao/builder-tools` (`packages/builder-tools/connect-utils/vite-config.ts`)
   - The Vite config:
     - Loads `.env` files with `PH_` prefix
     - Loads `powerhouse.config.json`
     - Resolves `PH_PACKAGES` and `PH_CONNECT_PACKAGES_REGISTRY`
     - Injects them as compile-time constants via `define: {}`
     - Configures plugins: React, Tailwind, HTML injection, Sentry (optional)
   - Runs `vite build` with merged config
   - Output: production-ready static site

**The built output has `PH_PACKAGES` and `PH_PACKAGE_REGISTRY_URL` baked in as literal values.** At runtime, `BrowserPackageManager` uses these to know which packages to load and from where.

### `ph connect preview`

**Implementation**: `clis/ph-cli/src/services/connect-preview.ts`

- Starts a Vite preview server
- Serves the production build from `dist/`
- The built app's dynamic `import()` calls reach out to the registry URL at runtime

### `ph connect studio` (dev mode)

- Starts Vite dev server
- Same package loading logic applies but in development mode
- Local packages can be passed via `PH_LOCAL_PACKAGE` or `startConnect()` function

---

## Package Manifest (`powerhouse.manifest.json`)

Every Powerhouse package must include a `powerhouse.manifest.json` at its root. This file is read by the registry for package discovery and by the package manager for module registration.

### Structure

```jsonc
{
  "name": "@powerhousedao/vetra",
  "description": "Vetra package",
  "version": "1.0.0",
  "category": "",
  "publisher": {
    "name": "@powerhousedao",
    "url": "https://github.com/powerhouse-inc/powerhouse/tree/main/packages/vetra",
  },
  "documentModels": [
    {
      "id": "powerhouse/package",
      "name": "Vetra Package",
    },
    {
      "id": "powerhouse/document-editor",
      "name": "Document Editor",
    },
  ],
  "editors": [
    {
      "id": "vetra-package-editor",
      "name": "Vetra Package Editor",
      "documentTypes": ["powerhouse/package"],
    },
  ],
  "apps": [
    {
      "id": "vetra-drive-app",
      "name": "Vetra Drive App",
      "driveEditor": "vetra-drive-app",
    },
  ],
  "subgraphs": [],
  "importScripts": [],
}
```

### Type definition

From `packages/shared/registry/types.ts`:

```typescript
interface PowerhouseManifest {
  name: string;
  description?: string;
  version?: string;
  category?: string;
  publisher?: { name: string; url: string };
  documentModels?: PowerhouseManifestDocumentModel[];
  editors?: PowerhouseManifestEditor[];
  apps?: PowerhouseManifestApp[];
  subgraphs?: unknown[];
  importScripts?: unknown[];
}
```

### Where it's looked for

The registry's CDN cache looks for the manifest in this order:

1. `powerhouse.manifest.json` (root)
2. `cdn/powerhouse.manifest.json`
3. `dist/cdn/powerhouse.manifest.json`
4. `dist/powerhouse.manifest.json`

---

## Package Types and Data Structures

### VetraPackage (runtime type)

From `packages/reactor-browser/src/types/vetra.ts`:

```typescript
type VetraPackage = {
  id: string;
  name: string;
  description: string;
  category: string;
  author: Author;
  modules: {
    documentModelModules?: VetraDocumentModelModule[];
    editorModules?: VetraEditorModule[];
    subgraphModules?: SubgraphModule[];
    importScriptModules?: ImportScriptModule[];
  };
  upgradeManifests: UpgradeManifest[];
  processorFactory?: ProcessorFactoryBuilder;
};
```

### PackageInfo (registry type)

From `packages/shared/registry/types.ts`:

```typescript
interface PackageInfo {
  name: string;
  path: string; // CDN path, e.g. "/-/cdn/@scope/pkg"
  manifest: PowerhouseManifest | null;
}
```

### PackageWithMeta (browser package manager)

From `apps/connect/src/package-manager.ts`:

Tracks loaded packages with their source and metadata:

- `package`: The loaded module
- `source`: `"common"` | `"project"` | `"local-install"` | `"registry-install"`
- `name`: Package name

---

## End-to-End Workflow

### Scenario: Build vetra, publish to local registry, load in Connect

```bash
# 1. Start the local registry
ph-registry --port 8080 --storage-dir ./storage --cdn-cache-dir ./cdn-cache

# 2. Build the vetra package
cd packages/vetra
ph build

# 3. Publish to local registry
npm publish --registry http://localhost:8080/

# 4. Configure Connect to use the registry
#    Option A: via environment variables
export PH_PACKAGES="@powerhousedao/vetra"
export PH_CONNECT_PACKAGES_REGISTRY="http://localhost:8080/-/cdn/"

#    Option B: via powerhouse.config.json
#    {
#      "packages": [{ "packageName": "@powerhousedao/vetra" }],
#      "packageRegistryUrl": "http://localhost:8080/-/cdn/"
#    }

# 5a. Run Connect in dev mode
cd apps/connect
ph connect studio

# 5b. Or build and preview
ph connect build
ph connect preview
```

### What happens at runtime

1. Connect builds with `PH_PACKAGES = ["@powerhousedao/vetra"]` and `PH_PACKAGE_REGISTRY_URL = "http://localhost:8080/-/cdn/"` baked in
2. On app load, `createReactor()` creates a `BrowserPackageManager` with the registry URL
3. `addPackages(["@powerhousedao/vetra"])` is called
4. For `@powerhousedao/vetra`:
   - Tries `import("/node_modules/@powerhousedao/vetra")` → likely fails (not locally installed)
   - Tries `import("http://localhost:8080/-/cdn/@powerhousedao/vetra/index.js")` → succeeds
5. The registry's CDN handler:
   - Checks if `@powerhousedao/vetra` is already extracted in `cdn-cache/`
   - If not, fetches the npm tarball from its own Verdaccio storage, extracts it
   - Serves `index.js` with proper MIME type
6. The imported module is registered in the Reactor with its document models, editors, etc.
7. A `<link>` tag is injected for `http://localhost:8080/-/cdn/@powerhousedao/vetra/style.css`

### Server-side loading (Switchboard / Reactor API)

The registry is also used server-side via `HttpPackageLoader` (`packages/reactor-api/src/packages/http-loader.ts`):

- Used by Switchboard (`apps/switchboard/src/server.ts`)
- Queries `/packages/by-document-type` to discover packages for specific document types
- Downloads and loads packages dynamically on the server

---

## Key Files Reference

### CLI (ph-cli)

| File                                          | Description                                |
| --------------------------------------------- | ------------------------------------------ |
| `clis/ph-cli/src/commands/build.ts`           | `ph build` command definition              |
| `clis/ph-cli/src/services/build.ts`           | Build implementation using tsdown          |
| `clis/ph-cli/src/commands/connect.ts`         | `ph connect studio/build/preview` commands |
| `clis/ph-cli/src/services/connect-build.ts`   | Connect Vite build implementation          |
| `clis/ph-cli/src/services/connect-preview.ts` | Connect preview server                     |

### Registry

| File                                        | Description                                                       |
| ------------------------------------------- | ----------------------------------------------------------------- |
| `packages/registry/src/run.ts`              | Main registry initialization                                      |
| `packages/registry/src/middleware.ts`       | Express routers: /packages, /-/cdn, publish hook                  |
| `packages/registry/src/cdn.ts`              | `CdnCache` class: tarball extraction, caching, invalidation       |
| `packages/registry/src/packages.ts`         | `scanPackages()`, `loadPackage()`, `findPackagesByDocumentType()` |
| `packages/registry/src/verdaccio-config.ts` | Verdaccio configuration builder                                   |
| `packages/registry/src/cli.ts`              | CLI argument parsing                                              |
| `packages/registry/README.md`               | Registry documentation                                            |

### Connect App

| File                                            | Description                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `apps/connect/src/package-manager.ts`           | `BrowserPackageManager` — core dynamic loading                     |
| `apps/connect/src/store/reactor.ts`             | `createReactor()` — initializes packages and reactor               |
| `apps/connect/src/components/app-loader.tsx`    | App bootstrapping component                                        |
| `apps/connect/src/components/load.tsx`          | Calls `createReactor()` before mounting App                        |
| `apps/connect/src/globals.ts`                   | Global type declarations for PH_PACKAGES, PH_PACKAGE_REGISTRY_URL  |
| `apps/connect/src/hooks/useRegistryPackages.ts` | React hook for browsing/installing registry packages               |
| `apps/connect/src/start-connect.tsx`            | `startConnect()` for local dev                                     |
| `apps/connect/src/connect.config.ts`            | Runtime configuration                                              |
| `apps/connect/vite.config.ts`                   | Vite config (defines PH_PACKAGES=[], PH_PACKAGE_REGISTRY_URL=null) |

### Builder Tools

| File                                                  | Description                                                       |
| ----------------------------------------------------- | ----------------------------------------------------------------- |
| `packages/builder-tools/connect-utils/vite-config.ts` | Vite config factory — resolves PH_PACKAGES, registry URL, plugins |

### Shared Types & Config

| File                                    | Description                                           |
| --------------------------------------- | ----------------------------------------------------- |
| `packages/shared/registry/types.ts`     | `PowerhouseManifest`, `PackageInfo`, editor/app types |
| `packages/shared/connect/env-config.ts` | Zod schemas for all PH*CONNECT*\* env vars            |
| `packages/config/src/powerhouse.ts`     | `PowerhouseConfig` type definition                    |
| `packages/config/src/node.ts`           | `getConfig()` — reads powerhouse.config.json          |
| `packages/common/clis/args/common.ts`   | CLI argument definitions                              |

### Reactor (server-side)

| File                                                   | Description                                          |
| ------------------------------------------------------ | ---------------------------------------------------- |
| `packages/reactor-browser/src/package-manager.ts`      | `IPackageManager` interface                          |
| `packages/reactor-browser/src/types/vetra.ts`          | `VetraPackage` type                                  |
| `packages/reactor-api/src/packages/http-loader.ts`     | `HttpPackageLoader` for server-side registry loading |
| `packages/reactor-api/src/packages/package-manager.ts` | Server-side package management                       |

### Example Configs

| File                                      | Description                                     |
| ----------------------------------------- | ----------------------------------------------- |
| `packages/vetra/powerhouse.config.json`   | Vetra package config                            |
| `packages/vetra/powerhouse.manifest.json` | Vetra manifest (document models, editors, apps) |
| `test/connect-e2e/powerhouse.config.json` | E2E test config                                 |
| `test/vetra-e2e/powerhouse.config.json`   | Vetra E2E config with packages + registry URL   |
| `apps/connect/.env.example`               | Connect env var examples                        |

---

## Known Issues and Fixes

### 1. Registry URL mismatch: base URL vs CDN URL (FIXED)

**Problem**: `PH_PACKAGE_REGISTRY_URL` was used as a single URL for two different purposes:

- **Package listing API**: `fetch(\`${registryUrl}/packages\`)`— needs the base URL (e.g.,`http://localhost:8080`)
- **Dynamic imports**: `import(\`${registryUrl}/${packageName}\`)`— needs the CDN URL (e.g.,`http://localhost:8080/-/cdn`)

Using the base URL for imports would hit Verdaccio's npm metadata endpoint (returns JSON, not ESM). Using the CDN URL for the API would 404 on `/packages`.

**Fix**: `BrowserPackageManager` now has a `#cdnUrl` private field and a `#toCdnUrl()` helper that derives `/-/cdn/` from the base registry URL. The base URL (`registryUrl`) is used for the `/packages` API, and `#cdnUrl` is used for dynamic `import()` calls.

**Files changed**: `apps/connect/src/package-manager.ts`

Users should always set `PH_CONNECT_PACKAGES_REGISTRY` to the **base registry URL** (e.g., `http://localhost:8080`), NOT the CDN URL.

### 2. vite.config.ts hardcoded PH_PACKAGES and PH_PACKAGE_REGISTRY_URL (FIXED)

**Problem**: `apps/connect/vite.config.ts` hardcoded:

```typescript
define: {
  PH_PACKAGES: [],
  PH_PACKAGE_REGISTRY_URL: null,
}
```

This meant that when running `pnpm dev` directly (not via `ph connect studio`), the `PH_CONNECT_PACKAGES_REGISTRY` and `PH_PACKAGES` environment variables were completely ignored. Only `ph connect studio` / `ph connect build` (which use the builder-tools Vite config) would pick them up.

**Fix**: `vite.config.ts` now reads from `process.env`:

```typescript
define: {
  PH_PACKAGES: process.env.PH_PACKAGES
    ? JSON.stringify(process.env.PH_PACKAGES.split(",").filter(Boolean))
    : [],
  PH_PACKAGE_REGISTRY_URL: process.env.PH_CONNECT_PACKAGES_REGISTRY
    ? JSON.stringify(process.env.PH_CONNECT_PACKAGES_REGISTRY)
    : null,
}
```

**Files changed**: `apps/connect/vite.config.ts`

### 3. `/packages` API returns empty after `npm publish` (FIXED)

**Problem**: The `/packages` endpoint scans the `cdn-cache/` directory. But packages are only extracted to `cdn-cache/` on the first CDN request (`/-/cdn/<pkg>/<file>`). After `npm publish`, the tarball exists in Verdaccio storage but not in `cdn-cache/`, so `/packages` returns `[]`.

The publish hook (`createPublishHook`) invalidated the cache but did NOT trigger extraction.

**Fix**: The publish hook now triggers tarball extraction immediately after invalidation:

```typescript
cdn.invalidate(packageName);
cdn.getLatestVersion(packageName).then((version) => {
  if (version) return cdn.extractTarball(packageName, version);
});
```

**Files changed**: `packages/registry/src/middleware.ts`

### 4. Registry `resolveDir` fails with `findUp` for non-existent directories

**Problem**: When starting the registry with relative paths (`./storage`, `./cdn-cache`), the `resolveDir()` function in `src/run.ts` uses `findUp` for relative paths instead of creating them. If the directories don't exist (e.g., after cleanup), the registry crashes with `Could not find directory "./storage"`.

**Workaround**: Manually create the directories before starting:

```bash
mkdir -p packages/registry/storage packages/registry/cdn-cache
```

**Note**: This is not yet fixed — `resolveDir()` should probably use `mkdir` with `recursive: true` for relative paths as well. Currently it only does this for absolute paths.

**File**: `packages/registry/src/run.ts:11-21`

### 5. CDN race condition: concurrent chunk requests re-trigger extraction (FIXED)

**Problem**: When a browser does `import("http://registry/-/cdn/@pkg/index.js")`, `index.js` contains ~10 relative chunk imports that the browser fetches simultaneously. The `getFile()` method checked if the file existed at the **root** path only (`cdn-cache/.../chunk.js`), but the actual files are in `cdn-cache/.../dist/chunk.js`. Since root didn't exist, ALL concurrent requests triggered `extractTarball()` simultaneously, all writing to the same `.tmp-tarball.tgz` temp file — causing ENOENT and zlib errors.

**Fix**: Two changes in `packages/registry/src/cdn.ts`:

1. **`#resolveFile()`** — checks all fallback paths (root, `cdn/`, `dist/cdn/`, `dist/`) BEFORE triggering extraction. Since files are in `dist/`, they're found immediately.
2. **`#extractWithLock()`** — if extraction IS needed, a per-package lock ensures only one extraction runs at a time. All other concurrent requests await the same promise.

**Files changed**: `packages/registry/src/cdn.ts`

### 6. Dynamic import URL must use `/index.js` explicitly (FIXED)

**Problem**: When the browser loads `import("http://registry/-/cdn/@scope/pkg")`, it treats `pkg` as a **file name**, not a directory. So relative imports inside `index.js` (like `./chunk-abc.js`) resolve from `/-/cdn/@scope/` instead of `/-/cdn/@scope/pkg/`. This causes 404s for all chunk files.

**Fix**: The `BrowserPackageManager` now uses `/index.js` explicitly in the import URL:

```typescript
// Before:
const importUrl = `${this.#cdnUrl}/${name}`;
// After:
const importUrl = `${this.#cdnUrl}/${name}/index.js`;
```

**Files changed**: `apps/connect/src/package-manager.ts`

### 7. `ph build` doesn't bundle workspace dependencies with subpath exports (FIXED)

**Problem**: `alwaysBundle: ["*"]` in the tsdown build config uses `picomatch("*")` under the hood. The glob `*` does **not** match `/` characters, so it matches `document-model` but NOT `document-model/core`. These subpath imports then hit tsdown's production deps check (`getProductionDeps()` combines `dependencies` + `peerDependencies`), which externalizes them.

This means all workspace dependencies with subpath exports (`document-model/core`, `@powerhousedao/reactor-browser`, `@powerhousedao/design-system/connect`, etc.) are left as bare imports in the bundle. Browsers cannot resolve bare imports, so registry-based dynamic loading fails with `TypeError: Failed to resolve module specifier "document-model/core"`.

**Root cause in tsdown** (`node_modules/tsdown/dist/format-CM79ZE77.mjs`):

```javascript
// externalStrategy:
if (alwaysBundle?.(id, importer)) return "no-external"; // "*" matches "document-model" but NOT "document-model/core"
if (deps.includes(id) || deps.some((dep) => id.startsWith(`${dep}/`)))
  return true; // externalizes "document-model/core"
```

**Fix**: Change `alwaysBundle: ["*"]` to `alwaysBundle: ["**"]` — the `**` glob matches across `/` boundaries, so `document-model/core` and all other subpath exports are now bundled.

**Files changed**: `clis/ph-cli/src/services/build.ts`

**Remaining issue**: `react`, `react-dom`, and `react/jsx-runtime` are still bare imports (they're in `neverBundle`). For registry-based loading to fully work in the browser, Connect would need to provide these via an [import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap) or they would need to be bundled as well (risking multiple React instances).

### 8. Workspace dependencies are not properly bundled by `ph build` (WORKAROUND)

This is the most significant issue affecting registry-based dynamic loading. It has two parts, both caused by the monorepo's use of `workspace:*` dependencies.

#### The core problem

When `ph build` runs in a monorepo package (e.g., `packages/vetra`), it uses tsdown to create an ESM bundle. For registry-based loading to work in a browser, the bundle must be **fully self-contained** — all dependencies inlined, with only `react`/`react-dom` left as externals (provided by the host app).

However, `workspace:*` dependencies behave differently from regular npm dependencies during bundling:

1. **Workspace packages are symlinked**, not installed as pre-built artifacts. When tsdown resolves `document-model/core`, it follows the workspace symlink to the source package's `exports` field, which points to its `dist/` output. That output was itself built with externals (e.g., `jszip` is external in document-model's own build). So tsdown encounters `import "jszip"` inside the already-built workspace dep — and must decide whether to bundle it.

2. **tsdown's `getProductionDeps()`** reads only the **root** package.json (the package being built). Transitive deps of workspace packages (`jszip` from `document-model`, `graphql-tag` from `reactor-browser`) are not in the root's `dependencies`, so they're not in the deps list that tsdown uses for its externalization decisions.

3. **Rolldown's built-in external handling** (separate from tsdown's DepPlugin) appears to externalize some transitive deps with `platform: "neutral"` even when `alwaysBundle` should catch them. The DepPlugin's debug logs confirm it never sees these imports — rolldown resolves them as external before the plugin runs.

#### Workaround 1: `alwaysBundle: ["**"]` instead of `["*"]`

**Problem**: tsdown uses `picomatch` to match the `alwaysBundle` patterns. The glob `*` does NOT match `/` characters, so `document-model` matches but `document-model/core` does not. These unmatched subpath imports then hit tsdown's production deps check and are externalized.

**Fix**: `["**"]` matches across `/` boundaries, so all subpath exports are now caught by `alwaysBundle`.

**This only affects workspace deps** — regular npm deps with subpath exports are resolved differently through `node_modules` and tsdown bundles them correctly with `["*"]`.

#### Workaround 2: `platform: "browser"` instead of `"neutral"`

**Problem**: Even with `["**"]`, some transitive deps (`jszip`, `graphql-tag`, `lz-string`, `slug`) remained as bare imports with `platform: "neutral"`. The DepPlugin never sees these imports (confirmed via `DEBUG=tsdown:dep` logs) — rolldown externalizes them at a lower level before the plugin runs. The exact rolldown behavior that causes this with `"neutral"` is unclear.

**Fix**: Changing to `platform: "browser"` causes rolldown to bundle these deps correctly. The resulting ESM output works in both browser and Node.js since it's standard ESM with no platform-specific APIs (document models are pure logic).

**Trade-off**: `platform: "browser"` uses browser export conditions when resolving packages. This is fine for document models and editors, but could theoretically affect processors that rely on Node-specific code paths. In practice this hasn't been an issue because switchboard only loads `document-models/index.js` from the registry, which is platform-agnostic.

#### Workaround 3: Massive bundle size from codegen/TypeScript

**Side effect**: `alwaysBundle: ["**"]` also bundles build-time tools like `@powerhousedao/codegen` and the TypeScript compiler (~25 MB) that get pulled in through `processors/codegen/index.ts`. These are not needed at runtime.

This causes the published package to be ~15 MB compressed, which required increasing the registry's `max_body_size` to `100mb`.

**Future fix**: Either exclude codegen entries from the build, add codegen-related packages to `neverBundle`, or restructure packages so build-time tools aren't reachable from runtime entry points.

#### Proper fix (not yet implemented)

All three workarounds would be unnecessary if packages were built **outside** the monorepo workspace context — i.e., consuming published npm packages instead of `workspace:*` deps. With regular npm deps:

- `alwaysBundle: ["*"]` works because npm deps resolve through `node_modules` with pre-built outputs
- `platform: "neutral"` works because the full dependency tree is available in `node_modules`
- Bundle size is reasonable because published packages don't include codegen/build tools

This is the expected workflow for third-party package developers: create a standalone project, `npm install @powerhousedao/document-model`, then `ph build` produces a clean, self-contained bundle.

**Files changed**: `clis/ph-cli/src/services/build.ts`

### 9. `powerhouse.manifest.json` name must match npm package name

**Problem**: The `powerhouse.manifest.json` `name` field is used by the registry's `/packages` API and by the `BrowserPackageManager` to construct import URLs. If the manifest name doesn't match the npm scoped package name, the CDN path won't resolve.

**Example**: `versioned-documents` package had `"name": "versioned-documents"` in the manifest but was published as `@powerhousedao/versioned-documents`. The CDN path is based on the npm scope (`/-/cdn/@powerhousedao/versioned-documents/`), but the package manager tried to load from `/-/cdn/versioned-documents/` based on the manifest name → 404.

**Fix**: Ensure the `name` field in `powerhouse.manifest.json` always matches the `name` in `package.json` (including the `@scope/` prefix).

### 9. Dual React instance crash when loading registry packages in production builds (FIXED)

**Problem**: When a registry package is dynamically imported in a production Connect build (`ph connect build` + `ph connect preview`), its editor components crash with:

```
TypeError: Cannot read properties of null (reading 'useSyncExternalStore')
```

**Root cause**: Two separate React instances are loaded simultaneously:

1. **Connect's React** — Vite bundles React into Connect's JS chunks during `ph connect build`. This is the React instance that manages Connect's component tree, contexts, and hooks.
2. **Registry package's React** — The dynamically imported package has `import "react"` (bare import, since React is in `neverBundle`). The browser resolves this via the import map in `index.html` to `https://esm.sh/react@19.2.0`.

These are two completely independent React instances. When the registry package's editor component (using esm.sh React) is rendered inside Connect's React tree (using bundled React), React hooks like `useSyncExternalStore` fail because the contexts and internals don't cross React instance boundaries.

**Why it works in dev mode**: Vite's dev server resolves all `import "react"` statements to the same module — there's only one React instance. The import map isn't used in dev mode because Vite intercepts all imports.

**Fix**: Externalize React in Connect's Vite production build so that Connect itself also resolves React via the import map, ensuring a single shared React instance:

```typescript
// packages/builder-tools/connect-utils/vite-config.ts
build: {
  rollupOptions: {
    external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
  },
},
```

Combined with the import map in `index.html` (injected by `vite-plugin-html`):

```html
<script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/react@19.2.0",
      "react/": "https://esm.sh/react@19.2.0/",
      "react-dom": "https://esm.sh/react-dom@19.2.0",
      "react-dom/": "https://esm.sh/react-dom@19.2.0/"
    }
  }
</script>
```

Now both Connect and all dynamically loaded registry packages resolve `react` to the same esm.sh URL → single React instance → hooks work correctly.

**Files changed**: `packages/builder-tools/connect-utils/vite-config.ts`

**Note**: This means Connect's production build depends on `esm.sh` being available at runtime. For fully offline deployments, React would need to be served from the same origin (e.g., as a static asset in Connect's build output) and the import map updated accordingly.

### 10. Duplicate GraphQL types from versioned document models (FIXED)

**Problem**: When a package has multiple specification versions of the same document model (e.g., Todo v1 and v2), the GraphQL schema generator in `packages/reactor-api/src/utils/create-schema.ts` iterated over ALL specifications and joined their schemas. Both v1 and v2 define the same types (e.g., `Todo_TodoState`), causing Apollo Gateway to crash with `There can be only one type named "Todo_TodoState"`.

**Fix**: The schema generator now uses only the **latest specification** (`.at(-1)`) instead of mapping over all specifications.

**Files changed**: `packages/reactor-api/src/utils/create-schema.ts`

### 11. Removing a package from the local registry

To remove a specific package from the local registry (e.g., to re-publish the same version):

```bash
# Stop the registry first, then:
rm -rf packages/registry/storage/@scope/package-name packages/registry/cdn-cache/@scope/package-name
# Restart the registry
```

### 12. Cleaning up the registry for a fresh start

To fully reset the local registry:

```bash
# Stop the registry first, then:
rm -rf packages/registry/storage packages/registry/cdn-cache
mkdir -p packages/registry/storage packages/registry/cdn-cache
# Restart the registry — you'll need to npm adduser again
```

---

## Manual Testing: Registry-Based Package Loading in Connect

This section describes how to manually test the full pipeline: start a local registry, build and publish vetra to it, then load vetra from the registry in Connect's UI.

### Prerequisites

- The monorepo is installed (`pnpm install` from root)
- You have access to three terminal windows

### Step 1: Temporarily disable vetra as a hardcoded common package

Since vetra is statically imported and always loaded in Connect (commit `4b366d892`), you need to temporarily disable it to test dynamic loading from the registry.

**File**: `apps/connect/src/package-manager.ts`

1. **Comment out lines 62-63** in the `init()` method:

```typescript
// const vetraVetraPackageWithMeta = this.#loadVetraPackage();
// this.#registerPackage(vetraVetraPackageWithMeta);
```

2. **Comment out the vetra guard in `getPackageSource()`** (line 83):

```typescript
if (
  packageName === COMMON_PACKAGE_NAME
  // || packageName === vetraVetraPackage.manifest.name
)
  return "common";
```

This ensures vetra is not pre-loaded and will show as "available" when discovered from the registry.

> **Remember to revert these changes after testing.**

### Step 2: Start the local registry

**Terminal 1** — from the monorepo root:

```bash
cd packages/registry
pnpm dev
```

This runs `bun run ./cli.ts` and starts the registry on `http://localhost:8080` by default.

**Verify it's running:**

- Open `http://localhost:8080` in a browser — you should see the Verdaccio web UI
- Test the packages API: `curl http://localhost:8080/packages` — should return `[]` or a list

### Step 3: Build vetra for publishing

**Terminal 2** — from the monorepo root:

```bash
cd packages/vetra
ph build
```

This runs `runBuild()` from `clis/ph-cli/src/services/build.ts` which:

- Runs `tsdown` with the correct config (`alwaysBundle: ["*"]`, proper `neverBundle` list, copies `powerhouse.manifest.json`)
- Runs `tailwindcss -i ./style.css -o ./dist/style.css` to compile CSS

> **Note:** Do NOT use `pnpm build:bundle && pnpm build:css` — those scripts use vetra's own tsdown config which lacks the `alwaysBundle`/`neverBundle` settings and manifest copy needed for registry publishing.

**Verify the build output:**

```bash
ls dist/
# Should contain: index.js, style.css, powerhouse.manifest.json, document-models/, editors/, etc.
```

### Step 4: Create a registry user and publish vetra

Still in **Terminal 2**, in `packages/vetra`:

```bash
# Create a user on the local registry (first time only)
npm adduser --registry http://localhost:8080/

# Publish vetra to the local registry
npm publish --registry http://localhost:8080/
```

**Verify the publish:**

- `curl http://localhost:8080/packages` — should now list `@powerhousedao/vetra` with its manifest
- `curl http://localhost:8080/-/cdn/@powerhousedao/vetra/powerhouse.manifest.json` — should return the manifest JSON

### Step 5: Start Connect with registry URL and no default packages

**Terminal 3** — from the monorepo root:

```bash
cd apps/connect
PH_CONNECT_PACKAGES_REGISTRY="http://localhost:8080" PH_PACKAGES="" pnpm dev
```

This starts the Vite dev server with:

- `PH_PACKAGE_REGISTRY_URL` pointing to the local registry
- `PH_PACKAGES` empty — no packages are auto-loaded at startup

> **Note on registry URL**: Always use the **base registry URL** (e.g., `http://localhost:8080`), NOT the CDN URL. The `BrowserPackageManager` automatically derives the CDN URL (`/-/cdn/`) for dynamic imports while using the base URL for the `/packages` API. See [Known Issues #1](#1-registry-url-mismatch-base-url-vs-cdn-url-fixed) for details.

### Step 6: Install vetra from the Connect UI

1. Open Connect in the browser (usually `http://localhost:3000`)
2. Open **Settings** (gear icon or settings menu)
3. Go to the **"Package Manager"** tab
4. You should see `@powerhousedao/vetra` listed with status **"available"**
5. Click **Install** on the vetra package
6. The `BrowserPackageManager.addPackage()` will:
   - Try loading from `node_modules` first (will fail since we're testing registry loading)
   - Try loading from the registry CDN: `import("${registryUrl}/@powerhousedao/vetra")`
   - If successful, registers the package and shows a success toast
7. Vetra's document models and editors should now be available in Connect

### Step 7: Verify the loaded package

After installing vetra from the registry:

- Vetra's document types should appear when creating new documents
- Vetra editors should work for their respective document types
- The package should show as **"registry-install"** in the Package Manager
- Check the browser console for any errors related to package loading

### Step 8: Clean up

1. **Stop all terminals** (Ctrl+C)
2. **Revert the changes** to `apps/connect/src/package-manager.ts`:
   - Uncomment lines 62-63 (the `#loadVetraPackage()` + `#registerPackage()` calls)
   - Uncomment the vetra guard in `getPackageSource()` (line 83)
3. **Clear browser localStorage** if needed (the package manager caches installed packages in localStorage under the key `REGISTRY_PACKAGES:...`)

### Troubleshooting

| Issue                                                   | Possible cause                                           | Fix                                                                                    |
| ------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Registry returns empty packages list after publish      | Publish hook didn't extract tarball (old bug, now fixed) | Restart registry to pick up the fix; or hit any CDN endpoint to trigger extraction     |
| `import()` fails with CORS error                        | Registry not setting CORS headers                        | Check registry CORS config; registry should allow `*` origin                           |
| `import()` fails with 404                               | Wrong registry URL or CDN path mismatch                  | Try both `http://localhost:8080` and `http://localhost:8080/-/cdn` as the registry URL |
| Package shows as "local-install" instead of "available" | Vetra still loaded as common package                     | Make sure you commented out lines 62-63 in `package-manager.ts`                        |
| No packages visible in Settings > Package Manager       | `PH_PACKAGE_REGISTRY_URL` is null                        | Ensure `PH_CONNECT_PACKAGES_REGISTRY` env var is set when starting Connect             |
| Styles not applied after install                        | CSS file not served by CDN                               | Check `http://localhost:8080/-/cdn/@powerhousedao/vetra/style.css` is accessible       |
| Package installs but editors don't appear               | Package bundle missing editor exports                    | Check the build output `dist/editors/` and verify the manifest lists the editors       |
