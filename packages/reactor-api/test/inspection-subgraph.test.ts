import {
  ChannelScheme,
  deriveConnectionHealth,
  EventBus,
  INSPECTION_ORDINAL_FIELDS,
  INSPECTION_WIRE_FIELDS,
  InMemoryQueue,
  ReactorBuilder,
  ReactorClientBuilder,
  ReactorInspector,
  type ConnectionStateSnapshot,
  type IInspector,
  type InProcessReactorClientModule,
  type InspectableSyncManager,
  type IReactorDbQuery,
  type RemoteSyncInspection,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import type * as GraphQL from "graphql";
import type { GraphQLSchema } from "graphql";
import { createRequire } from "node:module";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createReactorInspectionSource,
  InspectionSubgraph,
  type ReactorInspectionOptions,
} from "../src/graphql/inspection/index.js";
import type { Context, SubgraphArgs } from "../src/graphql/types.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../src/services/authorization.service.js";
import { initializeAndStartAPI } from "../src/server.js";
import { createSchema } from "../src/utils/create-schema.js";

/**
 * The inspection subgraph (multi-reactor W3.2) against a real in-process
 * reactor module, through its real SDL.
 *
 * Covers the three access tiers from `IReactorInspectionSource` -- reads need
 * only the host's policy-wide reader check, mutations need PH_INSPECTION_ADMIN
 * as well, and raw SQL needs PH_INSPECTION_SQL on top of that -- plus the wire
 * shape of each read, because a browser monitor on the far side of this schema
 * has nothing else to go on.
 */

// The CommonJS build @apollo/subgraph uses to construct the schema; vite would
// hand this file the ESM one, and the two realms refuse each other's schemas.
const { graphql } = createRequire(import.meta.url)("graphql") as typeof GraphQL;

const ANONYMOUS: Context = { headers: {}, db: null } as unknown as Context;
const ADDRESSED: Context = {
  headers: {},
  db: null,
  user: { address: "0xabc", chainId: 1, networkId: "1", appKey: "did:key:x" },
} as unknown as Context;

let module: InProcessReactorClientModule;
let syncManager: InspectableSyncManager;

async function buildReactor(): Promise<void> {
  module = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder()
        .withDocumentModelSources([
          driveDocumentModelModule as unknown as DocumentModelModule,
          documentModelDocumentModelModule as unknown as DocumentModelModule,
        ])
        // What reactor-api's own hosts build: the response-channel scheme, so
        // the reported `syncChannels` is the one a Switchboard really routes.
        .withChannelScheme(ChannelScheme.SWITCHBOARD),
    )
    .buildModule();
  const manager = module.reactorModule?.syncModule?.syncManager;
  if (!manager) throw new Error("reactor built without a sync module");
  syncManager = manager;
}

function buildSchema(
  options: ReactorInspectionOptions,
  policy: AuthorizationPolicy = AuthorizationPolicy.OPEN,
): GraphQLSchema {
  const reactorModule = module.reactorModule;
  if (!reactorModule) throw new Error("reactor built without a module");
  const subgraph = new InspectionSubgraph({
    reactorClient: module.client,
    authorizationService: createAuthorizationService({
      admins: [],
      defaultProtection: false,
      policy,
    }),
    inspection: createReactorInspectionSource(
      reactorModule,
      syncManager,
      options,
    ),
  } as unknown as SubgraphArgs);
  return createSchema([], subgraph.resolvers, subgraph.typeDefs);
}

/**
 * A schema over a STUB source, for the two things a real reactor module cannot
 * produce on demand: an operation index past 2^31, and an inspector whose
 * components are missing.
 */
