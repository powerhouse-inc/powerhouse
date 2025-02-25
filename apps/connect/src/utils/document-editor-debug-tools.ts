import { Operation, OperationScope, PHDocument } from 'document-model';

export class DocumentEditorDebugTools {
    private document: PHDocument | undefined;
    private operations: Operation[] = [];

    constructor(document?: PHDocument) {
        if (document) {
            this.document = document;
        }
    }

    private operationsToTableObject(operations: Operation[]) {
        return operations.map(op => ({
            ...op,
            input: JSON.stringify(op.input),
        }));
    }

    public setDocument(document: PHDocument) {
        this.document = document;
    }

    public getDocument() {
        return this.document;
    }

    public getOperations() {
        return this.operations;
    }

    public pushOperation(operation: Operation) {
        this.operations.push(operation);
    }

    public operationsTable() {
        if (!this.document) {
            console.warn('No document');
        }
        const ops = Object.values(this.document?.operations || {})
            .flatMap(array => array)
            .sort((a, b) => a.index - b.index);

        console.table(this.operationsToTableObject(ops));
    }

    public scopeOperationsTable(scope: string) {
        if (!this.document) {
            console.warn('No document');
        }
        const ops = this.document?.operations[scope as OperationScope] || [];
        console.table(this.operationsToTableObject(ops));
    }

    public operationsLog() {
        console.log(this.operations);
    }

    public operationsLogTable() {
        console.table(this.operationsToTableObject(this.operations));
    }

    public clear() {
        this.operations = [];
        this.document = undefined;
    }
}
