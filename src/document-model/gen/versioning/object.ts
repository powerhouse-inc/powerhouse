import { BaseDocument } from '../../../document/object';

import {
    AddChangeLogItemInput,
    UpdateChangeLogItemInput,
    DeleteChangeLogItemInput,
    ReorderChangeLogItemsInput,
    DocumentModelState,
    DocumentModelLocalState,
} from '../types';
import {
    addChangeLogItem,
    updateChangeLogItem,
    deleteChangeLogItem,
    reorderChangeLogItems,
    releaseNewVersion,
} from './creators';
import { DocumentModelAction } from '../actions';

export default class DocumentModel_Versioning extends BaseDocument<
    DocumentModelState,
    DocumentModelAction,
    DocumentModelLocalState
> {
    public addChangeLogItem(input: AddChangeLogItemInput, skip = 0) {
        return this.dispatch(addChangeLogItem(input, skip));
    }

    public updateChangeLogItem(input: UpdateChangeLogItemInput, skip = 0) {
        return this.dispatch(updateChangeLogItem(input, skip));
    }

    public deleteChangeLogItem(input: DeleteChangeLogItemInput, skip = 0) {
        return this.dispatch(deleteChangeLogItem(input, skip));
    }

    public reorderChangeLogItems(input: ReorderChangeLogItemsInput, skip = 0) {
        return this.dispatch(reorderChangeLogItems(input, skip));
    }

    public releaseNewVersion(skip = 0) {
        return this.dispatch(releaseNewVersion(skip));
    }
}
