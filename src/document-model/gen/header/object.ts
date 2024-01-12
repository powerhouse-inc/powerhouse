import { BaseDocument } from '../../../document/object';

import {
    SetModelNameInput,
    SetModelIdInput,
    SetModelExtensionInput,
    SetModelDescriptionInput,
    SetAuthorNameInput,
    SetAuthorWebsiteInput,
    DocumentModelState,
    DocumentModelLocalState,
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
    DocumentModelState,
    DocumentModelAction,
    DocumentModelLocalState
> {
    public setModelName(input: SetModelNameInput, skip = 0) {
        return this.dispatch(setModelName(input, skip));
    }

    public setModelId(input: SetModelIdInput, skip = 0) {
        return this.dispatch(setModelId(input, skip));
    }

    public setModelExtension(input: SetModelExtensionInput, skip = 0) {
        return this.dispatch(setModelExtension(input, skip));
    }

    public setModelDescription(input: SetModelDescriptionInput, skip = 0) {
        return this.dispatch(setModelDescription(input, skip));
    }

    public setAuthorName(input: SetAuthorNameInput, skip = 0) {
        return this.dispatch(setAuthorName(input, skip));
    }

    public setAuthorWebsite(input: SetAuthorWebsiteInput, skip = 0) {
        return this.dispatch(setAuthorWebsite(input, skip));
    }
}
