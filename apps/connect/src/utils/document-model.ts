import type {
    Action,
    BaseAction,
    Document,
    Reducer,
} from '@acaldas/document-model-libs/browser/document';
import { useReducer } from 'react';

export function wrapReducer<State, A extends Action>(
    reducer: Reducer<State, A>,
    onError?: (error: unknown) => void
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

export function useDocumentReducer<State, A extends Action>(
    reducer: Reducer<State, A>,
    initialState: Document<State, A>,
    onError: (error: unknown) => void = console.error
): readonly [Document<State, A>, (action: A | BaseAction) => void] {
    const [state, dispatch] = useReducer(
        wrapReducer(reducer, onError),
        initialState
    );

    return [state, dispatch] as const;
}
