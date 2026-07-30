import {
  DocumentChangeType,
  type DocumentChangeEvent,
} from "@powerhousedao/reactor";
import { logger } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentChangeType as GqlDocumentChangeType } from "../../src/graphql/gen/schema.js";
import { GraphQLReactorClient } from "../../src/graphql-client/graphql-reactor-client.js";
import {
  makeAuthConnectionParams,
  startDocumentChangesSubscription,
  subscriptionsUrlFromGraphqlUrl,
  type DocumentChangesEventPayload,
} from "../../src/graphql-client/subscriptions.js";

/**
 * A stand-in for the `graphql-ws` client, recording every socket the code under
 * test opens so a case can drive it: push an event through a sink, fail it, or
 * assert it was closed again.
 */
const ws = vi.hoisted(() => {
  type Sink = {
    next: (value: unknown) => void;
    error: (error: unknown) => void;
    complete: () => void;
  };
  type Payload = { query: string; operationName?: string | null };
  type Subscription = { payload: Payload; sink: Sink; unsubscribed: boolean };
  type Options = {
    url: string;
    connectionParams?: () => Promise<Record<string, string>>;
  };
  type Socket = {
    options: Options;
    subscriptions: Subscription[];
    disposed: boolean;
  };

  const sockets: Socket[] = [];

  function createClient(options: Options) {
    const socket: Socket = { options, subscriptions: [], disposed: false };
    sockets.push(socket);
    return {
      subscribe(payload: Payload, sink: Sink) {
        const subscription: Subscription = {
          payload,
          sink,
          unsubscribed: false,
        };
        socket.subscriptions.push(subscription);
        return () => {
          subscription.unsubscribed = true;
        };
      },
      dispose() {
        socket.disposed = true;
      },
      on: () => () => undefined,
      terminate: () => undefined,
    };
  }

  return {
    sockets,
    createClient,
    reset() {
      sockets.length = 0;
    },
    only() {
      expect(sockets).toHaveLength(1);
      return sockets[0];
    },
  };
});

vi.mock("graphql-ws/client", () => ({ createClient: ws.createClient }));

const url = "http://localhost:4001/graphql";
const wsUrl = "ws://localhost:4001/graphql/subscriptions";

function documentFields(id: string, name = "My Doc") {
  return {
    id,
    slug: `${id}-slug`,
    name,
    documentType: "powerhouse/test",
    state: { global: { name }, local: {} },
    createdAtUtcIso: "2026-01-01T00:00:00.000Z",
    lastModifiedAtUtcIso: "2026-01-02T00:00:00.000Z",
    revisionsList: [{ scope: "global", revision: 3 }],
  };
}

function updatedPayload(id: string): DocumentChangesEventPayload {
  return {
    type: GqlDocumentChangeType.Updated,
    documents: [documentFields(id)],
    context: null,
  };
}

function deletedPayload(id: string): DocumentChangesEventPayload {
  return {
    type: GqlDocumentChangeType.Deleted,
    documents: [],
    context: { parentId: null, childId: id },
  };
}

/** Pushes a server event down the only open socket. */
function pushEvent(payload: DocumentChangesEventPayload): void {
  ws.only().subscriptions[0].sink.next({
    data: { documentChanges: payload },
  });
}

beforeEach(() => {
  ws.reset();
  window.ph = {};
});

afterEach(() => {
  ws.reset();
  window.ph = {};
  vi.restoreAllMocks();
});

describe("subscriptionsUrlFromGraphqlUrl", () => {
  it("turns an http endpoint into the ws subscriptions endpoint", () => {
    expect(subscriptionsUrlFromGraphqlUrl(url)).toBe(wsUrl);
  });

  it("turns an https endpoint into a wss endpoint", () => {
    expect(subscriptionsUrlFromGraphqlUrl("https://switchboard/graphql")).toBe(
      "wss://switchboard/graphql/subscriptions",
    );
  });

  it("ignores a trailing slash", () => {
    expect(subscriptionsUrlFromGraphqlUrl(`${url}/`)).toBe(wsUrl);
  });

  it("leaves a ws endpoint on its own scheme", () => {
    expect(subscriptionsUrlFromGraphqlUrl("wss://switchboard/graphql")).toBe(
      "wss://switchboard/graphql/subscriptions",
    );
  });
});

describe("makeAuthConnectionParams", () => {
  it("sends the token as a lowercase authorization header", async () => {
    const params = makeAuthConnectionParams(() => Promise.resolve("the-token"));

    await expect(params()).resolves.toEqual({
      authorization: "Bearer the-token",
    });
  });

  it("sends nothing when there is no token", async () => {
    const params = makeAuthConnectionParams(() => Promise.resolve(undefined));

    await expect(params()).resolves.toEqual({});
  });

  it("resolves the token on every connect, never caching it", async () => {
    const tokens = ["first", "second"];
    const params = makeAuthConnectionParams(() =>
      Promise.resolve(tokens.shift()),
    );

    await expect(params()).resolves.toEqual({ authorization: "Bearer first" });
    await expect(params()).resolves.toEqual({ authorization: "Bearer second" });
  });
});

