import {
    AddModuleAction,
    SetModuleNameAction,
    SetModuleDescriptionAction,
    DeleteModuleAction,
    ReorderModulesAction,
} from './actions';

import { createAction } from '../../../document/utils'; 

export const addModule = (name: string, description: string) => 
    createAction<AddModuleAction>(
        'ADD_MODULE',
        { name, description }
    );

export const setModuleName = (id: string, name: string) => 
    createAction<SetModuleNameAction>(
        'SET_MODULE_NAME',
        { id, name }
    );

export const setModuleDescription = (id: string, description: string) => 
    createAction<SetModuleDescriptionAction>(
        'SET_MODULE_DESCRIPTION',
        { id, description }
    );

export const deleteModule = (id: string) => 
    createAction<DeleteModuleAction>(
        'DELETE_MODULE',
        { id }
    );

export const reorderModules = (order: string[]) => 
    createAction<ReorderModulesAction>(
        'REORDER_MODULES',
        { order }
    );
