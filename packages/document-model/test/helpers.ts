import {
  type BaseAction,
  type Operation,
  type PHDocument,
  type StateReducer,
} from "../src/document/types.js";
import { createAction, createReducer } from "../src/document/utils/base.js";

// Empty reducer that supports base actions
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const emptyReducer: StateReducer<PHDocument> = (state, _action) => {
  return state;
};

export const wrappedEmptyReducer = createReducer(emptyReducer);

// Counter reducer that supports increment/decrement actions
export type IncrementAction = BaseAction<undefined> & { type: "INCREMENT" };
export type DecrementAction = BaseAction<undefined> & { type: "DECREMENT" };
export type ErrorAction = BaseAction<undefined> & { type: "ERROR" };
export type SetLocalNameAction = BaseAction<string> & { type: "SET_LOCAL_NAME" };
export type CountAction =
  | IncrementAction
  | DecrementAction
  | SetLocalNameAction
  | ErrorAction;

export type CountDocument = PHDocument<
  CountState,
  CountLocalState,
  CountAction
>;
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

export const baseCountReducer: StateReducer<CountDocument> = (
  state,
  action,
) => {
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

export const mutableCountReducer: StateReducer<CountDocument> = (
  state,
  action,
) => {
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

export const countReducer = createReducer<CountDocument>(baseCountReducer);

export const mapOperations = (operations: Operation[]) => {
  return operations.map(({ input, type, index, scope, skip }) => ({
    input,
    type,
    index,
    scope,
    skip,
  }));
};

export const createFakeOperation = (index = 0, skip = 0, scope = "global") =>
  ({
    type: "FAKE_OP",
    input: `TEST_${index}`,
    scope,
    skip,
    index,
    timestamp: new Date().toISOString(),
    hash: `${index}`,
  }) as Operation;
