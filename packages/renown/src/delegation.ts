import type {
  Action,
  ActionSigner,
  ActionSigningTarget,
  Signature,
  UserActionSigner,
} from "@powerhousedao/shared/document-model";
import {
  actionSignerIdentity,
  signActionV2,
} from "@powerhousedao/shared/document-model";
import { fromString, toString } from "uint8arrays";
import { verifyDelegationProof } from "./credential.js";
import { importDidPublicKey } from "./crypto/signer.js";
import type { IRenownCrypto } from "./crypto/types.js";
import type { Issuer, PowerhouseVerifiableCredential } from "./types.js";
import { parsePkhDid } from "./utils.js";

/** The tag of the `signatures` entry holding a statement, and of its binding. */
export const DELEGATION_TAG = "dlg1";

/** Keeps a statement apart from the bearer tokens the same key signs. */
export const DELEGATION_JWT_TYPE = "ph-delegation+jwt";

/** What a statement may name in this version. Nothing wider is accepted. */
export const DELEGABLE_OPERATIONS: readonly string[] = ["PUBLISH_WORKFLOW"];

const DEFAULT_LIFETIME_SECONDS = 30 * 24 * 60 * 60;
/** How far the browser's clock at issuance may run ahead of the signing tuple. */
const ISSUED_AT_TOLERANCE_SECONDS = 300;
const BINDING_PREFIX = `${DELEGATION_TAG}-`;

export type DelegationScope = {
  /** Action types the delegate may sign. */
  ops: string[];
  /** What the statement is for; the host using it checks this. */
  res: string;
};

export type DelegationClaims = {
  iss: string;
  aud: string;
  sub: string;
  env: string;
  scp: DelegationScope;
  iat: number;
  exp: number;
  jti: string;
  prf: PowerhouseVerifiableCredential;
};

export interface CreateDelegationParams {
  /** The session key named in `credential`. */
  issuer: Issuer;
  /** The Renown credential binding the person to `issuer`. */
  credential: PowerhouseVerifiableCredential;
  /** The delegate's `did:key`. */
  delegate: string;
  /** The `did:key` of the host the delegate writes to. */
  environment: string;
  scope: DelegationScope;
  /** Defaults to 30 days. */
  lifetimeSeconds?: number;
  /** Epoch seconds; defaults to the clock. */
  now?: number;
}

/**
 * Signs a statement naming `delegate`, with no wallet step: the session key
 * signs it, and the statement carries the credential so it verifies offline.
 */
export async function createDelegation(
  params: CreateDelegationParams,
): Promise<string> {
  const {
    issuer,
    credential,
    delegate,
    environment,
    scope,
    lifetimeSeconds = DEFAULT_LIFETIME_SECONDS,
    now = Math.floor(Date.now() / 1000),
  } = params;
  const claims: DelegationClaims = {
    iss: issuer.did,
    aud: delegate,
    sub: credential.issuer.id,
    env: environment,
    scp: scope,
    iat: now,
    exp: now + lifetimeSeconds,
    jti: globalThis.crypto.randomUUID(),
    prf: credential,
  };
  const signingInput = [
    encodeSegment({ alg: "ES256", typ: DELEGATION_JWT_TYPE }),
    encodeSegment(claims),
  ].join(".");
  const signature = await issuer.signer(signingInput);
  if (typeof signature !== "string") {
    throw new Error("A delegation issuer must sign as base64url");
  }
  return `${signingInput}.${signature}`;
}

/** The statement's claims, unverified; undefined when it does not parse. */
export function decodeDelegation(
  statement: string,
): DelegationClaims | undefined {
  const [, payload] = statement.split(".");
  if (!payload) return undefined;
  try {
    const claims = JSON.parse(
      toString(fromString(payload, "base64url")),
    ) as Partial<DelegationClaims> | null;
    return isClaims(claims) ? claims : undefined;
  } catch {
    return undefined;
  }
}

