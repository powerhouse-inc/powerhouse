import { ts } from "@tmpl/core";

export const relationalDbProcessorTestTemplate = (v: {
  pascalCaseName: string;
  documentType: string;
}) =>
  ts`
import type { IRelationalDb } from "@powerhousedao/shared/processors";
import {
  createTestRelationalDb,
  testOperation,
} from "@powerhousedao/shared/processors/testing";
import { afterEach, describe, expect, it } from "vitest";
import { ${v.pascalCaseName} } from "./processor.js";
import type { DB } from "./schema.js";

const driveId = "test-drive";
let db: IRelationalDb;

// An in-memory database, a namespace and the migration, as the factory does.
async function createProcessor() {
  db = createTestRelationalDb();
  const namespace = ${v.pascalCaseName}.getNamespace(driveId);
  const store = await db.createNamespace<DB>(namespace);
  const processor = new ${v.pascalCaseName}(namespace, {}, store, driveId);
  await processor.initAndUpgrade();
  return { processor, store };
}

afterEach(async () => {
  await db.destroy();
});

describe("${v.pascalCaseName}", () => {
  it("writes a row for a created document", async () => {
    const { processor, store } = await createProcessor();

    // For your model's own operations, pass operationsWithContext(document).
    await processor.onOperations([
      testOperation({
        documentId: "doc-1",
        documentType: "${v.documentType}",
        type: "CREATE_DOCUMENT",
        scope: "document",
        timestampUtcMs: "2024-01-01T00:00:00.000Z",
      }),
    ]);

    const rows = await store.selectFrom("documents").selectAll().execute();
    expect(rows).toEqual([
      {
        document_id: "doc-1",
        document_type: "${v.documentType}",
        updated_at: "2024-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("deletes a deleted document's rows", async () => {
    const { processor, store } = await createProcessor();
    const operation = { documentId: "doc-1", documentType: "${v.documentType}", scope: "document" };

    await processor.onOperations([
      testOperation({ ...operation, type: "CREATE_DOCUMENT" }),
      testOperation({ ...operation, type: "DELETE_DOCUMENT", index: 1 }),
    ]);

    const rows = await store.selectFrom("documents").selectAll().execute();
    expect(rows).toEqual([]);
  });
});
`.raw;
