import type {
  BaseAction,
  ExtendedState,
  PartialState,
  Reducer,
  ActionErrorCallback,
  BaseDocument,
} from "document-model";
import { useState } from "react";

export function wrapReducer<
  TGlobalState,
  TLocalState,
  TAction extends BaseAction,
>(
  reducer: Reducer<TGlobalState, TLocalState, TAction>,
  onError?: (error: unknown) => void,
): Reducer<TGlobalState, TLocalState, TAction> {
  return (state, action) => {
    try {
      return reducer(state, action);
    } catch (error) {
      onError?.(error);
      return state;
    }
  };
}

export function createUseDocumentReducer<
  TGlobalState,
  TLocalState,
  TAction extends BaseAction,
>(
  reducer: Reducer<TGlobalState, TLocalState, TAction>,
  createDocument: (
    document?: Partial<
      ExtendedState<PartialState<TGlobalState>, PartialState<TLocalState>>
    >,
  ) => BaseDocument<TGlobalState, TLocalState, TAction>,
) {
  return (
    document?: Partial<
      ExtendedState<PartialState<TGlobalState>, PartialState<TLocalState>>
    >,
    onError?: (error: unknown) => void,
  ) => useDocumentReducer(reducer, createDocument(document), onError);
}

export function useDocumentReducer<
  TGlobalState,
  TLocalState,
  TAction extends BaseAction,
>(
  reducer: Reducer<TGlobalState, TLocalState, TAction>,
  initialState: BaseDocument<TGlobalState, TLocalState, TAction>,
  onError?: (error: unknown) => void,
): readonly [
  BaseDocument<TGlobalState, TLocalState, TAction>,
  (action: TAction) => void,
] {
  const [state, setState] = useState(initialState);

  const dispatch = (action: TAction, onErrorCallback?: ActionErrorCallback) => {
    setState((_state) => {
      try {
        const newState = reducer(_state, action);

        const operation = newState.operations[action.scope].slice(-1)[0];

        if (operation.error) {
          const error = new Error(operation.error);
          onError?.(error);
          onErrorCallback?.(error);
        }

        return newState;
      } catch (error) {
        onError?.(error);
        onErrorCallback?.(error);
        return _state;
      }
    });
  };

  return [state, dispatch] as const;
}
