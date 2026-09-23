import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { InProcessReactorModule } from "../../src/core/types.js";
import {
  KyselyDocumentPurger,
  readPurgeJournal,
} from "../../src/storage/kysely/document-purger.js";
import {
  addChild,
  buildReactor,
  createDocument,
  createDrive,
  deleteDocument,
  emptyRows,
  removeChild,
  renameDocument,
  rowsAbout,
} from "./helpers.js";

const directive = { directiveId: "directive-1", purgedBy: "operator" };

describe("KyselyDocumentPurger", () => {
  let module: InProcessReactorModule;

  beforeEach(async () => {
    module = await buildReactor();
  });

  afterEach(() => {
    module.reactor.kill();
  });

  async function seedRemote(name: string, filter: string[]): Promise<void> {
    await module.database
      .insertInto("sync_remotes")
      .values({
        name,
        collection_id: "drive.main.elsewhere",
        channel_type: "internal",
        channel_id: name,
        remote_name: name,
        channel_parameters: JSON.stringify({}),
        filter_document_ids: JSON.stringify(filter),
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
  }

  it("removes every row about a drive and its children and leaves a tombstone", async () => {
    await createDrive(module, "drive-1");
    await createDocument(module, "child-open");
    await createDocument(module, "child-closed");
    await createDocument(module, "survivor");
    await addChild(module, "drive-1", "child-open");
    await addChild(module, "drive-1", "child-closed");
    await addChild(module, "drive-1", "survivor");
    await removeChild(module, "drive-1", "child-closed");
    await renameDocument(module, "child-open", "renamed");

    // Rows the reactor writes elsewhere or on another branch.
    await module.database
      .insertInto("document_collections")
      .values([
        {
          documentId: "drive.feature.drive-1",
          collectionId: "drive.feature.drive-1",
          joinedOrdinal: BigInt(0),
          leftOrdinal: null,
        },
        {
          documentId: "survivor",
          collectionId: "drive.feature.drive-1",
          joinedOrdinal: BigInt(1),
          leftOrdinal: null,
        },
      ])
      .execute();
    await module.database
      .insertInto("group_references")
      .values([
        { documentId: "drive-1", groupId: "group-x" },
        { documentId: "survivor", groupId: "child-open" },
      ])
      .execute();
    await seedRemote("remote-mixed", ["child-open", "survivor"]);
    await seedRemote("remote-only", ["child-open"]);
    await module.database
      .insertInto("sync_dead_letters")
      .values({
        id: "dl-1",
        job_id: "job-1",
        job_dependencies: JSON.stringify([]),
        remote_name: "remote-mixed",
        document_id: "child-open",
        scopes: JSON.stringify(["document"]),
        branch: "main",
        operations: JSON.stringify([]),
        error_source: "inbox",
        error_message: "boom",
        error_type: "UNCLASSIFIED",
      })
      .execute();
    await module.database
      .insertInto("ProcessorCursor")
      .values({
        processorId: "p-1",
        factoryId: "f-1",
        driveId: "drive-1",
        processorIndex: 0,
        lastError: null,
        lastErrorTimestamp: null,
      })
      .execute();

    await deleteDocument(module, "child-open");
    await deleteDocument(module, "child-closed");
    await deleteDocument(module, "drive-1");
    await module.readModelCoordinator.drain();

    const ids = ["drive-1", "child-open", "child-closed"];
    const ordinalsBefore = await module.database
      .selectFrom("operation_index_operations")
      .select(["documentId", "ordinal"])
      .where("documentId", "in", ids)
      .orderBy("ordinal")
      .execute();
    expect((await rowsAbout(module.database, "drive-1")).Operation).toBe(
      (await rowsAbout(module.database, "drive-1")).operation_index_operations,
    );

    const result = await new KyselyDocumentPurger(module.database).purge(
      ids,
      directive,
    );

    expect(result.purged.sort()).toEqual([...ids].sort());
    expect(result.alreadyPurged).toEqual([]);
    for (const id of ids) {
      expect({ id, rows: await rowsAbout(module.database, id) }).toEqual({
        id,
        rows: emptyRows(),
      });
    }

    // The survivor keeps its rows but leaves the purged drive's collections.
    const survivor = await rowsAbout(module.database, "survivor");
    expect(survivor.Operation).toBeGreaterThan(0);
    expect(survivor.DocumentSnapshot).toBeGreaterThan(0);
    const survivorCollections = await module.database
      .selectFrom("document_collections")
      .select("collectionId")
      .where("documentId", "=", "survivor")
      .execute();
    expect(survivorCollections).toEqual([]);
    // A reference naming a purged group keys a surviving document.
    expect(
      await module.database
        .selectFrom("group_references")
        .selectAll()
        .where("documentId", "=", "survivor")
        .execute(),
    ).toEqual([{ documentId: "survivor", groupId: "child-open" }]);

    const remotes = await module.database
      .selectFrom("sync_remotes")
      .select(["name", "filter_document_ids"])
      .orderBy("name")
      .execute();
    expect(remotes).toEqual([
      { name: "remote-mixed", filter_document_ids: ["survivor"] },
      // Emptying the filter would widen it to the whole collection.
      { name: "remote-only", filter_document_ids: ["child-open"] },
    ]);

    const journal = await readPurgeJournal(module.database, 0);
    expect(journal.map((entry) => entry.documentId).sort()).toEqual(
      [...ids].sort(),
    );
    for (const entry of journal) {
      expect(entry.directiveId).toBe("directive-1");
      const covered = entry.purgedOrdinals.flatMap(({ from, to }) =>
        Array.from({ length: to - from + 1 }, (_, i) => from + i),
      );
      expect({ id: entry.documentId, covered }).toEqual({
        id: entry.documentId,
        covered: ordinalsBefore
          .filter((row) => row.documentId === entry.documentId)
          .map((row) => row.ordinal),
      });
      expect(result.purgedOrdinals[entry.documentId]).toEqual(
        entry.purgedOrdinals,
      );
    }
    expect(journal.map((entry) => entry.ordinal)).toEqual(
      [...journal.map((entry) => entry.ordinal)].sort((a, b) => a - b),
    );
  });

  it("purges a document with more rows than one delete statement takes", async () => {
    await createDocument(module, "big");
    for (let i = 0; i < 7; i++) {
      await renameDocument(module, "big", `name-${i}`);
    }
    await deleteDocument(module, "big");
    await module.readModelCoordinator.drain();

    const before = await rowsAbout(module.database, "big");
    expect(before.Operation).toBeGreaterThan(6);

    const result = await new KyselyDocumentPurger(module.database, 2).purge(
      ["big"],
      directive,
    );

    expect(result.rowsDeleted.Operation).toBe(before.Operation);
    expect(result.rowsDeleted.operation_index_operations).toBe(
      before.operation_index_operations,
    );
    expect(await rowsAbout(module.database, "big")).toEqual(emptyRows());
  });

  it("leaves an already tombstoned id alone and reports it", async () => {
    await createDocument(module, "twice");
    await deleteDocument(module, "twice");
    const purger = new KyselyDocumentPurger(module.database);

    await purger.purge(["twice"], directive);
    const second = await purger.purge(["twice"], {
      directiveId: "directive-2",
    });

    expect(second).toEqual({
      purged: [],
      alreadyPurged: ["twice"],
      rowsDeleted: {},
      purgedOrdinals: {},
    });
    const journal = await readPurgeJournal(module.database, 0);
    expect(journal).toHaveLength(1);
    expect(journal[0]!.directiveId).toBe("directive-1");
  });

  it("sweeps rows that arrived after the purge and records their ordinals", async () => {
    await createDocument(module, "late");
    await deleteDocument(module, "late");
    const purger = new KyselyDocumentPurger(module.database);
    await purger.purge(["late"], directive);

    const inserted = await module.database
      .insertInto("operation_index_operations")
      .values({
        opId: "late-op",
        documentId: "late",
        documentType: "powerhouse/document-model",
        scope: "global",
        branch: "main",
        timestampUtcMs: new Date().toISOString(),
        index: 99,
        skip: 0,
        hash: "h",
        action: JSON.stringify({ id: "late-action", type: "NOOP" }),
      })
      .returning("ordinal")
      .executeTakeFirstOrThrow();

    const swept = await purger.sweep(["late", "never-purged"]);

    expect(swept.alreadyPurged).toEqual(["late"]);
    expect(swept.rowsDeleted.operation_index_operations).toBe(1);
    expect(await rowsAbout(module.database, "late")).toEqual(emptyRows());
    const [entry] = await readPurgeJournal(module.database, 0);
    expect(entry!.purgedOrdinals).toContainEqual({
      from: inserted.ordinal,
      to: inserted.ordinal,
    });
  });
});
