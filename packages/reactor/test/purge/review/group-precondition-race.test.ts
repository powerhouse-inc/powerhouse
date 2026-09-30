import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  addModule,
  baseCreateDocument,
  createReducer,
  defaultBaseState,
  generateId,
  groupDocumentType,
  initializeAuth,
  protocolVersionsFor,
  type Action,
  type DocumentModelModule,
  type PHBaseState,
  type StateReducer,
} from "@powerhousedao/shared/document-model";
import {
  ConsoleLogger,
  documentModelDocumentModelModule,
} from "document-model";
import { setGrant } from "@powerhousedao/shared/document-model";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
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

function adminOnly() {
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
    ],
  });
}

describe("r1: precondition 3 goes stale while a purge runs [Postgres]", () => {
  let database: TestDatabase;
  let host: PurgeReactor;
  let w2: WorkerExecutorStack;
  let side: Kysely<any>;

  beforeAll(async () => {
    database = await createTestDatabase("reactor_review_r1_group_race");
    side = new Kysely<any>({
      dialect: new PostgresDialect({
        pool: new Pool({ connectionString: database.url, max: 6 }),
      }),
    });
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
      database: side,
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
      await side?.destroy();
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

  async function waiters(locktype: string): Promise<number> {
    const rows = await sql<{ n: number }>`
      select count(*)::int as n from pg_locks
      where not granted and locktype = ${locktype}
    `.execute(side);
    return rows.rows[0].n;
  }

  it(
    "holds a grant naming the group until the purge past its check commits",
    { timeout: 60_000 },
    async () => {
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
      const y = createDocModelDocument({ id: generateId() });
      const yId = y.header.id;
      await succeeded(host.reactor, (await host.reactor.create(y)).id);
      await onW2(mutation(yId, "auth", [adminOnly()]));
      await succeeded(
        host.reactor,
        (await host.reactor.deleteDocument(groupId)).id,
      );

      // Stands in for a slow purge: its deletes wait on G's rows after its checks.
      let release!: () => void;
      const released = new Promise<void>((resolve) => (release = resolve));
      let rowsLocked!: () => void;
      const locked = new Promise<void>((resolve) => (rowsLocked = resolve));
      const holder = side.transaction().execute(async (trx) => {
        await sql`select 1 from reactor."Operation" where "documentId" = ${groupId} for update`.execute(
          trx,
        );
        rowsLocked();
        await released;
      });
      await locked;

      const enqueued = host.service.enqueuePurge([groupId], "req-race");
      await vi.waitUntil(async () => (await waiters("transactionid")) > 0, {
        timeout: 40_000,
        interval: 20,
      });

      // Past the referencer check: Y names G. The grant must wait on the purge.
      const grant = w2.executor.executeJob(
        mutation(yId, "auth", [
          await signedAs(
            setGrant({
              grant: {
                id: "g-group",
                description: "group executes global",
                effect: "allow",
                principal: { group: groupId },
                capability: { can: "execute", scope: "global" },
              } as never,
            }),
            ADMIN,
            yId,
          ),
        ]),
      );
      await vi.waitUntil(async () => (await waiters("advisory")) > 0, {
        timeout: 20_000,
        interval: 20,
      });
      release();
      await holder;

      const [info] = await enqueued;
      const purgeInfo = await settled(host.reactor, info.id);
      const grantResult = await grant;
      const member = await w2.executor.executeJob(
        mutation(yId, "global", [
          await signedAs(addModule({ id: "y1", name: "y1" }), MEMBER, yId),
        ]),
      );

      const refs = await database.base
        .withSchema("reactor")
        .selectFrom("group_references" as never)
        .select(["documentId" as never, "groupId" as never])
        .where("groupId" as never, "=", groupId as never)
        .execute();
      const tomb = await database.base
        .withSchema("reactor")
        .selectFrom("document_purges" as never)
        .select("documentId" as never)
        .where("documentId" as never, "=", groupId as never)
        .execute();

      expect({
        purge: purgeInfo.error?.name ?? purgeInfo.status,
        purged: tomb.length === 1,
        grant: grantResult.success ? "applied" : grantResult.error?.name,
        survivorNamesGroup: refs.length > 0,
        member: member.success ? "applied" : member.error?.name,
      }).toEqual({
        purge: "READ_READY",
        purged: true,
        grant: "DocumentPurgedError",
        survivorNamesGroup: false,
        member: "AuthorizationDeniedError",
      });
    },
  );
});
