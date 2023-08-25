import { BaseDocument } from '../../../document/object';

import {
    SetModelNameInput,
    SetModelIdInput,
    SetModelExtensionInput,
    SetModelDescriptionInput,
    SetAuthorNameInput,
    SetAuthorWebsiteInput,
    DocumentModelState
} from '../types';
import {
    setModelName,
    setModelId,
    setModelExtension,
    setModelDescription,
    setAuthorName,
    setAuthorWebsite,
} from './creators';
import { DocumentModelAction } from '../actions';

export default class DocumentModel_Header extends BaseDocument<
    DocumentModelState, DocumentModelAction
> {
    public setModelName(input: SetModelNameInput) {
        return this.dispatch(setModelName(input));
    }
    
    public setModelId(input: SetModelIdInput) {
        return this.dispatch(setModelId(input));
    }
    
    public setModelExtension(input: SetModelExtensionInput) {
        return this.dispatch(setModelExtension(input));
    }
    
    public setModelDescription(input: SetModelDescriptionInput) {
        return this.dispatch(setModelDescription(input));
    }
    
    public setAuthorName(input: SetAuthorNameInput) {
        return this.dispatch(setAuthorName(input));
    }
    
    public setAuthorWebsite(input: SetAuthorWebsiteInput) {
        return this.dispatch(setAuthorWebsite(input));
    }
    
}