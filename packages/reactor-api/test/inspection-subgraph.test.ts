import type { InMemoryQueue } from "@powerhousedao/reactor";
import {
  ChannelScheme,
  ChannelErrorSource,
  DriveCollectionId,
  EventBus,
  GqlResponseChannelFactory,
  INSPECTION_ORDINAL_FIELDS,
  INSPECTION_ROOT_FIELDS,
  INSPECTION_WIRE_FIELDS,
  INSPECTOR_OPS,
  ReactorBuilder,
  ReactorClientBuilder,
  SYNC_INSPECTION_OPS,
  SyncBuilder,
  type DeadLetterPage,
  type InProcessReactorClientModule,
  type ValidationResult,
} from "@powerhousedao/reactor";
import {
  driveDocumentModelModule,
  setDriveName,
} from "@powerhousedao/shared/document-drive";
import { ConsoleLogger } from "document-model";
import type * as GraphQL from "graphql";
import type { GraphQLSchema } from "graphql";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";
import {
  createReactorInspectionSource,
  InspectionSubgraph,
  type IReactorInspectionSource,
} from "../src/graphql/inspection/index.js";
import type { Context, SubgraphArgs } from "../src/graphql/types.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
  type IAuthorizationService,
} from "../src/services/authorization.service.js";
import { initializeAndStartAPI } from "../src/server.js";
import { createSchema } from "../src/utils/create-schema.js";
import {
  buildReadGateReactor,
  contextFor,
  createFixture,
  OUTSIDER,
  police,
  READER,
} from "./utils/read-gate-fixture.js";

// The CommonJS graphql realm, the one @apollo/subgraph builds schemas in.
const { graphql, isObjectType, getNamedType, isNonNullType } = createRequire(
  import.meta.url,
)("graphql") as typeof GraphQL;

const OPERATOR = "0xoperator";

let module: InProcessReactorClientModule | undefined;

afterEach(() => {
  module?.reactor.kill();
  module = undefined;
});

function openHost(admins: string[] = [OPERATOR]): IAuthorizationService {
  return createAuthorizationService({
    admins,
    defaultProtection: false,
    policy: AuthorizationPolicy.OPEN,
  });
}

function buildSchema(
  client: InProcessReactorClientModule,
  authorizationService: IAuthorizationService,
  source?: IReactorInspectionSource,
): { schema: GraphQLSchema; source: IReactorInspectionSource } {
  const reactorModule = client.reactorModule;
  if (!reactorModule) throw new Error("reactor built without a module");
  const inspection = source ?? createReactorInspectionSource(reactorModule);
  const subgraph = new InspectionSubgraph({
    reactorClient: client.client,
    syncManager: reactorModule.syncModule?.syncManager,
    authorizationService,
    inspection,
  } as unknown as SubgraphArgs);
  return {
    schema: createSchema([], subgraph.resolvers, subgraph.typeDefs),
    source: inspection,
  };
}

async function run(
  schema: GraphQLSchema,
  source: string,
  ctx: Context,
  variableValues?: Record<string, unknown>,
) {
  return graphql({ schema, source, contextValue: ctx, variableValues });
}

function codeOf(result: Awaited<ReturnType<typeof run>>): unknown {
  return result.errors?.[0]?.extensions.code;
}

describe("inspection subgraph: facts", () => {
  it("serves info to anyone, and access only to the host's admins", async () => {
    module = await buildReadGateReactor();
    const { schema } = buildSchema(module, openHost());
    const query = `{ inspection { info {
      storage { engine persistence durable selfHeal }
      workflows syncChannels access { admin sql } } } }`;

    const anonymous = await run(schema, query, contextFor());
    expect(anonymous.errors).toBeUndefined();
    expect(anonymous.data?.inspection).toMatchObject({
      info: {
        storage: { engine: "pglite", durable: false, selfHeal: false },
        workflows: false,
        access: null,
      },
    });

    const outsider = await run(schema, query, contextFor(OUTSIDER));
    expect(
      (outsider.data?.inspection as { info: { access: unknown } }).info.access,
    ).toBeNull();

    const operator = await run(schema, query, contextFor(OPERATOR));
    expect(
      (operator.data?.inspection as { info: { access: unknown } }).info.access,
    ).toEqual({ admin: false, sql: false });
  });

  it("late-binds workflows through the facts sink", async () => {
    module = await buildReadGateReactor();
    const { schema, source } = buildSchema(module, openHost());
    source.facts.setWorkflows(true);
    const result = await run(
      schema,
      `{ inspection { info { workflows } } }`,
      contextFor(),
    );
    expect(result.data?.inspection).toEqual({ info: { workflows: true } });
  });

  it("reports untracked storage health as tracked: false", async () => {
    module = await buildReadGateReactor();
    const { schema } = buildSchema(module, openHost());
    const result = await run(
      schema,
      `{ inspection { storageHealth { tracked healthy } } }`,
      contextFor(OPERATOR),
    );
    expect(result.data?.inspection).toEqual({
      storageHealth: { tracked: false, healthy: false },
    });
  });
});

