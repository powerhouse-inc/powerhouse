import { createAction } from '../../../document/utils';

import {
    SetModelNameInput,
    SetModelIdInput,
    SetModelExtensionInput,
    SetModelDescriptionInput,
    SetAuthorNameInput,
    SetAuthorWebsiteInput,
} from '../types';
import {
    SetModelNameAction,
    SetModelIdAction,
    SetModelExtensionAction,
    SetModelDescriptionAction,
    SetAuthorNameAction,
    SetAuthorWebsiteAction,
} from './actions';

export const setModelName = (input: SetModelNameInput, skip = 0) =>
    createAction<SetModelNameAction>(
        'SET_MODEL_NAME',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const setModelId = (input: SetModelIdInput, skip = 0) =>
    createAction<SetModelIdAction>(
        'SET_MODEL_ID',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const setModelExtension = (input: SetModelExtensionInput, skip = 0) =>
    createAction<SetModelExtensionAction>(
        'SET_MODEL_EXTENSION',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const setModelDescription = (input: SetModelDescriptionInput, skip = 0) =>
    createAction<SetModelDescriptionAction>(
        'SET_MODEL_DESCRIPTION',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const setAuthorName = (input: SetAuthorNameInput, skip = 0) =>
    createAction<SetAuthorNameAction>(
        'SET_AUTHOR_NAME',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const setAuthorWebsite = (input: SetAuthorWebsiteInput, skip = 0) =>
    createAction<SetAuthorWebsiteAction>(
        'SET_AUTHOR_WEBSITE',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );


