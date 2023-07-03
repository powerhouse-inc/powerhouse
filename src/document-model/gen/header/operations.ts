import {
    SetModelNameAction,
    SetModelIdAction,
    SetModelExtensionAction,
    SetModelDescriptionAction,
    SetAuthorNameAction,
    SetAuthorWebsiteAction,
} from './actions';

import { ExtendedDocumentModelState } from '../object';

export interface DocumentModelHeaderOperations {
    setModelNameOperation: (state: ExtendedDocumentModelState, action: SetModelNameAction) => void,
    setModelIdOperation: (state: ExtendedDocumentModelState, action: SetModelIdAction) => void,
    setModelExtensionOperation: (state: ExtendedDocumentModelState, action: SetModelExtensionAction) => void,
    setModelDescriptionOperation: (state: ExtendedDocumentModelState, action: SetModelDescriptionAction) => void,
    setAuthorNameOperation: (state: ExtendedDocumentModelState, action: SetAuthorNameAction) => void,
    setAuthorWebsiteOperation: (state: ExtendedDocumentModelState, action: SetAuthorWebsiteAction) => void,
}