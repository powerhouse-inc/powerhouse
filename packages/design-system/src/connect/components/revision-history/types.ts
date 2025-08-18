export type Skip = {
  type: "skip";
  height: number;
  operationIndex: number;
  skipCount: number;
  timestampUtcMs: string;
};

export type Day = {
  type: "day";
  height: number;
  timestampUtcMs: string;
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
  type: "revision";
  height: number;
  operationIndex: number;
  eventId: string;
  stateHash: string;
  operationType: string;
  operationInput: Record<string, any>;
  address: `0x${string}` | undefined;
  chainId: number | undefined;
  timestampUtcMs: string;
  signatures: Signature[] | undefined;
  errors: string[] | undefined;
};
