export type Operation = {
    type: string;
    input: Record<string, any>;
    scope: 'global' | 'local';
    index: number;
    timestamp: string;
    hash: string;
    skip: number;
    error: string | undefined;
    signatures: Signature[];
    address: `0x${string}`;
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
    timestamp: number | string;
    signatures: Signature[];
    errors: string[] | undefined;
};
