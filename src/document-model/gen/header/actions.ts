import { ActionType } from '../../../document/utils';

import {
    SetModelNameInput,
    SetModelIdInput,
    SetModelExtensionInput,
    SetModelDescriptionInput,
    SetAuthorNameInput,
    SetAuthorWebsiteInput,
} from '@acaldas/document-model-graphql/document-model';

export type SetModelNameAction = ActionType<'SET_MODEL_NAME', SetModelNameInput>;
export type SetModelIdAction = ActionType<'SET_MODEL_ID', SetModelIdInput>;
export type SetModelExtensionAction = ActionType<'SET_MODEL_EXTENSION', SetModelExtensionInput>;
export type SetModelDescriptionAction = ActionType<'SET_MODEL_DESCRIPTION', SetModelDescriptionInput>;
export type SetAuthorNameAction = ActionType<'SET_AUTHOR_NAME', SetAuthorNameInput>;
export type SetAuthorWebsiteAction = ActionType<'SET_AUTHOR_WEBSITE', SetAuthorWebsiteInput>;

export type DocumentModelHeaderAction = 
    | SetModelNameAction
    | SetModelIdAction
    | SetModelExtensionAction
    | SetModelDescriptionAction
    | SetAuthorNameAction
    | SetAuthorWebsiteAction
;