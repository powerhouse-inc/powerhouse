import { createAction } from '../../../document/utils'; 

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

export const setRootPath = (input: SetRootPathInput) =>
    createAction<SetRootPathAction>(
        'SET_ROOT_PATH',
        {...input}
    );

export const addElement = (input: AddElementInput) =>
    createAction<AddElementAction>(
        'ADD_ELEMENT',
        {...input}
    );

export const updateElementType = (input: UpdateElementTypeInput) =>
    createAction<UpdateElementTypeAction>(
        'UPDATE_ELEMENT_TYPE',
        {...input}
    );

export const updateElementName = (input: UpdateElementNameInput) =>
    createAction<UpdateElementNameAction>(
        'UPDATE_ELEMENT_NAME',
        {...input}
    );

export const updateElementComponents = (input: UpdateElementComponentsInput) =>
    createAction<UpdateElementComponentsAction>(
        'UPDATE_ELEMENT_COMPONENTS',
        {...input}
    );

export const removeElement = (input: RemoveElementInput) =>
    createAction<RemoveElementAction>(
        'REMOVE_ELEMENT',
        {...input}
    );

export const reorderElements = (input: ReorderElementsInput) =>
    createAction<ReorderElementsAction>(
        'REORDER_ELEMENTS',
        {...input}
    );

export const moveElement = (input: MoveElementInput) =>
    createAction<MoveElementAction>(
        'MOVE_ELEMENT',
        {...input}
    );


