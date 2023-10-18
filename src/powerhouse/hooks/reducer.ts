import type {
    Action,
    BaseAction,
    Document,
    ExtendedState,
    Reducer,
} from 'document-model/document';
import { useReducer } from 'react';

export function wrapReducer<State, A extends Action>(
    reducer: Reducer<State, A>,
    onError?: (error: unknown) => void,
): Reducer<State, A> {
    return (state, action) => {
        try {
            return reducer(state, action);
        } catch (error) {
            onError?.(error);
            return state;
        }
    };
}

export function createUseDocumentReducer<State, A extends Action>(
    reducer: Reducer<State, A>,
    createDocument: (
        document?: Partial<ExtendedState<Partial<State>>>,
    ) => Document<State, A>,
) {
    return (
        document?: Partial<ExtendedState<Partial<State>>>,
        onError?: (error: unknown) => void,
    ) => useDocumentReducer(reducer, createDocument(document), onError);
}

export function useDocumentReducer<State, A extends Action>(
    reducer: Reducer<State, A>,
    initialState: Document<State, A>,
    onError?: (error: unknown) => void,
): readonly [Document<State, A>, (action: A | BaseAction) => void] {
    const [state, dispatch] = useReducer(
        wrapReducer(reducer, onError),
        initialState,
    );

    return [state, dispatch] as const;
}
