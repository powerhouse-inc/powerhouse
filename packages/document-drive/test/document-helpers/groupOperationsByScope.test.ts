import { groupOperationsByScope } from "document-model";
import { describe, expect, it } from "vitest";
import { buildOperations } from "../utils.js";
import { InputOperation } from "./utils.js";

describe("groupOperationsByScope", () => {
  const scenarios = [
    {
      title: "case 1",
      operations: [
        { index: 0, skip: 0, scope: "global", hash: "hash1" },
        { index: 1, skip: 0, scope: "global", hash: "hash2" },
        { index: 2, skip: 0, scope: "global", hash: "hash3" },
        { index: 0, skip: 0, scope: "local", hash: "hash4" },
        { index: 1, skip: 0, scope: "local", hash: "hash5" },
      ] as Array<InputOperation>,
      expected: {
        global: [
          { index: 0, skip: 0, scope: "global", hash: "hash1" },
          { index: 1, skip: 0, scope: "global", hash: "hash2" },
          { index: 2, skip: 0, scope: "global", hash: "hash3" },
        ],
        local: [
          { index: 0, skip: 0, scope: "local", hash: "hash4" },
          { index: 1, skip: 0, scope: "local", hash: "hash5" },
        ],
      },
    },
    {
      title: "case 2",
      operations: [
        { index: 0, skip: 0, scope: "global", hash: "hash1" },
        { index: 1, skip: 0, scope: "global", hash: "hash2" },
        { index: 0, skip: 0, scope: "local", hash: "hash4" },
        { index: 2, skip: 0, scope: "global", hash: "hash3" },
        { index: 1, skip: 0, scope: "local", hash: "hash5" },
        { index: 3, skip: 0, scope: "global", hash: "hash6" },
        { index: 3, skip: 0, scope: "local", hash: "hash10" },
        { index: 4, skip: 0, scope: "global", hash: "hash7" },
        { index: 5, skip: 0, scope: "global", hash: "hash8" },
        { index: 2, skip: 0, scope: "local", hash: "hash9" },
      ] as Array<InputOperation>,
      expected: {
        global: [
          { index: 0, skip: 0, scope: "global", hash: "hash1" },
          { index: 1, skip: 0, scope: "global", hash: "hash2" },
          { index: 2, skip: 0, scope: "global", hash: "hash3" },
          { index: 3, skip: 0, scope: "global", hash: "hash6" },
          { index: 4, skip: 0, scope: "global", hash: "hash7" },
          { index: 5, skip: 0, scope: "global", hash: "hash8" },
        ],
        local: [
          { index: 0, skip: 0, scope: "local", hash: "hash4" },
          { index: 1, skip: 0, scope: "local", hash: "hash5" },
          { index: 3, skip: 0, scope: "local", hash: "hash10" },
          { index: 2, skip: 0, scope: "local", hash: "hash9" },
        ],
      },
    },
    {
      title: "case 3 (only global operations)",
      operations: [
        { index: 0, skip: 0, scope: "global", hash: "hash1" },
        { index: 1, skip: 0, scope: "global", hash: "hash2" },
        { index: 2, skip: 0, scope: "global", hash: "hash3" },
      ] as Array<InputOperation>,
      expected: {
        global: [
          { index: 0, skip: 0, scope: "global", hash: "hash1" },
          { index: 1, skip: 0, scope: "global", hash: "hash2" },
          { index: 2, skip: 0, scope: "global", hash: "hash3" },
        ],
      },
    },
    {
      title: "case 4 (empty operations)",
      operations: [],
      expected: {},
    },
    {
      title: "case 5 (only local operations)",
      operations: [
        { index: 0, skip: 0, scope: "local", hash: "hash1" },
        { index: 1, skip: 0, scope: "local", hash: "hash2" },
      ] as Array<InputOperation>,
      expected: {
        local: [
          { index: 0, skip: 0, scope: "local", hash: "hash1" },
          { index: 1, skip: 0, scope: "local", hash: "hash2" },
        ],
      },
    },
  ];

  it.each(scenarios)(
    "should group operations by scope: $title",
    (testInput) => {
      const operations = buildOperations(testInput.operations);

      const result = groupOperationsByScope(operations);

      expect(result).toMatchObject(testInput.expected);
    },
  );
});
