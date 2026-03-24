# Registry Client

Client for interacting with a Powerhouse package registry. Provides methods to query packages and subscribe to real-time publish notifications via SSE.

```ts
import { RegistryClient } from "@powerhousedao/reactor-browser";

const client = new RegistryClient("http://localhost:8080/-/cdn/");
```

## `getPackages`

Returns all packages from the registry.

```ts
const packages = await client.getPackages();
// [{ name, description, version, category, publisher, publisherUrl }, ...]
```

## `getPackagesByDocumentType`

Returns package names that contain the specified document type.

```ts
const names = await client.getPackagesByDocumentType(
  "powerhouse/document-model",
);
```

## `searchPackages`

Client-side search through all packages by name or description.

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