describe("startDocumentChangesSubscription", () => {
  it("opens one socket on the given endpoint", () => {
    startDocumentChangesSubscription({
      wsUrl,
      onEvent: vi.fn(),
      onError: vi.fn(),
    });

    expect(ws.only().options.url).toBe(wsUrl);
  });

  it("subscribes to the whole firehose", () => {
    startDocumentChangesSubscription({
      wsUrl,
      onEvent: vi.fn(),
      onError: vi.fn(),
    });

    const { payload } = ws.only().subscriptions[0];
    expect(payload.operationName).toBe("DocumentChanges");
    expect(payload.query).toContain("subscription DocumentChanges");
    // No `search` argument: the server sends everything and the client filters.
    expect(payload.query).toContain("documentChanges(search: $search");
    expect(payload.query).toContain("fragment PHDocumentFields");
  });

  it("reports every event that carries data", () => {
    const onEvent = vi.fn();
    startDocumentChangesSubscription({ wsUrl, onEvent, onError: vi.fn() });

    const payload = updatedPayload("doc-1");
    ws.only().subscriptions[0].sink.next({
      data: { documentChanges: payload },
    });

    expect(onEvent).toHaveBeenCalledExactlyOnceWith(payload);
  });

  it("ignores a result with no data", () => {
    const onEvent = vi.fn();
    startDocumentChangesSubscription({ wsUrl, onEvent, onError: vi.fn() });

    ws.only().subscriptions[0].sink.next({
      errors: [{ message: "no" }],
      data: null,
    });

    expect(onEvent).not.toHaveBeenCalled();
  });

  it("reports a failed socket", () => {
    const onError = vi.fn();
    startDocumentChangesSubscription({ wsUrl, onEvent: vi.fn(), onError });

    const failure = new Error("connection refused");
    ws.only().subscriptions[0].sink.error(failure);

    expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
  });

  it("unsubscribes and closes the socket when stopped", () => {
    const stop = startDocumentChangesSubscription({
      wsUrl,
      onEvent: vi.fn(),
      onError: vi.fn(),
    });

    stop();

    expect(ws.only().subscriptions[0].unsubscribed).toBe(true);
    expect(ws.only().disposed).toBe(true);
  });

  it("survives being stopped twice", () => {
    const stop = startDocumentChangesSubscription({
      wsUrl,
      onEvent: vi.fn(),
      onError: vi.fn(),
    });

    stop();

    expect(() => stop()).not.toThrow();
  });
});

