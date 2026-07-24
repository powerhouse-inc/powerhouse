import type {
  PHAuthState,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  backfillAuthState,
  createReducer,
  defaultAuthState,
  HashMismatchError,
  noop,
  replayDocument,
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
