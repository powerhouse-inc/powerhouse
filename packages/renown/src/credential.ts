import { recoverTypedDataAddress } from "viem";
import {
  CREDENTIAL_TYPES,
  DEFAULT_RENOWN_NETWORK_ID,
  DEFAULT_RENOWN_URL,
} from "./constants.js";
import type { IProof, PowerhouseVerifiableCredential } from "./types.js";
import { verifyAuthBearerToken } from "./utils.js";

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

// The deployed Renown API may omit proof.eip712.domain; it's canonical
// (version "1", the credential's chainId), so reconstruct it before verifying.
function withEip712Domain(
  credential: PowerhouseVerifiableCredential,
  chainId: number,
): PowerhouseVerifiableCredential {
  const eip712 = credential.proof.eip712 as
    | Partial<IProof["eip712"]>
    | undefined;
  if (eip712?.domain) return credential;
  return {
    ...credential,
    proof: {
      ...credential.proof,
      eip712: {
        domain: { version: "1", chainId },
        types: CREDENTIAL_TYPES,
        primaryType: "VerifiableCredential",
      },
    },
  };
}

export interface FetchDelegationCredentialOptions {
  /** Ethereum address that must have issued the credential. */
  address: string;
  /** Chain id the credential must be scoped to. */
  chainId: number;
  /** App/client DID the credential must delegate to (credentialSubject.id). */
  appDid: string;
  /** Renown service base URL. Defaults to DEFAULT_RENOWN_URL. */
  baseUrl?: string;
  /** Re-verify the EIP-712 proof signature (default true). */
  verifySignature?: boolean;
}

// Fetch the Renown delegation credential for (address, chainId) and validate it
// delegates to `appDid`; returns it, or undefined if absent/invalid. No throw.
export async function fetchDelegationCredential(
  options: FetchDelegationCredentialOptions,
): Promise<PowerhouseVerifiableCredential | undefined> {
  const {
    address,
    chainId,
    appDid,
    baseUrl = DEFAULT_RENOWN_URL,
    verifySignature = true,
  } = options;
  try {
    const url = new URL(
      `/api/auth/credential?address=${encodeURIComponent(address)}&chainId=${encodeURIComponent(chainId)}&connectId=${encodeURIComponent(appDid)}&appId=${encodeURIComponent(appDid)}`,
      baseUrl,
    );
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) return undefined;
    const { credential } = (await response.json()) as {
      credential?: PowerhouseVerifiableCredential;
    };
    if (!credential) return undefined;

    // Binding: delegates to this app DID, issued by this address on this chain
    // (issuer.id = did:pkh:<networkId>:<chainId>:<address>).
    const [, , , issuerChainId, issuerAddress] =
      credential.issuer.id.split(":");
    if (
      credential.credentialSubject.id !== appDid ||
      issuerChainId !== String(chainId) ||
      issuerAddress?.toLowerCase() !== address.toLowerCase() ||
      credential.issuer.ethereumAddress.toLowerCase() !== address.toLowerCase()
    ) {
      return undefined;
    }

    // Reject an expired credential. Renown revocation is expected to drop the
    // credential from the endpoint (a failed fetch), not flag it here.
    if (
      credential.expirationDate &&
      Date.parse(credential.expirationDate) <= Date.now()
    ) {
      return undefined;
    }

    if (verifySignature) {
      const withDomain = withEip712Domain(credential, chainId);
      if (
        withDomain.proof.eip712.domain.chainId !== chainId ||
        !(await verifyCredentialSignature(withDomain))
      ) {
        return undefined;
      }
      return withDomain;
    }
    return credential;
  } catch {
    return undefined;
  }
}

export interface VerifiedAuthCredential {
  address: string;
  chainId: number;
  networkId: string;
  /** Owner identity: the pkh DID (did:pkh:<net>:<chainId>:<address>). */
  did: string;
  /** App/client DID the bearer token was issued by. */
  appDid: string;
  credential: PowerhouseVerifiableCredential;
}

export interface VerifyAuthCredentialOptions {
  /** Expected `aud` claim on the bearer token. */
  audience?: string;
  /** Renown service base URL. */
  renownUrl?: string;
  /** Re-verify the credential's EIP-712 proof (default true). */
  verifySignature?: boolean;
}

// Verify a renown bearer token end to end: check the JWT, then fetch+verify the
// matching credential. Resolves the owner identity, or undefined. No throw.
export async function verifyAuthCredential(
  jwt: string,
  options: VerifyAuthCredentialOptions = {},
): Promise<VerifiedAuthCredential | undefined> {
  const verified = await verifyAuthBearerToken(jwt, {
    audience: options.audience,
  });
  if (!verified) return undefined;

  const { address, chainId, networkId } =
    verified.verifiableCredential.credentialSubject;
  const appDid = verified.issuer;
  const credential = await fetchDelegationCredential({
    address,
    chainId,
    appDid,
    baseUrl: options.renownUrl,
    verifySignature: options.verifySignature,
  });
  if (!credential) return undefined;

  return {
    address,
    chainId,
    networkId,
    did: credential.issuer.id,
    appDid,
    credential,
  };
}
