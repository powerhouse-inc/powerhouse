import { ActionType } from '../../../document/utils';

import {
    AddOperationInput,
    SetOperationNameInput,
    SetOperationSchemaInput,
    SetOperationDescriptionInput,
    SetOperationTemplateInput,
    SetOperationReducerInput,
    MoveOperationInput,
    DeleteOperationInput,
    ReorderModuleOperationsInput,
} from '@acaldas/document-model-graphql/document-model';

export type AddOperationAction = ActionType<'ADD_OPERATION', AddOperationInput>;
export type SetOperationNameAction = ActionType<'SET_OPERATION_NAME', SetOperationNameInput>;
export type SetOperationSchemaAction = ActionType<'SET_OPERATION_SCHEMA', SetOperationSchemaInput>;
export type SetOperationDescriptionAction = ActionType<'SET_OPERATION_DESCRIPTION', SetOperationDescriptionInput>;
export type SetOperationTemplateAction = ActionType<'SET_OPERATION_TEMPLATE', SetOperationTemplateInput>;
export type SetOperationReducerAction = ActionType<'SET_OPERATION_REDUCER', SetOperationReducerInput>;
export type MoveOperationAction = ActionType<'MOVE_OPERATION', MoveOperationInput>;
export type DeleteOperationAction = ActionType<'DELETE_OPERATION', DeleteOperationInput>;
export type ReorderModuleOperationsAction = ActionType<'REORDER_MODULE_OPERATIONS', ReorderModuleOperationsInput>;

export type DocumentModelOperationAction = 
    | AddOperationAction
    | SetOperationNameAction
    | SetOperationSchemaAction
    | SetOperationDescriptionAction
    | SetOperationTemplateAction
    | SetOperationReducerAction
    | MoveOperationAction
    | DeleteOperationAction
    | ReorderModuleOperationsAction
;