import { recoverTypedDataAddress } from "viem";
import { CREDENTIAL_TYPES, DEFAULT_RENOWN_NETWORK_ID } from "./constants.js";
import type { PowerhouseVerifiableCredential } from "./types.js";

/* Local structural aliases (EIP-712 standard shapes) so renown's public .d.ts
 * never names viem — a viem type in the surface drags viem's whole closure in. */
type Hex = `0x${string}`;
type TypedDataDomain = {
  name?: string;
  version?: string;
  chainId?: number;
  verifyingContract?: Hex;
  salt?: Hex;
};
type TypedDataParameter = { name: string; type: string };

/** EIP-712 domain as signed by the credential issuer. */
export type CredentialDomain = {
  version: string;
  chainId: number;
};

/** The credential body that is EIP-712 signed (everything except `proof`). */
export type CredentialMessage = {
  "@context": string[];
  type: string[];
  id: string;
  issuer: { id: string; ethereumAddress: Hex };
  credentialSubject: { id: string; app: string };
  credentialSchema: { id: string; type: string };
  issuanceDate: string;
  expirationDate: string;
};

/** Typed-data signer; matches the loose shape used by wallet adapters. */
export type SignCredentialTypedData = (args: {
  domain: TypedDataDomain;
  types: Record<string, readonly TypedDataParameter[]>;
  primaryType: string;
  message: Record<string, unknown>;
}) => Promise<Hex>;

export interface BuildCredentialParams {
  signTypedData: SignCredentialTypedData;
  address: Hex;
  chainId: number;
  app: string;
  /** Credential subject id: the app/client DID the credential delegates to. */
  appId: string;
  expiresInDays?: number;
}

/** Assemble a Renown delegation VC and sign it with the provided signer. */
export async function buildAndSignCredential(
  params: BuildCredentialParams,
): Promise<PowerhouseVerifiableCredential> {
  const {
    signTypedData,
    address,
    chainId,
    app,
    appId,
    expiresInDays = 7,
  } = params;

  const issuerId = `did:pkh:${DEFAULT_RENOWN_NETWORK_ID}:${chainId}:${address.toLowerCase()}`;
  const credentialId = `urn:uuid:${globalThis.crypto.randomUUID()}`;
  const now = new Date();
  const expirationDate = new Date(
    now.getTime() + expiresInDays * 24 * 60 * 60 * 1000,
  );

  const message: CredentialMessage = {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    type: ["VerifiableCredential", "RenownCredential"],
    id: credentialId,
    issuer: { id: issuerId, ethereumAddress: address },
    credentialSubject: { id: appId, app },
    credentialSchema: {
      id: "https://renown.id/schemas/renown-credential/v1",
      type: "JsonSchemaValidator2018",
    },
    issuanceDate: now.toISOString(),
    expirationDate: expirationDate.toISOString(),
  };

  const domain: CredentialDomain = { version: "1", chainId };

  // viem and most wallet adapters reserve EIP712Domain and derive it from
  // `domain` — passing it explicitly makes them throw.
  const { EIP712Domain, ...signTypes } = CREDENTIAL_TYPES;
  void EIP712Domain;
  const signature = await signTypedData({
    domain,
    types: signTypes,
    primaryType: "VerifiableCredential",
    message,
  });

  return {
    ...message,
    proof: {
      type: "EthereumEip712Signature2021",
      created: message.issuanceDate,
      verificationMethod: issuerId,
      proofPurpose: "assertionMethod",
      proofValue: signature,
      ethereumAddress: address,
      eip712: {
        domain,
        types: CREDENTIAL_TYPES,
        primaryType: "VerifiableCredential",
      },
    },
  };
}

/** Recover the address that signed a credential's EIP-712 proof. */
export async function recoverCredentialSigner(
  credential: PowerhouseVerifiableCredential,
): Promise<Hex> {
  const { proof, ...message } = credential;
  // Drop EIP712Domain so viem derives it from `domain`; viem ignores
  // message keys not present in the types, so the proof is excluded too.
  const { EIP712Domain, ...types } = CREDENTIAL_TYPES;
  void EIP712Domain;
  return recoverTypedDataAddress({
    domain: proof.eip712.domain,
    types,
    primaryType: "VerifiableCredential",
    message,
    signature: proof.proofValue as Hex,
  } as Parameters<typeof recoverTypedDataAddress>[0]);
}

/** True when the proof was signed by the credential's declared issuer address. */
export async function verifyCredentialSignature(
  credential: PowerhouseVerifiableCredential,
): Promise<boolean> {
  try {
    const recovered = await recoverCredentialSigner(credential);
    return (
      recovered.toLowerCase() ===
      credential.issuer.ethereumAddress.toLowerCase()
    );
  } catch {
    // Malformed proof (bad hex, missing fields) is an invalid signature.
    return false;
  }
}
