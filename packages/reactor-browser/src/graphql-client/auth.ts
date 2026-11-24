import { getPHStore } from "../hooks/ph-store.js";
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

  const renown = getPHStore()?.renown;
  if (!renown?.user) {
    return undefined;
  }

  return renown.getBearerToken({ expiresIn: ambientTokenExpiresInSeconds });
}

/** A Switchboard refused the credential a request's bearer carried. */
export type CredentialRefusal = {
  /** The door's reason: `expired`, `withdrawn-here`, `not-registered`, ... */
  reason: string;
  /** The GraphQL endpoint that refused, when the client knows it. */
  url?: string;
};

/**
 * What the tab did about a refusal: `anonymous` (the credential was dropped:
 * retry without a bearer), `again` (it was fixed, e.g. enrolled: retry with a
 * fresh bearer), or nothing to retry.
 */
export type CredentialRefusalHandler = (
  refusal: CredentialRefusal,
) => Promise<"anonymous" | "again" | undefined>;

let refusalHandler: CredentialRefusalHandler | undefined;

/** The app's answer to a refused credential (Connect: drop or enrol). */
export function setCredentialRefusalHandler(
  handler: CredentialRefusalHandler | undefined,
): void {
  refusalHandler = handler;
}

/** The reason a 401 names, from graphql-request's error or a response body. */
export function credentialRefusalOf(error: unknown): string | undefined {
  const response = (
    error as
      | { response?: { status?: unknown; body?: unknown } }
      | null
      | undefined
  )?.response;
  if (response?.status !== 401 || typeof response.body !== "string") {
    return undefined;
  }
  try {
    const { reason } = JSON.parse(response.body) as { reason?: unknown };
    return typeof reason === "string" ? reason : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Builds the SDK middleware that authenticates every request.
 *
 * The token is resolved per request and never cached, so a login, a logout or
 * an expiry between two calls is picked up by the next one. When no token is
 * available the request goes out unauthenticated. A credential the Switchboard
 * refuses goes to the app's refusal handler, and the request is retried once
 * as it says.
 */
export function makeAuthMiddleware(
  tokenProvider: BearerTokenProvider,
  options: { url?: string } = {},
): SdkFunctionWrapper {
  return async (action) => {
    const token = await tokenProvider();
    if (!token) {
      return action();
    }

    try {
      return await action({ authorization: `Bearer ${token}` });
    } catch (error) {
      const reason = credentialRefusalOf(error);
      const handled =
        reason && refusalHandler
          ? await refusalHandler({ reason, url: options.url }).catch(
              () => undefined,
            )
          : undefined;
      if (handled === "anonymous") return action();
      if (handled === "again") {
        const fresh = await tokenProvider();
        return fresh ? action({ authorization: `Bearer ${fresh}` }) : action();
      }
      throw error;
    }
  };
}
