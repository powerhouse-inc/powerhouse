import { type Action, generateId, type Operation } from "document-model";
import { randomUUID } from "node:crypto";

export const fakeAction = (
  // including some of the operation fields while we refactor
  params: Partial<Action> & { index?: number; hash?: string; skip?: number },
): Action =>
  ({
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...params,
  }) as Action;

export type InputOperation = Partial<Omit<Operation, "index" | "skip">> & {
  index: number;
  skip: number;
};

export const buildOperation = (
  input: InputOperation,
  shuffled = false,
): Operation => {
  const timestamp = new Date().toISOString();
  if (shuffled) {
    return {
      action: {
        // action id is different than operation id
        id: input.action?.id || generateId(),
        timestamp: input.action?.timestamp || timestamp,
        scope: "global",
        type: "TEST",
        input: {},
      },
      scope: "global",
      type: "TEST",
      timestamp,
      input: {},
      hash: `hash-${input.index}`,
      ...input,
    };
  }

  return {
    action: {
      id: input.action?.id || generateId(),
      timestamp: input.action?.timestamp || timestamp,
      scope: "global",
      type: "TEST",
      input: {},
    },
    hash: `hash-${input.index}`,
    timestamp,
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
