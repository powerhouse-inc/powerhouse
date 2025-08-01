import type {
  ActionErrorCallback,
  ActionFromDocument,
  Operation,
  PHDocument,
  Reducer,
} from "document-model";
import { useEffect, useState } from "react";

export type DocumentDispatchCallback<TDocument extends PHDocument> = (
  operation: Operation,
  state: {
    prevState: TDocument;
    newState: TDocument;
  },
) => void;

export type DocumentDispatch<TDocument extends PHDocument> = (
  action: ActionFromDocument<TDocument>,
  callback?: DocumentDispatchCallback<TDocument>,
  onErrorCallback?: ActionErrorCallback,
) => void;

type OnErrorHandler = (error: unknown) => void;

export function useDocumentDispatch<TDocument extends PHDocument>(
  documentReducer: Reducer<TDocument> | undefined,
  initialState: TDocument | undefined,
  onError: OnErrorHandler = console.error,
): readonly [TDocument | undefined, DocumentDispatch<TDocument>, unknown] {
  const [state, setState] = useState(initialState);
  const [error, setError] = useState<unknown>();

  const onErrorHandler: OnErrorHandler = (error) => {
    setError(error);
    onError(error);
  };

  useEffect(() => {
    setState(initialState);
  }, [initialState]);

  const dispatch: DocumentDispatch<TDocument> = (
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
