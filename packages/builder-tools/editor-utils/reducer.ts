import type {
  Action,
  ActionErrorCallback,
  BaseDocument,
  CustomAction,
  Reducer,
} from "document-model";
import { useState } from "react";

export function useDocumentReducer<
  TGlobalState,
  TLocalState,
  TCustomAction extends CustomAction = never,
>(
  reducer: Reducer<
    TGlobalState,
    TLocalState,
    TCustomAction | CustomAction | Action
  >,
  initialState: BaseDocument<TGlobalState, TLocalState, TCustomAction>,
  onError?: (error: unknown) => void,
): readonly [
  BaseDocument<TGlobalState, TLocalState, TCustomAction>,
  (action: TCustomAction | CustomAction | Action) => void,
] {
  const [state, setState] = useState(initialState);

  const dispatch = (
    action: TCustomAction | CustomAction | Action,
    onErrorCallback?: ActionErrorCallback,
  ) => {
    setState((_state) => {
      try {
        const newState = reducer(_state, action);

        const operation = newState.operations[action.scope].slice(-1)[0];

        if (operation.error) {
          const error = new Error(operation.error);
          onError?.(error);
          onErrorCallback?.(error);
        }

        return newState as BaseDocument<
          TGlobalState,
          TLocalState,
          TCustomAction
        >;
      } catch (error) {
        onError?.(error);
        onErrorCallback?.(error);
        return _state;
      }
    });
  };

  return [state, dispatch] as const;
}
