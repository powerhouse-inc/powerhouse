import type {
  Action,
  ISigner,
  PHBaseState,
  Signature,
} from "@powerhousedao/shared/document-model";
import {
  createReducer,
  serializeSignature,
} from "@powerhousedao/shared/document-model";
import type { DocumentModelModule } from "document-model";
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
import { StaticPackageManager } from "../../src/graphql-client/static-package-manager.js";
import {
  useDocumentModelModuleById,
  useDocumentModelModules,
} from "../../src/hooks/document-model-modules.js";
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
    const seen: unknown[] = [];
    function Probe() {
      seen.push(useAttachmentService());
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
    expect(seen.at(-1)).toBe(attachmentService);
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
    const seen: (GraphQLReactorClient | undefined)[] = [];
    function Probe() {
      seen.push(useSwitchboardClient());
      return null;
    }

    render(
      <GraphQLReactorProvider url={url} realtime={false}>
        <Probe />
      </GraphQLReactorProvider>,
    );

    expect(seen.at(-1)).toBe(window.ph?.reactorClient);
    expect(seen.at(-1)).toBeInstanceOf(GraphQLReactorClient);
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
    const seen: (GraphQLReactorClient | undefined)[] = [];
    function Probe() {
      seen.push(useSwitchboardClient());
      return null;
    }

    render(<Probe />);

    expect(seen.at(-1)).toBe(fromOtherCopy);
  });

  it("returns nothing when the slot holds another implementation", () => {
    ensurePHEventHandlers();
    setReactorClient({} as IReactorBrowserClient);
    const seen: (GraphQLReactorClient | undefined)[] = [];
    function Probe() {
      seen.push(useSwitchboardClient());
      return null;
    }

    render(<Probe />);

    expect(window.ph?.reactorClient).toBeDefined();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)).toBeUndefined();
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

// Minimal modules with the members the manager and the hooks' dedup key read.
function makeModule(id: string, version: number): DocumentModelModule {
  return {
    version,
    reducer: (document: unknown) => document,
    actions: {},
    utils: {},
    documentModel: { global: { id }, local: {} },
  } as unknown as DocumentModelModule;
}

const todoModule = makeModule("test/todo", 2);

/** Renders what `useDocumentModelModules` sees below the provider. */
function ModelsProbe() {
  const models = useDocumentModelModules();
  return (
    <span data-testid="models">
      {(models ?? [])
        .map((module) => `${module.documentModel.global.id}@${module.version}`)
        .join(",")}
    </span>
  );
}

function probedModels(screen: { container: HTMLElement }) {
  return screen.container.querySelector("[data-testid=models]")?.textContent;
}

describe("GraphQLReactorProvider documentModels", () => {
  beforeEach(() => {
    window.ph = {};
    delete window.__phEventHandlersRegistered;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.ph = {};
    delete window.__phEventHandlersRegistered;
  });

  it("publishes a StaticPackageManager carrying the given modules", () => {
    render(
      <GraphQLReactorProvider
        url={url}
        realtime={false}
        documentModels={[todoModule]}
      >
        <span />
      </GraphQLReactorProvider>,
    );

    const manager = window.ph?.vetraPackageManager;
    expect(manager).toBeInstanceOf(StaticPackageManager);
    expect(manager?.packages[0].documentModels).toEqual([todoModule]);
  });

  it("makes useDocumentModelModules work below the provider", async () => {
    const screen = render(
      <GraphQLReactorProvider
        url={url}
        realtime={false}
        documentModels={[todoModule]}
      >
        <ModelsProbe />
      </GraphQLReactorProvider>,
    );

    await expect.poll(() => probedModels(screen)).toBe("test/todo@2");
  });

  it("leaves the slot untouched without the prop", () => {
    render(
      <GraphQLReactorProvider url={url} realtime={false}>
        <span />
      </GraphQLReactorProvider>,
    );

    expect(window.ph?.vetraPackageManager).toBeUndefined();
  });

  it("survives a StrictMode double mount with one sane final state", async () => {
    const screen = render(
      <StrictMode>
        <GraphQLReactorProvider
          url={url}
          realtime={false}
          documentModels={[todoModule]}
        >
          <ModelsProbe />
        </GraphQLReactorProvider>
      </StrictMode>,
    );

    expect(window.ph?.vetraPackageManager).toBeInstanceOf(StaticPackageManager);
    await expect.poll(() => probedModels(screen)).toBe("test/todo@2");
  });
});