export type DelegationVerdict =
  | { ok: true; claims: DelegationClaims }
  | { ok: false; reason: string };

export interface VerifyDelegationParams {
  /** Who the action claims to act as. */
  user: UserActionSigner;
  /** The key that signed the action. */
  key: string;
  /** The signing tuple's time, in epoch seconds. */
  signedAt: number;
  /** The action's type. */
  actionType: string;
}

/**
 * Whether `statement` lets `key` sign this action as `user`. Offline and pure:
 * every replica reaches the same verdict at any time, so an old operation
 * verifies forever. The credential's own dates are not read: link one is judged
 * at issuance, and a credential outliving its seven days must not end a delegate.
 */
export async function verifyDelegation(
  statement: string,
  params: VerifyDelegationParams,
): Promise<DelegationVerdict> {
  const { user, key, signedAt, actionType } = params;
  const parts = statement.split(".");
  if (parts.length !== 3) return refuse("is not a compact JWS");
  const claims = decodeDelegation(statement);
  if (!claims) return refuse("has malformed claims");

  const header = decodeHeader(parts[0]);
  if (header?.alg !== "ES256" || header.typ !== DELEGATION_JWT_TYPE) {
    return refuse("has the wrong header");
  }
  if (!(await signedBy(claims.iss, parts))) {
    return refuse("is not signed by its issuer");
  }
  if (!samePerson(claims.sub, user)) {
    return refuse(`does not name ${user.address}`);
  }
  if (claims.aud !== key) {
    return refuse(`names ${claims.aud}, not the signing key ${key}`);
  }
  if (!(await chainsToPerson(claims, user))) {
    return refuse("has no credential binding its issuer to the person");
  }
  const scopeProblem = scopeRefusal(claims.scp, actionType);
  if (scopeProblem) return refuse(scopeProblem);
  if (
    signedAt < claims.iat - ISSUED_AT_TOLERANCE_SECONDS ||
    signedAt >= claims.exp
  ) {
    return refuse("does not cover the time the action was signed");
  }
  return { ok: true, claims };
}

export type DelegationCarried = {
  /** Absent: the tuple names a statement the signer does not carry. */
  statement?: string;
  /** The binding in the signing tuple; absent: not bound. */
  binding?: string;
  /** The signing tuple's time. */
  signedAt: number;
};

/** What `signer` carries of a delegation; undefined when it carries nothing. */
export function delegationOf(
  signer: ActionSigner,
): DelegationCarried | undefined {
  const signatures = signer.signatures as Signature[] | undefined;
  const tuple = signatures?.at(-1);
  if (!signatures || !tuple) return undefined;
  const statements = signatures
    .slice(0, -1)
    .filter((entry) => entry[0] === DELEGATION_TAG)
    .map((entry) => entry[3]);
  const binding = tuple[3]?.startsWith(BINDING_PREFIX) ? tuple[3] : undefined;
  if (statements.length === 0 && binding === undefined) return undefined;
  return {
    ...(statements.length === 1 ? { statement: statements[0] } : {}),
    ...(binding !== undefined ? { binding } : {}),
    signedAt: Number(tuple[0]),
  };
}

/** Why what `signer` carries does not stand as bound; undefined when it does. */
export async function bindingRefusal(
  carried: DelegationCarried,
): Promise<string | undefined> {
  if (carried.statement === undefined) {
    return "the signing tuple names a statement the action does not carry";
  }
  if (carried.binding === undefined) {
    return "the signing tuple does not cover the statement";
  }
  if (carried.binding !== (await delegationBinding(carried.statement))) {
    return "the signing tuple covers a different statement";
  }
  return undefined;
}

/** What the signing tuple's element [3] holds, so the signature covers the statement. */
export async function delegationBinding(statement: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(statement),
  );
  return BINDING_PREFIX + toString(new Uint8Array(digest), "base64url");
}

