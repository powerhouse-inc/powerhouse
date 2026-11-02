import type { PHBaseState } from "./state.js";
import type { Reducer, StateReducer } from "./types.js";

const STATE_REDUCER = Symbol.for("powerhouse.stateReducer");

export function tagStateReducer<TState extends PHBaseState>(
  reducer: Reducer<TState>,
  stateReducer: StateReducer<TState>,
): Reducer<TState> {
  return Object.assign(reducer, { [STATE_REDUCER]: stateReducer });
}

/** The state reducer a `createReducer` reducer wraps, for base-reducer 3 derivation. */
export function stateReducerOf<TState extends PHBaseState = PHBaseState>(
  reducer: Reducer<TState>,
): StateReducer<TState> | undefined {
  return (reducer as { [STATE_REDUCER]?: StateReducer<TState> })[STATE_REDUCER];
}
