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
import { ReducerOptions } from '../../../document';

export default class DocumentModel_Versioning extends BaseDocument<
    DocumentModelState,
    DocumentModelAction,
    DocumentModelLocalState
> {
    public addChangeLogItem(input: AddChangeLogItemInput, options?: ReducerOptions) {
        return this.dispatch(addChangeLogItem(input), options);
    }

    public updateChangeLogItem(input: UpdateChangeLogItemInput, options?: ReducerOptions) {
        return this.dispatch(updateChangeLogItem(input), options);
    }

    public deleteChangeLogItem(input: DeleteChangeLogItemInput, options?: ReducerOptions) {
        return this.dispatch(deleteChangeLogItem(input), options);
    }

    public reorderChangeLogItems(input: ReorderChangeLogItemsInput, options?: ReducerOptions) {
        return this.dispatch(reorderChangeLogItems(input), options);
    }

    public releaseNewVersion(options?: ReducerOptions) {
        return this.dispatch(releaseNewVersion(), options);
    }
}
