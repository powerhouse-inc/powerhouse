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

- `dir` (positional, 1st) -- directory to serve packages from (default: `.`, env: `REGISTRY_DIR`)
- `port` (positional, 2nd) -- port to listen on (default: `8080`, env: `PORT`)

### Library

```ts
import express from "express";
import { createRegistryRouter } from "@powerhousedao/registry";

const app = express();
app.use(createRegistryRouter("./packages"));
app.listen(3000);
```

## API

### `createPowerhouseRouter(config)`

Creates an Express `Router` that serves packages.

### `GET /packages`

Returns a JSON array of all discovered packages.

### `GET /packages/by-document-type?type=<documentType>`

Returns package names that contain the specified document type.

### `GET /-/cdn/<packageName>/<filePath>`

Serves files from the CDN cache for a package.
