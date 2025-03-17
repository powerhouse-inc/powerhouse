import { describe, expect, it } from "vitest";

import {
  attachBranch,
  checkCleanedOperationsIntegrity,
  merge,
  precedes,
  reshuffleByTimestamp,
} from "../../src/document/utils/document-helpers.js";
import { buildOperations } from "./utils.js";

describe("Conflict resolution", () => {
  it("should not include duplicated operations when resolving a merge conflict", () => {
    // target
    const trunkOperations = buildOperations([
      {
        index: 0,
        skip: 0,
        type: "T_0",
        timestamp: "2021-01-01T00:00:00.000Z",
        id: "1",
      }, // add folder
      {
        index: 1,
        skip: 0,
        type: "T_1",
        timestamp: "2021-01-02T00:00:00.000Z",
        id: "2",
      }, // add folder
      {
        index: 2,
        skip: 0,
        type: "T_2",
        timestamp: "2021-01-05T00:00:00.000Z",
        id: "5",
      }, // 5
      {
        index: 3,
        skip: 0,
        type: "T_3",
        timestamp: "2021-01-06T00:00:00.000Z",
        id: "6",
      }, // 6
      {
        index: 4,
        skip: 0,
        type: "T_4",
        timestamp: "2021-01-07T00:00:00.000Z",
        id: "7",
      }, // 7
      {
        index: 5,
        skip: 0,
        type: "T_5",
        timestamp: "2021-01-08T00:00:00.000Z",
        id: "8",
      }, // 8
    ]);

    // new operations
    const branchOperations = buildOperations([
      {
        index: 4,
        skip: 2,
        type: "B_4_2",
        timestamp: "2021-01-03T00:00:00.000Z",
        id: "3",
      }, // 3
      {
        index: 5,
        skip: 0,
        type: "B_5",
        timestamp: "2021-01-04T00:00:00.000Z",
        id: "4",
      }, // 4
      {
        index: 6,
        skip: 0,
        type: "T_2",
        timestamp: "2021-01-05T00:00:00.000Z",
        id: "5",
      }, // 5
      {
        index: 7,
        skip: 0,
        type: "T_3",
        timestamp: "2021-01-06T00:00:00.000Z",
        id: "6",
      }, // 6
    ]);

    const [newTrunk, tail] = attachBranch(trunkOperations, branchOperations);

    expect(newTrunk).toMatchObject([
      { index: 0, skip: 0, type: "T_0" }, // add folder
      { index: 1, skip: 0, type: "T_1" }, // add folder
      { index: 4, skip: 2, type: "B_4_2" }, // 3
      { index: 5, skip: 0, type: "B_5" }, // 4
      { index: 6, skip: 0, type: "T_2" }, // 5
      { index: 7, skip: 0, type: "T_3" }, // 6
    ]);

    expect(tail).toMatchObject([
      { index: 4, skip: 0, type: "T_4" }, // 7
      { index: 5, skip: 0, type: "T_5" }, // 8
    ]);

    expect(checkCleanedOperationsIntegrity(newTrunk)).toHaveLength(0);

    const newHistory = merge(trunkOperations, newTrunk, reshuffleByTimestamp);

    const newOperations = newHistory.filter(
      (op) =>
        trunkOperations.length < 1 ||
        precedes(trunkOperations[trunkOperations.length - 1], op),
    );

    expect(newOperations).toMatchObject([
      { index: 8, skip: 6, type: "B_4_2", id: "3" }, // 3
      { index: 9, skip: 0, type: "B_5", id: "4" }, // 4
      { index: 10, skip: 0, type: "T_2", id: "5" }, // 5
      { index: 11, skip: 0, type: "T_3", id: "6" }, // 6
      { index: 12, skip: 0, type: "T_4", id: "7" }, // 7
      { index: 13, skip: 0, type: "T_5", id: "8" }, // 8
    ]);
  });
});
