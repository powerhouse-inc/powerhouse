# Document Operations Cache — Design

**Issue:** powerhouse-inc/powerhouse#2447
**Date:** 2026-09-15
**Scope:** `useDocumentOperations` in reactor-browser, the `RevisionHistory` component in design-system, and its consumers in Connect and test-fusion

## Background

`useDocumentOperations` (`packages/reactor-browser/src/hooks/document-operations.ts`) fetches a document's operations through the reactor client. Verified on main on 2026-09-15, it still has every problem the issue lists:

1. When a document has no operations it retries 5 times with a 500 ms delay, a 2.5 s hang before it reports an empty result.
2. It ignores the paging, filter and abort parameters of `reactorClient.getOperations`, and fetches every operation of a scope in one request.
3. It fetches the `global` and `local` scopes eagerly, on mount, even though the `RevisionHistory` panel shows one scope at a time and only when the user opens it.
4. It keeps its own `useState`/`useEffect` state while every other reactive read in reactor-browser goes through `DocumentCache` and `useSyncExternalStore`.

Four facts the issue does not mention shape this design:

- **Pages arrive oldest first.** The operation store orders by `index` ascending (`packages/reactor/src/storage/kysely/store.ts`) and neither the reactor nor the GraphQL API offers a descending order. `RevisionHistory` renders newest first. A "load more" button that appends the next page would therefore show the oldest operations first and the newest last.
- **The editor needs operations outside the panel.** `DocumentEditor` (`apps/connect/src/components/editors.tsx`) passes the global operations to `getRevisionFromDate` for the timeline read-mode feature, which runs while the editor, not the panel, is visible.
- **A second consumer exists.** `test/test-fusion/src/components/todo-demo.tsx` reads `globalOperations` and calls `refetch` whenever the document's `lastModifiedAtUtcIso` changes. `test/test-fusion/e2e/document-models.spec.ts` asserts that its rendered operation count becomes non-zero.
- **Two `IDocumentCache` implementations exist.** `DocumentCache` wraps an `IReactorBrowserClient`. `GraphQLClientDocumentCache` (`packages/reactor-browser/src/graphql/graphql-client-document-cache.ts`) is used by the legacy `initGraphQLReactorClient` path, which sets no reactor client, so operations have never been available there.

## Design

### 1. Operation cache on `DocumentCache`

`DocumentCache` gains an operations store next to its document store. The unit of caching is one document scope:

```ts
type OperationsCacheEntry = {
  status: "idle" | "pending" | "success" | "error";
  operations: readonly Operation[];   // accumulated across loaded pages
  error: unknown;
  hasNextPage: boolean;
  totalCount: number | undefined;     // only the GraphQL client reports it
};
```

New interface in `packages/reactor-browser/src/types/documents.ts`:

```ts
export interface IOperationCache {
  /** Current snapshot for a document scope; a stable idle entry when nothing is cached. */
  getOperationsState(documentId: string, scope: string): OperationsCacheEntry;
  /** Loads the first page. No-op when the entry is pending or already loaded. */
  loadOperations(documentId: string, scope: string, limit: number): void;
  /** Loads the page after the last loaded one and appends it. No-op when no next page or pending. */
  loadMoreOperations(documentId: string, scope: string): void;
  /** Drops every cached scope of the document, aborts in-flight requests, notifies listeners. */
  invalidateOperations(documentId: string): void;
  /** Subscribes to changes of any scope of the document. Returns the unsubscribe function. */
  subscribeOperations(documentId: string, callback: () => void): () => void;
}
```

`DocumentCache implements IDocumentCache, IOperationCache`. `IDocumentCache` itself does not change, so `GraphQLClientDocumentCache` is untouched. A type guard `isOperationCache(cache): cache is IOperationCache` lets the hook detect support.

Internals:

- Entries live in `Map<string, OperationsCacheEntry>` keyed by `${documentId}:${scope}`. The hook reads entries through `useSyncExternalStore`, so every change replaces the entry object; entries are never mutated in place.
- Alongside each entry the cache keeps the last page's `nextCursor`, the page size (`limit`) it was fetched with, and an `AbortController`, in a separate private map. These are not part of the snapshot.
- `loadOperations` calls `client.getOperations(documentId, { scopes: [scope] }, undefined, { cursor: "", limit }, signal)`. `loadMoreOperations` calls `client.getOperations` again with the stored `nextCursor` and `limit`, and a fresh `AbortController`, so each page's request can be cancelled independently. A resolved page sets `status: "success"`, appends `results`, sets `hasNextPage: !!page.nextCursor`, and copies `totalCount`. A rejected page sets `status: "error"` with the reason and keeps the operations loaded so far. An aborted request changes nothing. The in-browser reactor client's `getOperations` (`packages/reactor/src/client/reactor-client.ts`) sets only `nextCursor`, never `next`; only the GraphQL client builds a `next` closure, which is why the cache pages through `nextCursor` rather than `PagedResults.next`.
- A `DocumentChangeEvent` of type `Updated` or `Deleted` for a document invalidates its operation entries. Invalidation deletes the entries, aborts their controllers, and notifies the document's operation listeners. The hook sees an idle entry and, when enabled, loads the first page again. This is the same "drop and refetch" model the document store uses; it needs no assumption that operations are append-only, which backdated writes can violate.
- `dispose()` aborts every in-flight operations request.

