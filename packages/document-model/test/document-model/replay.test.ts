import { noop } from "../../src/document/actions/creators.js";
import type { BaseDocument } from "../../src/document/types.js";
import {
  createReducer,
  replayDocument,
} from "../../src/document/utils/base.js";
import {
  type CountAction,
  type CountDocument,
  type CountLocalState,
  type CountState,
  baseCountReducer,
  countReducer,
  increment,
} from "../helpers.js";
describe("DocumentModel Class", () => {
  const initialState = {
    id: "",
    name: "",
    slug: "",
    revision: {
      global: 0,
      local: 0,
    },
    documentType: "",
    created: "",
    lastModified: "",
    meta: {},
    state: {
      global: {
        count: 0,
      },
      local: {
        name: "",
      },
    },
    attachments: {},
  };
  const initialDocument: BaseDocument<
    CountState,
    CountLocalState,
    CountAction
  > = {
    id: "",
    name: "",
    slug: "",
    revision: {
      global: 0,
      local: 0,
    },
    documentType: "",
    created: "",
    lastModified: "",
    meta: {},
    state: {
      global: {
        count: 0,
      },
      local: {
        name: "",
      },
    },
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
    expect(initialDocument).toStrictEqual(document);
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
    expect(newDocument).toStrictEqual(document);
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
    expect(newDocument).toStrictEqual(document);
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
    expect(newDocument).toStrictEqual(document);
  });
});
