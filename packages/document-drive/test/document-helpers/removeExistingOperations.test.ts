import { Operation, removeExistingOperations } from "document-model";
import { describe, expect, it } from "vitest";
import { buildOperations } from "./utils.js";

describe("removeExistingOperations", () => {
  const scenarios = [
    {
      title: "case 1: all new operations should be applied",
      operationsHistory: [
        { index: 0, skip: 0, type: "OP_0", hash: "hash_0" },
        { index: 1, skip: 0, type: "OP_1", hash: "hash_1" },
        { index: 2, skip: 0, type: "OP_2", hash: "hash_2" },
      ],
      newOperations: [
        { index: 4, skip: 0, type: "OP_4", hash: "hash_4" },
        { index: 5, skip: 0, type: "OP_5", hash: "hash_5" },
        { index: 6, skip: 0, type: "OP_6", hash: "hash_6" },
      ],
      expected: [
        { index: 4, skip: 0, type: "OP_4", hash: "hash_4" },
        { index: 5, skip: 0, type: "OP_5", hash: "hash_5" },
        { index: 6, skip: 0, type: "OP_6", hash: "hash_6" },
      ],
    },
    {
      title:
        "case 2: return no operations, all of them already exist in the history",
      operationsHistory: [
        { index: 0, skip: 0, type: "OP_0", hash: "hash_0" },
        { index: 1, skip: 0, type: "OP_1", hash: "hash_1" },
        { index: 2, skip: 0, type: "OP_2", hash: "hash_2" },
      ],
      newOperations: [
        { index: 0, skip: 0, type: "OP_0", hash: "hash_0" },
        { index: 1, skip: 0, type: "OP_1", hash: "hash_1" },
        { index: 2, skip: 0, type: "OP_2", hash: "hash_2" },
      ],
      expected: [],
    },
    {
      title: "case 3: return only operation that does not exist in the history",
      operationsHistory: [
        { index: 0, skip: 0, type: "OP_0", hash: "hash_0" },
        { index: 1, skip: 0, type: "OP_1", hash: "hash_1" },
        { index: 2, skip: 0, type: "OP_2", hash: "hash_2" },
        { index: 3, skip: 0, type: "OP_3", hash: "hash_3" },
        { index: 4, skip: 0, type: "OP_4", hash: "hash_4" },
        { index: 5, skip: 0, type: "OP_5", hash: "hash_5" },
      ],
      newOperations: [
        { index: 4, skip: 0, type: "OP_4", hash: "hash_4" },
        { index: 5, skip: 0, type: "OP_5", hash: "hash_5" },
        { index: 6, skip: 0, type: "OP_6", hash: "hash_6" },
        { index: 7, skip: 0, type: "OP_7", hash: "hash_7" },
      ],
      expected: [
        { index: 6, skip: 0, type: "OP_6", hash: "hash_6" },
        { index: 7, skip: 0, type: "OP_7", hash: "hash_7" },
      ],
    },
    {
      title: "case 4: return only operation that does not exist in the history",
      operationsHistory: [
        { index: 0, skip: 0, type: "OP_0", hash: "hash_0" },
        { index: 2, skip: 0, type: "OP_2", hash: "hash_2" },
        { index: 4, skip: 0, type: "OP_4", hash: "hash_4" },
      ],
      newOperations: [
        { index: 0, skip: 0, type: "OP_0", hash: "hash_0" },
        { index: 1, skip: 0, type: "OP_1", hash: "hash_1" },
        { index: 2, skip: 0, type: "OP_2", hash: "hash_2" },
        { index: 3, skip: 0, type: "OP_3", hash: "hash_3" },
        { index: 4, skip: 0, type: "OP_4", hash: "hash_4" },
        { index: 5, skip: 0, type: "OP_5", hash: "hash_5" },
      ],
      expected: [
        { index: 1, skip: 0, type: "OP_1", hash: "hash_1" },
        { index: 3, skip: 0, type: "OP_3", hash: "hash_3" },
        { index: 5, skip: 0, type: "OP_5", hash: "hash_5" },
      ],
    },
  ];

  it.each(scenarios)("$title", (testInput) => {
    const newOperations = buildOperations(testInput.newOperations);
    const operationsHistory = buildOperations(testInput.operationsHistory);

    const result = removeExistingOperations(newOperations, operationsHistory);

    expect(result).toMatchObject(testInput.expected);
  });

  it("should not consider operations skipped", () => {
    const existingOperations = [
      {
        type: "NOOP",
        input: {},
        scope: "global",
        index: 0,
        timestamp: "2024-04-22T18:33:20.624Z",
        hash: "pLimr2HqW//d6upWCv4tGfI0W4c=",
        skip: 0,
      },
      {
        type: "ADD_FOLDER",
        input: { id: "1", name: "test1" },
        scope: "global",
        index: 1,
        timestamp: "2024-04-22T18:33:20.631Z",
        hash: "P6p5OmHl7FpHRN9ftOS0k+eaU4E=",
        skip: 1,
      },
      {
        type: "ADD_FOLDER",
        input: { id: "2", name: "test2" },
        scope: "global",
        index: 2,
        timestamp: "2024-04-22T18:33:20.631Z",
        hash: "5XOFEY2NKrHVyOA3c3oXDibrjwM=",
        skip: 0,
      },
    ] as Operation[];

    const operationsHistory = [
      {
        type: "ADD_FOLDER",
        input: { id: "1", name: "test1" },
        scope: "global",
        index: 0,
        timestamp: "2024-04-22T18:33:20.628Z",
        hash: "P6p5OmHl7FpHRN9ftOS0k+eaU4E=",
        skip: 0,
      },
      {
        type: "ADD_FOLDER",
        input: { id: "1", name: "test1" },
        scope: "global",
        index: 1,
        timestamp: "2024-04-22T18:33:20.630Z",
        hash: "P6p5OmHl7FpHRN9ftOS0k+eaU4E=",
        skip: 1,
      },
      {
        type: "ADD_FOLDER",
        input: { id: "2", name: "test2" },
        scope: "global",
        index: 2,
        timestamp: "2024-04-22T18:33:20.630Z",
        hash: "5XOFEY2NKrHVyOA3c3oXDibrjwM=",
        skip: 0,
      },
    ] as Operation[];

    const result = removeExistingOperations(
      existingOperations,
      operationsHistory,
    );

    expect(result).toMatchObject([]);
  });
});
