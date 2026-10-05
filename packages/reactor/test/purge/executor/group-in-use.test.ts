import {
  baseCreateDocument,
  createReducer,
  defaultBaseState,
  deriveOperationId,
  generateId,
  groupDocumentType,
  initializeAuth,
  protocolVersionsFor,
  removeGrant,
  setGrant,
  type DocumentModelModule,
  type Grant,
  type PHBaseState,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDocModelDocument } from "../../factories.js";
import {
  createTestDatabase,
  deleteListCounts,
  expectPurged,
  expectUntouched,
  failedWith,
  startReactor,
  succeeded,
  type PurgeReactor,
  type TestDatabase,
} from "./harness.js";

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

describe("purging a group [Postgres]", () => {
  let database: TestDatabase;
  let host: PurgeReactor;

  beforeAll(async () => {
    database = await createTestDatabase("reactor_purge_executor_group");
    host = await startReactor(database, { models: [groupModule] });
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

  async function createGroup(): Promise<string> {
    return create(
      baseCreateDocument(
        groupCreateState,
        undefined,
        groupDocumentType,
        protocolVersionsFor("legacy"),
      ),
    );
  }

  async function createReferencer(grants: Grant[]): Promise<string> {
    const documentId = await create(
      createDocModelDocument({ id: generateId() }),
    );
    await succeeded(
      host.reactor,
      (
        await host.reactor.execute(documentId, "main", [
          initializeAuth({ version: 1, grants }),
        ])
      ).id,
    );
    return documentId;
  }

  async function remove(documentId: string): Promise<void> {
    await succeeded(
      host.reactor,
      (await host.reactor.deleteDocument(documentId)).id,
    );
  }

  async function purge(documentId: string): Promise<string> {
    const [info] = await host.service.enqueuePurge([documentId], "request-g");
    return info.id;
  }

  it("refuses a group a survivor's accepted auth history names", async () => {
    const groupId = await createGroup();
    const referencerId = await createReferencer([
      EVERYONE,
      groupGrant(groupId),
    ]);
    await remove(groupId);
    const before = await deleteListCounts(host.db, groupId);

    const info = await failedWith(
      host.reactor,
      await purge(groupId),
      "GroupInUseError",
    );
    expect(info.error?.message).toContain(referencerId);
    await expectUntouched(host.db, groupId, before);
  });

  it("refuses the group after the naming grant was removed", async () => {
    const groupId = await createGroup();
    const referencerId = await createReferencer([EVERYONE]);
    await succeeded(
      host.reactor,
      (
        await host.reactor.execute(referencerId, "main", [
          setGrant({ grant: groupGrant(groupId) }),
        ])
      ).id,
    );
    await succeeded(
      host.reactor,
      (
        await host.reactor.execute(referencerId, "main", [
          removeGrant({ id: "g-group" }),
        ])
      ).id,
    );
    await remove(groupId);
    const before = await deleteListCounts(host.db, groupId);

    await failedWith(host.reactor, await purge(groupId), "GroupInUseError");
    await expectUntouched(host.db, groupId, before);
  });

  it("purges a group only a refused grant named", async () => {
    const groupId = await createGroup();
    const referencerId = await createReferencer([EVERYONE]);
    const refused = setGrant({ grant: groupGrant(groupId) });
    const revision = (
      await host.module.operationStore.getRevisions(referencerId, "main")
    ).revision.auth;
    await host.module.operationStore.apply(
      referencerId,
      "powerhouse/document-model",
      "auth",
      "main",
      revision,
      (txn) => {
        txn.addOperations({
          id: deriveOperationId(referencerId, "auth", "main", refused.id),
          index: revision,
          skip: 0,
          hash: "",
          timestampUtcMs: refused.timestampUtcMs,
          action: refused,
          deniedReason: "denied",
        });
      },
    );
    await host.db
      .insertInto("group_references")
      .values({ documentId: referencerId, groupId })
      .execute();
    await remove(groupId);

    await succeeded(host.reactor, await purge(groupId));
    await expectPurged(host.db, groupId);
  });

  it("purges a group once its referencers are purged", async () => {
    const groupId = await createGroup();
    const referencerId = await createReferencer([
      EVERYONE,
      groupGrant(groupId),
    ]);
    await remove(groupId);
    await failedWith(host.reactor, await purge(groupId), "GroupInUseError");

    await remove(referencerId);
    await succeeded(host.reactor, await purge(referencerId));
    await expectPurged(host.db, referencerId);
    const kept = await host.db
      .selectFrom("group_references")
      .select("documentId")
      .where("groupId", "=", groupId)
      .execute();
    expect(kept).toEqual([]);

    await succeeded(host.reactor, await purge(groupId));
    await expectPurged(host.db, groupId);
  });
});
