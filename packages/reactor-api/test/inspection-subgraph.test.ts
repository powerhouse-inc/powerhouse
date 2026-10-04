import {
  ChannelScheme,
  EventBus,
  InMemoryQueue,
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
  type InspectableSyncManager,
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

async function run(
  schema: GraphQLSchema,
  source: string,
  contextValue: Context = ANONYMOUS,
) {
  return graphql({ schema, source, contextValue });
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

    it("sweeps catch-up and retries an unknown processor without complaint", async () => {
      const schema = buildSchema({ admin: true });

      const swept = await run(schema, `mutation { inspectionSweepCatchUp }`);
      expect(errorMessages(swept)).toEqual([]);
      expect(
        (swept.data as { inspectionSweepCatchUp: unknown[] })
          .inspectionSweepCatchUp,
      ).toBeInstanceOf(Array);

      // Idempotent by design: the inspector's retry is a no-op for an id that
      // is not tracked, so an operator clicking a stale row gets no error.
      const retried = await run(
        schema,
        `mutation { inspectionRetryProcessor(processorId: "nope") }`,
      );
      expect(errorMessages(retried)).toEqual([]);
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
    // the far side of HTTP.
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
        "catchUpStatus",
        "deadLetters",
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