Requests are aborted on invalidation and dispose, not when a hook unmounts, because several hooks may share one entry.

### 2. The hook

`packages/reactor-browser/src/hooks/document-operations.ts` is rewritten:

```ts
export type UseDocumentOperationsOptions = {
  /** Operations per page. Default 100. */
  limit?: number;
  /** Whether to fetch. Default true. */
  enabled?: boolean;
};

export type DocumentOperationsResult = {
  operations: readonly Operation[];
  isLoading: boolean;
  error: Error | undefined;
  hasNextPage: boolean;
  totalCount: number | undefined;
  fetchNextPage: () => void;
  refetch: () => void;
};

export function useDocumentOperations(
  documentId: string | null | undefined,
  scope: string,
  options?: UseDocumentOperationsOptions,
): DocumentOperationsResult;
```

- The hook takes the cache from `useDocumentCache()`. When the cache implements `IOperationCache` it subscribes with `subscribeOperations` and reads `getOperationsState` through `useSyncExternalStore`.
- An effect calls `loadOperations` when `enabled` is true, `documentId` is set, and the entry is idle.
- `isLoading` is true when the entry is pending. `error` wraps a non-`Error` reason in an `Error`.
- `fetchNextPage` calls `loadMoreOperations`. `refetch` calls `invalidateOperations`; the effect above then loads the first page again.
- When `documentId` is empty, `enabled` is false, or the cache does not implement `IOperationCache`, the hook returns an empty, non-loading result with `hasNextPage: false`. The last case matches what the legacy path gets today. It logs nothing.
- The retry loop is gone. An empty first page is a final, valid result.
- The `filter` option the issue sketches is not added. No consumer needs it, and it would have to become part of the cache key.

The old `DocumentOperationsState` type is removed. The new types are exported from `hooks/index.ts` and from `graphql-client/entry.ts`, which imports from the hook module directly, as the entry's rules require.

### 3. `RevisionHistory`

`packages/design-system/src/connect/components/revision-history/revision-history.tsx` props become:

```ts
type Props = {
  readonly documentTitle: string;
  readonly documentId: string;
  readonly operations: readonly Operation[];  // the active scope only
  readonly isLoading: boolean;
  readonly hasNextPage: boolean;
  readonly onLoadNextPage: () => void;
  readonly scopes: readonly string[];
  readonly scope: string;
  readonly onScopeChange: (scope: string) => void;
  readonly onClose: () => void;
  readonly itemsPerPage?: number;
  readonly documentState?: object;
  readonly onCopyState?: () => void;
  readonly onCopyDocId?: () => void;
};
```

- `globalOperations` and `localOperations` are replaced by `operations`. The component no longer owns the selected scope; `scope` and `onScopeChange` make it controlled. Changing scope still resets the client-side pagination to the first page.
- Because pages arrive oldest first and the view is newest first, the component asks for the next page itself: an effect calls `onLoadNextPage` (deferred with `setTimeout(0)` so the browser can paint between requests) whenever `hasNextPage` is true and `isLoading` is false. It waits for the whole history rather than rendering progressively: measurements on a 2300-operation document showed each `getOperations` call costs about 90ms regardless of page size, and re-rendering the newest page on every arrival added another ~130ms per page, so a progressive newest-first view was both misleading (wrong order until the last page landed) and the more expensive option. While the walk is incomplete, the component shows "Loading operations…" with a count of operations loaded so far instead of the pagination and timeline; once complete, it renders them as before.
- When `operations` is empty and `isLoading` is true, the panel shows a loading message instead of "This document has no recorded operations yet." The empty message only shows once loading is done.
- `Timeline` takes a single `operations` prop instead of `globalOperations` and `localOperations`; it already renders one scope at a time.
- `Header` passes a new `scopes` prop to `Scope`. `header/scope.tsx` builds its items from that list, labelling each `"<Scope> scope"` with the first letter upper-cased. The hard-coded `global`/`local` pair is gone.
- Stories are updated to the new props. The design-system exports of these components do not change names.

### 4. Consumers

`apps/connect/src/components/editors.tsx`:

