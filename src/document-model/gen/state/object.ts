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
    public setStateSchema(input: SetStateSchemaInput) {
        return this.dispatch(setStateSchema(input));
    }

    public setInitialState(input: SetInitialStateInput) {
        return this.dispatch(setInitialState(input));
    }

    public addStateExample(input: AddStateExampleInput) {
        return this.dispatch(addStateExample(input));
    }

    public updateStateExample(input: UpdateStateExampleInput) {
        return this.dispatch(updateStateExample(input));
    }

    public deleteStateExample(input: DeleteStateExampleInput) {
        return this.dispatch(deleteStateExample(input));
    }

    public reorderStateExamples(input: ReorderStateExamplesInput) {
        return this.dispatch(reorderStateExamples(input));
    }
}
