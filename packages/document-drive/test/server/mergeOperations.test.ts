import { fakeAction, mergeOperations } from "document-drive";
import type { Operation } from "document-model";
import { deriveOperationId } from "document-model/core";
import { describe, expect, it } from "vitest";

const TEST_DOC_ID = "test-doc-id";
const TEST_BRANCH = "main";
const TEST_SCOPE = "global";

describe("mergeOperations", () => {
  it("should merge operations correcly", async () => {
    const action1 = fakeAction({
      scope: "global",
      type: "SET_MODEL_NAME",
      input: { name: "1" },
    });
    const operation: Operation = {
      id: deriveOperationId(TEST_DOC_ID, TEST_SCOPE, TEST_BRANCH, action1.id),
      action: action1,
      index: 0,
      timestampUtcMs: "2024-05-03T20:26:52.236Z",
      hash: "GCbMKj+UOVkUwAJhI7vU76Y7j1I=",
      skip: 0,
      error: undefined,
    };
    const action2 = fakeAction({
      scope: "global",
      type: "SET_MODEL_NAME",
      input: { name: "1" },
    });
    const action3 = fakeAction({
      scope: "global",
      type: "SET_MODEL_NAME",
      input: { name: "2" },
    });
    const result = mergeOperations(
      {
        global: [operation],
        local: [],
      },
      [
        {
          id: deriveOperationId(TEST_DOC_ID, TEST_SCOPE, TEST_BRANCH, action2.id),
          action: action2,
          index: 1,
          timestampUtcMs: "2024-05-03T20:26:52.239Z",
          hash: "GCbMKj+UOVkUwAJhI7vU76Y7j1I=",
          skip: 1,
          error: undefined,
        },
        {
          id: deriveOperationId(TEST_DOC_ID, TEST_SCOPE, TEST_BRANCH, action3.id),
          action: action3,
          index: 2,
          timestampUtcMs: "2024-05-03T20:26:52.239Z",
          hash: "7rDGOdcTtu9xcKwmMM5F98KO9PM=",
          skip: 0,
          error: undefined,
        },
      ],
    );

    expect(result.global).toHaveLength(3);
    expect(result.global).toMatchObject([
      {
        action: { type: "SET_MODEL_NAME", input: { name: "1" } },
        index: 0,
        skip: 0,
        error: undefined,
      },
      {
        action: { type: "SET_MODEL_NAME", input: { name: "1" } },
        index: 1,
        skip: 1,
        error: undefined,
      },
      {
        action: { type: "SET_MODEL_NAME", input: { name: "2" } },
        index: 2,
        skip: 0,
        error: undefined,
      },
    ]);
  });

  it("should reject operations with invalid index", async () => {
    const action4 = fakeAction({
      scope: "global",
      type: "SET_MODEL_NAME",
      input: { name: "1" },
    });
    const action5 = fakeAction({
      scope: "global",
      type: "SET_MODEL_NAME",
      input: { name: "1" },
    });
    const action6 = fakeAction({
      scope: "global",
      type: "SET_MODEL_NAME",
      input: { name: "2" },
    });
    await expect(
      new Promise(() => {
        mergeOperations(
          {
            global: [
              {
                id: deriveOperationId(TEST_DOC_ID, TEST_SCOPE, TEST_BRANCH, action4.id),
                action: action4,
                index: 0,
                timestampUtcMs: "2024-05-03T20:26:52.236Z",
                hash: "GCbMKj+UOVkUwAJhI7vU76Y7j1I=",
                skip: 0,
                error: undefined,
              },
              {
                id: deriveOperationId(TEST_DOC_ID, TEST_SCOPE, TEST_BRANCH, action5.id),
                action: action5,
                index: 1,
                timestampUtcMs: "2024-05-03T20:26:52.239Z",
                hash: "GCbMKj+UOVkUwAJhI7vU76Y7j1I=",
                skip: 1,
                error: undefined,
              },
            ],
            local: [],
          },
          [
            {
              id: deriveOperationId(TEST_DOC_ID, TEST_SCOPE, TEST_BRANCH, action6.id),
              action: action6,
              index: 0,
              timestampUtcMs: "2024-05-03T20:26:52.239Z",
              hash: "7rDGOdcTtu9xcKwmMM5F98KO9PM=",
              skip: 0,
              error: undefined,
            },
          ],
        );
      }),
    ).rejects.toThrow(
      "Tried to add operation with index 0 and document is at index 1",
    );
  });
});
