import { createAction } from '../../../document/utils';

import {
    SetStateSchemaInput,
    SetInitialStateInput,
    AddStateExampleInput,
    UpdateStateExampleInput,
    DeleteStateExampleInput,
    ReorderStateExamplesInput,
} from '../types';
import {
    SetStateSchemaAction,
    SetInitialStateAction,
    AddStateExampleAction,
    UpdateStateExampleAction,
    DeleteStateExampleAction,
    ReorderStateExamplesAction,
} from './actions';

export const setStateSchema = (input: SetStateSchemaInput, skip = 0) =>
    createAction<SetStateSchemaAction>(
        'SET_STATE_SCHEMA',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const setInitialState = (input: SetInitialStateInput, skip = 0) =>
    createAction<SetInitialStateAction>(
        'SET_INITIAL_STATE',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const addStateExample = (input: AddStateExampleInput, skip = 0) =>
    createAction<AddStateExampleAction>(
        'ADD_STATE_EXAMPLE',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const updateStateExample = (input: UpdateStateExampleInput, skip = 0) =>
    createAction<UpdateStateExampleAction>(
        'UPDATE_STATE_EXAMPLE',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const deleteStateExample = (input: DeleteStateExampleInput, skip = 0) =>
    createAction<DeleteStateExampleAction>(
        'DELETE_STATE_EXAMPLE',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const reorderStateExamples = (input: ReorderStateExamplesInput, skip = 0) =>
    createAction<ReorderStateExamplesAction>(
        'REORDER_STATE_EXAMPLES',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );


