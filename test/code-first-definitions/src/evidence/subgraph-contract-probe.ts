import type { SubgraphDefinitionV1 } from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import { ph } from "document-model";
import {
  parse,
  type DocumentNode,
  type GraphQLResolveInfo,
  type GraphQLSchema,
} from "graphql";
import { BaseSubgraph } from "../../../../packages/reactor-api/src/graphql/base-subgraph.js";
import { defineSubgraph } from "../../../../packages/reactor-api/src/graphql/define-subgraph.js";
import { composeSubgraphDefinitions } from "../../../../packages/reactor-api/src/graphql/gateway/adapter-gateway-apollo.js";
import { GraphQLManager } from "../../../../packages/reactor-api/src/graphql/graphql-manager.js";
import type { SubgraphClass } from "../../../../packages/reactor-api/src/graphql/types.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../../../../packages/reactor-api/src/services/authorization.service.js";
import { buildSubgraphSchemaModule } from "../../../../packages/reactor-api/src/utils/create-schema.js";
import {
  canonicalJson as canonical,
  compareCodeUnits,
  firstDifference,
  sha256,
} from "./utils.js";

/** Runs in a fresh process without the monorepo's source export condition. */
export const B7_CASES = [
  { caseId: "typed-query-field", scenario: "typed-query-field" },
  { caseId: "compat-manual-query", scenario: "compat-manual-query" },
  {
    caseId: "typed-subscription-true",
    scenario: "typed-subscription-true",
  },
  {
    caseId: "compat-subscription-undefined",
    scenario: "compat-subscription-undefined",
  },
  {
    caseId: "compat-subscription-false",
    scenario: "compat-subscription-false",
  },
  { caseId: "duplicate-first-wins", scenario: "duplicate-first-wins" },
  {
    caseId: "composition-conflict-routes-kept",
    scenario: "composition-conflict-routes-kept",
  },
] as const;

export type B7CaseId = (typeof B7_CASES)[number]["caseId"];
type B7Scenario = (typeof B7_CASES)[number]["scenario"];

type Trace = {
  readonly resolverCalls: unknown[];
  readonly events: string[];
  sourceAllocations: number;
};

/** Shape of a resolver reached through a registered instance's resolver map,
 * which the host types as plain data. */
type FieldResolver = (
  parent: unknown,
  args: Record<string, unknown>,
  request: typeof requestContext,
  info: GraphQLResolveInfo,
) => unknown;

type SubscriptionResolver = {
  readonly subscribe: (
    parent: unknown,
    args: Record<string, unknown>,
    request: typeof requestContext,
    info: GraphQLResolveInfo,
  ) => AsyncIterator<unknown> | Promise<AsyncIterator<unknown>>;
  readonly resolve?: FieldResolver;
};

type ScenarioClasses = {
  readonly classes: readonly SubgraphClass[];
  readonly definitions: readonly SubgraphDefinitionV1[];
  readonly exercise: (
    instances: ReadonlyMap<string, InstanceType<SubgraphClass>>,
  ) => Promise<unknown>;
  readonly trace: Trace;
  readonly replacementOutcome: string;
};

type HostOutcome = {
  readonly authorAstDigest: `sha256:${string}`;
  readonly augmentedAstDigest: `sha256:${string}`;
  readonly resolverCallDigest: `sha256:${string}`;
  readonly supergraphDigest: `sha256:${string}`;
  readonly apolloDiagnostics: readonly string[];
  readonly route: string;
  readonly compositionName: string;
  readonly transportFlags: {
    readonly hasSubscriptions: readonly (boolean | "undefined")[];
    readonly webSocketAllocations: number;
    readonly sseRoutes: readonly string[];
  };
  readonly allocationCount: number;
  readonly cleanupObservations: readonly string[];
  readonly deliveryDigest: `sha256:${string}`;
  readonly replacementOutcome: string;
};

export type SubgraphContractCaseResult = HostOutcome & {
  readonly caseId: B7CaseId;
  readonly firstMismatch: string | null;
};

const silentLogger: ILogger = {
  level: "error",
  verbose() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
  errorHandler() {},
  child: () => silentLogger,
};

