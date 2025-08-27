import { describe, expect, it } from "vitest";

import type { Operation } from "../../src/document/types.js";
import { groupOperationsByScope } from "../../src/document/utils/document-helpers.js";
import { fakeAction } from "../helpers.js";

const fakeOperation = (
  index: number,
  skip: number,
  scope: string,
  hash: string,
): Operation => {
  return {
    index,
    skip,
    hash,
    timestampUtcMs: new Date().toISOString(),
    action: fakeAction({
      scope,
      type: "TEST",
    }),
  };
};

describe("groupOperationsByScope", () => {
  const scenarios = [
    {
      title: "case 1",
      getScenario: () => {
        const op1 = fakeOperation(0, 0, "global", "hash1");
        const op2 = fakeOperation(1, 0, "global", "hash2");
        const op3 = fakeOperation(2, 0, "global", "hash3");
        const op4 = fakeOperation(0, 0, "local", "hash4");
        const op5 = fakeOperation(1, 0, "local", "hash5");

        return {
          operations: [op1, op2, op3, op4, op5],
          expected: {
            global: [op1, op2, op3],
            local: [op4, op5],
          },
        };
      },
    },
    {
      title: "case 2",
      getScenario: () => {
        const op1 = fakeOperation(0, 0, "global", "hash1");
        const op2 = fakeOperation(1, 0, "global", "hash2");
        const op3 = fakeOperation(2, 0, "global", "hash3");
        const op4 = fakeOperation(0, 0, "local", "hash4");
        const op5 = fakeOperation(1, 0, "local", "hash5");
        const op6 = fakeOperation(3, 0, "global", "hash6");
        const op7 = fakeOperation(4, 0, "global", "hash7");
        const op8 = fakeOperation(5, 0, "global", "hash8");
        const op9 = fakeOperation(2, 0, "local", "hash9");
        const op10 = fakeOperation(3, 0, "local", "hash10");

        return {
          operations: [op1, op2, op4, op3, op5, op6, op10, op7, op8, op9],
          expected: {
            global: [op1, op2, op3, op6, op7, op8],
            local: [op4, op5, op10, op9],
          },
        };
      },
    },
    {
      title: "case 3 (only global operations)",
      getScenario: () => {
        const op1 = fakeOperation(0, 0, "global", "hash1");
        const op2 = fakeOperation(1, 0, "global", "hash2");
        const op3 = fakeOperation(2, 0, "global", "hash3");

        return {
          operations: [op1, op2, op3],
          expected: {
            global: [op1, op2, op3],
          },
        };
      },
    },
    {
      title: "case 4 (empty operations)",
      getScenario: () => ({
        operations: [],
        expected: {},
      }),
    },
    {
      title: "case 5 (only local operations)",
      getScenario: () => {
        const op1 = fakeOperation(0, 0, "local", "hash1");
        const op2 = fakeOperation(1, 0, "local", "hash2");

        return {
          operations: [op1, op2],
          expected: {
            local: [op1, op2],
          },
        };
      },
    },
  ];

  it.each(scenarios)(
    "should group operations by scope: $title",
    (testInput) => {
      const scenario = testInput.getScenario();
      const result = groupOperationsByScope(scenario.operations);

      expect(result).toMatchObject(scenario.expected);
    },
  );
});