describe("GraphQLReactorClient realtime", () => {
  it("opens no socket before the first subscriber", () => {
    new GraphQLReactorClient({ url });

    expect(ws.sockets).toHaveLength(0);
  });

  it("opens the derived endpoint on the first subscriber", () => {
    const client = new GraphQLReactorClient({ url });

    client.subscribe({}, vi.fn());

    expect(ws.only().options.url).toBe(wsUrl);
  });

  it("opens one socket however many subscribers there are", () => {
    const client = new GraphQLReactorClient({ url });

    client.subscribe({}, vi.fn());
    client.subscribe({ ids: ["doc-1"] }, vi.fn());

    expect(ws.sockets).toHaveLength(1);
  });

  it("prefers an explicit subscriptions endpoint", () => {
    const client = new GraphQLReactorClient({
      url,
      subscriptionsUrl: "wss://elsewhere/subscriptions",
    });

    client.subscribe({}, vi.fn());

    expect(ws.only().options.url).toBe("wss://elsewhere/subscriptions");
  });

  it("opens no socket at all when realtime is off", () => {
    const client = new GraphQLReactorClient({ url, realtime: false });

    client.subscribe({}, vi.fn());

    expect(ws.sockets).toHaveLength(0);
  });

  it("authenticates the connection with the client's token provider", async () => {
    const client = new GraphQLReactorClient({
      url,
      tokenProvider: () => Promise.resolve("socket-token"),
    });
    client.subscribe({}, vi.fn());

    const params = ws.only().options.connectionParams;

    await expect(params?.()).resolves.toEqual({
      authorization: "Bearer socket-token",
    });
  });

  it("delivers a server update as an Updated event", () => {
    const client = new GraphQLReactorClient({ url });
    const callback = vi.fn<(event: DocumentChangeEvent) => void>();
    client.subscribe({}, callback);

    pushEvent(updatedPayload("doc-1"));

    expect(callback).toHaveBeenCalledTimes(1);
    const event = callback.mock.calls[0][0];
    expect(event.type).toBe(DocumentChangeType.Updated);
    expect(event.documents).toHaveLength(1);
    expect(event.documents[0].header.id).toBe("doc-1");
    expect(event.documents[0].state).toEqual({
      global: { name: "My Doc" },
      local: {},
    });
  });

  it("delivers a server delete with the deleted id on the context", () => {
    const client = new GraphQLReactorClient({ url });
    const callback = vi.fn<(event: DocumentChangeEvent) => void>();
    client.subscribe({}, callback);

    pushEvent(deletedPayload("doc-1"));

    expect(callback).toHaveBeenCalledTimes(1);
    const event = callback.mock.calls[0][0];
    expect(event.type).toBe(DocumentChangeType.Deleted);
    expect(event.documents).toEqual([]);
    expect(event.context).toEqual({ parentId: undefined, childId: "doc-1" });
  });

  it("filters server events per subscriber, like its own emissions", () => {
    const client = new GraphQLReactorClient({ url });
    const wanted = vi.fn();
    const unwanted = vi.fn();
    client.subscribe({ ids: ["doc-1"] }, wanted);
    client.subscribe({ ids: ["doc-2"] }, unwanted);

    pushEvent(updatedPayload("doc-1"));

    expect(wanted).toHaveBeenCalledTimes(1);
    expect(unwanted).not.toHaveBeenCalled();
  });

  it("warns once per client, however many sockets fail", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const client = new GraphQLReactorClient({ url });
    client.subscribe({}, vi.fn());

    expect(() =>
      ws.sockets[0].subscriptions[0].sink.error(
        new Error("connection refused"),
      ),
    ).not.toThrow();
    client.subscribe({}, vi.fn());
    ws.sockets[1].subscriptions[0].sink.error(new Error("refused again"));

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("closes a failed socket so a later subscriber can try again", () => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const client = new GraphQLReactorClient({ url });
    client.subscribe({}, vi.fn());
    const failed = ws.sockets[0];

    failed.subscriptions[0].sink.error(new Error("connection refused"));

    expect(failed.subscriptions[0].unsubscribed).toBe(true);
    expect(failed.disposed).toBe(true);

    // A user who signs in after an anonymous connection was refused, or any
    // component that subscribes later, gets a second attempt.
    const callback = vi.fn<(event: DocumentChangeEvent) => void>();
    client.subscribe({}, callback);

    expect(ws.sockets).toHaveLength(2);
    ws.sockets[1].subscriptions[0].sink.next({
      data: { documentChanges: updatedPayload("doc-1") },
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("ignores a failure reported by a socket it already replaced", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const client = new GraphQLReactorClient({ url });
    client.subscribe({}, vi.fn());
    const failed = ws.sockets[0];
    failed.subscriptions[0].sink.error(new Error("connection refused"));
    client.subscribe({}, vi.fn());

    failed.subscriptions[0].sink.error(new Error("late report"));

    expect(warn).toHaveBeenCalledTimes(1);
    expect(ws.sockets).toHaveLength(2);
    expect(ws.sockets[1].disposed).toBe(false);
  });

  it("closes the socket when disposed", () => {
    const client = new GraphQLReactorClient({ url });
    client.subscribe({}, vi.fn());

    client.dispose();

    expect(ws.only().subscriptions[0].unsubscribed).toBe(true);
    expect(ws.only().disposed).toBe(true);
  });

  it("reopens the socket for a subscriber that arrives after a dispose", () => {
    // React remounts a tree by running an effect's cleanup - which disposes -
    // and then the effect again on the same client. StrictMode does it on every
    // mount. A terminal dispose would leave those pages without realtime.
    const client = new GraphQLReactorClient({ url });
    client.subscribe({}, vi.fn());
    client.dispose();

    const callback = vi.fn<(event: DocumentChangeEvent) => void>();
    client.subscribe({}, callback);

    expect(ws.sockets).toHaveLength(2);
    expect(ws.sockets[1].disposed).toBe(false);
    ws.sockets[1].subscriptions[0].sink.next({
      data: { documentChanges: updatedPayload("doc-1") },
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("ignores a failure reported by a socket it disposed", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const client = new GraphQLReactorClient({ url });
    client.subscribe({}, vi.fn());
    const disposedSocket = ws.only();
    client.dispose();

    disposedSocket.subscriptions[0].sink.error(new Error("closed"));

    expect(warn).not.toHaveBeenCalled();
    client.subscribe({}, vi.fn());
    expect(ws.sockets).toHaveLength(2);
  });

  it("is safe to dispose without ever having subscribed", () => {
    const client = new GraphQLReactorClient({ url });

    expect(() => client.dispose()).not.toThrow();
    expect(ws.sockets).toHaveLength(0);
  });
});
