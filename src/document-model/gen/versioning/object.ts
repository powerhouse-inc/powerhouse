import { BaseDocument } from '../../../document/object';

import {
    AddChangeLogItemInput,
    UpdateChangeLogItemInput,
    DeleteChangeLogItemInput,
    ReorderChangeLogItemsInput,
} from '@acaldas/document-model-graphql/document-model';

import {
    addChangeLogItem,
    updateChangeLogItem,
    deleteChangeLogItem,
    reorderChangeLogItems,
    releaseNewVersion,
} from './creators';

import { DocumentModelAction } from '../actions';
import { DocumentModelState } from '@acaldas/document-model-graphql/document-model';

export default class DocumentModel_Versioning extends BaseDocument<
    DocumentModelState, DocumentModelAction
> {
    public addChangeLogItem(input: AddChangeLogItemInput) {
        return this.dispatch(addChangeLogItem(input));
    }
    
    public updateChangeLogItem(input: UpdateChangeLogItemInput) {
        return this.dispatch(updateChangeLogItem(input));
    }
    
    public deleteChangeLogItem(input: DeleteChangeLogItemInput) {
        return this.dispatch(deleteChangeLogItem(input));
    }
    
    public reorderChangeLogItems(input: ReorderChangeLogItemsInput) {
        return this.dispatch(reorderChangeLogItems(input));
    }
    
    public releaseNewVersion() {
        return this.dispatch(releaseNewVersion());
    }
    
}