import { verifyAuthCredential } from "@renown/sdk";

// Resolve a renown bearer token to the owner's pkh DID, or undefined.
export type RenownVerifier = (token: string) => Promise<string | undefined>;

export interface RenownVerifierConfig {
  /** Expected `aud` on the bearer token — this registry's public URL. */
  publicUrl: string;
  /** Renown service base URL (defaults to the SDK's default). */
  renownUrl?: string;
  /** Result cache TTL; 0 disables caching. Defaults to 60s. */
  cacheTtlMs?: number;
}

// Thin cache over the SDK's verifyAuthCredential (JWT + credential fetch) that
// yields the owner DID. Cached by token so publishes skip repeat round-trips.
export function createRenownVerifier(
  config: RenownVerifierConfig,
): RenownVerifier {
  const ttl = config.cacheTtlMs ?? 60_000;
  const maxEntries = 1000;
  const cache = new Map<string, { did: string; expiresAt: number }>();

  return async (token: string) => {
    if (ttl > 0) {
      const cached = cache.get(token);
      if (cached) {
        if (cached.expiresAt > Date.now()) return cached.did;
        cache.delete(token);
      }
    }
    const result = await verifyAuthCredential(token, {
      audience: config.publicUrl,
      renownUrl: config.renownUrl,
    });
    const did = result?.did;
    // Cache only positive results: a credential provisioned or revoked mid-TTL
    // must take effect without waiting out a cached miss. Bound the map size.
    if (ttl > 0 && did) {
      cache.set(token, { did, expiresAt: Date.now() + ttl });
      if (cache.size > maxEntries) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
    }
    return did;
  };
}

// verdaccio passes these when calling a plugin's apiJWTmiddleware(helpers).
export interface JwtMiddlewareHelpers {
  createRemoteUser(name: string, groups: string[]): unknown;
  createAnonymousRemoteUser(): unknown;
}

export interface MiddlewareReq {
  headers: { authorization?: string };
  pause(): void;
  resume(): void;
  remote_user?: unknown;
}
export interface MiddlewareRes {
  locals: Record<string, unknown>;
}
export type ApiJwtMiddleware = (
  req: MiddlewareReq,
  res: MiddlewareRes,
  next: () => void,
) => void;

// verdaccio API JWT middleware: anonymous by default; a valid renown token sets
// remote_user to the owner DID. Never rejects — allow_publish gates the rest.
export function renownApiJwtMiddleware(
  verify: RenownVerifier,
  helpers: JwtMiddlewareHelpers,
): ApiJwtMiddleware {
  return (req: MiddlewareReq, res: MiddlewareRes, next: () => void): void => {
    const anon = helpers.createAnonymousRemoteUser();
    req.remote_user = anon;
    res.locals.remote_user = anon;

    const header = req.headers.authorization;
    const token =
      header && /^Bearer /i.test(header) ? header.slice(7).trim() : undefined;
    if (!token) {
      next();
      return;
    }

    // Pause the request while the (possibly networked) verify runs so the
    // publish body isn't consumed before the route handler reads it.
    req.pause();
    verify(token)
      .then((did) => {
        if (did) {
          const user = helpers.createRemoteUser(did, ["renown"]);
          req.remote_user = user;
          res.locals.remote_user = user;
        }
      })
      .catch(() => undefined)
      .finally(() => {
        req.resume();
        next();
      });
  };
}
