import { recoverTypedDataAddress } from "viem";
import type { SignCredentialTypedData } from "./credential.js";
import type { PowerhouseVerifiableCredential } from "./types.js";

/**
 * Enrolment at a host without file access (hosted Connect with a browser
 * pseudonym): the host keeps the credential's record because a request signed
 * by the address's own key asks it to, and withdraws it the same way. The host
 * names itself and hands out a single-use nonce, so a request cannot be
 * replayed; a withdrawn credential cannot be enrolled again.
 */

type Hex = `0x${string}`;

/** Under the host's base path. */
export const CREDENTIAL_ROUTES = {
  challenge: "/credentials/challenge",
  enrol: "/credentials/enrol",
  withdraw: "/credentials/withdraw",
} as const;

export const CREDENTIAL_RECORD_DOMAIN_NAME = "Powerhouse credential record";

export const CREDENTIAL_RECORD_REQUEST_TYPES = {
  CredentialRecordRequest: [
    { name: "action", type: "string" },
    { name: "host", type: "string" },
    { name: "nonce", type: "string" },
    { name: "sessionDid", type: "string" },
    { name: "credentialId", type: "string" },
  ],
} as const;

/** `sessionDid` and `credentialId` "*" withdraw every record of the address. */
export type CredentialRecordRequest = {
  action: "enrol" | "withdraw";
  /** The host's own key (did:key), from its challenge. */
  host: string;
  nonce: string;
  sessionDid: string;
  credentialId: string;
};

export type CredentialChallenge = {
  host: string;
  nonce: string;
  expiresAt: string;
};

function typedData(request: CredentialRecordRequest, chainId: number) {
  return {
    domain: { name: CREDENTIAL_RECORD_DOMAIN_NAME, version: "1", chainId },
    types: CREDENTIAL_RECORD_REQUEST_TYPES,
    primaryType: "CredentialRecordRequest" as const,
    message: request,
  };
}

export function signCredentialRecordRequest(
  signTypedData: SignCredentialTypedData,
  request: CredentialRecordRequest,
  chainId: number,
): Promise<Hex> {
  return signTypedData(
    typedData(
      request,
      chainId,
    ) as unknown as Parameters<SignCredentialTypedData>[0],
  );
}

/** The address that signed `request`, or undefined for a malformed signature. */
export async function recoverCredentialRecordRequestSigner(
  request: CredentialRecordRequest,
  signature: string,
  chainId: number,
): Promise<Hex | undefined> {
  try {
    return await recoverTypedDataAddress({
      ...typedData(request, chainId),
      signature: signature as Hex,
    } as Parameters<typeof recoverTypedDataAddress>[0]);
  } catch {
    return undefined;
  }
}

function routeUrl(hostUrl: string, route: string): string {
  const base = hostUrl.endsWith("/") ? hostUrl : `${hostUrl}/`;
  return new URL(route.slice(1), base).href;
}

type Fetch = typeof globalThis.fetch;

async function answer<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => undefined)) as
    | (T & { error?: string })
    | undefined;
  if (!response.ok) {
    throw new Error(
      body?.error ?? `The host answered ${response.status} to the request`,
    );
  }
  return body as T;
}

async function challenge(hostUrl: string, fetch: Fetch) {
  return answer<CredentialChallenge>(
    await fetch(routeUrl(hostUrl, CREDENTIAL_ROUTES.challenge)),
  );
}

function chainOf(credential: PowerhouseVerifiableCredential): number {
  return Number(credential.issuer.id.split(":")[3]);
}

/** Asks the host at `hostUrl` to keep a record of `credential`. */
export async function enrolCredential(o: {
  hostUrl: string;
  credential: PowerhouseVerifiableCredential;
  /** Signs as the credential's issuer. */
  signTypedData: SignCredentialTypedData;
  fetch?: Fetch;
}): Promise<{ id: string; expiresAt: string }> {
  const fetch = o.fetch ?? globalThis.fetch;
  const { host, nonce } = await challenge(o.hostUrl, fetch);
  const request: CredentialRecordRequest = {
    action: "enrol",
    host,
    nonce,
    sessionDid: o.credential.credentialSubject.id,
    credentialId: o.credential.id,
  };
  const signature = await signCredentialRecordRequest(
    o.signTypedData,
    request,
    chainOf(o.credential),
  );
  return answer(
    await fetch(routeUrl(o.hostUrl, CREDENTIAL_ROUTES.enrol), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credential: o.credential, request, signature }),
    }),
  );
}

/** Asks the host to withdraw the records of `address`: one session, or all. */
export async function withdrawEnrolment(o: {
  hostUrl: string;
  chainId: number;
  /** Unset: every record of the signer. */
  sessionDid?: string;
  /** Signs as the address whose records go. */
  signTypedData: SignCredentialTypedData;
  fetch?: Fetch;
}): Promise<{ withdrawn: string[] }> {
  const fetch = o.fetch ?? globalThis.fetch;
  const { host, nonce } = await challenge(o.hostUrl, fetch);
  const request: CredentialRecordRequest = {
    action: "withdraw",
    host,
    nonce,
    sessionDid: o.sessionDid ?? "*",
    credentialId: "*",
  };
  const signature = await signCredentialRecordRequest(
    o.signTypedData,
    request,
    o.chainId,
  );
  return answer(
    await fetch(routeUrl(o.hostUrl, CREDENTIAL_ROUTES.withdraw), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ request, signature, chainId: o.chainId }),
    }),
  );
}
