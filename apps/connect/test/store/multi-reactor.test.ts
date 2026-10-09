import {
  bucketFor,
  DriveCollectionId,
  GQL_CHANNEL_TYPE,
  LOCAL_CHANNEL_TYPE,
  LocalChannelFactory,
  ReactorBuilder,
  type InProcessReactorModule,
  type IReactorClient,
  type ReactorInfo,
} from "@powerhousedao/reactor";
import type {
  BrowserReactorClientModule,
  WorkerReactorClientModule,
} from "@powerhousedao/reactor-browser";
import {
  collectionRequirements,
  ineligibleReason,
  UNKNOWN_REACTOR_INFO,
} from "@powerhousedao/reactor-router";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  withSignaturePolicy,
  type Action,
  type DocumentModelModule,
  type ISigner,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMultiReactorClient,
  deriveSwitchboardGraphqlUrl,
  LOCAL_BACKEND_NAME,
  localReach,
  PLACE_ON_LOCAL,
  REMOTE_BACKEND_NAME,
  type LocalReactorModule,
} from "../../src/store/multi-reactor.js";
import { configureConnectChannelScheme } from "../../src/utils/reactor-channel-scheme.js";
import {
  DRIVE_TYPE,
  serve,
  switchboard,
  wrongShard,
  type StubSwitchboard,
} from "./switchboard-stub.js";

const LOCAL_INFO: ReactorInfo = {
  storage: {
    engine: "pglite",
    persistence: "idb",
    durable: true,
    selfHeal: false,
  },
  workflows: false,
  syncChannels: [GQL_CHANNEL_TYPE, LOCAL_CHANNEL_TYPE],
  access: { admin: true, sql: true },
};

const signer = {
  user: undefined,
  app: { name: "test", key: "app-key" },
  signAction: () => Promise.reject(new Error("not called")),
} as unknown as ISigner;

type Local = { served: Set<string>; documents: Map<string, PHDocument> };

function localClient(local: Local) {
  const client = {
    isServed: vi.fn((id: string) => Promise.resolve(local.served.has(id))),
    isDocumentIdTaken: vi.fn((id: string) =>
      Promise.resolve(local.served.has(id)),
    ),
    get: vi.fn((id: string) => {
      const document = local.documents.get(id);
      return local.served.has(id) && document
        ? Promise.resolve(document)
        : Promise.reject(new Error(`Document not found: ${id}`));
    }),
    create: vi.fn((document: PHDocument) => {
      local.served.add(document.header.id);
      local.documents.set(document.header.id, document);
      return Promise.resolve(document);
    }),
    execute: vi.fn((id: string, _branch: string, actions: Action[]) => {
      let document = local.documents.get(id);
      if (!document) {
        return Promise.reject(new Error(`Document not found: ${id}`));
      }
      for (const action of actions) {
        document = driveDocumentModelModule.reducer(
          document as never,
          action as never,
        ) as PHDocument;
      }
      local.documents.set(id, document);
      return Promise.resolve(document);
    }),
  };
  return client;
}

function workerModule(
  client: ReturnType<typeof localClient>,
  info: () => Promise<ReactorInfo> = () => Promise.resolve(LOCAL_INFO),
) {
  const inspector = { info: vi.fn(info) };
  const module = {
    kind: "worker",
    client: client as unknown as IReactorClient,
    inspector,
  } as unknown as WorkerReactorClientModule;
  return { module, inspector };
}

const drive = (id: string) =>
  withSignaturePolicy(
    driveDocumentModelModule.utils.createDocument(),
    "legacy",
    { id },
  );

let stub: StubSwitchboard | undefined;

afterEach(async () => {
  await stub?.close();
  stub = undefined;
});

async function routerOver(
  module: LocalReactorModule,
  remote: Record<string, string> = {},
  override?: Parameters<typeof switchboard>[1],
) {
  stub = await serve(switchboard(remote, override));
  const diagnostics: string[] = [];
  const router = await buildMultiReactorClient({
    module,
    remoteGraphqlUrl: stub.url,
    signer,
    documentModelModules: [
      driveDocumentModelModule as unknown as DocumentModelModule,
    ],
    onDiagnostic: (message) => diagnostics.push(message),
  });
  return { router, stub, diagnostics };
}

describe("buildMultiReactorClient", () => {
  it("routes over the local reactor first, then the Switchboard", async () => {
    const { module } = workerModule(localClient(emptyLocal()));
    const { router } = await routerOver(module);

    expect(router.describeRouting().backends).toEqual([
      LOCAL_BACKEND_NAME,
      REMOTE_BACKEND_NAME,
    ]);
    const [local, remote] = router.backends;
    expect(local.reach).toEqual({ hosting: "worker", inspection: "rpc" });
    expect(remote.reach).toEqual({ hosting: "remote", inspection: "none" });
    expect(local.refusesMisroutes).toBe(false);
    expect(remote.refusesMisroutes).toBe(false);
    expect(remote.facts.known).toBe(true);
    expect(remote.facts.reactor.syncChannels).toEqual([GQL_CHANNEL_TYPE]);
  });

  it("reaches a main-thread reactor directly", () => {
    expect(localReach("browser")).toEqual({
      hosting: "in-process",
      inspection: "direct",
    });
  });
});

describe("local facts", () => {
  it("are read from the inspector at every refresh, never kept", async () => {
    let info = LOCAL_INFO;
    const { module, inspector } = workerModule(localClient(emptyLocal()), () =>
      Promise.resolve(info),
    );
    const { router } = await routerOver(module);
    expect(router.backends[0].facts.reactor).toEqual(LOCAL_INFO);

    info = { ...LOCAL_INFO, syncChannels: [GQL_CHANNEL_TYPE] };
    await router.refreshFacts(LOCAL_BACKEND_NAME);

    expect(router.backends[0].facts.reactor.syncChannels).toEqual([
      GQL_CHANNEL_TYPE,
    ]);
    expect(inspector.info).toHaveBeenCalledTimes(2);
  });

  it("a router built over a rebuilt module holds the new client and facts", async () => {
    const before = localClient(servedLocal("doc-a"));
    const after = localClient(servedLocal("doc-a"));
    const old = workerModule(before);
    await routerOver(old.module);
    await stub?.close();
    stub = undefined;

    const rebuilt = workerModule(after);
    const { router } = await routerOver(rebuilt.module);
    await router.get("doc-a");

    expect(after.get).toHaveBeenCalledTimes(1);
    expect(before.get).not.toHaveBeenCalled();
    expect(old.inspector.info).toHaveBeenCalledTimes(1);
    expect(rebuilt.inspector.info).toHaveBeenCalledTimes(1);
  });

  describe("on the main thread, syncChannels come from the built channel factory", () => {
    const built: InProcessReactorModule[] = [];

    afterEach(async () => {
      for (const module of built.splice(0)) {
        await module.reactor.kill().completed;
        await module.database.destroy();
      }
    });

    async function browserModule(multiReactor: boolean) {
      const builder = new ReactorBuilder();
      configureConnectChannelScheme(builder, {
        multiReactor,
        createLocalChannelFactory: () =>
          new LocalChannelFactory(
            new ConsoleLogger(["multi-reactor-test"]),
            () => undefined,
          ),
      });
      const reactorModule = await builder.buildModule();
      built.push(reactorModule);
      return {
        kind: "browser",
        client: localClient(emptyLocal()),
        reactorModule,
      } as unknown as BrowserReactorClientModule;
    }

    it("include the local channel under multiReactor", async () => {
      const { router } = await routerOver(await browserModule(true));

      const local = router.backends[0];
      expect(local.facts.known).toBe(true);
      expect(local.facts.reactor.syncChannels).toEqual(
        expect.arrayContaining([GQL_CHANNEL_TYPE, LOCAL_CHANNEL_TYPE]),
      );
    });

    it("are gql alone without it", async () => {
      const { router } = await routerOver(await browserModule(false));

      expect(router.backends[0].facts.reactor.syncChannels).toEqual([
        GQL_CHANNEL_TYPE,
      ]);
    });
  });
});

