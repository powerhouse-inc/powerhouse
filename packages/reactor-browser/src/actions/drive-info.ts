import { DriveRequestError } from "@powerhousedao/reactor";
import { switchboardOfDrive } from "@powerhousedao/shared/host-tokens";
import {
  ambientRenownTokenProvider,
  answerCredentialRefusal,
  type BearerTokenProvider,
} from "../graphql-client/auth.js";

/**
 * The drive info endpoint's response: `GET <switchboard>/d/:drive`.
 *
 * Mirrors what the handler actually sends (graphql-manager.ts): `icon` is
 * emitted as `?? undefined` so it can be absent, while the rest are always
 * written.
 */
export type DriveInfo = {
  id: string;
  slug: string;
  name: string;
  icon?: string;
  meta: Record<string, unknown>;
  graphqlEndpoint: string;
};

/**
 * Reads a drive's info from a switchboard's REST endpoint.
 *
 * Drive discovery is the one read a client makes before it can authenticate
 * anything else: `graphqlEndpoint` is what the sync remote is registered with,
 * so nothing authenticated can happen until this call returns. That makes it
 * the one request most likely to be sent logged-out — and it is exactly the
 * call that must NOT be, because a switchboard running
 * `DOCUMENT_PERMISSIONS` refuses a protected drive to an anonymous caller
 * even when the logged-in user holds a grant on it.
 *
 * So the token goes out whenever there is one, with no `if (user)` guard: the
 * provider already answers `undefined` when logged out, and an open
 * switchboard serves that anonymously exactly as before.
 *
 * A credential the switchboard refuses goes to the app's refusal handler, as
 * the GraphQL clients' does (a browser pseudonym the switchboard has not seen
 * is enrolled there), and the request goes once more as it says.
 *
 * A failure throws `DriveRequestError` carrying the status, so
 * `isDriveAuthError` can tell a refusal from an unreachable host and the
 * caller can prompt for a login instead of reporting a network fault.
 */
export async function fetchDriveInfo(
  url: string,
  tokenProvider: BearerTokenProvider = ambientRenownTokenProvider,
): Promise<DriveInfo> {
  const send = (token: string | undefined) =>
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  const token = await tokenProvider();

  let response = await send(token);
  if (token && response.status === 401) {
    const handled = await answerRefusal(response, url);
    if (handled === "anonymous") response = await send(undefined);
    if (handled === "again") response = await send(await tokenProvider());
  }

  if (!response.ok) {
    throw new DriveRequestError(
      `Failed to resolve drive info from ${url}: HTTP ${response.status}`,
      response.status,
    );
  }

  return (await response.json()) as DriveInfo;
}

/** The refusal handler's answer to a 401 that names its reason. */
async function answerRefusal(response: Response, url: string) {
  const body = (await response.json().catch(() => undefined)) as
    | { reason?: unknown }
    | undefined;
  return typeof body?.reason === "string"
    ? answerCredentialRefusal({
        reason: body.reason,
        url: switchboardOfDrive(url)?.graphql,
      })
    : undefined;
}
