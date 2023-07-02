import { BaseDocument } from '../../../document/object';

import {
    setStateSchema,
    addStateExample,
    updateStateExample,
    deleteStateExample,
    reorderStateExamples,
} from './creators';

import { DocumentModelAction } from '../actions';
import { DocumentModelState } from '@acaldas/document-model-graphql/document-model';

export default class DocumentModelStateDocument extends BaseDocument<
    DocumentModelState, DocumentModelAction
> {
    public setStateSchema(schema: string) {
        return this.dispatch(setStateSchema(schema));
    }

    public addStateExample(example: string, insertBefore?: string) {
        return this.dispatch(addStateExample(example, insertBefore));
    }

    public updateStateExample(id: string, newExample: string) {
        return this.dispatch(updateStateExample(id, newExample));
    }

    public deleteStateExample(id: string) {
        return this.dispatch(deleteStateExample(id));
    }

    public reorderStateExamples(order: string[]) {
        return this.dispatch(reorderStateExamples(order));
    }
}