describe("inspection subgraph: dead-letter cursor", () => {
  async function withRemote(): Promise<GraphQLSchema> {
    module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder()
          .withDocumentModelSources([driveDocumentModelModule])
          .withSync(
            new SyncBuilder().withChannelFactory(
              new GqlResponseChannelFactory(new ConsoleLogger(["inspection"])),
            ),
          ),
      )
      .buildModule();
    const sync = module.reactorModule!.syncModule!;
    await sync.syncManager.add("r", DriveCollectionId.forDrive("d"), {
      type: "gql",
      parameters: {},
    });
    for (let i = 0; i < 3; i++) {
      await sync.deadLetterStorage.add({
        id: `dl-${i}`,
        jobId: `job-${i}`,
        jobDependencies: [],
        remoteName: "r",
        documentId: "d",
        scopes: ["global"],
        branch: "main",
        operations: [],
        errorSource: ChannelErrorSource.Inbox,
        errorMessage: "failed",
        errorType: "LIBRARY_ERROR",
      });
    }
    return buildSchema(module, openHost()).schema;
  }

  const query = `query ($cursor: String) { inspection {
    deadLetters(remoteName: "r", cursor: $cursor, limit: 2) {
      results { id } nextCursor } } }`;

  it("reads an empty cursor as the first page", async () => {
    const schema = await withRemote();
    const result = await run(schema, query, contextFor(OPERATOR), {
      cursor: "",
    });
    expect(result.errors).toBeUndefined();
    expect(result.data?.inspection).toMatchObject({
      deadLetters: { nextCursor: "2" },
    });
  });

  it("refuses a cursor past the safe integer range as bad input", async () => {
    const schema = await withRemote();
    const result = await run(schema, query, contextFor(OPERATOR), {
      cursor: "100000000000000000000000",
    });
    expect(codeOf(result)).toBe("BAD_USER_INPUT");
    expect(result.errors?.[0]?.message).toMatch(/Invalid dead-letter cursor/);
  });
});

describe("inspection subgraph: OPEN does not make every caller an operator", () => {
  it.each([
    "queueState { isPaused }",
    "processors { processorId }",
    "catchUpStatus",
    "storageHealth { tracked }",
    "attachmentInfo { present }",
    "remotes { remoteName }",
    `deadLetters(remoteName: "r") { remoteName }`,
  ])("refuses %s to a caller who is not a listed admin", async (field) => {
    module = await buildReadGateReactor();
    const { schema } = buildSchema(module, openHost());
    for (const ctx of [contextFor(), contextFor(OUTSIDER)]) {
      const result = await run(schema, `{ inspection { ${field} } }`, ctx);
      expect(codeOf(result)).toBe("FORBIDDEN");
    }
  });

  it("serves operational reads to a listed admin", async () => {
    module = await buildReadGateReactor();
    const { schema } = buildSchema(module, openHost());
    const result = await run(
      schema,
      `{ inspection { queueState { isPaused totalPending } processors { processorId } } }`,
      contextFor(OPERATOR),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.inspection).toMatchObject({
      queueState: { isPaused: false },
    });
  });

  it("does not treat an OPEN host with no admins as granting anything", async () => {
    module = await buildReadGateReactor();
    const { schema } = buildSchema(module, openHost([]));
    const result = await run(
      schema,
      `{ inspection { info { access { admin sql } } queueState { isPaused } } }`,
      contextFor(),
    );
    expect(codeOf(result)).toBe("FORBIDDEN");
  });
});

