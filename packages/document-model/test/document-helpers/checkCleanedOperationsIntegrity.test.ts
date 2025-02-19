import { describe, expect, it } from "vitest";
import {
  checkCleanedOperationsIntegrity,
  IntegrityIssueSubType,
  IntegrityIssueType,
} from "../../src/document/utils/document-helpers.js";
import { buildOperations } from "./utils.js";

describe("checkCleanedOperationsIntegrity", () => {
  const validScenarios = [
    { title: "case 1", operations: [], expected: 0 },
    { title: "case 2", operations: [{ index: 1, skip: 1 }], expected: 0 },
    {
      title: "case 3",
      operations: [
        { index: 0, skip: 0 },
        { index: 1, skip: 0 },
        { index: 2, skip: 0 },
        { index: 3, skip: 0 },
        { index: 4, skip: 0 },
        { index: 5, skip: 0 },
      ],
      expected: 0,
    },
    {
      title: "case 4",
      operations: [
        { index: 0, skip: 0 },
        { index: 2, skip: 1 },
        { index: 3, skip: 0 },
        { index: 4, skip: 0 },
        { index: 5, skip: 0 },
      ],
      expected: 0,
    },
    {
      title: "case 5",
      operations: [
        { index: 0, skip: 0 },
        { index: 3, skip: 2 },
        { index: 4, skip: 0 },
        { index: 5, skip: 0 },
      ],
      expected: 0,
    },
    {
      title: "case 6",
      operations: [
        { index: 0, skip: 0 },
        { index: 3, skip: 2 },
        { index: 5, skip: 1 },
      ],
      expected: 0,
    },
  ];

  const invalidScenarios = [
    { title: "case 1", operations: [{ index: 0, skip: 3 }], expected: 1 },
    { title: "case 2", operations: [{ index: 1, skip: 2 }], expected: 1 },
    {
      title: "case 3",
      operations: [
        { index: 0, skip: 0 },
        { index: 1, skip: 1 },
      ],
      expected: 1,
    },
    {
      title: "case 4",
      operations: [
        { index: 0, skip: 0 },
        { index: 2, skip: 2 },
      ],
      expected: 1,
    },
    {
      title: "case 5",
      operations: [
        { index: 0, skip: 0 },
        { index: 3, skip: 2 },
        { index: 5, skip: 2 },
      ],
      expected: 1,
    },
  ];

  it.each(validScenarios)("valid:  $title", (testInput) => {
    const operations = buildOperations(testInput.operations);

    const result = checkCleanedOperationsIntegrity(operations);
    expect(result.length).toBe(testInput.expected);
  });

  it.each(invalidScenarios)("invalid: $title", (testInput) => {
    const operations = buildOperations(testInput.operations);

    const result = checkCleanedOperationsIntegrity(operations);
    expect(result.length).toBe(testInput.expected);
  });

  const missingIndexScenarios = [
    {
      title: "case 1",
      operations: [
        { index: 0, skip: 0 },
        { index: 1, skip: 0 },
        { index: 3, skip: 0 },
        { index: 4, skip: 0 },
        { index: 5, skip: 0 },
      ],
      expected: [{ index: 3, skip: 0 }],
    },
    {
      title: "case 2",
      operations: [
        { index: 1, skip: 1 },
        { index: 3, skip: 0 },
        { index: 4, skip: 0 },
        { index: 5, skip: 0 },
      ],
      expected: [{ index: 3, skip: 0 }],
    },
    {
      title: "case 3",
      operations: [
        { index: 0, skip: 0 },
        { index: 2, skip: 0 },
        { index: 5, skip: 0 },
        { index: 6, skip: 0 },
        { index: 8, skip: 0 },
      ],
      expected: [
        { index: 2, skip: 0 },
        { index: 5, skip: 0 },
        { index: 8, skip: 0 },
      ],
    },
    {
      title: "case 4",
      operations: [
        { index: 1, skip: 1 },
        { index: 5, skip: 3 },
        { index: 8, skip: 2 },
        { index: 10, skip: 0 },
        { index: 11, skip: 0 },
        { index: 13, skip: 1 },
      ],
      expected: [{ index: 10, skip: 0 }],
    },
    {
      title: "case 5",
      operations: [
        { index: 1, skip: 1 },
        { index: 5, skip: 3 },
        { index: 8, skip: 2 },
        { index: 11, skip: 1 },
        { index: 14, skip: 1 },
      ],
      expected: [
        { index: 11, skip: 1 },
        { index: 14, skip: 1 },
      ],
    },
  ];

  it.each(missingIndexScenarios)(
    "should report missing index sub error: $title",
    (testInput) => {
      const operations = buildOperations(testInput.operations);

      const result = checkCleanedOperationsIntegrity(operations);

      const expectedErrors = testInput.expected.map((op) => ({
        operation: op,
        issue: IntegrityIssueType.UNEXPECTED_INDEX,
        category: IntegrityIssueSubType.MISSING_INDEX,
      }));

      expect(result.length).toBe(expectedErrors.length);
      expect(result).toMatchObject(expectedErrors);
    },
  );

  const duplicatedIndexScenarios = [
    {
      title: "case 1",
      operations: [
        { index: 0, skip: 0 },
        { index: 1, skip: 0 },
        { index: 1, skip: 0 },
        { index: 2, skip: 0 },
        { index: 3, skip: 0 },
      ],
      expected: [{ index: 1, skip: 0 }],
    },
    {
      title: "case 2",
      operations: [
        { index: 1, skip: 1 },
        { index: 2, skip: 0 },
        { index: 2, skip: 0 },
        { index: 3, skip: 0 },
      ],
      expected: [{ index: 2, skip: 0 }],
    },
    {
      title: "case 3",
      operations: [
        { index: 0, skip: 0 },
        { index: 2, skip: 1 },
        { index: 5, skip: 2 },
        { index: 5, skip: 2 },
      ],
      expected: [{ index: 5, skip: 2 }],
    },
    {
      title: "case 4",
      operations: [
        { index: 1, skip: 1 },
        { index: 2, skip: 0 },
        { index: 3, skip: 0 },
        { index: 3, skip: 0 },
        { index: 3, skip: 0 },
        { index: 4, skip: 0 },
      ],
      expected: [
        { index: 3, skip: 0 },
        { index: 3, skip: 0 },
      ],
    },
  ];

  it.each(duplicatedIndexScenarios)(
    "should report duplicated index sub error: $title",
    (testInput) => {
      const operations = buildOperations(testInput.operations);

      const result = checkCleanedOperationsIntegrity(operations);

      const expectedErrors = testInput.expected.map((op) => ({
        operation: op,
        issue: IntegrityIssueType.UNEXPECTED_INDEX,
        category: IntegrityIssueSubType.DUPLICATED_INDEX,
      }));

      expect(result.length).toBe(expectedErrors.length);
      expect(result).toMatchObject(expectedErrors);
    },
  );

  it("should detect when an operation is both: missing index and duplicate index error", () => {
    const operations = buildOperations([
      { index: 1, skip: 1 },
      { index: 3, skip: 0 },
      { index: 3, skip: 0 },
      { index: 5, skip: 0 },
    ]);

    const result = checkCleanedOperationsIntegrity(operations);

    expect(result.length).toBe(3);
    expect(result).toMatchObject([
      {
        issue: IntegrityIssueType.UNEXPECTED_INDEX,
        category: IntegrityIssueSubType.MISSING_INDEX,
        operation: { index: 3, skip: 0 },
      },
      {
        issue: IntegrityIssueType.UNEXPECTED_INDEX,
        category: IntegrityIssueSubType.DUPLICATED_INDEX,
        operation: { index: 3, skip: 0 },
      },
      {
        issue: IntegrityIssueType.UNEXPECTED_INDEX,
        category: IntegrityIssueSubType.MISSING_INDEX,
        operation: { index: 5, skip: 0 },
      },
    ]);
  });
});
