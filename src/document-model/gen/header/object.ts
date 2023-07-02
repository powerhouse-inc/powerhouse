import { BaseDocument } from '../../../document/object';

import {
    setModelName,
    setModelId,
    setModelExtension,
    setModelDescription,
    setAuthorName,
    setAuthorWebsite
} from './creators';

import { DocumentModelAction } from '../actions';
import { DocumentModelState } from '@acaldas/document-model-graphql/document-model';

export default class DocumentModelHeader extends BaseDocument<
    DocumentModelState, DocumentModelAction
> {
    public setModelName(name: string) {
        return this.dispatch(setModelName(name));
    }

    public setModelId(id: string) {
        return this.dispatch(setModelId(id));
    }

    public setModelExtension(extension: string) {
        return this.dispatch(setModelExtension(extension));
    }

    public setModelDescription(description: string) {
        return this.dispatch(setModelDescription(description));
    }

    public setAuthorName(authorName: string) {
        return this.dispatch(setAuthorName(authorName));
    }

    public setAuthorWebsite(authorWebsite: string) {
        return this.dispatch(setAuthorWebsite(authorWebsite));
    }
}