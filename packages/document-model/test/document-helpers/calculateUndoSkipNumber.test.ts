import { describe, expect, it } from "vitest";

import { calculateUndoSkipNumber } from "document-model/core";
import { buildOperations, rebuildState } from "./utils.js";

/**
 * This is a new method for calculating skips for NOOPs, given the constraint
 * that operation indices are monotonically increasing.
 *
 * For NOOP operations:
 *
 * - A skip of -1 means skip all previous operations.
 * - Adjacent NOOPs have a skip diff of 2, not 1 (so the prior NOOP is also skipped).
 * - NOOPs compose transitively: that is, they follow NOOPs they land on.
 * - Non-NOOP operations are undone one at a time (skip = 1).
 */

describe("calculateUndoSkipNumber", () => {
  const scenarios = [
    {
      title: "case 1: empty",
      operations: [],
      expected: { skip: -1, result: "" },
    },
    {
      title: "case 2: single op",
      operations: [{ index: 0, skip: 0, type: "ADD", value: "A" }], // A
      expected: { skip: -1, result: "" },
    },
    {
      title: "case 3: two ops",
      operations: [
        { index: 0, skip: 0, type: "ADD", value: "A" }, // A
        { index: 1, skip: 0, type: "ADD", value: "B" }, // AB
      ],
      expected: { skip: 1, result: "A" },
    },
    {
      title: "case 4: undo only op",
      operations: [
        { index: 0, skip: 0, type: "ADD", value: "A" }, // A
        { index: 1, skip: 1, type: "ADD", value: "B" }, // B
      ],
      expected: { skip: -1, result: "" },
    },
    {
      title: "case 5: single undo",
      operations: [{ index: 1, skip: 1, type: "NOOP", value: "" }], // ""
      expected: { skip: -1, result: "" },
    },
    {
      title: "case 5.1: single reshuffle",
      operations: [
        { index: 0, skip: 0, type: "ADD", value: "A" }, // A
        { index: 1, skip: 1, type: "ADD", value: "B" }, // B <-- reshuffle start
        { index: 2, skip: 0, type: "ADD", value: "A" }, // BA <-- reshuffle end
      ],
      expected: { skip: 1, result: "B" },
    },
    {
      title: "case 5.2: single long reshuffle",
      operations: [
        { index: 0, skip: 0, type: "ADD", value: "A" }, // A
        { index: 1, skip: 1, type: "ADD", value: "B" }, // B <-- reshuffle start
        { index: 2, skip: 0, type: "ADD", value: "C" }, // BC
        { index: 3, skip: 0, type: "ADD", value: "A" }, // BCA <-- reshuffle end
      ],
      expected: { skip: 1, result: "BC" },
    },
    {
      title: "case 5.3: single multi-reshuffle",
      operations: [
        { index: 0, skip: 0, type: "ADD", value: "1A" }, // 1A
        { index: 1, skip: 0, type: "ADD", value: "1B" }, // 1A1B
        { index: 2, skip: 2, type: "ADD", value: "2A" }, // 2A <-- reshuffle start
        { index: 3, skip: 0, type: "ADD", value: "1A" }, // 2A1A
        { index: 4, skip: 0, type: "ADD", value: "2B" }, // 2A1A2B
        { index: 5, skip: 0, type: "ADD", value: "1B" }, // 2A1A2B1B <-- reshuffle end
      ],
      expected: { skip: 1, result: "2A1A2B" },
    },
    {
      title: "case 6: three ops",
      operations: [
        { index: 0, skip: 0, type: "ADD", value: "A" }, // A
        { index: 1, skip: 0, type: "ADD", value: "B" }, // AB
        { index: 2, skip: 0, type: "ADD", value: "C" }, // ABC
      ],
      expected: { skip: 1, result: "AB" },
    },
    {
      title: "case 7: three ops + undo",
      operations: [
        { index: 0, skip: 0, type: "ADD", value: "A" }, // A
        { index: 1, skip: 0, type: "ADD", value: "B" }, // AB
        { index: 2, skip: 0, type: "ADD", value: "C" }, // ABC
        { index: 3, skip: 1, type: "NOOP" }, // AB
      ],
      expected: { skip: 3, result: "A" },
    },
    {
      title: "case 7.1: three ops + reshuffle",
      operations: [
        { index: 0, skip: 0, type: "ADD", value: "A" }, // A
        { index: 1, skip: 0, type: "ADD", value: "B" }, // AB
        { index: 2, skip: 0, type: "ADD", value: "C" }, // ABC
        { index: 3, skip: 1, type: "ADD", value: "D" }, // ABD <-- reshuffle start
        { index: 4, skip: 0, type: "ADD", value: "C" }, // ABDC <-- reshuffle end
      ],
      expected: { skip: 1, result: "ABD" },
    },
    {
      title: "case 8: full undo chain",
      operations: [
        { index: 0, skip: 0, type: "ADD", value: "A" }, // A
        { index: 1, skip: 0, type: "ADD", value: "B" }, // AB
        { index: 2, skip: 0, type: "ADD", value: "C" }, // ABC
        { index: 3, skip: 1, type: "NOOP" }, // AB
        { index: 4, skip: 3, type: "NOOP" }, // A
      ],
      expected: { skip: -1, result: "" },
    },
    {
      title: "case 9: undo, redo",
      operations: [
        { index: 0, skip: 0, type: "ADD", value: "A" }, // A
        { index: 1, skip: 1, type: "NOOP" }, // ""
        { index: 2, skip: 0, type: "ADD", value: "C" }, // C
      ],
      expected: { skip: 1, result: "" },
    },
    {
      title: "case 9.1: undo, redo, undo",
      operations: [
        { index: 0, skip: 0, type: "ADD", value: "A" }, // A
        { index: 1, skip: 1, type: "NOOP" }, // ""
        { index: 2, skip: 0, type: "ADD", value: "C" }, // C
        { index: 3, skip: 1, type: "NOOP" }, // ""
      ],
      expected: { skip: -1, result: "" }, // <-- Follows the NOOPs to the beginning
    },
    {
      title: "case 10: double undo",
      operations: [
        { index: 0, skip: 0, type: "ADD", value: "A" }, // A
        { index: 1, skip: 0, type: "ADD", value: "B" }, // AB
        { index: 2, skip: 0, type: "ADD", value: "C" }, // ABC
        { index: 3, skip: 0, type: "ADD", value: "D" }, // ABCD
        { index: 4, skip: 1, type: "NOOP" }, // ABC
        { index: 5, skip: 3, type: "NOOP" }, // AB
      ],
      expected: { skip: 5, result: "A" },
    },
    {
      title: "case 10.1: double undo full",
      operations: [
        { index: 0, skip: 0, type: "ADD", value: "A" }, // A
        { index: 1, skip: 0, type: "ADD", value: "B" }, // AB
        { index: 2, skip: 0, type: "ADD", value: "C" }, // ABC
        { index: 3, skip: 1, type: "NOOP" }, // AB
        { index: 4, skip: 3, type: "NOOP" }, // A
      ],
      expected: { skip: -1, result: "" },
    },
    {
      title: "case 11: undo redo action",
      operations: [
        { index: 0, skip: 0, type: "ADD", value: "A" }, // A
        { index: 1, skip: 1, type: "NOOP" }, // ""
        { index: 2, skip: 0, type: "ADD", value: "B" }, // B
        { index: 3, skip: 0, type: "ADD", value: "C" }, // BC
      ],
      expected: { skip: 1, result: "B" },
    },
    {
      title: "case 12: undo redo undo",
      operations: [
        { index: 0, skip: 0, type: "ADD", value: "A" }, // A
        { index: 1, skip: 0, type: "ADD", value: "B" }, // AB
        { index: 2, skip: 1, type: "NOOP", value: "" }, // A
        { index: 3, skip: 0, type: "ADD", value: "B" }, // AB
        { index: 4, skip: 1, type: "NOOP", value: "" }, // A
      ],
      expected: { skip: -1, result: "" }, // <-- you would expect the result to be ""
    },
    {
      title: "case 12.1: undo redo chain",
      operations: [
        { index: 0, skip: 0, type: "ADD", value: "A" }, // A
        { index: 1, skip: 0, type: "ADD", value: "B" }, // AB
        { index: 2, skip: 1, type: "NOOP", value: "" }, // A
        { index: 3, skip: 0, type: "ADD", value: "B" }, // AB
        { index: 4, skip: 1, type: "NOOP", value: "" }, // A
        { index: 5, skip: 0, type: "ADD", value: "B" }, // AB
        { index: 6, skip: 1, type: "NOOP", value: "" }, // A
        { index: 7, skip: 0, type: "ADD", value: "B" }, // AB
        { index: 8, skip: 1, type: "NOOP", value: "" }, // A
      ],
      expected: { skip: -1, result: "" }, // <-- you would expect the result to be ""
    },
    {
      title: "case 12.2: non-empty undo redo undo",
      operations: [
        { index: 0, skip: 0, type: "ADD", value: "F" }, // F
        { index: 1, skip: 0, type: "ADD", value: "A" }, // FA
        { index: 2, skip: 0, type: "ADD", value: "B" }, // FAB
        { index: 3, skip: 1, type: "NOOP", value: "" }, // FA
        { index: 4, skip: 0, type: "ADD", value: "B" }, // FAB
        { index: 5, skip: 1, type: "NOOP", value: "" }, // FA
      ],
      expected: { skip: 5, result: "F" }, // <-- you would expect the result to be "F"
    },
    {
      title: "case 12.3: two reshuffles",
      operations: [
        { index: 0, skip: 0, type: "ADD", value: "1A" }, // 1A
        { index: 1, skip: 0, type: "ADD", value: "1B" }, // 1A1B
        { index: 2, skip: 1, type: "ADD", value: "2A" }, // 1A2A   <-- reshuffle start
        { index: 3, skip: 0, type: "ADD", value: "1B" }, // 1A2A1B <-- reshuffle complete
        { index: 4, skip: 1, type: "ADD", value: "2B" }, // 1A2A2B <-- another reshuffle start
        { index: 5, skip: 0, type: "ADD", value: "1B" }, // 1A2A2B1B <-- reshuffle complete
      ],
      expected: { skip: 1, result: "1A2A2B" },
    },
    {
      title: "case 12.4: big reshuffle",
      operations: [
        { index: 0, skip: 0, type: "ADD", value: "1A" }, // 1A
        { index: 1, skip: 0, type: "ADD", value: "1B" }, // 1A1B
        { index: 2, skip: 1, type: "ADD", value: "2A" }, // 1A2A   <-- another operation came in, reshuffle start
        { index: 3, skip: 0, type: "ADD", value: "2B" }, // 1A2A2B
        { index: 4, skip: 0, type: "ADD", value: "1B" }, // 1A2A2B1B <-- reshuffle complete
      ],
      expected: { skip: 1, result: "1A2A2B" },
    },
    {
      title: "case 12.5: full reshuffle",
      operations: [
        { index: 0, skip: 0, type: "ADD", value: "1A" }, // 1A
        { index: 1, skip: 0, type: "ADD", value: "1B" }, // 1A1B
        { index: 2, skip: 2, type: "ADD", value: "2A" }, // 2A <-- reshuffle starts
        { index: 3, skip: 0, type: "ADD", value: "1A" }, // 2A1A
        { index: 4, skip: 0, type: "ADD", value: "2B" }, // 2A1A2B
        { index: 5, skip: 0, type: "ADD", value: "1B" }, // 2A1A2B1B <-- reshuffle complete
      ],
      expected: { skip: 1, result: "2A1A2B" },
    },
    {
      title: "case 13: large indices",
      operations: [
        { index: 50, skip: 50, type: "NOOP" }, // ""
        { index: 100, skip: 49, type: "NOOP" }, // ""
        { index: 150, skip: 49, type: "NOOP" }, // ""
        { index: 151, skip: 0, type: "ADD", value: "A" }, // A
        { index: 152, skip: 0, type: "ADD", value: "B" }, // AB
        { index: 153, skip: 0, type: "ADD", value: "C" }, // ABC
        { index: 154, skip: 1, type: "NOOP" }, // AB
      ],
      expected: { skip: 3, result: "A" },
    },
    {
      title: "case 13.1: large continuous skips",
      operations: [
        { index: 50, skip: 50, type: "NOOP" }, // ""
        { index: 100, skip: 49, type: "NOOP" }, // ""
        { index: 150, skip: 49, type: "NOOP" }, // ""
        { index: 151, skip: 0, type: "ADD", value: "A" }, // A
        { index: 152, skip: 0, type: "ADD", value: "B" }, // AB
        { index: 153, skip: 0, type: "ADD", value: "C" }, // ABC
        { index: 154, skip: 1, type: "NOOP" }, // AB
        { index: 155, skip: 3, type: "NOOP" }, // A
      ],
      expected: { skip: 5, result: "" },
    },
  ];

  describe("skip calculation", () => {
    it.each(scenarios)("should calculate correct skip: $title", (testInput) => {
      const operations = buildOperations(testInput.operations);
      const result = calculateUndoSkipNumber(operations);
      expect(result).toBe(testInput.expected.skip);
    });
  });

  describe("state rebuild verification", () => {
    it.each(scenarios)(
      "should rebuild to expected state: $title",
      (testInput) => {
        const operations = buildOperations(testInput.operations);
        const calculatedSkip = calculateUndoSkipNumber(operations);
        const rebuiltState = rebuildState(testInput.operations, calculatedSkip);
        expect(rebuiltState).toBe(testInput.expected.result);
      },
    );
  });
});
