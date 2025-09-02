import { getAuthenticatedDID } from "@didtools/key-did";
import { EdDSASigner } from "did-jwt";
import {
  createVerifiableCredentialJwt,
  verifyCredential,
  type Issuer,
  type JwtCredentialPayload,
} from "did-jwt-vc";
import { Resolver } from "did-resolver";
import { getResolver as keyDidResolver } from "key-did-resolver";
export type PKHDid = {
  networkId: string;
  chainId: number;
  address: `0x${string}`;
};

export function parsePkhDid(did: string): PKHDid {
  const parts = did.split(":");
  if (!did.startsWith("did:pkh:") || parts.length !== 5) {
    throw new Error("Invalid pkh did");
  }
  const [, , networkId, chainIdStr, address] = parts;

  if (!address.startsWith("0x")) {
    throw new Error(`Invalid address: ${address}`);
  }

  const chainId = Number(chainIdStr);
  if (isNaN(chainId)) {
    throw new Error(`Invalid chain id: ${chainIdStr}`);
  }

  return {
    chainId,
    networkId,
    address: address as PKHDid["address"],
  };
}

export async function verifyAuthBearerToken(jwt: string) {
  try {
    const verified = await verifyCredential(jwt, getResolver());
    return verified;
  } catch (e) {
    console.error(e);
    return false;
  }
}

export async function createAuthBearerToken(
  chainId: number,
  networkId: string,
  address: string,
  issuer: Issuer,
  expiresIn?: number,
) {
  const vcPayload: JwtCredentialPayload = {
    sub: issuer.did,
    vc: {
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      type: ["VerifiableCredential"],
      credentialSubject: {
        chainId,
        networkId,
        address,
      },
    },
  };

  const jwt = await createVerifiableCredentialJwt(vcPayload, issuer, {
    expiresIn,
  });
  return jwt;
}
export const getResolver = () => {
  const keyResolver = keyDidResolver();
  if (!keyResolver) {
    throw new Error("Failed to get key resolver");
  }

  return new Resolver(keyResolver);
};

export async function getIssuer(privateKey: Uint8Array): Promise<Issuer> {
  const signer = EdDSASigner(privateKey);
  const did = await getAuthenticatedDID(privateKey);
  return {
    did: did.id,
    signer,
    alg: "EdDSA",
  };
}
