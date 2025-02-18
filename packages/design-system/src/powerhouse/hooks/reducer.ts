import { ExtendedState, Reducer } from "@/powerhouse";
import { Action, BaseDocument, CustomAction } from "document-model";
import { useReducer } from "react";

export function wrapReducer<
  TGlobalState,
  TLocalState,
  TAction extends CustomAction = never,
>(
  reducer: Reducer<TGlobalState, TLocalState, TAction | Action | CustomAction>,
  onError?: (error: unknown) => void,
): Reducer<TGlobalState, TLocalState, TAction | Action | CustomAction> {
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
  TAction extends CustomAction = never,
>(
  reducer: Reducer<TGlobalState, TLocalState, TAction | Action | CustomAction>,
  createDocument: (
    document?: Partial<ExtendedState<TGlobalState, TLocalState>>,
  ) => BaseDocument<TGlobalState, TLocalState>,
) {
  return (
    document?: Partial<ExtendedState<TGlobalState, TLocalState>>,
    onError?: (error: unknown) => void,
  ) => useDocumentReducer(reducer, createDocument(document), onError);
}

export function useDocumentReducer<
  TGlobalState,
  TLocalState,
  TAction extends CustomAction = never,
>(
  reducer: Reducer<TGlobalState, TLocalState, TAction | Action | CustomAction>,
  initialState: BaseDocument<TGlobalState, TLocalState>,
  onError?: (error: unknown) => void,
): readonly [
  BaseDocument<TGlobalState, TLocalState>,
  (action: TAction | Action | CustomAction) => void,
] {
  const [state, dispatch] = useReducer(
    wrapReducer(reducer, onError),
    initialState,
  );

  return [state, dispatch] as const;
}
