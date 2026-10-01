# Registry Client

Client for interacting with a Powerhouse package registry. Provides methods to query packages and subscribe to real-time publish notifications via SSE.

```ts
import { RegistryClient } from "@powerhousedao/reactor-browser";

const client = new RegistryClient("http://localhost:8080/-/cdn/");
```

## `getPackages`

Returns every package from the registry in full detail, paged through `GET /packages?detail=full` 50 at a time.

```ts
const packages = await client.getPackages();
// [{ name, path, manifest, documentTypes, version, distTags, versions }, ...]
```

## `getPackagesByDocumentType`

Returns package names that contain the specified document type.

```ts
const names = await client.getPackagesByDocumentType(
  "powerhouse/document-model",
);
```

## `searchPackages`

Server-side search over package name, description, publisher and module names, returning full detail. An empty query returns every package.

```ts
const results = await client.searchPackages("vetra");
```

## `onPublish`

Subscribes to real-time publish notifications via Server-Sent Events. Calls the callback whenever a package is published. Returns an unsubscribe function.

```ts
const unsubscribe = client.onPublish((event) => {
  console.log(`${event.packageName}@${event.version} published`);
});

// later...
unsubscribe();
```