function stripLocations(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stripLocations);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, item]) => key !== "loc" && item !== undefined)
      .map(([key, item]) => [key, stripLocations(item)]),
  );
}

function makeTrace(): Trace {
  return { resolverCalls: [], events: [], sourceAllocations: 0 };
}

function resolverInfo(fieldName: string, returnType: string) {
  return {
    fieldName,
    returnType: { toString: () => returnType },
  } as GraphQLResolveInfo;
}

const requestContext = Object.freeze({
  headers: { authorization: "Bearer fixture" },
  db: { fixture: true },
});

function recordCall(
  trace: Trace,
  call: {
    readonly parent: unknown;
    readonly args: unknown;
    readonly request: unknown;
    readonly info: GraphQLResolveInfo;
    readonly service: string;
    readonly subgraphName: string;
  },
) {
  trace.resolverCalls.push({
    parent: call.parent,
    args: call.args,
    request: call.request,
    fieldName: call.info.fieldName,
    returnType: call.info.returnType.toString(),
    service: call.service,
    subgraphName: call.subgraphName,
  });
}

function queryScenario(mode: "legacy" | "code-first"): ScenarioClasses {
  const trace = makeTrace();
  const schema = parse(`
    type Greeting {
      value: String!
      decorated(suffix: String!): String!
    }
    type Query {
      greeting(name: String!): Greeting!
    }
  `);

  if (mode === "legacy") {
    class LegacyQuerySubgraph extends BaseSubgraph {
      name = "typed-query";
      hasSubscriptions = false;
      typeDefs = schema;
      resolvers = {
        Query: {
          greeting: (
            parent: unknown,
            args: { name: string },
            request: typeof requestContext,
            info: GraphQLResolveInfo,
          ) => {
            recordCall(trace, {
              parent,
              args,
              request,
              info,
              service: "query-service",
              subgraphName: this.name,
            });
            return { value: `hello ${args.name}` };
          },
        },
        Greeting: {
          decorated: (
            parent: { value: string },
            args: { suffix: string },
            request: typeof requestContext,
            info: GraphQLResolveInfo,
          ) => {
            recordCall(trace, {
              parent,
              args,
              request,
              info,
              service: "query-service",
              subgraphName: this.name,
            });
            return `${parent.value}${args.suffix}`;
          },
        },
      };
    }
    return {
      classes: [LegacyQuerySubgraph],
      definitions: [],
      trace,
      replacementOutcome: "not-applicable",
      exercise: exerciseQuery,
    };
  }

  const Greeting = ph.object("Greeting", {
    fields: {
      value: ph.String({ required: true }),
      decorated: ph.field({
        args: { suffix: ph.String({ required: true }) },
        returns: ph.String({ required: true }),
      }),
    },
  });
  const CodeFirstQuerySubgraph = defineSubgraph({
    name: "typed-query",
    schemaKind: "typed",
    entries: (b) => [
      b.query("greeting", {
        args: { name: ph.String({ required: true }) },
        returns: ph.ref(Greeting, { required: true }),
        resolve(call) {
          recordCall(trace, {
            ...call,
            service: "query-service",
            subgraphName: call.subgraph.name,
          });
          return { value: `hello ${call.args.name}` };
        },
      }),
      b.field(Greeting.computed.decorated, {
        resolve(call) {
          recordCall(trace, {
            ...call,
            service: "query-service",
            subgraphName: call.subgraph.name,
          });
          return `${call.parent.value}${call.args.suffix}`;
        },
      }),
    ],
  });
  return {
    classes: [CodeFirstQuerySubgraph],
    definitions: [CodeFirstQuerySubgraph.definition],
    trace,
    replacementOutcome: "not-applicable",
    exercise: exerciseQuery,
  };
}

