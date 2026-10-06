import {
  ChannelScheme,
  EventBus,
  INSPECTION_ORDINAL_FIELDS,
  INSPECTION_ROOT_FIELDS,
  INSPECTION_WIRE_FIELDS,
  INSPECTOR_OPS,
  ReactorBuilder,
  ReactorClientBuilder,
  SYNC_INSPECTION_OPS,
  type InProcessReactorClientModule,
  type ValidationResult,
} from "@powerhousedao/reactor";
import {
  driveDocumentModelModule,
  setDriveName,
} from "@powerhousedao/shared/document-drive";
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
