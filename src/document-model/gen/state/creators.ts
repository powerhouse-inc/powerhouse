import {
    SetStateSchemaAction,
    AddStateExampleAction,
    UpdateStateExampleAction,
    DeleteStateExampleAction,
    ReorderStateExamplesAction,
} from './actions';

import { createAction } from '../../../document/utils'; 

export const setStateSchema = (schema: string) => 
    createAction<SetStateSchemaAction>(
        'SET_STATE_SCHEMA',
        { schema }
    );

export const addStateExample = (example: string, insertBefore?: string) => 
    createAction<AddStateExampleAction>(
        'ADD_STATE_EXAMPLE',
        { example, insertBefore }
    );

export const updateStateExample = (id: string, newExample: string) => 
    createAction<UpdateStateExampleAction>(
        'UPDATE_STATE_EXAMPLE',
        { id, newExample }
    );

export const deleteStateExample = (id: string) => 
    createAction<DeleteStateExampleAction>(
        'DELETE_STATE_EXAMPLE',
        { id }
    );

export const reorderStateExamples = (order: string[]) => 
    createAction<ReorderStateExamplesAction>(
        'REORDER_STATE_EXAMPLES',
        { order }
    );