- `scopes` is `Object.keys(document.header.revision)`, falling back to `["global"]` when empty. `operationScope` is component state initialised to `"global"` when the document carries that scope, otherwise the first scope.
- The panel's operations come from `useDocumentOperations(documentId, operationScope, { enabled: revisionHistoryVisible, limit: 500 })`. Connect fetches 500 operations per page rather than the default 100: the in-browser reactor's per-call cost is roughly fixed regardless of page size, so a bigger page means fewer round trips to walk the same history.
- The timeline feature keeps working through a second call, `useDocumentOperations(documentId, "global", { enabled: !!selectedTimelineItem, limit: 500 })`, whose result feeds `getRevisionFromDate`. A small effect calls its `fetchNextPage` (deferred with `setTimeout(0)`, same as the panel) while `hasNextPage` is true and `isLoading` is false, so the whole global history is available to the date lookup as before. When the panel scope is `global`, both calls share one cache entry. The timeline revision passed to the editor's `context` is `undefined` while that global history is still loading or has more pages, so read mode stays on the latest state instead of jumping to revision 0.
- The `EditorLoader` that hid the panel while operations loaded is removed; `RevisionHistory` renders at once and shows its own loading state. The effect that called `refetch` when the panel opened is removed; `enabled` covers it.

`test/test-fusion/src/components/todo-demo.tsx`:

- `useDocumentOperations(documentId, "global")` replaces the old call. The effect that refetched on `lastModifiedAtUtcIso` is removed because a document update now invalidates the cache entry. The rendered count and its `data-testid` stay, so the e2e test is unchanged.

### 5. Files

| File | Change |
|------|--------|
| `packages/reactor-browser/src/types/documents.ts` | Add `OperationsCacheEntry`, `IOperationCache`, `isOperationCache` |
| `packages/reactor-browser/src/document-cache.ts` | Implement `IOperationCache`; invalidate on document change and dispose |
| `packages/reactor-browser/src/hooks/document-operations.ts` | Rewrite the hook on the cache |
| `packages/reactor-browser/src/graphql-client/entry.ts` | Export the new types |
| `packages/reactor-browser/test/document-cache.test.tsx` | Cache operations tests |
| `packages/reactor-browser/test/use-document-operations.test.tsx` | Hook tests |
| `packages/design-system/src/connect/components/revision-history/revision-history.tsx` | New props, progressive loading, loading states |
| `packages/design-system/src/connect/components/revision-history/timeline/timeline.tsx` | Single `operations` prop |
| `packages/design-system/src/connect/components/revision-history/header/header.tsx` | Pass `scopes` |
| `packages/design-system/src/connect/components/revision-history/header/scope.tsx` | Dynamic items |
| `packages/design-system/src/connect/components/revision-history/*.stories.tsx` | New props |
| `apps/connect/src/components/editors.tsx` | Scopes from header, controlled scope, `enabled`, timeline call |
| `test/test-fusion/src/components/todo-demo.tsx` | New signature, drop manual refetch |

### 6. Compatibility

`useDocumentOperations(documentId)` (one argument) and the `DocumentOperationsState` type it returns remain as deprecated aliases: the call is backed by the same document cache as the scoped form, and pages both the `global` and `local` scopes to completion before reporting `isLoading: false`. `RevisionHistory` still accepts the legacy `globalOperations`/`localOperations` pair and toggles between them internally rather than requiring a controlled scope. Both are removed in the next major.

## Testing

- **Cache** (vitest, mock client as in the existing `document-cache.test.tsx`): first page load and snapshot shape; `loadMoreOperations` appends and calls `next`; no request while pending; error keeps loaded operations and sets `status: "error"`; an `Updated` event for the document drops its entries and notifies operation listeners while leaving other documents alone; `invalidateOperations` aborts the in-flight request and its late result is discarded; `dispose` aborts.
- **Hook** (vitest with React Testing Library, the pattern of `use-document-safe.test.tsx`): disabled and empty-id return empty non-loading results; an enabled hook loads once and re-renders on completion; empty result is final and is not retried; `fetchNextPage` appends; `refetch` reloads from the first page; a cache without `IOperationCache` yields the empty result.
- **RevisionHistory**: stories cover loading, empty, single page, and multi-page with a pending next page. A vitest render test checks that `onLoadNextPage` is called when `hasNextPage` is true and not while `isLoading`.
- **Repo checks** on every touched package: `pnpm tsc`, `pnpm lint`, `pnpm test`. The test-fusion e2e stays as is.

## Out of scope

- Descending order or a "since revision" refresh in the operations API. Both would allow real lazy paging for a newest-first view and belong to a reactor and reactor-api change.
- Operation filters in the hook.
- Operations support in `GraphQLClientDocumentCache`.