export interface SignDelegatedActionParams {
  action: Action;
  target: ActionSigningTarget;
  /** The delegate's key. */
  crypto: Pick<IRenownCrypto, "did" | "sign">;
  /** A label for `signer.app.name`; unsigned. */
  appName: string;
  /** The person the delegate signs as. */
  user: UserActionSigner;
  statement: string;
}

/**
 * Signs `action` as the person, carrying the statement in an earlier entry of
 * `signatures`. The reactor leaves an action already signed under a key as it
 * is, so this goes through any client.
 */
export async function signDelegatedAction(
  params: SignDelegatedActionParams,
): Promise<Action> {
  const { action, target, crypto, appName, user, statement } = params;
  const identity = actionSignerIdentity({
    user,
    app: { name: appName, key: crypto.did },
  });
  const tuple = await signActionV2({
    action,
    target,
    signer: identity,
    sign: (message) => crypto.sign(message),
    previousStateHash: await delegationBinding(statement),
  });
  const issuer = decodeDelegation(statement)?.iss ?? "";
  const entry: Signature = [DELEGATION_TAG, issuer, "", statement, ""];
  return {
    ...action,
    context: {
      ...action.context,
      signer: { ...identity, signatures: [entry, tuple] },
    },
  };
}

function refuse(reason: string): DelegationVerdict {
  return { ok: false, reason: `the statement ${reason}` };
}

function encodeSegment(value: unknown): string {
  return toString(fromString(JSON.stringify(value)), "base64url");
}

function decodeHeader(
  segment: string,
): { alg?: unknown; typ?: unknown } | undefined {
  try {
    return JSON.parse(toString(fromString(segment, "base64url"))) as {
      alg?: unknown;
      typ?: unknown;
    };
  } catch {
    return undefined;
  }
}

function isClaims(
  value: Partial<DelegationClaims> | null,
): value is DelegationClaims {
  return (
    !!value &&
    typeof value.iss === "string" &&
    typeof value.aud === "string" &&
    typeof value.sub === "string" &&
    typeof value.env === "string" &&
    typeof value.iat === "number" &&
    typeof value.exp === "number" &&
    typeof value.jti === "string" &&
    typeof value.scp === "object" &&
    value.scp !== null &&
    typeof value.prf === "object" &&
    value.prf !== null
  );
}

async function signedBy(issuer: string, parts: string[]): Promise<boolean> {
  try {
    const key = await importDidPublicKey(issuer);
    return await globalThis.crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      fromString(parts[2], "base64url"),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
  } catch {
    return false;
  }
}

function samePerson(subject: string, user: UserActionSigner): boolean {
  try {
    const person = parsePkhDid(subject);
    return (
      person.address.toLowerCase() === user.address.toLowerCase() &&
      person.networkId === user.networkId &&
      person.chainId === user.chainId
    );
  } catch {
    return false;
  }
}

/** Link one: the credential in `prf` binds the person to the statement's issuer. */
async function chainsToPerson(
  claims: DelegationClaims,
  user: UserActionSigner,
): Promise<boolean> {
  const credential = claims.prf;
  const address = user.address.toLowerCase();
  try {
    if (
      credential.credentialSubject.id !== claims.iss ||
      credential.issuer.id !== claims.sub ||
      credential.issuer.ethereumAddress.toLowerCase() !== address
    ) {
      return false;
    }
    return await verifyDelegationProof(credential, user.chainId);
  } catch {
    return false;
  }
}

function scopeRefusal(
  scope: DelegationScope,
  actionType: string,
): string | undefined {
  if (!Array.isArray(scope.ops) || scope.ops.length === 0) {
    return "names no operations";
  }
  const wider = scope.ops.find((op) => !DELEGABLE_OPERATIONS.includes(op));
  if (wider !== undefined) {
    return `names ${wider}, which cannot be delegated`;
  }
  if (!scope.ops.includes(actionType)) {
    return `does not cover ${actionType}`;
  }
  return undefined;
}
