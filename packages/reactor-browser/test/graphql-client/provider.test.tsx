import { StrictMode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { render } from "vitest-browser-react";
import { DocumentCache } from "../../src/document-cache.js";
import { GraphQLReactorClient } from "../../src/graphql-client/graphql-reactor-client.js";
import {
  ensurePHEventHandlers,
  GraphQLReactorProvider,
  useSwitchboardClient,
} from "../../src/graphql-client/graphql-reactor-provider.js";
import { useAttachmentService } from "../../src/hooks/attachment-service.js";
import { setReactorClient } from "../../src/hooks/reactor.js";
import type { PHGlobal } from "../../src/types/global.js";
import type { IReactorBrowserClient } from "../../src/types/reactor-browser-client.js";

/**
 * A stand-in for the `graphql-ws` client, so the one case that mounts with
 * realtime on can see the sockets the provider's client opens and closes
 * without talking to a Switchboard that may or may not be running.
 */
const ws = vi.hoisted(() => {
  type Socket = { url: string; disposed: boolean };
  const sockets: Socket[] = [];

  function createClient(options: { url: string }) {
    const socket: Socket = { url: options.url, disposed: false };
    sockets.push(socket);
    return {
      subscribe: () => () => undefined,
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
  };
});

vi.mock("graphql-ws/client", () => ({ createClient: ws.createClient }));

const url = "http://localhost:4001/graphql";

// The provider is mounted with `realtime={false}` throughout: these cases are
// about the window slots and the cache wiring, and a real websocket to a
// Switchboard that may or may not be running locally has no place in them. The
// realtime path has its own suite in subscriptions.test.ts.

const documentFields = {
  id: "doc-1",
  slug: "my-doc",
  name: "My Doc",
  documentType: "powerhouse/test",
  state: { global: { name: "hello" }, local: {} },
  createdAtUtcIso: "2026-01-01T00:00:00.000Z",
  lastModifiedAtUtcIso: "2026-01-02T00:00:00.000Z",
  revisionsList: [{ scope: "global", revision: 7 }],
};

/**
 * Answers every GraphQL request off the wire and records the operations that
 * were asked for, so a test can count the round trips the cache made.
 */
function stubSwitchboard(): string[] {
  const queries: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
    const body = JSON.parse(String(init?.body)) as { query: string };
    queries.push(body.query);
    const data = body.query.includes("mutation DeleteDocument")
      ? { deleteDocument: true }
      : { document: { document: documentFields } };
    return Promise.resolve(
      new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });
  return queries;
}

/**
 * Puts the page back where a fresh load would leave it: no slots filled and no
 * record of the handlers having been registered. The listeners themselves stay
 * attached, which is harmless - they are the same function references, so
 * re-registering them is a no-op for `addEventListener`.
 */
function resetPHGlobals() {
  window.ph = {};
  delete window.__phEventHandlersRegistered;
  ws.reset();
}

/**
 * How many `ph:set*` listeners a spied `addEventListener` saw. The exact event
 * names are not asserted on purpose: they are derived with `capitalCase`, which
 * turns `reactorClient` into `Reactor Client`, space and all.
 */
function phSetListenerCount(
  addEventListener: MockInstance<typeof window.addEventListener>,
) {
  return addEventListener.mock.calls.filter(
    ([type]) => typeof type === "string" && type.startsWith("ph:set"),
  ).length;
}

describe("GraphQLReactorProvider", () => {
  beforeEach(() => {
    resetPHGlobals();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetPHGlobals();
  });

  it("renders its children", () => {
    const screen = render(
      <GraphQLReactorProvider url={url} realtime={false}>
        <span data-testid="child">hello</span>
      </GraphQLReactorProvider>,
    );

    expect(
      screen.container.querySelector("[data-testid=child]"),
    ).not.toBeNull();
  });

  it("publishes the client into the reactorClient slot on mount", () => {
    render(
      <GraphQLReactorProvider url={url} realtime={false}>
        <span />
      </GraphQLReactorProvider>,
    );

    expect(window.ph?.reactorClient).toBeInstanceOf(GraphQLReactorClient);
  });

  it("publishes a document cache built over that same client", async () => {
    const queries = stubSwitchboard();

    render(
      <GraphQLReactorProvider url={url} realtime={false}>
        <span />
      </GraphQLReactorProvider>,
    );

    const documentCache = window.ph?.documentCache;
    const client = window.ph?.reactorClient;
    expect(documentCache).toBeInstanceOf(DocumentCache);
    expect(client).toBeInstanceOf(GraphQLReactorClient);

    await documentCache!.get("doc-1");
    const listener = vi.fn();
    documentCache!.subscribe("doc-1", listener);

    // Only the client the cache subscribed to can invalidate it, so a cache
    // built over a second, unpublished client fails here.
    await client!.deleteDocument("doc-1");

    expect(listener).toHaveBeenCalledTimes(1);
    await documentCache!.get("doc-1");
    expect(
      queries.filter((query) => query.includes("query GetDocument")),
    ).toHaveLength(2);
  });

  it("registers the ph event handlers, which the slots depend on", () => {
    const addEventListener = vi.spyOn(window, "addEventListener");

    render(
      <GraphQLReactorProvider url={url} realtime={false}>
        <span />
      </GraphQLReactorProvider>,
    );

    expect(window.__phEventHandlersRegistered).toBe(true);
    expect(phSetListenerCount(addEventListener)).toBeGreaterThan(0);
  });

  it("does not register the handlers a second time", () => {
    ensurePHEventHandlers();
    const addEventListener = vi.spyOn(window, "addEventListener");

    const first = render(
      <GraphQLReactorProvider url={url} realtime={false}>
        <span />
      </GraphQLReactorProvider>,
    );
    first.unmount();
    render(
      <GraphQLReactorProvider url={url} realtime={false}>
        <span />
      </GraphQLReactorProvider>,
    );

    expect(phSetListenerCount(addEventListener)).toBe(0);
  });

  it("survives a remount and republishes the slots", () => {
    const first = render(
      <GraphQLReactorProvider url={url} realtime={false}>
        <span />
      </GraphQLReactorProvider>,
    );
    const firstClient = window.ph?.reactorClient;
    first.unmount();

    render(
      <GraphQLReactorProvider url={url} realtime={false}>
        <span />
      </GraphQLReactorProvider>,
    );

    expect(window.ph?.reactorClient).toBeInstanceOf(GraphQLReactorClient);
    expect(window.ph?.reactorClient).not.toBe(firstClient);
    expect(window.ph?.documentCache).toBeInstanceOf(DocumentCache);
  });

  it("disposes the document cache on unmount", () => {
    const dispose = vi.spyOn(DocumentCache.prototype, "dispose");

    const screen = render(
      <GraphQLReactorProvider url={url} realtime={false}>
        <span />
      </GraphQLReactorProvider>,
    );
    expect(dispose).not.toHaveBeenCalled();

    screen.unmount();

    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes the client on unmount, closing its realtime socket", () => {
    const dispose = vi.spyOn(GraphQLReactorClient.prototype, "dispose");

    const screen = render(
      <GraphQLReactorProvider url={url} realtime={false}>
        <span />
      </GraphQLReactorProvider>,
    );
    expect(dispose).not.toHaveBeenCalled();

    screen.unmount();

    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("leaves the window slots populated after unmount", () => {
    const screen = render(
      <GraphQLReactorProvider url={url} realtime={false}>
        <span />
      </GraphQLReactorProvider>,
    );
    screen.unmount();

    expect(window.ph?.reactorClient).toBeInstanceOf(GraphQLReactorClient);
    expect(window.ph?.documentCache).toBeInstanceOf(DocumentCache);
  });

  it("keeps realtime alive through a StrictMode mount", () => {
    // StrictMode runs the effect, its cleanup - which disposes the client - and
    // the effect again, all on the same client. A terminal dispose leaves the
    // page with no socket at all and nothing logged.
    render(
      <StrictMode>
        <GraphQLReactorProvider url={url}>
          <span />
        </GraphQLReactorProvider>
      </StrictMode>,
    );

    expect(ws.sockets.length).toBeGreaterThan(1);
    expect(ws.sockets.filter((socket) => !socket.disposed)).toHaveLength(1);
  });

  it("passes the token provider through to the client", async () => {
    const tokenProvider = vi.fn(() => Promise.resolve("provider-token"));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { document: null } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    render(
      <GraphQLReactorProvider
        url={url}
        tokenProvider={tokenProvider}
        realtime={false}
      >
        <span />
      </GraphQLReactorProvider>,
    );

    const client = window.ph?.reactorClient;
    await expect(client!.get("doc-1")).rejects.toThrow();

    expect(tokenProvider).toHaveBeenCalled();
    const headers = new Headers(
      (fetchSpy.mock.calls[0][1] as RequestInit).headers,
    );
    expect(headers.get("authorization")).toBe("Bearer provider-token");
  });

  it("publishes an attachment service the hooks below it read", () => {
    // The slot is a wiring seam: the provider neither builds nor calls the
    // service. What is proven here is that a component below the provider gets
    // back the very service the app passed in, through the hook Connect's
    // editors read it with.
    const attachmentService = {} as NonNullable<PHGlobal["attachmentService"]>;
    let seen: unknown;
    function Probe() {
      seen = useAttachmentService();
      return null;
    }

    render(
      <GraphQLReactorProvider
        url={url}
        realtime={false}
        attachmentService={attachmentService}
      >
        <Probe />
      </GraphQLReactorProvider>,
    );

    expect(window.ph?.attachmentService).toBe(attachmentService);
    expect(seen).toBe(attachmentService);
  });

  it("leaves the attachment service slot alone when no service is given", () => {
    render(
      <GraphQLReactorProvider url={url} realtime={false}>
        <span />
      </GraphQLReactorProvider>,
    );

    expect(window.ph?.attachmentService).toBeUndefined();
  });
});

describe("useSwitchboardClient", () => {
  beforeEach(() => {
    resetPHGlobals();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetPHGlobals();
  });

  it("returns the client the provider mounted", () => {
    let seen: GraphQLReactorClient | undefined;
    function Probe() {
      seen = useSwitchboardClient();
      return null;
    }

    render(
      <GraphQLReactorProvider url={url} realtime={false}>
        <Probe />
      </GraphQLReactorProvider>,
    );

    expect(seen).toBe(window.ph?.reactorClient);
    expect(seen).toBeInstanceOf(GraphQLReactorClient);
  });

  it("returns a client built by a duplicate copy of the module", () => {
    // A page can carry two copies of this module - a bundled package with its
    // own copy, or a hot-replaced one. Same shape, different class object, so
    // `instanceof` answers false for a perfectly good client.
    const client = new GraphQLReactorClient({ url, realtime: false });
    const fromOtherCopy = Object.assign(
      Object.create(null) as GraphQLReactorClient,
      client,
    );
    expect(fromOtherCopy).not.toBeInstanceOf(GraphQLReactorClient);

    ensurePHEventHandlers();
    setReactorClient(fromOtherCopy);
    let seen: GraphQLReactorClient | undefined;
    function Probe() {
      seen = useSwitchboardClient();
      return null;
    }

    render(<Probe />);

    expect(seen).toBe(fromOtherCopy);
  });

  it("returns nothing when the slot holds another implementation", () => {
    ensurePHEventHandlers();
    setReactorClient({} as IReactorBrowserClient);
    let seen: GraphQLReactorClient | undefined;
    function Probe() {
      seen = useSwitchboardClient();
      return null;
    }

    render(<Probe />);

    expect(window.ph?.reactorClient).toBeDefined();
    expect(seen).toBeUndefined();
  });
});

describe("ensurePHEventHandlers", () => {
  beforeEach(() => {
    resetPHGlobals();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetPHGlobals();
  });

  it("marks the window on first call", () => {
    expect(window.__phEventHandlersRegistered).toBeUndefined();

    ensurePHEventHandlers();

    expect(window.__phEventHandlersRegistered).toBe(true);
  });

  it("is a no-op once the marker is set", () => {
    ensurePHEventHandlers();
    const addEventListener = vi.spyOn(window, "addEventListener");

    ensurePHEventHandlers();

    expect(addEventListener).not.toHaveBeenCalled();
  });
});
