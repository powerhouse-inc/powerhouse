import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type {
  IReactorClient,
  IRelationalDb,
  ISyncManager,
} from "@powerhousedao/reactor";
import type { ILogger } from "document-model";
import { ph } from "document-model";
import { print, type GraphQLResolveInfo, type GraphQLSchema } from "graphql";
import { gql } from "graphql-tag";
import type http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebSocketServer } from "ws";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import { defineSubgraph } from "../src/graphql/define-subgraph.js";
import type {
  FetchHandler,
  GatewayContextFactory,
  IGatewayAdapter,
  IHttpAdapter,
  WsDisposer,
} from "../src/graphql/gateway/types.js";
import { GraphQLManager } from "../src/graphql/graphql-manager.js";
import type { Context, SubgraphClass } from "../src/graphql/types.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../src/services/authorization.service.js";

const silentLogger: ILogger = {
  level: "error",
  verbose: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  errorHandler: vi.fn(),
  child: () => silentLogger,
};

type Observation = {
  readonly parent: unknown;
  readonly args: unknown;
  readonly fieldName: string;
  readonly returnType: string;
  readonly hasHeaders: boolean;
  readonly hasDb: boolean;
  readonly prefix: string;
};

const legacyObservations: Observation[] = [];
const codeFirstObservations: Observation[] = [];
const legacySetup = vi.fn();
const codeFirstSetup = vi.fn();

const authorTypeDefs = gql`
  type Query {
    greeting(name: String!): String!
  }
`;

class LegacyGreetingSubgraph extends BaseSubgraph {
  name = "greetings";
  hasSubscriptions = false;
  typeDefs = authorTypeDefs;
  resolvers = {
    Query: {
      greeting(
        parent: unknown,
        args: { name: string },
        request: Context,
        info: { fieldName: string; returnType: { toString(): string } },
      ) {
        legacyObservations.push({
          parent,
          args,
          fieldName: info.fieldName,
          returnType: info.returnType.toString(),
          hasHeaders: isRecord(request.headers),
          hasDb: request.db !== undefined,
          prefix: "hello ",
        });
        return `hello ${args.name}`;
      },
    },
  };

  onSetup(): Promise<void> {
    legacySetup();
    return Promise.resolve();
  }
}

