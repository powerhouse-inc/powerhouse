import { Action } from '../../../document';

import {
    SetModelNameInput,
    SetModelIdInput,
    SetModelExtensionInput,
    SetModelDescriptionInput,
    SetAuthorNameInput,
    SetAuthorWebsiteInput,
} from '@acaldas/document-model-graphql/document-model';

export type SetModelNameAction = Action<'SET_MODEL_NAME', SetModelNameInput>;
export type SetModelIdAction = Action<'SET_MODEL_ID', SetModelIdInput>;
export type SetModelExtensionAction = Action<'SET_MODEL_EXTENSION', SetModelExtensionInput>;
export type SetModelDescriptionAction = Action<'SET_MODEL_DESCRIPTION', SetModelDescriptionInput>;
export type SetAuthorNameAction = Action<'SET_AUTHOR_NAME', SetAuthorNameInput>;
export type SetAuthorWebsiteAction = Action<'SET_AUTHOR_WEBSITE', SetAuthorWebsiteInput>;

export type DocumentModelHeaderAction = 
    | SetModelNameAction
    | SetModelIdAction
    | SetModelExtensionAction
    | SetModelDescriptionAction
    | SetAuthorNameAction
    | SetAuthorWebsiteAction
;