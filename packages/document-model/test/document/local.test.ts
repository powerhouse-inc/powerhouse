import { beforeAll, describe, expect, it, vi } from "vitest";
import { baseCreateDocument } from "document-model";
import { prune, redo, undo } from "document-model";
import type { CountDocument } from "../helpers.js";
import {
  countReducer,
  createCountDocumentState,
  createCountState,
  defaultPHDocumentCreateState,
  fakeAction,
  setLocalName,
  wrappedEmptyReducer,
} from "../helpers.js";

describe("Local reducer", () => {
  beforeAll(() => {
    vi.useFakeTimers().setSystemTime(new Date("2020-01-01"));
  });

  it("should update local revision", async () => {
    const document = baseCreateDocument(defaultPHDocumentCreateState);
    const newDocument = wrappedEmptyReducer(
      document,
      fakeAction({
        type: "TEST",
        input: {},
        scope: "local",
      }),
    );
    expect(newDocument.header.revision.local).toBe(1);
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
        scope: "local",
      }),
    );
    expect(
      new Date(document.header.lastModifiedAtUtcIso).getTime(),
    ).toBeLessThan(new Date(newDocument.header.lastModifiedAtUtcIso).getTime());
    vi.useRealTimers();
  });

  it("should not update global operations list", async () => {
    vi.useFakeTimers({ now: new Date("2023-01-01") });
    const document = baseCreateDocument(defaultPHDocumentCreateState);
    const newDocument = wrappedEmptyReducer(
      document,
      fakeAction({
        type: "TEST",
        input: {},
        scope: "local",
      }),
    );

    expect(newDocument.operations.local).toMatchObject([
      {
        type: "TEST",
        timestampUtcMs: new Date().toISOString(),
        index: 0,
        skip: 0,
        input: {},
        hash: "vyGp6PvFo4RvsFtPoIWeCReyIC8=",
        scope: "local",
        error: undefined,
      },
    ]);
    expect(newDocument.operations.global).toStrictEqual([]);
  });

  it("should update local operations list", async () => {
    vi.useFakeTimers({ now: new Date("2023-01-01") });
    const document = baseCreateDocument(defaultPHDocumentCreateState);
    const newDocument = wrappedEmptyReducer(
      document,
      fakeAction({
        type: "TEST",
        input: {},
        scope: "local",
      }),
    );

    expect(newDocument.operations.local).toMatchObject([
      {
        type: "TEST",
        timestampUtcMs: new Date().toISOString(),
        index: 0,
        skip: 0,
        input: {},
        hash: "vyGp6PvFo4RvsFtPoIWeCReyIC8=",
        scope: "local",
        error: undefined,
      },
    ]);

    expect(newDocument.operations.global).toStrictEqual([]);
  });
  it("should update local name", async () => {
    const document = baseCreateDocument<CountDocument>(
      createCountDocumentState,
      createCountState(),
    );
    const newDocument = countReducer(document, setLocalName("test"));
    expect(newDocument.header.revision.local).toStrictEqual(1);
    expect(document.header.revision.local).toBe(undefined);

    expect(newDocument.operations).toMatchObject({
      global: [],
      local: [
        {
          hash: "HbiD0GRM+ijPjZ/N3Kw+6WxMTNI=",
          type: "SET_LOCAL_NAME",
          input: "test",
          index: 0,
          skip: 0,
          scope: "local",
          timestampUtcMs: new Date().toISOString(),
          error: undefined,
        },
      ],
    });
  });

  it("should undo local operation", async () => {
    const document = baseCreateDocument<CountDocument>(
      createCountDocumentState,
      createCountState(),
    );
    let newDocument = countReducer(document, setLocalName("test"));

    expect(newDocument.header.revision).toStrictEqual({
      document: 0,
      local: 1,
    });
    newDocument = countReducer(newDocument, undo(1, "local"));
    expect(newDocument.header.revision).toStrictEqual({
      document: 0,
      local: 2,
    });
    expect(newDocument.state).toStrictEqual(createCountState());
    expect(document.state).toStrictEqual(createCountState());

    expect(newDocument.operations).toMatchObject({
      global: [],
      local: [
        {
          type: "NOOP",
          input: {},
          index: 1,
          skip: 1,
          scope: "local",
        },
      ],
    });

    expect(newDocument.clipboard.length).toBe(1);
    expect(newDocument.clipboard[0]).toMatchObject({
      type: "SET_LOCAL_NAME",
      input: "test",
      index: 0,
      skip: 0,
      scope: "local",
    });
  });

  it("should redo local operation", async () => {
    const document = baseCreateDocument<CountDocument>(
      createCountDocumentState,
      createCountState(),
    );
    let newDocument = countReducer(document, setLocalName("test"));
    newDocument = countReducer(newDocument, undo(1, "local"));
    newDocument = countReducer(newDocument, redo(1, "local"));
    expect(newDocument.header.revision).toStrictEqual({
      document: 0,
      local: 3,
    });
    expect(newDocument.state).toStrictEqual(createCountState(0, "test"));
    expect(newDocument.clipboard.length).toBe(0);
    expect(newDocument.operations).toMatchObject({
      global: [],
      local: [
        {
          type: "NOOP",
          input: {},
          index: 1,
          skip: 1,
          scope: "local",
        },
        {
          type: "SET_LOCAL_NAME",
          input: "test",
          index: 2,
          skip: 0,
          scope: "local",
        },
      ],
    });
  });

  it.skip("should prune local operations", async () => {
    const document = baseCreateDocument<CountDocument>(
      createCountDocumentState,
      createCountState(),
    );
    let newDocument = countReducer(document, setLocalName("test"));
    newDocument = countReducer(newDocument, setLocalName("test 2"));
    expect(newDocument.header.revision).toStrictEqual({ global: 0, local: 2 });
    expect(newDocument.state).toStrictEqual({
      global: { count: 0 },
      local: { name: "test 2" },
    });
    expect(newDocument.operations).toStrictEqual({
      global: [],
      local: [
        {
          hash: "HbiD0GRM+ijPjZ/N3Kw+6WxMTNI=",
          type: "SET_LOCAL_NAME",
          input: "test",
          index: 0,
          skip: 0,
          scope: "local",
          timestampUtcMs: new Date().toISOString(),
          error: undefined,
        },

        {
          hash: "QIsBfXG+5+X+ju/tv2PHkg0SyEM=",
          type: "SET_LOCAL_NAME",
          input: "test 2",
          index: 1,
          skip: 0,
          scope: "local",
          timestampUtcMs: new Date().toISOString(),
          error: undefined,
        },
      ],
    });

    newDocument = countReducer(newDocument, prune(0, undefined, "local"));
    expect(newDocument.header.revision).toStrictEqual({ global: 1, local: 0 });
    expect(newDocument.state).toStrictEqual({
      global: { count: 0 },
      local: { name: "test 2" },
    });
    expect(newDocument.operations).toStrictEqual({
      global: [
        {
          error: undefined,
          hash: "ch7MNww9+xUYoTgutbGr6VU0GaU=",
          type: "LOAD_STATE",
          input: {
            operations: 2,
            state: {
              name: "",
              state: {
                global: { count: 0 },
                local: { name: "test 2" },
              },
            },
          },
          index: 0,
          skip: 0,
          scope: "global",
          timestampUtcMs: new Date().toISOString(),
        },
      ],
      local: [],
    });
  });
});
