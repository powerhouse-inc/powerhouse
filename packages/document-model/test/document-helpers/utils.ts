import type { Operation } from "document-model";
import { fakeAction } from "document-model";

export type InputOperation = Partial<Omit<Operation, "index" | "skip">> & {
  index: number;
  skip: number;
  type?: string;
};

export const buildOperation = (
  input: InputOperation,
  shuffled = false,
): Operation => {
  if (shuffled) {
    return {
      action: fakeAction({
        type: input.type ?? "TEST",
        input: {},
        scope: "global",
      }),
      timestampUtcMs: new Date().toISOString(),
      hash: `hash-${input.index}`,
      ...input,
    } as Operation;
  }

  return {
    hash: `hash-${input.index}`,
    timestampUtcMs: new Date().toISOString(),
    action: fakeAction({
      type: input.type ?? "TEST",
      input: {},
      scope: "global",
    }),
    ...input,
  } as Operation;
};

export const buildOperations = (
  inputs: InputOperation[],
  shuffled = false,
): Operation[] => inputs.map((i) => buildOperation(i, shuffled));
