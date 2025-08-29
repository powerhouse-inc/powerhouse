import { describe, expect, it } from "vitest";

import { filterDuplicatedOperations } from "document-model";
import { buildOperations } from "./utils.js";

describe("filterDuplicatedOperations", () => {
  const scenarios = [
    {
      title: "should filter duplicated operations",
      target: [
        { index: 0, skip: 0, type: "T_0", id: "0" },
        { index: 1, skip: 0, type: "T_1", id: "1" },
        { index: 2, skip: 0, type: "T_2", id: "2" },
        { index: 3, skip: 0, type: "T_3", id: "3" },
      ],
      source: [
        { index: 2, skip: 0, type: "T_2", id: "2" },
        { index: 3, skip: 0, type: "T_3", id: "3" },
      ],
      result: [
        { index: 0, skip: 0, type: "T_0", id: "0" },
        { index: 1, skip: 0, type: "T_1", id: "1" },
      ],
    },
    {
      title: "should remove all the operations if all of them are duplicated",
      target: [
        { index: 0, skip: 0, type: "T_0", id: "0" },
        { index: 1, skip: 0, type: "T_1", id: "1" },
        { index: 2, skip: 0, type: "T_2", id: "2" },
        { index: 3, skip: 0, type: "T_3", id: "3" },
      ],
      source: [
        { index: 0, skip: 0, type: "T_0", id: "0" },
        { index: 1, skip: 0, type: "T_1", id: "1" },
        { index: 2, skip: 0, type: "T_2", id: "2" },
        { index: 3, skip: 0, type: "T_3", id: "3" },
      ],
      result: [],
    },
    {
      title: "should return empty array if source and target are empty",
      target: [],
      source: [],
      result: [],
    },
    {
      title: "should return empty array if source target is empty",
      target: [],
      source: [
        { index: 0, skip: 0, type: "T_0", id: "0" },
        { index: 1, skip: 0, type: "T_1", id: "1" },
        { index: 2, skip: 0, type: "T_2", id: "2" },
        { index: 3, skip: 0, type: "T_3", id: "3" },
      ],
      result: [],
    },
    {
      title: "should return target operations if source is empty",
      target: [
        { index: 0, skip: 0, type: "T_0", id: "0" },
        { index: 1, skip: 0, type: "T_1", id: "1" },
        { index: 2, skip: 0, type: "T_2", id: "2" },
        { index: 3, skip: 0, type: "T_3", id: "3" },
      ],
      source: [],
      result: [
        { index: 0, skip: 0, type: "T_0", id: "0" },
        { index: 1, skip: 0, type: "T_1", id: "1" },
        { index: 2, skip: 0, type: "T_2", id: "2" },
        { index: 3, skip: 0, type: "T_3", id: "3" },
      ],
    },
    {
      title:
        "should return target operations if there is no duplicated operations",
      target: [
        { index: 0, skip: 0, type: "T_0", id: "0" },
        { index: 1, skip: 0, type: "T_1", id: "1" },
        { index: 2, skip: 0, type: "T_2", id: "2" },
        { index: 3, skip: 0, type: "T_3", id: "3" },
      ],
      source: [
        { index: 4, skip: 0, type: "T_4", id: "4" },
        { index: 5, skip: 0, type: "T_5", id: "5" },
        { index: 6, skip: 0, type: "T_6", id: "6" },
        { index: 7, skip: 0, type: "T_7", id: "7" },
      ],
      result: [
        { index: 0, skip: 0, type: "T_0", id: "0" },
        { index: 1, skip: 0, type: "T_1", id: "1" },
        { index: 2, skip: 0, type: "T_2", id: "2" },
        { index: 3, skip: 0, type: "T_3", id: "3" },
      ],
    },
    {
      title: "should remote duplicated operations that are not in order",
      target: [
        { index: 0, skip: 0, type: "T_0", id: "0" },
        { index: 1, skip: 0, type: "T_1", id: "1" },
        { index: 2, skip: 0, type: "T_2", id: "2" },
        { index: 3, skip: 0, type: "T_3", id: "3" },
        { index: 4, skip: 0, type: "T_4", id: "4" },
        { index: 5, skip: 0, type: "T_5", id: "5" },
        { index: 6, skip: 0, type: "T_6", id: "6" },
        { index: 7, skip: 0, type: "T_7", id: "7" },
      ],
      source: [
        { index: 6, skip: 0, type: "T_6", id: "6" },
        { index: 3, skip: 0, type: "T_3", id: "3" },
        { index: 1, skip: 0, type: "T_1", id: "1" },
        { index: 4, skip: 0, type: "T_4", id: "4" },
      ],
      result: [
        { index: 0, skip: 0, type: "T_0", id: "0" },
        { index: 2, skip: 0, type: "T_2", id: "2" },
        { index: 5, skip: 0, type: "T_5", id: "5" },
        { index: 7, skip: 0, type: "T_7", id: "7" },
      ],
    },
  ];

  it.each(scenarios)("$title", (testInput) => {
    const targetOperations = buildOperations(testInput.target);
    const sourceOperations = buildOperations(testInput.source);
    const result = filterDuplicatedOperations(
      targetOperations,
      sourceOperations,
    );

    expect(result).toMatchObject(testInput.result);
  });
});