describe("placement", () => {
  /** An id the bare bucket placement would put on the Switchboard. */
  const REMOTE_BUCKET_ID = Array.from(
    { length: 64 },
    (_unused, i) => `drive-${i}`,
  ).find(
    (id) => bucketFor(DriveCollectionId.forDrive(id).key, 2) === 1,
  ) as string;

  it("keeps the local reactor eligible when its facts cannot be read", () => {
    const requirements = collectionRequirements(PLACE_ON_LOCAL);
    expect(
      ineligibleReason(
        {
          reactor: UNKNOWN_REACTOR_INFO,
          reach: localReach("worker"),
          known: false,
        },
        requirements,
      ),
    ).toBe("");
    expect(
      ineligibleReason(
        {
          reactor: UNKNOWN_REACTOR_INFO,
          reach: { hosting: "remote", inspection: "none" },
          known: true,
        },
        requirements,
      ),
    ).not.toBe("");
  });

  it("creates a parentless drive on the local reactor", async () => {
    const local = emptyLocal();
    const client = localClient(local);
    const { module } = workerModule(client, () =>
      Promise.reject(new Error("worker unavailable")),
    );
    const { router, stub } = await routerOver(module);

    await router.create(drive(REMOTE_BUCKET_ID));

    expect(client.create).toHaveBeenCalledTimes(1);
    expect(
      stub.received.some((r) => r.body.operationName === "CreateDocument"),
    ).toBe(false);
  });
});

describe("a drive the Switchboard stops holding (bug 2, end to end)", () => {
  it("re-aims a drive write refused with 421 at the local reactor", async () => {
    const local = emptyLocal();
    local.documents.set("drive-x", drive("drive-x"));
    const client = localClient(local);
    const { module } = workerModule(client);
    let moved = false;
    const { router, stub, diagnostics } = await routerOver(
      module,
      { "drive-x": DRIVE_TYPE },
      ({ body, headers }) =>
        moved &&
        body.operationName === "MutateDocumentWithOperations" &&
        headers["drive-id"] === "drive-x"
          ? wrongShard("drive-x")
          : undefined,
    );

    await router.drives.listNodes("drive-x");
    expect(collectionOf(router, "drive-x")).toMatchObject({
      backend: REMOTE_BACKEND_NAME,
    });

    local.served.add("drive-x");
    moved = true;
    const folder = await router.drives.addFolder("drive-x", "inbox");

    expect(folder.name).toBe("inbox");
    // Node's fetch re-sends a 421 once on a fresh connection, as browsers may.
    expect(
      stub.received.filter(
        (r) =>
          r.body.operationName === "MutateDocumentWithOperations" &&
          r.headers["drive-id"] === "drive-x",
      ).length,
    ).toBeGreaterThan(0);
    expect(client.execute).toHaveBeenCalledTimes(1);
    expect(collectionOf(router, "drive-x")).toEqual({
      collectionId: DriveCollectionId.forDrive("drive-x").key,
      backend: LOCAL_BACKEND_NAME,
      source: "corrected",
    });
    expect(diagnostics.some((d) => d.includes("misroute resolved"))).toBe(true);
  });
});

describe("deriveSwitchboardGraphqlUrl", () => {
  it("derives the reactor GraphQL endpoint from a drive URL", () => {
    expect(deriveSwitchboardGraphqlUrl("http://localhost:4001/d/abc")).toBe(
      "http://localhost:4001/graphql",
    );
  });

  it("keeps a reverse-proxy prefix", () => {
    expect(deriveSwitchboardGraphqlUrl("https://host/team-a/d/slug")).toBe(
      "https://host/team-a/graphql",
    );
  });

  it("answers undefined for a URL that does not parse", () => {
    expect(deriveSwitchboardGraphqlUrl("not a url")).toBeUndefined();
  });
});

function emptyLocal(): Local {
  return { served: new Set(), documents: new Map() };
}

function servedLocal(id: string): Local {
  const local = emptyLocal();
  local.served.add(id);
  local.documents.set(id, drive(id));
  return local;
}

function collectionOf(
  router: Awaited<ReturnType<typeof buildMultiReactorClient>>,
  driveId: string,
) {
  const key = DriveCollectionId.forDrive(driveId).key;
  return router
    .describeRouting()
    .collections.find((entry) => entry.collectionId === key);
}
