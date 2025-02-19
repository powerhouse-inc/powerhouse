import { SignalDispatch } from "../src/document/signal.js";
import {
  BaseAction,
  BaseDocument,
  CustomAction,
  DefaultAction,
  Operation,
  OperationScope,
  ReducerOptions,
  StateReducer,
} from "../src/document/types.js";
import { createAction, createReducer } from "../src/document/utils/base.js";

// Empty reducer that supports base actions
export const emptyReducer = <TGlobalState, TLocalState>(
  state: BaseDocument<TGlobalState, TLocalState>,
) => state;

export const wrappedEmptyReducer = <
  TGlobalState,
  TLocalState,
  TCustomAction extends CustomAction = never,
>(
  state: BaseDocument<TGlobalState, TLocalState>,
  action: TCustomAction | DefaultAction | Operation,
  dispatch?: SignalDispatch,
  options?: ReducerOptions,
): BaseDocument<TGlobalState, TLocalState> => {
  return emptyReducer(state);
};

// Counter reducer that supports increment/decrement actions
export type IncrementAction = BaseAction<"INCREMENT", undefined>;
export type DecrementAction = BaseAction<"DECREMENT", undefined>;
export type ErrorAction = BaseAction<"ERROR", undefined>;
export type SetLocalNameAction = BaseAction<"SET_LOCAL_NAME", string>;
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

export const baseCountReducer: StateReducer<
  CountState,
  CountLocalState,
  CountAction
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

export const mutableCountReducer: StateReducer<
  CountState,
  CountLocalState,
  CountAction
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

export const countReducer = createReducer<
  CountState,
  CountLocalState,
  CountAction
>(baseCountReducer);

export const mapOperations = (operations: Operation[]) => {
  return operations.map(({ input, type, index, scope, skip }) => ({
    input,
    type,
    index,
    scope,
    skip,
  }));
};

export const createFakeOperation = (
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
  }) as Operation;