describe("inspection subgraph: operational reads carry no document content", () => {
  const SECRET = "classified-payload-7f3a";

  type Field = (parent: unknown, args: unknown, ctx: Context) => unknown;

  function fieldsOf(
    client: InProcessReactorClientModule,
    source: IReactorInspectionSource,
  ): Record<string, Field> {
    const subgraph = new InspectionSubgraph({
      reactorClient: client.client,
      syncManager: client.reactorModule?.syncModule?.syncManager ?? {
        list: () => [],
      },
      authorizationService: openHost(),
      inspection: source,
    } as unknown as SubgraphArgs);
    return (subgraph.resolvers as { ReactorInspection: Record<string, Field> })
      .ReactorInspection;
  }

  // The operator is a listed admin, but the policy grants it nothing.
  async function queuedWriteToPolicedDrive(): Promise<string> {
    module = await buildReadGateReactor();
    const id = await createFixture(module.client, "ins-queued", {
      source: driveDocumentModelModule,
    });
    await police(module.client, id);
    const reactorModule = module.reactorModule!;
    (reactorModule.queue as InMemoryQueue).pause();
    await reactorModule.reactor.execute(id, "main", [
      setDriveName({ name: SECRET }),
    ]);
    return id;
  }

  function deadLetterSource(id: string): IReactorInspectionSource {
    const real = createReactorInspectionSource(module!.reactorModule!);
    const record = {
      id: "dl-1",
      jobId: "job-1",
      jobDependencies: [],
      remoteName: "r",
      documentId: id,
      scopes: ["global"],
      branch: "main",
      operations: [
        {
          operation: {
            id: "op-1",
            index: 0,
            skip: 0,
            hash: "h",
            timestampUtcMs: "0",
            action: setDriveName({ name: SECRET }),
          },
          context: {
            documentId: id,
            documentType: "powerhouse/document-drive",
            scope: "global",
            branch: "main",
            ordinal: 1,
          },
        },
      ],
      errorSource: ChannelErrorSource.Inbox,
      errorMessage: "failed",
      errorType: "LIBRARY_ERROR",
    } as unknown as DeadLetterPage["results"][number];
    return {
      ...real,
      syncInspector: {
        inspectRemote: () => Promise.reject(new Error("unused")),
        inspectRemotes: () => Promise.resolve([]),
        listDeadLetters: (remoteName) =>
          Promise.resolve({ remoteName, results: [record] }),
      },
    };
  }

  it("serves a queued job with no action input", async () => {
    const id = await queuedWriteToPolicedDrive();
    const reactorModule = module!.reactorModule!;
    const fields = fieldsOf(
      module!,
      createReactorInspectionSource(reactorModule),
    );

    const state = (await fields.queueState(
      undefined,
      {},
      contextFor(OPERATOR),
    )) as { totalPending: number; pendingJobs: unknown[] };

    expect(state.totalPending).toBe(1);
    expect(JSON.stringify(state)).not.toContain(SECRET);
    expect(state.pendingJobs).toEqual([
      expect.objectContaining({ documentId: id, actionCount: 1 }),
    ]);
  });

  it("serves a dead letter with no operations", async () => {
    module = await buildReadGateReactor();
    const fields = fieldsOf(module, deadLetterSource("ins-dead"));

    const page = (await fields.deadLetters(
      undefined,
      { remoteName: "r" },
      contextFor(OPERATOR),
    )) as { results: unknown[] };

    expect(JSON.stringify(page)).not.toContain(SECRET);
    expect(page.results).toEqual([
      expect.objectContaining({ documentId: "ins-dead", operationCount: 1 }),
    ]);
  });

  it("has no field that reaches a job's actions or a dead letter's operations", async () => {
    const id = await queuedWriteToPolicedDrive();
    const { schema } = buildSchema(module!, openHost(), deadLetterSource(id));

    const projected = await run(
      schema,
      `{ inspection {
        queueState { pendingJobs {
          id kind documentId scope branch status actionCount operationCount retryCount } }
        deadLetters(remoteName: "r") { results {
          id jobId documentId branch scopes errorType errorMessage operationCount } } } }`,
      contextFor(OPERATOR),
    );
    expect(projected.errors).toBeUndefined();
    expect(JSON.stringify(projected.data)).not.toContain(SECRET);

    for (const query of [
      `{ inspection { queueState { pendingJobs { actions } } } }`,
      `{ inspection { deadLetters(remoteName: "r") { results { operations } } } }`,
    ]) {
      const result = await run(schema, query, contextFor(OPERATOR));
      expect(result.errors?.[0]?.message).toMatch(/Cannot query field/);
    }
  });
});

