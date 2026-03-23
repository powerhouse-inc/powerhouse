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
{ "packageName": "@scope/pkg", "version": "1.0.0" }
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

| Option | Env Variable | Default | Description |
|---|---|---|---|
| `--port` | `PORT` | `8080` | Port to listen on |
| `--storage-dir` | `REGISTRY_STORAGE` | `./storage` | Verdaccio storage directory |
| `--cdn-cache-dir` | `REGISTRY_CDN_CACHE` | `./cdn-cache` | CDN cache directory |
| `--uplink` | `REGISTRY_UPLINK` | — | Upstream npm registry URL |
| `--web-enabled` | `REGISTRY_WEB` | `true` | Enable Verdaccio web UI |
| `--webhook` | `REGISTRY_WEBHOOKS` | — | Comma-separated webhook URLs to notify on publish |
| `--s3-bucket` | `S3_BUCKET` | — | S3 bucket for storage |
| `--s3-endpoint` | `S3_ENDPOINT` | — | S3 endpoint URL |
| `--s3-region` | `S3_REGION` | — | S3 region |
| `--s3-access-key-id` | `S3_ACCESS_KEY_ID` | — | S3 access key |
| `--s3-secret-access-key` | `S3_SECRET_ACCESS_KEY` | — | S3 secret key |
| `--s3-key-prefix` | `S3_KEY_PREFIX` | — | S3 key prefix |
| `--s3-force-path-style` | `S3_FORCE_PATH_STYLE` | `true` | Force S3 path-style URLs |
