import { describe, expect, it } from "vitest";

import { split } from "../../src/document/utils/document-helpers.js";
import { buildOperation, buildOperations } from "./utils.js";

describe("split", () => {
  const scenarios = [
    {
      title: "case 1",
      commonOperations: buildOperations([
        { index: 0, skip: 0, type: "OP_0" },
        { index: 1, skip: 0, type: "OP_1" },
      ]),
      targetOperations: buildOperations([
        { index: 2, skip: 0, type: "OP_A_2" },
        { index: 3, skip: 0, type: "OP_A_3" },
        { index: 4, skip: 0, type: "OP_A_4" },
        { index: 5, skip: 0, type: "OP_A_5" },
      ]),
      mergeOperations: buildOperations([
        { index: 4, skip: 2, type: "OP_B_4" },
        { index: 5, skip: 0, type: "OP_B_5" },
      ]),
      shuffleProperties: false,
    },
    {
      title: "case 2 (shuffled property orders)",
      commonOperations: buildOperations([
        { index: 0, skip: 0, type: "OP_0" },
        { index: 1, skip: 0, type: "OP_1" },
      ]),
      targetOperations: buildOperations([
        { index: 2, skip: 0, type: "OP_A_2" },
        { index: 3, skip: 0, type: "OP_A_3" },
        { index: 4, skip: 0, type: "OP_A_4" },
        { index: 5, skip: 0, type: "OP_A_5" },
      ]),
      mergeOperations: buildOperations([
        { index: 4, skip: 2, type: "OP_B_4" },
        { index: 5, skip: 0, type: "OP_B_5" },
      ]),
      shuffleProperties: true,
    },
    {
      title: "case 3 (no common operations)",
      commonOperations: buildOperations([]),
      targetOperations: buildOperations([
        { index: 0, skip: 0, type: "OP_A_0" },
        { index: 1, skip: 0, type: "OP_A_1" },
        { index: 2, skip: 0, type: "OP_A_2" },
      ]),
      mergeOperations: buildOperations([
        { index: 1, skip: 1, type: "OP_B_1" },
        { index: 2, skip: 0, type: "OP_B_2" },
      ]),
      shuffleProperties: false,
    },
    {
      title: "case 4 (target operations and merge operations are the same)",
      commonOperations: buildOperations([
        { index: 0, skip: 0, type: "OP_0" },
        { index: 1, skip: 0, type: "OP_1" },
        { index: 3, skip: 0, type: "OP_3" },
      ]),
      targetOperations: buildOperations([]),
      mergeOperations: buildOperations([]),
      shuffleProperties: false,
    },
    {
      title: "case 5 (empty operations)",
      commonOperations: buildOperations([]),
      targetOperations: buildOperations([]),
      mergeOperations: buildOperations([]),
      shuffleProperties: false,
    },
    {
      title: "case 6",
      commonOperations: buildOperations([
        { index: 1, skip: 1, type: "OP_1" },
        { index: 2, skip: 0, type: "OP_2" },
        { index: 4, skip: 1, type: "OP_4" },
      ]),
      targetOperations: buildOperations([
        { index: 6, skip: 1, type: "OP_A_6" },
        { index: 7, skip: 0, type: "OP_A_7" },
      ]),
      mergeOperations: buildOperations([
        { index: 5, skip: 0, type: "OP_B_5" },
        { index: 7, skip: 1, type: "OP_B_7" },
      ]),
      shuffleProperties: false,
    },
  ];

  it.each(scenarios)("should split the operations: $title", (testInput) => {
    // assumes that garbageCollect is already applied to the operations
    const targetOperations = [
      ...testInput.commonOperations,
      ...testInput.targetOperations,
    ];

    let commonOperationsShuffled = [];
    if (testInput.shuffleProperties) {
      commonOperationsShuffled = testInput.commonOperations.map((op) =>
        buildOperation(
          {
            type: op.action.type,
            index: op.index,
            skip: op.skip,
            timestamp: op.timestamp,
          },
          true,
        ),
      );
    } else {
      commonOperationsShuffled = testInput.commonOperations;
    }

    const mergeOperations = [
      ...commonOperationsShuffled,
      ...testInput.mergeOperations,
    ];

    const result = split(targetOperations, mergeOperations);

    expect(result.length).toBe(3);
    expect(result[0]).toMatchObject(testInput.commonOperations);
    expect(result[1]).toMatchObject(testInput.targetOperations);
    expect(result[2]).toMatchObject(testInput.mergeOperations);
  });
});
