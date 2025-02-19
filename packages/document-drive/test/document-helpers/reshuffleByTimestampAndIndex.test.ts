import { describe, expect, it } from "vitest";
import { reshuffleByTimestampAndIndex } from "../../../document-model/src/document/utils/document-helpers.js";
import { buildOperations } from "../utils.js";

describe("reshuffleByTimestamp", () => {
  const scenarios = [
    {
      title: "case 1",
      startIndex: { index: 6, skip: 2 },
      operationsA: buildOperations([
        {
          index: 4,
          skip: 0,
          type: "OP_A_4",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 5,
          skip: 0,
          type: "OP_A_5",
          timestamp: "2021-01-04T00:00:00.000Z",
        },
        {
          index: 6,
          skip: 0,
          type: "OP_A_6",
          timestamp: "2021-01-05T00:00:00.000Z",
        },
      ]),
      operationsB: buildOperations([
        {
          index: 4,
          skip: 0,
          type: "OP_B_4",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        {
          index: 5,
          skip: 0,
          type: "OP_B_5",
          timestamp: "2021-01-03T00:00:00.000Z",
        },
      ]),
      expected: [
        { index: 6, skip: 2, type: "OP_A_4" },
        { index: 7, skip: 0, type: "OP_B_4" },
        { index: 8, skip: 0, type: "OP_B_5" },
        { index: 9, skip: 0, type: "OP_A_5" },
        { index: 10, skip: 0, type: "OP_A_6" },
      ],
    },
    {
      title: "case 2 (remove skip from operations)",
      startIndex: { index: 3, skip: 1 },
      operationsA: buildOperations([
        {
          index: 2,
          skip: 0,
          type: "OP_A_2",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 3,
          skip: 0,
          type: "OP_A_3",
          timestamp: "2021-01-03T00:00:00.000Z",
        },
        {
          index: 4,
          skip: 0,
          type: "OP_A_4",
          timestamp: "2021-01-04T00:00:00.000Z",
        },
      ]),
      operationsB: buildOperations([
        {
          index: 3,
          skip: 0,
          type: "OP_B_3",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        {
          index: 5,
          skip: 1,
          type: "OP_B_5",
          timestamp: "2021-01-05T00:00:00.000Z",
        },
      ]),
      expected: [
        { index: 3, skip: 1, type: "OP_A_2" },
        { index: 4, skip: 0, type: "OP_B_3" },
        { index: 5, skip: 0, type: "OP_A_3" },
        { index: 6, skip: 0, type: "OP_A_4" },
        { index: 7, skip: 0, type: "OP_B_5" },
      ],
    },
    {
      title: "case 3 (should consider index when sorting operations)",
      startIndex: { index: 3, skip: 1 },
      operationsA: buildOperations([
        {
          index: 2,
          skip: 0,
          type: "OP_A_2",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 3,
          skip: 0,
          type: "OP_A_3",
          timestamp: "2021-01-03T00:00:00.000Z",
        },
        {
          index: 4,
          skip: 0,
          type: "OP_A_4",
          timestamp: "2021-01-05T00:00:00.000Z",
        },
      ]),
      operationsB: buildOperations([
        {
          index: 3,
          skip: 0,
          type: "OP_B_3",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        {
          index: 5,
          skip: 1,
          type: "OP_B_5",
          timestamp: "2021-01-04T00:00:00.000Z",
        },
      ]),
      expected: [
        { index: 3, skip: 1, type: "OP_A_2" },
        { index: 4, skip: 0, type: "OP_B_3" },
        { index: 5, skip: 0, type: "OP_A_3" },
        { index: 6, skip: 0, type: "OP_A_4" },
        { index: 7, skip: 0, type: "OP_B_5" },
      ],
    },
    {
      title: "case 4 (should consider index when sorting operations)",
      startIndex: { index: 3, skip: 1 },
      operationsA: buildOperations([
        {
          index: 2,
          skip: 0,
          type: "OP_A_2",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 3,
          skip: 0,
          type: "OP_A_3",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        {
          index: 4,
          skip: 0,
          type: "OP_A_4",
          timestamp: "2021-01-03T00:00:00.000Z",
        },
      ]),
      operationsB: buildOperations([
        {
          index: 2,
          skip: 0,
          type: "OP_B_2",
          timestamp: "2021-01-04T00:00:00.000Z",
        },
        {
          index: 3,
          skip: 0,
          type: "OP_B_3",
          timestamp: "2021-01-05T00:00:00.000Z",
        },
        {
          index: 4,
          skip: 0,
          type: "OP_B_4",
          timestamp: "2021-01-06T00:00:00.000Z",
        },
      ]),
      expected: [
        { index: 3, skip: 1, type: "OP_A_2" },
        { index: 4, skip: 0, type: "OP_B_2" },
        { index: 5, skip: 0, type: "OP_A_3" },
        { index: 6, skip: 0, type: "OP_B_3" },
        { index: 7, skip: 0, type: "OP_A_4" },
        { index: 8, skip: 0, type: "OP_B_4" },
      ],
    },
  ];

  it.each(scenarios)("should reshuffle the operations: $title", (testInput) => {
    const result = reshuffleByTimestampAndIndex(
      testInput.startIndex,
      testInput.operationsA,
      testInput.operationsB,
    );

    expect(result.length).toBe(testInput.expected.length);
    expect(result).toMatchObject(testInput.expected);
  });
});