function buildStubSchema(stub: {
  inspector: IInspector;
  syncManager: Partial<InspectableSyncManager>;
  adminEnabled?: boolean;
}): GraphQLSchema {
  const subgraph = new InspectionSubgraph({
    reactorClient: module.client,
    authorizationService: createAuthorizationService({
      admins: [],
      defaultProtection: false,
      policy: AuthorizationPolicy.OPEN,
    }),
    inspection: {
      inspector: stub.inspector,
      syncManager: stub.syncManager as InspectableSyncManager,
      dbQuery: { queryDb: () => Promise.resolve([]) } as IReactorDbQuery,
      adminEnabled: stub.adminEnabled ?? true,
      sqlEnabled: false,
      info: () => ({
        hosting: "remote",
        inspection: "rpc",
        storageKind: "pglite",
        processors: true,
        workflows: false,
        syncChannels: [],
        adminEnabled: stub.adminEnabled ?? true,
        sqlEnabled: false,
      }),
      setWorkflowsComposed: () => undefined,
    },
  } as unknown as SubgraphArgs);
  return createSchema([], subgraph.resolvers, subgraph.typeDefs);
}

async function run(
  schema: GraphQLSchema,
  source: string,
  contextValue: Context = ANONYMOUS,
) {
  return graphql({ schema, source, contextValue });
}

/** The SDL type of one field, printed (e.g. "Float!"). */
function fieldType(schema: GraphQLSchema, type: string, field: string): string {
  const fields = (
    schema.getType(type) as unknown as {
      getFields: () => Record<string, { type: { toString: () => string } }>;
    }
  ).getFields();
  return String(fields[field]?.type);
}

/** The SDL type of one mutation ARGUMENT, printed. */
function argumentType(
  schema: GraphQLSchema,
  mutation: string,
  argument: string,
): string {
  const field = schema.getMutationType()?.getFields()[mutation];
  const found = field?.args.find((arg) => arg.name === argument);
  return String(found?.type);
}

function errorMessages(result: { errors?: readonly { message: string }[] }) {
  return (result.errors ?? []).map((error) => error.message);
}

