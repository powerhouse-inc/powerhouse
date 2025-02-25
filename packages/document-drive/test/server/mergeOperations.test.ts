import { describe, expect, it } from "vitest";
import { mergeOperations } from "../../src/utils/misc.js";

describe("mergeOperations", () => {
  it("should merge operations correcly", async () => {
    const result = mergeOperations(
      {
        global: [
          {
            type: "SET_MODEL_NAME",
            input: { name: "1" },
            scope: "global",
            index: 0,
            timestamp: "2024-05-03T20:26:52.236Z",
            hash: "GCbMKj+UOVkUwAJhI7vU76Y7j1I=",
            skip: 0,
            error: undefined,
          },
        ],
        local: [],
      },
      [
        {
          type: "SET_MODEL_NAME",
          input: { name: "1" },
          scope: "global",
          index: 1,
          timestamp: "2024-05-03T20:26:52.239Z",
          hash: "GCbMKj+UOVkUwAJhI7vU76Y7j1I=",
          skip: 1,
          error: undefined,
        },
        {
          type: "SET_MODEL_NAME",
          input: { name: "2" },
          scope: "global",
          index: 2,
          timestamp: "2024-05-03T20:26:52.239Z",
          hash: "7rDGOdcTtu9xcKwmMM5F98KO9PM=",
          skip: 0,
          error: undefined,
        },
      ],
    );

    expect(result.global).toHaveLength(3);
    expect(result.global).toMatchObject([
      {
        type: "SET_MODEL_NAME",
        input: { name: "1" },
        index: 0,
        skip: 0,
        error: undefined,
      },
      {
        type: "SET_MODEL_NAME",
        input: { name: "1" },
        index: 1,
        skip: 1,
        error: undefined,
      },
      {
        type: "SET_MODEL_NAME",
        input: { name: "2" },
        index: 2,
        skip: 0,
        error: undefined,
      },
    ]);
  });

  it("should reject operations with invalid index", async () => {
    await expect(
      new Promise(() => {
        mergeOperations(
          {
            global: [
              {
                type: "SET_MODEL_NAME",
                input: { name: "1" },
                scope: "global",
                index: 0,
                timestamp: "2024-05-03T20:26:52.236Z",
                hash: "GCbMKj+UOVkUwAJhI7vU76Y7j1I=",
                skip: 0,
                error: undefined,
              },
              {
                type: "SET_MODEL_NAME",
                input: { name: "1" },
                scope: "global",
                index: 1,
                timestamp: "2024-05-03T20:26:52.239Z",
                hash: "GCbMKj+UOVkUwAJhI7vU76Y7j1I=",
                skip: 1,
                error: undefined,
              },
            ],
            local: [],
          },
          [
            {
              type: "SET_MODEL_NAME",
              input: { name: "2" },
              scope: "global",
              index: 0,
              timestamp: "2024-05-03T20:26:52.239Z",
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
