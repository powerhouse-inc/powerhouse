// One endpoint serves every subscription subgraph; changing one spares the rest.

// `websocket.ts` blanks `useServer` under Vitest; mocked back to the real one.

import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type {
  IReactorClient,
  IRelationalDb,
  ISyncManager,
} from "@powerhousedao/reactor";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import { parse } from "graphql";
import type { Client } from "graphql-ws";
import type http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import type { SubgraphClass } from "../src/graphql/types.js";

vi.mock("../src/graphql/websocket.js", async () => ({
  useServer: (await import("graphql-ws/use/ws")).useServer,
}));

const { createClient } = await import("graphql-ws");
const { BaseSubgraph } = await import("../src/graphql/base-subgraph.js");
const { ApolloGatewayAdapter } =
  await import("../src/graphql/gateway/adapter-gateway-apollo.js");
const { ExpressHttpAdapter } =
  await import("../src/graphql/gateway/adapter-http-express.js");
const { GraphQLManager } = await import("../src/graphql/graphql-manager.js");
const { AuthorizationPolicy, createAuthorizationService } =
  await import("../src/services/authorization.service.js");

const WS_PATH = "/graphql/subscriptions";

const logger: ILogger = {
  level: "error" as const,
  verbose: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  errorHandler: vi.fn(),
  child: () => logger,
};

function modelModule(
  name: string,
  id: string,
  stateField: string,
): DocumentModelModule {
  return {
    documentModel: {
      global: {
        name,
        id,
        specifications: [
          {
            version: 1,
            modules: [],
            state: {
              global: { schema: `type ${name}State { ${stateField}: String }` },
              local: { schema: "" },
            },
          },
        ],
      },
    },
  } as unknown as DocumentModelModule;
}

/** A subgraph with one ticking subscription, `field`, counting from `from`. */
function feed(
  name: string,
  field: string,
  from = 0,
  typeDefs = "",
): SubgraphClass {
  return class extends BaseSubgraph {
    name = name;
    hasSubscriptions = true;
    typeDefs = parse(`
      type Query { ${field}Ping: String }
      type Subscription { ${field}: Int }
      ${typeDefs}
    `);
    resolvers = {
      Query: { [`${field}Ping`]: () => "pong" },
      Subscription: {
        [field]: {
          subscribe: async function* () {
            for (let i = from; ; i++) {
              await new Promise((resolve) => setTimeout(resolve, 10));
              yield { [field]: i };
            }
          },
        },
      },
    };
  };
}

// Uses the Alpha model's types, so a model edit rebuilds it.
const ALPHA_TYPES = "extend type Query { alphaDoc: Alpha }";
const AlphaTools = feed("alpha-tools", "alphaTick", 0, ALPHA_TYPES);
const AlphaToolsV2 = feed("alpha-tools", "alphaTick", 1000, ALPHA_TYPES);
const CoreFeed = feed("core-feed", "coreTick");
class CorePlain extends BaseSubgraph {
  name = "core-plain";
  typeDefs = parse("type Query { plainPing: String }");
  resolvers = {};
}

type Subscription = {
  values: number[];
  /** How it ended: `complete`, `error <message>`, or still `live`. */
  outcome: () => Promise<string>;
};

async function startServer(core: SubgraphClass[] = [CoreFeed]) {
  const drive = modelModule("DocumentDrive", "powerhouse/document-drive", "x");
  let modules = [drive, modelModule("Alpha", "test/alpha", "rev1")];
  const reactorClient = {
    getDocumentModelModules: vi.fn(() =>
      Promise.resolve({
        results: modules,
        options: { cursor: "", limit: 100 },
      }),
    ),
    find: vi.fn().mockResolvedValue({
      results: [],
      options: { cursor: "", limit: 100 },
    }),
  } as unknown as IReactorClient;

  const httpAdapter = new ExpressHttpAdapter();
  const server = (await httpAdapter.listen(
    0,
    undefined,
    "127.0.0.1",
  )) as http.Server;
  const { port } = server.address() as { port: number };
  const manager = new GraphQLManager({
    path: "/",
    httpServer: server,
    wsServer: new WebSocketServer({ server, path: WS_PATH }),
    reactorClient,
    relationalDb: {} as IRelationalDb,
    analyticsStore: {} as IAnalyticsStore,
    syncManager: {} as ISyncManager,
    logger,
    httpAdapter,
    gatewayAdapter: new ApolloGatewayAdapter(logger),
    featureFlags: { enableDocumentModelSubgraphs: true },
    port,
    authorizationService: createAuthorizationService({
      admins: [],
      defaultProtection: false,
      policy: AuthorizationPolicy.OPEN,
    }),
  });
  await manager.init(core);

  const clients: Client[] = [];
  const connect = () => {
    const closes: number[] = [];
    const client = createClient({
      url: `ws://127.0.0.1:${port}${WS_PATH}`,
      webSocketImpl: WebSocket,
      retryAttempts: 0,
      on: {
        closed: (event) => closes.push((event as { code: number }).code),
      },
    });
    clients.push(client);
    return { client, closes };
  };

  const subscribe = (client: Client, query: string): Subscription => {
    const values: number[] = [];
    let settle!: (outcome: string) => void;
    const ended = new Promise<string>((resolve) => (settle = resolve));
    client.subscribe<Record<string, number>>(
      { query },
      {
        next: ({ data }) => {
          const value = Object.values(data ?? {})[0];
          if (typeof value === "number") values.push(value);
        },
        error: (error) => {
          const message = Array.isArray(error)
            ? (error as { message: string }[])[0].message
            : `closed ${(error as { code?: number }).code}`;
          settle(`error ${message}`);
        },
        complete: () => settle("complete"),
      },
    );
    const outcome = () =>
      Promise.race([
        ended,
        new Promise<string>((resolve) => setTimeout(resolve, 300, "live")),
      ]);
    return { values, outcome };
  };

  const query = async (client: Client, source: string) => {
    const result = await client.iterate({ query: source }).next();
    return result.value as { data?: unknown };
  };

  return {
    connect,
    subscribe,
    query,
    applyPackage: async (subgraphs: SubgraphClass[]) => {
      await manager.applyPackageSubgraphs(
        new Map(subgraphs.length > 0 ? [["pkg", subgraphs]] : []),
      );
      await manager.updateRouter(true);
    },
    editModel: async (stateField: string) => {
      modules = [drive, modelModule("Alpha", "test/alpha", stateField)];
      await manager.regenerateDocumentModelSubgraphs();
      await manager.updateRouter(true);
    },
    close: async () => {
      for (const client of clients) await client.dispose();
      await manager.updateRouter(true);
      await manager.shutdown();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function keepsReceiving(subscription: Subscription) {
  const seen = subscription.values.length;
  await vi.waitFor(
    () => expect(subscription.values.length).toBeGreaterThan(seen + 2),
    { timeout: 3000 },
  );
}

describe("subscription subgraphs on one WebSocket endpoint", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  async function setup() {
    const harness = await startServer();
    close = harness.close;
    await harness.applyPackage([AlphaTools]);
    const { client, closes } = harness.connect();
    const core = harness.subscribe(client, "subscription { coreTick }");
    const alpha = harness.subscribe(client, "subscription { alphaTick }");
    return { ...harness, client, closes, core, alpha };
  }

  it("serves each subgraph's subscriptions on one socket", async () => {
    const { core, alpha } = await setup();

    await keepsReceiving(core);
    await keepsReceiving(alpha);
  });

  it("keeps every subscription when a model edit rebuilds a subgraph", async () => {
    const { core, alpha, closes, connect, subscribe, query, editModel } =
      await setup();
    await keepsReceiving(alpha);

    await editModel("rev2");

    expect(await alpha.outcome()).toBe("live");
    await keepsReceiving(alpha);
    await keepsReceiving(core);
    expect(closes).toEqual([]);

    const { client } = connect();
    await keepsReceiving(subscribe(client, "subscription { alphaTick }"));
    const result = await query(
      client,
      '{ alphaTickPing __type(name: "Alpha_AlphaState") { fields { name } } }',
    );
    expect(JSON.stringify(result.data)).toContain("rev2");
  });

  it("keeps the endpoint when its only subscription subgraph is rebuilt", async () => {
    const harness = await startServer([CorePlain]);
    close = harness.close;
    await harness.applyPackage([AlphaTools]);
    const { client, closes } = harness.connect();
    const alpha = harness.subscribe(client, "subscription { alphaTick }");
    await keepsReceiving(alpha);

    await harness.editModel("rev2");

    expect(await alpha.outcome()).toBe("live");
    expect(closes).toEqual([]);
    const fresh = harness.connect();
    await keepsReceiving(
      harness.subscribe(fresh.client, "subscription { alphaTick }"),
    );
  });

  it("completes a replaced subgraph's subscriptions and serves its replacement", async () => {
    const { client, core, alpha, closes, subscribe, applyPackage } =
      await setup();
    await keepsReceiving(alpha);

    await applyPackage([AlphaToolsV2]);

    expect(await alpha.outcome()).toBe("complete");
    await keepsReceiving(core);
    expect(closes).toEqual([]);

    const replacement = subscribe(client, "subscription { alphaTick }");
    await keepsReceiving(replacement);
    expect(replacement.values[0]).toBeGreaterThanOrEqual(1000);
  });

  it("completes a removed subgraph's subscriptions and keeps the endpoint", async () => {
    const { core, alpha, closes, connect, subscribe, applyPackage } =
      await setup();
    await keepsReceiving(alpha);

    await applyPackage([]);

    expect(await alpha.outcome()).toBe("complete");
    await keepsReceiving(core);
    expect(closes).toEqual([]);

    const { client } = connect();
    await keepsReceiving(subscribe(client, "subscription { coreTick }"));
    expect(
      await subscribe(client, "subscription { alphaTick }").outcome(),
    ).toMatch(/^error Cannot query field "alphaTick"/);
  });
});
