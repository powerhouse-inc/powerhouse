import type {
  Action,
  ActionErrorCallback,
  BaseDocument,
  CustomAction,
  Operation,
  Reducer,
} from "document-model";
import { useEffect, useState } from "react";

export type DocumentDispatchCallback<TGlobalState, TLocalState> = (
  operation: Operation,
  state: {
    prevState: BaseDocument<TGlobalState, TLocalState>;
    newState: BaseDocument<TGlobalState, TLocalState>;
  },
) => void;

export type DocumentDispatch<
  TGlobalState,
  TLocalState,
  TAction extends CustomAction = never,
> = (
  action: TAction | Action | CustomAction,
  callback?: DocumentDispatchCallback<TGlobalState, TLocalState>,
  onErrorCallback?: ActionErrorCallback,
) => void;

type OnErrorHandler = (error: unknown) => void;

export function useDocumentDispatch<
  TGlobalState,
  TLocalState,
  TAction extends CustomAction = never,
>(
  documentReducer:
    | Reducer<TGlobalState, TLocalState, TAction | Action | CustomAction>
    | undefined,
  initialState: BaseDocument<TGlobalState, TLocalState> | undefined,
  onError: OnErrorHandler = console.error,
): readonly [
  BaseDocument<TGlobalState, TLocalState> | undefined,
  DocumentDispatch<TGlobalState, TLocalState, TAction>,
  unknown,
] {
  const [state, setState] = useState(initialState);
  const [error, setError] = useState<unknown>();

  const onErrorHandler: OnErrorHandler = (error) => {
    setError(error);
    onError(error);
  };

  useEffect(() => {
    setState(initialState);
  }, [initialState]);

  const dispatch: DocumentDispatch<TGlobalState, TLocalState, TAction> = (
    action,
    callback,
    onErrorCallback?: ActionErrorCallback,
  ) => {
    setError(undefined);
    setState((_state) => {
      if (!documentReducer || !_state) return _state;

      try {
        const newState = documentReducer(_state, action);
        const scope = action.scope ?? "global";
        const operations = newState.operations[scope];
        const operation = operations[operations.length - 1];

        if (operation.error) {
          const error = new Error(operation.error);

          onErrorHandler(error);
          onErrorCallback?.(error);
        }

        callback?.(operation, {
          prevState: { ..._state },
          newState: { ...newState },
        });

        return newState;
      } catch (error) {
        onErrorHandler(error);
        onErrorCallback?.(error);
        return _state;
      }
    });
  };

  return [state, dispatch, error] as const;
}
