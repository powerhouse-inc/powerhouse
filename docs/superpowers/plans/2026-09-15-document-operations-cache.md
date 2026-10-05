# Document Operations Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the eager, retrying `useDocumentOperations` hook with a cache-backed, single-scope, paginated hook, and move `RevisionHistory` and its consumers onto it.

**Architecture:** `DocumentCache` grows an operations store keyed by document id and scope, exposed through a new `IOperationCache` interface and invalidated by the document change events the cache already subscribes to. The hook reads that store through `useSyncExternalStore`, exactly like `useDocument`. `RevisionHistory` becomes a controlled component that takes one scope's operations and asks for further pages itself, because the API only pages oldest first while the view renders newest first.

**Tech Stack:** TypeScript, React 19, vitest (browser mode with `vitest-browser-react` in reactor-browser; happy-dom with `@testing-library/react` in design-system), Storybook, pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-09-15-document-operations-cache-design.md`

## Global Constraints

- Branch: `refactor/document-operations-cache`. Commit after each task. No AI attribution trailers in commit messages (user preference).
- Run package scripts from the package directory: `pnpm tsc`, `pnpm lint`, `pnpm test`. reactor-browser tests run in a headless Chromium through Playwright and take about a minute.
- Imports of `@powerhousedao/reactor` in reactor-browser source must be type-only. Runtime mirrors live in `packages/reactor-browser/src/reactor-interop.ts`.
- `packages/reactor-browser/src/graphql-client/entry.ts` re-exports from specific modules, never from a barrel.
- `useSyncExternalStore` snapshots must be referentially stable between changes. Never mutate a cached entry; replace it.
- Tasks 2 to 5 each leave a different package's typecheck green while a downstream consumer is still on the old API. The monorepo is consistent again after Task 5. Do not "fix" consumers ahead of their task.
- The retry loop is not to be reintroduced in any form. An empty first page is a final result.

---

### Task 1: Operation cache on `DocumentCache`

**Files:**
- Modify: `packages/reactor-browser/src/types/documents.ts`
- Modify: `packages/reactor-browser/src/document-cache.ts`
- Test: `packages/reactor-browser/test/document-cache.test.tsx`

**Interfaces:**
- Consumes: `IReactorBrowserClient.getOperations(documentId, view?, filter?, paging?, signal?) => Promise<PagedResults<Operation>>` where `PagedResults<T> = { results: T[]; options: PagingOptions; next?: () => Promise<PagedResults<T>>; nextCursor?: string; totalCount?: number }`.
- Produces (used by Task 2):
  - `type OperationsCacheEntry = { status: "idle" | "pending" | "success" | "error"; operations: readonly Operation[]; error: unknown; hasNextPage: boolean; totalCount: number | undefined }`
  - `interface IOperationCache { getOperationsState(documentId, scope): OperationsCacheEntry; loadOperations(documentId, scope, limit: number): void; loadMoreOperations(documentId, scope): void; invalidateOperations(documentId): void; subscribeOperations(documentId, callback: () => void): () => void }`
  - `const IDLE_OPERATIONS_ENTRY: OperationsCacheEntry` and `function isOperationCache(cache: unknown): cache is IOperationCache`, both exported from `document-cache.ts`.
  - `DocumentCache implements IDocumentCache, IOperationCache`.

- [ ] **Step 1: Add the types**

Append to `packages/reactor-browser/src/types/documents.ts` (add `Operation` to the existing import from `@powerhousedao/shared/document-model`):

```ts
/** Snapshot of one document scope's operations as the cache knows them. */
export type OperationsCacheEntry = {
  /** `idle` means nothing has been requested since the last invalidation. */
  status: "idle" | "pending" | "success" | "error";
  /** Every operation loaded so far, oldest first, across all loaded pages. */
  operations: readonly Operation[];
  /** The rejection reason of the last failed page; `undefined` otherwise. */
  error: unknown;
  /** Whether the last loaded page reported a further page. */
  hasNextPage: boolean;
  /** Reported by the GraphQL client only; `undefined` for the in-browser reactor. */
  totalCount: number | undefined;
};

/**
 * Operation history keyed by document id and scope. Pages are fetched
 * oldest first and appended. A document change event drops every scope of
 * that document so the next read starts from the first page again.
 */
export interface IOperationCache {
  /** Current snapshot; a shared idle entry when nothing is cached. */
  getOperationsState(documentId: string, scope: string): OperationsCacheEntry;
  /** Loads the first page. No-op unless the entry is idle. */
  loadOperations(documentId: string, scope: string, limit: number): void;
  /** Loads the page after the last one and appends it. No-op unless the entry is loaded and has a next page. */
  loadMoreOperations(documentId: string, scope: string): void;
  /** Drops every cached scope of the document, aborts in-flight requests, notifies listeners. */
  invalidateOperations(documentId: string): void;
  /** Subscribes to changes of any scope of the document. Returns the unsubscribe function. */
  subscribeOperations(documentId: string, callback: () => void): () => void;
}
```

- [ ] **Step 2: Write the failing cache tests**

Append a new `describe` block to `packages/reactor-browser/test/document-cache.test.tsx`. Add `Operation` and `PagedResults` to the imports (`import type { Operation, PHDocument } from "@powerhousedao/shared/document-model"; import type { PagedResults } from "@powerhousedao/reactor";`) and import `IDLE_OPERATIONS_ENTRY` from `../src/document-cache.js`.

```tsx
function createFakeOperation(index: number, scope = "global"): Operation {
  return {
    id: `op-${scope}-${index}`,
    index,
    skip: 0,
    hash: `hash-${index}`,
    timestampUtcMs: new Date(0).toISOString(),
    action: {
      id: `action-${scope}-${index}`,
      type: "INCREMENT",
      input: {},
      scope,
      timestampUtcMs: new Date(0).toISOString(),
    },
  } as Operation;
}

/** A page whose `next` is present only when `nextPage` is given. */
function makePage(
  results: Operation[],
  nextPage?: () => Promise<PagedResults<Operation>>,
  totalCount?: number,
): PagedResults<Operation> {
  return {
    results,
    options: { cursor: "", limit: results.length },
    next: nextPage,
    totalCount,
  };
}

/**
 * A client whose `getOperations` is a controllable mock. `subscribe` captures
 * the callback so tests can emit document change events.
 */
function createOperationsClient() {
  let subscribeCallback: ((event: DocumentChangeEvent) => void) | null = null;
  const getOperations = vi.fn<
    (
      documentId: string,
      view?: { scopes?: string[] },
      filter?: unknown,
      paging?: { cursor: string; limit: number },
      signal?: AbortSignal,
    ) => Promise<PagedResults<Operation>>
  >();
  const client = {
    get: vi.fn(),
    subscribe: vi.fn((_search: any, cb: (event: DocumentChangeEvent) => void) => {
      subscribeCallback = cb;
      return vi.fn();
    }),
    getOperations,
  } as unknown as IReactorClient;
  return {
    client,
    getOperations,
    emitEvent(event: DocumentChangeEvent) {
      subscribeCallback?.(event);
    },
  };
}