// Two versions of the same type: the module hook must resolve them the way the
// registry does - latest by default, exact when pinned.
const todoV1 = makeModule("test/todo", 1);

function VersionProbe({ version }: { version?: number }) {
  const module = useDocumentModelModuleById("test/todo", version);
  return (
    <span data-testid="version">{module ? `v${module.version}` : "none"}</span>
  );
}

function probe(screen: { container: HTMLElement }, testId: string) {
  return screen.container.querySelector(`[data-testid=${testId}]`)?.textContent;
}

describe("GraphQLReactorProvider version resolution", () => {
  beforeEach(() => {
    window.ph = {};
    delete window.__phEventHandlersRegistered;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.ph = {};
    delete window.__phEventHandlersRegistered;
  });

  it("resolves the module hook to the LATEST version", async () => {
    const screen = render(
      <GraphQLReactorProvider
        url={url}
        realtime={false}
        documentModels={[todoV1, todoModule]}
      >
        <VersionProbe />
      </GraphQLReactorProvider>,
    );

    // v1 comes first in the array, but latest wins - the registry's semantics.
    await expect.poll(() => probe(screen, "version")).toBe("v2");
  });

  it("resolves a pinned version exactly, or nothing", async () => {
    const screen = render(
      <GraphQLReactorProvider
        url={url}
        realtime={false}
        documentModels={[todoV1, todoModule]}
      >
        <VersionProbe version={1} />
        <span data-testid="wrap">
          <VersionProbe version={3} />
        </span>
      </GraphQLReactorProvider>,
    );

    await expect.poll(() => probe(screen, "wrap")).toBe("none");
    expect(probe(screen, "version")).toBe("v1");
  });
});

// The whole point of the `documentModels` prop on the write side: the client
// built by the provider must be able to sign a BATCH, which needs the reducer
// of the document's exact version. Everything here goes over the same `fetch`
// seam the read tests use.
const signingDocumentFields = {
  ...documentFields,
  state: { global: { name: "hello" }, local: {}, document: { version: 1 } },
};

/** Answers reads AND the write mutation, recording the mutation bodies. */
function stubSigningSwitchboard(): Record<string, unknown>[] {
  const mutations: Record<string, unknown>[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
    const body = JSON.parse(
      typeof init?.body === "string" ? init.body : "{}",
    ) as {
      query?: string;
      variables?: Record<string, unknown>;
    };
    const isMutation = Boolean(body.query?.includes("mutation MutateDocument"));
    if (isMutation) {
      mutations.push(body.variables ?? {});
    }
    const data = isMutation
      ? {
          mutateDocument: {
            ...signingDocumentFields,
            revisionsList: [{ scope: "global", revision: 9 }],
            operations: { items: [] },
          },
        }
      : { document: { document: signingDocumentFields } };
    return Promise.resolve(
      new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });
  return mutations;
}

const signature: Signature = [
  "1700000007",
  "did:key:test",
  "action-hash",
  "prev-hash",
  "0xdeadbeef",
];

