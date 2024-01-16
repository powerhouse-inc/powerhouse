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
import { ReducerOptions } from '../../../document';

export default class DocumentModel_Header extends BaseDocument<
    DocumentModelState,
    DocumentModelAction,
    DocumentModelLocalState
> {
    public setModelName(input: SetModelNameInput, options?: ReducerOptions) {
        return this.dispatch(setModelName(input), options);
    }

    public setModelId(input: SetModelIdInput, options?: ReducerOptions) {
        return this.dispatch(setModelId(input), options);
    }

    public setModelExtension(input: SetModelExtensionInput, options?: ReducerOptions) {
        return this.dispatch(setModelExtension(input), options);
    }

    public setModelDescription(input: SetModelDescriptionInput, options?: ReducerOptions) {
        return this.dispatch(setModelDescription(input), options);
    }

    public setAuthorName(input: SetAuthorNameInput, options?: ReducerOptions) {
        return this.dispatch(setAuthorName(input), options);
    }

    public setAuthorWebsite(input: SetAuthorWebsiteInput, options?: ReducerOptions) {
        return this.dispatch(setAuthorWebsite(input), options);
    }
}
