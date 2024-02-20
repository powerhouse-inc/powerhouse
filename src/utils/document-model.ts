import type {
    Action,
    BaseAction,
    Document,
    Operation,
    Reducer,
} from 'document-model/document';
import { useEffect, useMemo, useReducer, useState } from 'react';

export type DocumentDispatch<A> = (
    action: A | BaseAction,
    callback?: (operation: Operation) => void,
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

export function useDocumentReducer<State, A extends Action, LocalState>(
    reducer: Reducer<State, A, LocalState>,
    initialState: Document<State, A, LocalState>,
    onError: (error: unknown) => void = console.error,
): readonly [Document<State, A, LocalState>, (action: A | BaseAction) => void] {
    const [state, dispatch] = useReducer(
        wrapReducer(reducer, onError),
        initialState,
    );

    return [state, dispatch] as const;
}

export function useDocumentDispatch<State, A extends Action, LocalState>(
    documentReducer: Reducer<State, A, LocalState> | undefined,
    initialState: Document<State, A, LocalState>,
    onError: (error: unknown) => void = console.error,
): readonly [Document<State, A, LocalState>, DocumentDispatch<A>] {
    const [state, setState] = useState(initialState);
    const reducer: Reducer<State, A, LocalState> = useMemo(
        () => wrapReducer(documentReducer, onError),
        [documentReducer, onError],
    );

    useEffect(() => {
        setState(initialState);
    }, [initialState]);

    const dispatch: DocumentDispatch<A> = (action, callback) => {
        setState(_state => {
            const newState = reducer(_state, action);
            const scope = action.scope ?? 'global';
            const operations = newState.operations[scope];
            const operation = operations[operations.length - 1];

            callback?.(operation);

            return newState;
        });
    };

    return [state, dispatch] as const;
}