async function exerciseQuery(
  instances: ReadonlyMap<string, InstanceType<SubgraphClass>>,
) {
  const instance = instances.get("typed-query");
  if (!instance) throw new Error("typed-query was not registered");
  const rootResolver = (
    instance.resolvers.Query as Record<string, FieldResolver>
  ).greeting;
  const root = await rootResolver(
    undefined,
    { name: "Ada" },
    requestContext,
    resolverInfo("greeting", "Greeting!"),
  );
  const fieldResolver = (
    instance.resolvers.Greeting as Record<string, FieldResolver>
  ).decorated;
  const decorated = await fieldResolver(
    root,
    { suffix: "!" },
    requestContext,
    resolverInfo("decorated", "String!"),
  );
  return { root, decorated };
}

function manualScenario(mode: "legacy" | "code-first"): ScenarioClasses {
  const trace = makeTrace();
  const schema = parse("type Query { secureEcho(value: String!): String! }");
  const resolvers = (
    authorize: (value: string) => void,
    subgraphName: string,
  ) => ({
    Query: {
      secureEcho(
        parent: unknown,
        args: { value: string },
        request: typeof requestContext,
        info: GraphQLResolveInfo,
      ) {
        trace.events.push("resolver:start");
        recordCall(trace, {
          parent,
          args,
          request,
          info,
          service: "manual-service",
          subgraphName,
        });
        authorize(args.value);
        trace.events.push("resolver:return");
        return args.value.toUpperCase();
      },
    },
  });
  const authorize = () => trace.events.push("authorization");

  if (mode === "legacy") {
    class LegacyManualSubgraph extends BaseSubgraph {
      name = "manual-query";
      hasSubscriptions = false;
      typeDefs = schema;
      resolvers = resolvers(authorize, this.name);
    }
    return {
      classes: [LegacyManualSubgraph],
      definitions: [],
      trace,
      replacementOutcome: "not-applicable",
      exercise: exerciseManual,
    };
  }

  const CodeFirstManualSubgraph = defineSubgraph({
    name: "manual-query",
    schemaKind: "graphql-ast-compat",
    compatibility: {
      kind: "graphql-ast-v1",
      typeDefs: schema,
      getResolvers: ({ subgraph }) => resolvers(authorize, subgraph.name),
      hasSubscriptions: false,
      preserveDefinitionOrder: true,
    },
  });
  return {
    classes: [CodeFirstManualSubgraph],
    definitions: [CodeFirstManualSubgraph.definition],
    trace,
    replacementOutcome: "not-applicable",
    exercise: exerciseManual,
  };
}

function exerciseManual(
  instances: ReadonlyMap<string, InstanceType<SubgraphClass>>,
): Promise<unknown> {
  const instance = instances.get("manual-query");
  if (!instance) throw new Error("manual-query was not registered");
  const resolver = (instance.resolvers.Query as Record<string, FieldResolver>)
    .secureEcho;
  return Promise.resolve(
    resolver(
      undefined,
      { value: "ordered" },
      requestContext,
      resolverInfo("secureEcho", "String!"),
    ),
  );
}

