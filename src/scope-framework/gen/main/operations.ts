import {
    SetRootPathAction,
    AddElementAction,
    UpdateElementTypeAction,
    UpdateElementNameAction,
    UpdateElementComponentsAction,
    RemoveElementAction,
    ReorderElementsAction,
    MoveElementAction,
} from './actions';

import { ExtendedScopeFrameworkState } from '../types';

export interface ScopeFrameworkMainOperations {
    setRootPathOperation: (state: ExtendedScopeFrameworkState, action: SetRootPathAction) => void,
    addElementOperation: (state: ExtendedScopeFrameworkState, action: AddElementAction) => void,
    updateElementTypeOperation: (state: ExtendedScopeFrameworkState, action: UpdateElementTypeAction) => void,
    updateElementNameOperation: (state: ExtendedScopeFrameworkState, action: UpdateElementNameAction) => void,
    updateElementComponentsOperation: (state: ExtendedScopeFrameworkState, action: UpdateElementComponentsAction) => void,
    removeElementOperation: (state: ExtendedScopeFrameworkState, action: RemoveElementAction) => void,
    reorderElementsOperation: (state: ExtendedScopeFrameworkState, action: ReorderElementsAction) => void,
    moveElementOperation: (state: ExtendedScopeFrameworkState, action: MoveElementAction) => void,
}