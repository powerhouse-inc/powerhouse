import { ActionType } from '../../../document/utils';

import {
    SetRootPathInput,
    AddElementInput,
    UpdateElementTypeInput,
    UpdateElementNameInput,
    UpdateElementComponentsInput,
    RemoveElementInput,
    ReorderElementsInput,
    MoveElementInput,
} from '@acaldas/document-model-graphql/scope-framework';

export type SetRootPathAction = ActionType<'SET_ROOT_PATH', SetRootPathInput>;
export type AddElementAction = ActionType<'ADD_ELEMENT', AddElementInput>;
export type UpdateElementTypeAction = ActionType<'UPDATE_ELEMENT_TYPE', UpdateElementTypeInput>;
export type UpdateElementNameAction = ActionType<'UPDATE_ELEMENT_NAME', UpdateElementNameInput>;
export type UpdateElementComponentsAction = ActionType<'UPDATE_ELEMENT_COMPONENTS', UpdateElementComponentsInput>;
export type RemoveElementAction = ActionType<'REMOVE_ELEMENT', RemoveElementInput>;
export type ReorderElementsAction = ActionType<'REORDER_ELEMENTS', ReorderElementsInput>;
export type MoveElementAction = ActionType<'MOVE_ELEMENT', MoveElementInput>;

export type ScopeFrameworkMainAction = 
    | SetRootPathAction
    | AddElementAction
    | UpdateElementTypeAction
    | UpdateElementNameAction
    | UpdateElementComponentsAction
    | RemoveElementAction
    | ReorderElementsAction
    | MoveElementAction
;