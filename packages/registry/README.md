# @powerhousedao/registry

Powerhouse package registry built on Verdaccio. Serves as both an npm registry and a CDN for Powerhouse package bundles (ESM) for dynamic `import()` in browsers and Node.js.

## API

### Packages

#### `GET /packages`

Returns a JSON array of all discovered packages. Supports filtering by document type:

```
GET /packages?documentType=powerhouse/package
```

#### `GET /packages/by-document-type?type=<documentType>`

Returns an array of package names that contain the specified document type.

#### `GET /packages/<packageName>`

Returns info for a single package (supports scoped names like `@powerhousedao/vetra`).

### CDN

#### `GET /-/cdn/<packageName>/<filePath>`

Serves files from the CDN cache. On first request, fetches and extracts the tarball from Verdaccio. Looks for files in the package root, then `cdn/`, `dist/cdn/`, and `dist/` subdirectories.

If the package is not published locally, Verdaccio transparently proxies metadata and tarballs from the configured upstream (`--uplink`, default `https://registry.npmjs.org/`). The CDN then extracts the upstream tarball into `cdn-cache/<pkg>/<version>/` exactly as it does for locally-published packages, so subsequent requests are served from the local cache without re-hitting the upstream. The same fallback applies to `@powerhousedao/*` packages: the registry prefers its local copy, and falls back to the upstream when the package isn't published locally.

Responses carry caching headers keyed on the request shape. Version-pinned requests (`<pkg>@1.2.3/...`) are served `Cache-Control: public, max-age=31536000, immutable`; moving requests (a dist-tag like `@dev`/`@latest`, or untagged) get `public, max-age=60, must-revalidate`. A version-derived weak `ETag` is sent, and a matching `If-None-Match` returns `304`. When the upstream metadata lookup fails (as opposed to a genuine not-found), the endpoint serves the latest cached version if present, otherwise responds `503` rather than a cacheable `404`.

### Publish Notifications

When a package is published, the registry can notify subscribers in real time via Server-Sent Events (SSE) and webhooks.

#### SSE — `GET /-/events`

Opens a persistent SSE connection. The server sends:

- `connected` event on initial connection
- `publish` event whenever a package is published, with payload:

```json
{ "packageName": "@scope/pkg", "version": "1.0.0" }
```

Example (browser):

```ts
const source = new EventSource("http://localhost:8080/-/events");
source.addEventListener("publish", (e) => {
  const { packageName, version } = JSON.parse(e.data);
  console.log(`${packageName}@${version} published`);
});
```

#### Webhooks

Webhooks are persisted to disk and survive restarts. Predefined webhooks can also be provided via configuration.

##### `GET /-/webhooks`

Returns all registered webhooks (predefined + dynamic).

##### `POST /-/webhooks`

Registers a new webhook. Body:

```json
{ "endpoint": "https://example.com/hook", "headers": { "X-Token": "secret" } }
```

`headers` is optional. Returns `201` on success. Duplicate endpoints are ignored.

##### `DELETE /-/webhooks`

Removes a dynamic webhook. Body:

```json
{ "endpoint": "https://example.com/hook" }
```

Returns `204` on success, `404` if not found. Predefined webhooks cannot be removed.

When a package is published, each webhook receives a POST with:

```json
{
  "packageName": "@scope/pkg",
  "version": "1.0.0",
  "publishedBy": {
    "address": "0xabc...",
    "did": "did:key:z6Mk..."
  }
}
```

### npm Protocol

All standard npm registry operations (publish, install, etc.) are handled by Verdaccio.

## Publishing Packages

```sh
npm publish --registry http://localhost:8080/
```

On publish, the CDN cache for that package is automatically invalidated and the new version is extracted immediately.

## CLI

```sh
ph-registry --port 8080 --storage-dir ./storage --cdn-cache-dir ./cdn-cache
```

Options:

