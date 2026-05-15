import type { NextFunction, Request, Response } from "express";
import { signPayload } from "@verdaccio/signature";
import { verifyAuthBearerToken } from "@renown/sdk/node";

export interface RenownAuthOptions {
  /** This registry's expected `aud` claim — typically its public origin
   *  (e.g. `https://registry.dev.vetra.io`). Tokens with a different audience
   *  fall through as unauthenticated, so they cannot be replayed against a
   *  different registry. */
  publicUrl: string;
  /** Verdaccio's top-level JWT signing secret. The middleware mints an
   *  in-process verdaccio-format JWT signed with this secret so verdaccio's
   *  built-in `apiJWTmiddleware` accepts the request. The token never leaves
   *  this pod, so a per-pod random secret is fine. */
  verdaccioSecret: string;
}

export interface RenownUser {
  address: string;
  did?: string;
  chainId?: number;
  networkId?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      renownUser?: RenownUser;
    }
  }
}

interface JwtPayloadShape {
  aud?: string | string[];
  iss?: string;
  exp?: number;
}

function audienceMatches(
  aud: string | string[] | undefined,
  expected: string,
): boolean {
  if (!aud) return false;
  if (Array.isArray(aud)) return aud.includes(expected);
  return aud === expected;
}

/**
 * Translates a Renown-signed Bearer token (verifiable from the issuer's DID,
 * stateless) into a verdaccio-format Bearer token (signed with verdaccio's
 * own secret) that verdaccio's normal auth pipeline accepts.
 *
 * Falls through (calls `next()` without modifying auth) on any verification
 * failure: malformed token, bad signature, expired, audience mismatch, or
 * non-renown bearer token. This keeps the legacy htpasswd path usable during
 * the migration grace period — verdaccio's own apiJWTmiddleware sees the
 * original Authorization header and decides what to do with it.
 */
export function createRenownAuthMiddleware(opts: RenownAuthOptions) {
  const expectedAud = opts.publicUrl;

  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return next();
    }

    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      return next();
    }

    let verified: Awaited<ReturnType<typeof verifyAuthBearerToken>>;
    try {
      // Pass `audience` so did-jwt validates the `aud` claim itself. Tokens
      // minted by ph-cli for this registry carry aud=publicUrl; if we don't
      // tell did-jwt what audience to accept, it throws
      // `invalid_config: JWT audience is required but your app address has
      // not been configured` and we silently fall through.
      verified = await verifyAuthBearerToken(token, { audience: expectedAud });
    } catch {
      return next();
    }
    if (!verified) {
      return next();
    }

    // Defence-in-depth: did-jwt's `audience` option already enforced this,
    // but verify the claim again in case verifyAuthBearerToken's behavior
    // ever changes (e.g. silently passing without checking).
    const payload = verified.payload as JwtPayloadShape | undefined;
    if (!audienceMatches(payload?.aud, expectedAud)) {
      return next();
    }

    const subject = verified.verifiableCredential.credentialSubject;
    if (!subject?.address) {
      return next();
    }

    const address = subject.address.toLowerCase();
    const groups = ["$authenticated", "renown"];

    let verdaccioJwt: string;
    try {
      verdaccioJwt = await signPayload(
        { name: address, real_groups: groups, groups } as any,
        opts.verdaccioSecret,
        { expiresIn: "5m" },
      );
    } catch (err) {
      console.error("[registry] failed to mint internal verdaccio token:", err);
      return next();
    }

    req.headers.authorization = `Bearer ${verdaccioJwt}`;
    req.renownUser = {
      address,
      did: payload?.iss,
      chainId: subject.chainId,
      networkId: subject.networkId,
    };
    return next();
  };
}
