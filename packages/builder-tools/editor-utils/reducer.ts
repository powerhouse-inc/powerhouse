import type {
  Action,
  ActionErrorCallback,
  PHBaseState,
  PHDocument,
  Reducer,
} from "document-model";
import { useState } from "react";

export function useDocumentReducer<TState extends PHBaseState = PHBaseState>(
  reducer: Reducer<TState>,
  initialState: PHDocument<TState>,
  onError?: (error: unknown) => void,
): readonly [PHDocument<TState>, (action: Action) => void] {
  const [state, setState] = useState(initialState);

  const dispatch = (action: Action, onErrorCallback?: ActionErrorCallback) => {
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
