import { attachBranch } from "document-model";
import { describe, expect, it } from "vitest";
import { checkCleanedOperationsIntegrity } from "../../../document-model/src/document/utils/document-helpers.js";
import { buildOperations } from "./utils.js";

describe("attachBranch", () => {
  const scenarios = [
    {
      // [T0:0 T1:0 T2:0 T3:0] + [] = [T0:0 T1:0 T2:0 T3:0] + []
      title: "empty branch",
      trunk: [
        { index: 0, skip: 0, type: "T_0" },
        { index: 1, skip: 0, type: "T_1" },
        { index: 2, skip: 0, type: "T_2" },
        { index: 3, skip: 0, type: "T_3" },
      ],
      branch: [],
      newTrunk: [
        { index: 0, skip: 0, type: "T_0" },
        { index: 1, skip: 0, type: "T_1" },
        { index: 2, skip: 0, type: "T_2" },
        { index: 3, skip: 0, type: "T_3" },
      ],
      tail: [],
    },
    {
      // [] + [B0:0 B1:0 B2:0] = [B0:0 B1:0 B2:0] + []
      title: "empty trunk",
      trunk: [],
      branch: [
        { index: 0, skip: 0, type: "B_0" },
        { index: 1, skip: 0, type: "B_1" },
        { index: 2, skip: 0, type: "B_2" },
      ],
      newTrunk: [
        { index: 0, skip: 0, type: "B_0" },
        { index: 1, skip: 0, type: "B_1" },
        { index: 2, skip: 0, type: "B_2" },
      ],
      tail: [],
    },
    {
      // [T0:0 T1:0 T2:0 T3:0] + [B4:0 B5:0 B6:0] = [T0:0 T1:0 T2:0 T3:0 B4:0 B5:0 B6:0] + []
      title: "simple append",
      trunk: [
        { index: 0, skip: 0, type: "T_0" },
        { index: 1, skip: 0, type: "T_1" },
        { index: 2, skip: 0, type: "T_2" },
        { index: 3, skip: 0, type: "T_3" },
      ],
      branch: [
        { index: 4, skip: 0, type: "B_4" },
        { index: 5, skip: 0, type: "B_5" },
        { index: 6, skip: 0, type: "B_6" },
      ],
      newTrunk: [
        { index: 0, skip: 0, type: "T_0" },
        { index: 1, skip: 0, type: "T_1" },
        { index: 2, skip: 0, type: "T_2" },
        { index: 3, skip: 0, type: "T_3" },
        { index: 4, skip: 0, type: "B_4" },
        { index: 5, skip: 0, type: "B_5" },
        { index: 6, skip: 0, type: "B_6" },
      ],
      tail: [],
    },
    {
      // [T0:0 T1:0 T2:0 T3:0] + [B3:0 B4:0] = [T0:0 T1:0 T2:0 B3:0 B4:0] + [T3:0]
      title: "1 overlap",
      trunk: [
        { index: 0, skip: 0, type: "T_0" },
        { index: 1, skip: 0, type: "T_1" },
        { index: 2, skip: 0, type: "T_2" },
        { index: 3, skip: 0, type: "T_3" },
      ],
      branch: [
        { index: 3, skip: 0, type: "B_3" },
        { index: 4, skip: 0, type: "B_4" },
      ],
      newTrunk: [
        { index: 0, skip: 0, type: "T_0" },
        { index: 1, skip: 0, type: "T_1" },
        { index: 2, skip: 0, type: "T_2" },
        { index: 3, skip: 0, type: "B_3" },
        { index: 4, skip: 0, type: "B_4" },
      ],
      tail: [{ index: 3, skip: 0, type: "T_3" }],
    },
    {
      // [T0:0 T1:0 T2:0 T3:0] + [B1:0] = [T0:0 B1:0] + [T1:0 T2:0 T3:0]
      title: "early conflict",
      trunk: [
        { index: 0, skip: 0, type: "T_0" },
        { index: 1, skip: 0, type: "T_1" },
        { index: 2, skip: 0, type: "T_2" },
        { index: 3, skip: 0, type: "T_3" },
      ],
      branch: [{ index: 1, skip: 0, type: "B_1" }],
      newTrunk: [
        { index: 0, skip: 0, type: "T_0" },
        { index: 1, skip: 0, type: "B_1" },
      ],
      tail: [
        { index: 1, skip: 0, type: "T_1" },
        { index: 2, skip: 0, type: "T_2" },
        { index: 3, skip: 0, type: "T_3" },
      ],
    },
    {
      title: "discard duplicates (longer trunk)",
      trunk: [
        { index: 0, skip: 0, type: "T_0" },
        { index: 1, skip: 0, type: "T_1" },
        {
          index: 2,
          skip: 0,
          type: "T_2",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 3,
          skip: 0,
          type: "T_3",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        { index: 4, skip: 0, type: "T_4" },
        { index: 5, skip: 0, type: "T_5" },
      ],
      branch: [
        {
          index: 2,
          skip: 0,
          type: "T_2",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 3,
          skip: 0,
          type: "T_3",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        { index: 4, skip: 0, type: "B_4" },
      ],
      newTrunk: [
        { index: 0, skip: 0, type: "T_0" },
        { index: 1, skip: 0, type: "T_1" },
        {
          index: 2,
          skip: 0,
          type: "T_2",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 3,
          skip: 0,
          type: "T_3",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        { index: 4, skip: 0, type: "B_4" },
      ],
      tail: [
        { index: 4, skip: 0, type: "T_4" },
        { index: 5, skip: 0, type: "T_5" },
      ],
    },
    {
      title: "discard duplicates (longer branch)",
      trunk: [
        { index: 0, skip: 0, type: "T_0" },
        { index: 1, skip: 0, type: "T_1" },
        {
          index: 2,
          skip: 0,
          type: "T_2",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 3,
          skip: 0,
          type: "T_3",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
      ],
      branch: [
        {
          index: 2,
          skip: 0,
          type: "T_2",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 3,
          skip: 0,
          type: "T_3",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        { index: 4, skip: 0, type: "B_4" },
      ],
      newTrunk: [
        { index: 0, skip: 0, type: "T_0" },
        { index: 1, skip: 0, type: "T_1" },
        {
          index: 2,
          skip: 0,
          type: "T_2",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 3,
          skip: 0,
          type: "T_3",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        { index: 4, skip: 0, type: "B_4" },
      ],
      tail: [],
    },
    {
      // [T0:0 T1:0 T2:2 T3:0] + [T2:0 T2:1 T2:2] = [T0:0 T1:0 B4:2]
      title: "ignore irrelevant skip differences (1)",
      trunk: [
        { index: 0, skip: 0, type: "T_0" },
        { index: 1, skip: 0, type: "T_1" },
        {
          index: 2,
          skip: 2,
          type: "T_2",
          timestamp: "2021-01-03T00:00:00.000Z",
        },
        { index: 3, skip: 0, type: "T_3" },
      ],
      branch: [
        {
          index: 2,
          skip: 0,
          type: "T_2",
          timestamp: "2021-01-01T00:00:00.000Z",
        },
        {
          index: 2,
          skip: 1,
          type: "T_2",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        {
          index: 2,
          skip: 2,
          type: "T_2",
          timestamp: "2021-01-03T00:00:00.000Z",
        },
      ],
      newTrunk: [
        { index: 2, skip: 2, type: "T_2" },
        { index: 3, skip: 0, type: "T_3" },
      ],
      tail: [],
    },
    {
      // [T0:0 T1:0 T2:1 T3:0 T4:0] + [T2:0 T2:2 B3:0 B4:0] = [T2:2 B3:0 B4:0] + [T3:0 T4:0]
      title: "ignore irrelevant skip differences (2)",
      trunk: [
        { index: 0, skip: 0, type: "T_0" },
        { index: 1, skip: 0, type: "T_1" },
        {
          index: 2,
          skip: 1,
          type: "T_2",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        { index: 3, skip: 0, type: "T_3" },
        { index: 4, skip: 0, type: "T_4" },
      ],
      branch: [
        {
          index: 2,
          skip: 0,
          type: "T_2",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        {
          index: 2,
          skip: 2,
          type: "T_2",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        { index: 3, skip: 0, type: "B_3" },
        { index: 4, skip: 0, type: "B_4" },
      ],
      newTrunk: [
        {
          index: 2,
          skip: 2,
          type: "T_2",
          timestamp: "2021-01-02T00:00:00.000Z",
        },
        { index: 3, skip: 0, type: "B_3" },
        { index: 4, skip: 0, type: "B_4" },
      ],
      tail: [
        { index: 3, skip: 0, type: "T_3" },
        { index: 4, skip: 0, type: "T_4" },
      ],
    },
    {
      // [T0:0 T1:0 T2:0 T3:0] + [B4:0 B4:2] = [T0:0 T1:0 B4:2]
      title: "handle overlapping skips",
      trunk: [
        { index: 0, skip: 0, type: "T_0" },
        { index: 1, skip: 0, type: "T_1" },
        { index: 2, skip: 0, type: "T_2" },
        { index: 3, skip: 0, type: "T_3" },
      ],
      branch: [
        { index: 4, skip: 0, type: "B_4_0" },
        { index: 4, skip: 2, type: "B_4_2" },
      ],
      newTrunk: [
        { index: 0, skip: 0, type: "T_0" },
        { index: 1, skip: 0, type: "T_1" },
        { index: 4, skip: 2, type: "B_4_2" },
      ],
      tail: [],
    },
  ];

  it.each(scenarios)(
    "should return the new trunk and tail ($title)",
    (testInput) => {
      const trunkOperations = buildOperations(testInput.trunk);
      const branchOperations = buildOperations(testInput.branch);
      const [newTrunk, tail] = attachBranch(trunkOperations, branchOperations);

      expect(newTrunk).toMatchObject(testInput.newTrunk);
      expect(tail).toMatchObject(testInput.tail);
      expect(checkCleanedOperationsIntegrity(newTrunk)).toHaveLength(0);
    },
  );
});
