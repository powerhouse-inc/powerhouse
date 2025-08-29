import type {
  BaseDocument,
  CountDocument,
  CountLocalState,
  CountState,
} from "document-model";
import {
  baseCountReducer,
  countReducer,
  createCountState,
  createReducer,
  increment,
  noop,
  replayDocument,
} from "document-model";
describe("DocumentModel Class", () => {
  const initialState = createCountState();
  const initialDocument: BaseDocument<CountState, CountLocalState> = {
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
    history: {},
    state: createCountState(),
    attachments: {},
    initialState,
    operations: { global: [], local: [] },
    clipboard: [],
  };

  it("should call reducer once per operation", () => {
    const mockReducer = vi.fn(baseCountReducer);
    const reducer = createReducer<CountDocument>(mockReducer);

    let newDocument = reducer(initialDocument, increment());
    newDocument = reducer(newDocument, increment());
    newDocument = reducer(newDocument, increment());
    newDocument = reducer(newDocument, noop(), undefined, { skip: 1 });
    expect(mockReducer).toHaveBeenCalledTimes(6);
    expect(newDocument.state.global.count).toBe(2);
  });

  it("should reuse past operation state if available when skipping", () => {
    const mockReducer = vi.fn(baseCountReducer);
    const reducer = createReducer<CountDocument>(mockReducer);

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
    const reducer = createReducer<CountDocument>(mockReducer);

    let newDocument = reducer(initialDocument, increment(), undefined, {
      reuseOperationResultingState: true,
    });
    newDocument = reducer(newDocument, increment());

    // path resulting state so it is reused
    const lastOperation = newDocument.operations.global.at(-1);
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
    );
    expect(initialDocument.state).toStrictEqual(document.state);
  });

  it("should replay document with operations", () => {
    const mockReducer = vi.fn(baseCountReducer);
    const reducer = createReducer<CountDocument>(mockReducer);
    let newDocument = reducer(initialDocument, increment());
    newDocument = reducer(newDocument, increment());
    expect(mockReducer).toHaveBeenCalledTimes(2);
    const document = replayDocument(
      initialState,
      newDocument.operations,
      reducer,
    );
    expect(newDocument.state.global.count).toBe(2);
    expect(newDocument.state).toStrictEqual(document.state);
    expect(mockReducer).toHaveBeenCalledTimes(4);
  });

  it("should replay document with undone operations", () => {
    const mockReducer = vi.fn(baseCountReducer);
    const reducer = createReducer<CountDocument>(mockReducer);

    let newDocument = reducer(initialDocument, increment());
    newDocument = reducer(newDocument, increment());
    newDocument = reducer(newDocument, noop(), undefined, { skip: 1 });
    expect(mockReducer).toHaveBeenCalledTimes(4);

    const document = replayDocument(
      initialState,
      newDocument.operations,
      reducer,
    );

    expect(mockReducer).toHaveBeenCalledTimes(6);

    expect(newDocument.state.global.count).toBe(1);
    expect(newDocument.state).toStrictEqual(document.state);
  });

  it("should reuse resulting state when replaying document with undone operations", () => {
    const mockReducer = vi.fn(baseCountReducer);
    const reducer = createReducer<CountDocument>(mockReducer);

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
      undefined,
      undefined,
      undefined,
      { reuseOperationResultingState: true },
    );

    expect(mockReducer).toHaveBeenCalledTimes(3);
    expect(document.state.global.count).toBe(1);
    expect(newDocument.state).toStrictEqual(document.state);
  });
});
