import { DriveRequestError } from "@powerhousedao/reactor";
import { ambientRenownTokenProvider } from "../graphql-client/auth.js";

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
 * A failure throws `DriveRequestError` carrying the status, so
 * `isDriveAuthError` can tell a refusal from an unreachable host and the
 * caller can prompt for a login instead of reporting a network fault.
 */
export async function fetchDriveInfo(url: string): Promise<DriveInfo> {
  const token = await ambientRenownTokenProvider();

  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    throw new DriveRequestError(
      `Failed to resolve drive info from ${url}: HTTP ${response.status}`,
      response.status,
    );
  }

  return (await response.json()) as DriveInfo;
}
