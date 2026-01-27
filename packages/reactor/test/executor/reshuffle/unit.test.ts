import type { Operation } from "document-model";
import { deriveOperationId } from "document-model/core";
import { describe, expect, it } from "vitest";
import {
  reshuffleByTimestamp,
  reshuffleByTimestampAndIndex,
  sortOperations,
} from "../../../src/utils/reshuffle.js";

const TEST_DOC_ID = "test-doc-id";
const TEST_BRANCH = "main";
const TEST_SCOPE = "global";

type InputOperation = Partial<Omit<Operation, "index" | "skip">> & {
  index: number;
  skip: number;
  type?: string;
};

const buildOperation = (input: InputOperation): Operation => {
  const timestamp = input.timestampUtcMs || new Date().toISOString();
  const actionId = input.action?.id || `action-${input.index}`;
  return {
    id: deriveOperationId(TEST_DOC_ID, TEST_SCOPE, TEST_BRANCH, actionId),
    hash: input.hash || `hash-${input.index}`,
    timestampUtcMs: timestamp,
    action: input.action || {
      id: actionId,
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

  describe("reshuffleByTimestamp with identical timestamps", () => {
    it("should use operation id as tiebreaker when timestamps are identical", () => {
      const sameTimestamp = "2021-01-01T00:00:00.000Z";
      const operationsA = buildOperations([
        {
          index: 3,
          skip: 0,
          type: "OP_A",
          timestampUtcMs: sameTimestamp,
          action: {
            id: "action-B",
            type: "OP_A",
            input: {},
            scope: "global",
            timestampUtcMs: sameTimestamp,
          },
        },
      ]);
      const operationsB = buildOperations([
        {
          index: 3,
          skip: 0,
          type: "OP_B",
          timestampUtcMs: sameTimestamp,
          action: {
            id: "action-A",
            type: "OP_B",
            input: {},
            scope: "global",
            timestampUtcMs: sameTimestamp,
          },
        },
      ]);

      const result = reshuffleByTimestamp(
        { index: 3, skip: 0 },
        operationsA,
        operationsB,
      );

      expect(result.length).toBe(2);
      expect(result[0].id < result[1].id).toBe(true);
    });

    it("should produce deterministic order regardless of input order", () => {
      const sameTimestamp = "2021-01-01T00:00:00.000Z";
      const operationsA = buildOperations([
        {
          index: 3,
          skip: 0,
          type: "OP_A",
          timestampUtcMs: sameTimestamp,
          action: {
            id: "action-B",
            type: "OP_A",
            input: {},
            scope: "global",
            timestampUtcMs: sameTimestamp,
          },
        },
      ]);
      const operationsB = buildOperations([
        {
          index: 3,
          skip: 0,
          type: "OP_B",
          timestampUtcMs: sameTimestamp,
          action: {
            id: "action-A",
            type: "OP_B",
            input: {},
            scope: "global",
            timestampUtcMs: sameTimestamp,
          },
        },
      ]);

      const resultAB = reshuffleByTimestamp(
        { index: 3, skip: 0 },
        operationsA,
        operationsB,
      );
      const resultBA = reshuffleByTimestamp(
        { index: 3, skip: 0 },
        operationsB,
        operationsA,
      );

      expect(resultAB[0].action.type).toBe(resultBA[0].action.type);
      expect(resultAB[1].action.type).toBe(resultBA[1].action.type);
    });

    it("should handle multiple operations with same timestamp", () => {
      const sameTimestamp = "2021-01-01T00:00:00.000Z";
      const operationsA = buildOperations([
        {
          index: 3,
          skip: 0,
          type: "OP_A1",
          timestampUtcMs: sameTimestamp,
          action: {
            id: "action-C",
            type: "OP_A1",
            input: {},
            scope: "global",
            timestampUtcMs: sameTimestamp,
          },
        },
        {
          index: 4,
          skip: 0,
          type: "OP_A2",
          timestampUtcMs: sameTimestamp,
          action: {
            id: "action-A",
            type: "OP_A2",
            input: {},
            scope: "global",
            timestampUtcMs: sameTimestamp,
          },
        },
      ]);
      const operationsB = buildOperations([
        {
          index: 3,
          skip: 0,
          type: "OP_B1",
          timestampUtcMs: sameTimestamp,
          action: {
            id: "action-B",
            type: "OP_B1",
            input: {},
            scope: "global",
            timestampUtcMs: sameTimestamp,
          },
        },
      ]);

      const result = reshuffleByTimestamp(
        { index: 3, skip: 0 },
        operationsA,
        operationsB,
      );

      expect(result.length).toBe(3);
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].id < result[i + 1].id).toBe(true);
      }
    });
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

    it("should use operation id as tiebreaker when index and timestamp are identical", () => {
      const sameTimestamp = "2021-01-01T00:00:00.000Z";
      const operationsA = buildOperations([
        {
          index: 3,
          skip: 0,
          type: "OP_A",
          timestampUtcMs: sameTimestamp,
          action: {
            id: "action-B",
            type: "OP_A",
            input: {},
            scope: "global",
            timestampUtcMs: sameTimestamp,
          },
        },
      ]);
      const operationsB = buildOperations([
        {
          index: 3,
          skip: 0,
          type: "OP_B",
          timestampUtcMs: sameTimestamp,
          action: {
            id: "action-A",
            type: "OP_B",
            input: {},
            scope: "global",
            timestampUtcMs: sameTimestamp,
          },
        },
      ]);

      const result = reshuffleByTimestampAndIndex(
        { index: 3, skip: 0 },
        operationsA,
        operationsB,
      );

      expect(result.length).toBe(2);
      expect(result[0].id < result[1].id).toBe(true);
    });

    it("should produce deterministic order regardless of input order with same index and timestamp", () => {
      const sameTimestamp = "2021-01-01T00:00:00.000Z";
      const operationsA = buildOperations([
        {
          index: 3,
          skip: 0,
          type: "OP_A",
          timestampUtcMs: sameTimestamp,
          action: {
            id: "action-B",
            type: "OP_A",
            input: {},
            scope: "global",
            timestampUtcMs: sameTimestamp,
          },
        },
      ]);
      const operationsB = buildOperations([
        {
          index: 3,
          skip: 0,
          type: "OP_B",
          timestampUtcMs: sameTimestamp,
          action: {
            id: "action-A",
            type: "OP_B",
            input: {},
            scope: "global",
            timestampUtcMs: sameTimestamp,
          },
        },
      ]);

      const resultAB = reshuffleByTimestampAndIndex(
        { index: 3, skip: 0 },
        operationsA,
        operationsB,
      );
      const resultBA = reshuffleByTimestampAndIndex(
        { index: 3, skip: 0 },
        operationsB,
        operationsA,
      );

      expect(resultAB[0].action.type).toBe(resultBA[0].action.type);
      expect(resultAB[1].action.type).toBe(resultBA[1].action.type);
    });
  });

  describe("Skip field understanding", () => {
    it("should document skip=0 for all normal operations", () => {
      const normalOp: Operation = {
        id: deriveOperationId(TEST_DOC_ID, TEST_SCOPE, TEST_BRANCH, "action-5"),
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
          id: deriveOperationId(
            TEST_DOC_ID,
            TEST_SCOPE,
            TEST_BRANCH,
            "action-10",
          ),
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
          id: deriveOperationId(
            TEST_DOC_ID,
            TEST_SCOPE,
            TEST_BRANCH,
            "action-11",
          ),
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

  describe("sortOperations", () => {
    const buildOpIndex = (
      index: number,
      skip: number,
      id: string = `op-${index}-${skip}`,
    ) => ({
      index,
      skip,
      id,
      timestampUtcMs: "2021-01-01T00:00:00.000Z",
    });

    it("should sort operations by index then by skip", () => {
      const operations = [
        buildOpIndex(0, 0),
        buildOpIndex(2, 0),
        buildOpIndex(1, 0),
        buildOpIndex(3, 3),
        buildOpIndex(3, 1),
      ];

      const sorted = sortOperations(operations);

      expect(sorted).toMatchObject([
        { index: 0, skip: 0 },
        { index: 1, skip: 0 },
        { index: 2, skip: 0 },
        { index: 3, skip: 1 },
        { index: 3, skip: 3 },
      ]);
    });

    it("should sort with different index values", () => {
      const operations = [
        buildOpIndex(5, 0),
        buildOpIndex(2, 0),
        buildOpIndex(8, 0),
        buildOpIndex(1, 0),
      ];

      const sorted = sortOperations(operations);

      expect(sorted).toMatchObject([
        { index: 1, skip: 0 },
        { index: 2, skip: 0 },
        { index: 5, skip: 0 },
        { index: 8, skip: 0 },
      ]);
    });

    it("should sort with same index but different skip values", () => {
      const operations = [
        buildOpIndex(5, 5),
        buildOpIndex(5, 1),
        buildOpIndex(5, 3),
        buildOpIndex(5, 0),
      ];

      const sorted = sortOperations(operations);

      expect(sorted).toMatchObject([
        { index: 5, skip: 0 },
        { index: 5, skip: 1 },
        { index: 5, skip: 3 },
        { index: 5, skip: 5 },
      ]);
    });

    it("should handle empty array", () => {
      const operations: {
        index: number;
        skip: number;
        id: string;
        timestampUtcMs: string;
      }[] = [];

      const sorted = sortOperations(operations);

      expect(sorted).toEqual([]);
    });

    it("should handle single operation", () => {
      const operations = [buildOpIndex(42, 7)];

      const sorted = sortOperations(operations);

      expect(sorted).toMatchObject([{ index: 42, skip: 7 }]);
    });

    it("should handle already sorted operations", () => {
      const operations = [
        buildOpIndex(0, 0),
        buildOpIndex(1, 0),
        buildOpIndex(2, 0),
        buildOpIndex(3, 0),
      ];

      const sorted = sortOperations(operations);

      expect(sorted).toMatchObject([
        { index: 0, skip: 0 },
        { index: 1, skip: 0 },
        { index: 2, skip: 0 },
        { index: 3, skip: 0 },
      ]);
    });

    it("should handle reverse ordered operations", () => {
      const operations = [
        buildOpIndex(4, 0),
        buildOpIndex(3, 0),
        buildOpIndex(2, 0),
        buildOpIndex(1, 0),
      ];

      const sorted = sortOperations(operations);

      expect(sorted).toMatchObject([
        { index: 1, skip: 0 },
        { index: 2, skip: 0 },
        { index: 3, skip: 0 },
        { index: 4, skip: 0 },
      ]);
    });

    it("should not mutate original array", () => {
      const operations = [
        buildOpIndex(3, 0),
        buildOpIndex(1, 0),
        buildOpIndex(2, 0),
      ];
      const originalCopy = [...operations];

      sortOperations(operations);

      expect(operations).toEqual(originalCopy);
    });

    it("should work with Operation type including all fields", () => {
      const operations: Operation[] = [
        buildOperation({ index: 3, skip: 0, type: "OP_3" }),
        buildOperation({ index: 1, skip: 0, type: "OP_1" }),
        buildOperation({ index: 2, skip: 0, type: "OP_2" }),
      ];

      const sorted = sortOperations(operations);

      expect(sorted[0].action.type).toBe("OP_1");
      expect(sorted[1].action.type).toBe("OP_2");
      expect(sorted[2].action.type).toBe("OP_3");
    });
  });
});
