import { ActionType } from '../../../document/utils';

import {
    AddModuleInput,
    SetModuleNameInput,
    SetModuleDescriptionInput,
    DeleteModuleInput,
    ReorderModulesInput
} from '@acaldas/document-model-graphql/document-model';

export type AddModuleAction = ActionType<'ADD_MODULE', AddModuleInput>;
export type SetModuleNameAction = ActionType<'SET_MODULE_NAME', SetModuleNameInput>;
export type SetModuleDescriptionAction = ActionType<'SET_MODULE_DESCRIPTION', SetModuleDescriptionInput>;
export type DeleteModuleAction = ActionType<'DELETE_MODULE', DeleteModuleInput>;
export type ReorderModulesAction = ActionType<'REORDER_MODULES', ReorderModulesInput>;

export type DocumentModelModuleAction = 
    | AddModuleAction
    | SetModuleNameAction
    | SetModuleDescriptionAction
    | DeleteModuleAction
    | ReorderModulesAction;