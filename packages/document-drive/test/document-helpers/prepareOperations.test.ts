import { describe, expect, it } from "vitest";
import { prepareOperations } from "../../../document-model/src/document/utils/document-helpers.js";
import { buildOperations } from "../utils.js";

describe("prepareOperations", () => {
  it("should return all the operations when they are valid", () => {
    const operationsHistory = buildOperations([
      { index: 0, skip: 0 },
      { index: 1, skip: 0 },
      { index: 2, skip: 0 },
    ]);

    const newOperations = buildOperations([
      { index: 3, skip: 0 },
      { index: 4, skip: 0 },
    ]);

    const result = prepareOperations(operationsHistory, newOperations);

    expect(result.duplicatedOperations.length).toBe(0);
    expect(result.invalidOperations.length).toBe(0);
    expect(result.integrityIssues.length).toBe(0);
    expect(result.validOperations.length).toBe(2);

    expect(result.validOperations).toMatchObject([
      { index: 3, skip: 0 },
      { index: 4, skip: 0 },
    ]);
  });

  it("should return duplicated operations when there is no missing index errors", () => {
    const operationsHistory = buildOperations([
      { index: 0, skip: 0 },
      { index: 1, skip: 0 },
      { index: 2, skip: 0 },
    ]);

    const newOperations = buildOperations([
      { index: 2, skip: 0 },
      { index: 3, skip: 0 },
      { index: 3, skip: 1 },
      { index: 4, skip: 0 },
    ]);

    const result = prepareOperations(operationsHistory, newOperations);

    expect(result.invalidOperations.length).toBe(0);
    expect(result.integrityIssues.length).toBe(2);
    expect(result.duplicatedOperations).toMatchObject([
      { index: 2, skip: 0 },
      { index: 3, skip: 1 },
    ]);
    expect(result.validOperations).toMatchObject([
      { index: 3, skip: 0 },
      { index: 4, skip: 0 },
    ]);
  });

  it("should return missing index operations as invalid", () => {
    const operationsHistory = buildOperations([
      { index: 1, skip: 1 },
      { index: 3, skip: 1 },
    ]);

    const newOperations = buildOperations([
      { index: 4, skip: 0 },
      { index: 6, skip: 0 },
    ]);

    const result = prepareOperations(operationsHistory, newOperations);

    expect(result.duplicatedOperations.length).toBe(0);
    expect(result.integrityIssues.length).toBe(1);
    expect(result.validOperations.length).toBe(1);
    expect(result.invalidOperations).toMatchObject([{ index: 6, skip: 0 }]);
  });

  it("should return operations that follows a missing index as invalid", () => {
    const operationsHistory = buildOperations([
      { index: 1, skip: 1 },
      { index: 3, skip: 1 },
    ]);

    const newOperations = buildOperations([
      { index: 4, skip: 0 },
      { index: 5, skip: 0 },
      { index: 7, skip: 0 },
      { index: 8, skip: 0 },
      { index: 9, skip: 0 },
    ]);

    const result = prepareOperations(operationsHistory, newOperations);

    expect(result.duplicatedOperations.length).toBe(0);
    expect(result.integrityIssues.length).toBe(1);
    expect(result.validOperations.length).toBe(2);
    expect(result.invalidOperations).toMatchObject([
      { index: 7, skip: 0 },
      { index: 8, skip: 0 },
      { index: 9, skip: 0 },
    ]);
  });

  // This one is failing because there's no garbage collection for the new operations before checking for missing indexes
  // it.only('should return operations that follows a missing index as invalid', () => {
  //     const operationsHistory = buildOperations([
  //         { index: 1, skip: 1 },
  //         { index: 3, skip: 1 }
  //     ]);

  //     const newOperations = buildOperations([
  //         { index: 4, skip: 0 },
  //         { index: 5, skip: 0 },
  //         { index: 7, skip: 0 }, // This one should be removed by the garbage collection
  //         { index: 7, skip: 1 },
  //         { index: 8, skip: 0 },
  //         { index: 9, skip: 0 }
  //     ]);

  //     const result = prepareOperations(operationsHistory, newOperations);

  //     console.log(result);

  //     expect(result.duplicatedOperations.length).toBe(0);
  //     expect(result.integrityIssues.length).toBe(2);
  //     expect(result.validOperations.length).toBe(2);
  //     expect(result.invalidOperations).toMatchObject([{ index: 6, skip: 0 }]);
  // });

  it("should return duplicated operations that follows a missing index as invalid", () => {
    const operationsHistory = buildOperations([
      { index: 1, skip: 1 },
      { index: 3, skip: 1 },
    ]);

    const newOperations = buildOperations([
      { index: 4, skip: 0 },
      { index: 5, skip: 0 },
      { index: 5, skip: 0 },
      { index: 7, skip: 0 },
      { index: 7, skip: 0 },
      { index: 8, skip: 0 },
      { index: 9, skip: 0 },
    ]);

    const result = prepareOperations(operationsHistory, newOperations);

    expect(result.invalidOperations).toMatchObject([
      { index: 7, skip: 0 },
      { index: 7, skip: 0 },
      { index: 8, skip: 0 },
      { index: 9, skip: 0 },
    ]);
    expect(result.integrityIssues.length).toBe(3);
    expect(result.duplicatedOperations).toMatchObject([
      { index: 5, skip: 0 },
      { index: 5, skip: 0 },
    ]);
    expect(result.validOperations).toMatchObject([{ index: 4, skip: 0 }]);
  });

  it("should not return duplicated operations when all of them follows a missing index operation", () => {
    const operationsHistory = buildOperations([
      { index: 1, skip: 1 },
      { index: 2, skip: 0 },
      { index: 3, skip: 0 },
    ]);

    const newOperations = buildOperations([
      { index: 4, skip: 0 },
      { index: 5, skip: 0 },
      { index: 7, skip: 0 },
      { index: 7, skip: 0 },
      { index: 8, skip: 0 },
      { index: 8, skip: 0 },
    ]);

    const result = prepareOperations(operationsHistory, newOperations);

    expect(result.invalidOperations).toMatchObject([
      { index: 7, skip: 0 },
      { index: 7, skip: 0 },
      { index: 8, skip: 0 },
      { index: 8, skip: 0 },
    ]);
    expect(result.integrityIssues.length).toBe(3);
    expect(result.duplicatedOperations.length).toBe(0);
    expect(result.validOperations).toMatchObject([
      { index: 4, skip: 0 },
      { index: 5, skip: 0 },
    ]);
  });

  it("should not return valid operations when all of them follows a missing index operation", () => {
    const operationsHistory = buildOperations([
      { index: 1, skip: 1 },
      { index: 2, skip: 0 },
      { index: 3, skip: 0 },
    ]);

    const newOperations = buildOperations([
      { index: 5, skip: 0 },
      { index: 6, skip: 0 },
      { index: 7, skip: 0 },
      { index: 8, skip: 0 },
    ]);

    const result = prepareOperations(operationsHistory, newOperations);

    expect(result.integrityIssues.length).toBe(1);
    expect(result.duplicatedOperations.length).toBe(0);
    expect(result.validOperations.length).toBe(0);
    expect(result.invalidOperations).toMatchObject([
      { index: 5, skip: 0 },
      { index: 6, skip: 0 },
      { index: 7, skip: 0 },
      { index: 8, skip: 0 },
    ]);
  });

  it("should mark operations as invalid when they have an index bigger than the first missing index", () => {
    const operationsHistory = buildOperations([
      { index: 1, skip: 1 },
      { index: 2, skip: 0 },
      { index: 3, skip: 0 },
    ]);

    const newOperations = buildOperations([
      { index: 4, skip: 0 },
      { index: 6, skip: 0 },
      { index: 7, skip: 0 },
      { index: 9, skip: 0 },
      { index: 10, skip: 0 },
    ]);

    const result = prepareOperations(operationsHistory, newOperations);

    expect(result.integrityIssues.length).toBe(2);
    expect(result.duplicatedOperations.length).toBe(0);
    expect(result.validOperations).toMatchObject([{ index: 4, skip: 0 }]);
    expect(result.invalidOperations).toMatchObject([
      { index: 6, skip: 0 },
      { index: 7, skip: 0 },
      { index: 9, skip: 0 },
      { index: 10, skip: 0 },
    ]);
  });

  it("should mark operations as invalid when they have an index bigger than the first missing index and are duplicated", () => {
    const operationsHistory = buildOperations([
      { index: 1, skip: 1 },
      { index: 2, skip: 0 },
      { index: 3, skip: 0 },
    ]);

    const newOperations = buildOperations([
      { index: 4, skip: 0 },
      { index: 6, skip: 0 },
      { index: 6, skip: 0 },
      { index: 7, skip: 0 },
      { index: 9, skip: 0 },
      { index: 10, skip: 0 },
    ]);

    const result = prepareOperations(operationsHistory, newOperations);

    expect(result.integrityIssues.length).toBe(3);
    expect(result.duplicatedOperations.length).toBe(0);
    expect(result.validOperations).toMatchObject([{ index: 4, skip: 0 }]);
    expect(result.invalidOperations).toMatchObject([
      { index: 6, skip: 0 },
      { index: 6, skip: 0 },
      { index: 7, skip: 0 },
      { index: 9, skip: 0 },
      { index: 10, skip: 0 },
    ]);
  });

  it("should not return duplicated operations when all of them are invalid (missing index)", () => {
    const operationsHistory = buildOperations([
      { index: 1, skip: 1 },
      { index: 2, skip: 0 },
      { index: 3, skip: 0 },
    ]);

    const newOperations = buildOperations([
      { index: 5, skip: 0 },
      { index: 5, skip: 0 },
      { index: 6, skip: 0 },
      { index: 6, skip: 0 },
    ]);

    const result = prepareOperations(operationsHistory, newOperations);

    expect(result.integrityIssues.length).toBe(3);
    expect(result.duplicatedOperations.length).toBe(0);
    expect(result.validOperations.length).toBe(0);
    expect(result.invalidOperations).toMatchObject([
      { index: 5, skip: 0 },
      { index: 5, skip: 0 },
      { index: 6, skip: 0 },
      { index: 6, skip: 0 },
    ]);
  });

  it("should sort operations history", () => {
    const operationsHistory = buildOperations([
      { index: 2, skip: 0 },
      { index: 0, skip: 0 },
      { index: 1, skip: 0 },
    ]);

    const newOperations = buildOperations([
      { index: 3, skip: 0 },
      { index: 4, skip: 0 },
    ]);

    const result = prepareOperations(operationsHistory, newOperations);

    expect(result.duplicatedOperations.length).toBe(0);
    expect(result.invalidOperations.length).toBe(0);
    expect(result.integrityIssues.length).toBe(0);
    expect(result.validOperations.length).toBe(2);

    expect(result.validOperations).toMatchObject([
      { index: 3, skip: 0 },
      { index: 4, skip: 0 },
    ]);
  });

  it("should sort new operations", () => {
    const operationsHistory = buildOperations([
      { index: 0, skip: 0 },
      { index: 1, skip: 0 },
      { index: 2, skip: 0 },
    ]);

    const newOperations = buildOperations([
      { index: 6, skip: 0 },
      { index: 4, skip: 0 },
      { index: 5, skip: 0 },
      { index: 3, skip: 0 },
    ]);

    const result = prepareOperations(operationsHistory, newOperations);

    expect(result.duplicatedOperations.length).toBe(0);
    expect(result.invalidOperations.length).toBe(0);
    expect(result.integrityIssues.length).toBe(0);
    expect(result.validOperations.length).toBe(4);

    expect(result.validOperations).toMatchObject([
      { index: 3, skip: 0 },
      { index: 4, skip: 0 },
      { index: 5, skip: 0 },
      { index: 6, skip: 0 },
    ]);
  });
});
