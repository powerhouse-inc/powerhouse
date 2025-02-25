import { garbageCollect, Operation } from "document-model";
import { describe, expect, it } from "vitest";
import { buildOperation, buildOperations } from "../utils.js";

describe("garbageCollect", () => {
  it("should return the same list of operations if there is no issues or removals", () => {
    // 0:0 1:0 2:0 => 0:0 1:0 2:0, removals 0, no issues
    const operations = buildOperations([
      { index: 0, skip: 0 },
      { index: 1, skip: 0 },
      { index: 2, skip: 0 },
    ]);

    const result = garbageCollect(operations);

    expect(result.length).toBe(operations.length);
    expect(result).toMatchObject(operations);
  });

  it("should remove a single skipped operation", () => {
    // 0:0 1:1 2:0 => 1:1 2:0, removals 1, no issues
    const op0 = buildOperation({ index: 0, skip: 0 });
    const op1 = buildOperation({ index: 1, skip: 1 });
    const op2 = buildOperation({ index: 2, skip: 0 });

    const operations = [op0, op1, op2];
    const result = garbageCollect(operations);

    expect(result.length).toBe(2);
    expect(result).toMatchObject([op1, op2]);
  });

  it("should remove all the skipped operations", () => {
    // 0:0 1:1 2:0 3:1 => 1:1 3:1, removals 2, no issues
    const op0 = buildOperation({ index: 0, skip: 0 });
    const op1 = buildOperation({ index: 1, skip: 1 });
    const op2 = buildOperation({ index: 2, skip: 0 });
    const op3 = buildOperation({ index: 3, skip: 1 });

    const operations = [op0, op1, op2, op3];
    const result = garbageCollect(operations);

    expect(result.length).toBe(2);
    expect(result).toMatchObject([op1, op3]);
  });

  it("should keep only the last operation when it skips all the previous operations", () => {
    // 0:0 1:1 2:0 3:3 => 3:3
    const op0 = buildOperation({ index: 0, skip: 0 });
    const op1 = buildOperation({ index: 1, skip: 1 });
    const op2 = buildOperation({ index: 2, skip: 0 });
    const op3 = buildOperation({ index: 3, skip: 3 });

    const operations = [op0, op1, op2, op3];
    const result = garbageCollect(operations);

    expect(result.length).toBe(1);
    expect(result).toMatchObject([op3]);
  });

  it("should not increase removals if an skipped operation is not present", () => {
    // 1:1 2:0 3:0 => 1:1 2:0 3:0, removals 0, no issues
    const op0 = buildOperation({ index: 1, skip: 1 });
    const op1 = buildOperation({ index: 2, skip: 0 });
    const op2 = buildOperation({ index: 3, skip: 0 });

    const operations = [op0, op1, op2];
    const result = garbageCollect(operations);

    expect(result.length).toBe(3);
    expect(result).toMatchObject(operations);
  });

  it("should return an empty array if there is no operations", () => {
    const result = garbageCollect([]);
    expect(result).toMatchObject([]);
  });

  it("should return the same single operation if there is no skip value", () => {
    // 0:0 => 0:0
    const op0 = buildOperation({ index: 0, skip: 0 });

    const operations = [op0];
    const result = garbageCollect(operations);

    expect(result.length).toBe(1);
    expect(result).toMatchObject(operations);
  });

  it("should return the same single operation if the index and skip value are valid", () => {
    // 1:1 => 1:1
    const op0 = buildOperation({ index: 1, skip: 1 });

    const operations = [op0];
    const result = garbageCollect(operations);

    expect(result.length).toBe(1);
    expect(result).toMatchObject(operations);
  });

  it("should return only the latest opeartion if all the previous ones are skipped", () => {
    // [0:0 1:0 2:0 2:1 2:2] => -1
    const op0 = buildOperation({ index: 0, skip: 0 });
    const op1 = buildOperation({ index: 1, skip: 0 });
    const op2 = buildOperation({ index: 1, skip: 1 });
    const op3 = buildOperation({ index: 2, skip: 0 });
    const op4 = buildOperation({ index: 2, skip: 1 });
    const op5 = buildOperation({ index: 2, skip: 2 });

    const operations = [op0, op1, op2, op3, op4, op5];
    const result = garbageCollect(operations);

    expect(result.length).toBe(1);
    expect(result).toMatchObject([op5]);
  });

  it("should be indifferent to missing skipped operations", () => {
    const op0_x = buildOperation({ index: 0, skip: 0 });
    const op1_v = buildOperation({ index: 1, skip: 1 });
    const op2_x = buildOperation({ index: 2, skip: 0 });
    const op3_x = buildOperation({ index: 3, skip: 0 });
    const op4_x = buildOperation({ index: 4, skip: 0 });
    const op5_x = buildOperation({ index: 4, skip: 1 });
    const op6_v = buildOperation({ index: 4, skip: 2 });

    const equivalentSets: Operation[][] = [
      [op0_x, op1_v, op2_x, op3_x, op4_x, op5_x, op6_v],
      [op1_v, op2_x, op3_x, op4_x, op5_x, op6_v],
      [op0_x, op1_v, op3_x, op4_x, op5_x, op6_v],
      [op0_x, op1_v, op2_x, op4_x, op5_x, op6_v],
      [op0_x, op1_v, op2_x, op3_x, op5_x, op6_v],
      [op0_x, op1_v, op2_x, op3_x, op4_x, op6_v],
      [op1_v, op2_x, op4_x, op5_x, op6_v],
      [op0_x, op1_v, op4_x, op5_x, op6_v],
      [op0_x, op1_v, op2_x, op5_x, op6_v],
      [op0_x, op1_v, op2_x, op4_x, op6_v],
      [op1_v, op4_x, op5_x, op6_v],
      [op0_x, op1_v, op5_x, op6_v],
      [op0_x, op1_v, op4_x, op6_v],
      [op1_v, op5_x, op6_v],
      [op0_x, op1_v, op6_v],
      [op1_v, op6_v],
    ];

    for (const set of equivalentSets) {
      expect(garbageCollect(set)).toEqual([op1_v, op6_v]);
    }
  });

  it("should be idempotent", () => {
    const op0 = buildOperation({ index: 0, skip: 0 });
    const op1 = buildOperation({ index: 1, skip: 1 });
    const op2 = buildOperation({ index: 2, skip: 0 });
    const op3 = buildOperation({ index: 3, skip: 0 });
    const op4 = buildOperation({ index: 4, skip: 0 });
    const op5 = buildOperation({ index: 4, skip: 2 });

    const operations = [op0, op1, op2, op3, op4, op5];
    const result = garbageCollect(operations);

    expect(result).toHaveLength(2);
    expect(result).toEqual([op1, op5]);

    const result2 = garbageCollect(result);
    expect(result2).toEqual(result);
  });
});
