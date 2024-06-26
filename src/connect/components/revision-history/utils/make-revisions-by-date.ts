import { Operation, Revision, Skip } from '../types';

export type RevisionsByDate = Record<string, (Revision | Skip)[]>;
export function makeRevisionsByDate(operations: Operation[]) {
    const revisionsByDate: RevisionsByDate = {};
    let index = 0;

    while (index < operations.length) {
        const operation = operations[index];
        const date = operation.timestamp.split('T')[0];

        if (!revisionsByDate[date]) {
            revisionsByDate[date] = [];
        }

        if (operation.skip > 0) {
            revisionsByDate[date].push({
                operationIndex: operation.index,
                skipCount: operation.skip,
            });
            index += operation.skip;
            revisionsByDate[date]
                .sort((a, b) => a.operationIndex - b.operationIndex)
                .reverse();
            continue;
        } else {
            revisionsByDate[date].push({
                operationIndex: operation.index,
                eventId: operation.id,
                stateHash: operation.hash,
                operationType: operation.type,
                operationInput: operation.input,
                address: operation.context.user.address,
                chainId: operation.context.user.chainId,
                timestamp: operation.timestamp,
                signatures: operation.signatures,
                errors: operation.error ? [operation.error] : undefined,
            });
            revisionsByDate[date]
                .sort((a, b) => a.operationIndex - b.operationIndex)
                .reverse();
        }

        index += 1;
    }

    return revisionsByDate;
}
