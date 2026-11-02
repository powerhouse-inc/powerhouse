import type {
  IReactorReadClient,
  IReactorWriteClient,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { documentModelDocumentModelModule } from "document-model";
import {
  buildClientSchema,
  type DefinitionNode,
  getIntrospectionQuery,
  GraphQLScalarType,
  type GraphQLSchema,
  isAbstractType,
  isObjectType,
  isScalarType,
  isSpecifiedScalarType,
  Kind,
  parse,
  print,
  printSchema,
} from "graphql";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname } from "node:path";
import { expect, vi } from "vitest";
import { coreSubgraphClasses } from "../../src/config.js";
import { ApolloGatewayAdapter } from "../../src/graphql/gateway/adapter-gateway-apollo.js";
import type { IReactorInspectionSource } from "../../src/graphql/inspection/source.js";
import { SubgraphWsRouter } from "../../src/graphql/subgraph-ws-router.js";
import type { IGatewayAdapter } from "../../src/graphql/gateway/types.js";
import type { Context } from "../../src/graphql/types.js";
import {
  makeHarness,
  makeHarnessLogger,
  makeMockReactorClient,
} from "../utils/graphql-manager-harness.js";

const UPDATE_GOLDENS = process.env.UPDATE_GOLDENS === "1";

type Definitions = Map<string, string>;

type Executable = { schema: GraphQLSchema; resolvers: string[] };

/** What a host serves at `/graphql/<name>` and `/graphql`, read over HTTP. */
export type ServedEndpoints = {
  /** Each subgraph's schema, as introspection at `/graphql/<name>` shows it. */
  subgraphs: Map<string, GraphQLSchema>;
  /** The composed schema, as introspection at `/graphql` shows it. */
  supergraph: GraphQLSchema;
  /**
   * Each subgraph's bound resolvers: `Type.field` for a resolve,
   * `Type.field.subscribe` for a subscribe, and `Scalar.serialize`,
   * `Scalar.parseValue` or `Scalar.parseLiteral` for each of a scalar's own.
   */
  resolvers: Record<string, string[]>;
};

/** What a GraphQLManager serves, and where it mounts and routes it. */
export type ServedSchemas = ServedEndpoints & {
  mounts: { graphql: string[]; sse: string[] };
  /**
   * The subgraph paths the graphql-ws router dispatches to. The server's
   * WebSocket listener path is set outside the manager.
   */
  websocketRoutes: string[];
};

export type ServedSchemaHost = Awaited<
  ReturnType<typeof createServedSchemaHost>
>;

/**
 * A real GraphQLManager with every core subgraph on, building its schemas for
 * the drive and document-model document models and serving them through the
 * real Apollo gateway adapter. The HTTP and WebSocket servers, the reactor
 * clients and the other services are stubs, which introspection never calls.
 */
