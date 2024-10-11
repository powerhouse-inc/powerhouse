import { describe, expect, it } from "vitest";

import {
  checkCleanedOperationsIntegrity,
  merge,
  reshuffleByTimestampAndIndex,
} from "../../src/utils/document-helpers";
import { buildOperations } from "./utils";

describe("merge", () => {
  const scenarios = [
    {
      // [0:0, 1:0, 2:0, A3:0, A4:0, A5:0] + [0:0, 1:0, 2:0, B3:0, B4:2, B5:0]
      // GC               => [0:0, 1:0, 2:0, A3:0, A4:0, A5:0] + [0:0, 1:0, B4:2, B5:0]
      // Split            => [0:0, 1:0] + [2:0, A3:0, A4:0, A5:0] + [B4:2, B5:0]
      // Reshuffle(6:4)   => [6:4, 7:0, 8:0, 9:0, 10:0, 11:0]
      // merge            => [0:0, 1:0, 6:4, 7:0, 8:0, 9:0, 10:0, 11:0]
      title: "case 1",
      targetOperations: [
        {
          index: 0,
          skip: 0,
          type: "OP_0",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 1,
          skip: 0,
          type: "OP_1",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        {
          index: 2,
          skip: 0,
          type: "OP_A_2",
          timestamp: "2021-01-03T00:00:00.000Z",
        },
        {
          index: 3,
          skip: 0,
          type: "OP_A_3",
          timestamp: "2021-01-04T00:00:00.000Z",
        },
        {
          index: 4,
          skip: 0,
          type: "OP_A_4",
          timestamp: "2021-01-09T00:00:00.000Z",
        },
        {
          index: 5,
          skip: 0,
          type: "OP_A_5",
          timestamp: "2021-01-10T00:00:00.000Z",
        },
      ],
      mergeOperations: [
        {
          index: 0,
          skip: 0,
          type: "OP_0",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 1,
          skip: 0,
          type: "OP_1",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        {
          index: 2,
          skip: 0,
          type: "OP_B_2",
          timestamp: "2021-01-05T00:00:00.000Z",
        },
        {
          index: 3,
          skip: 0,
          type: "OP_B_3",
          timestamp: "2021-01-06T00:00:00.000Z",
        },
        {
          index: 4,
          skip: 2,
          type: "OP_B_4",
          timestamp: "2021-01-07T00:00:00.000Z",
        },
        {
          index: 5,
          skip: 0,
          type: "OP_B_5",
          timestamp: "2021-01-08T00:00:00.000Z",
        },
      ],
      expected: [
        {
          index: 0,
          skip: 0,
          type: "OP_0",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 1,
          skip: 0,
          type: "OP_1",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        {
          index: 6,
          skip: 4,
          type: "OP_A_2",
          timestamp: "2021-01-03T00:00:00.000Z",
        },
        {
          index: 7,
          skip: 0,
          type: "OP_A_3",
          timestamp: "2021-01-04T00:00:00.000Z",
        },
        {
          index: 8,
          skip: 0,
          type: "OP_B_4",
          timestamp: "2021-01-07T00:00:00.000Z",
        },
        {
          index: 9,
          skip: 0,
          type: "OP_A_4",
          timestamp: "2021-01-09T00:00:00.000Z",
        },
        {
          index: 10,
          skip: 0,
          type: "OP_B_5",
          timestamp: "2021-01-08T00:00:00.000Z",
        },
        {
          index: 11,
          skip: 0,
          type: "OP_A_5",
          timestamp: "2021-01-10T00:00:00.000Z",
        },
      ],
    },
    {
      // [0:0, 1:0, 2:0, A3:0, A4:0, A5:1] + [0:0, 1:0, 2:0, B3:0, B4:2, B5:0]
      // GC               => [0:0, 1:0, 2:0, A3:0, A5:1] + [0:0, 1:0, B4:2, B5:0]
      // Split            => [0:0, 1:0] + [2:0, A3:0, A5:1] + [B4:2, B5:0]
      // Reshuffle(6:4)   => [6:4, 7:0, 8:0, 9:0, 10:0]
      // merge            => [0:0, 1:0, 6:4, 7:0, 8:0, 9:0, 10:0]
      title: "case 2",
      targetOperations: [
        {
          index: 0,
          skip: 0,
          type: "OP_0",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 1,
          skip: 0,
          type: "OP_1",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        {
          index: 2,
          skip: 0,
          type: "OP_A_2",
          timestamp: "2021-01-03T00:00:00.000Z",
        },
        {
          index: 3,
          skip: 0,
          type: "OP_A_3",
          timestamp: "2021-01-04T00:00:00.000Z",
        },
        {
          index: 4,
          skip: 0,
          type: "OP_A_4",
          timestamp: "2021-01-05T00:00:00.000Z",
        },
        {
          index: 5,
          skip: 1,
          type: "OP_A_5",
          timestamp: "2021-01-06T00:00:00.000Z",
        },
      ],
      mergeOperations: [
        {
          index: 0,
          skip: 0,
          type: "OP_0",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 1,
          skip: 0,
          type: "OP_1",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        {
          index: 2,
          skip: 0,
          type: "OP_B_2",
          timestamp: "2021-01-07T00:00:00.000Z",
        },
        {
          index: 3,
          skip: 0,
          type: "OP_B_3",
          timestamp: "2021-01-08T00:00:00.000Z",
        },
        {
          index: 4,
          skip: 2,
          type: "OP_B_4",
          timestamp: "2021-01-09T00:00:00.000Z",
        },
        {
          index: 5,
          skip: 0,
          type: "OP_B_5",
          timestamp: "2021-01-10T00:00:00.000Z",
        },
      ],
      expected: [
        {
          index: 0,
          skip: 0,
          type: "OP_0",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 1,
          skip: 0,
          type: "OP_1",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        {
          index: 6,
          skip: 4,
          type: "OP_A_2",
          timestamp: "2021-01-03T00:00:00.000Z",
        },
        {
          index: 7,
          skip: 0,
          type: "OP_A_3",
          timestamp: "2021-01-04T00:00:00.000Z",
        },
        {
          index: 8,
          skip: 0,
          type: "OP_B_4",
          timestamp: "2021-01-09T00:00:00.000Z",
        },
        {
          index: 9,
          skip: 0,
          type: "OP_A_5",
          timestamp: "2021-01-06T00:00:00.000Z",
        },
        {
          index: 10,
          skip: 0,
          type: "OP_B_5",
          timestamp: "2021-01-10T00:00:00.000Z",
        },
      ],
    },
    // [0:0, 1:1, 2:0, A3:0, A4:0, A5:1] + [0:0, 1:1, 2:0, B3:0, B4:2, B5:0]
    // GC               => [1:1, 2:0, A3:0, A5:1] + [1:1, B4:2, B5:0]
    // Split            => [1:1] + [2:0, A3:0, A5:1] + [B4:2, B5:0]
    // Reshuffle(6:4)   => [6:4, 7:0, 8:0, 9:0, 10:0, 11:0]
    // merge            => [1:1, 6:4, 7:0, 8:0, 9:0, 10:0, 11:0]
    {
      title: "case 3",
      targetOperations: [
        {
          index: 0,
          skip: 0,
          type: "OP_0",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 1,
          skip: 1,
          type: "OP_1",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        {
          index: 2,
          skip: 0,
          type: "OP_A_2",
          timestamp: "2021-01-03T00:00:00.000Z",
        },
        {
          index: 3,
          skip: 0,
          type: "OP_A_3",
          timestamp: "2021-01-04T00:00:00.000Z",
        },
        {
          index: 4,
          skip: 0,
          type: "OP_A_4",
          timestamp: "2021-01-05T00:00:00.000Z",
        },
        {
          index: 5,
          skip: 1,
          type: "OP_A_5",
          timestamp: "2021-01-06T00:00:00.000Z",
        },
      ],
      mergeOperations: [
        {
          index: 0,
          skip: 0,
          type: "OP_0",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 1,
          skip: 1,
          type: "OP_1",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        {
          index: 2,
          skip: 0,
          type: "OP_B_2",
          timestamp: "2021-01-07T00:00:00.000Z",
        },
        {
          index: 3,
          skip: 0,
          type: "OP_B_3",
          timestamp: "2021-01-08T00:00:00.000Z",
        },
        {
          index: 4,
          skip: 2,
          type: "OP_B_4",
          timestamp: "2021-01-09T00:00:00.000Z",
        },
        {
          index: 5,
          skip: 0,
          type: "OP_B_5",
          timestamp: "2021-01-10T00:00:00.000Z",
        },
      ],
      expected: [
        {
          index: 1,
          skip: 1,
          type: "OP_1",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        {
          index: 6,
          skip: 4,
          type: "OP_A_2",
          timestamp: "2021-01-03T00:00:00.000Z",
        },
        {
          index: 7,
          skip: 0,
          type: "OP_A_3",
          timestamp: "2021-01-04T00:00:00.000Z",
        },
        {
          index: 8,
          skip: 0,
          type: "OP_B_4",
          timestamp: "2021-01-09T00:00:00.000Z",
        },
        {
          index: 9,
          skip: 0,
          type: "OP_A_5",
          timestamp: "2021-01-06T00:00:00.000Z",
        },
        {
          index: 10,
          skip: 0,
          type: "OP_B_5",
          timestamp: "2021-01-10T00:00:00.000Z",
        },
      ],
    },
    // [0:0, 1:1, 2:0, A3:0, A4:0, A5:1] + [0:0, 1:1, 2:0]
    // GC               => [1:1, 2:0, A3:0, A5:1] + [1:1, 2:0]
    // Split            => [1:1, 2:0] + [A3:0, A5:1] + []
    // Reshuffle(6:3)   => [6:3, 7:0]
    // merge            => [1:1, 2:0, 6:3, 7:0]
    {
      title: "case 4 (empty merge ops)",
      targetOperations: [
        {
          index: 0,
          skip: 0,
          type: "OP_0",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 1,
          skip: 1,
          type: "OP_1",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        {
          index: 2,
          skip: 0,
          type: "OP_2",
          timestamp: "2021-01-03T00:00:00.000Z",
        },
        {
          index: 3,
          skip: 0,
          type: "OP_A_3",
          timestamp: "2021-01-04T00:00:00.000Z",
        },
        {
          index: 4,
          skip: 0,
          type: "OP_A_4",
          timestamp: "2021-01-05T00:00:00.000Z",
        },
        {
          index: 5,
          skip: 1,
          type: "OP_A_5",
          timestamp: "2021-01-06T00:00:00.000Z",
        },
      ],
      mergeOperations: [
        {
          index: 0,
          skip: 0,
          type: "OP_0",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 1,
          skip: 1,
          type: "OP_1",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        {
          index: 2,
          skip: 0,
          type: "OP_2",
          timestamp: "2021-01-03T00:00:00.000Z",
        },
      ],
      expected: [
        {
          index: 1,
          skip: 1,
          type: "OP_1",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        {
          index: 2,
          skip: 0,
          type: "OP_2",
          timestamp: "2021-01-03T00:00:00.000Z",
        },
        {
          index: 6,
          skip: 3,
          type: "OP_A_3",
          timestamp: "2021-01-04T00:00:00.000Z",
        },
        {
          index: 7,
          skip: 0,
          type: "OP_A_5",
          timestamp: "2021-01-06T00:00:00.000Z",
        },
      ],
    },
    // [0:0, 1:1, 2:0] + [0:0, 1:1, 2:0, A3:0, A4:0, A5:1]
    // GC               => [1:1, 2:0] + [1:1, 2:0, A3:0, A5:1]
    // Split            => [1:1, 2:0] + [] + [A3:0, A5:1]
    // Reshuffle(6:3)   => [6:3, 7:0, 8:0]
    // merge            => [1:1, 2:0, 6:3, 7:0, 8:0]
    {
      title: "case 5 (empty target ops)",
      targetOperations: [
        {
          index: 0,
          skip: 0,
          type: "OP_0",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 1,
          skip: 1,
          type: "OP_1",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        {
          index: 2,
          skip: 0,
          type: "OP_2",
          timestamp: "2021-01-03T00:00:00.000Z",
        },
      ],
      mergeOperations: [
        {
          index: 0,
          skip: 0,
          type: "OP_0",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 1,
          skip: 1,
          type: "OP_1",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        {
          index: 2,
          skip: 0,
          type: "OP_2",
          timestamp: "2021-01-03T00:00:00.000Z",
        },
        {
          index: 3,
          skip: 0,
          type: "OP_B_3",
          timestamp: "2021-01-04T00:00:00.000Z",
        },
        {
          index: 4,
          skip: 0,
          type: "OP_B_4",
          timestamp: "2021-01-05T00:00:00.000Z",
        },
        {
          index: 5,
          skip: 1,
          type: "OP_B_5",
          timestamp: "2021-01-06T00:00:00.000Z",
        },
      ],
      expected: [
        {
          index: 1,
          skip: 1,
          type: "OP_1",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        {
          index: 2,
          skip: 0,
          type: "OP_2",
          timestamp: "2021-01-03T00:00:00.000Z",
        },
        {
          index: 6,
          skip: 3,
          type: "OP_B_3",
          timestamp: "2021-01-04T00:00:00.000Z",
        },
        {
          index: 7,
          skip: 0,
          type: "OP_B_5",
          timestamp: "2021-01-06T00:00:00.000Z",
        },
      ],
    },
    // [A0:0, A1:0, A2:1, A3:0] + [B0:0, B1:0]
    // GC               => [A0:0, A2:1, A3:0] + [B0:0, B1:0]
    // Split            => [] + [A0:0, A2:1, A3:0] + [B0:0, B1:0]
    // Reshuffle(4:4)   => [4:4, 5:0, 6:0, 7:0, 8:0]
    // merge            => [4:4, 5:0, 6:0, 7:0, 8:0]
    {
      title: "case 6 (empty common, longer target)",
      targetOperations: [
        {
          index: 0,
          skip: 0,
          type: "OP_A0",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 1,
          skip: 0,
          type: "OP_A1",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        {
          index: 2,
          skip: 1,
          type: "OP_A2",
          timestamp: "2021-01-03T00:00:00.000Z",
        },
        {
          index: 3,
          skip: 0,
          type: "OP_A3",
          timestamp: "2021-01-04T00:00:00.000Z",
        },
      ],
      mergeOperations: [
        {
          index: 0,
          skip: 0,
          type: "OP_B0",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 1,
          skip: 0,
          type: "OP_B1",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
      ],
      expected: [
        {
          index: 4,
          skip: 4,
          type: "OP_A0",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 5,
          skip: 0,
          type: "OP_B0",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 6,
          skip: 0,
          type: "OP_B1",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        {
          index: 7,
          skip: 0,
          type: "OP_A2",
          timestamp: "2021-01-03T00:00:00.000Z",
        },
        {
          index: 8,
          skip: 0,
          type: "OP_A3",
          timestamp: "2021-01-04T00:00:00.000Z",
        },
      ],
    },
    // [A0:0, A1:0] + [B0:0, B1:0, B2:1, B3:0]
    // GC               => [A0:0, A1:0] + [B0:0, B2:1, B3:0]
    // Split            => [] + [A0:0, A1:0] + [B0:0, B2:1, B3:0]
    // Reshuffle(4:3)   => [4:4, 5:0, 6:0, 7:0, 8:0]
    // merge            => [4:4, 5:0, 6:0, 7:0, 8:0]
    {
      title: "case 7 (empty common, longer merge)",
      targetOperations: [
        {
          index: 0,
          skip: 0,
          type: "OP_A0",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 1,
          skip: 0,
          type: "OP_A1",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
      ],
      mergeOperations: [
        {
          index: 0,
          skip: 0,
          type: "OP_B0",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 1,
          skip: 0,
          type: "OP_B1",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        {
          index: 2,
          skip: 1,
          type: "OP_B2",
          timestamp: "2021-01-03T00:00:00.000Z",
        },
        {
          index: 3,
          skip: 0,
          type: "OP_B3",
          timestamp: "2021-01-04T00:00:00.000Z",
        },
      ],
      expected: [
        {
          index: 4,
          skip: 4,
          type: "OP_A0",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 5,
          skip: 0,
          type: "OP_B0",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 6,
          skip: 0,
          type: "OP_A1",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        {
          index: 7,
          skip: 0,
          type: "OP_B2",
          timestamp: "2021-01-03T00:00:00.000Z",
        },
        {
          index: 8,
          skip: 0,
          type: "OP_B3",
          timestamp: "2021-01-04T00:00:00.000Z",
        },
      ],
    },
    // [] + []
    // GC               => [] + []
    // Split            => [] + [] + []
    // Reshuffle(0:0)   => []
    // merge            => []
    {
      title: "case 8 (all empty)",
      targetOperations: [],
      mergeOperations: [],
      expected: [],
    },
  ];

  it.each(scenarios)(
    "should merge conlficted operations into a new operations history: $title",
    (testInput) => {
      const tergetOperations = buildOperations(testInput.targetOperations);
      const mergeOperations = buildOperations(testInput.mergeOperations);

      const result = merge(
        tergetOperations,
        mergeOperations,
        reshuffleByTimestampAndIndex,
      );

      expect(result.length).toBe(testInput.expected.length);
      expect(result).toMatchObject(testInput.expected);

      const check = checkCleanedOperationsIntegrity(result);
      expect(check).toHaveLength(0);
    },
  );
});
