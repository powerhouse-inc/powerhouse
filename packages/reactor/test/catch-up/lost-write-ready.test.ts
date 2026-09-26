import { PGlite } from "@electric-sql/pglite";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  baseCreateDocument,
  createReducer,
  defaultBaseState,
  generateId,
  groupDocumentType,
  initializeAuth,
  protocolVersionsFor,
  withSignaturePolicy,
  type Action,
  type DocumentModelModule,
  type OperationWithContext,
  type PHBaseState,
  type StateReducer,
} from "@powerhousedao/shared/document-model";
import type { IProcessor } from "@powerhousedao/shared/processors";
import { documentModelDocumentModelModule } from "document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addRelationshipAction } from "../../src/actions/index.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { Database, InProcessReactorModule } from "../../src/core/types.js";
import type { Job } from "../../src/queue/types.js";
import { JobStatus } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";
import { TRUST_ANY_SIGNER } from "../utils/signed-as.js";
import { DroppingEventBus } from "./helpers.js";

type GroupPHState = PHBaseState & {
  global: { members: string[] };
  local: Record<string, never>;
};

const groupStateReducer: StateReducer<GroupPHState> = (state, action) => {
  const input = action.input as { address: string };
  if (action.type === "ADD_MEMBER") state.global.members.push(input.address);
  return state;
};

const groupCreateState = (state?: Partial<GroupPHState>): GroupPHState =>
  ({
    ...defaultBaseState(),
    global: { members: [], ...state?.global },
    local: {},
  }) as GroupPHState;

const fakeGroupModule = {
  version: 1,
  reducer: createReducer<GroupPHState>(groupStateReducer),
  actions: {},
  utils: {
    createDocument: (state?: Partial<GroupPHState>) =>
      baseCreateDocument(groupCreateState, state, groupDocumentType),
  },
  documentModel: {
    global: {
      id: groupDocumentType,
      name: "Reactor Group",
      extension: ".phrg",
      description: "test group model",
      author: { name: "test", website: "" },
      specifications: [],
    },
    local: {},
  },
} as unknown as DocumentModelModule;

function action(type: string, scope: string, input: unknown): Action {
  return {
    id: generateId(),
    type,
    scope,
    timestampUtcMs: new Date().toISOString(),
    input,
  } as Action;
}

function createLegacyDrive() {
  return withSignaturePolicy(
    driveDocumentModelModule.utils.createDocument(),
    "legacy",
  );
}

function recordingProcessor(): IProcessor & {
  received: OperationWithContext[];
} {
  const processor = {
    received: [] as OperationWithContext[],
    onOperations: (ops: OperationWithContext[]) => {
      processor.received.push(...ops);
      return Promise.resolve();
    },
    onDisconnect: () => Promise.resolve(),
  };
  return processor;
}

type Deployment = { module: InProcessReactorModule; bus: DroppingEventBus };

