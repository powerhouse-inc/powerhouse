import type { IReactorClient } from "@powerhousedao/reactor";
import type {
  DocumentOperations,
  Operation,
  PHBaseState,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  baseCreateDocument,
  baseLoadFromInput,
  createAction,
  createReducer,
  createZip,
  defaultBaseState,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import { fetchDocumentOperations } from "../src/actions/document.js";

function createFakeOperation(index: number, scope = "global"): Operation {
  return {
    id: `op-${scope}-${index}`,
    index,
    skip: 0,
    hash: `hash-${index}`,
    timestampUtcMs: new Date().toISOString(),
    action: {
      id: `action-${scope}-${index}`,
      type: "INCREMENT",
      input: {},
      scope,
      timestampUtcMs: new Date().toISOString(),
    },
  } as Operation;
}

function createFakeDocument(
  scopes: string[] = ["global", "local"],
): PHDocument {
  const state: Record<string, unknown> = {
    auth: {},
    document: {},
  };
  for (const scope of scopes) {
    state[scope] = {};
  }
  return {
    header: {
      id: "doc-1",
      documentType: "test/counter",
      name: "Test Document",
      sig: { publicKey: {}, nonce: "" },
      createdAtUtcIso: new Date().toISOString(),
      lastModifiedAtUtcIso: new Date().toISOString(),
      slug: "test-document",
      branch: "main",
      revision: {},
    },
    state,
    initialState: state,
    operations: {},
    clipboard: [],
  } as unknown as PHDocument;
}

const COMPOSITE_PREFIX = "c:";

function encodeCompositeCursor(scopeCursors: Record<string, string>): string {
  return COMPOSITE_PREFIX + JSON.stringify(scopeCursors);
}

function decodeCompositeCursor(cursor: string): Record<string, string> {
  return JSON.parse(cursor.slice(COMPOSITE_PREFIX.length)) as Record<
    string,
    string
  >;
}

function createMockReactorClient(
  operationsByScope: Record<string, Operation[]>,
  pageSize = 100,
): Pick<IReactorClient, "getOperations"> {
  return {
    getOperations: vi
      .fn()
      .mockImplementation(
        (
          _docId: string,
          view?: { scopes?: string[] },
          _filter?: unknown,
          paging?: { cursor: string; limit: number },
        ) => {
          const scopes = view?.scopes ?? ["global"];
          const limit = paging?.limit ?? pageSize;

          const scopeCursors: Record<string, string> =
            paging?.cursor && paging.cursor.startsWith(COMPOSITE_PREFIX)
              ? decodeCompositeCursor(paging.cursor)
              : Object.fromEntries(
                  scopes.map((s) => [s, paging?.cursor ?? ""]),
                );

          const results: Operation[] = [];
          const activeCursors: Record<string, string> = {};

          for (const scope of scopes) {
            const allOps = operationsByScope[scope] ?? [];
            const cursorIndex = scopeCursors[scope]
              ? parseInt(scopeCursors[scope], 10)
              : 0;
            const scopeResults = allOps.slice(cursorIndex, cursorIndex + limit);
            results.push(...scopeResults);

            const nextIndex = cursorIndex + limit;
            if (nextIndex < allOps.length) {
              activeCursors[scope] = String(nextIndex);
            }
          }

          results.sort((a, b) => a.index - b.index);

          const nextCursor =
            Object.keys(activeCursors).length > 0
              ? encodeCompositeCursor(activeCursors)
              : undefined;

          return {
            results,
            options: { cursor: paging?.cursor ?? "", limit },
            nextCursor,
          };
        },
      ),
  };
}

describe("fetchDocumentOperations", () => {
  it("fetches all operations in a single page", async () => {
    const ops = Array.from({ length: 3 }, (_, i) => createFakeOperation(i));
    const client = createMockReactorClient({ global: ops, local: [] });
    const doc = createFakeDocument();

    const result = await fetchDocumentOperations(
      client as unknown as IReactorClient,
      doc,
    );

    expect(result.global).toHaveLength(3);
    expect(result.local).toHaveLength(0);
    expect(client.getOperations).toHaveBeenCalledTimes(1);
  });

  it("paginates across multiple pages", async () => {
    const ops = Array.from({ length: 7 }, (_, i) => createFakeOperation(i));
    const client = createMockReactorClient({ global: ops, local: [] });
    const doc = createFakeDocument();

    const result = await fetchDocumentOperations(
      client as unknown as IReactorClient,
      doc,
      3,
    );

    expect(result.global).toHaveLength(7);
    // 3 pages: (3+3+1), all scopes fetched together
    expect(client.getOperations).toHaveBeenCalledTimes(3);
  });

  it("fetches operations for multiple scopes independently", async () => {
    const globalOps = Array.from({ length: 5 }, (_, i) =>
      createFakeOperation(i, "global"),
    );
    const localOps = Array.from({ length: 2 }, (_, i) =>
      createFakeOperation(i, "local"),
    );
    const client = createMockReactorClient({
      global: globalOps,
      local: localOps,
    });
    const doc = createFakeDocument();

    const result = await fetchDocumentOperations(
      client as unknown as IReactorClient,
      doc,
    );

    expect(result.global).toHaveLength(5);
    expect(result.local).toHaveLength(2);
  });

  it("handles scopes with no operations", async () => {
    const client = createMockReactorClient({ global: [], local: [] });
    const doc = createFakeDocument();

    const result = await fetchDocumentOperations(
      client as unknown as IReactorClient,
      doc,
    );

    expect(result.global).toHaveLength(0);
    expect(result.local).toHaveLength(0);
  });

  it("derives scopes from document state keys, excluding base state keys", async () => {
    const customOps = Array.from({ length: 2 }, (_, i) =>
      createFakeOperation(i, "custom"),
    );
    const client = createMockReactorClient({
      global: [],
      local: [],
      custom: customOps,
    });
    const doc = createFakeDocument(["global", "local", "custom"]);

    const result = await fetchDocumentOperations(
      client as unknown as IReactorClient,
      doc,
    );

    expect(result.custom).toHaveLength(2);
    expect(result).not.toHaveProperty("auth");
    expect(result).not.toHaveProperty("document");
  });
});

// Minimal counter document model for pipeline tests
type CountState = PHBaseState & {
  global: { count: number };
  local: { name: string };
};

const countReducer = createReducer<CountState>((state, action) => {
  switch (action.type) {
    case "INCREMENT":
      return {
        ...state,
        global: { ...state.global, count: state.global.count + 1 },
      };
    case "SET_NAME":
      return {
        ...state,
        local: {
          ...state.local,
          name: (action.input as { name: string }).name,
        },
      };
    default:
      return state;
  }
});

function createCountDocument() {
  const initialState: CountState = {
    ...defaultBaseState(),
    global: { count: 0 },
    local: { name: "" },
  };
  return baseCreateDocument<CountState>(() => initialState, initialState);
}

describe("export pipeline: fetchDocumentOperations -> createZip -> baseLoadFromInput", () => {
  it("exported document preserves operations and state through full pipeline", async () => {
    // Build a real document with real operations via the count reducer
    let realDoc = createCountDocument();
    realDoc = countReducer(
      realDoc,
      createAction("INCREMENT", {}, undefined, undefined, "global"),
    );
    realDoc = countReducer(
      realDoc,
      createAction("INCREMENT", {}, undefined, undefined, "global"),
    );
    realDoc = countReducer(
      realDoc,
      createAction("INCREMENT", {}, undefined, undefined, "global"),
    );
    expect(realDoc.state.global.count).toBe(3);
    expect(realDoc.operations.global).toHaveLength(3);

    // Simulate reactorClient.get() — returns document with state but operations: {}
    const reactorDoc = { ...realDoc, operations: {} as DocumentOperations };

    // The real operations live in the reactor's operation store (mock client)
    const client = createMockReactorClient({
      global: realDoc.operations.global!,
      local: realDoc.operations.local!,
    });

    // Step 1: fetchDocumentOperations (the fix) — fetches ops via paged API
    const operations = await fetchDocumentOperations(
      client as unknown as IReactorClient,
      reactorDoc,
    );

    // Step 2: enrich document with fetched operations (as exportFile does)
    const documentWithOps = { ...reactorDoc, operations };

    // Step 3: createZip (real production code)
    const zip = createZip(documentWithOps);
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    // Step 4: baseLoadFromInput (real production code) — reimport the zip
    const imported = await baseLoadFromInput(buffer, countReducer);

    // The full pipeline preserves operations and state
    expect(imported.state.global.count).toBe(3);
    expect(imported.operations.global).toHaveLength(3);
    expect(imported.operations.global![0].action.type).toBe("INCREMENT");
  });

  it("paged fetch with small page size produces valid export", async () => {
    // Create a document with 5 operations to force multiple pages
    let realDoc = createCountDocument();
    for (let i = 0; i < 5; i++) {
      realDoc = countReducer(
        realDoc,
        createAction("INCREMENT", {}, undefined, undefined, "global"),
      );
    }
    expect(realDoc.state.global.count).toBe(5);

    const reactorDoc = { ...realDoc, operations: {} as DocumentOperations };

    // Page size of 2 forces 3 pages (2+2+1)
    const client = createMockReactorClient(
      { global: realDoc.operations.global!, local: realDoc.operations.local! },
      2,
    );

    const operations = await fetchDocumentOperations(
      client as unknown as IReactorClient,
      reactorDoc,
      2,
    );
    const documentWithOps = { ...reactorDoc, operations };

    const zip = createZip(documentWithOps);
    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    const imported = await baseLoadFromInput(buffer, countReducer);

    expect(imported.state.global.count).toBe(5);
    expect(imported.operations.global).toHaveLength(5);
  });
});
