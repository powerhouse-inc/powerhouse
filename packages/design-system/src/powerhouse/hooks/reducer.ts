import {
    Action,
    BaseAction,
    Document,
    ExtendedState,
    Reducer,
} from '@/powerhouse';
import { useReducer } from 'react';

export function wrapReducer<State, A extends Action, LocalState>(
    reducer: Reducer<State, A, LocalState>,
    onError?: (error: unknown) => void,
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

export function createUseDocumentReducer<State, A extends Action, LocalState>(
    reducer: Reducer<State, A, LocalState>,
    createDocument: (
        document?: Partial<ExtendedState<Partial<State>>>,
    ) => Document<State, A, LocalState>,
) {
    return (
        document?: Partial<ExtendedState<Partial<State>>>,
        onError?: (error: unknown) => void,
    ) => useDocumentReducer(reducer, createDocument(document), onError);
}

export function useDocumentReducer<State, A extends Action, LocalState>(
    reducer: Reducer<State, A, LocalState>,
    initialState: Document<State, A, LocalState>,
    onError?: (error: unknown) => void,
): readonly [Document<State, A, LocalState>, (action: A | BaseAction) => void] {
    const [state, dispatch] = useReducer(
        wrapReducer(reducer, onError),
        initialState,
    );

    return [state, dispatch] as const;
}
