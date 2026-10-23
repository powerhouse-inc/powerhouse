import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type {
  IProcessorManager,
  IReactorClient,
  IRelationalDb,
  ISyncManager,
} from "@powerhousedao/reactor";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import { defineScalar, type ScalarDefinition } from "document-model/scalars";
import { GraphQLScalarType } from "graphql";
import { gql } from "graphql-tag";
import type http from "node:http";
import { inspect } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";
import { z } from "zod";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import { ApolloGatewayAdapter } from "../src/graphql/gateway/adapter-gateway-apollo.js";
import { ExpressHttpAdapter } from "../src/graphql/gateway/adapter-http-express.js";
import { StitchingGatewayAdapter } from "../src/graphql/gateway/adapter-gateway-stitching.js";
import type {
  FetchHandler,
  IHttpAdapter,
} from "../src/graphql/gateway/types.js";
import { coreSubgraphClasses } from "../src/config.js";
import { GraphQLManager } from "../src/graphql/graphql-manager.js";
import type { SubgraphClass } from "../src/graphql/types.js";
import { setupEventListeners } from "../src/packages/package-listeners.js";
import { PackageManager } from "../src/packages/package-manager.js";
import { scalarExportsOf } from "../src/packages/scalar-exports.js";
import { buildScalarRegistry } from "../src/packages/scalar-registry.js";
import type { ScalarRegistry } from "../src/utils/scalar-types.js";
import type { ISubscribablePackageLoader } from "../src/packages/types.js";
import type { IProcessorHostModule } from "../src/types.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../src/services/authorization.service.js";

const VALID = "DE89370400440532013000";
const INVALID = "not-an-iban";
const IBAN_REFUSAL =
  "Iban: ✖ Invalid string: must match pattern /^[A-Z]{2}\\d{2}[A-Z0-9]{11,30}$/";

const Iban = defineScalar({
  name: "Iban",
  description: "International bank account number",
  schema: z.string().regex(/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/),
});

const PACKAGE = "@acme/banking";

function stateModel(name: string, id: string, state: string) {
  return {
    documentModel: {
      global: {
        id,
        name,
        specifications: [
          {
            version: 1,
            state: {
              global: { schema: state, initialValue: "" },
              local: { schema: "", initialValue: "" },
            },
            modules: [
              {
                id: "accounts",
                name: "accounts",
                description: "",
                operations: [
                  {
                    id: "set-iban",
                    name: "SET_IBAN",
                    schema: "input SetIbanInput { iban: Iban! }",
                    description: "",
                    template: "",
                    reducer: "",
                    errors: [],
                    examples: [],
                    scope: "global",
                  },
                ],
              },
            ],
          },
        ],
      },
    },
    actions: { setIban: (input: unknown) => ({ type: "SET_IBAN", input }) },
  } as unknown as DocumentModelModule;
}

const DRIVE = {
  documentModel: {
    global: {
      id: "powerhouse/document-drive",
      name: "DocumentDrive",
      specifications: [
        {
          version: 1,
          modules: [],
          state: {
            global: { schema: "type DocumentDriveState { name: String }" },
            local: { schema: "" },
          },
        },
      ],
    },
  },
} as unknown as DocumentModelModule;

const LEDGER = stateModel(
  "Ledger",
  "test/ledger",
  "scalar Iban\n\ntype LedgerState { iban: Iban }",
);

class IbanLookup extends BaseSubgraph {
  name = "iban-lookup";
  typeDefs = gql`
    scalar Iban
    type Query {
      checkIban(iban: Iban!): Iban!
    }
  `;
  resolvers = {
    Query: { checkIban: (_root: unknown, args: { iban: string }) => args.iban },
  };
}

class UndeclaredIbanLookup extends BaseSubgraph {
  name = "iban-format";
  typeDefs = gql`
    type Query {
      formatIban(iban: Iban!): String!
    }
  `;
  resolvers = {
    Query: {
      formatIban: (_root: unknown, args: { iban: string }) =>
        args.iban.replace(/(.{4})/g, "$1 ").trim(),
    },
  };
}