describe("inspection subgraph", () => {
  beforeAll(async () => {
    await buildReactor();
  }, 60_000);

  afterEach(async () => {
    // Every test leaves the queue as it found it: pauseQueue is one of the
    // levers under test and a paused queue would strand the next reactor read.
    // `pause`/`resume` are the in-memory queue's own inspection affordances,
    // not part of `IQueue`, which is exactly why `ReactorInspector` narrows
    // to that implementation too.
    const queue = module.reactorModule?.queue;
    if (queue instanceof InMemoryQueue) {
      await queue.resume();
    }
  });

  describe("reported facts", () => {
    it("reports what the reactor itself knows, not what a client assumed", async () => {
      const result = await run(
        buildSchema({}),
        `{ inspection { info {
            hosting inspection storageKind processors workflows
            syncChannels adminEnabled sqlEnabled
          } } }`,
      );

      expect(errorMessages(result)).toEqual([]);
      expect(result.data).toEqual({
        inspection: {
          info: {
            hosting: "remote",
            inspection: "rpc",
            // No instrumented pg pools: this reactor is PGlite-backed.
            storageKind: "pglite",
            processors: true,
            workflows: false,
            // Read off the BUILT channel factory, which is the switchboard
            // scheme's response channel -- not "gql", which is what a client
            // guessing from "it is a Switchboard" would have assumed.
            syncChannels: ["polling"],
            adminEnabled: false,
            sqlEnabled: false,
          },
        },
      });
    });

    // W3.2 live finding: a vetra Switchboard whose workflow runtime had booted
    // reported workflows: false. The report was frozen at construction, and
    // the engine is composed AFTER the API boots, so the fact could only ever
    // have been the default.
    it("reports the workflow runtime once the host says it is composed", () => {
      const source = createReactorInspectionSource(
        module.reactorModule!,
        syncManager,
      );
      expect(source.info().workflows).toBe(false);

      source.setWorkflowsComposed(true);

      expect(source.info().workflows).toBe(true);
      // And back, so a host that tears the runtime down is not still claiming
      // to run workflows.
      source.setWorkflowsComposed(false);
      expect(source.info().workflows).toBe(false);
    });

    it("reports the admin tiers the host opted into", async () => {
      const result = await run(
        buildSchema({ admin: true, sql: true, workflows: true }),
        `{ inspection { info { adminEnabled sqlEnabled workflows } } }`,
      );

      expect(result.data).toEqual({
        inspection: {
          info: { adminEnabled: true, sqlEnabled: true, workflows: true },
        },
      });
    });

    // The thing on the other end of these variables is an env file, a Docker
    // -e or a Helm value, and all of those have shipped "TRUE" and trailing
    // whitespace. A posture that silently stays OFF for a flag the operator
    // DID set -- while the refusal tells them to set it -- is the worst
    // outcome available.
    it("reads an opt-in flag the way an operator actually spells it", async () => {
      const previous = process.env.PH_INSPECTION_ADMIN;
      for (const spelling of [" TRUE ", "True", "yes", "on", "1"]) {
        process.env.PH_INSPECTION_ADMIN = spelling;
        const result = await run(
          buildSchema({}),
          `{ inspection { info { adminEnabled } } }`,
        );
        expect(result.data, spelling).toEqual({
          inspection: { info: { adminEnabled: true } },
        });
      }
      for (const spelling of ["false", "0", "maybe", ""]) {
        process.env.PH_INSPECTION_ADMIN = spelling;
        const result = await run(
          buildSchema({}),
          `{ inspection { info { adminEnabled } } }`,
        );
        expect(result.data, spelling).toEqual({
          inspection: { info: { adminEnabled: false } },
        });
      }
      process.env.PH_INSPECTION_ADMIN = previous;
    });

    it("names the accepted spellings when it refuses for a missing flag", async () => {
      const result = await run(
        buildSchema({ admin: false }),
        `mutation { inspectionPauseQueue }`,
      );

      expect(errorMessages(result)[0]).toBe(
        "Reactor inspection pausing the queue is not enabled on this host: set PH_INSPECTION_ADMIN=true (or 1, yes, on) to serve it",
      );
    });

    it("refuses raw SQL without the admin tier under it", async () => {
      const result = await run(
        buildSchema({ admin: false, sql: true }),
        `{ inspection { info { adminEnabled sqlEnabled } } }`,
      );

      expect(result.data).toEqual({
        inspection: { info: { adminEnabled: false, sqlEnabled: false } },
      });
    });
  });

  describe("reads", () => {
    it("serves the registered document models with versions", async () => {
      const result = await run(
        buildSchema({}),
        `{ inspection { documentModels {
            documentType name version supportedVersions
          } } }`,
      );

      expect(errorMessages(result)).toEqual([]);
      const models = (
        result.data as {
          inspection: {
            documentModels: {
              documentType: string;
              name: string;
              version: number;
              supportedVersions: number[];
            }[];
          };
        }
      ).inspection.documentModels;
      // The reactor under test registered the drive and document-model modules.
      const byType = new Map(
        models.map((model) => [model.documentType, model]),
      );
      expect(byType.has("powerhouse/document-drive")).toBe(true);
      expect(byType.has("powerhouse/document-model")).toBe(true);
      for (const model of models) {
        expect(model.name.length).toBeGreaterThan(0);
        expect(model.version).toBeGreaterThanOrEqual(1);
        expect(model.supportedVersions).toContain(model.version);
      }
    });

    it("serves the drive list, empty on a reactor with no drives", async () => {
      const result = await run(
        buildSchema({}),
        `{ inspection { drives {
            results {
              driveId name branch collectionId documentType
              nodeCount fileCount folderCount icon
            }
            nextCursor
          } } }`,
      );

      expect(errorMessages(result)).toEqual([]);
      expect(result.data).toEqual({
        inspection: { drives: { results: [], nextCursor: null } },
      });
    });

    it("walks a drive for missing documents and unsupported types", async () => {
      const drive = {
        header: {
          id: "drive-1",
          branch: "main",
          documentType: "powerhouse/document-drive",
          name: "D",
        },
        state: {
          global: {
            name: "D",
            icon: null,
            nodes: [
              {
                id: "a",
                kind: "file",
                documentType: "powerhouse/document-drive",
              },
              { id: "b", kind: "file", documentType: "evil/unknown" },
              { id: "f", kind: "folder" },
            ],
          },
        },
      };
      const reactorStub = {
        get: () => Promise.resolve(drive),
        find: (search: { ids?: string[] }) =>
          Promise.resolve({
            results: (search.ids ?? []).includes("a")
              ? [{ header: { id: "a" } }]
              : [],
            options: { cursor: "", limit: 0 },
          }),
      };
      const registryStub = {
        getAllModules: () => [
          { documentModel: { global: { id: "powerhouse/document-drive" } } },
        ],
      };
      const inspector = new ReactorInspector({
        reactor: reactorStub as never,
        documentModelRegistry: registryStub as never,
      });
      const schema = buildStubSchema({
        inspector,
        syncManager: { list: () => [] },
      });

      const result = await run(
        schema,
        `{ inspection { driveIntegrity(driveId: "drive-1") {
            driveId checkedNodeCount totalFileNodeCount
            missingDocuments { id documentType }
            unsupportedTypes { id documentType }
            nextCursor
          } } }`,
      );

      expect(errorMessages(result)).toEqual([]);
      expect(result.data).toEqual({
        inspection: {
          driveIntegrity: {
            driveId: "drive-1",
            checkedNodeCount: 2,
            totalFileNodeCount: 2,
            missingDocuments: [{ id: "b", documentType: "evil/unknown" }],
            unsupportedTypes: [{ id: "b", documentType: "evil/unknown" }],
            nextCursor: null,
          },
        },
      });
    });

    it("reports no attachment store when none is wired", async () => {
      const result = await run(
        buildSchema({}),
        `{ inspection { attachmentInfo {
            present storeKind hasReplicator bytesHeld lastError
          } } }`,
      );

      expect(errorMessages(result)).toEqual([]);
      expect(result.data).toEqual({
        inspection: {
          attachmentInfo: {
            present: false,
            storeKind: "none",
            hasReplicator: false,
            bytesHeld: 0,
            lastError: null,
          },
        },
      });
    });

    it("serves a wired attachment store's presence and bytes held", async () => {
      const inspector = new ReactorInspector({
        attachmentStore: {
          getAttachmentInfo: () =>
            Promise.resolve({
              present: true,
              storeKind: "kysely",
              hasReplicator: false,
              replicatorRunning: false,
              backlogScanned: false,
              refsSeen: 0,
              held: 0,
              bytesHeld: 2048,
              queued: 0,
              fetching: 0,
              pendingFetches: 0,
              waiting: 0,
              notFound: 0,
              failed: 0,
              lastError: undefined,
            }),
        },
      });
      const schema = buildStubSchema({
        inspector,
        syncManager: { list: () => [] },
      });

      const result = await run(
        schema,
        `{ inspection { attachmentInfo {
            present storeKind hasReplicator bytesHeld lastError
          } } }`,
      );

      expect(errorMessages(result)).toEqual([]);
      expect(result.data).toEqual({
        inspection: {
          attachmentInfo: {
            present: true,
            storeKind: "kysely",
            hasReplicator: false,
            bytesHeld: 2048,
            lastError: null,
          },
        },
      });
    });

    it("serves queue state as typed data", async () => {
      const result = await run(
        buildSchema({}),
        `{ inspection { queueState {
            isPaused totalPending totalExecuting pendingJobs executingJobs
          } } }`,
      );

      expect(errorMessages(result)).toEqual([]);
      expect(result.data).toEqual({
        inspection: {
          queueState: {
            isPaused: false,
            totalPending: 0,
            totalExecuting: 0,
            pendingJobs: [],
            executingJobs: [],
          },
        },
      });
    });

    it("serves the processor list", async () => {
      const result = await run(
        buildSchema({}),
        `{ inspection { processors {
            processorId factoryId driveId processorIndex lastOrdinal
            status lastError lastErrorTimestampUtcMs
          } } }`,
      );

      expect(errorMessages(result)).toEqual([]);
      expect(result.data).toEqual({ inspection: { processors: [] } });
    });

    it("serves catch-up status", async () => {
      const result = await run(
        buildSchema({}),
        `{ inspection { catchUpStatus } }`,
      );

      expect(errorMessages(result)).toEqual([]);
      const status = (
        result.data as {
          inspection: { catchUpStatus: Record<string, unknown> };
        }
      ).inspection.catchUpStatus;
      expect(status).toBeTypeOf("object");
      expect(status).not.toBeNull();
    });

    it("serves storage health, defaulting healthy where no PGlite self-heal tracker is wired", async () => {
      const result = await run(
        buildSchema({}),
        `{ inspection { storageHealth {
            healthy everRecreated recreateCount lastRecreated
          } } }`,
      );

      expect(errorMessages(result)).toEqual([]);
      expect(result.data).toEqual({
        inspection: {
          storageHealth: {
            healthy: true,
            everRecreated: false,
            recreateCount: 0,
            lastRecreated: null,
          },
        },
      });
    });

    it("serves the sync inspection view and holds", async () => {
      const result = await run(
        buildSchema({}),
        `{ inspection {
            remotes {
              remoteName remoteId meta
              inboxCursor { cursorType cursorOrdinal liveAckOrdinal liveLatestOrdinal }
              outboxCursor { cursorType cursorOrdinal }
              mailboxDepths { inbox outbox deadLetter }
              connection { snapshot neverSucceeded stalenessMs }
            }
            holds
          } }`,
      );

      expect(errorMessages(result)).toEqual([]);
      expect(result.data).toEqual({
        inspection: { remotes: [], holds: [] },
      });
    });

    it("refuses reads when the policy admits no policy-wide reader", async () => {
      const schema = buildSchema({}, AuthorizationPolicy.ADMIN_ONLY);

      const anonymous = await run(
        schema,
        `{ inspection { queueState { isPaused } } }`,
      );
      const addressed = await run(
        schema,
        `{ inspection { queueState { isPaused } } }`,
        ADDRESSED,
      );

      expect(errorMessages(anonymous)).toEqual([
        "Reactor inspection requires admin access to read the reactor inspection surface",
      ]);
      expect(errorMessages(addressed)).toEqual([
        "Reactor inspection requires admin access to read the reactor inspection surface",
      ]);
    });
  });

  describe("mutating ops", () => {
    const LEVERS: readonly { field: string; call: string }[] = [
      { field: "inspectionPauseQueue", call: "inspectionPauseQueue" },
      { field: "inspectionResumeQueue", call: "inspectionResumeQueue" },
      {
        field: "inspectionRetryProcessor",
        call: `inspectionRetryProcessor(processorId: "p")`,
      },
      { field: "inspectionSweepCatchUp", call: "inspectionSweepCatchUp" },
      {
        field: "inspectionValidateDocument",
        call: `inspectionValidateDocument(documentId: "d")`,
      },
      {
        field: "inspectionRebuildKeyframes",
        call: `inspectionRebuildKeyframes(documentId: "d")`,
      },
      {
        field: "inspectionRebuildSnapshots",
        call: `inspectionRebuildSnapshots(documentId: "d")`,
      },
      {
        field: "inspectionTriggerPull",
        call: `inspectionTriggerPull(remoteName: "r")`,
      },
      {
        field: "inspectionRewindInboxCursor",
        call: `inspectionRewindInboxCursor(remoteName: "r", toOrdinal: 0)`,
      },
      {
        field: "inspectionResetChannel",
        call: `inspectionResetChannel(remoteName: "r")`,
      },
      {
        field: "inspectionRequeueDeadLetter",
        call: `inspectionRequeueDeadLetter(remoteName: "r", id: "i")`,
      },
      {
        field: "inspectionClearDeadLetter",
        call: `inspectionClearDeadLetter(remoteName: "r", id: "i")`,
      },
      {
        field: "inspectionQueryDb",
        call: `inspectionQueryDb(sql: "select 1")`,
      },
    ];

    it.each(LEVERS)(
      "$field refuses without PH_INSPECTION_ADMIN, naming the flag",
      async ({ call }) => {
        const result = await run(buildSchema({}), `mutation { ${call} }`);

        expect(errorMessages(result)).toHaveLength(1);
        expect(errorMessages(result)[0]).toContain("PH_INSPECTION_ADMIN");
        expect(errorMessages(result)[0]).toContain(
          "is not enabled on this host",
        );
      },
    );

    it("pauses and resumes the queue once the host opts in", async () => {
      const schema = buildSchema({ admin: true });

      const paused = await run(schema, `mutation { inspectionPauseQueue }`);
      expect(errorMessages(paused)).toEqual([]);
      expect(paused.data).toEqual({ inspectionPauseQueue: true });

      const state = await run(
        schema,
        `{ inspection { queueState { isPaused } } }`,
      );
      expect(state.data).toEqual({
        inspection: { queueState: { isPaused: true } },
      });

      const resumed = await run(schema, `mutation { inspectionResumeQueue }`);
      expect(errorMessages(resumed)).toEqual([]);
      const after = await run(
        schema,
        `{ inspection { queueState { isPaused } } }`,
      );
      expect(after.data).toEqual({
        inspection: { queueState: { isPaused: false } },
      });
    });

    it("sweeps catch-up, and refuses a retry for a processor nothing is tracking", async () => {
      const schema = buildSchema({ admin: true });

      const swept = await run(schema, `mutation { inspectionSweepCatchUp }`);
      expect(errorMessages(swept)).toEqual([]);
      expect(
        (swept.data as { inspectionSweepCatchUp: unknown[] })
          .inspectionSweepCatchUp,
      ).toBeInstanceOf(Array);

      // The reactor cannot deliver a retry to an id it is not tracking, so it
      // says so. Answering `true` would tell an operator clicking a stale row
      // that a retry happened.
      const retried = await run(
        schema,
        `mutation { inspectionRetryProcessor(processorId: "nope") }`,
      );
      expect(errorMessages(retried)).toHaveLength(1);
      expect(errorMessages(retried)[0]).toMatch(/not tracking it/);
      // The field is `Boolean!`, so the refusal nulls the whole response
      // rather than resolving to a value no caller could act on.
      expect(retried.data).toBeNull();
    });

    // The ops that CAN silently no-op on a degraded reactor, through the real
    // SDL: a host whose queue is not the inspectable one, or that composed no
    // processor manager, must not answer `true` to a lever it cannot pull.
    // Nothing downstream can tell such a `true` from a real one.
    it("refuses a lever the host's components cannot serve, rather than answering true", async () => {
      const schema = buildStubSchema({
        inspector: new ReactorInspector({}),
        syncManager: { list: () => [] },
      });

      const paused = await run(schema, `mutation { inspectionPauseQueue }`);
      expect(errorMessages(paused)[0]).toMatch(
        /unsupported on this host's queue/,
      );
      expect(paused.data).toBeNull();

      const resumed = await run(schema, `mutation { inspectionResumeQueue }`);
      expect(errorMessages(resumed)[0]).toMatch(
        /unsupported on this host's queue/,
      );

      const retried = await run(
        schema,
        `mutation { inspectionRetryProcessor(processorId: "p") }`,
      );
      expect(errorMessages(retried)[0]).toMatch(
        /built with no processor manager/,
      );

      // A READ of the same missing component is still empty rather than an
      // error: there is no queue state, so there are no jobs.
      const state = await run(
        schema,
        `{ inspection { queueState { isPaused totalPending } } }`,
      );
      expect(errorMessages(state)).toEqual([]);
      expect(state.data).toEqual({
        inspection: { queueState: { isPaused: false, totalPending: 0 } },
      });
    });

    it("surfaces the reactor's own refusal for an unknown remote", async () => {
      const result = await run(
        buildSchema({ admin: true }),
        `mutation { inspectionResetChannel(remoteName: "nope") }`,
      );

      expect(errorMessages(result)).toHaveLength(1);
      expect(errorMessages(result)[0]).not.toContain("PH_INSPECTION");
    });

    it("refuses mutations to a caller with no policy-wide standing even with the flag on", async () => {
      const result = await run(
        buildSchema({ admin: true }, AuthorizationPolicy.ADMIN_ONLY),
        `mutation { inspectionPauseQueue }`,
        ADDRESSED,
      );

      expect(errorMessages(result)).toEqual([
        "Reactor inspection requires admin access to read the reactor inspection surface",
      ]);
    });
  });

  describe("raw SQL", () => {
    it("refuses under the admin tier alone, naming its own flag", async () => {
      const result = await run(
        buildSchema({ admin: true }),
        `mutation { inspectionQueryDb(sql: "select 1 as one") }`,
      );

      expect(errorMessages(result)).toHaveLength(1);
      expect(errorMessages(result)[0]).toContain("PH_INSPECTION_SQL");
    });

    it("answers once both tiers are on", async () => {
      const result = await run(
        buildSchema({ admin: true, sql: true }),
        `mutation { inspectionQueryDb(sql: "select 1 as one") }`,
      );

      expect(errorMessages(result)).toEqual([]);
      expect(result.data).toEqual({ inspectionQueryDb: [{ one: 1 }] });
    });
  });

  describe("host wiring", () => {
    // The resolvers above are exercised directly; this asserts the other half:
    // that booting the API actually MOUNTS them, with a source built from the
    // host's own reactor module. A subgraph nobody registered would pass every
    // test above and serve nothing.
    let dispose: (() => Promise<void>) | undefined;

    afterEach(async () => {
      await dispose?.();
      dispose = undefined;
    });

    it("registers the inspection subgraph and answers through it", async () => {
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

      const data = await api.graphqlManager.executeSubgraphQuery<{
        inspection: {
          info: { hosting: string; adminEnabled: boolean; sqlEnabled: boolean };
          queueState: { isPaused: boolean };
        };
      }>(
        "inspection",
        `{ inspection {
            info { hosting adminEnabled sqlEnabled }
            queueState { isPaused }
          } }`,
        {},
      );

      expect(data.inspection.info.hosting).toBe("remote");
      // Nothing opted in: a booted host serves reads and refuses every lever.
      expect(data.inspection.info.adminEnabled).toBe(false);
      expect(data.inspection.info.sqlEnabled).toBe(false);
      expect(data.inspection.queueState.isPaused).toBe(false);
    }, 120_000);
  });

  describe("wire contract", () => {
    // The browser monitor's remote client writes these operation names by
    // hand against this schema (no package dependency links the two), so a
    // rename here has to be a visible diff rather than a runtime surprise on
    // the far side of HTTP. What the two ends DO share is the field table in
    // `@powerhousedao/reactor` (`src/inspector/wire.ts`): the client builds its
    // selection sets from it, and these tests hold this SDL to it.
    it("serves exactly the fields the shared wire contract declares", () => {
      const schema = buildSchema({});

      for (const [type, expected] of Object.entries(INSPECTION_WIRE_FIELDS)) {
        const served = Object.keys(
          (
            schema.getType(type) as unknown as {
              getFields: () => Record<string, unknown>;
            }
          ).getFields(),
        ).sort();
        expect(served, type).toEqual([...expected].sort());
      }
    });

    // Ordinals are bigint-origin, and `Int` is 32-bit: a reactor whose
    // operation index has passed 2^31 must still be inspectable. The shared
    // contract names every ordinal field and argument; this is what holds the
    // SDL to Float for each one.
    it("types every ordinal as Float, never Int", () => {
      const schema = buildSchema({});

      for (const field of INSPECTION_ORDINAL_FIELDS.InspectionProcessor) {
        expect(fieldType(schema, "InspectionProcessor", field), field).toBe(
          "Float!",
        );
      }
      for (const field of INSPECTION_ORDINAL_FIELDS.InspectionCursor) {
        expect(fieldType(schema, "InspectionCursor", field), field).toBe(
          "Float!",
        );
      }
      for (const argument of INSPECTION_ORDINAL_FIELDS.inspectionRewindInboxCursor) {
        expect(
          argumentType(schema, "inspectionRewindInboxCursor", argument),
          argument,
        ).toBe("Float!");
      }
    });

    it("serves an ordinal past 2^31, which Int would have refused", async () => {
      const BIG = 4_294_967_296; // 2^32: past Int, exact in a double.
      const snapshot: ConnectionStateSnapshot = {
        state: "connected",
        failureCount: 0,
        lastSuccessUtcMs: 1,
        lastFailureUtcMs: 0,
        pushBlocked: false,
        pushFailureCount: 0,
        receivingPages: false,
        requiresAuth: false,
      };
      const inspection: RemoteSyncInspection = {
        remoteName: "peer",
        remoteId: "r-1",
        inboxCursor: {
          cursorType: "inbox",
          cursorOrdinal: BIG,
          liveAckOrdinal: BIG + 1,
          liveLatestOrdinal: BIG + 2,
        },
        outboxCursor: {
          cursorType: "outbox",
          cursorOrdinal: BIG,
          liveAckOrdinal: BIG,
          liveLatestOrdinal: BIG,
        },
        mailboxDepths: { inbox: 0, outbox: 0, deadLetter: 0 },
        connection: deriveConnectionHealth(snapshot, 2),
      };
      const inspector = new ReactorInspector({
        processorManager: {
          getAll: () => [
            {
              processorId: "p-1",
              factoryId: "f-1",
              driveId: "d-1",
              processorIndex: 0,
              lastOrdinal: BIG,
              status: "active",
              lastError: undefined,
              lastErrorTimestamp: undefined,
            },
          ],
        } as never,
      });
      const schema = buildStubSchema({
        inspector,
        syncManager: {
          inspectRemotes: () => Promise.resolve([inspection]),
          list: () => [],
        },
      });

      const result = await run(
        schema,
        `{ inspection {
            processors { lastOrdinal }
            remotes {
              inboxCursor { cursorOrdinal liveAckOrdinal liveLatestOrdinal }
            }
          } }`,
      );

      expect(errorMessages(result)).toEqual([]);
      expect(result.data).toEqual({
        inspection: {
          processors: [{ lastOrdinal: BIG }],
          remotes: [
            {
              inboxCursor: {
                cursorOrdinal: BIG,
                liveAckOrdinal: BIG + 1,
                liveLatestOrdinal: BIG + 2,
              },
            },
          ],
        },
      });
    });

    it("exposes exactly the documented root fields", () => {
      const schema = buildSchema({});
      const query = schema.getQueryType();
      const mutation = schema.getMutationType();

      expect(Object.keys(query?.getFields() ?? {})).toContain("inspection");
      expect(
        Object.keys(
          (
            schema.getType("ReactorInspection") as unknown as {
              getFields: () => Record<string, unknown>;
            }
          ).getFields(),
        ).sort(),
      ).toEqual([
        "attachmentInfo",
        "catchUpStatus",
        "deadLetters",
        "documentModels",
        "driveIntegrity",
        "drives",
        "holds",
        "info",
        "processors",
        "queueState",
        "remote",
        "remotes",
        "storageHealth",
      ]);
      expect(
        Object.keys(mutation?.getFields() ?? {})
          .filter((name) => name.startsWith("inspection"))
          .sort(),
      ).toEqual([
        "inspectionClearDeadLetter",
        "inspectionPauseQueue",
        "inspectionQueryDb",
        "inspectionRebuildKeyframes",
        "inspectionRebuildSnapshots",
        "inspectionRequeueDeadLetter",
        "inspectionResetChannel",
        "inspectionResumeQueue",
        "inspectionRetryProcessor",
        "inspectionRewindInboxCursor",
        "inspectionSweepCatchUp",
        "inspectionTriggerPull",
        "inspectionValidateDocument",
      ]);
    });
  });
});
