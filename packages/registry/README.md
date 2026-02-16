# @powerhousedao/registry

Express-based server that serves Powerhouse packages (ESM bundles) for dynamic loading via `import()` in browsers and Node.js.

## Quick Start

### CLI

```sh
# Serve packages from a directory
ph-registry ./path/to/packages 3000

# Or with environment variables
REGISTRY_DIR=./packages PORT=3000 ph-registry

# Or run directly
node dist/src/run.js ./path/to/packages 3000
```

Arguments:

- `dir` (positional, 1st) — directory to serve packages from (default: `.`, env: `REGISTRY_DIR`)
- `port` (positional, 2nd) — port to listen on (default: `8080`, env: `PORT`)

### Library

```ts
import express from "express";
import { createRegistryRouter } from "@powerhousedao/registry";

const app = express();
app.use(createRegistryRouter("./packages"));
app.listen(3000);
```

## API

### `createRegistryRouter(root, options?)`

Creates an Express `Router` that serves packages from `root`.

- `root: string` — absolute or relative path to the packages directory
- `options?: ServeStaticOptions` — optional [serve-static](https://www.npmjs.com/package/serve-static) options (sensible defaults are provided)

Returns an Express `Router` with the following routes:

### `GET /packages`

Returns a JSON array of all discovered packages.

```json
[
  {
    "name": "@powerhousedao/vetra",
    "path": "/@powerhousedao/vetra",
    "manifest": { "name": "@powerhousedao/vetra", "modules": [...] }
  }
]
```

Packages are discovered by scanning the root directory:

- Directories starting with `@` are treated as scopes (scanned one level deeper)
- Each package directory is checked for a `powerhouse.manifest.json`

### `GET /packages/:name`

Returns info for a single package. Supports scoped names:

```
GET /packages/@powerhousedao/vetra
```

```json
[
  {
    "name": "@powerhousedao/vetra",
    "path": "/@powerhousedao/vetra",
    "manifest": { "name": "@powerhousedao/vetra", "documentModels": [...] }
  }
]
```

### File Serving

All other requests are served as static files from the root directory using `serve-static`, with:

- Automatic `index.js` resolution for directories
- Redirect to trailing slash for bare directory paths (so relative imports resolve correctly)
- `Access-Control-Allow-Origin: *` on every response for cross-origin `import()`

## Package Directory Layout

```
packages/
  @powerhousedao/
    vetra/
      index.js              # entry point
      chunk-abc123.js       # code-split chunks
      style.css             # styles
      powerhouse.manifest.json  # optional package manifest
  my-unscoped-package/
    index.js
```

## Request Flow

**Browser `import("http://localhost:8080/@powerhousedao/vetra")`:**

1. `GET /@powerhousedao/vetra` — no trailing slash — **301 redirect** to `/@powerhousedao/vetra/`
2. `GET /@powerhousedao/vetra/` — serves `index.js`

## Build

```sh
# From monorepo root
pnpm build-tsc

# Or from this directory
tsc --build
```
