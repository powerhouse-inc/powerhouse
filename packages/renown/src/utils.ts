import { getAuthenticatedDID } from "@didtools/key-did";
import { EdDSASigner } from "did-jwt";
import type {
  Issuer,
  JwtCredentialPayload,
  VerifiedCredential,
} from "did-jwt-vc";
import { createVerifiableCredentialJwt, verifyCredential } from "did-jwt-vc";
import { Resolver } from "did-resolver";
import { getResolver as keyDidResolver } from "key-did-resolver";
import type {
  AuthVerifiedCredential,
  CreateBearerTokenOptions,
  IAuthCredentialSubject,
  PKHDid,
} from "./types.js";

export type ILogger = {
  level: "verbose" | "debug" | "info" | "warn" | "error";

  verbose: (message: string, ...replacements: any[]) => void;
  debug: (message: string, ...replacements: any[]) => void;
  info: (message: string, ...replacements: any[]) => void;
  warn: (message: string, ...replacements: any[]) => void;
  error: (message: string, ...replacements: any[]) => void;
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

export async function verifyAuthBearerToken(
  jwt: string,
): Promise<false | AuthVerifiedCredential> {
  try {
    const now = parseInt(String(Date.now() / 1000));
    const verified = await verifyCredential(jwt, getResolver(), {
      policies: {
        now: parseInt(String(Date.now() / 1000)),
        expirationDate: true,
        issuanceDate: true,
      },
    });

    if (verified.payload.exp && verified.payload.exp! < now) {
      return false;
    }
    assertIsAuthCredential(verified);
    return verified;
  } catch (e) {
    console.error(e);
    return false;
  }
}

export function assertIsAuthCredential(
  credential: VerifiedCredential,
): asserts credential is AuthVerifiedCredential {
  const subjectKeys = Object.keys(
    credential.verifiableCredential.credentialSubject,
  );
  if (
    !["address", "chainId", "networkId"].every((key) =>
      subjectKeys.includes(key),
    )
  ) {
    throw new Error(
      "Invalid Auth Credential Subject:" +
        JSON.stringify(
          credential.verifiableCredential.credentialSubject,
          null,
          2,
        ),
    );
  }
}

export async function createAuthBearerToken(
  chainId: number,
  networkId: string,
  address: string,
  issuer: Issuer,
  options?: CreateBearerTokenOptions,
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
      } satisfies IAuthCredentialSubject,
    },
    aud: options?.aud,
  };

  const jwt = await createVerifiableCredentialJwt(vcPayload, issuer, {
    expiresIn: options?.expiresIn,
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
