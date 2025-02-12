import { prune, redo, undo } from "@document/actions/creators.js";
import { baseCreateDocument } from "@document/utils/base.js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { countReducer, setLocalName, wrappedEmptyReducer } from "../helpers.js";

describe("Local reducer", () => {
  beforeAll(() => {
    vi.useFakeTimers().setSystemTime(new Date("2020-01-01"));
  });

  it("should update local revision", async () => {
    const document = baseCreateDocument();
    const newDocument = wrappedEmptyReducer(document, {
      type: "TEST",
      input: {},
      scope: "local",
    });
    expect(newDocument.revision.local).toBe(1);
  });

  it("should update lastModified", async () => {
    vi.useFakeTimers();
    const document = baseCreateDocument();
    await new Promise((r) => {
      setTimeout(r, 100);
      vi.runOnlyPendingTimers();
    });
    const newDocument = wrappedEmptyReducer(document, {
      type: "TEST",
      input: {},
      scope: "local",
    });
    expect(new Date(document.lastModified).getTime()).toBeLessThan(
      new Date(newDocument.lastModified).getTime(),
    );
    vi.useRealTimers();
  });

  it("should not update global operations list", async () => {
    vi.useFakeTimers({ now: new Date("2023-01-01") });
    const document = baseCreateDocument();
    const newDocument = wrappedEmptyReducer(document, {
      type: "TEST",
      input: {},
      scope: "local",
    });

    expect(newDocument.operations.local).toMatchObject([
      {
        type: "TEST",
        timestamp: new Date().toISOString(),
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
    const document = baseCreateDocument();
    const newDocument = wrappedEmptyReducer(document, {
      type: "TEST",
      input: {},
      scope: "local",
    });

    expect(newDocument.operations.local).toMatchObject([
      {
        type: "TEST",
        timestamp: new Date().toISOString(),
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
    const document = baseCreateDocument({
      documentType: "powerhouse/counter",
      state: { global: { count: 0 }, local: { name: "" } },
    });
    const newDocument = countReducer(document, setLocalName("test"));
    expect(newDocument.state).toStrictEqual({
      global: { count: 0 },
      local: { name: "test" },
    });
    expect(document.state).toStrictEqual({
      global: { count: 0 },
      local: { name: "" },
    });

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
          timestamp: new Date().toISOString(),
          error: undefined,
        },
      ],
    });
  });

  it("should undo local operation", async () => {
    const document = baseCreateDocument({
      documentType: "powerhouse/counter",
      state: { global: { count: 0 }, local: { name: "" } },
    });
    let newDocument = countReducer(document, setLocalName("test"));

    expect(newDocument.revision).toStrictEqual({ global: 0, local: 1 });
    newDocument = countReducer(newDocument, undo(1, "local"));
    expect(newDocument.revision).toStrictEqual({ global: 0, local: 2 });
    expect(newDocument.state).toStrictEqual({
      global: { count: 0 },
      local: { name: "" },
    });
    expect(document.state).toStrictEqual({
      global: { count: 0 },
      local: { name: "" },
    });

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
    const document = baseCreateDocument({
      documentType: "powerhouse/counter",
      state: { global: { count: 0 }, local: { name: "" } },
    });
    let newDocument = countReducer(document, setLocalName("test"));
    newDocument = countReducer(newDocument, undo(1, "local"));
    newDocument = countReducer(newDocument, redo(1, "local"));
    expect(newDocument.revision).toStrictEqual({ global: 0, local: 3 });
    expect(newDocument.state).toStrictEqual({
      global: { count: 0 },
      local: { name: "test" },
    });
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
    const document = baseCreateDocument({
      documentType: "powerhouse/counter",
      state: { global: { count: 0 }, local: { name: "" } },
    });
    let newDocument = countReducer(document, setLocalName("test"));
    newDocument = countReducer(newDocument, setLocalName("test 2"));
    expect(newDocument.revision).toStrictEqual({ global: 0, local: 2 });
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
          timestamp: new Date().toISOString(),
          error: undefined,
        },

        {
          hash: "QIsBfXG+5+X+ju/tv2PHkg0SyEM=",
          type: "SET_LOCAL_NAME",
          input: "test 2",
          index: 1,
          skip: 0,
          scope: "local",
          timestamp: new Date().toISOString(),
          error: undefined,
        },
      ],
    });

    newDocument = countReducer(newDocument, prune(0, undefined, "local"));
    expect(newDocument.revision).toStrictEqual({ global: 1, local: 0 });
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
          timestamp: new Date().toISOString(),
        },
      ],
      local: [],
    });
  });
});
