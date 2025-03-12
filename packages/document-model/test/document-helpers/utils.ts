import { type Operation } from "../../src/document/types.js";

export type InputOperation = Partial<Omit<Operation, "index" | "skip">> & {
  index: number;
  skip: number;
};

export const buildOperation = (
  input: InputOperation,
  shuffled = false,
): Operation => {
  if (shuffled) {
    return {
      scope: "global",
      type: "TEST",
      timestamp: new Date().toISOString(),
      input: {},
      hash: `hash-${input.index}`,
      ...input,
    } as Operation;
  }

  return {
    hash: `hash-${input.index}`,
    timestamp: new Date().toISOString(),
    input: {},
    scope: "global",
    type: "TEST",
    ...input,
  } as Operation;
};

export const buildOperations = (
  inputs: InputOperation[],
  shuffled = false,
): Operation[] => inputs.map((i) => buildOperation(i, shuffled));
