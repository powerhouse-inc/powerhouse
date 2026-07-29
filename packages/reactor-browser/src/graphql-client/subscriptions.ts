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
