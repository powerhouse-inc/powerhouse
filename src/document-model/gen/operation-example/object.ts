import { BaseDocument } from '../../../document/object';

import {
    AddOperationExampleInput,
    UpdateOperationExampleInput,
    DeleteOperationExampleInput,
    ReorderOperationExamplesInput,
    DocumentModelState,
    DocumentModelLocalState,
} from '../types';
import {
    addOperationExample,
    updateOperationExample,
    deleteOperationExample,
    reorderOperationExamples,
} from './creators';
import { DocumentModelAction } from '../actions';

export default class DocumentModel_OperationExample extends BaseDocument<
    DocumentModelState,
    DocumentModelAction,
    DocumentModelLocalState
> {
    public addOperationExample(input: AddOperationExampleInput, skip = 0) {
        return this.dispatch(addOperationExample(input, skip));
    }

    public updateOperationExample(input: UpdateOperationExampleInput, skip = 0) {
        return this.dispatch(updateOperationExample(input, skip));
    }

    public deleteOperationExample(input: DeleteOperationExampleInput, skip = 0) {
        return this.dispatch(deleteOperationExample(input, skip));
    }

    public reorderOperationExamples(input: ReorderOperationExamplesInput, skip = 0) {
        return this.dispatch(reorderOperationExamples(input, skip));
    }
}