function makeLogger(): ILogger {
  const logger: ILogger = {
    level: "error",
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    errorHandler: vi.fn(),
    child: () => logger,
  };
  return logger;
}

type GraphQLBody = {
  data?: Record<string, unknown> | null;
  errors?: { message: string }[];
};

function makeReactorClient(models: DocumentModelModule[], executed: unknown[]) {
  return {
    getDocumentModelModules: () => Promise.resolve({ results: models }),
    find: () =>
      Promise.resolve({ results: [], options: { cursor: "", limit: 1 } }),
    get: (id: string) =>
      Promise.resolve({ header: { id, documentType: "test/ledger" } }),
    execute: (_id: string, _branch: string, actions: unknown[]) => {
      executed.push(...actions);
      return Promise.reject(new Error("not stored"));
    },
  } as unknown as IReactorClient;
}

async function makeFederatedHost(logger: ILogger, models = [DRIVE, LEDGER]) {
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
    wsServer: new WebSocketServer({ noServer: true }),
    reactorClient: makeReactorClient(models, []),
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
  shutdown = async () => {
    await manager.shutdown();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
  const post = async (
    path: string,
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<GraphQLBody> => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    return (await response.json()) as GraphQLBody;
  };
  return { manager, post };
}

function makeHost(
  logger: ILogger,
  models = [DRIVE, LEDGER],
  featureFlags = { enableDocumentModelSubgraphs: true },
) {
  const mounts = new Map<string, FetchHandler>();
  const executed: unknown[] = [];
  const httpAdapter: IHttpAdapter = {
    setupMiddleware: vi.fn(),
    mount: vi.fn((path: string, handler: FetchHandler) => {
      mounts.set(path, handler);
      return {
        dispose: () => {
          if (mounts.get(path) === handler) mounts.delete(path);
        },
      };
    }),
    getRoute: vi.fn(() => ({ dispose: vi.fn() })),
    mountRawMiddleware: vi.fn(),
    mountNodeRoute: vi.fn(() => ({ dispose: vi.fn() })),
    listen: vi.fn().mockResolvedValue({}),
    setupSentryErrorHandler: vi.fn(),
    handle: {},
  };
  const reactorClient = makeReactorClient(models, executed);
  const manager = new GraphQLManager({
    path: "/",
    httpServer: {} as http.Server,
    wsServer: {
      close: (cb?: () => void) => cb?.(),
      setMaxListeners: vi.fn(),
    } as unknown as WebSocketServer,
    reactorClient,
    relationalDb: {} as IRelationalDb,
    analyticsStore: {} as IAnalyticsStore,
    syncManager: {} as ISyncManager,
    logger,
    httpAdapter,
    gatewayAdapter: new StitchingGatewayAdapter(logger),
    featureFlags,
    authorizationService: createAuthorizationService({
      admins: [],
      defaultProtection: false,
      policy: AuthorizationPolicy.OPEN,
    }),
  });
  const post = async (
    path: string,
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<GraphQLBody> => {
    const handler = mounts.get(path);
    if (!handler) {
      throw new Error(
        `Nothing is mounted at ${path}: ${[...mounts.keys()].join(", ")}`,
      );
    }
    const response = await handler(
      new Request(`http://localhost${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
      }),
    );
    return (await response.json()) as GraphQLBody;
  };
  return { manager, post, executed, reactorClient };
}

async function serve(
  host: ReturnType<typeof makeHost>,
  scalars: ScalarRegistry,
  subgraphs: SubgraphClass[],
) {
  await host.manager.init([], undefined, undefined, scalars);
  await host.manager.applyPackageSubgraphs(new Map([[PACKAGE, subgraphs]]));
  await host.manager.updateRouter();
}

const registryOf = (module: Record<string, unknown>) =>
  buildScalarRegistry(new Map([[PACKAGE, scalarExportsOf(module)]])).registry;

const SCALAR_TYPE = `query ($name: String!) {
  __type(name: $name) { name kind description }
}`;

const errorsOf = (body: GraphQLBody) =>
  (body.errors ?? []).map((error) => error.message);

let shutdown: (() => Promise<void>) | undefined;

afterEach(async () => {
  await shutdown?.();
  shutdown = undefined;
});

describe("a registered scalar served by the host", () => {
  async function bankingHost() {
    const host = makeHost(makeLogger());
    shutdown = () => host.manager.shutdown();
    await serve(host, registryOf({ Iban }), [
      IbanLookup,
      UndeclaredIbanLookup,
    ] as unknown as SubgraphClass[]);
    return host;
  }

  it("is introspected as Iban in the model subgraph, the custom subgraphs and the supergraph", async () => {
    const { post } = await bankingHost();
    for (const path of [
      "/graphql/ledger",
      "/graphql/iban-lookup",
      "/graphql/iban-format",
      "/graphql",
    ]) {
      expect(await post(path, SCALAR_TYPE, { name: "Iban" })).toEqual({
        data: {
          __type: {
            name: "Iban",
            kind: "SCALAR",
            description: "International bank account number",
          },
        },
      });
    }
    const field = `{
      __type(name: "Ledger_LedgerState") { fields { name type { name } } }
    }`;
    expect(await post("/graphql", field)).toEqual({
      data: { __type: { fields: [{ name: "iban", type: { name: "Iban" } }] } },
    });
  });

  it("validates a model operation input", async () => {
    const { post, executed } = await bankingHost();
    const mutation = `mutation ($iban: Iban!) {
      Ledger { setIban(docId: "doc-1", input: { iban: $iban }) { id } }
    }`;
    expect(
      errorsOf(await post("/graphql/ledger", mutation, { iban: INVALID })),
    ).toEqual([
      `Variable "$iban" got invalid value "${INVALID}"; Expected type "Iban". ${IBAN_REFUSAL}`,
    ]);
    expect(executed).toEqual([]);

    expect(
      errorsOf(await post("/graphql/ledger", mutation, { iban: VALID })),
    ).toEqual(["not stored"]);
    expect(executed).toEqual([{ type: "SET_IBAN", input: { iban: VALID } }]);
  });

  it("validates custom subgraph arguments, served alone and in the supergraph", async () => {
    const { post } = await bankingHost();
    for (const [path, field] of [
      ["/graphql/iban-lookup", "checkIban"],
      ["/graphql/iban-format", "formatIban"],
      ["/graphql", "checkIban"],
      ["/graphql", "formatIban"],
    ]) {
      expect(
        errorsOf(await post(path, `{ ${field}(iban: "${INVALID}") }`)),
      ).toEqual([
        `Expected value of type "Iban!", found "${INVALID}"; ${IBAN_REFUSAL}`,
      ]);
    }
    expect(await post("/graphql", `{ formatIban(iban: "${VALID}") }`)).toEqual({
      data: { formatIban: "DE89 3704 0044 0532 0130 00" },
    });
  });
});

describe("a registered scalar whose schema changes values", () => {
  const mutation = `mutation ($iban: Iban!) {
    Ledger { setIban(docId: "doc-1", input: { iban: $iban }) { id } }
  }`;

  async function hostServing(definition: ScalarDefinition) {
    const host = makeHost(makeLogger());
    shutdown = () => host.manager.shutdown();
    await serve(host, registryOf({ Iban: definition }), []);
    return host;
  }

  it("hands the action creator the canonical value", async () => {
    const { post, executed } = await hostServing(
      defineScalar({ name: "Iban", schema: z.string().trim().toUpperCase() }),
    );
    expect(
      errorsOf(await post("/graphql/ledger", mutation, { iban: " de89 " })),
    ).toEqual(["not stored"]);
    expect(executed).toEqual([{ type: "SET_IBAN", input: { iban: "DE89" } }]);
  });

  it("refuses a value the schema changes again on a second parse", async () => {
    const { post, executed } = await hostServing(
      defineScalar({
        name: "Iban",
        schema: z.string().transform((value) => value + "!"),
      }),
    );
    expect(
      errorsOf(await post("/graphql/ledger", mutation, { iban: "abc" })),
    ).toEqual([
      'Variable "$iban" got invalid value "abc"; Expected type "Iban". Iban: the schema must accept its own output unchanged, but "abc!" parses to "abc!!".',
    ]);
    expect(executed).toEqual([]);
  });

  it("refuses a value whose output is not JSON, naming the scalar", async () => {
    const { post, executed } = await hostServing(
      defineScalar({
        name: "Iban",
        // @ts-expect-error a JavaScript package skips the type check
        schema: z.string().transform((value) => BigInt(value)),
      }),
    );
    expect(
      errorsOf(await post("/graphql/ledger", mutation, { iban: "7" })),
    ).toEqual([
      'Variable "$iban" got invalid value "7"; Expected type "Iban". Iban: the schema output is not JSON: 7n',
    ]);
    expect(executed).toEqual([]);
  });

  it("names the scalar when the output's own inspect hook throws", async () => {
    const { post, executed } = await hostServing(
      defineScalar({
        name: "Iban",
        schema: z.string().transform((value) => ({
          value: BigInt(value),
          [inspect.custom]() {
            throw new Error("inspect hook ran");
          },
        })) as unknown as z.ZodString,
      }),
    );
    expect(
      errorsOf(await post("/graphql/ledger", mutation, { iban: "7" })),
    ).toEqual([
      'Variable "$iban" got invalid value "7"; Expected type "Iban". Iban: the schema output is not JSON: { value: 7n, Symbol(nodejs.util.inspect.custom): [Function: [nodejs.util.inspect.custom]] }',
    ]);
    expect(executed).toEqual([]);
  });

  it("refuses a value whose output the schema does not accept", async () => {
    const { post, executed } = await hostServing(
      defineScalar({
        name: "Iban",
        // @ts-expect-error a JavaScript package skips the type check
        schema: z.string().transform(Number),
      }),
    );
    expect(
      errorsOf(await post("/graphql/ledger", mutation, { iban: "7" })),
    ).toEqual([
      'Variable "$iban" got invalid value "7"; Expected type "Iban". Iban: the schema must accept its own output unchanged, but 7 fails it: ✖ Invalid input: expected string, received number',
    ]);
    expect(executed).toEqual([]);
  });
});

describe("a document model named like a registered scalar", () => {
  it("is refused, and the other models are served", async () => {
    const logger = makeLogger();
    const host = makeHost(logger, [
      DRIVE,
      LEDGER,
      stateModel("Iban", "test/iban", "type IbanState { country: String }"),
    ]);
    shutdown = () => host.manager.shutdown();
    await serve(host, registryOf({ Iban }), []);

    expect(vi.mocked(logger.error).mock.calls).toContainEqual([
      "Refusing every version of document model @documentType from the GraphQL schema: @reason",
      "test/iban",
      "version 1 generates reserved type names: Iban",
    ]);
    expect(await host.post("/graphql", SCALAR_TYPE, { name: "Iban" })).toEqual({
      data: {
        __type: {
          name: "Iban",
          kind: "SCALAR",
          description: "International bank account number",
        },
      },
    });
    await expect(host.post("/graphql/iban", "{ __typename }")).rejects.toThrow(
      "Nothing is mounted at /graphql/iban",
    );
    expect(
      await host.post("/graphql/ledger", SCALAR_TYPE, { name: "Iban" }),
    ).toMatchObject({ data: { __type: { kind: "SCALAR" } } });
  });
});

describe("a subgraph's own resolver for a registered scalar", () => {
  class IbanEcho extends BaseSubgraph {
    name = "iban-echo";
    typeDefs = gql`
      type Query {
        echo(iban: Iban!): Iban!
      }
    `;
    resolvers = {
      Iban: new GraphQLScalarType({
        name: "Iban",
        serialize: (value) => `authored:${String(value)}`,
        parseValue: (value) => value,
        parseLiteral: (ast) => ("value" in ast ? ast.value : null),
      }),
      Query: { echo: (_root: unknown, args: { iban: string }) => args.iban },
    };
  }

  it("runs instead of the registered validation, with one warning", async () => {
    const logger = makeLogger();
    const host = makeHost(logger);
    shutdown = () => host.manager.shutdown();
    await serve(host, registryOf({ Iban }), [
      IbanEcho,
    ] as unknown as SubgraphClass[]);
    await host.manager.updateRouter();

    expect(
      await host.post("/graphql/iban-echo", `{ echo(iban: "${INVALID}") }`),
    ).toEqual({ data: { echo: `authored:${INVALID}` } });
    expect(
      vi
        .mocked(logger.warn)
        .mock.calls.filter(([message]) =>
          String(message).includes("registered scalar"),
        ),
    ).toEqual([
      [
        "Subgraph @name provides its own resolver for registered scalar @scalar; the registered validation is not applied.",
        "iban-echo",
        "Iban",
      ],
    ]);
  });
});

async function servePackage(
  host: Pick<ReturnType<typeof makeHost>, "manager">,
  initial: Record<string, unknown>,
  core: SubgraphClass[] = [],
) {
  let exported = initial;
  let notify: (() => void) | undefined;
  const loader: ISubscribablePackageLoader = {
    name: "fixture-loader",
    loadDocumentModels: () => Promise.resolve([]),
    loadSubgraphs: () =>
      Promise.resolve([IbanLookup] as unknown as SubgraphClass[]),
    loadScalars: () => Promise.resolve(scalarExportsOf(exported)),
    loadProcessors: () => Promise.resolve(null),
    loadPieces: () => Promise.resolve([]),
    onScalarsChange: (_pkg, handler) => {
      notify = () => handler([]);
      return () => undefined;
    },
  };
  const packages = new PackageManager([loader], { packages: [PACKAGE] });
  const { subgraphs } = await packages.init();
  await host.manager.init(
    core,
    undefined,
    undefined,
    packages.getScalarRegistry(),
  );
  await host.manager.applyPackageSubgraphs(subgraphs);
  await host.manager.updateRouter();
  setupEventListeners(
    packages,
    host.manager,
    {
      registerFactory: vi.fn(),
      unregisterFactory: vi.fn(),
    } as unknown as IProcessorManager,
    () => ({}) as IProcessorHostModule,
    undefined,
    { logger: makeLogger() },
  );
  return {
    edit: (module: Record<string, unknown>) => {
      exported = module;
      notify?.();
    },
  };
}

describe("a scalars change", () => {
  it("rebuilds the served schemas", async () => {
    const LooseIban = defineScalar({
      name: "Iban",
      description: "International bank account number",
      schema: z.string(),
    });
    const Bic = defineScalar({ name: "Bic", schema: z.string() });
    const host = makeHost(makeLogger());
    shutdown = () => host.manager.shutdown();
    const { edit } = await servePackage(host, { Iban: LooseIban });

    const check = `{ checkIban(iban: "${INVALID}") }`;
    expect(await host.post("/graphql", check)).toEqual({
      data: { checkIban: INVALID },
    });
    expect(await host.post("/graphql", SCALAR_TYPE, { name: "Bic" })).toEqual({
      data: { __type: null },
    });

    edit({ Iban, Bic });

    const bic = {
      data: { __type: { name: "Bic", kind: "SCALAR", description: null } },
    };
    await vi.waitFor(
      async () =>
        expect(
          await host.post("/graphql", SCALAR_TYPE, { name: "Bic" }),
        ).toEqual(bic),
      { timeout: 10_000, interval: 100 },
    );
    for (const path of ["/graphql/ledger", "/graphql/iban-lookup"]) {
      expect(await host.post(path, SCALAR_TYPE, { name: "Bic" })).toEqual(bic);
    }
    for (const path of ["/graphql/iban-lookup", "/graphql"]) {
      expect(errorsOf(await host.post(path, check))).toEqual([
        `Expected value of type "Iban!", found "${INVALID}"; ${IBAN_REFUSAL}`,
      ]);
    }
  });
});

describe("a scalars change whose rebuild fails", () => {
  it("rejects to the caller, never fails a later change, and is retried until it succeeds", async () => {
    const logger = makeLogger();
    const host = makeHost(logger);
    shutdown = () => host.manager.shutdown();
    await host.manager.init([], undefined, undefined, registryOf({}));
    await host.manager.updateRouter();
    const setIban = `mutation ($iban: Iban!) {
      Ledger { setIban(docId: "doc-1", input: { iban: $iban }) { id } }
    }`;
    const unavailable = new Error("model store unavailable");
    vi.spyOn(host.reactorClient, "getDocumentModelModules")
      .mockRejectedValueOnce(unavailable)
      .mockRejectedValueOnce(unavailable);

    await expect(
      host.manager.applyScalarRegistry(registryOf({ Iban })),
    ).rejects.toThrow("model store unavailable");
    await expect(
      host.manager.applyPackageSubgraphs(new Map()),
    ).resolves.toBeUndefined();
    expect(
      vi
        .mocked(logger.error)
        .mock.calls.filter(([message]) =>
          String(message).startsWith("Could not apply the registered scalars"),
        ),
    ).toHaveLength(1);

    await host.manager.applyPackageSubgraphs(new Map());
    await host.manager.updateRouter();
    expect(
      errorsOf(await host.post("/graphql/ledger", setIban, { iban: INVALID })),
    ).toEqual([
      `Variable "$iban" got invalid value "${INVALID}"; Expected type "Iban". ${IBAN_REFUSAL}`,
    ]);
  });
});

describe("a scalars change on a host without document model subgraphs", () => {
  it("validates with the new scalars without fetching the models again", async () => {
    const host = makeHost(makeLogger(), [DRIVE, LEDGER], {
      enableDocumentModelSubgraphs: false,
    });
    shutdown = () => host.manager.shutdown();
    await host.manager.init(
      [IbanLookup] as unknown as SubgraphClass[],
      undefined,
      undefined,
      registryOf({}),
    );
    await host.manager.updateRouter();
    const check = `{ checkIban(iban: "${INVALID}") }`;
    expect(await host.post("/graphql/iban-lookup", check)).toEqual({
      data: { checkIban: INVALID },
    });
    const fetches = vi.spyOn(host.reactorClient, "getDocumentModelModules");

    await host.manager.applyScalarRegistry(registryOf({ Iban }));
    await host.manager.updateRouter();

    expect(errorsOf(await host.post("/graphql/iban-lookup", check))).toEqual([
      `Expected value of type "Iban!", found "${INVALID}"; ${IBAN_REFUSAL}`,
    ]);
    expect(fetches).not.toHaveBeenCalled();
  });
});

describe("a registered scalar in the Apollo federation supergraph", () => {
  const ibanType = (description: string) => ({
    data: { __type: { name: "Iban", kind: "SCALAR", description } },
  });

  it("is introspected with its description, which a scalars change replaces", async () => {
    const host = await makeFederatedHost(makeLogger());
    const { edit } = await servePackage(
      host,
      { Iban },
      coreSubgraphClasses({ inspection: false, documentPermissions: true }),
    );

    for (const path of [
      "/graphql/ledger",
      "/graphql/iban-lookup",
      "/graphql",
    ]) {
      expect(await host.post(path, SCALAR_TYPE, { name: "Iban" })).toEqual(
        ibanType("International bank account number"),
      );
    }
    expect(
      await host.post("/graphql", `{ checkIban(iban: "${VALID}") }`),
    ).toEqual({ data: { checkIban: VALID } });

    edit({
      Iban: defineScalar({
        name: "Iban",
        description: "German IBAN only",
        schema: z.string().regex(/^DE\d{20}$/),
      }),
    });
    await vi.waitFor(
      async () =>
        expect(
          await host.post("/graphql", SCALAR_TYPE, { name: "Iban" }),
        ).toEqual(ibanType("German IBAN only")),
      { timeout: 10_000, interval: 100 },
    );
    expect(
      await host.post("/graphql/iban-lookup", SCALAR_TYPE, { name: "Iban" }),
    ).toEqual(ibanType("German IBAN only"));

    edit({ Iban });
    await vi.waitFor(
      async () =>
        expect(
          await host.post("/graphql", SCALAR_TYPE, { name: "Iban" }),
        ).toEqual(ibanType("International bank account number")),
      { timeout: 10_000, interval: 100 },
    );
  });
});

describe("a registered scalar named like a host subgraph's type", () => {
  const ReactorDriveNode = defineScalar({
    name: "ReactorDriveNode",
    schema: z.string(),
  });

  class HostDrive extends BaseSubgraph {
    name = "reactor-drive";
    typeDefs = gql`
      type ReactorDriveNode {
        id: String!
      }
      type Query {
        driveNode: ReactorDriveNode
      }
    `;
    resolvers = { Query: { driveNode: () => ({ id: "x" }) } };
  }

  class IbanHost extends BaseSubgraph {
    name = "iban-host";
    typeDefs = gql`
      type Iban {
        country: String!
      }
      type Query {
        ibanHost: Iban
      }
    `;
    resolvers = { Query: { ibanHost: () => ({ country: "DE" }) } };
  }

  class FailingIbanHost extends IbanHost {
    override onSetup(): Promise<void> {
      return Promise.reject(new Error("setup failed"));
    }
  }

  class Ping extends BaseSubgraph {
    name = "ping";
    typeDefs = gql`
      type Query {
        ping: String
      }
    `;
    resolvers = { Query: { ping: () => "pong" } };
  }

  const DRIVE_NODE = "{ driveNode { id } }";
  const SET_IBAN = `mutation ($iban: Iban!) {
    Ledger { setIban(docId: "doc-1", input: { iban: $iban }) { id } }
  }`;

  const scalarRefusals = (logger: ILogger) =>
    vi
      .mocked(logger.error)
      .mock.calls.filter(([message]) =>
        String(message).startsWith("Refusing scalar"),
      );

  const refusal = (scalar: string, subgraph: string) => [
    "Refusing scalar @scalar of package @package: subgraph @subgraph defines a type of that name",
    scalar,
    PACKAGE,
    subgraph,
  ];

  async function hostWith(scalars: ScalarRegistry, models = [DRIVE, LEDGER]) {
    const logger = makeLogger();
    const host = makeHost(logger, models);
    shutdown = () => host.manager.shutdown();
    await host.manager.init(
      [Ping] as unknown as SubgraphClass[],
      undefined,
      undefined,
      scalars,
    );
    await host.manager.updateRouter();
    return { ...host, logger, models };
  }

  async function register(host: ReturnType<typeof makeHost>, subgraph: never) {
    await host.manager.registerSubgraphInstance(subgraph, "graphql", false);
    await host.manager.updateRouter();
  }

  it("is refused, and the host subgraph is served", async () => {
    const host = await hostWith(registryOf({ ReactorDriveNode }));

    await register(host, new HostDrive({} as never) as never);
    await host.manager.updateRouter();

    for (const path of ["/graphql/reactor-drive", "/graphql"]) {
      expect(await host.post(path, DRIVE_NODE)).toEqual({
        data: { driveNode: { id: "x" } },
      });
    }
    expect(scalarRefusals(host.logger)).toEqual([
      refusal("ReactorDriveNode", "reactor-drive"),
    ]);
  });

  it("is refused when a core subgraph defines the type", async () => {
    const PHDocument = defineScalar({ name: "PHDocument", schema: z.string() });
    const logger = makeLogger();
    const host = makeHost(logger);
    shutdown = () => host.manager.shutdown();
    await host.manager.init(
      coreSubgraphClasses({ inspection: false, documentPermissions: true }),
      undefined,
      undefined,
      registryOf({ PHDocument }),
    );
    await host.manager.updateRouter();

    expect(scalarRefusals(logger)).toEqual([refusal("PHDocument", "r")]);
    expect(
      await host.post("/graphql/r", SCALAR_TYPE, { name: "PHDocument" }),
    ).toMatchObject({
      data: { __type: { name: "PHDocument", kind: "OBJECT" } },
    });
  });

  it("is refused when a scalars change adds it after the host subgraph registered", async () => {
    const host = await hostWith(registryOf({ Iban }));
    await register(host, new HostDrive({} as never) as never);

    await host.manager.applyScalarRegistry(
      registryOf({ Iban, ReactorDriveNode }),
    );
    await host.manager.updateRouter();

    expect(await host.post("/graphql/reactor-drive", DRIVE_NODE)).toEqual({
      data: { driveNode: { id: "x" } },
    });
    expect(scalarRefusals(host.logger)).toEqual([
      refusal("ReactorDriveNode", "reactor-drive"),
    ]);
    expect(
      errorsOf(await host.post("/graphql/ledger", SET_IBAN, { iban: INVALID })),
    ).toEqual([
      `Variable "$iban" got invalid value "${INVALID}"; Expected type "Iban". ${IBAN_REFUSAL}`,
    ]);
  });

  it("stays registered when the host subgraph fails to set up", async () => {
    const host = await hostWith(registryOf({ Iban }), [DRIVE]);

    await expect(
      host.manager.registerSubgraphInstance(
        new FailingIbanHost({} as never),
        "banking-host",
        false,
      ),
    ).rejects.toThrow("setup failed");
    host.models.push(LEDGER);
    await host.manager.regenerateDocumentModelSubgraphs();
    await host.manager.updateRouter();

    expect(
      errorsOf(await host.post("/graphql/ledger", SET_IBAN, { iban: INVALID })),
    ).toEqual([
      `Variable "$iban" got invalid value "${INVALID}"; Expected type "Iban". ${IBAN_REFUSAL}`,
    ]);
    expect(host.executed).toEqual([]);
    expect(scalarRefusals(host.logger)).toEqual([]);
  });

  it("is registered again once the host subgraph unregisters", async () => {
    const host = await hostWith(registryOf({ Iban }), [DRIVE]);
    const ibanHost = new IbanHost({} as never);
    await host.manager.registerSubgraphInstance(
      ibanHost,
      "banking-host",
      false,
    );
    host.models.push(LEDGER);
    await host.manager.regenerateDocumentModelSubgraphs();
    await host.manager.updateRouter();

    expect(scalarRefusals(host.logger)).toEqual([refusal("Iban", "iban-host")]);
    expect(
      errorsOf(await host.post("/graphql/ledger", SET_IBAN, { iban: INVALID })),
    ).toEqual(["not stored"]);
    await expect(
      host.post("/banking-host/iban-host", "{ __typename }"),
    ).rejects.toThrow("Nothing is mounted at /banking-host/iban-host");

    await host.manager.setSupergraph("banking-host", []);
    await host.manager.updateRouter();

    expect(
      await host.post("/graphql/ledger", SCALAR_TYPE, { name: "Iban" }),
    ).toEqual({
      data: {
        __type: {
          name: "Iban",
          kind: "SCALAR",
          description: "International bank account number",
        },
      },
    });
    expect(
      errorsOf(await host.post("/graphql/ledger", SET_IBAN, { iban: INVALID })),
    ).toEqual([
      `Variable "$iban" got invalid value "${INVALID}"; Expected type "Iban". ${IBAN_REFUSAL}`,
    ]);
    expect(host.executed).toEqual([
      { type: "SET_IBAN", input: { iban: INVALID } },
    ]);
  });
});
