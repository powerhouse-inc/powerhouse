export type Scope = 'global' | 'local';

export type Operation = {
    id: string;
    type: string;
    input: Record<string, any>;
    scope: Scope;
    index: number;
    timestamp: string;
    hash: string;
    skip: number;
    error: string | undefined;
    context?: {
        signer?: {
            user?: {
                address?: `0x${string}`;
                chainId?: number;
            };
            signatures?: SignatureArray[];
        };
    };
};

export type Skip = {
    operationIndex: number;
    skipCount: number;
};

//  [
//     signerAddress,
//     hash (docID, scope, operationID, operationName, operationInput),
//     prevStateHash,
//     signature bytes
//  ]
export type SignatureArray = [string, string, string, string];

export type Signature = {
    signerAddress: string;
    hash: string;
    prevStateHash: string;
    signatureBytes: string;
    isVerified: boolean;
};

export type Revision = {
    operationIndex: number;
    eventId: string;
    stateHash: string;
    operationType: string;
    operationInput: Record<string, any>;
    address: `0x${string}` | undefined;
    chainId: number | undefined;
    timestamp: number | string;
    signatures: Signature[] | undefined;
    errors: string[] | undefined;
};
