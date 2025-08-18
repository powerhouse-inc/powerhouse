import { describe, expect, it } from "vitest";
import {
  addUndo,
  checkOperationsIntegrity,
} from "../../src/document/utils/document-helpers.js";
import { buildOperations } from "./utils.js";

describe("addUndo", () => {
  const noopScenarios = [
    {
      title: "case 1",
      operations: [
        { index: 0, skip: 0 },
        { index: 1, skip: 0 },
        { index: 2, skip: 0 },
        { index: 3, skip: 1, type: "NOOP" },
      ],
      expected: {
        length: 5,
        index: 3,
        skip: 2,
      },
    },
    {
      title: "case 2",
      operations: [
        { index: 0, skip: 0 },
        { index: 1, skip: 1 },
        { index: 2, skip: 0 },
        { index: 3, skip: 0 },
        { index: 4, skip: 1, type: "NOOP" },
      ],
      expected: {
        length: 6,
        index: 4,
        skip: 2,
      },
    },
    {
      title: "case 3",
      operations: [
        { index: 0, skip: 0 },
        { index: 1, skip: 1 },
        { index: 2, skip: 0 },
        { index: 3, skip: 0 },
        { index: 4, skip: 0 },
        { index: 5, skip: 0 },
        { index: 6, skip: 2, type: "NOOP" },
      ],
      expected: {
        length: 8,
        index: 6,
        skip: 3,
      },
    },
    {
      title: "case 4",
      operations: [
        { index: 0, skip: 0 },
        { index: 1, skip: 1 },
        { index: 2, skip: 0 },
        { index: 3, skip: 0 },
        { index: 4, skip: 2, type: "NOOP" },
      ],
      expected: {
        length: 6,
        index: 4,
        skip: 4,
      },
    },
    {
      title: "case 5",
      operations: [
        { index: 0, skip: 0 },
        { index: 1, skip: 0 },
        { index: 2, skip: 0 },
        { index: 3, skip: 1, type: "NOOP" },
        { index: 3, skip: 2, type: "NOOP" },
      ],
      expected: {
        length: 6,
        index: 3,
        skip: 3,
      },
    },
  ];

  it.each(noopScenarios)(
    "should add NOOP skip nextSkipNumber if latest operation is NOOP: $title",
    (testInput) => {
      const operations = buildOperations(testInput.operations);

      const result = addUndo(operations);
      const check = checkOperationsIntegrity(result);
      expect(check).toHaveLength(0);

      expect(result.length).toBe(testInput.expected.length);
      const lastOperation = result.pop();

      expect(lastOperation).toMatchObject({
        index: testInput.expected.index,
        skip: testInput.expected.skip,
        type: "NOOP",
      });
    },
  );

  it("should add NOOP skip 1 if latest operation is not NOOP", () => {
    const operations = buildOperations([
      { index: 0, skip: 0 },
      { index: 1, skip: 0 },
      { index: 2, skip: 0 },
    ]);

    const result = addUndo(operations);
    const check = checkOperationsIntegrity(result);
    expect(check).toHaveLength(0);

    expect(result.length).toBe(4);
    expect(result[3]).toMatchObject({
      index: 3,
      skip: 1,
      action: { type: "NOOP" },
    });
  });

  it("should return an empty array unchanged", () => {
    const operations = buildOperations([]);
    const result = addUndo(operations);
    const check = checkOperationsIntegrity(result);

    expect(check).toHaveLength(0);
    expect(result.length).toBe(0);
  });
});
