import {
    Action,
    Document,
    NOOPAction,
    Operation,
    Reducer
} from 'document-model/document';
import { DocumentModelDocument } from 'document-model/document-model';
import { DocumentDriveServer } from '../src';

export function buildOperation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reducer: Reducer<any, any, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    document: Document<any, any, any>,
    action: Action,
    index?: number
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Operation<NOOPAction & Action> {
    const newDocument = reducer(document, action);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-non-null-assertion
    const operation = newDocument.operations[action.scope]
        .slice()
        .pop()! as Operation;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    return { ...operation, index: index ?? operation.index } as Operation<
        NOOPAction & Action
    >;
}

export function buildOperations(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reducer: Reducer<any, any, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    document: Document<any, any, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    actions: Array<Action>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Operation<NOOPAction & Action>[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const operations: Operation<NOOPAction & Action>[] = [];
    for (const action of actions) {
        document = reducer(document, action);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const operation = document.operations[action.scope]
            .slice()
            .pop()! as Operation<NOOPAction & Action>;
        operations.push(operation);
    }
    return operations;
}

export function buildOperationAndDocument(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reducer: Reducer<any, any, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    document: Document<any, any, any>,
    action: Action,
    index?: number
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
) {
    const newDocument = reducer(document, action);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-non-null-assertion
    const operation = newDocument.operations[action.scope]
        .slice()
        .pop()! as Operation;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    return {
        document: newDocument,
        operation: {
            ...operation,
            index: index ?? operation.index
        } as Operation<NOOPAction & Action>
    };
}

export class BasicClient {
    private unsyncedOperations: Operation[] = [];

    constructor(
        private server: DocumentDriveServer,
        private driveId: string,
        private documentId: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        private document: Document<any, any, any>,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        private reducer: Reducer<any, any, any>
    ) {}

    getDocument() {
        return this.document;
    }

    clearUnsyncedOperations() {
        this.unsyncedOperations = [];
    }

    async pushOperationsToServer() {
        const result = await this.server.addOperations(
            this.driveId,
            this.documentId,
            this.unsyncedOperations
        );

        if (result.status === 'SUCCESS') {
            this.unsyncedOperations = [];
        }

        return result;
    }

    async syncDocument() {
        this.clearUnsyncedOperations();

        const remoteDocument = (await this.server.getDocument(
            this.driveId,
            this.documentId
        )) as DocumentModelDocument;

        const remoteDocumentOperations = Object.values(
            remoteDocument.operations
        ).flat();

        const result = await this.server._processOperations(
            this.driveId,
            this.document,
            remoteDocumentOperations
        );

        this.document = result.document;
        return this.document;
    }

    dispatchDocumentAction(action: Action) {
        const result = buildOperationAndDocument(
            this.reducer,
            this.document,
            action
        );

        this.document = { ...result.document };
        this.unsyncedOperations.push({ ...result.operation });

        return result;
    }
}
