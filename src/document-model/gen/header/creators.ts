import {
    SetModelNameAction,
    SetModelIdAction,
    SetModelExtensionAction,
    SetModelDescriptionAction,
    SetAuthorNameAction,
    SetAuthorWebsiteAction,
} from './actions';

import { createAction } from '../../../document/utils'; 

export const setModelName = (name: string) => 
    createAction<SetModelNameAction>(
        'SET_MODEL_NAME',
        { name }
    );

export const setModelId = (id: string) => 
    createAction<SetModelIdAction>(
        'SET_MODEL_ID',
        { id }
    );

export const setModelExtension = (extension: string) => 
    createAction<SetModelExtensionAction>(
        'SET_MODEL_EXTENSION',
        { extension }
    );

export const setModelDescription = (description: string) => 
    createAction<SetModelDescriptionAction>(
        'SET_MODEL_DESCRIPTION',
        { description }
    );

export const setAuthorName = (authorName: string) => 
    createAction<SetAuthorNameAction>(
        'SET_AUTHOR_NAME',
        { authorName }
    );

export const setAuthorWebsite = (authorWebsite: string) => 
    createAction<SetAuthorWebsiteAction>(
        'SET_AUTHOR_WEBSITE',
        { authorWebsite }
    );
