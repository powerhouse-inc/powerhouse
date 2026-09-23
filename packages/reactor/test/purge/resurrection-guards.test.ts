import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DriveCollectionId } from "../../src/cache/operation-index-types.js";
import type { InProcessReactorModule } from "../../src/core/types.js";
import {
  ReactorEventTypes,
  type JobWriteReadyEvent,
} from "../../src/events/types.js";
import { KyselyDocumentPurger } from "../../src/storage/kysely/document-purger.js";
import { KyselySyncDeadLetterStorage } from "../../src/storage/kysely/sync-dead-letter-storage.js";
import type { Database as StorageDatabase } from "../../src/storage/kysely/types.js";
import { ChannelErrorSource } from "../../src/sync/types.js";
import { createDocModelDocument } from "../factories.js";
import {
  addChild,
  buildReactor,
  createDocument,
  createDrive,
  deleteDocument,
  emptyRows,
  expectReady,
  renameDocument,
  rowsAbout,
} from "./helpers.js";

const directive = { directiveId: "guard-test" };

describe("inserts for a purged id", () => {
  let module: InProcessReactorModule;
  let delivered: OperationWithContext[][];

  beforeEach(async () => {
    module = await buildReactor();
    delivered = [];
    module.eventBus.subscribe<JobWriteReadyEvent>(
      ReactorEventTypes.JOB_WRITE_READY,
      (_type, event) => {
        delivered.push(structuredClone(event.operations));
      },
    );
  });

  afterEach(() => {
    module.reactor.kill();
  });

  async function purge(ids: string[]): Promise<void> {
    await module.readModelCoordinator.drain();
    await new KyselyDocumentPurger(module.database).purge(ids, directive);
  }

  it("a write-ready payload delivered after the purge writes no snapshot, slug or keyframe", async () => {
    await expectReady(
      module.reactor,
      await module.reactor.create(
        createDocModelDocument({ id: "late", slug: "late-slug" }),
      ),
    );
    await renameDocument(module, "late", "renamed");
    const beforeDelete = delivered.flat();
    await deleteDocument(module, "late");
    await purge(["late"]);

    await module.documentView.indexOperations(beforeDelete);
    await module.documentIndexer.indexOperations(beforeDelete);
    const [snapshot] = beforeDelete;
    await module.keyframeStore.putKeyframe(
      "late",
      "global",
      "main",
      10,
      JSON.parse(snapshot!.context.resultingState!) as never,
    );

    expect(await rowsAbout(module.database, "late")).toEqual(emptyRows());
  });

  it("indexes no relationship, document or membership row for a purged target", async () => {
    await createDrive(module, "parent");
    await createDocument(module, "child");
    await addChild(module, "parent", "child");
    const addRelationship = delivered
      .flat()
      .filter((op) => op.operation.action.type === "ADD_RELATIONSHIP");
    expect(addRelationship).toHaveLength(1);
    await deleteDocument(module, "child");
    await purge(["child"]);

    await module.documentIndexer.indexOperations(addRelationship);

    const txn = module.operationIndex.start();
    txn.write([
      {
        ...addRelationship[0]!.operation,
        id: "replayed-op",
        documentId: "parent",
        documentType: addRelationship[0]!.context.documentType,
        scope: "document",
        branch: "main",
        sourceRemote: "",
      },
    ]);
    txn.addToCollection(DriveCollectionId.forDrive("parent").key, "child");
    await module.operationIndex.commit(txn);

    expect(await rowsAbout(module.database, "child")).toEqual(emptyRows());
    expect((await rowsAbout(module.database, "parent")).Document).toBe(1);
  });

  it("refuses a dead letter for a tombstoned id", async () => {
    await createDocument(module, "lettered");
    await deleteDocument(module, "lettered");
    await purge(["lettered"]);
    await module.database
      .insertInto("sync_remotes")
      .values({
        name: "remote",
        collection_id: "drive.main.x",
        channel_type: "internal",
        channel_id: "remote",
        remote_name: "remote",
        channel_parameters: JSON.stringify({}),
        filter_document_ids: JSON.stringify([]),
        filter_scopes: JSON.stringify([]),
        filter_branch: "main",
        push_state: "idle",
        push_last_success_utc_ms: null,
        push_last_failure_utc_ms: null,
        push_failure_count: 0,
        pull_state: "idle",
        pull_last_success_utc_ms: null,
        pull_last_failure_utc_ms: null,
        pull_failure_count: 0,
        bound_address: null,
      })
      .execute();

    const storage = new KyselySyncDeadLetterStorage(
      module.database as unknown as Kysely<StorageDatabase>,
    );
    for (const documentId of ["lettered", "alive"]) {
      await storage.add({
        id: `dl-${documentId}`,
        jobId: "job",
        jobDependencies: [],
        remoteName: "remote",
        documentId,
        scopes: ["global"],
        branch: "main",
        operations: [],
        errorSource: ChannelErrorSource.Inbox,
        errorMessage: "failed",
        errorType: "UNCLASSIFIED",
      });
    }

    const stored = await module.database
      .selectFrom("sync_dead_letters")
      .select("document_id")
      .execute();
    expect(stored).toEqual([{ document_id: "alive" }]);
  });
});
