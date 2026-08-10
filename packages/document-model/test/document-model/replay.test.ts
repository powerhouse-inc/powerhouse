import type {
  Operation,
  PHAuthState,
  PHDocument,
  PHDocumentState,
} from "@powerhousedao/shared/document-model";
import {
  backfillAuthState,
  backfillDocumentState,
  createReducer,
  defaultAuthState,
  defaultDocumentState,
  HashMismatchError,
  noop,
  replayDocument,
  replayDocumentVersioned,
} from "@powerhousedao/shared/document-model";
import type { CountPHState } from "../helpers.js";
import {
  baseCountReducer,
  countReducer,
  createCountState,
  increment,
} from "../helpers.js";

describe("DocumentModel Replay", () => {
  const initialState = createCountState();
  const initialDocument: PHDocument<CountPHState> = {
    header: {
      // Protocol 1 undo semantics; v2 has its own coverage.
      protocolVersions: { "base-reducer": 1 },
      id: "",
      sig: { publicKey: {}, nonce: "" },
      documentType: "",
      createdAtUtcIso: "",
      slug: "",
      name: "",
      branch: "",
      revision: {
        global: 0,
        local: 0,
      },
      lastModifiedAtUtcIso: "",
      meta: {},
    },
    state: createCountState(),
    initialState,
    operations: { global: [], local: [] },
    clipboard: [],
  };

  it("should call reducer once per operation", () => {
    const mockReducer = vi.fn(baseCountReducer);
    const reducer = createReducer<CountPHState>(mockReducer);

    let newDocument = reducer(initialDocument, increment());
    newDocument = reducer(newDocument, increment());
    newDocument = reducer(newDocument, increment());
    newDocument = reducer(newDocument, noop(), undefined, { skip: 1 });
    expect(mockReducer).toHaveBeenCalledTimes(6);
    expect(newDocument.state.global.count).toBe(2);
  });

  it("should reuse past operation state if available when skipping", () => {
    const mockReducer = vi.fn(baseCountReducer);
    const reducer = createReducer<CountPHState>(mockReducer);

    let newDocument = reducer(initialDocument, increment(), undefined, {
      reuseOperationResultingState: true,
    });
    newDocument = reducer(newDocument, increment(), undefined, {
      reuseOperationResultingState: true,
    });
    newDocument = reducer(newDocument, increment(), undefined, {
      reuseOperationResultingState: true,
    });
    newDocument = reducer(newDocument, noop(), undefined, {
      skip: 1,
      reuseOperationResultingState: true,
    });
    expect(mockReducer).toHaveBeenCalledTimes(4);
    expect(newDocument.state.global.count).toBe(2);
  });

  it("should look for the latest resulting state when replaying the document", () => {
    const mockReducer = vi.fn(baseCountReducer);
    const reducer = createReducer<CountPHState>(mockReducer);

    let newDocument = reducer(initialDocument, increment(), undefined, {
      reuseOperationResultingState: true,
    });
    newDocument = reducer(newDocument, increment());

    // path resulting state so it is reused
    const lastOperation = newDocument.operations.global!.at(-1);
    if (lastOperation) {
      lastOperation.resultingState = JSON.stringify(newDocument.state.global);
    }

    newDocument = reducer(newDocument, increment());
    newDocument = reducer(newDocument, noop(), undefined, {
      skip: 1,
      reuseOperationResultingState: true,
    });

    expect(mockReducer).toHaveBeenCalledTimes(4);
    expect(newDocument.state.global.count).toBe(2);
  });

  it("should replay document", () => {
    const document = replayDocument(
      initialState,
      { global: [], local: [] },
      countReducer,
      initialDocument.header,
    );
    expect(initialDocument.state).toStrictEqual(document.state);
  });

  it("should replay document with operations", () => {
    const mockReducer = vi.fn(baseCountReducer);
    const reducer = createReducer<CountPHState>(mockReducer);
    let newDocument = reducer(initialDocument, increment());
    newDocument = reducer(newDocument, increment());
    expect(mockReducer).toHaveBeenCalledTimes(2);
    const document = replayDocument(
      initialState,
      newDocument.operations,
      reducer,
      newDocument.header,
    );
    expect(newDocument.state.global.count).toBe(2);
    expect(newDocument.state).toStrictEqual(document.state);
    expect(mockReducer).toHaveBeenCalledTimes(4);
  });

  it("should replay document with undone operations", () => {
    const mockReducer = vi.fn(baseCountReducer);
    const reducer = createReducer<CountPHState>(mockReducer);

    let newDocument = reducer(initialDocument, increment());
    newDocument = reducer(newDocument, increment());
    newDocument = reducer(newDocument, noop(), undefined, { skip: 1 });
    expect(mockReducer).toHaveBeenCalledTimes(4);

    const document = replayDocument(
      initialState,
      newDocument.operations,
      reducer,
      newDocument.header,
    );

    expect(mockReducer).toHaveBeenCalledTimes(6);

    expect(newDocument.state.global.count).toBe(1);
    expect(newDocument.state).toStrictEqual(document.state);
  });

  it("should reuse resulting state when replaying document with undone operations", () => {
    const mockReducer = vi.fn(baseCountReducer);
    const reducer = createReducer<CountPHState>(mockReducer);

    let newDocument = reducer(initialDocument, increment(), undefined, {
      reuseOperationResultingState: true,
    });
    newDocument = reducer(newDocument, increment(), undefined, {
      reuseOperationResultingState: true,
    });
    newDocument = reducer(newDocument, noop(), undefined, {
      skip: 1,
      reuseOperationResultingState: true,
    });
    expect(mockReducer).toHaveBeenCalledTimes(3);
    expect(newDocument.state.global.count).toBe(1);

    const document = replayDocument(
      initialState,
      newDocument.operations,
      reducer,
      newDocument.header,
      undefined,
      undefined,
      { reuseOperationResultingState: true },
    );

    expect(mockReducer).toHaveBeenCalledTimes(3);
    expect(document.state.global.count).toBe(1);
    expect(newDocument.state).toStrictEqual(document.state);
  });

  it("should throw HashMismatchError when replaying document with invalid operations", () => {
    const mockReducer = vi.fn(baseCountReducer);
    const reducer = createReducer<CountPHState>(mockReducer);
    let newDocument = reducer(initialDocument, increment());
    newDocument = reducer(newDocument, increment());
    newDocument.operations.global.at(-1)!.hash = "invalid";

    expect.assertions(1);
    try {
      replayDocument(
        initialState,
        newDocument.operations,
        reducer,
        newDocument.header,
        undefined,
        undefined,
        {
          checkHashes: false,
        },
      );
    } catch (e) {
      expect(e).toBeInstanceOf(HashMismatchError);
    }
  });

  it("backfills a legacy empty auth scope on replay and still verifies hashes", () => {
    let newDocument = countReducer(initialDocument, increment());
    newDocument = countReducer(newDocument, increment());

    const legacyInitialState = {
      ...createCountState(),
      auth: {} as unknown as PHAuthState,
    } as CountPHState;

    const replayed = replayDocument(
      legacyInitialState,
      newDocument.operations,
      countReducer,
      newDocument.header,
      undefined,
      undefined,
      { checkHashes: false },
    );

    expect(replayed.state.auth).toStrictEqual({ version: 0, grants: [] });
    expect(replayed.initialState.auth).toStrictEqual({
      version: 0,
      grants: [],
    });
    expect(replayed.state.global.count).toBe(2);
  });

  /**
   * A client replay that applied a denied operation would hold different state
   * from the reactor that served it. The denied operation carries the hash of the
   * state that still stands, so the trailing verification still lines up.
   */
  it("does not apply a denied operation, and still verifies hashes", () => {
    let newDocument = countReducer(initialDocument, increment());
    newDocument = countReducer(newDocument, increment());

    const [first, second] = newDocument.operations.global;

    // Hashed over the state `first` left behind.
    const denied = {
      ...first,
      id: "op-denied",
      index: 1,
      action: { ...first.action, id: "a-denied" },
      hash: first.hash,
      deniedReason: "no grant permits this operation",
    };

    const replayed = replayDocument(
      createCountState(),
      {
        ...newDocument.operations,
        global: [first, denied, { ...second, index: 2 }],
      },
      countReducer,
      newDocument.header,
      undefined,
      undefined,
      { checkHashes: false },
    );

    expect(replayed.state.global.count).toBe(2);

    expect(replayed.operations.global).toHaveLength(3);
    expect(replayed.operations.global[1].deniedReason).toBe(
      "no grant permits this operation",
    );
  });

  it("records a denied operation in a versioned replay without applying it", () => {
    const seed = createCountState();
    const header = {
      ...initialDocument.header,
      revision: { global: 0, local: 0, document: 0 },
    };

    let doc = countReducer(
      {
        header,
        state: seed,
        initialState: seed,
        operations: { global: [], local: [] },
        clipboard: [],
      } as never,
      increment(),
    );
    doc = countReducer(doc, increment());
    const [first, second] = doc.operations.global;

    const denied = {
      ...first,
      id: "op-denied",
      index: 1,
      action: { ...first.action, id: "a-denied" },
      hash: first.hash,
      deniedReason: "no grant permits this operation",
    } as Operation;

    // A fromVersion:0 upgrade in the spine is what selects the versioned path
    // rather than the legacy fallback.
    const documentOps = [
      {
        id: "op-create",
        index: 0,
        skip: 0,
        hash: "",
        timestampUtcMs: "2026-01-01T00:00:00.000Z",
        action: {
          id: "a-create",
          type: "CREATE_DOCUMENT",
          scope: "document",
          timestampUtcMs: "2026-01-01T00:00:00.000Z",
          input: { model: "count" },
        },
      },
      {
        id: "op-upgrade",
        index: 1,
        skip: 0,
        hash: "",
        timestampUtcMs: "2026-01-01T00:00:00.000Z",
        action: {
          id: "a-upgrade",
          type: "UPGRADE_DOCUMENT",
          scope: "document",
          timestampUtcMs: "2026-01-01T00:00:00.000Z",
          input: { fromVersion: 0, toVersion: 1, initialState: seed },
        },
      },
    ] as unknown as Operation[];

    const result = replayDocumentVersioned(
      seed,
      {
        document: documentOps,
        global: [first, denied, { ...second, index: 2 }],
        local: [],
      },
      { reducers: { 1: countReducer as never } },
      header,
      undefined,
      { checkHashes: false },
    );

    // Two increments applied, not three, and the refusal still holds its index.
    expect(result.state.global.count).toBe(2);
    expect(result.operations.global).toHaveLength(3);
    expect(result.operations.global[1].deniedReason).toBe(
      "no grant permits this operation",
    );
    // Index validation did not fire, which is what the append is for.
    expect(result.operations.global.map((o) => o.index)).toEqual([0, 1, 2]);
  });
});