function subscriptionScenario(
  mode: "legacy" | "code-first",
  flag: true | false | undefined,
  typed: boolean,
): ScenarioClasses {
  const trace = makeTrace();
  const name = typed
    ? "typed-subscription"
    : flag === false
      ? "compat-subscription-false"
      : "compat-subscription-undefined";
  const schema = parse(`
    type Query { health: Boolean! }
    type Subscription { ticks(limit: Int!): Int! }
  `);

  // The subscription contract needs an async iterator, and this fixture source
  // has nothing to await.
  // eslint-disable-next-line @typescript-eslint/require-await
  const source = async function* (limit: number) {
    trace.sourceAllocations += 1;
    trace.events.push("allocated");
    try {
      for (let value = 1; value <= limit; value += 1) {
        trace.events.push(`deliver:${value}`);
        yield value;
      }
    } finally {
      trace.events.push("cleanup");
    }
  };
  const resolverMap = (subgraphName: string) => ({
    Query: { health: () => true },
    Subscription: {
      ticks: {
        subscribe: (
          parent: unknown,
          args: { limit: number },
          request: typeof requestContext,
          info: GraphQLResolveInfo,
        ) => {
          recordCall(trace, {
            parent,
            args,
            request,
            info,
            service: "subscription-service",
            subgraphName,
          });
          return source(args.limit);
        },
        resolve: (value: number) => value,
      },
    },
  });

  if (mode === "legacy") {
    class LegacySubscriptionSubgraph extends BaseSubgraph {
      name = name;
      hasSubscriptions = flag;
      typeDefs = schema;
      resolvers = resolverMap(this.name);
    }
    return {
      classes: [LegacySubscriptionSubgraph],
      definitions: [],
      trace,
      replacementOutcome: "not-applicable",
      exercise:
        flag === true ? exerciseSubscription(name) : () => Promise.resolve([]),
    };
  }

  if (typed) {
    const CodeFirstTypedSubscription = defineSubgraph({
      name,
      schemaKind: "typed",
      entries: (b) => [
        b.query("health", {
          returns: ph.Boolean({ required: true }),
          resolve: () => true,
        }),
        b.subscription("ticks", {
          args: { limit: ph.Int({ required: true }) },
          returns: ph.Int({ required: true }),
          subscribe(call) {
            recordCall(trace, {
              ...call,
              service: "subscription-service",
              subgraphName: call.subgraph.name,
            });
            return source(call.args.limit);
          },
          resolve: ({ parent }) => parent,
        }),
      ],
    });
    return {
      classes: [CodeFirstTypedSubscription],
      definitions: [CodeFirstTypedSubscription.definition],
      trace,
      replacementOutcome: "not-applicable",
      exercise: exerciseSubscription(name),
    };
  }

  const CodeFirstCompatSubscription = defineSubgraph({
    name,
    schemaKind: "graphql-ast-compat",
    compatibility: {
      kind: "graphql-ast-v1",
      typeDefs: schema,
      getResolvers: ({ subgraph }) => resolverMap(subgraph.name),
      hasSubscriptions: flag,
      preserveDefinitionOrder: true,
    },
  });
  return {
    classes: [CodeFirstCompatSubscription],
    definitions: [CodeFirstCompatSubscription.definition],
    trace,
    replacementOutcome: "not-applicable",
    exercise:
      flag === true ? exerciseSubscription(name) : () => Promise.resolve([]),
  };
}

function exerciseSubscription(name: string) {
  return async (
    instances: ReadonlyMap<string, InstanceType<SubgraphClass>>,
  ) => {
    const instance = instances.get(name);
    if (!instance) throw new Error(`${name} was not registered`);
    const subscription = (
      instance.resolvers.Subscription as Record<string, SubscriptionResolver>
    ).ticks;
    const iterator = await subscription.subscribe(
      undefined,
      { limit: 3 },
      requestContext,
      resolverInfo("ticks", "Int!"),
    );
    const delivered: unknown[] = [];
    delivered.push((await iterator.next()).value);
    delivered.push((await iterator.next()).value);
    await iterator.return?.();
    return delivered;
  };
}

function duplicateScenario(mode: "legacy" | "code-first"): ScenarioClasses {
  const trace = makeTrace();
  const schema = parse("type Query { generation: String! }");
  const legacy = (value: string) =>
    class GenerationSubgraph extends BaseSubgraph {
      name = "duplicate-generation";
      hasSubscriptions = false;
      typeDefs = schema;
      resolvers = { Query: { generation: () => value } };
    };
  const codeFirst = (value: string) =>
    defineSubgraph({
      name: "duplicate-generation",
      schemaKind: "typed",
      entries: (b) => [
        b.query("generation", {
          returns: ph.String({ required: true }),
          resolve: () => value,
        }),
      ],
    });
  const classes =
    mode === "legacy"
      ? [legacy("first"), legacy("second")]
      : [codeFirst("first"), codeFirst("second")];
  return {
    classes,
    definitions:
      mode === "legacy"
        ? []
        : (
            classes as readonly (SubgraphClass & {
              readonly definition: SubgraphDefinitionV1;
            })[]
          ).map((item) => item.definition),
    trace,
    replacementOutcome: "kept-first",
    exercise(instances) {
      const instance = instances.get("duplicate-generation");
      if (!instance) throw new Error("duplicate-generation was not registered");
      const resolver = (
        instance.resolvers.Query as Record<string, FieldResolver>
      ).generation;
      return Promise.resolve(
        resolver(
          undefined,
          {},
          requestContext,
          resolverInfo("generation", "String!"),
        ),
      );
    },
  };
}

