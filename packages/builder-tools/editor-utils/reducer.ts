import type {
  Action,
  ActionErrorCallback,
  Operation,
  PHDocument,
  Reducer,
} from "document-model";
import { useState } from "react";

export function useDocumentReducer<TDocument extends PHDocument>(
  reducer: Reducer<TDocument>,
  initialState: TDocument,
  onError?: (error: unknown) => void,
): readonly [TDocument, (action: Action) => void] {
  const [state, setState] = useState(initialState);

  const dispatch = (
    action: Action | Operation,
    onErrorCallback?: ActionErrorCallback,
  ) => {
    setState((_state) => {
      try {
        // todo: force for now, while we refactor
        const newState = reducer(_state, action as Action);

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
