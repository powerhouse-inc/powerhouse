import { Operation } from "@document/types.js";

export type InputOperation<TGlobalState, TLocalState> = Partial<
  Omit<Operation<TGlobalState, TLocalState>, "index" | "skip">
> & {
  index: number;
  skip: number;
};

export const buildOperation = <TGlobalState, TLocalState>(
  input: InputOperation<TGlobalState, TLocalState>,
  shuffled = false,
): Operation<TGlobalState, TLocalState> => {
  if (shuffled) {
    return {
      scope: "global",
      type: "TEST",
      timestamp: new Date().toISOString(),
      input: {},
      hash: `hash-${input.index}`,
      ...input,
    } as Operation<TGlobalState, TLocalState>;
  }

  return {
    hash: `hash-${input.index}`,
    timestamp: new Date().toISOString(),
    input: {},
    scope: "global",
    type: "TEST",
    ...input,
  } as Operation<TGlobalState, TLocalState>;
};

export const buildOperations = <TGlobalState, TLocalState>(
  inputs: InputOperation<TGlobalState, TLocalState>[],
  shuffled = false,
): Operation<TGlobalState, TLocalState>[] =>
  inputs.map((i) => buildOperation(i, shuffled));