function conflictScenario(mode: "legacy" | "code-first"): ScenarioClasses {
  const trace = makeTrace();
  const legacy = (name: string, scalar: "String" | "Int") =>
    class ConflictSubgraph extends BaseSubgraph {
      name = name;
      hasSubscriptions = false;
      typeDefs = parse(`type Query { shared: ${scalar}! }`);
      resolvers = {
        Query: { shared: () => (scalar === "String" ? name : 2) },
      };
    };
  const codeFirst = (name: string, scalar: "String" | "Int") =>
    defineSubgraph({
      name,
      schemaKind: "typed",
      entries: (b) => [
        b.query("shared", {
          returns:
            scalar === "String"
              ? ph.String({ required: true })
              : ph.Int({ required: true }),
          resolve: () => (scalar === "String" ? name : 2),
        }),
      ],
    });
  const classes =
    mode === "legacy"
      ? [legacy("conflict-a", "String"), legacy("conflict-b", "Int")]
      : [codeFirst("conflict-a", "String"), codeFirst("conflict-b", "Int")];
  return {
    classes,
    definitions:
      mode === "legacy"
        ? []
        : (
            classes as readonly (SubgraphClass & {
              readonly definition: SubgraphDefinitionV1;
            })[]
          ).map((item) => item.definition),
    trace,
    replacementOutcome: "composition-failed-routes-kept",
    exercise: () => Promise.resolve([]),
  };
}

function scenario(
  name: B7Scenario,
  mode: "legacy" | "code-first",
): ScenarioClasses {
  switch (name) {
    case "typed-query-field":
      return queryScenario(mode);
    case "compat-manual-query":
      return manualScenario(mode);
    case "typed-subscription-true":
      return subscriptionScenario(mode, true, true);
    case "compat-subscription-undefined":
      return subscriptionScenario(mode, undefined, false);
    case "compat-subscription-false":
      return subscriptionScenario(mode, false, false);
    case "duplicate-first-wins":
      return duplicateScenario(mode);
    case "composition-conflict-routes-kept":
      return conflictScenario(mode);
  }
}