describe("inspection subgraph: sync reads", () => {
  it("serves remote inspection to a listed admin", async () => {
    module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder().withChannelScheme(ChannelScheme.SWITCHBOARD),
      )
      .buildModule();
    const { schema } = buildSchema(module, openHost());
    const result = await run(
      schema,
      `{ inspection { info { syncChannels } remotes { remoteName } } }`,
      contextFor(OPERATOR),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.inspection).toEqual({
      info: { syncChannels: ["polling"] },
      remotes: [],
    });
    const unknown = await run(
      schema,
      `{ inspection { remote(remoteName: "nope") { remoteName } } }`,
      contextFor(OPERATOR),
    );
    expect(unknown.errors?.[0]?.message).toMatch(/nope/);
  });
});

describe("inspection subgraph: document reads go through the read gate", () => {
  async function policedDocument(): Promise<string> {
    module = await buildReadGateReactor();
    const id = await createFixture(module.client, "ins-doc");
    await police(module.client, id);
    return id;
  }

  const validate = `query ($id: String!) { inspection {
    validateDocument(documentId: $id) { documentId isConsistent } } }`;

  it("refuses validateDocument to a caller the document is withheld from", async () => {
    const id = await policedDocument();
    const { schema } = buildSchema(module!, openHost());
    for (const ctx of [contextFor(), contextFor(OUTSIDER)]) {
      const result = await run(schema, validate, ctx, { id });
      expect(codeOf(result)).toBe("FORBIDDEN");
    }
  });

  it("serves validateDocument to a caller the gate serves", async () => {
    const id = await policedDocument();
    const { schema } = buildSchema(module!, openHost());
    const result = await run(schema, validate, contextFor(READER), { id });
    expect(result.errors).toBeUndefined();
    expect(result.data?.inspection).toEqual({
      validateDocument: { documentId: id, isConsistent: true },
    });
  });

  it("drops issues in scopes the caller is not served", async () => {
    const id = await policedDocument();
    const reactorModule = module!.reactorModule!;
    const real = createReactorInspectionSource(reactorModule);
    const issue = (scope: string) => ({
      scope,
      branch: "main",
      revision: 1,
      keyframeHash: "a",
      replayedHash: "b",
    });
    const stubbed: IReactorInspectionSource = {
      ...real,
      inspector: Object.assign(Object.create(real.inspector) as object, {
        validateDocument: (): Promise<ValidationResult> =>
          Promise.resolve({
            documentId: id,
            isConsistent: false,
            keyframeIssues: [issue("global"), issue("local")],
            snapshotIssues: [],
            streamOrderIssues: [],
          }),
      }) as unknown as IReactorInspectionSource["inspector"],
    };
    const { schema } = buildSchema(module!, openHost(), stubbed);
    const result = await run(
      schema,
      `query ($id: String!) { inspection { validateDocument(documentId: $id) {
        isConsistent keyframeIssues } } }`,
      contextFor(READER),
      { id },
    );
    expect(result.errors).toBeUndefined();
    const served = (
      result.data?.inspection as {
        validateDocument: {
          isConsistent: boolean;
          keyframeIssues: { scope: string }[];
        };
      }
    ).validateDocument;
    expect(served.keyframeIssues.map((i) => i.scope)).toEqual(["global"]);
  });

  async function policedDrive(): Promise<string> {
    module = await buildReadGateReactor();
    const id = await createFixture(module.client, "ins-drive", {
      source: driveDocumentModelModule,
    });
    await module.client.execute(id, "main", [
      setDriveName({ name: "classified" }),
    ]);
    await police(module.client, id);
    return id;
  }

  it("lists a policed drive only to callers the gate serves it to", async () => {
    const id = await policedDrive();
    const { schema } = buildSchema(module!, openHost());
    const query = `{ inspection { drives { results { driveId name } } } }`;

    for (const ctx of [contextFor(), contextFor(OUTSIDER)]) {
      const result = await run(schema, query, ctx);
      expect(result.errors).toBeUndefined();
      const ids = (
        result.data?.inspection as {
          drives: { results: { driveId: string }[] };
        }
      ).drives.results.map((d) => d.driveId);
      expect(ids).not.toContain(id);
    }

    const reader = await run(schema, query, contextFor(READER));
    expect(
      (
        reader.data?.inspection as {
          drives: { results: { driveId: string; name: string }[] };
        }
      ).drives.results,
    ).toContainEqual({ driveId: id, name: "classified" });
  });

  it("refuses driveIntegrity on a drive the caller is not served", async () => {
    const id = await policedDrive();
    const { schema } = buildSchema(module!, openHost());
    const query = `query ($id: String!) { inspection {
      driveIntegrity(driveId: $id, branch: "main") { driveId } } }`;
    const outsider = await run(schema, query, contextFor(OUTSIDER), { id });
    expect(codeOf(outsider)).toBe("FORBIDDEN");
    const reader = await run(schema, query, contextFor(READER), { id });
    expect(reader.data?.inspection).toEqual({
      driveIntegrity: { driveId: id },
    });
  });
});