describe("a lost JOB_WRITE_READY", () => {
  let database: Kysely<Database>;
  let started: InProcessReactorModule[];

  beforeEach(() => {
    database = new Kysely<Database>({
      dialect: new PGliteDialect(new PGlite()),
    });
    started = [];
  });

  afterEach(async () => {
    for (const module of started) {
      await module.reactor.kill().completed;
    }
    await database.destroy();
  });

  async function deploy(options?: {
    authGroups?: boolean;
  }): Promise<Deployment> {
    const bus = new DroppingEventBus();
    let builder = new ReactorBuilder()
      .withKysely(database)
      .withEventBus(bus)
      .withCatchUp({ intervalMs: 3_600_000 })
      .withDocumentModelSources([
        documentModelDocumentModelModule as unknown as DocumentModelModule,
        driveDocumentModelModule as unknown as DocumentModelModule,
        ...(options?.authGroups ? [fakeGroupModule] : []),
      ]);
    if (options?.authGroups) {
      builder = builder
        .withExecutorConfig({
          featureFlags: {
            documentDecisions: true,
            authEnforcement: true,
            authGroups: true,
          },
        })
        .withTrustPolicy(TRUST_ANY_SIGNER);
    }
    const module = await builder.buildModule();
    started.push(module);
    return { module, bus };
  }

  async function restart(previous: Deployment): Promise<Deployment> {
    await previous.module.reactor.kill().completed;
    started = started.filter((module) => module !== previous.module);
    return deploy();
  }

  async function settled(
    module: InProcessReactorModule,
    jobId: string,
  ): Promise<void> {
    await vi.waitUntil(
      async () => {
        const status = await module.reactor.getJobStatus(jobId);
        if (status.status === JobStatus.FAILED) {
          throw new Error(`Job failed: ${status.error?.message}`);
        }
        return status.status === JobStatus.READ_READY;
      },
      { timeout: 5000 },
    );
  }

  async function createLost(
    { module, bus }: Deployment,
    documentId: string,
  ): Promise<void> {
    const dropped = bus.dropWriteReadyFor(documentId);
    await module.reactor.create(createDocModelDocument({ id: documentId }));
    await dropped;
  }

  async function createLive(
    { module }: Deployment,
    documentId: string,
  ): Promise<void> {
    const job = await module.reactor.create(
      createDocModelDocument({ id: documentId }),
    );
    await settled(module, job.id);
  }

  it.fails("P1: the document view serves the document after one sweep", async () => {
    const deployment = await deploy();
    await createLost(deployment, "lost-doc");

    await deployment.module.catchUp.sweepNow();

    const document = await deployment.module.documentView.get("lost-doc");
    expect(document.header.id).toBe("lost-doc");
  });

  it.fails("P2: the document view serves it after a restart", async () => {
    const first = await deploy();
    await createLost(first, "lost-doc");
    await createLive(first, "later-doc");

    const second = await restart(first);

    const document = await second.module.documentView.get("lost-doc");
    expect(document.header.id).toBe("lost-doc");
  });

  it.fails("P3: the indexer holds the relationship", async () => {
    const deployment = await deploy();
    await createLive(deployment, "parent-doc");
    await createLive(deployment, "child-doc");

    const dropped = deployment.bus.dropWriteReady((event) =>
      event.operations.some(
        (op) => op.operation.action.type === "ADD_RELATIONSHIP",
      ),
    );
    await deployment.module.reactor.execute("parent-doc", "main", [
      addRelationshipAction("parent-doc", "child-doc", "child"),
    ]);
    await dropped;

    await deployment.module.catchUp.sweepNow();

    const outgoing = await deployment.module.documentIndexer.getOutgoing(
      "parent-doc",
      ["child"],
    );
    expect(outgoing.results.map((edge) => edge.targetId)).toEqual([
      "child-doc",
    ]);
  });

  it.fails("P4: a bound processor receives the operation", async () => {
    const deployment = await deploy();
    const processor = recordingProcessor();
    await deployment.module.processorManager.registerFactory("pkg", () => [
      {
        processor,
        filter: { documentType: ["powerhouse/document-model"] },
      },
    ]);
    const drive = createLegacyDrive();
    await settled(
      deployment.module,
      (await deployment.module.reactor.create(drive)).id,
    );

    await createLost(deployment, "lost-doc");
    await deployment.module.catchUp.sweepNow();

    expect(processor.received.map((op) => op.context.documentId)).toContain(
      "lost-doc",
    );
  });

  it.fails("P5: a processor bound after a restart receives it, after a later batch raised its cursor", async () => {
    const first = await deploy();
    const before = recordingProcessor();
    await first.module.processorManager.registerFactory("pkg", () => [
      {
        processor: before,
        filter: { documentType: ["powerhouse/document-model"] },
      },
    ]);
    const drive = createLegacyDrive();
    await settled(first.module, (await first.module.reactor.create(drive)).id);

    await createLost(first, "lost-doc");
    await createLive(first, "later-doc");
    await vi.waitUntil(() =>
      before.received.some((op) => op.context.documentId === "later-doc"),
    );
    expect(before.received.map((op) => op.context.documentId)).not.toContain(
      "lost-doc",
    );

    const second = await restart(first);
    const after = recordingProcessor();
    await second.module.processorManager.registerFactory("pkg", () => [
      {
        processor: after,
        filter: { documentType: ["powerhouse/document-model"] },
      },
    ]);

    await vi.waitUntil(
      () => after.received.some((op) => op.context.documentId === "lost-doc"),
      { timeout: 2000 },
    );
  });

  it.fails("P6: a membership change indexed without an event enqueues its re-evaluation", async () => {
    const deployment = await deploy({ authGroups: true });
    const { module, bus } = deployment;

    const groupDoc = baseCreateDocument(
      groupCreateState,
      undefined,
      groupDocumentType,
      protocolVersionsFor("legacy"),
    );
    const groupId = groupDoc.header.id;
    await settled(module, (await module.reactor.create(groupDoc)).id);

    await createLive(deployment, "grouped-doc");
    await settled(
      module,
      (
        await module.reactor.execute("grouped-doc", "main", [
          initializeAuth({
            version: 1,
            grants: [
              {
                id: "g-group",
                description: "group executes global",
                effect: "allow",
                principal: { group: groupId },
                capability: { can: "execute", scope: "global" },
              },
            ],
          }),
        ])
      ).id,
    );

    const enqueued: Job[] = [];
    const enqueue = module.queue.enqueue.bind(module.queue);
    vi.spyOn(module.queue, "enqueue").mockImplementation((job: Job) => {
      enqueued.push(job);
      return enqueue(job);
    });

    const dropped = bus.dropWriteReady((event) =>
      event.operations.some((op) => op.operation.action.type === "ADD_MEMBER"),
    );
    await module.reactor.execute(groupId, "main", [
      action("ADD_MEMBER", "global", { address: "0xMember" }),
    ]);
    await dropped;

    await module.catchUp.sweepNow();

    expect(
      enqueued
        .filter((job) => job.kind === "reevaluation")
        .map((job) => job.documentId),
    ).toEqual(["grouped-doc"]);
  });
});
