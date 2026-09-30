import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  addModule,
  baseCreateDocument,
  deriveOperationId,
  createReducer,
  defaultBaseState,
  garbageCollect,
  generateId,
  groupDocumentType,
  initializeAuth,
  protocolVersionsFor,
  sortOperations,
  type Action,
  type DocumentModelModule,
  type Operation,
  type PHBaseState,
  type StateReducer,
} from "@powerhousedao/shared/document-model";
import {
  ConsoleLogger,
  documentModelDocumentModelModule,
} from "document-model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteDocumentAction } from "../../../src/actions/index.js";
import { buildSingleJobMeta } from "../../../src/core/utils.js";
import {
  buildWorkerExecutor,
  type WorkerExecutorStack,
} from "../../../src/executor/worker/build-worker-executor.js";
import type { InitMessage } from "../../../src/executor/worker/protocol.js";
import type { Job } from "../../../src/queue/types.js";
import { createDocModelDocument } from "../../factories.js";
import { signedAs, TRUST_ANY_SIGNER } from "../../utils/signed-as.js";
import {
  createTestDatabase,
  expectPurged,
  settled,
  startReactor,
  succeeded,
  type PurgeReactor,
  type TestDatabase,
} from "../executor/harness.js";

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
const groupModule = {
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

const FLAGS = {
  documentDecisions: true,
  authEnforcement: true,
  authGroups: true,
};
const MEMBER = "0xMember";
const ADMIN = "0xAdmin";

function action(type: string, scope: string, input: unknown): Action {
  return {
    id: generateId(),
    type,
    scope,
    timestampUtcMs: new Date().toISOString(),
    input,
  } as Action;
}

function mutation(documentId: string, scope: string, actions: Action[]): Job {
  const id = generateId();
  return {
    id,
    kind: "mutation",
    documentId,
    scope,
    branch: "main",
    actions,
    operations: [],
    createdAt: new Date().toISOString(),
    queueHint: [],
    errorHistory: [],
    meta: buildSingleJobMeta(id),
  };
}

function loadJob(
  documentId: string,
  scope: string,
  operations: Operation[],
): Job {
  const id = generateId();
  return {
    id,
    kind: "load",
    documentId,
    scope,
    branch: "main",
    actions: [],
    operations,
    createdAt: new Date().toISOString(),
    queueHint: [],
    errorHistory: [],
    meta: buildSingleJobMeta(id),
  };
}

function genesisOperation(
  documentId: string,
  scope: string,
  action: Action,
): Operation {
  return {
    id: deriveOperationId(documentId, scope, "main", action.id),
    index: 0,
    skip: 0,
    hash: "",
    timestampUtcMs: action.timestampUtcMs,
    action,
  };
}

function purgeJob(documentId: string): Job {
  const id = generateId();
  return {
    id,
    kind: "purge",
    documentId,
    scope: "document",
    branch: "main",
    actions: [],
    operations: [],
    createdAt: new Date().toISOString(),
    queueHint: [],
    errorHistory: [],
    meta: buildSingleJobMeta(id, { purgeRequestDocumentIds: [documentId] }),
    purge: { requestId: "req-w", allowLarge: false },
  };
}

function grants(groupId: string) {
  return initializeAuth({
    version: 1,
    grants: [
      {
        id: "g-admin",
        description: "admin",
        effect: "allow",
        principal: { address: ADMIN },
        capability: { can: "execute", scope: "*" },
      },
      {
        id: "g-group",
        description: "group executes global",
        effect: "allow",
        principal: { group: groupId },
        capability: { can: "execute", scope: "global" },
      },
    ],
  });
}

describe("r1: a worker that read a group keeps it after the group's purge [Postgres]", () => {
  let database: TestDatabase;
  let host: PurgeReactor;
  let w2: WorkerExecutorStack;

  beforeAll(async () => {
    database = await createTestDatabase("reactor_review_r1_worker_group");
    host = await startReactor(database, {
      models: [groupModule],
      featureFlags: FLAGS,
      trustPolicy: TRUST_ANY_SIGNER,
    });
    const byName: Record<string, unknown> = {
      documentModel: documentModelDocumentModelModule,
      drive: driveDocumentModelModule,
      group: groupModule,
      trust: TRUST_ANY_SIGNER,
    };
    const spec = (exportName: string) => ({
      module: { packageName: "in-test", exportName },
    });
    w2 = await buildWorkerExecutor({
      init: {
        models: [
          {
            documentType: "powerhouse/document-model",
            version: "1",
            spec: spec("documentModel"),
          },
          {
            documentType: "powerhouse/document-drive",
            version: "1",
            spec: spec("drive"),
          },
          {
            documentType: groupDocumentType,
            version: "1",
            spec: spec("group"),
          },
        ],
        trustPolicy: spec("trust"),
      } as unknown as InitMessage,
      database: database.base,
      logger: new ConsoleLogger(["w2"]),
      executorConfig: { featureFlags: FLAGS },
      loadFactory: (s) =>
        Promise.resolve(
          byName[(s.module as { exportName: string }).exportName],
        ),
    });
  });

  afterAll(async () => {
    try {
      await host?.kill();
    } finally {
      await database?.drop();
    }
  });

  async function onHost(documentId: string, actions: Action[]) {
    await succeeded(
      host.reactor,
      (await host.reactor.execute(documentId, "main", actions)).id,
    );
  }

  async function onW2(job: Job) {
    const result = await w2.executor.executeJob(job);
    if (!result.success)
      throw new Error(
        `w2 job failed: ${result.error?.name}: ${result.error?.message}`,
      );
  }

  async function globalOps(documentId: string) {
    const result = await host.reactor.getOperations(documentId, {
      branch: "main",
      scopes: ["global"],
    });
    const stored =
      (result as Record<string, { results: Operation[] } | undefined>).global
        ?.results ?? [];
    return garbageCollect(sortOperations([...stored])).map((o) => ({
      type: o.action.type,
      denied: o.deniedReason !== undefined,
    }));
  }

  it("denies a former member through a purged group on a worker that cached it", async () => {
    // Group G lives on the host executor (W1).
    const group = baseCreateDocument(
      groupCreateState,
      undefined,
      groupDocumentType,
      protocolVersionsFor("legacy"),
    );
    const groupId = group.header.id;
    await succeeded(host.reactor, (await host.reactor.create(group)).id);
    await onHost(groupId, [
      action("ADD_MEMBER", "global", { address: MEMBER }),
    ]);

    // Referencer Y runs on W2; its member-signed op makes W2 read and cache G.
    const y = createDocModelDocument({ id: generateId() });
    await succeeded(host.reactor, (await host.reactor.create(y)).id);
    await onW2(mutation(y.header.id, "auth", [grants(groupId)]));
    await onW2(
      mutation(y.header.id, "global", [
        await signedAs(
          addModule({ id: "y1", name: "y1" }),
          MEMBER,
          y.header.id,
        ),
      ]),
    );
    expect(await globalOps(y.header.id)).toEqual([
      { type: "ADD_MODULE", denied: false },
    ]);

    // Y is deleted and purged on its worker; then G on its own.
    await onW2(
      mutation(y.header.id, "document", [
        await signedAs(deleteDocumentAction(y.header.id), ADMIN, y.header.id),
      ]),
    );
    await onW2(purgeJob(y.header.id));
    await expectPurged(host.db, y.header.id);
    await succeeded(
      host.reactor,
      (await host.reactor.deleteDocument(groupId)).id,
    );
    const [info] = await host.service.enqueuePurge([groupId], "req-g");
    await succeeded(host.reactor, info.id);
    await expectPurged(host.db, groupId);

    // A submitted grant naming the purged G is refused on both executors.
    const zHost = createDocModelDocument({ id: generateId() });
    await succeeded(host.reactor, (await host.reactor.create(zHost)).id);
    const refused = await settled(
      host.reactor,
      (await host.reactor.execute(zHost.header.id, "main", [grants(groupId)]))
        .id,
    );
    const zW2 = createDocModelDocument({ id: generateId() });
    await succeeded(host.reactor, (await host.reactor.create(zW2)).id);
    const refusedOnW2 = await w2.executor.executeJob(
      mutation(zW2.header.id, "auth", [grants(groupId)]),
    );

    // A peer's grant naming G still loads; the member is denied through it.
    const hostGrant = genesisOperation(
      zHost.header.id,
      "auth",
      grants(groupId),
    );
    await succeeded(
      host.reactor,
      (await host.reactor.load(zHost.header.id, "main", [hostGrant])).id,
    );
    const hostJob = await host.reactor.execute(zHost.header.id, "main", [
      await signedAs(
        addModule({ id: "zh", name: "zh" }),
        MEMBER,
        zHost.header.id,
      ),
    ]);
    const hostOutcome =
      (await settled(host.reactor, hostJob.id)).error?.name ?? "applied";

    // Same on W2, which held G's member list from before the purge.
    const w2Grant = genesisOperation(zW2.header.id, "auth", grants(groupId));
    await onW2(loadJob(zW2.header.id, "auth", [w2Grant]));
    const w2Result = await w2.executor.executeJob(
      mutation(zW2.header.id, "global", [
        await signedAs(
          addModule({ id: "zw", name: "zw" }),
          MEMBER,
          zW2.header.id,
        ),
      ]),
    );
    const w2Outcome = w2Result.success ? "applied" : w2Result.error?.name;

    const cached = await (
      w2.executor as unknown as {
        writeCache: {
          getState(
            id: string,
            s: string,
            b: string,
          ): Promise<{ state: { global: unknown } }>;
        };
      }
    ).writeCache
      .getState(groupId, "global", "main")
      .then(
        (d) => d.state.global,
        (e: Error) => e.name,
      );

    expect({
      refused: refused.error?.name,
      refusedOnW2: refusedOnW2.success ? "applied" : refusedOnW2.error?.name,
      host: hostOutcome,
      w2: w2Outcome,
      w2Stored: await globalOps(zW2.header.id),
      w2CachedGroup: cached,
    }).toEqual({
      refused: "DocumentPurgedError",
      refusedOnW2: "DocumentPurgedError",
      host: "AuthorizationDeniedError",
      w2: "AuthorizationDeniedError",
      w2Stored: [],
      w2CachedGroup: "DocumentPurgedError",
    });
  });
});
