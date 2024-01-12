import { createAction } from '../../../document/utils';

import {
    AddModuleInput,
    SetModuleNameInput,
    SetModuleDescriptionInput,
    DeleteModuleInput,
    ReorderModulesInput,
} from '../types';
import {
    AddModuleAction,
    SetModuleNameAction,
    SetModuleDescriptionAction,
    DeleteModuleAction,
    ReorderModulesAction,
} from './actions';

export const addModule = (input: AddModuleInput, skip = 0) =>
    createAction<AddModuleAction>(
        'ADD_MODULE',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const setModuleName = (input: SetModuleNameInput, skip = 0) =>
    createAction<SetModuleNameAction>(
        'SET_MODULE_NAME',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const setModuleDescription = (input: SetModuleDescriptionInput, skip = 0) =>
    createAction<SetModuleDescriptionAction>(
        'SET_MODULE_DESCRIPTION',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const deleteModule = (input: DeleteModuleInput, skip = 0) =>
    createAction<DeleteModuleAction>(
        'DELETE_MODULE',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const reorderModules = (input: ReorderModulesInput, skip = 0) =>
    createAction<ReorderModulesAction>(
        'REORDER_MODULES',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );


