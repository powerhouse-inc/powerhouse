import type { SdkFunctionWrapper } from "../graphql/gen/schema.js";

/**
 * Resolves the bearer token to send with a request.
 *
 * Returning `undefined` (or an empty string) means "send this request
 * anonymously": open Switchboards must keep serving reads to logged-out users.
 */
export type BearerTokenProvider = () => Promise<string | undefined>;

/** Lifetime requested for an ambient Renown token, in seconds. */
const ambientTokenExpiresInSeconds = 600;

/**
 * The default token provider: the token of the currently logged-in Renown user.
 *
 * It is deliberately resolved from `window.ph` on every call rather than
 * captured at construction time, so a client built before login starts sending
 * the token as soon as there is one.
 *
 * The token is requested WITHOUT an `aud` claim - the Switchboard verifier
 * rejects tokens that carry an audience.
 */
export async function ambientRenownTokenProvider(): Promise<
  string | undefined
> {
  if (typeof window === "undefined") {
    return undefined;
  }

  const renown = window.ph?.renown;
  if (!renown?.user) {
    return undefined;
  }

  return renown.getBearerToken({ expiresIn: ambientTokenExpiresInSeconds });
}

/**
 * Builds the SDK middleware that authenticates every request.
 *
 * The token is resolved per request and never cached, so a login, a logout or
 * an expiry between two calls is picked up by the next one. When no token is
 * available the request goes out unauthenticated.
 */
export function makeAuthMiddleware(
  tokenProvider: BearerTokenProvider,
): SdkFunctionWrapper {
  return async (action) => {
    const token = await tokenProvider();
    if (!token) {
      return action();
    }

    return action({ authorization: `Bearer ${token}` });
  };
}
