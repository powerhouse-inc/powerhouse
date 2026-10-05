import {
  baseCreateDocument,
  createReducer,
  defaultBaseState,
  generateId,
  groupDocumentType,
  initializeAuth,
  mentionedGroupIds,
  protocolVersionsFor,
  setGrant,
  type DocumentModelModule,
  type Grant,
  type PHBaseState,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JobStatus } from "../../../src/shared/types.js";
import { createDocModelDocument } from "../../factories.js";
import {
  createTestDatabase,
  settled,
  startReactor,
  succeeded,
  type PurgeReactor,
  type TestDatabase,
} from "../executor/harness.js";

type GroupState = PHBaseState & {
  global: { members: string[] };
  local: Record<string, never>;
};
const groupCreateState = (state?: Partial<GroupState>): GroupState =>
  ({
    ...defaultBaseState(),
    global: { members: [], ...state?.global },
    local: {},
  }) as GroupState;
const groupModule = {
  version: 1,
  reducer: createReducer<GroupState>((state) => state),
  actions: {},
  utils: {
    createDocument: (state?: Partial<GroupState>) =>
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

const EVERYONE: Grant = {
  id: "g-everyone",
  description: "anyone executes everything",
  effect: "allow",
  principal: { anyone: true },
  capability: { can: "execute", scope: "*" },
} as Grant;

function groupGrant(groupId: string, id = "g-group"): Grant {
  return {
    id,
    description: "group executes global",
    effect: "allow",
    principal: { group: groupId },
    capability: { can: "execute", scope: "global" },
  } as Grant;
}

describe("r3: group purge vs a concurrent grant naming it [Postgres]", () => {
  let database: TestDatabase;
  let host: PurgeReactor;

  beforeAll(async () => {
    database = await createTestDatabase("reactor_review_r3_group_race");
    host = await startReactor(database, {
      models: [groupModule],
      executorConfig: { maxConcurrency: 2 },
    });
  });

  afterAll(async () => {
    try {
      await host?.kill();
    } finally {
      await database?.drop();
    }
  });

  async function create(document: PHDocument): Promise<string> {
    await succeeded(host.reactor, (await host.reactor.create(document)).id);
    return document.header.id;
  }

  async function deletedGroupAndReferencer() {
    const groupId = await create(
      baseCreateDocument(
        groupCreateState,
        undefined,
        groupDocumentType,
        protocolVersionsFor("legacy"),
      ),
    );
    const referencerId = await create(
      createDocModelDocument({ id: generateId() }),
    );
    await succeeded(
      host.reactor,
      (
        await host.reactor.execute(referencerId, "main", [
          initializeAuth({ version: 1, grants: [EVERYONE] }),
        ])
      ).id,
    );
    await succeeded(
      host.reactor,
      (await host.reactor.deleteDocument(groupId)).id,
    );
    return { groupId, referencerId };
  }

  it("does not purge a group a grant committed during the purge names", async () => {
    const { groupId, referencerId } = await deletedGroupAndReferencer();

    // Holds the grant's transaction open right after it records the reference.
    await sql
      .raw(
        `create or replace function reactor.r3_hold() returns trigger language plpgsql as $$
         begin perform pg_sleep(2); return new; end $$;
         create trigger r3_hold after insert on reactor.group_references
         for each row when (new."groupId" = '${groupId}') execute function reactor.r3_hold();`,
      )
      .execute(host.db);

    const grantPending = host.reactor.execute(referencerId, "main", [
      setGrant({ grant: groupGrant(groupId) }),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const [purge] = await host.service.enqueuePurge([groupId], "req-race");

    const purgeInfo = await settled(host.reactor, purge.id);
    const grantInfo = await settled(host.reactor, (await grantPending).id);

    const accepted = await host.db
      .selectFrom("Operation")
      .select(["action", "deniedReason", "error"])
      .where("documentId", "=", referencerId)
      .where("scope", "=", "auth")
      .execute();
    const naming = accepted.filter(
      (row) =>
        !row.deniedReason &&
        !row.error &&
        mentionedGroupIds(row.action as never).includes(groupId),
    );
    const tombstone = await host.db
      .selectFrom("document_purges")
      .select("documentId")
      .where("documentId", "=", groupId)
      .execute();

    expect(naming.length > 0 && tombstone.length > 0).toBe(false);
    expect(grantInfo.status).toBe(JobStatus.READ_READY);
    expect(purgeInfo.error?.name).toBe("GroupInUseError");
    expect(tombstone).toEqual([]);
  }, 60_000);

  it("refuses a new grant naming an already purged group", async () => {
    const { groupId, referencerId } = await deletedGroupAndReferencer();
    const [purge] = await host.service.enqueuePurge([groupId], "req-after");
    await succeeded(host.reactor, purge.id);

    const info = await settled(
      host.reactor,
      (
        await host.reactor.execute(referencerId, "main", [
          setGrant({ grant: groupGrant(groupId, "g-late") }),
        ])
      ).id,
    );
    expect(info.status).toBe(JobStatus.FAILED);
    expect(info.error?.name).toBe("DocumentPurgedError");
    expect(info.job?.retryCount ?? 0).toBe(0);
  }, 60_000);
});
