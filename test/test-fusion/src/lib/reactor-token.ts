import { ambientRenownTokenProvider } from "@powerhousedao/reactor-browser/graphql-client";
import { readPersistedUser } from "@renown/sdk";
import { RENOWN_APP_NAME } from "./renown";

const TOKEN_WAIT_MS = 10_000;
const TOKEN_POLL_MS = 25;

/**
 * The ambient Renown token, held until a persisted session has rehydrated.
 *
 * `ambientRenownTokenProvider` answers `undefined` while Renown is still
 * restoring the session, so a request sent in that window goes out anonymous.
 * The switchboard answers it honestly (an empty list, a missing document) and a
 * cache keyed on the user keeps that answer. A persisted user means a session
 * is coming, so wait for it; nothing persisted means signed out, so answer at
 * once. A session that never produces a token fails the request rather than
 * sending it anonymously: an error retries, a cached empty answer sticks.
 *
 * The namespace must match the one RenownProvider is given, or this reads
 * another storage key, finds nothing and never waits.
 */
export async function rehydratedRenownToken(): Promise<string | undefined> {
  const token = await ambientRenownTokenProvider();
  if (token) return token;
  if (!readPersistedUser(RENOWN_APP_NAME)) return undefined;

  const deadline = Date.now() + TOKEN_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, TOKEN_POLL_MS));
    const retry = await ambientRenownTokenProvider();
    if (retry) return retry;
  }
  throw new Error(
    "The Renown session did not finish loading. Reload the page to try again.",
  );
}
