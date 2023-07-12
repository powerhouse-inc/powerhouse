import { Action, Operation } from '../src/document/types';
import { createAction, createReducer } from '../src/document/utils';

// Empty reducer that supports base actions
export const emptyReducer = createReducer(state => state);

// Counter reducer that supports increment/decrement actions
export interface IncrementAction extends Action {
    type: 'INCREMENT';
}
export interface DecrementAction extends Action {
    type: 'DECREMENT';
}
export type CountAction = IncrementAction | DecrementAction;

export type CountState = { count: number };

export const increment = () => createAction<IncrementAction>('INCREMENT');
export const decrement = () => createAction<DecrementAction>('DECREMENT');

export const countReducer = createReducer<CountState, CountAction>(
    (document, action) => {
        switch (action.type) {
            case 'INCREMENT':
                return {
                    ...document,
                    state: { count: document.state.count + 1 },
                };
            case 'DECREMENT':
                return {
                    ...document,
                    state: { count: document.state.count - 1 },
                };
            default:
                return document;
        }
    }
);

export const mapOperations = (operations: Operation[]) => {
    return operations.map(({ input, type, index }) => ({
        input,
        type,
        index,
    }));
};