| Option                   | Env Variable                   | Default                       | Description                                                                                                                                     |
| ------------------------ | ------------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port`                 | `PORT`                         | `8080`                        | Port to listen on                                                                                                                               |
| `--storage-dir`          | `REGISTRY_STORAGE`             | `./storage`                   | Verdaccio storage directory                                                                                                                     |
| `--cdn-cache-dir`        | `REGISTRY_CDN_CACHE`           | `./cdn-cache`                 | CDN cache directory                                                                                                                             |
| `--uplink`               | `REGISTRY_UPLINK`              | `https://registry.npmjs.org/` | Upstream npm registry URL used for fallback proxy                                                                                               |
| `--web-enabled`          | `REGISTRY_WEB`                 | `true`                        | Enable Verdaccio web UI                                                                                                                         |
| `--webhook`              | `REGISTRY_WEBHOOKS`            | —                             | Comma-separated webhook URLs to notify on publish                                                                                               |
| `--s3-bucket`            | `S3_BUCKET`                    | —                             | S3 bucket for storage                                                                                                                           |
| `--s3-endpoint`          | `S3_ENDPOINT`                  | —                             | S3 endpoint URL                                                                                                                                 |
| `--s3-region`            | `S3_REGION`                    | —                             | S3 region                                                                                                                                       |
| `--s3-access-key-id`     | `S3_ACCESS_KEY_ID`             | —                             | S3 access key                                                                                                                                   |
| `--s3-secret-access-key` | `S3_SECRET_ACCESS_KEY`         | —                             | S3 secret key                                                                                                                                   |
| `--s3-key-prefix`        | `S3_KEY_PREFIX`                | —                             | S3 key prefix                                                                                                                                   |
| `--s3-force-path-style`  | `S3_FORCE_PATH_STYLE`          | `true`                        | Force S3 path-style URLs                                                                                                                        |
| `--public-url`           | `PH_REGISTRY_PUBLIC_URL`       | —                             | Public URL of this registry — required when Renown auth is enabled. Used as the expected `aud` claim on bearer tokens.                          |
| `--auth-renown`          | `PH_REGISTRY_AUTH_RENOWN`      | `true`                        | Enable Renown JWT auth in front of verdaccio. Disabled (no-op) when `--public-url` is unset.                                                    |
| `--verdaccio-secret`     | `PH_REGISTRY_VERDACCIO_SECRET` | random per pod                | Verdaccio JWT signing secret. The renown middleware mints an in-process verdaccio token that never leaves the pod, so a per-pod secret is fine. |

## Authentication

Two authentication paths are supported:

1. **Renown bearer tokens (preferred).** Stateless: the registry verifies the
   token's signature against the issuer's DID public key, with no shared secret
   required across replicas. Activated by setting `--public-url`. CLI flow:
   `ph login` once, then `ph publish` (mints a fresh 5-minute token per
   invocation) or `ph registry-login` (writes a longer-lived token to
   `~/.npmrc` for raw `npm publish`).

2. **Legacy htpasswd.** Verdaccio's built-in plugin remains in the auth chain
   as a grace-period fallback. Per-pod state, so it doesn't survive horizontal
   scaling — being phased out as soon as all clients have moved to Renown.

## Deployment

### Build

```sh
# Latest version
docker build -t ph-registry .

# Specific version
docker build --build-arg TAG=6.0.0-dev.112 -t ph-registry .
```

The `TAG` build arg controls the npm version of `@powerhousedao/registry` to install (defaults to `latest`).

### Run

```sh
docker run -p 4873:4873 -v ph-data:/data ph-registry
```

#### Environment variables

Pass env variables with `-e`:

```sh
docker run -p 4873:4873 -v ph-data:/data \
  -e REGISTRY_UPLINK=https://registry.npmjs.org \
  -e S3_BUCKET=my-bucket \
  -e S3_REGION=us-east-1 \
  ph-registry
```

Or use an env file:

```sh
docker run -p 4873:4873 -v ph-data:/data --env-file .env ph-registry
```

See the [CLI](#cli) section for all supported environment variables.

#### CLI arguments

Since the image uses `ENTRYPOINT`, CLI args can be passed directly:

```sh
docker run -p 8080:8080 -v ph-data:/data ph-registry --port 8080 --uplink https://registry.npmjs.org
```

CLI arguments take precedence over environment variables.
