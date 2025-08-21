import { beforeAll, describe, expect, it, vi } from "vitest";
import { generateId } from "../../index.js";
import { setName } from "../../src/document/actions/creators.js";
import { SET_NAME } from "../../src/document/actions/types.js";
import { type CreateChildDocumentInput } from "../../src/document/signal.js";
import { type Action } from "../../src/document/types.js";
import {
  baseCreateDocument,
  createAction,
  createReducer,
} from "../../src/document/utils/base.js";
import {
  type CountDocument,
  countReducer,
  createBaseState,
  createCountDocumentState,
  defaultPHDocumentCreateState,
  error,
  fakeAction,
  increment,
  wrappedEmptyReducer,
} from "../helpers.js";

describe("Base reducer", () => {
  beforeAll(() => {
    vi.useFakeTimers().setSystemTime(new Date("2020-01-01"));
  });

  it("should update revision", async () => {
    const document = baseCreateDocument(defaultPHDocumentCreateState);
    const newDocument = wrappedEmptyReducer(
      document,
      fakeAction({
        type: "TEST",
        input: {},
        scope: "global",
      }),
    );
    expect(newDocument.header.revision.global).toBe(1);
  });

  it("should update lastModified", async () => {
    vi.useFakeTimers();
    const document = baseCreateDocument(defaultPHDocumentCreateState);
    await new Promise((r) => {
      setTimeout(r, 100);
      vi.runOnlyPendingTimers();
    });
    const newDocument = wrappedEmptyReducer(
      document,
      fakeAction({
        type: "TEST",
        input: {},
        scope: "global",
      }),
    );
    expect(
      newDocument.header.lastModifiedAtUtcIso >
        document.header.lastModifiedAtUtcIso,
    ).toBe(true);
    vi.useRealTimers();
  });

  it("should update global operations list", async () => {
    vi.useFakeTimers({ now: new Date("2023-01-01") });
    const document = baseCreateDocument(defaultPHDocumentCreateState);
    const newDocument = wrappedEmptyReducer(
      document,
      fakeAction({
        type: "TEST",
        input: {},
        scope: "global",
      }),
    );

    expect(newDocument.operations.global).toMatchObject([
      {
        type: "TEST",
        timestampUtcMs: new Date().toISOString(),
        index: 0,
        skip: 0,
        input: {},
        hash: "vyGp6PvFo4RvsFtPoIWeCReyIC8=",
        scope: "global",
        error: undefined,
      },
    ]);
    expect(newDocument.operations.local).toStrictEqual([]);
  });

  it("should throw error when creating action with non-string type", () => {
    expect(() => createAction(1 as never)).toThrow();
  });

  it("should throw error when creating action with empty type", () => {
    expect(() => createAction("")).toThrow();
  });

  it("should create SET_NAME action", () => {
    const setNameAction = setName("Document");
    expect(setNameAction).toStrictEqual({
      id: setNameAction.id,
      timestampUtcMs: setNameAction.timestampUtcMs,
      type: SET_NAME,
      input: "Document",
      scope: "global",
    });
  });

  it("should throw error creating invalid SET_NAME action", () => {
    expect(() => setName(1 as unknown as string)).toThrow();
  });

  it("should set document name", async () => {
    const document = baseCreateDocument(defaultPHDocumentCreateState);
    const newDocument = wrappedEmptyReducer(document, setName("Document"));
    expect(newDocument.header.name).toBe("Document");
  });

  it("should throw error on invalid base action", async () => {
    const document = baseCreateDocument(defaultPHDocumentCreateState);
    expect(() =>
      wrappedEmptyReducer(
        document,
        fakeAction({
          type: "SET_NAME",
          input: 0 as unknown as string,
          scope: "global",
        }),
      ),
    ).toThrow();
  });

  it("should dispatch trigger action", async () => {
    expect.assertions(3);
    const document = baseCreateDocument(defaultPHDocumentCreateState);

    const id = generateId();
    const reducer = createReducer((_state, action, dispatch) => {
      if (action.type === "CREATE_DOCUMENT") {
        dispatch?.({
          type: "CREATE_CHILD_DOCUMENT",
          input: {
            id,
            documentType: "test",
          },
        });
      }

      return _state;
    });

    const triggerAction: Action = fakeAction({
      type: "CREATE_DOCUMENT",
      input: "",
      scope: "global",
    });

    reducer(document, triggerAction, (action) => {
      expect(action.type).toBe("CREATE_CHILD_DOCUMENT");
      const input = action.input as CreateChildDocumentInput;
      // eslint-disable-next-line
      expect(input.id).toBe(id);
      expect(input.documentType).toBe("test");
    });
  });

  it("should throw an error when there is a missing index operation", () => {
    let document = baseCreateDocument(defaultPHDocumentCreateState);
    document = wrappedEmptyReducer(
      document,
      fakeAction({
        type: "TEST_0",
        input: {},
        scope: "global",
      }),
    );

    document = wrappedEmptyReducer(
      document,
      fakeAction({
        type: "TEST_1",
        input: {},
        scope: "global",
      }),
    );

    const action = fakeAction({
      type: "TEST_2",
      input: {},
      scope: "global",
      index: 3,
    });

    expect(() => {
      wrappedEmptyReducer(document, action, undefined, {
        replayOptions: {
          operation: {
            action,
            hash: "",
            timestampUtcMs: action.timestampUtcMs,
            index: 3,
            skip: 0,
          },
        },
      });
    }).toThrow(
      "Missing operations: expected 2 with skip 0 or equivalent, got index 3 with skip 0",
    );
  });

  it("should throw an error when there is a missing index operation + skip", () => {
    let document = baseCreateDocument(defaultPHDocumentCreateState);
    document = wrappedEmptyReducer(
      document,
      fakeAction({
        type: "TEST_0",
        input: {},
        scope: "global",
      }),
    );

    document = wrappedEmptyReducer(
      document,
      fakeAction({
        type: "TEST_1",
        input: {},
        scope: "global",
      }),
    );

    const action = fakeAction({
      type: "TEST_2",
      input: {},
      scope: "global",
      index: 4,
    });

    expect(() => {
      wrappedEmptyReducer(document, action, undefined, {
        skip: 1,
        replayOptions: {
          operation: {
            action,
            hash: "",
            timestampUtcMs: action.timestampUtcMs,
            index: 4,
            skip: 1,
          },
        },
      });
    }).toThrow(
      "Missing operations: expected 2 with skip 0 or equivalent, got index 4 with skip 1",
    );
  });

  it("should not throw an error when there is a valid index operation + skip", () => {
    let document = baseCreateDocument(defaultPHDocumentCreateState);
    document = wrappedEmptyReducer(
      document,
      fakeAction({
        type: "TEST_0",
        input: {},
        scope: "global",
      }),
    );

    document = wrappedEmptyReducer(
      document,
      fakeAction({
        type: "TEST_1",
        input: {},
        scope: "global",
      }),
    );

    const action = fakeAction({
      type: "TEST_2",
      input: {},
      scope: "global",
    });
    document = wrappedEmptyReducer(document, action, undefined, {
      skip: 1,
      pruneOnSkip: false,
      replayOptions: {
        operation: {
          action,
          skip: 1,
          index: 3,
          timestampUtcMs: action.timestampUtcMs,
          hash: "",
        },
      },
    });

    expect(document.operations.global[0].action.type).toBe("TEST_0");
    expect(document.operations.global[0].index).toBe(0);
    expect(document.operations.global[0].skip).toBe(0);
    expect(document.operations.global[1].action.type).toBe("TEST_1");
    expect(document.operations.global[1].index).toBe(1);
    expect(document.operations.global[1].skip).toBe(0);
    expect(document.operations.global[2].action.type).toBe("TEST_2");
    expect(document.operations.global[2].index).toBe(3);
    expect(document.operations.global[2].skip).toBe(1);
  });

  it("should not throw errors from reducer", () => {
    const initialState = createBaseState({ count: 0 }, { name: "" });

    let document = baseCreateDocument<CountDocument>(createCountDocumentState, initialState);

    document = countReducer(document, increment());
    document = countReducer(document, increment());
    document = countReducer(document, error());
    document = countReducer(document, increment());

    expect(document.state.global.count).toBe(3);
  });

  it("should not throw errors from reducer when there is an error after an operation with skip value", () => {
    const initialState = createBaseState({ count: 0 }, { name: "" });

    let document = baseCreateDocument<CountDocument>(createCountDocumentState, initialState);

    document = countReducer(document, increment());
    document = countReducer(document, increment(), undefined, { skip: 1 });
    document = countReducer(document, error());
    document = countReducer(document, increment());

    expect(document.state.global.count).toBe(2);
  });

  it("should include error message into error operation prop", () => {
    const initialState = createBaseState({ count: 0 }, { name: "" });

    let document = baseCreateDocument<CountDocument>(createCountDocumentState, initialState);

    document = countReducer(document, increment());
    document = countReducer(document, increment(), undefined, { skip: 1 });
    document = countReducer(document, error());
    document = countReducer(document, increment());

    expect(document.operations.global.length).toBe(3);
    expect(document.state.global.count).toBe(2);
    expect(document.operations.global).toMatchObject([
      {
        type: "INCREMENT",
        index: 1,
        skip: 1,
        error: undefined,
      },
      {
        type: "ERROR",
        index: 2,
        skip: 0,
        error: "Error action",
      },
      {
        type: "INCREMENT",
        index: 3,
        skip: 0,
        error: undefined,
      },
    ]);
  });

  it("should not include error message in successful operations", () => {
    const initialState = createBaseState({ count: 0 }, { name: "" });

    let document = baseCreateDocument<CountDocument>(createCountDocumentState, initialState);

    document = countReducer(document, increment());
    document = countReducer(document, increment());
    document = countReducer(document, increment());

    expect(document.operations.global.length).toBe(3);
    for (const operation of document.operations.global) {
      expect(operation.error).toBeUndefined();
    }
  });
});
