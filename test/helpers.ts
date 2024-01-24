import {
    Action,
    ImmutableStateReducer,
    Operation,
    OperationScope,
} from '../src/document/types';
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

export interface SetLocalNameAction extends Action {
    type: 'SET_LOCAL_NAME';
    input: string;
}
export type CountAction =
    | IncrementAction
    | DecrementAction
    | SetLocalNameAction;

export type CountState = { count: number };

export type CountLocalState = { name: string };

export const increment = () => createAction<IncrementAction>('INCREMENT');

export const decrement = () => createAction<DecrementAction>('DECREMENT');

export const setLocalName = (name: string) =>
    createAction<SetLocalNameAction>(
        'SET_LOCAL_NAME',
        name,
        undefined,
        undefined,
        'local',
    );

export const baseCountReducer: ImmutableStateReducer<
    CountState,
    CountAction,
    CountLocalState
> = (state, action) => {
    switch (action.type) {
        case 'INCREMENT':
            state.global.count += 1;
            break;
        case 'DECREMENT':
            state.global.count -= 1;
            break;
        case 'SET_LOCAL_NAME':
            state.local.name = action.input;
            break;
        default:
            return state;
    }
};

export const countReducer = createReducer<
    CountState,
    CountAction,
    CountLocalState
>(baseCountReducer);

export const mapOperations = (operations: Operation[]) => {
    return operations.map(({ input, type, index, scope, skip }) => ({
        input,
        type,
        index,
        scope,
        skip,
    }));
};

export const createFakeOperation = (
    index = 0,
    skip = 0,
    scope: OperationScope = 'global',
) =>
    ({
        type: 'FAKE_OP',
        input: `TEST_${index}`,
        scope,
        skip,
        index,
        timestamp: new Date().toISOString(),
        hash: `${index}`,
    }) as Operation;
