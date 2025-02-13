import { describe, expect, it } from "vitest";

import {
  loadState,
  prune,
  redo,
  setName,
  undo,
} from "../../src/document/actions/creators.js";
import { baseCreateDocument } from "../../src/document/utils/base.js";
import {
  CountLocalState,
  countReducer,
  CountState,
  increment,
  mapOperations,
} from "../helpers.js";

describe("PRUNE operation", () => {
  it.skip("should prune first 4 operations", async () => {
    const document = baseCreateDocument<CountState, CountLocalState>({
      documentType: "powerhouse/counter",
      state: { global: { count: 0 }, local: {} },
    });
    let newDocument = countReducer(document, increment());
    newDocument = countReducer(newDocument, setName("Document"));
    newDocument = countReducer(newDocument, increment());
    newDocument = countReducer(newDocument, increment());
    newDocument = countReducer(newDocument, increment());
    newDocument = countReducer(newDocument, prune(0, 4));

    expect(newDocument.name).toBe("Document");
    expect(newDocument.state.global.count).toBe(4);
    expect(newDocument.revision.global).toBe(2);
    expect(mapOperations(newDocument.operations.global)).toStrictEqual([
      {
        ...loadState(
          {
            name: "Document",
            state: { global: { count: 3 }, local: {} },
          },
          4,
        ),
        index: 0,
        skip: 0,
      },
      { ...increment(), index: 1, skip: 0 },
    ]);
    expect(newDocument.documentType).toBe("powerhouse/counter");
    expect(newDocument.initialState.state.global).toStrictEqual({
      count: 0,
    });
    expect(newDocument.initialState.state).toStrictEqual(document.state);
  });

  it.skip("should prune last 3 operations", async () => {
    const document = baseCreateDocument<CountState, CountLocalState>({
      documentType: "powerhouse/counter",
      state: { global: { count: 0 }, local: {} },
    });
    let newDocument = countReducer(document, increment());
    newDocument = countReducer(newDocument, setName("Document"));
    newDocument = countReducer(newDocument, increment());
    newDocument = countReducer(newDocument, increment());
    newDocument = countReducer(newDocument, increment());
    newDocument = countReducer(newDocument, prune(2));

    expect(newDocument.name).toBe("Document");
    expect(newDocument.state.global.count).toBe(4);
    expect(newDocument.revision.global).toBe(3);
    expect(mapOperations(newDocument.operations.global)).toStrictEqual([
      { ...increment(), index: 0, skip: 0 },
      { ...setName("Document"), index: 1, skip: 0 },
      {
        ...loadState(
          {
            name: "Document",
            state: { global: { count: 4 }, local: {} },
          },
          3,
        ),
        index: 2,
        skip: 0,
      },
    ]);
    expect(newDocument.documentType).toBe("powerhouse/counter");
    expect(newDocument.initialState.state.global).toStrictEqual({
      count: 0,
    });
    expect(newDocument.initialState.state).toStrictEqual(document.state);
  });

  it.skip("should prune 2 operations", async () => {
    const document = baseCreateDocument<CountState, CountLocalState>({
      documentType: "powerhouse/counter",
      state: { global: { count: 0 }, local: {} },
    });
    let newDocument = countReducer(document, increment());
    newDocument = countReducer(newDocument, setName("Document"));
    newDocument = countReducer(newDocument, increment());
    newDocument = countReducer(newDocument, increment());
    newDocument = countReducer(newDocument, increment());
    newDocument = countReducer(newDocument, prune(2, 4));

    expect(newDocument.name).toBe("Document");
    expect(newDocument.state.global.count).toBe(4);
    expect(newDocument.revision.global).toBe(4);
    expect(mapOperations(newDocument.operations.global)).toStrictEqual([
      { ...increment(), index: 0, skip: 0 },
      { ...setName("Document"), index: 1, skip: 0 },
      {
        ...loadState(
          {
            name: "Document",
            state: { global: { count: 3 }, local: {} },
          },
          2,
        ),
        index: 2,
        skip: 0,
      },
      { ...increment(), index: 3, skip: 0 },
    ]);
    expect(newDocument.documentType).toBe("powerhouse/counter");
    expect(newDocument.initialState.state.global).toStrictEqual({
      count: 0,
    });
    expect(newDocument.initialState.state).toStrictEqual(document.state);
  });

  it.skip("should undo pruned state", async () => {
    const document = baseCreateDocument<CountState, CountLocalState>({
      documentType: "powerhouse/counter",
      state: { global: { count: 0 }, local: {} },
    });
    let newDocument = countReducer(document, increment());
    newDocument = countReducer(newDocument, setName("Document"));
    newDocument = countReducer(newDocument, increment());
    newDocument = countReducer(newDocument, increment());
    newDocument = countReducer(newDocument, increment());
    newDocument = countReducer(newDocument, prune(1, 5));
    newDocument = countReducer(newDocument, undo(1));

    expect(newDocument.name).toBe("");
    expect(newDocument.state.global.count).toBe(1);
    expect(newDocument.revision.global).toBe(3);
    expect(mapOperations(newDocument.operations.global)).toMatchObject([
      { ...increment(), index: 0, skip: 0 },
      { type: "NOOP", input: {}, index: 1, skip: 0, scope: "global" },
      { type: "NOOP", input: {}, index: 2, skip: 1, scope: "global" },
    ]);
    expect(newDocument.clipboard.length).toBe(1);
    expect(newDocument.clipboard[0]).toMatchObject({
      ...loadState(
        {
          name: "Document",
          state: { global: { count: 4 }, local: {} },
        },
        4,
      ),
      index: 1,
      skip: 0,
    });
    expect(newDocument.documentType).toBe("powerhouse/counter");
    expect(newDocument.initialState.state.global).toStrictEqual({
      count: 0,
    });
    expect(newDocument.initialState.state).toStrictEqual(document.state);
  });

  it.skip("should redo pruned state", async () => {
    const document = baseCreateDocument<CountState, CountLocalState>({
      documentType: "powerhouse/counter",
      state: { global: { count: 0 }, local: { name: "" } },
    });

    let newDocument = countReducer(document, increment());
    newDocument = countReducer(newDocument, setName("Document"));
    newDocument = countReducer(newDocument, increment());
    newDocument = countReducer(newDocument, increment());
    newDocument = countReducer(newDocument, increment());
    newDocument = countReducer(newDocument, prune(1, 5));
    newDocument = countReducer(newDocument, undo(1));
    newDocument = countReducer(newDocument, redo(1));

    expect(newDocument.name).toBe("Document");
    expect(newDocument.state.global.count).toBe(4);
    expect(newDocument.revision.global).toBe(4);
    expect(mapOperations(newDocument.operations.global)).toMatchObject([
      { ...increment(), index: 0, skip: 0 },
      { type: "NOOP", input: {}, index: 1, skip: 0, scope: "global" },
      { type: "NOOP", input: {}, index: 2, skip: 1, scope: "global" },
      {
        ...loadState(
          {
            name: "Document",
            state: { global: { count: 4 }, local: { name: "" } },
          },
          4,
        ),
        index: 3,
        skip: 0,
      },
    ]);
    expect(newDocument.clipboard.length).toBe(0);
    expect(newDocument.documentType).toBe("powerhouse/counter");
    expect(newDocument.initialState.state.global).toStrictEqual({
      count: 0,
    });
    expect(newDocument.initialState.state).toStrictEqual(document.state);
  });
});