export async function createServedSchemaHost() {
  const logger = makeHarnessLogger();
  const readClient = makeMockReactorClient({
    getDocumentModelModules: vi.fn().mockResolvedValue({
      results: [driveDocumentModelModule, documentModelDocumentModelModule],
    }),
  }) as unknown as IReactorReadClient;
  const harness = makeHarness({
    logger,
    enableDocumentModelSubgraphs: true,
    inspection: { admin: {} } as unknown as IReactorInspectionSource,
    clients: { read: readClient, write: {} as IReactorWriteClient },
  });
  const recorder = recordServedSchemas();
  const apollo = new ApolloGatewayAdapter(logger);
  const gateway: IGatewayAdapter<Context> = harness.gatewayAdapter;
  vi.spyOn(gateway, "createHandler").mockImplementation((schema, context) =>
    apollo.createHandler(schema, context),
  );
  // Apollo's drain plugin attaches listeners to a real http.Server.
  const server = createServer();
  vi.spyOn(gateway, "createSupergraphHandler").mockImplementation(
    (subgraphs, _server, context) =>
      apollo.createSupergraphHandler(subgraphs, server, context),
  );
  vi.spyOn(gateway, "updateSupergraph").mockImplementation(() =>
    apollo.updateSupergraph(),
  );
  vi.spyOn(gateway, "stop").mockImplementation(() => apollo.stop());

  const websocket = new Set<string>();
  const spies = [
    vi
      .spyOn(SubgraphWsRouter.prototype, "attach")
      .mockImplementation(() => undefined),
    vi.spyOn(SubgraphWsRouter.prototype, "set").mockImplementation((path) => {
      websocket.add(path);
    }),
    vi
      .spyOn(SubgraphWsRouter.prototype, "delete")
      .mockImplementation((path) => {
        websocket.delete(path);
      }),
  ];

  const { manager, mounts, handles, disposed } = harness;
  const close = async () => {
    try {
      await manager.shutdown();
    } finally {
      for (const spy of spies) spy.mockRestore();
      recorder.restore();
    }
  };

  try {
    await manager.init(
      coreSubgraphClasses({
        inspection: true,
        inspectionAdmin: true,
        documentPermissions: true,
      }),
    );
  } catch (error) {
    await close();
    throw error;
  }

  const mounted = (request: Request) => {
    const path = new URL(request.url).pathname;
    const handler = mounts.get(path);
    if (!handler) throw new Error(`Nothing is mounted at ${path}`);
    return handler(request);
  };

  return {
    close,
    async serve(): Promise<ServedSchemas> {
      await manager.updateRouter();
      const paths = [...mounts.keys()]
        .filter((path) => !disposed.includes(handles.get(path)!))
        .sort();
      const graphql = paths.filter(
        (path) =>
          path === "/graphql" ||
          (path.startsWith("/graphql/") && !path.endsWith("/stream")),
      );
      return {
        ...(await recorder.read(
          mounted,
          "http://localhost:4001",
          graphql
            .filter((path) => path !== "/graphql")
            .map((path) => path.slice("/graphql/".length)),
        )),
        mounts: {
          graphql,
          sse: paths.filter((path) => path.endsWith("/stream")),
        },
        websocketRoutes: [...websocket]
          .filter((path) => paths.includes(path))
          .sort(),
      };
    },
  };
}

/**
 * Records the executable schema behind each path an Apollo gateway adapter in
 * this process answers, so `read` can introspect a host's endpoints and check
 * each against what it executes.
 */
export function recordServedSchemas() {
  const answered = new Map<string, Executable>();
  const createHandler = ApolloGatewayAdapter.prototype.createHandler;
  const spy = vi
    .spyOn(ApolloGatewayAdapter.prototype, "createHandler")
    .mockImplementation(async function (
      this: ApolloGatewayAdapter,
      schema,
      context,
    ) {
      // Apollo Server wraps every field resolver, so read them before it does.
      const built = { schema, resolvers: boundCoordinates(schema) };
      const handler = await createHandler.call(this, schema, context);
      return (request: Request) => {
        answered.set(new URL(request.url).pathname, built);
        return handler(request);
      };
    });

  async function read(
    fetch: (request: Request) => Promise<Response>,
    origin: string,
    names: string[],
  ): Promise<ServedEndpoints> {
    const subgraphs = new Map<string, GraphQLSchema>();
    const resolvers: Record<string, string[]> = {};
    for (const name of names) {
      const path = `/graphql/${name}`;
      const schema = await introspect(fetch, origin, path);
      const built = answered.get(path);
      if (!built) throw new Error(`No executable schema was built for ${path}`);
      expect(Object.fromEntries(definitionsOf(built.schema)), path).toEqual(
        Object.fromEntries(definitionsOf(schema)),
      );
      subgraphs.set(name, schema);
      resolvers[name] = built.resolvers;
    }
    return {
      subgraphs,
      supergraph: await introspect(fetch, origin, "/graphql"),
      resolvers,
    };
  }

  return { read, restore: () => spy.mockRestore() };
}