const CodeFirstGreetingSubgraph = defineSubgraph({
  name: "greetings",
  schemaKind: "typed",
  onSetup({ subgraph }) {
    codeFirstSetup(subgraph.reactorClient, subgraph);
  },
  entries: (b) => [
    b.query("greeting", {
      args: { name: ph.String({ required: true }) },
      returns: ph.String({ required: true }),
      resolve({ parent, args, request, info, subgraph }) {
        const prefix = subgraph.name === "greetings" ? "hello " : "";
        codeFirstObservations.push({
          parent,
          args,
          fieldName: info.fieldName,
          returnType: info.returnType.toString(),
          hasHeaders: isRecord(request.headers),
          hasDb: request.db !== undefined,
          prefix,
        });
        return `${prefix}${args.name}`;
      },
    }),
  ],
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function makeHarness() {
  const mounted: string[] = [];
  const schemas: GraphQLSchema[] = [];
  const httpAdapter: IHttpAdapter = {
    setupMiddleware: vi.fn(),
    mount: vi.fn((path: string) => mounted.push(path)),
    getRoute: vi.fn(),
    mountRawMiddleware: vi.fn(),
    mountNodeRoute: vi.fn(),
    setupSentryErrorHandler: vi.fn(),
    listen: vi.fn().mockResolvedValue({}),
    handle: {},
  };
  const gatewayAdapter: IGatewayAdapter<Context> = {
    start: vi.fn().mockResolvedValue(undefined),
    createHandler(
      schema: GraphQLSchema,
      contextFactory: GatewayContextFactory<Context>,
    ): Promise<FetchHandler> {
      schemas.push(schema);
      return Promise.resolve(async (request) => {
        const body = (await request.json()) as {
          readonly query: string;
          readonly variables?: Record<string, unknown>;
        };
        const field = schema.getQueryType()?.getFields().greeting;
        if (!field?.resolve) {
          return Response.json(
            { errors: [{ message: "Greeting resolver is missing." }] },
            { status: 500 },
          );
        }
        const value = await field.resolve(
          undefined,
          body.variables ?? {},
          await contextFactory(request),
          {
            fieldName: "greeting",
            returnType: field.type,
          } as GraphQLResolveInfo,
        );
        return Response.json({ data: { greeting: value } });
      });
    },
    createSupergraphHandler: vi
      .fn()
      .mockResolvedValue(() => Promise.resolve(Response.json({ data: {} }))),
    updateSupergraph: vi.fn().mockResolvedValue(undefined),
    attachWebSocket: vi
      .fn()
      .mockReturnValue({ dispose: vi.fn() } satisfies WsDisposer),
    stop: vi.fn().mockResolvedValue(undefined),
  };
  const reactorClient = {
    getDocumentModelModules: vi.fn().mockResolvedValue({ results: [] }),
  } as unknown as IReactorClient;
  const wsServer = {
    setMaxListeners: vi.fn(),
    close: vi.fn((callback?: () => void) => callback?.()),
  } as unknown as WebSocketServer;
  const manager = new GraphQLManager(
    "/api",
    {} as http.Server,
    wsServer,
    reactorClient,
    {} as IRelationalDb,
    {} as IAnalyticsStore,
    {} as ISyncManager,
    silentLogger,
    httpAdapter,
    gatewayAdapter,
    undefined,
    undefined,
    { enableDocumentModelSubgraphs: false },
    4001,
    createAuthorizationService({
      admins: [],
      defaultProtection: false,
      policy: AuthorizationPolicy.OPEN,
    }),
  );
  return { manager, mounted, schemas, gatewayAdapter, reactorClient };
}

async function activate(subgraph: SubgraphClass) {
  const harness = makeHarness();
  await harness.manager.registerSubgraph(subgraph, "graphql");
  const update = harness.manager.updateRouter();
  await vi.runAllTimersAsync();
  await update;
  const instance = harness.manager.getSubgraphByName("greetings");
  if (!instance) throw new Error("Subgraph did not register.");
  const result = await harness.manager.executeSubgraphQuery<{
    readonly greeting: string;
  }>("greetings", "query($name: String!) { greeting(name: $name) }", {
    name: "Ada",
  });
  return {
    ...harness,
    instance,
    result,
    authorSchema: print(instance.typeDefs),
    augmentedSchema: projectSchema(harness.schemas[0]),
  };
}

function projectSchema(schema: GraphQLSchema) {
  return Object.values(schema.getTypeMap())
    .filter((type) => !type.name.startsWith("__"))
    .map((type) => {
      if (!("getFields" in type) || typeof type.getFields !== "function") {
        return { name: type.name, kind: type.constructor.name };
      }
      return {
        name: type.name,
        kind: type.constructor.name,
        fields: Object.values(type.getFields()).map((field) => ({
          name: field.name,
          type: field.type.toString(),
          args: field.args.map(
            (argument: {
              readonly name: string;
              readonly type: { toString(): string };
            }) => ({
              name: argument.name,
              type: argument.type.toString(),
            }),
          ),
        })),
      };
    });
}

describe("defineSubgraph production host contract", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    legacyObservations.length = 0;
    codeFirstObservations.length = 0;
    legacySetup.mockClear();
    codeFirstSetup.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("matches a hand-written BaseSubgraph through GraphQLManager", async () => {
    const legacy = await activate(LegacyGreetingSubgraph);
    const codeFirst = await activate(CodeFirstGreetingSubgraph);

    expect(codeFirst.instance).toBeInstanceOf(BaseSubgraph);
    expect(CodeFirstGreetingSubgraph.definition).toMatchObject({
      kind: "powerhouse.subgraph",
      name: "greetings",
      schemaKind: "typed",
      hasSubscriptions: false,
    });
    expect(codeFirst.authorSchema).toBe(legacy.authorSchema);
    expect(codeFirst.augmentedSchema).toStrictEqual(legacy.augmentedSchema);
    expect(codeFirst.result).toEqual(legacy.result);
    expect(codeFirst.result).toEqual({ greeting: "hello Ada" });
    expect(codeFirst.mounted).toEqual(legacy.mounted);
    expect(codeFirst.mounted).toContain("/api/graphql/greetings");
    expect(codeFirst.instance.hasSubscriptions).toBe(
      legacy.instance.hasSubscriptions,
    );
    expect(codeFirst.gatewayAdapter.attachWebSocket).not.toHaveBeenCalled();
    expect(legacy.gatewayAdapter.attachWebSocket).not.toHaveBeenCalled();
    expect(codeFirstObservations).toEqual(legacyObservations);
    expect(codeFirstSetup).toHaveBeenCalledOnce();
    expect(codeFirstSetup).toHaveBeenCalledWith(
      codeFirst.reactorClient,
      codeFirst.instance,
    );
    expect(legacySetup).toHaveBeenCalledOnce();
  });
});
