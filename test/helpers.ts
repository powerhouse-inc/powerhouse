import { Action, createAction, createReducer } from '../src';

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
