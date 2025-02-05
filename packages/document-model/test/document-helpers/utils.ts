import { BaseAction, Operation } from "@document/types.js";

export type InputOperation<
  TGlobalState,
  TLocalState,
  TAction extends BaseAction,
> = Partial<
  Omit<Operation<TGlobalState, TLocalState, TAction>, "index" | "skip">
> & {
  index: number;
  skip: number;
};

export const buildOperation = <
  TGlobalState,
  TLocalState,
  TAction extends BaseAction,
>(
  input: InputOperation<TGlobalState, TLocalState, TAction>,
  shuffled = false,
): Operation<TGlobalState, TLocalState, TAction> => {
  if (shuffled) {
    return {
      scope: "global",
      type: "TEST",
      timestamp: new Date().toISOString(),
      input: {},
      hash: `hash-${input.index}`,
      ...input,
    } as Operation<TGlobalState, TLocalState, TAction>;
  }

  return {
    hash: `hash-${input.index}`,
    timestamp: new Date().toISOString(),
    input: {},
    scope: "global",
    type: "TEST",
    ...input,
  } as Operation<TGlobalState, TLocalState, TAction>;
};

export const buildOperations = <
  TGlobalState,
  TLocalState,
  TAction extends BaseAction,
>(
  inputs: InputOperation<TGlobalState, TLocalState, TAction>[],
  shuffled = false,
): Operation<TGlobalState, TLocalState, TAction>[] =>
  inputs.map((i) => buildOperation(i, shuffled));
