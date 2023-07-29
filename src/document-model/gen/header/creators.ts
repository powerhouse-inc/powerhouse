import { createAction } from '../../../document/utils'; 

import {
    SetModelNameInput,
    SetModelIdInput,
    SetModelExtensionInput,
    SetModelDescriptionInput,
    SetAuthorNameInput,
    SetAuthorWebsiteInput,
} from '@acaldas/document-model-graphql/document-model';

import {
    SetModelNameAction,
    SetModelIdAction,
    SetModelExtensionAction,
    SetModelDescriptionAction,
    SetAuthorNameAction,
    SetAuthorWebsiteAction,
} from './actions';

export const setModelName = (input: SetModelNameInput) =>
    createAction<SetModelNameAction>(
        'SET_MODEL_NAME',
        {...input}
    );

export const setModelId = (input: SetModelIdInput) =>
    createAction<SetModelIdAction>(
        'SET_MODEL_ID',
        {...input}
    );

export const setModelExtension = (input: SetModelExtensionInput) =>
    createAction<SetModelExtensionAction>(
        'SET_MODEL_EXTENSION',
        {...input}
    );

export const setModelDescription = (input: SetModelDescriptionInput) =>
    createAction<SetModelDescriptionAction>(
        'SET_MODEL_DESCRIPTION',
        {...input}
    );

export const setAuthorName = (input: SetAuthorNameInput) =>
    createAction<SetAuthorNameAction>(
        'SET_AUTHOR_NAME',
        {...input}
    );

export const setAuthorWebsite = (input: SetAuthorWebsiteInput) =>
    createAction<SetAuthorWebsiteAction>(
        'SET_AUTHOR_WEBSITE',
        {...input}
    );


