import { useSignTypedData } from "wagmi";

type SignTypedData = ReturnType<typeof useSignTypedData>["signTypedDataAsync"];

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
    "@context": string[];
    id: string;
    type: string[];
    issuer: IssuerType<Issuer>;
    issuanceDate: string;
    expirationDate?: string;
    revocationDate?: string;
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
        primaryType: "VerifiableCredential";
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

const EIP712VC_NAME = process.env.NEXT_PUBLIC_EIP712VC_NAME || "Renown";
const EIP712VC_VERSION = process.env.NEXT_PUBLIC_EIP712VC_VERSION || "0.1";
const EIP712VC_VERIFYING_CONTRACT =
    (process.env.NEXT_PUBLIC_VERIFYING_CONTRACT as `0x${string}`) ||
    "0x0000000000000000000000000000000000000000";

const DEFAULT_CONTEXT = "https://www.w3.org/2018/credentials/v1";
const EIP712_CONTEXT =
    "https://raw.githubusercontent.com/w3c-ccg/ethereum-eip712-signature-2021-spec/main/contexts/v1/index.json";
const DEFAULT_VC_TYPE = "VerifiableCredential";
const VC_TYPE = "PowerhouseVerifiableCredential";

const VERIFIABLE_CREDENTIAL_PRIMARY_TYPE = "VerifiableCredential";

const DOMAIN_TYPE = [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
] as const;

const VERIFIABLE_CREDENTIAL_EIP712_TYPE = [
    { name: "@context", type: "string[]" },
    { name: "type", type: "string[]" },
    { name: "id", type: "string" },
    { name: "issuer", type: "Issuer" },
    { name: "credentialSubject", type: "CredentialSubject" },
    { name: "credentialSchema", type: "CredentialSchema" },
    { name: "issuanceDate", type: "string" },
    { name: "expirationDate", type: "string" },
] as const;

const CREDENTIAL_SCHEMA_EIP712_TYPE = [
    { name: "id", type: "string" },
    { name: "type", type: "string" },
] as const;

const CREDENTIAL_SUBJECT_TYPE = [
    { name: "app", type: "string" },
    { name: "id", type: "string" },
    { name: "name", type: "string" },
] as const;

const ISSUER_TYPE = [
    { name: "id", type: "string" },
    { name: "ethereumAddress", type: "string" },
] as const;

const CREDENTIAL_TYPES = {
    EIP712Domain: DOMAIN_TYPE,
    VerifiableCredential: VERIFIABLE_CREDENTIAL_EIP712_TYPE,
    CredentialSchema: CREDENTIAL_SCHEMA_EIP712_TYPE,
    CredentialSubject: CREDENTIAL_SUBJECT_TYPE,
    Issuer: ISSUER_TYPE,
} as const;

export function getAddressDID(address: string, chainId: number) {
    return `did:pkh:eip155:${chainId}:${address}`;
}

export async function createPowerhouseVerifiableCredential(
    address: `0x${string}`,
    chainId: number,
    credentialSubject: IPowerhouseCredentialSubject,
    signTypedData: SignTypedData
): Promise<PowerhouseVerifiableCredential> {
    const credential = {
        id: "",
        issuer: {
            id: getAddressDID(address, chainId),
            ethereumAddress: address,
        },
        credentialSubject: {
            app: credentialSubject.app,
            id: credentialSubject.id,
            name: credentialSubject.name || "",
        },
        issuanceDate: new Date().toISOString(),
        expirationDate: "",
        "@context": [DEFAULT_CONTEXT, EIP712_CONTEXT],
        type: [DEFAULT_VC_TYPE, VC_TYPE],
        credentialSchema: {
            id: "https://www.powerhouse.inc/renown/credential.jsonld",
            type: "JsonSchemaValidator2018",
        },
    };

    const credentialTypedData = {
        domain: {
            name: EIP712VC_NAME,
            version: EIP712VC_VERSION,
            chainId: chainId,
            verifyingContract: EIP712VC_VERIFYING_CONTRACT,
        },
        primaryType: VERIFIABLE_CREDENTIAL_PRIMARY_TYPE,
        message: credential,
        types: CREDENTIAL_TYPES,
    } as const;

    const signature = await signTypedData({
        ...credentialTypedData,
        domain: {
            ...credentialTypedData.domain,
            chainId: chainId as unknown as bigint,
        },
    });

    const proof = {
        verificationMethod:
            credentialTypedData.message.issuer.id + "#ethereumAddress",
        ethereumAddress: address,
        created: new Date(Date.now()).toISOString(),
        proofPurpose: "assertionMethod",
        type: "EthereumEip712Signature2021",
        proofValue: signature,
        eip712: {
            domain: { ...credentialTypedData.domain },
            types: { ...credentialTypedData.types },
            primaryType: credentialTypedData.primaryType,
        },
    };
    const verifiableCredential: PowerhouseVerifiableCredential = {
        ...credential,
        proof,
    } as const;
    return verifiableCredential;
}
