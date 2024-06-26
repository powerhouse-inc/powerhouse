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
    signatures: Signature[];
    context: {
        user: {
            address: `0x${string}`;
            chainId: number;
        };
    };
};

export type Skip = {
    operationIndex: number;
    skipCount: number;
};

export type Signature = {
    timestamp: number;
    signerAddress: string;
    hash: string;
    signatureBytes: string;
    isVerified: boolean;
};

export type Revision = {
    operationIndex: number;
    eventId: string;
    stateHash: string;
    operationType: string;
    operationInput: Record<string, any>;
    address: `0x${string}`;
    chainId: number;
    timestamp: number | string;
    signatures: Signature[];
    errors: string[] | undefined;
};
