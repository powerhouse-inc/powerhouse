import { Action } from '../../../document';
import {
    SetRootPathInput,
    AddElementInput,
    UpdateElementTypeInput,
    UpdateElementNameInput,
    UpdateElementComponentsInput,
    RemoveElementInput,
    ReorderElementsInput,
    MoveElementInput,
} from '../types';

export type SetRootPathAction = Action<'SET_ROOT_PATH', SetRootPathInput>;
export type AddElementAction = Action<'ADD_ELEMENT', AddElementInput>;
export type UpdateElementTypeAction = Action<'UPDATE_ELEMENT_TYPE', UpdateElementTypeInput>;
export type UpdateElementNameAction = Action<'UPDATE_ELEMENT_NAME', UpdateElementNameInput>;
export type UpdateElementComponentsAction = Action<'UPDATE_ELEMENT_COMPONENTS', UpdateElementComponentsInput>;
export type RemoveElementAction = Action<'REMOVE_ELEMENT', RemoveElementInput>;
export type ReorderElementsAction = Action<'REORDER_ELEMENTS', ReorderElementsInput>;
export type MoveElementAction = Action<'MOVE_ELEMENT', MoveElementInput>;

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