describe("DocumentCache operations", () => {
  it("returns the shared idle entry for an unknown scope", () => {
    const { client } = createOperationsClient();
    const cache = new DocumentCache(client);
    expect(cache.getOperationsState("doc-1", "global")).toBe(
      IDLE_OPERATIONS_ENTRY,
    );
  });

  it("loads the first page for one scope with the given limit", async () => {
    const { client, getOperations } = createOperationsClient();
    getOperations.mockResolvedValue(
      makePage([createFakeOperation(0), createFakeOperation(1)], undefined, 2),
    );
    const cache = new DocumentCache(client);
    const listener = vi.fn();
    cache.subscribeOperations("doc-1", listener);

    cache.loadOperations("doc-1", "global", 50);
    expect(cache.getOperationsState("doc-1", "global").status).toBe("pending");
    expect(getOperations).toHaveBeenCalledWith(
      "doc-1",
      { scopes: ["global"] },
      undefined,
      { cursor: "", limit: 50 },
      expect.any(AbortSignal),
    );

    await vi.waitFor(() => {
      expect(cache.getOperationsState("doc-1", "global").status).toBe("success");
    });
    const entry = cache.getOperationsState("doc-1", "global");
    expect(entry.operations.map((op) => op.index)).toEqual([0, 1]);
    expect(entry.hasNextPage).toBe(false);
    expect(entry.totalCount).toBe(2);
    // pending, then success
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("treats an empty first page as a final result", async () => {
    const { client, getOperations } = createOperationsClient();
    getOperations.mockResolvedValue(makePage([]));
    const cache = new DocumentCache(client);

    cache.loadOperations("doc-1", "global", 100);
    await vi.waitFor(() => {
      expect(cache.getOperationsState("doc-1", "global").status).toBe("success");
    });
    expect(cache.getOperationsState("doc-1", "global").operations).toEqual([]);
    expect(getOperations).toHaveBeenCalledTimes(1);
  });

  it("does not start a second request while one is pending or once loaded", async () => {
    const { client, getOperations } = createOperationsClient();
    const first = createDeferred<PagedResults<Operation>>();
    getOperations.mockReturnValue(first.promise);
    const cache = new DocumentCache(client);

    cache.loadOperations("doc-1", "global", 100);
    cache.loadOperations("doc-1", "global", 100);
    expect(getOperations).toHaveBeenCalledTimes(1);

    first.resolve(makePage([createFakeOperation(0)]));
    await vi.waitFor(() => {
      expect(cache.getOperationsState("doc-1", "global").status).toBe("success");
    });
    cache.loadOperations("doc-1", "global", 100);
    expect(getOperations).toHaveBeenCalledTimes(1);
  });

  it("appends the next page through the page's next function", async () => {
    const { client, getOperations } = createOperationsClient();
    const secondPage = makePage([createFakeOperation(2)]);
    const next = vi.fn(() => Promise.resolve(secondPage));
    getOperations.mockResolvedValue(
      makePage([createFakeOperation(0), createFakeOperation(1)], next),
    );
    const cache = new DocumentCache(client);

    cache.loadOperations("doc-1", "global", 2);
    await vi.waitFor(() => {
      expect(cache.getOperationsState("doc-1", "global").hasNextPage).toBe(true);
    });

    cache.loadMoreOperations("doc-1", "global");
    expect(cache.getOperationsState("doc-1", "global").status).toBe("pending");
    await vi.waitFor(() => {
      expect(cache.getOperationsState("doc-1", "global").status).toBe("success");
    });
    const entry = cache.getOperationsState("doc-1", "global");
    expect(next).toHaveBeenCalledTimes(1);
    expect(entry.operations.map((op) => op.index)).toEqual([0, 1, 2]);
    expect(entry.hasNextPage).toBe(false);

    // Nothing more to load: no-op.
    cache.loadMoreOperations("doc-1", "global");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("keeps loaded operations and records the reason when a page fails", async () => {
    const { client, getOperations } = createOperationsClient();
    const next = vi.fn(() => Promise.reject(new Error("boom")));
    getOperations.mockResolvedValue(makePage([createFakeOperation(0)], next));
    const cache = new DocumentCache(client);

    cache.loadOperations("doc-1", "global", 1);
    await vi.waitFor(() => {
      expect(cache.getOperationsState("doc-1", "global").status).toBe("success");
    });
    cache.loadMoreOperations("doc-1", "global");
    await vi.waitFor(() => {
      expect(cache.getOperationsState("doc-1", "global").status).toBe("error");
    });
    const entry = cache.getOperationsState("doc-1", "global");
    expect(entry.operations).toHaveLength(1);
    expect(entry.error).toEqual(new Error("boom"));
  });

  it("caches scopes and documents independently", async () => {
    const { client, getOperations } = createOperationsClient();
    getOperations.mockImplementation((docId, view) =>
      Promise.resolve(
        makePage([createFakeOperation(0, `${docId}-${view?.scopes?.[0]}`)]),
      ),
    );
    const cache = new DocumentCache(client);
    cache.loadOperations("doc-1", "global", 10);
    cache.loadOperations("doc-1", "local", 10);
    cache.loadOperations("doc-2", "global", 10);
    await vi.waitFor(() => {
      expect(cache.getOperationsState("doc-2", "global").status).toBe("success");
    });
    expect(cache.getOperationsState("doc-1", "global").operations[0].id).toBe(
      "op-doc-1-global-0",
    );
    expect(cache.getOperationsState("doc-1", "local").operations[0].id).toBe(
      "op-doc-1-local-0",
    );
  });

  it("drops a document's scopes and notifies on a document Updated event", async () => {
    const { client, getOperations, emitEvent } = createOperationsClient();
    getOperations.mockResolvedValue(makePage([createFakeOperation(0)]));
    const cache = new DocumentCache(client);
    const doc1Listener = vi.fn();
    const doc2Listener = vi.fn();
    cache.subscribeOperations("doc-1", doc1Listener);
    cache.subscribeOperations("doc-2", doc2Listener);
    cache.loadOperations("doc-1", "global", 10);
    cache.loadOperations("doc-1", "local", 10);
    cache.loadOperations("doc-2", "global", 10);
    await vi.waitFor(() => {
      expect(cache.getOperationsState("doc-2", "global").status).toBe("success");
    });
    doc1Listener.mockClear();
    doc2Listener.mockClear();

    emitEvent({
      type: DocumentChangeType.Updated,
      documents: [createMockDocument("doc-1")],
    } as DocumentChangeEvent);

    expect(cache.getOperationsState("doc-1", "global")).toBe(
      IDLE_OPERATIONS_ENTRY,
    );
    expect(cache.getOperationsState("doc-1", "local")).toBe(
      IDLE_OPERATIONS_ENTRY,
    );
    expect(cache.getOperationsState("doc-2", "global").status).toBe("success");
    expect(doc1Listener).toHaveBeenCalledTimes(1);
    expect(doc2Listener).not.toHaveBeenCalled();
  });

  it("drops a document's scopes on a Deleted event", async () => {
    const { client, getOperations, emitEvent } = createOperationsClient();
    getOperations.mockResolvedValue(makePage([createFakeOperation(0)]));
    const cache = new DocumentCache(client);
    cache.loadOperations("doc-1", "global", 10);
    await vi.waitFor(() => {
      expect(cache.getOperationsState("doc-1", "global").status).toBe("success");
    });

    emitEvent({
      type: DocumentChangeType.Deleted,
      documents: [],
      context: { childId: "doc-1" },
    } as unknown as DocumentChangeEvent);

    expect(cache.getOperationsState("doc-1", "global")).toBe(
      IDLE_OPERATIONS_ENTRY,
    );
  });

  it("aborts an in-flight request on invalidation and discards its late result", async () => {
    const { client, getOperations } = createOperationsClient();
    const first = createDeferred<PagedResults<Operation>>();
    getOperations.mockReturnValue(first.promise);
    const cache = new DocumentCache(client);
    const listener = vi.fn();
    cache.subscribeOperations("doc-1", listener);

    cache.loadOperations("doc-1", "global", 10);
    const signal = getOperations.mock.calls[0][4]!;
    expect(signal.aborted).toBe(false);

    cache.invalidateOperations("doc-1");
    expect(signal.aborted).toBe(true);
    expect(cache.getOperationsState("doc-1", "global")).toBe(
      IDLE_OPERATIONS_ENTRY,
    );

    first.resolve(makePage([createFakeOperation(0)]));
    await Promise.resolve();
    await Promise.resolve();
    expect(cache.getOperationsState("doc-1", "global")).toBe(
      IDLE_OPERATIONS_ENTRY,
    );
  });

  it("does nothing on invalidation of a document with no cached scopes", () => {
    const { client } = createOperationsClient();
    const cache = new DocumentCache(client);
    const listener = vi.fn();
    cache.subscribeOperations("doc-1", listener);
    cache.invalidateOperations("doc-1");
    expect(listener).not.toHaveBeenCalled();
  });

  it("unsubscribes operation listeners", async () => {
    const { client, getOperations } = createOperationsClient();
    getOperations.mockResolvedValue(makePage([]));
    const cache = new DocumentCache(client);
    const listener = vi.fn();
    const unsubscribe = cache.subscribeOperations("doc-1", listener);
    unsubscribe();
    cache.loadOperations("doc-1", "global", 10);
    await vi.waitFor(() => {
      expect(cache.getOperationsState("doc-1", "global").status).toBe("success");
    });
    expect(listener).not.toHaveBeenCalled();
  });

  it("aborts every in-flight operations request on dispose", () => {
    const { client, getOperations } = createOperationsClient();
    getOperations.mockReturnValue(new Promise(() => {}));
    const cache = new DocumentCache(client);
    cache.loadOperations("doc-1", "global", 10);
    cache.loadOperations("doc-2", "global", 10);
    cache.dispose();
    expect(getOperations.mock.calls[0][4]!.aborted).toBe(true);
    expect(getOperations.mock.calls[1][4]!.aborted).toBe(true);
  });
});
```

`createDeferred` and `createMockDocument` already exist at the top of this test file.

- [ ] **Step 3: Run the tests to verify they fail**

Run from `packages/reactor-browser`: `pnpm vitest --run test/document-cache.test.tsx`
Expected: FAIL. The compile step reports that `IDLE_OPERATIONS_ENTRY` is not exported and that `subscribeOperations`, `loadOperations`, `loadMoreOperations`, `invalidateOperations`, `getOperationsState` do not exist on `DocumentCache`.

- [ ] **Step 4: Implement the operations store**

In `packages/reactor-browser/src/document-cache.ts`:

Extend the imports:

```ts
import type { DocumentChangeEvent, PagedResults } from "@powerhousedao/reactor";
import type { Operation, PHDocument } from "@powerhousedao/shared/document-model";
import type {
  FulfilledPromise,
  IDocumentCache,
  IOperationCache,
  OperationsCacheEntry,
  PromiseState,
  PromiseWithState,
  RejectedPromise,
} from "./types/documents.js";
```

Add, above the class:

```ts
/** The snapshot every uncached document scope reads as. One frozen object, so `useSyncExternalStore` sees a stable value. */
export const IDLE_OPERATIONS_ENTRY: OperationsCacheEntry = Object.freeze({
  status: "idle",
  operations: Object.freeze([]) as readonly Operation[],
  error: undefined,
  hasNextPage: false,
  totalCount: undefined,
});

/** Whether a document cache also serves operation history. `GraphQLClientDocumentCache` does not. */
export function isOperationCache(cache: unknown): cache is IOperationCache {
  if (typeof cache !== "object" || cache === null) return false;
  const candidate = cache as Partial<IOperationCache>;
  return (
    typeof candidate.getOperationsState === "function" &&
    typeof candidate.loadOperations === "function" &&
    typeof candidate.loadMoreOperations === "function" &&
    typeof candidate.invalidateOperations === "function" &&
    typeof candidate.subscribeOperations === "function"
  );
}

/** Bookkeeping for one document scope that is not part of its snapshot. */
type OperationsRequest = {
  /** Aborts the request in flight, or marks a settled one as superseded. */
  controller: AbortController;
  /** The `next` of the last loaded page; `undefined` when there is none. */
  next: (() => Promise<PagedResults<Operation>>) | undefined;
};
```

Change the class declaration to `export class DocumentCache implements IDocumentCache, IOperationCache {` and add these private fields after `aliasKeys`:

```ts
  /** Operations by document id, then scope. Entries are replaced, never mutated. */
  private operationEntries = new Map<string, Map<string, OperationsCacheEntry>>();
  /** In-flight controllers and `next` functions, by document id then scope. */
  private operationRequests = new Map<string, Map<string, OperationsRequest>>();
  private operationListeners = new Map<string, (() => void)[]>();
```

Change `handleDocumentChange` so both event kinds invalidate operations:

```ts
  private handleDocumentChange(event: DocumentChangeEvent): void {
    if (event.type === DOCUMENT_CHANGE_TYPE.Deleted) {
      const documentId = event.context?.childId;
      if (documentId) {
        this.handleDocumentDeleted(documentId);
        this.invalidateOperations(documentId);
      }
    } else if (event.type === DOCUMENT_CHANGE_TYPE.Updated) {
      for (const doc of event.documents) {
        this.handleDocumentUpdated(doc.header.id).catch(console.warn);
        this.invalidateOperations(doc.header.id);
      }
    }
  }
```

Add the public methods and private helpers before `dispose()`:

```ts
  getOperationsState(documentId: string, scope: string): OperationsCacheEntry {
    return this.operationEntries.get(documentId)?.get(scope) ?? IDLE_OPERATIONS_ENTRY;
  }

  loadOperations(documentId: string, scope: string, limit: number): void {
    const current = this.getOperationsState(documentId, scope);
    if (current.status !== "idle") {
      return;
    }
    const controller = new AbortController();
    this.setOperationsRequest(documentId, scope, { controller, next: undefined });
    this.setOperationsEntry(documentId, scope, { ...current, status: "pending" });
    this.settleOperationsPage(
      documentId,
      scope,
      this.client.getOperations(
        documentId,
        { scopes: [scope] },
        undefined,
        { cursor: "", limit },
        controller.signal,
      ),
      controller,
    );
  }

  loadMoreOperations(documentId: string, scope: string): void {
    const current = this.getOperationsState(documentId, scope);
    const request = this.operationRequests.get(documentId)?.get(scope);
    if (current.status !== "success" || !current.hasNextPage || !request?.next) {
      return;
    }
    // `next()` carries the signal of the page that produced it, so this
    // controller cannot cancel the network request. It still marks the page
    // as superseded: a result arriving after invalidation is discarded.
    const controller = new AbortController();
    this.setOperationsRequest(documentId, scope, { controller, next: request.next });
    this.setOperationsEntry(documentId, scope, { ...current, status: "pending" });
    this.settleOperationsPage(documentId, scope, request.next(), controller);
  }

  invalidateOperations(documentId: string): void {
    const requests = this.operationRequests.get(documentId);
    if (requests) {
      for (const request of requests.values()) {
        request.controller.abort();
      }
      this.operationRequests.delete(documentId);
    }
    if (this.operationEntries.delete(documentId)) {
      this.notifyOperationListeners(documentId);
    }
  }

  subscribeOperations(documentId: string, callback: () => void): () => void {
    const listeners = this.operationListeners.get(documentId) ?? [];
    this.operationListeners.set(documentId, [...listeners, callback]);
    return () => {
      const current = this.operationListeners.get(documentId) ?? [];
      this.operationListeners.set(
        documentId,
        current.filter((listener) => listener !== callback),
      );
    };
  }

  private settleOperationsPage(
    documentId: string,
    scope: string,
    page: Promise<PagedResults<Operation>>,
    controller: AbortController,
  ): void {
    page.then(
      (result) => {
        if (controller.signal.aborted) return;
        const current = this.getOperationsState(documentId, scope);
        this.setOperationsRequest(documentId, scope, { controller, next: result.next });
        this.setOperationsEntry(documentId, scope, {
          status: "success",
          operations: [...current.operations, ...result.results],
          error: undefined,
          hasNextPage: result.next !== undefined,
          totalCount: result.totalCount,
        });
      },
      (reason: unknown) => {
        if (controller.signal.aborted) return;
        const current = this.getOperationsState(documentId, scope);
        this.setOperationsEntry(documentId, scope, {
          ...current,
          status: "error",
          error: reason,
        });
      },
    );
  }

  private setOperationsEntry(
    documentId: string,
    scope: string,
    entry: OperationsCacheEntry,
  ): void {
    const scopes = this.operationEntries.get(documentId) ?? new Map<string, OperationsCacheEntry>();
    scopes.set(scope, entry);
    this.operationEntries.set(documentId, scopes);
    this.notifyOperationListeners(documentId);
  }

  private setOperationsRequest(
    documentId: string,
    scope: string,
    request: OperationsRequest,
  ): void {
    const scopes = this.operationRequests.get(documentId) ?? new Map<string, OperationsRequest>();
    scopes.set(scope, request);
    this.operationRequests.set(documentId, scopes);
  }

  private notifyOperationListeners(documentId: string): void {
    for (const listener of this.operationListeners.get(documentId) ?? []) {
      listener();
    }
  }
```

Extend `dispose()`:

```ts
  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    for (const requests of this.operationRequests.values()) {
      for (const request of requests.values()) {
        request.controller.abort();
      }
    }
    this.operationRequests.clear();
  }
```

Update the class doc comment to mention that the cache also holds operation history per document scope and drops it on document change events.

- [ ] **Step 5: Run the tests to verify they pass**

Run from `packages/reactor-browser`: `pnpm vitest --run test/document-cache.test.tsx`
Expected: PASS, including all pre-existing tests in the file.

- [ ] **Step 6: Typecheck and lint the package**

Run from `packages/reactor-browser`: `pnpm tsc && pnpm lint`
Expected: both exit 0. The old hook still compiles because it does not touch the cache.

- [ ] **Step 7: Commit**

```bash
git add packages/reactor-browser/src/types/documents.ts packages/reactor-browser/src/document-cache.ts packages/reactor-browser/test/document-cache.test.tsx
git commit -m "feat(reactor-browser): cache paginated operation history per document scope in DocumentCache"
```

---

### Task 2: Rewrite `useDocumentOperations` on the cache

**Files:**
- Modify: `packages/reactor-browser/src/hooks/document-operations.ts` (full rewrite)
- Modify: `packages/reactor-browser/src/graphql-client/entry.ts:47-48`
- Create: `packages/reactor-browser/test/use-document-operations.test.tsx`

**Interfaces:**
- Consumes from Task 1: `IOperationCache`, `OperationsCacheEntry`, `IDLE_OPERATIONS_ENTRY`, `isOperationCache`; `useDocumentCache` from `hooks/document-cache.ts`.
- Produces (used by Tasks 4 and 5):

```ts
export type UseDocumentOperationsOptions = { limit?: number; enabled?: boolean };
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

Note: after this task `apps/connect` and `test/test-fusion` no longer typecheck against the hook. Tasks 4 and 5 fix them.

- [ ] **Step 1: Write the failing hook tests**

Create `packages/reactor-browser/test/use-document-operations.test.tsx`:

```tsx
import type { PagedResults } from "@powerhousedao/reactor";
import type { Operation } from "@powerhousedao/shared/document-model";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { DocumentCache } from "../src/document-cache.js";
import { ensurePHEventHandlers } from "../src/graphql-client/graphql-reactor-provider.js";
import { setDocumentCache } from "../src/hooks/document-cache.js";
import { useDocumentOperations } from "../src/hooks/document-operations.js";
import type { IDocumentCache } from "../src/types/documents.js";
import type { IReactorBrowserClient } from "../src/types/reactor-browser-client.js";

function createFakeOperation(index: number, scope = "global"): Operation {
  return {
    id: `op-${scope}-${index}`,
    index,
    skip: 0,
    hash: `hash-${index}`,
    timestampUtcMs: new Date(0).toISOString(),
    action: {
      id: `action-${scope}-${index}`,
      type: "INCREMENT",
      input: {},
      scope,
      timestampUtcMs: new Date(0).toISOString(),
    },
  } as Operation;
}

function makePage(
  results: Operation[],
  next?: () => Promise<PagedResults<Operation>>,
): PagedResults<Operation> {
  return { results, options: { cursor: "", limit: results.length }, next };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeCache(getOperations: IReactorBrowserClient["getOperations"]) {
  const client = {
    get: vi.fn(),
    subscribe: () => () => undefined,
    getOperations,
  } as unknown as IReactorBrowserClient;
  return new DocumentCache(client);
}

function Probe(props: {
  id: string | null;
  scope?: string;
  enabled?: boolean;
  limit?: number;
}) {
  const { id, scope = "global", enabled, limit } = props;
  const result = useDocumentOperations(id, scope, { enabled, limit });
  return (
    <div>
      <span data-testid="loading">{String(result.isLoading)}</span>
      <span data-testid="count">{result.operations.length}</span>
      <span data-testid="indexes">
        {result.operations.map((op) => op.index).join(",")}
      </span>
      <span data-testid="has-next">{String(result.hasNextPage)}</span>
      <span data-testid="error">{result.error?.message ?? ""}</span>
      <button data-testid="next" onClick={result.fetchNextPage} />
      <button data-testid="refetch" onClick={result.refetch} />
    </div>
  );
}

function textOf(screen: ReturnType<typeof render>, testId: string) {
  return (
    screen.container.querySelector(`[data-testid=${testId}]`)?.textContent ?? ""
  );
}

function click(screen: ReturnType<typeof render>, testId: string) {
  (
    screen.container.querySelector(`[data-testid=${testId}]`) as HTMLButtonElement
  ).click();
}

describe("useDocumentOperations", () => {
  beforeEach(() => {
    window.ph = {};
    delete window.__phEventHandlersRegistered;
    ensurePHEventHandlers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.ph = {};
    delete window.__phEventHandlersRegistered;
  });

  it("loads the first page once and reports it", async () => {
    const getOperations = vi.fn(() =>
      Promise.resolve(makePage([createFakeOperation(0), createFakeOperation(1)])),
    );
    setDocumentCache(makeCache(getOperations));

    const screen = render(
      <StrictMode>
        <Probe id="doc-1" limit={25} />
      </StrictMode>,
    );
    expect(textOf(screen, "loading")).toBe("true");
    await vi.waitFor(() => {
      expect(textOf(screen, "loading")).toBe("false");
    });
    expect(textOf(screen, "indexes")).toBe("0,1");
    expect(textOf(screen, "has-next")).toBe("false");
    expect(getOperations).toHaveBeenCalledTimes(1);
    expect(getOperations.mock.calls[0][1]).toEqual({ scopes: ["global"] });
    expect(getOperations.mock.calls[0][3]).toEqual({ cursor: "", limit: 25 });
  });

  it("reports an empty page as a final, non-loading result without retrying", async () => {
    const getOperations = vi.fn(() => Promise.resolve(makePage([])));
    setDocumentCache(makeCache(getOperations));

    const screen = render(<Probe id="doc-1" />);
    await vi.waitFor(() => {
      expect(textOf(screen, "loading")).toBe("false");
    });
    expect(textOf(screen, "count")).toBe("0");
    // Give a hypothetical retry timer room to fire; it must not.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(getOperations).toHaveBeenCalledTimes(1);
  });

  it("does not fetch when disabled or when the id is empty", async () => {
    const getOperations = vi.fn(() => Promise.resolve(makePage([])));
    setDocumentCache(makeCache(getOperations));

    const disabled = render(<Probe id="doc-1" enabled={false} />);
    const noId = render(<Probe id={null} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getOperations).not.toHaveBeenCalled();
    expect(textOf(disabled, "loading")).toBe("false");
    expect(textOf(noId, "loading")).toBe("false");
    expect(textOf(disabled, "count")).toBe("0");
  });

  it("starts fetching once enabled flips to true", async () => {
    const getOperations = vi.fn(() =>
      Promise.resolve(makePage([createFakeOperation(0)])),
    );
    setDocumentCache(makeCache(getOperations));

    const screen = render(<Probe id="doc-1" enabled={false} />);
    expect(getOperations).not.toHaveBeenCalled();
    screen.rerender(<Probe id="doc-1" enabled={true} />);
    await vi.waitFor(() => {
      expect(textOf(screen, "count")).toBe("1");
    });
  });

  it("fetches a different scope when the scope changes", async () => {
    const getOperations = vi.fn((_: string, view?: { scopes?: string[] }) =>
      Promise.resolve(makePage([createFakeOperation(0, view?.scopes?.[0])])),
    );
    setDocumentCache(makeCache(getOperations));

    const screen = render(<Probe id="doc-1" scope="global" />);
    await vi.waitFor(() => {
      expect(textOf(screen, "count")).toBe("1");
    });
    screen.rerender(<Probe id="doc-1" scope="local" />);
    await vi.waitFor(() => {
      expect(getOperations).toHaveBeenCalledTimes(2);
    });
    expect(getOperations.mock.calls[1][1]).toEqual({ scopes: ["local"] });
  });

  it("appends the next page on fetchNextPage", async () => {
    const next = vi.fn(() => Promise.resolve(makePage([createFakeOperation(2)])));
    const getOperations = vi.fn(() =>
      Promise.resolve(
        makePage([createFakeOperation(0), createFakeOperation(1)], next),
      ),
    );
    setDocumentCache(makeCache(getOperations));

    const screen = render(<Probe id="doc-1" />);
    await vi.waitFor(() => {
      expect(textOf(screen, "has-next")).toBe("true");
    });
    click(screen, "next");
    await vi.waitFor(() => {
      expect(textOf(screen, "indexes")).toBe("0,1,2");
    });
    expect(textOf(screen, "has-next")).toBe("false");
    expect(getOperations).toHaveBeenCalledTimes(1);
  });

  it("refetch reloads from the first page", async () => {
    const getOperations = vi.fn(() =>
      Promise.resolve(makePage([createFakeOperation(0)])),
    );
    setDocumentCache(makeCache(getOperations));

    const screen = render(<Probe id="doc-1" />);
    await vi.waitFor(() => {
      expect(textOf(screen, "count")).toBe("1");
    });
    click(screen, "refetch");
    await vi.waitFor(() => {
      expect(getOperations).toHaveBeenCalledTimes(2);
    });
    await vi.waitFor(() => {
      expect(textOf(screen, "loading")).toBe("false");
    });
    expect(textOf(screen, "count")).toBe("1");
  });

  it("surfaces a failed page as an Error", async () => {
    const getOperations = vi.fn(() => Promise.reject("nope"));
    setDocumentCache(makeCache(getOperations));

    const screen = render(<Probe id="doc-1" />);
    await vi.waitFor(() => {
      expect(textOf(screen, "error")).toBe("nope");
    });
    expect(textOf(screen, "loading")).toBe("false");
  });

  it("returns an empty result when the cache has no operations support", async () => {
    const documentsOnly = {
      get: vi.fn(),
      getBatch: vi.fn(),
      subscribe: () => () => undefined,
    } as unknown as IDocumentCache;
    setDocumentCache(documentsOnly);

    const screen = render(<Probe id="doc-1" />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(textOf(screen, "loading")).toBe("false");
    expect(textOf(screen, "count")).toBe("0");
    expect(textOf(screen, "error")).toBe("");
  });

  it("shares one cache entry between two hooks on the same scope", async () => {
    const { promise, resolve } = deferred<PagedResults<Operation>>();
    const getOperations = vi.fn(() => promise);
    setDocumentCache(makeCache(getOperations));

    const screen = render(
      <>
        <Probe id="doc-1" />
        <Probe id="doc-1" />
      </>,
    );
    expect(getOperations).toHaveBeenCalledTimes(1);
    resolve(makePage([createFakeOperation(0)]));
    await vi.waitFor(() => {
      const counts = Array.from(
        screen.container.querySelectorAll("[data-testid=count]"),
      ).map((el) => el.textContent);
      expect(counts).toEqual(["1", "1"]);
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `packages/reactor-browser`: `pnpm vitest --run test/use-document-operations.test.tsx`
Expected: FAIL. TypeScript complains that the hook takes 1 argument and has no `operations`/`hasNextPage`/`fetchNextPage` fields.

- [ ] **Step 3: Rewrite the hook**

Replace the whole content of `packages/reactor-browser/src/hooks/document-operations.ts`:

```ts
import type { Operation } from "@powerhousedao/shared/document-model";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { IDLE_OPERATIONS_ENTRY, isOperationCache } from "../document-cache.js";
import type { IOperationCache } from "../types/documents.js";
import { useDocumentCache } from "./document-cache.js";

export type UseDocumentOperationsOptions = {
  /** Operations per page. Default 100. */
  limit?: number;
  /** Whether to fetch at all. Default true. Pass false until the operations are needed. */
  enabled?: boolean;
};

/** What `useDocumentOperations` returns; exported so consumers can name it. */
export type DocumentOperationsResult = {
  /** Every operation of the scope loaded so far, oldest first. */
  operations: readonly Operation[];
  /** A page is in flight. */
  isLoading: boolean;
  /** The last page failed. Operations loaded before it stay available. */
  error: Error | undefined;
  /** The last page reported a further page. */
  hasNextPage: boolean;
  /** Reported by the GraphQL client only. */
  totalCount: number | undefined;
  /** Loads the next page and appends it. No-op while loading or when there is none. */
  fetchNextPage: () => void;
  /** Drops the document's cached operations and reloads from the first page. */
  refetch: () => void;
};

const DEFAULT_LIMIT = 100;

function toError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

/**
 * Operation history of one scope of a document, read from the document
 * cache and kept in step with it: a change event for the document drops the
 * cached pages and the hook loads the first page again.
 *
 * Pages arrive oldest first. A view that wants the whole history calls
 * `fetchNextPage` while `hasNextPage` is true.
 *
 * An empty first page is a final result; there is no retry. When the active
 * document cache does not serve operations, the result is empty and not
 * loading.
 *
 * @param documentId - The document id, or null/undefined to skip fetching
 * @param scope - The operation scope, for example "global" or "local"
 * @param options - Page size and whether fetching is enabled
 */
export function useDocumentOperations(
  documentId: string | null | undefined,
  scope: string,
  options: UseDocumentOperationsOptions = {},
): DocumentOperationsResult {
  const { limit = DEFAULT_LIMIT, enabled = true } = options;
  const documentCache = useDocumentCache();
  const cache: IOperationCache | undefined =
    documentCache && isOperationCache(documentCache) ? documentCache : undefined;
  const activeId = enabled && cache && documentId ? documentId : undefined;

  const entry = useSyncExternalStore(
    (onChange) =>
      activeId && cache ? cache.subscribeOperations(activeId, onChange) : () => {},
    () =>
      activeId && cache
        ? cache.getOperationsState(activeId, scope)
        : IDLE_OPERATIONS_ENTRY,
  );

  useEffect(() => {
    if (activeId && cache && entry.status === "idle") {
      cache.loadOperations(activeId, scope, limit);
    }
  }, [activeId, cache, scope, limit, entry.status]);

  const fetchNextPage = useCallback(() => {
    if (activeId && cache) {
      cache.loadMoreOperations(activeId, scope);
    }
  }, [activeId, cache, scope]);

  const refetch = useCallback(() => {
    if (activeId && cache) {
      cache.invalidateOperations(activeId);
    }
  }, [activeId, cache]);

  return {
    operations: entry.operations,
    isLoading: entry.status === "pending",
    error: entry.status === "error" ? toError(entry.error) : undefined,
    hasNextPage: entry.hasNextPage,
    totalCount: entry.totalCount,
    fetchNextPage,
    refetch,
  };
}
```

- [ ] **Step 4: Update the GraphQL client entry exports**

In `packages/reactor-browser/src/graphql-client/entry.ts` replace lines 47-48:

```ts
export { useDocumentOperations } from "../hooks/document-operations.js";
export type {
  DocumentOperationsResult,
  UseDocumentOperationsOptions,
} from "../hooks/document-operations.js";
```

Also add, next to the existing `DocumentCache` export block from `../document-cache.js`, the names `IDLE_OPERATIONS_ENTRY` and `isOperationCache`, and add a type export line `export type { IOperationCache, OperationsCacheEntry } from "../types/documents.js";`.

- [ ] **Step 5: Run the hook tests**

Run from `packages/reactor-browser`: `pnpm vitest --run test/use-document-operations.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the whole package's checks**

Run from `packages/reactor-browser`: `pnpm tsc && pnpm lint && pnpm test`
Expected: all exit 0. `test/graphql-client/browser-entry.node.test.ts` in particular must still pass; it guards the entry's import graph.

- [ ] **Step 7: Commit**

```bash
git add packages/reactor-browser/src/hooks/document-operations.ts packages/reactor-browser/src/graphql-client/entry.ts packages/reactor-browser/test/use-document-operations.test.tsx
git commit -m "refactor(reactor-browser): read useDocumentOperations from the document cache, one scope at a time, paged"
```

---

### Task 3: `RevisionHistory` takes one scope and loads pages itself

**Files:**
- Modify: `packages/design-system/src/connect/components/revision-history/revision-history.tsx`
- Modify: `packages/design-system/src/connect/components/revision-history/timeline/timeline.tsx:9-17`
- Modify: `packages/design-system/src/connect/components/revision-history/header/header.tsx`
- Modify: `packages/design-system/src/connect/components/revision-history/header/scope.tsx`
- Modify: `packages/design-system/src/connect/components/revision-history/revision-history.stories.tsx`
- Modify: `packages/design-system/src/connect/components/revision-history/timeline/timeline.stories.tsx:16-20`
- Modify: `packages/design-system/src/connect/components/revision-history/header/header.stories.tsx:14-20`
- Modify: `packages/design-system/src/connect/components/revision-history/header/scope.stories.tsx`
- Create: `packages/design-system/src/connect/components/revision-history/revision-history.test.tsx`

**Interfaces:**
- Produces (used by Task 4):

```ts
type Props = {
  readonly documentTitle: string;
  readonly documentId: string;
  readonly operations: readonly Operation[];
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

- `Timeline` props become `{ readonly operations: readonly Operation[] }`.
- `Scope` props become `{ readonly scopes: readonly string[]; readonly value: string; readonly onChange: (value: string) => void }`.
- `Header` gains `readonly scopes: readonly string[]`.

- [ ] **Step 1: Write the failing component test**

Create `packages/design-system/src/connect/components/revision-history/revision-history.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { globalOperations } from "./mocks.js";
import { RevisionHistory } from "./revision-history.js";

const baseProps = {
  documentTitle: "Doc",
  documentId: "doc-1",
  scopes: ["global", "local"],
  scope: "global",
  onScopeChange: vi.fn(),
  onClose: vi.fn(),
};

describe("RevisionHistory", () => {
  it("asks for the next page when more exist and nothing is loading", () => {
    const onLoadNextPage = vi.fn();
    render(
      <RevisionHistory
        {...baseProps}
        operations={globalOperations.slice(0, 3)}
        isLoading={false}
        hasNextPage={true}
        onLoadNextPage={onLoadNextPage}
      />,
    );
    expect(onLoadNextPage).toHaveBeenCalledTimes(1);
  });

  it("does not ask for the next page while a page is loading", () => {
    const onLoadNextPage = vi.fn();
    render(
      <RevisionHistory
        {...baseProps}
        operations={globalOperations.slice(0, 3)}
        isLoading={true}
        hasNextPage={true}
        onLoadNextPage={onLoadNextPage}
      />,
    );
    expect(onLoadNextPage).not.toHaveBeenCalled();
    expect(screen.getByText("Loading more operations…")).toBeInTheDocument();
  });

  it("does not ask for the next page when there is none", () => {
    const onLoadNextPage = vi.fn();
    render(
      <RevisionHistory
        {...baseProps}
        operations={globalOperations.slice(0, 3)}
        isLoading={false}
        hasNextPage={false}
        onLoadNextPage={onLoadNextPage}
      />,
    );
    expect(onLoadNextPage).not.toHaveBeenCalled();
  });

  it("shows a loading message, not the empty message, while the first page loads", () => {
    render(
      <RevisionHistory
        {...baseProps}
        operations={[]}
        isLoading={true}
        hasNextPage={false}
        onLoadNextPage={vi.fn()}
      />,
    );
    expect(screen.getByText("Loading operations…")).toBeInTheDocument();
    expect(
      screen.queryByText("This document has no recorded operations yet."),
    ).not.toBeInTheDocument();
  });

  it("shows the empty message once loading finished with no operations", () => {
    render(
      <RevisionHistory
        {...baseProps}
        operations={[]}
        isLoading={false}
        hasNextPage={false}
        onLoadNextPage={vi.fn()}
      />,
    );
    expect(
      screen.getByText("This document has no recorded operations yet."),
    ).toBeInTheDocument();
  });

  it("lists the given scopes in the selector", () => {
    render(
      <RevisionHistory
        {...baseProps}
        scopes={["global", "audit"]}
        scope="audit"
        operations={[]}
        isLoading={false}
        hasNextPage={false}
        onLoadNextPage={vi.fn()}
      />,
    );
    expect(screen.getByText("Audit scope")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `packages/design-system`: `pnpm vitest run src/connect/components/revision-history/revision-history.test.tsx`
Expected: FAIL. Type errors on the unknown props `operations`, `isLoading`, `hasNextPage`, `onLoadNextPage`, `scopes`, `scope`, `onScopeChange`.

- [ ] **Step 3: Rewrite `Timeline` to take one operations list**

In `packages/design-system/src/connect/components/revision-history/timeline/timeline.tsx` replace lines 9-17 with:

```ts
export type TimelineProps = {
  readonly operations: readonly Operation[];
};

export function Timeline(props: TimelineProps) {
  const { operations } = props;
  const initialNumRowsToShow = 100;
  const allRows = useMemo(() => makeRows([...operations]), [operations]);
```

Delete the old `const operations = scope === "local" ? ...` line and the old `allRows` line that follows the destructuring. Everything below stays.

- [ ] **Step 4: Rewrite `Scope` to build items from a list**

Replace the whole content of `packages/design-system/src/connect/components/revision-history/header/scope.tsx`:

```tsx
import { ConnectSelect } from "../../select/select.js";

type Props = {
  readonly scopes: readonly string[];
  readonly value: string;
  readonly onChange: (value: string) => void;
};

function labelFor(scope: string) {
  return `${scope.charAt(0).toUpperCase()}${scope.slice(1)} scope`;
}

export function Scope(props: Props) {
  const { scopes, value, onChange } = props;
  const items = scopes.map((scope) => ({
    displayValue: labelFor(scope),
    value: scope,
  }));

  return (
    <ConnectSelect
      absolutePositionMenu
      containerClassName="z-10 w-fit rounded-lg bg-background text-xs text-muted-foreground"
      id="scope select"
      itemClassName="grid grid-cols-[auto,auto] gap-1 py-2 text-muted-foreground"
      items={items}
      menuClassName="min-w-0 text-muted-foreground"
      onChange={onChange}
      value={value}
    />
  );
}
```

- [ ] **Step 5: Pass `scopes` through `Header`**

In `packages/design-system/src/connect/components/revision-history/header/header.tsx`:

Add to the `Props` interface after `scope`:

```ts
  readonly scopes: readonly string[];
```

Add `scopes,` to the destructuring after `scope,`, and change the `Scope` element to:

```tsx
        <Scope onChange={onChangeScope} scopes={scopes} value={scope} />
```

- [ ] **Step 6: Rewrite `RevisionHistory`**

Replace the whole content of `packages/design-system/src/connect/components/revision-history/revision-history.tsx`:

```tsx
import { Pagination, usePagination } from "#design-system";
import type { Operation } from "@powerhousedao/shared/document-model";
import {
  garbageCollect,
  sortOperations,
} from "@powerhousedao/shared/document-model";
import { useEffect, useMemo } from "react";
import { ConnectTooltipProvider } from "../tooltip/tooltip.js";
import { Header } from "./header/header.js";
import { Timeline } from "./timeline/timeline.js";

type Props = {
  readonly documentTitle: string;
  readonly documentId: string;
  /** The operations of the selected scope loaded so far, in any order. */
  readonly operations: readonly Operation[];
  /** A page of operations is being fetched. */
  readonly isLoading: boolean;
  /** More operations exist beyond the loaded ones. */
  readonly hasNextPage: boolean;
  /** Called by the component whenever it can take the next page. */
  readonly onLoadNextPage: () => void;
  /** The scopes offered in the selector, for example the keys of `document.header.revision`. */
  readonly scopes: readonly string[];
  /** The selected scope. */
  readonly scope: string;
  readonly onScopeChange: (scope: string) => void;
  readonly onClose: () => void;
  readonly itemsPerPage?: number;
  readonly documentState?: object;
  readonly onCopyState?: () => void;
  readonly onCopyDocId?: () => void;
};

/**
 * The revision history panel. It renders the newest operation first while
 * the operations API pages oldest first, so it keeps asking for the next
 * page until none is left and renders what has arrived in the meantime.
 */
export function RevisionHistory(props: Props) {
  const {
    documentTitle,
    documentId,
    operations,
    isLoading,
    hasNextPage,
    onLoadNextPage,
    scopes,
    scope,
    onScopeChange,
    onClose,
    itemsPerPage = 100,
    documentState,
    onCopyState,
    onCopyDocId,
  } = props;

  useEffect(() => {
    if (hasNextPage && !isLoading) {
      onLoadNextPage();
    }
  }, [hasNextPage, isLoading, onLoadNextPage]);

  const visibleOperations = useMemo(
    () =>
      garbageCollect(sortOperations([...operations])).sort(
        (a, b) => b.index - a.index,
      ),
    [operations],
  );

  const {
    pageItems,
    pages,
    goToPage,
    goToNextPage,
    goToPreviousPage,
    goToFirstPage,
    goToLastPage,
    hiddenNextPages,
    isNextPageAvailable,
    isPreviousPageAvailable,
  } = usePagination(visibleOperations, {
    itemsPerPage,
  });

  function onChangeScope(nextScope: string) {
    goToFirstPage();
    onScopeChange(nextScope);
  }

  const showPagination = visibleOperations.length > itemsPerPage;

  const PaginationComponent = showPagination ? (
    <div className="mt-4 flex w-full justify-end">
      <Pagination
        firstPageLabel="First Page"
        goToFirstPage={goToFirstPage}
        goToLastPage={goToLastPage}
        goToNextPage={goToNextPage}
        goToPage={goToPage}
        goToPreviousPage={goToPreviousPage}
        hiddenNextPages={hiddenNextPages}
        isNextPageAvailable={isNextPageAvailable}
        isPreviousPageAvailable={isPreviousPageAvailable}
        lastPageLabel="Last Page"
        nextPageLabel="Next"
        pages={pages}
        previousPageLabel="Previous"
      />
    </div>
  ) : (
    <hr className="h-12 border-none" />
  );

  const hasOperations = visibleOperations.length > 0;

  return (
    <ConnectTooltipProvider>
      <div className="p-6">
        <Header
          docId={documentId}
          onChangeScope={onChangeScope}
          onClose={onClose}
          scope={scope}
          scopes={scopes}
          title={documentTitle}
          documentState={documentState}
          onCopyState={onCopyState}
          onCopyDocId={onCopyDocId}
        />
        {PaginationComponent}
        <div className="mt-4 flex flex-col items-center rounded-md bg-background p-4">
          {hasOperations ? (
            <div className="grid grid-cols-[minmax(min-content,1018px)]">
              <Timeline operations={pageItems} />
            </div>
          ) : isLoading ? (
            <h3 className="my-40 text-foreground">Loading operations…</h3>
          ) : (
            <h3 className="my-40 text-foreground">
              This document has no recorded operations yet.
            </h3>
          )}
          {hasOperations && isLoading && (
            <p className="mt-4 text-xs text-muted-foreground">
              Loading more operations…
            </p>
          )}
        </div>
        {PaginationComponent}
      </div>
    </ConnectTooltipProvider>
  );
}
```

- [ ] **Step 7: Update the stories**

`revision-history.stories.tsx`: in every story's `args`, replace the pair `globalOperations: X, localOperations: Y` with:

```ts
    operations: X,
    isLoading: false,
    hasNextPage: false,
    onLoadNextPage: () => {},
    scopes: ["global", "local"],
    scope: "global",
    onScopeChange: () => {},
```

where `X` is the former `globalOperations` value of that story. Then add two stories after `Default`:

```ts
export const LoadingFirstPage: Story = {
  args: {
    ...Default.args,
    operations: [],
    isLoading: true,
  },
};

export const LoadingMorePages: Story = {
  args: {
    ...Default.args,
    operations: operations.global.slice(0, 20),
    isLoading: true,
    hasNextPage: true,
  },
};
```

If the `localOperations` import becomes unused, remove it from the import statement.

`timeline/timeline.stories.tsx` lines 16-20: replace the args with `args: { operations: globalOperations }` and drop the now-unused `localOperations` import.

`header/header.stories.tsx`: add `scopes: ["global", "local"],` to the args after `scope: "global",`.

`header/scope.stories.tsx`: add `scopes: ["global", "local"],` to the args.

- [ ] **Step 8: Run the component test**

Run from `packages/design-system`: `pnpm vitest run src/connect/components/revision-history/revision-history.test.tsx`
Expected: PASS. If `Timeline` throws inside happy-dom because of `useVirtualizer`, the offending test is the "asks for the next page" one; in that case wrap the `Timeline` render in the test's expectations only, not the component, and report the failure rather than stubbing the virtualizer.

- [ ] **Step 9: Run the package checks**

Run from `packages/design-system`: `pnpm tsc && pnpm lint && pnpm test`
Expected: all exit 0.

- [ ] **Step 10: Commit**

```bash
git add packages/design-system/src/connect/components/revision-history
git commit -m "refactor(design-system): RevisionHistory takes one scope's operations and loads further pages itself"
```

---

### Task 4: Connect's `DocumentEditor` on the new hook and props

**Files:**
- Modify: `apps/connect/src/components/editors.tsx:70-92` and `:236-260` and `:270-280`

**Interfaces:**
- Consumes from Task 2: `useDocumentOperations(documentId, scope, { enabled })` returning `{ operations, isLoading, hasNextPage, fetchNextPage }`.
- Consumes from Task 3: the new `RevisionHistory` props.

- [ ] **Step 1: Replace the hook usage**

In `apps/connect/src/components/editors.tsx`, replace this block (currently lines 79-91):

```ts
  const {
    globalOperations,
    localOperations,
    isLoading: isLoadingOperations,
    refetch: refetchOperations,
  } = useDocumentOperations(documentId);

  // Refetch operations when revision history panel opens
  useEffect(() => {
    if (revisionHistoryVisible) {
      void refetchOperations();
    }
  }, [revisionHistoryVisible, refetchOperations]);
```

with:

```ts
  // The scopes a document carries operations for; every document has at
  // least "global".
  const scopes = useMemo(() => {
    const keys = Object.keys(document?.header.revision ?? {});
    return keys.length > 0 ? keys : ["global"];
  }, [document?.header.revision]);
  const [operationScope, setOperationScope] = useState(scopes[0]);
  const selectedScope = scopes.includes(operationScope)
    ? operationScope
    : scopes[0];

  // The history panel's operations: one scope, fetched only while the panel
  // is open. The panel asks for further pages itself.
  const {
    operations: historyOperations,
    isLoading: isLoadingHistory,
    hasNextPage: historyHasNextPage,
    fetchNextPage: fetchNextHistoryPage,
  } = useDocumentOperations(documentId, selectedScope, {
    enabled: revisionHistoryVisible,
  });

  // The timeline read-mode feature maps a selected date range to a global
  // revision, which needs the whole global history. Fetched only while a
  // timeline item is selected; shares the cache entry with the panel when
  // the panel is on "global".
  const {
    operations: globalOperations,
    hasNextPage: globalHasNextPage,
    isLoading: isLoadingGlobal,
    fetchNextPage: fetchNextGlobalPage,
  } = useDocumentOperations(documentId, "global", {
    enabled: !!selectedTimelineItem,
  });
  useEffect(() => {
    if (globalHasNextPage && !isLoadingGlobal) {
      fetchNextGlobalPage();
    }
  }, [globalHasNextPage, isLoadingGlobal, fetchNextGlobalPage]);
```

Add `useMemo` to the React import on line 23: `import { createElement, Suspense, useEffect, useMemo, useState } from "react";`.

- [ ] **Step 2: Replace the panel rendering**

Replace the block that starts with `{revisionHistoryVisible ? (` and ends before `) : (` followed by `<Suspense` (currently lines 238-259):

```tsx
      {revisionHistoryVisible ? (
        <RevisionHistory
          key={documentId}
          documentTitle={documentName ?? ""}
          documentId={documentId ?? ""}
          operations={historyOperations}
          isLoading={isLoadingHistory}
          hasNextPage={historyHasNextPage}
          onLoadNextPage={fetchNextHistoryPage}
          scopes={scopes}
          scope={selectedScope}
          onScopeChange={setOperationScope}
          onClose={() => setRevisionHistoryVisible(false)}
          documentState={document.state}
          onCopyState={() => {
            toast("Copied document state to clipboard", { type: "success" });
          }}
          onCopyDocId={() => {
            toast("Copied document ID to clipboard", { type: "success" });
          }}
        />
      ) : (
```

The `EditorLoader` with the message "Loading operations" is gone; the panel renders its own loading states. Keep the `EditorLoader` import because the editor's `Suspense` fallback still uses it.

The `getRevisionFromDate(selectedTimelineItem?.startDate, selectedTimelineItem?.endDate, globalOperations)` call further down keeps its name and now receives a `readonly Operation[]`. If `getRevisionFromDate`'s parameter type rejects a readonly array, change its signature in `packages/reactor-browser/src/utils/get-revision-from-date.ts` to `operations: readonly Operation[] = []`; it only calls `find`.

- [ ] **Step 3: Typecheck, lint and test Connect**

Run from `apps/connect`: `pnpm tsc && pnpm lint && pnpm test`
Expected: all exit 0. Connect resolves `@powerhousedao/reactor-browser` and the design-system through the workspace; if `tsc` still sees the old types, run `pnpm build` in `packages/reactor-browser` and `packages/design-system` first and retry.

- [ ] **Step 4: Commit**

```bash
git add apps/connect/src/components/editors.tsx packages/reactor-browser/src/utils/get-revision-from-date.ts
git commit -m "refactor(connect): fetch revision history one scope at a time, only while the panel is open"
```

---

### Task 5: test-fusion demo on the new hook

**Files:**
- Modify: `test/test-fusion/src/components/todo-demo.tsx:118-126` and `:23-25`

**Interfaces:**
- Consumes from Task 2: `useDocumentOperations(documentId, "global")` returning `{ operations }`.

- [ ] **Step 1: Replace the hook usage**

Replace this block (currently lines 118-126):

```ts
  // The operation log through the same client the document came from - the
  // primitive a fusion app derives a history view from. Refetching keyed on
  // the document's last-modified stamp keeps it in step with every update the
  // cache sees, including ones pushed over the realtime subscription.
  const { globalOperations, refetch } = useDocumentOperations(documentId);
  const lastModified = document?.header.lastModifiedAtUtcIso;
  useEffect(() => {
    if (lastModified) refetch();
  }, [lastModified, refetch]);
```

with:

```ts
  // The operation log through the same client the document came from - the
  // primitive a fusion app derives a history view from. The document cache
  // drops it on every document change event, including ones pushed over the
  // realtime subscription, so no manual refetch is needed.
  const { operations: globalOperations } = useDocumentOperations(
    documentId,
    "global",
  );
```

The `data-testid="operations-count"` element keeps rendering `{globalOperations.length} operations`, so the e2e assertion in `test/test-fusion/e2e/document-models.spec.ts` is unchanged.

If `useEffect` is now unused in this file, remove it from the React import.

- [ ] **Step 2: Lint the app and typecheck it**

Run from `test/test-fusion`: `pnpm lint && pnpm exec tsc --noEmit`
Expected: both exit 0. The app has no `tsc` script; `tsc --noEmit` uses its `tsconfig.json`. If `tsc` still sees the old hook types, run `pnpm build` in `packages/reactor-browser` and retry.

- [ ] **Step 3: Commit**

```bash
git add test/test-fusion/src/components/todo-demo.tsx
git commit -m "refactor(test-fusion): todo demo reads global operations from the cache-backed hook"
```

---

### Task 6: Whole-branch verification

**Files:** none modified unless a check fails.

- [ ] **Step 1: Confirm the retry loop is gone**

Run from the repo root: `grep -rn "MAX_RETRIES\|RETRY_DELAY_MS" packages/reactor-browser/src`
Expected: no output.

- [ ] **Step 2: Confirm no consumer of the old API remains**

Run from the repo root: `grep -rn "globalOperations\|localOperations\|DocumentOperationsState" --include='*.ts' --include='*.tsx' apps packages test | grep -v node_modules | grep -v /dist/ | grep -v .tsbuild`
Expected: only `apps/connect/src/components/editors.tsx` (the local `globalOperations` variable for the timeline feature), `test/test-fusion/src/components/todo-demo.tsx` (the local alias), and the revision-history `mocks.ts` and stories in design-system that export mock data under those names.

- [ ] **Step 3: Build and check every touched package the way CI does**

Run from the repo root:

```bash
pnpm --filter @powerhousedao/reactor-browser build
pnpm --filter @powerhousedao/design-system build
pnpm --filter @powerhousedao/reactor-browser tsc
pnpm --filter @powerhousedao/reactor-browser lint
pnpm --filter @powerhousedao/reactor-browser test
pnpm --filter @powerhousedao/design-system tsc
pnpm --filter @powerhousedao/design-system lint
pnpm --filter @powerhousedao/design-system test
pnpm --filter @powerhousedao/connect tsc
pnpm --filter @powerhousedao/connect lint
pnpm --filter @powerhousedao/connect test
```

Expected: every command exits 0. Check the actual package names in each `package.json` `name` field before running and adjust the filters if they differ.

- [ ] **Step 4: Record the results**

Note each command and its exit code in the final report. Do not claim success for a command that was not run.
