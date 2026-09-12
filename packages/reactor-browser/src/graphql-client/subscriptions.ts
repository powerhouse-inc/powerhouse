import { print } from "graphql";
import { createClient } from "graphql-ws/client";
import {
  DocumentChangesDocument,
  type DocumentChangesSubscription,
} from "../graphql/gen/schema.js";
import type { BearerTokenProvider } from "./auth.js";

/** The `documentChanges` payload, exactly as the Switchboard sends it. */
export type DocumentChangesEventPayload =
  DocumentChangesSubscription["documentChanges"];

/** The connection payload sent with the `ConnectionInit` message. */
export type ConnectionParams = Record<string, string>;

export type DocumentChangesSubscriptionOptions = {
  /** The websocket endpoint, e.g. `ws://localhost:4001/graphql/subscriptions`. */
  wsUrl: string;

  /**
   * Resolves the `ConnectionInit` payload. Called again on every reconnect, so
   * a token that expired while the socket was down is refreshed on the way back
   * up.
   */
  connectionParams?: () => Promise<ConnectionParams>;

  /** Called once per server event. */
  onEvent: (event: DocumentChangesEventPayload) => void;

  /**
   * Called when the socket gives up: the retries built into `graphql-ws` are
   * exhausted, or the server rejected the subscription. Realtime is an
   * enhancement, so callers are expected to log and carry on.
   */
  onError: (error: unknown) => void;
};

/**
 * The 4403 close reasons a Switchboard refuses a handshake with.
 *
 * Mirrors `WS_AUTH_CLOSE_REASONS` in `@powerhousedao/reactor-api`
 * (`src/graphql/gateway/types.ts`). This package does not depend on that one,
 * so the strings are duplicated and are a wire contract: change them on both
 * sides or not at all.
 */
const authCloseReasons: readonly string[] = [
  "authentication-required",
  "bearer-rejected",
];

/** graphql-ws's own `isLikeCloseEvent`, which it does not export. */
function isLikeCloseEvent(
  value: unknown,
): value is { code: number; reason: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "reason" in value
  );
}

/**
 * Whether a socket failure is the Switchboard refusing the credentials sent.
 *
 * Keyed on the close reason, not the code: both refusals close 4403, because
 * `connectionParams` is resolved per connect and a reconnect carrying a fresh
 * token genuinely succeeds. What the reason adds is that *this* attempt cannot
 * be fixed by repeating it.
 */
export function isAuthRefusalClose(error: unknown): boolean {
  return isLikeCloseEvent(error) && authCloseReasons.includes(error.reason);
}

/**
 * Opens one `documentChanges` subscription and feeds every event to `onEvent`.
 *
 * The subscription is a firehose: no `search` argument, so the server sends
 * every change the connection is allowed to see and the caller filters. This is
 * the only module that knows about `graphql-ws`.
 *
 * Returns the stop function, which cancels the subscription and closes the
 * socket. It is safe to call more than once.
 */
export function startDocumentChangesSubscription(
  options: DocumentChangesSubscriptionOptions,
): () => void {
  const client = createClient({
    url: options.wsUrl,
    connectionParams: options.connectionParams,
    // An auth refusal is not a transient fault: only a credential change clears
    // it, so decline instead of burning the five default attempts and then
    // reporting the same failure a half-minute later. Everything else - a
    // network drop, a 1006, a server restart - keeps graphql-ws's own default,
    // which retries close events and gives up on anything else.
    shouldRetry: (errOrCloseEvent) =>
      isLikeCloseEvent(errOrCloseEvent) && !isAuthRefusalClose(errOrCloseEvent),
  });

  const unsubscribe = client.subscribe<DocumentChangesSubscription>(
    {
      operationName: "DocumentChanges",
      query: print(DocumentChangesDocument),
    },
    {
      next: (result) => {
        const event = result.data?.documentChanges;
        if (event) {
          options.onEvent(event);
        }
      },
      error: (error) => options.onError(error),
      // The server never completes this subscription of its own accord; a
      // completion means the socket was closed, which needs no handling.
      complete: () => undefined,
    },
  );

  let stopped = false;
  return () => {
    if (stopped) {
      return;
    }
    stopped = true;
    unsubscribe();
    void client.dispose();
  };
}

/**
 * Derives the websocket endpoint from the GraphQL http endpoint.
 *
 * `http://host/graphql` becomes `ws://host/graphql/subscriptions`, which is
 * where the Switchboard mounts its websocket server (`packages/reactor-api`
 * `startServer`). A URL that already speaks `ws`/`wss` only gets the path.
 */
export function subscriptionsUrlFromGraphqlUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, "");
  const wsUrl = trimmed.startsWith("https://")
    ? `wss://${trimmed.slice("https://".length)}`
    : trimmed.startsWith("http://")
      ? `ws://${trimmed.slice("http://".length)}`
      : trimmed;
  return `${wsUrl}/subscriptions`;
}

/**
 * Turns a bearer token provider into `connectionParams`.
 *
 * The header key is the lowercase `authorization` the Switchboard's websocket
 * context factory reads. Without a token the payload is empty: an open
 * Switchboard serves anonymous subscribers.
 */
export function makeAuthConnectionParams(
  tokenProvider: BearerTokenProvider,
): () => Promise<ConnectionParams> {
  return async (): Promise<ConnectionParams> => {
    const token = await tokenProvider();
    if (!token) {
      return {};
    }
    return { authorization: `Bearer ${token}` };
  };
}
