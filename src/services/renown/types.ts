import { CREDENTIAL_TYPES } from './constants';

export type User = {
    address: string;
    networkId: string;
    chainId: number;
    did: string;
    credential: PowerhouseVerifiableCredential | undefined;
};

type IssuerType<T> = {
    id: string;
} & T;

type CredentialSubjecType<T> = {
    id?: string;
} & T;

interface CredentialStatus {
    id: string;
    type: string;
}

interface CredentialSchema {
    id: string;
    type: string;
}

interface IVerifiableCredentialPayload<Subject, Issuer> {
    '@context': string[];
    id: string;
    type: string[];
    issuer: IssuerType<Issuer>;
    issuanceDate: string;
    expirationDate?: string;
    credentialSubject: CredentialSubjecType<Subject>;
    credentialStatus?: CredentialStatus;
    credentialSchema: CredentialSchema;
}

interface IProof {
    verificationMethod: string;
    ethereumAddress: `0x${string}`;
    created: string;
    proofPurpose: string;
    type: string;
    proofValue: string;
    eip712: {
        domain: {
            name: string;
            version: string;
            chainId: number;
            verifyingContract: string;
        };
        types: typeof CREDENTIAL_TYPES;
        primaryType: 'VerifiableCredential';
    };
}

export interface IVerifiableCredential<Subject, Issuer>
    extends IVerifiableCredentialPayload<Subject, Issuer> {
    proof: IProof;
}

export interface IPowerhouseCredentialSubject {
    id: string;
    app: string;
    name?: string;
}

export interface IPowerhouseIssuerType {
    ethereumAddress: `0x${string}`;
}

export type PowerhouseVerifiableCredential = IVerifiableCredential<
    IPowerhouseCredentialSubject,
    IPowerhouseIssuerType
>;
