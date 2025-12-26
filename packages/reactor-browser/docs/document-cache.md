# Document Cache

The Document Cache is a caching layer that sits between React components and the reactor (document storage). It provides efficient document retrieval, automatic updates when documents change, and React Suspense integration.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     React Components                         │
├─────────────────────────────────────────────────────────────┤
│  useDocument  │  useDocuments  │  useGetDocument  │  etc.   │
├─────────────────────────────────────────────────────────────┤
│                     DocumentCache                            │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐     │
│  │  documents  │  │ batchPromises│  │    listeners    │     │
│  │    Map      │  │     Map      │  │       Map       │     │
│  └─────────────┘  └──────────────┘  └─────────────────┘     │
├─────────────────────────────────────────────────────────────┤
│                   IDocumentDriveServer                       │
│              (reactor / document storage)                    │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### `DocumentCache` Class

Located in `src/document-cache.ts`, this class implements `IDocumentCache` and manages:

- **Document promise caching**: Stores promises for individual documents to avoid duplicate fetches
- **Batch promise caching**: Stores batch promises for `useDocuments` to maintain stable references
- **Subscription management**: Tracks listeners for document changes
- **Automatic updates**: Listens to reactor events and updates cached data

#### Internal State

```typescript
private documents = new Map<string, Promise<PHDocument>>();
private batchPromises = new Map<string, {
  promises: Promise<PHDocument>[];
  promise: Promise<PHDocument[]>
}>();
private listeners = new Map<string, (() => void)[]>();
```

#### Event Handling

The cache subscribes to two reactor events:

1. **`operationsAdded`**: When a document receives new operations, the cache refetches the document and notifies listeners after the refetch completes. This ensures UI shows stale data during refetch rather than suspending.

2. **`documentDeleted`**: When a document is deleted, it's removed from the cache and listeners are notified immediately.

### `readPromiseState` Function

A utility that tracks promise state synchronously by attaching status metadata to promise objects:

```typescript
type PromiseWithState<T> = Promise<T> & {
  status?: "pending" | "fulfilled" | "rejected";
  value?: T;
  reason?: unknown;
};
```

This enables React's `use()` hook and `useSyncExternalStore` to work with promises without causing unnecessary suspensions.

## Hooks

### Suspense-based Hooks

These hooks use React Suspense and will suspend rendering while data is loading.

#### `useDocument(id: string | null | undefined)`

Retrieves a single document by ID with automatic subscription to changes.

```typescript
function MyComponent({ docId }: { docId: string }) {
  const document = useDocument(docId);
  return <div>{document?.header.name}</div>;
}
```

- Uses `useSyncExternalStore` for subscription management
- Returns `undefined` if `id` is null/undefined
- Throws (suspends) while loading
- Automatically updates when document changes

#### `useDocuments(ids: string[] | null | undefined)`

Retrieves multiple documents by their IDs.

```typescript
function MyComponent({ docIds }: { docIds: string[] }) {
  const documents = useDocuments(docIds);
  return (
    <ul>
      {documents.map(doc => <li key={doc.header.id}>{doc.header.name}</li>)}
    </ul>
  );
}
```

- Returns empty array if `ids` is null/undefined/empty
- Uses batch caching for stable references
- **Stale-while-revalidate behavior**: When one document in the batch is updated, the UI continues showing stale data while the refetch completes (no suspension)

### Imperative Getter Hooks

These hooks return functions for imperative document fetching.

#### `useGetDocument()`

Returns a function to fetch a single document.

```typescript
function MyComponent() {
  const getDocument = useGetDocument();

  const handleClick = async () => {
    const doc = await getDocument("doc-123");
    console.log(doc.header.name);
  };

  return <button onClick={handleClick}>Load Document</button>;
}
```

#### `useGetDocuments()`

Returns a function to fetch multiple documents.

```typescript
function MyComponent() {
  const getDocuments = useGetDocuments();

  const handleClick = async () => {
    const docs = await getDocuments(["doc-1", "doc-2"]);
    console.log(docs.map(d => d.header.name));
  };

  return <button onClick={handleClick}>Load Documents</button>;
}
```

### Non-Suspense Hook

#### `useGetDocumentAsync(id: string | null | undefined)`

Retrieves a document without suspending. Returns a state object similar to TanStack Query.

```typescript
function MyComponent({ docId }: { docId: string }) {
  const { status, data, error, isPending, reload } = useGetDocumentAsync(docId);

  if (status === "pending") return <Loading />;
  if (status === "error") return <Error error={error} />;
  if (status === "success") return <div>{data.header.name}</div>;
  return null;
}
```

Returns:
- `status`: `"initial" | "pending" | "success" | "error"`
- `data`: The document (when successful)
- `error`: Error object (when failed)
- `isPending`: Boolean loading indicator
- `reload`: Function to force refetch

## Batch Caching Strategy

The `getBatch` method implements a sophisticated caching strategy:

1. **Deletion detection**: Before fetching, checks if any requested documents have been deleted. If so, creates a new batch that will fail with "not found" errors.

2. **Promise identity caching**: Returns the cached batch if all underlying document promises are the same objects.

3. **Pre-resolved batches**: When all individual promises are fulfilled, creates a batch promise with `status: "fulfilled"` already set to avoid unnecessary suspension.

4. **Stale-while-revalidate**: If some promises are pending (refetch in progress) but a cached batch exists, returns the cached batch to show stale data.

```typescript
// Simplified flow:
getBatch(ids) {
  // 1. Check for deletions
  if (hasDeletedDocuments) → create new Promise.all (will fail)

  // 2. Check cache validity
  if (cached && samePromises) → return cached

  // 3. Check if all fulfilled
  if (allFulfilled) → create pre-resolved batch

  // 4. Stale-while-revalidate
  if (cached) → return cached (stale data)

  // 5. Initial load
  return Promise.all(currentPromises)
}
```

## Global State Management

The document cache is stored in the global `window.ph` object and accessed via:

- `useDocumentCache()`: Hook to get the cache instance
- `setDocumentCache(cache)`: Function to set the cache instance
- `addDocumentCacheEventHandler()`: Function to listen for cache changes

## Testing

Tests are split across two files:

### `test/document-cache.test.tsx`

Tests for the `DocumentCache` class directly:
- Verifies `reactor.getDocument` is called when getting a document

### `test/hooks/document-cache.test.tsx`

Tests for the React hooks:
- `useDocumentCache`: Cache instance access and updates
- `useDocument`: Single document retrieval, updates on operations, deletion handling
- `useDocuments`: Batch retrieval, updates when one document changes, deletion handling
- `useGetDocument`: Imperative fetching, updates, cache consistency with `useDocument`
- `useGetDocuments`: Batch imperative fetching, updates, cache consistency with `useDocuments`
- `useGetDocumentAsync`: Non-suspense loading states, reload functionality, error handling

Test utilities use `ReactorBuilder` to create real reactor instances for integration testing:

```typescript
async function createDocumentCache(documents: PHDocument[] = []) {
  const legacyReactor = new ReactorBuilder([
    driveDocumentModelModule,
    documentModelDocumentModelModule,
  ]).build();

  for (const document of documents) {
    await legacyReactor.addDocument(document);
  }
  return {
    reactor: legacyReactor,
    cache: new DocumentCache(legacyReactor),
  };
}
```
