import {
    DocumentDriveDocument,
    documentModel as DocumentDriveModel,
    z
} from 'document-model-libs/document-drive';
import {
    Action,
    BaseAction,
    Document,
    DocumentOperations,
    Operation
} from 'document-model/document';
import { OperationError } from '../server/error';

export function isDocumentDrive(
    document: Document
): document is DocumentDriveDocument {
    return (
        document.documentType === DocumentDriveModel.id &&
        z.DocumentDriveStateSchema().safeParse(document.state.global).success
    );
}

export function mergeOperations<A extends Action = Action>(
    currentOperations: DocumentOperations<A>,
    newOperations: Operation<A | BaseAction>[]
): DocumentOperations<A> {
    const conflictOp = newOperations.find(op =>
        currentOperations[op.scope].find(
            o => o.index === op.index && o.scope === op.scope
        )
    );
    if (conflictOp) {
        const existingOperation = currentOperations[conflictOp.scope].find(
            o => o.index === conflictOp.index && o.scope === conflictOp.scope
        );
        throw new OperationError(
            'CONFLICT',
            conflictOp,
            `Conflicting operation on index ${conflictOp.index}`,
            { existingOperation, newOperation: conflictOp }
        );
    }

    return newOperations.reduce((acc, curr) => {
        const operations = acc[curr.scope] ?? [];
        acc[curr.scope] = [...operations, curr].sort(
            (a, b) => a.index - b.index
        ) as Operation<A>[];
        return acc;
    }, currentOperations);
}

export function generateUUID(): string {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const crypto =
        typeof window !== 'undefined' ? window.crypto : require('crypto');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    return crypto.randomUUID() as string;
}

export function applyUpdatedOperations<A extends Action = Action>(
    currentOperations: DocumentOperations<A>,
    updatedOperations: Operation<A | BaseAction>[]
): DocumentOperations<A> {
    return updatedOperations.reduce(
        (acc, curr) => {
            const operations = acc[curr.scope] ?? [];
            acc[curr.scope] = operations.map(op => {
                return op.index === curr.index ? curr : op;
            });
            return acc;
        },
        { ...currentOperations }
    );
}

export function isNoopUpdate(
    operation: Operation,
    latestOperation?: Operation
) {
    if (!latestOperation) {
        return false;
    }

    const isNoopOp = operation.type === 'NOOP';
    const isNoopLatestOp = latestOperation.type === 'NOOP';
    const isSameIndexOp = operation.index === latestOperation.index;
    const isSkipOpGreaterThanLatestOp = operation.skip > latestOperation.skip;

    return (
        isNoopOp &&
        isNoopLatestOp &&
        isSameIndexOp &&
        isSkipOpGreaterThanLatestOp
    );
}

// return true if dateA is before dateB
export function isBefore(dateA: Date | string, dateB: Date | string) {
    return new Date(dateA) < new Date(dateB);
}
