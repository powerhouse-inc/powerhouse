import type {
    Action,
    BaseAction,
    Document,
    Operation,
    Reducer,
} from 'document-model/document';
import { useMemo, useReducer, useState } from 'react';

export function wrapReducer<State, A extends Action, LocalState>(
    reducer: Reducer<State, A, LocalState>,
    onError?: (error: unknown) => void
): Reducer<State, A, LocalState> {
    return (state, action) => {
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
    onError: (error: unknown) => void = console.error
): readonly [Document<State, A, LocalState>, (action: A | BaseAction) => void] {
    const [state, dispatch] = useReducer(
        wrapReducer(reducer, onError),
        initialState
    );

    return [state, dispatch] as const;
}

export function useDocumentDispatch<State, A extends Action, LocalState>(
    documentReducer: Reducer<State, A, LocalState>,
    initialState: Document<State, A, LocalState>,
    onError: (error: unknown) => void = console.error
): readonly [
    Document<State, A, LocalState>,
    (action: A | BaseAction) => Operation
] {
    const [state, setState] = useState(initialState);
    const reducer: Reducer<State, A, LocalState> = useMemo(
        () => wrapReducer(documentReducer, onError),
        [documentReducer, onError]
    );

    function dispatch(action: A | BaseAction) {
        const newState = reducer(state, action);
        const scope = action.scope ?? 'global';
        const operations = newState.operations[scope];
        const operation = operations[operations.length - 1];
        setState(newState);
        return operation;
    }

    return [state, dispatch] as const;
}
