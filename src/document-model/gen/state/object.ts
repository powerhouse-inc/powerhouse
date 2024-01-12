import { BaseDocument } from '../../../document/object';

import {
    SetStateSchemaInput,
    SetInitialStateInput,
    AddStateExampleInput,
    UpdateStateExampleInput,
    DeleteStateExampleInput,
    ReorderStateExamplesInput,
    DocumentModelState,
    DocumentModelLocalState,
} from '../types';
import {
    setStateSchema,
    setInitialState,
    addStateExample,
    updateStateExample,
    deleteStateExample,
    reorderStateExamples,
} from './creators';
import { DocumentModelAction } from '../actions';

export default class DocumentModel_State extends BaseDocument<
    DocumentModelState,
    DocumentModelAction,
    DocumentModelLocalState
> {
    public setStateSchema(input: SetStateSchemaInput, skip = 0) {
        return this.dispatch(setStateSchema(input, skip));
    }

    public setInitialState(input: SetInitialStateInput, skip = 0) {
        return this.dispatch(setInitialState(input, skip));
    }

    public addStateExample(input: AddStateExampleInput, skip = 0) {
        return this.dispatch(addStateExample(input, skip));
    }

    public updateStateExample(input: UpdateStateExampleInput, skip = 0) {
        return this.dispatch(updateStateExample(input, skip));
    }

    public deleteStateExample(input: DeleteStateExampleInput, skip = 0) {
        return this.dispatch(deleteStateExample(input, skip));
    }

    public reorderStateExamples(input: ReorderStateExamplesInput, skip = 0) {
        return this.dispatch(reorderStateExamples(input, skip));
    }
}
