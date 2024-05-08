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
import { ConflictOperationError } from '../server/error';
import { DocumentDriveStorage, DocumentStorage } from '../storage';

export function isDocumentDriveStorage(
    document: DocumentStorage
): document is DocumentDriveStorage {
    return (
        document.documentType === DocumentDriveModel.id
    );
}

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
    let existingOperation: Operation<A | BaseAction> | null = null;
    const conflictOp = newOperations.find(op => {
        const result = currentOperations[op.scope].find(
            o => o.index === op.index && o.scope === op.scope
        );
        if (result) {
            existingOperation = result;
            return true;
        }
    });
    if (conflictOp) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        throw new ConflictOperationError(existingOperation!, conflictOp);
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

