// Command = action => should process the action and asign the index, timestamp, and hash
// Event = operation => should keep the same operation information but execute the action input against the document
import { baseCreateDocument } from "document-model";
import {
  defaultPHDocumentCreateState,
  fakeAction,
  wrappedEmptyReducer,
} from "document-model/test";
import { beforeAll, describe, expect, it, vi } from "vitest";

describe("Event", () => {
  beforeAll(() => {
    vi.useFakeTimers().setSystemTime(new Date("2020-01-01"));
  });

  it("should not re-assingn index to an event", () => {
    let document = baseCreateDocument(defaultPHDocumentCreateState);

    document = wrappedEmptyReducer(
      document,
      fakeAction({
        type: "TEST",
        input: {},
        scope: "global",
      }),
    );

    document = wrappedEmptyReducer(
      document,
      fakeAction({
        type: "TEST_2",
        input: {},
        scope: "global",
      }),
    );

    const action = fakeAction({
      type: "TEST_4",
      input: {},
      scope: "global",
    });

    document = wrappedEmptyReducer(document, action, undefined, {
      skip: 1,
      replayOptions: {
        operation: {
          index: 3,
          hash: "test-4-hash",
          timestampUtcMs: new Date().toISOString(),
          skip: 1,
          action,
        },
      },
    });

    expect(document.header.revision.global).toBe(4);
    expect(document.operations.global).toMatchObject([
      {
        action: { type: "TEST" },
        index: 0,
      },
      {
        action: { type: "TEST_2" },
        index: 1,
      },
      {
        action: { type: "TEST_4" },
        index: 3,
        skip: 1,
      },
    ]);
  });

  it("should remove skipped operations", () => {
    let document = baseCreateDocument(defaultPHDocumentCreateState);

    document = wrappedEmptyReducer(
      document,
      fakeAction({
        type: "TEST",
        input: {},
        scope: "global",
      }),
    );

    document = wrappedEmptyReducer(
      document,
      fakeAction({
        type: "TEST_2",
        input: {},
        scope: "global",
      }),
    );

    document = wrappedEmptyReducer(
      document,
      fakeAction({
        type: "TEST_3",
        input: {},
        scope: "global",
      }),
    );

    document = wrappedEmptyReducer(
      document,
      fakeAction({
        type: "TEST_4",
        input: {},
        index: 3,
        hash: "test-4-hash",
        scope: "global",
      }),
      undefined,
      { skip: 1 },
    );

    expect(document.header.revision.global).toBe(4);
    expect(document.operations.global).toMatchObject([
      {
        type: "TEST",
        index: 0,
      },
      {
        type: "TEST_2",
        index: 1,
      },
      {
        type: "TEST_4",
        index: 3,
        skip: 1,
      },
    ]);
  });

  it("should continue with next index after an operation", () => {
    let document = baseCreateDocument(defaultPHDocumentCreateState);

    document = wrappedEmptyReducer(
      document,
      fakeAction({
        type: "TEST",
        input: {},
        scope: "global",
      }),
    );

    document = wrappedEmptyReducer(
      document,
      fakeAction({
        type: "TEST_2",
        input: {},
        scope: "global",
      }),
    );

    const action = fakeAction({
      type: "TEST_4",
      input: {},
      scope: "global",
    });

    document = wrappedEmptyReducer(document, action, undefined, {
      skip: 1,
      replayOptions: {
        operation: {
          index: 3,
          hash: "test-4-hash",
          timestampUtcMs: new Date().toISOString(),
          skip: 1,
          action,
        },
      },
    });

    document = wrappedEmptyReducer(
      document,
      fakeAction({
        type: "TEST_5",
        input: {},
        scope: "global",
      }),
    );

    expect(document.header.revision.global).toBe(5);
    expect(document.operations.global).toMatchObject([
      {
        action: { type: "TEST" },
        index: 0,
      },
      {
        action: { type: "TEST_2" },
        index: 1,
      },
      {
        action: { type: "TEST_4" },
        index: 3,
        skip: 1,
      },
      {
        action: { type: "TEST_5" },
        index: 4,
      },
    ]);
  });

  it("should calculate the right document revision when last action is an event", () => {
    let document = baseCreateDocument(defaultPHDocumentCreateState);

    document = wrappedEmptyReducer(
      document,
      fakeAction({
        type: "TEST",
        input: {},
        scope: "global",
      }),
    );

    document = wrappedEmptyReducer(
      document,
      fakeAction({
        type: "TEST_2",
        input: {},
        scope: "global",
      }),
    );

    const action = fakeAction({
      type: "TEST_4",
      input: {},
      scope: "global",
    });

    document = wrappedEmptyReducer(document, action, undefined, {
      skip: 1,
      replayOptions: {
        operation: {
          index: 3,
          hash: "test-4-hash",
          timestampUtcMs: new Date().toISOString(),
          skip: 1,
          action,
        },
      },
    });

    expect(document.header.revision.global).toBe(4);
    expect(document.operations.global).toMatchObject([
      {
        action: { type: "TEST" },
        index: 0,
      },
      {
        action: { type: "TEST_2" },
        index: 1,
      },
      {
        action: { type: "TEST_4" },
        index: 3,
        skip: 1,
      },
    ]);
  });
});
