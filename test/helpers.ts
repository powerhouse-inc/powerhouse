import { createReducer, createAction, Action } from '../src';

// Empty reducer that supports base actions for testing
export const emptyReducer = createReducer(state => state);

// Counter reducer that supports increment/decrement actions for testing
export interface IncrementAction extends Action {
    type: 'INCREMENT';
}
export interface DecrementAction extends Action {
    type: 'DECREMENT';
}
export type CountAction = IncrementAction | DecrementAction;

export type CountState = { count: number };

export const increment = () => createAction('INCREMENT');
export const decrement = () => createAction('INCREMENT');

export const countReducer = createReducer<CountState, CountAction>(
    (state, action) => {
        switch (action.type) {
            case 'INCREMENT':
                return { ...state, data: { count: state.data.count + 1 } };
            case 'DECREMENT':
                return { ...state, data: { count: state.data.count - 1 } };
            default:
                return state;
        }
    }
);