async function runHost(candidate: ScenarioClasses): Promise<HostOutcome> {
  const mounted: string[] = [];
  let webSocketAllocations = 0;
  const diagnostics: string[] = [];
  const httpAdapter = {
    setupMiddleware() {},
    mount(path: string) {
      mounted.push(path);
    },
    getRoute() {},
    mountRawMiddleware() {},
    mountNodeRoute() {},
    setupSentryErrorHandler() {},
    listen() {
      return Promise.resolve({});
    },
    handle: {},
  };
  const gatewayHandler = () => Promise.resolve(Response.json({ data: {} }));
  const gatewayAdapter = {
    async start() {},
    createHandler(_schema: GraphQLSchema) {
      return Promise.resolve(gatewayHandler);
    },
    createSupergraphHandler() {
      return Promise.resolve(gatewayHandler);
    },
    async updateSupergraph() {},
    attachWebSocket() {
      webSocketAllocations += 1;
      return { dispose() {} };
    },
    async stop() {},
  };
  const reactorClient = {
    getDocumentModelModules() {
      return Promise.resolve({ results: [] });
    },
  };
  const wsServer = {
    setMaxListeners() {},
    close(callback?: () => void) {
      callback?.();
    },
  };
  const logger: ILogger = {
    ...silentLogger,
    error(message, ...args) {
      diagnostics.push(
        [String(message), ...args.map(String)]
          .join(" ")
          .replaceAll(/\s+/g, " "),
      );
    },
    child: () => logger,
  };
  const manager = new GraphQLManager(
    "/api",
    {} as never,
    wsServer as never,
    reactorClient as never,
    {} as never,
    {} as never,
    {} as never,
    logger,
    httpAdapter as never,
    gatewayAdapter as never,
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
  const registered: InstanceType<SubgraphClass>[] = [];
  for (const subgraph of candidate.classes) {
    const instance = await manager.registerSubgraph(subgraph, "graphql");
    registered.push(instance as InstanceType<SubgraphClass>);
  }
  await manager.updateRouter(true);

  const instances = new Map<string, InstanceType<SubgraphClass>>();
  for (const instance of registered) {
    instances.set(instance.name, instance);
  }
  const delivery = await candidate.exercise(instances);

  const authorDocuments: DocumentNode[] = [];
  const augmentedDocuments: DocumentNode[] = [];
  const subgraphDefinitions: {
    name: string;
    typeDefs: DocumentNode;
    url: string;
  }[] = [];
  const routes: string[] = [];
  const compositionNames: string[] = [];
  const subscriptionFlags: (boolean | "undefined")[] = [];
  for (const instance of instances.values()) {
    const route = `/api/graphql/${instance.name}`;
    const compositionName = route.replace("/", ":");
    const module = buildSubgraphSchemaModule(
      [],
      instance.resolvers,
      instance.typeDefs,
    );
    authorDocuments.push(instance.typeDefs);
    augmentedDocuments.push(module.typeDefs);
    routes.push(route);
    compositionNames.push(compositionName);
    const hasSubscriptions = (
      instance as typeof instance & { readonly hasSubscriptions?: boolean }
    ).hasSubscriptions;
    subscriptionFlags.push(
      hasSubscriptions === undefined ? "undefined" : hasSubscriptions,
    );
    subgraphDefinitions.push({
      name: compositionName,
      typeDefs: module.typeDefs,
      url: `http://localhost:4001${route}`,
    });
  }

  let supergraph = "";
  try {
    supergraph = (await composeSubgraphDefinitions(subgraphDefinitions, logger))
      .supergraphSdl;
  } catch (error) {
    diagnostics.push(
      `composition:${error instanceof Error ? error.message : String(error)}`.replaceAll(
        /\s+/g,
        " ",
      ),
    );
  }

  const sseRoutes = mounted
    .filter((path) => path.endsWith("/stream"))
    .sort(compareCodeUnits);
  const cleanupObservations = candidate.trace.events.filter(
    (event) => event === "cleanup",
  );
  return {
    authorAstDigest: sha256(
      canonical(authorDocuments.map((document) => stripLocations(document))),
    ),
    augmentedAstDigest: sha256(
      canonical(augmentedDocuments.map((document) => stripLocations(document))),
    ),
    resolverCallDigest: sha256(canonical(candidate.trace.resolverCalls)),
    supergraphDigest: sha256(supergraph),
    apolloDiagnostics: diagnostics,
    route: routes.join(","),
    compositionName: compositionNames.join(","),
    transportFlags: {
      hasSubscriptions: subscriptionFlags,
      webSocketAllocations,
      sseRoutes,
    },
    allocationCount: candidate.trace.sourceAllocations,
    cleanupObservations,
    deliveryDigest: sha256(
      canonical({ delivery, events: candidate.trace.events }),
    ),
    replacementOutcome: candidate.replacementOutcome,
  };
}

export async function runSubgraphContractCases(): Promise<{
  readonly cases: readonly SubgraphContractCaseResult[];
  readonly definitions: readonly SubgraphDefinitionV1[];
}> {
  const cases: SubgraphContractCaseResult[] = [];
  const definitions: SubgraphDefinitionV1[] = [];
  for (const fixture of B7_CASES) {
    const legacy = scenario(fixture.scenario, "legacy");
    const codeFirst = scenario(fixture.scenario, "code-first");
    definitions.push(...codeFirst.definitions);
    const [legacyOutcome, codeFirstOutcome] = await Promise.all([
      runHost(legacy),
      runHost(codeFirst),
    ]);
    cases.push({
      caseId: fixture.caseId,
      ...codeFirstOutcome,
      firstMismatch: firstDifference(legacyOutcome, codeFirstOutcome),
    });
  }
  return { cases, definitions };
}
