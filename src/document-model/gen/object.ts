import { DocumentModelState } from '@acaldas/document-model-graphql/document-model';
import { BaseDocument, applyMixins } from '../../document/object';
import DocumentModelHeader from './header/object';
import DocumentModelModules from './modules/object';
import DocumentModelOperationErrors from './operation-errors/object';
import DocumentModelOperationExamples from './operation-examples/object';
import DocumentModelOperations from './operations/object';
import DocumentModelStateDocument from './state/object';
import { DocumentModelAction } from './actions';

export * from './header/object';
export * from './modules/object';
export * from './operation-errors/object';
export * from './operation-examples/object';
export * from './operations/object';
export * from './state/object';

interface DocumentModel 
    extends DocumentModelHeader,
        DocumentModelModules,
        DocumentModelOperationErrors,
        DocumentModelOperationExamples,
        DocumentModelOperations,
        DocumentModelStateDocument {}

class DocumentModel extends BaseDocument<DocumentModelState, DocumentModelAction> {
    static fileExtension = 'phdm';

    // TODO: inject resolvers and finish convenience methods

    public saveToFile(path: string, name?: string) {
        return super.saveToFile(path, DocumentModel.fileExtension, name);
    }

    public loadFromFile(path: string) {
        return super.loadFromFile(path);
    }

    static async fromFile(path: string) {
        //const budgetStatement = new this();
        //await budgetStatement.loadFromFile(path);
        //return budgetStatement;
    }
}

applyMixins(DocumentModel, [
    DocumentModelHeader,
    DocumentModelModules,
    DocumentModelOperationErrors,
    DocumentModelOperationExamples,
    DocumentModelOperations,
    DocumentModelStateDocument,
]);

export { DocumentModel };