import { Operation } from "document-model/document";

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
    };
  }

  return {
    hash: `hash-${input.index}`,
    timestamp: new Date().toISOString(),
    input: {},
    scope: "global",
    type: "TEST",
    ...input,
  };
};

export const buildOperations = (
  inputs: InputOperation[],
  shuffled = false,
): Operation[] => inputs.map((i) => buildOperation(i, shuffled));