describe("inspection subgraph: wire contract", () => {
  it("has no mutation and serves exactly the read rows", async () => {
    module = await buildReadGateReactor();
    const { schema } = buildSchema(module, openHost());
    expect(schema.getMutationType()?.getFields() ?? {}).not.toHaveProperty(
      "inspection",
    );
    for (const name of Object.keys(schema.getMutationType()?.getFields() ?? {}))
      expect(name.toLowerCase()).not.toContain("inspection");

    const root = schema.getType("ReactorInspection");
    if (!isObjectType(root)) throw new Error("ReactorInspection missing");
    expect(Object.keys(root.getFields()).sort()).toEqual(
      [...INSPECTION_ROOT_FIELDS.ReactorInspection].sort(),
    );

    const leverNames = [
      ...Object.entries(INSPECTOR_OPS),
      ...Object.entries(SYNC_INSPECTION_OPS),
    ]
      .filter(([, spec]) => spec.tier !== "read")
      .map(([key]) => key);
    expect(leverNames.length).toBeGreaterThan(0);
    for (const key of leverNames) {
      expect(Object.keys(root.getFields())).not.toContain(key);
    }
  });

  it("serves every wire record with exactly the declared fields", async () => {
    module = await buildReadGateReactor();
    const { schema } = buildSchema(module, openHost());
    for (const [typeName, fields] of Object.entries(INSPECTION_WIRE_FIELDS)) {
      const type = schema.getType(typeName);
      if (!isObjectType(type)) throw new Error(`${typeName} missing`);
      expect(Object.keys(type.getFields()).sort(), typeName).toEqual(
        [...fields].sort(),
      );
    }
  });

  it("serves ordinals as Float", async () => {
    module = await buildReadGateReactor();
    const { schema } = buildSchema(module, openHost());
    for (const [typeName, fields] of Object.entries(
      INSPECTION_ORDINAL_FIELDS,
    )) {
      const type = schema.getType(typeName);
      if (!isObjectType(type)) throw new Error(`${typeName} missing`);
      for (const field of fields) {
        const fieldType = type.getFields()[field].type;
        expect(getNamedType(fieldType).name).toBe("Float");
        expect(isNonNullType(fieldType)).toBe(true);
      }
    }
  });
});

describe("inspection subgraph: host wiring", () => {
  let dispose: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await dispose?.();
    dispose = undefined;
  });

  it("registers the subgraph and hands back the facts sink", async () => {
    const api = await initializeAndStartAPI(
      async (documentModels) => ({
        module: await new ReactorClientBuilder()
          .withReactorBuilder(
            new ReactorBuilder()
              .withEventBus(new EventBus())
              .withDocumentModelSources(documentModels)
              .withChannelScheme(ChannelScheme.SWITCHBOARD),
          )
          .buildModule(),
      }),
      { port: 0, dbPath: undefined, mcp: false },
      "switchboard",
    );
    dispose = api.dispose;

    expect(api.graphqlManager.getSubgraphByName("inspection")).toBeDefined();
    api.inspection?.facts.setWorkflows(true);

    const data = await api.graphqlManager.executeSubgraphQuery<{
      inspection: {
        info: { workflows: boolean; syncChannels: string[]; access: null };
      };
    }>(
      "inspection",
      `{ inspection { info { workflows syncChannels access { admin } } } }`,
      {},
    );
    expect(data.inspection.info).toEqual({
      workflows: true,
      syncChannels: ["polling"],
      access: null,
    });
  }, 120_000);
});
