import { describe, expect, it } from "vitest";

import { nextSkipNumber } from "document-model";
import { buildOperations } from "./utils.js";

describe("nextSkipNumber", () => {
  const scenarios = [
    { title: "case 1", operations: [], expected: -1 },
    { title: "case 2", operations: [{ index: 0, skip: 0 }], expected: -1 },
    {
      title: "case 3",
      operations: [
        { index: 0, skip: 0 },
        { index: 1, skip: 0 },
      ],
      expected: 1,
    },
    {
      title: "case 4",
      operations: [
        { index: 0, skip: 0 },
        { index: 1, skip: 1 },
      ],
      expected: -1,
    },
    { title: "case 5", operations: [{ index: 1, skip: 1 }], expected: -1 },
    {
      title: "case 6",
      operations: [
        { index: 0, skip: 0 },
        { index: 1, skip: 0 },
        { index: 2, skip: 0 },
      ],
      expected: 1,
    },
    {
      title: "case 7",
      operations: [
        { index: 0, skip: 0 },
        { index: 1, skip: 0 },
        { index: 2, skip: 0 },
        { index: 2, skip: 1 },
      ],
      expected: 2,
    },
    {
      title: "case 8",
      operations: [
        { index: 0, skip: 0 },
        { index: 1, skip: 0 },
        { index: 2, skip: 0 },
        { index: 2, skip: 1 },
        { index: 2, skip: 2 },
      ],
      expected: -1,
    },
    {
      title: "case 9",
      operations: [
        { index: 0, skip: 0 },
        { index: 1, skip: 1 },
        { index: 2, skip: 0 },
      ],
      expected: 2,
    },
    {
      title: "case 10",
      operations: [
        { index: 0, skip: 0 },
        { index: 1, skip: 1 },
        { index: 2, skip: 2 },
      ],
      expected: -1,
    },
    {
      title: "case 11",
      operations: [
        { index: 0, skip: 0 },
        { index: 1, skip: 1 },
        { index: 2, skip: 0 },
        { index: 3, skip: 0 },
      ],
      expected: 1,
    },
    {
      title: "case 12",
      operations: [
        { index: 0, skip: 0 },
        { index: 1, skip: 1 },
        { index: 2, skip: 0 },
        { index: 3, skip: 1 },
      ],
      expected: 3,
    },
    {
      title: "case 13",
      operations: [
        { index: 0, skip: 0 },
        { index: 1, skip: 1 },
        { index: 2, skip: 0 },
        { index: 3, skip: 3 },
      ],
      expected: -1,
    },
    {
      title: "case 14",
      operations: [
        { index: 50, skip: 50 },
        { index: 100, skip: 49 },
        { index: 150, skip: 49 },
        { index: 151, skip: 0 },
        { index: 152, skip: 0 },
        { index: 153, skip: 0 },
        { index: 154, skip: 3 },
      ],
      expected: 53,
    },
    {
      title: "case 15",
      operations: [
        { index: 0, skip: 0 },
        { index: 1, skip: 0 },
        { index: 2, skip: 0 },
        { index: 3, skip: 0 },
        { index: 4, skip: 0 },
        { index: 6, skip: 1 },
      ],
      expected: 2,
    },
  ];

  it.each(scenarios)(
    "should calculate next skip number: $title",
    (testInput) => {
      const operations = buildOperations(testInput.operations);
      const result = nextSkipNumber(operations);

      expect(result).toBe(testInput.expected);
    },
  );
});
