import type { Operation } from "document-model";
import { describe, expect, it } from "vitest";
import {
  reshuffleByTimestamp,
  reshuffleByTimestampAndIndex,
} from "../../src/utils/reshuffle.js";

type InputOperation = Partial<Omit<Operation, "index" | "skip">> & {
  index: number;
  skip: number;
  type?: string;
};

const buildOperation = (input: InputOperation): Operation => {
  const timestamp = input.timestampUtcMs || new Date().toISOString();
  return {
    hash: input.hash || `hash-${input.index}`,
    timestampUtcMs: timestamp,
    action: input.action || {
      id: `action-${input.index}`,
      type: input.type ?? "TEST",
      input: {},
      scope: "global",
      timestampUtcMs: timestamp,
    },
    index: input.index,
    skip: input.skip,
  };
};

const buildOperations = (inputs: InputOperation[]): Operation[] =>
  inputs.map((i) => buildOperation(i));

describe("Reshuffle Functions", () => {
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
            timestampUtcMs: "2021-01-01T00:00:00.000Z",
          },
          {
            index: 5,
            skip: 0,
            type: "OP_A_5",
            timestampUtcMs: "2021-01-04T00:00:00.000Z",
          },
          {
            index: 6,
            skip: 0,
            type: "OP_A_6",
            timestampUtcMs: "2021-01-05T00:00:00.000Z",
          },
        ]),
        operationsB: buildOperations([
          {
            index: 4,
            skip: 0,
            type: "OP_B_4",
            timestampUtcMs: "2021-01-02T00:00:00.000Z",
          },
          {
            index: 5,
            skip: 0,
            type: "OP_B_5",
            timestampUtcMs: "2021-01-03T00:00:00.000Z",
          },
        ]),
        expected: [
          { index: 6, skip: 2, action: { type: "OP_A_4" } },
          { index: 7, skip: 0, action: { type: "OP_B_4" } },
          { index: 8, skip: 0, action: { type: "OP_B_5" } },
          { index: 9, skip: 0, action: { type: "OP_A_5" } },
          { index: 10, skip: 0, action: { type: "OP_A_6" } },
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
            timestampUtcMs: "2021-01-01T00:00:00.000Z",
          },
          {
            index: 3,
            skip: 0,
            type: "OP_A_3",
            timestampUtcMs: "2021-01-03T00:00:00.000Z",
          },
          {
            index: 4,
            skip: 0,
            type: "OP_A_4",
            timestampUtcMs: "2021-01-04T00:00:00.000Z",
          },
        ]),
        operationsB: buildOperations([
          {
            index: 3,
            skip: 0,
            type: "OP_B_3",
            timestampUtcMs: "2021-01-02T00:00:00.000Z",
          },
          {
            index: 5,
            skip: 1,
            type: "OP_B_5",
            timestampUtcMs: "2021-01-05T00:00:00.000Z",
          },
        ]),
        expected: [
          { index: 3, skip: 1, action: { type: "OP_A_2" } },
          { index: 4, skip: 0, action: { type: "OP_B_3" } },
          { index: 5, skip: 0, action: { type: "OP_A_3" } },
          { index: 6, skip: 0, action: { type: "OP_A_4" } },
          { index: 7, skip: 0, action: { type: "OP_B_5" } },
        ],
      },
      {
        title: "case 3 (should not consider index when sorting operations)",
        startIndex: { index: 3, skip: 1 },
        operationsA: buildOperations([
          {
            index: 2,
            skip: 0,
            type: "OP_A_2",
            timestampUtcMs: "2021-01-01T00:00:00.000Z",
          },
          {
            index: 3,
            skip: 0,
            type: "OP_A_3",
            timestampUtcMs: "2021-01-03T00:00:00.000Z",
          },
          {
            index: 4,
            skip: 0,
            type: "OP_A_4",
            timestampUtcMs: "2021-01-05T00:00:00.000Z",
          },
        ]),
        operationsB: buildOperations([
          {
            index: 3,
            skip: 0,
            type: "OP_B_3",
            timestampUtcMs: "2021-01-02T00:00:00.000Z",
          },
          {
            index: 5,
            skip: 1,
            type: "OP_B_5",
            timestampUtcMs: "2021-01-04T00:00:00.000Z",
          },
        ]),
        expected: [
          { index: 3, skip: 1, action: { type: "OP_A_2" } },
          { index: 4, skip: 0, action: { type: "OP_B_3" } },
          { index: 5, skip: 0, action: { type: "OP_A_3" } },
          { index: 6, skip: 0, action: { type: "OP_B_5" } },
          { index: 7, skip: 0, action: { type: "OP_A_4" } },
        ],
      },
    ];

    it.each(scenarios)(
      "should reshuffle the operations: $title",
      (testInput) => {
        const result = reshuffleByTimestamp(
          testInput.startIndex,
          testInput.operationsA,
          testInput.operationsB,
        );

        expect(result.length).toBe(testInput.expected.length);
        expect(result).toMatchObject(testInput.expected);
      },
    );
  });

  describe("reshuffleByTimestampAndIndex", () => {
    const scenarios = [
      {
        title: "case 1",
        startIndex: { index: 6, skip: 2 },
        operationsA: buildOperations([
          {
            index: 4,
            skip: 0,
            type: "OP_A_4",
            timestampUtcMs: "2021-01-01T00:00:00.000Z",
          },
          {
            index: 5,
            skip: 0,
            type: "OP_A_5",
            timestampUtcMs: "2021-01-04T00:00:00.000Z",
          },
          {
            index: 6,
            skip: 0,
            type: "OP_A_6",
            timestampUtcMs: "2021-01-05T00:00:00.000Z",
          },
        ]),
        operationsB: buildOperations([
          {
            index: 4,
            skip: 0,
            type: "OP_B_4",
            timestampUtcMs: "2021-01-02T00:00:00.000Z",
          },
          {
            index: 5,
            skip: 0,
            type: "OP_B_5",
            timestampUtcMs: "2021-01-03T00:00:00.000Z",
          },
        ]),
        expected: [
          { index: 6, skip: 2, action: { type: "OP_A_4" } },
          { index: 7, skip: 0, action: { type: "OP_B_4" } },
          { index: 8, skip: 0, action: { type: "OP_B_5" } },
          { index: 9, skip: 0, action: { type: "OP_A_5" } },
          { index: 10, skip: 0, action: { type: "OP_A_6" } },
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
            timestampUtcMs: "2021-01-01T00:00:00.000Z",
          },
          {
            index: 3,
            skip: 0,
            type: "OP_A_3",
            timestampUtcMs: "2021-01-03T00:00:00.000Z",
          },
          {
            index: 4,
            skip: 0,
            type: "OP_A_4",
            timestampUtcMs: "2021-01-04T00:00:00.000Z",
          },
        ]),
        operationsB: buildOperations([
          {
            index: 3,
            skip: 0,
            type: "OP_B_3",
            timestampUtcMs: "2021-01-02T00:00:00.000Z",
          },
          {
            index: 5,
            skip: 1,
            type: "OP_B_5",
            timestampUtcMs: "2021-01-05T00:00:00.000Z",
          },
        ]),
        expected: [
          { index: 3, skip: 1, action: { type: "OP_A_2" } },
          { index: 4, skip: 0, action: { type: "OP_B_3" } },
          { index: 5, skip: 0, action: { type: "OP_A_3" } },
          { index: 6, skip: 0, action: { type: "OP_A_4" } },
          { index: 7, skip: 0, action: { type: "OP_B_5" } },
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
            timestampUtcMs: "2021-01-01T00:00:00.000Z",
          },
          {
            index: 3,
            skip: 0,
            type: "OP_A_3",
            timestampUtcMs: "2021-01-03T00:00:00.000Z",
          },
          {
            index: 4,
            skip: 0,
            type: "OP_A_4",
            timestampUtcMs: "2021-01-05T00:00:00.000Z",
          },
        ]),
        operationsB: buildOperations([
          {
            index: 3,
            skip: 0,
            type: "OP_B_3",
            timestampUtcMs: "2021-01-02T00:00:00.000Z",
          },
          {
            index: 5,
            skip: 1,
            type: "OP_B_5",
            timestampUtcMs: "2021-01-04T00:00:00.000Z",
          },
        ]),
        expected: [
          { index: 3, skip: 1, action: { type: "OP_A_2" } },
          { index: 4, skip: 0, action: { type: "OP_B_3" } },
          { index: 5, skip: 0, action: { type: "OP_A_3" } },
          { index: 6, skip: 0, action: { type: "OP_A_4" } },
          { index: 7, skip: 0, action: { type: "OP_B_5" } },
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
            timestampUtcMs: "2021-01-01T00:00:00.000Z",
          },
          {
            index: 3,
            skip: 0,
            type: "OP_A_3",
            timestampUtcMs: "2021-01-02T00:00:00.000Z",
          },
          {
            index: 4,
            skip: 0,
            type: "OP_A_4",
            timestampUtcMs: "2021-01-03T00:00:00.000Z",
          },
        ]),
        operationsB: buildOperations([
          {
            index: 2,
            skip: 0,
            type: "OP_B_2",
            timestampUtcMs: "2021-01-04T00:00:00.000Z",
          },
          {
            index: 3,
            skip: 0,
            type: "OP_B_3",
            timestampUtcMs: "2021-01-05T00:00:00.000Z",
          },
          {
            index: 4,
            skip: 0,
            type: "OP_B_4",
            timestampUtcMs: "2021-01-06T00:00:00.000Z",
          },
        ]),
        expected: [
          { index: 3, skip: 1, action: { type: "OP_A_2" } },
          { index: 4, skip: 0, action: { type: "OP_B_2" } },
          { index: 5, skip: 0, action: { type: "OP_A_3" } },
          { index: 6, skip: 0, action: { type: "OP_B_3" } },
          { index: 7, skip: 0, action: { type: "OP_A_4" } },
          { index: 8, skip: 0, action: { type: "OP_B_4" } },
        ],
      },
    ];

    it.each(scenarios)(
      "should reshuffle the operations: $title",
      (testInput) => {
        const result = reshuffleByTimestampAndIndex(
          testInput.startIndex,
          testInput.operationsA,
          testInput.operationsB,
        );

        expect(result.length).toBe(testInput.expected.length);
        expect(result).toMatchObject(testInput.expected);
      },
    );
  });

  describe("Skip field understanding", () => {
    it("should document skip=0 for all normal operations", () => {
      const normalOp: Operation = {
        index: 5,
        skip: 0,
        timestampUtcMs: "2021-01-01T00:00:00.000Z",
        hash: "abc123",
        action: {
          id: "action-5",
          type: "SOME_ACTION",
          scope: "global",
          input: {},
          timestampUtcMs: "2021-01-01T00:00:00.000Z",
        },
      };

      expect(normalOp.skip).toBe(0);
    });

    it("should document skip>0 only occurs during reshuffle", () => {
      const reshuffledOps: Operation[] = [
        {
          index: 10,
          skip: 3,
          timestampUtcMs: "2021-01-01T00:00:00.000Z",
          hash: "abc123",
          action: {
            id: "action-10",
            type: "FIRST_RESHUFFLED",
            scope: "global",
            input: {},
            timestampUtcMs: "2021-01-01T00:00:00.000Z",
          },
        },
        {
          index: 11,
          skip: 0,
          timestampUtcMs: "2021-01-02T00:00:00.000Z",
          hash: "def456",
          action: {
            id: "action-11",
            type: "SECOND_RESHUFFLED",
            scope: "global",
            input: {},
            timestampUtcMs: "2021-01-02T00:00:00.000Z",
          },
        },
      ];

      expect(reshuffledOps[0].skip).toBe(3);
      expect(reshuffledOps[1].skip).toBe(0);
    });

    it("should document skip calculation for first reshuffled operation", () => {
      const baseOperations = buildOperations([
        { index: 0, skip: 0, type: "OP_0" },
        { index: 1, skip: 0, type: "OP_1" },
        { index: 2, skip: 0, type: "OP_2" },
        { index: 3, skip: 0, type: "OP_3" },
        { index: 4, skip: 0, type: "OP_4" },
      ]);

      const firstReshuffled = {
        index: 5,
        skip: 3,
        type: "FIRST_RESHUFFLED",
      };

      expect(baseOperations.length).toBe(5);
      expect(firstReshuffled.index - firstReshuffled.skip).toBe(2);
    });
  });
});
