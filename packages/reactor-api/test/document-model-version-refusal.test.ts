import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type {
  IReactorClient,
  IRelationalDb,
  ISyncManager,
} from "@powerhousedao/reactor";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import type http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebSocketServer } from "ws";
import type {
  AdapterRouteHandle,
  FetchHandler,
  IGatewayAdapter,
  IHttpAdapter,
  SubgraphDefinition,
} from "../src/graphql/gateway/types.js";
import { GraphQLManager } from "../src/graphql/graphql-manager.js";
import { ReactorSubgraph } from "../src/graphql/reactor/subgraph.js";
import type { Context, SubgraphClass } from "../src/graphql/types.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../src/services/authorization.service.js";

const REFUSAL =
  "Refusing every version of document model @documentType from the GraphQL schema: @reason";
const SUBGRAPH_REFUSAL =
  "Refusing the subgraph of every version of document model @documentType: @reason";
const OLDER_REFUSAL =
  "Refusing an older version of document model @documentType from the GraphQL schema: @reason";

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

function makeModel(name: string, id: string): DocumentModelModule {
  return {
    documentModel: {
      global: {
        name,
        id,
        specifications: [
          {
            version: 1,
            modules: [
              {
                name: "core",
                operations: [
                  {
                    name: "doThing",
                    schema: "input DoThingInput { x: String }",
                  },
                ],
              },
            ],
            state: {
              global: { schema: `type ${name}State { name: String }` },
              local: { schema: "" },
            },
          },
        ],
      },
    },
  } as unknown as DocumentModelModule;
}

/** Builds the supergraph on handler creation, as stitching and mercurius do. */
function makeHarness(models: DocumentModelModule[]) {
  const logger = makeLogger();
  const supergraphs: string[][] = [];
  let getDefinitions: (() => SubgraphDefinition[]) | undefined;
  const build = () => {
    supergraphs.push(
      getDefinitions!().map((d) => d.name.replace(":graphql/", "")),
    );
  };
  const gatewayAdapter = {
    start: vi.fn().mockResolvedValue(undefined),
    createHandler: vi
      .fn()
      .mockResolvedValue(() => Promise.resolve(new Response("ok"))),
    createSupergraphHandler: vi.fn((getSubgraphs: typeof getDefinitions) => {
      getDefinitions = getSubgraphs;
      build();
      return Promise.resolve(() => Promise.resolve(new Response("ok")));
    }),
    updateSupergraph: vi.fn(() => {
      build();
      return Promise.resolve();
    }),
    attachWebSocket: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    stop: vi.fn().mockResolvedValue(undefined),
  } as unknown as IGatewayAdapter<Context>;
  const handle = (): AdapterRouteHandle => ({ dispose: vi.fn() });
  const httpAdapter: IHttpAdapter = {
    setupMiddleware: vi.fn(),
    mount: vi.fn((_path: string, _handler: FetchHandler) => handle()),
    getRoute: vi.fn(handle),
    mountRawMiddleware: vi.fn(),
    mountNodeRoute: vi.fn(handle),
    listen: vi.fn().mockResolvedValue({}),
    setupSentryErrorHandler: vi.fn(),
    handle: {},
  };
  const manager = new GraphQLManager({
    path: "/",
    httpServer: {} as http.Server,
    wsServer: {
      close: vi.fn((cb?: () => void) => cb?.()),
      setMaxListeners: vi.fn(),
    } as unknown as WebSocketServer,
    reactorClient: {
      getDocumentModelModules: vi.fn().mockResolvedValue({ results: models }),
      find: vi
        .fn()
        .mockResolvedValue({ results: [], options: { cursor: "", limit: 1 } }),
    } as unknown as IReactorClient,
    relationalDb: {} as IRelationalDb,
    analyticsStore: {} as IAnalyticsStore,
    syncManager: {} as ISyncManager,
    logger,
    httpAdapter,
    gatewayAdapter,
    featureFlags: { enableDocumentModelSubgraphs: true },
    authorizationService: createAuthorizationService({
      admins: [],
      defaultProtection: false,
      policy: AuthorizationPolicy.OPEN,
    }),
  });
  return { manager, logger, supergraphs };
}

async function init(manager: GraphQLManager, core: SubgraphClass[]) {
  const pending = manager.init(core);
  await vi.runAllTimersAsync();
  await pending;
}

type Spec =
  DocumentModelModule["documentModel"]["global"]["specifications"][number];

const STATE = "type GadgetState { name: String }";
const OPERATION = "input DoThingInput { x: String }";

function spec(base: Spec, version: number, state: string, operation: string) {
  const [module] = base.modules;
  return {
    ...base,
    version,
    modules: [
      {
        ...module,
        operations: [{ ...module.operations[0], schema: operation }],
      },
    ],
    state: { global: { schema: state }, local: { schema: "" } },
  } as Spec;
}

function withSpecs(model: DocumentModelModule, specifications: Spec[]) {
  return {
    ...model,
    version: specifications.length,
    documentModel: {
      ...model.documentModel,
      global: { ...model.documentModel.global, specifications },
    },
  } as unknown as DocumentModelModule;
}

type Version = { state: string; operation: string };

function makeVersions(v1: Version, v2: Version): DocumentModelModule[] {
  const model = makeModel("Gadget", "test/gadget");
  const base = model.documentModel.global.specifications[0];
  const v1Spec = spec(base, 1, v1.state, v1.operation);
  const v2Spec = spec(base, 2, v2.state, v2.operation);
  return [withSpecs(model, [v1Spec]), withSpecs(model, [v1Spec, v2Spec])];
}

const usable: Version = { state: STATE, operation: OPERATION };
const unparseable: Version = {
  state: "type GadgetState { name: String",
  operation: OPERATION,
};
const drive = makeModel("DocumentDrive", "powerhouse/document-drive");

function gadgetRefusals(logger: ILogger) {
  return vi
    .mocked(logger.error)
    .mock.calls.filter(([, documentType]) => documentType === "test/gadget");
}

describe("a document model whose latest version is refused", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["has an unparseable schema", REFUSAL, unparseable],
    [
      "takes a reserved name",
      REFUSAL,
      { state: `scalar Revision\n${STATE}`, operation: OPERATION },
    ],
    [
      "has an unusable subgraph schema",
      SUBGRAPH_REFUSAL,
      { state: STATE, operation: "input DoThingInput { x: Missing }" },
    ],
  ])("serves no older version when it %s", async (_case, message, v2) => {
    const { manager, logger, supergraphs } = makeHarness([
      drive,
      ...makeVersions(usable, v2),
    ]);

    await init(manager, [ReactorSubgraph]);

    expect(gadgetRefusals(logger)).toEqual([
      [message, "test/gadget", expect.stringMatching(/^version 2 /)],
    ]);
    expect(manager.getSubgraphByName("gadget")).toBeUndefined();
    expect(supergraphs.at(-1)).not.toContain("gadget");
  });

  it("serves the latest version when only an older one is refused", async () => {
    const { manager, logger, supergraphs } = makeHarness([
      drive,
      ...makeVersions(unparseable, usable),
    ]);

    await init(manager, [ReactorSubgraph]);

    expect(gadgetRefusals(logger)).toEqual([
      [OLDER_REFUSAL, "test/gadget", expect.stringMatching(/^version 1 /)],
    ]);
    expect(manager.getSubgraphByName("gadget")).toBeDefined();
    expect(supergraphs.at(-1)).toContain("gadget");
  });
});
