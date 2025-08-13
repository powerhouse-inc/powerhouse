import { describe, expect, it } from "vitest";

import { Operation } from "../../index.js";
import { skipHeaderOperations } from "../../src/document/utils/document-helpers.js";

const fakeOperation = (
  index: number,
  skip: number,
  type: string,
): Operation => {
  const timestamp = new Date().toISOString();
  return {
    index,
    skip,
    type,
    input: {},
    scope: "global",
    timestamp,
    hash: "123",
    action: {
      id: "123",
      timestamp,
      type,
      input: {},
      scope: "global",
    },
  };
};

describe("skipHeaderOperations", () => {
  const op000 = fakeOperation(0, 0, "OP_0");
  const op101 = fakeOperation(1, 0, "OP_1");
  const op202 = fakeOperation(2, 0, "OP_2");
  const op303 = fakeOperation(3, 0, "OP_3");
  const op323 = fakeOperation(3, 2, "OP_3");
  const op404 = fakeOperation(4, 0, "OP_4");

  const scenarios = [
    {
      title: "case 1: should use nextIndex and skip 1 operation",
      operations: [op000, op101, op202],
      skipHeaderOperation: { skip: 1, type: "SKIP_HEADER" },
      expected: [op000, op101],
    },
    {
      title: "case 2: should use nextIndex and skip 2 operations",
      operations: [op000, op101, op202, op303],
      skipHeaderOperation: { skip: 2, type: "SKIP_HEADER" },
      expected: [op000, op101],
    },
    {
      title:
        "case 3: should use current index from skipHeaderOperation and skip 3 operations",
      operations: [op000, op101, op202, op303],
      skipHeaderOperation: { skip: 3, index: 4, type: "SKIP_HEADER" },
      expected: [op000],
    },
    {
      title: "case 4: should return garbage collected operations",
      operations: [op000, op101, op202, op323, op404],
      skipHeaderOperation: { skip: 1, index: 5, type: "SKIP_HEADER" },
      expected: [op000, op323],
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
      fakeOperation(0, 0, "OP_0"),
      fakeOperation(1, 0, "OP_1"),
      fakeOperation(2, 0, "OP_2"),
    ];
    const skipHeaderOperation = { skip: 1, index: 1, type: "SKIP_HEADER" };

    expect(() => skipHeaderOperations(operations, skipHeaderOperation)).toThrow(
      "The skip header operation index must be greater than or equal to 2",
    );
  });
});
