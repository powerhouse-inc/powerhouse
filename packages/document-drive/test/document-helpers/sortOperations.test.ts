import { sortOperations } from "document-model";
import { describe, expect, it } from "vitest";
import { buildOperations } from "./utils.js";

describe("sortOperations", () => {
  const scenarios = [
    {
      // 0:0 1:0 2:0 => 0:0 1:0 2:0
      title: "case 1",
      operations: [
        { index: 0, skip: 0 },
        { index: 1, skip: 0 },
        { index: 2, skip: 0 },
      ],
      expected: [
        { index: 0, skip: 0 },
        { index: 1, skip: 0 },
        { index: 2, skip: 0 },
      ],
    },
    {
      // 0:0 1:0 2:0 3:0 4:2 4:1 4:0 => 0:0 1:0 2:0 3:0 4:0 4:1 4:2
      title: "case 2 (with skip value)",
      operations: [
        { index: 0, skip: 0 },
        { index: 1, skip: 0 },
        { index: 2, skip: 0 },
        { index: 3, skip: 0 },
        { index: 4, skip: 2 },
        { index: 4, skip: 1 },
        { index: 4, skip: 0 },
      ],
      expected: [
        { index: 0, skip: 0 },
        { index: 1, skip: 0 },
        { index: 2, skip: 0 },
        { index: 3, skip: 0 },
        { index: 4, skip: 0 },
        { index: 4, skip: 1 },
        { index: 4, skip: 2 },
      ],
    },
    {
      // 1:1 5:0 4:0 3:0 => 1:1 3:0 4:0 5:0
      title: "case 3 (with skip value)",
      operations: [
        { index: 1, skip: 1 },
        { index: 5, skip: 0 },
        { index: 4, skip: 0 },
        { index: 3, skip: 0 },
      ],
      expected: [
        { index: 1, skip: 1 },
        { index: 3, skip: 0 },
        { index: 4, skip: 0 },
        { index: 5, skip: 0 },
      ],
    },
    {
      // 6:0 7:2 1:1 4:1 2:0 3:0 7:0 4:0 7:1 4:2 5:0 => 1:1 2:0 3:0 4:0 4:1 4:2 5:0 6:0 7:0 7:1 7:2
      title: "case 4 (with skip value)",
      operations: [
        { index: 6, skip: 0 },
        { index: 7, skip: 2 },
        { index: 1, skip: 1 },
        { index: 4, skip: 1 },
        { index: 2, skip: 0 },
        { index: 3, skip: 0 },
        { index: 7, skip: 0 },
        { index: 4, skip: 0 },
        { index: 7, skip: 1 },
        { index: 4, skip: 2 },
        { index: 5, skip: 0 },
      ],
      expected: [
        { index: 1, skip: 1 },
        { index: 2, skip: 0 },
        { index: 3, skip: 0 },
        { index: 4, skip: 0 },
        { index: 4, skip: 1 },
        { index: 4, skip: 2 },
        { index: 5, skip: 0 },
        { index: 6, skip: 0 },
        { index: 7, skip: 0 },
        { index: 7, skip: 1 },
        { index: 7, skip: 2 },
      ],
    },
    {
      // [] => []
      title: "case 5 (empty)",
      operations: [],
      expected: [],
    },
  ];

  it.each(scenarios)("should sort operations: $title", (testInput) => {
    const operations = buildOperations(testInput.operations);

    const result = sortOperations(operations);

    expect(result).toMatchObject(testInput.expected);
  });
});
