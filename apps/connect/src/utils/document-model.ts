import type {
    Action,
    ActionErrorCallback,
    BaseAction,
    Document,
    Operation,
    Reducer,
} from 'document-model/document';
import { useEffect, useState } from 'react';
import { logger } from 'src/services/logger';

export type DocumentDispatchCallback<State, A extends Action, LocalState> = (
    operation: Operation,
    state: {
        prevState: Document<State, A, LocalState>;
        newState: Document<State, A, LocalState>;
    },
) => void;

export type DocumentDispatch<State, A extends Action, LocalState> = (
    action: A | BaseAction,
    callback?: DocumentDispatchCallback<State, A, LocalState>,
    onErrorCallback?: ActionErrorCallback,
) => void;

export function wrapReducer<State, A extends Action, LocalState>(
    reducer: Reducer<State, A, LocalState> | undefined,
    onError?: (error: unknown) => void,
): Reducer<State, A, LocalState> {
    return (state, action) => {
        if (!reducer) return state;
        try {
            return reducer(state, action);
        } catch (error) {
            onError?.(error);
            return state;
        }
    };
}

type OnErrorHandler = (error: unknown) => void;

export function useDocumentDispatch<State, A extends Action, LocalState>(
    documentReducer: Reducer<State, A, LocalState> | undefined,
    initialState: Document<State, A, LocalState>,
    onError: OnErrorHandler = logger.error,
): readonly [
    Document<State, A, LocalState> | undefined,
    DocumentDispatch<State, A, LocalState>,
    unknown,
] {
    const [state, setState] = useState(initialState);
    const [error, setError] = useState<unknown>();

    const onErrorHandler: OnErrorHandler = error => {
        setError(error);
        onError(error);
    };

    useEffect(() => {
        setState(initialState);
    }, [initialState]);

    const dispatch: DocumentDispatch<State, A, LocalState> = (
        action,
        callback,
        onErrorCallback?: ActionErrorCallback,
    ) => {
        setError(undefined);
        setState(_state => {
            if (!documentReducer) return _state;

            try {
                const newState = documentReducer(_state, action);
                const scope = action.scope ?? 'global';
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
