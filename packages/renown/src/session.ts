import { verifyAuthCredential } from "./credential.js";
import type { User } from "./types.js";
import { verifyAuthBearerToken } from "./utils.js";

/** Server-side view of an authenticated Renown session. */
export interface RenownSession {
  /** Authenticated user identity derived from the session token. */
  user: User;
  /** App/client DID the token was issued by. */
  appDid: string;
  /** Token expiry (epoch seconds), when present. */
  expiresAt?: number;
}

/** Display hint carried alongside the token (unverified; not for auth). */
export interface RenownSessionProfile {
  name?: string | null;
  avatar?: string | null;
}

/** The `renown_session` cookie payload: the bearer token + a display hint. */
export interface RenownSessionCookie {
  token: string;
  profile?: RenownSessionProfile | null;
}

export interface VerifyRenownSessionOptions {
  /** Expected `aud` claim on the token. */
  audience?: string;
  /** Switchboard GraphQL endpoint used when re-verifying the credential. */
  switchboardUrl?: string;
  /** Renown service base URL used when re-verifying the credential. */
  renownUrl?: string;
  /** Also re-verify the credential against Switchboard (default false = token-only, no network). */
  verifyCredential?: boolean;
}

/** Claims read from a session token without verifying its signature. */
export interface RenownSessionClaims {
  address?: string;
  chainId?: number;
  networkId?: string;
  /** Expiry in epoch seconds. */
  expiresAt?: number;
}

/** Serialize a session cookie value (token + optional display hint). */
export function serializeRenownSessionCookie(
  value: RenownSessionCookie,
): string {
  return JSON.stringify(value);
}

// Parse the JSON cookie envelope { token, profile }; undefined if malformed.
function parseSessionCookie(value: string): RenownSessionCookie | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as RenownSessionCookie).token === "string"
    ) {
      return parsed as RenownSessionCookie;
    }
  } catch {
    // Malformed cookie.
  }
  return undefined;
}

// Decode a session cookie's claims WITHOUT verifying the signature — cheap
// optimistic checks only (e.g. proxy redirect); never trust for access control.
export function readSessionClaims(
  value: string,
): RenownSessionClaims | undefined {
  const parsed = parseSessionCookie(value);
  if (!parsed) return undefined;
  const parts = parsed.token.split(".");
  if (parts.length < 2) return undefined;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload = JSON.parse(json) as {
      exp?: number;
      vc?: {
        credentialSubject?: {
          address?: string;
          chainId?: number;
          networkId?: string;
        };
      };
    };
    const subject = payload.vc?.credentialSubject;
    return {
      address: subject?.address,
      chainId: subject?.chainId,
      networkId: subject?.networkId,
      expiresAt: payload.exp,
    };
  } catch {
    return undefined;
  }
}

// Verify a session cookie (envelope or bare token) → user, or undefined. Pass
// verifyCredential:true to also check vs Switchboard; envelope hint is merged.
export async function verifyRenownSession(
  value: string,
  options: VerifyRenownSessionOptions = {},
): Promise<RenownSession | undefined> {
  const { verifyCredential = false } = options;
  const parsed = parseSessionCookie(value);
  if (!parsed) return undefined;
  const { token, profile } = parsed;

  let session: RenownSession | undefined;
  if (verifyCredential) {
    const verified = await verifyAuthCredential(token, {
      audience: options.audience,
      renownUrl: options.renownUrl,
      switchboardUrl: options.switchboardUrl,
    });
    if (verified) {
      session = {
        user: {
          address: verified.address as `0x${string}`,
          chainId: verified.chainId,
          networkId: verified.networkId,
          did: verified.did,
          credential: verified.credential,
        },
        appDid: verified.appDid,
      };
    }
  } else {
    const verified = await verifyAuthBearerToken(token, {
      audience: options.audience,
    });
    if (verified) {
      const subject = verified.verifiableCredential.credentialSubject;
      const did = `did:pkh:${subject.networkId}:${subject.chainId}:${subject.address.toLowerCase()}`;
      session = {
        user: {
          address: subject.address as `0x${string}`,
          chainId: subject.chainId,
          networkId: subject.networkId,
          did,
          credential: undefined,
        },
        appDid: verified.issuer,
        expiresAt: verified.payload.exp,
      };
    }
  }

  if (!session) return undefined;

  // Merge the (unverified) display hint from the envelope — display only.
  if (profile?.name) {
    session.user = {
      ...session.user,
      ens: { name: profile.name, avatarUrl: profile.avatar ?? undefined },
    };
  }
  return session;
}
