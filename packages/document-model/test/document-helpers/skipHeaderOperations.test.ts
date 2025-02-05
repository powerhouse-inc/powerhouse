import { describe, expect, it } from "vitest";

import { skipHeaderOperations } from "@document/utils/document-helpers.js";

describe("skipHeaderOperations", () => {
  const scenarios = [
    {
      title: "case 1: should use nextIndex and skip 1 operation",
      operations: [
        { index: 0, skip: 0, type: "OP_0" },
        { index: 1, skip: 0, type: "OP_1" },
        { index: 2, skip: 0, type: "OP_2" },
      ],
      skipHeaderOperation: { skip: 1, type: "SKIP_HEADER" },
      expected: [
        { index: 0, skip: 0, type: "OP_0" },
        { index: 1, skip: 0, type: "OP_1" },
      ],
    },
    {
      title: "case 2: should use nextIndex and skip 2 operations",
      operations: [
        { index: 0, skip: 0, type: "OP_0" },
        { index: 1, skip: 0, type: "OP_1" },
        { index: 2, skip: 0, type: "OP_2" },
        { index: 3, skip: 0, type: "OP_3" },
      ],
      skipHeaderOperation: { skip: 2, type: "SKIP_HEADER" },
      expected: [
        { index: 0, skip: 0, type: "OP_0" },
        { index: 1, skip: 0, type: "OP_1" },
      ],
    },
    {
      title:
        "case 3: should use current index from skipHeaderOperation and skip 3 operations",
      operations: [
        { index: 0, skip: 0, type: "OP_0" },
        { index: 1, skip: 0, type: "OP_1" },
        { index: 2, skip: 0, type: "OP_2" },
        { index: 3, skip: 0, type: "OP_3" },
      ],
      skipHeaderOperation: { skip: 3, index: 4, type: "SKIP_HEADER" },
      expected: [{ index: 0, skip: 0, type: "OP_0" }],
    },
    {
      title: "case 4: should return garbage collected operations",
      operations: [
        { index: 0, skip: 0, type: "OP_0" },
        { index: 1, skip: 0, type: "OP_1" },
        { index: 2, skip: 0, type: "OP_2" },
        { index: 3, skip: 2, type: "OP_3" },
        { index: 4, skip: 0, type: "OP_4" },
      ],
      skipHeaderOperation: { skip: 1, index: 5, type: "SKIP_HEADER" },
      expected: [
        { index: 0, skip: 0, type: "OP_0" },
        { index: 3, skip: 2, type: "OP_3" },
      ],
    },
  ];

  it.each(scenarios)("should skip header operations: $title", (testInput) => {
    const result = skipHeaderOperations(
      testInput.operations,
      testInput.skipHeaderOperation,
    );

    expect(result.length).toBe(testInput.expected.length);
    expect(result).toMatchObject(testInput.expected);
  });

  it("should throw an error if try to use an index < lastIndex", () => {
    const operations = [
      { index: 0, skip: 0, type: "OP_0" },
      { index: 1, skip: 0, type: "OP_1" },
      { index: 2, skip: 0, type: "OP_2" },
    ];
    const skipHeaderOperation = { skip: 1, index: 1, type: "SKIP_HEADER" };

    expect(() => skipHeaderOperations(operations, skipHeaderOperation)).toThrow(
      "The skip header operation index must be greater than or equal to 2",
    );
  });
});
