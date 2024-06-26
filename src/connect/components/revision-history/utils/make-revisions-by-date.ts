import { Operation, Revision, Signature, SignatureArray, Skip } from '../types';

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
                address: operation.context?.signer?.user?.address,
                chainId: operation.context?.signer?.user?.chainId,
                timestamp: operation.timestamp,
                signatures: makeSignatures(
                    operation.context?.signer?.signatures,
                ),
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

function makeSignatureFromSignatureArray(
    signatureArray: SignatureArray,
): Signature {
    const [signerAddress, hash, prevStateHash, signatureBytes] = signatureArray;

    return {
        signerAddress,
        hash,
        prevStateHash,
        signatureBytes,
        isVerified: true,
    };
}

function makeSignatures(signaturesArray: SignatureArray[] | undefined) {
    return signaturesArray?.map(makeSignatureFromSignatureArray);
}
