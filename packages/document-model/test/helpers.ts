import { DocumentAction } from "@document/actions/types.js";
import { SignalDispatch } from "@document/signal.js";
import {
  BaseAction,
  BaseDocument,
  ImmutableStateReducer,
  Operation,
  OperationScope,
  ReducerOptions,
} from "@document/types.js";
import { createAction, createReducer } from "@document/utils/base.js";
// Empty reducer that supports base actions
export const emptyReducer = <
  TGlobalState,
  TLocalState,
  TAction extends BaseAction,
>(
  state: BaseDocument<TGlobalState, TLocalState, TAction | DocumentAction>,
) => state;

export const wrappedEmptyReducer = <
  TGlobalState,
  TLocalState,
  TAction extends BaseAction,
>(
  state: BaseDocument<TGlobalState, TLocalState, TAction | DocumentAction>,
  action: TAction | Operation<TGlobalState, TLocalState, TAction | DocumentAction>,
  dispatch?: SignalDispatch<TGlobalState, TLocalState, TAction | DocumentAction>,
  options?: ReducerOptions,
) => {
  return emptyReducer(state);
};

// Counter reducer that supports increment/decrement actions
export interface IncrementAction extends BaseAction {
  type: "INCREMENT";
}
export interface DecrementAction extends BaseAction {
  type: "DECREMENT";
}

export interface ErrorAction extends BaseAction {
  type: "ERROR";
}

export interface SetLocalNameAction extends BaseAction {
  type: "SET_LOCAL_NAME";
  input: string;
}
export type CountAction =
  | IncrementAction
  | DecrementAction
  | SetLocalNameAction
  | ErrorAction;

export type CountState = { count: number };

export type CountLocalState = { name: string };

export const increment = () => createAction<IncrementAction>("INCREMENT");

export const decrement = () => createAction<DecrementAction>("DECREMENT");

export const error = () => createAction<ErrorAction>("ERROR");

export const setLocalName = (name: string) =>
  createAction<SetLocalNameAction>(
    "SET_LOCAL_NAME",
    name,
    undefined,
    undefined,
    "local",
  );

export const baseCountReducer: ImmutableStateReducer<
  CountState,
  CountLocalState,
  CountAction | DocumentAction
> = (state, action) => {
  switch (action.type) {
    case "INCREMENT":
      state.global.count += 1;
      break;
    case "DECREMENT":
      state.global.count -= 1;
      break;
    case "SET_LOCAL_NAME":
      state.local.name = action.input;
      break;
    case "ERROR":
      throw new Error("Error action");
    default:
      return state;
  }
};

export const mutableCountReducer: ImmutableStateReducer<
  CountState,
  CountLocalState,
  CountAction | DocumentAction
> = (state, action) => {
  switch (action.type) {
    case "INCREMENT":
      return {
        ...state,
        global: { ...state.global, count: state.global.count + 1 },
      };
    case "DECREMENT":
      return {
        ...state,
        global: { ...state.global, count: state.global.count - 1 },
      };
    case "SET_LOCAL_NAME":
      return {
        ...state,
        local: { ...state.local, name: action.input },
      };
    case "ERROR":
      throw new Error("Error action");
    default:
      return state;
  }
};

export const countReducer = createReducer(baseCountReducer);

export const mapOperations = <
  TGlobalState,
  TLocalState,
  TAction extends BaseAction,
>(
  operations: Operation<TGlobalState, TLocalState, TAction>[],
) => {
  return operations.map(({ input, type, index, scope, skip }) => ({
    input,
    type,
    index,
    scope,
    skip,
  }));
};

export const createFakeOperation = <
  TGlobalState,
  TLocalState,
  TAction extends BaseAction,
>(
  index = 0,
  skip = 0,
  scope: OperationScope = "global",
) =>
  ({
    type: "FAKE_OP",
    input: `TEST_${index}`,
    scope,
    skip,
    index,
    timestamp: new Date().toISOString(),
    hash: `${index}`,
  }) as Operation<TGlobalState, TLocalState, TAction>;
