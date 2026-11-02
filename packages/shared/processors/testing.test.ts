import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it } from "vitest";
import { RelationalDbProcessor } from "./relational/types.js";
import {
  createTestRelationalDb,
  operationsWithContext,
  runProcessorMigrations,
  testOperation,
} from "./testing.js";
import type { IRelationalDb } from "./relational/types.js";

type DB = {
  documents: { document_id: string; document_type: string; updated_at: string };
};

async function up(db: IRelationalDb<any>) {
  await db.schema
    .createTable("documents")
    .addColumn("document_id", "varchar(255)", (col) => col.primaryKey())
    .addColumn("document_type", "varchar(255)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(32)", (col) => col.notNull())
    .ifNotExists()
    .execute();
}

class DocumentsProcessor extends RelationalDbProcessor<DB> {
  async onOperations(operations: OperationWithContext[]) {
    for (const { operation, context } of operations) {
      if (operation.action.type === "DELETE_DOCUMENT") {
        await this.deleteDocumentRows(context.documentId);
        continue;
      }
      await this.relationalDb
        .insertInto("documents")
        .values({
          document_id: context.documentId,
          document_type: context.documentType,
          updated_at: operation.timestampUtcMs,
        })
        .onConflict((oc) =>
          oc
            .column("document_id")
            .doUpdateSet({ updated_at: operation.timestampUtcMs }),
        )
        .execute();
    }
  }
  onDisconnect() {
    return Promise.resolve();
  }
  async initAndUpgrade() {
    await up(this.relationalDb);
  }
}

let db: IRelationalDb;

afterEach(async () => {
  await db.destroy();
});

describe("processor testing helpers", () => {
  it("run a processor on a reducer's operations and read its rows", async () => {
    db = createTestRelationalDb();
    const namespace = DocumentsProcessor.getNamespace("drive-1");
    const store = await db.createNamespace<DB>(namespace);
    const processor = new DocumentsProcessor(namespace, {}, store, "drive-1");
    await processor.initAndUpgrade();

    const { reducer, utils, actions } = driveDocumentModelModule;
    const document = reducer(
      utils.createDocument(),
      actions.setDriveName({ name: "Stockroom" }),
    );
    await processor.onOperations(operationsWithContext(document));

    const rows = await store.selectFrom("documents").selectAll().execute();
    expect(rows).toEqual([
      {
        document_id: document.header.id,
        document_type: "powerhouse/document-drive",
        updated_at: document.operations.global[0].timestampUtcMs,
      },
    ]);
  });

  it("migrate a namespace and take hand-made operations", async () => {
    db = createTestRelationalDb();
    const store = await runProcessorMigrations<DB>(db, "documents_ns", up);
    const processor = new DocumentsProcessor("documents_ns", {}, store);
    const created = testOperation({
      documentId: "doc-1",
      documentType: "acme/stock-item",
      type: "CREATE_DOCUMENT",
      scope: "document",
    });
    await processor.onOperations([created]);
    expect(
      await store.selectFrom("documents").select("document_id").execute(),
    ).toEqual([{ document_id: "doc-1" }]);

    await processor.onOperations([
      testOperation({
        documentId: "doc-1",
        documentType: "acme/stock-item",
        type: "DELETE_DOCUMENT",
        scope: "document",
        index: 1,
      }),
    ]);
    expect(await store.selectFrom("documents").selectAll().execute()).toEqual(
      [],
    );
  });
});
