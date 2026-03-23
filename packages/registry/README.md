# @powerhousedao/registry

Powerhouse package registry built on Verdaccio. Serves as both an npm registry and a CDN for Powerhouse package bundles (ESM) for dynamic `import()` in browsers and Node.js.

## Quick Start

### CLI

```sh
ph-registry --port 8080 --storage-dir ./storage --cdn-cache-dir ./cdn-cache
```

Options:

| Option | Env Variable | Default | Description |
|---|---|---|---|
| `--port` | `PORT` | `8080` | Port to listen on |
| `--storage-dir` | `REGISTRY_STORAGE` | `./storage` | Verdaccio storage directory |
| `--cdn-cache-dir` | `REGISTRY_CDN_CACHE` | `./cdn-cache` | CDN cache directory for extracted package bundles |
| `--uplink` | `REGISTRY_UPLINK` | — | Upstream npm registry URL |
| `--web-enabled` | `REGISTRY_WEB` | `true` | Enable Verdaccio web UI |
| `--s3-bucket` | `S3_BUCKET` | — | S3 bucket for storage |
| `--s3-endpoint` | `S3_ENDPOINT` | — | S3 endpoint URL |
| `--s3-region` | `S3_REGION` | — | S3 region |
| `--s3-access-key-id` | `S3_ACCESS_KEY_ID` | — | S3 access key |
| `--s3-secret-access-key` | `S3_SECRET_ACCESS_KEY` | — | S3 secret key |
| `--s3-key-prefix` | `S3_KEY_PREFIX` | — | S3 key prefix |
| `--s3-force-path-style` | `S3_FORCE_PATH_STYLE` | `true` | Force S3 path-style URLs |

### Library

```ts
import express from "express";
import { createPowerhouseRouter, createPublishHook } from "@powerhousedao/registry";
import type { RegistryConfig } from "@powerhousedao/registry";

const config: RegistryConfig = {
  port: 8080,
  storagePath: "./storage",
  cdnCachePath: "./cdn-cache",
};

const app = express();
app.use(createPowerhouseRouter(config));
app.use(createPublishHook(config));
app.listen(8080);
```

## API

### `GET /packages`

Returns a JSON array of all discovered packages. Supports filtering by document type:

```
GET /packages?documentType=powerhouse/package
```

### `GET /packages/by-document-type?type=<documentType>`

Returns an array of package names that contain the specified document type.

### `GET /packages/<packageName>`

Returns info for a single package (supports scoped names like `@powerhousedao/vetra`).

### `GET /-/cdn/<packageName>/<filePath>`

Serves files from the CDN cache. On first request, fetches and extracts the tarball from Verdaccio. Looks for files in the package root, then `cdn/`, `dist/cdn/`, and `dist/` subdirectories.

### npm Protocol

All standard npm registry operations (publish, install, etc.) are handled by Verdaccio.

## Publishing Packages

```sh
npm publish --registry http://localhost:8080/
```

On publish, the CDN cache for that package is automatically invalidated so the next CDN request fetches the new version.

## CDN Cache Structure

```
cdn-cache/
  @scope/
    package-name/
      1.0.0/
        powerhouse.manifest.json
        index.js
        ...
```

Packages are extracted from npm tarballs on first CDN request and cached locally.
