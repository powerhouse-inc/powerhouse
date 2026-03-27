# Local Registry Setup Guide

Developer guide for running a local Verdaccio registry and manually starting Connect and Switchboard to work with it.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [1. Start the Local Registry](#1-start-the-local-registry)
- [2. Authenticate](#2-authenticate)
- [3. Build and Publish a Package](#3-build-and-publish-a-package)
- [4. Configure powerhouse.config.json](#4-configure-powerhouseconfigjson)
- [5. Start Connect with the Registry](#5-start-connect-with-the-registry)
- [6. Start Switchboard with the Registry](#6-start-switchboard-with-the-registry)
- [7. Start ph vetra with the Registry](#7-start-ph-vetra-with-the-registry)
- [8. Using ph connect preview with the Registry](#8-using-ph-connect-preview-with-the-registry)
- [9. Verifying the Setup](#9-verifying-the-setup)
- [10. Environment Variables Reference](#10-environment-variables-reference)

---

## Overview

The Powerhouse Registry is a [Verdaccio](https://verdaccio.org/)-based npm registry with a built-in CDN layer. When a package is published, the registry extracts its tarball and serves individual files via CDN endpoints. This allows Connect (browser) and Switchboard (Node.js) to load packages at runtime without a full npm install.

```
Registry (Verdaccio + CDN)
  http://localhost:8080
        |
        ├── /-/cdn/<pkg>/index.js          → Connect (browser bundle)
        ├── /-/cdn/<pkg>/style.css         → Connect (styles)
        ├── /-/cdn/<pkg>/document-models/  → Switchboard (server models)
        ├── /packages                      → Package discovery API
        └── npm publish/install            → Standard npm protocol
```

## Prerequisites

- Node.js >= 20
- pnpm installed
- Bun installed (registry dev mode uses `bun run`)
- Monorepo cloned and dependencies installed (`pnpm install`)

## 1. Start the Local Registry

```bash
cd packages/registry
pnpm dev
```

This runs the registry via `bun run ./cli.ts` and starts Verdaccio on `http://localhost:8080` with the CDN layer. Storage defaults to `./storage` and CDN cache to `./cdn-cache` relative to `packages/registry/`.

To use a custom port:

```bash
pnpm dev --port 9090
```

**Other optional flags:**

| Flag              | Default       | Description               |
| ----------------- | ------------- | ------------------------- |
| `--port`          | `8080`        | Server port               |
| `--storage-dir`   | `./storage`   | Verdaccio storage path    |
| `--cdn-cache-dir` | `./cdn-cache` | CDN cache path            |
| `--uplink`        | —             | Upstream npm registry URL |
| `--web-enabled`   | `true`        | Enable Verdaccio web UI   |

**Verify it's running:**

```bash
curl http://localhost:8080/-/ping
```

You can also open `http://localhost:8080` in a browser to see the Verdaccio web UI.

## 2. Authenticate

Verdaccio accepts any username/password for new local registrations.

**Interactive:**

```bash
npm adduser --registry http://localhost:8080
```

Enter any username, password, and email when prompted.

**Non-interactive (useful for scripts):**

```bash
curl -X PUT http://localhost:8080/-/user/org.couchdb.user:testuser \
  -H "Content-Type: application/json" \
  -d '{"name":"testuser","password":"testpassword"}'
```

The response contains a token. Write it to `.npmrc` in your project directory:

```bash
echo "//localhost:8080/:_authToken=<token>" > .npmrc
```

**Verify authentication:**

```bash
npm whoami --registry http://localhost:8080
```

## 3. Build and Publish a Package

Build your package first:

```bash
cd your-package-directory
ph build
```

This runs `tsdown` with the correct entry points (document-models, editors, processors, subgraphs), copies `powerhouse.manifest.json` to `dist/`, and builds the CSS via Tailwind.

Publish using npm:

```bash
npm publish --registry http://localhost:8080
```

Or using `ph publish` (which wraps `npm publish`):

```bash
ph publish --registry http://localhost:8080
```

If the version already exists, unpublish first:

```bash
npm unpublish @your-scope/your-package@<version> --registry http://localhost:8080 --force
npm publish --registry http://localhost:8080
```

**`ph publish` registry URL resolution order:**

`--registry` flag > `PH_REGISTRY_URL` env > `powerhouse.config.json packageRegistryUrl` > default production URL

## 4. Configure powerhouse.config.json

The `powerhouse.config.json` file is the central configuration. Both Connect (when run via ph-cli) and Switchboard read from it.

**Setting the registry URL:**

```json
{
  "packageRegistryUrl": "http://localhost:8080"
}
```

**Full example (from `test/vetra-e2e/powerhouse.config.json`):**

```json
{
  "logLevel": "debug",
  "documentModelsDir": "./document-models",
  "editorsDir": "./editors",
  "processorsDir": "./processors",
  "subgraphsDir": "./subgraphs",
  "studio": {
    "port": 3001
  },
  "reactor": {
    "port": 4002,
    "storage": "memory"
  },
  "packages": [],
  "packageRegistryUrl": "http://localhost:8080"
}
```

**Key fields:**

| Field                | Description                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packageRegistryUrl` | Base URL of the registry (no trailing `/-/cdn/`). Used by Connect, Switchboard, `ph publish`, and `ph install`.                                     |
| `packages`           | Array of packages to load. Each entry has `packageName` (required), `provider` (set to `"registry"` for registry packages), and optional `version`. |

## 5. Start Connect with the Registry

Connect loads packages from the registry at runtime via the CDN.

### Running Connect directly (`pnpm dev`)

When running Connect directly from `apps/connect`, the registry URL is configured via environment variables (the vite.config.ts in this directory doesn't read `powerhouse.config.json`):

```bash
cd apps/connect
PH_CONNECT_PACKAGES_REGISTRY="http://localhost:8080" pnpm dev
```

To also auto-load specific packages on startup:

```bash
PH_CONNECT_PACKAGES_REGISTRY="http://localhost:8080" \
PH_PACKAGES="@your-scope/your-package" \
pnpm dev
```

Once Connect is running, open it in the browser and go to **Settings > Package Manager** to see and install available packages from the registry.

### Running Connect via `ph connect studio`

When using the CLI, Connect reads from `powerhouse.config.json` in the current directory:

```bash
cd your-project  # must have a powerhouse.config.json with packageRegistryUrl
ph connect studio
```

**Resolution order:**

- Registry URL: `PH_CONNECT_PACKAGES_REGISTRY` env > `powerhouse.config.json packageRegistryUrl` > null
- Packages: `PH_PACKAGES` env > `powerhouse.config.json packages` array

## 6. Start Switchboard with the Registry

Switchboard loads document models from the registry at startup.

### Using powerhouse.config.json (recommended)

Ensure your `powerhouse.config.json` has `packageRegistryUrl` and `packages` configured (see [section 4](#4-configure-powerhouseconfigjson)), then:

```bash
cd apps/switchboard
pnpm dev
```

Switchboard reads the config and loads packages where `provider === "registry"`.

### Using environment variables

```bash
cd apps/switchboard
PH_REGISTRY_URL="http://localhost:8080" \
PH_REGISTRY_PACKAGES="@your-scope/your-package" \
pnpm dev
```

**Resolution order:**

- Registry URL: `PH_REGISTRY_URL` env > `powerhouse.config.json packageRegistryUrl`
- Packages: `PH_REGISTRY_PACKAGES` env (comma-separated) > `powerhouse.config.json packages` filtered by `provider === "registry"`

### Dynamic model loading

Enable on-demand loading of unknown document types during sync:

```bash
cd apps/switchboard
DYNAMIC_MODEL_LOADING=true pnpm dev
```

This queries the registry's `/packages/by-document-type?type=X` endpoint to find and load the right package automatically.

## 7. Start ph vetra with the Registry

`ph vetra` starts both Switchboard and Connect Studio. Both read from the same `powerhouse.config.json`.

1. Make sure the local registry is running (see [section 1](#1-start-the-local-registry))
2. Ensure `powerhouse.config.json` has `packageRegistryUrl` set (see [section 4](#4-configure-powerhouseconfigjson))
3. Run vetra from your project directory:

```bash
cd your-project
ph vetra
```

Default ports: Connect on 3001, Switchboard on 4001 (configurable via `studio.port` and `reactor.port` in config, or `--connect-port` / `--switchboard-port` flags).

Switchboard loads registry packages at startup. Connect loads them at runtime via the CDN when the user installs them through the Package Manager UI or when they're listed in `packages`.

## 8. Using ph connect preview with the Registry

`ph connect preview` serves a production build of Connect. The registry URL is baked in at build time.

1. Make sure `powerhouse.config.json` has `packageRegistryUrl` set
2. Build Connect:

```bash
cd your-project
ph connect build
```

3. Preview the build:

```bash
ph connect preview --port 4173
```

Open `http://localhost:4173` in the browser, go to **Settings > Package Manager**, and install packages from the registry.

**Note:** The registry URL is embedded during build. If you change `packageRegistryUrl`, you must rebuild.

## 9. Verifying the Setup

### Package discovery

```bash
# List all packages
curl http://localhost:8080/packages

# Single package info
curl http://localhost:8080/packages/@your-scope/your-package

# Find packages by document type
curl "http://localhost:8080/packages/by-document-type?type=your/document-type"
```

### CDN file serving

```bash
# Connect browser bundle
curl -s http://localhost:8080/-/cdn/@your-scope/your-package/index.js | head -5

# Connect styles
curl -s http://localhost:8080/-/cdn/@your-scope/your-package/style.css | head -5

# Switchboard document models
curl -s http://localhost:8080/-/cdn/@your-scope/your-package/document-models/index.js | head -5

# Package manifest
curl http://localhost:8080/-/cdn/@your-scope/your-package/powerhouse.manifest.json
```

### Health check

```bash
curl http://localhost:8080/-/ping
```

## 10. Environment Variables Reference

### Registry Server

| Variable             | Default       | Description                                            |
| -------------------- | ------------- | ------------------------------------------------------ |
| `PORT`               | `8080`        | Registry server port                                   |
| `REGISTRY_STORAGE`   | `./storage`   | Verdaccio storage directory                            |
| `REGISTRY_CDN_CACHE` | `./cdn-cache` | CDN cache directory                                    |
| `REGISTRY_UPLINK`    | —             | Upstream npm registry URL                              |
| `REGISTRY_WEB`       | `true`        | Enable Verdaccio web UI                                |
| `REGISTRY_WEBHOOKS`  | —             | Comma-separated webhook URLs for publish notifications |

### Connect

| Variable                                | Description                                                                              |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| `PH_CONNECT_PACKAGES_REGISTRY`          | Registry URL. Overrides `powerhouse.config.json packageRegistryUrl`.                     |
| `PH_PACKAGES`                           | Comma-separated package names to auto-load. Overrides `powerhouse.config.json packages`. |
| `PH_CONNECT_EXTERNAL_PACKAGES_DISABLED` | Set to `true` to disable external package loading.                                       |

### Switchboard

| Variable                | Description                                                               |
| ----------------------- | ------------------------------------------------------------------------- |
| `PH_REGISTRY_URL`       | Registry base URL. Overrides `powerhouse.config.json packageRegistryUrl`. |
| `PH_REGISTRY_PACKAGES`  | Comma-separated package names to load from registry.                      |
| `DYNAMIC_MODEL_LOADING` | Set to `true` for on-demand model loading from registry.                  |

### Publishing

| Variable          | Description                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `PH_REGISTRY_URL` | Default registry URL for `ph publish` and `ph install` (overridden by `--registry` flag). |
