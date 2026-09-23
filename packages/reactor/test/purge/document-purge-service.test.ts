import { afterEach, describe, expect, it } from "vitest";
import { DriveCollectionId } from "../../src/cache/operation-index-types.js";
import { DocumentPurgeService } from "../../src/admin/document-purge-service.js";
import type { InProcessReactorModule } from "../../src/core/types.js";
import {
  DocumentNotDeletedError,
  DocumentNotFlushedError,
  GroupInUseError,
} from "../../src/shared/errors.js";
import { readPurgeJournal } from "../../src/storage/kysely/document-purger.js";
import { supportsDocumentPurgeQuarantine } from "../../src/sync/interfaces.js";
import {
  addChild,
  buildReactor,
  createDocument,
  createDrive,
  deleteDocument,
  emptyRows,
  removeChild,
  rowsAbout,
} from "./helpers.js";
import { buildSyncedReactor, ChannelSwitch, FILTER } from "./sync-pair.js";

const directive = { directiveId: "service-test", purgedBy: "admin" };

describe("DocumentPurgeService", () => {
  const modules: InProcessReactorModule[] = [];

  async function reactor(): Promise<InProcessReactorModule> {
    const module = await buildReactor();
    modules.push(module);
    return module;
  }

  afterEach(() => {
    for (const module of modules.splice(0)) module.reactor.kill();
  });

  async function settled(module: InProcessReactorModule): Promise<void> {
    await module.readModelCoordinator.drain();
  }

  it("refuses a document that is not deleted, and changes nothing", async () => {
    const module = await reactor();
    await createDocument(module, "live");
    await settled(module);
    const before = await rowsAbout(module.database, "live");

    await expect(
      new DocumentPurgeService(module).purgeDocuments(["live"], directive),
    ).rejects.toSatisfy(
      (error) =>
        DocumentNotDeletedError.isError(error) &&
        error.documentIds.includes("live"),
    );

    expect(await rowsAbout(module.database, "live")).toEqual(before);
    expect(await readPurgeJournal(module.database, 0)).toEqual([]);
  });

  it("purges a deleted document, fans out to every model and reports each", async () => {
    const module = await reactor();
    await createDocument(module, "gone");
    await deleteDocument(module, "gone");
    await settled(module);

    const result = await new DocumentPurgeService(module).purgeDocuments(
      ["gone"],
      directive,
    );

    expect(result.status).toBe("purged");
    expect(result.purged).toEqual(["gone"]);
    expect(result.rowsDeleted.Operation).toBeGreaterThan(0);
    expect(await rowsAbout(module.database, "gone")).toEqual(emptyRows());
    expect(
      result.readModels.map(({ readModelId, covered, error }) => ({
        readModelId,
        covered,
        error,
      })),
    ).toEqual(
      expect.arrayContaining([
        { readModelId: "document-view", covered: true, error: undefined },
        { readModelId: "document-indexer", covered: true, error: undefined },
        {
          readModelId: "subscription-notification",
          covered: true,
          error: undefined,
        },
        { readModelId: "processor-manager", covered: true, error: undefined },
      ]),
    );
    await expect(module.reactor.get("gone")).rejects.toThrow();
  });

  it("answers a second purge of the same id with a distinct no-op", async () => {
    const module = await reactor();
    await createDocument(module, "twice");
    await deleteDocument(module, "twice");
    await settled(module);
    const service = new DocumentPurgeService(module);
    await service.purgeDocuments(["twice"], directive);

    const second = await service.purgeDocuments(["twice"], {
      directiveId: "again",
    });

    expect(second).toMatchObject({
      status: "already-purged",
      purged: [],
      alreadyPurged: ["twice"],
      readModels: [],
    });
    expect(await readPurgeJournal(module.database, 0)).toHaveLength(1);
  });

  it("refuses a group a surviving document references unless allowed", async () => {
    const module = await reactor();
    await createDocument(module, "group");
    await createDocument(module, "member-of");
    await module.database
      .insertInto("group_references")
      .values({ documentId: "member-of", groupId: "group" })
      .execute();
    await deleteDocument(module, "group");
    await settled(module);
    const service = new DocumentPurgeService(module);

    await expect(
      service.purgeDocuments(["group"], directive),
    ).rejects.toSatisfy(
      (error) =>
        GroupInUseError.isError(error) &&
        error.users.group.includes("member-of"),
    );
    expect((await service.planPurge(["group"])).candidates[0]).toMatchObject({
      status: "group-in-use",
      groupUsers: ["member-of"],
    });

    const result = await service.purgeDocuments(["group"], {
      ...directive,
      allowGroupInUse: true,
    });
    expect(result.purged).toEqual(["group"]);
  });

  describe("with a remote that never acknowledges", () => {
    async function offlineSetup() {
      const channelSwitch = new ChannelSwitch();
      channelSwitch.offline.add("peer");
      const module = await buildSyncedReactor(channelSwitch);
      modules.push(module);
      await createDrive(module, "drive");
      await module.syncModule!.syncManager.add(
        "peer",
        DriveCollectionId.forDrive("drive"),
        { type: "internal", parameters: {} },
        FILTER,
      );
      await createDocument(module, "owed");
      await addChild(module, "drive", "owed");
      await deleteDocument(module, "owed");
      await settled(module);
      return module;
    }

    it("refuses, naming the remote and its connection state", async () => {
      const module = await offlineSetup();
      const before = await rowsAbout(module.database, "owed");

      const error: unknown = await new DocumentPurgeService(module)
        .purgeDocuments(["owed"], directive)
        .catch((caught: unknown) => caught);

      expect(DocumentNotFlushedError.isError(error)).toBe(true);
      expect((error as DocumentNotFlushedError).owed).toEqual([
        expect.objectContaining({
          documentId: "owed",
          remoteName: "peer",
          connectionState: "disconnected",
          lastSuccessUtcMs: 1234,
        }),
      ]);
      expect(before.Operation).toBeGreaterThan(0);
      expect(await rowsAbout(module.database, "owed")).toEqual(before);
      expect(await readPurgeJournal(module.database, 0)).toEqual([]);
      const sync = module.syncModule!.syncManager;
      expect(
        supportsDocumentPurgeQuarantine(sync) &&
          sync.isInboundQuarantined("owed"),
      ).toBe(false);
    });

    it("proceeds past a remote the directive skips, and records it", async () => {
      const module = await offlineSetup();

      const result = await new DocumentPurgeService(module).purgeDocuments(
        ["owed"],
        { ...directive, skipRemotes: ["peer"] },
      );

      expect(result.purged).toEqual(["owed"]);
      expect(result.skippedRemotes).toEqual([
        expect.objectContaining({ remoteName: "peer", documentId: "owed" }),
      ]);
      expect(await rowsAbout(module.database, "owed")).toEqual(emptyRows());
    });

    it("removes a purged drive's remotes and their cursors", async () => {
      const module = await offlineSetup();
      await deleteDocument(module, "drive");
      await settled(module);

      const result = await new DocumentPurgeService(module).purgeDocuments(
        ["drive", "owed"],
        { ...directive, skipRemotes: ["peer"] },
      );

      expect(result.removedRemotes).toEqual(["peer"]);
      expect(module.syncModule!.syncManager.list()).toEqual([]);
      expect(
        await module.database.selectFrom("sync_remotes").selectAll().execute(),
      ).toEqual([]);
      expect(
        await module.database.selectFrom("sync_cursors").selectAll().execute(),
      ).toEqual([]);
    });
  });

  it("plans a drive with every document only it ever held, and not a shared one", async () => {
    const module = await reactor();
    await createDrive(module, "drive");
    await createDrive(module, "other");
    for (const id of ["open", "closed", "shared"]) {
      await createDocument(module, id);
      await addChild(module, "drive", id);
    }
    await addChild(module, "other", "shared");
    await removeChild(module, "drive", "closed");
    for (const id of ["open", "closed", "drive"]) {
      await deleteDocument(module, id);
    }
    await settled(module);

    const plan = await new DocumentPurgeService(module).planPurge(["drive"]);

    expect(
      plan.candidates
        .map(({ documentId, requested, status }) => ({
          documentId,
          requested,
          status,
        }))
        .sort((a, b) => a.documentId.localeCompare(b.documentId)),
    ).toEqual([
      { documentId: "closed", requested: false, status: "ready" },
      { documentId: "drive", requested: true, status: "ready" },
      { documentId: "open", requested: false, status: "ready" },
    ]);
    expect(plan.ready).toBe(true);
  });
});
