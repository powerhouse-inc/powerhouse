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

import { ScopeFrameworkState } from '../types';

export interface ScopeFrameworkMainOperations {
    setRootPathOperation: (state: ScopeFrameworkState, action: SetRootPathAction) => void,
    addElementOperation: (state: ScopeFrameworkState, action: AddElementAction) => void,
    updateElementTypeOperation: (state: ScopeFrameworkState, action: UpdateElementTypeAction) => void,
    updateElementNameOperation: (state: ScopeFrameworkState, action: UpdateElementNameAction) => void,
    updateElementComponentsOperation: (state: ScopeFrameworkState, action: UpdateElementComponentsAction) => void,
    removeElementOperation: (state: ScopeFrameworkState, action: RemoveElementAction) => void,
    reorderElementsOperation: (state: ScopeFrameworkState, action: ReorderElementsAction) => void,
    moveElementOperation: (state: ScopeFrameworkState, action: MoveElementAction) => void,
}