async function introspect(
  fetch: (request: Request) => Promise<Response>,
  origin: string,
  path: string,
): Promise<GraphQLSchema> {
  const response = await fetch(
    new Request(`${origin}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: getIntrospectionQuery({
          descriptions: true,
          specifiedByUrl: true,
          directiveIsRepeatable: true,
          schemaDescription: true,
          inputValueDeprecation: true,
          // The gateway's /graphql has no `__Type.isOneOf` to ask for.
          oneOf: path !== "/graphql",
        }),
      }),
    }),
  );
  const result = await response.json();
  expect(result.errors, path).toBeUndefined();
  expect(response.status, path).toBe(200);
  return buildClientSchema(result.data);
}

// An unbound scalar shares graphql-js's default serialize and parseValue, so
// any other function is a binding. Its default parseLiteral is a fresh closure
// per scalar, told apart only by source: another scalar's default closure,
// which calls that scalar's parseValue, would pass for unbound.
const UNBOUND_SCALAR = new GraphQLScalarType({ name: "Unbound" });

function boundCodec(type: GraphQLScalarType): string[] {
  return [
    ...(type.serialize !== UNBOUND_SCALAR.serialize ? ["serialize"] : []),
    ...(type.parseValue !== UNBOUND_SCALAR.parseValue ? ["parseValue"] : []),
    ...(String(type.parseLiteral) !== String(UNBOUND_SCALAR.parseLiteral)
      ? ["parseLiteral"]
      : []),
  ];
}

function boundCoordinates(schema: GraphQLSchema): string[] {
  return Object.values(schema.getTypeMap())
    .flatMap((type) => {
      if (type.name.startsWith("__")) return [];
      if (isObjectType(type)) {
        return Object.values(type.getFields())
          .flatMap((field) => [
            ...(field.resolve ? [`${type.name}.${field.name}`] : []),
            ...(field.subscribe
              ? [`${type.name}.${field.name}.subscribe`]
              : []),
          ])
          .concat(type.isTypeOf ? [`${type.name}.__isTypeOf`] : []);
      }
      if (isScalarType(type) && !isSpecifiedScalarType(type)) {
        return boundCodec(type).map((step) => `${type.name}.${step}`);
      }
      if (isAbstractType(type) && type.resolveType) {
        return [`${type.name}.__resolveType`];
      }
      return [];
    })
    .sort();
}

function definitionsOf(schema: GraphQLSchema): Definitions {
  return definitionsOfSdl(printSchema(schema));
}

function definitionsOfSdl(sdl: string): Definitions {
  return new Map(
    parse(sdl).definitions.map((node) => [keyOf(node), print(node)]),
  );
}

function keyOf(node: DefinitionNode): string {
  if (node.kind === Kind.DIRECTIVE_DEFINITION) return `@${node.name.value}`;
  return "name" in node && node.name ? node.name.value : node.kind;
}

/**
 * Expect `schema` to be the SDL golden at `file`, rewritten from it under
 * {@link UPDATE_GOLDENS} with its definitions sorted by name. Compared
 * definition by definition, so the file's formatting and definition order do
 * not matter and a failure names the definitions that changed.
 */
export async function expectSchemaGolden(schema: GraphQLSchema, file: string) {
  const definitions = definitionsOf(schema);
  const sorted = [...definitions].sort(([a], [b]) => (a < b ? -1 : 1));
  const sdl = await golden(
    file,
    sorted.map(([, printed]) => printed).join("\n\n") + "\n",
  );
  expect(Object.fromEntries(definitions), file).toEqual(
    Object.fromEntries(definitionsOfSdl(sdl)),
  );
}

/** The JSON golden at `file`, rewritten from `value` under {@link UPDATE_GOLDENS}. */
export async function jsonGolden(
  file: string,
  value: unknown,
): Promise<unknown> {
  return JSON.parse(await golden(file, JSON.stringify(value, null, 2) + "\n"));
}

async function golden(file: string, actual: string): Promise<string> {
  if (!UPDATE_GOLDENS) {
    try {
      return await readFile(file, "utf8");
    } catch (error) {
      throw new Error(
        `Cannot read the golden ${file}; run with UPDATE_GOLDENS=1 to write it`,
        { cause: error },
      );
    }
  }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, actual);
  return actual;
}