describe("PHAuthState default and backfill", () => {
  it("defaults to the uninitialized (open) policy", () => {
    expect(defaultAuthState()).toStrictEqual({ version: 0, grants: [] });
  });

  it("backfills a legacy empty auth scope to the default", () => {
    const legacy = {
      ...createCountState(),
      auth: {} as unknown as PHAuthState,
    } as CountPHState;
    expect(backfillAuthState(legacy).auth).toStrictEqual({
      version: 0,
      grants: [],
    });
  });

  it("preserves an already-initialized policy", () => {
    const policy: PHAuthState = {
      version: 1,
      grants: [
        {
          id: "g-read",
          description: "anyone reads global",
          effect: "allow",
          principal: { anyone: true },
          capability: { can: "read", scope: "global" },
        },
      ],
    };
    const state = { ...createCountState(), auth: policy } as CountPHState;
    expect(backfillAuthState(state).auth).toStrictEqual(policy);
  });
});

describe("PHDocumentState backfill", () => {
  it("backfills a document scope missing from a legacy snapshot", () => {
    const legacy = { ...createCountState() } as CountPHState;
    delete (legacy as unknown as { document?: PHDocumentState }).document;

    expect(backfillDocumentState(legacy).document).toStrictEqual(
      defaultDocumentState(),
    );
  });

  it("preserves an existing document scope", () => {
    const state = createCountState() as CountPHState;
    state.document = {
      ...state.document,
      version: 3,
      isDeleted: true,
    };

    expect(backfillDocumentState(state).document).toStrictEqual(state.document);
  });
});