/** Logs a user in, the way the light client reads one: off `window.ph.renown`. */
function installAmbientSigner() {
  const signAction = vi.fn().mockResolvedValue(signature);
  const signer = {
    user: { address: "0x1", networkId: "eip155", chainId: 1 },
    app: { name: "test-app", key: "app-key" },
    signAction,
  } as unknown as ISigner;
  window.ph = {
    ...window.ph,
    // `getBearerToken` is what the ambient token provider calls on every
    // request; a logged-in renown always has it.
    renown: {
      user: signer.user,
      signer,
      getBearerToken: vi.fn().mockResolvedValue("test-token"),
    } as never,
  };
  return signAction;
}

/** The shape the test module's reducer writes to. */
type TestState = PHBaseState & { global: { name: string } };

// A real base reducer: signing a batch means running it between signatures.
const signableModule = {
  version: 1,
  reducer: createReducer<TestState>((draft, reduced) => {
    if (reduced.type === "SET_TEST_NAME") {
      draft.global.name = (reduced.input as { name: string }).name;
    }
    return draft;
  }),
  actions: {},
  utils: {},
  documentModel: { global: { id: "powerhouse/test" }, local: {} },
} as unknown as DocumentModelModule;

const signableBatch: Action[] = [
  {
    id: "action-1",
    type: "SET_TEST_NAME",
    timestampUtcMs: "1700000007000",
    input: { name: "first" },
    scope: "global",
  },
  {
    id: "action-2",
    type: "SET_TEST_NAME",
    timestampUtcMs: "1700000008000",
    input: { name: "second" },
    scope: "global",
  },
];

describe("GraphQLReactorProvider signed batches", () => {
  beforeEach(() => {
    resetPHGlobals();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetPHGlobals();
  });

  it("signs a batch dispatched through the published client", async () => {
    const signAction = installAmbientSigner();
    const mutations = stubSigningSwitchboard();

    render(
      <GraphQLReactorProvider
        url={url}
        realtime={false}
        documentModels={[signableModule]}
      >
        <span />
      </GraphQLReactorProvider>,
    );

    await window.ph!.reactorClient!.execute("doc-1", "main", signableBatch);

    expect(mutations).toHaveLength(1);
    expect(signAction).toHaveBeenCalledTimes(2);
    const pushed = (mutations[0] as { actions: Action[] }).actions;
    expect(pushed.map((a) => a.id)).toEqual(["action-1", "action-2"]);
    // Joined for transport: GraphQL declares signatures as a list of strings,
    // not of lists, and the server splits them again on arrival.
    expect(pushed.map((a) => a.context?.signer?.signatures)).toEqual([
      [serializeSignature(signature)],
      [serializeSignature(signature)],
    ]);
    // The document is at global revision 7, so the batch continues from 6.
    expect(pushed.map((a) => a.context?.prevOpIndex)).toEqual([6, 7]);
    expect(pushed[1].context?.prevOpHash).not.toBe(
      pushed[0].context?.prevOpHash,
    );
  });

  it("refuses the batch when the provider was given no models", async () => {
    const signAction = installAmbientSigner();
    const mutations = stubSigningSwitchboard();

    render(
      <GraphQLReactorProvider url={url} realtime={false}>
        <span />
      </GraphQLReactorProvider>,
    );

    await expect(
      window.ph!.reactorClient!.execute("doc-1", "main", signableBatch),
    ).rejects.toThrow("Unknown document model version: powerhouse/test v1");
    expect(mutations).toHaveLength(0);
    expect(signAction).not.toHaveBeenCalled();
  });

  it("still reads and pushes unsigned without models and without a user", async () => {
    const mutations = stubSigningSwitchboard();

    render(
      <GraphQLReactorProvider url={url} realtime={false}>
        <span />
      </GraphQLReactorProvider>,
    );

    const document = await window.ph!.reactorClient!.get("doc-1");
    expect(document.header.revision).toEqual({ global: 7 });

    await window.ph!.reactorClient!.execute("doc-1", "main", signableBatch);

    expect(mutations).toHaveLength(1);
    const pushed = (mutations[0] as { actions: Action[] }).actions;
    expect(pushed).toEqual(signableBatch);
  });
});
